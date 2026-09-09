import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import db from '../db.js';
import { UPLOAD_DIR, THUMB_DIR, ENTRY_DIR } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { PLACES, CONQUER_KEYS, MEMBER_MISSION_KEYS } from '../data/places.js';
import { makeThumb } from '../lib/thumb.js';
import { queueExport, streamZip, queueDepth, uploadsOf, manifestRows, toCsv } from '../lib/export.js';
import { leaderboard, groupBoard, badgesFor, userScore } from '../lib/scoring.js';

const router = express.Router();
router.use(requireAuth);

const SELECT_UPLOAD = `
  SELECT up.id, up.place_slug, up.mission, up.media_type, up.caption, up.bytes,
         up.duration, up.created_at, up.updated_at, up.taken_at, up.points, up.thumb_path,
         u.id AS uid, u.name AS uploader, u.grp AS uploader_group
  FROM uploads up JOIN users u ON u.id = up.user_id
`;

/**
 * 자료가 바뀌면 값이 달라지는 짧은 표식.
 *
 * 주소가 /api/thumb/7 로 고정이면 브라우저가 7일간 캐시해서 옛 그림을 계속 보여준다.
 * 문제가 되는 경우가 둘 있다.
 *  - 미션 칸을 교체하면 id 는 그대로인데 내용만 바뀐다
 *  - SQLite 는 지운 id 를 다시 쓴다. 마지막 사진을 지우고 새로 올리면 같은 id 를 받는다
 * 그래서 주소 끝에 이 값을 붙여 내용이 바뀌면 주소도 바뀌게 한다.
 */
const ver = (r) => {
  const t = String(r.updated_at || r.created_at || '').replace(/\D/g, '').slice(-10);
  // 같은 초 안에 교체하면 시각만으로는 구분이 안 되므로 크기도 섞는다
  return r.bytes ? `${t}-${r.bytes}` : t;
};

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
    v: ver(r),
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
    `SELECT place_slug, mission, COUNT(*) c, MAX(id) AS id,
            MAX(COALESCE(updated_at, created_at)) AS at
     FROM uploads WHERE user_id = ? GROUP BY place_slug, mission`
  ).all(req.user.id);
  const all = db.prepare(
    `SELECT place_slug, COUNT(*) c, COUNT(DISTINCT user_id) people FROM uploads GROUP BY place_slug`
  ).all();

  const mineMap = {};
  const slotMap = {};   // 미션 칸에 현재 들어있는 업로드 id (교체 대상 미리보기용)
  for (const r of mine) {
    (mineMap[r.place_slug] ||= {})[r.mission] = r.c;
    // 교체하면 id 는 그대로이고 내용만 바뀌므로 버전도 같이 준다
    (slotMap[r.place_slug] ||= {})[r.mission] = `${r.id}?v=${ver({ updated_at: r.at })}`;
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
/**
 * 중국 전자입국신고서 — 로그인한 본인 것만.
 *
 * 여권번호가 적힌 문서라 주소에 남의 것을 넣어볼 여지를 두지 않는다.
 * (id 를 받지 않고 세션의 이름으로만 찾는다)
 */
router.get('/me/entry-form', (req, res) => {
  const name = String(req.user.name || '');
  // 이름에 경로 문자가 섞이는 일은 없지만, 파일 경로를 만들 때는 확인한다
  if (!name || /[\\/.]/.test(name)) return res.status(404).end();
  const abs = path.join(ENTRY_DIR, `${name}.jpg`);
  if (!abs.startsWith(ENTRY_DIR) || !fs.existsSync(abs)) return res.status(404).end();
  // 주소가 모두에게 같아서(/api/me/entry-form) 캐시해 두면 한 기기에서
  // 계정을 바꿨을 때 앞사람 문서가 그대로 나온다. 여권번호가 담긴 문서라 저장하지 않는다.
  return sendFile(req, res, abs, 'image/jpeg', 'no-store, private');
});

/** 신고서가 있는지만 알려준다 (내 정보 화면에서 카드를 그릴지 판단) */
router.get('/me/entry-form/exists', (req, res) => {
  const name = String(req.user.name || '');
  const ok = !!name && !/[\\/.]/.test(name) && fs.existsSync(path.join(ENTRY_DIR, `${name}.jpg`));
  res.setHeader('Cache-Control', 'no-store, private');
  res.json({ has: ok });
});

/**
 * 내 사진 모두 받기.
 *
 * 운영진 내보내기와 같은 줄에 세워 한 번에 하나씩 만든다.
 * 여행이 끝나면 여러 명이 동시에 누를 것이기 때문이다.
 * 자기 것만 나가도록 사용자 id 는 세션에서만 가져온다.
 */
router.get('/me/export.zip', async (req, res) => {
  const scope = ['mine', 'in', 'both'].includes(String(req.query.scope)) ? String(req.query.scope) : 'both';
  const rows = uploadsOf(req.user.id, scope);
  if (!rows.length) return res.status(404).json({ error: '아직 받을 자료가 없습니다.' });

  const label = { mine: '내가올린', in: '내가나온', both: '내사진' }[scope];
  const started = await queueExport(() => streamZip(res, {
    files: rows.map((r) => r.file_path),
    zipName: `백두산_${label}_${req.user.name}.zip`,
    manifestCsv: toCsv(manifestRows(rows.map((r) => r.id))),
  }));
  if (!started) {
    res.status(503).json({ error: `내보내기가 밀려 있습니다(${queueDepth()}건). 잠시 후 다시 눌러주세요.` });
  }
});

/** 받을 자료가 몇 건인지 (버튼에 표시) */
router.get('/me/export/count', (req, res) => {
  res.json({
    mine: uploadsOf(req.user.id, 'mine').length,
    in: uploadsOf(req.user.id, 'in').length,
    both: uploadsOf(req.user.id, 'both').length,
  });
});

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
function sendFile(req, res, absPath, mime, cache = 'private, max-age=604800') {
  if (!fs.existsSync(absPath)) return res.status(404).end();
  const stat = fs.statSync(absPath);
  const range = req.headers.range;
  res.setHeader('Cache-Control', cache);
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

/** 같은 영상에 대해 동시에 여러 번 만들지 않도록 */
const makingThumb = new Map();

router.get('/thumb/:id', async (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT id, thumb_path, file_path, mime, media_type FROM uploads WHERE id = ?').get(id);
  if (!row) return res.status(404).end();
  if (row.thumb_path) {
    const abs = path.join(THUMB_DIR, row.thumb_path);
    if (abs.startsWith(THUMB_DIR) && fs.existsSync(abs)) return sendFile(req, res, abs, 'image/jpeg');
  }
  // 썸네일 없는 자료 — 예전에 올라왔거나 만들기에 실패한 것. 여기서 한 번 만들어 둔다.
  const isVideo = row.media_type === 'video';
  if (!makingThumb.has(id)) {
    makingThumb.set(id, makeThumb(path.join(UPLOAD_DIR, row.file_path), isVideo)
      .finally(() => setTimeout(() => makingThumb.delete(id), 1000)));
  }
  const made = await makingThumb.get(id);
  if (made) {
    db.prepare('UPDATE uploads SET thumb_path = ? WHERE id = ?').run(made, id);
    return sendFile(req, res, path.join(THUMB_DIR, made), 'image/jpeg');
  }
  // 사진은 만들기에 실패해도 원본이라도 보여준다 (영상은 아래 대체 그림)
  if (!isVideo) {
    return sendFile(req, res, path.join(UPLOAD_DIR, row.file_path), row.mime);
  }
  // 썸네일을 못 만든 영상(아이폰에서 종종 실패한다). 404 를 주면 갤러리에
  // 깨진 이미지 물음표가 뜨므로, 영상임을 알 수 있는 그림을 대신 보낸다.
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('image/svg+xml').send(VIDEO_PLACEHOLDER);
});

/** 썸네일이 없는 영상 자리에 넣을 그림 (글꼴에 기대지 않도록 도형으로만) */
const VIDEO_PLACEHOLDER = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
  <rect width="480" height="480" fill="#1d232d"/>
  <circle cx="240" cy="240" r="86" fill="none" stroke="#6b7686" stroke-width="10"/>
  <path d="M214 196 L292 240 L214 284 Z" fill="#6b7686"/>
</svg>`;

export default router;
