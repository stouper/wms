const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const db = require('./db');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: { preload: path.join(__dirname, 'preload.js') }
  });
  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.webContents.openDevTools();
}

ipcMain.handle('get-products', async () => {
  try { return { ok: true, rows: db.getProducts() }; }
  catch (e) { console.error('[get-products]', e); return { ok: false, error: String(e) }; }
});

ipcMain.handle('delete-product', async (_evt, id) => {
  try { return { ok: true, changes: db.deleteProduct(id), rows: db.getProducts() }; }
  catch (e) { console.error('[delete-product]', e); return { ok: false, error: String(e) }; }
});

ipcMain.handle('import-csv', async (_evt, payload) => {
  try {
    const { text, filename } = payload || {};
    const { processed, changed } = db.importCSV(String(text || ''), String(filename || ''));
    return { ok: true, processed, changed, rows: db.getProducts() };
  } catch (e) {
    console.error('[import-csv]', e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('get-upload-logs', async () => {
  try { return { ok: true, rows: db.getUploadLogs() }; }
  catch (e) { console.error('[get-upload-logs]', e); return { ok: false, error: String(e) }; }
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
