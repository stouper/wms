// apps/wms-desktop/renderer/src/workflows/_common/excel/parseInventoryReset.js

/**
 * 재고 초기화용 엑셀 파서
 *
 * 필수 헤더:
 * - SKU/코드 (sku): SKU 코드
 * - 수량 (qty): 재고 수량
 * - MakerCode/바코드 (makerCode): 바코드/메이커코드
 * - 상품명 (name): 상품명
 * - 매장/창고 (storeName): 매장명 (설정 > 매장관리의 매장명과 매칭)
 *
 * 선택 헤더:
 * - Location (location): 창고 위치 코드 (매장인 경우 자동으로 FLOOR 적용)
 * - 상품구분 (productType): 상품 카테고리
 */

export async function parseInventoryResetFile(arrayBuffer, fileName = "") {
  let XLSX;
  try {
    XLSX = await import("xlsx");
  } catch (e) {
    throw new Error("xlsx 패키지가 필요합니다. (npm i xlsx)");
  }

  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error("시트를 찾을 수 없습니다.");
  const ws = wb.Sheets[sheetName];

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  console.log("🔍 재고 초기화 엑셀 파싱 시작");
  console.log("📄 시트명:", sheetName);
  console.log("📄 전체 행 개수:", grid.length);

  // 헤더 후보 (정규화된 값으로 비교)
  const CODE_HEADERS = ["코드", "code", "sku", "skucode", "상품코드", "품번", "제품코드"].map(normHeader);
  const QTY_HEADERS = ["수량전산", "qty", "수량", "재고", "onhand", "재고수량", "기준수량"].map(normHeader);
  const MAKER_HEADERS = ["maker코드", "makercode", "바코드", "barcode"].map(normHeader);
  const NAME_HEADERS = ["코드명", "name", "상품명", "productname"].map(normHeader);
  const PRODUCT_TYPE_HEADERS = ["producttype", "상품구분", "카테고리", "category", "아이템", "item", "type"].map(normHeader);
  const LOC_HEADERS = ["location", "locationcode", "로케이션", "location코드", "랙", "진열", "위치", "loc"].map(normHeader);
  const STORE_HEADERS = ["매장/창고", "매장", "창고", "store", "storename", "매장명", "지점", "지점명"].map(normHeader);

  const headerRowIndex = pickHeaderRowIdx(grid, CODE_HEADERS, QTY_HEADERS);
  if (headerRowIndex < 0) {
    throw new Error("SKU/코드, 수량 컬럼을 찾을 수 없습니다.");
  }

  const headers = (grid[headerRowIndex] || []).map((c) => normHeader(c));
  console.log("📄 헤더 행 인덱스:", headerRowIndex);
  console.log("📄 정규화된 헤더:", headers);

  // 각 컬럼 인덱스 찾기
  const idxCode = headers.findIndex((x) => CODE_HEADERS.includes(x));
  const idxQty = headers.findIndex((x) => QTY_HEADERS.includes(x));
  const idxMaker = headers.findIndex((x) => MAKER_HEADERS.includes(x));
  const idxName = headers.findIndex((x) => NAME_HEADERS.includes(x));
  const idxProductType = headers.findIndex((x) => PRODUCT_TYPE_HEADERS.includes(x));
  const idxLoc = headers.findIndex((x) => LOC_HEADERS.includes(x));
  const idxStore = headers.findIndex((x) => STORE_HEADERS.includes(x));

  console.log("📄 컬럼 인덱스:", { idxCode, idxQty, idxMaker, idxName, idxProductType, idxLoc, idxStore });

  const dataRows = grid.slice(headerRowIndex + 1);
  console.log("📄 데이터 행 개수:", dataRows.length);

  const rows = [];
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const line = dataRows[i];
    if (!Array.isArray(line) || line.every((x) => String(x ?? "").trim() === "")) {
      continue; // 빈 행 스킵
    }

    const rawSku = String(line[idxCode] ?? "").trim();
    const rowNum = headerRowIndex + 2 + i; // 엑셀 행 번호 (1-based)

    if (!rawSku) {
      errors.push(`행 ${rowNum}: SKU/코드가 없습니다.`);
      continue;
    }

    const qtyRaw = line[idxQty];
    const qty = toInt(qtyRaw);
    if (qty < 0) {
      errors.push(`행 ${rowNum}: 수량은 0 이상이어야 합니다. (입력값: ${qtyRaw})`);
      continue;
    }

    const location = idxLoc >= 0 ? String(line[idxLoc] ?? "").trim() : "";
    const makerCode = idxMaker >= 0 ? String(line[idxMaker] ?? "").trim() : "";
    const name = idxName >= 0 ? String(line[idxName] ?? "").trim() : "";
    const productType = idxProductType >= 0 ? String(line[idxProductType] ?? "").trim() : "";
    const storeName = idxStore >= 0 ? String(line[idxStore] ?? "").trim() : "";

    // 필수 필드 검증 (location은 선택 - 매장인 경우 FLOOR 자동 적용)
    if (!makerCode) {
      errors.push(`행 ${rowNum}: MakerCode가 없습니다.`);
      continue;
    }
    if (!name) {
      errors.push(`행 ${rowNum}: 상품명이 없습니다.`);
      continue;
    }
    if (!storeName) {
      errors.push(`행 ${rowNum}: 매장/창고가 없습니다.`);
      continue;
    }

    rows.push({
      sku: rawSku.toUpperCase(),
      qty,
      location,
      makerCode,
      name,
      productType: productType || undefined,
      storeName,
    });
  }

  console.log("📄 파싱 완료: 성공", rows.length, "건, 오류", errors.length, "건");

  return {
    fileType: "xlsx",
    sheetName,
    rows,
    errors,
    sample: rows.slice(0, 20),
  };
}

/**
 * 헤더 정규화: 공백/괄호 제거, 소문자화
 * 예) "수량(전산)" -> "수량전산", "Maker코드" -> "maker코드"
 */
function normHeader(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/\s+/g, "")
    .replace(/[\(\)\[\]\{\}]/g, "")
    .replace(/[▲▼△▽]/g, "")
    .toLowerCase();
}

/** 헤더 행 자동 탐색 */
function pickHeaderRowIdx(grid, CODE_HEADERS, QTY_HEADERS) {
  const maxScan = Math.min(30, grid.length);
  for (let i = 0; i < maxScan; i++) {
    const hs = (grid[i] || []).map((c) => normHeader(c)).filter(Boolean);
    if (hs.length <= 0) continue;

    const hasCode = hs.some((h) => CODE_HEADERS.includes(h));
    const hasQty = hs.some((h) => QTY_HEADERS.includes(h));
    if (hasCode && hasQty) return i;
  }
  return -1;
}

function toInt(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}
