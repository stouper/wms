// apps/wms-desktop/renderer/src/workflows/_common/excel/parseStoreBulkUpsert.js

/**
 * 매장 일괄 등록용 엑셀 파서
 *
 * - 2행: 헤더
 * - 3행~: 데이터
 *
 * 필수 헤더:
 * - 매장코드 (code): 매장 코드
 * - 매장명 (name): 매장 이름
 */

export async function parseStoreBulkUpsertFile(arrayBuffer, fileName = "") {
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

  console.log("🔍 매장 엑셀 파싱 시작");
  console.log("📄 시트명:", sheetName);
  console.log("📄 전체 행 개수:", grid.length);

  // 2행(인덱스 1)이 헤더
  const headerRowIndex = 1;
  const headerRow = grid[headerRowIndex] || [];
  const headerKeys = headerRow.map((x) => String(x ?? "").trim());

  console.log("📄 헤더 행 (2행):", headerKeys);

  // 3행(인덱스 2)부터 데이터
  const dataRows = grid.slice(headerRowIndex + 1);
  console.log("📄 데이터 행 개수:", dataRows.length);

  const items = [];
  const errors = [];

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i];
    if (!Array.isArray(r) || r.every((x) => String(x ?? "").trim() === "")) {
      continue; // 빈 행 스킵
    }

    const obj = {};
    for (let j = 0; j < headerKeys.length; j++) {
      obj[headerKeys[j]] = r[j] ?? "";
    }

    const code = pick(obj, ["매장코드", "storeCode", "StoreCode", "code", "Code", "매장", "사용자ID", "사용자id", "userId", "UserId", "user_id"]);
    const name = pick(obj, ["매장명", "storeName", "StoreName", "name", "Name", "이름", "사용자명"]);

    const rowNum = headerRowIndex + 2 + i; // 엑셀 행 번호 (1-based, 3행부터 시작)

    if (!code) {
      errors.push(`행 ${rowNum}: 매장코드가 없습니다.`);
      continue;
    }

    if (!name) {
      errors.push(`행 ${rowNum}: 매장명이 없습니다.`);
      continue;
    }

    items.push({
      code: String(code).trim(),
      name: String(name).trim(),
    });
  }

  console.log("📄 파싱 완료: 성공", items.length, "건, 오류", errors.length, "건");

  return {
    fileType: "xlsx",
    sheetName,
    items,
    errors,
    sample: items.slice(0, 20),
  };
}

/**
 * 헤더 정규화: 특수문자/공백/괄호 제거, 소문자화
 * 예) "매장코드▼" -> "매장코드", "Store Code" -> "storecode"
 */
function normHeader(s) {
  const raw = String(s ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/\s+/g, "")           // 공백 제거
    .replace(/[\(\)\[\]\{\}]/g, "") // 괄호 제거
    .replace(/[▲▼△▽↑↓←→]/g, "")   // 정렬 특수문자 제거
    .replace(/[\u200B-\u200D\uFEFF]/g, "") // 제로폭 문자/BOM 제거
    .toLowerCase();
}

function pick(obj, keys) {
  // 정규화된 키로 매칭
  const normalizedKeys = keys.map(k => normHeader(k));

  for (const objKey of Object.keys(obj || {})) {
    const normalizedObjKey = normHeader(objKey);
    const idx = normalizedKeys.indexOf(normalizedObjKey);
    if (idx >= 0) {
      const v = obj[objKey];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return "";
}
