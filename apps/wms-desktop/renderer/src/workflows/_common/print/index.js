// apps/wms-desktop/renderer/src/workflows/_common/print/index.js
import { renderShippingLabelZPL } from "./shippingLabel.zpl.js";
import { renderShippingLabelHTML } from "./shippingLabel.html.js";
import { buildZplPackingListLabel } from "./packingList.zpl.js";
import { renderJobSheetA4Html, openJobSheetA4PrintWindow } from "./jobSheet.a4.js";

// UNC 경로 normalize: "localhost\Toshiba" 같은 것도 "\\localhost\Toshiba"로 보정
function normalizeUncTarget(input) {
  let s = (input ?? "").toString().trim();
  if (!s) return "";
  // 슬래시가 섞이면 정리
  s = s.replace(/\//g, "\\");
  // 앞에 \\ 없으면 붙이기
  if (!s.startsWith("\\\\")) s = "\\\\" + s.replace(/^\\+/, "");
  return s;
}

// ✅ config.json에서 프린터 경로 읽기 (+ 로그)
function getLabelTargetFromConfig() {
  const cfg = window.__APP_CONFIG__;
  const fromCfg = cfg?.printer?.label;

  // 디버깅: 실제 주입값 확인
  console.log("[print] __APP_CONFIG__.printer.label =", fromCfg);

  // 기본값은 Toshiba
  const fallback = "\\\\localhost\\Toshiba";
  return normalizeUncTarget(fromCfg || fallback) || fallback;
}

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

  const finalTarget = normalizeUncTarget(target) || getLabelTargetFromConfig();
  if (!finalTarget) throw new Error("target is required");

  console.log("[printPackingListLabel] target =", finalTarget);

  const raw = buildZplPackingListLabel({ storeCode, jobTitle, jobId, boxNo, boxItems });

  console.log("[printPackingListLabel] raw length =", raw.length);
  console.log("[printPackingListLabel] raw startsWith ^XA:", raw.trimStart().startsWith("^XA"));
  console.log("[printPackingListLabel] raw endsWith ^XZ:", raw.trimEnd().endsWith("^XZ"));

  await sendRaw({ target: finalTarget, raw });
  return { ok: true };
}

// ✅ config.json에서 프린터 이름만 추출 (UNC 경로가 아님)
function getPrinterNameFromConfig() {
  const cfg = window.__APP_CONFIG__;
  const fromCfg = cfg?.printer?.label;
  console.log("[print] __APP_CONFIG__.printer.label =", fromCfg);
  // 기본값은 TOSHIBA
  return (fromCfg || "TOSHIBA").replace(/^\\+/, "").trim();
}

// ✅ CJ 송장 라벨 출력 (RAW 방식 - ZPL only)
export async function printShippingLabel({
  data,
  target,
  sendRaw,
}) {
  if (typeof sendRaw !== "function") throw new Error("sendRaw is not a function");

  const finalTarget = normalizeUncTarget(target) || getLabelTargetFromConfig();
  if (!finalTarget) throw new Error("target is required");

  console.log("[printShippingLabel] target =", finalTarget);

  const raw = buildShippingLabelRaw({ data });

  console.log("[printShippingLabel] raw length =", raw.length);
  console.log("[printShippingLabel] raw head =", raw.substring(0, 120));
  console.log("[printShippingLabel] raw startsWith ^XA:", raw.trimStart().startsWith("^XA"));
  console.log("[printShippingLabel] raw endsWith ^XZ:", raw.trimEnd().endsWith("^XZ"));

  await sendRaw({ target: finalTarget, raw });
  return { ok: true };
}

// ✅ CJ 송장 라벨 출력 (HTML → Windows 드라이버 방식)
export async function printShippingLabelHtml({
  data,
  printerName,
  printHtml,
}) {
  if (typeof printHtml !== "function") throw new Error("printHtml is not a function");

  const finalPrinterName = printerName || getPrinterNameFromConfig();
  if (!finalPrinterName) throw new Error("printerName is required");

  console.log("[printShippingLabelHtml] printerName =", finalPrinterName);

  const html = renderShippingLabelHTML(data);
  console.log("[printShippingLabelHtml] html length =", html.length);

  await printHtml({ printerName: finalPrinterName, html });
  return { ok: true };
}

// Shipping label raw helpers (ZPL only)
export function buildShippingLabelRaw({ data }) {
  return renderShippingLabelZPL(data);
}

// 테스트 라벨 (ZPL only)
export function buildTestLabelRaw({ text = "TEST LABEL OK", barcode = "1234567890" } = {}) {
  return `^XA^FO30,30^A0N,40,40^FD${text}^FS^FO30,90^BCN,80,Y,N,N^FD${barcode}^FS^XZ`;
}

export { renderJobSheetA4Html, openJobSheetA4PrintWindow, renderShippingLabelHTML };
