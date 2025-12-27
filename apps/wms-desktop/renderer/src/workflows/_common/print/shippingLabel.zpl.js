// apps/wms-desktop/renderer/src/workflows/_common/print/labels/shippingLabel.zpl.js
// ZPL (미래 Zebra 등) 택배 송장/박스 라벨 (100x150mm, 세로)
// ⚠️ 한글은 프린터 폰트/인코딩에 따라 깨질 수 있어 (일단 영문/숫자 중심 운영 추천)

const esc = (s) => String(s ?? "").replace(/\r?\n/g, " ").trim();

export function renderShippingLabelZPL(data) {
  const d = data || {};

  const carrier = esc(d.carrier || d.courier || "");
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.tracking || "");
  const orderNo = esc(d.orderNo || d.orderId || d.ref || "");
  const receiverName = esc(d.receiverName || d.toName || d.name || "");
  const phone = esc(d.phone || d.toPhone || d.mobile || "");
  const zip = esc(d.zip || d.postcode || "");
  const address1 = esc(d.address1 || d.addr1 || d.address || "");
  const address2 = esc(d.address2 || d.addr2 || d.detailAddress || "");
  const barcodeValue = esc(d.barcodeValue || trackingNo || orderNo || "");

  // 100mm ≈ 4in, 150mm ≈ 6in
  // 203dpi 기준 대략: 폭 812 dots, 높이 1218 dots
  // 프린터 DPI에 따라 PW/LL은 튜닝 필요할 수 있음.
  return [
    "^XA",
    "^CI28",

    "^PW812",
    "^LL1218",

    "^CF0,50",
    `^FO40,30^FD${carrier || "SHIP"}^FS`,

    "^CF0,28",
    `^FO40,95^FDTRACK: ${trackingNo}^FS`,
    `^FO40,130^FDORDER: ${orderNo}^FS`,

    "^CF0,45",
    `^FO40,190^FD${receiverName}^FS`,

    "^CF0,30",
    `^FO40,250^FD${phone}^FS`,

    "^CF0,28",
    `^FO40,310^FD(${zip}) ${address1}^FS`,
    `^FO40,345^FD${address2}^FS`,

    "^BY3,2,120",
    "^BCN,120,Y,N,N",
    `^FO40,430^FD${barcodeValue}^FS`,

    d.note ? `^CF0,22^FO40,580^FD${esc(d.note)}^FS` : "",

    "^XZ",
  ].filter(Boolean).join("\n");
}
