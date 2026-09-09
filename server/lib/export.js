/**
 * 사진·영상 내보내기 (ZIP).
 *
 * 여행이 끝나면 75명이 비슷한 시각에 "내 사진 받기" 를 누른다. ZIP 을 만드는 동안
 * 파일을 통째로 읽어 내보내므로, 동시에 여러 개가 돌면 맥 한 대로는 감당이 안 되고
 * 현지 회선도 나눠 쓰게 되어 모두가 느려진다.
 * 그래서 한 번에 하나씩만 만들고 나머지는 차례를 기다리게 한다.
 */
import archiver from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import db from '../db.js';
import { UPLOAD_DIR } from '../config.js';

/** 동시에 기다릴 수 있는 최대 인원. 넘으면 지금은 거절하고 나중에 다시 누르게 한다. */
export const MAX_QUEUE = 8;

let chain = Promise.resolve();
let waiting = 0;

/** 지금 만들고 있거나 차례를 기다리는 건수 */
export const queueDepth = () => waiting;

/**
 * 차례를 기다렸다가 job 을 실행한다.
 * @returns {Promise<boolean>} 자리가 없으면 false (job 은 실행되지 않는다)
 */
export async function queueExport(job) {
  if (waiting >= MAX_QUEUE) return false;
  waiting += 1;
  const mine = chain.then(job, job);
  // 앞 작업이 실패해도 뒤 차례가 막히지 않도록 사슬은 항상 이어둔다
  chain = mine.catch(() => {});
  try {
    await mine;
  } finally {
    waiting -= 1;
  }
  return true;
}

/**
 * ZIP 을 만들어 응답으로 흘려보낸다.
 * 다 보내거나(또는 받는 쪽이 끊거나) 나면 끝난다 — 그래야 다음 차례가 시작된다.
 */
export function streamZip(res, { files, zipName, manifestCsv, readme }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (!done) { done = true; resolve(); } };

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition',
      `attachment; filename="${encodeURIComponent(zipName)}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);

    // 사진·영상은 이미 압축돼 있어 다시 압축해도 커지지 않는다. 담기만 한다.
    const zip = archiver('zip', { zlib: { level: 0 } });
    zip.on('error', (err) => { console.error('[zip]', err); res.destroy(err); finish(); });
    res.on('close', finish);
    res.on('finish', finish);
    zip.pipe(res);

    for (const f of files) {
      const abs = path.join(UPLOAD_DIR, f);
      if (fs.existsSync(abs)) zip.file(abs, { name: f });
    }
    if (manifestCsv) zip.append(manifestCsv, { name: '_manifest.csv' });
    if (readme) zip.append(readme, { name: '_읽어주세요.txt' });
    zip.finalize();
  });
}

/**
 * 한 사람의 자료 고르기.
 * @param {'mine'|'in'|'both'} scope 올린 것 / 나온 것 / 둘 다
 */
export function uploadsOf(userId, scope = 'both') {
  const mine = 'SELECT up.id, up.file_path FROM uploads up WHERE up.user_id = ?';
  const appeared = `SELECT up.id, up.file_path FROM uploads up
      JOIN upload_tags t ON t.upload_id = up.id WHERE t.user_id = ?`;
  if (scope === 'mine') return db.prepare(`${mine} ORDER BY up.id`).all(userId);
  if (scope === 'in') return db.prepare(`${appeared} ORDER BY up.id`).all(userId);
  // 내가 올리면서 나도 찍힌 사진은 한 번만
  return db.prepare(`${mine} UNION ${appeared} ORDER BY id`).all(userId, userId);
}

/** 고른 자료의 총 용량(바이트). 받기 전에 얼마나 큰지 알려주려고 쓴다. */
export function totalBytes(ids) {
  if (!ids.length) return 0;
  return db.prepare(
    `SELECT COALESCE(SUM(bytes), 0) AS n FROM uploads WHERE id IN (${ids.map(() => '?').join(',')})`
  ).get(...ids).n;
}

/** @param {number[]|null} ids 주면 그 자료만. 개인에게 보낼 때는 남의 것이 섞이면 안 된다. */
export function manifestRows(ids = null) {
  const clause = ids ? `WHERE up.id IN (${ids.map(() => '?').join(',')})` : '';
  const rows = db.prepare(`
    SELECT up.id, p.day, p.seq, p.title AS place, up.place_slug, up.mission,
           up.media_type, up.file_path, up.caption, up.bytes, up.duration,
           up.taken_at, up.created_at, u.name AS uploader, u.grp AS grp
    FROM uploads up
    JOIN users u ON u.id = up.user_id
    JOIN places p ON p.slug = up.place_slug
    ${clause}
    ORDER BY p.day, p.seq, up.mission, up.id
  `).all(...(ids || []));
  const tagMap = new Map();
  for (const t of db.prepare(
    `SELECT t.upload_id, u.name FROM upload_tags t JOIN users u ON u.id = t.user_id`
  ).all()) {
    if (!tagMap.has(t.upload_id)) tagMap.set(t.upload_id, []);
    tagMap.get(t.upload_id).push(t.name);
  }
  return rows.map((r) => ({ ...r, tags: (tagMap.get(r.id) || []).join(' ') }));
}

export const MISSION_LABEL = {
  solo: '독사진', duo: '2인', trio: '3인', quad: '4인이상',
  video: '영상', group: '단체사진', vlog: '브이로그',
};

export function toCsv(rows) {
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
