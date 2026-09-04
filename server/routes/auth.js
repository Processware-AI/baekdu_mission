import express from 'express';
import bcrypt from 'bcryptjs';
import db from '../db.js';
import { digits } from '../seed.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/** 아주 단순한 로그인 시도 제한 (프로세스 메모리) */
const attempts = new Map(); // key -> { n, until }
const MAX_TRIES = 10;
const LOCK_MS = 5 * 60 * 1000;

function throttleKey(req, name) {
  return `${req.ip}|${name}`;
}
function checkThrottle(key) {
  const rec = attempts.get(key);
  if (rec && rec.until > Date.now()) {
    return Math.ceil((rec.until - Date.now()) / 1000);
  }
  return 0;
}
function noteFail(key) {
  const rec = attempts.get(key) || { n: 0, until: 0 };
  rec.n += 1;
  if (rec.n >= MAX_TRIES) { rec.until = Date.now() + LOCK_MS; rec.n = 0; }
  attempts.set(key, rec);
}

const qByName = db.prepare(
  `SELECT * FROM users WHERE name = ? OR (alias IS NOT NULL AND alias = ?)`
);

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    gi: u.gi,
    bus: u.bus,
    group: u.grp,
    roles: JSON.parse(u.roles || '[]'),
    singleRoom: !!u.single_room,
    isAdmin: !!u.is_admin,
    pwChanged: !!u.pw_changed,
  };
}

router.post('/login', (req, res) => {
  const name = String(req.body?.name || '').trim();
  const password = String(req.body?.password || '');
  if (!name || !password) {
    return res.status(400).json({ error: '이름과 비밀번호를 입력해 주세요.' });
  }

  const key = throttleKey(req, name);
  const wait = checkThrottle(key);
  if (wait) {
    return res.status(429).json({ error: `시도가 너무 많습니다. ${wait}초 후 다시 시도해 주세요.` });
  }

  const u = qByName.get(name, name);
  if (!u) {
    noteFail(key);
    return res.status(401).json({ error: '명단에 없는 이름입니다. 이름을 정확히 입력해 주세요.' });
  }

  // 비밀번호(휴대폰 번호)는 하이픈 유무·공백에 관계없이 통과
  const ok = bcrypt.compareSync(password, u.password_hash)
    || bcrypt.compareSync(digits(password), u.password_hash);
  if (!ok) {
    noteFail(key);
    return res.status(401).json({ error: '비밀번호가 맞지 않습니다. 휴대폰 번호(숫자만)를 입력해 보세요.' });
  }

  attempts.delete(key);
  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: '로그인 처리 중 오류가 발생했습니다.' });
    req.session.uid = u.id;
    req.session.cookie.maxAge = 1000 * 60 * 60 * 24 * 60; // 60일
    req.session.save(() => res.json({ user: publicUser(u) }));
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('baekdu.sid');
    res.json({ ok: true });
  });
});

router.get('/me', (req, res) => {
  res.json({ user: req.user });
});

router.post('/password', requireAuth, (req, res) => {
  const current = String(req.body?.current || '');
  const next = String(req.body?.next || '');
  if (next.length < 4) {
    return res.status(400).json({ error: '새 비밀번호는 4자 이상이어야 합니다.' });
  }
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  const ok = bcrypt.compareSync(current, u.password_hash)
    || bcrypt.compareSync(digits(current), u.password_hash);
  if (!ok) return res.status(400).json({ error: '현재 비밀번호가 맞지 않습니다.' });

  db.prepare('UPDATE users SET password_hash = ?, pw_changed = 1 WHERE id = ?')
    .run(bcrypt.hashSync(next, 10), u.id);
  res.json({ ok: true });
});

export default router;
