import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { logActivity } from '../lib/activity.js';
import { PLACES, DAYS, MISSIONS, FREE_MISSIONS, ADMIN_MISSIONS } from '../data/places.js';
import { GROUPS, BUSES, DAY3_BUS_BY_GROUP } from '../data/participants.js';
import { TRIP, CONTACTS, ALERTS, PREP, FEES, SPONSORS, SHUTTLE } from '../data/guide.js';
import { RULES } from '../lib/scoring.js';
import { MAX_UPLOAD_BYTES, TUNNEL_UPLOAD_LIMIT } from '../config.js';

const router = express.Router();

/** 로그인 전에도 보이는 최소 정보 (로그인 화면 헤더용) */
router.get('/trip', (_req, res) => {
  res.json({
    title: TRIP.title,
    org: TRIP.org,
    startDate: TRIP.startDate,
    endDate: TRIP.endDate,
  });
});

router.use(requireAuth);

router.get('/bundle', (req, res) => {
  const noticeRows = db.prepare(
    'SELECT id, title, body, pinned, author, created_at FROM notices ORDER BY pinned DESC, id DESC LIMIT 30'
  ).all();

  res.json({
    trip: TRIP,
    days: DAYS,
    places: PLACES,
    missions: MISSIONS,
    // Cloudflare 를 거쳐 들어왔으면(cf-ray 헤더) 엣지 제한이 먼저 걸린다
    maxUploadBytes: req.headers['cf-ray']
      ? Math.min(MAX_UPLOAD_BYTES, TUNNEL_UPLOAD_LIMIT)
      : MAX_UPLOAD_BYTES,
    freeMissions: FREE_MISSIONS,
    adminMissions: ADMIN_MISSIONS,
    rules: RULES,
    groups: GROUPS,
    buses: BUSES,
    day3BusByGroup: DAY3_BUS_BY_GROUP,
    contacts: CONTACTS,
    alerts: ALERTS,
    prep: PREP,
    fees: FEES,
    sponsors: SPONSORS,
    shuttle: SHUTTLE,
    notices: noticeRows,
  });
});

/** 화면을 열었다는 기록. 앱이 화면을 바꿀 때마다 한 번씩 보낸다. */
const VIEWS = ['home', 'schedule', 'mission', 'gallery', 'rank', 'guide', 'help', 'me', 'admin'];
router.post('/activity', (req, res) => {
  const view = String(req.body?.view || '');
  if (VIEWS.includes(view)) logActivity(req.user.id, 'view', view);
  res.status(204).end();
});

/** 태그(함께 찍은 사람) 선택용 명단 — 연락처는 포함하지 않음 */
router.get('/participants', (_req, res) => {
  const rows = db.prepare(
    `SELECT id, name, gi, bus, grp, roles FROM users
     WHERE is_admin = 0 AND is_guide = 0 ORDER BY grp, sort_no`
  ).all();
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, gi: r.gi, bus: r.bus, group: r.grp,
    roles: JSON.parse(r.roles || '[]'),
  })));
});

export default router;
