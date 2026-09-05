const jsonHeaders = { 'Content-Type': 'application/json' };

/** 휴대폰이 새 화면 파일을 받았는지 서버 로그로 확인하기 위한 표식 */
export const APP_BUILD = '2026-09-05e';

async function handle(res) {
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(data?.error || `요청 실패 (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (url) => fetch(url, { credentials: 'same-origin' }).then(handle),
  post: (url, body) =>
    fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: jsonHeaders,
      body: JSON.stringify(body ?? {}),
    }).then(handle),
  patch: (url, body) =>
    fetch(url, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: jsonHeaders,
      body: JSON.stringify(body ?? {}),
    }).then(handle),
  del: (url) => fetch(url, { method: 'DELETE', credentials: 'same-origin' }).then(handle),
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
