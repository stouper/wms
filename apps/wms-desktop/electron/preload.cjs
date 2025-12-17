// apps/wms-desktop/electron/preload.cjs
const { contextBridge } = require("electron");

// 로컬 inventory / uploads IPC 노출 전부 제거
// 필요하면 나중에 프린터/파일 저장 같은 것만 여기에 다시 노출하면 됨.
contextBridge.exposeInMainWorld("wms", {});
