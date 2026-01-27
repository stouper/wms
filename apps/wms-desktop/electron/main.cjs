﻿// apps/wms-desktop/electron/main.cjs
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const { app, BrowserWindow, ipcMain } = require("electron");

/**
 * ✅ config.json 기반 dev/prod API 스위치
 * - apps/wms-desktop/config.json
 * - renderer에 window.__APP_CONFIG__로 주입 (preload 없이도 주입 가능)
 *
 * ✅ 이 프로젝트는 renderer/dist가 아니라 renderer/index.html이 엔트리다.
 * 따라서 win.loadFile("../renderer/index.html") 이 정답.
 */

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    console.error("[config] failed to read:", p, e);
    return null;
  }
}

function getAppConfig() {
  // 개발 환경: __dirname/../config.json
  // 배포 환경: process.resourcesPath/config.json
  const devPath = path.join(__dirname, "..", "config.json");
  const prodPath = path.join(process.resourcesPath || "", "config.json");
  const configPath = fs.existsSync(prodPath) ? prodPath : devPath;

  console.log("[config] loading from:", configPath);
  const cfg = readJsonSafe(configPath);

  const fallback = {
    mode: "dev",
    api: {
      dev: "http://localhost:3000",
      prod: "https://backend.dheska.com",
    },
  };

  if (!cfg || typeof cfg !== "object") return fallback;

  const merged = {
    ...fallback,
    ...cfg,
    api: { ...fallback.api, ...(cfg.api || {}) },
  };
  merged.mode = merged.mode === "prod" ? "prod" : "dev";
  return merged;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // 기존 프로젝트 설정 유지 (preload 있으면 그대로)
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // ✅ 여기! renderer/index.html이 실제 엔트리
  const indexHtml = path.join(__dirname, "..", "renderer", "index.html");
  if (!fs.existsSync(indexHtml)) {
    console.error("[renderer] index.html not found:", indexHtml);
  }
  win.loadFile(indexHtml);

  // ✅ renderer에 config 주입
  const appConfig = getAppConfig();
  win.webContents.on("did-finish-load", async () => {
    try {
      const js = `window.__APP_CONFIG__ = ${JSON.stringify(appConfig)};`;
      await win.webContents.executeJavaScript(js, true);
      console.log("[config] injected:", appConfig);
    } catch (e) {
      console.error("[config] inject failed:", e);
    }
  });

  // win.webContents.openDevTools({ mode: "detach" });
}

// ✅ 라벨 프린터 RAW 출력 핸들러
ipcMain.handle("print:sendRaw", async (event, { target, raw }) => {
  return new Promise((resolve, reject) => {
    try {
      // 임시 파일에 RAW 데이터 저장
      const tmpFile = path.join(os.tmpdir(), `label_${Date.now()}.raw`);
      fs.writeFileSync(tmpFile, raw, "utf-8");

      // Windows 공유 프린터로 RAW 전송
      exec(`copy /b "${tmpFile}" "${target}"`, { shell: "cmd.exe" }, (err, stdout, stderr) => {
        // 임시 파일 삭제
        try { fs.unlinkSync(tmpFile); } catch (e) {}

        if (err) {
          console.error("[print:sendRaw] error:", err.message);
          reject(new Error(`프린터 출력 실패: ${err.message}`));
        } else {
          console.log("[print:sendRaw] success:", target);
          resolve({ ok: true });
        }
      });
    } catch (e) {
      console.error("[print:sendRaw] exception:", e.message);
      reject(e);
    }
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
