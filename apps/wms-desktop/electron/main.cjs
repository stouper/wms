﻿// apps/wms-desktop/electron/main.cjs
const path = require("path");
const fs = require("fs");
const os = require("os");
const { exec } = require("child_process");
const { app, BrowserWindow, ipcMain } = require("electron");

/**
 * ✅ config.json 기반 dev/prod API 스위치
 * - apps/wms-desktop/config.json
 * - renderer에 window.__APP_CONFIG__로 주입
 *
 * ✅ 이 프로젝트는 renderer/dist가 아니라 renderer/index.html이 엔트리다.
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
    // (참고) 필요하면 여기에 printer 기본값도 둘 수 있음
    // printer: { label: "\\\\localhost\\Toshiba" },
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
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const indexHtml = path.join(__dirname, "..", "renderer", "index.html");
  if (!fs.existsSync(indexHtml)) {
    console.error("[renderer] index.html not found:", indexHtml);
  }
  win.loadFile(indexHtml);

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

function safeString(v) {
  if (v === null || v === undefined) return "";
  return typeof v === "string" ? v : String(v);
}

function normalizeTarget(t) {
  // target은 보통 \\localhost\Toshiba 같은 UNC 경로가 와야 함
  let s = safeString(t).trim();
  // 사용자가 "localhost\Toshiba" 같이 줬을 때 보정
  if (s && !s.startsWith("\\\\")) {
    s = "\\\\" + s.replace(/^\\+/, "");
  }
  return s;
}

/**
 * ✅ 라벨 프린터 RAW(ZPL) 출력 핸들러
 * renderer → window.wms.sendRaw({ target, raw })
 * main → tmp file 저장 → copy /b tmp target
 */
ipcMain.handle("print:sendRaw", async (event, payload) => {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    try {
      const target = normalizeTarget(payload?.target);
      const raw = safeString(payload?.raw);

      if (!target) {
        return reject(new Error("프린터 target(UNC 경로)이 비어있습니다. 예: \\\\localhost\\Toshiba"));
      }
      if (!raw) {
        return reject(new Error("프린터 raw 데이터가 비어있습니다. (ZPL 문자열이 필요)"));
      }

      // ✅ 디버깅 로그(앞부분만)
      const head = raw.slice(0, 200).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
      console.log("[print:sendRaw] target =", target);
      console.log("[print:sendRaw] rawLen =", raw.length, "head =", head);

      // 임시 파일에 RAW(ZPL) 저장
      const tmpFile = path.join(os.tmpdir(), `label_${Date.now()}.zpl`);

      // ✅ Buffer로 저장 (윈도우/한글/특수문자 포함 시에도 바이트 안정)
      fs.writeFileSync(tmpFile, Buffer.from(raw, "utf8"));

      // Windows 공유 프린터로 RAW 전송
      const cmd = `copy /b "${tmpFile}" "${target}"`;
      exec(cmd, { shell: "cmd.exe" }, (err, stdout, stderr) => {
        // 임시 파일 삭제
        try {
          fs.unlinkSync(tmpFile);
        } catch (e) {}

        const elapsed = Date.now() - startedAt;

        if (err) {
          console.error("[print:sendRaw] error:", err.message);
          if (stdout) console.error("[print:sendRaw] stdout:", stdout);
          if (stderr) console.error("[print:sendRaw] stderr:", stderr);
          return reject(new Error(`프린터 출력 실패(${elapsed}ms): ${err.message}`));
        }

        // copy 명령은 성공해도 stdout이 비어있을 수 있음
        console.log("[print:sendRaw] success:", target, `(${elapsed}ms)`);
        return resolve({ ok: true, elapsedMs: elapsed });
      });
    } catch (e) {
      console.error("[print:sendRaw] exception:", e?.message || e);
      return reject(e);
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
