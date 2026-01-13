// renderer/src/workflows/_common/http.js
import { getApiBase } from "./api";

/**
 * ✅ 공통 HTTP 클라이언트
 * - baseUrl(getApiBase) 단일화
 * - JSON 자동 파싱 + 에러 표준화
 */
async function request(method, path, body, opts = {}) {
  const base = getApiBase();
  const url = path.startsWith("http") ? path : `${base}${path}`;

  const headers = { ...(opts.headers || {}) };
  const init = {
    method,
    headers,
    ...opts,
  };

  if (body !== undefined) {
    // default JSON body
    if (!headers["Content-Type"] && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }
    init.body = body instanceof FormData ? body : JSON.stringify(body ?? {});
  }

  const r = await fetch(url, init);
  const t = await r.text().catch(() => "");
  let data = null;
  try {
    data = t ? JSON.parse(t) : null;
  } catch {
    data = t;
  }

  if (!r.ok) {
    const msg =
      (data && typeof data === "object" && (data.message || data.error)) ||
      (typeof data === "string" ? data : "") ||
      r.statusText ||
      "Request failed";
    const err = new Error(`[${r.status}] ${msg}`);
    err.status = r.status;
    err.data = data;
    throw err;
  }

  return data;
}

export const http = {
  get: (path, opts) => request("GET", path, undefined, opts),
  post: (path, body, opts) => request("POST", path, body, opts),
  patch: (path, body, opts) => request("PATCH", path, body, opts),
  del: (path, opts) => request("DELETE", path, undefined, opts),
};
