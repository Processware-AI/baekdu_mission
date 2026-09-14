export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** 안전한 HTML 조립: html`<p>${untrusted}</p>` 형태로 자동 이스케이프 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function html(strings, ...vals) {
  return strings.reduce((out, s, i) => {
    if (i === 0) return s;
    const v = vals[i - 1];
    const piece = Array.isArray(v) ? v.join('') : (v?.__raw ?? esc(v));
    return out + piece + s;
  }, '');
}
export const raw = (s) => ({ __raw: s ?? '' });

export function el(tag, attrs = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    n.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return n;
}

// ── 날짜 ────────────────────────────────────────────────────────
export function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function daysBetween(fromYmd, toYmd) {
  const a = new Date(`${fromYmd}T00:00:00`);
  const b = new Date(`${toYmd}T00:00:00`);
  return Math.round((b - a) / 86400000);
}
export function relTime(s) {
  if (!s) return '';
  const t = new Date(s.replace(' ', 'T'));
  const diff = (Date.now() - t.getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}일 전`;
  return s.slice(5, 16);
}
export function fmtBytes(b) {
  if (!b) return '0';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), 3);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)}${u[i]}`;
}
export const num = (n) => Number(n || 0).toLocaleString('ko-KR');

// ── 토스트 ──────────────────────────────────────────────────────
export function toast(msg, kind = '', ms = 2600) {
  const wrap = document.getElementById('toast');
  const t = el('div', { class: `toast ${kind}`, html: msg });
  wrap.append(t);
  setTimeout(() => {
    t.style.transition = 'opacity .25s, transform .25s';
    t.style.opacity = '0';
    t.style.transform = 'translateY(-10px)';
    setTimeout(() => t.remove(), 260);
  }, ms);
}

// ── 시트(바텀 모달) ─────────────────────────────────────────────
export function sheet({ title, body, foot, onClose }) {
  const bg = el('div', { class: 'sheet-bg' });
  const sh = el('div', { class: 'sheet' });
  sh.innerHTML = `
    <div class="grip"></div>
    <div class="sh-head"><b>${esc(title)}</b>
      <button class="icon-btn" data-x aria-label="닫기">✕</button></div>
    <div class="sh-body"></div>
    ${foot ? '<div class="sh-foot"></div>' : ''}`;
  const bodyEl = sh.querySelector('.sh-body');
  if (typeof body === 'string') bodyEl.innerHTML = body;
  else if (body) bodyEl.append(body);
  if (foot) {
    const f = sh.querySelector('.sh-foot');
    if (typeof foot === 'string') f.innerHTML = foot;
    else f.append(foot);
  }

  const close = () => {
    sh.style.transition = 'transform .2s ease-in';
    sh.style.transform = 'translateY(100%)';
    bg.style.transition = 'opacity .2s';
    bg.style.opacity = '0';
    setTimeout(() => {
      bg.remove(); sh.remove();
      // 시트가 여러 개 겹쳐 있을 수 있으니 마지막 하나가 닫힐 때만 푼다
      if (!document.querySelector('.sheet')) document.body.classList.remove('sheet-open');
    }, 200);
    document.body.style.overflow = '';
    onClose?.();
  };
  bg.onclick = close;
  sh.querySelector('[data-x]').onclick = close;
  document.body.style.overflow = 'hidden';
  document.body.classList.add('sheet-open');
  document.body.append(bg, sh);
  return { root: sh, body: bodyEl, close };
}

export function confirmSheet(title, message, okLabel = '확인') {
  return new Promise((resolve) => {
    let done = false;
    const s = sheet({
      title,
      body: `<p style="margin:0;font-size:14px;line-height:1.6">${esc(message)}</p>`,
      foot: `<div class="btn-row"><button class="btn ghost" style="flex:1" data-no>취소</button>
             <button class="btn danger" style="flex:1" data-yes>${esc(okLabel)}</button></div>`,
      onClose: () => { if (!done) resolve(false); },
    });
    s.root.querySelector('[data-no]').onclick = () => { done = true; resolve(false); s.close(); };
    s.root.querySelector('[data-yes]').onclick = () => { done = true; resolve(true); s.close(); };
  });
}

/** 아이폰·아이패드인지 (아이패드는 맥으로 보고하므로 터치 여부까지 본다) */
export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * 파일 받기 — 화면은 그대로 두고.
 *
 * 홈 화면에 추가해 앱처럼 쓰면 주소창도 뒤로 가기 단추도 없다. 그 상태에서
 * 파일 주소로 화면을 옮기면(location.href 든 a[download] 든) 돌아올 길이 사라진다.
 * 그래서 주소를 여는 대신 내용을 직접 받아 두고, 그 다음에 넘긴다.
 *
 *  - 아이폰: 공유 시트. 카톡·파일·사진으로 바로 보낼 수 있고 화면은 그대로다.
 *  - 그 밖: 받아둔 내용으로 만든 링크를 눌러 저장한다.
 *
 * @param {HTMLElement} [btn] 진행 상황을 보여줄 버튼 (받는 동안 잠긴다)
 * @returns {Promise<boolean>} 넘기기까지 마쳤으면 true
 */
export async function saveFile(url, fallbackName, btn) {
  const label = btn?.textContent;
  const show = (t) => { if (btn) btn.textContent = t; };
  const reset = () => { if (btn) { btn.disabled = false; btn.textContent = label; } };
  if (btn) btn.disabled = true;
  show('준비 중…');

  let blob, name = fallbackName;
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) {
      let msg = '받지 못했습니다. 잠시 뒤 다시 눌러주세요.';
      try { msg = (await res.json()).error || msg; } catch { /* 본문이 없을 수도 있다 */ }
      throw new Error(msg);
    }
    name = nameFromHeader(res.headers.get('Content-Disposition')) || fallbackName;
    blob = await readAll(res, show);
  } catch (e) {
    toast(e.message || '받지 못했습니다.', 'err', 5000);
    reset();
    return false;
  }
  reset();

  const file = new File([blob], name, { type: blob.type || 'application/octet-stream' });

  // 공유 시트가 뜨는 동안에도 앱은 그대로 살아 있다. 취소하면 아무 일도 없다.
  if (isIOS() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;   // 사용자가 닫음
      // 그 밖의 이유면 아래 저장으로 넘어간다
    }
  }

  const obj = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = obj;
  a.download = name;
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(obj), 10000);
  toast('저장했습니다. <b>파일</b> 앱의 <b>다운로드</b>에 들어 있습니다.', 'ok', 5000);
  return true;
}

/** 받는 동안 몇 MB 왔는지 보여준다. ZIP 은 만들면서 보내므로 전체 크기를 미리 알 수 없다. */
async function readAll(res, show) {
  if (!res.body?.getReader) return res.blob();
  const reader = res.body.getReader();
  const chunks = [];
  let got = 0, shown = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    got += value.length;
    if (got - shown > 1048576) { shown = got; show(`받는 중 ${Math.round(got / 1048576)}MB`); }
  }
  return new Blob(chunks, { type: res.headers.get('Content-Type') || '' });
}

/** Content-Disposition 에서 파일 이름 꺼내기 (한글이라 filename* 쪽을 먼저 본다) */
function nameFromHeader(cd) {
  if (!cd) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) { try { return decodeURIComponent(star[1]); } catch { /* 깨졌으면 아래로 */ } }
  const plain = /filename="([^"]+)"/i.exec(cd);
  if (plain) { try { return decodeURIComponent(plain[1]); } catch { return plain[1]; } }
  return null;
}
