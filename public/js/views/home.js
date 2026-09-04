import { S, tripDay, progressOf } from '../state.js';
import { esc, relTime, num, daysBetween, ymd } from '../util.js';
import { openUploader } from './uploader.js';
import { api } from '../api.js';

export default async function renderHome(host) {
  const b = S.bundle;
  const day = tripDay();
  const dleft = daysBetween(ymd(new Date()), b.trip.startDate);
  const sm = S.summary;

  const todayPlaces = day >= 1 && day <= 4 ? b.places.filter((p) => p.day === day) : [];
  const dayInfo = b.days.find((d) => d.day === day);
  const totalPlaces = b.places.filter((p) => p.day > 0).length;
  const donePlaces = (S.progress?.places || []).filter((p) => p.day !== 0 && p.myCount > 0 && p.slug !== 'free').length;
  const pct = Math.round((donePlaces / totalPlaces) * 100);

  const feed = await api.get('/api/feed').catch(() => ({ items: [] }));

  host.innerHTML = `
    <section class="hero">
      <div class="eyebrow">${esc(b.trip.org)}</div>
      <h2>${esc(b.trip.title)}</h2>
      <div class="dates">2026. 9. 10(목) ~ 9. 13(일) · ${b.trip.headcount}명</div>
      <div class="dday">
        ${dleft > 0
          ? `<b>D-${dleft}</b><span>출발까지</span>`
          : day >= 1 && day <= 4
            ? `<b>${day}일차</b><span>${esc(dayInfo?.title || '')}</span>`
            : `<b>완주 🎉</b><span>수고하셨습니다</span>`}
      </div>
    </section>

    ${sm ? `
    <section class="card tight">
      <div class="scorebar">
        <div><b>${num(sm.score)}</b><span>내 점수</span></div>
        <div><b>${sm.rank ? `${sm.rank}위` : '-'}</b><span>전체 ${sm.totalPlayers}명 중</span></div>
        <div><b>${sm.stats.uploads}</b><span>업로드</span></div>
      </div>
      <div style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:700">
          <span class="muted">방문지 정복률</span>
          <span>${donePlaces} / ${totalPlaces}곳</span>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
      </div>
    </section>` : ''}

    <button class="btn primary block" id="quick" style="padding:15px">
      📸 지금 사진 · 영상 올리기
    </button>

    ${b.notices.length ? `
    <section class="card">
      <h2>📢 공지</h2>
      ${b.notices.slice(0, 3).map((n) => `
        <div class="row"><div class="t">
          <b>${n.pinned ? '📌 ' : ''}${esc(n.title)}</b>
          <small style="white-space:pre-wrap">${esc(n.body)}</small>
          <small class="muted">${esc(n.author || '')} · ${relTime(n.created_at)}</small>
        </div></div>`).join('')}
    </section>` : ''}

    ${todayPlaces.length ? `
    <section class="card">
      <h2>🗓️ 오늘 일정 <span class="more">${esc(dayInfo?.title || '')}</span></h2>
      <div class="tl">
        ${todayPlaces.map((p) => {
          const pr = progressOf(p.slug);
          return `<div class="stop ${pr.myCount ? 'done' : ''} ${p.boost > 1 ? 'boost' : ''}" data-place="${p.slug}">
            <div class="time">${esc(p.time)}</div>
            <div class="body">
              <b>${p.emoji} ${esc(p.title)}</b>
              <small>${esc(p.area)}${pr.myCount ? ` · 내 사진 ${pr.myCount}장` : ''}</small>
            </div>
            <div class="chev">›</div>
          </div>`;
        }).join('')}
      </div>
    </section>` : `
    <section class="card">
      <h2>🗓️ 출발 전 확인</h2>
      <div class="tl">
        <div class="stop"><div class="time">12:00</div><div class="body">
          <b>🚍 문학경기장 집결</b><small>암벽등반장 뒤 대형주차장 · 셔틀버스 탑승</small></div></div>
        <div class="stop"><div class="time">13:00</div><div class="body">
          <b>✈️ 인천공항 1터미널</b><small>3층 제주항공 카운터 앞 · 기념품 수령</small></div></div>
        <div class="stop"><div class="time">15:00</div><div class="body">
          <b>🛂 게이트 집결</b><small>탑승권에 표시된 게이트 앞</small></div></div>
      </div>
    </section>`}

    <section class="card">
      <h2>⚠️ 꼭 기억해 주세요</h2>
      <div style="display:grid;gap:9px">
        ${b.alerts.filter((a) => a.level === 'danger').map((a) => `
          <div class="alert danger"><div class="ic">${a.icon}</div>
            <div><b>${esc(a.title)}</b><p>${esc(a.body)}</p></div></div>`).join('')}
      </div>
      <button class="btn ghost block sm" style="margin-top:10px" id="more-guide">전체 안내 보기 →</button>
    </section>

    ${feed.items.length ? `
    <section class="card">
      <h2>✨ 방금 올라온 사진 <span class="more" id="to-gallery">전체 보기 ›</span></h2>
      <div class="ggrid">
        ${feed.items.slice(0, 9).map((it) => `
          <div class="gitem" data-open="${it.id}">
            <img loading="lazy" src="/api/thumb/${it.id}" alt="">
            ${it.media_type === 'video' ? '<span class="vid">▶</span>' : ''}
            <span class="badge">${esc(it.uploader)}</span>
          </div>`).join('')}
      </div>
    </section>` : `
    <section class="card"><div class="empty">
      <div class="e">📷</div><b>아직 올라온 사진이 없어요</b>
      <p>첫 번째로 올리면 <b>선착순 보너스 +30점</b>!</p>
    </div></section>`}

    <section class="card">
      <h2>📞 비상 연락처</h2>
      ${b.contacts.filter((c) => c.urgent).map((c) => `
        <div class="row">
          <div class="em">📱</div>
          <div class="t"><b>${esc(c.name)}</b><small>${esc(c.role)}</small></div>
          <a class="btn sm ghost" href="tel:${esc(c.phone.replace(/-/g, ''))}">전화</a>
        </div>`).join('')}
    </section>`;

  host.querySelector('#quick').onclick = () => openUploader();
  host.querySelector('#more-guide').onclick = () => { location.hash = '#/guide'; };
  host.querySelector('#to-gallery')?.addEventListener('click', () => { location.hash = '#/gallery'; });
  host.querySelectorAll('[data-place]').forEach((n) => {
    n.onclick = () => { location.hash = `#/mission/${n.dataset.place}`; };
  });
  host.querySelectorAll('[data-open]').forEach((n) => {
    n.onclick = () => { location.hash = '#/gallery'; };
  });
}
