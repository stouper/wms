// apps/wms-desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require("electron");

// 프린터 RAW 출력만 최소로 노출
contextBridge.exposeInMainWorld("wms", {
  sendRaw: (payload) => ipcRenderer.invoke("print:sendRaw", payload),
});
