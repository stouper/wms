// apps/wms-desktop/electron/main.cjs
const path = require("path");
const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");
const { app, BrowserWindow, ipcMain } = require("electron");

/**
 * ✅ config.json (mode 스위치) 지원 + API 목적지 스위치(리라이트)
 *
 * apps/wms-desktop/config.json 예시:
 * {
 *   "mode": "dev",
 *   "api": {
 *     "dev": "http://localhost:3000",
 *     "prod": "https://api.dheska.com"
 *   }
 * }
 *
 * - 실행 명령은 동일 (npm run dev / npm run start)
 * - 전환은 config.json의 "mode"만 변경
 * - renderer 코드가 어디에 있든 상관없이
 *   "http://localhost:3000" 또는 "https://api.dheska.com" 으로 나가는 요청을
 *   config의 apiBase로 강제 치환(fetch/XHR 가로채기)
 */

function readJsonSafe(p) {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveConfig() {
  // 1) 실행 폴더 기준(개발: repo/apps/wms-desktop, 배포: exe가 있는 폴더)
  const cwdConfig = path.join(process.cwd(), "config.json");
  // 2) userData(PC별 설정 저장)
  const userDataConfig = path.join(app.getPath("userData"), "config.json");

  const a = readJsonSafe(cwdConfig);
  const b = readJsonSafe(userDataConfig);
  const cfg = b || a || {};

  const mode =
    String(cfg.mode || "dev").trim().toLowerCase() === "prod" ? "prod" : "dev";

  const apiDev = String(cfg?.api?.dev || "http://localhost:3000").trim();
  const apiProd = String(cfg?.api?.prod || "https://api.dheska.com").trim();

  const apiBase = (mode === "prod" ? apiProd : apiDev).replace(/\/+$/, "");

  return {
    mode,
    apiBase,
    loadedFrom: b ? userDataConfig : a ? cwdConfig : "(default)",
  };
}

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

  // ✅ config 주입 + API 목적지 스위치(리라이트)
  // - renderer 코드가 어디에 있든 상관없이
  //   (localhost/api.dheska.com) 요청을 config.json의 apiBase로 강제 치환
  const cfg = resolveConfig();
  console.log(
    "[wms-desktop] config:",
    cfg.loadedFrom,
    "mode=",
    cfg.mode,
    "apiBase=",
    cfg.apiBase
  );

  win.webContents.on("dom-ready", () => {
    const payload = JSON.stringify({ apiBase: cfg.apiBase, mode: cfg.mode });

    const inject = `
      (function () {
        // 1) config 주입
        window.__APP_CONFIG__ = ${payload};

        const API = (window.__APP_CONFIG__?.apiBase || "http://localhost:3000").replace(/\\/+$/, "");

        // 2) 기존 하드코딩 목적지들을 API로 강제 치환
        const TARGETS = [
          "http://localhost:3000",
          "https://api.dheska.com"
        ];

        function rewriteUrl(u) {
          try {
            const url = String(u || "");
            for (const t of TARGETS) {
              if (url.startsWith(t)) return API + url.slice(t.length);
            }
            return url;
          } catch {
            return u;
          }
        }

        // 3) fetch 가로채기
        if (window.fetch) {
          const _fetch = window.fetch.bind(window);
          window.fetch = function (input, init) {
            try {
              if (typeof input === "string") {
                return _fetch(rewriteUrl(input), init);
              }
              if (input && typeof input === "object" && input.url) {
                const newReq = new Request(rewriteUrl(input.url), input);
                return _fetch(newReq, init);
              }
            } catch (e) {}
            return _fetch(input, init);
          };
        }

        // 4) XHR 가로채기 (axios 등 대부분 여기 탑승)
        if (window.XMLHttpRequest && window.XMLHttpRequest.prototype) {
          const _open = window.XMLHttpRequest.prototype.open;
          window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            try {
              return _open.call(this, method, rewriteUrl(url), ...rest);
            } catch (e) {
              return _open.call(this, method, url, ...rest);
            }
          };
        }

        console.log("[wms-desktop] apiBase:", API, "mode:", window.__APP_CONFIG__?.mode);
      })();
    `;

    win.webContents.executeJavaScript(inject, true);
  });

  return win;
}

/**
 * ✅ RAW 프린트 (스풀러 경유)
 * target 예: \\localhost\XPDT108B
 * raw: ZPL/EPL 등 프린터로 보낼 원문
 */
ipcMain.handle("print:sendRaw", async (_e, { target, raw }) => {
  if (!target) throw new Error("print:sendRaw target is required");
  if (typeof raw !== "string" || raw.length <= 0)
    throw new Error("print:sendRaw raw is required");

  return await new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `raw_${Date.now()}.txt`);

    try {
      fs.writeFileSync(tmp, raw, "utf-8");
    } catch (e) {
      return reject(
        new Error(
          `failed to write temp file: ${
            e?.message ? String(e.message) : String(e)
          }`
        )
      );
    }

    // ✅ copy /b 대신 print /D 사용 (스풀러 경유)
    // 예: print /D:\\localhost\XPDT108B C:\temp\raw.txt
    execFile(
      "cmd.exe",
      ["/c", "print", `/D:${target}`, tmp],
      { windowsHide: true },
      (err, stdout, stderr) => {
        try {
          fs.unlinkSync(tmp);
        } catch {}

        if (err) {
          return reject(
            new Error(
              (stderr || stdout || err.message || "print failed").toString()
            )
          );
        }

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
