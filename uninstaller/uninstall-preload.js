const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('uninstallerAPI', {
  winMinimize: () => ipcRenderer.send('unins-minimize'),
  winClose: () => ipcRenderer.send('unins-close'),
  getInfo: () => ipcRenderer.invoke('unins-get-info'),
  run: (options) => ipcRenderer.invoke('unins-run', options),
  finish: () => ipcRenderer.send('unins-finish'),
  onProgress: (callback) => {
    ipcRenderer.on('unins-progress', (event, data) => callback(data));
  }
});
