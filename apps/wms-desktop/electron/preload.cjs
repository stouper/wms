// apps/wms-desktop/electron/preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wms', {
  pickExcel:            ()          => ipcRenderer.invoke('wms:pickExcel'),
  importInventoryExcel: (payload)   => ipcRenderer.invoke('wms:importInventoryExcel', payload),

  saveWarehouseInventory: (data)    => ipcRenderer.invoke('wms:saveWarehouseInventory', data),
  loadWarehouseInventory: ()        => ipcRenderer.invoke('wms:loadWarehouseInventory'),
  clearWarehouseInventory: ()       => ipcRenderer.invoke('wms:clearWarehouseInventory'),
});
