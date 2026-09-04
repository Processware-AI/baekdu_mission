/**
 * 실제 브라우저(모바일 뷰포트)로 화면을 열어보는 점검 스크립트.
 *   node server/tools/ui-check.js
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_DIR = path.join(ROOT, 'data-uitest');
const SHOTS = path.join(ROOT, '.shots');
const PORT = 3998;
const BASE = `http://127.0.0.1:${PORT}`;
const EXE = process.env.CHROME_EXE
  || path.join(process.env.LOCALAPPDATA || '', 'ms-playwright/chromium-1223/chrome-win64/chrome.exe');

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => {
  if (c) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}${extra ? ` — ${extra}` : ''}`); }
};

async function waitUp() {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`${BASE}/api/trip`)).ok) return; } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('서버 시작 실패');
}

async function main() {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.rmSync(SHOTS, { recursive: true, force: true });
  fs.mkdirSync(SHOTS, { recursive: true });

  const srv = spawn(process.execPath, [path.join(ROOT, 'server/index.js')], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DATA_DIR: 'data-uitest', ADMIN_PASSWORD: 'testpw123' },
    stdio: 'ignore',
  });

  let browser;
  try {
    await waitUp();
    browser = await chromium.launch({ executablePath: EXE });
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },        // iPhone 14 크기
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: 'ko-KR',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    });
    const page = await ctx.newPage();

    const errors = [];
    const badResponses = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`PAGEERROR: ${e.message}`));
    page.on('response', (r) => {
      if (r.status() >= 400) badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`);
    });

    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${n}.png`), fullPage: true });

    console.log('\n▶ 로그인 화면');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    ok(await page.locator('.login').isVisible(), '로그인 화면 표시');
    const bannerOk = await page.evaluate(() => {
      const i = document.querySelector('.login-banner');
      return !!i && i.complete && i.naturalWidth > 0;
    });
    ok(bannerOk, '로그인 화면에 플랭카드 이미지 표시');
    await shot('01-login');

    await page.fill('#ln', '박화서');
    await page.fill('#lp', '01087503934');
    await page.click('#lbtn');
    await page.waitForSelector('.tabbar', { timeout: 15000 });

    console.log('\n▶ 홈');
    ok(await page.locator('.hero').isVisible(), '홈 히어로 표시');
    const sub = await page.locator('#vsub').textContent();
    ok(sub.includes('박화서') && sub.includes('1조'), `헤더에 이름·조 표시 (${sub.trim()})`);
    ok((await page.locator('.alert.danger').count()) >= 2, '태극기·보조배터리 경고 표시');
    await shot('02-home');

    console.log('\n▶ 일정');
    await page.click('[data-tab="schedule"]');
    // 홈에도 .tl .stop 이 있으므로 "개수"가 채워질 때까지 기다린다
    await page.waitForFunction(() => document.querySelectorAll('.tl .stop').length >= 20,
      null, { timeout: 10000 });
    ok((await page.locator('.tl .stop').count()) === 20, '4일 전체 일정 20개 구간 표시');
    await shot('03-schedule');

    await page.locator('.tl .stop').filter({ hasText: '천지' }).first().click();
    await page.waitForSelector('.sheet');
    ok(await page.locator('.sheet').isVisible(), '방문지 상세 시트 열림');
    ok((await page.locator('.sheet').textContent()).includes('핵심 스팟'), '핵심 스팟 표시');
    await shot('04-place-sheet');
    await page.click('.sheet [data-x]');
    await page.waitForSelector('.sheet', { state: 'detached' });

    console.log('\n▶ 미션 & 업로드');
    await page.click('[data-tab="mission"]');
    await page.waitForSelector('.pcard');
    ok((await page.locator('.pcard').count()) === 21, '방문지 21곳 카드');
    await shot('05-mission');

    await page.click('#go-up');
    await page.waitForSelector('.sheet');
    ok(await page.locator('#u-place').isVisible(), '업로드 시트 — 방문지 선택');
    ok((await page.locator('#u-missions .mtile').count()) === 5, '미션 타일 5개 (참가자)');

    // 실제 파일 업로드
    await page.selectOption('#u-place', 'seopa-cheonji');
    await page.locator('[data-m="duo"]').click();
    ok(await page.locator('#u-people').isVisible(), '2인 미션 선택 시 사람 선택 UI 등장');

    const jpg = path.join(TEST_DIR, 'sample.jpg');
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.writeFileSync(jpg, Buffer.from(
      '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a' +
      'HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA' +
      'AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64'));
    await page.setInputFiles('#u-lib', jpg);
    await page.waitForTimeout(900);
    ok(await page.locator('#u-preview img').isVisible(), '선택한 사진 미리보기');

    const btnBefore = await page.locator('#up-go').textContent();
    ok(btnBefore.includes('선택'), `인원 미달 시 버튼 안내 (${btnBefore.trim()})`);

    await page.locator('#u-people .person').first().click();
    await page.waitForTimeout(300);
    const btnAfter = await page.locator('#up-go').textContent();
    ok(/\+\d+점/.test(btnAfter), `예상 점수 표시 (${btnAfter.trim()})`);
    await shot('06-uploader');

    await page.click('#up-go');
    await page.waitForFunction(
      () => [...document.querySelectorAll('.toast')].some((t) => t.textContent.includes('업로드 완료')),
      null, { timeout: 20000 },
    ).then(() => ok(true, '업로드 성공 토스트'))
      .catch(async () => ok(false, '업로드 성공 토스트',
        (await page.locator('.toast').allTextContents()).join(' | ')));
    await page.waitForTimeout(1200);
    await shot('07-after-upload');

    console.log('\n▶ 갤러리');
    await page.click('[data-tab="gallery"]');
    await page.waitForSelector('.gitem', { timeout: 10000 });
    ok((await page.locator('.gitem').count()) >= 1, '갤러리에 업로드된 사진 표시');
    await shot('08-gallery');

    await page.locator('.gitem').first().click();
    await page.waitForSelector('.lb');
    const lbText = await page.locator('.lb .info').textContent();
    ok(lbText.includes('박화서'), '라이트박스에 업로더 표시');
    ok(lbText.includes('함께'), '라이트박스에 함께 찍힌 사람 표시');
    await shot('09-lightbox');
    await page.click('.lb [data-x]');

    console.log('\n▶ 랭킹');
    await page.click('[data-tab="rank"]');
    await page.waitForSelector('.rank-row', { timeout: 10000 });
    ok((await page.locator('.rank-row.me').count()) === 1, '내 순위 강조 표시');
    await shot('10-rank');
    await page.click('[data-v="badge"]');
    await page.waitForSelector('.badge-i');
    ok((await page.locator('.badge-i.on').count()) >= 1, '획득 배지 표시');
    await shot('11-badges');

    console.log('\n▶ 안내 / 내 정보');
    await page.click('#btn-guide');
    await page.waitForSelector('.alert.danger');
    const guide = await page.locator('#view').textContent();
    ok(guide.includes('태극기') && guide.includes('보조배터리'), '주의사항 표시');
    ok(guide.includes('IBK기업은행'), '공동경비 계좌 표시');
    ok(guide.includes('김창국'), '현지 가이드 연락처 표시');
    await shot('12-guide');

    await page.click('#btn-me');
    await page.waitForSelector('#m-pw');
    const me = await page.locator('#view').textContent();
    ok(me.includes('1조') && me.includes('1호차'), '내 조·호차 표시');
    ok(me.includes('3일차'), '3일차 차량 변경 안내');
    await shot('13-me');

    console.log('\n▶ 운영진 화면');
    await page.click('#m-out');
    await page.waitForSelector('.sheet [data-yes]');
    await page.click('.sheet [data-yes]');
    await page.waitForSelector('.login', { timeout: 15000 });
    await page.fill('#ln', 'admin');
    await page.fill('#lp', 'testpw123');
    await page.click('#lbtn');
    await page.waitForSelector('.tabbar');
    await page.goto(`${BASE}/#/admin`);
    await page.waitForSelector('#a-tab', { timeout: 10000 });
    await page.waitForSelector('.scorebar');
    const admin = await page.locator('#view').textContent();
    ok(admin.includes('총 업로드'), '운영진 현황 표시');
    ok(admin.includes('아직 안 올린 분'), '미참여자 목록 표시');
    await shot('14-admin');

    await page.click('[data-v="export"]');
    await page.waitForSelector('#x-zip');
    ok(await page.locator('#x-zip').isVisible(), '내보내기 화면');
    await shot('15-export');

    console.log('\n▶ 다크 모드');
    const dark = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      colorScheme: 'dark', locale: 'ko-KR',
    });
    const dp = await dark.newPage();
    await dp.goto(BASE, { waitUntil: 'networkidle' });
    await dp.fill('#ln', '손신기');
    await dp.fill('#lp', '01037320154');
    await dp.click('#lbtn');
    await dp.waitForSelector('.hero');
    const bg = await dp.evaluate(() => getComputedStyle(document.body).backgroundColor);
    ok(bg === 'rgb(14, 17, 23)', `다크 모드 배경 적용 (${bg})`);
    await dp.screenshot({ path: path.join(SHOTS, '16-dark.png'), fullPage: true });
    await dark.close();

    console.log('\n▶ 사진');
    await page.goto(`${BASE}/#/home`);
    await page.waitForSelector('.hero', { timeout: 10000 });
    const heroBg = await page.evaluate(() => {
      const h = document.querySelector('.hero.photo');
      return h ? getComputedStyle(h).backgroundImage : '';
    });
    ok(heroBg.includes('hero-cheonji'), '홈 히어로에 천지 사진 적용', heroBg.slice(0, 60));

    for (const [label, hash, min] of [['일정', '#/schedule', 8], ['미션', '#/mission', 8], ['안내', '#/guide', 5]]) {
      await page.goto(`${BASE}/${hash}`);
      await page.waitForTimeout(600);
      // 화면 밖 lazy 이미지까지 모두 불러오도록 끝까지 스크롤
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 400) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(1000);
      const r = await page.evaluate(() => {
        const imgs = [...document.querySelectorAll('img')].filter((i) => i.src.includes('/img/'));
        return {
          total: imgs.length,
          broken: imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute('src')),
        };
      });
      ok(r.total >= min && r.broken.length === 0,
        `${label} 화면 사진 ${r.total}장 모두 로드`, r.broken.join(', '));
    }

    console.log('\n▶ 콘솔 오류');
    const jsErrors = errors.filter((e) => !/Failed to load resource/.test(e));
    ok(jsErrors.length === 0, '자바스크립트 오류 없음', jsErrors.slice(0, 4).join(' | '));
    ok(badResponses.length === 0, '4xx/5xx 응답 없음', badResponses.slice(0, 6).join(' | '));

    await ctx.close();
  } catch (e) {
    fail++;
    console.log(`\n💥 ${e.message}\n${e.stack}`);
  } finally {
    await browser?.close();
    srv.kill();
    await new Promise((r) => setTimeout(r, 600));
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }

  console.log(`\n${'─'.repeat(45)}`);
  console.log(`  통과 ${pass} / 실패 ${fail}   (스크린샷: .shots/)`);
  console.log(`${'─'.repeat(45)}\n`);
  process.exit(fail ? 1 : 0);
}

main();
