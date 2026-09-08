import { api } from '../api.js';
import { S } from '../state.js';
import { esc, num, toast, sheet, confirmSheet } from '../util.js';
import { QUALITY, getQuality, setQuality, queueSize, runQueue } from '../upload.js';
import { suspendRouting, cancelQueue } from '../app.js';

export default async function renderMe(host) {
  const u = S.user;
  const sm = S.summary;
  const grp = S.bundle.groups.find((g) => g.id === u.group);
  const bus = S.bundle.buses.find((b) => b.id === u.bus);
  const day3 = S.bundle.day3BusByGroup[u.group];
  const pending = await queueSize();
  const entry = await api.get('/api/me/entry-form/exists').catch(() => ({ has: false }));
  const q = getQuality();

  host.innerHTML = `
    <section class="card">
      <div style="display:flex;align-items:center;gap:14px">
        <div style="width:56px;height:56px;border-radius:50%;background:linear-gradient(140deg,var(--accent),var(--teal));
          color:#fff;display:grid;place-content:center;font-size:22px;font-weight:800">${esc(u.name.slice(-2))}</div>
        <div style="flex:1">
          <div style="font-size:18px;font-weight:800;letter-spacing:-.3px">${esc(u.name)}</div>
          <div class="chips" style="margin-top:5px">
            ${u.gi ? `<span class="chip">${esc(u.gi)}</span>` : ''}
            ${u.group ? `<span class="chip accent">${u.group}조</span>` : ''}
            ${u.bus ? `<span class="chip">${u.bus}호차</span>` : ''}
            ${u.singleRoom ? '<span class="chip gold">1인실</span>' : ''}
            ${u.isAdmin ? '<span class="chip teal">운영진</span>' : ''}
            ${u.isGuide ? '<span class="chip accent">가이드</span>' : ''}
            ${(u.roles || []).map((r) => `<span class="chip teal">${esc(r)}</span>`).join('')}
          </div>
        </div>
      </div>
      ${sm ? `<div class="scorebar" style="margin-top:14px">
        <div><b>${num(sm.score)}</b><span>점수</span></div>
        <div><b>${sm.rank || '-'}위</b><span>순위</span></div>
        <div><b>${sm.stats.uploads}</b><span>업로드</span></div>
      </div>` : ''}
    </section>

    ${entry.has ? `
    <section class="card">
      <h2>🛂 중국 전자입국신고서</h2>
      <p class="small muted" style="margin:0 0 10px">
        입국 심사 때 이 화면의 <b>QR코드</b>를 보여주시면 됩니다.
        눌러서 크게 보고, 미리 저장해 두셔도 좋습니다.
      </p>
      <figure class="figure" id="m-entry" style="cursor:pointer">
        <img src="/api/me/entry-form" alt="중국 전자입국신고서">
        <figcaption>👆 눌러서 크게 보기</figcaption>
      </figure>
      <div class="alert warn" style="margin-top:10px"><div class="ic">📵</div><div>
        <b>현지에서 인터넷이 안 될 수 있습니다</b>
        <p>출발 전에 크게 열어 <b>화면을 캡처</b>해 두시면 안심입니다.</p></div></div>
    </section>` : ''}

    ${u.group ? `
    <section class="card">
      <h2>🚌 내 차량 · 조 정보</h2>
      <div class="kv">
        <dt>조 / 조장</dt><dd>${u.group}조 · ${esc(grp?.leader || '-')}</dd>
        <dt>인솔</dt><dd style="text-align:right">${esc((grp?.guides || []).join(', '))}</dd>
        <dt>1·2·4일차</dt><dd>${u.bus}호차</dd>
        <dt>3일차</dt><dd>${day3}호차</dd>
        <dt>현지 가이드</dt><dd style="text-align:right">${esc(bus?.guide?.name || '-')}</dd>
      </div>
      <a class="btn ghost block sm" style="margin-top:10px"
         href="tel:${esc((bus?.guide?.phone || '').replace(/[^0-9+]/g, ''))}">
         🇨🇳 가이드에게 전화 (${esc(bus?.guide?.phone || '-')})</a>
    </section>` : ''}

    ${sm ? `
    <section class="card">
      <h2>📊 내 기록</h2>
      <div class="kv">
        <dt>사진</dt><dd>${sm.stats.photos}장</dd>
        <dt>영상</dt><dd>${sm.stats.videos}개</dd>
        <dt>다녀온 방문지</dt><dd>${sm.stats.places}곳</dd>
        <dt>내가 태그한 사람</dt><dd>${sm.stats.tagged}명</dd>
        <dt>내가 찍힌 사진</dt><dd>${sm.stats.appearances}장</dd>
      </div>
      <div class="btn-row" style="margin-top:12px">
        <button class="btn ghost sm" style="flex:1" id="m-mine">내가 올린 사진</button>
        <button class="btn ghost sm" style="flex:1" id="m-in">내가 나온 사진</button>
      </div>
    </section>` : ''}

    <section class="card">
      <h2>⚙️ 업로드 설정</h2>
      <div class="field">
        <label>사진 화질</label>
        <select id="m-q">
          ${Object.entries(QUALITY).map(([k, v]) =>
            `<option value="${k}" ${k === q ? 'selected' : ''}>${esc(v.label)} — ${esc(v.hint)}</option>`).join('')}
        </select>
        <span class="hint">현지에서 신호가 약할 때는 <b>데이터 절약</b>으로 두면 업로드가 훨씬 빠릅니다.
          영상은 항상 원본 그대로 올라갑니다.</span>
      </div>
      ${pending ? `
        <div class="alert warn" style="margin-top:12px"><div class="ic">📡</div><div>
          <b>업로드 대기 중 ${pending}건</b>
          <p>연결이 되면 자동으로 올라갑니다. 앱을 지우면 대기열도 사라지니 주의하세요.</p></div></div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn ghost sm" style="flex:1" id="m-retry">지금 다시 시도</button>
          <button class="btn ghost sm" style="flex:1" id="m-cancel">대기열 취소</button>
        </div>` : ''}
    </section>

    <section class="card">
      <h2>🔐 계정</h2>
      ${!u.pwChanged && !u.isAdmin && !u.isGuide ? `
        <div class="alert warn" style="margin-bottom:10px"><div class="ic">🔑</div><div>
          <b>비밀번호가 아직 휴대폰 번호입니다</b>
          <p>다른 사람이 내 이름으로 올릴 수 있습니다. 꼭 바꿔주세요.</p></div></div>` : ''}
      <button class="btn ghost block" id="m-pw">비밀번호 변경</button>
      ${u.isAdmin ? '<button class="btn teal block" style="margin-top:8px" id="m-admin">🛠 운영진 화면</button>' : ''}
      <button class="btn danger block" style="margin-top:8px" id="m-out">로그아웃</button>
    </section>

    <p class="center muted small">
      ICCA 산악회 백두산 여행 · 2026.09.10~13<br>
      여권번호 등 민감정보는 이 앱에 저장하지 않습니다.
    </p>`;

  host.querySelector('#m-q').onchange = (e) => {
    setQuality(e.target.value);
    toast('저장했습니다.', 'ok', 1500);
  };
  host.querySelector('#m-retry')?.addEventListener('click', () => runQueue());
  host.querySelector('#m-cancel')?.addEventListener('click', async () => {
    if (await cancelQueue(pending)) renderMe(host);
  });
  host.querySelector('#m-mine')?.addEventListener('click', () => { location.hash = '#/gallery'; });
  host.querySelector('#m-in')?.addEventListener('click', () => { location.hash = '#/gallery'; });
  host.querySelector('#m-admin')?.addEventListener('click', () => { location.hash = '#/admin'; });
  host.querySelector('#m-pw').onclick = passwordSheet;
  host.querySelector('#m-entry')?.addEventListener('click', showEntryForm);
  host.querySelector('#m-out').onclick = async () => {
    if (!await confirmSheet('로그아웃', '다시 로그인하려면 이름과 비밀번호가 필요합니다.', '로그아웃')) return;
    suspendRouting();
    await api.post('/api/auth/logout');
    location.hash = '';
    location.reload();
  };
}

function passwordSheet() {
  const s = sheet({
    title: '비밀번호 변경',
    body: `
      <div class="field"><label>현재 비밀번호</label>
        <input type="password" id="p0" placeholder="휴대폰 번호 또는 현재 비밀번호" autocomplete="current-password"></div>
      <div class="field"><label>새 비밀번호</label>
        <input type="password" id="p1" placeholder="4자 이상" autocomplete="new-password"></div>
      <div class="field"><label>새 비밀번호 확인</label>
        <input type="password" id="p2" autocomplete="new-password"></div>
      <div class="err" id="pe" hidden></div>`,
    foot: `<button class="btn primary block" id="pgo">변경하기</button>`,
  });
  const err = s.root.querySelector('#pe');
  s.root.querySelector('#pgo').onclick = async (e) => {
    const p0 = s.root.querySelector('#p0').value.trim();
    const p1 = s.root.querySelector('#p1').value.trim();
    const p2 = s.root.querySelector('#p2').value.trim();
    err.hidden = true;
    if (p1 !== p2) { err.textContent = '새 비밀번호가 서로 다릅니다.'; err.hidden = false; return; }
    if (p1.length < 4) { err.textContent = '새 비밀번호는 4자 이상이어야 합니다.'; err.hidden = false; return; }
    e.target.disabled = true;
    try {
      await api.post('/api/auth/password', { current: p0, next: p1 });
      S.user.pwChanged = true;
      toast('비밀번호를 변경했습니다.', 'ok');
      s.close();
    } catch (e2) {
      err.textContent = e2.message; err.hidden = false; e.target.disabled = false;
    }
  };
}

/**
 * 입국신고서 전체화면.
 *
 * 입국 심사대에서 QR 을 보여줘야 하므로 화면 폭을 꽉 채워 크게 띄우고,
 * 넘치는 부분은 위아래로 넘겨 보게 한다.
 * (앱 전체가 확대를 막아둬서, 손가락으로 키우는 대신 이렇게 크게 보여준다)
 */
function showEntryForm() {
  const el = document.createElement('div');
  el.className = 'entry-full';
  el.innerHTML = `
    <div class="bar">
      <b>중국 전자입국신고서</b>
      <button class="icon-btn" data-x aria-label="닫기">✕</button>
    </div>
    <div class="doc"><img src="/api/me/entry-form" alt="중국 전자입국신고서"></div>`;
  const close = () => { el.remove(); document.body.style.overflow = ''; };
  el.querySelector('[data-x]').onclick = close;
  document.body.style.overflow = 'hidden';
  document.body.append(el);
}
