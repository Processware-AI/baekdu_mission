import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import db from '../db.js';
import { UPLOAD_DIR, THUMB_DIR, TMP_DIR, MAX_UPLOAD_BYTES } from '../config.js';
import { requireAuth } from '../middleware/auth.js';
import { MISSION_FOLDER, MEMBER_MISSION_KEYS, ALL_MISSION_KEYS, VIDEO_MISSION_KEYS } from '../data/places.js';
import { awardForUpload } from '../lib/scoring.js';
import { makeThumb } from '../lib/thumb.js';

const router = express.Router();

const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: MAX_UPLOAD_BYTES, files: 2 },
});

const PHOTO_EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/heic': '.heic', 'image/heif': '.heif', 'image/gif': '.gif' };
const VIDEO_EXT = { 'video/mp4': '.mp4', 'video/quicktime': '.mov', 'video/x-matroska': '.mkv', 'video/webm': '.webm', 'video/3gpp': '.3gp', 'video/x-msvideo': '.avi' };

function safeName(s) {
  return String(s).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 60);
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const qPlace = db.prepare('SELECT * FROM places WHERE slug = ?');

/**
 * POST /api/uploads
 * multipart: file (원본), thumb (선택, 클라이언트가 만든 썸네일 JPEG)
 * fields: placeSlug, mission, caption, tags(JSON 배열), takenAt, clientUid, duration
 */
/**
 * 업로드가 시작됐는지 / 본문이 다 도착했는지를 남긴다.
 * "몇 %에서 멈춘다" 같은 신고를 받았을 때, 서버까지 오기는 하는지
 * 얼마나 받다가 멈췄는지를 알아야 회선 문제인지 앱 문제인지 갈린다.
 */
function logUpload(req, res, next) {
  const mb = (n) => `${(n / 1048576).toFixed(1)}MB`;
  const size = Number(req.headers['content-length'] || 0);
  const ua = String(req.headers['user-agent'] || '');
  const device = /iPhone|iPad/.test(ua) ? '아이폰' : /Android/.test(ua) ? '안드로이드' : '기타';
  const who = req.user?.name || '?';
  const t0 = Date.now();
  const at = new Date().toLocaleTimeString('ko-KR');
  console.log(`  ↑ [${at}] 업로드 시작 (${who}·${device}) ${mb(size)}`);
  res.on('finish', () => {
    const sec = ((Date.now() - t0) / 1000).toFixed(1);
    const speed = size && sec > 0 ? ` · ${(size / 1048576 / sec).toFixed(1)}MB/s` : '';
    console.log(`  ↓ [${new Date().toLocaleTimeString('ko-KR')}] 업로드 끝 (${who}) `
      + `${res.statusCode} · ${sec}초${speed}`);
  });
  next();
}

router.post('/', requireAuth, logUpload, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }]), async (req, res) => {
  const tmpFiles = [
    ...(req.files?.file || []),
    ...(req.files?.thumb || []),
  ];
  const cleanup = () => tmpFiles.forEach((f) => fs.promises.unlink(f.path).catch(() => {}));

  try {
    const file = req.files?.file?.[0];
    const thumb = req.files?.thumb?.[0];
    if (!file) return res.status(400).json({ error: '파일이 없습니다.' });

    const placeSlug = String(req.body.placeSlug || '');
    const mission = String(req.body.mission || '');
    const place = qPlace.get(placeSlug);
    if (!place) { cleanup(); return res.status(400).json({ error: '방문지를 선택해 주세요.' }); }
    if (!ALL_MISSION_KEYS.includes(mission)) { cleanup(); return res.status(400).json({ error: '미션 종류가 올바르지 않습니다.' }); }

    // 단체사진·브이로그는 운영진과 가이드만. 점수 경쟁에서는 빠진다.
    const isAdminMission = !MEMBER_MISSION_KEYS.includes(mission);
    if (isAdminMission && !req.user.isAdmin && !req.user.isGuide) {
      cleanup();
      return res.status(403).json({ error: '단체사진·브이로그는 운영진과 가이드만 올릴 수 있습니다.' });
    }
    // 가이드는 참가자 미션(점수)을 올리지 않는다
    if (!isAdminMission && req.user.isGuide) {
      cleanup();
      return res.status(403).json({ error: '가이드 계정은 단체사진과 브이로그만 올릴 수 있습니다.' });
    }

    const mime = file.mimetype || '';
    const isVideo = mime.startsWith('video/');
    const isPhoto = mime.startsWith('image/');
    if (!isVideo && !isPhoto) { cleanup(); return res.status(400).json({ error: '사진 또는 영상 파일만 올릴 수 있습니다.' }); }
    if (VIDEO_MISSION_KEYS.includes(mission)) {
      if (!isVideo) { cleanup(); return res.status(400).json({ error: '이 미션은 영상 파일이어야 합니다.' }); }
    } else if (!isPhoto) {
      cleanup(); return res.status(400).json({ error: '이 미션은 사진 파일이어야 합니다.' });
    }

    // 중복(오프라인 큐 재전송) 방지
    const clientUid = req.body.clientUid ? String(req.body.clientUid).slice(0, 64) : null;
    if (clientUid) {
      const dup = db.prepare('SELECT id FROM uploads WHERE user_id = ? AND client_uid = ?')
        .get(req.user.id, clientUid);
      if (dup) { cleanup(); return res.json({ ok: true, duplicate: true, id: dup.id, points: 0, events: [] }); }
    }

    // 태그 검증
    let tags = [];
    try { tags = JSON.parse(req.body.tags || '[]'); } catch { tags = []; }
    tags = [...new Set(tags.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (tags.length) {
      const placeholders = tags.map(() => '?').join(',');
      const valid = db.prepare(`SELECT id FROM users WHERE id IN (${placeholders}) AND is_admin = 0 AND is_guide = 0`).all(...tags);
      tags = valid.map((v) => v.id);
    }
    tags = tags.filter((t) => t !== req.user.id);

    // 인원수 미션 검증 (본인 + 태그)
    const need = { duo: 2, trio: 3, quad: 4 }[mission];
    if (need) {
      const total = tags.length + 1;
      if (mission === 'quad' ? total < 4 : total !== need) {
        cleanup();
        return res.status(400).json({
          error: mission === 'quad'
            ? '4인 이상 미션은 본인 포함 4명 이상을 선택해야 합니다.'
            : `${need}인 미션은 본인 포함 정확히 ${need}명을 선택해야 합니다. (현재 ${total}명)`,
        });
      }
    }

    // 저장 경로: uploads/{일차_순서_방문지}/{미션폴더}/{이름}_{시각}_{랜덤}.ext
    const ext = (isVideo ? VIDEO_EXT[mime] : PHOTO_EXT[mime])
      || path.extname(file.originalname || '').toLowerCase()
      || (isVideo ? '.mp4' : '.jpg');
    const rel = path.join(place.folder, MISSION_FOLDER[mission]);
    const dir = path.join(UPLOAD_DIR, rel);
    fs.mkdirSync(dir, { recursive: true });

    const token = crypto.randomBytes(3).toString('hex');
    const fname = `${safeName(req.user.name)}_${stamp()}_${token}${ext}`;
    const dest = path.join(dir, fname);
    fs.renameSync(file.path, dest);
    const relFile = path.join(rel, fname).replace(/\\/g, '/');

    let relThumb = null;
    if (thumb) {
      const tname = `${token}_${Date.now()}.jpg`;
      fs.renameSync(thumb.path, path.join(THUMB_DIR, tname));
      relThumb = tname;
    } else {
      // 휴대폰이 썸네일을 못 만든 경우(아이폰 .mov/HEVC, HEIC 디코드 실패 등).
      // 서버에서 뽑아 둔다. 없으면 갤러리 격자에 원본이 그대로 나간다.
      relThumb = await makeThumb(dest, isVideo);
    }

    const fields = {
      user_id: req.user.id,
      place_slug: placeSlug,
      mission,
      media_type: isVideo ? 'video' : 'photo',
      file_path: relFile,
      thumb_path: relThumb,
      original_name: (file.originalname || '').slice(0, 200),
      mime,
      bytes: file.size,
      width: Number(req.body.width) || null,
      height: Number(req.body.height) || null,
      duration: Number(req.body.duration) || null,
      caption: String(req.body.caption || '').slice(0, 300) || null,
      taken_at: req.body.takenAt ? String(req.body.takenAt).slice(0, 40) : null,
      client_uid: clientUid,
    };

    /**
     * 미션 한 칸에는 사진(영상) 한 장만 남깁니다.
     * 같은 방문지·같은 미션에 다시 올리면 이전 것을 교체합니다.
     * — 여행 후 자료를 고르는 부담을 줄이기 위한 규칙 (운영진의 단체사진·브이로그는 예외)
     */
    const previous = isAdminMission ? null : db.prepare(
      'SELECT * FROM uploads WHERE user_id = ? AND place_slug = ? AND mission = ?'
    ).get(req.user.id, placeSlug, mission);

    let uploadId;
    const saveTx = db.transaction(() => {
      if (previous) {
        db.prepare(`
          UPDATE uploads SET
            media_type=@media_type, file_path=@file_path, thumb_path=@thumb_path,
            original_name=@original_name, mime=@mime, bytes=@bytes,
            width=@width, height=@height, duration=@duration,
            caption=@caption, taken_at=@taken_at, client_uid=@client_uid,
            updated_at=datetime('now','localtime')
          WHERE id=@id
        `).run({ ...fields, id: previous.id });
        uploadId = previous.id;
        db.prepare('DELETE FROM upload_tags WHERE upload_id = ?').run(uploadId);
      } else {
        const info = db.prepare(`
          INSERT INTO uploads (user_id, place_slug, mission, media_type, file_path, thumb_path,
                               original_name, mime, bytes, width, height, duration, caption, taken_at, client_uid)
          VALUES (@user_id, @place_slug, @mission, @media_type, @file_path, @thumb_path,
                  @original_name, @mime, @bytes, @width, @height, @duration, @caption, @taken_at, @client_uid)
        `).run(fields);
        uploadId = Number(info.lastInsertRowid);
      }
      if (tags.length) {
        const ins = db.prepare('INSERT OR IGNORE INTO upload_tags (upload_id, user_id) VALUES (?, ?)');
        tags.forEach((t) => ins.run(uploadId, t));
      }
    });
    saveTx();

    // 교체된 경우 이전 파일은 디스크에서 지운다
    if (previous) {
      fs.promises.unlink(path.join(UPLOAD_DIR, previous.file_path)).catch(() => {});
      if (previous.thumb_path) {
        fs.promises.unlink(path.join(THUMB_DIR, previous.thumb_path)).catch(() => {});
      }
    }

    const scored = awardForUpload({
      userId: req.user.id,
      uploadId,
      placeSlug,
      mission,
      taggedIds: tags,
      isAdminMission,
    });

    res.json({
      ok: true,
      id: uploadId,
      replaced: !!previous,
      points: scored.total,
      events: scored.events,
    });
  } catch (err) {
    cleanup();
    console.error('[upload]', err);
    res.status(500).json({ error: '업로드 중 오류가 발생했습니다.' });
  }
});

router.delete('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '이미 삭제되었습니다.' });
  if (row.user_id !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: '본인이 올린 자료만 삭제할 수 있습니다.' });
  }
  db.prepare('DELETE FROM uploads WHERE id = ?').run(row.id);
  fs.promises.unlink(path.join(UPLOAD_DIR, row.file_path)).catch(() => {});
  if (row.thumb_path) fs.promises.unlink(path.join(THUMB_DIR, row.thumb_path)).catch(() => {});
  res.json({ ok: true });
});

/** 캡션 수정 */
router.patch('/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM uploads WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: '찾을 수 없습니다.' });
  if (row.user_id !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: '권한이 없습니다.' });
  }
  db.prepare('UPDATE uploads SET caption = ? WHERE id = ?')
    .run(String(req.body?.caption || '').slice(0, 300) || null, row.id);
  res.json({ ok: true });
});

export default router;
