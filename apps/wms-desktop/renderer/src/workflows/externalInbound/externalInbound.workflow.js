// apps/wms-desktop/renderer/src/workflows/externalInbound/externalInbound.workflow.js
import { parseJobFileToRows } from "../_common/excel/parseStoreOutbound";
import { jobsApi } from "../jobs/jobs.api";
import { jobsFlow } from "../jobs/jobs.workflow";

export async function runExternalInbound({ file }) {
  try {
    if (!file) return { ok: false, error: "파일이 필요합니다", level: "warn" };
    const parsed = await parseExternalInboundFromFile(file);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e?.message || "처리 실패", level: "error" };
  }
}

export async function parseExternalInboundFromFile(file) {
  if (!file) throw new Error("file is required");
  const buf = await file.arrayBuffer();
  return parseJobFileToRows(buf, file.name || "");
}

/**
 * 외부 입고 모드
 * - 외부(공급업체)에서 창고로 입고 (INBOUND)
 * - 매장 재고 변동 없이 창고 재고만 증가
 * - Page는 이 mode만 호출
 * - API는 jobsFlow/jobsApi로만 접근
 */
export const externalInboundMode = {
  key: "externalInbound",
  title: "외부 입고",
  defaultLocationCode: "RET-01",

  validateUpload({ jobKind }) {
    return { ok: true };
  },

  async createJobsFromPreview({ previewRows, defaultStoreCode, title }) {
    // 외부 입고는 HQ(본사 창고)로 입고
    // storeCode가 없으면 HQ 사용
    const groups = new Map();
    for (const row of previewRows || []) {
      const store = String(row.storeCode || defaultStoreCode || "HQ").trim();
      if (!groups.has(store)) groups.set(store, []);
      groups.get(store).push(row);
    }

    const entries = [...groups.entries()];
    if (!entries.length) throw new Error("입고 데이터가 없어. 엑셀 확인해줘.");

    const createdJobs = [];
    for (const [storeCode, rows] of entries) {
      const job = await jobsApi.create({ storeCode, title: title || this.title, type: 'INBOUND' });
      const jobId = job?.id || job?.job?.id;
      if (!jobId) throw new Error("jobId가 없어. /jobs 응답을 확인해줘.");

      await jobsApi.addItems(jobId, {
        items: rows.map((r) => ({
          skuCode: String(r?.skuCode ?? "").trim(),
          qty: Number(r?.qty ?? 0),
          makerCode: String(r?.makerCode ?? r?.maker ?? "").trim(),
          name: String(r?.name ?? r?.itemName ?? "").trim(),
        })),
      });

      const full = await jobsApi.get(jobId);
      createdJobs.push(full?.job || full);
    }

    return createdJobs;
  },

  /**
   * 스캔: 외부 입고 (창고 재고만 증가)
   * - locationCode 필수
   * - receive API 사용 (INBOUND 타입이므로 매장 재고 변동 없음)
   */
  async scan({ jobId, value, qty = 1, locationCode = "", confirm }) {
    const loc = String(locationCode || "").trim();
    if (!loc) {
      return { ok: false, error: "입고는 locationCode가 필요해. (기본 RET-01)", level: "warn", resetScan: false };
    }

    return jobsFlow.scanInbound({ jobId, value, qty, locationCode: loc, confirm });
  },
};
