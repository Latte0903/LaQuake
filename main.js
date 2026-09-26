const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, Tray, Menu } = require('electron');
// 真实预警由后台轮询触发，渲染进程没有用户手势，默认自动播放策略会拦截
// new Audio().play()（表现为：设置页测试能响、真实/测试预警不响）
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const axios = require('axios');
const { SeismicAPI } = require('./src/api');
const { DataStore } = require('./src/store');
const { GeoCalculator } = require('./src/geo');
const intensityLib = require('./src/intensity');
const { SoundManager } = require('./src/sound');
const { SettingsManager } = require('./src/settings');
const { loadLanguage, t, getCurrentLang, getTranslations } = require('./src/i18n');

const UNINSTALL_MODE = process.argv.includes('--uninstall');
if (UNINSTALL_MODE) {
  require('./uninstaller/uninstall-main').run();
}

ipcMain.on('app-version', (event) => {
  event.returnValue = app.getVersion();
});

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

if (!UNINSTALL_MODE) {
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

// 各数据源发震时间的 UTC 偏移：JMA 为 UTC+9，CENC/SC/FJ/CQ/CWA 均为 UTC+8
const SOURCE_UTC_OFFSET = { cenc: 8, sc: 8, fj: 8, cq: 8, cwa: 8, jma: 9 };
// 服务器时间 - 本机时间（ms）。客户端时钟可能有偏差，倒计时必须与真实时间轴对齐，
// 用 ntp.json 周期性校准；校时失败时保持 0（退化为用本机时钟）
let serverClockOffset = 0;
let lastNtpSync = 0;
let ntpSyncTimer = null;

const getCorrectedNow = () => Date.now() + serverClockOffset;

async function syncServerTime() {
  const start = Date.now();
  try {
    const data = await api.getServerTime();
    const end = Date.now();
    if (!data || data.timestamp === null || data.timestamp === undefined) return;
    let serverMs = Number(data.timestamp);
    if (!Number.isFinite(serverMs)) return;
    if (serverMs > 0 && serverMs < 1e12) serverMs *= 1000; // 秒级时间戳兜底
    // 合理性校验：2000-01-01 ~ 2100-01-01，异常值不采信
    if (serverMs < 946684800000 || serverMs > 4102444800000) return;
    // 网络往返过大时中点估算不可信，放弃本次校准
    if (end - start > 5000) return;
    // 时间戳对应请求往返中点时刻
    serverClockOffset = serverMs - (start + end) / 2;
    lastNtpSync = end;
    console.log('Server clock offset synced:', Math.round(serverClockOffset), 'ms, rtt:', end - start, 'ms');
  } catch (error) {
    console.error('Failed to sync server time:', error.message);
  }
}

// 横波到达的唯一权威算法：
//   发震时刻（数据源时区，绝对时间戳）+ 震源距 / 横波速度 = 横波理论到达时刻
//   倒计时 = 到达时刻 - 当前时刻（经服务器校时）
// 而不是从“预警发出/收到”才开始计时——预警发出前横波已经在传播
function computeSWaveArrival(eew, distance, source) {
  const sWaveSpeed = Number(settings.get('sWaveSpeed', 4)) || 4;
  const offsetHours = SOURCE_UTC_OFFSET[source] ?? 8;
  const originMs = geo.parseSourceTime(eew.OriginTime ?? eew.origin_time, offsetHours);
  const depth = intensityLib.getEventDepth(eew);
  const surfaceDistance = Number(distance) || 0;
  const hypoDistance = geo.calcHypocentralDistance(depth, surfaceDistance);
  const travelSeconds = hypoDistance / sWaveSpeed;
  const originValid = !Number.isNaN(originMs);
  const arrivalMs = originValid ? originMs + travelSeconds * 1000 : NaN;
  const remainingMs = originValid ? Math.max(0, arrivalMs - getCorrectedNow()) : 0;
  return {
    originMs,
    depth,
    hypoDistance,
    travelSeconds,
    arrivalMs,
    remainingMs,
    sWaveSeconds: Math.max(0, Math.ceil(remainingMs / 1000))
  };
}

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

function restoreFromLAFile() {
  if (!fs.existsSync(laFilePath)) return;
  try {
    const content = fs.readFileSync(laFilePath, 'utf-8');
    const lines = content.split('\n');

    if (lines.length >= 2 && lines[0] === 'LAQUAKE_DATA_V1') {
      const jsonData = JSON.parse(lines.slice(1).join('\n'));
      if (jsonData.isActivated && jsonData.settings) {
        settings.save(jsonData.settings);

        const userLat = parseFloat(jsonData.settings.userLatitude) || 30.67;
        const userLon = parseFloat(jsonData.settings.userLongitude) || 104.07;
        store.loadFromLAFile(userLat, userLon);
      }
    }
  } catch (error) {
    console.error('Failed to restore from LA file:', error.message);
  }
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
  if (ntpSyncTimer) clearInterval(ntpSyncTimer);
  testSimTimers.forEach(timer => clearTimeout(timer));
  testSimTimers.clear();
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
    eew._source = source;
    const eventId = eew.EventID;
    const serial = eew.Serial || eew.ReportNum || 0;
    const now = Date.now();
    
    const originTime = geo.parseSourceTime(eew.OriginTime, SOURCE_UTC_OFFSET[source] ?? 8);
    if (Number.isNaN(originTime)) {
      console.log(`EEW [${source}]: Invalid OriginTime:`, eew.OriginTime);
      return;
    }
    
    const timeSinceOrigin = now - originTime;
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
            handleEEWAlert(eew, localIntensity, source);
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
          playNamedSound('newrecord');
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
// 速报专用模板：地震已发生，不含倒计时（{TIME} 无意义），文案明确为"速报"
const DEFAULT_EQ_PUSH_JSON = '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "地震速报：{FZSK}{ZZMC}发生{ZHENJI}级地震，预估本地烈度{YGLD}度，震中距{ZZJ}km。预估有{YHCD}，请遵循{BXJY}。来自中国地震预警网。",\n  "level": "timeSensitive",\n  "sound": "minuet",\n  "volume": 10\n}';
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
  // 推送中的“横波将于 X 秒后到达”同样要扣除发震至今已经过去的时间
  const wave = computeSWaveArrival(eew, distance, eew._source || 'cenc');
  const time = Number.isFinite(wave.arrivalMs)
    ? wave.sWaveSeconds
    : Math.max(0, Math.floor(distance / settings.get('sWaveSpeed', 4)));

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

async function sendPushNotification(vars, type = 'eew') {
  const mode = settings.get('pushMode', 'simple') === 'pro' ? 'pro' : 'simple';
  let url = '';
  let payload;

  if (mode === 'pro') {
    url = (settings.get('pushUrl', '') || '').trim().replace(/\/+$/, '');
    if (!url) return;
    // 预警与速报使用各自的模板：速报绝不能套用预警文案（紧急地震预警 + 倒计时）
    const isEq = type === 'eq';
    const defaultTpl = isEq ? DEFAULT_EQ_PUSH_JSON : DEFAULT_PUSH_JSON;
    const settingKey = isEq ? 'eqPushJsonTemplate' : 'pushJsonTemplate';
    let template;
    try {
      template = JSON.parse(settings.get(settingKey, defaultTpl) || defaultTpl);
    } catch (error) {
      template = JSON.parse(defaultTpl);
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
    await sendPushNotification(vars, 'eew');
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
    await sendPushNotification(vars, 'eq');
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

function handleEEWAlert(eew, localIntensity, source) {
  const epicenterIntensity = eew._epicenterIntensity !== undefined && eew._epicenterIntensity !== null
    ? Number(eew._epicenterIntensity)
    : (intensityLib.parseShindo(eew.MaxIntensity ?? eew.max_intensity) ?? 0);

  const waveSource = source || eew._source || 'cenc';
  sendEEWPost(eew, localIntensity);

  const userLat = settings.get('userLatitude', 30.67);
  const userLon = settings.get('userLongitude', 104.07);
  const epicenterLat = eew.Latitude ?? eew.latitude;
  const epicenterLon = eew.Longitude ?? eew.longitude;

  let distance = 0;
  if (isValidLatLon(epicenterLat, epicenterLon)) {
    distance = geo.calculateDistance(userLat, userLon, epicenterLat, epicenterLon);
  }

  // 发震时刻 + 震源距/横波速度 = 理论到达时刻；展示前已过去的时间自然被扣掉
  const wave = computeSWaveArrival(eew, distance, waveSource);
  if (Number.isNaN(wave.originMs)) {
    console.log('EEW alert: invalid origin time, countdown forced to 0:', eew.OriginTime);
  } else {
    console.log(`EEW alert [${waveSource}]: hypocenter distance ${wave.hypoDistance.toFixed(1)}km,`,
      'travel', wave.travelSeconds.toFixed(1) + 's,',
      'elapsed', ((getCorrectedNow() - wave.originMs) / 1000).toFixed(1) + 's,',
      'remaining', wave.sWaveSeconds + 's');
  }

  const isCritical = epicenterIntensity >= 6;

  triggerAlertWindow(eew, localIntensity, distance, wave.sWaveSeconds, wave.arrivalMs, isCritical);
  playNamedSound(isCritical ? 'critical' : 'alert');
}

function playSoundInWindow(win, filePath) {
  if (!win || win.isDestroyed() || !filePath) return;
  let fileUrl;
  try {
    fileUrl = pathToFileURL(filePath).href;
  } catch (error) {
    return;
  }
  // 自包含代码片段，不依赖渲染层的全局函数；JSON.stringify 保证路径安全内嵌
  const snippet =
    '(function(){try{' +
    'var a=new Audio(' + JSON.stringify(fileUrl) + ');' +
    'a.volume=1;' +
    'a.play().catch(function(e){console.error("Failed to play sound:",e&&e.message);});' +
    '}catch(e){console.error("Error playing sound:",e&&e.message);}})();void 0;';
  win.webContents.executeJavaScript(snippet).catch(() => {});
}

// 所有真实事件音效的统一入口（预警、横波到达、摇晃提示、新速报）
function playNamedSound(soundName, options) {
  const force = !!(options && options.force);
  if (!force && settings.get('soundEnabled', true) === false) return;
  const filePath = sound.getSoundFilePath(soundName);
  if (!filePath || !fs.existsSync(filePath)) return;
  playSoundInWindow(mainWindow, filePath);
}

function triggerAlertWindow(eew, localIntensity, distance, sWaveSeconds, arrivalMs, isCritical) {
  const currentSerial = currentEEW ? (currentEEW.Serial || currentEEW.ReportNum || 0) : 0;
  const newSerial = eew.Serial || eew.ReportNum || 0;

  if (currentEEW && currentEEW.EventID === eew.EventID && currentSerial >= newSerial &&
      alertWindow && !alertWindow.isDestroyed() && alertWindow.isVisible()) {
    return;
  }

  currentEEW = eew;
  sWaveArrived = false;

  // 给渲染层的到达时刻换算到本机时钟轴（渲染层直接用 Date.now() 与之比较），
  // 使客户端时钟偏差的修正在两端保持一致
  const arrivalTimestamp = Number.isFinite(arrivalMs) ? arrivalMs - serverClockOffset : null;

  showAlertWindow({
    eew,
    localIntensity,
    distance,
    sWaveSeconds,
    arrivalTimestamp,
    isCritical,
    yhcd: intensityLib.getShakeDegree(localIntensity),
    bxjy: intensityLib.getAvoidanceAdvice(localIntensity)
  });

  if (sWaveTimer) clearInterval(sWaveTimer);
  sWaveTimer = null;

  // 展示时横波尚未到达才需要定时器：到“理论到达时刻”那一刻触发到达音效与提示
  if (Number.isFinite(arrivalMs) && sWaveSeconds > 0) {
    sWaveTimer = setInterval(() => {
      if (sWaveArrived) return;
      if (getCorrectedNow() >= arrivalMs) {
        sWaveArrived = true;
        clearInterval(sWaveTimer);
        sWaveTimer = null;
        playNamedSound('swave');

        setTimeout(() => {
          const intensityLevel = getIntensityLevel(localIntensity);
          if (intensityLevel) playNamedSound(intensityLevel);
        }, 2000);

        if (alertWindow && !alertWindow.isDestroyed()) {
          alertWindow.webContents.send('alertWaveArrived');
        }
      }
    }, 500);
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
    Serial: testData.ReportNum,
    _source: 'cenc'
  };
  
  const now = Date.now();
  
  const originTime = geo.parseSourceTime(eew.OriginTime, SOURCE_UTC_OFFSET.cenc);
  if (Number.isNaN(originTime)) {
    console.log('Test EEW: Invalid OriginTime:', eew.OriginTime);
    return;
  }
  
  const timeSinceOrigin = now - originTime;
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
          
          handleEEWAlert(eew, localIntensity, 'cenc');
        }
      }
    }
  }
});

// ===== 模拟预警 JSON 导入导出 / 要石(kanameishi)多报时序模拟 =====
const testSimTimers = new Set();

// 按数据源 UTC 偏移生成对应的“墙上时间”字符串（不依赖本机时区），
// 与 geo.parseSourceTime 的解析严格互逆
function formatSourceWallTime(timestamp, utcOffsetHours) {
  const d = new Date(timestamp + Number(utcOffsetHours) * 3600000);
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

function isAutoIntensityValue(value) {
  if (value === null || value === undefined || value === '') return true;
  const text = String(value).trim();
  return text === '自动' || /^auto$/i.test(text);
}

// 把要石标准 forms 中的一报构造成内部 EEW 对象
function buildSimEEW(form, index, eventId, source, originStr, reportStr) {
  const eew = {
    EventID: eventId,
    Serial: index + 1,
    ReportNum: index + 1,
    OriginTime: originStr,
    ReportTime: reportStr,
    Depth: form.depth === null || form.depth === undefined || form.depth === '' ? 10 : Number(form.depth),
    isWarn: !!form.isWarn,
    isAssumption: !!form.isAssumption,
    _source: source
  };

  const magnitude = parseFloat(form.magnitude);
  const lat = Number(form.lat);
  const lng = Number(form.lng);
  const intensityAuto = isAutoIntensityValue(form.maxIntensity);

  if (source === 'jma') {
    eew.Hypocenter = String(form.hypocenter || '');
    eew.Magunitude = magnitude;
    if (!intensityAuto) eew.MaxIntensity = form.maxIntensity; // 如 5弱/5強/3
  } else {
    eew.HypoCenter = String(form.hypocenter || '');
    eew.Magnitude = magnitude;
    if (!intensityAuto) {
      eew.MaxIntensity = isNaN(Number(form.maxIntensity)) ? form.maxIntensity : Number(form.maxIntensity);
    }
  }
  if (isValidLatLon(lat, lng)) {
    eew.Latitude = lat;
    eew.Longitude = lng;
  }
  return eew;
}

async function dispatchSimulatedReport(eew, source) {
  const { localIntensity, epicenterIntensity, region } = evaluateEewIntensity(eew, source);
  eew._epicenterIntensity = epicenterIntensity;
  eew._intRegion = region;
  if (localIntensity < settings.get('minLocalIntensity', 0)) {
    console.log('Simulated report skipped: local intensity below threshold:', localIntensity);
    return false;
  }
  await sendEEWPost(eew, localIntensity);
  handleEEWAlert(eew, localIntensity, source);
  return true;
}

ipcMain.handle('sendTestEEWSequence', async (event, config) => {
  try {
    if (!config || !Array.isArray(config.forms) || config.forms.length === 0) {
      return { ok: false, error: 'invalid forms' };
    }
    const source = config.useShindo === true ? 'jma' : 'cenc';
    const tzOffset = SOURCE_UTC_OFFSET[source];

    const rawId = String(config.id || 'sim').replace(/[^\w-]/g, '').slice(0, 40) || 'sim';
    // 同一配置允许重复运行：每次运行独立 EventID，避免被同报序号去重逻辑拦截
    const eventId = `TEST-${rawId}-${Date.now()}`;

    const forms = config.forms
      .map(f => f || {})
      .filter(f => f.isCanceled !== true)
      .filter(f => isFinite(parseFloat(f.magnitude)))
      .sort((a, b) => (Number(a.reportDelay) || 0) - (Number(b.reportDelay) || 0));

    if (forms.length === 0) return { ok: false, error: 'no valid forms' };

    const base = Date.now();
    let scheduled = 0;
    forms.forEach((form, index) => {
      const originMs = base + (Number(form.originDelay) || 0) * 1000;
      const reportMs = base + (Number(form.reportDelay) || 0) * 1000;
      const eew = buildSimEEW(
        form, index, eventId, source,
        formatSourceWallTime(originMs, tzOffset),
        formatSourceWallTime(reportMs, tzOffset)
      );
      const delay = Math.max(0, reportMs - base);
      const timer = setTimeout(async () => {
        testSimTimers.delete(timer);
        try {
          await dispatchSimulatedReport(eew, source);
        } catch (error) {
          console.error('Simulated report dispatch error:', error);
        }
      }, delay);
      testSimTimers.add(timer);
      scheduled += 1;
    });

    console.log(`EEW simulation [${source}] scheduled ${scheduled} reports, event:`, eventId);
    return { ok: true, count: scheduled };
  } catch (error) {
    console.error('sendTestEEWSequence error:', error);
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('testEewImportFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入模拟预警 JSON',
      filters: [
        { name: 'JSON 文件', extensions: ['json'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = await fs.promises.readFile(filePath, 'utf8');
    return { canceled: false, content, fileName: path.basename(filePath) };
  } catch (error) {
    return { canceled: false, error: error.message };
  }
});

ipcMain.handle('testEewExportFile', async (event, payload) => {
  try {
    const data = payload || {};
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出模拟预警 JSON',
      defaultPath: data.suggestedName || '模拟预警.json',
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    await fs.promises.writeFile(result.filePath, data.content || '', 'utf8');
    return { canceled: false, filePath: result.filePath };
  } catch (error) {
    return { canceled: false, error: error.message };
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
  playNamedSound(soundName);
});

ipcMain.on('testSound', (event, soundName) => {
  // 显式测试：即使总开关关闭也播放，方便用户验证音效文件
  playNamedSound(soundName, { force: true });
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

const AUTO_START_REG_PATH = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const AUTO_START_REG_KEY = 'LaQuake';

function getStartupExecutablePath() {
  return app.getPath('exe');
}

function isAutoStartEnabled() {
  if (process.platform !== 'win32') return false;
  try {
    const { execFileSync } = require('child_process');
    const output = execFileSync('reg', ['query', AUTO_START_REG_PATH, '/v', AUTO_START_REG_KEY], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    });
    return output.includes(AUTO_START_REG_KEY);
  } catch (error) {
    return false;
  }
}

function setAutoStartRegistry(enable) {
  if (process.platform !== 'win32') return false;
  const { execFileSync } = require('child_process');
  try {
    if (enable) {
      execFileSync('reg', ['add', AUTO_START_REG_PATH, '/v', AUTO_START_REG_KEY, '/t', 'REG_SZ', '/d', getStartupExecutablePath(), '/f'], {
        stdio: 'ignore',
        windowsHide: true
      });
      return isAutoStartEnabled();
    } else {
      if (!isAutoStartEnabled()) return true;
      execFileSync('reg', ['delete', AUTO_START_REG_PATH, '/v', AUTO_START_REG_KEY, '/f'], {
        stdio: 'ignore',
        windowsHide: true
      });
      return !isAutoStartEnabled();
    }
  } catch (error) {
    try {
      fs.appendFileSync(errorLogPath, `${new Date().toISOString()} setAutoStart error: ${error.stack}\n`);
    } catch (logError) {}
    return false;
  }
}

// 启动时按设置同步注册表：修正旧版本写入的临时路径，并清理失效的自启项
function syncAutoStart(enabled) {
  if (process.platform !== 'win32') return;
  try {
    if (enabled) {
      setAutoStartRegistry(true);
    } else if (isAutoStartEnabled()) {
      setAutoStartRegistry(false);
    }
  } catch (error) {
    try {
      fs.appendFileSync(errorLogPath, `${new Date().toISOString()} syncAutoStart error: ${error.stack}\n`);
    } catch (logError) {}
  }
}

ipcMain.on('setAutoStart', (event, enable) => {
  event.returnValue = setAutoStartRegistry(!!enable);
});

ipcMain.on('checkAutoStart', (event) => {
  event.returnValue = isAutoStartEnabled();
});

const GEO_PROVIDERS = [
  {
    name: 'ip-api',
    async locate() {
      const { data } = await axios.get('http://ip-api.com/json/', {
        params: { lang: 'zh-CN', fields: 'status,message,country,regionName,city,lat,lon' },
        timeout: 8000
      });
      if (!data || data.status !== 'success' || !isValidLatLon(data.lat, data.lon)) {
        throw new Error(data && data.message ? data.message : 'ip-api locate failed');
      }
      return {
        lat: Number(data.lat),
        lon: Number(data.lon),
        label: [data.country, data.regionName, data.city].filter(Boolean).join(' ')
      };
    }
  },
  {
    name: 'ipsb',
    async locate() {
      const { data } = await axios.get('https://api.ip.sb/geoip', { timeout: 8000 });
      if (!data || !isValidLatLon(data.latitude, data.longitude)) {
        throw new Error('ip.sb locate failed');
      }
      return {
        lat: Number(data.latitude),
        lon: Number(data.longitude),
        label: [data.country, data.region, data.city].filter(Boolean).join(' ')
      };
    }
  },
  {
    name: 'ipinfo',
    async locate() {
      const { data } = await axios.get('https://ipinfo.io/json', { timeout: 8000 });
      const parts = String((data && data.loc) || '').split(',');
      const lat = parseFloat(parts[0]);
      const lon = parseFloat(parts[1]);
      if (!isValidLatLon(lat, lon)) {
        throw new Error(data && data.error ? data.error.message : 'ipinfo locate failed');
      }
      return {
        lat,
        lon,
        label: [data.country, data.region, data.city].filter(Boolean).join(' ')
      };
    }
  },
  {
    name: 'ipapi',
    async locate() {
      const { data } = await axios.get('https://ipapi.co/json/', { timeout: 8000 });
      if (!data || !isValidLatLon(data.latitude, data.longitude)) {
        throw new Error(data && data.reason ? data.reason : 'ipapi locate failed');
      }
      return {
        lat: Number(data.latitude),
        lon: Number(data.longitude),
        label: [data.country_name, data.region, data.city].filter(Boolean).join(' ')
      };
    }
  }
];

async function fetchGeolocation() {
  let lastError = null;
  for (const provider of GEO_PROVIDERS) {
    try {
      const location = await provider.locate();
      console.log(`Geolocation via ${provider.name}:`, location.lat, location.lon, location.label);
      return location;
    } catch (error) {
      console.error(`Geolocation provider ${provider.name} failed:`, error.message);
      lastError = error;
    }
  }
  throw lastError || new Error('All geolocation providers failed');
}

ipcMain.handle('autoLocate', async () => {
  try {
    const location = await fetchGeolocation();
    return { ok: true, lat: location.lat, lon: location.lon, label: location.label };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

async function applyAutoLocateOnStartup() {
  try {
    const location = await fetchGeolocation();
    settings.save({ userLatitude: location.lat, userLongitude: location.lon });
    if (fs.existsSync(laFilePath)) {
      store.saveToLAFileSync(settings.getAll());
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('autoLocated', {
        lat: location.lat,
        lon: location.lon,
        label: location.label
      });
    }
  } catch (error) {
    console.error('Startup auto locate failed:', error.message);
  }
}

app.whenReady().then(() => {
  if (UNINSTALL_MODE) return;
  try {
    store.init();
    const currentSettings = settings.load();

    // Load language from settings
    const lang = currentSettings.language || 'zh-CN';
    loadLanguage(lang);

    sound.init();
    // init 只注册默认音效，用户在设置中自定义的路径必须在启动时同步进来，
    // 否则真实预警经 SoundManager 取路径会拿到空字符串（设置页测试按钮直接读
    // settings，所以不受影响——这正是“测试能响、预警不响”的原因之一）
    sound.updateFromSettings(currentSettings);

    // 按设置同步开机自启注册表，并清理失效的自启项
    syncAutoStart(currentSettings.autoStart === true);

    restoreFromLAFile();

    createWindow();
    startPolling();
    // 并行校准服务器时钟：首屏加载不弹预警，正常情况下第二次轮询前即可校准完成；
    // 校时失败也不影响预警获取（offset 保持 0，退化为本机时钟）
    syncServerTime();
    ntpSyncTimer = setInterval(syncServerTime, 5 * 60 * 1000);

    // 开启自动定位时，后台获取经纬度并更新设置（失败则保留原坐标）
    if (currentSettings.autoLocate === true) {
      applyAutoLocateOnStartup();
    }

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
  if (UNINSTALL_MODE) return;
  isQuitting = true;
  cleanup();
});
