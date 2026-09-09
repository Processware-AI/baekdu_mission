import { S } from '../state.js';
import { esc } from '../util.js';

/**
 * 사용 가이드 — 앱을 처음 쓰는 분을 위한 설명서와 만든 사람 소개.
 *
 * 참가자 평균 연령을 감안해, 화면 이름과 버튼 이름을 그대로 써서
 * "어디를 눌러야 하는지"가 바로 보이도록 적는다.
 */
export default async function renderHelp(host) {
  const b = S.bundle;
  const missions = b.missions || [];
  const free = b.freeMissions || [];
  const limitMB = Math.round((b.maxUploadBytes || 95 * 1024 * 1024) / 1048576);

  host.innerHTML = `
    <section class="card">
      <h2>📖 이 앱으로 하는 일</h2>
      <p class="small" style="margin:0 0 12px">
        여행 일정을 확인하고, 방문지마다 사진과 영상을 올려 점수를 모읍니다.
        여행이 끝나면 올라온 자료를 그대로 모아 <b>추억 쇼츠</b>를 만듭니다.
        많이 올릴수록 좋은 영상이 나옵니다.
      </p>
      <div class="row"><div class="em">🏠</div><div class="t">
        <b>홈</b><small>오늘 일정, 내 점수, 방금 올라온 사진</small></div></div>
      <div class="row"><div class="em">🗓️</div><div class="t">
        <b>일정</b><small>4일 전체 일정. 방문지를 누르면 그 자리에서 사진을 올릴 수 있습니다</small></div></div>
      <div class="row"><div class="em">📷</div><div class="t">
        <b>미션</b><small>방문지별로 무엇을 찍었는지 한눈에. 가운데 큰 버튼이 업로드입니다</small></div></div>
      <div class="row"><div class="em">🖼️</div><div class="t">
        <b>갤러리</b><small>모두가 올린 사진. 내가 올린 것과 내가 나온 것만 골라 볼 수 있습니다</small></div></div>
      <div class="row"><div class="em">🏆</div><div class="t">
        <b>랭킹</b><small>개인·조별 순위와 배지</small></div></div>
    </section>

    <section class="card">
      <h2>📸 사진 올리는 법</h2>
      <ol class="list-num">
        <li>가운데 <b>📷 미션</b> 버튼을 누릅니다</li>
        <li><b>어디에서 찍었나요?</b> — 방문지를 고릅니다</li>
        <li><b>어떤 미션인가요?</b> — 아래 표에서 하나를 고릅니다</li>
        <li><b>📷 촬영</b> 또는 <b>🖼️ 앨범에서</b> 로 사진을 고릅니다</li>
        <li>2인 이상 미션이면 <b>함께 찍힌 사람</b>을 골라주세요</li>
        <li><b>올리기</b> 를 누르면 끝입니다</li>
      </ol>
      <div class="alert info" style="margin-top:12px"><div class="ic">🔄</div><div>
        <b>미션 한 칸에는 한 장만 남습니다</b>
        <p>더 잘 나온 사진이 생기면 같은 미션에 다시 올리세요. 자료만 바뀌고 점수는 그대로입니다.
        <b>지우고 다시 올리면 보너스까지 사라지니</b> 교체가 낫습니다.</p></div></div>
    </section>

    <section class="card">
      <h2>🎯 미션과 점수</h2>
      <p class="small muted" style="margin:0 0 10px">
        방문지마다 아래 ${missions.length}가지를 모두 채우면 <b>정복 +100점</b>.
        ⭐ 핵심 스팟은 점수가 두 배입니다.
      </p>
      <div class="chips">
        ${missions.map((m) => `<span class="chip">${m.emoji} ${esc(m.short)} +${m.points}</span>`).join('')}
      </div>
      <div class="section-title" style="margin-top:14px">보너스</div>
      <div class="chips" style="margin-top:8px">
        <span class="chip teal">함께 찍힌 사람 태그 1명당 +5</span>
        <span class="chip teal">사진에 찍히면 +3</span>
        <span class="chip accent">방문지 선착순 1·2·3등 +30/20/10</span>
        <span class="chip ok">일차 완주 +50</span>
        <span class="chip ok">전 일정 완주 +200</span>
      </div>
      ${free.length ? `
      <div class="section-title" style="margin-top:14px">✨ 자유 / 기타</div>
      <p class="small muted" style="margin:6px 0 0">
        버스 안, 호텔, 길거리처럼 어느 방문지에도 안 맞는 순간들입니다.
        인원수 대신 <b>주제</b>를 고르고 <b>코멘트</b>를 한마디 남겨주세요.
        그 한마디가 쇼츠의 자막이 됩니다.
      </p>` : ''}
    </section>

    <section class="card">
      <h2>💡 알아두면 좋은 것</h2>
      <div style="display:grid;gap:9px">
        <div class="alert info"><div class="ic">📡</div><div>
          <b>신호가 약해도 괜찮습니다</b>
          <p>올리기를 누르면 대기열에 저장되고, 연결되면 자동으로 올라갑니다.
          화면 아래에 <b>대기 N개</b> 가 보이면 기다리는 중입니다.</p></div></div>
        <div class="alert info"><div class="ic">🎥</div><div>
          <b>영상은 ${limitMB}MB까지</b>
          <p>아이폰은 <b>설정 → 카메라 → 비디오 녹화</b>를 1080p로 두시면 넉넉합니다.
          10~60초가 편집하기 가장 좋습니다.</p></div></div>
        <div class="alert info"><div class="ic">📱</div><div>
          <b>홈 화면에 추가해 두세요</b>
          <p>iOS는 공유 → 홈 화면에 추가, 안드로이드는 메뉴 → 홈 화면에 추가.
          앱처럼 바로 열립니다.</p></div></div>
        <div class="alert warn"><div class="ic">🔑</div><div>
          <b>비밀번호를 바꿔주세요</b>
          <p>처음에는 휴대폰 번호가 비밀번호입니다. <b>내 정보 → 비밀번호 변경</b>에서
          바꾸지 않으면 다른 사람이 내 이름으로 올릴 수 있습니다.</p></div></div>
      </div>
    </section>

    <section class="card">
      <h2>👨‍💻 만든 이야기</h2>
      <p class="small" style="margin:0 0 10px">
        여행 사진은 늘 단톡방에 흩어집니다. 그때는 다들 열심히 올리는데,
        며칠만 지나면 어디에 뭐가 있는지 찾을 수가 없습니다.
        백두산은 한 번 가기도 쉽지 않은 곳인데, 이번 여행만큼은 제대로 남기고 싶었습니다.
      </p>
      <p class="small" style="margin:0 0 10px">
        그래서 사진이 <b>방문지별로 저절로 모이도록</b> 만들었습니다.
        미션과 점수는 재미로 붙인 것 같지만 사실은 분류 장치입니다 —
        독사진 · 2인 · 단체 · 풍경으로 나뉘어 쌓이면 여행이 끝난 뒤 그대로 편집에 쓸 수 있습니다.
        한 칸에 한 장만 남기는 것도, 나중에 수백 장 중에서 고르는 부담을 없애려는 것입니다.
      </p>
      <p class="small" style="margin:0 0 14px">
        잘 찍은 사진이 아니어도 괜찮습니다. 버스에서 졸던 얼굴, 밥 먹다 웃음 터진 순간 —
        그런 사진이 오래 남습니다. 편하게 많이 올려주세요.
        그 자료로 우리 여행의 쇼츠를 만들겠습니다.
      </p>
      <div class="devcard" style="margin-bottom:12px">
        <img loading="lazy" src="/img/dev-oh.jpg" alt="만든 사람 오동석">
        <div class="t">
          <b>오동석</b>
          <small>51기 · 3조 인솔자</small>
          <p>일정표 들고 뛰어다니는 게 일입니다.<br>천지에서 만나요.</p>
        </div>
      </div>
      <div class="row">
        <div class="em">📱</div>
        <div class="t"><b>전화</b><small>앱이 안 되거나 궁금한 점이 있으면 연락 주세요</small></div>
        <a class="btn sm ghost" href="tel:01087860488">010-8786-0488</a>
      </div>
      <div class="row">
        <div class="em">✉️</div>
        <div class="t"><b>이메일</b><small>dsoh@processware.co.kr</small></div>
        <a class="btn sm ghost" href="mailto:dsoh@processware.co.kr">메일 쓰기</a>
      </div>
      <div class="section-title" style="margin-top:12px">쓰인 것</div>
      <ul class="list-plain" style="margin-top:8px">
        <li>Node.js + Express · SQLite · 순수 자바스크립트 (빌드 도구 없음)</li>
        <li>사진·영상 썸네일은 ffmpeg, 외부 접속은 Cloudflare Tunnel</li>
        <li>맥 미니 한 대에서 돌아갑니다. 자료는 모두 그 안에만 있습니다</li>
      </ul>
    </section>

    <p class="center muted small">
      ICCA 산악회 백두산 여행 · 2026.09.10~13
    </p>`;
}
