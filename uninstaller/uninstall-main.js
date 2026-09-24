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
let cleanupHelperPath = null;
let cleanupHelperStarted = false;
let lastPurgeData = false;

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

function listLaQuakeProcesses() {
  // 只枚举同名进程的 PID/PPID（PowerShell 在 Win7+ 均可用）
  try {
    const out = execFileSync('powershell.exe', [
      '-NoProfile', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='LaQuake.exe'\" | " +
        'Select-Object ProcessId,ParentProcessId | ConvertTo-Json -Compress'
    ], { encoding: 'utf8', windowsHide: true });
    let rows = JSON.parse(out.trim() || '[]');
    if (!Array.isArray(rows)) rows = [rows];
    return rows
      .map((row) => ({ pid: Number(row.ProcessId), ppid: Number(row.ParentProcessId) }))
      .filter((row) => Number.isInteger(row.pid));
  } catch (error) {
    return null;
  }
}

// 从 rootPid 起按 ParentProcessId 递归收集整个进程树
function collectDescendants(procs, rootPid) {
  const tree = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const proc of procs) {
      if (tree.has(proc.ppid) && !tree.has(proc.pid)) {
        tree.add(proc.pid);
        changed = true;
      }
    }
  }
  return tree;
}

function killRunningApp() {
  // 卸载器自身也是 LaQuake.exe，且 Electron 是多进程架构：GPU、渲染、网络等
  // 子进程的映像名同样是 LaQuake.exe，只是 PID 不同。旧命令
  //   taskkill /F /T /IM LaQuake.exe /FI "PID ne 主pid"
  // 只排除了主进程，会把自身的渲染/GPU 进程一起杀掉，表现为点击卸载后
  // 1~2 秒页面内容消失、只剩纯色窗口并永久卡死。
  // 正确做法：枚举同名进程，递归识别自身进程树并整体排除，只杀树外的
  // 托盘主程序（/T 连带结束它自己的 Electron 子进程）。
  const procs = listLaQuakeProcesses();
  if (!procs) {
    // 枚举失败时宁可不杀也不能按映像名盲杀（会再次误杀自身渲染/GPU 进程）；
    // 残留的托盘进程由收尾 helper 与看门狗的后续轮次处理
    return;
  }
  const selfTree = collectDescendants(procs, process.pid);
  for (const proc of procs) {
    if (selfTree.has(proc.pid)) continue;
    try {
      execFileSync('taskkill.exe', ['/F', '/T', '/PID', String(proc.pid)], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (error) {}
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

function writeCleanupHelper() {
  // 清理脚本以 ELECTRON_RUN_AS_NODE 运行：Node 原生支持 Unicode 路径，
  // 避免 .cmd 批处理被系统 OEM 代码页（GBK）解析，导致含中文的安装目录
  // 因路径乱码而被 rmdir 静默跳过。
  const helperPath = path.join(os.tmpdir(), `laquake-uninstall-${Date.now()}.js`);
  fs.copyFileSync(path.join(__dirname, 'uninstall-cleanup.js'), helperPath);
  return helperPath;
}

// 卸载步骤一成功就立即启动收尾脚本，并把本进程 PID 传给它等待。
// 不能等到用户点“完成”：成功页标题栏 X 同样可以关窗，那样收尾脚本
// 永远不会运行，表现为“显示卸载成功但文件全部残留”。
function startCleanupHelper() {
  if (cleanupHelperStarted || !cleanupHelperPath) return;
  cleanupHelperStarted = true;
  try {
    spawn(process.execPath, [
      cleanupHelperPath,
      getInstallDir(),
      getUserDataDir(),
      lastPurgeData ? '1' : '0',
      String(process.pid)
    ], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', ELECTRON_NO_ASAR: '1' }
    }).unref();
  } catch (error) {
    cleanupHelperStarted = false;
    throw error;
  }
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
      killRunningApp();
      await new Promise((r) => setTimeout(r, 600));

      send({ phase: 'shortcuts', percent: 50 });
      removeShortcuts();
      await new Promise((r) => setTimeout(r, 300));

      send({ phase: 'registry', percent: 75 });
      removeRegistry();
      await new Promise((r) => setTimeout(r, 300));

      send({ phase: 'cleanup', percent: 95 });
      lastPurgeData = purgeData;
      cleanupHelperPath = writeCleanupHelper();
      startCleanupHelper();

      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  // 收尾脚本在卸载步骤成功时已经启动，这里只需退出；
  // helper 会等待本进程 PID 退出后再开始删除
  ipcMain.on('unins-finish', () => {
    app.quit();
  });

  // 兜底：无论通过“完成”按钮、标题栏 X 还是其他方式退出，
  // 只要卸载步骤已成功但收尾脚本没启动起来，退出前补启动
  app.on('before-quit', () => {
    if (!app.isPackaged || cleanupHelperStarted || !cleanupHelperPath) return;
    try {
      startCleanupHelper();
    } catch (error) {}
  });

  app.whenReady().then(createUninstallWindow);
}

module.exports = { run };
