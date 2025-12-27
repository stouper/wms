// apps/wms-desktop/renderer/src/lib/parseJobFile.js

/**
 * parseJobFileToRows(arrayBuffer, fileName)
 * - xlsx/xls/csv 지원
 * - 헤더 행 자동 탐지(상단 설명줄/빈줄 있어도 OK)
 * - 한글 헤더(거래처코드/단품코드/Maker코드/의뢰수량 등) 강하게 매핑
 * - ✅ D열(구분: 출고/반품) 파싱 + 혼합 여부 판단
 */

export function parseJobFileToRows(arrayBuffer, fileName = "") {
  const lower = String(fileName).toLowerCase();

  if (lower.endsWith(".csv")) {
    const text = new TextDecoder("utf-8").decode(new Uint8Array(arrayBuffer));
    const objs = parseCsvToObjects(text);
    const { rows, jobKind, mixedKinds } = normalizeRows(objs);
    return {
      fileType: "csv",
      jobKind,
      mixedKinds,
      rows,
      sample: rows.slice(0, 20),
    };
  }

  let XLSX;
  try {
    // eslint-disable-next-line no-undef
    XLSX = require("xlsx");
  } catch (e) {
    throw new Error("xlsx 패키지가 필요합니다. (npm i xlsx)");
  }

  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames?.[0];
  if (!sheetName) throw new Error("시트를 찾을 수 없습니다.");
  const ws = wb.Sheets[sheetName];

  // 1) 전체를 2D grid로 읽기
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

  // 2) 헤더 행 자동 탐지
  const { headerRowIndex, headerKeys } = detectHeaderRow(grid);

  // 3) 헤더 아래부터 객체화
  const dataRows = grid.slice(headerRowIndex + 1);
  const objs = dataRows
    .filter((r) => Array.isArray(r) && r.some((x) => String(x ?? "").trim() !== ""))
    .map((r) => {
      const o = {};
      for (let i = 0; i < headerKeys.length; i++) {
        o[headerKeys[i]] = r[i] ?? "";
      }
      return o;
    });

  const { rows, jobKind, mixedKinds } = normalizeRows(objs);

  return {
    fileType: "xlsx",
    jobKind,
    mixedKinds,
    rows,
    sample: rows.slice(0, 20),
  };
}

/** ---------------- header detect ---------------- */

function detectHeaderRow(grid) {
  const MAX = Math.min(grid.length, 60);

  const want = [
    "storecode",
    "store",
    "거래처",
    "거래처코드",
    "매장",
    "매장코드",
    "skucode",
    "sku",
    "단품",
    "단품코드",
    "품번",
    "makercode",
    "maker",
    "바코드",
    "barcode",
    "qty",
    "수량",
    "의뢰수량",
    "수량(의뢰)",
    "구분",
    "출고",
    "반품",
    "의뢰번호",

  ];

  let best = { score: -1, idx: 0, header: [] };

  for (let i = 0; i < MAX; i++) {
    const row = grid[i] || [];
    const norm = row.map((x) => String(x ?? "").trim().toLowerCase());

    const score = want.reduce((acc, w) => (norm.some((c) => c.includes(w)) ? acc + 1 : acc), 0);

    if (score >= 2 && norm.filter(Boolean).length >= 3) {
      if (score > best.score) {
        best = { score, idx: i, header: row.map((x) => String(x ?? "").trim()) };
      }
    }
  }

  if (best.score < 0) {
    let maxCols = 0;
    let idx = 0;
    for (let i = 0; i < Math.min(grid.length, 10); i++) {
      const cols = (grid[i] || []).filter((x) => String(x ?? "").trim() !== "").length;
      if (cols > maxCols) {
        maxCols = cols;
        idx = i;
      }
    }
    const header = (grid[idx] || []).map((x) => String(x ?? "").trim());
    return {
      headerRowIndex: idx,
      headerKeys: header.length ? header : ["storeCode", "skuCode", "makerCode", "qty", "구분"],
    };
  }

  const headerKeys = best.header.map((h, i) => (h ? h : `col${i + 1}`));
  return { headerRowIndex: best.idx, headerKeys };
}

/** ---------------- normalize rows + 구분 판별 ---------------- */

function normalizeRows(objs) {
  const out = [];
  const kindSet = new Set(); // 출고 / 반품

  for (const o of objs || []) {
    const storeCode = pick(o, ["storeCode", "STORECODE", "거래처코드", "매장코드", "매장"]);
    const storeName = pick(o, ["storeName", "STORENAME", "거래처"]);
    const skuCode = pick(o, ["skuCode", "SKU", "단품코드", "단품", "품번"]);
    const makerCode = pick(o, ["makerCode", "MAKER", "Maker코드", "메이커코드", "바코드", "barcode"]);
    const name = pick(o, ["name", "NAME", "코드명", "상품명", "품명"]); // ✅ 추가
    const qty = pick(o, ["qty", "Qty", "QTY", "수량", "의뢰수량", "수량(의뢰)"]);
    const kindRaw = pick(o, ["구분", "출고/반품", "작업구분", "TYPE", "type"]);
    const reqNo = pick(o, ["의뢰번호"]);

    const kind = normalizeKind(kindRaw);
    if (kind) kindSet.add(kind);

    const row = {
      storeCode: String(storeCode ?? "").trim(),
      storeName: String(storeName ?? "").trim(),
      skuCode: String(skuCode ?? "").trim(),
      makerCode: String(makerCode ?? "").trim(),
      name: String(name ?? "").trim(),
      reqNo: String(reqNo ?? "").trim(), // ✅ 추가
      qty: Math.abs(toInt(qty)),
      jobKind: kind || null,
    };

    if (!row.storeCode && !row.skuCode && !row.makerCode && !row.name && !row.reqNo && !row.qty) continue;
    out.push(row);
  }

  const kinds = Array.from(kindSet);
  return {
    rows: out,
    jobKind: kinds.length === 1 ? kinds[0] : null,
    mixedKinds: kinds.length > 1,
  };
}

function normalizeKind(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (s.includes("출고")) return "출고";
  if (s.includes("반품")) return "반품";
  return null;
}

function pick(obj, keys) {
  if (!obj) return undefined;

  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
  }

  const map = new Map();
  for (const kk of Object.keys(obj)) map.set(String(kk).trim().toLowerCase(), kk);

  for (const k of keys) {
    const found = map.get(String(k).trim().toLowerCase());
    if (found) return obj[found];
  }

  const lowerKeys = Array.from(map.keys());
  for (const k of keys) {
    const lk = String(k).trim().toLowerCase();
    const hit = lowerKeys.find((x) => x.includes(lk) || lk.includes(x));
    if (hit) return obj[map.get(hit)];
  }

  return undefined;
}

function toInt(v) {
  if (v == null) return 0;
  const s = String(v).trim();
  if (!s) return 0;
  const n = Number(s.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n);
}

/** ---------------- csv helpers ---------------- */

function parseCsvToObjects(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const header = splitCsvLine(lines[0]);
  const out = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = cols[c] ?? "";
    out.push(row);
  }
  return out;
}

function splitCsvLine(line) {
  const s = String(line || "");
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' && s[i + 1] === '"') {
      cur += '"';
      i++;
      continue;
    }
    if (ch === '"') {
      inQ = !inQ;
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => String(x).trim());
}
