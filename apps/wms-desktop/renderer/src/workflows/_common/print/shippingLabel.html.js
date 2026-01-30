// apps/wms-desktop/renderer/src/workflows/_common/print/shippingLabel.html.js
// CJ대한통운 표준운송장 (가로 123mm x 세로 100mm)
// 프린터: TOSHIBA BV400 203dpi, 용지 102x122mm 가로모드
// PDF 가이드: 표준운송장 가이드(CJ대한통운)1_5인치_new_251105

const esc = (s) => String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

// [8] 예약구분(일반/반품) 판단
function isReturnReservation(d) {
  const v = d?.reserveType ?? d?.reserveKind ?? d?.rsvType ?? d?.rsvDvCd ?? d?.reqDvCd ?? d?.returnType ?? d?.returnYn ?? d?.isReturn ?? "";
  if (v === true) return true;
  const s = String(v).toUpperCase().trim();
  if (s === "RETURN" || s === "RET" || s === "R" || s === "반품" || s === "Y" || s === "YES" || s === "TRUE" || s === "02") return true;
  return false;
}

// 마스킹: 이름 두번째 글자
function maskNameSecondChar(name) {
  const n = String(name ?? "").trim();
  if (!n) return "";
  const arr = [...n];
  if (arr.length < 2) return arr[0] + "*";
  arr[1] = "*";
  return arr.join("");
}

// 마스킹: 전화번호 마지막 4자리
function maskPhoneLast4(phone) {
  const p = String(phone ?? "").trim();
  if (!p) return "";
  const digits = (p.match(/\d/g) || []).join("");
  if (digits.length < 4) return p;
  let remain = 4;
  let out = "";
  for (let i = p.length - 1; i >= 0; i--) {
    const ch = p[i];
    if (/\d/.test(ch) && remain > 0) {
      out = "*" + out;
      remain--;
    } else {
      out = ch + out;
    }
  }
  return out;
}

function maybeMaskName(name, shouldMask) {
  return esc(shouldMask ? maskNameSecondChar(name) : name);
}

function maybeMaskPhone(phone, shouldMask) {
  return esc(shouldMask ? maskPhoneLast4(phone) : phone);
}

export function renderShippingLabelHTML(data) {
  const d = data || {};

  // 예약구분
  const isReturn = isReturnReservation(d);

  // ============================================================
  // [1] 운송장번호 (12pt)
  // ============================================================
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.invcNo || "");

  // ============================================================
  // [2] 접수일자 (8pt)
  // ============================================================
  const rcptYmd = esc(d.rcptYmd || d.receiptDate || new Date().toISOString().slice(0, 10));

  // ============================================================
  // [3] 출력매수 (8pt) - "1/1" 형식
  // ============================================================
  const boxNo = d.boxNo || 1;
  const boxTotal = d.boxTotal || d.boxQty || 1;

  // ============================================================
  // [4] 재출력여부 (8pt) - 빨간색 "재"
  // ============================================================
  const printCount = Number(d.printCount || 0);
  const reprintYn = printCount > 1 ? "재" : "";

  // ============================================================
  // [5] 분류코드 바코드 + [6] 분류코드 텍스트
  // ============================================================
  const clsfCd = esc(d.destCode || d.clsfCd || d.dlvClsfCd || "");
  const clsfCdFirst = clsfCd ? clsfCd.slice(0, 1) : "";
  const clsfCdRest = clsfCd ? clsfCd.slice(1) : "";
  const subClsfCd = esc(d.subDestCode || d.subClsfCd || d.dlvSubClsfCd || "");

  // ============================================================
  // [7] 받는분 성명 + [8] 받는분 전화번호 (10pt)
  // ============================================================
  const receiverMask = true;  // 항상 마스킹
  const receiverName = d.receiverName || d.rcvrNm || "";
  const receiverPhone = d.receiverPhone || d.phone || "";
  const receiverMobile = d.receiverMobile || d.mobile || "";
  const receiverNameOut = maybeMaskName(receiverName, receiverMask);
  const receiverPhoneOut = maybeMaskPhone(receiverPhone, receiverMask);
  const receiverMobileOut = receiverMobile ? maybeMaskPhone(receiverMobile, receiverMask) : "";

  // ============================================================
  // [9] 받는분주소 (9pt)
  // ============================================================
  const receiverAddr = esc(d.cjAddr || d.cjRoadAddr || d.receiverAddr || d.address1 || d.addr1 || "");
  const receiverDetailAddr = esc(d.cjAddrDetail || d.receiverDetailAddr || d.address2 || d.addr2 || "");
  const fullAddr = `${receiverAddr} ${receiverDetailAddr}`.trim();

  // ============================================================
  // [10] 주소약칭 (24pt)
  // ============================================================
  const clsfAddr = esc(d.clsfAddr || d.rcvrClsfAddr || "");

  // ============================================================
  // [11] 보내는분 성명+전화번호 (7pt) - 기본값: 테스트 / 010-123-4567
  // ============================================================
  const senderMask = true;  // 항상 마스킹
  const senderName = d.senderName || d.sender || d.sendrNm || "테스트";
  const senderPhone = d.senderPhone || "010-123-4567";
  const senderNameOut = maybeMaskName(senderName, senderMask);
  const senderPhoneOut = maybeMaskPhone(senderPhone, senderMask);

  // ============================================================
  // [12] 운임그룹조정 + 수량 (10pt)
  // ============================================================
  const fareGroupAdj = esc(d.fareGroupAdj || d.frtGrpAdj || d.frtGrp || "");
  const goodsQty = Number(d.goodsQty || d.qty || 1) || 1;

  // ============================================================
  // [13] 운임 (10pt)
  // ============================================================
  const freight = Number(d.totalFreight ?? d.freight ?? 0) || 0;

  // ============================================================
  // [14] 운임구분 (10pt)
  // ============================================================
  const freightType = d.freightType || d.frtDvCd || "03";
  const freightLabel = freightType === "01" ? "선불" : freightType === "02" ? "착불" : "신용";

  // ============================================================
  // [15] 보내는분주소 (8pt) - 기본값: 서울시 테스트구
  // ============================================================
  const senderAddr = esc(d.senderAddr || d.senderAddress || "서울시 테스트구");

  // ============================================================
  // [16] 상품명 (9pt)
  // ============================================================
  const goodsName = esc(d.goodsName || d.gdsNm || d.productName || "");

  // ============================================================
  // [17] 배송메시지 (8pt)
  // ============================================================
  const remark = esc(d.remark || d.memo || d.dlvMsg || "");

  // ============================================================
  // [18] 배달점소-별칭 (18pt)
  // 💡 조건: 배송사원명="##" 수신 시 → "배달점소-별칭: xxx" 표시
  // 💡 그 외: 원래 값(branchName-empNickname) 그대로 출력
  // ============================================================
  const branchName = esc(d.branchName || d.dlvBranNm || d.dlvPreArrBranShortNm || "");
  const empNickname = esc(d.empNickname || d.dlvEmpNickNm || d.dlvPreArrEmpNickNm || "");
  const branchValue = empNickname ? `${branchName}-${empNickname}` : branchName;
  const isSpecialBranch = empNickname === "##";
  const branchDisplay = isSpecialBranch ? `배달점소-별칭: ${branchValue}` : branchValue;

  // ============================================================
  // [19] 권내배송코드 P2PCD (30pt) - P0~P50
  // ============================================================
  const p2pCd = esc(d.p2pCd || d.p2pcd || d.P2PCD || d.P2P_CD || "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CJ대한통운 송장</title>
  <style>
    @page { size: 123mm 100mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      margin: 0;
      padding: 0;
      font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif;
      font-weight: 700;
      background: #fff;
      color: #000;
    }
    .label {
      position: relative;
      width: 123mm;
      height: 100mm;
      overflow: hidden;
    }
    .item { position: absolute; }
    /* [1] 운송장번호 */
    .item1 { left: 15mm; top: 2mm; font-size: 12pt; }
    /* [2] 접수일자 */
    .item2 { left: 50mm; top: 3mm; font-size: 8pt; }
    /* [3] 출력매수 */
    .item3 { left: 72mm; top: 3mm; font-size: 8pt; }
    /* [4] 재출력여부 */
    .item4 { left: 85mm; top: 3mm; font-size: 8pt; color: red; }
    /* [5] 분류코드 바코드 */
    .item5 { left: 5mm; top: 9mm; width: 30mm; height: 15mm; }
    .item5 svg { width: 100%; height: 100%; }
    /* [6] 분류코드 텍스트 */
    .item6 { left: 40mm; top: 2mm; }
    .item6 .clsf-first { font-size: 34pt; text-decoration: underline; }
    .item6 .clsf-rest { font-size: 52pt; }
    .item6 .clsf-sub { font-size: 34pt; }
    /* [19] P2PCD */
    .item19 { left: 100mm; top: 10mm; font-size: 25pt; }
    /* [8] 운송장번호 바코드 */
    .item8box { left: 75mm; top: 26mm; width: 50mm; height: 4mm; }
    .item8box svg { width: 100%; height: 100%; }
    /* [7] 받는분 성명+전화 */
    .item7 { left: 7mm; top: 25mm; font-size: 10pt; }
    /* [9] 받는분 주소 */
    .item9 { left: 7mm; top: 30mm; font-size: 9pt; }
    /* [10] 주소약칭 */
    .item10 { left: 7mm; top: 33mm; font-size: 24pt; }
    /* [12] 운임그룹+수량 */
    .item12 { left: 70mm; top: 46mm; font-size: 8pt; }
    /* [13] 운임 */
    .item13 { left: 97mm; top: 46mm; font-size: 8pt; }
    /* [14] 운임구분 */
    .item14 { left: 115mm; top: 46mm; font-size: 8pt; }
    /* [11] 보내는분 성명+전화 */
    .item11 { left: 7mm; top: 48mm; font-size: 8pt; }
    /* [15] 보내는분 주소 */
    .item15 { left: 7mm; top: 45mm; font-size: 8pt; }
    /* [16] 상품명 */
    .item16 { left: 4mm; top: 55mm; font-size: 9pt; }
    /* [17] 배송메시지 */
    .item17 { left: 3mm; top: 87mm; font-size: 8pt; }
    /* [18] 배달점소-별칭 */
    .item18 { left: 3mm; top: 91mm; font-size: 18pt; }
    /* 하단 운송장바코드 */
    .trackingBox { left: 85mm; top: 88mm; }
    .trackingBox svg { width: 35mm; height: 10mm; }
    .trackingText { font-size: 6pt; text-align: center; display: block; margin-top: -2mm; }
  </style>
</head>
<body>
  <div class="label">
    <!-- [1] 운송장번호 -->
    <div class="item item1">${trackingNo}</div>
    <!-- [2] 접수일자 -->
    <div class="item item2">${rcptYmd}</div>
    <!-- [3] 출력매수 -->
    <div class="item item3">${boxNo}/${boxTotal}</div>
    <!-- [4] 재출력여부 -->
    ${reprintYn ? `<div class="item item4">${reprintYn}</div>` : ""}
    <!-- [5] 분류코드 바코드 -->
    <div class="item item5"><svg id="clsfBarcode"></svg></div>
    <!-- [6] 분류코드 텍스트 -->
    <div class="item item6">
      <span class="clsf-first">${clsfCdFirst || "-"}</span><span class="clsf-rest">${clsfCdRest || "---"}</span>${subClsfCd ? `-<span class="clsf-sub">${subClsfCd}</span>` : ""}
    </div>
    <!-- [19] P2PCD -->
    ${p2pCd ? `<div class="item item19">${p2pCd}</div>` : ""}
    <!-- [8] 운송장번호 바코드 -->
    <div class="item item8box"><svg id="trackingBarcode2"></svg></div>
    <!-- [7] 받는분 성명+전화 -->
    <div class="item item7">${receiverNameOut} ${receiverPhoneOut}${receiverMobileOut ? ` / ${receiverMobileOut}` : ""}</div>
    <!-- [9] 받는분 주소 -->
    <div class="item item9">${fullAddr}</div>
    <!-- [10] 주소약칭 -->
    <div class="item item10">${clsfAddr}</div>
    <!-- [12] 운임그룹+수량 -->
    <div class="item item12">${fareGroupAdj ? `${fareGroupAdj} ` : ""}${goodsQty}</div>
    <!-- [13] 운임 -->
    <div class="item item13">${freight}</div>
    <!-- [14] 운임구분 -->
    <div class="item item14">${freightLabel}</div>
    <!-- [11] 보내는분 성명+전화 -->
    <div class="item item11">${senderNameOut} ${senderPhoneOut}</div>
    <!-- [15] 보내는분 주소 -->
    <div class="item item15">${senderAddr}</div>
    <!-- [16] 상품명 -->
    <div class="item item16">${goodsName} (${goodsQty})</div>
    <!-- [17] 배송메시지 -->
    <div class="item item17">${remark}</div>
    <!-- [18] 배달점소-별칭 -->
    ${branchDisplay ? `<div class="item item18">${branchDisplay}</div>` : ""}
    <!-- 하단 운송장바코드 -->
    <div class="item trackingBox">
      <svg id="trackingBarcode"></svg>
      <div class="trackingText">${trackingNo}</div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    if (typeof JsBarcode !== 'undefined') {
      // [5] 분류코드 바코드 CODE128A
      if ("${clsfCd}") {
        try {
          JsBarcode("#clsfBarcode", "${clsfCd}", {
            format: "CODE128A",
            width: 2,
            height: 50,
            displayValue: false,
            margin: 0
          });
        } catch(e) {}
      }
      // [8] 운송장번호 바코드 CODE128C
      if ("${trackingNo}") {
        try {
          JsBarcode("#trackingBarcode", "${trackingNo}", {
            format: "CODE128C",
            width: 1.8,
            height: 40,
            displayValue: false,
            margin: 0
          });
          JsBarcode("#trackingBarcode2", "${trackingNo}", {
            format: "CODE128C",
            width: 2,
            height: 30,
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
