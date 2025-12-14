// apps/wms-desktop/electron/services/inventory.cjs
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const XLSX = require('xlsx');

const dataDir = path.join(app.getPath('userData'), 'wms-inventory');
const uploadsDir = path.join(dataDir, 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const INVENTORY_JSON = path.join(dataDir, 'inventory.json');
const UPLOADS_INDEX = path.join(uploadsDir, 'index.json');

/* ------------ 저장/읽기 ------------ */
function readInventory() {
  if (!fs.existsSync(INVENTORY_JSON)) return [];
  try { const j = JSON.parse(fs.readFileSync(INVENTORY_JSON, 'utf-8')); return Array.isArray(j)? j : (j?.rows||[]); }
  catch { return []; }
}
function writeInventory(rows) {
  fs.writeFileSync(INVENTORY_JSON, JSON.stringify({ rows }, null, 2), 'utf-8');
}
function readUploadsIndex() {
  if (!fs.existsSync(UPLOADS_INDEX)) return { uploads: [] };
  try { return JSON.parse(fs.readFileSync(UPLOADS_INDEX, 'utf-8')) || { uploads: [] }; }
  catch { return { uploads: [] }; }
}
function writeUploadsIndex(idx) {
  fs.writeFileSync(UPLOADS_INDEX, JSON.stringify(idx, null, 2), 'utf-8');
}

/* ------------ 유틸 ------------ */
const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};
const normalize = (s) =>
  String(s || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\(\)\[\]{}.,/\\\-_|:;'"`~!@#$%^&*+=<>?]/g, '');

/* ------------ 파서 ------------ */
function parseExcelBuffer(buf, headerRow) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) throw new Error('시트를 찾을 수 없습니다.');

  const headerIdx0 = Math.max(0, Number(headerRow || 3) - 1);
  const AOA = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const header = AOA[headerIdx0] || [];
  const dataRows = AOA.slice(headerIdx0 + 1);

  const H = header.map(normalize);
  const pick = (...cands) => {
    const want = cands.map(normalize);
    return H.findIndex((h) => want.includes(h));
  };

  const idxWarehouse = pick('창고', 'warehouse'); // optional
  const idxSku       = pick('sku', '코드', '상품코드', 'code');
  const idxMaker     = pick('maker코드', '메이커코드', 'makercode', 'maker', 'maker_code');
  const idxName      = pick('상품명', '코드명', 'name', 'product', 'item');
  const idxLoc       = pick('로케이션', '위치', 'location', 'loc');
  const idxQty       = pick('수량', '수량전산', '수량(전산)', '재고', 'qty', 'quantity', '현재고', '재고수량', '총수량');
  const idxPrice     = pick('현재가금액', '현재가', 'msrp', '가격', 'price');

  const rows = [];
  for (const r of dataRows) {
    if (!r || r.length === 0) continue;
    const sku  = idxSku  >= 0 ? String(r[idxSku]  || '').trim() : '';
    const name = idxName >= 0 ? String(r[idxName] || '').trim() : '';
    const qty  = idxQty  >= 0 ? toNum(r[idxQty]) : 0;
    if (!sku && !name && qty === 0) continue;

    rows.push({
      warehouse: idxWarehouse >= 0 ? String(r[idxWarehouse] || '').trim() : '',
      sku,
      maker_code: idxMaker >= 0 ? String(r[idxMaker] || '').trim() : '',
      name,
      location: idxLoc >= 0 ? String(r[idxLoc] || '').trim() : '',
      quantity: qty,
      price: idxPrice >= 0 ? toNum(r[idxPrice]) : 0,
    });
  }

  // 검증(경고 카운트)
  let negatives = 0, zeros = 0, blankSku = 0, dupSku = 0;
  const set = new Set();
  for (const r of rows) {
    if (!r.sku) blankSku++;
    if (Number(r.quantity) < 0) negatives++;
    if (Number(r.quantity) === 0) zeros++;
    if (r.sku) {
      if (set.has(r.sku)) dupSku++;
      else set.add(r.sku);
    }
  }

  const qtySum = rows.reduce((a, x) => a + Number(x.quantity || 0), 0);
  return {
    headerRow,
    rows,
    qtySum,
    warnings: { negatives, zeros, blankSku, dupSku }
  };
}

/* ------------ 공개 API ------------ */
async function getInventoryRows() {
  return readInventory();
}

/** 업로드 미리보기(확정 전) — 경고 카운트 포함 */
async function previewFromExcelBuffer(buf, fileName = '', headerRow = 3) {
  const parsed = parseExcelBuffer(buf, headerRow);
  return {
    fileName,
    headerRow: parsed.headerRow,
    rowsCount: parsed.rows.length,
    qtySum: parsed.qtySum,
    warnings: parsed.warnings,
    sample: parsed.rows.slice(0, 10),
  };
}

/** 업로드 확정(전체 교체) + 업로드 이력 저장(최신이 0번 인덱스) */
async function overwriteFromExcelBuffer(buf, fileName = '', headerRow = 3) {
  const parsed = parseExcelBuffer(buf, headerRow);

  // 1) 인벤토리 전체 교체
  writeInventory(parsed.rows);

  // 2) 업로드 이력 저장(원본 스냅샷)
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const snapshotPath = path.join(uploadsDir, `${id}.json`);
  const meta = {
    id,
    at: new Date().toISOString(),
    fileName,
    headerRow: parsed.headerRow,
    rowsCount: parsed.rows.length,
    qtySum: parsed.qtySum,
    warnings: parsed.warnings,
    snapshot: path.basename(snapshotPath),
  };
  fs.writeFileSync(snapshotPath, JSON.stringify({ ...meta, rows: parsed.rows }, null, 2), 'utf-8');

  const idx = readUploadsIndex();
  idx.uploads.unshift(meta);        // 최신 업로드가 0번
  idx.uploads = idx.uploads.slice(0, 50);
  writeUploadsIndex(idx);

  return { id, processed: parsed.rows.length, changed: parsed.rows.length, qtySum: parsed.qtySum };
}

/** ✅ ‘이전(직전) 업로드’만 반환하도록 수정 */
async function listUploads() {
  const idx = readUploadsIndex();
  const arr = idx.uploads || [];
  // 직전 업로드 우선 표시: 있으면 [1], 없으면 [0]
  const target = arr[1] || arr[0];
  return target ? [target] : [];
}

async function getUpload(uploadId) {
  const file = path.join(uploadsDir, `${uploadId}.json`);
  if (!fs.existsSync(file)) throw new Error('업로드 스냅샷을 찾을 수 없습니다.');
  const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
  return {
    id: j.id,
    at: j.at,
    fileName: j.fileName,
    headerRow: j.headerRow,
    rowsCount: j.rowsCount,
    qtySum: j.qtySum,
    warnings: j.warnings || {},
    sample: j.rows.slice(0, 20),
  };
}

/** 복원: 스냅샷 rows로 현 재고 전체 교체 */
async function restoreFromUpload(uploadId) {
  const file = path.join(uploadsDir, `${uploadId}.json`);
  if (!fs.existsSync(file)) throw new Error('업로드 스냅샷을 찾을 수 없습니다.');
  const j = JSON.parse(fs.readFileSync(file, 'utf-8'));
  writeInventory(j.rows || []);
  return { restoredId: uploadId, rows: (j.rows || []).length };
}

module.exports = {
  getInventoryRows,
  previewFromExcelBuffer,
  overwriteFromExcelBuffer,
  listUploads,
  getUpload,
  restoreFromUpload,
};
