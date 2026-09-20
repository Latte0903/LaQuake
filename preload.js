const { ipcRenderer, contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getVersion: () => ipcRenderer.sendSync('app-version'),
  getSettings: () => ipcRenderer.sendSync('getSettings'),
  saveSettings: (settings) => ipcRenderer.sendSync('saveSettings', settings),
  resetSettings: () => ipcRenderer.sendSync('resetSettings'),
  getEEWHistory: (count) => {
    ipcRenderer.send('getEEWHistory', count);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('getEEWHistory: timeout, resolving with empty array');
        resolve([]);
      }, 5000);
      ipcRenderer.once('eewHistory', (event, data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  },
  getEQHistory: (count) => {
    ipcRenderer.send('getEQHistory', count);
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.warn('getEQHistory: timeout, resolving with empty array');
        resolve([]);
      }, 5000);
      ipcRenderer.once('eqHistory', (event, data) => {
        clearTimeout(timeout);
        resolve(data);
      });
    });
  },
  playSound: (soundName) => ipcRenderer.send('playSound', soundName),
  testSound: (soundName) => ipcRenderer.send('testSound', soundName),
  closeAlert: () => ipcRenderer.send('closeAlert'),
  winMinimize: () => ipcRenderer.send('win-minimize'),
  winToggleMaximize: () => ipcRenderer.send('win-toggle-maximize'),
  winClose: () => ipcRenderer.send('win-close'),
  winIsMaximized: () => ipcRenderer.sendSync('win-is-maximized'),
  runHealthCheck: () => ipcRenderer.invoke('runHealthCheck'),
  onMaximizeChange: (callback) => {
    ipcRenderer.on('maximize-change', (event, isMaximized) => callback(isMaximized));
  },
  setAutoStart: (enable) => ipcRenderer.sendSync('setAutoStart', enable),
  checkAutoStart: () => ipcRenderer.sendSync('checkAutoStart'),
  autoLocate: () => ipcRenderer.invoke('autoLocate'),
  getSoundFilePath: (soundName) => ipcRenderer.sendSync('getSoundFilePath', soundName),
  sendTestEEW: (data) => ipcRenderer.send('sendTestEEW', data),
  testPush: () => ipcRenderer.invoke('sendTestPush'),
  clearEEWHistory: () => ipcRenderer.send('clearEEWHistory'),
  searchEarthquake: (keyword) => ipcRenderer.send('searchEarthquake', keyword),
  summarizeEarthquake: (prompt, domain, apiKey, model, callback) => {
    ipcRenderer.send('summarizeEarthquake', { prompt, domain, apiKey, model });
    const handler = (event, data) => {
      callback(data);
      if (data.type === 'done' || data.type === 'error') {
        ipcRenderer.removeListener('summarizeEarthquakeResponse', handler);
      }
    };
    ipcRenderer.on('summarizeEarthquakeResponse', handler);
  },
  // i18n functions (bridged to main process; preload sandbox cannot require local modules)
  t: (key, ...args) => ipcRenderer.sendSync('i18n-t', { key, args }),
  getCurrentLang: () => ipcRenderer.sendSync('i18n-lang'),
  getTranslations: () => ipcRenderer.sendSync('i18n-translations'),
  setLanguage: (lang) => ipcRenderer.sendSync('i18n-set-lang', lang),
  
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
  onAlertData: (callback) => {
    ipcRenderer.on('alertData', (event, data) => callback(data));
  },
  onAlertWaveArrived: (callback) => {
    ipcRenderer.on('alertWaveArrived', () => callback());
  },
  onAutoLocated: (callback) => {
    ipcRenderer.on('autoLocated', (event, data) => callback(data));
  },
  openExternal: (url) => ipcRenderer.send('openExternal', url)
});