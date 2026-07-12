const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getSettings: () => ipcRenderer.sendSync('getSettings'),
  saveSettings: (settings) => ipcRenderer.sendSync('saveSettings', settings),
  resetSettings: () => ipcRenderer.sendSync('resetSettings'),
  getEEWHistory: (count) => {
    ipcRenderer.send('getEEWHistory', count);
    return new Promise((resolve) => {
      ipcRenderer.once('eewHistory', (event, data) => resolve(data));
    });
  },
  getEQHistory: (count) => {
    ipcRenderer.send('getEQHistory', count);
    return new Promise((resolve) => {
      ipcRenderer.once('eqHistory', (event, data) => resolve(data));
    });
  },
  playSound: (soundName) => ipcRenderer.send('playSound', soundName),
  testSound: (soundName) => ipcRenderer.send('testSound', soundName),
  closeAlert: () => ipcRenderer.send('closeAlert'),
  setAutoStart: (enable) => ipcRenderer.sendSync('setAutoStart', enable),
  checkAutoStart: () => ipcRenderer.sendSync('checkAutoStart'),
  getSoundFilePath: (soundName) => ipcRenderer.sendSync('getSoundFilePath', soundName),
  sendTestEEW: (data) => ipcRenderer.send('sendTestEEW', data),
  clearEEWHistory: () => ipcRenderer.send('clearEEWHistory'),
  searchEarthquake: (keyword) => ipcRenderer.send('searchEarthquake', keyword),
  summarizeEarthquake: (prompt, domain, apiKey, callback) => {
    ipcRenderer.send('summarizeEarthquake', { prompt, domain, apiKey });
    ipcRenderer.once('summarizeEarthquakeResponse', (event, data) => callback(data));
  },
  completeActivation: (mode) => ipcRenderer.sendSync('completeActivation', mode),
  
  onEEWHistory: (callback) => {
    ipcRenderer.on('eewHistory', (event, data) => callback(data));
  },
  onEQHistory: (callback) => {
    ipcRenderer.on('eqHistory', (event, data) => callback(data));
  },
  onEEWAlert: (callback) => {
    ipcRenderer.on('eewAlert', (event, data) => callback(data));
  },
  onCriticalAlert: (callback) => {
    ipcRenderer.on('criticalAlert', (event, data) => callback(data));
  },
  onSWaveCountdown: (callback) => {
    ipcRenderer.on('sWaveCountdown', (event, data) => callback(data));
  },
  onSWaveArrived: (callback) => {
    ipcRenderer.on('sWaveArrived', (event, data) => callback(data));
  },
  onShowActivation: (callback) => {
    ipcRenderer.on('showActivation', (event) => callback());
  },
  openExternal: (url) => ipcRenderer.send('openExternal', url)
});
