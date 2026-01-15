// renderer/src/workflows/jobs/jobs.workflow.js
import { jobsApi } from "./jobs.api";
import { ymdKST } from "../../lib/dates";

/** ===== 공통 유틸 ===== */
function unwrapJob(full) {
  return full?.job && typeof full.job === "object" ? full.job : full;
}

function is409(errMsg) {
  return /\b409\b/.test(String(errMsg)) || /Conflict/i.test(String(errMsg));
}

function getApprovedQty(it) {
  const v =
    it?.extraApproved ??
    it?.approvedQty ??
    it?.qtyApproved ??
    it?.extraApprovedQty ??
    it?.extra?.approved ??
    it?.approved ??
    0;
  return Number(v) || 0;
}

function norm(v) {
  return String(v ?? "").trim().toUpperCase();
}

function matchJobItem(job, value) {
  if (!job?.items) return null;
  const v = norm(value);
  return (
    job.items.find((it) => norm(it?.sku?.sku) === v) ||
    job.items.find((it) => norm(it?.skuCode) === v) ||
    job.items.find((it) => norm(it?.makerCodeSnapshot) === v) ||
    null
  );
}

/** 날짜 유틸 */
function ymdToNum(ymd) {
  const s = String(ymd || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return NaN;
  return Number(s.replaceAll("-", ""));
}

/**
 * ✅ job에서 출고/완료일(ymd) 뽑기
 * - 기존: exportDate / doneYmd / workDate 등 (이미 YYYY-MM-DD 또는 YYYYMMDD)
 * - 추가: doneAt / completedAt / finishedAt 같은 ISO DateTime도 지원
 * - 최종: KST 기준 YYYY-MM-DD로 통일(ymdKST)
 */
function pickYmdFromJob(job) {
  const v =
    job?._exportDate ||
    job?.exportDate ||
    job?.doneDate ||
    job?.doneYmd ||
    job?.workDate ||
    job?.ymd ||
    job?.doneAt ||
    job?.completedAt ||
    job?.finishedAt ||
    "";

  // Date 객체면 바로 KST ymd
  if (v instanceof Date) {
    try {
      return ymdKST(v);
    } catch {
      return "";
    }
  }

  const s = String(v || "").trim();
  if (!s) return "";

  // 1) YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // 2) YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

  // 3) ISO / datetime / 기타 parse 가능 값 → ymdKST로 KST 기준 날짜 뽑기
  //    (예: 2026-01-15T01:23:45.000Z, 2026-01-15 10:20:30 등)
  try {
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime())) return ymdKST(dt);
  } catch {
    // ignore
  }

  return "";
}

/** kind 정규화: "출고/반품" + "outbound/inbound" 흡수 */
function normalizeKind(v) {
  const raw = String(v || "").trim().toLowerCase();
  if (!raw) return "";

  if (
    raw === "출고" ||
    raw === "out" ||
    raw === "outbound" ||
    raw.includes("outbound") ||
    raw.includes("출고")
  ) {
    return "출고";
  }

  if (
    raw === "반품" ||
    raw === "입고" ||
    raw === "in" ||
    raw === "inbound" ||
    raw.includes("inbound") ||
    raw.includes("반품") ||
    raw.includes("입고")
  ) {
    return "반품";
  }

  return String(v || "").trim();
}

/** =========================
 *  jobsFlow = 페이지는 이것만 호출
 *  ========================= */
export const jobsFlow = {
  /** ===== 공통 ===== */
  listJobs: async () => {
    const data = await jobsApi.list();
    return Array.isArray(data) ? data : data?.rows || [];
  },

  getJob: async (jobId) => {
    const full = await jobsApi.get(jobId);
    return unwrapJob(full);
  },

  deleteJob: async (jobId) => {
    await jobsApi.delete(jobId);
    return true;
  },

  approveExtra: async ({ jobId, jobItemId, qty }) => {
    await jobsApi.approveExtra(jobId, { jobItemId, qty });
    return true;
  },

  // ✅ (추가) 마지막 스캔 취소(UNDO) — 다른 로직/시그니처 안 건드림
  undoLast: async ({ jobId }) => {
    const res = await jobsApi.undoLast(jobId);
    return {
      ok: true,
      result: res,
      toast: { kind: "info", title: "UNDO", message: "마지막 스캔을 취소했어" },
      resetScan: true,
      reloadJob: true,
    };
  },

  /** ===== Dashboard 조회 ===== */
  fetchDoneJobsForRange: async ({ fromYmd, toYmd }) => {
    const fromN = ymdToNum(fromYmd);
    const toN = ymdToNum(toYmd);

    if (!Number.isFinite(fromN) || !Number.isFinite(toN)) {
      throw new Error("기간 형식이 이상해. YYYY-MM-DD 형태로 넣어줘");
    }

    // 백엔드에 range 전용 API가 있으면 우선 사용
    if (typeof jobsApi.listDoneRange === "function") {
      const data = await jobsApi.listDoneRange({ fromYmd, toYmd });
      const rows = Array.isArray(data) ? data : data?.rows || [];
      return rows
        .map(unwrapJob)
        .map((j) => ({ ...j, _exportDate: pickYmdFromJob(j) || "" }))
        .sort((a, b) => {
          const an = ymdToNum(a._exportDate) || 0;
          const bn = ymdToNum(b._exportDate) || 0;
          return bn - an;
        });
    }

    // fallback: 전체 목록 받아서 프론트에서 필터
    const all = await jobsFlow.listJobs();

    const done = (all || [])
      .map(unwrapJob)
      .filter((j) => {
        const status = String(j?.status || j?.state || "").toUpperCase();
        const hasDoneAt = String(j?.doneAt || j?.completedAt || j?.finishedAt || "").trim().length > 0;

        const isDone = status === "DONE" || status === "COMPLETED" || status === "FINISHED" || hasDoneAt;
        if (!isDone) return false;

        const ymd = pickYmdFromJob(j);
        const n = ymdToNum(ymd);
        if (!Number.isFinite(n)) return false;

        return n >= fromN && n <= toN;
      })
      .map((j) => ({ ...j, _exportDate: pickYmdFromJob(j) || "" }))
      .sort((a, b) => {
        const an = ymdToNum(a._exportDate) || 0;
        const bn = ymdToNum(b._exportDate) || 0;
        return bn - an;
      });

    return done;
  },

  /** ===== Dashboard: 작지 생성 ===== */
  createJobsFromParsedRows: async ({ jobRows, jobFileName }) => {
    const rows = Array.isArray(jobRows) ? jobRows : [];
    if (!rows.length) throw new Error("jobRows가 비어있어");

    const normalizedRows = rows.map((r) => ({
      ...r,
      jobKind: normalizeKind(r?.jobKind),
    }));

    if (typeof jobsApi.createFromParsedRows === "function") {
      return await jobsApi.createFromParsedRows({
        jobRows: normalizedRows,
        jobFileName: jobFileName || "",
      });
    }

    if (typeof jobsApi.createJobsFromParsedRows === "function") {
      return await jobsApi.createJobsFromParsedRows({
        jobRows: normalizedRows,
        jobFileName: jobFileName || "",
      });
    }

    if (typeof jobsApi.createJobs === "function") {
      return await jobsApi.createJobs({
        jobRows: normalizedRows,
        jobFileName: jobFileName || "",
      });
    }

    if (typeof jobsApi.createMany === "function") {
      return await jobsApi.createMany({
        jobRows: normalizedRows,
        jobFileName: jobFileName || "",
      });
    }

    throw new Error(
      "작지 생성 API가 jobsApi에 없어. jobs.api 파일에서 createFromParsedRows(또는 createJobsFromParsedRows) 함수를 만들어야 해."
    );
  },

  /** =========================
   * ✅ Outbound Scan (출고)
   * ========================= */
  scanOutbound: async ({ jobId, value, qty = 1, locationCode = "", confirm }) => {
    const body = {
      value,
      qty,
      ...(locationCode ? { locationCode } : {}),
    };

    try {
      const res = await jobsApi.scan(jobId, body);
      return {
        ok: true,
        lastScan: res,
        toast: { kind: "success", title: "출고 처리", message: `${value} +${qty}` },
        resetScan: true,
        reloadJob: true,
      };
    } catch (e) {
      const msg = e?.message || String(e);
      if (!is409(msg)) throw new Error(msg);

      // 409 → 승인/오버픽 루트(프로젝트 기본 패턴 유지)
      const full = await jobsApi.get(jobId);
      const job = unwrapJob(full);
      const hit = matchJobItem(job, value);

      if (!hit) throw new Error("출고 대상 SKU를 찾을 수 없어");

      const planned = Number(hit.qtyPlanned || 0);
      const picked = Number(hit.qtyPicked || 0);
      const approved = getApprovedQty(hit);
      const next = picked + qty;

      // 승인 범위 내면 force로 재시도
      if (next <= planned + approved) {
        const res2 = await jobsApi.scan(jobId, { ...body, force: true });
        return {
          ok: true,
          lastScan: res2,
          toast: { kind: "success", title: "출고(승인분)", message: `${value} +${qty}` },
          resetScan: true,
          reloadJob: true,
        };
      }

      // 추가 승인 필요
      const need = next - (planned + approved);
      const ok = confirm ? confirm(`출고 수량 초과\n\n추가 승인 ${need} 할까?`) : true;
      if (!ok) return { ok: true, resetScan: true };

      await jobsApi.approveExtra(jobId, { jobItemId: hit.id, qty: need });
      const res3 = await jobsApi.scan(jobId, { ...body, force: true });

      return {
        ok: true,
        lastScan: res3,
        toast: { kind: "success", title: "추가 승인 출고", message: `${value} +${qty}` },
        resetScan: true,
        reloadJob: true,
      };
    }
  },

  /** =========================
   * ✅ Inbound Scan (입고/반품)
   * =========================
   *
   * ✅ 핵심:
   * - 백엔드에 /jobs/:id/receive 가 있으면 그걸로 보내야 IN으로 찍힘.
   * - receive가 없는 환경(구버전 백엔드)에서는 기존 /items/scan 유지.
   * - 반품 기본 로케이션은 RET-01
   * ========================= */
  scanInbound: async ({ jobId, value, qty = 1, locationCode = "", confirm }) => {
    // ✅ 반품 기본 로케이션: 비어있으면 RET-01
    const loc = String(locationCode || "").trim() || "RET-01";

    const body = {
      value,
      qty,
      locationCode: loc,
    };

    // ✅ receive 라우트 지원 여부에 따라 분기
    const useReceive = typeof jobsApi.receive === "function";
    const apiCall = useReceive ? jobsApi.receive : jobsApi.scan;

    try {
      const res = await apiCall(jobId, body);

      return {
        ok: true,
        lastScan: res,
        toast: { kind: "success", title: "입고 처리", message: `${value} +${qty}` },
        resetScan: true,
        reloadJob: true,
      };
    } catch (e) {
      const msg = e?.message || String(e);
      if (!is409(msg)) throw new Error(msg);

      const full = await jobsApi.get(jobId);
      const job = unwrapJob(full);
      const hit = matchJobItem(job, value);

      if (!hit) throw new Error("입고 대상 SKU를 찾을 수 없어");

      const planned = Number(hit.qtyPlanned || 0);
      const picked = Number(hit.qtyPicked || 0);
      const approved = getApprovedQty(hit);
      const next = picked + qty;

      if (next <= planned + approved) {
        const res2 = await apiCall(jobId, { ...body, force: true });
        return {
          ok: true,
          lastScan: res2,
          toast: { kind: "success", title: "입고(승인분)", message: `${value} +${qty}` },
          resetScan: true,
          reloadJob: true,
        };
      }

      const need = next - (planned + approved);
      const ok = confirm ? confirm(`입고 수량 초과\n\n추가 승인 ${need} 할까?`) : true;

      if (!ok) return { ok: true, resetScan: true };

      await jobsApi.approveExtra(jobId, { jobItemId: hit.id, qty: need });
      const res3 = await apiCall(jobId, { ...body, force: true });

      return {
        ok: true,
        lastScan: res3,
        toast: { kind: "success", title: "추가 승인 입고", message: `${value} +${qty}` },
        resetScan: true,
        reloadJob: true,
      };
    }
  },

  // ================================
  // 🔽 UNDO / TX (추가)
  // ================================

  fetchTx: async ({ jobId }) => {
    if (!jobId) throw new Error("jobId is required");
    const res = await jobsApi.txList(jobId);
    // fetch/axios 래퍼 차이 대응
    return Array.isArray(res) ? res : (res?.data ?? res ?? []);
  },

 
  undoUntil: async ({ jobId, txId }) => {
    if (!jobId) throw new Error("jobId is required");
    if (!txId) throw new Error("txId is required");
    return jobsApi.undoUntil(jobId, txId);
  },

  undoAll: async ({ jobId }) => {
    if (!jobId) throw new Error("jobId is required");
    return jobsApi.undoAll(jobId);
  },
};
