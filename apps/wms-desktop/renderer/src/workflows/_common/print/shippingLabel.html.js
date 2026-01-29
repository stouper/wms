// apps/wms-desktop/renderer/src/workflows/_common/print/shippingLabel.html.js
// CJ대한통운 표준운송장 (123mm x 100mm)
// ✅ 프린터 방향(102mm x 122mm) 기준 유지 + CJ 좌표계(123x100) "캔버스"를 top-left 기준으로 1회 회전
// - 방향은 프린터가 잘 나오는 값(102x122)을 그대로 사용
// - 실제 레이아웃/좌표는 CJ 가이드(123x100) 기준으로 유지 (캔버스만 회전)
// - 회전/이동은 .canvas에서만 수행 (중앙정렬/translate(-50%) 같은 것 금지)

const esc = (s) => String(s ?? "").replace(/</g, "&lt;").replace(/>/g, "&gt;").trim();

// --------------------
// 예약구분(일반/반품) 판단
// --------------------
function isReturnReservation(d) {
  const v =
    d?.reserveType ??
    d?.reserveKind ??
    d?.rsvType ??
    d?.rsvDvCd ??
    d?.reqDvCd ??
    d?.returnType ??
    d?.returnYn ??
    d?.isReturn ??
    "";

  if (v === true) return true;

  const s = String(v).toUpperCase().trim();
  if (s === "RETURN" || s === "RET" || s === "R") return true;
  if (s === "반품") return true;
  if (s === "Y" || s === "YES" || s === "TRUE") return true;

  // (프로젝트별로 다를 수 있어 보수적으로)
  if (s === "02") return true;

  return false;
}

// --------------------
// 마스킹 (가이드 기본값)
// - 받는분: 일반=해제, 반품=마스킹
// - 보내는분: 일반=마스킹, 반품=해제
// - 규칙: 이름 두번째 글자 / 전화번호 마지막 4자리
// --------------------
function maskNameSecondChar(name) {
  const n = String(name ?? "").trim();
  if (!n) return "";
  const arr = [...n];
  if (arr.length < 2) return arr[0] + "*";
  arr[1] = "*";
  return arr.join("");
}

function maskPhoneLast4Safe(phone) {
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
  return out.replace(/\*{4}$/, "****");
}

function maybeMaskName(name, shouldMask) {
  return esc(shouldMask ? maskNameSecondChar(name) : name);
}

function maybeMaskPhone(phone, shouldMask) {
  return esc(shouldMask ? maskPhoneLast4Safe(phone) : phone);
}

// --------------------
// 분류코드 SUB 분리 (SUB1 / SUB2)
// 예: "4g" -> SUB1="4"(53pt), SUB2="g"(36pt)
// --------------------
function splitSubClsf(sub) {
  const s = String(sub ?? "").trim();
  if (!s) return { sub1: "", sub2: "" };
  if (s.length === 1) return { sub1: s, sub2: "" };
  return { sub1: s.slice(0, 1), sub2: s.slice(1) };
}

// --------------------
// 배달점소-별칭 표시 조건
// - 전담권역=01 또는 배송사원명=## 일 때 표시
// --------------------
function shouldShowBranchAlias(d) {
  const zone = String(
    d?.dedicatedZone ??
      d?.dlvZone ??
      d?.dlvArea ??
      d?.preArrArea ??
      d?.dlvPreArrArea ??
      d?.dlvPreArrAreaCd ??
      d?.DUTY_AREA ??
      ""
  ).trim();

  const emp = String(
    d?.empNickname ??
      d?.dlvEmpNickNm ??
      d?.dlvPreArrEmpNickNm ??
      d?.CLLDLVEMPNICKNM ??
      ""
  ).trim();

  return zone === "01" || emp === "##";
}

export function renderShippingLabelHTML(data) {
  const d = data || {};

  // ✅ 프린터 미세 오프셋(mm) — 전체가 통째로 조금 밀리면 여기만 조정하면 됨
  // 예) 오른쪽으로 2mm 밀림 => -2, 아래로 1mm 내려감 => -1
  const offX = Number(d.printOffsetXmm ?? d.offsetXmm ?? 0) || 0;
  const offY = Number(d.printOffsetYmm ?? d.offsetYmm ?? 0) || 0;

  // 예약구분
  const isReturn = isReturnReservation(d);

  // 운송장번호 (12pt)
  const trackingNo = esc(d.trackingNo || d.waybillNo || d.invcNo || "");

  // 접수일자 (8pt)
  const rcptYmd = esc(d.rcptYmd || d.receiptDate || new Date().toISOString().slice(0, 10));

  // 출력매수 (8pt)
  const boxNo = d.boxNo || 1;
  const boxTotal = d.boxTotal || d.boxQty || 1;

  // 분류코드
  const clsfCd = esc(d.destCode || d.clsfCd || d.dlvClsfCd || "");
  const subClsfCdRaw = esc(d.subDestCode || d.subClsfCd || d.dlvSubClsfCd || "");
  const { sub1, sub2 } = splitSubClsf(subClsfCdRaw);

  // 받는분 (가이드 기본값: 일반 해제 / 반품 마스킹)
  const receiverMask = isReturn;
  const receiverName = d.receiverName || d.rcvrNm || "";
  const receiverPhone = d.receiverPhone || d.phone || "";
  const receiverMobile = d.receiverMobile || d.mobile || "";

  const receiverNameOut = maybeMaskName(receiverName, receiverMask);
  const receiverPhoneOut = maybeMaskPhone(receiverPhone, receiverMask);
  const receiverMobileOut = receiverMobile ? maybeMaskPhone(receiverMobile, receiverMask) : "";

  // 받는분주소 (9pt) - CJ 정제 주소 우선 사용
  const receiverAddr = esc(d.cjAddr || d.cjRoadAddr || d.receiverAddr || d.address1 || d.addr1 || "");
  const receiverDetailAddr = esc(d.cjAddrDetail || d.receiverDetailAddr || d.address2 || d.addr2 || "");
  const fullAddr = `${receiverAddr} ${receiverDetailAddr}`.trim();

  // 주소약칭 (24pt)
  const clsfAddr = esc(d.clsfAddr || d.rcvrClsfAddr || "");

  // 보내는분 (가이드 기본값: 일반 마스킹 / 반품 해제)
  const senderMask = !isReturn;
  const senderName = d.senderName || d.sendrNm || "";
  const senderPhone = d.senderPhone || "";
  const senderAddr = d.senderAddr || "";

  const senderNameOut = maybeMaskName(senderName, senderMask);
  const senderPhoneOut = maybeMaskPhone(senderPhone, senderMask);

  // 운임
  const freightType = d.freightType || d.frtDvCd || "03";
  const freightLabel = freightType === "01" ? "선불" : freightType === "02" ? "착불" : "신용";
  const freight = Number(d.totalFreight ?? d.freight ?? 0) || 0;

  // 운임그룹조정 + 수량
  const fareGroupAdj = esc(d.fareGroupAdj || d.frtGrpAdj || d.frtGrp || d.frtGrpCd || "");
  const goodsQty = Number(d.goodsQty || d.qty || 1) || 1;
  const fareGroupAndQty = `${fareGroupAdj ? `${fareGroupAdj} ` : ""}${goodsQty}`.trim();

  // 상품 / 메시지
  const goodsName = esc(d.goodsName || d.gdsNm || d.productName || "");
  const remark = esc(d.remark || d.memo || d.dlvMsg || "");

  // 배달점소-별칭
  const branchName = esc(d.branchName || d.dlvBranNm || d.dlvPreArrBranShortNm || d.dlvPreArrBranNm || "대한통운");
  const empNickname = esc(d.empNickname || d.dlvEmpNickNm || d.dlvPreArrEmpNickNm || "");
  const branchDisplay = empNickname ? `${branchName}-${empNickname}` : branchName;
  const showBranch = shouldShowBranchAlias(d);

  // 권역코드 P2P
  const p2pCd = esc(d.p2pCd || d.p2pcd || "");

  // 분류코드 'g' 보정
  const sub2IsG = String(sub2).toLowerCase().includes("g");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>CJ대한통운 송장</title>
  <style>
    /* ✅ 프린터가 "정방향"으로 출력되는 종이 설정 (너가 맞다고 확인한 값) */
    @page { size: 102mm 122mm; margin: 0; }

    html, body {
      width: 102mm;
      height: 122mm;
      margin: 0;
      padding: 0;
    }

    * {
      box-sizing: border-box;
      font-family: 'Noto Sans KR', 'Noto Sans Korea', 'HY견고딕', 'Malgun Gothic', sans-serif;
    }

    /* 프린터용 시트(기준) */
    .sheet {
      position: relative;
      width: 102mm;
      height: 122mm;
      overflow: hidden;
      background: #fff;
      color: #000;
    }

    /* ✅ CJ 좌표계 캔버스(123x100)를 "top-left 기준으로만" 1회 회전 */
    .canvas {
      position: absolute;
      top: 0;
      left: 0;

      width: 123mm;
      height: 100mm;

      transform-origin: 0 0;
      /* rotate(-90deg)만 하면 Y가 음수로 가서 밖으로 튀니,
         먼저 아래로 123mm 내리고 회전 */
      transform: translate(${offX}mm, calc(123mm + ${offY}mm)) rotate(-90deg);

      /* 캔버스 내부 기본값 */
      font-size: 9pt;
      font-weight: 700;
      padding: 2mm;
    }

    /* 1행: 운송장번호 + 날짜 + 매수 */
    .row1 {
      display: flex;
      justify-content: space-between;
      align-items: center;
      height: 6mm;
      border-bottom: 0.3mm solid #000;
    }
    .tracking-label { font-size: 12pt; font-weight: 700; }
    .top-right { display: flex; gap: 4mm; font-size: 8pt; font-weight: 700; }

    /* 2행: 분류코드 영역 */
    .row2 {
      display: flex;
      height: 20mm;
      border-bottom: 0.3mm solid #000;
      align-items: center;
      overflow: hidden;
    }
    .clsf-barcode {
      width: 25mm;
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 0.3mm solid #000;
      height: 100%;
    }
    .clsf-barcode svg { height: 16mm; }
    .clsf-text {
      flex: 1;
      display: flex;
      align-items: baseline;
      padding-left: 3mm;
      gap: 1mm;
      white-space: nowrap;
    }
    .clsf-main { font-size: 36pt; font-weight: 700; line-height: 1; }
    .clsf-hyphen { font-size: 36pt; font-weight: 700; line-height: 1; }
    .clsf-sub1 { font-size: 53pt; font-weight: 700; line-height: 0.9; }
    .clsf-sub2 { font-size: 36pt; font-weight: 700; line-height: 1; position: relative; }
    .clsf-sub2.g-adjust { top: -2mm; }
    .clsf-p2p { font-size: 30pt; font-weight: 700; margin-left: 2mm; }

    /* 3행: 받는분 */
    .row3 {
      display: flex;
      border-bottom: 0.3mm solid #000;
      min-height: 22mm;
    }
    .receiver-left {
      flex: 1;
      padding: 1mm;
      border-right: 0.3mm solid #000;
    }
    .receiver-contact { font-size: 10pt; font-weight: 700; }
    .receiver-addr { font-size: 9pt; margin-top: 1mm; line-height: 1.3; font-weight: 700; }
    .receiver-right {
      width: 45mm;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1mm;
    }
    .addr-short { font-size: 24pt; font-weight: 700; text-align: center; line-height: 1.1; }

    /* 4행: 운임 정보 */
    .row4 {
      display: flex;
      height: 6mm;
      border-bottom: 0.3mm solid #000;
      align-items: center;
      font-size: 10pt;
      font-weight: 700;
    }
    .row4 > div {
      flex: 1;
      text-align: center;
      border-right: 0.3mm solid #000;
    }
    .row4 > div:last-child { border-right: none; }

    /* 5행: 보내는분 */
    .row5 {
      height: 10mm;
      border-bottom: 0.3mm solid #000;
      padding: 1mm;
      font-size: 7pt;
      line-height: 1.4;
      font-weight: 700;
    }

    /* 6행: 상품 */
    .row6 {
      height: 6mm;
      border-bottom: 0.3mm solid #000;
      padding: 1mm;
      font-size: 9pt;
      display: flex;
      align-items: center;
      font-weight: 700;
    }

    /* 7행: 배송메시지 */
    .row7 {
      height: 6mm;
      border-bottom: 0.3mm solid #000;
      padding: 1mm;
      font-size: 8pt;
      display: flex;
      align-items: center;
      font-weight: 700;
    }

    /* 8행: 배달점소 + 바코드 */
    .row8 {
      display: flex;
      height: 18mm;
      align-items: center;
    }
    .branch {
      flex: 1;
      font-size: 18pt;
      font-weight: 700;
      padding-left: 2mm;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .barcode-area {
      width: 50mm;
      text-align: center;
    }
    .barcode-area svg { height: 12mm; }
    .barcode-text { font-size: 9pt; font-weight: 700; margin-top: 1mm; }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="canvas">
      <!-- 1행 -->
      <div class="row1">
        <span class="tracking-label">운송장번호 ${trackingNo}</span>
        <div class="top-right">
          <span>${rcptYmd}</span>
          <span>${boxNo}/${boxTotal}</span>
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
          ${sub2 ? `<span class="clsf-sub2 ${sub2IsG ? "g-adjust" : ""}">${sub2}</span>` : ""}
          ${p2pCd ? `<span class="clsf-p2p">${p2pCd}</span>` : ""}
        </div>
      </div>

      <!-- 3행: 받는분 -->
      <div class="row3">
        <div class="receiver-left">
          <div class="receiver-contact">${receiverNameOut} ${receiverPhoneOut}${receiverMobileOut ? ` / ${receiverMobileOut}` : ""}</div>
          <div class="receiver-addr">${fullAddr}</div>
        </div>
        <div class="receiver-right">
          <div class="addr-short">${clsfAddr || ""}</div>
        </div>
      </div>

      <!-- 4행: 운임 -->
      <div class="row4">
        <div>${fareGroupAndQty || ""}</div>
        <div>${freight}</div>
        <div>${freightLabel}</div>
      </div>

      <!-- 5행: 보내는분 -->
      <div class="row5">
        <div>보내는분: ${senderNameOut} ${senderPhoneOut}</div>
        <div>${esc(senderAddr)}</div>
      </div>

      <!-- 6행: 상품 -->
      <div class="row6">
        상품: ${goodsName} (수량: ${goodsQty})
      </div>

      <!-- 7행: 배송메시지 -->
      <div class="row7">
        ${remark ? `배송메시지: ${remark}` : ""}
      </div>

      <!-- 8행: 배달점소 + 바코드 -->
      <div class="row8">
        <div class="branch">${showBranch ? branchDisplay : ""}</div>
        <div class="barcode-area">
          <svg id="trackingBarcode"></svg>
          <div class="barcode-text">${trackingNo}</div>
        </div>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"></script>
  <script>
    if (typeof JsBarcode !== 'undefined') {
      // 5) 분류코드바코드: CODE128A (MOD103) - 가이드 기준
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

      // 8) 운송장번호바코드: CODE128C (MOD103) - 가이드 기준
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
