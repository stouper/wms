import { parseParcelRequestFileToRows } from "../_common/excel/parseParcelRequest";
export async function runParcelRequest({ file }) {
  try {
    if (!file) return { ok: false, error: "파일이 필요합니다", level: "warn" };
    const rows = await parseParcelRequestFromFile(file);
    return { ok: true, data: { rows } };
  } catch (e) {
    return { ok: false, error: e?.message || "처리 실패", level: "error" };
  }
}

export const parcelShipMode = {
  key: "parcelShip",
  title: "택배 요청",
  sheetName: "WORK",

  validateUpload() {
    return { ok: true };
  },
 
  async createJobsFromPreview() {
    // 지금은 택배는 "미리보기까지만" 남기기로 했으니까 생성 막아둠
    throw new Error("택배 요청은 아직 Job 생성 단계가 아냐. (미리보기까지만)");
  },

  async scan() {
    return { ok: false, error: "택배 요청 화면에서는 스캔 기능을 아직 안 써. (미리보기까지만)" };
  },
};

export async function parseParcelRequestFromFile(file) {
  if (!file) throw new Error("file is required");
  const buf = await file.arrayBuffer();
  return parseParcelRequestFileToRows(buf, file.name || "");
 }

