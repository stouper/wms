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
    const msg =
      json?.message ||
      json?.error ||
      json?.raw ||
      `HTTP ${res.status}`;
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
