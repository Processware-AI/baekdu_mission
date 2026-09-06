/**
 * 영상 썸네일 만들기 (서버 쪽)
 *
 * 아이폰은 영상을 .mov(HEVC)로 찍는데, 사파리가 이걸 캔버스에 그리는 것을 막는다.
 * 그래서 휴대폰에서 만든 썸네일이 아예 오지 않는 경우가 있다(아이폰만).
 * 그럴 때 서버에서 ffmpeg 로 한 프레임을 뽑는다. 기기·코덱과 무관하게 동작한다.
 *
 * ffmpeg 가 없으면 조용히 포기한다 — 갤러리에는 재생 아이콘 그림이 대신 나온다.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { THUMB_DIR } from '../config.js';

const run = (cmd, args, ms) => new Promise((resolve) => {
  execFile(cmd, args, { timeout: ms, killSignal: 'SIGKILL' }, (err) => resolve(!err));
});

let ffmpegOk = null;

/** ffmpeg 를 쓸 수 있는지 (한 번만 확인하고 기억한다) */
export async function hasFfmpeg() {
  if (ffmpegOk === null) ffmpegOk = await run('ffmpeg', ['-version'], 5000);
  return ffmpegOk;
}

/**
 * 영상에서 썸네일 한 장을 만들어 THUMB_DIR 에 저장한다.
 * @returns {Promise<string|null>} THUMB_DIR 기준 파일명, 실패하면 null
 */
export async function makeVideoThumb(absVideoPath) {
  if (!await hasFfmpeg()) return null;
  if (!fs.existsSync(absVideoPath)) return null;

  const name = `${crypto.randomBytes(6).toString('hex')}_ff.jpg`;
  const out = path.join(THUMB_DIR, name);

  // -ss 를 -i 앞에 두면 빠르게 건너뛴다. 0.6초 지점이 없으면(짧은 영상)
  // 맨 앞 프레임으로 다시 시도한다.
  for (const at of ['0.6', '0']) {
    const ok = await run('ffmpeg', [
      '-nostdin', '-loglevel', 'error',
      '-ss', at, '-i', absVideoPath,
      '-frames:v', '1',
      '-vf', "scale='min(480,iw)':-2",
      '-q:v', '4', '-y', out,
    ], 30000);
    if (ok && fs.existsSync(out) && fs.statSync(out).size > 0) return name;
    fs.promises.unlink(out).catch(() => {});
  }
  return null;
}
