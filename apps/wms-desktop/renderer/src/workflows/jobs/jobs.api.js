// renderer/src/workflows/jobs/jobs.api.js
import { http } from "../_common/http";
import { getOperatorId } from "../_common/operator";

// 매장코드 → storeId 캐시
let storeCodeToIdCache = new Map();

async function ensureStoreCache() {
  if (storeCodeToIdCache.size > 0) return;
  try {
    const res = await http.get("/stores");
    const rows = res?.rows || [];
    storeCodeToIdCache = new Map(rows.map((s) => [s.code, s.id]));
  } catch (e) {
    console.error("매장 캐시 로드 실패:", e);
  }
}

async function getStoreIdByCode(code) {
  const c = String(code ?? "").trim();
  if (!c) return null;

  await ensureStoreCache();
  return storeCodeToIdCache.get(c) || null;
}

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
    type: isIn ? "RETURN" : "OUTBOUND",
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
    const requestDate = String(r?.requestDate || "").trim();
    const qty = Number(r?.qty ?? 0);

    if (!storeCode) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!skuCode && !makerCode) continue;

    const key = `${kind || "미분류"}__${storeCode}`;
    if (!map.has(key)) map.set(key, { kind: kind || "", storeCode, requestDate, rows: [] });

    // 그룹의 requestDate가 비어있으면 첫 번째 값으로 설정
    if (!map.get(key).requestDate && requestDate) {
      map.get(key).requestDate = requestDate;
    }

    map.get(key).rows.push({
      storeCode,
      skuCode,
      makerCode,
      name,
      reqNo,
      productType: String(r?.productType || "").trim(),
      qty,
      jobKind: kind || null,
    });
  }
  return [...map.values()];
}

export const jobsApi = {
  list: async ({ status, kind, storeId, storeCode, parentId } = {}) => {
    // storeCode가 주어지면 storeId로 변환
    let finalStoreId = storeId;
    if (!finalStoreId && storeCode) {
      finalStoreId = await getStoreIdByCode(storeCode);
    }
    // parentId가 null이면 "null" 문자열로 전달 (최상위 Job만 조회)
    const parentIdParam = parentId === null ? "null" : parentId;
    return http.get(`/jobs${qs({ status, kind, storeId: finalStoreId, parentId: parentIdParam })}`);
  },

  get: async (jobId) => {
    if (!jobId) throw new Error("jobId is required");
    return http.get(`/jobs/${jobId}`);
  },

  // ✅ kind/type/direction + 배치(parentId/packType/sortOrder) 받을 수 있게 확장
  // storeId 또는 storeCode 지원 (storeCode는 자동으로 storeId 변환)
  create: async ({ storeId, storeCode, title, memo, kind, jobKind, type, direction, requestDate, parentId, packType, sortOrder } = {}) => {
    const operatorId = getOperatorId();

    // storeId가 없으면 storeCode로 조회
    let finalStoreId = storeId;
    if (!finalStoreId && storeCode) {
      finalStoreId = await getStoreIdByCode(storeCode);
      if (!finalStoreId) {
        throw new Error(`매장을 찾을 수 없어: ${storeCode}`);
      }
    }

    if (!finalStoreId) {
      throw new Error("storeId 또는 storeCode가 필요해");
    }

    return http.post(`/jobs`, {
      storeId: finalStoreId,
      title,
      memo,
      ...(kind ? { kind } : {}),
      ...(jobKind ? { jobKind } : {}),
      ...(type ? { type } : {}),
      ...(direction ? { direction } : {}),
      ...(requestDate ? { requestDate } : {}),
      ...(parentId ? { parentId } : {}),
      ...(packType ? { packType } : {}),
      ...(sortOrder !== undefined ? { sortOrder } : {}),
      ...(operatorId ? { operatorId } : {}),
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
    const operatorId = getOperatorId();
    return http.post(`/jobs/${jobId}/items/scan`, {
      ...(body || {}),
      ...(operatorId ? { operatorId } : {}),
    });
  },

  // ✅ 입고/반품 수령(= IN 처리)
  receive: async (jobId, body) => {
    if (!jobId) throw new Error("jobId is required");
    const operatorId = getOperatorId();
    return http.post(`/jobs/${jobId}/receive`, {
      ...(body || {}),
      ...(operatorId ? { operatorId } : {}),
    });
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
      const requestDate = g.requestDate || null;

      const title = `[${kind}] ${storeCode}`;
      const memo = `excel=${jobFileName || ""}; kind=${kind}; store=${storeCode}`;

      const kp = kindPayload(kind);
      const created = await jobsApi.create({
        storeCode,
        title,
        memo,
        requestDate,
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

  // ✅ UNDO 전 음수 발생 여부 체크
  checkUndo: async (jobId) => {
    return http.get(`/jobs/${jobId}/check-undo`);
  },

  undoLast: async (jobId, { force = false } = {}) => {
    const operatorId = getOperatorId();
    return http.post(`/jobs/${jobId}/undo-last`, {
      ...(operatorId ? { operatorId } : {}),
      ...(force ? { force: true } : {}),
    });
  },

  undoUntil: async (jobId, txId, { force = false } = {}) => {
    const operatorId = getOperatorId();
    return http.post(`/jobs/${jobId}/undo`, {
      txId,
      ...(operatorId ? { operatorId } : {}),
      ...(force ? { force: true } : {}),
    });
  },

  undoAll: async (jobId, { force = false } = {}) => {
    const operatorId = getOperatorId();
    return http.post(`/jobs/${jobId}/undo-all`, {
      ...(operatorId ? { operatorId } : {}),
      ...(force ? { force: true } : {}),
    });
  },

  // ================================
  // 🔽 배치(묶음) Job 관련 API
  // ================================

  /**
   * 배치 Job 상세 조회 (하위 Job 포함)
   */
  getBatch: async (batchJobId) => {
    if (!batchJobId) throw new Error("batchJobId is required");
    return http.get(`/jobs/${batchJobId}/batch`);
  },

  /**
   * 배치 Job 스캔
   * - 하위 Job 중 해당 SKU 포함된 Job을 찾아 스캔
   * - 단포 우선, 합포 나중
   */
  scanBatch: async (batchJobId, body) => {
    if (!batchJobId) throw new Error("batchJobId is required");
    const operatorId = getOperatorId();
    return http.post(`/jobs/${batchJobId}/batch/scan`, {
      ...(body || {}),
      ...(operatorId ? { operatorId } : {}),
    });
  },

};
