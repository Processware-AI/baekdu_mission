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

// ── 큐 처리 ────────────────────────────────────────────────────
const listeners = new Set();
export const onQueue = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = (state) => listeners.forEach((f) => f(state));

let running = false;
let pendingCount = 0;

export async function queueSize() {
  return (await qAll()).length;
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

    for (const job of jobs) {
      emit({ pending: pendingCount, running: true, current: job.label, progress: 0 });
      try {
        const res = await api.form('/api/uploads', toFormData(job), {
          onProgress: (p) => emit({ pending: pendingCount, running: true, current: job.label, progress: p }),
        });
        await qDel(job.uid);
        pendingCount -= 1;
        if (!silent) announce(res, job);
        document.dispatchEvent(new CustomEvent('bd:uploaded', { detail: { res, job } }));
      } catch (err) {
        if (err.offline || !navigator.onLine || err.status >= 500 || !err.status) {
          // 나중에 다시 시도
          job.tries = (job.tries || 0) + 1;
          await qPut(job);
          emit({ pending: pendingCount, running: false, offline: true });
          if (!silent) toast('📡 연결이 불안정합니다. 대기열에 저장했어요 — 신호가 잡히면 자동으로 올라갑니다.', '', 4200);
          return;
        }
        // 서버가 거절(잘못된 요청) → 큐에서 제거
        await qDel(job.uid);
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
  await qPut(job);
  pendingCount = (await qAll()).length;
  runQueue();
  return job.uid;
}

window.addEventListener('online', () => runQueue({ silent: true }));
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) runQueue({ silent: true });
});
