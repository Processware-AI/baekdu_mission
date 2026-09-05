import express from 'express';
import session from 'express-session';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PORT, HOST, SESSION_SECRET, PUBLIC_DIR, ADMIN_ID } from './config.js';
import { SqliteStore } from './lib/session-store.js';
import { loadUser } from './middleware/auth.js';
import { seed } from './seed.js';

import authRoutes from './routes/auth.js';
import infoRoutes from './routes/info.js';
import uploadRoutes from './routes/uploads.js';
import galleryRoutes from './routes/gallery.js';
import adminRoutes from './routes/admin.js';

const summary = seed();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(session({
  name: 'baekdu.sid',
  secret: SESSION_SECRET,
  store: new SqliteStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1',
    maxAge: 1000 * 60 * 60 * 24 * 60,
  },
}));

app.use(loadUser);

app.use('/api/auth', authRoutes);
app.use('/api', infoRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api', galleryRoutes);
app.use('/api/admin', adminRoutes);

/**
 * 정적 파일 캐시 정책
 *  - 사진(/img)  : 파일이 바뀌지 않으므로 길게 캐시 (현지 느린 회선에서 재다운로드 방지)
 *  - 그 외(HTML·CSS·JS) : no-cache — 매번 서버에 확인하고 안 바뀌었으면 304.
 *    앱을 고쳤을 때 참가자 휴대폰에 바로 반영되도록 하기 위함.
 */
app.get(['/', '/index.html'], sendIndex);

app.use(express.static(PUBLIC_DIR, {
  index: false,
  etag: true,
  lastModified: true,
  setHeaders(res, filePath) {
    const isImage = /[\\/]img[\\/]/.test(filePath);
    res.setHeader('Cache-Control', isImage ? 'public, max-age=604800' : 'no-cache');
  },
}));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  sendIndex(req, res);
});

/**
 * index.html 을 내보내면서 og: 태그의 __ORIGIN__ 을 실제 접속 주소로 바꾼다.
 * 미리보기 이미지 주소는 상대경로면 카톡이 못 읽으므로 절대주소여야 하는데,
 * 이 앱은 와이파이 IP·터널 주소가 그때그때 달라져서 미리 박아둘 수가 없다.
 * (터널 뒤에서도 맞게 나오도록 app.set('trust proxy') 로 원래 프로토콜을 본다.)
 */
function sendIndex(req, res) {
  const origin = `${req.protocol}://${req.get('host')}`;
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  res.setHeader('Cache-Control', 'no-cache');
  res.type('html').send(html.replaceAll('__ORIGIN__', origin));
}

app.use((req, res) => res.status(404).json({ error: '없는 경로입니다.' }));

/**
 * 업로드 도중 연결이 끊기면 multipart 본문이 잘린 채 도착해서
 * busboy 가 'Unexpected end of form' 또는 'Request aborted' 를 낸다.
 * 서버 잘못이 아니라 참가자 쪽 신호 문제이므로,
 *  - 스택을 쏟지 않고 한 줄만 남기고
 *  - 408 로 돌려줘서 앱이 "연결이 불안정합니다"로 안내하고 다시 시도하게 한다.
 * (500 으로 주면 앱이 서버 잘못이라고 알리게 된다.)
 */
function isTruncatedUpload(err) {
  return err?.message === 'Unexpected end of form'
    || err?.message === 'Request aborted'
    || err?.code === 'ECONNRESET'
    || err?.code === 'ECONNABORTED';
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '파일이 너무 큽니다. 영상은 짧게 잘라서 올려주세요.' });
  }
  if (isTruncatedUpload(err)) {
    // 어디까지 오다 끊겼는지 남긴다. 거의 다 와서 끊기는지, 시작하자마자
    // 끊기는지에 따라 원인이 다르다. (bytesRead 는 같은 연결로 앞서 오간
    // 요청까지 포함할 수 있어 정확한 값이 아니라 어림값이다.)
    const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;
    const want = Number(req.headers['content-length'] || 0);
    const got = req.socket?.bytesRead ?? 0;
    const when = new Date().toLocaleTimeString('ko-KR');
    const ua = String(req.headers['user-agent'] || '');
    const device = /iPhone|iPad/.test(ua) ? '아이폰/아이패드'
      : /Android/.test(ua) ? '안드로이드'
        : /Macintosh/.test(ua) ? '맥' : '기타';
    console.warn(`  ⚠ [${when}] 업로드가 중간에 끊겼습니다 (${req.user?.name || '로그인 전'})`
      + ` — 받은 양 약 ${mb(got)} / 보내려던 양 ${mb(want)}`
      + (want && got ? ` (${Math.min(100, Math.round((got / want) * 100))}%)` : '')
      + ' — 앱이 자동으로 다시 시도합니다.');
    console.warn(`      기기=${device}`
      + ` 화면파일=${req.headers['x-app-build'] || '옛 버전(표식 없음)'}`
      + ` content-length=${req.headers['content-length'] ?? '없음'}`
      + ` transfer-encoding=${req.headers['transfer-encoding'] ?? '없음'}`
      + ` content-type=${String(req.headers['content-type'] || '').slice(0, 50)}`);
    if (res.headersSent) return;
    return res.status(408).json({ error: '전송이 중간에 끊겼습니다. 다시 시도해 주세요.' });
  }
  console.error('[error]', err);
  res.status(500).json({ error: '서버 오류가 발생했습니다.' });
});

function localIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

function openBrowser() {
  if (process.env.OPEN_BROWSER !== '1') return;
  import('node:child_process').then(({ exec }) => {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  });
}

/** 이미 같은 포트에서 이 앱이 돌고 있는지 확인 */
async function isOurAppRunning() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/trip`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return typeof data?.title === 'string' && data.title.includes('백두산');
  } catch {
    return false;
  }
}

const server = app.listen(PORT, HOST);

server.on('listening', () => {
  console.log('');
  console.log('  🏔️  ICCA 산악회 백두산 여행 앱');
  console.log('  ─────────────────────────────────────────');
  console.log(`  방문지 ${summary.places}곳 · 참가자 ${summary.created + summary.updated}명 · 관리자 ID: ${ADMIN_ID}`);
  console.log('');
  console.log(`  이 PC        : http://localhost:${PORT}`);
  for (const ip of localIPs()) {
    console.log(`  같은 와이파이 : http://${ip}:${PORT}`);
  }
  console.log('');
  console.log('  참가자 로그인: 이름 + 휴대폰 번호(숫자만)');
  console.log('  종료: 이 창을 닫거나 Ctrl+C');
  console.log('');
  openBrowser();
});

server.on('error', async (err) => {
  if (err.code !== 'EADDRINUSE') {
    console.error('');
    console.error(`  ❌ 서버를 시작할 수 없습니다: ${err.message}`);
    console.error('');
    process.exit(1);
  }

  console.log('');
  if (await isOurAppRunning()) {
    // 이미 켜져 있는 것뿐이니 안내만 하고 브라우저를 열어준다
    console.log('  ✅ 백두산 여행 앱이 이미 실행 중입니다.');
    console.log('');
    console.log(`  이 PC        : http://localhost:${PORT}`);
    for (const ip of localIPs()) console.log(`  같은 와이파이 : http://${ip}:${PORT}`);
    console.log('');
    console.log('  창을 두 개 띄울 필요는 없습니다. 이 창은 닫으셔도 됩니다.');
    console.log('  (앱을 완전히 끄려면 먼저 켜져 있던 검은 창을 닫으세요.)');
    console.log('');
    openBrowser();
    process.exit(0);
  }

  console.error(`  ❌ ${PORT}번 포트를 다른 프로그램이 쓰고 있습니다.`);
  console.error('');
  console.error('  해결 방법 (둘 중 하나)');
  console.error('');
  console.error('  1) 이 앱이 이미 떠 있는 검은 창이 있는지 확인하고 닫은 뒤 다시 실행');
  console.error('');
  if (process.platform === 'win32') {
    console.error('  2) 그래도 안 되면 아래를 PowerShell 에 붙여넣어 정리');
    console.error(`     Get-NetTCPConnection -LocalPort ${PORT} -State Listen |`);
    console.error('       Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }');
  } else {
    console.error('  2) 그래도 안 되면 아래를 터미널에 붙여넣어 정리');
    console.error(`     lsof -ti tcp:${PORT} | xargs kill -9`);
  }
  console.error('');
  console.error(`  3) 다른 포트를 쓰려면 .env 파일에  PORT=${PORT + 1}  을 적어주세요.`);
  console.error('');
  process.exit(1);
});
