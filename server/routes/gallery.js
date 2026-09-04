import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db.js';
import { UPLOAD_DIR, THUMB_DIR } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { PLACES, CONQUER_KEYS, MEMBER_MISSION_KEYS } from '../data/places.js';
import { leaderboard, groupBoard, badgesFor, userScore } from '../lib/scoring.js';

const router = express.Router();
router.use(requireAuth);

const SELECT_UPLOAD = `
  SELECT up.id, up.place_slug, up.mission, up.media_type, up.caption, up.bytes,
         up.duration, up.created_at, up.taken_at, up.points, up.thumb_path,
         u.id AS uid, u.name AS uploader, u.grp AS uploader_group
  FROM uploads up JOIN users u ON u.id = up.user_id
`;

function withTags(rows) {
  if (!rows.length) return rows;
  const ids = rows.map((r) => r.id);
  const tags = db.prepare(
    `SELECT t.upload_id, u.id, u.name FROM upload_tags t JOIN users u ON u.id = t.user_id
     WHERE t.upload_id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids);
  const byUpload = new Map();
  for (const t of tags) {
    if (!byUpload.has(t.upload_id)) byUpload.set(t.upload_id, []);
    byUpload.get(t.upload_id).push({ id: t.id, name: t.name });
  }
  return rows.map((r) => ({
    ...r,
    hasThumb: !!r.thumb_path,
    thumb_path: undefined,
    tags: byUpload.get(r.id) || [],
  }));
}

/** GET /api/gallery?place=&mission=&user=&page=&size= */
router.get('/gallery', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.place) { where.push('up.place_slug = ?'); args.push(String(req.query.place)); }
  if (req.query.mission) { where.push('up.mission = ?'); args.push(String(req.query.mission)); }
  if (req.query.user) { where.push('up.user_id = ?'); args.push(Number(req.query.user)); }
  if (req.query.type) { where.push('up.media_type = ?'); args.push(String(req.query.type)); }
  if (req.query.mine === '1') { where.push('up.user_id = ?'); args.push(req.user.id); }
  if (req.query.withMe === '1') {
    where.push('(up.user_id = ? OR EXISTS (SELECT 1 FROM upload_tags t WHERE t.upload_id = up.id AND t.user_id = ?))');
    args.push(req.user.id, req.user.id);
  }

  const size = Math.min(Number(req.query.size) || 40, 100);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const total = db.prepare(`SELECT COUNT(*) c FROM uploads up ${clause.replace(/up\./g, 'up.')}`).get(...args).c;
  const rows = db.prepare(
    `${SELECT_UPLOAD} ${clause} ORDER BY up.id DESC LIMIT ? OFFSET ?`
  ).all(...args, size, (page - 1) * size);

  res.json({ total, page, size, items: withTags(rows) });
});

/** 방문지별 내 진행 상황 + 전체 통계 */
router.get('/progress', (req, res) => {
  const mine = db.prepare(
    `SELECT place_slug, mission, COUNT(*) c, MAX(id) AS id
     FROM uploads WHERE user_id = ? GROUP BY place_slug, mission`
  ).all(req.user.id);
  const all = db.prepare(
    `SELECT place_slug, COUNT(*) c, COUNT(DISTINCT user_id) people FROM uploads GROUP BY place_slug`
  ).all();

  const mineMap = {};
  const slotMap = {};   // 미션 칸에 현재 들어있는 업로드 id (교체 대상 미리보기용)
  for (const r of mine) {
    (mineMap[r.place_slug] ||= {})[r.mission] = r.c;
    (slotMap[r.place_slug] ||= {})[r.mission] = r.id;
  }
  const allMap = Object.fromEntries(all.map((r) => [r.place_slug, { count: r.c, people: r.people }]));

  const places = PLACES.map((p) => {
    const m = mineMap[p.slug] || {};
    const done = CONQUER_KEYS.filter((k) => m[k]).length;
    return {
      slug: p.slug,
      mine: m,
      slots: slotMap[p.slug] || {},
      myCount: Object.values(m).reduce((a, b) => a + b, 0),
      conquered: done === CONQUER_KEYS.length,
      missionDone: done,
      all: allMap[p.slug] || { count: 0, people: 0 },
    };
  });
  res.json({ places });
});

/** 내 요약 (점수, 순위, 배지) */
router.get('/me/summary', (req, res) => {
  const board = leaderboard({ limit: 200 });
  const meRow = board.find((r) => r.id === req.user.id);
  const stats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM uploads WHERE user_id=@u) AS uploads,
      (SELECT COUNT(*) FROM uploads WHERE user_id=@u AND media_type='photo') AS photos,
      (SELECT COUNT(*) FROM uploads WHERE user_id=@u AND media_type='video') AS videos,
      (SELECT COUNT(DISTINCT place_slug) FROM uploads WHERE user_id=@u) AS places,
      (SELECT COUNT(*) FROM upload_tags t JOIN uploads up ON up.id=t.upload_id WHERE up.user_id=@u) AS tagged,
      (SELECT COUNT(*) FROM upload_tags WHERE user_id=@u) AS appearances
  `).get({ u: req.user.id });

  const recentEvents = db.prepare(
    `SELECT kind, points, memo, created_at FROM score_events
     WHERE user_id = ? ORDER BY id DESC LIMIT 12`
  ).all(req.user.id);

  res.json({
    score: userScore(req.user.id),
    rank: meRow?.rank ?? null,
    totalPlayers: board.length,
    stats,
    badges: badgesFor(req.user.id),
    recentEvents,
  });
});

router.get('/rank', (req, res) => {
  res.json({
    overall: leaderboard({ limit: 100 }),
    groups: groupBoard(),
    byGroup: req.query.group ? leaderboard({ groupId: Number(req.query.group) }) : null,
  });
});

/** 최근 활동 피드 */
router.get('/feed', (_req, res) => {
  const rows = db.prepare(`${SELECT_UPLOAD} ORDER BY up.id DESC LIMIT 24`).all();
  res.json({ items: withTags(rows) });
});

/** 미디어 스트리밍 (로그인 필수) */
function sendFile(req, res, absPath, mime) {
  if (!fs.existsSync(absPath)) return res.status(404).end();
  const stat = fs.statSync(absPath);
  const range = req.headers.range;
  res.setHeader('Cache-Control', 'private, max-age=604800');
  if (mime) res.setHeader('Content-Type', mime);
  res.setHeader('Accept-Ranges', 'bytes');

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Number(m[2]) : stat.size - 1;
    if (start >= stat.size) {
      res.status(416).setHeader('Content-Range', `bytes */${stat.size}`);
      return res.end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    res.setHeader('Content-Length', end - start + 1);
    return fs.createReadStream(absPath, { start, end }).pipe(res);
  }
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(absPath).pipe(res);
}

router.get('/media/:id', (req, res) => {
  const row = db.prepare('SELECT file_path, mime, original_name FROM uploads WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).end();
  const abs = path.join(UPLOAD_DIR, row.file_path);
  if (!abs.startsWith(UPLOAD_DIR)) return res.status(400).end();
  if (req.query.download === '1') {
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(path.basename(row.file_path))}`);
  }
  sendFile(req, res, abs, row.mime);
});

router.get('/thumb/:id', (req, res) => {
  const row = db.prepare('SELECT thumb_path, file_path, mime, media_type FROM uploads WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).end();
  if (row.thumb_path) {
    const abs = path.join(THUMB_DIR, row.thumb_path);
    if (abs.startsWith(THUMB_DIR) && fs.existsSync(abs)) return sendFile(req, res, abs, 'image/jpeg');
  }
  if (row.media_type === 'photo') {
    return sendFile(req, res, path.join(UPLOAD_DIR, row.file_path), row.mime);
  }
  res.status(404).end();
});

export default router;
