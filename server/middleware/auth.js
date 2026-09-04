import db from '../db.js';

const qUser = db.prepare(
  `SELECT id, name, gi, bus, grp, roles, single_room, is_admin, pw_changed
   FROM users WHERE id = ?`
);

export function loadUser(req, _res, next) {
  req.user = null;
  const uid = req.session?.uid;
  if (uid) {
    const u = qUser.get(uid);
    if (u) {
      req.user = {
        id: u.id,
        name: u.name,
        gi: u.gi,
        bus: u.bus,
        group: u.grp,
        roles: JSON.parse(u.roles || '[]'),
        singleRoom: !!u.single_room,
        isAdmin: !!u.is_admin,
        pwChanged: !!u.pw_changed,
      };
    }
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: '로그인이 필요합니다.' });
  if (!req.user.isAdmin) return res.status(403).json({ error: '운영진만 사용할 수 있습니다.' });
  next();
}
