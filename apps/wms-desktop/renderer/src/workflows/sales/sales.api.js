// apps/wms-desktop/renderer/src/workflows/sales/sales.api.js
import { getApiBase } from "../../lib/api";

async function request(path, options) {
  const base = getApiBase();
  const res = await fetch(`${base}${path}`, options);

  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  if (!res.ok) {
    const msg = json?.message || json?.error || json?.raw || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json;
}

export async function uploadSalesExcel({ file, sourceKey }) {
  if (!file) throw new Error("파일이 없어");

  const fd = new FormData();
  fd.append("file", file);
  if (sourceKey) fd.append("sourceKey", sourceKey);

  return request("/sales/import-excel", {
    method: "POST",
    body: fd,
  });
}

/**
 * ✅ 매장별 매출 합산 조회
 * - 서버 라우트가 다르면 여기 path만 수정하면 됨.
 * - 예상: GET /sales/by-store?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function fetchSalesByStore({ from, to }) {
  if (!from || !to) throw new Error("from/to 날짜를 입력해줘 (YYYY-MM-DD)");

  const qs = new URLSearchParams();
  qs.set("from", from);
  qs.set("to", to);

  return request(`/sales/by-store?${qs.toString()}`, {
    method: "GET",
  });
}
