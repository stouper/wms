// apps/wms-desktop/renderer/src/workflows/_common/excel/parseInventoryBulkSet.js

/**
 * 재고 조정용 엑셀 파서
 *
 * 필수 헤더:
 * - 단품코드 (skuCode): SKU 코드
 * - Location (locationCode): 창고 위치 코드
 * - 수량 (qty): 설정할 재고 수량
 *
 * 선택 헤더:
 * - 메모 (memo): 조정 사유
 *
 * 주의: storeCode는 엑셀에 포함하지 않음 (UI에서 별도 선택)
 */

export async function parseInventoryBulkSetFile(arrayBuffer, fileName = "") {
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

  console.log("🔍 재고 엑셀 파싱 시작");
  console.log("📄 시트명:", sheetName);
  console.log("📄 전체 행 개수:", grid.length);

  const { headerRowIndex, headerKeys } = detectHeaderRow(grid);
  console.log("📄 헤더 행 인덱스:", headerRowIndex);
  console.log("📄 헤더 키:", headerKeys);

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

    const skuCode = pick(obj, ["단품코드", "SKU", "skuCode", "sku", "SKU코드", "품번", "코드"]);
    const locationCode = pick(obj, ["Location", "location", "locationCode", "로케이션", "창고", "위치"]);
    const qtyRaw = pick(obj, ["수량", "qty", "Qty", "QTY", "재고", "재고수량"]);
    const memo = pick(obj, ["메모", "memo", "Memo", "비고", "사유"]);

    const rowNum = headerRowIndex + 2 + i; // 엑셀 행 번호 (1-based)

    if (!skuCode) {
      errors.push(`행 ${rowNum}: 단품코드가 없습니다.`);
      continue;
    }

    if (!locationCode) {
      errors.push(`행 ${rowNum}: Location이 없습니다.`);
      continue;
    }

    const qty = toInt(qtyRaw);
    if (qty < 0) {
      errors.push(`행 ${rowNum}: 수량은 0 이상이어야 합니다. (입력값: ${qtyRaw})`);
      continue;
    }

    items.push({
      skuCode: String(skuCode).trim().toUpperCase(),
      locationCode: String(locationCode).trim(),
      qty,
      memo: String(memo ?? "").trim() || undefined,
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

/** 헤더 행 탐지 */
function detectHeaderRow(grid) {
  // 헤더 후보: '단품코드', 'Location', '수량' 중 2개 이상 포함된 행
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const r = grid[i];
    if (!Array.isArray(r)) continue;
    const joined = r.map((x) => String(x ?? "").trim().toLowerCase()).join(" | ");
    const hit =
      (joined.includes("단품코드") || joined.includes("sku") || joined.includes("품번") || joined.includes("코드") ? 1 : 0) +
      (joined.includes("location") || joined.includes("로케이션") || joined.includes("창고") || joined.includes("위치") ? 1 : 0) +
      (joined.includes("수량") || joined.includes("qty") || joined.includes("재고") ? 1 : 0);
    if (hit >= 2) {
      const headerKeys = r.map((x) => String(x ?? "").trim());
      return { headerRowIndex: i, headerKeys };
    }
  }

  // fallback: 0행을 헤더로 간주
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
