// apps/wms-desktop/electron/main.cjs
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* ------------------------------
   저장 경로 (유저 데이터 폴더)
------------------------------ */
const storePath = path.join(app.getPath('userData'), 'warehouse-inventory.json');

/* ------------------------------
   유틸
------------------------------ */
function toBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(new Uint8Array(input));
  if (input instanceof Uint8Array) return Buffer.from(input);
  if (input && input.data instanceof ArrayBuffer) return Buffer.from(new Uint8Array(input.data));
  if (input && input.data instanceof Uint8Array) return Buffer.from(input.data);
  return null;
}
const num = (v) => {
  if (v === null || v === undefined) return 0;
  const s = String(v).replace(/[^\d.-]/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------
   본사 창고 재고 엑셀 파서
------------------------------ */
function parseWarehouseInventoryExcel(buf) {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  if (!ws) throw new Error('시트를 찾을 수 없습니다.');

  const rows2d = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

  // 헤더 줄 찾기: “코드” + “코드명”이 있는 줄
  let headerRowIdx = -1;
  for (let i = 0; i < rows2d.length; i++) {
    const row = rows2d[i].map(String);
    const hasCode = row.some((c) => c.trim() === '코드');
    const hasName = row.some((c) => c.replace(/\s+/g, '') === '코드명');
    if (hasCode && hasName) { headerRowIdx = i; break; }
  }
  if (headerRowIdx < 0) throw new Error('헤더(코드/코드명)를 찾지 못했습니다.');

  const header = rows2d[headerRowIdx].map((h) => String(h).replace(/\s+/g, '').replace(/\n/g, ''));
  const dataRows = rows2d.slice(headerRowIdx + 1);

  const idx = (label) => header.findIndex((h) => h === label);
  const idxCode      = idx('코드');
  const idxMakerCode = idx('Maker코드');
  const idxName      = idx('코드명');
  const idxQty       = header.findIndex((h) => h.startsWith('수량') || h.includes('전산'));
  const idxPrice     = idx('현재가');
  const idxAmount    = header.findIndex((h) => h.includes('현재가금액') || h.includes('금액'));
  const idxLocation  = idx('위치');

  const rows = [];
  for (const r of dataRows) {
    if (!r || r.length === 0) continue;
    const code = (r[idxCode] || '').trim();
    const name = (r[idxName] || '').trim();
    if (!code && !name) continue;

    rows.push({
      code,
      makerCode: (r[idxMakerCode] || '').trim(),
      name,
      qty: num(r[idxQty]),
      price: num(r[idxPrice]),
      amount: num(r[idxAmount]),
      location: (r[idxLocation] || '').trim(),
    });
  }

  const summary = {
    rows: rows.length,
    totalQty: rows.reduce((s, x) => s + (x.qty || 0), 0),
    totalAmount: rows.reduce((s, x) => s + (x.amount || (x.qty * x.price) || 0), 0),
    sheetName,
    headerRow: headerRowIdx + 1,
    savedAt: new Date().toISOString(),
  };

  return { summary, rows, columns: ['code','makerCode','name','qty','price','amount','location'] };
}

/* ------------------------------
   IPC
------------------------------ */
ipcMain.handle('wms:pickExcel', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '본사 창고 재고 엑셀 선택',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
  });
  if (canceled || !filePaths?.[0]) return null;
  return filePaths[0];
});

ipcMain.handle('wms:importInventoryExcel', async (_event, payload) => {
  let buf;
  if (typeof payload === 'string') buf = fs.readFileSync(payload);
  else buf = toBuffer(payload);
  if (!buf) throw new Error('파일을 읽을 수 없습니다.');

  const parsed = parseWarehouseInventoryExcel(buf);
  return { ok: true, via: (typeof payload === 'string' ? 'path' : 'buffer'), ...parsed };
});

// 저장
ipcMain.handle('wms:saveWarehouseInventory', async (_event, data) => {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf-8');
  return { ok: true, path: storePath, rows: data?.rows?.length || 0 };
});

// 로드
ipcMain.handle('wms:loadWarehouseInventory', async () => {
  if (!fs.existsSync(storePath)) return { ok: true, exists: false, data: null };
  const text = fs.readFileSync(storePath, 'utf-8');
  const data = JSON.parse(text);
  return { ok: true, exists: true, data, path: storePath };
});

// 비우기(초기화)
ipcMain.handle('wms:clearWarehouseInventory', async () => {
  fs.writeFileSync(storePath, JSON.stringify({ summary: null, rows: [], columns: [] }, null, 2), 'utf-8');
  return { ok: true };
});
