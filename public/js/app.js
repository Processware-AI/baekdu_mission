import { api } from './api.js';
import { $, esc, toast, el, confirmSheet } from './util.js';
import { S, loadMe, loadBundle, refreshProgress } from './state.js';
import { onQueue, runQueue, queueSize, clearQueue } from './upload.js';

import renderHome from './views/home.js';
import renderSchedule from './views/schedule.js';
import renderMission from './views/mission.js';
import renderGallery from './views/gallery.js';
import renderRank from './views/rank.js';
import renderGuide from './views/guide.js';
import renderMe from './views/me.js';
import renderAdmin from './views/admin.js';

const root = $('#root');
const boot = $('#boot');

const TABS = [
  { id: 'home',     ic: '🏠', label: '홈' },
  { id: 'schedule', ic: '🗓️', label: '일정' },
  { id: 'mission',  ic: '📷', label: '미션', cam: true },
  { id: 'gallery',  ic: '🖼️', label: '갤러리' },
  { id: 'rank',     ic: '🏆', label: '랭킹' },
];

const VIEWS = {
  home: { title: '백두산 여행', render: renderHome },
  schedule: { title: '일정', render: renderSchedule },
  mission: { title: '사진 미션', render: renderMission },
  gallery: { title: '갤러리', render: renderGallery },
  rank: { title: '랭킹', render: renderRank },
  guide: { title: '여행 안내', render: renderGuide },
  me: { title: '내 정보', render: renderMe },
  admin: { title: '운영진', render: renderAdmin },
};

export function go(route) {
  location.hash = `#/${route}`;
}
function currentRoute() {
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [name, ...rest] = h.split('/');
  return { name: VIEWS[name] ? name : 'home', args: rest };
}

// ── 셸 ────────────────────────────────────────────────────────
function shell() {
  root.innerHTML = `
    <div class="app">
      <header class="topbar">
        <div style="flex:1;min-width:0">
          <h1 id="vtitle">백두산 여행</h1>
          <div class="sub" id="vsub"></div>
        </div>
        <button class="icon-btn" id="btn-guide" title="여행 안내">📘</button>
        <button class="icon-btn" id="btn-me" title="내 정보">👤</button>
      </header>
      <main id="view" class="wrap"></main>
      <nav class="tabbar">
        ${TABS.map((t) => `
          <a href="#/${t.id}" data-tab="${t.id}" class="${t.cam ? 'cam' : ''}">
            <span class="ic">${t.ic}</span><span>${t.label}</span>
          </a>`).join('')}
      </nav>
    </div>
    <div class="qbar" id="qbar" hidden></div>`;

  $('#btn-guide').onclick = () => go('guide');
  $('#btn-me').onclick = () => go('me');
}

/** 로그아웃 직후 해시가 바뀌면서 죽은 세션으로 다시 그리는 것을 막는다 */
let routingSuspended = false;
export function suspendRouting() { routingSuspended = true; }

async function route() {
  if (routingSuspended) return;
  const { name, args } = currentRoute();
  const view = VIEWS[name];
  $('#vtitle').textContent = view.title;
  $('#vsub').textContent = name === 'home'
    ? `${S.user.name}님 · ${S.user.group ? `${S.user.group}조` : '운영'}${S.user.bus ? ` · ${S.user.bus}호차` : ''}`
    : '';
  document.querySelectorAll('[data-tab]').forEach((a) =>
    a.classList.toggle('on', a.dataset.tab === name));

  const host = $('#view');
  host.innerHTML = '<div class="card"><div class="sk" style="width:60%"></div><div class="sk" style="margin-top:10px"></div><div class="sk" style="margin-top:8px;width:80%"></div></div>';
  window.scrollTo(0, 0);
  try {
    await view.render(host, args);
  } catch (err) {
    console.error(err);
    host.innerHTML = `<div class="card"><div class="empty"><div class="e">😵</div>
      <b>화면을 불러오지 못했습니다</b><p>${esc(err.message)}</p></div>
      <button class="btn block ghost" onclick="location.reload()">새로고침</button></div>`;
  }
}

// ── 업로드 대기열 표시 ─────────────────────────────────────────
function wireQueueBar() {
  const bar = $('#qbar');
  onQueue((st) => {
    if (!st.pending) { bar.hidden = true; return; }
    bar.hidden = false;
    if (st.running) {
      const pct = Math.round((st.progress || 0) * 100);
      bar.innerHTML = `<span class="sp"></span>
        <span style="flex:1">업로드 중 ${pct}% <span class="muted">· ${st.pending}개 남음</span></span>`;
    } else {
      bar.innerHTML = `<span>${st.serverError ? '⚠️' : '📡'}</span>
        <span style="flex:1">대기 <b>${st.pending}개</b> · ${
          st.serverError ? '서버 오류로 멈춤' : '연결되면 자동'}</span>
        <button class="btn sm ghost" id="qretry">지금 시도</button>
        <button class="btn sm ghost" id="qcancel">취소</button>`;
      bar.querySelector('#qretry').onclick = () => runQueue();
      bar.querySelector('#qcancel').onclick = () => cancelQueue(st.pending);
    }
  });
  queueSize().then((n) => { if (n) runQueue({ silent: true }); });
}

/** 대기 중인 업로드를 접는다. 되돌릴 수 있는 선택이지만 한 번 확인은 받는다. */
export async function cancelQueue(pending) {
  const yes = await confirmSheet(
    '대기 중인 업로드를 취소할까요?',
    `아직 못 올린 ${pending}개를 대기열에서 지웁니다. `
    + '사진과 영상은 휴대폰에 그대로 있으니 나중에 다시 올릴 수 있습니다.',
    '취소하기',
  );
  if (!yes) return 0;
  const removed = await clearQueue();
  toast(`🗑 대기 중이던 <b>${removed}개</b>를 지웠습니다.`, '', 3000);
  return removed;
}

// ── 로그인 화면 ────────────────────────────────────────────────
function loginScreen() {
  root.innerHTML = `
    <div class="login">
      <div class="brand">
        <div class="m">🏔️</div>
        <h1>여행 안내 · 사진 미션</h1>
      </div>

      <img class="login-banner" src="/img/banner.jpg"
           alt="백두산 천지를 품고, 우정을 담다 — 백두산 3박 4일 특별산행 2026년 09월 10일(목) ~ 13일(일)">

      <form class="panel" id="lf">
        <div class="field">
          <label for="ln">이름</label>
          <input id="ln" type="text" autocomplete="username" placeholder="예: 홍길동"
                 inputmode="text" enterkeyhint="next" required>
        </div>
        <div class="field">
          <label for="lp">비밀번호</label>
          <input id="lp" type="password" autocomplete="current-password"
                 placeholder="휴대폰 번호 (숫자만)" inputmode="numeric" enterkeyhint="go" required>
          <span class="hint" id="lphint">처음 로그인하실 때는 <b>본인 휴대폰 번호</b>를 입력하세요. (예: 01012345678)</span>
        </div>
        <div class="err" id="lerr" hidden></div>
        <button class="btn primary block" type="submit" id="lbtn">로그인</button>
      </form>
      <div class="foot">
        명단에 등록된 참가자만 로그인할 수 있습니다.<br>
        이름이나 번호가 맞지 않으면 방명환 사무국장(010-5800-1777)께 문의해 주세요.
      </div>
    </div>`;

  const form = $('#lf'), err = $('#lerr'), btn = $('#lbtn');

  /**
   * 참가자 비밀번호는 휴대폰 번호라서 숫자 자판을 띄운다.
   * 하지만 운영진 계정(admin)은 문자가 섞인 비밀번호를 쓰기 때문에
   * 숫자 자판만 뜨면 휴대폰에서 아예 입력을 못 한다.
   * 참가자 이름은 모두 한글이므로, 이름에 한글이 없으면 문자 자판으로 바꿔준다.
   */
  const nameEl = $('#ln'), pwEl = $('#lp'), pwHint = $('#lphint');
  const syncKeypad = () => {
    const typed = nameEl.value.trim();
    const numeric = !typed || /[ㄱ-ㅎ가-힣]/.test(typed);
    const mode = numeric ? 'numeric' : 'text';
    if (pwEl.getAttribute('inputmode') === mode) return;
    pwEl.setAttribute('inputmode', mode);
    pwEl.placeholder = numeric ? '휴대폰 번호 (숫자만)' : '비밀번호';
    pwHint.innerHTML = numeric
      ? '처음 로그인하실 때는 <b>본인 휴대폰 번호</b>를 입력하세요. (예: 01012345678)'
      : '운영진 계정입니다. 문자·기호가 섞인 비밀번호를 입력하세요.';
    // 이미 비밀번호 칸에 커서가 있으면 자판을 다시 띄워야 바뀐 설정이 반영된다
    if (document.activeElement === pwEl) { pwEl.blur(); pwEl.focus(); }
  };
  nameEl.addEventListener('input', syncKeypad);

  form.onsubmit = async (e) => {
    e.preventDefault();
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = '확인 중…';
    try {
      const { user } = await api.post('/api/auth/login', {
        name: $('#ln').value.trim(),
        password: $('#lp').value.trim(),
      });
      S.user = user;
      await start();
    } catch (e2) {
      err.textContent = e2.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = '로그인';
    }
  };
  $('#ln').focus();
}

// ── 시작 ──────────────────────────────────────────────────────
async function start() {
  await loadBundle();
  await refreshProgress().catch(() => {});
  shell();
  wireQueueBar();
  window.addEventListener('hashchange', route);
  document.addEventListener('bd:uploaded', async () => {
    await refreshProgress().catch(() => {});
    const { name } = currentRoute();
    if (['home', 'mission', 'gallery', 'rank'].includes(name)) route();
  });
  await route();

  if (!S.user.pwChanged && !S.user.isAdmin) {
    setTimeout(() => toast(
      '🔐 비밀번호가 아직 휴대폰 번호입니다. <b>내 정보</b>에서 바꿔주세요.', '', 5200), 1200);
  }
}

(async function main() {
  try {
    const user = await loadMe();
    if (user) {
      await start();
    } else {
      loginScreen();
    }
  } catch (e) {
    root.innerHTML = `<div style="padding:40px 24px;text-align:center">
      <div style="font-size:44px">📡</div>
      <h2 style="font-size:17px">서버에 연결할 수 없습니다</h2>
      <p class="muted small">${esc(e.message)}</p>
      <button class="btn primary" onclick="location.reload()">다시 시도</button></div>`;
  } finally {
    boot.remove();
    root.hidden = false;
  }
})();

export { route };
