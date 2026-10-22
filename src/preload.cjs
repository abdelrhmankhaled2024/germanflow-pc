const { contextBridge, ipcRenderer } = require('electron');

// The only native surface the page gets; read by client/src/native.ts and client/src/updates.ts in the GermanFlow web project.
contextBridge.exposeInMainWorld('germanflowDesktop', {
  getToken: () => ipcRenderer.invoke('token:get'),
  setToken: (token) => ipcRenderer.invoke('token:set', token),
  saveFile: (filename, content) => ipcRenderer.invoke('file:save', filename, content),
  updates: {
    status: () => ipcRenderer.invoke('update:status'),
    check: () => ipcRenderer.invoke('update:check'),
    apply: () => ipcRenderer.invoke('update:apply'),
    onStatus: (callback) => void ipcRenderer.on('update:status', (_event, status) => callback(status)),
  },
});
