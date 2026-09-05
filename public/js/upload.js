import { api } from './api.js';
import { toast } from './util.js';

/* ── 사진 화질 설정 ─────────────────────────────────────────────
   중국 현지에서 로밍/호텔 와이파이로 올릴 것을 감안한 기본값.
   'high' 는 2560px 리사이즈 — 세로 쇼츠(1080×1920)로 편집하기에 충분합니다. */
export const QUALITY = {
  original: { label: '원본 그대로', max: 0, q: 1, hint: '가장 느림 · 화질 최상' },
  high:     { label: '고화질 (권장)', max: 2560, q: 0.88, hint: '쇼츠 편집에 충분 · 속도 빠름' },
  save:     { label: '데이터 절약', max: 1600, q: 0.8, hint: '신호가 약할 때' },
};
export const getQuality = () => localStorage.getItem('bd.quality') || 'high';
export const setQuality = (k) => localStorage.setItem('bd.quality', k);

const uuid = () =>
  (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ── 이미지 처리 ────────────────────────────────────────────────
async function loadBitmap(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    // HEIC 등 브라우저가 디코드 못하는 포맷
    return null;
  }
}

function drawToBlob(src, w, h, quality) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(src, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, 'image/jpeg', quality));
}

function fit(w, h, max) {
  if (!max || (w <= max && h <= max)) return [w, h];
  const s = max / Math.max(w, h);
  return [Math.round(w * s), Math.round(h * s)];
}

/** 사진: 썸네일 + (설정에 따라) 리사이즈된 본문 생성 */
async function preparePhoto(file) {
  const bmp = await loadBitmap(file);
  if (!bmp) return { body: file, thumb: null, width: null, height: null };

  const [tw, th] = fit(bmp.width, bmp.height, 480);
  const thumb = await drawToBlob(bmp, tw, th, 0.72);

  const cfg = QUALITY[getQuality()] || QUALITY.high;
  let body = file;
  let width = bmp.width, height = bmp.height;
  if (cfg.max && Math.max(bmp.width, bmp.height) > cfg.max) {
    const [bw, bh] = fit(bmp.width, bmp.height, cfg.max);
    const resized = await drawToBlob(bmp, bw, bh, cfg.q);
    // 리사이즈 결과가 더 크면 원본 유지
    if (resized && resized.size < file.size) {
      body = new File([resized], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
      width = bw; height = bh;
    }
  }
  bmp.close?.();
  return { body, thumb, width, height };
}

/** 영상: 첫 프레임을 썸네일로 (본문은 그대로) */
async function prepareVideo(file) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true; v.playsInline = true; v.src = url;
    await new Promise((res, rej) => {
      v.onloadeddata = res;
      v.onerror = () => rej(new Error('video decode'));
      setTimeout(rej, 8000, new Error('video timeout'));
    });
    v.currentTime = Math.min(0.6, (v.duration || 1) / 3);
    await new Promise((res) => { v.onseeked = res; setTimeout(res, 3000); });
    const [tw, th] = fit(v.videoWidth || 640, v.videoHeight || 480, 480);
    const thumb = await drawToBlob(v, tw, th, 0.72);
    return { body: file, thumb, width: v.videoWidth, height: v.videoHeight, duration: v.duration };
  } catch {
    return { body: file, thumb: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepare(file) {
  if (file.type.startsWith('video/')) return prepareVideo(file);
  if (file.type.startsWith('image/')) return preparePhoto(file);
  return { body: file, thumb: null };
}

// ── 오프라인 대기열 (IndexedDB) ────────────────────────────────
const DB_NAME = 'baekdu-queue';
let dbp = null;
function idb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('jobs', { keyPath: 'uid' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const db = await idb();
  return new Promise((res, rej) => {
    const t = db.transaction('jobs', mode);
    const store = t.objectStore('jobs');
    const out = fn(store);
    t.oncomplete = () => res(out?.result ?? out);
    t.onerror = () => rej(t.error);
  });
}
const qPut = (job) => tx('readwrite', (s) => s.put(job));
const qDel = (uid) => tx('readwrite', (s) => s.delete(uid));
const qAll = () => tx('readonly', (s) => s.getAll());

/**
 * 방금 만든 원본(File/Blob)을 uid 로 들고 있는다.
 *
 * iOS(WebKit)에서는 사진 파일을 IndexedDB 에 넣었다 꺼내면 껍데기만 오고
 * 실제 내용은 읽지 못하는 경우가 있다. 그 상태로 전송하면 본문이 시작하자마자
 * 끊겨서, 서버에는 "본문이 잘렸다"로만 보이고 참가자에게는 연결 탓으로 안내된다.
 * 그래서 페이지가 살아 있는 동안에는 IndexedDB 를 거치지 않고 이 원본을 쓴다.
 * (IndexedDB 저장은 앱을 껐다 켠 뒤에도 이어서 올리기 위한 보험으로 그대로 둔다.)
 */
const live = new Map();

// ── 큐 처리 ────────────────────────────────────────────────────
const listeners = new Set();
export const onQueue = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (state) => listeners.forEach((f) => f(state));

let running = false;
let pendingCount = 0;

export async function queueSize() {
  return (await qAll()).length;
}

/**
 * 대기열 비우기.
 * 신호가 안 잡히는 곳에서 계속 재시도하는 게 부담스러울 때,
 * "이건 나중에 다시 올릴래" 하고 접을 수 있어야 한다.
 * 원본 사진은 휴대폰에 그대로 있으므로 되돌릴 수 있는 선택이다.
 */
export async function clearQueue() {
  const jobs = await qAll();
  for (const j of jobs) {
    await qDel(j.uid);
    live.delete(j.uid);
  }
  pendingCount = 0;
  emit({ pending: 0, running: false });
  return jobs.length;
}

/** 이 크기 아래면 보내기 전에 통째로 메모리에 올린다 (영상은 너무 커서 제외) */
const MATERIALIZE_LIMIT = 80 * 1024 * 1024;

/**
 * 보내기 직전에 파일 내용을 직접 읽어 메모리 사본으로 바꾼다.
 *
 * 아이폰(사파리)에서 사진 파일을 그대로 FormData 에 담아 보내면,
 * 사파리가 파일을 읽지 못해 Content-Length: 0 으로 본문 없이 보내버리는
 * 일이 있다. 서버는 "본문이 잘렸다"고만 보고, 참가자에게는 신호 탓으로
 * 안내되어 원인을 찾기 어렵다.
 * 여기서 우리가 먼저 읽어 두면 크기가 확정되어 정상적으로 전송되고,
 * 읽기 자체가 실패하면 그 사실을 제대로 알릴 수 있다.
 */
async function materialize(job) {
  const b = job.body;
  if (!b || !b.size) {
    throw Object.assign(new Error('사진 파일이 비어 있습니다. 다시 선택해 주세요.'), { status: 400 });
  }
  if (b.size > MATERIALIZE_LIMIT || job.materialized) return;

  let buf;
  try {
    buf = await b.arrayBuffer();
  } catch {
    throw Object.assign(
      new Error('사진을 읽지 못했습니다. iCloud 사진이 아직 내려받아지지 않았을 수 있습니다. '
        + '사진 앱에서 한 번 열어본 뒤 다시 시도해 주세요.'),
      { status: 400 },
    );
  }
  if (buf.byteLength !== b.size) {
    throw Object.assign(
      new Error(`사진을 끝까지 읽지 못했습니다 (${buf.byteLength}/${b.size}바이트). 다시 선택해 주세요.`),
      { status: 400 },
    );
  }
  job.body = new File([buf], job.filename || 'photo.jpg', { type: b.type || 'application/octet-stream' });
  job.materialized = true;
}

function toFormData(job) {
  const fd = new FormData();
  fd.append('file', job.body, job.filename);
  if (job.thumb) fd.append('thumb', job.thumb, 'thumb.jpg');
  for (const [k, v] of Object.entries(job.fields)) {
    if (v !== null && v !== undefined) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  fd.append('clientUid', job.uid);
  return fd;
}

export async function runQueue({ silent = false } = {}) {
  if (running) return;
  running = true;
  try {
    let jobs = await qAll();
    pendingCount = jobs.length;
    if (!jobs.length) { emit({ pending: 0, running: false }); return; }

    for (const stored of jobs) {
      // 메모리에 원본이 있으면 그것을 쓴다 (위 live 주석 참고)
      const job = live.get(stored.uid) || stored;
      emit({ pending: pendingCount, running: true, current: job.label, progress: 0 });
      try {
        await materialize(job);
        const res = await api.form('/api/uploads', toFormData(job), {
          onProgress: (p) => emit({ pending: pendingCount, running: true, current: job.label, progress: p }),
        });
        await qDel(job.uid);
        live.delete(job.uid);
        pendingCount -= 1;
        if (!silent) announce(res, job);
        document.dispatchEvent(new CustomEvent('bd:uploaded', { detail: { res, job } }));
      } catch (err) {
        // 서버가 500 을 준 것은 신호 문제가 아니다. 같은 문구로 뭉뚱그리면
        // 참가자가 계속 와이파이만 탓하게 되므로 구분해서 알려준다.
        // 408 은 전송이 잘려서 서버까지 다 못 간 것 — 신호 문제로 본다.
        const serverError = err.status >= 500;
        const truncated = err.status === 408;
        if (err.offline || !navigator.onLine || serverError || truncated || !err.status) {
          // 나중에 다시 시도
          job.tries = (job.tries || 0) + 1;
          await qPut(job);
          emit({ pending: pendingCount, running: false, offline: !serverError, serverError });
          if (!silent) {
            toast(serverError
              ? `⚠️ <b>서버에서 오류가 났습니다</b> (${err.status})<br>대기열에 저장했어요. 다시 시도해도 안 되면 운영진에게 알려주세요.`
              : '📡 연결이 불안정합니다. 대기열에 저장했어요 — 신호가 잡히면 자동으로 올라갑니다.',
            serverError ? 'err' : '', 4600);
          }
          return;
        }
        // 서버가 거절(잘못된 요청)하거나 파일을 읽을 수 없음 → 큐에서 제거
        await qDel(job.uid);
        live.delete(job.uid);
        pendingCount -= 1;
        toast(`⚠ ${err.message}`, 'err', 4200);
      }
    }
    emit({ pending: 0, running: false });
  } finally {
    running = false;
  }
}

function announce(res, job) {
  if (res.duplicate) return;
  if (res.replaced) {
    // 미션 한 칸에는 한 장만 남는다 — 점수는 그대로, 자료만 바뀜
    toast('🔄 <b>교체 완료</b><br>이 미션 칸의 사진을 새것으로 바꿨습니다.', 'ok', 3000);
    return;
  }
  const bonus = (res.events || []).filter((e) => e.kind !== 'upload');
  let msg = `✅ 업로드 완료 <b>+${res.points}점</b>`;
  if (bonus.length) msg += `<br>${bonus.map((b) => `🎉 ${b.memo} +${b.points}`).join('<br>')}`;
  toast(msg, bonus.length ? 'score' : 'ok', bonus.length ? 4800 : 2800);
}

/** 업로드 등록 — 즉시 시도하고, 실패하면 대기열에 남깁니다 */
export async function enqueue({ body, thumb, filename, fields, label }) {
  const job = { uid: uuid(), body, thumb, filename, fields, label, tries: 0, at: Date.now() };
  live.set(job.uid, job);
  await qPut(job);
  pendingCount = (await qAll()).length;
  runQueue();
  return job.uid;
}

window.addEventListener('online', () => runQueue({ silent: true }));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) runQueue({ silent: true });
});
