import session from 'express-session';
import db from '../db.js';

const Store = session.Store;

/** better-sqlite3 위에 올린 초경량 세션 스토어 (드라이버 중복 방지) */
export class SqliteStore extends Store {
  constructor() {
    super();
    this.get_ = db.prepare('SELECT sess, expire FROM sessions WHERE sid = ?');
    this.set_ = db.prepare(
      `INSERT INTO sessions (sid, sess, expire) VALUES (?, ?, ?)
       ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expire = excluded.expire`
    );
    this.del_ = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touch_ = db.prepare('UPDATE sessions SET expire = ? WHERE sid = ?');
    this.gc_ = db.prepare('DELETE FROM sessions WHERE expire < ?');
    this.timer = setInterval(() => this.gc(), 60 * 60 * 1000);
    this.timer.unref?.();
    this.gc();
  }

  gc() {
    try { this.gc_.run(Date.now()); } catch { /* ignore */ }
  }

  expiryOf(sess) {
    const ms = sess?.cookie?.maxAge ?? 1000 * 60 * 60 * 24 * 30;
    return Date.now() + ms;
  }

  get(sid, cb) {
    try {
      const row = this.get_.get(sid);
      if (!row) return cb(null, null);
      if (row.expire < Date.now()) { this.del_.run(sid); return cb(null, null); }
      cb(null, JSON.parse(row.sess));
    } catch (e) { cb(e); }
  }

  set(sid, sess, cb) {
    try {
      this.set_.run(sid, JSON.stringify(sess), this.expiryOf(sess));
      cb?.(null);
    } catch (e) { cb?.(e); }
  }

  destroy(sid, cb) {
    try { this.del_.run(sid); cb?.(null); } catch (e) { cb?.(e); }
  }

  touch(sid, sess, cb) {
    try { this.touch_.run(this.expiryOf(sess), sid); cb?.(null); } catch (e) { cb?.(e); }
  }
}
