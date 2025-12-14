// electron/db.js
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../db/wms.sqlite');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

// ── 스키마 ─────────────────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  warehouse  TEXT,
  sku        TEXT UNIQUE,
  barcode    TEXT,
  maker_code TEXT,
  name       TEXT,
  location   TEXT,
  quantity   INTEGER DEFAULT 0,
  price      INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_maker   ON products(maker_code);

CREATE TABLE IF NOT EXISTS upload_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT,
  processed  INTEGER DEFAULT 0,
  changed    INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no    TEXT,
  status      TEXT DEFAULT 'OPEN',   -- OPEN, DONE
  key_field   TEXT DEFAULT 'ANY',    -- 'H' | 'I' | 'K' | 'ANY' (스캔 매칭 기준)
  start_row   INTEGER DEFAULT 4,     -- 데이터 시작 행(1-index, 엑셀 기준)
  src_path    TEXT,                  -- 원본 엑셀 파일 경로(사본)
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS job_items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id       INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  row_number   INTEGER,      -- 엑셀 행번호(1-index)
  col_h        TEXT,         -- H열 값
  col_i        TEXT,         -- I열 값
  col_k        TEXT,         -- K열 값(보여주기용)
  required_qty INTEGER NOT NULL,
  picked_qty   INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_job_items_job ON job_items(job_id);
`);

// ── 업로드/입고 기존 유틸(간략) ────────────────────────────────────
function getUploadLogs() {
  return db.prepare(`SELECT * FROM upload_logs ORDER BY id DESC LIMIT 200`).all();
}
function getProducts() {
  return db.prepare(`SELECT * FROM products ORDER BY id DESC`).all();
}
function deleteProduct(id) {
  return db.prepare(`DELETE FROM products WHERE id=?`).run(id).changes;
}

// ── 작지 생성: 엑셀에서 읽은 행들 기반 ────────────────────────────
// rows = [{ row, H, I, K, qty }]
function importJobRows({ orderNo, startRow=4, keyField='ANY', rows, savePath }) {
  let jobId = null;
  const tx = db.transaction(() => {
    const r = db.prepare(`
      INSERT INTO jobs (order_no, key_field, start_row, src_path)
      VALUES (?, ?, ?, ?)
    `).run(orderNo, keyField, startRow, savePath || null);
    jobId = r.lastInsertRowid;

    const ins = db.prepare(`
      INSERT INTO job_items (job_id, row_number, col_h, col_i, col_k, required_qty)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const it of rows) {
      const qty = Number(it.qty || it.Qty || it.K || 0) || 0;
      if (!qty) continue;
      ins.run(jobId, it.row, it.H ?? null, it.I ?? null, it.K ?? null, qty);
    }
  });
  tx();
  return jobId;
}

// ── 조회 ──────────────────────────────────────────────────────────
function listJobs() {
  return db.prepare(`SELECT * FROM jobs ORDER BY id DESC`).all();
}
function getJob(jobId) {
  const job = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(jobId);
  const items = db.prepare(`
    SELECT * FROM job_items WHERE job_id=? ORDER BY row_number
  `).all(jobId);
  return { job, items };
}

// ── 스캔 매칭 & 반영 ────────────────────────────────────────────────
function matchesByKeyField(item, code, keyField) {
  if (keyField === 'H') return String(item.col_h || '') === String(code);
  if (keyField === 'I') return String(item.col_i || '') === String(code);
  if (keyField === 'K') return String(item.col_k || '') === String(code);
  // ANY: H/I/K 어느 하나라도 같으면
  return [item.col_h, item.col_i, item.col_k].some(v => String(v || '') === String(code));
}

function scanCode(jobId, code) {
  const job = db.prepare(`SELECT * FROM jobs WHERE id=?`).get(jobId);
  if (!job) return { ok:false, reason:'NO_JOB' };
  const keyField = job.key_field || 'ANY';

  const items = db.prepare(`
    SELECT id, required_qty, picked_qty, col_h, col_i, col_k
    FROM job_items WHERE job_id=? ORDER BY row_number
  `).all(jobId);

  const idx = items.findIndex(it => matchesByKeyField(it, code, keyField) && it.picked_qty < it.required_qty);
  if (idx < 0) {
    // 이미 다 채웠거나 아예 없음
    const filled = items.find(it => matchesByKeyField(it, code, keyField));
    return { ok:false, reason: filled ? 'ENOUGH' : 'NO_MATCH' };
  }

  const target = items[idx];
  db.prepare(`UPDATE job_items SET picked_qty = picked_qty + 1 WHERE id=?`).run(target.id);

  const left = db.prepare(`
    SELECT COUNT(*) AS cnt FROM job_items
    WHERE job_id=? AND picked_qty < required_qty
  `).get(jobId).cnt;

  if (left === 0) {
    db.prepare(`UPDATE jobs SET status='DONE' WHERE id=?`).run(jobId);
  }
  return { ok:true, done: left===0 };
}

module.exports = {
  // 조회/로그
  getUploadLogs, getProducts, deleteProduct,
  // 작지
  importJobRows, listJobs, getJob, scanCode,
};
