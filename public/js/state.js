import { api } from './api.js';

export const S = {
  user: null,
  bundle: null,        // 여행 정보 일체
  participants: [],
  byId: new Map(),
  placeBySlug: new Map(),
  progress: null,      // { places: [...] }
  summary: null,       // 내 점수/배지
};

export async function loadMe() {
  const { user } = await api.get('/api/auth/me');
  S.user = user;
  return user;
}

export async function loadBundle() {
  const [bundle, people] = await Promise.all([
    api.get('/api/bundle'),
    api.get('/api/participants'),
  ]);
  S.bundle = bundle;
  S.participants = people;
  S.byId = new Map(people.map((p) => [p.id, p]));
  S.placeBySlug = new Map(bundle.places.map((p) => [p.slug, p]));
  return bundle;
}

export async function refreshProgress() {
  const [progress, summary] = await Promise.all([
    api.get('/api/progress'),
    api.get('/api/me/summary'),
  ]);
  S.progress = progress;
  S.summary = summary;
  return { progress, summary };
}

export function progressOf(slug) {
  return S.progress?.places.find((p) => p.slug === slug)
    || { slug, mine: {}, myCount: 0, conquered: false, missionDone: 0, all: { count: 0, people: 0 } };
}

export const missionMeta = (key) =>
  S.bundle?.missions.find((m) => m.key === key)
  || S.bundle?.adminMissions.find((m) => m.key === key)
  || { key, label: key, emoji: '📎' };

/** 여행 기준 오늘이 며칠차인가 (0 = 아직 출발 전, 5 = 종료) */
export function tripDay(now = new Date()) {
  const start = new Date(`${S.bundle.trip.startDate}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((today - start) / 86400000);
  if (diff < 0) return 0;
  return Math.min(diff + 1, 5);
}
