// apps/wms-desktop/electron/main.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const inv = require('./services/inventory.cjs');

let win;

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // ✅ Alt+Tab/백그라운드 시 타이머/포커스 끊김 방지
    },
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  // win.webContents.openDevTools({ mode: 'detach' });

  // 창 포커스 복귀 시 렌더러에 신호 → 검색창 강제 포커스
  win.on('focus', () => {
    try { win.webContents.send('wms:focus-restore'); } catch {}
  });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

/* ========= 창고 재고 IPC ========= */
ipcMain.handle('inventory:getProducts', async () => {
  try { return { ok: true, rows: await inv.getInventoryRows() }; }
  catch (e) { console.error(e); return { ok:false, error:e?.message||String(e) }; }
});

ipcMain.handle('inventory:previewExcel', async (_e, p) => {
  try {
    const buf = Buffer.from(new Uint8Array(p.fileBuffer));
    return { ok: true, ...(await inv.previewFromExcelBuffer(buf, p.fileName||'', Number(p.headerRow)||3)) };
  } catch (e) { console.error('previewExcel', e); return { ok:false, error:e?.message||String(e) }; }
});

ipcMain.handle('inventory:overwriteExcel', async (_e, p) => {
  try {
    const buf = Buffer.from(new Uint8Array(p.fileBuffer));
    return { ok: true, ...(await inv.overwriteFromExcelBuffer(buf, p.fileName||'', Number(p.headerRow)||3)) };
  } catch (e) { console.error('overwriteExcel', e); return { ok:false, error:e?.message||String(e) }; }
});

ipcMain.handle('inventory:listUploads', async () => {
  try { return { ok:true, uploads: await inv.listUploads() }; }
  catch (e) { console.error(e); return { ok:false, error:e?.message||String(e) }; }
});

ipcMain.handle('inventory:getUpload', async (_e, { uploadId }) => {
  try { return { ok:true, upload: await inv.getUpload(uploadId) }; }
  catch (e) { console.error(e); return { ok:false, error:e?.message||String(e) }; }
});

ipcMain.handle('inventory:restoreUpload', async (_e, { uploadId }) => {
  try { return { ok:true, ...(await inv.restoreFromUpload(uploadId)) }; }
  catch (e) { console.error(e); return { ok:false, error:e?.message||String(e) }; }
});
