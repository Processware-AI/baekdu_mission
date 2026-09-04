import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import archiver from 'archiver';
import db from '../db.js';
import { UPLOAD_DIR } from '../config.js';
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
      (SELECT COUNT(*) FROM users WHERE is_admin=0) AS members
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
    WHERE u.is_admin = 0 AND NOT EXISTS (SELECT 1 FROM uploads up WHERE up.user_id = u.id)
    ORDER BY u.grp, u.sort_no
  `).all();

  res.json({ totals, byPlace, byMission, silent });
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
    WHERE u.is_admin = 0 ORDER BY u.sort_no
  `).all();
  res.json(rows.map((r) => ({ ...r, roles: JSON.parse(r.roles || '[]') })));
});

/** 비밀번호를 휴대폰 번호로 초기화 */
router.post('/participants/:id/reset-password', (req, res) => {
  const u = db.prepare('SELECT id, phone FROM users WHERE id = ? AND is_admin = 0').get(Number(req.params.id));
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
  const u = db.prepare('SELECT id FROM users WHERE id = ? AND is_admin = 0').get(Number(req.params.id));
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

function manifestRows() {
  const rows = db.prepare(`
    SELECT up.id, p.day, p.seq, p.title AS place, up.place_slug, up.mission,
           up.media_type, up.file_path, up.caption, up.bytes, up.duration,
           up.taken_at, up.created_at, u.name AS uploader, u.grp AS grp
    FROM uploads up
    JOIN users u ON u.id = up.user_id
    JOIN places p ON p.slug = up.place_slug
    ORDER BY p.day, p.seq, up.mission, up.id
  `).all();
  const tagMap = new Map();
  for (const t of db.prepare(
    `SELECT t.upload_id, u.name FROM upload_tags t JOIN users u ON u.id = t.user_id`
  ).all()) {
    if (!tagMap.has(t.upload_id)) tagMap.set(t.upload_id, []);
    tagMap.get(t.upload_id).push(t.name);
  }
  return rows.map((r) => ({ ...r, tags: (tagMap.get(r.id) || []).join(' ') }));
}

const MISSION_LABEL = {
  solo: '독사진', duo: '2인', trio: '3인', quad: '4인이상',
  video: '영상', group: '단체사진', vlog: '브이로그',
};

function toCsv(rows) {
  const head = ['파일경로', '일차', '순서', '방문지', '미션', '종류', '업로더', '조', '함께찍은사람', '캡션', '용량(MB)', '길이(초)', '촬영시각', '업로드시각'];
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [head.join(',')];
  for (const r of rows) {
    lines.push([
      r.file_path, r.day, r.seq, r.place, MISSION_LABEL[r.mission] || r.mission,
      r.media_type === 'video' ? '영상' : '사진', r.uploader, r.grp ? `${r.grp}조` : '',
      r.tags, r.caption, (r.bytes / 1048576).toFixed(2), r.duration ?? '',
      r.taken_at ?? '', r.created_at,
    ].map(esc).join(','));
  }
  return '﻿' + lines.join('\r\n'); // BOM — 엑셀 한글 깨짐 방지
}

router.get('/manifest.csv', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="baekdu_manifest_${Date.now()}.csv"`);
  res.send(toCsv(manifestRows()));
});

/**
 * ZIP 내보내기 — 이미 방문지/미션 폴더 구조로 저장되어 있으므로 그대로 담습니다.
 * ?place=slug  ?mission=key  ?day=1  로 부분 내보내기 가능
 */
router.get('/export.zip', (req, res) => {
  const where = [];
  const args = [];
  if (req.query.place) { where.push('up.place_slug = ?'); args.push(String(req.query.place)); }
  if (req.query.mission) { where.push('up.mission = ?'); args.push(String(req.query.mission)); }
  if (req.query.day) { where.push('p.day = ?'); args.push(Number(req.query.day)); }
  if (req.query.user) { where.push('up.user_id = ?'); args.push(Number(req.query.user)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const rows = db.prepare(`
    SELECT up.file_path FROM uploads up JOIN places p ON p.slug = up.place_slug ${clause}
  `).all(...args);

  if (!rows.length) return res.status(404).json({ error: '내보낼 자료가 없습니다.' });

  const name = `baekdu_${req.query.place || req.query.day || 'all'}_${Date.now()}.zip`;
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);

  const zip = archiver('zip', { zlib: { level: 0 } }); // 사진/영상은 이미 압축됨 → 저장만
  zip.on('error', (err) => { console.error('[zip]', err); res.destroy(err); });
  zip.pipe(res);

  for (const r of rows) {
    const abs = path.join(UPLOAD_DIR, r.file_path);
    if (fs.existsSync(abs)) zip.file(abs, { name: r.file_path });
  }
  zip.append(toCsv(manifestRows()), { name: '_manifest.csv' });
  zip.append(
    [
      'ICCA 산악회 백두산 여행 사진/영상 아카이브',
      '',
      '폴더 구조: {일차}_{순서}_{방문지}/{미션}/{이름}_{촬영시각}.확장자',
      '',
      '미션 폴더:',
      ...Object.entries(MISSION_FOLDER).map(([k, v]) => `  ${v}  ← ${MISSION_LABEL[k] || k}`),
      '',
      '_manifest.csv 에 업로더·함께 찍힌 사람·캡션이 모두 들어 있습니다.',
    ].join('\r\n'),
    { name: '_읽어주세요.txt' }
  );
  zip.finalize();
});

export default router;
