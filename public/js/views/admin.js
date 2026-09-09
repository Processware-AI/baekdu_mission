import { api } from '../api.js';
import { S } from '../state.js';
import { esc, num, fmtBytes, toast, sheet, confirmSheet, relTime, download } from '../util.js';
import { openUploader } from './uploader.js';

let tab = 'stats';

export default async function renderAdmin(host) {
  if (!S.user.isAdmin) {
    host.innerHTML = `<div class="card"><div class="empty"><div class="e">🔒</div>
      <b>운영진 전용 화면입니다</b><p>운영진 계정으로 로그인해 주세요.</p></div></div>`;
    return;
  }

  host.innerHTML = `
    <div class="filters" id="a-tab">
      <button data-v="stats" class="${tab === 'stats' ? 'on' : ''}">📊 현황</button>
      <button data-v="export" class="${tab === 'export' ? 'on' : ''}">📦 내보내기</button>
      <button data-v="people" class="${tab === 'people' ? 'on' : ''}">👥 참가자</button>
      <button data-v="notice" class="${tab === 'notice' ? 'on' : ''}">📢 공지</button>
      <button data-v="usage" class="${tab === 'usage' ? 'on' : ''}">📈 사용현황</button>
      <button data-v="reset" class="${tab === 'reset' ? 'on' : ''}">🧹 초기화</button>
    </div>
    <div id="a-body"></div>`;

  host.querySelectorAll('#a-tab button').forEach((b) => {
    b.onclick = () => { tab = b.dataset.v; renderAdmin(host); };
  });

  const body = host.querySelector('#a-body');
  body.innerHTML = '<div class="card"><div class="sk"></div></div>';

  if (tab === 'stats') await statsView(body, host);
  if (tab === 'export') await exportView(body);
  if (tab === 'people') await peopleView(body);
  if (tab === 'notice') await noticeView(body, host);
  if (tab === 'usage') await usageView(body);
  if (tab === 'reset') await resetView(body);
}

// ── 초기화 ────────────────────────────────────────────────────
const RESET_PHRASE = '전체삭제';

/**
 * 여행 전 테스트로 올린 사진·영상을 한 번에 지운다.
 * 되돌릴 수 없으므로 문구 입력 + 한 번 더 확인, 두 단계를 거치게 한다.
 */
async function resetView(body) {
  const s = await api.get('/api/admin/stats');
  body.innerHTML = `
    <section class="card">
      <h2>🧹 사진 · 영상 초기화</h2>
      <p class="small muted" style="margin:0 0 12px">
        여행 전 테스트로 올린 자료를 한 번에 지웁니다.
        <b>출발 전날 한 번</b> 눌러 깨끗한 상태로 시작하세요.
      </p>
      <div class="kv">
        <dt>올라온 자료</dt><dd>${num(s.totals.uploads)}건 (사진 ${num(s.totals.photos)} · 영상 ${num(s.totals.videos)})</dd>
        <dt>용량</dt><dd>${fmtBytes(s.totals.bytes)}</dd>
        <dt>올린 사람</dt><dd>${num(s.totals.activeUsers)}명</dd>
      </div>

      <div class="alert danger" style="margin-top:12px"><div class="ic">⚠️</div><div>
        <b>되돌릴 수 없습니다</b>
        <p>사진·영상 파일과 점수·배지·정복 기록이 <b>모두</b> 사라집니다.
        아깝다 싶으면 먼저 <b>📦 내보내기</b>에서 ZIP을 받아두세요.</p></div></div>

      <div class="alert info"><div class="ic">✅</div><div>
        <b>그대로 남는 것</b>
        <p>참가자 명단과 비밀번호, 공지, 일정·안내 내용은 지워지지 않습니다.</p></div></div>

      <div class="field" style="margin-top:12px">
        <label for="r-confirm">확인 문구 — <b>${RESET_PHRASE}</b> 를 그대로 입력하세요</label>
        <input type="text" id="r-confirm" placeholder="${RESET_PHRASE}"
               inputmode="text" autocomplete="off" autocapitalize="off">
      </div>
      <button class="btn danger block" id="r-go" disabled>전체 삭제</button>
    </section>`;

  const input = body.querySelector('#r-confirm');
  const go = body.querySelector('#r-go');
  const sync = () => { go.disabled = input.value.trim() !== RESET_PHRASE; };
  input.oninput = sync;
  sync();

  go.onclick = async () => {
    const yes = await confirmSheet(
      '정말 전부 지울까요?',
      `사진·영상 ${s.totals.uploads}건과 모든 점수 기록이 사라집니다. 되돌릴 수 없습니다.`,
      '전부 삭제',
    );
    if (!yes) return;
    go.disabled = true;
    go.textContent = '지우는 중…';
    try {
      const r = await api.post('/api/admin/reset-uploads', { confirm: input.value.trim() });
      toast(`🧹 <b>초기화 완료</b><br>사진·영상 ${r.uploads}건, 점수기록 ${r.events}건을 지웠습니다.`, 'ok', 5000);
      setTimeout(() => location.reload(), 1200);
    } catch (e) {
      toast(e.message || '초기화에 실패했습니다.', 'err', 5000);
      go.textContent = '전체 삭제';
      sync();
    }
  };
}

// ── 현황 ──────────────────────────────────────────────────────
async function statsView(body, host) {
  const s = await api.get('/api/admin/stats');
  const mLabel = Object.fromEntries(
    [...S.bundle.missions, ...S.bundle.adminMissions].map((m) => [m.key, `${m.emoji} ${m.label}`]));

  body.innerHTML = `
    <section class="card">
      <h2>📊 전체 현황</h2>
      <div class="scorebar">
        <div><b>${num(s.totals.uploads)}</b><span>총 업로드</span></div>
        <div><b>${s.totals.activeUsers}/${s.totals.members}</b><span>참여 인원</span></div>
        <div><b>${fmtBytes(s.totals.bytes)}</b><span>저장 용량</span></div>
      </div>
      <div class="chips" style="margin-top:12px">
        <span class="chip">🖼️ 사진 ${num(s.totals.photos)}</span>
        <span class="chip">🎥 영상 ${num(s.totals.videos)}</span>
        ${s.byMission.map((m) => `<span class="chip accent">${mLabel[m.mission] || m.mission} ${m.cnt}</span>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>📸 운영진 업로드</h2>
      <p class="small muted" style="margin:0 0 10px">단체사진과 브이로그 영상은 운영진만 올릴 수 있습니다.</p>
      <div class="btn-row">
        <button class="btn primary" style="flex:1" id="a-group">📸 단체사진</button>
        <button class="btn teal" style="flex:1" id="a-vlog">🎬 브이로그</button>
      </div>
    </section>

    <section class="card">
      <h2>📍 방문지별 수집 현황</h2>
      ${s.byPlace.map((p) => {
        const total = S.bundle.places.length;
        const pct = s.totals.members ? Math.round((p.people / s.totals.members) * 100) : 0;
        return `
        <div style="padding:9px 0;border-bottom:1px solid var(--line)">
          <div style="display:flex;gap:8px;align-items:baseline">
            <b style="flex:1;font-size:13.5px;font-weight:650">${p.day ? `${p.day}일차 ` : ''}${esc(p.title)}</b>
            <span class="small muted">${p.people}명 · ${p.cnt}장${p.videos ? ` · 🎥${p.videos}` : ''}</span>
          </div>
          <div class="progress" style="margin-top:5px;height:6px"><i style="width:${pct}%"></i></div>
        </div>`;
      }).join('')}
    </section>

    <section class="card">
      <h2>🔕 아직 안 올린 분 (${s.silent.length}명)</h2>
      ${s.silent.length ? `<div class="chips">
        ${s.silent.map((p) => `<span class="chip">${esc(p.name)} <small>${p.grp}조</small></span>`).join('')}
      </div>
      <p class="hint" style="margin-top:10px">단톡방에서 한 번 알려주시면 참여율이 크게 올라갑니다.</p>`
      : '<p class="small muted" style="margin:0">전원 참여했습니다! 🎉</p>'}
    </section>`;

  body.querySelector('#a-group').onclick = () => openUploader({ mission: 'group' });
  body.querySelector('#a-vlog').onclick = () => openUploader({ mission: 'vlog' });
}

// ── 내보내기 ──────────────────────────────────────────────────
async function exportView(body) {
  const b = S.bundle;
  const people = await api.get('/api/admin/participants').catch(() => []);
  body.innerHTML = `
    <section class="card">
      <h2>📦 사진 · 영상 내보내기</h2>
      <p class="small muted" style="margin:0 0 12px">
        파일은 서버에 <b>이미 방문지 / 미션별 폴더</b>로 저장되어 있습니다.
        ZIP을 풀면 그대로 편집에 쓸 수 있고, <code>_manifest.csv</code>에
        업로더·함께 찍힌 사람·캡션이 모두 들어 있습니다.
      </p>
      <div class="field">
        <label>범위</label>
        <select id="x-scope">
          <option value="">전체</option>
          ${b.days.map((d) => `<option value="day=${d.day}">${d.label} · ${esc(d.title)}</option>`).join('')}
          <optgroup label="방문지별">
            ${b.places.map((p) => `<option value="place=${p.slug}">${p.emoji} ${esc(p.title)}</option>`).join('')}
          </optgroup>
          <optgroup label="미션별">
            ${[...b.missions, ...b.adminMissions].map((m) =>
              `<option value="mission=${m.key}">${m.emoji} ${esc(m.label)}</option>`).join('')}
          </optgroup>
          <optgroup label="사람별">
            ${people.map((u) => `<option value="user=${u.id}">👤 ${esc(u.name)}${
              u.gi ? ` (${esc(u.gi)})` : ''}</option>`).join('')}
          </optgroup>
        </select>
      </div>

      <div class="field" id="x-scope-wrap" hidden>
        <label>사람별로 받을 때</label>
        <select id="x-who">
          <option value="both">올린 것 + 나온 것 (그 사람의 여행 전부)</option>
          <option value="mine">올린 것만</option>
          <option value="in">나온 것만</option>
        </select>
      </div>
      <button class="btn primary block" style="margin-top:12px" id="x-zip">⬇ ZIP 내려받기</button>
      <button class="btn ghost block" style="margin-top:8px" id="x-csv">📄 목록 CSV 내려받기</button>
      <div class="alert info" style="margin-top:12px"><div class="ic">💡</div><div>
        <b>저장 폴더 구조</b>
        <p style="font-family:ui-monospace,monospace;font-size:11.5px;line-height:1.7">
          2일차_02_백두산 천지(서파)·경계비/<br>
          &nbsp;&nbsp;01_독사진/ 박화서_20260911-110233_a1b2.jpg<br>
          &nbsp;&nbsp;02_2인/ · 03_3인/ · 04_4인이상/<br>
          &nbsp;&nbsp;05_장소풍경/ · 06_영상/<br>
          &nbsp;&nbsp;90_단체사진/ · 91_브이로그/<br>
          0일차_상시_99_자유 · 기타/<br>
          &nbsp;&nbsp;10_이동중/ · 11_먹거리/ … 19_기타/</p></div></div>
    </section>

    <section class="card">
      <h2>🎬 쇼츠 만들 때</h2>
      <ul class="list-plain">
        <li><b>세로 영상</b>은 <code>06_영상</code>·<code>91_브이로그</code> 폴더에서 바로 고르세요.</li>
        <li><code>05_장소풍경</code>은 사람이 없는 컷이라 <b>오프닝·전환 컷</b>으로 쓰기 좋습니다.</li>
        <li><code>04_4인이상</code>과 <code>90_단체사진</code>이 하이라이트 컷으로 가장 잘 맞습니다.</li>
        <li>CSV의 <b>함께찍은사람</b> 열로 인물별 편집본을 만들 수 있습니다.</li>
        <li>파일명 앞부분이 업로더 이름이라 사람별 정렬도 바로 됩니다.</li>
      </ul>
    </section>`;

  // 사람을 고를 때만 '올린 것 / 나온 것' 선택을 보여준다
  const scopeSel = body.querySelector('#x-scope');
  const whoWrap = body.querySelector('#x-scope-wrap');
  const syncWho = () => { whoWrap.hidden = !scopeSel.value.startsWith('user='); };
  scopeSel.onchange = syncWho;
  syncWho();

  body.querySelector('#x-zip').onclick = () => {
    const q = scopeSel.value;
    const who = q.startsWith('user=') ? `&scope=${body.querySelector('#x-who').value}` : '';
    toast('ZIP을 준비합니다. 여러 건이 몰리면 차례대로 처리됩니다…', '', 4500);
    download(`/api/admin/export.zip${q ? `?${q}${who}` : ''}`);
  };
  body.querySelector('#x-csv').onclick = () => {
    download('/api/admin/manifest.csv');
  };
}

// ── 참가자 ────────────────────────────────────────────────────
async function peopleView(body) {
  const list = await api.get('/api/admin/participants');
  body.innerHTML = `
    <section class="card">
      <h2>👥 참가자 ${list.length}명</h2>
      <input type="search" id="p-q" placeholder="이름으로 찾기" style="margin-bottom:10px">
      <div class="alert warn"><div class="ic">🔐</div><div>
        <b>연락처가 곧 초기 비밀번호입니다</b>
        <p>이 화면은 운영진만 볼 수 있습니다. 화면을 남에게 보여주지 마세요.</p></div></div>
      <div id="p-list" style="margin-top:10px"></div>
    </section>`;

  const host = body.querySelector('#p-list');
  const paint = (q = '') => {
    const rows = q ? list.filter((r) => r.name.includes(q)) : list;
    host.innerHTML = rows.map((r) => `
      <div class="row">
        <div class="t">
          <b>${esc(r.name)} ${r.pw_changed ? '<span class="chip ok">비번변경</span>' : '<span class="chip">초기비번</span>'}</b>
          <small>${esc(r.gi || '')} · ${r.grp}조 · ${r.bus}호차 · ${esc(r.phone || '')}</small>
          <small class="muted">${r.uploads}장 · ${num(r.score)}점${r.roles.length ? ` · ${esc(r.roles.join(', '))}` : ''}</small>
        </div>
        <button class="btn sm ghost" data-r="${r.id}" data-n="${esc(r.name)}">관리</button>
      </div>`).join('') || '<div class="empty"><p>검색 결과가 없습니다.</p></div>';

    host.querySelectorAll('[data-r]').forEach((b) => {
      b.onclick = () => manageSheet(list.find((x) => x.id === Number(b.dataset.r)), () => peopleView(body));
    });
  };
  paint();
  body.querySelector('#p-q').oninput = (e) => paint(e.target.value.trim());
}

function manageSheet(p, reload) {
  const s = sheet({
    title: `${p.name} 관리`,
    body: `
      <div class="kv">
        <dt>기수</dt><dd>${esc(p.gi || '-')}</dd>
        <dt>조 / 호차</dt><dd>${p.grp}조 · ${p.bus}호차</dd>
        <dt>연락처</dt><dd>${esc(p.phone || '-')}</dd>
        <dt>업로드 / 점수</dt><dd>${p.uploads}장 · ${num(p.score)}점</dd>
      </div>
      <div class="field"><label>연락처 수정 (비밀번호도 함께 초기화)</label>
        <input type="tel" id="mp" value="${esc(p.phone || '')}" placeholder="010-0000-0000"></div>
      <div class="field"><label>점수 수동 조정</label>
        <div style="display:flex;gap:8px">
          <input type="text" id="ms" inputmode="numeric" placeholder="+50 또는 -20" style="flex:1">
          <button class="btn ghost" id="ms-go">적용</button>
        </div>
        <span class="hint">이벤트 보상 등에 사용하세요. 음수도 가능합니다.</span></div>`,
    foot: `<div class="btn-row">
        <button class="btn ghost" style="flex:1" id="mr">🔑 비밀번호 초기화</button>
        <button class="btn primary" style="flex:1" id="mu">연락처 저장</button></div>`,
  });

  s.root.querySelector('#mr').onclick = async () => {
    if (!await confirmSheet('비밀번호 초기화', `${p.name}님의 비밀번호를 휴대폰 번호로 되돌립니다.`, '초기화')) return;
    try {
      await api.post(`/api/admin/participants/${p.id}/reset-password`);
      toast('초기화했습니다.', 'ok'); s.close(); reload();
    } catch (e) { toast(e.message, 'err'); }
  };
  s.root.querySelector('#mu').onclick = async () => {
    try {
      await api.post(`/api/admin/participants/${p.id}/phone`, { phone: s.root.querySelector('#mp').value.trim() });
      toast('저장했습니다.', 'ok'); s.close(); reload();
    } catch (e) { toast(e.message, 'err'); }
  };
  s.root.querySelector('#ms-go').onclick = async () => {
    const v = Number(s.root.querySelector('#ms').value.replace(/[^\d-]/g, ''));
    if (!v) return toast('점수를 입력해 주세요.', 'err');
    try {
      await api.post('/api/admin/score', { userId: p.id, points: v, memo: '운영진 조정' });
      toast(`${v > 0 ? '+' : ''}${v}점 적용했습니다.`, 'ok'); s.close(); reload();
    } catch (e) { toast(e.message, 'err'); }
  };
}

// ── 공지 ──────────────────────────────────────────────────────
async function noticeView(body, host) {
  const b = S.bundle;
  body.innerHTML = `
    <section class="card">
      <h2>📢 공지 작성</h2>
      <div class="field"><label>제목</label><input type="text" id="n-t" maxlength="60" placeholder="예: 오늘 집합 시간 변경"></div>
      <div class="field"><label>내용</label><textarea id="n-b" maxlength="1000" placeholder="참가자 홈 화면에 바로 표시됩니다."></textarea></div>
      <label style="display:flex;gap:8px;align-items:center;font-size:13px;font-weight:600;margin:4px 0 12px">
        <input type="checkbox" id="n-p" style="width:auto"> 📌 상단 고정</label>
      <button class="btn primary block" id="n-go">공지 올리기</button>
    </section>

    <section class="card">
      <h2>지난 공지 (${b.notices.length})</h2>
      ${b.notices.length ? b.notices.map((n) => `
        <div class="row"><div class="t">
          <b>${n.pinned ? '📌 ' : ''}${esc(n.title)}</b>
          <small style="white-space:pre-wrap">${esc(n.body)}</small>
          <small class="muted">${esc(n.author || '')} · ${relTime(n.created_at)}</small>
        </div><button class="btn sm danger" data-d="${n.id}">삭제</button></div>`).join('')
        : '<p class="small muted" style="margin:0">아직 공지가 없습니다.</p>'}
    </section>`;

  body.querySelector('#n-go').onclick = async (e) => {
    const title = body.querySelector('#n-t').value.trim();
    const text = body.querySelector('#n-b').value.trim();
    if (!title || !text) return toast('제목과 내용을 입력해 주세요.', 'err');
    e.target.disabled = true;
    try {
      await api.post('/api/admin/notices', { title, body: text, pinned: body.querySelector('#n-p').checked });
      const fresh = await api.get('/api/bundle');
      S.bundle.notices = fresh.notices;
      toast('공지를 올렸습니다.', 'ok');
      renderAdmin(host);
    } catch (e2) { toast(e2.message, 'err'); e.target.disabled = false; }
  };
  body.querySelectorAll('[data-d]').forEach((btn) => {
    btn.onclick = async () => {
      if (!await confirmSheet('공지 삭제', '이 공지를 삭제할까요?', '삭제')) return;
      await api.del(`/api/admin/notices/${btn.dataset.d}`);
      const fresh = await api.get('/api/bundle');
      S.bundle.notices = fresh.notices;
      renderAdmin(host);
    };
  });
}

// ── 사용 현황 ──────────────────────────────────────────────────
const VIEW_LABEL = {
  home: '🏠 홈', schedule: '🗓️ 일정', mission: '📷 미션', gallery: '🖼️ 갤러리',
  rank: '🏆 랭킹', guide: '📘 여행 안내', help: '❓ 사용 가이드', me: '👤 내 정보',
  admin: '🛠 운영진',
};

/**
 * 누가 앱을 쓰고 있고 누가 아직 안 들어왔는지.
 * 출발 전에 못 들어오신 분을 찾아 개별로 챙기라고 만든 화면이라,
 * '아직 안 들어오신 분' 을 맨 위에 크게 둔다.
 */
async function usageView(body) {
  const d = await api.get('/api/admin/activity');
  const never = d.people.filter((p) => !p.logins);
  const neverMembers = never.filter((p) => !p.is_guide);
  const neverGuides = never.filter((p) => p.is_guide);
  const pct = d.totals.members ? Math.round((d.totals.loggedIn / d.totals.members) * 100) : 0;

  body.innerHTML = `
    <section class="card">
      <h2>📈 사용 현황</h2>
      <div class="scorebar">
        <div><b>${d.totals.loggedIn}</b><span>들어온 사람</span></div>
        <div><b>${num(d.totals.logins)}</b><span>로그인 횟수</span></div>
        <div><b>${num(d.totals.views)}</b><span>화면 열람</span></div>
      </div>
      <div style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700">
          <span class="muted">참가자 접속률</span><span>${d.totals.loggedIn} / ${d.totals.members}명 · ${pct}%</span>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
    </section>

    <section class="card">
      <h2>🔕 아직 안 들어오신 분 (참가자 ${neverMembers.length}명${
        neverGuides.length ? ` · 가이드 ${neverGuides.length}명` : ''})</h2>
      ${never.length ? `
        <p class="small muted" style="margin:0 0 8px">
          한 번도 로그인하지 않은 분입니다. 출발 전에 개별로 알려주세요.
        </p>
        <div class="chips">
          ${never.map((p) => `<span class="chip ${p.is_guide ? 'accent' : 'danger'}">${esc(p.name)}${
            p.is_guide ? ' (가이드)' : `<span class="muted"> ${esc(p.gi || '')}</span>`}</span>`).join('')}
        </div>`
        : '<p class="small" style="margin:0">모두 한 번 이상 들어오셨습니다. 🎉</p>'}
    </section>

    <section class="card">
      <h2>📱 화면별 사용</h2>
      ${d.byView.length ? `
        <div class="kv">
          ${d.byView.map((v) => `<dt>${esc(VIEW_LABEL[v.view] || v.view)}</dt>
            <dd>${num(v.cnt)}회 <span class="muted small">· ${v.people}명</span></dd>`).join('')}
        </div>`
        : '<p class="small muted" style="margin:0">아직 기록이 없습니다.</p>'}
    </section>

    <section class="card">
      <h2>👥 사람별 (${d.people.length}명)</h2>
      <p class="small muted" style="margin:0 0 8px">이름을 누르면 그 사람의 기록을 볼 수 있습니다.</p>
      <div class="tbl-scroll">
        <table class="usage">
          <thead><tr><th>이름</th><th>로그인</th><th>화면</th><th>올림</th><th>마지막 접속</th></tr></thead>
          <tbody>
            ${d.people.map((p) => `<tr class="${p.logins ? '' : 'off'}" data-u="${p.id}">
              <td>${esc(p.name)}${p.is_guide ? ' <span class="chip accent">가이드</span>' : ''}</td>
              <td>${p.logins || '-'}</td>
              <td>${p.views || '-'}</td>
              <td>${p.uploads || '-'}</td>
              <td>${p.lastSeen ? relTime(p.lastSeen) : '<span class="muted">없음</span>'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="card">
      <h2>🕘 최근 기록 <span class="more">최신 ${d.recent.length}건</span></h2>
      ${d.recent.length ? `
        <div style="display:grid;gap:7px">
          ${d.recent.map((r) => `<div class="row" style="padding:6px 0">
            <div class="em">${r.kind === 'login' ? '🔑' : '👀'}</div>
            <div class="t"><b>${esc(r.name)}</b>
              <small>${r.kind === 'login' ? '로그인' : esc(VIEW_LABEL[r.detail] || r.detail || '')}</small></div>
            <span class="muted small">${relTime(r.created_at)}</span>
          </div>`).join('')}
        </div>`
        : '<p class="small muted" style="margin:0">아직 기록이 없습니다.</p>'}
    </section>

    <section class="card">
      <h2>🧽 사용 기록 지우기</h2>
      <p class="small muted" style="margin:0 0 10px">
        시험 삼아 눌러본 기록을 털고 출발 시점부터 다시 셀 때 씁니다.
        사진·영상과 점수는 그대로 두고 <b>접속·화면 기록만</b> 지웁니다.
      </p>
      <div class="alert warn"><div class="ic">⚠️</div><div>
        <b>지우면 "아직 안 들어오신 분" 명단이 초기화됩니다</b>
        <p>이미 들어와 보신 분도 다시 미접속으로 잡힙니다. 지금 기록 ${num(d.totals.logins)}건 ·
        화면 ${num(d.totals.views)}건.</p></div></div>
      <div class="field" style="margin-top:12px">
        <label for="u-confirm">확인 문구 — <b>${RESET_PHRASE}</b> 를 그대로 입력하세요</label>
        <input type="text" id="u-confirm" placeholder="${RESET_PHRASE}"
               inputmode="text" autocomplete="off" autocapitalize="off">
      </div>
      <button class="btn danger block" id="u-go" disabled>사용 기록 지우기</button>
    </section>

    <p class="hint center">
      로그인 시각과 화면 이동만 남깁니다. 무엇을 눌렀는지, 무엇을 보았는지는 기록하지 않습니다.
    </p>`;

  body.querySelectorAll('tr[data-u]').forEach((tr) => {
    tr.onclick = () => personSheet(Number(tr.dataset.u));
  });

  const input = body.querySelector('#u-confirm');
  const go = body.querySelector('#u-go');
  const sync = () => { go.disabled = input.value.trim() !== RESET_PHRASE; };
  input.oninput = sync;
  sync();

  go.onclick = async () => {
    const yes = await confirmSheet(
      '사용 기록을 지울까요?',
      '접속·화면 기록만 지웁니다. 사진과 점수는 그대로입니다. '
      + '지우면 "아직 안 들어오신 분" 명단이 초기화되어, 이미 들어와 보신 분도 다시 미접속으로 잡힙니다.',
      '지우기',
    );
    if (!yes) return;
    go.disabled = true;
    go.textContent = '지우는 중…';
    try {
      const r = await api.post('/api/admin/reset-activity', { confirm: input.value.trim() });
      toast(`🧽 사용 기록 <b>${num(r.removed)}건</b>을 지웠습니다.`, 'ok', 4000);
      usageView(body);
    } catch (e) {
      toast(e.message || '지우지 못했습니다.', 'err', 5000);
      go.textContent = '사용 기록 지우기';
      sync();
    }
  };
}

/** 한 사람의 사용 기록 — 이 분이 앱을 제대로 쓰고 계신지 보려는 것이다 */
async function personSheet(userId) {
  const s = sheet({ title: '사용 기록', body: '<div class="sk"></div>' });
  let d;
  try {
    d = await api.get(`/api/admin/activity/${userId}`);
  } catch (e) {
    s.body.innerHTML = `<p class="small">${esc(e.message || '불러오지 못했습니다.')}</p>`;
    return;
  }
  const { user: u, totals: t } = d;
  s.root.querySelector('.sh-head b').textContent = `${u.name} · 사용 기록`;
  s.body.innerHTML = `
    <div class="kv">
      <dt>소속</dt><dd>${u.is_guide ? '가이드' : `${esc(u.gi || '')}${u.grp ? ` · ${u.grp}조` : ''}${u.bus ? ` · ${u.bus}호차` : ''}`}</dd>
      <dt>로그인</dt><dd>${t.logins || 0}회</dd>
      <dt>화면 열람</dt><dd>${num(t.views || 0)}회</dd>
      <dt>올린 자료</dt><dd>${t.uploads || 0}건</dd>
      <dt>처음 접속</dt><dd>${t.firstSeen ? relTime(t.firstSeen) : '없음'}</dd>
      <dt>마지막 접속</dt><dd>${t.lastSeen ? relTime(t.lastSeen) : '없음'}</dd>
    </div>

    ${d.byView.length ? `
      <div>
        <div class="section-title" style="margin-bottom:8px">화면별</div>
        <div class="chips">
          ${d.byView.map((v) => `<span class="chip">${esc(VIEW_LABEL[v.view] || v.view)} ${v.cnt}</span>`).join('')}
        </div>
      </div>` : ''}

    <div>
      <div class="section-title" style="margin-bottom:8px">기록 ${
        d.rows.length >= 300 ? '(최근 300건)' : `${d.rows.length}건`}</div>
      ${d.rows.length ? `
        <div style="display:grid;gap:6px">
          ${d.rows.map((r) => `<div class="row" style="padding:5px 0">
            <div class="em">${r.kind === 'login' ? '🔑' : '👀'}</div>
            <div class="t"><b>${r.kind === 'login' ? '로그인' : esc(VIEW_LABEL[r.detail] || r.detail || '')}</b>
              <small>${esc(r.created_at.slice(5, 16))}</small></div>
            <span class="muted small">${relTime(r.created_at)}</span>
          </div>`).join('')}
        </div>`
        : `<div class="empty"><div class="e">🔕</div><b>아직 한 번도 들어오지 않았습니다</b>
             <p>출발 전에 개별로 알려주세요.</p></div>`}
    </div>`;
}
