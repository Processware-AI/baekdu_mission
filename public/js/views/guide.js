import { S } from '../state.js';
import { esc } from '../util.js';

export default async function renderGuide(host) {
  const b = S.bundle;

  host.innerHTML = `
    <section class="card">
      <h2>⚠️ 주의사항</h2>
      <div style="display:grid;gap:9px">
        ${b.alerts.map((a) => `
          <div class="alert ${a.level}"><div class="ic">${a.icon}</div>
            <div><b>${esc(a.title)}</b><p>${esc(a.body)}</p>${figures(a)}</div></div>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>🎒 준비물 · 안내</h2>
      <div style="display:grid;gap:14px">
        ${b.prep.map((p) => `
          <div>
            <div style="font-weight:700;font-size:13.5px;margin-bottom:5px">${p.icon} ${esc(p.title)}</div>
            <ul class="list-plain">${p.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>
          </div>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>🚍 셔틀버스</h2>
      <div class="row"><div class="em">🛫</div><div class="t">
        <b>가는 날 · ${esc(b.shuttle.out.when)}</b>
        <small>${esc(b.shuttle.out.where)}<br>${esc(b.shuttle.out.detail)}<br>${esc(b.shuttle.out.car)}</small>
      </div></div>
      <div class="row"><div class="em">🛬</div><div class="t">
        <b>오는 날 · ${esc(b.shuttle.back.when)}</b>
        <small>${esc(b.shuttle.back.detail)}</small>
      </div></div>
      <div class="alert info" style="margin-top:10px"><div class="ic">🚶</div>
        <div><b>개별이동자</b><p>${esc(b.shuttle.individual)}</p></div></div>
    </section>

    <section class="card">
      <h2>💰 여행경비 · 공동경비</h2>
      <div class="kv">
        <dt>1인 여행경비</dt><dd>${esc(b.fees.perPerson)}</dd>
        ${b.fees.common.map((c) => `<dt>${esc(c.label)}</dt><dd>${esc(c.amount)}</dd>`).join('')}
        <dt>입금계좌</dt><dd>${esc(b.fees.account.bank)}<br>${esc(b.fees.account.number)}</dd>
        <dt>예금주</dt><dd>${esc(b.fees.account.holder)}</dd>
      </div>
      <div class="hint" style="margin-top:8px">${esc(b.fees.note)}</div>
      <div class="section-title" style="margin-top:14px">공동경비 사용 예정</div>
      <ul class="list-plain" style="margin-top:8px">${b.fees.usage.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
      <div class="section-title" style="margin-top:14px">여행경비 포함</div>
      <ul class="list-plain" style="margin-top:8px">${b.fees.included.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
      <div class="section-title" style="margin-top:14px">불포함</div>
      <ul class="list-plain" style="margin-top:8px">${b.fees.excluded.map((u) => `<li>${esc(u)}</li>`).join('')}</ul>
    </section>

    <section class="card">
      <h2>📞 연락처</h2>
      ${b.contacts.map((c) => `
        <div class="row">
          <div class="em">${c.local ? '🇨🇳' : '📱'}</div>
          <div class="t"><b>${esc(c.name)}</b>
            <small>${esc(c.role)}${c.note ? ` · ${esc(c.note)}` : ''}</small></div>
          <a class="btn sm ghost" href="tel:${esc(c.phone.replace(/[^0-9+]/g, ''))}">${esc(c.phone)}</a>
        </div>`).join('')}
      <div class="hint" style="margin-top:8px">현지 가이드 번호는 중국 번호입니다. 국내에서 걸 때는 +86을 앞에 붙이세요.</div>
    </section>

    <section class="card">
      <h2>🎁 기념품</h2>
      <p class="small" style="margin:0 0 8px">
        최종식 산악회장님께서 준비하신 <b>단체 모자</b>와 <b>기념 타올</b>을 참석자 전원에게 드립니다.
        인천공항 제주항공 카운터 앞에서 수령하세요.
      </p>
      <div class="figrow" style="margin-bottom:10px">
        <figure class="figure">
          <img loading="lazy" src="/img/gift-hat.jpg" alt="단체모자">
          <figcaption>🧢 단체 모자</figcaption>
        </figure>
        <figure class="figure">
          <img loading="lazy" src="/img/gift-hat-worn.jpg" alt="단체모자 착용 사례">
          <figcaption>👥 모자 착용 사례</figcaption>
        </figure>
      </div>
      <figure class="figure" style="margin-bottom:10px">
        <img loading="lazy" src="/img/gift-towel.jpg" alt="기념 타올 디자인">
        <figcaption>🧣 기념 타올 — From Baekdu to Halla</figcaption>
      </figure>
      <div class="alert info"><div class="ic">🧢</div><div>
        <b>여행 기간 동안 모자와 타올을 함께 착용해 주세요</b>
        <p>많은 인원 속에서 일행 확인이 쉽고, 백두산 단체사진도 훨씬 멋지게 남습니다.</p></div></div>
      <figure class="figure" style="margin-top:12px">
        <img loading="lazy" src="/img/banner.jpg" alt="백두산 여행 플랭카드">
        <figcaption>🎌 단체사진용 플랭카드 — 이 앞에서 찍은 컷이 쇼츠 오프닝이 됩니다</figcaption>
      </figure>
    </section>

    <section class="card">
      <h2>🙏 찬조해 주신 분들</h2>
      ${b.sponsors.map((s) => `
        <div class="row"><div class="t"><b>${esc(s.name)}</b><small>${esc(s.item)}</small></div></div>`).join('')}
      <p class="hint center" style="margin-top:10px">
        따뜻한 마음으로 찬조해 주신 분들께 진심으로 감사드립니다.<br>
        — 인천상공회의소 CEO아카데미 운영진 일동</p>
    </section>

    <section class="card">
      <h2>🏢 여행사</h2>
      ${b.trip.agencyImg ? `
        <figure class="figure" style="margin-bottom:12px">
          <img loading="lazy" src="/img/${b.trip.agencyImg}" alt="힐링투어 남동 명함">
          <figcaption>📇 힐링투어 남동 · ${esc(b.trip.agencyManager || '')}</figcaption>
        </figure>` : ''}
      <div class="kv">
        <dt>여행사</dt><dd>${esc(b.trip.agency)}${
          b.trip.agencyBrand ? `<br><span class="muted small">${esc(b.trip.agencyBrand)}</span>` : ''}</dd>
        ${b.trip.agencyManager ? `<dt>담당</dt><dd>${esc(b.trip.agencyManager)}</dd>` : ''}
        <dt>대표전화</dt><dd><a href="tel:${esc(b.trip.agencyTel.replace(/-/g, ''))}">${esc(b.trip.agencyTel)}</a></dd>
        ${b.trip.agencyMobile ? `<dt>휴대전화</dt><dd><a href="tel:${esc(b.trip.agencyMobile.replace(/-/g, ''))}">${esc(b.trip.agencyMobile)}</a></dd>` : ''}
        ${b.trip.agencyFax ? `<dt>팩스</dt><dd>${esc(b.trip.agencyFax)}</dd>` : ''}
        ${b.trip.agencyEmail ? `<dt>이메일</dt><dd><a href="mailto:${esc(b.trip.agencyEmail)}">${esc(b.trip.agencyEmail)}</a></dd>` : ''}
        <dt>주소</dt><dd style="text-align:right">${esc(b.trip.agencyAddr)}</dd>
        <dt>피켓명</dt><dd>${esc(b.trip.picket)}</dd>
      </div>
      ${(b.trip.agencyServices || []).length ? `
        <div class="section-title" style="margin-top:14px">취급 업무</div>
        <div style="display:grid;gap:9px;margin-top:8px">
          ${b.trip.agencyServices.map((v) => `
            <div class="row"><div class="em">${v.icon}</div><div class="t">
              <b>${esc(v.title)}</b><small>${esc(v.desc)}</small></div></div>`).join('')}
        </div>` : ''}
    </section>`;
}

/**
 * 주의사항 알림 안에 들어가는 사진.
 * 안내장·여권·타올처럼 비율이 제각각이라 두 장씩 나란히 놓으면 한쪽이 뭉개진다.
 * 가로 전체를 쓰도록 세로로 쌓고, 잘라내지 않는다.
 */
function figures(a) {
  const list = a.figures || [];
  if (!list.length) return '';
  return `<div class="figstack" style="margin-top:9px">
    ${list.map((f) => `<figure class="figure">
      <img loading="lazy" src="/img/${f.src}" alt="${esc(f.cap)}">
      <figcaption>${esc(f.cap)}</figcaption>
    </figure>`).join('')}
  </div>`;
}
