const STRINGS = {
  'zh-CN': {
    title: 'LaQuake 卸载向导',
    confirmTitle: '确定要卸载 LaQuake 吗？',
    confirmDesc: '卸载将移除程序文件、桌面与开始菜单快捷方式，以及注册表中的安装信息。',
    lblDir: '安装位置：',
    lblData: '用户数据：',
    dataKept: '将保留（设置与历史记录）',
    purgeText: '同时删除我的设置与历史记录',
    purgeHint: '将一并清除 %APPDATA%\\LaQuake，此操作不可恢复',
    btnCancel: '取消',
    btnUninstall: '卸载',
    btnBack: '返回',
    btnClose: '关闭',
    btnFinish: '完成',
    preparing: '正在准备卸载…',
    phaseProcess: '正在关闭运行中的程序',
    phaseShortcuts: '正在删除快捷方式',
    phaseRegistry: '正在移除注册表信息',
    phaseCleanup: '正在准备清理程序文件',
    finishTitle: 'LaQuake 已卸载',
    finishDesc: '点击「完成」关闭向导，安装目录中的剩余文件将被自动清除。',
    failTitle: '卸载未能完成',
    avTitle: '卸载前请先关闭杀毒软件',
    avText: '卸载过程会结束运行中的程序、删除程序文件与快捷方式，360安全卫士、电脑管家等杀毒软件可能拦截卸载操作。建议暂时退出杀毒软件或关闭实时防护，卸载完成后再重新开启。',
    avCancel: '取消',
    avContinue: '我已关闭，继续卸载'
  },
  en: {
    title: 'LaQuake Uninstall Wizard',
    confirmTitle: 'Are you sure you want to uninstall LaQuake?',
    confirmDesc: 'This will remove the application files, desktop and Start Menu shortcuts, and its registry entries.',
    lblDir: 'Install location: ',
    lblData: 'User data: ',
    dataKept: 'Will be kept (settings and history)',
    purgeText: 'Also delete my settings and history',
    purgeHint: 'This will permanently erase %APPDATA%\\LaQuake',
    btnCancel: 'Cancel',
    btnUninstall: 'Uninstall',
    btnBack: 'Back',
    btnClose: 'Close',
    btnFinish: 'Finish',
    preparing: 'Preparing to uninstall…',
    phaseProcess: 'Closing running application',
    phaseShortcuts: 'Removing shortcuts',
    phaseRegistry: 'Removing registry entries',
    phaseCleanup: 'Preparing file cleanup',
    finishTitle: 'LaQuake Uninstalled',
    finishDesc: 'Click Finish to close the wizard. Remaining files will be removed automatically.',
    failTitle: 'Uninstall failed',
    avTitle: 'Close your antivirus before uninstalling',
    avText: 'Uninstalling will terminate the running application and remove program files and shortcuts. Antivirus software (e.g. 360 Total Security, Tencent PC Manager) may block these actions. Please exit your antivirus or temporarily disable real-time protection, then re-enable it afterwards.',
    avCancel: 'Cancel',
    avContinue: 'I have closed it, continue'
  }
};

const PHASE_TEXT = {
  prepare: 'preparing',
  shortcuts: 'phaseShortcuts',
  registry: 'phaseRegistry',
  cleanup: 'phaseCleanup'
};

let lang = 'zh-CN';
let s = STRINGS['zh-CN'];
let purgeData = false;

function $(id) {
  return document.getElementById(id);
}

function t(key) {
  return s[key] !== undefined ? s[key] : key;
}

function showPage(name) {
  document.querySelectorAll('.page').forEach((el) => el.classList.remove('active'));
  const target = document.querySelector(`.page[data-page="${name}"]`);
  if (target) target.classList.add('active');
  updateFooter(name);
}

function updateFooter(page) {
  const cancel = $('btnCancel');
  const action = $('btnAction');
  cancel.style.display = '';
  action.style.display = '';
  action.disabled = false;
  action.className = 'btn btn-danger';

  if (page === 'confirm') {
    cancel.textContent = t('btnCancel');
    action.textContent = t('btnUninstall');
  } else if (page === 'progress') {
    cancel.style.display = 'none';
    action.style.display = 'none';
  } else if (page === 'finish') {
    cancel.style.display = 'none';
    action.className = 'btn btn-primary';
    action.textContent = t('btnFinish');
  }
}

function showAvConfirm() {
  return new Promise((resolve) => {
    const modal = $('avModal');
    const cancelBtn = $('avCancel');
    const continueBtn = $('avContinue');
    modal.classList.add('show');
    const cleanup = (result) => {
      modal.classList.remove('show');
      cancelBtn.removeEventListener('click', onCancel);
      continueBtn.removeEventListener('click', onContinue);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onContinue = () => cleanup(true);
    cancelBtn.addEventListener('click', onCancel);
    continueBtn.addEventListener('click', onContinue);
  });
}

async function startUninstall() {
  if (!(await showAvConfirm())) return;
  showPage('progress');
  $('progressError').style.display = 'none';
  $('progressFill').style.width = '8%';
  $('progressStatus').textContent = t('preparing');
  $('progressDetail').textContent = '';
  $('progressRing').textContent = '⚙️';

  const result = await window.uninstallerAPI.run({ purgeData });
  if (result.ok) {
    $('progressFill').style.width = '100%';
    $('progressStatus').textContent = '';
    showPage('finish');
  } else {
    $('progressRing').textContent = '❌';
    $('progressStatus').textContent = t('failTitle');
    const box = $('progressError');
    box.textContent = result.error || 'error';
    box.style.display = 'block';
    const cancel = $('btnCancel');
    const action = $('btnAction');
    cancel.style.display = '';
    action.style.display = '';
    cancel.textContent = t('btnClose');
    action.textContent = t('btnBack');
    action.className = 'btn btn-secondary';
  }
}

window.uninstallerAPI.onProgress((data) => {
  if (PHASE_TEXT[data.phase]) {
    $('progressStatus').textContent = t(PHASE_TEXT[data.phase]);
  }
  if (typeof data.percent === 'number') {
    $('progressFill').style.width = `${data.percent}%`;
  }
  if (data.detail) $('progressDetail').textContent = data.detail;
});

async function init() {
  $('tbMin').addEventListener('click', () => window.uninstallerAPI.winMinimize());
  $('tbClose').addEventListener('click', () => window.uninstallerAPI.winClose());
  $('chkPurge').addEventListener('change', (e) => { purgeData = e.target.checked; });
  $('btnCancel').addEventListener('click', () => {
    const page = document.querySelector('.page.active').dataset.page;
    if (page === 'confirm') {
      window.uninstallerAPI.winClose();
    } else {
      showPage('confirm');
    }
  });
  $('btnAction').addEventListener('click', async () => {
    const page = document.querySelector('.page.active').dataset.page;
    if (page === 'confirm') {
      await startUninstall();
    } else if (page === 'finish') {
      await window.uninstallerAPI.finish();
    } else {
      showPage('confirm');
    }
  });

  const info = await window.uninstallerAPI.getInfo();
  lang = STRINGS[info.language] ? info.language : 'zh-CN';
  s = STRINGS[lang];
  document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';

  $('titleText').textContent = t('title');
  document.title = t('title');
  $('confirmTitle').textContent = t('confirmTitle');
  $('confirmDesc').textContent = t('confirmDesc');
  $('lblDir').textContent = t('lblDir');
  $('lblData').textContent = t('lblData');
  $('infoData').textContent = t('dataKept');
  $('purgeText').textContent = t('purgeText');
  $('purgeHint').textContent = t('purgeHint');
  $('progressStatus').textContent = t('preparing');
  $('finishTitle').textContent = t('finishTitle');
  $('finishDesc').textContent = t('finishDesc');
  $('avTitle').textContent = t('avTitle');
  $('avText').textContent = t('avText');
  $('avCancel').textContent = t('avCancel');
  $('avContinue').textContent = t('avContinue');

  $('infoDir').textContent = info.installDir;
  $('brandVersion').textContent = `v${info.version}`;
  $('brandingImg').src = info.brandingPath;

  if (!info.userDataExists) {
    const chk = $('chkPurge');
    chk.parentElement.style.opacity = '.55';
    chk.disabled = true;
  }

  showPage('confirm');
}

init();
