import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { queueExport, streamZip, queueDepth, uploadsOf, manifestRows, toCsv, MISSION_LABEL } from '../lib/export.js';
import db from '../db.js';
import { UPLOAD_DIR, THUMB_DIR } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';
import { digits } from '../seed.js';
import { MISSION_FOLDER } from '../data/places.js';

const router = express.Router();
router.use(requireAdmin);

router.get('/stats', (_req, res) => {
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM uploads) AS uploads,
      (SELECT COUNT(*) FROM uploads WHERE media_type='photo') AS photos,
      (SELECT COUNT(*) FROM uploads WHERE media_type='video') AS videos,
      (SELECT COALESCE(SUM(bytes),0) FROM uploads) AS bytes,
      (SELECT COUNT(DISTINCT user_id) FROM uploads) AS activeUsers,
      (SELECT COUNT(*) FROM users WHERE is_admin=0 AND is_guide=0) AS members
  `).get();

  const byPlace = db.prepare(`
    SELECT p.slug, p.title, p.day, p.seq,
           COUNT(up.id) AS cnt,
           COUNT(DISTINCT up.user_id) AS people,
           SUM(CASE WHEN up.media_type='video' THEN 1 ELSE 0 END) AS videos
    FROM places p LEFT JOIN uploads up ON up.place_slug = p.slug
    GROUP BY p.slug ORDER BY (p.day = 0), p.day, p.seq   -- '자유/기타'(day 0)는 맨 뒤로
  `).all();

  const byMission = db.prepare(
    `SELECT mission, COUNT(*) cnt FROM uploads GROUP BY mission`
  ).all();

  const silent = db.prepare(`
    SELECT u.id, u.name, u.gi, u.grp FROM users u
    WHERE u.is_admin = 0 AND u.is_guide = 0 AND NOT EXISTS (SELECT 1 FROM uploads up WHERE up.user_id = u.id)
    ORDER BY u.grp, u.sort_no
  `).all();

  res.json({ totals, byPlace, byMission, silent });
});

/**
 * 사진·영상 전체 초기화.
 *
 * 여행 당일까지 테스트로 올린 자료를 한 번에 지우기 위한 기능이다.
 * 되돌릴 수 없으므로 확인 문구를 정확히 받았을 때만 실행한다.
 * 참가자 명단·비밀번호·공지는 건드리지 않는다.
 */
const RESET_PHRASE = '전체삭제';

router.post('/reset-uploads', (req, res) => {
  if (String(req.body?.confirm || '').trim() !== RESET_PHRASE) {
    return res.status(400).json({
      error: `확인 문구가 다릅니다. "${RESET_PHRASE}" 를 정확히 입력해 주세요.`,
    });
  }

  const before = db.prepare(
    'SELECT COUNT(*) AS cnt, COALESCE(SUM(bytes), 0) AS bytes FROM uploads'
  ).get();
  const events = db.prepare('SELECT COUNT(*) AS cnt FROM score_events').get().cnt;

  // score_events 는 upload_id 로 연결된 것만 자동 삭제되므로(수동 조정분은 남는다) 직접 비운다
  db.transaction(() => {
    db.prepare('DELETE FROM uploads').run();
    db.prepare('DELETE FROM score_events').run();
  })();

  // DB 에 없는 잔여 파일까지 정리되도록 폴더째 비운다
  for (const dir of [UPLOAD_DIR, THUMB_DIR]) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`[reset] ${req.user.name}: 사진·영상 ${before.cnt}건 · 점수기록 ${events}건 초기화`);
  res.json({ ok: true, uploads: before.cnt, bytes: before.bytes, events });
});

/** 한 사람의 사용 기록. 사람별 표에서 이름을 눌렀을 때 쓴다. */
router.get('/activity/:userId', (req, res) => {
  const id = Number(req.params.userId);
  const user = db.prepare(
    'SELECT id, name, gi, grp, bus, is_guide FROM users WHERE id = ? AND is_admin = 0'
  ).get(id);
  if (!user) return res.status(404).json({ error: '찾을 수 없습니다.' });

  const rows = db.prepare(
    `SELECT kind, detail, created_at FROM activity
      WHERE user_id = ? ORDER BY id DESC LIMIT 300`
  ).all(id);
  const byView = db.prepare(
    `SELECT detail AS view, COUNT(*) AS cnt FROM activity
      WHERE user_id = ? AND kind='view' GROUP BY detail ORDER BY cnt DESC`
  ).all(id);
  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN kind='login' THEN 1 ELSE 0 END) AS logins,
      SUM(CASE WHEN kind='view'  THEN 1 ELSE 0 END) AS views,
      MIN(created_at) AS firstSeen,
      MAX(created_at) AS lastSeen
    FROM activity WHERE user_id = ?
  `).get(id);
  const uploads = db.prepare('SELECT COUNT(*) AS c FROM uploads WHERE user_id = ?').get(id).c;

  res.json({ user, totals: { ...totals, uploads }, byView, rows });
});

/**
 * 사용 기록만 지우기.
 *
 * 사진 초기화와 성격이 달라 따로 둔다. 사진을 지울 때 접속 기록까지
 * 사라지면 이미 들어와 본 분이 다시 미접속자로 잡혀 명단이 틀려진다.
 * 반대로 출발 직전에 시험 삼아 눌러본 기록만 털고 싶을 때가 있다.
 */
router.post('/reset-activity', (req, res) => {
  if (String(req.body?.confirm || '').trim() !== RESET_PHRASE) {
    return res.status(400).json({
      error: `확인 문구가 다릅니다. "${RESET_PHRASE}" 를 정확히 입력해 주세요.`,
    });
  }
  const before = db.prepare('SELECT COUNT(*) AS cnt FROM activity').get().cnt;
  db.prepare('DELETE FROM activity').run();
  console.log(`[reset] ${req.user.name}: 사용 기록 ${before}건 초기화`);
  res.json({ ok: true, removed: before });
});

/**
 * 사용 현황 — 누가 앱을 쓰고 있고 누가 아직 안 들어왔는지.
 * 출발 전에 "아직 못 들어오신 분" 을 찾아 개별로 챙기려는 용도다.
 */
router.get('/activity', (_req, res) => {
  const totals = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE is_admin=0 AND is_guide=0) AS members,
      -- 접속률은 참가자 기준이라 운영진·가이드는 뺀다
      (SELECT COUNT(DISTINCT a.user_id) FROM activity a JOIN users u ON u.id=a.user_id
        WHERE a.kind='login' AND u.is_admin=0 AND u.is_guide=0) AS loggedIn,
      (SELECT COUNT(*) FROM activity a JOIN users u ON u.id=a.user_id
        WHERE a.kind='login' AND u.is_admin=0) AS logins,
      (SELECT COUNT(*) FROM activity a JOIN users u ON u.id=a.user_id
        WHERE a.kind='view' AND u.is_admin=0) AS views
  `).get();

  // 화면별 사용 횟수
  // 운영진 자신의 이동은 빼야 총계와 맞는다
  const byView = db.prepare(
    `SELECT a.detail AS view, COUNT(*) AS cnt, COUNT(DISTINCT a.user_id) AS people
       FROM activity a JOIN users u ON u.id = a.user_id
      WHERE a.kind='view' AND u.is_admin = 0
      GROUP BY a.detail ORDER BY cnt DESC`
  ).all();

  // 사람별 요약 (참가자·가이드 모두. 운영진은 뺀다)
  const people = db.prepare(`
    SELECT u.id, u.name, u.gi, u.grp, u.is_guide, u.pw_changed,
           SUM(CASE WHEN a.kind='login' THEN 1 ELSE 0 END) AS logins,
           SUM(CASE WHEN a.kind='view'  THEN 1 ELSE 0 END) AS views,
           MAX(a.created_at) AS lastSeen,
           (SELECT COUNT(*) FROM uploads up WHERE up.user_id = u.id) AS uploads
      FROM users u LEFT JOIN activity a ON a.user_id = u.id
     WHERE u.is_admin = 0
     GROUP BY u.id
     -- 이름에서 사람을 찾는 화면이라 가나다 순으로 둔다.
     -- 한글 음절은 코드값 순서가 곧 가나다 순이라 그냥 정렬하면 된다.
     -- 가이드는 이름이 영문이라 앞으로 튀므로 뒤로 모은다.
     ORDER BY u.is_guide, u.name
  `).all();

  // 최근 기록
  const recent = db.prepare(`
    SELECT a.kind, a.detail, a.created_at, u.name
      FROM activity a JOIN users u ON u.id = a.user_id
     WHERE u.is_admin = 0
     ORDER BY a.id DESC LIMIT 60
  `).all();

  res.json({ totals, byView, people, recent });
});

/** 참가자 관리 (연락처 포함 — 운영진만) */
router.get('/participants', (_req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.alias, u.phone, u.gi, u.bus, u.grp, u.roles, u.single_room,
           u.pw_changed, u.sort_no,
           COALESCE(c.cnt,0) AS uploads, COALESCE(s.pts,0) AS score
    FROM users u
    LEFT JOIN (SELECT user_id, COUNT(*) cnt FROM uploads GROUP BY user_id) c ON c.user_id=u.id
    LEFT JOIN (SELECT user_id, SUM(points) pts FROM score_events GROUP BY user_id) s ON s.user_id=u.id
    WHERE u.is_admin = 0 AND u.is_guide = 0 ORDER BY u.sort_no
  `).all();
  res.json(rows.map((r) => ({ ...r, roles: JSON.parse(r.roles || '[]') })));
});

/** 비밀번호를 휴대폰 번호로 초기화 */
router.post('/participants/:id/reset-password', (req, res) => {
  const u = db.prepare('SELECT id, phone FROM users WHERE id = ? AND is_admin = 0 AND is_guide = 0').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
  if (!u.phone) return res.status(400).json({ error: '등록된 연락처가 없습니다.' });
  db.prepare('UPDATE users SET password_hash = ?, pw_changed = 0 WHERE id = ?')
    .run(bcrypt.hashSync(digits(u.phone), 10), u.id);
  res.json({ ok: true });
});

/** 연락처 수정 (비밀번호도 함께 초기화) */
router.post('/participants/:id/phone', (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  if (digits(phone).length < 9) return res.status(400).json({ error: '올바른 휴대폰 번호를 입력해 주세요.' });
  const u = db.prepare('SELECT id FROM users WHERE id = ? AND is_admin = 0 AND is_guide = 0').get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: '참가자를 찾을 수 없습니다.' });
  db.prepare('UPDATE users SET phone = ?, password_hash = ?, pw_changed = 0 WHERE id = ?')
    .run(phone, bcrypt.hashSync(digits(phone), 10), u.id);
  res.json({ ok: true });
});

/** 점수 수동 조정 */
router.post('/score', (req, res) => {
  const userId = Number(req.body?.userId);
  const points = Number(req.body?.points);
  const memo = String(req.body?.memo || '운영진 조정').slice(0, 100);
  if (!userId || !Number.isFinite(points)) return res.status(400).json({ error: '입력값을 확인해 주세요.' });
  db.prepare(`INSERT INTO score_events (user_id, kind, points, memo) VALUES (?, 'manual', ?, ?)`)
    .run(userId, Math.round(points), memo);
  res.json({ ok: true });
});

/** 공지 */
router.post('/notices', (req, res) => {
  const title = String(req.body?.title || '').trim().slice(0, 120);
  const body = String(req.body?.body || '').trim().slice(0, 4000);
  if (!title || !body) return res.status(400).json({ error: '제목과 내용을 입력해 주세요.' });
  db.prepare('INSERT INTO notices (title, body, pinned, author) VALUES (?, ?, ?, ?)')
    .run(title, body, req.body?.pinned ? 1 : 0, req.user.name);
  res.json({ ok: true });
});

router.delete('/notices/:id', (req, res) => {
  db.prepare('DELETE FROM notices WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

/** 업로드 목록 (관리자용, 필터 넓음) */
router.get('/uploads', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.place) { where.push('up.place_slug = ?'); args.push(String(req.query.place)); }
  if (req.query.mission) { where.push('up.mission = ?'); args.push(String(req.query.mission)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT up.*, u.name AS uploader FROM uploads up JOIN users u ON u.id = up.user_id
    ${clause} ORDER BY up.id DESC LIMIT 500
  `).all(...args);
  res.json({ items: rows });
});

// ── 내보내기 ────────────────────────────────────────────────────────

router.get('/manifest.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="baekdu_manifest_${Date.now()}.csv"`);
  res.send(toCsv(manifestRows()));
});

/**
 * ZIP 내보내기 — 이미 방문지/미션 폴더 구조로 저장되어 있으므로 그대로 담습니다.
 * ?place=slug  ?mission=key  ?day=1  로 부분 내보내기 가능
 */
router.get('/export.zip', async (req, res) => {
  const user = Number(req.query.user) || 0;
  const scope = ['mine', 'in', 'both'].includes(String(req.query.scope)) ? String(req.query.scope) : 'both';

  let rows;
  let label;
  if (user) {
    // 사람으로 뽑을 때는 '올린 것 / 나온 것' 을 함께 볼 수 있어야 한다
    rows = uploadsOf(user, scope);
    label = db.prepare('SELECT name FROM users WHERE id = ?').get(user)?.name || `user${user}`;
  } else {
    const where = [];
    const args = [];
    if (req.query.place) { where.push('up.place_slug = ?'); args.push(String(req.query.place)); }
    if (req.query.mission) { where.push('up.mission = ?'); args.push(String(req.query.mission)); }
    if (req.query.day) { where.push('p.day = ?'); args.push(Number(req.query.day)); }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    rows = db.prepare(
      `SELECT up.id, up.file_path FROM uploads up JOIN places p ON p.slug = up.place_slug ${clause}`
    ).all(...args);
    label = req.query.place || (req.query.day ? `${req.query.day}일차` : req.query.mission || '전체');
  }

  if (!rows.length) return res.status(404).json({ error: '내보낼 자료가 없습니다.' });

  const started = await queueExport(() => streamZip(res, {
    files: rows.map((r) => r.file_path),
    zipName: `baekdu_${label}${user ? `_${SCOPE_LABEL[scope]}` : ''}.zip`,
    manifestCsv: toCsv(manifestRows(user ? rows.map((r) => r.id) : null)),
    readme: readmeText(),
  }));
  if (!started) {
    res.status(503).json({ error: `내보내기가 밀려 있습니다(${queueDepth()}건). 잠시 후 다시 눌러주세요.` });
  }
});

const SCOPE_LABEL = { mine: '올린것', in: '나온것', both: '전체' };

function readmeText() {
  return [
    'ICCA 산악회 백두산 여행 사진/영상 아카이브',
    '',
    '폴더 구조: {일차}_{순서}_{방문지}/{미션}/{이름}_{촬영시각}.확장자',
    '',
    '미션 폴더:',
    ...Object.entries(MISSION_FOLDER).map(([k, v]) => `  ${v}  ← ${MISSION_LABEL[k] || k}`),
    '',
    '_manifest.csv 에 업로더·함께 찍힌 사람·캡션이 모두 들어 있습니다.',
  ].join('\r\n');
}

export default router;
