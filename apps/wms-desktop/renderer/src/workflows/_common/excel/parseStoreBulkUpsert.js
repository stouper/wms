// apps/wms-desktop/renderer/src/workflows/_common/excel/parseStoreBulkUpsert.js

/**
 * 매장 일괄 등록용 엑셀 파서
 *
 * - 2행: 헤더
 * - 3행~: 데이터
 *
 * 필수 헤더:
 * - 매장코드 (code): 매장 코드
 *
 * 선택 헤더:
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

    const code = pick(obj, ["매장코드", "storeCode", "StoreCode", "code", "Code", "매장"]);
    const name = pick(obj, ["매장명", "storeName", "StoreName", "name", "Name", "이름"]);

    const rowNum = headerRowIndex + 2 + i; // 엑셀 행 번호 (1-based, 3행부터 시작)

    if (!code) {
      errors.push(`행 ${rowNum}: 매장코드가 없습니다.`);
      continue;
    }

    items.push({
      code: String(code).trim(),
      name: String(name ?? "").trim() || undefined,
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

function pick(obj, keys) {
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) {
      const v = obj[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
  }
  return "";
}
