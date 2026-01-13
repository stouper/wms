// renderer/src/workflows/storeOutbound/storeOutbound.workflow.js
import { parseJobFileToRows } from "../_common/excel/parseStoreOutbound";
import { jobsApi } from "../jobs/jobs.api";
import { jobsFlow } from "../jobs/jobs.workflow";

export async function runStoreOutbound({ file }) {
  try {
    if (!file) return { ok: false, error: "파일이 필요합니다", level: "warn" };
    const parsed = await parseStoreOutboundFromFile(file);
    return { ok: true, data: parsed };
  } catch (e) {
    return { ok: false, error: e?.message || "처리 실패", level: "error" };
  }
}

export async function parseStoreOutboundFromFile(file) {
  if (!file) throw new Error("file is required");
  const buf = await file.arrayBuffer();
  return parseJobFileToRows(buf, file.name || "");
}

export const storeShipMode = {
  key: "storeShip",
  title: "매장 출고",
  sheetName: "WORK",

  validateUpload({ jobKind }) {
    const raw = String(jobKind ?? "").trim();
    const norm = raw.replace(/<</g, "").trim();
    if (norm === "반품") {
      return { ok: false, error: "반품작지는 [창고 입고] 메뉴에서 업로드하세요." };
    }
    return { ok: true };
  },

  /**
   * ✅ Page 주입 제거 버전
   * - previewRows를 storeCode로 묶어서 Job 생성 + Items 추가
   * - 마지막에 GET /jobs/:id로 full 가져오기
   */
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
      const job = await jobsApi.create({ storeCode, title: title || this.title });
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
   * ✅ scan도 Page 주입 제거
   * - confirm만 Page에서 넘겨주면 됨(UI 책임)
   */
  async scan({ jobId, value, qty = 1, locationCode = "", confirm }) {
    return jobsFlow.scanOutbound({ jobId, value, qty, locationCode, confirm });
  },
};
