// apps/wms-desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");
const fs = require("fs");
const path = require("path");

function readConfig() {
  try {
    const configPath = path.resolve(__dirname, "../config.json");
    const raw = fs.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    // ✅ config가 없거나 깨졌을 때도 앱이 죽지 않게
    return {
      mode: "dev",
      api: {
        dev: "http://localhost:3000",
        prod: "https://backend.dheska.com",
      },
    };
  }
}

function getApiBaseFromConfig(cfg) {
  const mode = String(cfg?.mode || "").trim(); // "dev" | "prod"
  const api = cfg?.api || {};
  // ✅ mode 값이 이상해도 fallback 되게
  const base = api?.[mode] || api?.prod || api?.dev || "";
  return String(base).trim();
}


contextBridge.exposeInMainWorld("wms", {
  // ✅ 기존 그대로
  sendRaw: (args) => ipcRenderer.invoke("print:sendRaw", args),

  // ✅ 추가
  getConfig: () => readConfig(),
  getApiBase: () => getApiBaseFromConfig(readConfig()),
});
