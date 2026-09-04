import { S, progressOf, tripDay } from '../state.js';
import { esc, sheet } from '../util.js';
import { openUploader } from './uploader.js';

export default async function renderSchedule(host) {
  const b = S.bundle;
  const today = tripDay();

  host.innerHTML = `
    <section class="card tight">
      <div class="kv">
        <dt>항공편</dt><dd>${b.trip.flights.map((f) => esc(f.no)).join(' / ')}</dd>
        <dt>가는 편</dt><dd>9/10 15:55 인천 → 17:25 연길</dd>
        <dt>오는 편</dt><dd>9/13 18:25 연길 → 21:55 인천</dd>
        <dt>시차</dt><dd>한국보다 1시간 느림</dd>
      </div>
      <div class="alert warn" style="margin-top:12px">
        <div class="ic">🍱</div><div>
          <b>출발편은 기내식이 없습니다</b>
          <p>현지 도착 후 석식이 20시경입니다. 공항에서 미리 식사하세요.</p></div>
      </div>
    </section>

    ${b.days.map((d) => {
      const places = b.places.filter((p) => p.day === d.day);
      return `
      <section class="card">
        <div class="dayhead" style="margin-bottom:10px">
          <div class="n" style="${d.day === today ? 'background:var(--teal)' : ''}">${d.day}</div>
          <div><b>${esc(d.title)}</b>
            <small>${d.date.slice(5).replace('-', '월 ')}일 (${d.dow})${d.day === today ? ' · 오늘' : ''}</small></div>
        </div>
        <div class="tl">
          ${places.map((p) => {
            const pr = progressOf(p.slug);
            return `<div class="stop ${pr.myCount ? 'done' : ''} ${p.boost > 1 ? 'boost' : ''}" data-p="${p.slug}">
              <div class="time">${esc(p.time)}</div>
              <div class="body">
                ${p.img ? `<img class="thumb" loading="lazy" src="/img/${p.img}" alt="">` : ''}
                <div class="txt">
                  <b>${p.emoji} ${esc(p.title)}${p.boost > 1 ? ' <span class="chip gold">×2</span>' : ''}</b>
                  <small>${esc(p.desc)}</small>
                  ${pr.myCount ? `<small class="chip ok" style="margin-top:4px">내 사진 ${pr.myCount}장${pr.conquered ? ' · 정복!' : ''}</small>` : ''}
                </div>
              </div>
              <div class="chev">›</div>
            </div>`;
          }).join('')}
        </div>
      </section>`;
    }).join('')}

    <section class="card">
      <h2>🏨 숙소</h2>
      ${b.trip.hotels.map((h) => `
        <div class="row"><div class="em">🛏️</div><div class="t">
          <b>${esc(h.name)}</b><small>${esc(h.nights)} · ${esc(h.area)} · ${esc(h.grade)}</small>
        </div></div>`).join('')}
    </section>

    <section class="card">
      <h2>🚌 내 차량 · 조</h2>
      ${busCard()}
    </section>

    <p class="center muted small">상기 일정은 현지 사정에 의해 변동될 수 있습니다.</p>`;

  host.querySelectorAll('[data-p]').forEach((n) => {
    n.onclick = () => showPlace(n.dataset.p);
  });
}

function busCard() {
  const u = S.user;
  const b = S.bundle;
  if (!u.group) return `<p class="muted small">운영진 계정입니다.</p>`;
  const grp = b.groups.find((g) => g.id === u.group);
  const bus = b.buses.find((x) => x.id === u.bus);
  const day3 = b.day3BusByGroup[u.group];
  return `
    <div class="kv">
      <dt>조</dt><dd>${grp?.name || '-'}</dd>
      <dt>기본 차량</dt><dd>${bus?.name || '-'}</dd>
      <dt>3일차 차량</dt><dd>${day3}호차</dd>
      <dt>조장</dt><dd>${esc(grp?.leader || '-')}</dd>
      <dt>인솔</dt><dd style="text-align:right">${esc((grp?.guides || []).join(', '))}</dd>
      <dt>현지 가이드</dt><dd style="text-align:right">${esc(bus?.guide?.name || '-')}</dd>
    </div>
    <div class="alert info" style="margin-top:12px">
      <div class="ic">🔄</div><div>
        <b>3일차에는 차량이 바뀝니다</b>
        <p>1조·4조 → 1호차 / 2조·3조 → 2호차</p></div>
    </div>`;
}

export function showPlace(slug) {
  const p = S.placeBySlug.get(slug);
  if (!p) return;
  const pr = progressOf(slug);
  const missions = S.bundle.missions;

  const s = sheet({
    title: `${p.emoji} ${p.title}`,
    body: `
      ${p.img ? `<figure class="pbanner">
        <img src="/img/${p.img}" alt="${esc(p.title)}">
      </figure>` : ''}
      <div class="chips">
        <span class="chip accent">${p.day ? `${p.day}일차` : '상시'} ${esc(p.time)}</span>
        <span class="chip">${esc(p.area)}</span>
        ${p.boost > 1 ? '<span class="chip gold">⭐ 핵심 스팟 · 점수 ×2</span>' : ''}
      </div>
      <p style="margin:0;font-size:13.5px;line-height:1.6">${esc(p.desc)}</p>
      ${p.tip ? `<div class="alert info"><div class="ic">💡</div><div><p>${esc(p.tip)}</p></div></div>` : ''}
      <div>
        <div class="section-title" style="margin-bottom:8px">내 미션 현황</div>
        <div class="mgrid">
          ${missions.map((m) => {
            const c = pr.mine?.[m.key] || 0;
            return `<div class="mtile ${c ? 'done' : ''}" data-m="${m.key}">
              ${c ? '<span class="cnt">교체</span>' : ''}
              <div class="e">${m.emoji}</div><b>${esc(m.short)}</b>
              <small>+${Math.round(m.points * p.boost)}</small></div>`;
          }).join('')}
        </div>
      </div>
      <div class="hint">미션 한 칸에는 <b>가장 좋은 것 한 장만</b> 남습니다. 다시 올리면 교체됩니다.<br>
        이 방문지 전체 ${pr.all.count}장 · ${pr.all.people}명 참여
        ${pr.conquered ? ' · <b style="color:var(--ok)">정복 완료 🏔️</b>' : ''}</div>`,
    foot: `<button class="btn primary block" id="pl-up">📸 여기 사진 올리기</button>`,
  });

  s.root.querySelector('#pl-up').onclick = () => { s.close(); openUploader({ placeSlug: slug }); };
  s.root.querySelectorAll('[data-m]').forEach((t) => {
    t.onclick = () => { s.close(); openUploader({ placeSlug: slug, mission: t.dataset.m }); };
  });
}
