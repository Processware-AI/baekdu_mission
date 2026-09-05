/**
 * 통합 점검 스크립트.
 *   npm run smoke
 * 별도의 테스트용 DATA_DIR(data-test)에서 서버를 띄우고 로그인·업로드·점수·
 * 내보내기까지 실제 HTTP로 확인한 뒤, 테스트 데이터를 지웁니다.
 */
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
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: 'data-test', ADMIN_PASSWORD: 'testpw123' },
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

    console.log('\n▶ 사진·영상 초기화');
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

main();
