const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn } = require('child_process');
const { pathToFileURL } = require('url');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'LaQuake';
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LaQuake';

let uninsWindow = null;
let cleanupBatPath = null;

function getInstallDir() {
  if (app.isPackaged) return path.dirname(app.getPath('exe'));
  return path.resolve(__dirname, '..');
}

function getUserDataDir() {
  return path.join(app.getPath('appData'), 'LaQuake');
}

function getShortcutPaths() {
  return [
    path.join(app.getPath('desktop'), 'LaQuake.lnk'),
    path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'LaQuake.lnk')
  ];
}

function detectLanguage() {
  try {
    const file = path.join(getUserDataDir(), 'settings.json');
    const settings = JSON.parse(fs.readFileSync(file, 'utf8'));
    return settings.language === 'en' ? 'en' : 'zh-CN';
  } catch (error) {
    return 'zh-CN';
  }
}

function createUninstallWindow() {
  uninsWindow = new BrowserWindow({
    width: 480,
    height: 540,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#0d1b2a',
    icon: path.join(__dirname, '..', 'Media', 'LaQuake.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'uninstall-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  uninsWindow.setMenuBarVisibility(false);
  uninsWindow.loadFile(path.join(__dirname, 'uninstall.html'));
  uninsWindow.once('ready-to-show', () => uninsWindow.show());
}

function send(payload) {
  if (uninsWindow && !uninsWindow.isDestroyed()) {
    uninsWindow.webContents.send('unins-progress', payload);
  }
}

function removeShortcuts() {
  for (const lnk of getShortcutPaths()) {
    try { fs.unlinkSync(lnk); } catch (error) {}
  }
}

function removeRegistry() {
  try {
    execFileSync('reg.exe', ['delete', RUN_KEY, '/v', RUN_VALUE, '/f'], { stdio: 'ignore', windowsHide: true });
  } catch (error) {}
  try {
    execFileSync('reg.exe', ['delete', UNINSTALL_KEY, '/f'], { stdio: 'ignore', windowsHide: true });
  } catch (error) {}
}

function quote(p) {
  return '"' + String(p).replace(/"/g, '') + '"';
}

function writeCleanupBat(installDir, userDataDir, purgeData) {
  const lines = [
    '@echo off',
    'cd /d "%TEMP%"',
    'timeout /t 1 /nobreak >nul 2>nul',
    'taskkill /f /im LaQuake.exe >nul 2>nul',
    'timeout /t 1 /nobreak >nul 2>nul'
  ];
  getShortcutPaths().forEach((lnk) => {
    lines.push('del /f /q ' + quote(lnk) + ' >nul 2>nul');
  });
  lines.push('reg delete ' + quote(RUN_KEY) + ' /v ' + RUN_VALUE + ' /f >nul 2>nul');
  lines.push('reg delete ' + quote(UNINSTALL_KEY) + ' /f >nul 2>nul');
  lines.push(':laquake_retry_rmdir');
  lines.push('rmdir /s /q ' + quote(installDir) + ' >nul 2>nul');
  lines.push('if not exist ' + quote(installDir) + ' goto laquake_rmdir_done');
  lines.push('timeout /t 1 /nobreak >nul 2>nul');
  lines.push('goto laquake_retry_rmdir');
  lines.push(':laquake_rmdir_done');
  if (purgeData) {
    lines.push('rmdir /s /q ' + quote(userDataDir) + ' >nul 2>nul');
  }
  lines.push(':laquake_selfdel');
  lines.push('del /f /q "%~f0" >nul 2>nul');
  lines.push('if not exist "%~f0" goto laquake_selfdel_done');
  lines.push('ping 127.0.0.1 -n 2 >nul');
  lines.push('goto laquake_selfdel');
  lines.push(':laquake_selfdel_done');

  const batPath = path.join(os.tmpdir(), `laquake-uninstall-${Date.now()}.cmd`);
  fs.writeFileSync(batPath, lines.join('\r\n') + '\r\n', 'utf8');
  return batPath;
}

function run() {
  ipcMain.on('unins-minimize', () => {
    if (uninsWindow && !uninsWindow.isDestroyed()) uninsWindow.minimize();
  });

  ipcMain.on('unins-close', () => {
    if (uninsWindow && !uninsWindow.isDestroyed()) uninsWindow.close();
  });

  ipcMain.handle('unins-get-info', () => {
    const installDir = getInstallDir();
    const userDataDir = getUserDataDir();
    let userDataExists = false;
    try {
      userDataExists = fs.existsSync(userDataDir) &&
        fs.readdirSync(userDataDir).some((name) => !name.toLowerCase().endsWith('.log'));
    } catch (error) {}
    return {
      version: app.getVersion(),
      language: detectLanguage(),
      installDir,
      userDataDir,
      userDataExists,
      devMode: !app.isPackaged,
      brandingPath: pathToFileURL(path.join(__dirname, '..', 'Media', 'LaQuake.png')).toString()
    };
  });

  ipcMain.handle('unins-run', async (event, options) => {
    const purgeData = !!(options && options.purgeData);
    try {
      if (!app.isPackaged) {
        send({ phase: 'prepare', percent: 30 });
        await new Promise((r) => setTimeout(r, 400));
        send({ phase: 'shortcuts', percent: 60 });
        await new Promise((r) => setTimeout(r, 400));
        send({ phase: 'cleanup', percent: 100 });
        return { ok: true, devMode: true };
      }

      send({ phase: 'prepare', percent: 25 });
      await new Promise((r) => setTimeout(r, 400));

      send({ phase: 'shortcuts', percent: 50 });
      removeShortcuts();
      await new Promise((r) => setTimeout(r, 300));

      send({ phase: 'registry', percent: 75 });
      removeRegistry();
      await new Promise((r) => setTimeout(r, 300));

      send({ phase: 'cleanup', percent: 95 });
      cleanupBatPath = writeCleanupBat(getInstallDir(), getUserDataDir(), purgeData);

      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.on('unins-finish', () => {
    if (cleanupBatPath) {
      try {
        spawn('cmd.exe', ['/c', cleanupBatPath], {
          detached: true,
          stdio: 'ignore',
          windowsHide: true
        }).unref();
      } catch (error) {}
    }
    app.quit();
  });

  app.whenReady().then(createUninstallWindow);
}

module.exports = { run };
