﻿// apps/wms-desktop/electron/main.cjs
const path = require("path");
const fs = require("fs");
const { app, BrowserWindow } = require("electron");

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
  const configPath = path.join(__dirname, "..", "config.json");
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

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
