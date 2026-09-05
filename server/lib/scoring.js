import db from '../db.js';
import { MISSIONS, FREE_MISSIONS, CONQUER_KEYS, MEMBER_MISSION_KEYS, PLACES } from '../data/places.js';

const BASE = Object.fromEntries([...MISSIONS, ...FREE_MISSIONS].map((m) => [m.key, m.points]));

export const RULES = {
  base: BASE,
  tagBonusPerPerson: 5,
  tagBonusMaxPeople: 10,
  appearBonus: 3,          // 사진에 "찍힌" 사람이 받는 점수
  firstPlaceBonus: [30, 20, 10], // 방문지별 선착순 1·2·3등
  conquerBonus: 100,       // 한 방문지에서 6가지 미션 모두 달성
  dayClearBonus: 50,       // 해당 일차의 모든 방문지에 1장 이상
  fullClearBonus: 200,     // 전 일정 모든 방문지에 1장 이상
};

const insertEvent = db.prepare(
  `INSERT OR IGNORE INTO score_events (user_id, upload_id, kind, place_slug, points, memo)
   VALUES (?, ?, ?, ?, ?, ?)`
);

function award(userId, uploadId, kind, placeSlug, points, memo) {
  if (!points) return null;
  const res = insertEvent.run(userId, uploadId, kind, placeSlug, points, memo);
  return res.changes ? { kind, placeSlug, points, memo } : null;
}

const qPlace = db.prepare('SELECT * FROM places WHERE slug = ?');
const qMyMissionsAtPlace = db.prepare(
  `SELECT DISTINCT mission FROM uploads WHERE user_id = ? AND place_slug = ?`
);
const qDistinctEarlyUsers = db.prepare(
  `SELECT user_id, MIN(created_at) AS t FROM uploads
   WHERE place_slug = ? AND mission IN (${MEMBER_MISSION_KEYS.map(() => '?').join(',')})
   GROUP BY user_id ORDER BY t ASC LIMIT 3`
);
const qMyPlaces = db.prepare(
  `SELECT DISTINCT place_slug FROM uploads WHERE user_id = ?`
);

/**
 * 업로드 1건에 대한 점수 계산 및 지급.
 * @returns {{total:number, events:Array}}
 */
export function awardForUpload({ userId, uploadId, placeSlug, mission, taggedIds = [], isAdminMission = false }) {
  const place = qPlace.get(placeSlug);
  const boost = place?.boost ?? 1;
  const events = [];

  if (isAdminMission) {
    // 운영진 업로드(단체사진·브이로그)는 점수 경쟁에서 제외
    return { total: 0, events };
  }

  // 0) 교체(같은 미션 칸에 다시 올림)인 경우 이전 업로드분 점수를 걷어낸다.
  //    선착순·정복 등 보너스는 그대로 두어 이미 받은 점수가 사라지지 않게 한다.
  db.prepare(
    `DELETE FROM score_events WHERE upload_id = ? AND kind IN ('upload','tagged')`
  ).run(uploadId);

  // 1) 기본 점수
  const base = Math.round((BASE[mission] ?? 0) * boost);
  const tagCount = Math.min(taggedIds.length, RULES.tagBonusMaxPeople);
  const tagBonus = Math.round(tagCount * RULES.tagBonusPerPerson * boost);
  const uploadPoints = base + tagBonus;
  db.prepare('UPDATE uploads SET points = ? WHERE id = ?').run(uploadPoints, uploadId);
  db.prepare(
    `INSERT INTO score_events (user_id, upload_id, kind, place_slug, points, memo)
     VALUES (?, ?, 'upload', ?, ?, ?)`
  ).run(userId, uploadId, placeSlug, uploadPoints,
    `${mission}${tagCount ? ` +태그${tagCount}명` : ''}${boost > 1 ? ' (핵심 스팟 ×2)' : ''}`);
  events.push({ kind: 'upload', points: uploadPoints, memo: mission });

  // 2) 사진에 찍힌 사람에게도 출연 점수
  for (const tid of taggedIds) {
    if (tid === userId) continue;
    db.prepare(
      `INSERT INTO score_events (user_id, upload_id, kind, place_slug, points, memo)
       VALUES (?, ?, 'tagged', ?, ?, ?)`
    ).run(tid, uploadId, placeSlug, RULES.appearBonus, '사진 출연');
  }

  // 3) 방문지 선착순 보너스
  const early = qDistinctEarlyUsers.all(placeSlug, ...MEMBER_MISSION_KEYS);
  const rank = early.findIndex((r) => r.user_id === userId);
  if (rank >= 0 && rank < RULES.firstPlaceBonus.length) {
    const pts = Math.round(RULES.firstPlaceBonus[rank] * boost);
    const ev = award(userId, uploadId, 'first', placeSlug, pts, `${place?.title ?? placeSlug} 선착순 ${rank + 1}등`);
    if (ev) events.push(ev);
  }

  // 4) 방문지 정복 (1인·2인·3인·4인+·장소/풍경·영상 모두)
  const mine = new Set(qMyMissionsAtPlace.all(userId, placeSlug).map((r) => r.mission));
  if (CONQUER_KEYS.every((k) => mine.has(k))) {
    const pts = Math.round(RULES.conquerBonus * boost);
    const ev = award(userId, uploadId, 'conquer', placeSlug, pts, `${place?.title ?? placeSlug} 정복!`);
    if (ev) events.push(ev);
  }

  // 5) 일차 완주 / 전 일정 완주
  const visited = new Set(qMyPlaces.all(userId).map((r) => r.place_slug));
  if (place && place.day > 0) {
    const dayPlaces = PLACES.filter((p) => p.day === place.day).map((p) => p.slug);
    if (dayPlaces.every((s) => visited.has(s))) {
      const ev = award(userId, uploadId, 'day_clear', `day${place.day}`, RULES.dayClearBonus, `${place.day}일차 완주`);
      if (ev) events.push(ev);
    }
  }
  const allPlaces = PLACES.filter((p) => p.day > 0).map((p) => p.slug);
  if (allPlaces.every((s) => visited.has(s))) {
    const ev = award(userId, uploadId, 'full_clear', 'ALL', RULES.fullClearBonus, '전 일정 완주');
    if (ev) events.push(ev);
  }

  const total = events.reduce((a, e) => a + e.points, 0);
  return { total, events };
}

/** 업로드 삭제 시 점수 이벤트도 함께 사라지도록(FK CASCADE) — 보너스는 회수하지 않음 */

export function userScore(userId) {
  return db.prepare('SELECT COALESCE(SUM(points),0) AS s FROM score_events WHERE user_id = ?').get(userId).s;
}

export function leaderboard({ groupId = null, limit = 100 } = {}) {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.gi, u.grp, u.bus, u.is_admin,
           COALESCE(s.pts, 0)  AS score,
           COALESCE(c.cnt, 0)  AS uploads,
           COALESCE(c.places, 0) AS places
    FROM users u
    LEFT JOIN (SELECT user_id, SUM(points) pts FROM score_events GROUP BY user_id) s ON s.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) cnt, COUNT(DISTINCT place_slug) places FROM uploads GROUP BY user_id) c ON c.user_id = u.id
    WHERE u.is_admin = 0 ${groupId ? 'AND u.grp = ?' : ''}
    ORDER BY score DESC, uploads DESC, u.name ASC
    LIMIT ?
  `);
  const list = groupId ? rows.all(groupId, limit) : rows.all(limit);
  let rank = 0, prev = null, seen = 0;
  return list.map((r) => {
    seen += 1;
    if (r.score !== prev) { rank = seen; prev = r.score; }
    return { ...r, rank };
  });
}

export function groupBoard() {
  return db.prepare(`
    SELECT u.grp AS grp,
           COUNT(DISTINCT u.id) AS members,
           COALESCE(SUM(s.pts), 0) AS score,
           COALESCE(SUM(c.cnt), 0) AS uploads
    FROM users u
    LEFT JOIN (SELECT user_id, SUM(points) pts FROM score_events GROUP BY user_id) s ON s.user_id = u.id
    LEFT JOIN (SELECT user_id, COUNT(*) cnt FROM uploads GROUP BY user_id) c ON c.user_id = u.id
    WHERE u.is_admin = 0 AND u.grp > 0
    GROUP BY u.grp
    ORDER BY score DESC
  `).all().map((r) => ({
    ...r,
    avg: r.members ? Math.round(r.score / r.members) : 0,
  }));
}

const BADGE_DEFS = [
  { key: 'first_step', emoji: '🥾', name: '첫걸음', desc: '첫 업로드 완료' },
  { key: 'selfie',     emoji: '🤳', name: '셀카왕', desc: '독사진 10장' },
  { key: 'network',    emoji: '🤝', name: '인맥왕', desc: '태그 누적 30명' },
  { key: 'conqueror',  emoji: '🏔️', name: '정복자', desc: '한 방문지 6미션 올클리어' },
  { key: 'director',   emoji: '🎬', name: '감독',   desc: '영상 5개 업로드' },
  { key: 'lightning',  emoji: '⚡', name: '번개',   desc: '방문지 선착순 1등 3회' },
  { key: 'diligent',   emoji: '📅', name: '개근상', desc: '4일 모두 업로드' },
  { key: 'summit',     emoji: '👑', name: '백두산 정복왕', desc: '핵심 스팟 전부 업로드' },
  { key: 'allclear',   emoji: '🌟', name: '올클리어', desc: '모든 방문지 업로드' },
];

export function badgesFor(userId) {
  const st = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM uploads WHERE user_id=@u) AS total,
      (SELECT COUNT(*) FROM uploads WHERE user_id=@u AND mission='solo') AS solo,
      (SELECT COUNT(*) FROM uploads WHERE user_id=@u AND mission='video') AS video,
      (SELECT COUNT(*) FROM upload_tags t JOIN uploads up ON up.id=t.upload_id WHERE up.user_id=@u) AS tags,
      (SELECT COUNT(*) FROM score_events WHERE user_id=@u AND kind='conquer') AS conquers,
      (SELECT COUNT(*) FROM score_events WHERE user_id=@u AND kind='first' AND memo LIKE '%1등') AS firsts,
      (SELECT COUNT(DISTINCT p.day) FROM uploads up JOIN places p ON p.slug=up.place_slug WHERE up.user_id=@u AND p.day>0) AS days,
      (SELECT COUNT(DISTINCT up.place_slug) FROM uploads up JOIN places p ON p.slug=up.place_slug WHERE up.user_id=@u AND p.boost>1) AS boostPlaces,
      (SELECT COUNT(DISTINCT up.place_slug) FROM uploads up JOIN places p ON p.slug=up.place_slug WHERE up.user_id=@u AND p.day>0) AS dayPlaces
  `).get({ u: userId });

  const boostTotal = PLACES.filter((p) => p.boost > 1).length;
  const placeTotal = PLACES.filter((p) => p.day > 0).length;

  const got = {
    first_step: st.total >= 1,
    selfie: st.solo >= 10,
    network: st.tags >= 30,
    conqueror: st.conquers >= 1,
    director: st.video >= 5,
    lightning: st.firsts >= 3,
    diligent: st.days >= 4,
    summit: st.boostPlaces >= boostTotal,
    allclear: st.dayPlaces >= placeTotal,
  };
  return BADGE_DEFS.map((b) => ({ ...b, earned: !!got[b.key] }));
}
