// apps/wms-desktop/renderer/src/workflows/_common/print/shippingLabel.html.js
// CJ대한통운 표준운송장 (가로 123mm x 세로 100mm)
// 프린터: TOSHIBA BV400 203dpi, 용지 102x122mm 가로모드
// PDF 가이드: 표준운송장 가이드(CJ대한통운)1_5인치_new_251105

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

  // ============================================================
  // [1] 운송장번호 (12pt)
  // 📍 CSS: .tracking-no { font-size: 12pt; }
  // 💡 데이터: CJ API 응답 또는 DB CjShipment.invcNo
  // ============================================================
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.invcNo || "");

  // ============================================================
  // [2] 접수일자 (8pt)
  // 📍 CSS: .row1-right > span:first-child
  // 💡 데이터: CJ API 응답 RCPT_YMD 또는 DB CjShipment.rcptYmd
  // ============================================================
  const rcptYmd = esc(d.rcptYmd || d.receiptDate || new Date().toISOString().slice(0, 10));

  // ============================================================
  // [3] 출력매수 (8pt) - "1/1" 형식
  // 📍 CSS: .row1-right > span:nth-child(2)
  // 💡 데이터: 프론트엔드에서 설정 (기본값 1)
  // ============================================================
  const boxNo = d.boxNo || 1;
  const boxTotal = d.boxTotal || d.boxQty || 1;

  // ============================================================
  // [4] 재출력여부 (8pt) - 빨간색 "재"
  // 📍 CSS: .reprint { color: red; }
  // 💡 데이터: printCount > 1 이면 "재" 표시
  // ============================================================
  const printCount = Number(d.printCount || 0);
  const reprintYn = printCount > 1 ? "재" : "";

  // ============================================================
  // [5] 분류코드 바코드 + [6] 분류코드 텍스트
  // 📍 CSS: .clsf-barcode, .clsf-main(36pt), .clsf-sub1(53pt), .clsf-sub2(36pt)
  // 💡 데이터: CJ 주소정제 API 응답 CLSFCD, SUBCLSFCD
  // 💡 SUB 분리: "4g" → sub1="4"(53pt), sub2="g"(36pt)
  // ============================================================
  const clsfCd = esc(d.destCode || d.clsfCd || d.dlvClsfCd || "");
  const subClsfCdRaw = esc(d.subDestCode || d.subClsfCd || d.dlvSubClsfCd || "");
  const { sub1, sub2 } = splitSubClsf(subClsfCdRaw);

  // ============================================================
  // [7] 받는분 성명 + [8] 받는분 전화번호 (10pt)
  // 📍 CSS: .receiver-contact { font-size: 10pt; }
  // 💡 데이터: DB JobParcel 또는 Excel 업로드 데이터
  // 💡 마스킹: 반품(isReturn)일 때 이름/전화 마스킹
  // ============================================================
  const receiverMask = isReturn;
  const receiverName = d.receiverName || d.rcvrNm || "";
  const receiverPhone = d.receiverPhone || d.phone || "";
  const receiverMobile = d.receiverMobile || d.mobile || "";
  const receiverNameOut = maybeMaskName(receiverName, receiverMask);
  const receiverPhoneOut = maybeMaskPhone(receiverPhone, receiverMask);
  const receiverMobileOut = receiverMobile ? maybeMaskPhone(receiverMobile, receiverMask) : "";

  // ============================================================
  // [9] 받는분주소 (9pt)
  // 📍 CSS: .receiver-addr { font-size: 9pt; }
  // 💡 데이터: CJ 정제주소(cjAddr) 우선, 없으면 원본주소
  // ============================================================
  const receiverAddr = esc(d.cjAddr || d.cjRoadAddr || d.receiverAddr || d.address1 || d.addr1 || "");
  const receiverDetailAddr = esc(d.cjAddrDetail || d.receiverDetailAddr || d.address2 || d.addr2 || "");
  const fullAddr = `${receiverAddr} ${receiverDetailAddr}`.trim();

  // ============================================================
  // [10] 주소약칭 (24pt)
  // 📍 CSS: .addr-short { font-size: 24pt; }
  // 💡 데이터: CJ 주소정제 API 응답 CLSFADDR (예: "동탄2신도시")
  // ============================================================
  const clsfAddr = esc(d.clsfAddr || d.rcvrClsfAddr || "");

  // ============================================================
  // [11] 보내는분 성명+전화번호 (7pt)
  // 📍 CSS: .row5 { font-size: 8pt; } (7pt 권장이나 가독성 위해 8pt)
  // 💡 데이터: 환경변수 CJ_SENDER_NAME, CJ_SENDER_TEL (cj-api.service.ts)
  // 💡 마스킹: 일반배송(!isReturn)일 때 마스킹
  // ============================================================
  const senderMask = !isReturn;
  const senderName = d.senderName || d.sender || d.sendrNm || "";
  const senderPhone = d.senderPhone || "";
  const senderNameOut = maybeMaskName(senderName, senderMask);
  const senderPhoneOut = maybeMaskPhone(senderPhone, senderMask);

  // ============================================================
  // [12] 운임그룹조정 + 수량 (10pt)
  // 📍 CSS: .row4 > div:first-child
  // 💡 데이터: 현재 미구현 (fareGroupAdj), 수량은 goodsQty
  // ============================================================
  const fareGroupAdj = esc(d.fareGroupAdj || d.frtGrpAdj || d.frtGrp || "");
  const goodsQty = Number(d.goodsQty || d.qty || 1) || 1;

  // ============================================================
  // [13] 운임 (10pt)
  // 📍 CSS: .row4 > div:nth-child(2)
  // 💡 데이터: 현재 미구현 (freight), 계약운임이라 표시 안함
  // ============================================================
  const freight = Number(d.totalFreight ?? d.freight ?? 0) || 0;

  // ============================================================
  // [14] 운임구분 (10pt)
  // 📍 CSS: .row4 > div:last-child
  // 💡 데이터: freightType (01=선불, 02=착불, 03=신용)
  // ============================================================
  const freightType = d.freightType || d.frtDvCd || "03";
  const freightLabel = freightType === "01" ? "선불" : freightType === "02" ? "착불" : "신용";

  // ============================================================
  // [15] 보내는분주소 (8pt)
  // 📍 CSS: .row5 > div:last-child
  // 💡 데이터: 환경변수 CJ_SENDER_ADDR (cj-api.service.ts)
  // ============================================================
  const senderAddr = esc(d.senderAddr || d.senderAddress || "");

  // ============================================================
  // [16] 상품명 (9pt)
  // 📍 CSS: .row6 { font-size: 9pt; }
  // 💡 데이터: DB JobParcel.goodsName 또는 Excel J열
  // ============================================================
  const goodsName = esc(d.goodsName || d.gdsNm || d.productName || "");

  // ============================================================
  // [17] 배송메시지 (8pt)
  // 📍 CSS: .row7 { font-size: 8pt; }
  // 💡 데이터: DB JobParcel.deliveryMessage 또는 Excel J열
  // ============================================================
  const remark = esc(d.remark || d.memo || d.dlvMsg || "");

  // ============================================================
  // [18] 배달점소-별칭 (18pt)
  // 📍 CSS: .branch { font-size: 18pt; }
  // 💡 데이터: CJ 주소정제 API 응답 CLLDLVBRANNM + CLLDLVEMPNICKNM
  // 💡 표시조건: 전담권역=01 또는 배송사원명=## 일 때만 표시
  // ============================================================
  const branchName = esc(d.branchName || d.dlvBranNm || d.dlvPreArrBranShortNm || "");
  const empNickname = esc(d.empNickname || d.dlvEmpNickNm || d.dlvPreArrEmpNickNm || "");
  const branchDisplay = empNickname ? `${branchName}-${empNickname}` : branchName;
  const showBranch = shouldShowBranchAlias(d);

  // ============================================================
  // [19] 권내배송코드 P2P (30pt)
  // 📍 CSS: .clsf-p2p { font-size: 30pt; }
  // 💡 데이터: CJ 주소정제 API 응답 P2PCD (P0~P50)
  // ============================================================
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
    .item1 { left: 15mm; top: 2mm; font-size: 12pt; }
    .item2 { left: 50mm; top: 3mm; font-size: 8pt; }
    .item3 { left: 72mm; top: 3mm; font-size: 8pt; }
    .item4 { left: 85mm; top: 3mm; font-size: 8pt; color: red; }
    .item5 { left: 8mm; top: 11mm; width: 30mm; height: 15mm; }
    .item5 svg { width: 100%; height: 100%; }
    .item6 { left: 38mm; top: 6mm; }
    .item6 .main { font-size: 36pt; }
    .item6 .sub1 { font-size: 53pt; }   
    .item6 .sub2 { font-size: 36pt; }
    .item19 { left: 72mm; top: 25mm; font-size: 30pt; }
    .item8box { left: 75mm; top: 27mm; width: 35mm; height: 5mm; }
    .item8box svg { width: 100%; height: 100%; }
    .item7 { left: 7mm; top: 27mm; font-size: 10pt; }
    .item9 { left: 7mm; top: 30mm; font-size: 9pt; }
    .item10 { left: 7mm; top: 35mm; font-size: 24pt; }
    .item12 { left: 67mm; top: 37mm; font-size: 10pt; }
    .item13 { left: 80mm; top: 37mm; font-size: 10pt; }
    .item14 { left: 93mm; top: 37mm; font-size: 10pt; }
    .item11 { left: 7mm; top: 49mm; font-size: 7pt; }
    .item15 { left: 7mm; top: 52mm; font-size: 8pt; }
    .item16 { left: 3mm; top: 63mm; font-size: 9pt; }
    .item17 { left: 1mm; top: 69mm; font-size: 8pt; }
    .item18 { left: 1mm; top: 76mm; font-size: 18pt; }
    .trackingBox { left: 70mm; top: 86mm; }
    .trackingBox svg { width: 35mm; height: 15mm; }
    .trackingText { font-size: 9pt; text-align: center; }
  </style>
</head>
<body>
  <div class="label">
    <div class="item item1">${trackingNo}</div>
    <div class="item item2">${rcptYmd}</div>
    <div class="item item3">${boxNo}/${boxTotal}</div>
    ${reprintYn ? `<div class="item item4">${reprintYn}</div>` : ""}
    <div class="item item5"><svg id="clsfBarcode"></svg></div>
    <div class="item item6">
      <span class="main">${clsfCd || "----"}</span>${sub1 ? `-<span class="sub1">${sub1}</span>` : ""}${sub2 ? `<span class="sub2">${sub2}</span>` : ""}
    </div>
    ${p2pCd ? `<div class="item item19">${p2pCd}</div>` : ""}
    <div class="item item8box"><svg id="trackingBarcode2"></svg></div>
    <div class="item item7">${receiverNameOut} ${receiverPhoneOut}${receiverMobileOut ? ` / ${receiverMobileOut}` : ""}</div>
    <div class="item item9">${fullAddr}</div>
    <div class="item item10">${clsfAddr}</div>
    <div class="item item12">${fareGroupAdj ? `${fareGroupAdj} ` : ""}${goodsQty}</div>
    <div class="item item13">${freight}</div>
    <div class="item item14">${freightLabel}</div>
    <div class="item item11">${senderNameOut} ${senderPhoneOut}</div>
    <div class="item item15">${senderAddr}</div>
    <div class="item item16">${goodsName} (${goodsQty})</div>
    <div class="item item17">${remark}</div>
    <div class="item item18">${showBranch ? branchDisplay : ""}</div>
    <div class="item trackingBox">
      <svg id="trackingBarcode"></svg>
      <div class="trackingText">${trackingNo}</div>
    </div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    if (typeof JsBarcode !== 'undefined') {
      if ("${clsfCd}") {
        try {
          JsBarcode("#clsfBarcode", "${clsfCd}", {
            format: "CODE128A",
            width: 2,
            height: 45,
            displayValue: false,
            margin: 0
          });
        } catch(e) {}
      }
      if ("${trackingNo}") {
        try {
          JsBarcode("#trackingBarcode", "${trackingNo}", {
            format: "CODE128C",
            width: 2,
            height: 40,
            displayValue: false,
            margin: 0
          });
          JsBarcode("#trackingBarcode2", "${trackingNo}", {
            format: "CODE128C",
            width: 1.5,
            height: 50,
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
