import { toast } from './util.js';

const jsonHeaders = { 'Content-Type': 'application/json' };

/** 휴대폰이 새 화면 파일을 받았는지 서버 로그로 확인하기 위한 표식 */
export const APP_BUILD = '2026-09-14a';

/**
 * 세션이 끊겼을 때 로그인 화면으로 되돌리기.
 *
 * 서버를 다시 켜면 로그인 상태가 모두 풀린다. 그때 화면을 켜둔 채였던 사람은
 * 무엇을 눌러도 알 수 없는 오류만 보게 된다. 무슨 일인지 알려주고 로그인
 * 화면으로 돌려보낸다. 한 화면에서 여러 요청이 함께 실패하니 한 번만 한다.
 */
let ending = false;
function sessionEnded() {
  if (ending) return;
  ending = true;
  toast('로그인이 풀렸습니다. 다시 로그인해 주세요.', '', 2400);
  setTimeout(() => { location.hash = ''; location.reload(); }, 1400);
}

async function handle(res, url = '') {
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    // 로그인 요청 자체의 401(비밀번호 틀림)은 그대로 알려줘야 한다
    if (res.status === 401 && !url.startsWith('/api/auth/')) sessionEnded();
    const err = new Error(data?.error || `요청 실패 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => fetch(url, { credentials: 'same-origin' }).then((r) => handle(r, url)),
  post: (url, body) =>
    fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: jsonHeaders,
      body: JSON.stringify(body ?? {}),
    }).then((r) => handle(r, url)),
  patch: (url, body) =>
    fetch(url, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: jsonHeaders,
      body: JSON.stringify(body ?? {}),
    }).then((r) => handle(r, url)),
  del: (url) => fetch(url, { method: 'DELETE', credentials: 'same-origin' }).then((r) => handle(r, url)),
  form: (url, formData, { onProgress } = {}) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.withCredentials = true;
      xhr.setRequestHeader('X-App-Build', APP_BUILD);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
      };
      xhr.onload = () => {
        let data;
        try { data = JSON.parse(xhr.responseText); } catch {
          // 413 은 Cloudflare 가 HTML 로 돌려주므로 파싱이 안 된다
          data = { error: xhr.status === 413
            ? '파일이 너무 큽니다. 영상은 1분 이내로 잘라서 올려주세요.'
            : '응답을 해석할 수 없습니다.' };
        }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else {
          if (xhr.status === 401) sessionEnded();
          const err = new Error(data?.error || `업로드 실패 (${xhr.status})`);
          err.status = xhr.status;
          reject(err);
        }
      };
      xhr.onerror = () => reject(Object.assign(new Error('네트워크 연결이 끊겼습니다.'), { offline: true }));
      xhr.ontimeout = () => reject(Object.assign(new Error('시간이 초과되었습니다.'), { offline: true }));
      xhr.timeout = 10 * 60 * 1000;
      xhr.send(formData);
    }),
};
