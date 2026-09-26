const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const INSTALLER_DIR = path.join(ROOT, 'installer');

const argv = process.argv.slice(2);
const arch = (() => {
  const i = argv.indexOf('--arch');
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return 'x64';
})();
const skipApp = argv.includes('--skip-app');

function log(message) {
  console.log(`\x1b[36m[build]\x1b[0m ${message}`);
}

function run(command, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [], {
      cwd,
      stdio: 'inherit',
      shell: true
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function rimraf(target) {
  await fs.rm(target, { recursive: true, force: true });
}

async function tolerantCopy(src, dest) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.copyFile(src, dest);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
}

async function buildAppPayload() {
  const workDir = path.join(os.tmpdir(), `laquake-build-${Date.now()}`);

  if (skipApp) {
    log('跳过主程序构建（--skip-app）');
  } else {
    log(`1/4 构建主程序解包载荷 (windows, ${arch})，输出到工作区外：${workDir}`);
    await fs.mkdir(workDir, { recursive: true });
    await run(`npx electron-builder --win --dir --${arch} "--config.directories.output=${workDir}"`, ROOT);
  }

  // electron-builder --dir 的输出目录名随架构变化：
  // x64→win-unpacked，ia32→win-ia32-unpacked，arm64→win-arm64-unpacked
  const unpackedDirName = {
    x64: 'win-unpacked',
    ia32: 'win-ia32-unpacked',
    arm64: 'win-arm64-unpacked'
  }[arch];
  const unpacked = path.join(workDir, unpackedDirName);
  if (!fssync.existsSync(unpacked)) {
    throw new Error('临时解包目录不存在，请去掉 --skip-app 重新构建');
  }
  return { unpacked, workDir };
}

async function stagePayload(unpacked, workDir) {
  // 载荷暂存全部放在工作区外：IDE（Trae）的文件监视会长时占用工作区内
  // installer/payload/resources/app.asar，导致每次构建清理旧载荷时报
  // “being used by another process”。
  const stageRoot = path.join(workDir, 'stage');
  const payload = path.join(stageRoot, 'payload');
  log(`2/4 装载安装载荷（工作区外）：${payload}`);
  await fs.mkdir(payload, { recursive: true });
  await fs.cp(unpacked, payload, { recursive: true });
  return stageRoot;
}

async function stageSharedAssets(stageRoot) {
  log('3/4 同步多语言文件与品牌图标（工作区外暂存）…');
  const i18nOut = path.join(stageRoot, 'i18n');
  await fs.mkdir(i18nOut, { recursive: true });
  for (const file of ['zh-CN.json', 'en.json']) {
    await fs.copyFile(path.join(ROOT, 'src', 'i18n', file), path.join(i18nOut, file));
  }

  const assetsOut = path.join(stageRoot, 'assets');
  await fs.mkdir(assetsOut, { recursive: true });
  await fs.copyFile(path.join(ROOT, 'Media', 'LaQuake.png'), path.join(assetsOut, 'laquake.png'));
  await fs.copyFile(path.join(ROOT, 'Media', 'LaQuake.ico'), path.join(assetsOut, 'laquake.ico'));
}

// 生成一份完整的 electron-builder 配置（绝对路径），让 extraResources
// 指向工作区外暂存目录，绕开 IDE 对工作区内载荷目录的句柄占用。
function writeInstallerConfig(stageRoot, workDir) {
  const installerPkg = JSON.parse(fssync.readFileSync(path.join(INSTALLER_DIR, 'package.json'), 'utf8'));
  const config = {
    appId: 'com.laquake.installer',
    productName: 'LaQuake-Setup',
    // 解包中间产物必须放在工作区外：IDE（Trae）会锁住旧 win-unpacked 内的
    // app.asar，导致 electron-builder 的 EnsureEmptyDir 清理失败
    directories: { output: path.join(workDir, 'installer-out') },
    win: {
      target: 'portable',
      icon: path.join(ROOT, 'Media', 'LaQuake.ico'),
      asar: true
    },
    portable: {
      artifactName: installerPkg.build?.portable?.artifactName || 'LaQuake-Setup-${version}-${arch}.exe'
    },
    files: ['main.js', 'preload.js', 'installer.html', 'installer.js'],
    extraResources: [
      { from: path.join(stageRoot, 'payload'), to: 'payload' },
      { from: path.join(stageRoot, 'i18n'), to: 'i18n' },
      { from: path.join(stageRoot, 'assets'), to: 'assets' }
    ]
  };
  const cfgPath = path.join(workDir, 'installer-build.json');
  fssync.writeFileSync(cfgPath, JSON.stringify(config, null, 2), 'utf8');
  return cfgPath;
}

async function buildInstaller(cfgPath) {
  log(`4/4 打包安装器 (portable, ${arch})…`);
  if (!fssync.existsSync(path.join(INSTALLER_DIR, 'node_modules'))) {
    log('安装器依赖尚未安装，执行 npm install…');
    await run('npm install', INSTALLER_DIR);
  }
  await run(`npx electron-builder --win portable --${arch} --config "${cfgPath}"`, INSTALLER_DIR);
}

async function main() {
  if (!['x64', 'ia32', 'arm64'].includes(arch)) {
    throw new Error(`不支持的架构: ${arch}`);
  }

  const { unpacked, workDir } = await buildAppPayload();
  const stageRoot = await stagePayload(unpacked, workDir);
  await stageSharedAssets(stageRoot);
  const cfgPath = writeInstallerConfig(stageRoot, workDir);
  await buildInstaller(cfgPath);

  // 中间产物都在工作区外，只把最终便携 exe 拷回工作区 dist-installer
  const installerPkg = JSON.parse(fssync.readFileSync(path.join(INSTALLER_DIR, 'package.json'), 'utf8'));
  const artifactName = `LaQuake-Setup-${installerPkg.version}-${arch}.exe`;
  const builtArtifact = path.join(workDir, 'installer-out', artifactName);
  if (!fssync.existsSync(builtArtifact)) {
    throw new Error(`未找到构建产物：${builtArtifact}`);
  }
  const distDir = path.join(ROOT, 'dist-installer');
  await fs.mkdir(distDir, { recursive: true });
  const finalArtifact = path.join(distDir, artifactName);
  await tolerantCopy(builtArtifact, finalArtifact);

  await rimraf(workDir);

  log(`完成！安装程序：${finalArtifact}`);
}

main().catch((error) => {
  console.error('\x1b[31m[build] 构建失败：\x1b[0m', error.message);
  process.exit(1);
});
