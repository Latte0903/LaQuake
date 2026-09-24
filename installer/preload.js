const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('installerAPI', {
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winClose: () => ipcRenderer.send('win-close'),
  pickDir: (currentPath) => ipcRenderer.invoke('pick-dir', currentPath),
  resolveInstallDir: (chosenPath) => ipcRenderer.invoke('resolve-install-dir', chosenPath),
  loadTranslations: (lang) => ipcRenderer.invoke('load-translations', lang),
  autoLocate: () => ipcRenderer.invoke('auto-locate'),
  getContext: () => ipcRenderer.invoke('get-context'),
  startInstall: (config) => ipcRenderer.invoke('start-install', config),
  cancelInstall: () => ipcRenderer.send('cancel-install'),
  onInstallProgress: (callback) => {
    ipcRenderer.on('install-progress', (event, data) => callback(data));
  }
});
