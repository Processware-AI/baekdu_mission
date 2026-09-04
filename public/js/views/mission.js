import { S, progressOf, tripDay } from '../state.js';
import { esc, num } from '../util.js';
import { openUploader } from './uploader.js';
import { showPlace } from './schedule.js';

export default async function renderMission(host, args) {
  if (args?.[0] && S.placeBySlug.has(args[0])) {
    // 딥링크: #/mission/{slug} → 방문지 시트 먼저 띄우고 목록 표시
    setTimeout(() => showPlace(args[0]), 60);
    location.replace('#/mission');
  }

  const b = S.bundle;
  const sm = S.summary;
  const today = tripDay();
  const dayList = [...b.days.map((d) => d.day), 0];

  const allPlaces = b.places.filter((p) => p.day > 0);
  const conquered = (S.progress?.places || []).filter((p) => p.conquered).length;

  host.innerHTML = `
    <section class="card">
      <h2>🎯 사진 미션</h2>
      <p class="small muted" style="margin:0 0 12px">
        방문지마다 <b>독사진 · 2인 · 3인 · 4인 이상</b> 네 가지를 채우면 <b>정복 +100점</b>!<br>
        미션 한 칸에는 <b>한 장만</b> 남습니다. 가장 잘 나온 것으로 언제든 교체하세요.<br>
        여행이 끝나면 이 분류 그대로 추억 쇼츠를 만듭니다.
      </p>
      <div class="scorebar">
        <div><b>${num(sm?.score || 0)}</b><span>내 점수</span></div>
        <div><b>${conquered}</b><span>정복한 방문지</span></div>
        <div><b>${sm?.stats?.uploads || 0}</b><span>올린 자료</span></div>
      </div>
    </section>

    <section class="card tight">
      <h2 style="margin-bottom:8px">💯 점수 규칙</h2>
      <div class="chips">
        ${b.missions.map((m) => `<span class="chip">${m.emoji} ${esc(m.short)} +${m.points}</span>`).join('')}
        <span class="chip teal">태그 1명당 +5</span>
        <span class="chip teal">사진에 찍히면 +3</span>
        <span class="chip gold">⭐핵심 스팟 ×2</span>
        <span class="chip accent">선착순 1·2·3등 +30/20/10</span>
        <span class="chip ok">방문지 정복 +100</span>
        <span class="chip ok">일차 완주 +50</span>
        <span class="chip ok">전 일정 완주 +200</span>
      </div>
    </section>

    <button class="btn primary block" id="go-up" style="padding:15px">📸 사진 · 영상 올리기</button>

    ${dayList.map((d) => {
      const places = b.places.filter((p) => p.day === d);
      if (!places.length) return '';
      const meta = b.days.find((x) => x.day === d);
      return `
      <section style="display:grid;gap:9px">
        <div class="dayhead">
          <div class="n" style="${d === today ? 'background:var(--teal)' : d === 0 ? 'background:var(--muted)' : ''}">${d || '∞'}</div>
          <div><b>${meta ? esc(meta.title) : '상시'}</b>
            <small>${meta ? `${meta.date.slice(5).replace('-', '월 ')}일 (${meta.dow})` : '언제든지'}</small></div>
        </div>
        ${places.map((p) => {
          const pr = progressOf(p.slug);
          return `
          <div class="pcard" data-p="${p.slug}">
            ${p.img
              ? `<img class="thumb" loading="lazy" src="/img/${p.img}" alt="">`
              : `<div class="e">${p.emoji}</div>`}
            <div class="t">
              <b>${esc(p.title)}${p.boost > 1 ? ' ⭐' : ''}</b>
              <small>${esc(p.time)} · ${esc(p.area)} · 전체 ${pr.all.count}장</small>
            </div>
            <div class="st">
              ${pr.conquered ? '<span class="chip ok">정복</span>'
                : `<span class="chip">${pr.missionDone}/4</span>`}
              <div class="dots">
                ${['solo', 'duo', 'trio', 'quad'].map((k) =>
                  `<i class="${pr.mine?.[k] ? 'on' : ''}"></i>`).join('')}
              </div>
            </div>
          </div>`;
        }).join('')}
      </section>`;
    }).join('')}

    <section class="card">
      <h2>🏅 내 배지</h2>
      <div class="badges">
        ${(sm?.badges || []).map((bd) => `
          <div class="badge-i ${bd.earned ? 'on' : ''}">
            <div class="e">${bd.emoji}</div><b>${esc(bd.name)}</b>
            <small>${esc(bd.desc)}</small></div>`).join('')}
      </div>
    </section>`;

  host.querySelector('#go-up').onclick = () => openUploader();
  host.querySelectorAll('[data-p]').forEach((n) => {
    n.onclick = () => showPlace(n.dataset.p);
  });
}
