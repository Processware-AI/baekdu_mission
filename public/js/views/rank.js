import { api } from '../api.js';
import { S } from '../state.js';
import { esc, num, relTime } from '../util.js';

let tab = 'overall';

export default async function renderRank(host) {
  const data = await api.get('/api/rank');
  const sm = S.summary;
  const me = data.overall.find((r) => r.id === S.user.id);
  const medal = (n) => (n === 1 ? '🥇' : n === 2 ? '🥈' : n === 3 ? '🥉' : n);

  host.innerHTML = `
    ${me ? `
    <section class="hero" style="background:linear-gradient(150deg,#7a4b0d,#c98a17 60%,#e0aa48)">
      <div class="eyebrow">내 순위</div>
      <h2>${me.rank}위 · ${num(me.score)}점</h2>
      <div class="dates">${data.overall.length}명 중 · 업로드 ${me.uploads}장 · 방문지 ${me.places}곳</div>
    </section>` : ''}

    <div class="filters" id="r-tab">
      <button data-v="overall" class="${tab === 'overall' ? 'on' : ''}">🏆 개인전</button>
      <button data-v="group" class="${tab === 'group' ? 'on' : ''}">🚩 조별전</button>
      <button data-v="badge" class="${tab === 'badge' ? 'on' : ''}">🏅 배지</button>
      <button data-v="log" class="${tab === 'log' ? 'on' : ''}">📜 내 점수 내역</button>
    </div>

    <section class="card" id="r-body"></section>`;

  host.querySelectorAll('#r-tab button').forEach((b) => {
    b.onclick = () => { tab = b.dataset.v; renderRank(host); };
  });

  const body = host.querySelector('#r-body');

  if (tab === 'overall') {
    const list = data.overall.filter((r) => r.score > 0);
    body.innerHTML = list.length ? `
      <h2>🏆 개인 랭킹</h2>
      ${list.map((r) => `
        <div class="rank-row ${r.id === S.user.id ? 'me' : ''} top${r.rank}">
          <div class="n">${medal(r.rank)}</div>
          <div class="t"><b>${esc(r.name)}</b>
            <small>${r.grp ? `${r.grp}조` : ''} · ${esc(r.gi || '')} · ${r.uploads}장 · ${r.places}곳</small></div>
          <div class="p">${num(r.score)}</div>
        </div>`).join('')}` : emptyBox('아직 아무도 점수가 없어요', '첫 사진을 올리면 바로 1등입니다!');
  }

  if (tab === 'group') {
    const gm = Object.fromEntries(S.bundle.groups.map((g) => [g.id, g]));
    body.innerHTML = `
      <h2>🚩 조별 랭킹 <span class="more">평균 점수 기준</span></h2>
      ${data.groups.length ? data.groups.map((g, i) => `
        <div class="rank-row ${g.grp === S.user.group ? 'me' : ''}">
          <div class="n">${medal(i + 1)}</div>
          <div class="t"><b>${g.grp}조</b>
            <small>조장 ${esc(gm[g.grp]?.leader || '-')} · ${g.members}명 · ${g.uploads}장</small></div>
          <div class="p">${num(g.avg)}<small class="muted" style="display:block;font-size:10px;font-weight:600">총 ${num(g.score)}</small></div>
        </div>`).join('') : emptyBox('아직 조별 점수가 없어요', '')}
      <div class="alert info" style="margin-top:12px">
        <div class="ic">🤝</div><div><p>
          <b>2인·3인·4인 미션은 같이 찍은 사람도 점수를 받습니다.</b>
          조원끼리 서로 태그해 주면 조 점수가 빠르게 올라갑니다.</p></div>
      </div>`;
  }

  if (tab === 'badge') {
    body.innerHTML = `
      <h2>🏅 배지 (${(sm?.badges || []).filter((b) => b.earned).length}/${(sm?.badges || []).length})</h2>
      <div class="badges">
        ${(sm?.badges || []).map((b) => `
          <div class="badge-i ${b.earned ? 'on' : ''}">
            <div class="e">${b.emoji}</div><b>${esc(b.name)}</b><small>${esc(b.desc)}</small></div>`).join('')}
      </div>`;
  }

  if (tab === 'log') {
    const evs = sm?.recentEvents || [];
    const KIND = {
      upload: '📤 업로드', tagged: '🤝 사진 출연', conquer: '🏔️ 방문지 정복',
      first: '⚡ 선착순', day_clear: '📅 일차 완주', full_clear: '🌟 전 일정 완주', manual: '⚙️ 운영진 조정',
    };
    body.innerHTML = `
      <h2>📜 최근 점수 내역</h2>
      ${evs.length ? evs.map((e) => `
        <div class="row">
          <div class="t"><b>${KIND[e.kind] || e.kind}</b>
            <small>${esc(e.memo || '')} · ${relTime(e.created_at)}</small></div>
          <div class="p" style="font-weight:800;color:var(--accent)">+${e.points}</div>
        </div>`).join('') : emptyBox('아직 점수 내역이 없어요', '사진을 올리면 여기에 쌓입니다.')}
      <div class="alert info" style="margin-top:12px"><div class="ic">💯</div><div>
        <b>점수 규칙</b>
        <p>독사진 10 · 2인 25 · 3인 45 · 4인+ 70 · 영상 40<br>
        태그 1명당 +5 / 사진에 찍히면 +3<br>
        ⭐핵심 스팟은 모든 점수 ×2<br>
        방문지 정복 +100 · 일차 완주 +50 · 전 일정 완주 +200</p></div></div>`;
  }
}

function emptyBox(title, sub) {
  return `<div class="empty"><div class="e">🏁</div><b>${esc(title)}</b><p>${esc(sub)}</p></div>`;
}
