/**
 * 사용 기록.
 *
 * 참가자 대부분이 이런 앱을 처음 써서, 운영진이 "누가 아직 못 들어왔는지"를
 * 알아야 개별로 챙길 수 있다. 그 목적에 필요한 만큼만 남긴다 —
 * 누가 언제 로그인했고 어느 화면을 봤는지. 무엇을 눌렀는지까지는 남기지 않는다.
 */
import db from '../db.js';

const insert = db.prepare(
  'INSERT INTO activity (user_id, kind, detail) VALUES (?, ?, ?)'
);

/** 같은 화면을 다시 그릴 때마다 쌓이지 않도록 최근 기록은 건너뛴다 */
const RECENT_SEC = 30;
const recent = db.prepare(
  `SELECT 1 FROM activity
    WHERE user_id = ? AND kind = ? AND IFNULL(detail,'') = IFNULL(?,'')
      AND created_at > datetime('now','localtime', ?)
    LIMIT 1`
);

export function logActivity(userId, kind, detail = null) {
  if (!userId) return;
  try {
    if (kind === 'view' && recent.get(userId, kind, detail, `-${RECENT_SEC} seconds`)) return;
    insert.run(userId, kind, detail);
  } catch {
    // 기록이 실패해도 서비스는 그대로 돌아가야 한다
  }
}
