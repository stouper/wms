// apps/wms-desktop/renderer/src/workflows/_common/print/shippingLabel.html.js
// CJ대한통운 프리프린트 송장 용지용 (123mm x 100mm)
// 각 항목별 위치 조정 가능 (top, left 값 수정)

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

  // ========== CJ 필요 데이터 ==========

  // 1. 운송장번호
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.invcNo || "");

  // 2. 접수일자
  const rcptYmd = esc(d.rcptYmd || d.receiptDate || new Date().toISOString().slice(0, 10));

  // 3. 출력매수 (박스번호/총박스)
  const boxNo = d.boxNo || 1;
  const boxTotal = d.boxTotal || d.boxQty || 1;

  // 4. 분류코드 (대분류)
  const destCode = esc(d.destCode || d.clsfCd || "");

  // 5. 서브분류코드 (소분류)
  const subDestCode = esc(d.subDestCode || d.subClsfCd || "");

  // 6. 권역코드 P2P
  const p2pCd = esc(d.p2pCd || "");

  // 7. 받는분 이름
  const receiverName = esc(d.receiverName || d.rcvrNm || "");
  const maskedReceiverName = maskName(receiverName);

  // 8. 받는분 전화번호
  const receiverPhone = esc(d.receiverPhone || d.phone || "");
  const maskedReceiverPhone = maskPhone(receiverPhone);

  // 9. 받는분 휴대폰
  const receiverMobile = esc(d.receiverMobile || d.mobile || "");
  const maskedReceiverMobile = receiverMobile ? maskPhone(receiverMobile) : "";

  // 10. 받는분 우편번호
  const receiverZip = esc(d.receiverZip || d.zip || "");

  // 11. 받는분 주소
  const receiverAddr = esc(d.receiverAddr || d.address1 || d.addr1 || "");

  // 12. 받는분 상세주소
  const receiverDetailAddr = esc(d.receiverDetailAddr || d.address2 || d.addr2 || "");

  // 13. 주소약칭 (동/건물명 등)
  const clsfAddr = esc(d.clsfAddr || d.rcvrClsfAddr || "");

  // 14. 보내는분 이름
  const senderName = esc(d.senderName || d.sendrNm || "");

  // 15. 보내는분 전화번호
  const senderPhone = esc(d.senderPhone || "");

  // 16. 보내는분 주소
  const senderAddr = esc(d.senderAddr || "");

  // 17. 수량 (박스 수)
  const boxQty = d.boxQty || d.qty || 1;

  // 18. 운임금액
  const freight = d.freight || d.totalFreight || 0;

  // 19. 정산구분 (01:선불, 02:착불, 03:신용)
  const freightType = d.freightType || d.frtDvCd || "03";
  const freightLabel = freightType === "01" ? "선불" : freightType === "02" ? "착불" : "신용";

  // 20. 상품명
  const goodsName = esc(d.goodsName || d.gdsNm || d.productName || "");

  // 21. 상품수량
  const goodsQty = d.goodsQty || d.qty || 1;

  // 22. 배송메시지
  const remark = esc(d.remark || d.memo || d.dlvMsg || "");

  // 23. 배달점소명
  const branchName = esc(d.branchName || d.dlvBranNm || "");

  // 24. 배달사원 별칭
  const empNickname = esc(d.empNickname || d.dlvEmpNickNm || "");

  // 25. 주문번호 (고객참조)
  const orderNo = esc(d.orderNo || d.custUseNo || "");

  // 바코드용 값
  const destCodeBarcode = destCode + (subDestCode ? "-" + subDestCode : "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CJ대한통운 송장</title>
  <style>
    @page {
      size: 102mm 122mm;
      margin: 0;
    }
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      font-family: 'Malgun Gothic', 'Noto Sans KR', sans-serif;
    }
    body {
      width: 102mm;
      height: 122mm;
      background: #fff;
      position: relative;
    }

    /* 컨테이너 (반시계방향 90도 회전) */
    .label-container {
      width: 122mm;
      height: 102mm;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-90deg);
      transform-origin: center center;
    }

    @media print {
      html, body {
        width: 102mm !important;
        height: 122mm !important;
        margin: 0 !important;
        padding: 0 !important;
      }
    }

    /* ============================================
       각 항목별 스타일 - top/left 값 조정하여 위치 변경
       ============================================ */

    /* 1. 운송장번호 */
    .field-tracking-no {
      position: absolute;
      top: 3mm;
      left: 20mm;
      font-size: 14pt;
      font-weight: bold;
    }

    /* 2. 접수일자 */
    .field-rcpt-date {
      position: absolute;
      top: 3mm;
      left: 65mm;
      font-size: 9pt;
    }

    /* 3. 출력매수 */
    .field-box-count {
      position: absolute;
      top: 3mm;
      left: 85mm;
      font-size: 9pt;
    }

    /* 4. 분류코드 바코드 */
    .field-dest-barcode {
      position: absolute;
      top: 11mm;
      left: 3mm;
      width: 28mm;
      text-align: center;
    }
    .field-dest-barcode svg { height: 20mm; }

    /* 5. 분류코드 (대분류) */
    .field-dest-code {
      position: absolute;
      top: 14mm;
      left: 33mm;
      font-size: 48pt;
      font-weight: bold;
    }

    /* 6. 서브분류코드 (소분류) */
    .field-sub-dest-code {
      position: absolute;
      top: 18mm;
      left: 70mm;
      font-size: 36pt;
      font-weight: bold;
    }

    /* 7. 권역코드 P2P */
    .field-p2p-code {
      position: absolute;
      top: 22mm;
      left: 85mm;
      font-size: 24pt;
      font-weight: bold;
    }

    /* 8. 받는분 이름 */
    .field-receiver-name {
      position: absolute;
      top: 37mm;
      left: 8mm;
      font-size: 11pt;
      font-weight: bold;
    }

    /* 9. 받는분 전화번호 */
    .field-receiver-phone {
      position: absolute;
      top: 37mm;
      left: 35mm;
      font-size: 10pt;
      font-weight: bold;
    }

    /* 10. 받는분 휴대폰 */
    .field-receiver-mobile {
      position: absolute;
      top: 37mm;
      left: 60mm;
      font-size: 10pt;
    }

    /* 11. 받는분 우편번호 */
    .field-receiver-zip {
      position: absolute;
      top: 42mm;
      left: 8mm;
      font-size: 9pt;
    }

    /* 12. 받는분 주소 */
    .field-receiver-addr {
      position: absolute;
      top: 42mm;
      left: 22mm;
      font-size: 9pt;
      width: 75mm;
      line-height: 1.3;
    }

    /* 13. 받는분 상세주소 */
    .field-receiver-detail-addr {
      position: absolute;
      top: 47mm;
      left: 8mm;
      font-size: 9pt;
      width: 90mm;
    }

    /* 14. 주소약칭 */
    .field-clsf-addr {
      position: absolute;
      top: 52mm;
      left: 8mm;
      font-size: 20pt;
      font-weight: bold;
    }

    /* 15. 보내는분 이름 */
    .field-sender-name {
      position: absolute;
      top: 62mm;
      left: 8mm;
      font-size: 8pt;
    }

    /* 16. 보내는분 전화번호 */
    .field-sender-phone {
      position: absolute;
      top: 62mm;
      left: 30mm;
      font-size: 8pt;
    }

    /* 17. 보내는분 주소 */
    .field-sender-addr {
      position: absolute;
      top: 66mm;
      left: 8mm;
      font-size: 8pt;
      width: 55mm;
    }

    /* 18. 수량 */
    .field-box-qty {
      position: absolute;
      top: 62mm;
      left: 68mm;
      font-size: 9pt;
      font-weight: bold;
      width: 12mm;
      text-align: center;
    }

    /* 19. 운임금액 */
    .field-freight {
      position: absolute;
      top: 62mm;
      left: 80mm;
      font-size: 9pt;
      font-weight: bold;
      width: 12mm;
      text-align: center;
    }

    /* 20. 정산구분 */
    .field-freight-type {
      position: absolute;
      top: 62mm;
      left: 92mm;
      font-size: 9pt;
      font-weight: bold;
    }

    /* 21. 상품명 */
    .field-goods-name {
      position: absolute;
      top: 72mm;
      left: 3mm;
      font-size: 8pt;
      width: 70mm;
    }

    /* 22. 상품수량 */
    .field-goods-qty {
      position: absolute;
      top: 72mm;
      left: 75mm;
      font-size: 8pt;
    }

    /* 23. 배송메시지 */
    .field-remark {
      position: absolute;
      top: 78mm;
      left: 3mm;
      font-size: 8pt;
      width: 95mm;
    }

    /* 24. 배달점소명 */
    .field-branch-name {
      position: absolute;
      top: 86mm;
      left: 3mm;
      font-size: 14pt;
      font-weight: bold;
    }

    /* 25. 배달사원 별칭 */
    .field-emp-nickname {
      position: absolute;
      top: 86mm;
      left: 45mm;
      font-size: 14pt;
      font-weight: bold;
    }

    /* 26. 주문번호 */
    .field-order-no {
      position: absolute;
      top: 92mm;
      left: 3mm;
      font-size: 7pt;
      color: #666;
    }

    /* 27. 운송장 바코드 */
    .field-tracking-barcode {
      position: absolute;
      top: 84mm;
      left: 65mm;
      text-align: center;
    }
    .field-tracking-barcode svg { height: 10mm; width: 32mm; }

    /* 28. 운송장번호 (바코드 아래) */
    .field-tracking-no-bottom {
      position: absolute;
      top: 95mm;
      left: 65mm;
      font-size: 8pt;
      font-weight: bold;
      width: 32mm;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="label-container">
    <!-- 1. 운송장번호 -->
    <div class="field-tracking-no">${trackingNo}</div>

    <!-- 2. 접수일자 -->
    <div class="field-rcpt-date">${rcptYmd}</div>

    <!-- 3. 출력매수 -->
    <div class="field-box-count">${boxNo}/${boxTotal}</div>

    <!-- 4. 분류코드 바코드 -->
    <div class="field-dest-barcode">
      <svg id="destBarcode"></svg>
    </div>

    <!-- 5. 분류코드 (대분류) -->
    <div class="field-dest-code">${destCode || "----"}</div>

    <!-- 6. 서브분류코드 (소분류) -->
    <div class="field-sub-dest-code">${subDestCode ? "-" + subDestCode : ""}</div>

    <!-- 7. 권역코드 P2P -->
    <div class="field-p2p-code">${p2pCd}</div>

    <!-- 8. 받는분 이름 -->
    <div class="field-receiver-name">${maskedReceiverName}</div>

    <!-- 9. 받는분 전화번호 -->
    <div class="field-receiver-phone">${maskedReceiverPhone}</div>

    <!-- 10. 받는분 휴대폰 -->
    <div class="field-receiver-mobile">${maskedReceiverMobile}</div>

    <!-- 11. 받는분 우편번호 -->
    <div class="field-receiver-zip">${receiverZip}</div>

    <!-- 12. 받는분 주소 -->
    <div class="field-receiver-addr">${receiverAddr}</div>

    <!-- 13. 받는분 상세주소 -->
    <div class="field-receiver-detail-addr">${receiverDetailAddr}</div>

    <!-- 14. 주소약칭 -->
    <div class="field-clsf-addr">${clsfAddr}</div>

    <!-- 15. 보내는분 이름 -->
    <div class="field-sender-name">${senderName}</div>

    <!-- 16. 보내는분 전화번호 -->
    <div class="field-sender-phone">${senderPhone}</div>

    <!-- 17. 보내는분 주소 -->
    <div class="field-sender-addr">${senderAddr}</div>

    <!-- 18. 수량 -->
    <div class="field-box-qty">${boxQty}</div>

    <!-- 19. 운임금액 -->
    <div class="field-freight">${freight}</div>

    <!-- 20. 정산구분 -->
    <div class="field-freight-type">${freightLabel}</div>

    <!-- 21. 상품명 -->
    <div class="field-goods-name">${goodsName}</div>

    <!-- 22. 상품수량 -->
    <div class="field-goods-qty">수량: ${goodsQty}</div>

    <!-- 23. 배송메시지 -->
    <div class="field-remark">${remark}</div>

    <!-- 24. 배달점소명 -->
    <div class="field-branch-name">${branchName}</div>

    <!-- 25. 배달사원 별칭 -->
    <div class="field-emp-nickname">${empNickname}</div>

    <!-- 26. 주문번호 -->
    <div class="field-order-no">${orderNo}</div>

    <!-- 27. 운송장 바코드 -->
    <div class="field-tracking-barcode">
      <svg id="trackingBarcode"></svg>
    </div>

    <!-- 28. 운송장번호 (바코드 아래) -->
    <div class="field-tracking-no-bottom">${trackingNo}</div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    if (typeof JsBarcode !== 'undefined') {
      // 분류코드 바코드
      const destVal = "${destCodeBarcode}";
      if (destVal && destVal !== '-' && destVal !== '----') {
        try {
          JsBarcode("#destBarcode", destVal, {
            format: "CODE128",
            width: 2,
            height: 65,
            displayValue: false,
            margin: 0
          });
        } catch(e) { console.error("destBarcode error:", e); }
      }

      // 운송장 바코드
      if ("${trackingNo}") {
        try {
          JsBarcode("#trackingBarcode", "${trackingNo}", {
            format: "CODE128",
            width: 2,
            height: 35,
            displayValue: false,
            margin: 0
          });
        } catch(e) { console.error("trackingBarcode error:", e); }
      }
    }
  </script>
</body>
</html>`;
}
