// renderer/src/workflows/jobs/jobs.api.js
import { http } from "../_common/http";

function qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null || String(v).trim() === "") continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

function normalizeKind(v) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  if (s.includes("출고")) return "출고";
  if (s.includes("반품")) return "반품";
  // 혹시 영문 들어오면 대응
  const low = s.toLowerCase();
  if (low.includes("outbound")) return "출고";
  if (low.includes("inbound")) return "반품";
  return s;
}

function groupRows(jobRows) {
  const map = new Map();
  for (const r of jobRows || []) {
    const kind = normalizeKind(r?.jobKind);
    const storeCode = String(r?.storeCode || "").trim();
    const skuCode = String(r?.skuCode || "").trim();
    const makerCode = String(r?.makerCode || "").trim();
    const name = String(r?.name || "").trim();
    const reqNo = String(r?.reqNo || "").trim();
    const qty = Number(r?.qty ?? 0);

    if (!storeCode) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    // skuCode/makerCode 중 하나는 있어야 정상
    if (!skuCode && !makerCode) continue;

    const key = `${kind || "미분류"}__${storeCode}`;
    if (!map.has(key)) map.set(key, { kind: kind || "", storeCode, rows: [] });

    map.get(key).rows.push({
      storeCode,
      skuCode,
      makerCode,
      name,
      reqNo,
      qty,
      jobKind: kind || null,
    });
  }
  return [...map.values()];
}

export const jobsApi = {
  list: async ({ status, kind, storeCode } = {}) => {
    return http.get(`/jobs${qs({ status, kind, storeCode })}`);
  },

  get: async (jobId) => {
    if (!jobId) throw new Error("jobId is required");
    return http.get(`/jobs/${jobId}`);
  },

  create: async ({ storeCode, title, memo } = {}) => {
    return http.post(`/jobs`, { storeCode, title, memo });
  },

  addItems: async (jobId, { items } = {}) => {
    if (!jobId) throw new Error("jobId is required");
    return http.post(`/jobs/${jobId}/items`, { items: items || [] });
  },

  delete: async (jobId) => {
    if (!jobId) throw new Error("jobId is required");
    return http.del(`/jobs/${jobId}`);
  },

  // ✅ 스캔 (백엔드에 /jobs/:id/items/scan 라우트가 있는 로그가 있었음)
  scan: async (jobId, body) => {
    if (!jobId) throw new Error("jobId is required");
    return http.post(`/jobs/${jobId}/items/scan`, body || {});
  },

  // ✅ extra 승인 (프로젝트가 이미 쓰던 방식 유지)
  approveExtra: async (jobId, { jobItemId, qty } = {}) => {
    if (!jobId) throw new Error("jobId is required");
    if (!jobItemId) throw new Error("jobItemId is required");
    return http.post(`/jobs/${jobId}/approve-extra`, { jobItemId, qty });
  },

  allowOverpick: async (jobId, { allowOverpick = true } = {}) => {
    if (!jobId) throw new Error("jobId is required");
    return http.patch(`/jobs/${jobId}/allow-overpick`, { allowOverpick });
  },

  /**
   * ✅ Dashboard 작지 생성 (출고/반품)
   * - parcel(CJ용) 절대 안 탐
   * - /jobs + /jobs/:id/items 로 “작지” 생성
   */
  createFromParsedRows: async ({ jobRows, jobFileName } = {}) => {
    if (!Array.isArray(jobRows) || jobRows.length === 0) {
      throw new Error("jobRows is required");
    }

    const groups = groupRows(jobRows);
    if (groups.length === 0) {
      throw new Error("유효한 row가 없어. storeCode/skuCode(or makerCode)/qty/jobKind 확인해줘");
    }

    let createdCount = 0;
    const createdJobIds = [];

    for (const g of groups) {
      const kind = g.kind || "미분류";
      const storeCode = g.storeCode;

      // ✅ title/memo는 서버에서 크게 상관 없지만, 추적용으로 남겨둠
      const title = `[${kind}] ${storeCode}`;
      const memo = `excel=${jobFileName || ""}; kind=${kind}; store=${storeCode}`;

      const created = await jobsApi.create({ storeCode, title, memo });
      const jobId = created?.id || created?.job?.id;
      if (!jobId) throw new Error("job create succeeded but jobId is missing");

      // ✅ 아이템 payload: 서버가 받는 필드명에 최대한 맞춰 넉넉히 전달
      const items = (g.rows || []).map((r) => ({
        storeCode: r.storeCode,
        skuCode: r.skuCode,
        makerCode: r.makerCode,
        name: r.name,
        qty: r.qty,
        qtyPlanned: r.qty, // 서버가 qtyPlanned를 쓰는 경우 대비
        reqNo: r.reqNo, // memo로 박아도 되고 서버가 받으면 더 좋음
      }));

      await jobsApi.addItems(jobId, { items });

      createdCount += 1;
      createdJobIds.push(jobId);
    }

    return { createdCount, createdJobIds };
  },

  // 호환 별칭
  createJobsFromParsedRows: async ({ jobRows, jobFileName } = {}) => {
    return jobsApi.createFromParsedRows({ jobRows, jobFileName });
  },
};
