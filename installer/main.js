const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, execFile, execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const rawFs = require('original-fs');
const rawFsp = rawFs.promises;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (wizardWindow) {
      try {
        if (wizardWindow.isMinimized()) wizardWindow.restore();
        wizardWindow.show();
        wizardWindow.focus();
      } catch (error) {}
    }
  });
}

let wizardWindow = null;
let installRunning = false;

const resourcesRoot = app.isPackaged ? process.resourcesPath : __dirname;
const payloadDir = path.join(resourcesRoot, 'payload');
const i18nDir = path.join(resourcesRoot, 'i18n');
const assetsDir = path.join(resourcesRoot, 'assets');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'LaQuake';
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LaQuake';

// 程序在用户所选目录下创建的专属子目录名
const APP_DIR_NAME = 'LaQuake';
// 卸载清单：记录安装时释放的全部相对路径，卸载时只删清单内文件
const MANIFEST_NAME = 'install-manifest.json';

const DEFAULT_SETTINGS = {
  language: 'zh-CN',
  eewSource: 'cenc',
  eewCWA: false,
  eqSource: 'cenc',
  eewPollInterval: 1000,
  eewCount: 10,
  eqPollInterval: 5000,
  eqCount: 20,
  requestTimeout: 30000,
  pushMode: 'simple',
  barkUrl: 'https://api.day.app/push',
  barkDeviceKey: '',
  pushUrl: '',
  pushJsonTemplate: '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "紧急地震预警！{FZSK}{ZZMC}发生{ZHENJI}级地震。预估本地烈度{YGLD}度，横波将于{TIME}秒后到达。预估有{YHCD}，请遵循{BXJY}.来自中国地震预警网。",\n  "level": "critical",\n  "sound": "alarm",\n  "volume": 10\n}',
  eewPostUrl: '',
  eqPostUrl: '',
  minLocalIntensity: 0,
  minEpicenterIntensity: 0,
  minEQIntensity: 0,
  strongShakeIntensity: 5,
  criticalIntensity: 1,
  userLatitude: 30.67,
  userLongitude: 104.07,
  autoLocate: false,
  pWaveSpeed: 7,
  sWaveSpeed: 4,
  earthRadius: 6371,
  soundAlert: 'Media/eewalert.wav',
  soundCritical: 'Media/eewcritical.wav',
  soundUpdate: 'Media/eewupdate.wav',
  soundSWave: 'Media/swavearrive.wav',
  soundNewRecord: 'Media/newrecord.wav',
  soundWeakShake: 'Media/weakshake.wav',
  soundMidShake: 'Media/midshake.wav',
  soundStrongShake: 'Media/strongshake.wav',
  autoStart: false,
  soundEnabled: true,
  enableLogging: false,
  minimizeToTray: true,
  titleBarStyle: 'windows',
  floatingNav: false,
  windowSize: { width: 800, height: 600 }
};

const EEWCN_SOUND_MAP = {
  soundAlert: 'C:\\Program Files\\eewcn\\Media\\eewalert.wav',
  soundCritical: 'C:\\Program Files\\eewcn\\Media\\eewcritical.wav',
  soundUpdate: 'C:\\Program Files\\eewcn\\Media\\eewupdate.wav',
  soundSWave: 'C:\\Program Files\\eewcn\\Media\\swavearrive.wav',
  soundNewRecord: 'C:\\Program Files\\eewcn\\Media\\newrecord.wav',
  soundWeakShake: 'C:\\Program Files\\eewcn\\Media\\weakshake.wav',
  soundMidShake: 'C:\\Program Files\\eewcn\\Media\\midshake.wav',
  soundStrongShake: 'C:\\Program Files\\eewcn\\Media\\strongshake.wav'
};

const GEO_PROVIDERS = [
  async () => {
    const u = new URL('http://ip-api.com/json/');
    u.searchParams.set('lang', 'zh-CN');
    u.searchParams.set('fields', 'status,message,country,regionName,city,lat,lon');
    const res = await fetch(u, { signal: AbortSignal.timeout(8000) });
    const d = await res.json();
    if (!d || d.status !== 'success' || isNaN(d.lat) || isNaN(d.lon)) {
      throw new Error((d && d.message) || 'ip-api failed');
    }
    return { lat: Number(d.lat), lon: Number(d.lon), label: [d.country, d.regionName, d.city].filter(Boolean).join(' ') };
  },
  async () => {
    const res = await fetch('https://api.ip.sb/geoip', { signal: AbortSignal.timeout(8000) });
    const d = await res.json();
    if (!d || isNaN(d.latitude) || isNaN(d.longitude)) throw new Error('ip.sb failed');
    return { lat: Number(d.latitude), lon: Number(d.longitude), label: [d.country, d.region, d.city].filter(Boolean).join(' ') };
  },
  async () => {
    const res = await fetch('https://ipinfo.io/json', { signal: AbortSignal.timeout(8000) });
    const d = await res.json();
    const parts = String((d && d.loc) || '').split(',');
    const lat = parseFloat(parts[0]);
    const lon = parseFloat(parts[1]);
    if (isNaN(lat) || isNaN(lon)) throw new Error((d && d.error && d.error.message) || 'ipinfo failed');
    return { lat, lon, label: [d.country, d.region, d.city].filter(Boolean).join(' ') };
  },
  async () => {
    const res = await fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(8000) });
    const d = await res.json();
    if (!d || isNaN(d.latitude) || isNaN(d.longitude)) throw new Error((d && d.reason) || 'ipapi failed');
    return { lat: Number(d.latitude), lon: Number(d.longitude), label: [d.country_name, d.region, d.city].filter(Boolean).join(' ') };
  }
];

ipcMain.on('win-minimize', () => {
  if (wizardWindow && !wizardWindow.isDestroyed()) wizardWindow.minimize();
});

ipcMain.on('win-close', () => {
  if (wizardWindow && !wizardWindow.isDestroyed() && !installRunning) wizardWindow.close();
});

ipcMain.handle('pick-dir', async (event, currentPath) => {
  const result = await dialog.showOpenDialog(wizardWindow, {
    title: '选择安装目录',
    defaultPath: currentPath || undefined,
    properties: ['openDirectory', 'createDirectory']
  });
  if (result.canceled || !result.filePaths.length) return { ok: false };
  return { ok: true, path: result.filePaths[0] };
});

// 把用户选择的父目录解析为真实安装目录：所选目录下新建 LaQuake 子目录；
// 若所选目录本身就叫 LaQuake（如默认建议路径或用户手动指定），直接使用，避免双层嵌套。
ipcMain.handle('resolve-install-dir', async (event, chosenPath) => {
  try {
    const base = path.resolve(String(chosenPath || ''));
    validateInstallDir(base);
    const finalDir = path.basename(base).toLowerCase() === APP_DIR_NAME.toLowerCase()
      ? base
      : path.join(base, APP_DIR_NAME);
    return { ok: true, path: finalDir };
  } catch (error) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle('load-translations', async (event, lang) => {
  const tryLoad = async (l) => JSON.parse(await fs.promises.readFile(path.join(i18nDir, `${l}.json`), 'utf8'));
  try {
    return await tryLoad(lang);
  } catch (error) {
    try {
      return await tryLoad('zh-CN');
    } catch (fallbackError) {
      return {};
    }
  }
});

ipcMain.handle('auto-locate', async () => {
  let lastError = null;
  for (const provider of GEO_PROVIDERS) {
    try {
      const location = await provider();
      return { ok: true, ...location };
    } catch (error) {
      lastError = error;
    }
  }
  return { ok: false, error: lastError ? lastError.message : 'locate failed' };
});

ipcMain.handle('get-context', async () => {
  const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
  const defaultInstallDir = path.join(localAppData, 'Programs', 'LaQuake');
  let payloadSize = 0;
  let payloadReady = false;
  try {
    const files = await walkFiles(payloadDir);
    payloadSize = files.reduce((sum, f) => sum + f.size, 0);
    payloadReady = files.length > 0;
  } catch (error) {
    payloadReady = false;
  }
  let existingSettings = null;
  try {
    const raw = await fs.promises.readFile(path.join(app.getPath('appData'), 'LaQuake', 'settings.json'), 'utf8');
    existingSettings = JSON.parse(raw);
  } catch (error) {
    existingSettings = null;
  }

  // 检测是否已安装：读取卸载注册表项，版本更高且旧 exe 仍在 => 升级；版本相同且目录完好 => 覆盖/修复安装
  let upgradeInfo = null;
  try {
    const oldVersion = regQueryValue(UNINSTALL_KEY, 'DisplayVersion');
    const oldInstallDir = regQueryValue(UNINSTALL_KEY, 'InstallLocation');
    if (oldVersion && oldInstallDir && fs.existsSync(path.join(oldInstallDir, 'LaQuake.exe'))) {
      const cmp = compareVersions(app.getVersion(), oldVersion);
      upgradeInfo = {
        oldVersion,
        newVersion: app.getVersion(),
        installDir: oldInstallDir,
        isUpgrade: cmp > 0,
        sameVersion: cmp === 0
      };
    }
  } catch (error) {
    upgradeInfo = null;
  }

  return {
    version: app.getVersion(),
    defaultInstallDir,
    payloadSize,
    payloadReady,
    existingSettings,
    upgradeInfo,
    brandingPath: pathToFileURL(path.join(assetsDir, 'laquake.png')).toString()
  };
});

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

async function walkFiles(root) {
  const out = [];
  async function walk(dir, rel) {
    const entries = await rawFsp.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      const r = rel ? path.join(rel, ent.name) : ent.name;
      if (ent.isDirectory()) {
        await walk(abs, r);
      } else if (ent.isFile()) {
        const st = await rawFsp.stat(abs);
        out.push({ src: abs, rel: r, size: st.size });
      }
    }
  }
  await walk(root, '');
  return out;
}

function validateInstallDir(p) {
  if (!/^[A-Za-z]:[\\/]/.test(p)) throw new Error('安装目录必须是有效的本地磁盘路径');
  if (path.parse(p).root === p) throw new Error('不能将磁盘根目录作为安装目录');
  if (/[<>"|?*]/.test(p)) throw new Error('安装目录包含非法字符');
}

// 由载荷相对路径推导全部相对目录（深的在前，卸载时按此顺序回收空目录）
function buildManifest(payloadRels) {
  const files = payloadRels.map((r) => r.split('/').join('\\'));
  const dirSet = new Set();
  for (const rel of files) {
    let dir = path.dirname(rel);
    while (dir && dir !== '.') {
      if (dirSet.has(dir)) break;
      dirSet.add(dir);
      dir = path.dirname(dir);
    }
  }
  const dirs = Array.from(dirSet).sort((a, b) => b.length - a.length);
  return { version: 1, files, dirs };
}

async function ensureFreeSpace(targetDir, needBytes) {
  const match = /^([A-Za-z]:)/.exec(targetDir);
  if (!match) return;
  try {
    const st = await fs.promises.statfs(`${match[1]}\\`);
    if (st.bavail * st.bsize < needBytes) {
      throw new Error('目标磁盘剩余空间不足，请更换安装目录');
    }
  } catch (error) {
    if (/空间不足/.test(error.message)) throw error;
  }
}

async function copyFileWithRetry(src, dest, retries = 3) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      await rawFsp.copyFile(src, dest);
      return;
    } catch (error) {
      lastError = error;
      if (attempt === retries || !['ENOENT', 'EPERM', 'EACCES', 'EBUSY'].includes(error.code)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 600));
    }
  }
  throw lastError;
}

function createTransaction() {
  const undoStack = [];
  return {
    add(undoFn) { undoStack.push(undoFn); },
    async rollback() {
      const failures = [];
      while (undoStack.length) {
        const fn = undoStack.pop();
        try { await fn(); } catch (e) { failures.push(e.message); }
      }
      return failures;
    }
  };
}

class InstallCancelled extends Error {
  constructor() {
    super('用户取消了安装');
    this.name = 'InstallCancelled';
  }
}

let cancelRequested = false;
ipcMain.on('cancel-install', () => { cancelRequested = true; });

let regDecoder = null;
function getRegDecoder() {
  if (regDecoder) return regDecoder;
  let label = 'gbk';
  try {
    const cpInfo = execFileSync('cmd.exe', ['/c', 'chcp'], { encoding: 'utf8', windowsHide: true });
    const cp = (cpInfo.match(/(\d{3,5})/) || [])[1];
    if (cp === '65001') label = 'utf8';
    else if (cp && cp !== '936') label = `windows-${cp}`;
  } catch (error) {}
  // reg.exe 按系统 OEM 代码页（中文系统为 GBK）输出，按 utf8 读含中文的安装路径会乱码
  regDecoder = new TextDecoder(label);
  return regDecoder;
}

function regQueryValue(key, valueName) {
  try {
    const buf = execFileSync('reg.exe', ['query', key, '/v', valueName], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    });
    const out = getRegDecoder().decode(buf);
    const line = out.split('\r\n').find((l) => l.includes(valueName));
    if (!line) return null;
    const parts = line.trim().split(/\s{2,}/);
    return parts.length >= 3 ? parts[parts.length - 1] : null;
  } catch (error) {
    return null;
  }
}

function regDeleteKey(key) {
  try {
    execFileSync('reg.exe', ['delete', key, '/f'], { stdio: 'ignore', windowsHide: true });
  } catch (error) {}
}

function regDeleteValue(key, valueName) {
  try {
    execFileSync('reg.exe', ['delete', key, '/v', valueName, '/f'], { stdio: 'ignore', windowsHide: true });
  } catch (error) {}
}

function psEscape(s) {
  return String(s).replace(/'/g, "''");
}

function createShortcut(lnkPath, targetPath, workDir) {
  const cmd = [
    '$w=New-Object -ComObject WScript.Shell',
    `$s=$w.CreateShortcut('${psEscape(lnkPath)}')`,
    `$s.TargetPath='${psEscape(targetPath)}'`,
    `$s.WorkingDirectory='${psEscape(workDir)}'`,
    `$s.IconLocation='${psEscape(targetPath)},0'`,
    '$s.Save()'
  ].join(';');
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd], { windowsHide: true }, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function regAdd(key, valueName, type, data) {
  execFileSync('reg.exe', ['add', key, '/v', valueName, '/t', type, '/d', data, '/f'], {
    stdio: 'ignore',
    windowsHide: true
  });
}

function regAddDword(key, valueName, data) {
  execFileSync('reg.exe', ['add', key, '/v', valueName, '/t', 'REG_DWORD', '/d', String(data), '/f'], {
    stdio: 'ignore',
    windowsHide: true
  });
}

ipcMain.handle('start-install', async (event, config) => {
  if (installRunning) return { ok: false, error: '安装已在进行中' };
  const send = (payload) => event.sender.send('install-progress', payload);
  installRunning = true;
  cancelRequested = false;

  let installDir = null;
  let backupRoot = null;
  let backupCounter = 0;
  const tx = createTransaction();

  const backupFile = async (filePath) => {
    const backupPath = path.join(backupRoot, `f${backupCounter}.bak`);
    backupCounter += 1;
    await rawFsp.copyFile(filePath, backupPath);
    return backupPath;
  };

  const stageFile = async (src, dest) => {
    if (cancelRequested) throw new InstallCancelled();
    const destExisted = rawFs.existsSync(dest);
    let backupPath = null;
    if (destExisted) backupPath = await backupFile(dest);
    await copyFileWithRetry(src, dest);
    tx.add(async () => {
      if (backupPath) {
        await rawFsp.copyFile(backupPath, dest);
      } else {
        await rawFsp.unlink(dest).catch(() => {});
      }
    });
  };

  try {
    installDir = path.resolve(String(config.installDir || ''));
    validateInstallDir(installDir);

    send({ phase: 'prepare', percent: 0 });

    backupRoot = path.join(app.getPath('temp'), `laquake-rollback-${Date.now()}`);
    await fs.promises.mkdir(backupRoot, { recursive: true });

    try {
      execFileSync('taskkill.exe', ['/im', 'LaQuake.exe', '/f'], { stdio: 'ignore', windowsHide: true });
    } catch (error) {}

    const madeDirs = [];
    const ensureDirTracked = async (target) => {
      if (rawFs.existsSync(target)) return;
      await rawFsp.mkdir(target, { recursive: true });
      madeDirs.push(target);
    };

    const payloadFiles = await walkFiles(payloadDir);
    if (!payloadFiles.length) throw new Error('安装载荷缺失或为空，请使用完整的安装程序');
    const totalBytes = payloadFiles.reduce((sum, f) => sum + f.size, 0);
    await ensureFreeSpace(installDir, totalBytes);

    send({ phase: 'copy', percent: 0, file: '' });
    let doneBytes = 0;
    await ensureDirTracked(installDir);
    for (const f of payloadFiles) {
      if (cancelRequested) throw new InstallCancelled();
      const dest = path.join(installDir, f.rel);
      await ensureDirTracked(path.dirname(dest));
      try {
        await stageFile(f.src, dest);
      } catch (error) {
        if (error.code === 'ENOENT') {
          throw new Error(`安装载荷文件缺失：${f.rel}，请确认安装程序完整、未被安全软件拦截后重试`);
        }
        throw error;
      }
      doneBytes += f.size;
      send({ phase: 'copy', percent: Math.round((doneBytes / totalBytes) * 100), file: f.rel });
    }

    // 无论目录是否新建，都登记空目录回收（rmdir 仅删除空目录，内含用户文件时自动保留）
    tx.add(async () => {
      for (let i = madeDirs.length - 1; i >= 0; i -= 1) {
        await fs.promises.rmdir(madeDirs[i]).catch(() => {});
      }
    });

    // 写入卸载清单：仅记录程序释放的文件/目录，卸载时据此精确删除，
    // 用户自行放入安装目录（含 LaQuake 子目录）的个人文件一律保留
    const manifest = buildManifest(payloadFiles.map((f) => f.rel).concat(MANIFEST_NAME));
    const manifestPath = path.join(installDir, MANIFEST_NAME);
    await rawFsp.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    tx.add(async () => {
      await rawFsp.unlink(manifestPath).catch(() => {});
    });

    const exePath = path.join(installDir, 'LaQuake.exe');

    send({ phase: 'settings', percent: 0 });
    const settingsDir = path.join(app.getPath('appData'), 'LaQuake');
    const settingsFile = path.join(settingsDir, 'settings.json');
    const settingsDirExisted = fs.existsSync(settingsDir);
    const settingsExisted = fs.existsSync(settingsFile);
    let priorSettings = null;
    if (settingsExisted) {
      try {
        priorSettings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      } catch (parseError) {
        priorSettings = null;
      }
    }
    // 重复安装/升级时保留已有设置：默认值 < 旧设置 < 本次向导选择，向导未覆盖的项（阈值、声音、轮询间隔等）全部沿用
    const finalSettings = Object.assign({}, DEFAULT_SETTINGS, priorSettings || {}, config.settings || {}, {
      isActivated: true,
      appMode: config.mode,
      autoStart: !!config.autoStart,
      installedAt: new Date().toISOString()
    });
    if (config.mode === 'eewcn') Object.assign(finalSettings, EEWCN_SOUND_MAP);
    let settingsBackup = null;
    if (settingsExisted) settingsBackup = await backupFile(settingsFile);
    await fs.promises.mkdir(settingsDir, { recursive: true });
    await fs.promises.writeFile(settingsFile, JSON.stringify(finalSettings, null, 2), 'utf8');
    tx.add(async () => {
      if (settingsBackup) {
        await fs.promises.copyFile(settingsBackup, settingsFile);
      } else {
        await fs.promises.unlink(settingsFile).catch(() => {});
        if (!settingsDirExisted) {
          await fs.promises.rmdir(settingsDir).catch(() => {});
        }
      }
    });

    send({ phase: 'shortcuts', percent: 0 });
    const shortcutSpecs = [];
    if (config.desktopShortcut) shortcutSpecs.push(path.join(app.getPath('desktop'), 'LaQuake.lnk'));
    if (config.startMenuShortcut) {
      shortcutSpecs.push(path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'LaQuake.lnk'));
    }
    for (const lnk of shortcutSpecs) {
      if (cancelRequested) throw new InstallCancelled();
      const lnkExisted = fs.existsSync(lnk);
      let lnkBackup = null;
      if (lnkExisted) lnkBackup = await backupFile(lnk);
      await createShortcut(lnk, exePath, installDir);
      tx.add(async () => {
        if (lnkBackup) {
          await fs.promises.copyFile(lnkBackup, lnk);
        } else {
          await fs.promises.unlink(lnk).catch(() => {});
        }
      });
    }

    send({ phase: 'registry', percent: 0 });
    const oldRunValue = regQueryValue(RUN_KEY, RUN_VALUE);
    if (config.autoStart) {
      regAdd(RUN_KEY, RUN_VALUE, 'REG_SZ', exePath);
    } else if (oldRunValue !== null) {
      regDeleteValue(RUN_KEY, RUN_VALUE);
    }
    tx.add(async () => {
      if (oldRunValue !== null) {
        regAdd(RUN_KEY, RUN_VALUE, 'REG_SZ', oldRunValue);
      } else {
        regDeleteValue(RUN_KEY, RUN_VALUE);
      }
    });

    regAdd(UNINSTALL_KEY, 'DisplayName', 'REG_SZ', 'LaQuake');
    regAdd(UNINSTALL_KEY, 'DisplayVersion', 'REG_SZ', app.getVersion());
    regAdd(UNINSTALL_KEY, 'Publisher', 'REG_SZ', 'LaQuake');
    regAdd(UNINSTALL_KEY, 'DisplayIcon', 'REG_SZ', exePath);
    regAdd(UNINSTALL_KEY, 'InstallLocation', 'REG_SZ', installDir);
    regAdd(UNINSTALL_KEY, 'UninstallString', 'REG_SZ', `"${exePath}" --uninstall`);
    regAddDword(UNINSTALL_KEY, 'NoModify', 1);
    regAddDword(UNINSTALL_KEY, 'NoRepair', 1);
    tx.add(async () => regDeleteKey(UNINSTALL_KEY));

    send({ phase: 'done', percent: 100 });

    if (config.launchAfter) {
      try {
        spawn(exePath, [], { detached: true, stdio: 'ignore' }).unref();
      } catch (error) {}
    }

    return { ok: true };
  } catch (error) {
    const wasCancelled = error instanceof InstallCancelled;
    // 绝不整目录递归删除：事务回滚只会撤销本次释放的文件（用户文件保留），
    // 并自下而上回收本次新建、且已清空的目录
    await tx.rollback();
    if (wasCancelled) {
      send({ phase: 'cancelled', percent: 0 });
      return { ok: false, cancelled: true };
    }
    send({ phase: 'error', percent: 0, message: error.message });
    return { ok: false, error: error.message };
  } finally {
    if (backupRoot) {
      await fs.promises.rm(backupRoot, { recursive: true, force: true }).catch(() => {});
    }
    installRunning = false;
  }
});

function createWizard() {
  wizardWindow = new BrowserWindow({
    width: 820,
    height: 600,
    frame: false,
    resizable: false,
    maximizable: false,
    show: false,
    backgroundColor: '#0d1b2a',
    icon: path.join(assetsDir, 'laquake.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  wizardWindow.setMenuBarVisibility(false);
  wizardWindow.loadFile('installer.html');
  wizardWindow.once('ready-to-show', () => {
    wizardWindow.show();
  });
  wizardWindow.on('close', (event) => {
    if (installRunning) event.preventDefault();
  });
}

app.whenReady().then(createWizard);

app.on('window-all-closed', () => {
  app.quit();
});
