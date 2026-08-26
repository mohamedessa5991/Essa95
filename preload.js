const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('electronInfo', { isElectron: true });
