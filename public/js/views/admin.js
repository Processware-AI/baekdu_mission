import { api } from '../api.js';
import { S } from '../state.js';
import { esc, num, fmtBytes, toast, sheet, confirmSheet, relTime } from '../util.js';
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
          &nbsp;&nbsp;05_영상/ · 90_단체사진/ · 91_브이로그/</p></div></div>
    </section>

    <section class="card">
      <h2>🎬 쇼츠 만들 때</h2>
      <ul class="list-plain">
        <li><b>세로 영상</b>은 <code>05_영상</code>·<code>91_브이로그</code> 폴더에서 바로 고르세요.</li>
        <li><code>04_4인이상</code>과 <code>90_단체사진</code>이 하이라이트 컷으로 가장 잘 맞습니다.</li>
        <li>CSV의 <b>함께찍은사람</b> 열로 인물별 편집본을 만들 수 있습니다.</li>
        <li>파일명 앞부분이 업로더 이름이라 사람별 정렬도 바로 됩니다.</li>
      </ul>
    </section>`;

  body.querySelector('#x-zip').onclick = () => {
    const q = body.querySelector('#x-scope').value;
    toast('ZIP을 준비합니다. 용량이 크면 시간이 걸립니다…', '', 4000);
    window.location.href = `/api/admin/export.zip${q ? `?${q}` : ''}`;
  };
  body.querySelector('#x-csv').onclick = () => {
    window.location.href = '/api/admin/manifest.csv';
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
