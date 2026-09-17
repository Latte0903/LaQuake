const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { SeismicAPI } = require('./src/api');
const { DataStore } = require('./src/store');
const { GeoCalculator } = require('./src/geo');
const intensityLib = require('./src/intensity');
const { SoundManager } = require('./src/sound');
const { SettingsManager } = require('./src/settings');
const { loadLanguage, t, getCurrentLang, getTranslations } = require('./src/i18n');

ipcMain.on('i18n-t', (event, payload) => {
  event.returnValue = t(payload.key, ...(payload.args || []));
});
ipcMain.on('i18n-lang', (event) => {
  event.returnValue = getCurrentLang();
});
ipcMain.on('i18n-translations', (event) => {
  event.returnValue = getTranslations();
});
ipcMain.on('i18n-set-lang', (event, lang) => {
  loadLanguage(lang);
  event.returnValue = getCurrentLang();
});

ipcMain.on('win-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('win-toggle-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.on('win-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

ipcMain.on('win-is-maximized', (event) => {
  event.returnValue = mainWindow && !mainWindow.isDestroyed() ? mainWindow.isMaximized() : false;
});

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      try {
        if (mainWindow.isMinimized()) mainWindow.restore();
        if (!mainWindow.isVisible()) mainWindow.show();
        mainWindow.setAlwaysOnTop(true);
        mainWindow.focus();
        mainWindow.moveTop();
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) mainWindow.setAlwaysOnTop(false);
        }, 800);
      } catch (error) {
        try {
          fs.appendFileSync(errorLogPath, `${new Date().toISOString()} second-instance error: ${error.stack}\n`);
        } catch (logError) {}
      }
    }
  });
}

let mainWindow = null;
let alertWindow = null;
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
let shouldShowActivation = false;

[process.stdout, process.stderr].forEach(stream => {
  if (stream && typeof stream.on === 'function') {
    stream.on('error', () => {});
  }
});

const errorLogPath = path.join(userDataPath, 'laquake-error.log');
process.on('uncaughtException', (error) => {
  try {
    fs.appendFileSync(errorLogPath, `${new Date().toISOString()} uncaughtException: ${error && error.stack ? error.stack : error}\n`);
  } catch (logError) {}
});
process.on('unhandledRejection', (reason) => {
  try {
    fs.appendFileSync(errorLogPath, `${new Date().toISOString()} unhandledRejection: ${reason}\n`);
  } catch (logError) {}
});

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
          
          const userLat = parseFloat(jsonData.settings.userLatitude) || 30.67;
          const userLon = parseFloat(jsonData.settings.userLongitude) || 104.07;
          store.loadFromLAFile(userLat, userLon);
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
    minHeight: 460,
    icon: path.join(__dirname, 'Media', 'LaQuake.ico'),
    frame: false,
    title: 'LaQuake',
    show: false,
    backgroundColor: '#0f172a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      backgroundThrottling: false
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  const notifyMaximize = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('maximize-change', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', notifyMaximize);
  mainWindow.on('unmaximize', notifyMaximize);

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    try {
      fs.appendFileSync(errorLogPath, `${new Date().toISOString()} render-process-gone: ${JSON.stringify(details)}\n`);
    } catch (logError) {}
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.reload();
        mainWindow.show();
      }
    }, 1000);
  });

  mainWindow.on('unresponsive', () => {
    try {
      fs.appendFileSync(errorLogPath, `${new Date().toISOString()} window unresponsive\n`);
    } catch (logError) {}
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
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
    if (shouldShowActivation) {
      mainWindow.webContents.send('showActivation');
      console.log('Sending showActivation');
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    try {
      fs.appendFileSync(errorLogPath, `${new Date().toISOString()} did-fail-load: ${errorCode} ${errorDescription}\n`);
    } catch (logError) {}
    if (errorCode !== -3) {
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadFile('index.html');
      }, 1500);
    }
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting && settings.get('minimizeToTray', true)) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'LaQuake',
          content: t('app.tray.minimized')
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
      label: t('app.tray.show'),
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        }
      }
    },
    {
      label: t('app.tray.quit'),
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip(t('app.tray'));
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
  if (alertWindow && !alertWindow.isDestroyed()) alertWindow.destroy();

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

const PING_TARGETS = [
  { name: 'Google', url: 'https://www.google.com/generate_204' },
  { name: 'Baidu', url: 'https://www.baidu.com/' }
];

async function measureLatency(url) {
  const start = Date.now();
  await axios.get(url, {
    timeout: 5000,
    maxRedirects: 0,
    validateStatus: status => status >= 200 && status < 400
  });
  return Date.now() - start;
}

async function runHealthCheck() {
  const result = { api: false, net: false, pingTarget: null, pingMs: null };
  try {
    await measureLatency(`${api.baseURL}/ntp.json`);
    result.api = true;
  } catch (error) {
    result.api = false;
  }
  for (const target of PING_TARGETS) {
    try {
      result.pingMs = await measureLatency(target.url);
      result.net = true;
      result.pingTarget = target.name;
      break;
    } catch (error) {
      // try next target
    }
  }
  return result;
}

ipcMain.handle('runHealthCheck', async () => {
  try {
    return await runHealthCheck();
  } catch (error) {
    return { api: false, net: false, pingTarget: null, pingMs: null };
  }
});

async function fetchEEWData() {
  const source = settings.get('eewSource', 'cenc');
  const eewCWA = settings.get('eewCWA', false);
  const count = settings.get('eewCount', 10);
  
  const sources = [source];
  if (eewCWA && source !== 'cwa') {
    sources.push('cwa');
  }
  
  for (const src of sources) {
    await fetchEEWFromSource(src, count);
  }
  
  const history = await store.getEEWHistory(count);
  if (mainWindow) {
    mainWindow.webContents.send('eewHistory', history);
  }
  
  if (isFirstLoad) {
    console.log('EEW: First load complete');
    isFirstLoad = false;
  }
}

async function fetchEEWFromSource(source, count) {
  try {
    const data = await api.getEEW(source);
    
    console.log(`EEW [${source}] API Response:`, JSON.stringify(data));
    
    if (!data || typeof data !== 'object' || !data.EventID) {
      console.log(`EEW [${source}]: No valid data or missing EventID`);
      return;
    }
    
    const eew = data;
    const eventId = eew.EventID;
    const serial = eew.Serial || eew.ReportNum || 0;
    const now = Date.now();
    
    const originTime = new Date(eew.OriginTime);
    if (isNaN(originTime.getTime())) {
      console.log(`EEW [${source}]: Invalid OriginTime:`, eew.OriginTime);
      return;
    }
    
    const timeSinceOrigin = now - originTime.getTime();
    console.log(`EEW [${source}]: Time since origin:`, timeSinceOrigin / 1000, 'seconds, source:', source);

    const { localIntensity, epicenterIntensity, region } = evaluateEewIntensity(eew, source);
    eew._epicenterIntensity = epicenterIntensity;
    eew._intRegion = region;
    console.log(`EEW [${source}]: Local intensity:`, localIntensity, 'Epicenter intensity:', epicenterIntensity, 'Region:', region);

    const userLat = settings.get('userLatitude', 30.67);
    const userLon = settings.get('userLongitude', 104.07);
    const isNew = await store.addEEW(eew, localIntensity, userLat, userLon);
    console.log(`EEW [${source}]: Added to store:`, isNew, 'EventID:', eventId, 'Serial/ReportNum:', serial);
    
    if (!processedEEW[eventId]) {
      processedEEW[eventId] = { maxSerial: 0, lastAlertTime: 0 };
    }
    
    if (serial > processedEEW[eventId].maxSerial) {
      console.log(`EEW [${source}]: New report detected, serial:`, serial, 'prev max:', processedEEW[eventId].maxSerial);
      processedEEW[eventId].maxSerial = serial;
      
      if (!isFirstLoad) {
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
  } catch (error) {
    console.error(`Fetch EEW data error [${source}]:`, error);
  }
}

async function fetchEQData() {
  const source = settings.get('eqSource', 'cenc');
  const count = settings.get('eqCount', 20);
  
  try {
    const data = await api.getEQList(source);
    const userLat = settings.get('userLatitude', 30.67);
    const userLon = settings.get('userLongitude', 104.07);
    
    if (!data || !data.length) return;

    for (const eq of data) {
      const { localIntensity, epicenterIntensity, region, distance } = evaluateEqIntensity(eq, source, userLat, userLon);
      eq._epicenterIntensity = epicenterIntensity;
      eq._intRegion = region;
      eq._localIntensity = localIntensity;
      eq._distance = distance;
      const isNew = await store.addEQ(eq, userLat, userLon, localIntensity, epicenterIntensity, region);

      if (isNew) {
        const notifyIntensity = Math.max(localIntensity || 0, epicenterIntensity || 0);
        if (notifyIntensity >= settings.get('minEQIntensity', 0)) {
          sound.play('newrecord');
          await sendEQPost(eq, localIntensity, distance);
        }
      }
    }
    
    const history = await store.getEQHistory(count);
    mainWindow?.webContents.send('eqHistory', history);
  } catch (error) {
    console.error('Fetch EQ data error:', error);
  }
}

const PUSH_TITLE = '【LaQuake】';
const DEFAULT_BARK_ENDPOINT = 'https://api.day.app/push';
const DEFAULT_PUSH_JSON = '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "紧急地震预警！{FZSK}{ZZMC}发生{ZHENJI}级地震。预估本地烈度{YGLD}度，横波将于{TIME}秒后到达。预估有{YHCD}，请遵循{BXJY}.来自中国地震预警网。",\n  "level": "critical",\n  "sound": "alarm",\n  "volume": 10\n}';
const PUSH_VAR_KEYS = ['TITLE', 'BODY', 'FZSK', 'ZZMC', 'ZHENJI', 'LIEDU', 'YGLD', 'ZZJ', 'TIME', 'YHCD', 'BXJY'];

function buildSimpleBarkPayload(vars) {
  return applyVarsToObject({
    device_key: settings.get('barkDeviceKey', ''),
    title: vars.TITLE,
    body: vars.BODY,
    level: 'critical',
    sound: 'alarm',
    volume: 10
  }, vars);
}

function formatIntensityText(value) {
  if (value === null || value === undefined || isNaN(Number(value))) return '未知';
  const num = Number(value);
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function buildEewPushVars(eew, localIntensity, distance) {
  const sWaveSpeed = settings.get('sWaveSpeed', 4);
  const time = Math.max(0, Math.floor(distance / sWaveSpeed));

  const fzsk = eew.OriginTime || '';
  const zzmc = eew.HypoCenter || eew.Hypocenter || eew.hypocenter || t('label.unknown');
  const zhenji = eew.Magnitude || eew.Magunitude || eew.magnitude || '0';
  const liedu = formatIntensityText(eew._epicenterIntensity);
  const ygld = formatIntensityText(localIntensity);
  const zzj = distance.toFixed(1);
  const yhcd = intensityLib.getShakeDegree(localIntensity);
  const bxjy = intensityLib.getAvoidanceAdvice(localIntensity);
  const body = `紧急地震预警！${fzsk}${zzmc}发生${zhenji}级地震。预估本地烈度${ygld}度，横波将于${time}秒后到达。预估有${yhcd}，请遵循${bxjy}.来自中国地震预警网。`;

  return { TITLE: PUSH_TITLE, BODY: body, FZSK: fzsk, ZZMC: zzm, ZHENJI: zhenji, LIEDU: liedu, YGLD: ygld, ZZJ: zzj, TIME: String(time), YHCD: yhcd, BXJY: bxjy };
}

function buildEqPushVars(eq, localIntensity, distance) {
  const fzsk = eq.time || eq.Time || '';
  const zzmc = eq.location || eq.placeName || eq.place_name || eq.Location || t('label.unknown');
  const zhenji = eq.magnitude || eq.Magnitude || '0';
  const liedu = formatIntensityText(eq._epicenterIntensity);
  const ygld = formatIntensityText(localIntensity);
  const zzj = distance.toFixed(1);
  const time = Math.max(0, Math.floor(distance / settings.get('sWaveSpeed', 4)));
  const yhcd = intensityLib.getShakeDegree(localIntensity);
  const bxjy = intensityLib.getAvoidanceAdvice(localIntensity);
  const body = `地震速报：${fzsk}${zzmc}发生${zhenji}级地震，预估本地烈度${ygld}度，震中距${zzj}km。预估有${yhcd}，请遵循${bxjy}。来自中国地震预警网。`;

  return { TITLE: PUSH_TITLE, BODY: body, FZSK: fzsk, ZZMC: zzmc, ZHENJI: zhenji, LIEDU: liedu, YGLD: ygld, ZZJ: zzj, TIME: String(time), YHCD: yhcd, BXJY: bxjy };
}

function applyVarsToText(text, vars) {
  let result = String(text ?? '');
  for (const key of PUSH_VAR_KEYS) {
    const value = vars[key] === undefined || vars[key] === null ? '' : String(vars[key]);
    result = result.split(`{${key}}`).join(value);
  }
  return result;
}

function applyVarsToObject(obj, vars) {
  if (typeof obj === 'string') return applyVarsToText(obj, vars);
  if (Array.isArray(obj)) return obj.map(item => applyVarsToObject(item, vars));
  if (obj !== null && typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = applyVarsToObject(value, vars);
    }
    return result;
  }
  return obj;
}

async function sendPushNotification(vars) {
  const mode = settings.get('pushMode', 'simple') === 'pro' ? 'pro' : 'simple';
  let url = '';
  let payload;

  if (mode === 'pro') {
    url = (settings.get('pushUrl', '') || '').trim().replace(/\/+$/, '');
    if (!url) return;
    let template;
    try {
      template = JSON.parse(settings.get('pushJsonTemplate', DEFAULT_PUSH_JSON) || DEFAULT_PUSH_JSON);
    } catch (error) {
      template = JSON.parse(DEFAULT_PUSH_JSON);
    }
    payload = applyVarsToObject(template, vars);
  } else {
    url = (settings.get('barkUrl', '') || '').trim().replace(/\/+$/, '') || DEFAULT_BARK_ENDPOINT;
    const deviceKey = (settings.get('barkDeviceKey', '') || '').trim();
    if (!deviceKey) return;
    payload = buildSimpleBarkPayload(vars);
  }

  const response = await axios.post(url, payload, {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    timeout: 15000
  });
  return response.data;
}

async function sendEEWPost(eew, localIntensity) {
  try {
    const userLat = settings.get('userLatitude', 30.67);
    const userLon = settings.get('userLongitude', 104.07);
    const distance = geo.calculateDistance(userLat, userLon, eew.Latitude, eew.Longitude);
    const vars = buildEewPushVars(eew, localIntensity, distance);
    await sendPushNotification(vars);
    console.log('EEW push sent successfully');
  } catch (error) {
    console.error('Failed to send EEW push:', error.message);
  }
}

async function sendEQPost(eq, localIntensityValue, distanceValue) {
  try {
    const distance = Number(distanceValue !== undefined ? distanceValue : eq._distance) || 0;
    const localIntensity = Number(localIntensityValue !== undefined ? localIntensityValue : eq._localIntensity) || 0;
    const vars = buildEqPushVars(eq, localIntensity, distance);
    await sendPushNotification(vars);
    console.log('EQ push sent successfully');
  } catch (error) {
    console.error('Failed to send EQ push:', error.message);
  }
}

function isValidLatLon(lat, lon) {
  return lat !== undefined && lat !== null && !isNaN(lat) &&
         lon !== undefined && lon !== null && !isNaN(lon);
}

function evaluateEewIntensity(eew, source = 'cenc') {
  const magnitude = intensityLib.getEventMagnitude(eew);
  const depth = intensityLib.getEventDepth(eew);
  const { lat: epicenterLat, lon: epicenterLon } = intensityLib.getEventLatLon(eew);
  const region = intensityLib.classifyRegion(source, epicenterLat, epicenterLon);

  let epicenterIntensity = null;
  if (region === intensityLib.REGION_JP) {
    epicenterIntensity = intensityLib.getOfficialJpIntensity(eew);
    if (epicenterIntensity === null) {
      epicenterIntensity = intensityLib.estimateEpicenterIntensity(region, magnitude, depth);
    }
  } else if (region === intensityLib.REGION_CN) {
    epicenterIntensity = intensityLib.getOfficialCnIntensity(eew);
    if (epicenterIntensity === null) {
      epicenterIntensity = intensityLib.estimateEpicenterIntensity(region, magnitude, depth);
    }
  }

  const userLat = settings.get('userLatitude', 30.67);
  const userLon = settings.get('userLongitude', 104.07);

  let localIntensity = 0;
  if (isValidLatLon(epicenterLat, epicenterLon)) {
    const distance = geo.calculateDistance(userLat, userLon, epicenterLat, epicenterLon);
    localIntensity = intensityLib.estimateLocalIntensity(region, magnitude, depth, distance);
  }

  return { localIntensity, epicenterIntensity, region };
}

function evaluateEqIntensity(eq, source, userLat, userLon) {
  const magnitude = intensityLib.getEventMagnitude(eq);
  const depth = intensityLib.getEventDepth(eq);
  const { lat: eqLat, lon: eqLon } = intensityLib.getEventLatLon(eq);
  const region = intensityLib.classifyRegion(source, eqLat, eqLon);

  let epicenterIntensity = null;
  if (region === intensityLib.REGION_JP) {
    epicenterIntensity = intensityLib.getOfficialJpIntensity(eq);
    if (epicenterIntensity === null) {
      epicenterIntensity = intensityLib.estimateEpicenterIntensity(region, magnitude, depth);
    }
  } else if (region === intensityLib.REGION_CN) {
    epicenterIntensity = intensityLib.getOfficialCnIntensity(eq);
    if (epicenterIntensity === null) {
      epicenterIntensity = intensityLib.estimateEpicenterIntensity(region, magnitude, depth);
    }
  }

  let localIntensity = 0;
  let distance = 0;
  if (isValidLatLon(eqLat, eqLon) && magnitude !== null) {
    distance = geo.calculateDistance(userLat, userLon, eqLat, eqLon);
    localIntensity = intensityLib.estimateLocalIntensity(region, magnitude, depth, distance);
  }

  return { localIntensity, epicenterIntensity, region, distance };
}

function createAlertWindow() {
  if (alertWindow && !alertWindow.isDestroyed()) return alertWindow;

  alertWindow = new BrowserWindow({
    width: 420,
    height: 560,
    minWidth: 380,
    minHeight: 520,
    frame: false,
    resizable: true,
    show: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: '#7f1d1d',
    title: '地震预警',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  alertWindow.setAlwaysOnTop(true, 'screen-saver');
  alertWindow.loadFile('alert.html');

  alertWindow.once('ready-to-show', () => {
    if (alertWindow && !alertWindow.isDestroyed()) alertWindow.show();
  });

  alertWindow.on('closed', () => {
    alertWindow = null;
    if (sWaveTimer) {
      clearInterval(sWaveTimer);
      sWaveTimer = null;
    }
    sWaveArrived = false;
  });

  return alertWindow;
}

function showAlertWindow(payload) {
  const win = createAlertWindow();
  const send = () => {
    if (win && !win.isDestroyed()) win.webContents.send('alertData', payload);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
  if (!win.isVisible()) win.show();
  win.focus();
}

function handleEEWAlert(eew, localIntensity) {
  const epicenterIntensity = eew._epicenterIntensity !== undefined && eew._epicenterIntensity !== null
    ? Number(eew._epicenterIntensity)
    : (intensityLib.parseShindo(eew.MaxIntensity ?? eew.max_intensity) ?? 0);

  sendEEWPost(eew, localIntensity);

  const userLat = settings.get('userLatitude', 30.67);
  const userLon = settings.get('userLongitude', 104.07);
  const epicenterLat = eew.Latitude ?? eew.latitude;
  const epicenterLon = eew.Longitude ?? eew.longitude;

  let distance = 0;
  if (isValidLatLon(epicenterLat, epicenterLon)) {
    distance = geo.calculateDistance(userLat, userLon, epicenterLat, epicenterLon);
  }

  const sWaveSpeed = settings.get('sWaveSpeed', 4);
  const originTime = new Date(eew.OriginTime);
  const elapsed = isNaN(originTime.getTime()) ? 0 : (Date.now() - originTime.getTime()) / 1000;
  const sWaveSeconds = Math.max(0, Math.ceil(distance / sWaveSpeed - elapsed));

  const isCritical = epicenterIntensity >= 6;

  triggerAlertWindow(eew, localIntensity, distance, sWaveSeconds, isCritical);
  playAlertSound(isCritical ? 'critical' : 'alert');
}

function playAlertSound(soundName) {
  const filePath = sound.getSoundFilePath(soundName);
  if (filePath && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.executeJavaScript(`playSound('${filePath.replace(/\\/g, '\\\\')}')`);
  }
}

function triggerAlertWindow(eew, localIntensity, distance, sWaveSeconds, isCritical) {
  const currentSerial = currentEEW ? (currentEEW.Serial || currentEEW.ReportNum || 0) : 0;
  const newSerial = eew.Serial || eew.ReportNum || 0;

  if (currentEEW && currentEEW.EventID === eew.EventID && currentSerial >= newSerial &&
      alertWindow && !alertWindow.isDestroyed() && alertWindow.isVisible()) {
    return;
  }

  currentEEW = eew;
  sWaveArrived = false;

  showAlertWindow({
    eew,
    localIntensity,
    distance,
    sWaveSeconds,
    isCritical,
    yhcd: intensityLib.getShakeDegree(localIntensity),
    bxjy: intensityLib.getAvoidanceAdvice(localIntensity)
  });

  if (sWaveTimer) clearInterval(sWaveTimer);

  if (sWaveSeconds > 0) {
    sWaveTimer = setInterval(() => {
      if (sWaveArrived) return;
      if (sWaveSeconds <= 1) {
        sWaveArrived = true;
        clearInterval(sWaveTimer);
        sWaveTimer = null;
        sound.play('swave');

        setTimeout(() => {
          const intensityLevel = getIntensityLevel(localIntensity);
          if (intensityLevel) sound.play(intensityLevel);
        }, 2000);

        if (alertWindow && !alertWindow.isDestroyed()) {
          alertWindow.webContents.send('alertWaveArrived');
        }
      } else {
        sWaveSeconds -= 1;
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
  try {
    const oldSettings = settings.getAll();
    settings.save(newSettings);
    
    if (fs.existsSync(laFilePath)) {
      store.saveToLAFileSync(newSettings);
    }
    
    sound.updateFromSettings(newSettings);
    
    // Reload language if it changed
    if (newSettings.language && newSettings.language !== oldSettings.language) {
      loadLanguage(newSettings.language);
      // Rebuild tray menu with new language
      if (tray) {
        const contextMenu = Menu.buildFromTemplate([
          {
            label: t('app.tray.show'),
            click: () => {
              if (mainWindow) {
                mainWindow.show();
              }
            }
          },
          {
            label: t('app.tray.quit'),
            click: () => {
              isQuitting = true;
              app.quit();
            }
          }
        ]);
        tray.setToolTip(t('app.tray'));
        tray.setContextMenu(contextMenu);
      }
      // Update window title
      if (mainWindow) {
        mainWindow.setTitle(t('app.title'));
      }
    }
    
    event.returnValue = true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    event.returnValue = false;
  }
});

ipcMain.on('resetSettings', (event) => {
  try {
    settings.save({});
    const defaultSettings = settings.load();
    
    if (fs.existsSync(laFilePath)) {
      store.saveToLAFileSync(defaultSettings);
    }
    
    sound.updateFromSettings(defaultSettings);
    
    // Reset language to default
    loadLanguage(defaultSettings.language || 'zh-CN');
    if (tray) {
      const contextMenu = Menu.buildFromTemplate([
        {
          label: t('app.tray.show'),
          click: () => {
            if (mainWindow) {
              mainWindow.show();
            }
          }
        },
        {
          label: t('app.tray.quit'),
          click: () => {
            isQuitting = true;
            app.quit();
          }
        }
      ]);
      tray.setToolTip(t('app.tray'));
      tray.setContextMenu(contextMenu);
    }
    if (mainWindow) {
      mainWindow.setTitle(t('app.title'));
    }
    
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
  } catch (error) {
    console.error('Failed to reset settings:', error);
    event.returnValue = false;
  }
});

ipcMain.on('openExternal', (event, url) => {
  shell.openExternal(url);
});

ipcMain.on('getEEWHistory', async (event, count) => {
  console.log('getEEWHistory called with count:', count);
  try {
    const history = await store.getEEWHistory(count || 10);
    console.log('getEEWHistory: returning', history.length, 'items');
    event.sender.send('eewHistory', history);
  } catch (error) {
    console.error('Failed to get EEW history:', error);
    event.sender.send('eewHistory', []);
  }
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
  
  const { localIntensity, epicenterIntensity, region } = evaluateEewIntensity(eew, 'cenc');
  eew._epicenterIntensity = epicenterIntensity;
  eew._intRegion = region;
  console.log('Test EEW: Local intensity:', localIntensity, 'Epicenter intensity:', epicenterIntensity);

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
          
          await sendEEWPost(eew, localIntensity);
          console.log('Test EEW: push sent');
          
          handleEEWAlert(eew, localIntensity);
        }
      }
    }
  }
});

ipcMain.on('getEQHistory', async (event, count) => {
  console.log('getEQHistory called with count:', count);
  try {
    const history = await store.getEQHistory(count || 20);
    console.log('getEQHistory: returning', history.length, 'items');
    event.sender.send('eqHistory', history);
  } catch (error) {
    console.error('Failed to get EQ history:', error);
    event.sender.send('eqHistory', []);
  }
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

  if (alertWindow && !alertWindow.isDestroyed()) {
    alertWindow.close();
  }
  alertWindow = null;
});

ipcMain.on('clearEEWHistory', () => {
  store.clearEEWHistory();
  console.log('EEW history cleared');
});

ipcMain.handle('sendTestPush', async () => {
  try {
    const isPro = settings.get('pushMode', 'simple') === 'pro';
    if (!isPro && !(settings.get('barkDeviceKey', '') || '').trim()) {
      return { ok: false, error: '请先填写 Bark device_key' };
    }
    if (isPro && !(settings.get('pushUrl', '') || '').trim()) {
      return { ok: false, error: '请先填写专业模式推送链接' };
    }
    const vars = {
      TITLE: PUSH_TITLE,
      FZSK: '2026-09-17 10:00:00',
      ZZMC: '四川阿坝州',
      ZHENJI: '6.1',
      LIEDU: '8',
      YGLD: '4.7',
      ZZJ: '87.3',
      TIME: '21',
      YHCD: intensityLib.getShakeDegree(4.7),
      BXJY: intensityLib.getAvoidanceAdvice(4.7)
    };
    vars.BODY = `紧急地震预警！${vars.FZSK}${vars.ZZMC}发生${vars.ZHENJI}级地震。预估本地烈度${vars.YGLD}度，横波将于${vars.TIME}秒后到达。预估有${vars.YHCD}，请遵循${vars.BXJY}.来自中国地震预警网。（测试消息）`;
    const data = await sendPushNotification(vars);
    console.log('Test push response:', JSON.stringify(data));
    const barkCode = data && (data.code ?? data.Code);
    if (barkCode !== undefined && barkCode !== 200) {
      return { ok: false, error: `服务器返回 code=${barkCode}：${data.message || data.Message || '请检查 device_key / 推送链接'}` };
    }
    return { ok: true, detail: data ? JSON.stringify(data) : '' };
  } catch (error) {
    console.error('Failed to send test push:', error.message);
    return { ok: false, error: error.message };
  }
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

ipcMain.on('summarizeEarthquake', async (event, { prompt, domain, apiKey, model }) => {
  const webContents = event.sender;
  try {
    const url = new URL(domain);
    const httpModule = url.protocol === 'https:' ? require('https') : require('http');
    
    const body = JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
      temperature: 0.7
    });
    
    let responseContent = '';
    let isStreamMode = true;
    let rawResponse = '';
    
    const req = httpModule.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + (url.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(body)
      }
    }, (res) => {
      res.setEncoding('utf8');
      
      res.on('data', (chunk) => {
        rawResponse += chunk;
        
        if (isStreamMode) {
          const lines = chunk.toString().split('\n');
          let hasStreamData = false;
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              hasStreamData = true;
              const data = line.slice(6);
              if (data === '[DONE]') {
                continue;
              }
              try {
                const parsed = JSON.parse(data);
                
                if (parsed.error) {
                  const errorMsg = parsed.error.message || t('api.error.unknown');
                  let friendlyMsg = t('api.error.general') + ': ' + errorMsg;
                  if (errorMsg.toLowerCase().includes('insufficient balance') || errorMsg.toLowerCase().includes('余额')) {
                    friendlyMsg = t('api.error.balance');
                  } else if (errorMsg.toLowerCase().includes('invalid api key') || errorMsg.toLowerCase().includes('api key')) {
                    friendlyMsg = t('api.error.key');
                  } else if (errorMsg.toLowerCase().includes('model') && errorMsg.toLowerCase().includes('not found')) {
                    friendlyMsg = t('api.error.model');
                  } else if (errorMsg.toLowerCase().includes('rate limit')) {
                    friendlyMsg = t('api.error.rate');
                  }
                  webContents.send('summarizeEarthquakeResponse', {
                    type: 'error',
                    content: friendlyMsg
                  });
                  isStreamMode = false;
                  return;
                }
                
                if (parsed.choices && parsed.choices[0]) {
                  const delta = parsed.choices[0].delta;
                  const message = parsed.choices[0].message;
                  
                  let content = '';
                  if (delta && delta.content !== undefined) {
                    content = delta.content;
                  } else if (message && message.content !== undefined) {
                    content = message.content;
                    isStreamMode = false;
                  } else if (parsed.choices[0].text !== undefined) {
                    content = parsed.choices[0].text;
                    isStreamMode = false;
                  }
                  
                  if (content) {
                    responseContent += content;
                    webContents.send('summarizeEarthquakeResponse', {
                      type: 'chunk',
                      content: responseContent
                    });
                  }
                }
              } catch (e) {
                console.error('Error parsing stream line:', e);
              }
            }
          }
          
          if (!hasStreamData && chunk.toString().trim().length > 0 && !rawResponse.startsWith('data: ')) {
            isStreamMode = false;
          }
        }
      });
      
      res.on('end', () => {
        if (!isStreamMode && !responseContent && rawResponse) {
          try {
            const parsed = JSON.parse(rawResponse);
            
            if (parsed.error) {
              const errorMsg = parsed.error.message || t('api.error.unknown');
              let friendlyMsg = t('api.error.general') + ': ' + errorMsg;
              if (errorMsg.toLowerCase().includes('insufficient balance') || errorMsg.toLowerCase().includes('余额')) {
                friendlyMsg = t('api.error.balance');
              } else if (errorMsg.toLowerCase().includes('invalid api key') || errorMsg.toLowerCase().includes('api key')) {
                friendlyMsg = t('api.error.key');
              } else if (errorMsg.toLowerCase().includes('model') && errorMsg.toLowerCase().includes('not found')) {
                friendlyMsg = t('api.error.model');
              } else if (errorMsg.toLowerCase().includes('rate limit')) {
                friendlyMsg = t('api.error.rate');
              }
              webContents.send('summarizeEarthquakeResponse', {
                type: 'error',
                content: friendlyMsg
              });
              return;
            }
            
            if (parsed.choices && parsed.choices[0]) {
              const message = parsed.choices[0].message;
              let content = '';
              
              if (message && message.content !== undefined) {
                content = message.content;
              } else if (parsed.choices[0].text !== undefined) {
                content = parsed.choices[0].text;
              } else if (parsed.text !== undefined) {
                content = parsed.text;
              }
              
              if (content) {
                responseContent = content;
                webContents.send('summarizeEarthquakeResponse', {
                  type: 'chunk',
                  content: responseContent
                });
              }
            }
          } catch (e) {
            console.error('Error parsing non-stream response:', e);
            webContents.send('summarizeEarthquakeResponse', {
              type: 'error',
              content: t('api.error.parse') + ': ' + rawResponse.substring(0, 200) + '...'
            });
            return;
          }
        }
        
        webContents.send('summarizeEarthquakeResponse', {
          type: 'done',
          content: responseContent
        });
      });
      
      res.on('error', (err) => {
        webContents.send('summarizeEarthquakeResponse', {
          type: 'error',
          content: t('api.error.request') + ': ' + err.message
        });
      });
    });
    
    req.on('error', (err) => {
      webContents.send('summarizeEarthquakeResponse', {
        type: 'error',
        content: t('api.error.request') + ': ' + err.message
      });
    });
    
    req.write(body);
    req.end();
  } catch (error) {
    webContents.send('summarizeEarthquakeResponse', {
      type: 'error',
      content: t('api.error.msg') + ': ' + error.message
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
  try {
    store.init();
    const currentSettings = settings.load();

    // Load language from settings
    const lang = currentSettings.language || 'zh-CN';
    loadLanguage(lang);

    sound.init();

    shouldShowActivation = !checkActivation();

    createWindow();
    startPolling();

    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      }
    }, 8000);
  } catch (error) {
    try {
      fs.appendFileSync(errorLogPath, `${new Date().toISOString()} startup error: ${error.stack}\n`);
    } catch (logError) {}
    if (!mainWindow) createWindow();
  }

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
