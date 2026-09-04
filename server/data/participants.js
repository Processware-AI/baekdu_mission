/**
 * ICCA 산악회 백두산 여행 참가자 명단 (75명)
 *
 * 출처: 참고자료/룸메이트 배정표.png (성명·기수·연락처)
 *       참고자료/버스배정표.png       (호차·조·조장/인솔자)
 *       참고자료/찬조내역.txt          (직책)
 *
 * ⚠ 여권번호·여권만료일은 의도적으로 저장하지 않습니다.
 *
 * name  : 로그인 ID (성명)
 * phone : 초기 비밀번호 (숫자만 입력해도, 하이픈을 넣어도 로그인됨)
 * alias : 다른 자료에 다르게 표기된 이름 (로그인 시 함께 허용)
 *
 * ※ 전재현(43기) / 박옥련(38기) 두 분은 버스 배정표 표기를 정본으로 씁니다.
 *   룸메이트 배정표(여권)의 '전묘재' / '박옥연' 으로도 로그인됩니다.
 */

export const PARTICIPANTS = [
  // no, 기수, 성명, 연락처, 호차, 조, 직책/역할, 1인실, 별칭
  { no: 1,  gi: '23기',  name: '박화서', phone: '010-8750-3934', bus: 1, group: 1, roles: ['대장', '1조 인솔자'] },
  { no: 2,  gi: '23기',  name: '손신기', phone: '010-3732-0154', bus: 1, group: 1 },
  { no: 3,  gi: '52기',  name: '김성수', phone: '010-3643-5625', bus: 1, group: 2 },
  { no: 4,  gi: '52기',  name: '김은진', phone: '010-5026-2277', bus: 1, group: 2 },
  { no: 5,  gi: '55기',  name: '이수경', phone: '010-3585-9275', bus: 2, group: 4 },
  { no: 6,  gi: '56기',  name: '김민숙', phone: '010-7225-5165', bus: 2, group: 4 },
  { no: 7,  gi: '42기',  name: '이중경', phone: '010-5600-8688', bus: 2, group: 3 },
  { no: 8,  gi: '가족',  name: '이승현', phone: '010-4085-2272', bus: 2, group: 3 },
  { no: 9,  gi: '55기',  name: '정명선', phone: '010-9075-5474', bus: 2, group: 4 },
  { no: 10, gi: '55기',  name: '장선영', phone: '010-9848-0235', bus: 1, group: 1, roles: ['1조 인솔자'] },
  { no: 11, gi: '52기',  name: '이미선', phone: '010-6305-5948', bus: 1, group: 2, roles: ['2조 인솔자'] },
  { no: 12, gi: '47기',  name: '최순례', phone: '010-8730-0067', bus: 1, group: 2 },
  { no: 13, gi: '23기',  name: '김진영', phone: '010-7339-8028', bus: 1, group: 1 },
  { no: 14, gi: '23기',  name: '김봉실', phone: '010-6266-5377', bus: 1, group: 1, roles: ['1조 인솔자'] },
  { no: 15, gi: '31기',  name: '장희섭', phone: '010-3354-1507', bus: 2, group: 3 },
  { no: 16, gi: '가족',  name: '박노숙', phone: '010-4303-8010', bus: 2, group: 3 },
  { no: 17, gi: '11기',  name: '이서정', phone: '010-4645-0853', bus: 2, group: 3 },
  { no: 18, gi: '가족',  name: '이정미', phone: '010-2215-8631', bus: 2, group: 3 },
  { no: 19, gi: '57기',  name: '정재현', phone: '010-3589-5671', bus: 2, group: 4 },
  { no: 20, gi: '가족',  name: '조미화', phone: '010-8302-5671', bus: 2, group: 4 },
  { no: 21, gi: '38기',  name: '박옥련', phone: '010-2292-1212', bus: 2, group: 3, alias: '박옥연' },
  { no: 22, gi: '51기',  name: '서분선', phone: '010-4412-0949', bus: 2, group: 3 },
  { no: 23, gi: '53기',  name: '방명환', phone: '010-5800-1777', bus: 1, group: 1, roles: ['사무국장', '1조 조장'] },
  { no: 24, gi: '51기',  name: '오동석', phone: '010-8786-0488', bus: 2, group: 3, roles: ['3조 인솔자'] },
  { no: 25, gi: '34기',  name: '김도형', phone: '010-2802-7000', bus: 1, group: 2, roles: ['2조 인솔자'] },
  { no: 26, gi: '35기',  name: '김현기', phone: '010-4023-1088', bus: 1, group: 2, roles: ['2조 인솔자'] },
  { no: 27, gi: '51기',  name: '강은숙', phone: '010-7589-1353', bus: 2, group: 3 },
  { no: 28, gi: '51기',  name: '이향숙', phone: '010-3724-2899', bus: 2, group: 3 },
  { no: 29, gi: '57기',  name: '최종영', phone: '010-2633-5090', bus: 2, group: 4 },
  { no: 30, gi: '가족',  name: '이해란', phone: '010-9222-6586', bus: 2, group: 4 },
  { no: 31, gi: '46기',  name: '김윤희', phone: '010-4332-4165', bus: 2, group: 3, roles: ['3조 인솔자'] },
  { no: 32, gi: '지인',  name: '홍두례', phone: '010-3323-8743', bus: 2, group: 3 },
  { no: 33, gi: '57기',  name: '이영옥', phone: '010-3613-8819', bus: 1, group: 1, roles: ['1조 인솔자', '통역'] },
  { no: 34, gi: '43기',  name: '전재현', phone: '010-2307-3655', bus: 1, group: 2, roles: ['2조 조장'], alias: '전묘재' },
  { no: 35, gi: '03기',  name: '최종식', phone: '010-5219-1825', bus: 1, group: 1, roles: ['산악회장', '1호차 인솔자'] },
  { no: 36, gi: '46기',  name: '안남헌', phone: '010-3123-0114', bus: 1, group: 1, roles: ['명예회장'] },
  { no: 37, gi: '50기',  name: '김현수', phone: '010-2651-8349', bus: 1, group: 2 },
  { no: 38, gi: '54기',  name: '정윤숙', phone: '010-3664-7440', bus: 1, group: 2 },
  { no: 39, gi: '23기',  name: '신태호', phone: '010-6384-6379', bus: 1, group: 1, roles: ['부회장'] },
  { no: 40, gi: '가족',  name: '최양순', phone: '010-3315-6379', bus: 1, group: 1 },
  { no: 41, gi: '23기',  name: '조명희', phone: '010-6715-1248', bus: 1, group: 1 },
  { no: 42, gi: '38기',  name: '김문희', phone: '010-6271-1379', bus: 2, group: 3, roles: ['부회장'] },
  { no: 43, gi: '04기',  name: '김정애', phone: '010-5312-1688', bus: 1, group: 1 },
  { no: 44, gi: '04기',  name: '문갑순', phone: '010-7337-6565', bus: 1, group: 1 },
  { no: 45, gi: '53기',  name: '길경식', phone: '010-6267-9949', bus: 1, group: 1 },
  { no: 46, gi: '59기',  name: '한길수', phone: '010-6256-6600', bus: 1, group: 2 },
  { no: 47, gi: '51기',  name: '유지훈', phone: '010-7212-8877', bus: 2, group: 4, roles: ['4조 인솔자'] },
  { no: 48, gi: '57기',  name: '정진호', phone: '010-3939-9479', bus: 2, group: 4 },
  { no: 49, gi: '55기',  name: '임상철', phone: '010-3715-8451', bus: 2, group: 4 },
  { no: 50, gi: '55기',  name: '장우영', phone: '010-4708-7309', bus: 2, group: 4, roles: ['4조 인솔자'] },
  { no: 51, gi: '42기',  name: '차익정', phone: '010-6201-3960', bus: 1, group: 1 },
  { no: 52, gi: '37기',  name: '최형종', phone: '010-8251-2885', bus: 1, group: 2 },
  { no: 53, gi: '38기',  name: '권혁규', phone: '010-9038-0208', bus: 2, group: 3 },
  { no: 54, gi: '38기',  name: '박정근', phone: '010-2277-0453', bus: 2, group: 3 },
  { no: 55, gi: '38기',  name: '유창환', phone: '010-5328-5537', bus: 2, group: 3 },
  { no: 56, gi: '01기',  name: '박인수', phone: '010-3161-7086', bus: 1, group: 1 },
  { no: 57, gi: '23기',  name: '이윤복', phone: '010-5225-3581', bus: 1, group: 1 },
  { no: 58, gi: '11기',  name: '박규봉', phone: '010-5330-2568', bus: 2, group: 3 },
  { no: 59, gi: '23기',  name: '김영화', phone: '010-3508-7097', bus: 1, group: 1, roles: ['감사'] },
  { no: 60, gi: '25기',  name: '서임순', phone: '010-3737-7099', bus: 1, group: 1, roles: ['상임부회장'] },
  { no: 61, gi: '22기',  name: '김광호', phone: '010-8013-3210', bus: 2, group: 3, roles: ['수석부회장', '2호차 인솔자'] },
  { no: 62, gi: '55기',  name: '방명철', phone: '010-5332-9064', bus: 2, group: 4 },
  { no: 63, gi: '50기',  name: '권혜자', phone: '010-5357-5417', bus: 1, group: 2 },
  { no: 64, gi: '가족',  name: '권명애', phone: '010-3204-2209', bus: 1, group: 2 },
  { no: 65, gi: '지인',  name: '오명숙', phone: '010-5262-5780', bus: 2, group: 4 },
  { no: 66, gi: '50기',  name: '김미진', phone: '010-9118-5771', bus: 1, group: 2 },
  { no: 67, gi: '힐링',  name: '김창덕', phone: '010-5557-0819', bus: 1, group: 0, roles: ['힐링투어 부장', '인솔자'] },
  { no: 68, gi: '58기',  name: '황의성', phone: '010-8522-5795', bus: 2, group: 4 },
  { no: 69, gi: '57기',  name: '이준은', phone: '010-8339-8355', bus: 2, group: 4, roles: ['4조 인솔자'], single: true },
  { no: 70, gi: '58기',  name: '한상득', phone: '010-7544-4388', bus: 2, group: 4, roles: ['4조 조장'], single: true },
  { no: 71, gi: '52기',  name: '이헌구', phone: '010-5266-1886', bus: 1, group: 1, roles: ['총동문회장'], single: true },
  { no: 72, gi: '56기',  name: '조병훈', phone: '010-5322-3941', bus: 1, group: 2, single: true },
  { no: 73, gi: '53기',  name: '이재경', phone: '010-9471-7257', bus: 2, group: 3, roles: ['사무차장', '3조 조장', '2호차 인솔자'], single: true },
  { no: 74, gi: '58기',  name: '김주현', phone: '010-7726-3059', bus: 2, group: 4, single: true },
  { no: 75, gi: '51기',  name: '한혜정', phone: '010-4489-7043', bus: 2, group: 3, roles: ['3조 인솔자'], single: true },
];

/** 조 정보 */
export const GROUPS = [
  { id: 1, name: '1조', bus: 1, leader: '방명환', guides: ['장선영', '김봉실', '이영옥(통역)'] },
  { id: 2, name: '2조', bus: 1, leader: '전재현', guides: ['김현기', '김도형', '이미선'] },
  { id: 3, name: '3조', bus: 2, leader: '이재경', guides: ['오동석', '한혜정', '김윤희'] },
  { id: 4, name: '4조', bus: 2, leader: '한상득', guides: ['유지훈', '장우영', '이준은'] },
];

/** 호차 정보 */
export const BUSES = [
  {
    id: 1,
    name: '1호차',
    groups: [1, 2],
    staff: ['김창덕 부장', '방명환 사무국장'],
    guide: { name: '김창국 JIN CHANGGUO (남)', phone: '171-0053-1111' },
    day3: '3일차에는 1조·4조가 1호차에 탑승합니다.',
  },
  {
    id: 2,
    name: '2호차',
    groups: [3, 4],
    staff: ['이재경 사무차장'],
    guide: { name: '김유경 JIN YOUQING (여)', phone: '188-0433-2197' },
    day3: '3일차에는 2조·3조가 2호차에 탑승합니다.',
  },
];

/** 3일차 차량 재배치: 1조·4조 → 1호차 / 2조·3조 → 2호차 */
export const DAY3_BUS_BY_GROUP = { 1: 1, 4: 1, 2: 2, 3: 2 };
