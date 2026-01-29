// apps/wms-desktop/renderer/src/workflows/_common/print/shippingLabel.html.js
// CJ대한통운 표준운송장 (가로 123mm x 세로 100mm)
// 프린터: 좌→우 출력, 좌측 상단 기준

const esc = (s) => String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

// 예약구분(일반/반품) 판단
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

// 분류코드 SUB 분리 (예: "4g" -> sub1="4", sub2="g")
function splitSubClsf(sub) {
  const s = String(sub ?? "").trim();
  if (!s) return { sub1: "", sub2: "" };
  if (s.length === 1) return { sub1: s, sub2: "" };
  return { sub1: s.slice(0, 1), sub2: s.slice(1) };
}

// 배달점소-별칭 표시 조건 (전담권역=01 또는 배송사원명=##)
function shouldShowBranchAlias(d) {
  const zone = String(d?.dedicatedZone ?? d?.dlvZone ?? d?.dlvArea ?? d?.preArrArea ?? "").trim();
  const emp = String(d?.empNickname ?? d?.dlvEmpNickNm ?? d?.CLLDLVEMPNICKNM ?? "").trim();
  return zone === "01" || emp === "##";
}

export function renderShippingLabelHTML(data) {
  const d = data || {};

  // 예약구분
  const isReturn = isReturnReservation(d);

  // 1. 운송장번호 (12pt)
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.invcNo || "");

  // 2. 접수일자 (8pt)
  const rcptYmd = esc(d.rcptYmd || d.receiptDate || new Date().toISOString().slice(0, 10));

  // 3. 출력매수 (8pt)
  const boxNo = d.boxNo || 1;
  const boxTotal = d.boxTotal || d.boxQty || 1;

  // 4. 재출력여부 (8pt) - printCount 기반
  const printCount = Number(d.printCount || 0);
  const reprintYn = printCount > 1 ? "재" : "";

  // 5, 6. 분류코드 (36pt + 53pt + 36pt)
  const clsfCd = esc(d.destCode || d.clsfCd || d.dlvClsfCd || "");
  const subClsfCdRaw = esc(d.subDestCode || d.subClsfCd || d.dlvSubClsfCd || "");
  const { sub1, sub2 } = splitSubClsf(subClsfCdRaw);

  // 7. 받는분 성명+전화번호 (10pt)
  const receiverMask = isReturn;
  const receiverName = d.receiverName || d.rcvrNm || "";
  const receiverPhone = d.receiverPhone || d.phone || "";
  const receiverMobile = d.receiverMobile || d.mobile || "";
  const receiverNameOut = maybeMaskName(receiverName, receiverMask);
  const receiverPhoneOut = maybeMaskPhone(receiverPhone, receiverMask);
  const receiverMobileOut = receiverMobile ? maybeMaskPhone(receiverMobile, receiverMask) : "";

  // 9. 받는분주소 (9pt) - CJ 정제 주소 우선
  const receiverAddr = esc(d.cjAddr || d.cjRoadAddr || d.receiverAddr || d.address1 || d.addr1 || "");
  const receiverDetailAddr = esc(d.cjAddrDetail || d.receiverDetailAddr || d.address2 || d.addr2 || "");
  const fullAddr = `${receiverAddr} ${receiverDetailAddr}`.trim();

  // 10. 주소약칭 (24pt)
  const clsfAddr = esc(d.clsfAddr || d.rcvrClsfAddr || "");

  // 11. 보내는분 성명+전화번호 (7pt)
  const senderMask = !isReturn;
  const senderName = d.senderName || d.sender || d.sendrNm || "";
  const senderPhone = d.senderPhone || "";
  const senderNameOut = maybeMaskName(senderName, senderMask);
  const senderPhoneOut = maybeMaskPhone(senderPhone, senderMask);

  // 12. 운임그룹조정 + 수량 (10pt)
  const fareGroupAdj = esc(d.fareGroupAdj || d.frtGrpAdj || d.frtGrp || "");
  const goodsQty = Number(d.goodsQty || d.qty || 1) || 1;

  // 13. 운임 (10pt)
  const freight = Number(d.totalFreight ?? d.freight ?? 0) || 0;

  // 14. 운임구분 (10pt)
  const freightType = d.freightType || d.frtDvCd || "03";
  const freightLabel = freightType === "01" ? "선불" : freightType === "02" ? "착불" : "신용";

  // 15. 보내는분주소 (8pt)
  const senderAddr = esc(d.senderAddr || d.senderAddress || "");

  // 16. 상품명 (9pt)
  const goodsName = esc(d.goodsName || d.gdsNm || d.productName || "");

  // 17. 배송메시지 (8pt)
  const remark = esc(d.remark || d.memo || d.dlvMsg || "");

  // 18. 배달점소-별칭 (18pt)
  const branchName = esc(d.branchName || d.dlvBranNm || d.dlvPreArrBranShortNm || "");
  const empNickname = esc(d.empNickname || d.dlvEmpNickNm || d.dlvPreArrEmpNickNm || "");
  const branchDisplay = empNickname ? `${branchName}-${empNickname}` : branchName;
  const showBranch = shouldShowBranchAlias(d);

  // 19. 권내배송코드 P2P (30pt)
  const p2pCd = esc(d.p2pCd || d.p2pcd || "");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CJ대한통운 송장</title>
  <style>
    @page { size: 123mm 100mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 123mm;
      height: 100mm;
      font-family: 'Noto Sans KR', 'Malgun Gothic', sans-serif;
      font-weight: 700;
      background: #fff;
      color: #000;
    }
    .label {
      width: 123mm;
      height: 100mm;
      padding: 2mm;
      font-size: 9pt;
    }

    /* 1행: 운송장번호 + 접수일자 + 출력매수 + 재출력 */
    .row1 {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 6mm;
      padding-bottom: 1mm;
    }
    .tracking-no { font-size: 12pt; }
    .row1-right { display: flex; gap: 3mm; font-size: 8pt; }
    .reprint { color: red; }

    /* 2행: 분류코드 바코드 + 분류코드 + P2P */
    .row2 {
      display: flex;
      height: 20mm;
      align-items: center;
    }
    .clsf-barcode {
      width: 28mm;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .clsf-barcode svg { height: 16mm; }
    .clsf-text {
      flex: 1;
      display: flex;
      align-items: baseline;
      padding-left: 2mm;
      gap: 0.5mm;
    }
    .clsf-main { font-size: 36pt; }
    .clsf-hyphen { font-size: 36pt; }
    .clsf-sub1 { font-size: 53pt; line-height: 0.9; }
    .clsf-sub2 { font-size: 36pt; }
    .clsf-p2p { font-size: 30pt; margin-left: 3mm; }

    /* 3행: 받는분 정보 + 주소약칭 */
    .row3 {
      display: flex;
      min-height: 22mm;
    }
    .receiver-info {
      flex: 1;
      padding: 1mm;
    }
    .receiver-contact { font-size: 10pt; margin-bottom: 1mm; }
    .receiver-addr { font-size: 9pt; line-height: 1.3; }
    .addr-short-box {
      width: 40mm;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .addr-short { font-size: 24pt; text-align: center; line-height: 1.1; }

    /* 4행: 운임그룹+수량 / 운임 / 운임구분 */
    .row4 {
      display: flex;
      height: 6mm;
      font-size: 10pt;
    }
    .row4 > div {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    /* 5행: 보내는분 */
    .row5 {
      height: 10mm;
      padding: 1mm;
      font-size: 8pt;
      line-height: 1.4;
    }

    /* 6행: 상품명 */
    .row6 {
      height: 6mm;
      padding: 1mm;
      font-size: 9pt;
      display: flex;
      align-items: center;
    }

    /* 7행: 배송메시지 */
    .row7 {
      height: 6mm;
      padding: 1mm;
      font-size: 8pt;
      display: flex;
      align-items: center;
    }

    /* 8행: 배달점소-별칭 + 운송장 바코드 */
    .row8 {
      display: flex;
      height: 18mm;
      align-items: center;
    }
    .branch {
      flex: 1;
      font-size: 18pt;
      padding-left: 2mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .tracking-barcode {
      width: 50mm;
      text-align: center;
    }
    .tracking-barcode svg { height: 12mm; }
    .tracking-barcode-text { font-size: 9pt; margin-top: 1mm; }
  </style>
</head>
<body>
  <div class="label">
    <!-- 1행: 운송장번호 + 접수일자 + 출력매수 + 재출력 -->
    <div class="row1">
      <span class="tracking-no">${trackingNo}</span>
      <div class="row1-right">
        <span>${rcptYmd}</span>
        <span>${boxNo}/${boxTotal}</span>
        ${reprintYn ? `<span class="reprint">${reprintYn}</span>` : ""}
      </div>
    </div>

    <!-- 2행: 분류코드 -->
    <div class="row2">
      <div class="clsf-barcode">
        <svg id="clsfBarcode"></svg>
      </div>
      <div class="clsf-text">
        <span class="clsf-main">${clsfCd || "----"}</span>
        ${sub1 ? `<span class="clsf-hyphen">-</span><span class="clsf-sub1">${sub1}</span>` : ""}
        ${sub2 ? `<span class="clsf-sub2">${sub2}</span>` : ""}
        ${p2pCd ? `<span class="clsf-p2p">${p2pCd}</span>` : ""}
      </div>
    </div>

    <!-- 3행: 받는분 -->
    <div class="row3">
      <div class="receiver-info">
        <div class="receiver-contact">
          ${receiverNameOut} ${receiverPhoneOut}${receiverMobileOut ? ` / ${receiverMobileOut}` : ""}
        </div>
        <div class="receiver-addr">${fullAddr}</div>
      </div>
      <div class="addr-short-box">
        <div class="addr-short">${clsfAddr}</div>
      </div>
    </div>

    <!-- 4행: 운임 -->
    <div class="row4">
      <div>${fareGroupAdj ? `${fareGroupAdj} ` : ""}${goodsQty}</div>
      <div>${freight}</div>
      <div>${freightLabel}</div>
    </div>

    <!-- 5행: 보내는분 -->
    <div class="row5">
      <div>${senderNameOut} ${senderPhoneOut}</div>
      <div>${senderAddr}</div>
    </div>

    <!-- 6행: 상품명 -->
    <div class="row6">${goodsName} (${goodsQty})</div>

    <!-- 7행: 배송메시지 -->
    <div class="row7">${remark}</div>

    <!-- 8행: 배달점소 + 운송장바코드 -->
    <div class="row8">
      <div class="branch">${showBranch ? branchDisplay : ""}</div>
      <div class="tracking-barcode">
        <svg id="trackingBarcode"></svg>
        <div class="tracking-barcode-text">${trackingNo}</div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    if (typeof JsBarcode !== 'undefined') {
      // 5. 분류코드 바코드: CODE128A
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
      // 8. 운송장번호 바코드: CODE128C
      if ("${trackingNo}") {
        try {
          JsBarcode("#trackingBarcode", "${trackingNo}", {
            format: "CODE128C",
            width: 2,
            height: 40,
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
