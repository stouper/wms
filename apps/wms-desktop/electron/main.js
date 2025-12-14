// electron/main.js  (ESM)
import { app, BrowserWindow } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      // 필요하면 프리로드에서 window.api 같은 브릿지 노출
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // HTML 후보 경로 (빌드/구조에 따라 둘 중 하나 존재)
  const candidates = [
    path.join(__dirname, "../renderer/index.html"),
    path.join(__dirname, "../renderer/dist/index.html"),
  ];
  const existing = candidates.find((p) => fs.existsSync(p));

  if (existing) {
    win.loadFile(existing);
  } else {
    // HTML이 없다면, 개발 서버(있다면)로 연결하거나 에러 안내
    win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(`
      <h1>ESKA WMS Desktop</h1>
      <p>index.html을 찾을 수 없습니다.<br>
      renderer/index.html 또는 renderer/dist/index.html 중 하나를 만들어 주세요.</p>
    `));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
