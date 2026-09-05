import { api } from '../api.js';
import { S, missionMeta } from '../state.js';
import { esc, el, relTime, fmtBytes, toast, confirmSheet } from '../util.js';
import { openUploader } from './uploader.js';

const F = { scope: 'all', place: '', mission: '', page: 1 };
let items = [];

export default async function renderGallery(host) {
  const b = S.bundle;

  host.innerHTML = `
    <div class="filters" id="f-scope">
      <button data-v="all" class="${F.scope === 'all' ? 'on' : ''}">전체</button>
      <button data-v="mine" class="${F.scope === 'mine' ? 'on' : ''}">내가 올린</button>
      <button data-v="withMe" class="${F.scope === 'withMe' ? 'on' : ''}">내가 나온</button>
      <button data-v="video" class="${F.scope === 'video' ? 'on' : ''}">🎥 영상</button>
      <button data-v="group" class="${F.scope === 'group' ? 'on' : ''}">📸 단체</button>
    </div>

    <div class="field">
      <select id="f-place">
        <option value="">📍 모든 방문지</option>
        ${b.days.map((d) => `<optgroup label="${esc(d.label)} · ${esc(d.title)}">
          ${b.places.filter((p) => p.day === d.day).map((p) =>
            `<option value="${p.slug}" ${F.place === p.slug ? 'selected' : ''}>${p.emoji} ${esc(p.title)}</option>`).join('')}
        </optgroup>`).join('')}
        <optgroup label="상시">
          ${b.places.filter((p) => p.day === 0).map((p) =>
            `<option value="${p.slug}" ${F.place === p.slug ? 'selected' : ''}>${p.emoji} ${esc(p.title)}</option>`).join('')}
        </optgroup>
      </select>
    </div>

    <div class="filters" id="f-mission">
      <button data-v="" class="${F.mission === '' ? 'on' : ''}">모든 미션</button>
      ${[...b.missions, ...b.adminMissions].map((m) =>
        `<button data-v="${m.key}" class="${F.mission === m.key ? 'on' : ''}">${m.emoji} ${esc(m.short)}</button>`).join('')}
    </div>

    <div id="g-count" class="small muted center"></div>
    <div class="ggrid" id="g-grid"></div>
    <div id="g-more"></div>`;

  host.querySelectorAll('#f-scope button').forEach((btn) => {
    btn.onclick = () => { F.scope = btn.dataset.v; F.page = 1; renderGallery(host); };
  });
  host.querySelectorAll('#f-mission button').forEach((btn) => {
    btn.onclick = () => { F.mission = btn.dataset.v; F.page = 1; renderGallery(host); };
  });
  host.querySelector('#f-place').onchange = (e) => {
    F.place = e.target.value; F.page = 1; renderGallery(host);
  };

  await load(host, true);
}

function query() {
  const q = new URLSearchParams({ page: F.page, size: '48' });
  if (F.place) q.set('place', F.place);
  if (F.mission) q.set('mission', F.mission);
  if (F.scope === 'mine') q.set('mine', '1');
  if (F.scope === 'withMe') q.set('withMe', '1');
  if (F.scope === 'video') q.set('type', 'video');
  if (F.scope === 'group') q.set('mission', 'group');
  return q.toString();
}

async function load(host, reset) {
  const grid = host.querySelector('#g-grid');
  const more = host.querySelector('#g-more');
  const count = host.querySelector('#g-count');
  if (reset) grid.innerHTML = '<div class="sk" style="grid-column:1/-1;height:90px"></div>';

  const data = await api.get(`/api/gallery?${query()}`);
  if (reset) items = data.items; else items = items.concat(data.items);

  count.textContent = data.total ? `${data.total}장` : '';
  if (!items.length) {
    grid.innerHTML = '';
    more.innerHTML = `<div class="card"><div class="empty">
      <div class="e">🖼️</div><b>아직 사진이 없습니다</b>
      <p>첫 번째로 올려보세요!</p>
      <button class="btn primary sm" style="margin-top:12px" id="g-up">📸 올리기</button>
    </div></div>`;
    more.querySelector('#g-up').onclick = () => openUploader({ placeSlug: F.place || undefined });
    return;
  }

  grid.innerHTML = items.map((it, i) => `
    <div class="gitem" data-i="${i}">
      <img loading="lazy" src="/api/thumb/${it.id}" alt="${esc(it.caption || '')}">
      ${it.media_type === 'video' ? '<span class="vid">▶</span>' : ''}
      <span class="badge">${esc(it.uploader)}</span>
    </div>`).join('');
  grid.querySelectorAll('[data-i]').forEach((n) => {
    n.onclick = () => lightbox(Number(n.dataset.i), host);
  });

  const shown = items.length;
  more.innerHTML = shown < data.total
    ? `<button class="btn ghost block" id="g-more-b">더 보기 (${shown}/${data.total})</button>`
    : '';
  more.querySelector('#g-more-b')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    F.page += 1;
    await load(host, false);
  });
}

export function lightbox(idx, host) {
  const build = (i) => {
    const it = items[i];
    if (!it) return;
    const place = S.placeBySlug.get(it.place_slug);
    const m = missionMeta(it.mission);
    const mine = it.uid === S.user.id;

    const lb = el('div', { class: 'lb' });
    lb.innerHTML = `
      <div class="bar">
        <button class="icon-btn" style="color:#fff" data-x>✕</button>
        <b>${place?.emoji || ''} ${esc(place?.title || it.place_slug)}</b>
        <button class="icon-btn" style="color:#fff" data-dl title="원본 저장">⤓</button>
        ${(mine || S.user.isAdmin) ? '<button class="icon-btn" style="color:#fff" data-del>🗑</button>' : ''}
      </div>
      <div class="stage">
        ${it.media_type === 'video'
          ? `<video src="/api/media/${it.id}" controls playsinline autoplay style="max-height:100%"></video>`
          : `<img src="/api/media/${it.id}" alt="">`}
      </div>
      <div class="info">
        <div class="chips">
          <span class="chip">${m.emoji} ${esc(m.label)}</span>
          <span class="chip">📤 ${esc(it.uploader)}</span>
          ${it.points ? `<span class="chip">+${it.points}점</span>` : ''}
          <span class="chip">${relTime(it.created_at)}</span>
          ${it.bytes ? `<span class="chip">${fmtBytes(it.bytes)}</span>` : ''}
        </div>
        ${it.tags.length ? `<div>👥 함께: ${it.tags.map((t) => esc(t.name)).join(', ')}</div>` : ''}
        ${it.caption ? `<div>✏️ ${esc(it.caption)}</div>` : ''}
        <div style="display:flex;gap:10px;justify-content:space-between;opacity:.6">
          <span>${i + 1} / ${items.length}</span>
          <span>← 스와이프로 이동 →</span>
        </div>
      </div>`;

    const close = () => { lb.remove(); document.body.style.overflow = ''; };
    lb.querySelector('[data-x]').onclick = close;
    lb.querySelector('[data-dl]').onclick = () => {
      window.open(`/api/media/${it.id}?download=1`, '_blank');
    };
    const delBtn = lb.querySelector('[data-del]');
    delBtn?.addEventListener('click', async () => {
      // 확인창이 떠 있는 동안 휴지통을 또 누르면 확인창이 겹쳐 쌓인다
      if (delBtn.disabled) return;
      delBtn.disabled = true;
      try {
        if (!await confirmSheet('삭제할까요?', '이 사진/영상을 완전히 삭제합니다. 되돌릴 수 없습니다.', '삭제')) return;
        await api.del(`/api/uploads/${it.id}`);
        toast('삭제했습니다.', 'ok');
        close();
        renderGallery(host);
      } catch (e) {
        toast(e.message, 'err');
      } finally {
        delBtn.disabled = false;
      }
    });

    // 스와이프
    let x0 = null;
    lb.querySelector('.stage').addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    lb.querySelector('.stage').addEventListener('touchend', (e) => {
      if (x0 === null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 60) return;
      const ni = dx < 0 ? i + 1 : i - 1;
      if (items[ni]) { close(); build(ni); }
    }, { passive: true });

    document.body.style.overflow = 'hidden';
    document.body.append(lb);
  };
  build(idx);
}
