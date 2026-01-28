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
 * ✅ 라벨 프린터 RAW 출력 핸들러 (Windows API 방식)
 * renderer → window.wms.sendRaw({ printerName, raw })
 * main → tmp file 저장 → RawPrint.exe로 Windows API 호출
 */
ipcMain.handle("print:sendRaw", async (event, payload) => {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();

    try {
      // printerName: 프린터 이름 (예: "TOSHIBA")
      // target: 하위 호환용 (UNC 경로에서 프린터 이름 추출)
      let printerName = safeString(payload?.printerName).trim();
      if (!printerName && payload?.target) {
        // \\localhost\TOSHIBA → TOSHIBA 추출
        const target = safeString(payload.target);
        const match = target.match(/\\\\[^\\]+\\(.+)/);
        printerName = match ? match[1] : target;
      }
      // 앞에 붙은 \\ 제거 (\\TOSHIBA → TOSHIBA)
      printerName = printerName.replace(/^\\+/, "");

      const raw = safeString(payload?.raw);

      if (!printerName) {
        return reject(new Error("프린터 이름이 비어있습니다. 예: TOSHIBA"));
      }
      if (!raw) {
        return reject(new Error("프린터 raw 데이터가 비어있습니다."));
      }

      // ✅ 디버깅 로그
      const head = raw.slice(0, 200).replace(/\r/g, "\\r").replace(/\n/g, "\\n");
      console.log("[print:sendRaw] printerName =", printerName);
      console.log("[print:sendRaw] rawLen =", raw.length, "head =", head);

      // 임시 파일에 RAW 데이터 저장
      const tmpFile = path.join(os.tmpdir(), `label_${Date.now()}.raw`);
      fs.writeFileSync(tmpFile, Buffer.from(raw, "utf8"));

      // RawPrint.exe 경로 (개발/배포 환경 모두 지원)
      const devExePath = path.join(__dirname, "..", "tools", "RawPrint.exe");
      const prodExePath = path.join(process.resourcesPath || "", "tools", "RawPrint.exe");
      const exePath = fs.existsSync(prodExePath) ? prodExePath : devExePath;

      if (!fs.existsSync(exePath)) {
        fs.unlinkSync(tmpFile);
        return reject(new Error("RawPrint.exe를 찾을 수 없습니다: " + exePath));
      }

      // Windows API로 RAW 출력
      const cmd = `"${exePath}" "${printerName}" "${tmpFile}"`;
      console.log("[print:sendRaw] cmd =", cmd);

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
          return reject(new Error(`프린터 출력 실패(${elapsed}ms): ${stderr || err.message}`));
        }

        // RawPrint.exe 출력 확인 (OK:바이트수)
        const output = (stdout || "").trim();
        console.log("[print:sendRaw] output:", output);

        if (output.startsWith("OK:")) {
          const bytes = parseInt(output.split(":")[1], 10);
          console.log("[print:sendRaw] success:", printerName, `(${elapsed}ms, ${bytes} bytes)`);
          return resolve({ ok: true, elapsedMs: elapsed, bytes });
        } else {
          console.error("[print:sendRaw] unexpected output:", output);
          return reject(new Error(`프린터 출력 실패: ${output || stderr}`));
        }
      });
    } catch (e) {
      console.error("[print:sendRaw] exception:", e?.message || e);
      return reject(e);
    }
  });
});

/**
 * ✅ HTML 기반 Windows 드라이버 출력 (webContents.print 방식)
 * renderer → window.wms.printHtml({ printerName, html })
 * main → hidden BrowserWindow → webContents.print()
 */
ipcMain.handle("print:html", async (event, payload) => {
  return new Promise((resolve, reject) => {
    try {
      let printerName = safeString(payload?.printerName).trim();
      const html = safeString(payload?.html);

      if (!printerName) {
        return reject(new Error("프린터 이름이 비어있습니다."));
      }
      if (!html) {
        return reject(new Error("HTML 내용이 비어있습니다."));
      }

      console.log("[print:html] printerName =", printerName);
      console.log("[print:html] htmlLen =", html.length);

      // 숨김 창 생성
      const printWin = new BrowserWindow({
        show: false,
        width: 400,
        height: 600,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
        },
      });

      // HTML 로드 (data URL 방식)
      const dataUrl = "data:text/html;charset=utf-8," + encodeURIComponent(html);
      printWin.loadURL(dataUrl);

      printWin.webContents.on("did-finish-load", () => {
        console.log("[print:html] page loaded, printing...");

        // 라벨 용지: 102mm x 122mm (CJ대한통운 프리프린트 용지)
        const pageWidth = 102 * 1000;  // 102mm
        const pageHeight = 122 * 1000; // 122mm

        printWin.webContents.print(
          {
            silent: true,
            printBackground: true,
            deviceName: printerName,
            landscape: false,
            pageSize: {
              width: pageWidth,
              height: pageHeight,
            },
            margins: {
              marginType: "none",
            },
            scaleFactor: 100,
          },
          (success, failureReason) => {
            printWin.close();

            if (success) {
              console.log("[print:html] success");
              resolve({ ok: true });
            } else {
              console.error("[print:html] failed:", failureReason);
              reject(new Error(`프린트 실패: ${failureReason}`));
            }
          }
        );
      });

      printWin.webContents.on("did-fail-load", (event, errorCode, errorDescription) => {
        console.error("[print:html] load failed:", errorCode, errorDescription);
        printWin.close();
        reject(new Error(`HTML 로드 실패: ${errorDescription}`));
      });
    } catch (e) {
      console.error("[print:html] exception:", e?.message || e);
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
