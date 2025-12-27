// apps/wms-desktop/renderer/src/workflows/_common/print/index.js
import { renderShippingLabelZPL } from "./shippingLabel.zpl.js";
import { buildZplPackingListLabel } from "./packingList.zpl.js";
import { renderJobSheetA4Html, openJobSheetA4PrintWindow } from "./jobSheet.a4.js";
// ✅ Packing List (ZPL 고정)
export async function printPackingListLabel({
  storeCode,
  jobTitle,
  jobId,
  boxNo,
  boxItems,
  target,
  sendRaw,
}) {
  if (typeof sendRaw !== "function") throw new Error("sendRaw is not a function");
  if (!target) throw new Error("target is required");

  const raw = buildZplPackingListLabel({ storeCode, jobTitle, jobId, boxNo, boxItems });
  await sendRaw({ target, raw });
  return { ok: true };
}

// Shipping label raw helpers (CJ 송장 붙일 때 사용)
export function buildShippingLabelRaw({ mode = "zpl", data }) {
  if (mode === "tspl") return renderShippingLabelTSPL(data);
  return renderShippingLabelZPL(data);
}

// 테스트 라벨 (유지)
export function buildTestLabelRaw({ mode = "zpl", text = "TEST LABEL OK", barcode = "1234567890" } = {}) {
  if (mode === "zpl") {
    return `^XA^FO30,30^A0N,40,40^FD${text}^FS^FO30,90^BCN,80,Y,N,N^FD${barcode}^FS^XZ`;
  }
  return [
    "SIZE 60 mm,40 mm",
    "GAP 3 mm,0 mm",
    "CLS",
    `TEXT 30,30,"0",0,2,2,"${text}"`,
    `BARCODE 30,90,"128",80,1,0,2,2,"${barcode}"`,
    "PRINT 1,1",
  ].join("\r\n");
}

export { renderJobSheetA4Html, openJobSheetA4PrintWindow };
