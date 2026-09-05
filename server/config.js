import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '..');

dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

export const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(ROOT, process.env.DATA_DIR)
  : path.join(ROOT, 'data');

export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
export const THUMB_DIR = path.join(DATA_DIR, 'thumbs');
export const TMP_DIR = path.join(DATA_DIR, 'tmp');
export const DB_FILE = path.join(DATA_DIR, 'baekdu.db');
export const PUBLIC_DIR = path.join(ROOT, 'public');

for (const dir of [DATA_DIR, UPLOAD_DIR, THUMB_DIR, TMP_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

export const PORT = Number(process.env.PORT || 8080);
export const HOST = process.env.HOST || '0.0.0.0';
export const SESSION_SECRET =
  process.env.SESSION_SECRET || 'baekdu-icca-2026-change-me-in-env';

/** 관리자 계정 (참가자와 분리된 별도 계정) */
export const ADMIN_ID = process.env.ADMIN_ID || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'baekdu2026!';

/** 업로드 용량 제한 (바이트) */
/** 업로드 최대 용량 (같은 와이파이로 직접 올릴 때 기준) */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 400 * 1024 * 1024);

/**
 * Cloudflare 터널을 거쳐 들어올 때의 한도.
 *
 * 무료 플랜은 요청 본문을 약 100MB 에서 잘라 413 을 돌려준다.
 * (실측: 99MB 통과 / 105MB 는 3MB 만 받고 413)
 * 같은 와이파이에서 직접 올리면 이 제한이 없으므로, 접속 경로에 따라
 * 다른 값을 앱에 알려준다.
 */
export const TUNNEL_UPLOAD_LIMIT = Number(process.env.TUNNEL_UPLOAD_LIMIT || 95 * 1024 * 1024);
