import { printPackingListLabel } from "./index.js";

// config.json에서 프린터 경로 읽기 (window.__APP_CONFIG__.printer.label)
function getLabelTarget() {
  const cfg = window.__APP_CONFIG__;
  return cfg?.printer?.label || "\\\\localhost\\BV420D_RAW";
}

// scan 응답에서 skuCode 최대한 안전하게 뽑기
export function pickSkuFromScan(res) {
  return (
    res?.sku?.sku ||
    res?.picked?.skuCode ||
    res?.skuCode ||
    null
  );
}

// Map에 SKU 누적
export function addSku(boxItems, skuCode, qty = 1) {
  const next = new Map(boxItems || []);
  const cur = next.get(skuCode) || { skuCode, qty: 0 };
  cur.qty += Number(qty || 1);
  next.set(skuCode, cur);
  return next;
}

// 현재 박스 팩킹리스트 출력
export async function printBoxLabel({
  job,
  boxNo,
  boxItems,
  push,
  sendRaw,
}) {
  if (!job?.id) throw new Error("job 없음");
  if (!boxItems || boxItems.size === 0) {
    push?.({ kind: "warn", title: "박스", message: "현재 박스가 비어있어" });
    return false;
  }

  await printPackingListLabel({
    storeCode: job.storeCode,
    jobTitle: job.title || "매장 출고",
    jobId: job.id,
    boxNo,
    boxItems,
    target: getLabelTarget(),
    sendRaw,
  });

  push?.({
    kind: "success",
    title: "팩킹리스트 출력",
    message: `BOX #${boxNo} 출력 완료`,
  });

  return true;
}
