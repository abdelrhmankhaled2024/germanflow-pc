const { contextBridge, ipcRenderer } = require('electron');

// The only native surface the page gets; read by client/src/native.ts in the GermanFlow web project.
contextBridge.exposeInMainWorld('germanflowDesktop', {
  getToken: () => ipcRenderer.invoke('token:get'),
  setToken: (token) => ipcRenderer.invoke('token:set', token),
  saveFile: (filename, content) => ipcRenderer.invoke('file:save', filename, content),
});
