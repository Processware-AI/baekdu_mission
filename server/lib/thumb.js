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

/**
 * ffmpeg 실행 파일 찾기.
 *
 * launchd 로 띄우면 PATH 를 거의 물려받지 않아 이름만으로는 찾지 못한다.
 * (터미널에서 직접 실행할 때만 되고 데몬에서는 조용히 실패한다)
 * 그래서 흔한 설치 위치를 직접 훑는다. 다른 곳에 있으면 .env 에
 * FFMPEG_PATH 로 지정하면 된다.
 */
const CANDIDATES = [
  process.env.FFMPEG_PATH,
  '/opt/homebrew/bin/ffmpeg',   // 애플 실리콘 Homebrew
  '/usr/local/bin/ffmpeg',      // 인텔 Homebrew
  '/opt/local/bin/ffmpeg',      // MacPorts
  'ffmpeg',                     // PATH 에 있으면
].filter(Boolean);

let ffmpegBin = null;

/** ffmpeg 를 쓸 수 있는지 (한 번만 찾고 기억한다) */
export async function hasFfmpeg() {
  if (ffmpegBin !== null) return ffmpegBin !== false;
  for (const bin of CANDIDATES) {
    if (bin.includes('/') && !fs.existsSync(bin)) continue;
    if (await run(bin, ['-version'], 5000)) { ffmpegBin = bin; return true; }
  }
  ffmpegBin = false;
  return false;
}

/**
 * 사진·영상에서 썸네일 한 장을 만들어 THUMB_DIR 에 저장한다.
 *
 * 사진도 서버에서 만드는 이유: 휴대폰이 썸네일을 못 보내면 갤러리 격자에
 * 원본을 그대로 내보내게 된다. 4MB 짜리가 수십 장이면 현지 회선에서 감당이 안 된다.
 *
 * @param {string} absPath 원본 파일 경로
 * @param {boolean} isVideo 영상이면 true
 * @returns {Promise<string|null>} THUMB_DIR 기준 파일명, 실패하면 null
 */
export async function makeThumb(absPath, isVideo) {
  if (!await hasFfmpeg()) return null;
  if (!fs.existsSync(absPath)) return null;

  const name = `${crypto.randomBytes(6).toString('hex')}_ff.jpg`;
  const out = path.join(THUMB_DIR, name);

  // 영상은 -ss 를 -i 앞에 두어 빠르게 건너뛴다. 0.6초 지점이 없으면(짧은 영상)
  // 맨 앞 프레임으로 다시 시도한다. 사진은 건너뛸 것이 없다.
  const seeks = isVideo ? ['0.6', '0'] : [null];
  for (const at of seeks) {
    const ok = await run(ffmpegBin, [
      '-nostdin', '-loglevel', 'error',
      ...(at === null ? [] : ['-ss', at]),
      '-i', absPath,
      '-frames:v', '1',
      '-vf', "scale='min(480,iw)':-2",
      '-q:v', '4', '-y', out,
    ], 30000);
    if (ok && fs.existsSync(out) && fs.statSync(out).size > 0) return name;
    fs.promises.unlink(out).catch(() => {});
  }
  return null;
}
