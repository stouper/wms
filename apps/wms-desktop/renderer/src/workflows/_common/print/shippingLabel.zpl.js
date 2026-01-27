// apps/wms-desktop/renderer/src/workflows/_common/print/shippingLabel.zpl.js
// ZPL CJ대한통운 표준 운송장 (100x150mm, 세로)
// CJ대한통운 택배 표준 API Developer Guide V3.9.3 기준
// ⚠️ 한글은 프린터 폰트/인코딩에 따라 깨질 수 있어 (일단 영문/숫자 중심 운영 추천)

const esc = (s) => String(s ?? "").replace(/\r?\n/g, " ").trim();

export function renderShippingLabelZPL(data) {
  const d = data || {};

  // 운송장 기본 정보
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.tracking || "");
  const orderNo = esc(d.orderNo || d.orderId || d.custUseNo || "");
  const rcptYmd = esc(d.rcptYmd || d.receiptDate || "");

  // 도착지 코드 (주소정제 API 응답값)
  const destCode = esc(d.destCode || d.clsfcd || "");
  const subDestCode = esc(d.subDestCode || d.subclsfcd || "");
  const destDisplay = destCode && subDestCode ? `${destCode}-${subDestCode}` : (destCode || "");

  // 받는분 정보
  const receiverName = esc(d.receiverName || d.rcvrNm || d.toName || "");
  const receiverPhone = esc(d.receiverPhone || d.phone || d.toPhone || "");
  const receiverZip = esc(d.receiverZip || d.zip || d.postcode || "");
  const receiverAddr = esc(d.receiverAddr || d.address1 || d.addr1 || "");
  const receiverDetailAddr = esc(d.receiverDetailAddr || d.address2 || d.addr2 || "");

  // 보내는분 정보
  const senderName = esc(d.senderName || d.sendrNm || d.fromName || "");
  const senderPhone = esc(d.senderPhone || d.fromPhone || "");
  const senderAddr = esc(d.senderAddr || d.fromAddr || "");

  // 상품 정보
  const goodsName = esc(d.goodsName || d.gdsNm || d.productName || "");
  const goodsQty = d.goodsQty || d.gdsQty || d.qty || 1;

  // 박스 정보
  const boxType = esc(d.boxType || d.boxTypeCd || "02"); // 기본: 소
  const boxQty = d.boxQty || 1;

  // 운임 구분 (01:선불, 02:착불, 03:신용)
  const freightType = d.freightType || d.frtDvCd || "03";
  const freightLabel = freightType === "01" ? "선불" : freightType === "02" ? "착불" : "신용";

  // 배송 메시지
  const remark = esc(d.remark || d.remark1 || d.memo || d.note || "");

  // 바코드 값 (운송장번호)
  const barcodeValue = trackingNo || orderNo || "";

  // 100mm ≈ 4in, 150mm ≈ 6in
  // 203dpi 기준: 폭 812 dots, 높이 1218 dots
  // ✅ 반드시 ^XA로 시작, ^XZ로 끝나야 함
  const zplLines = [
    "^XA",
    "^CI28", // UTF-8 인코딩

    "^PW812",
    "^LL1218",

    // ===== 상단: 운송장번호 + 접수일자 =====
    "^CF0,28",
    `^FO40,20^FD운송장번호: ${trackingNo}^FS`,
    `^FO550,20^FD${rcptYmd}^FS`,

    // ===== 도착지 코드 (큰 글씨) =====
    "^CF0,70",
    `^FO40,60^FD${destDisplay}^FS`,

    // 박스타입 / 수량
    "^CF0,28",
    `^FO550,70^FD${boxType}^FS`,
    `^FO620,70^FD${boxQty}/${boxQty}^FS`,
    `^FO700,70^FD${freightLabel}^FS`,

    // ===== 구분선 =====
    "^FO30,130^GB752,0,2^FS",

    // ===== 받는분 영역 =====
    "^CF0,24",
    `^FO40,145^FD받는분^FS`,

    // 받는분 전화
    "^CF0,28",
    `^FO40,175^FD${receiverPhone}^FS`,

    // 받는분 이름 (큰 글씨)
    "^CF0,50",
    `^FO40,210^FD${receiverName}^FS`,

    // 받는분 주소
    "^CF0,28",
    `^FO40,275^FD(${receiverZip}) ${receiverAddr}^FS`,
    `^FO40,310^FD${receiverDetailAddr}^FS`,

    // ===== 구분선 =====
    "^FO30,350^GB752,0,2^FS",

    // ===== 보내는분 영역 =====
    "^CF0,22",
    `^FO40,365^FD보내는분: ${senderName} ${senderPhone}^FS`,
    `^FO40,395^FD${senderAddr}^FS`,

    // ===== 구분선 =====
    "^FO30,430^GB752,0,2^FS",

    // ===== 상품 정보 =====
    "^CF0,22",
    `^FO40,445^FD상품: ${goodsName} (수량: ${goodsQty})^FS`,

    // ===== 구분선 =====
    "^FO30,480^GB752,0,2^FS",

    // ===== 바코드 (운송장번호) =====
    "^BY3,2,100",
    "^BCN,100,Y,N,N",
    `^FO150,500^FD${barcodeValue}^FS`,

    // ===== 배송 메시지 =====
    remark ? `^CF0,22^FO40,640^FD배송메시지: ${remark}^FS` : "",

    // ===== 하단 고정 문구 =====
    "^CF0,18",
    "^FO40,700^FD고객님/받는분 상품 수령을 완료하신후 배송완료 해주십니다.^FS",

    "^XZ",
  ];

  // ✅ 빈 줄 제거 후 반환 (^XA로 시작, ^XZ로 끝 보장)
  return zplLines.filter(Boolean).join("\n");
}
