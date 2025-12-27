// apps/wms-desktop/electron/main.cjs
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");
const { app, BrowserWindow, ipcMain } = require("electron");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ✅ 최소 안전 로딩: renderer/index.html
  win.loadFile(path.join(__dirname, "../renderer/index.html"));
}

  ipcMain.handle("print:sendRaw", async (_e, { target, raw }) => {
  if (!target) throw new Error("print:sendRaw target is required");
  if (typeof raw !== "string" || raw.length <= 0) throw new Error("print:sendRaw raw is required");

  return await new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `raw_${Date.now()}.txt`);

    try {
      // ✅ TSPL/ZPL은 보통 ASCII 계열이 더 안전 (UTF-8 BOM/멀티바이트 피하기)
      fs.writeFileSync(tmp, raw, "ascii");
    } catch (e) {
      return reject(e);
    }

    // ✅ copy /b 대신 print /D 사용 (스풀러 경유)
    // 예: print /D:\\localhost\XPDT108B C:\temp\raw.txt
    execFile(
      "cmd.exe",
      ["/c", "print", `/D:${target}`, tmp],
      { windowsHide: true },
      (err, stdout, stderr) => {
        try { fs.unlinkSync(tmp); } catch {}
        if (err) return reject(new Error((stderr || stdout || err.message || "print failed").toString()));
        resolve({ ok: true });
      }
    );
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
