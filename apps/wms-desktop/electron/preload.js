// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wms', {
  importJobExcel: (arrayBuffer, fileName, startRow=4, keyField='ANY') =>
    ipcRenderer.invoke('wms:importJobExcel', { arrayBuffer, fileName, startRow, keyField }),

  listJobs:     ()            => ipcRenderer.invoke('wms:listJobs'),
  getJob:       (id)          => ipcRenderer.invoke('wms:getJob', id),
  scanCode:     ({jobId,code})=> ipcRenderer.invoke('wms:scanCode', { jobId, code }),
  exportJobExcel:(jobId)      => ipcRenderer.invoke('wms:exportJobExcel', { jobId }),
});
