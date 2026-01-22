// apps/wms-desktop/renderer/src/workflows/storeReturn/storeReturn.workflow.js
import { parseJobFileToRows } from "../_common/excel/parseStoreOutbound";
import { jobsApi } from "../jobs/jobs.api";
import { jobsFlow } from "../jobs/jobs.workflow";

export async function runStoreReturn({ file }) {
  try {
    if (!file) return { ok: false, error: "파일이 필요합니다", level: "warn" };
    const parsed = await parseStoreReturnFromFile(file);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e?.message || "처리 실패", level: "error" };
  }
}

export async function parseStoreReturnFromFile(file) {
  if (!file) throw new Error("file is required");
  const buf = await file.arrayBuffer();
  return parseJobFileToRows(buf, file.name || "");
}

/**
 * 매장 반품 모드
 * - 매장에서 창고로 반품 (RETURN)
 * - Page는 이 mode만 호출
 * - API는 jobsFlow/jobsApi로만 접근
 */
export const storeReturnMode = {
  key: "storeReturn",
  title: "매장 반품",
  defaultLocationCode: "RET-01",

  validateUpload({ jobKind }) {
    return { ok: true };
  },

  async createJobsFromPreview({ previewRows, defaultStoreCode, title }) {
    const groups = new Map();
    for (const row of previewRows || []) {
      const store = String(row.storeCode || defaultStoreCode || "").trim();
      if (!store) continue;
      if (!groups.has(store)) groups.set(store, []);
      groups.get(store).push(row);
    }

    const entries = [...groups.entries()];
    if (!entries.length) throw new Error("storeCode 그룹이 없어. 엑셀(storeCode) 확인해줘.");

    const createdJobs = [];
    for (const [storeCode, rows] of entries) {
      const job = await jobsApi.create({ storeCode, title: title || this.title, type: 'RETURN' });
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

  async scan({ jobId, value, qty = 1, locationCode = "", confirm }) {
    const loc = String(locationCode || "").trim();
    if (!loc) {
      return { ok: false, error: "입고는 locationCode가 필요해. (기본 RET-01)", level: "warn", resetScan: false };
    }

    return jobsFlow.scanInbound({ jobId, value, qty, locationCode: loc, confirm });
  },
};
