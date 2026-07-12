const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { SeismicAPI } = require('./src/api');
const { DataStore } = require('./src/store');
const { GeoCalculator } = require('./src/geo');
const { SoundManager } = require('./src/sound');
const { SettingsManager } = require('./src/settings');

let mainWindow = null;
let tray = null;
let isQuitting = false;

const userDataPath = app.getPath('userData');
const appPath = app.getPath('exe');
const appDir = path.dirname(appPath);
const documentsPath = app.getPath('documents');
const laDirPath = path.join(documentsPath, 'LaQuake');
const laFilePath = path.join(laDirPath, 'LaQuakeBackUp.La');

const api = new SeismicAPI();
const store = new DataStore(userDataPath);
store.setLAFilePath(laFilePath);
const geo = new GeoCalculator();
const sound = new SoundManager();
const settings = new SettingsManager(path.join(userDataPath, 'settings.json'));

let eewPollingTimer = null;
let eqPollingTimer = null;
let currentEEW = null;
let sWaveTimer = null;
let sWaveArrived = false;
let isFirstLoad = true;
let processedEEW = {};
let alertExpireTime = 7200000;
let preAlertWindowState = { width: 800, height: 600, x: 0, y: 0, maximized: false };
let shouldShowActivation = false;

function checkActivation() {
  console.log('Checking activation...');
  console.log('LA file path:', laFilePath);
  
  if (fs.existsSync(laFilePath)) {
    try {
      const content = fs.readFileSync(laFilePath, 'utf-8');
      const lines = content.split('\n');
      
      if (lines.length >= 2 && lines[0] === 'LAQUAKE_DATA_V1') {
        const jsonData = JSON.parse(lines.slice(1).join('\n'));
        const isActivated = jsonData.isActivated || false;
        console.log('LA file exists, isActivated:', isActivated);
        
        if (isActivated && jsonData.settings) {
          settings.save(jsonData.settings);
        }
        return isActivated;
      } else {
        console.log('LA file format invalid');
      }
    } catch (error) {
      console.error('Failed to parse LA file:', error.message);
    }
  } else {
    console.log('LA file does not exist');
  }
  
  const currentSettings = settings.load();
  const isActivated = currentSettings.isActivated || false;
  console.log('Checked settings isActivated:', isActivated);
  
  return isActivated;
}

function createWindow() {
  const { width, height } = settings.get('windowSize', { width: 800, height: 600 });
  
  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    minWidth: 600,
    minHeight: 400,
    icon: path.join(__dirname, 'Media', 'LaQuake.ico'),
    frame: true,
    title: 'LaQuake - 地震预警',
    transparent: true,
    backgroundColor: 'rgba(0, 0, 0, 0)',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    }
  });
  
  Menu.setApplicationMenu(null);

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
    if (input.key === 'F12') {
      event.preventDefault();
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (shouldShowActivation) {
      mainWindow.webContents.send('showActivation');
      console.log('Sending showActivation');
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.get('minimizeToTray', true)) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'LaQuake',
          content: '已最小化到系统托盘'
        });
      }
    } else {
      cleanup();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray();
}

function createTray() {
  const iconPath = path.join(__dirname, 'Media', 'LaQuake.ico');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('LaQuake - 地震预警');
  tray.setContextMenu(contextMenu);
  
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.show();
    }
  });
}

function cleanup() {
  if (eewPollingTimer) clearInterval(eewPollingTimer);
  if (eqPollingTimer) clearInterval(eqPollingTimer);
  if (sWaveTimer) clearInterval(sWaveTimer);
  
  if (fs.existsSync(laFilePath)) {
    const currentSettings = settings.load();
    store.saveToLAFileSync(currentSettings);
  }
  
  store.close();
}

async function startPolling() {
  const eewInterval = settings.get('eewPollInterval', 1000);
  const eqInterval = settings.get('eqPollInterval', 5000);

  eewPollingTimer = setInterval(async () => {
    try {
      await fetchEEWData();
    } catch (error) {
      console.error('EEW polling error:', error);
    }
  }, eewInterval);

  eqPollingTimer = setInterval(async () => {
    try {
      await fetchEQData();
    } catch (error) {
      console.error('EQ polling error:', error);
    }
  }, eqInterval);

  await fetchEEWData();
  await fetchEQData();
}

async function fetchEEWData() {
  const source = settings.get('eewSource', 'cenc');
  const count = settings.get('eewCount', 10);
  
  try {
    const data = await api.getEEW(source);
    
    console.log('EEW API Response:', JSON.stringify(data));
    
    if (!data || typeof data !== 'object' || !data.EventID) {
      console.log('EEW: No valid data or missing EventID');
      return;
    }
    
    const eew = data;
    const eventId = eew.EventID;
    const serial = eew.Serial || eew.ReportNum || 0;
    const now = Date.now();
    
    const originTime = new Date(eew.OriginTime);
    if (isNaN(originTime.getTime())) {
      console.log('EEW: Invalid OriginTime:', eew.OriginTime);
      return;
    }
    
    const timeSinceOrigin = now - originTime.getTime();
    console.log('EEW: Time since origin:', timeSinceOrigin / 1000, 'seconds');
    
    const expireTime = 5 * 60 * 1000;
    
    const localIntensity = calculateLocalIntensity(eew);
    console.log('EEW: Local intensity:', localIntensity);
    
    const isNew = await store.addEEW(eew, localIntensity);
    console.log('EEW: Added to store:', isNew);
    
    const currentStore = await store.getEEWHistory(100);
    console.log('EEW: Current store count:', currentStore.length);
    
    if (!processedEEW[eventId]) {
      processedEEW[eventId] = { maxSerial: 0, lastAlertTime: 0 };
    }
    
    if (serial > processedEEW[eventId].maxSerial) {
      processedEEW[eventId].maxSerial = serial;
      
      if (!isFirstLoad && timeSinceOrigin <= expireTime) {
        if (localIntensity >= settings.get('minLocalIntensity', 0)) {
          const nowTime = Date.now();
          const alertCooldown = 10000;
          
          if (nowTime - processedEEW[eventId].lastAlertTime > alertCooldown) {
            processedEEW[eventId].lastAlertTime = nowTime;
            handleEEWAlert(eew, localIntensity);
          }
        }
      }
    }
    
    const history = await store.getEEWHistory(count);
    console.log('EEW: History count:', history.length);
    if (mainWindow) {
      console.log('EEW: Sending to renderer:', history.length, 'items');
      mainWindow.webContents.send('eewHistory', history);
    }
    
    if (isFirstLoad) {
      console.log('EEW: First load complete');
      isFirstLoad = false;
    }
  } catch (error) {
    console.error('Fetch EEW data error:', error);
  }
}

async function fetchEQData() {
  const source = settings.get('eqSource', 'cenc');
  const count = settings.get('eqCount', 20);
  
  try {
    const data = await api.getEQList(source);
    
    if (!data || !data.length) return;
    
    for (const eq of data) {
      const isNew = await store.addEQ(eq);
      
      if (isNew) {
        const intensity = parseFloat(eq.intensity || eq.shindo || '0');
        if (intensity >= settings.get('minEQIntensity', 0)) {
          sound.play('newrecord');
          await sendEQPost(eq);
        }
      }
    }
    
    const history = await store.getEQHistory(count);
    mainWindow?.webContents.send('eqHistory', history);
  } catch (error) {
    console.error('Fetch EQ data error:', error);
  }
}

async function sendEEWPost(eew) {
  const postUrl = settings.get('eewPostUrl', '');
  if (!postUrl) return;
  
  try {
    const userLat = settings.get('userLatitude', 30.67);
    const userLon = settings.get('userLongitude', 104.07);
    const distance = geo.calculateDistance(userLat, userLon, eew.Latitude, eew.Longitude);
    const sWaveSpeed = settings.get('sWaveSpeed', 4);
    const time = Math.max(0, Math.floor(distance / sWaveSpeed));
    
    const zhenji = eew.Magnitude || eew.Magunitude || eew.magnitude || '0';
    const liedu = eew.MaxIntensity || eew.max_intensity || '0';
    const zzmc = eew.Hypocenter || eew.hypocenter || '未知';
    const zzj = distance.toFixed(1);
    
    let url = postUrl
      .replace(/{ZHENJI}/g, zhenji)
      .replace(/{LIEDU}/g, liedu)
      .replace(/{ZZMC}/g, zzmc)
      .replace(/{ZZJ}/g, zzj)
      .replace(/{TIME}/g, time.toString());
    
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'eew',
        eventId: eew.EventID,
        reportNum: eew.ReportNum || eew.Serial || 0,
        zhenji,
        liedu,
        zzmc,
        zzj,
        time
      })
    });
    
    console.log('EEW POST sent successfully');
  } catch (error) {
    console.error('Failed to send EEW POST:', error);
  }
}

async function sendEQPost(eq) {
  const postUrl = settings.get('eqPostUrl', '');
  if (!postUrl) return;
  
  try {
    const userLat = settings.get('userLatitude', 30.67);
    const userLon = settings.get('userLongitude', 104.07);
    const eqLat = parseFloat(eq.latitude || eq.Latitude || '0');
    const eqLon = parseFloat(eq.longitude || eq.Longitude || '0');
    const distance = eqLat && eqLon ? geo.calculateDistance(userLat, userLon, eqLat, eqLon) : 0;
    const sWaveSpeed = settings.get('sWaveSpeed', 4);
    const time = Math.max(0, Math.floor(distance / sWaveSpeed));
    
    const zhenji = eq.magnitude || eq.Magnitude || '0';
    const liedu = eq.intensity || eq.shindo || eq.MaxIntensity || eq.max_intensity || '0';
    const zzmc = eq.location || eq.placeName || eq.place_name || eq.Location || '未知';
    const zzj = distance.toFixed(1);
    
    let url = postUrl
      .replace(/{ZHENJI}/g, zhenji)
      .replace(/{LIEDU}/g, liedu)
      .replace(/{ZZMC}/g, zzmc)
      .replace(/{ZZJ}/g, zzj)
      .replace(/{TIME}/g, time.toString());
    
    await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        type: 'eq',
        zhenji,
        liedu,
        zzmc,
        zzj,
        time
      })
    });
    
    console.log('EQ POST sent successfully');
  } catch (error) {
    console.error('Failed to send EQ POST:', error);
  }
}

function calculateLocalIntensity(eew) {
  const userLat = settings.get('userLatitude', 30.67);
  const userLon = settings.get('userLongitude', 104.07);
  const epicenterLat = eew.Latitude;
  const epicenterLon = eew.Longitude;
  const intensity0 = eew.MaxIntensity !== undefined ? eew.MaxIntensity : (eew.max_intensity !== undefined ? eew.max_intensity : 0);
  
  if (epicenterLat === undefined || epicenterLat === null || isNaN(epicenterLat) ||
      epicenterLon === undefined || epicenterLon === null || isNaN(epicenterLon) ||
      intensity0 === undefined || intensity0 === null || isNaN(intensity0)) return 0;
  
  const distance = geo.calculateDistance(userLat, userLon, epicenterLat, epicenterLon);
  const intensity = geo.calculateIntensity(intensity0, distance);
  
  return intensity;
}

function handleEEWAlert(eew, localIntensity) {
  const epicenterIntensity = parseFloat(eew.MaxIntensity || eew.max_intensity || 0);
  
  sendEEWPost(eew);
  
  if (epicenterIntensity >= 6) {
    triggerCriticalAlert(eew, localIntensity);
    playAlertSound('critical');
  } else {
    if (mainWindow) {
      mainWindow.setAlwaysOnTop(true);
      mainWindow.show();
      
      const userLat = settings.get('userLatitude', 30.67);
      const userLon = settings.get('userLongitude', 104.07);
      const epicenterLat = eew.Latitude;
      const epicenterLon = eew.Longitude;
      const distance = geo.calculateDistance(userLat, userLon, epicenterLat, epicenterLon);
      const sWaveSpeed = settings.get('sWaveSpeed', 4);
      const sWaveSeconds = Math.max(0, Math.floor(distance / sWaveSpeed));
      
      mainWindow.webContents.send('eewAlert', { eew, localIntensity, distance, sWaveSeconds });
    }
    
    playAlertSound('alert');
  }
}

function playAlertSound(soundName) {
  const filePath = sound.getSoundFilePath(soundName);
  if (filePath && mainWindow) {
    mainWindow.webContents.executeJavaScript(`playSound('${filePath.replace(/\\/g, '\\\\')}')`);
  }
}

function triggerCriticalAlert(eew, localIntensity) {
  const currentSerial = currentEEW ? (currentEEW.Serial || currentEEW.ReportNum || 0) : 0;
  const newSerial = eew.Serial || eew.ReportNum || 0;
  
  if (currentEEW && currentEEW.EventID === eew.EventID && currentSerial >= newSerial) {
    return;
  }
  
  currentEEW = eew;
  sWaveArrived = false;
  
  if (mainWindow) {
    const bounds = mainWindow.getBounds();
    preAlertWindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: mainWindow.isMaximized()
    };
    
    mainWindow.setAlwaysOnTop(true);
    mainWindow.maximize();
    mainWindow.show();
    
    const userLat = settings.get('userLatitude', 30.67);
    const userLon = settings.get('userLongitude', 104.07);
    const epicenterLat = eew.Latitude;
    const epicenterLon = eew.Longitude;
    
    const distance = geo.calculateDistance(userLat, userLon, epicenterLat, epicenterLon);
    const sWaveSpeed = settings.get('sWaveSpeed', 4);
    const pWaveSpeed = settings.get('pWaveSpeed', 7);
    
    const pWaveTime = distance / pWaveSpeed;
    const sWaveTime = distance / sWaveSpeed;
    const timeDiff = sWaveTime - pWaveTime;
    
    const originTime = new Date(eew.OriginTime);
    const now = new Date();
    const elapsed = (now - originTime) / 1000;
    
    let sWaveSeconds = Math.max(0, Math.floor(timeDiff - elapsed));
    
    sound.play('critical');
    
    mainWindow.webContents.send('criticalAlert', {
      eew,
      localIntensity,
      distance,
      sWaveSeconds
    });
    
    if (sWaveTimer) clearInterval(sWaveTimer);
    
    sWaveTimer = setInterval(() => {
      sWaveSeconds--;
      
      if (sWaveSeconds <= 0 && !sWaveArrived) {
        sWaveArrived = true;
        clearInterval(sWaveTimer);
        sound.play('swave');
        
        setTimeout(() => {
          const intensityLevel = getIntensityLevel(localIntensity);
          sound.play(intensityLevel);
        }, 2000);
        
        mainWindow.webContents.send('sWaveArrived', { eew, localIntensity });
      } else if (sWaveSeconds > 0) {
        mainWindow.webContents.send('sWaveCountdown', sWaveSeconds);
      }
    }, 1000);
  }
}

function getIntensityLevel(intensity) {
  if (intensity >= 5) return 'strongshake';
  if (intensity >= 3) return 'midshake';
  if (intensity >= 2) return 'weakshake';
  return null;
}

ipcMain.on('getSettings', (event) => {
  event.returnValue = settings.getAll();
});

ipcMain.on('saveSettings', (event, newSettings) => {
  settings.save(newSettings);
  
  if (fs.existsSync(laFilePath)) {
    store.saveToLAFileSync(newSettings);
  }
  
  sound.updateFromSettings(newSettings);
});

ipcMain.on('resetSettings', (event) => {
  settings.save({});
  const defaultSettings = settings.load();
  
  if (fs.existsSync(laFilePath)) {
    store.saveToLAFileSync(defaultSettings);
  }
  
  sound.updateFromSettings(defaultSettings);
  
  if (eewPollingTimer) {
    clearInterval(eewPollingTimer);
    eewPollingTimer = null;
  }
  if (eqPollingTimer) {
    clearInterval(eqPollingTimer);
    eqPollingTimer = null;
  }
  
  processedEEW = {};
  
  startPolling();
  
  fetchEEWData();
  fetchEQData();
  
  event.returnValue = true;
});

ipcMain.on('openExternal', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('getEEWHistory', async (event, count) => {
  const history = await store.getEEWHistory(count || 10);
  event.reply('eewHistory', history);
});

ipcMain.on('sendTestEEW', async (event, testData) => {
  console.log('Received test EEW:', JSON.stringify(testData));
  
  const eew = {
    ...testData,
    EventID: `TEST-${Date.now()}`,
    Serial: testData.ReportNum
  };
  
  const now = Date.now();
  
  const originTime = new Date(eew.OriginTime);
  if (isNaN(originTime.getTime())) {
    console.log('Test EEW: Invalid OriginTime:', eew.OriginTime);
    return;
  }
  
  const timeSinceOrigin = now - originTime.getTime();
  console.log('Test EEW: Time since origin:', timeSinceOrigin / 1000, 'seconds');
  
  const expireTime = 5 * 60 * 1000;
  
  const localIntensity = calculateLocalIntensity(eew);
  console.log('Test EEW: Local intensity:', localIntensity);
  
  const eventId = eew.EventID;
  const serial = eew.Serial || eew.ReportNum || 0;
  
  if (!processedEEW[eventId]) {
    processedEEW[eventId] = { maxSerial: 0, lastAlertTime: 0 };
  }
  
  if (serial > processedEEW[eventId].maxSerial) {
    processedEEW[eventId].maxSerial = serial;
    
    if (timeSinceOrigin <= expireTime) {
      if (localIntensity >= settings.get('minLocalIntensity', 0)) {
        const nowTime = Date.now();
        const alertCooldown = 10000;
        
        if (nowTime - processedEEW[eventId].lastAlertTime > alertCooldown) {
          processedEEW[eventId].lastAlertTime = nowTime;
          
          await sendEEWPost(eew);
          console.log('Test EEW: POST URL sent');
          
          handleEEWAlert(eew, localIntensity);
        }
      }
    }
  }
});

ipcMain.on('getEQHistory', async (event, count) => {
  const history = await store.getEQHistory(count || 20);
  event.reply('eqHistory', history);
});

ipcMain.on('playSound', (event, soundName) => {
  const soundPathMap = {
    alert: settings.get('soundAlert', ''),
    critical: settings.get('soundCritical', ''),
    update: settings.get('soundUpdate', ''),
    swave: settings.get('soundSWave', ''),
    newrecord: settings.get('soundNewRecord', ''),
    weakshake: settings.get('soundWeakShake', ''),
    midshake: settings.get('soundMidShake', ''),
    strongshake: settings.get('soundStrongShake', '')
  };
  
  const filePath = soundPathMap[soundName] || '';
  if (filePath && mainWindow) {
    mainWindow.webContents.executeJavaScript(`playSound('${filePath.replace(/\\/g, '\\\\')}')`);
  }
});

ipcMain.on('testSound', (event, soundName) => {
  const soundPathMap = {
    alert: settings.get('soundAlert', ''),
    critical: settings.get('soundCritical', ''),
    update: settings.get('soundUpdate', ''),
    swave: settings.get('soundSWave', ''),
    newrecord: settings.get('soundNewRecord', ''),
    weakshake: settings.get('soundWeakShake', ''),
    midshake: settings.get('soundMidShake', ''),
    strongshake: settings.get('soundStrongShake', '')
  };
  
  const filePath = soundPathMap[soundName] || '';
  if (filePath && mainWindow) {
    mainWindow.webContents.executeJavaScript(`playSound('${filePath.replace(/\\/g, '\\\\')}')`);
  }
});

ipcMain.on('getSoundFilePath', (event, soundName) => {
  event.returnValue = sound.getSoundFilePath(soundName);
});

ipcMain.on('closeAlert', () => {
  if (sWaveTimer) {
    clearInterval(sWaveTimer);
    sWaveTimer = null;
  }
  sWaveArrived = false;
  
  if (mainWindow) {
    mainWindow.unmaximize();
    mainWindow.setBounds({
      width: preAlertWindowState.width,
      height: preAlertWindowState.height,
      x: preAlertWindowState.x,
      y: preAlertWindowState.y
    });
    mainWindow.setAlwaysOnTop(false);
  }
});

ipcMain.on('clearEEWHistory', () => {
  store.clearEEWHistory();
  console.log('EEW history cleared');
});

ipcMain.on('completeActivation', (event, mode) => {
  const currentSettings = settings.load();
  currentSettings.isActivated = true;
  currentSettings.appMode = mode;
  settings.save(currentSettings);
  
  const saveResult = store.saveToLAFileSync(currentSettings);
  console.log('LA file save result:', saveResult, 'path:', laFilePath);
  console.log('File exists after save:', fs.existsSync(laFilePath));
  
  if (mode === 'eewcn') {
    const mediaDir = 'C:\\Program Files\\eewcn\\Media';
    
    const soundMap = {
      soundAlert: path.join(mediaDir, 'eewalert.wav'),
      soundCritical: path.join(mediaDir, 'eewcritical.wav'),
      soundUpdate: path.join(mediaDir, 'eewupdate.wav'),
      soundSWave: path.join(mediaDir, 'swavearrive.wav'),
      soundNewRecord: path.join(mediaDir, 'newrecord.wav'),
      soundWeakShake: path.join(mediaDir, 'weakshake.wav'),
      soundMidShake: path.join(mediaDir, 'midshake.wav'),
      soundStrongShake: path.join(mediaDir, 'strongshake.wav')
    };
    
    event.returnValue = soundMap;
  } else {
    event.returnValue = null;
  }
});

ipcMain.on('searchEarthquake', (event, keyword) => {
  const { exec } = require('child_process');
  const { shell } = require('electron');
  
  exec('ping -n 1 twitter.com', (error) => {
    let url;
    if (!error) {
      url = `https://www.google.com/search?q=${encodeURIComponent(keyword)}`;
    } else {
      url = `https://www.bing.com/search?q=${encodeURIComponent(keyword)}`;
    }
    shell.openExternal(url);
  });
});

ipcMain.on('summarizeEarthquake', async (event, { prompt, domain, apiKey }) => {
  try {
    const https = require('https');
    const url = new URL(`https://${domain}/v1/chat/completions`);
    
    const body = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: 0.7
    });
    
    let responseContent = '';
    
    const req = https.request({
      hostname: domain,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      res.setEncoding('utf8');
      
      res.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              continue;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta) {
                const content = parsed.choices[0].delta.content || '';
                responseContent += content;
                event.sender.send('summarizeEarthquakeResponse', {
                  type: 'chunk',
                  content: responseContent
                });
              }
            } catch (e) {
              console.error('Error parsing stream:', e);
            }
          }
        }
      });
      
      res.on('end', () => {
        event.sender.send('summarizeEarthquakeResponse', {
          type: 'done',
          content: responseContent
        });
      });
      
      res.on('error', (err) => {
        event.sender.send('summarizeEarthquakeResponse', {
          type: 'error',
          content: `请求失败: ${err.message}`
        });
      });
    });
    
    req.on('error', (err) => {
      event.sender.send('summarizeEarthquakeResponse', {
        type: 'error',
        content: `请求失败: ${err.message}`
      });
    });
    
    req.write(body);
    req.end();
  } catch (error) {
    event.sender.send('summarizeEarthquakeResponse', {
      type: 'error',
      content: `错误: ${error.message}`
    });
  }
});

ipcMain.on('setAutoStart', (event, enable) => {
  const appPath = app.getPath('exe');
  const regPath = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
  
  if (enable) {
    try {
      require('child_process').exec(`reg add "${regPath}" /v LaQuake /t REG_SZ /d "${appPath}" /f`);
      event.returnValue = true;
    } catch (error) {
      event.returnValue = false;
    }
  } else {
    try {
      require('child_process').exec(`reg delete "${regPath}" /v LaQuake /f`);
      event.returnValue = true;
    } catch (error) {
      event.returnValue = false;
    }
  }
});

ipcMain.on('checkAutoStart', (event) => {
  try {
    const result = require('child_process').execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v LaQuake 2>&1');
    event.returnValue = result.toString().includes('LaQuake');
  } catch (error) {
    event.returnValue = false;
  }
});

app.whenReady().then(() => {
  store.init();
  settings.load();
  sound.init();
  
  shouldShowActivation = !checkActivation();
  
  createWindow();
  startPolling();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  cleanup();
});
