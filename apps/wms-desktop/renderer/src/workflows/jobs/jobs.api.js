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

  const low = s.toLowerCase();
  if (low.includes("outbound") || low === "out") return "출고";
  if (low.includes("inbound") || low === "in") return "반품";

  return s;
}

function kindPayload(kindKorean) {
  const k = normalizeKind(kindKorean);
  const isIn = k === "반품";
  return {
    kind: k, // "출고" | "반품"
    jobKind: k,
    direction: isIn ? "IN" : "OUT",
    type: isIn ? "IN" : "OUT",
  };
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

  // ✅ kind/type/direction 받을 수 있게 확장
  create: async ({ storeCode, title, memo, kind, jobKind, type, direction } = {}) => {
    return http.post(`/jobs`, {
      storeCode,
      title,
      memo,
      ...(kind ? { kind } : {}),
      ...(jobKind ? { jobKind } : {}),
      ...(type ? { type } : {}),
      ...(direction ? { direction } : {}),
    });
  },

  addItems: async (jobId, { items } = {}) => {
    if (!jobId) throw new Error("jobId is required");
    return http.post(`/jobs/${jobId}/items`, { items: items || [] });
  },

  delete: async (jobId) => {
    if (!jobId) throw new Error("jobId is required");
    return http.del(`/jobs/${jobId}`);
  },

  // ✅ 출고 스캔(피킹)
  scan: async (jobId, body) => {
    if (!jobId) throw new Error("jobId is required");
    return http.post(`/jobs/${jobId}/items/scan`, body || {});
  },

  // ✅ 입고/반품 수령(= IN 처리)
  receive: async (jobId, body) => {
    if (!jobId) throw new Error("jobId is required");
    return http.post(`/jobs/${jobId}/receive`, body || {});
  },

  approveExtra: async (jobId, { jobItemId, qty } = {}) => {
    if (!jobId) throw new Error("jobId is required");
    if (!jobItemId) throw new Error("jobItemId is required");
    return http.post(`/jobs/${jobId}/approve-extra`, { jobItemId, qty });
  },

  /**
   * Dashboard 작지 생성 (출고/반품)
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

      const title = `[${kind}] ${storeCode}`;
      const memo = `excel=${jobFileName || ""}; kind=${kind}; store=${storeCode}`;

      const kp = kindPayload(kind);
      const created = await jobsApi.create({
        storeCode,
        title,
        memo,
        ...kp,
      });

      const jobId = created?.id || created?.job?.id;
      if (!jobId) throw new Error("job create succeeded but jobId is missing");

      const items = (g.rows || []).map((r) => ({
        storeCode: r.storeCode,
        skuCode: r.skuCode,
        makerCode: r.makerCode,
        name: r.name,
        qty: r.qty,
        qtyPlanned: r.qty,
        reqNo: r.reqNo,
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
  // ================================
  // 🔽 UNDO / TX (추가)
  // ================================

  txList: async (jobId) => {
    return http.get(`/jobs/${jobId}/tx`);
  },

  undoLast: async (jobId) => {
    return http.post(`/jobs/${jobId}/undo-last`, {});
  },

  undoUntil: async (jobId, txId) => {
    return http.post(`/jobs/${jobId}/undo`, { txId });
  },

  undoAll: async (jobId) => {
    return http.post(`/jobs/${jobId}/undo-all`, {});
  },

};
