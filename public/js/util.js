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
