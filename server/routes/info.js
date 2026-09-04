import express from 'express';
import db from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { PLACES, DAYS, MISSIONS, ADMIN_MISSIONS } from '../data/places.js';
import { GROUPS, BUSES, DAY3_BUS_BY_GROUP } from '../data/participants.js';
import { TRIP, CONTACTS, ALERTS, PREP, FEES, SPONSORS, SHUTTLE } from '../data/guide.js';
import { RULES } from '../lib/scoring.js';

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

/** 태그(함께 찍은 사람) 선택용 명단 — 연락처는 포함하지 않음 */
router.get('/participants', (_req, res) => {
  const rows = db.prepare(
    `SELECT id, name, gi, bus, grp, roles FROM users
     WHERE is_admin = 0 ORDER BY grp, sort_no`
  ).all();
  res.json(rows.map((r) => ({
    id: r.id, name: r.name, gi: r.gi, bus: r.bus, group: r.grp,
    roles: JSON.parse(r.roles || '[]'),
  })));
});

export default router;
