import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import db from './db.js';
import { PARTICIPANTS } from './data/participants.js';
import { PLACES, placeFolder } from './data/places.js';
import { ADMIN_ID, ADMIN_PASSWORD } from './config.js';

export const digits = (s) => String(s || '').replace(/\D/g, '');

const upsertPlace = db.prepare(`
  INSERT INTO places (slug, day, seq, time, title, area, emoji, boost, descr, tip, folder)
  VALUES (@slug, @day, @seq, @time, @title, @area, @emoji, @boost, @descr, @tip, @folder)
  ON CONFLICT(slug) DO UPDATE SET
    day=@day, seq=@seq, time=@time, title=@title, area=@area,
    emoji=@emoji, boost=@boost, descr=@descr, tip=@tip, folder=@folder
`);

const findUser = db.prepare('SELECT id, pw_changed, name FROM users WHERE name = ?');
/** 표기가 바뀐 경우(예: 전묘재 → 전재현)에도 기존 계정을 찾아 이름만 갱신한다 */
const findUserByAnyName = db.prepare(
  'SELECT id, pw_changed, name FROM users WHERE name = ? OR name = ? OR alias = ?'
);
const insertUser = db.prepare(`
  INSERT INTO users (name, alias, phone, password_hash, gi, bus, grp, roles, single_room, is_admin, sort_no)
  VALUES (@name, @alias, @phone, @hash, @gi, @bus, @grp, @roles, @single, @admin, @sort)
`);
const updateUserMeta = db.prepare(`
  UPDATE users SET name=@name, alias=@alias, phone=@phone, gi=@gi, bus=@bus, grp=@grp,
    roles=@roles, single_room=@single, sort_no=@sort WHERE id=@id
`);

export function seed({ resetPasswords = false } = {}) {
  const summary = { places: 0, created: 0, updated: 0, admin: null, renamed: [] };

  const run = db.transaction(() => {
    for (const p of PLACES) {
      upsertPlace.run({
        slug: p.slug, day: p.day, seq: p.seq, time: p.time, title: p.title,
        area: p.area, emoji: p.emoji, boost: p.boost, descr: p.desc, tip: p.tip,
        folder: placeFolder(p),
      });
      summary.places += 1;
    }

    for (const p of PARTICIPANTS) {
      const existing = findUserByAnyName.get(p.name, p.alias ?? p.name, p.alias ?? p.name);
      if (existing && existing.name !== p.name) {
        summary.renamed.push(`${existing.name} → ${p.name}`);
      }
      const common = {
        name: p.name,
        alias: p.alias || null,
        phone: p.phone,
        gi: p.gi,
        bus: p.bus ?? null,
        grp: p.group ?? 0,
        roles: JSON.stringify(p.roles || []),
        single: p.single ? 1 : 0,
        sort: p.no,
      };
      if (!existing) {
        insertUser.run({ ...common, hash: bcrypt.hashSync(digits(p.phone), 10), admin: 0 });
        summary.created += 1;
      } else {
        updateUserMeta.run({ ...common, id: existing.id });
        // 비밀번호를 아직 바꾸지 않은 사람만(또는 --reset 시 전원) 초기 비밀번호 재설정
        if (resetPasswords || !existing.pw_changed) {
          db.prepare('UPDATE users SET password_hash = ?, pw_changed = 0 WHERE id = ?')
            .run(bcrypt.hashSync(digits(p.phone), 10), existing.id);
        }
        summary.updated += 1;
      }
    }

    const admin = findUser.get(ADMIN_ID);
    if (!admin) {
      insertUser.run({
        name: ADMIN_ID, alias: null, phone: null,
        hash: bcrypt.hashSync(ADMIN_PASSWORD, 10),
        gi: '운영', bus: null, grp: 0, roles: JSON.stringify(['운영진']),
        single: 0, admin: 1, sort: 0,
      });
      summary.admin = 'created';
    } else if (resetPasswords) {
      db.prepare('UPDATE users SET password_hash = ?, is_admin = 1, pw_changed = 0 WHERE id = ?')
        .run(bcrypt.hashSync(ADMIN_PASSWORD, 10), admin.id);
      summary.admin = 'reset';
    } else {
      db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(admin.id);
      summary.admin = 'kept';
    }
  });

  run();
  return summary;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const reset = process.argv.includes('--reset');
  const s = seed({ resetPasswords: reset });
  console.log(`✅ 시드 완료`);
  console.log(`   방문지 ${s.places}곳`);
  console.log(`   참가자 신규 ${s.created}명 / 갱신 ${s.updated}명`);
  for (const r of s.renamed) console.log(`   이름 변경: ${r}`);
  console.log(`   관리자(${ADMIN_ID}) ${s.admin}`);
  if (reset) console.log(`   ⚠ 모든 비밀번호를 초기값(휴대폰 번호)으로 되돌렸습니다.`);
}
