// apps/wms-desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProducts: () => ipcRenderer.invoke('inventory:getProducts'),
});

contextBridge.exposeInMainWorld('wms', {
  inventory: {
    previewExcel: (fileBuffer, fileName, headerRow) =>
      ipcRenderer.invoke('inventory:previewExcel', { fileBuffer, fileName, headerRow }),
    overwriteExcel: (fileBuffer, fileName, headerRow) =>
      ipcRenderer.invoke('inventory:overwriteExcel', { fileBuffer, fileName, headerRow }),
    listUploads: () => ipcRenderer.invoke('inventory:listUploads'),
    getUpload: (uploadId) => ipcRenderer.invoke('inventory:getUpload', { uploadId }),
    restoreUpload: (uploadId) => ipcRenderer.invoke('inventory:restoreUpload', { uploadId }),
  },
});
