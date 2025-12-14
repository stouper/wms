const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../db/wms.sqlite');
const db = new Database(dbPath);

// ========== 스키마 ==========
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse  TEXT,
  sku        TEXT NOT NULL UNIQUE,   -- Code
  maker_code TEXT,                   -- MakerCode
  name       TEXT NOT NULL,          -- CodeName
  location   TEXT,                   -- Location
  quantity   INTEGER DEFAULT 0,      -- Quantity
  price      INTEGER DEFAULT 0,      -- Msrp
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS upload_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT,
  processed INTEGER DEFAULT 0,  -- CSV에서 읽은 총 행 수
  changed INTEGER DEFAULT 0,    -- DB에 반영(삽입/업데이트)된 건수
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// ========== 유틸 ==========
function toNumber(val) {
  const s = String(val ?? '').replace(/[₩\s]/g, '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function splitCSVLine(line) {
  const out = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (ch === ',' && !q) {
      out.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

// ========== CSV 파서 ==========
function parseCSV(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  // 첫 줄 헤더 가정: Warehouse,Code,MakerCode,CodeName,Location,Quantity,Msrp
  const data = lines.slice(1);
  const rows = [];

  for (const line of data) {
    const cols = splitCSVLine(line);
    if (cols.length < 2) continue;

    if (cols.length < 7) continue;
    else if (cols.length > 7) {
      const fixed = cols.slice(0, 6);
      fixed.push(cols.slice(6).join(','));
      cols.splice(0, cols.length, ...fixed);
    }

    const [warehouse, code, makerCode, codeName, location, quantity, msrp] = cols;
    if (!code || !codeName) continue;

    rows.push({
      warehouse: (warehouse ?? '').trim() || null,
      sku: (code ?? '').trim(),
      maker_code: (makerCode ?? '').trim() || null,
      name: (codeName ?? '').trim(),
      location: (location ?? '').trim() || null,
      quantity: Math.max(0, Math.trunc(toNumber(quantity))),
      price: Math.max(0, Math.trunc(toNumber(msrp))),
    });
  }
  return rows;
}

// ========== 입고 CSV 업서트(수량 누적) + 로그 기록 ==========
function importCSV(text, filename = '') {
  const items = parseCSV(text);
  if (items.length === 0) {
    // 빈 파일도 로그 남길 수 있음(원하면 0건으로 기록)
    db.prepare(`INSERT INTO upload_logs (filename, processed, changed) VALUES (?, ?, ?)`)
      .run(filename, 0, 0);
    return { processed: 0, changed: 0 };
  }

  const stmt = db.prepare(`
    INSERT INTO products (warehouse, sku, maker_code, name, location, quantity, price)
    VALUES (@warehouse, @sku, @maker_code, @name, @location, @quantity, @price)
    ON CONFLICT(sku) DO UPDATE SET
      warehouse = excluded.warehouse,
      maker_code = excluded.maker_code,
      name = excluded.name,
      location = excluded.location,
      quantity = COALESCE(products.quantity, 0) + COALESCE(excluded.quantity, 0),
      price = excluded.price
  `);

  let changed = 0;
  const tx = db.transaction(arr => {
    for (const it of arr) {
      const info = stmt.run(it);
      changed += info.changes;
    }
  });
  tx(items);

  // 업로드 로그 기록
  db.prepare(`INSERT INTO upload_logs (filename, processed, changed) VALUES (?, ?, ?)`)
    .run(filename || null, items.length, changed);

  return { processed: items.length, changed };
}

// ========== 조회/삭제/로그 ==========
function getProducts() {
  return db.prepare(`
    SELECT id, warehouse, sku, maker_code, name, location, quantity, price, created_at
    FROM products
    ORDER BY id DESC
  `).all();
}

function deleteProduct(id) {
  return db.prepare('DELETE FROM products WHERE id=?').run(id).changes;
}

function getUploadLogs() {
  return db.prepare(`
    SELECT id, filename, processed, changed, created_at
    FROM upload_logs
    ORDER BY id DESC
    LIMIT 200
  `).all();
}

module.exports = { getProducts, importCSV, deleteProduct, getUploadLogs };
