// apps/wms-desktop/renderer/src/workflows/_common/print/packingList.zpl.js
export function buildZplPackingListLabel({ storeCode, jobTitle, jobId, boxNo, boxItems }) {
  const items = boxItems instanceof Map ? Array.from(boxItems.values()) : (Array.isArray(boxItems) ? boxItems : []);

  let y = 120;

  const safeTitle = (jobTitle || "매장 출고").toString();
  const safeStore = (storeCode || "").toString();
  const safeJob = (jobId || "").toString().slice(-8);
  const safeBox = Number(boxNo || 1);

  const lines = [
    "^XA",
    "^PW600",
    "^LL800",
    `^FO20,20^A0N,36,36^FD${safeTitle}^FS`,
    `^FO20,60^A0N,28,28^FDSTORE ${safeStore}  BOX ${safeBox}^FS`,
    `^FO20,90^A0N,22,22^FDJOB ${safeJob}^FS`,
    "^FO20,110^GB560,2,2^FS",
  ];

  for (const it of items) {
    const sku = (it?.skuCode || "").toString();
    const qty = Number(it?.qty || 0);
    if (!sku || qty <= 0) continue;
    lines.push(`^FO20,${y}^A0N,24,24^FD${sku}  x ${qty}^FS`);
    y += 30;
    if (y > 760) break;
  }

  lines.push("^XZ");
  return lines.join("");
}
