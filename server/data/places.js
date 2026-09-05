/**
 * 여행 방문지 (사진/영상 업로드 분류 기준)
 *
 * slug   : 파일 폴더명 및 URL에 쓰이는 식별자
 * folder : 실제 저장 폴더명 (한글 — 나중에 탐색기에서 바로 분류된 상태로 보임)
 * boost  : 점수 배율 (핵심 스팟은 2배)
 * img    : 대표 사진 (public/img/) — 여행사 일정표의 실사진에서 추출
 */

export const MISSIONS = [
  { key: 'solo',  label: '독사진',     short: '1인',   people: 1,  points: 10, emoji: '🤳', desc: '나 혼자 나온 사진 (셀카 OK)' },
  { key: 'duo',   label: '2인 사진',   short: '2인',   people: 2,  points: 25, emoji: '👬', desc: '나 포함 정확히 2명' },
  { key: 'trio',  label: '3인 사진',   short: '3인',   people: 3,  points: 45, emoji: '👨‍👩‍👦', desc: '나 포함 정확히 3명' },
  { key: 'quad',  label: '4인 이상',   short: '4인+',  people: 4,  points: 70, emoji: '👨‍👩‍👧‍👦', desc: '나 포함 4명 이상' },
  { key: 'scenery', label: '장소/풍경', short: '풍경', people: 0, points: 15, emoji: '🏞️', desc: '사람 없이 장소와 풍경만 — 쇼츠의 오프닝 컷이 됩니다' },
  { key: 'video', label: '영상',       short: '영상',  people: 0,  points: 40, emoji: '🎥', video: true, desc: '10~60초 짧은 영상이 편집하기 가장 좋아요' },
];

/**
 * '자유 / 기타' 방문지 전용 미션.
 *
 * 버스 안이나 길거리에서 찍은 자투리 컷을 1인·2인·3인으로 나누는 건 의미가 없다.
 * 대신 "무엇을 찍을까"를 주제로 제시하고, 코멘트를 곁들이게 한다.
 * 여행이 끝나고 쇼츠를 만들 때 이 코멘트가 장면의 맥락이 된다.
 *
 * example : 코멘트 입력칸에 보여줄 예시 문장
 */
export const FREE_MISSIONS = [
  { key: 'free-bus', label: '이동 중', short: '이동 중', points: 15, emoji: '🚌',
    desc: '버스·비행기 안, 차창 밖으로 흘러가는 풍경',
    example: '창밖으로 만주 벌판이 끝없이 이어졌다' },
  { key: 'free-food', label: '먹거리', short: '먹거리', points: 15, emoji: '🍜',
    desc: '식당 상차림, 길거리 간식, 온천 계란',
    example: '온천 계란 처음 먹어봤는데 고소하다' },
  { key: 'free-stay', label: '숙소', short: '숙소', points: 15, emoji: '🏨',
    desc: '호텔 로비, 방에서 내다본 창밖',
    example: '방에서 내다본 이도백하의 아침' },
  { key: 'free-street', label: '거리·간판', short: '거리', points: 15, emoji: '🏙️',
    desc: '시장, 한글 간판, 사람 사는 풍경',
    example: '간판이 한글이라 괜히 반가웠다' },
  { key: 'free-sky', label: '하늘·날씨', short: '하늘', points: 15, emoji: '☁️',
    desc: '구름, 노을, 별, 비 오는 창가',
    example: '천지 오르기 직전에 하늘이 열렸다' },
  { key: 'free-fun', label: '웃긴 순간', short: '웃긴 컷', points: 15, emoji: '😂',
    desc: '빵 터진 표정, 어이없는 실수, 장난',
    example: '모자가 바람에 날아가 버렸다' },
  { key: 'free-together', label: '함께', short: '함께', points: 15, emoji: '🤝',
    desc: '나란히 걷는 뒷모습, 챙겨주는 손길',
    example: '계단에서 손 잡아준 앞사람' },
  { key: 'free-thing', label: '소품·기념품', short: '소품', points: 15, emoji: '🎒',
    desc: '모자와 타올, 신발, 오늘의 필수품',
    example: '오늘의 삼종세트 — 모자, 타올, 우비' },
  { key: 'free-clip', label: '짧은 영상', short: '영상', points: 25, emoji: '🎬', video: true,
    desc: '10~60초. 소리가 담기면 더 좋습니다',
    example: '폭포 소리가 여기까지 들린다' },
  { key: 'free-etc', label: '기타', short: '기타', points: 15, emoji: '📌',
    desc: '위 주제 어디에도 안 맞는 순간. 코멘트로 설명해 주세요',
    example: '설명하기 어렵지만 그냥 남기고 싶었던 장면' },
];

export const ADMIN_MISSIONS = [
  { key: 'group',  label: '단체사진', short: '단체', points: 0, emoji: '📸', desc: '운영진 전용 — 전체 단체 사진' },
  { key: 'vlog',   label: '브이로그', short: '브이로그', points: 0, emoji: '🎬', video: true, desc: '운영진 전용 — 브이로그/스케치 영상' },
];

export const ALL_MISSION_KEYS = [...MISSIONS, ...FREE_MISSIONS, ...ADMIN_MISSIONS].map((m) => m.key);
export const MEMBER_MISSION_KEYS = [...MISSIONS, ...FREE_MISSIONS].map((m) => m.key);
/** 영상 파일만 받는 미션 */
export const VIDEO_MISSION_KEYS = [...MISSIONS, ...FREE_MISSIONS, ...ADMIN_MISSIONS]
  .filter((m) => m.video).map((m) => m.key);
/** 방문지 "정복" 판정에 쓰이는 미션 6종 (자유/기타는 정복 대상이 아니다) */
export const CONQUER_KEYS = ['solo', 'duo', 'trio', 'quad', 'scenery', 'video'];

export const MISSION_FOLDER = {
  solo: '01_독사진',
  duo: '02_2인',
  trio: '03_3인',
  quad: '04_4인이상',
  scenery: '05_장소풍경',
  video: '06_영상',
  'free-bus': '10_이동중',
  'free-food': '11_먹거리',
  'free-stay': '12_숙소',
  'free-street': '13_거리',
  'free-sky': '14_하늘',
  'free-fun': '15_웃긴순간',
  'free-together': '16_함께',
  'free-thing': '17_소품',
  'free-clip': '18_짧은영상',
  'free-etc': '19_기타',
  group: '90_단체사진',
  vlog: '91_브이로그',
};

export const PLACES = [
  // ── 1일차 (9/10 목) ──────────────────────────────────────────────
  { slug: 'munhak-gather', day: 1, seq: 1, time: '12:00', title: '문학경기장 집결',
    area: '인천', emoji: '🚍', boost: 1,
    desc: '문학경기장 암벽등반장 뒤 대형주차장. 주차 후 셔틀버스 탑승.',
    tip: '출발 인증샷! 모자 쓰고 찍으면 나중에 오프닝 컷으로 딱입니다.' },
  { slug: 'incheon-airport', day: 1, seq: 2, time: '13:00', title: '인천공항 제1터미널',
    area: '인천', emoji: '✈️', boost: 1,
    desc: '3층 제주항공 카운터 앞 미팅 → 기념품(모자·타올) 수령 → 15:00까지 게이트 집결.',
    tip: '기념 모자·타올 받은 컷을 꼭 남겨주세요.' },
  { slug: 'yanji-arrival', day: 1, seq: 3, time: '17:25', title: '연길 국제공항 도착',
    area: '연길', emoji: '🛬', boost: 1,
    desc: '입국심사 → 수하물 → 현지 가이드 미팅 → 호차별 차량 탑승.',
    tip: '"인천상공회의소 산악회" 피켓 앞에서 한 컷!' },
  { slug: 'erdaobaihe-dinner', day: 1, seq: 4, time: '20:00', title: '이도백하 석식 (불고기 전골)',
    area: '이도백하', emoji: '🍲', boost: 1,
    desc: '이도백하 이동(약 2시간) 후 첫 현지 석식.',
    tip: '건배 장면은 영상으로! 소리까지 살아있는 컷이 좋습니다.' },
  { slug: 'paradise-hotel', day: 1, seq: 5, time: '21:30', title: '이도 파라다이스 호텔',
    area: '이도백하', emoji: '🏨', boost: 1,
    desc: '1·2일차 숙소 (준5성급). 체크인 및 휴식.',
    tip: '룸메이트와 한 컷, 로비에서 한 컷.' },

  // ── 2일차 (9/11 금) ──────────────────────────────────────────────
  { slug: 'seopa-stairs', day: 2, seq: 1, time: '10:00', title: '백두산 서파 1,442 계단',
    area: '백두산 서파', emoji: '🪜', img: 'seopa-stairs.jpg', boost: 2,
    desc: '송강하 이동(약 1시간 30분) 후 서파 입산. 계단 약 40분.',
    tip: '⭐ 핵심 스팟(2배). 계단 중간에서 아래를 내려다보는 앵글이 압권입니다.' },
  { slug: 'seopa-cheonji', day: 2, seq: 2, time: '11:00', title: '백두산 천지 (서파) · 경계비',
    area: '백두산 서파', emoji: '🏔️', img: 'seopa-cheonji.jpg', boost: 2,
    desc: '영산 백두산 천지 관광 / 5호·37호 경계비.',
    tip: '⭐ 핵심 스팟(2배). 이번 여행의 메인 컷. 4인 이상 미션까지 꼭 채우세요!' },
  { slug: 'geumgang-canyon', day: 2, seq: 3, time: '11:40', title: '금강대협곡',
    area: '백두산 서파', emoji: '🌲', img: 'geumgang-canyon.jpg', boost: 2,
    desc: '동양의 그랜드캐년이라 불리는 협곡 데크길.',
    tip: '⭐ 핵심 스팟(2배). 데크길 세로 영상이 쇼츠에 잘 맞습니다.' },
  { slug: 'lunch-sanchae', day: 2, seq: 4, time: '12:00', title: '중식 · 산채비빔밥',
    area: '백두산 서파', emoji: '🍚', boost: 1,
    desc: '현지식 산채비빔밥.', tip: '음식 클로즈업 + 먹방 리액션 컷.' },
  { slug: 'massage', day: 2, seq: 5, time: '16:30', title: '전신마사지 60분',
    area: '이도백하', emoji: '💆', boost: 1,
    desc: '이도백하 이동 후 전신마사지 체험 60분.',
    tip: '매너팁은 공동경비에서 일괄 지급합니다. 개별 지급하지 마세요!' },
  { slug: 'dinner-samgyeopsal', day: 2, seq: 6, time: '18:00', title: '석식 · 무제한 삼겹살',
    area: '이도백하', emoji: '🥓', boost: 1,
    desc: '현지식 무제한 삼겹살.', tip: '테이블별 단체 컷을 남겨주세요.' },

  // ── 3일차 (9/12 토) ──────────────────────────────────────────────
  { slug: 'bukpa-cheonji', day: 3, seq: 1, time: '09:00', title: '백두산 북파 천지 (천문봉)',
    area: '백두산 북파', emoji: '⛰️', img: 'bukpa-cheonji.jpg', boost: 2,
    desc: 'VIP 코스. 10인승 차량으로 천문봉까지 이동.',
    tip: '⭐ 핵심 스팟(2배). 서파와 다른 각도의 천지! 바람이 강하니 모자 주의.' },
  { slug: 'jangbaek-falls', day: 3, seq: 2, time: '10:30', title: '장백폭포',
    area: '백두산 북파', emoji: '💦', img: 'jangbaek-falls.jpg', boost: 2,
    desc: '1년 내내 얼지 않는 장백폭포.',
    tip: '⭐ 핵심 스팟(2배). 폭포 소리를 담은 세로 영상 추천!' },
  { slug: 'hot-spring', day: 3, seq: 3, time: '11:30', title: '온천지대',
    area: '백두산 북파', emoji: '♨️', img: 'hot-spring.jpg', boost: 1,
    desc: '백두산 온천지대 관광 (온천 계란).', tip: '김이 피어오르는 장면은 영상이 예쁩니다.' },
  { slug: 'haeranggang', day: 3, seq: 4, time: '15:00', title: '해란강 · 일송정',
    area: '용정', emoji: '🌊', img: 'haeranggang.jpg', boost: 1,
    desc: '용정 이동(약 1시간 30분) 후 해란강·일송정 차창 관광.',
    tip: '차창 밖 풍경도 좋은 소스입니다. 흔들림만 조심!' },
  { slug: 'yongdure-well', day: 3, seq: 5, time: '16:30', title: '용두레 우물',
    area: '용정', emoji: '🪣', boost: 1,
    desc: '용정 지명의 유래가 된 용두레 우물.', tip: '우물 표지석과 함께 한 컷.' },
  { slug: 'yongjeong-hotel', day: 3, seq: 6, time: '18:00', title: '용정 해란강 호텔 · 석식(샤브샤브)',
    area: '용정', emoji: '🏨', boost: 1,
    desc: '3일차 숙소 (준5성급) 및 현지식 샤브샤브 석식.',
    tip: '마지막 밤! 조별 단체 컷을 꼭 남겨주세요.' },

  // ── 4일차 (9/13 일) ──────────────────────────────────────────────
  { slug: 'yun-dongju', day: 4, seq: 1, time: '09:00', title: '윤동주 생가',
    area: '용정', emoji: '📖', img: 'yun-dongju.jpg', boost: 2,
    desc: '시인 윤동주 생가 관광.',
    tip: '⭐ 핵심 스팟(2배). 생가 대문·시비 앞 컷이 좋습니다.' },
  { slug: 'tumen', day: 4, seq: 2, time: '14:00', title: '두만강 공원 · 조중 접경지대',
    area: '도문', emoji: '🌉', boost: 2,
    desc: '도문 이동 후 두만강 공원 및 조중 접경지대 관광.',
    tip: '⭐ 핵심 스팟(2배). 강 건너편이 보이는 앵글로!' },
  { slug: 'return', day: 4, seq: 3, time: '18:25', title: '연길공항 출발 → 인천 도착',
    area: '연길 · 인천', emoji: '🛫', boost: 1,
    desc: '18:25 연길 출발 (기내식 제공) → 21:55 인천 도착 후 해산.',
    tip: '엔딩 컷! 공항에서 손 흔드는 영상 하나면 마무리 완벽합니다.' },

  // ── 상시 ────────────────────────────────────────────────────────
  { slug: 'free', day: 0, seq: 99, time: '상시', title: '자유 / 기타',
    area: '전체', emoji: '✨', boost: 1, missionSet: 'free',
    desc: '어느 방문지에도 딱 맞지 않는 순간들 (버스 안, 호텔, 길거리 등).',
    tip: '의외로 이런 컷이 쇼츠에서 제일 재밌습니다. 주제를 고르고 한마디 남겨주세요.' },
];

export const DAYS = [
  { day: 1, date: '2026-09-10', label: '1일차', dow: '목', title: '인천 → 연길 → 이도백하' },
  { day: 2, date: '2026-09-11', label: '2일차', dow: '금', title: '백두산 서파 · 금강대협곡' },
  { day: 3, date: '2026-09-12', label: '3일차', dow: '토', title: '백두산 북파 · 용정' },
  { day: 4, date: '2026-09-13', label: '4일차', dow: '일', title: '윤동주 생가 · 도문 → 귀국' },
];

export function placeFolder(p) {
  const dayPart = p.day === 0 ? '0일차_상시' : `${p.day}일차`;
  return `${dayPart}_${String(p.seq).padStart(2, '0')}_${p.title.replace(/[\\/:*?"<>|]/g, '·')}`;
}
