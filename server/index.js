import express from 'express';
import session from 'express-session';
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

app.use(express.static(PUBLIC_DIR, { maxAge: '1h', index: 'index.html' }));

// SPA fallback
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile('index.html', { root: PUBLIC_DIR });
});

app.use((req, res) => res.status(404).json({ error: '없는 경로입니다.' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err?.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '파일이 너무 큽니다. 영상은 짧게 잘라서 올려주세요.' });
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

app.listen(PORT, HOST, () => {
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
  console.log('  종료: Ctrl+C');
  console.log('');
});

// 시작하기.bat 으로 실행했을 때 브라우저를 자동으로 열어준다
if (process.env.OPEN_BROWSER === '1') {
  import('node:child_process').then(({ exec }) => {
    const url = `http://localhost:${PORT}`;
    const cmd = process.platform === 'win32' ? `start "" "${url}"`
      : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => {});
  });
}
