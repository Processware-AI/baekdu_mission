import Database from 'better-sqlite3';
import { DB_FILE } from './config.js';

export const db = new Database(DB_FILE);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  name          TEXT    NOT NULL UNIQUE,   -- 로그인 ID (성명)
  alias         TEXT,                      -- 다른 자료의 표기 (로그인 허용)
  phone         TEXT,                      -- 연락처 (관리자만 조회)
  password_hash TEXT    NOT NULL,
  gi            TEXT,                      -- 기수
  bus           INTEGER,                   -- 호차
  grp           INTEGER,                   -- 조 (0 = 미배정/인솔)
  roles         TEXT,                      -- JSON 배열
  single_room   INTEGER NOT NULL DEFAULT 0,
  is_admin      INTEGER NOT NULL DEFAULT 0,
  pw_changed    INTEGER NOT NULL DEFAULT 0,
  sort_no       INTEGER,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS places (
  slug   TEXT PRIMARY KEY,
  day    INTEGER NOT NULL,
  seq    INTEGER NOT NULL,
  time   TEXT,
  title  TEXT NOT NULL,
  area   TEXT,
  emoji  TEXT,
  boost  REAL NOT NULL DEFAULT 1,
  descr  TEXT,
  tip    TEXT,
  folder TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS uploads (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  place_slug    TEXT    NOT NULL REFERENCES places(slug),
  mission       TEXT    NOT NULL,          -- solo|duo|trio|quad|video|group|vlog
  media_type    TEXT    NOT NULL,          -- photo|video
  file_path     TEXT    NOT NULL,          -- data/uploads 기준 상대경로
  thumb_path    TEXT,                      -- data/thumbs 기준 상대경로
  original_name TEXT,
  mime          TEXT,
  bytes         INTEGER NOT NULL DEFAULT 0,
  width         INTEGER,
  height        INTEGER,
  duration      REAL,
  caption       TEXT,
  taken_at      TEXT,
  points        INTEGER NOT NULL DEFAULT 0,
  client_uid    TEXT,                      -- 오프라인 큐 중복 업로드 방지
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_uploads_user  ON uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_place ON uploads(place_slug, mission);
CREATE INDEX IF NOT EXISTS idx_uploads_time  ON uploads(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_uploads_clientuid ON uploads(user_id, client_uid)
  WHERE client_uid IS NOT NULL;

CREATE TABLE IF NOT EXISTS upload_tags (
  upload_id INTEGER NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (upload_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tags_user ON upload_tags(user_id);

CREATE TABLE IF NOT EXISTS score_events (
  id         INTEGER PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  upload_id  INTEGER REFERENCES uploads(id) ON DELETE CASCADE,
  kind       TEXT    NOT NULL,   -- upload|tagged|conquer|first|day_clear|full_clear|manual
  place_slug TEXT,
  points     INTEGER NOT NULL,
  memo       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_score_user ON score_events(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_score_once
  ON score_events(user_id, kind, place_slug)
  WHERE kind IN ('conquer','first','day_clear','full_clear');

CREATE TABLE IF NOT EXISTS notices (
  id         INTEGER PRIMARY KEY,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  pinned     INTEGER NOT NULL DEFAULT 0,
  author     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS sessions (
  sid    TEXT PRIMARY KEY,
  sess   TEXT NOT NULL,
  expire INTEGER NOT NULL
);
`);

/**
 * 가벼운 마이그레이션 — 이미 만들어진 DB에도 새 컬럼을 안전하게 추가한다.
 * (CREATE TABLE IF NOT EXISTS 만으로는 컬럼 추가가 반영되지 않으므로)
 */
function addColumn(table, column, decl) {
  const has = db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
  if (!has) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}
addColumn('uploads', 'updated_at', 'TEXT');   // 미션 슬롯을 교체한 시각

export default db;
