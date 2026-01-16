// workflows/sales/sales.workflow.js
import { uploadSalesExcel } from "./sales.api";

export async function runSalesImport({ file, sourceKey, onProgress }) {
  onProgress?.({ stage: "validating" });
  if (!file) throw new Error("파일을 선택해줘");

  onProgress?.({ stage: "uploading" });
  const result = await uploadSalesExcel({ file, sourceKey });

  onProgress?.({ stage: "done", result });
  return result;
}
