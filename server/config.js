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

export const PORT = Number(process.env.PORT || 3000);
export const HOST = process.env.HOST || '0.0.0.0';
export const SESSION_SECRET =
  process.env.SESSION_SECRET || 'baekdu-icca-2026-change-me-in-env';

/** 관리자 계정 (참가자와 분리된 별도 계정) */
export const ADMIN_ID = process.env.ADMIN_ID || 'admin';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'baekdu2026!';

/** 업로드 용량 제한 (바이트) */
export const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 400 * 1024 * 1024);
