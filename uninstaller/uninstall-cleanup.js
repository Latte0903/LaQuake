'use strict';

// 卸载收尾脚本：卸载步骤成功后由卸载器立即启动（独立 Node 进程，
// 借助 LaQuake.exe 自身的 Node 运行时），启动环境带
// ELECTRON_RUN_AS_NODE=1 与 ELECTRON_NO_ASAR=1（卸载器负责设置）。
//
// 参数：<installDir> <userDataDir> <purge:0|1> <waitPid>
//
// 为什么不用 .cmd 批处理删除：批处理被 cmd.exe 按系统 OEM 代码页（中文
// 系统为 GBK）解析，而脚本以 UTF-8 写入，安装目录一旦含中文（如
// D:\新建文件夹），rmdir 的目标路径会乱码成不存在的目录而静默跳过。
// Node 全程使用 Unicode，argv 经 CreateProcessW 传递，不存在代码页问题。
//
// 三个关键设计：
// 1) 进程启动后立刻 chdir 到 TEMP：本进程运行的 LaQuake.exe 位于安装
//    目录内，工作目录若停留在安装目录，该目录会被本进程占用，任何删除
//    手段都只能删掉内容、删不掉根目录。
// 2) 先等待卸载器窗口进程（waitPid）退出再动手：用户可能在“已卸载”
//    页面停留任意时长，点“完成”或标题栏 X 都会退出卸载器。
// 3) 严格按安装清单 install-manifest.json 删除：只删程序安装时释放的文件，
//    用户自行放进安装目录（哪怕是 LaQuake 子目录内部）的个人文件一律保留；
//    目录仅在变空后才回收。被映像锁定的自身 exe/DLL 交给 wscript 看门狗，
//    看门狗同样只删清单文件、只回收空目录。

// 即使 ELECTRON_NO_ASAR 环境变量未生效，也在进程内彻底关闭 asar 路径拦截，
// 否则删除 resources\app.asar 时会被当成虚拟目录而报 Invalid package
process.noAsar = true;

const cp = require('child_process');
const os = require('os');
const path = require('path');

let fs;
try {
  // Electron 内置的未打补丁模块，可正常枚举/删除 app.asar
  fs = require('original-fs');
} catch (error) {
  fs = require('fs');
}

const installDir = process.argv[2];
const userDataDir = process.argv[3];
const purgeData = process.argv[4] === '1';
const waitPid = Number.parseInt(process.argv[5], 10);
const selfPath = __filename;

// 与安装器 installer/main.js 中的定义保持一致
const MANIFEST_NAME = 'install-manifest.json';

// 清单缺失时（理论上仅见于极早期版本残留）的保守兜底：
// 只按确切文件名删除标准 Electron 载荷，绝不按目录递归
const LEGACY_ROOT_FILES = [
  'LaQuake.exe',
  'chrome_100_percent.pak',
  'chrome_200_percent.pak',
  'd3dcompiler_47.dll',
  'ffmpeg.dll',
  'icudtl.dat',
  'libEGL.dll',
  'libGLESv2.dll',
  'LICENSE',
  'LICENSES.chromium.html',
  'resources.pak',
  'snapshot_blob.bin',
  'v8_context_snapshot.bin',
  'version',
  'vk_swiftshader.dll',
  'vk_swiftshader_icd.json',
  'vulkan-1.dll'
];

// 第一时间离开安装目录，释放对该目录的工作目录句柄
try { process.chdir(os.tmpdir()); } catch (error) {}

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const RUN_VALUE = 'LaQuake';
const UNINSTALL_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\LaQuake';

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function exists(target) {
  try {
    return fs.existsSync(target);
  } catch (error) {
    return false;
  }
}

function isProcessAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM 表示进程存在但当前无权访问，仍视为存活
    return error.code === 'EPERM';
  }
}

// 等待卸载器窗口进程退出（用户停在完成页时不阻塞清理时序）
function waitProcessExit(pid, timeoutMs) {
  if (!isProcessAlive(pid)) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    sleep(500);
    if (!isProcessAlive(pid)) return;
  }
}

function removeEntry(target) {
  try {
    fs.unlinkSync(target);
  } catch (error) {}
}

function removeShortcuts() {
  const userProfile = process.env.USERPROFILE || '';
  const appData = process.env.APPDATA || '';
  removeEntry(path.join(userProfile, 'Desktop', 'LaQuake.lnk'));
  removeEntry(path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'LaQuake.lnk'));
}

function removeRegistry() {
  try {
    cp.execFileSync('reg.exe', ['delete', RUN_KEY, '/v', RUN_VALUE, '/f'], {
      stdio: 'ignore',
      windowsHide: true
    });
  } catch (error) {}
  try {
    cp.execFileSync('reg.exe', ['delete', UNINSTALL_KEY, '/f'], {
      stdio: 'ignore',
      windowsHide: true
    });
  } catch (error) {}
}

function listLaQuakeProcesses() {
  try {
    const out = cp.execFileSync('powershell.exe', [
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
  // 不能按映像名盲杀：Electron 的 GPU/渲染子进程同名 LaQuake.exe，旧命令
  // taskkill /F /T /IM LaQuake.exe /FI "PID ne 自己" 会误杀卸载器自身的
  // 渲染进程导致白屏卡死。枚举同名进程后排除自身整个进程树，只杀树外目标。
  // 本脚本以 RUN_AS_NODE 运行（单进程、无子进程），此时卸载器已退出，
  // 树外目标即托盘主程序，/T 连带结束它自己的 Electron 子进程。
  const procs = listLaQuakeProcesses();
  if (!procs) {
    // 枚举失败的兜底：本进程是 RUN_AS_NODE 单进程，PID 排除自己后按映像名
    // 杀不会误伤界面（没有属于自己的渲染/GPU 子进程）
    try {
      cp.execFileSync(
        'taskkill.exe',
        ['/F', '/IM', 'LaQuake.exe', '/FI', 'PID ne ' + process.pid],
        { stdio: 'ignore', windowsHide: true }
      );
    } catch (error) {}
    return;
  }
  const selfTree = collectDescendants(procs, process.pid);
  for (const proc of procs) {
    if (selfTree.has(proc.pid)) continue;
    try {
      cp.execFileSync('taskkill.exe', ['/F', '/T', '/PID', String(proc.pid)], {
        stdio: 'ignore',
        windowsHide: true
      });
    } catch (error) {}
  }
}

// 逐文件“尽力删除”：单个文件被占用时跳过而不是整体中断。
// 仅用于用户数据目录（用户明确勾选“删除设置与历史记录”的程序私有目录）。
function deleteEntryBestEffort(target) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch (error) {
    return; // 已不存在
  }
  if (stat.isDirectory()) {
    let names = [];
    try {
      names = fs.readdirSync(target);
    } catch (error) {
      return; // 目录此刻被占用，下一轮再试
    }
    for (const name of names) {
      deleteEntryBestEffort(path.join(target, name));
    }
    try { fs.rmdirSync(target); } catch (error) {}
  } else {
    try { fs.chmodSync(target, 0o666); } catch (error) {}
    try { fs.unlinkSync(target); } catch (error) {}
  }
}

function removeTree(target, rounds, delayMs) {
  if (!target) return true;
  for (let i = 0; i < rounds; i++) {
    deleteEntryBestEffort(target);
    if (!exists(target)) return true;
    sleep(delayMs);
  }
  return !exists(target);
}

function joinRel(root, rel) {
  return path.normalize(path.join(root, String(rel)));
}

// 读取安装清单，生成删除计划：{ files: 绝对路径清单文件[], dirs: 最深在前、
// 安装根目录在最后的绝对目录[] }。清单缺失时用内置白名单兜底（仍不递归）。
function buildRemovalPlan(root) {
  const fileSet = new Set();
  const dirList = [];
  const addFileRel = (rel) => { if (rel) fileSet.add(joinRel(root, rel)); };
  const addDirRel = (rel) => { if (rel) dirList.push(joinRel(root, rel)); };

  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(root, MANIFEST_NAME), 'utf8'));
  } catch (error) {
    manifest = null;
  }

  if (manifest && Array.isArray(manifest.files) && manifest.files.length) {
    for (const rel of manifest.files) addFileRel(rel);
    if (Array.isArray(manifest.dirs)) {
      for (const rel of manifest.dirs) addDirRel(rel);
    }
  } else {
    for (const name of LEGACY_ROOT_FILES) {
      const p = joinRel(root, name);
      if (exists(p)) fileSet.add(p);
    }
    addFileRel(path.join('resources', 'app.asar'));
    addFileRel(MANIFEST_NAME);
    try {
      for (const name of fs.readdirSync(joinRel(root, 'locales'))) {
        if (/\.pak$/i.test(name)) addFileRel(path.join('locales', name));
      }
    } catch (error) {}
    addDirRel('locales');
    addDirRel('resources');
  }

  const dirs = Array.from(new Set(dirList))
    .filter((d) => d.toLowerCase() !== root.toLowerCase())
    .sort((a, b) => b.length - a.length);
  dirs.push(root); // 根目录最后回收：只有完全清空（无用户文件）才成功
  return { files: Array.from(fileSet), dirs };
}

function deletePlanFiles(plan) {
  for (const file of plan.files) {
    try { fs.chmodSync(file, 0o666); } catch (error) {}
    try { fs.unlinkSync(file); } catch (error) {}
  }
}

// 只回收空目录（rmdir 不带 recursive，非空即失败），保证用户文件留存
function pruneEmptyDirs(plan) {
  for (const dir of plan.dirs) {
    try { fs.rmdirSync(dir); } catch (error) {}
  }
}

function removeInstallByPlan(root, rounds, delayMs) {
  if (!root || !exists(root)) return null;
  const plan = buildRemovalPlan(root);
  for (let i = 0; i < rounds; i++) {
    deletePlanFiles(plan);
    pruneEmptyDirs(plan);
    if (!exists(root)) break;
    sleep(delayMs);
  }
  return plan;
}

function pickWatchdogCwd() {
  // 看门狗的工作目录绝不能是安装目录（否则根目录会被看门狗自己锁住）
  const system32 = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32') : '';
  if (system32 && exists(system32)) return system32;
  return os.tmpdir();
}

function vbsQuote(s) {
  return '"' + String(s).replace(/"/g, '""') + '"';
}

function vbsArrayLiteral(arr) {
  return 'Array(' + arr.map(vbsQuote).join(',') + ')';
}

// 清单式看门狗：每轮只 DeleteFile 清单内文件（FSO 强制删除，被占用则跳过），
// 再用无 /s 的 rd 仅回收空目录；绝不递归、绝不触碰用户文件。
function spawnInstallDirWatchdog(plan) {
  if (!plan || !plan.files.length) return;
  const rounds = [3, 3, 4, 5, 7, 9, 12, 15, 20]; // 每轮等待秒数，覆盖映像释放/杀软扫描
  const system32 = pickWatchdogCwd();
  const vbsPath = path.join(os.tmpdir(),
    `laquake-uninstall-watchdog-${Date.now()}-${process.pid}.vbs`);
  const wscriptExe = process.env.SystemRoot
    ? path.join(process.env.SystemRoot, 'System32', 'wscript.exe')
    : 'wscript.exe';

  // rd 不带 /s：目录非空（含用户文件）时直接失败，天然安全
  const vbs = [
    'On Error Resume Next', // 任何语句失败（文件已删/目录非空/自删除）都不许弹模态框
    'Set sh = CreateObject("WScript.Shell")',
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'sh.CurrentDirectory = ' + vbsQuote(system32),
    'Dim files : files = ' + vbsArrayLiteral(plan.files),
    'Dim dirs : dirs = ' + vbsArrayLiteral(plan.dirs),
    'Dim waits : waits = Array(' + rounds.join(',') + ')',
    'For Each w In waits',
    '  WScript.Sleep w * 1000',
    '  For Each f In files',
    '    fso.DeleteFile f, True',
    '  Next',
    '  For Each d In dirs',
    '    sh.Run "cmd /c rd " & Chr(34) & d & Chr(34), 0, True',
    '  Next',
    'Next',
    'fso.DeleteFile WScript.ScriptFullName'
  ].join('\r\n');

  try {
    // 清理历史卸载残留的启动器
    for (const name of fs.readdirSync(os.tmpdir())) {
      if (name.startsWith('laquake-uninstall-watchdog-') && name.endsWith('.vbs')) {
        try { fs.unlinkSync(path.join(os.tmpdir(), name)); } catch (error) {}
      }
    }
    // 必须 UTF-16 LE + BOM：中文路径的 VBS 以 UTF-8 无 BOM 保存会被按 GBK 错读
    fs.writeFileSync(vbsPath, '\uFEFF' + vbs, 'utf16le');
  } catch (error) {
    spawnCmdWatchdogFallback(plan, rounds, system32);
    return;
  }

  try {
    cp.spawn(exists(wscriptExe) ? wscriptExe : 'wscript.exe', [vbsPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd: os.tmpdir()
    }).on('error', () => {
      spawnCmdWatchdogFallback(plan, rounds, system32);
    }).unref();
  } catch (error) {
    spawnCmdWatchdogFallback(plan, rounds, system32);
  }
}

// 极端兜底（wscript 不可用）：起一个隐藏 cmd，del 清单文件 + 无 /s 的 rd。
// 文件过多时按块拆成多个顺序执行的 cmd，避免命令行超长。
// 不带多轮等待（不能长驻占用自身映像），锁定文件交给用户重装/手动处理。
// 正常 Windows 均有 wscript，不会走到这里。
function spawnCmdWatchdogFallback(plan, rounds, cwd) {
  const quote = (p) => '"' + p + '"';
  const CHUNK = 60;
  const groups = [];
  for (let i = 0; i < plan.files.length; i += CHUNK) {
    groups.push(plan.files.slice(i, i + CHUNK));
  }
  let cmdLine = 'ping 127.0.0.1 -n 3 >nul 2>nul';
  groups.forEach((group) => {
    for (const f of group) cmdLine += ' & del /f /q ' + quote(f);
  });
  for (const d of plan.dirs) cmdLine += ' & rd ' + quote(d);
  try {
    cp.spawn('cmd.exe', ['/c', cmdLine], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      cwd
    }).unref();
  } catch (error) {}
}

function removeSelf() {
  for (let i = 0; i < 10; i++) {
    try {
      fs.unlinkSync(selfPath);
    } catch (error) {}
    if (!exists(selfPath)) return;
    sleep(500);
  }
}

function main() {
  // 用户在完成页可能停留很久，等卸载器退出（最长等 30 分钟，超时也继续，
  // 由后续 taskkill 与看门狗兜底）
  waitProcessExit(waitPid, 30 * 60 * 1000);
  sleep(600); // 等窗口进程映像与文件句柄释放
  killRunningApp();
  sleep(800); // 等被杀进程结束、句柄释放
  removeShortcuts();
  removeRegistry();
  // 严格按清单删除程序文件；运行中的自身 exe/DLL 交给看门狗继续按清单收尾
  const plan = removeInstallByPlan(installDir, 4, 400);
  // %APPDATA%\LaQuake 是程序私有数据目录，仅在用户勾选时整体清除
  if (purgeData) removeTree(userDataDir, 10, 500);
  if (plan) spawnInstallDirWatchdog(plan);
  removeSelf();
}

main();
process.exit(0);
