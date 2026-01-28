// apps/wms-desktop/renderer/src/workflows/_common/print/shippingLabel.html.js
// CJ대한통운 프리프린트 송장 용지용 (123mm x 100mm)
// 절대 위치(absolute position)로 노란 영역에 데이터만 출력

const esc = (s) => String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

// 이름 마스킹 (두번째 글자)
function maskName(name) {
  if (!name || name.length < 2) return name || "";
  const arr = [...name];
  arr[1] = "*";
  return arr.join("");
}

// 전화번호 마스킹 (마지막 4자리)
function maskPhone(phone) {
  if (!phone) return "";
  return phone.replace(/(\d{4})$/, "****");
}

export function renderShippingLabelHTML(data) {
  const d = data || {};

  // 운송장번호
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.invcNo || "");

  // 접수일자
  const rcptYmd = esc(d.rcptYmd || d.receiptDate || new Date().toISOString().slice(0, 10));

  // 출력매수
  const boxNo = d.boxNo || 1;
  const boxTotal = d.boxTotal || d.boxQty || 1;

  // 분류코드
  const clsfCd = esc(d.destCode || d.clsfCd || d.dlvClsfCd || "");
  const subClsfCd = esc(d.subDestCode || d.subClsfCd || d.dlvSubClsfCd || "");

  // 받는분 정보
  const receiverName = esc(d.receiverName || d.rcvrNm || "");
  const receiverPhone = esc(d.receiverPhone || d.phone || "");
  const receiverMobile = esc(d.receiverMobile || d.mobile || "");
  const maskedName = maskName(receiverName);
  const maskedPhone = maskPhone(receiverPhone);
  const maskedMobile = receiverMobile ? maskPhone(receiverMobile) : "";

  // 받는분주소
  const receiverAddr = esc(d.receiverAddr || d.address1 || d.addr1 || "");
  const receiverDetailAddr = esc(d.receiverDetailAddr || d.address2 || d.addr2 || "");
  const fullAddr = `${receiverAddr} ${receiverDetailAddr}`.trim();

  // 주소약칭
  const clsfAddr = esc(d.clsfAddr || d.rcvrClsfAddr || "");

  // 보내는분 정보
  const senderName = esc(d.senderName || d.sendrNm || "");
  const senderPhone = esc(d.senderPhone || "");
  const senderAddr = esc(d.senderAddr || "");

  // 운임 정보
  const freightType = d.freightType || d.frtDvCd || "03";
  const freightLabel = freightType === "01" ? "선불" : freightType === "02" ? "착불" : "신용";
  const freight = d.freight || d.totalFreight || 0;
  const boxQty = d.boxQty || d.qty || 1;

  // 상품명
  const goodsName = esc(d.goodsName || d.gdsNm || d.productName || "");
  const goodsQty = d.goodsQty || d.qty || 1;

  // 배송메시지
  const remark = esc(d.remark || d.memo || d.dlvMsg || "");

  // 배달점소-별칭
  const branchName = esc(d.branchName || d.dlvBranNm || "대한통운");
  const empNickname = esc(d.empNickname || d.dlvEmpNickNm || "");
  const branchDisplay = empNickname ? `${branchName}-${empNickname}` : branchName;

  // 권역코드 P2P
  const p2pCd = esc(d.p2pCd || "");

  // 바코드용 분류코드 값
  const clsfBarcodeVal = clsfCd + (subClsfCd ? "-" + subClsfCd : "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CJ대한통운 송장</title>
  <style>
    @page {
      size: 123mm 100mm;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Malgun Gothic', 'Noto Sans KR', sans-serif;
    }
    html {
      margin: 0;
      padding: 0;
    }
    body {
      width: 123mm;
      height: 100mm;
      background: #fff;
      position: relative;
      margin: 0;
      padding: 0;
    }
    .label-inner {
      width: 100mm;
      height: 123mm;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(90deg);
      transform-origin: center center;
    }

    @media print {
      html, body {
        width: 123mm !important;
        height: 100mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    }

    /* 프리프린트 용지에 맞춰 데이터만 출력 - 절대 위치 사용 */
    /* ※ top, left 값은 실제 용지에 맞게 조정 필요 */

    /* 1행: 운송장번호 */
    .tracking-number {
      position: absolute;
      top: 3mm;
      left: 20mm;
      font-size: 14pt;
      font-weight: bold;
    }

    /* 1행: 날짜 */
    .date-box {
      position: absolute;
      top: 3mm;
      left: 65mm;
      font-size: 9pt;
    }

    /* 1행: 매수 */
    .box-count {
      position: absolute;
      top: 3mm;
      left: 85mm;
      font-size: 9pt;
    }

    /* 2행: 분류코드 바코드 */
    .clsf-barcode {
      position: absolute;
      top: 11mm;
      left: 3mm;
      width: 28mm;
      text-align: center;
    }
    .clsf-barcode svg { height: 20mm; }

    /* 2행: 분류코드 텍스트 */
    .clsf-text {
      position: absolute;
      top: 14mm;
      left: 33mm;
      display: flex;
      align-items: center;
      gap: 2mm;
    }
    .clsf-main { font-size: 48pt; font-weight: bold; }
    .clsf-sub { font-size: 36pt; font-weight: bold; }
    .clsf-p2p { font-size: 24pt; font-weight: bold; margin-left: 5mm; }

    /* 3행: 받는분 연락처 + 주소 */
    .receiver-info {
      position: absolute;
      top: 37mm;
      left: 8mm;
      width: 80mm;
    }
    .receiver-contact { font-size: 10pt; font-weight: bold; }
    .receiver-addr { font-size: 9pt; margin-top: 1mm; line-height: 1.3; }

    /* 3행: 주소약칭 */
    .addr-short {
      position: absolute;
      top: 48mm;
      left: 8mm;
      font-size: 24pt;
      font-weight: bold;
    }

    /* 4행: 보내는분 정보 */
    .sender-info {
      position: absolute;
      top: 60mm;
      left: 8mm;
      font-size: 8pt;
      width: 55mm;
    }

    /* 4행: 수량/운임/정산 값 */
    .freight-values {
      position: absolute;
      top: 60mm;
      left: 68mm;
      display: flex;
      font-size: 9pt;
      font-weight: bold;
    }
    .freight-values > div {
      width: 15mm;
      text-align: center;
    }

    /* 5행: 상품정보 */
    .product-info {
      position: absolute;
      top: 70mm;
      left: 3mm;
      width: 117mm;
      font-size: 8pt;
      line-height: 1.4;
    }

    /* 6행: 배송메시지 */
    .delivery-msg {
      position: absolute;
      top: 78mm;
      left: 3mm;
      width: 117mm;
      font-size: 8pt;
    }

    /* 7행: 배달점소 */
    .branch {
      position: absolute;
      top: 86mm;
      left: 3mm;
      font-size: 16pt;
      font-weight: bold;
    }

    /* 7행: 운송장 바코드 */
    .tracking-barcode {
      position: absolute;
      top: 84mm;
      left: 80mm;
      text-align: center;
    }
    .tracking-barcode svg { height: 10mm; width: 35mm; }
    .tracking-barcode .barcode-text { font-size: 8pt; font-weight: bold; }
  </style>
</head>
<body>
  <div class="label-inner">
    <!-- 1행: 운송장번호 -->
    <div class="tracking-number">${trackingNo}</div>
    <div class="date-box">${rcptYmd}</div>
    <div class="box-count">${boxNo}/${boxTotal}</div>

    <!-- 2행: 분류코드 -->
    <div class="clsf-barcode">
      <svg id="clsfBarcode"></svg>
    </div>
    <div class="clsf-text">
      <span class="clsf-main">${clsfCd || "----"}</span>
      ${subClsfCd ? `<span class="clsf-sub">-${subClsfCd}</span>` : ""}
      ${p2pCd ? `<span class="clsf-p2p">${p2pCd}</span>` : ""}
    </div>

    <!-- 3행: 받는분 -->
    <div class="receiver-info">
      <div class="receiver-contact">${maskedName} ${maskedPhone}${maskedMobile ? ` / ${maskedMobile}` : ""}</div>
      <div class="receiver-addr">${fullAddr}</div>
    </div>
    <div class="addr-short">${clsfAddr || ""}</div>

    <!-- 4행: 보내는분 + 운임 -->
    <div class="sender-info">${senderName} ${senderPhone}<br/>${senderAddr}</div>
    <div class="freight-values">
      <div>${boxQty}</div>
      <div>${freight}</div>
      <div>${freightLabel}</div>
    </div>

    <!-- 5행: 상품정보 -->
    <div class="product-info">${goodsName} (수량: ${goodsQty})</div>

    <!-- 6행: 배송메시지 -->
    <div class="delivery-msg">${remark}</div>

    <!-- 7행: 배달점소 + 바코드 -->
    <div class="branch">${branchDisplay}</div>
    <div class="tracking-barcode">
      <svg id="trackingBarcode"></svg>
      <div class="barcode-text">${trackingNo}</div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    if (typeof JsBarcode !== 'undefined') {
      const clsfVal = "${clsfBarcodeVal}";
      if (clsfVal && clsfVal !== '-' && clsfVal !== '----') {
        try {
          JsBarcode("#clsfBarcode", clsfVal, {
            format: "CODE128",
            width: 2,
            height: 65,
            displayValue: false,
            margin: 0
          });
        } catch(e) {}
      }
      if ("${trackingNo}") {
        try {
          JsBarcode("#trackingBarcode", "${trackingNo}", {
            format: "CODE128",
            width: 2,
            height: 35,
            displayValue: false,
            margin: 0
          });
        } catch(e) {}
      }
    }
  </script>
</body>
</html>`;
}
