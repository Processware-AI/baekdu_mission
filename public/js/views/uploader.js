import { S, missionMeta, progressOf } from '../state.js';
import { sheet, esc, toast, el } from '../util.js';
import { prepare, enqueue } from '../upload.js';

/** 업로드 시트 — 방문지 + 미션 + 파일 + 함께 찍은 사람 */
export function openUploader({ placeSlug = null, mission = null } = {}) {
  const places = S.bundle.places;
  const missions = [...S.bundle.missions, ...(S.user.isAdmin ? S.bundle.adminMissions : [])];

  let sel = {
    place: placeSlug || guessPlace(),
    mission: mission || 'solo',
    file: null,
    prepared: null,
    tags: new Set(),
    caption: '',
  };

  const body = el('div', { class: 'uw' });
  const s = sheet({
    title: '사진 · 영상 올리기',
    body,
    foot: `<button class="btn primary block" id="up-go" disabled>사진을 선택해 주세요</button>`,
  });
  const goBtn = s.root.querySelector('#up-go');

  function need() {
    return { duo: 2, trio: 3, quad: 4 }[sel.mission] || 0;
  }
  function peopleOk() {
    const n = need();
    if (!n) return true;
    const total = sel.tags.size + 1;
    return n === 4 ? total >= 4 : total === n;
  }

  function render() {
    const m = missionMeta(sel.mission);
    const p = S.placeBySlug.get(sel.place);
    const n = need();
    const total = sel.tags.size + 1;
    // 이 미션 칸에 이미 들어 있는 자료 (있으면 교체됨)
    const slotId = progressOf(sel.place).slots?.[sel.mission] || null;

    body.innerHTML = `
      <div class="field">
        <label>📍 어디에서 찍었나요?</label>
        <select id="u-place">
          ${dayGroups(places).map((g) => `
            <optgroup label="${esc(g.label)}">
              ${g.items.map((pl) => `<option value="${pl.slug}" ${pl.slug === sel.place ? 'selected' : ''}>
                ${esc(pl.emoji)} ${esc(pl.title)}${pl.boost > 1 ? ' ⭐' : ''}</option>`).join('')}
            </optgroup>`).join('')}
        </select>
        ${p?.tip ? `<span class="hint">💡 ${esc(p.tip)}</span>` : ''}
      </div>

      <div class="field">
        <label>🎯 어떤 미션인가요?</label>
        <div class="mgrid" id="u-missions">
          ${missions.map((mm) => {
            const filled = !!progressOf(sel.place).mine?.[mm.key];
            const on = mm.key === sel.mission;
            return `<div class="mtile ${on ? 'done' : ''}" data-m="${mm.key}">
              ${filled ? '<span class="cnt">완료</span>' : ''}
              <div class="e">${mm.emoji}</div><b>${esc(mm.short)}</b>
              <small>${mm.points ? `+${mm.points}` : '운영진'}</small></div>`;
          }).join('')}
        </div>
        <span class="hint">${esc(m.desc || '')}</span>
      </div>

      ${slotId ? `
      <div class="alert warn">
        <img class="thumb" src="/api/thumb/${slotId}" alt="" style="width:52px;height:52px">
        <div>
          <b>이 칸에는 이미 올린 것이 있습니다</b>
          <p>미션 한 칸에는 <b>한 장만</b> 남습니다. 새로 올리면 이 사진(영상)이 <b>교체</b>됩니다.
          가장 마음에 드는 것 하나만 골라주세요.</p>
        </div>
      </div>` : ''}

      <div class="field">
        <label>📸 파일</label>
        <div class="btn-row">
          <label class="btn ghost" style="flex:1">
            📷 촬영
            <input type="file" id="u-cam" hidden accept="${m.key === 'video' || m.key === 'vlog' ? 'video/*' : 'image/*'}" capture="environment">
          </label>
          <label class="btn ghost" style="flex:1">
            🖼️ 앨범에서
            <input type="file" id="u-lib" hidden accept="${m.key === 'video' || m.key === 'vlog' ? 'video/*' : 'image/*'}">
          </label>
        </div>
        <div id="u-preview"></div>
      </div>

      ${n ? `
      <div class="field">
        <label>👥 함께 찍힌 사람 <span class="chip ${peopleOk() ? 'ok' : 'danger'}">나 포함 ${total}명${n === 4 ? ' / 4명 이상' : ` / ${n}명`}</span></label>
        <input type="search" id="u-search" placeholder="이름으로 찾기">
        <div class="people" id="u-people"></div>
        <span class="hint">태그하면 <b>1명당 +5점</b>, 태그된 분도 출연 점수 +3점을 받습니다.
        나중에 사진 정리할 때 이 정보가 가장 큰 도움이 됩니다.</span>
      </div>` : ''}

      <div class="field">
        <label>✏️ 한 줄 메모 <span class="muted small">(선택)</span></label>
        <input type="text" id="u-caption" maxlength="60" placeholder="예: 천지 앞에서 다같이!" value="${esc(sel.caption)}">
      </div>`;

    // 방문지
    body.querySelector('#u-place').onchange = (e) => { sel.place = e.target.value; render(); };

    // 미션
    body.querySelectorAll('[data-m]').forEach((tile) => {
      tile.onclick = () => {
        const k = tile.dataset.m;
        const wasVideo = sel.mission === 'video' || sel.mission === 'vlog';
        const isVideo = k === 'video' || k === 'vlog';
        sel.mission = k;
        if (wasVideo !== isVideo) { sel.file = null; sel.prepared = null; }
        if (!need()) sel.tags.clear();
        render();
      };
    });

    // 파일
    const onPick = async (e) => {
      const f = e.target.files?.[0];
      if (!f) return;
      sel.file = f;
      const pv = body.querySelector('#u-preview');
      pv.innerHTML = `<div class="hint" style="margin-top:8px">⏳ 준비 중…</div>`;
      updateBtn();
      try {
        sel.prepared = await prepare(f);
        showPreview();
      } catch (err) {
        console.error(err);
        sel.prepared = { body: f, thumb: null };
        showPreview();
      }
      updateBtn();
    };
    body.querySelector('#u-cam').onchange = onPick;
    body.querySelector('#u-lib').onchange = onPick;
    if (sel.file) showPreview();

    // 사람 선택
    if (n) {
      const search = body.querySelector('#u-search');
      search.oninput = () => paintPeople(search.value);
      paintPeople('');
    }

    body.querySelector('#u-caption').oninput = (e) => { sel.caption = e.target.value; };
    updateBtn();
  }

  function showPreview() {
    const pv = body.querySelector('#u-preview');
    if (!pv || !sel.file) return;
    const f = sel.prepared?.body || sel.file;
    const url = URL.createObjectURL(f);
    const isVid = sel.file.type.startsWith('video/');
    const saved = sel.prepared?.body && sel.prepared.body !== sel.file
      ? ` · ${(sel.file.size / 1048576).toFixed(1)}MB → ${(f.size / 1048576).toFixed(1)}MB`
      : '';
    pv.innerHTML = isVid
      ? `<video src="${url}" controls playsinline style="margin-top:10px;border-radius:12px;max-height:230px;width:100%;background:#000"></video>
         <div class="hint" style="margin-top:6px">🎥 ${esc(sel.file.name)} · ${(f.size / 1048576).toFixed(1)}MB</div>`
      : `<img src="${url}" style="margin-top:10px;border-radius:12px;max-height:250px;width:100%;object-fit:cover">
         <div class="hint" style="margin-top:6px">🖼️ ${(f.size / 1048576).toFixed(1)}MB${saved}</div>`;
  }

  function paintPeople(q) {
    const host = body.querySelector('#u-people');
    if (!host) return;
    const term = q.trim();
    const mine = S.participants.filter((p) => p.id !== S.user.id);
    const list = term ? mine.filter((p) => p.name.includes(term)) : sortNear(mine);
    host.innerHTML = list.slice(0, 200).map((p) => `
      <button type="button" class="person ${sel.tags.has(p.id) ? 'on' : ''}" data-p="${p.id}">
        ${esc(p.name)}<small>${p.group ? `${p.group}조` : ''}</small></button>`).join('')
      || `<div class="hint">검색 결과가 없습니다.</div>`;
    host.querySelectorAll('[data-p]').forEach((b) => {
      b.onclick = () => {
        const id = Number(b.dataset.p);
        if (sel.tags.has(id)) sel.tags.delete(id);
        else {
          const n = need();
          if (n && n !== 4 && sel.tags.size >= n - 1) sel.tags.clear();
          sel.tags.add(id);
        }
        render();
        const s2 = body.querySelector('#u-search');
        if (s2) { s2.value = q; paintPeople(q); }
      };
    });
  }

  function updateBtn() {
    const ready = !!sel.file && peopleOk();
    goBtn.disabled = !ready;
    if (!sel.file) goBtn.textContent = '사진을 선택해 주세요';
    else if (!peopleOk()) {
      const n = need();
      goBtn.textContent = n === 4
        ? `함께 찍힌 분을 ${Math.max(0, 3 - sel.tags.size)}명 더 선택하세요`
        : `함께 찍힌 분 ${n - 1}명을 선택하세요`;
    } else {
      const m = missionMeta(sel.mission);
      const p = S.placeBySlug.get(sel.place);
      const filled = !!progressOf(sel.place).slots?.[sel.mission];
      const pts = Math.round((m.points || 0) * (p?.boost || 1)) + sel.tags.size * 5 * (p?.boost || 1);
      const label = filled ? '이 사진으로 교체하기' : '올리기';
      goBtn.innerHTML = pts && !filled
        ? `${label} <span style="opacity:.85">+${Math.round(pts)}점</span>`
        : label;
    }
  }

  goBtn.onclick = async () => {
    if (!sel.file) return;
    goBtn.disabled = true;
    goBtn.textContent = '대기열에 넣는 중…';
    const p = S.placeBySlug.get(sel.place);
    const prep = sel.prepared || { body: sel.file, thumb: null };
    try {
      await enqueue({
        body: prep.body,
        thumb: prep.thumb,
        filename: prep.body.name || sel.file.name || 'upload',
        label: `${p?.title || ''} · ${missionMeta(sel.mission).label}`,
        fields: {
          placeSlug: sel.place,
          mission: sel.mission,
          caption: sel.caption,
          tags: [...sel.tags],
          width: prep.width ?? '',
          height: prep.height ?? '',
          duration: prep.duration ?? '',
          takenAt: new Date(sel.file.lastModified || Date.now()).toISOString(),
        },
      });
      s.close();
    } catch (err) {
      toast(`⚠ ${err.message}`, 'err');
      goBtn.disabled = false;
      updateBtn();
    }
  };

  render();
  return s;
}

function guessPlace() {
  const b = S.bundle;
  const today = new Date();
  const start = new Date(`${b.trip.startDate}T00:00:00`);
  const diff = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()) - start) / 86400000);
  const day = diff + 1;
  const todays = b.places.filter((p) => p.day === day);
  if (!todays.length) return b.places[0].slug;
  const hm = today.getHours() * 60 + today.getMinutes();
  let best = todays[0];
  for (const p of todays) {
    const [h, m] = (p.time || '00:00').split(':').map(Number);
    if (h * 60 + m <= hm + 30) best = p;
  }
  return best.slug;
}

function dayGroups(places) {
  const days = S.bundle.days;
  const out = days.map((d) => ({
    label: `${d.label} (${d.date.slice(5).replace('-', '/')} ${d.dow}) · ${d.title}`,
    items: places.filter((p) => p.day === d.day),
  }));
  const free = places.filter((p) => p.day === 0);
  if (free.length) out.push({ label: '상시', items: free });
  return out.filter((g) => g.items.length);
}

/** 같은 조 → 같은 호차 → 나머지 순으로 정렬 (실제로 옆에 있는 사람이 위로) */
function sortNear(list) {
  const g = S.user.group, b = S.user.bus;
  return [...list].sort((x, y) => {
    const s = (p) => (p.group === g ? 0 : p.bus === b ? 1 : 2);
    return s(x) - s(y) || x.name.localeCompare(y.name, 'ko');
  });
}
