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

async function tolerantRemove(target) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      await fs.rm(target, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 3) {
        throw new Error(`无法清理 ${target}（可能被其他程序占用），请关闭占用后重试`);
      }
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

  const unpacked = path.join(workDir, 'win-unpacked');
  if (!fssync.existsSync(unpacked)) {
    throw new Error('临时解包目录不存在，请去掉 --skip-app 重新构建');
  }
  return { unpacked, workDir };
}

async function stagePayload(unpacked) {
  log('2/4 装载安装载荷到 installer/payload…');
  const payload = path.join(INSTALLER_DIR, 'payload');
  if (fssync.existsSync(payload)) {
    try {
      await fs.rm(payload, { recursive: true, force: true });
    } catch (error) {
      const trash = path.join(INSTALLER_DIR, `.payload-old-${Date.now()}`);
      try {
        await fs.rename(payload, trash);
        fs.rm(trash, { recursive: true, force: true }).catch(() => {});
      } catch (renameError) {
        throw new Error('无法清理 installer/payload（可能被其他程序占用），请关闭占用后重试');
      }
    }
  }
  await fs.cp(unpacked, payload, { recursive: true });
}

async function stageSharedAssets() {
  log('3/4 同步多语言文件与品牌图标…');
  const i18nOut = path.join(INSTALLER_DIR, 'i18n');
  await rimraf(i18nOut);
  await fs.mkdir(i18nOut, { recursive: true });
  for (const file of ['zh-CN.json', 'en.json']) {
    await fs.copyFile(path.join(ROOT, 'src', 'i18n', file), path.join(i18nOut, file));
  }

  const assetsOut = path.join(INSTALLER_DIR, 'assets');
  await fs.mkdir(assetsOut, { recursive: true });
  await fs.copyFile(path.join(ROOT, 'Media', 'LaQuake.png'), path.join(assetsOut, 'laquake.png'));
  await fs.copyFile(path.join(ROOT, 'Media', 'LaQuake.ico'), path.join(assetsOut, 'laquake.ico'));
}

async function buildInstaller() {
  log(`4/4 打包安装器 (portable, ${arch})…`);
  if (!fssync.existsSync(path.join(INSTALLER_DIR, 'node_modules'))) {
    log('安装器依赖尚未安装，执行 npm install…');
    await run('npm install', INSTALLER_DIR);
  }
  await run(`npx electron-builder --win portable --${arch}`, INSTALLER_DIR);
}

async function main() {
  if (!['x64', 'ia32', 'arm64'].includes(arch)) {
    throw new Error(`不支持的架构: ${arch}`);
  }

  const { unpacked, workDir } = await buildAppPayload();
  await stagePayload(unpacked);
  await stageSharedAssets();
  await buildInstaller();

  await rimraf(workDir);

  const rootPkg = JSON.parse(fssync.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const artifact = path.join(ROOT, 'dist-installer', `LaQuake-Setup-${rootPkg.version}.exe`);
  log(`完成！安装程序：${artifact}`);
}

main().catch((error) => {
  console.error('\x1b[31m[build] 构建失败：\x1b[0m', error.message);
  process.exit(1);
});
