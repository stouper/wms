
// apps/wms-desktop/renderer/src/lib/parseParcelRequestFile.js

/**
 * parseParcelRequestFileToRows(arrayBuffer, fileName)
 * - 택배요청 엑셀(온라인 주문서 양식) 전용 파서
 * - 헤더 자동 탐지(주문번호/수취인명/수취인주소 등)
 * - rows: 주문 단위 row 배열 반환
 */

export function parseParcelRequestFileToRows(arrayBuffer, fileName = "") {
  let XLSX;
try {
  XLSX = require("xlsx");
} catch (e) {
  throw new Error("xlsx 패키지가 필요합니다. (npm i xlsx)");
}
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error("시트를 찾을 수 없습니다.");
  const ws = wb.Sheets[sheetName];

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  const { headerRowIndex, headerKeys } = detectHeaderRow(grid);
  const dataRows = grid.slice(headerRowIndex + 1);

  const objs = dataRows
    .filter((r) => Array.isArray(r) && r.some((x) => String(x ?? "").trim() !== ""))
    .map((r) => {
      const o = {};
      for (let i = 0; i < headerKeys.length; i++) o[headerKeys[i]] = r[i] ?? "";
      return o;
    });

  const rows = normalizeParcelRows(objs);

  return {
    fileType: "xlsx",
    sheetName,
    rows,
    sample: rows.slice(0, 20),
  };
}

/**
 * 택배요청 엑셀의 대표 헤더(템플릿 기준)
 * - 주문번호(쇼핑몰)
 * - 주문자명
 * - 수취인명
 * - 수취인우편번호
 * - 수취인주소
 * - 수취인전화번호2
 * - 옵션(수집)
 * - 수량
 * - 판매가
 * - 배송메세지
 * - 매장코드
 * - 매장명
 */
function normalizeParcelRows(objs) {
  const out = [];

  for (const o of objs || []) {
    const orderNo = pick(o, ["주문번호(쇼핑몰)", "주문번호", "orderno", "orderNo"]);
    const ordererName = pick(o, ["주문자명", "주문자", "orderer", "ordererName"]);
    const receiverName = pick(o, ["수취인명", "수령인", "receiver", "receiverName"]);
    const zipcode = pick(o, ["수취인우편번호", "우편번호", "zipcode", "zip"]);
    const address = pick(o, ["수취인주소", "주소", "address", "addr"]);
    const phone = pick(o, ["수취인전화번호2", "수취인전화번호", "전화번호", "phone", "tel"]);
    const optionRaw = pick(o, ["옵션(수집)", "옵션", "option", "optionRaw"]);
    const qty = pick(o, ["수량", "qty", "Qty", "QTY"]);
    const price = pick(o, ["판매가", "가격", "price"]);
    const message = pick(o, ["배송메세지", "배송메시지", "메세지", "message", "memo"]);
    const storeCode = pick(o, ["매장코드", "거래처코드", "storeCode"]);
    const storeName = pick(o, ["매장명", "거래처명", "storeName"]);

    const row = {
      orderNo: String(orderNo ?? "").trim(),
      ordererName: String(ordererName ?? "").trim(),
      receiverName: String(receiverName ?? "").trim(),
      zipcode: String(zipcode ?? "").trim(),
      address: String(address ?? "").trim(),
      phone: String(phone ?? "").trim(),
      optionRaw: String(optionRaw ?? "").trim(),
      qty: toInt(qty),
      price: toInt(price),
      message: String(message ?? "").trim(),
      storeCode: String(storeCode ?? "").trim(),
      storeName: String(storeName ?? "").trim(),
    };

    // 완전 빈 행 제외
    if (
      !row.orderNo &&
      !row.receiverName &&
      !row.address &&
      !row.optionRaw &&
      !row.qty &&
      !row.storeCode
    ) {
      continue;
    }

    out.push(row);
  }

  return out;
}

/** --- helpers --- */

function detectHeaderRow(grid) {
  // 헤더 후보: '주문번호' '수취인명' '옵션' 중 2개 이상 포함된 행
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const r = grid[i];
    if (!Array.isArray(r)) continue;
    const joined = r.map((x) => String(x ?? "").trim()).join(" | ");
    const hit =
      (joined.includes("주문번호") ? 1 : 0) +
      (joined.includes("수취인명") || joined.includes("수령인") ? 1 : 0) +
      (joined.includes("옵션") ? 1 : 0) +
      (joined.includes("수량") ? 1 : 0);
    if (hit >= 2) {
      const headerKeys = r.map((x) => String(x ?? "").trim());
      return { headerRowIndex: i, headerKeys };
    }
  }

  // fallback: 1행을 헤더로 간주
  const headerKeys = (grid[0] || []).map((x) => String(x ?? "").trim());
  return { headerRowIndex: 0, headerKeys };
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return "";
}

function toInt(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}
