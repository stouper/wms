const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getProducts: () => ipcRenderer.invoke('get-products'),
  deleteProduct: (id) => ipcRenderer.invoke('delete-product', id),
  importCSV: (text, filename) => ipcRenderer.invoke('import-csv', { text, filename }),
  getUploadLogs: () => ipcRenderer.invoke('get-upload-logs'),
});
