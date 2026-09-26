const INSTALLER_STRINGS = {
  'zh-CN': {
    'installer.title': 'LaQuake 安装向导',
    'installer.rail.language': '语言设置',
    'installer.rail.mode': '使用模式',
    'installer.rail.agreement': '协议确认',
    'installer.rail.dataSource': '数据源',
    'installer.rail.geo': '地理与计算',
    'installer.rail.appearance': '界面外观',
    'installer.rail.ai': 'AI 设置',
    'installer.rail.push': '推送设置',
    'installer.rail.options': '安装选项',
    'installer.language.title': '语言设置',
    'installer.language.desc': '请选择软件使用的界面语言，安装完成后仍可在系统设置中随时更改',
    'installer.language.zh': '简体中文',
    'installer.language.en': 'English',
    'installer.dataSource.desc': '选择地震预警与速报信息的来源',
    'installer.geo.desc': '地理位置用于计算震中距、本地预估烈度与横波到达时间',
    'installer.appearance.desc': '定制窗口控制按钮与导航栏风格',
    'installer.ai.desc': '配置 AI 接口后，可在地震详情中使用 AI 智能解读（可稍后再设置）',
    'installer.push.desc': '配置后，预警触发时将向移动设备推送通知（可稍后再设置）',
    'installer.options.title': '安装选项',
    'installer.options.desc': '选择安装位置，以及需要创建的快捷方式',
    'installer.dir': '安装目录',
    'installer.dir.hint': '程序文件将安装到 LaQuake 子文件夹中；卸载时只删除程序释放的文件，您自行放入的个人文件会被保留。',
    'installer.browse': '浏览…',
    'installer.desktop': '创建桌面快捷方式',
    'installer.startmenu': '创建开始菜单快捷方式',
    'installer.autoStart': '开机自动启动 LaQuake',
    'installer.launch': '安装完成后立即启动 LaQuake',
    'installer.btn.install': '立即安装',
    'installer.btn.finish': '完成',
    'installer.btn.close': '关闭',
    'installer.cancel': '取消安装',
    'installer.cancelling': '正在取消并清理…',
    'installer.cancelled.title': '安装已取消',
    'installer.cancelled.desc': '已清理本次安装释放的全部文件，您的系统恢复到安装前的状态',
    'installer.size': '程序所需空间',
    'installer.locate.doing': '正在获取定位…',
    'installer.locate.success': '定位成功：',
    'installer.locate.fail': '定位失败：',
    'installer.progress.copying': '正在复制程序文件',
    'installer.progress.settings': '正在写入初始设置',
    'installer.progress.uninstaller': '正在配置卸载程序',
    'installer.progress.shortcuts': '正在创建快捷方式',
    'installer.progress.registry': '正在注册系统信息',
    'installer.progress.prepare': '正在准备安装…',
    'installer.finish.title': 'LaQuake 安装完成',
    'installer.finish.desc': '一切就绪，预警守护即刻上线。感谢选择 LaQuake！',
    'installer.av.title': '安装前请先关闭杀毒软件',
    'installer.av.text': '安装过程会释放程序文件、创建快捷方式并写入开机启动项，360安全卫士、电脑管家等杀毒软件可能弹窗拦截甚至误删文件。建议暂时退出杀毒软件或关闭实时防护，安装完成后再重新开启。',
    'installer.av.cancel': '取消',
    'installer.av.continue': '我已关闭，继续安装',
    'installer.btn.upgrade': '立即升级',
    'installer.upgrade.title': '检测到已安装旧版本',
    'installer.upgrade.desc': '将直接升级至最新版本，安装目录、全部设置与历史记录保持不变。',
    'installer.upgrade.titleSame': 'LaQuake 已安装',
    'installer.upgrade.descSame': '将在原安装目录覆盖安装，全部设置与历史记录保持不变。',
    'installer.upgrade.note': '安装过程会自动关闭正在运行的 LaQuake，请先保存手头工作。',
    'installer.upgrade.dir': '安装目录：'
  },
  en: {
    'installer.title': 'LaQuake Setup Wizard',
    'installer.rail.language': 'Language',
    'installer.rail.mode': 'Mode',
    'installer.rail.agreement': 'Agreement',
    'installer.rail.dataSource': 'Data Source',
    'installer.rail.geo': 'Location & Calculation',
    'installer.rail.appearance': 'Appearance',
    'installer.rail.ai': 'AI Settings',
    'installer.rail.push': 'Push Settings',
    'installer.rail.options': 'Install Options',
    'installer.language.title': 'Language Settings',
    'installer.language.desc': 'Choose the display language. You can change it later in system settings.',
    'installer.language.zh': '简体中文',
    'installer.language.en': 'English',
    'installer.dataSource.desc': 'Choose the sources of earthquake early warning and report data',
    'installer.geo.desc': 'Your location is used to calculate distance, estimated local intensity and S-wave arrival time',
    'installer.appearance.desc': 'Customize window controls and navigation style',
    'installer.ai.desc': 'Configure the AI API to get intelligent explanations in earthquake details (optional, can be set later)',
    'installer.push.desc': 'When configured, alerts will be pushed to your mobile device (optional, can be set later)',
    'installer.options.title': 'Install Options',
    'installer.options.desc': 'Choose the install location and shortcuts to create',
    'installer.dir': 'Install directory',
    'installer.dir.hint': 'Program files will be installed in a LaQuake subfolder. Uninstalling removes only the files created by the program; any personal files you place there are kept.',
    'installer.browse': 'Browse…',
    'installer.desktop': 'Create desktop shortcut',
    'installer.startmenu': 'Create Start Menu shortcut',
    'installer.autoStart': 'Launch LaQuake when Windows starts',
    'installer.launch': 'Launch LaQuake immediately after setup',
    'installer.btn.install': 'Install',
    'installer.btn.finish': 'Finish',
    'installer.btn.close': 'Close',
    'installer.cancel': 'Cancel installation',
    'installer.cancelling': 'Cancelling and cleaning up…',
    'installer.cancelled.title': 'Installation cancelled',
    'installer.cancelled.desc': 'All files from this installation have been removed. Your system is back to its previous state.',
    'installer.size': 'Required space',
    'installer.locate.doing': 'Locating…',
    'installer.locate.success': 'Located: ',
    'installer.locate.fail': 'Locate failed: ',
    'installer.progress.copying': 'Copying application files',
    'installer.progress.settings': 'Writing initial settings',
    'installer.progress.uninstaller': 'Configuring uninstaller',
    'installer.progress.shortcuts': 'Creating shortcuts',
    'installer.progress.registry': 'Registering system information',
    'installer.progress.prepare': 'Preparing installation…',
    'installer.finish.title': 'LaQuake Setup Complete',
    'installer.finish.desc': "Everything is ready. Thank you for choosing LaQuake!",
    'installer.av.title': 'Close your antivirus before installing',
    'installer.av.text': 'Setup will extract program files, create shortcuts and write a startup entry. Antivirus software (e.g. 360 Total Security, Tencent PC Manager) may block these actions or quarantine files. Please exit your antivirus or temporarily disable real-time protection, then re-enable it after installation.',
    'installer.av.cancel': 'Cancel',
    'installer.av.continue': 'I have closed it, continue',
    'installer.btn.upgrade': 'Upgrade now',
    'installer.upgrade.title': 'An older version is installed',
    'installer.upgrade.desc': 'LaQuake will be upgraded in place. Your install directory, settings and history will be kept.',
    'installer.upgrade.titleSame': 'LaQuake is already installed',
    'installer.upgrade.descSame': 'LaQuake will be reinstalled over the existing directory. Your settings and history will be kept.',
    'installer.upgrade.note': 'The running LaQuake will be closed automatically. Please save your work first.',
    'installer.upgrade.dir': 'Install location: '
  }
};

const STEPS = ['welcome', 'language', 'mode', 'agreement', 'dataSource', 'geo', 'appearance', 'ai', 'push', 'options', 'progress', 'finish'];
const RAIL_ORDER = ['language', 'mode', 'agreement', 'dataSource', 'geo', 'appearance', 'ai', 'push', 'options'];

const DEFAULT_PUSH_TEMPLATE = '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "紧急地震预警！{FZSK}{ZZMC}发生{ZHENJI}级地震。预估本地烈度{YGLD}度，横波将于{TIME}秒后到达。预估有{YHCD}，请遵循{BXJY}.来自中国地震预警网。",\n  "level": "critical",\n  "sound": "alarm",\n  "volume": 10\n}';
const DEFAULT_EQ_PUSH_TEMPLATE = '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "地震速报：{FZSK}{ZZMC}发生{ZHENJI}级地震，预估本地烈度{YGLD}度，震中距{ZZJ}km。预估有{YHCD}，请遵循{BXJY}。来自中国地震预警网。",\n  "level": "timeSensitive",\n  "sound": "minuet",\n  "volume": 10\n}';

const SWITCH_MAP = {
  swEewCWA: 'eewCWA',
  swAutoLocate: 'autoLocate',
  swFloating: 'floatingNav',
  swAiFull: 'aiFullUrl'
};

const INPUT_MAP = {
  geo: [
    ['inLat', 'userLatitude'],
    ['inLon', 'userLongitude'],
    ['inPWave', 'pWaveSpeed'],
    ['inSWave', 'sWaveSpeed'],
    ['inEarthR', 'earthRadius']
  ],
  ai: [
    ['inAiDomain', 'aiDomain'],
    ['inAiKey', 'aiApiKey'],
    ['inAiModel', 'aiModel']
  ],
  push: [
    ['inBarkUrl', 'barkUrl'],
    ['inBarkKey', 'barkDeviceKey'],
    ['inPushUrl', 'pushUrl'],
    ['inPushTpl', 'pushJsonTemplate']
  ],
  options: [
    ['inInstallDir', 'installDir']
  ]
};

const model = {
  language: 'zh-CN',
  mode: '',
  agreed: false,
  eewSource: 'cenc',
  eewCWA: false,
  eqSource: 'cenc',
  autoLocate: false,
  userLatitude: 30.67,
  userLongitude: 104.07,
  pWaveSpeed: 7,
  sWaveSpeed: 4,
  earthRadius: 6371,
  titleBarStyle: 'windows',
  floatingNav: false,
  aiDomain: '',
  aiFullUrl: false,
  aiApiKey: '',
  aiModel: '',
  pushMode: 'simple',
  barkUrl: 'https://api.day.app/push',
  barkDeviceKey: '',
  pushUrl: '',
  pushJsonTemplate: DEFAULT_PUSH_TEMPLATE,
  eqPushJsonTemplate: DEFAULT_EQ_PUSH_TEMPLATE,
  installDir: '',
  autoStart: false,
  desktopShortcut: true,
  startMenuShortcut: true,
  launchAfter: true
};

let stepIndex = 0;
let translations = {};
let installFailed = false;
let upgradeMode = false;

function t(key) {
  return translations[key] !== undefined ? translations[key] : key;
}

async function loadLanguage(lang) {
  const remote = await window.installerAPI.loadTranslations(lang);
  translations = Object.assign({}, remote, INSTALLER_STRINGS[lang] || INSTALLER_STRINGS['zh-CN']);
}

function applyI18n() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
}

function $(id) {
  return document.getElementById(id);
}

function setSwitch(el, on) {
  if (on) el.classList.add('on');
  else el.classList.remove('on');
}

function syncPageFromModel(pageId) {
  Object.keys(SWITCH_MAP).forEach((id) => {
    const el = $(id);
    if (el) setSwitch(el, !!model[SWITCH_MAP[id]]);
  });

  const eewRadio = document.querySelector(`input[name="eewSource"][value="${model.eewSource}"]`);
  if (eewRadio) eewRadio.checked = true;
  const tbRadio = document.querySelector(`input[name="titleBarStyle"][value="${model.titleBarStyle}"]`);
  if (tbRadio) tbRadio.checked = true;
  const pushRadio = document.querySelector(`input[name="pushMode"][value="${model.pushMode}"]`);
  if (pushRadio) pushRadio.checked = true;

  $('selEqSource').value = model.eqSource;

  (INPUT_MAP[pageId] || []).forEach(([inputId, key]) => {
    const el = $(inputId);
    if (el) el.value = model[key];
  });

  if (pageId === 'push') renderPushPanels();
  if (pageId === 'options') {
    $('chkDesktop').checked = model.desktopShortcut;
    $('chkStartMenu').checked = model.startMenuShortcut;
    $('chkAutoStart').checked = model.autoStart;
    $('chkLaunch').checked = model.launchAfter;
  }
  if (pageId === 'agreement') $('agreeCheck').checked = model.agreed;
  if (pageId === 'language') {
    document.querySelectorAll('[data-lang]').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-lang') === model.language);
    });
  }
  if (pageId === 'mode') {
    document.querySelectorAll('[data-mode]').forEach((el) => {
      el.classList.toggle('selected', el.getAttribute('data-mode') === model.mode);
    });
    $('modeWarn').style.display = model.mode === 'eewcn' ? 'block' : 'none';
  }
}

function collectPageToModel(pageId) {
  (INPUT_MAP[pageId] || []).forEach(([inputId, key]) => {
    const el = $(inputId);
    if (el) model[key] = el.value;
  });
}

function showPage(index) {
  document.querySelectorAll('.page').forEach((el) => el.classList.remove('active'));
  const pageId = STEPS[index];
  const target = document.querySelector(`.page[data-page="${pageId}"]`);
  if (target) target.classList.add('active');
  syncPageFromModel(pageId);
  updateRail(index);
  updateFooter(index);
}

function updateRail(index) {
  const currentPage = STEPS[index];
  const currentPos = RAIL_ORDER.indexOf(currentPage);
  document.querySelectorAll('.rail-item').forEach((el) => {
    const key = el.getAttribute('data-rail');
    const pos = RAIL_ORDER.indexOf(key);
    el.classList.remove('active', 'done');
    if (pos === currentPos) el.classList.add('active');
    else if (currentPos === -1) {
      if ((currentPage === 'progress' || currentPage === 'finish') && pos <= RAIL_ORDER.length) el.classList.add('done');
    } else if (pos < currentPos) el.classList.add('done');
  });
}

function updateFooter(index) {
  const pageId = typeof index === 'string' ? index : STEPS[index];
  const footer = $('footer');
  const back = $('btnBack');
  const next = $('btnNext');

  footer.style.display = 'flex';
  back.style.display = 'inline-block';
  next.disabled = false;
  $('footerInfo').textContent = '';

  switch (pageId) {
    case 'upgrade':
      back.textContent = t('installer.av.cancel');
      next.textContent = t('installer.btn.upgrade');
      break;
    case 'welcome':
      back.style.display = 'none';
      next.textContent = t('activation.welcome.start');
      break;
    case 'language':
      back.style.display = 'none';
      next.textContent = t('activation.next');
      break;
    case 'mode':
      back.textContent = t('activation.back');
      next.textContent = t('activation.next');
      next.disabled = !model.mode;
      break;
    case 'agreement':
      back.textContent = t('activation.back');
      next.textContent = t('activation.next');
      next.disabled = !model.agreed;
      break;
    case 'options':
      back.textContent = t('activation.back');
      next.textContent = t('installer.btn.install');
      break;
    case 'progress':
      footer.style.display = installFailed ? 'flex' : 'none';
      if (installFailed) {
        back.style.display = 'none';
        next.textContent = t('installer.btn.close');
      }
      break;
    case 'finish':
      back.style.display = 'none';
      next.textContent = t('installer.btn.finish');
      break;
    default:
      back.textContent = t('activation.back');
      next.textContent = t('activation.next');
  }
}

function goBack() {
  if (upgradeMode) {
    window.installerAPI.winClose();
    return;
  }
  collectPageToModel(STEPS[stepIndex]);
  if (stepIndex > 0) {
    stepIndex -= 1;
    showPage(stepIndex);
  }
}

async function goNext() {
  if (upgradeMode) {
    const upPage = document.querySelector('.page.active').dataset.page;
    if (upPage === 'upgrade') {
      beginInstall();
    } else if (upPage === 'finish' || (upPage === 'progress' && installFailed)) {
      window.close();
    }
    return;
  }
  const pageId = STEPS[stepIndex];
  collectPageToModel(pageId);

  if (pageId === 'options') {
    beginInstall();
    return;
  }
  if (pageId === 'progress' && installFailed) {
    window.close();
    return;
  }
  if (pageId === 'finish') {
    window.close();
    return;
  }
  if (stepIndex < STEPS.length - 1) {
    stepIndex += 1;
    showPage(stepIndex);
  }
}

function pickLanguage(lang) {
  model.language = lang;
  loadLanguage(lang).then(() => {
    applyI18n();
    showPage(stepIndex);
  });
}

function pickMode(mode) {
  model.mode = mode;
  document.querySelectorAll('[data-mode]').forEach((el) => {
    el.classList.toggle('selected', el.getAttribute('data-mode') === mode);
  });
  $('modeWarn').style.display = mode === 'eewcn' ? 'block' : 'none';
  updateFooter(stepIndex);
}

function toggleModel(key, el) {
  model[key] = !model[key];
  setSwitch(el, model[key]);
}

function renderPushPanels() {
  $('pushSimplePanel').style.display = model.pushMode === 'simple' ? 'block' : 'none';
  $('pushProPanel').style.display = model.pushMode === 'pro' ? 'block' : 'none';
}

function switchPushMode(mode) {
  model.pushMode = mode;
  renderPushPanels();
}

function insertVar(token) {
  const el = $('inPushTpl');
  const start = el.selectionStart || el.value.length;
  const end = el.selectionEnd || el.value.length;
  el.value = el.value.substring(0, start) + token + el.value.substring(end);
  model.pushJsonTemplate = el.value;
  el.focus();
  el.selectionStart = el.selectionEnd = start + token.length;
}

async function browseDir() {
  const result = await window.installerAPI.pickDir(model.installDir);
  if (result.ok) {
    // 用户选的是父目录，解析为其下的 LaQuake 子目录（已叫 LaQuake 则保持不变）
    const resolved = await window.installerAPI.resolveInstallDir(result.path);
    if (resolved.ok) {
      model.installDir = resolved.path;
      $('inInstallDir').value = resolved.path;
    } else {
      model.installDir = result.path;
      $('inInstallDir').value = result.path;
    }
  }
}

async function locateNow() {
  const status = $('locateStatus');
  status.textContent = t('installer.locate.doing');
  status.style.color = '#94a3b8';
  const result = await window.installerAPI.autoLocate();
  if (result.ok) {
    model.userLatitude = result.lat;
    model.userLongitude = result.lon;
    $('inLat').value = result.lat;
    $('inLon').value = result.lon;
    status.textContent = t('installer.locate.success') + result.label;
    status.style.color = '#4ade80';
  } else {
    status.textContent = t('installer.locate.fail') + result.error;
    status.style.color = '#f87171';
  }
}

function formatBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${Math.ceil(mb)} MB`;
}

function num(value, fallback) {
  const n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}

function buildConfig() {
  const settings = {
    language: model.language,
    eewSource: model.eewSource,
    eewCWA: !!model.eewCWA,
    eqSource: model.eqSource,
    autoLocate: !!model.autoLocate,
    userLatitude: num(model.userLatitude, 30.67),
    userLongitude: num(model.userLongitude, 104.07),
    pWaveSpeed: num(model.pWaveSpeed, 7),
    sWaveSpeed: num(model.sWaveSpeed, 4),
    earthRadius: num(model.earthRadius, 6371),
    titleBarStyle: model.titleBarStyle,
    floatingNav: !!model.floatingNav,
    aiDomain: model.aiDomain || '',
    aiFullUrl: !!model.aiFullUrl,
    aiApiKey: model.aiApiKey || '',
    aiModel: model.aiModel || '',
    pushMode: model.pushMode,
    barkUrl: model.barkUrl || 'https://api.day.app/push',
    barkDeviceKey: model.barkDeviceKey || '',
    pushUrl: model.pushUrl || '',
    pushJsonTemplate: model.pushJsonTemplate || DEFAULT_PUSH_TEMPLATE,
    eqPushJsonTemplate: model.eqPushJsonTemplate || DEFAULT_EQ_PUSH_TEMPLATE
  };

  return {
    installDir: String(model.installDir || '').trim(),
    mode: model.mode,
    autoStart: !!model.autoStart,
    desktopShortcut: !!model.desktopShortcut,
    startMenuShortcut: !!model.startMenuShortcut,
    launchAfter: !!model.launchAfter,
    settings
  };
}

const PHASE_LABELS = {
  prepare: 'installer.progress.prepare',
  copy: 'installer.progress.copying',
  settings: 'installer.progress.settings',
  shortcuts: 'installer.progress.shortcuts',
  registry: 'installer.progress.registry'
};

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

async function beginInstall() {
  const config = buildConfig();
  if (!config.installDir) {
    stepIndex = STEPS.indexOf('options');
    showPage(stepIndex);
    return;
  }

  // 全新安装：把手动输入/选择的父目录规范为其下的 LaQuake 子目录；
  // 升级/覆盖安装必须沿用原目录，不做追加
  if (!upgradeMode) {
    const resolved = await window.installerAPI.resolveInstallDir(config.installDir);
    if (resolved.ok) {
      config.installDir = resolved.path;
      model.installDir = resolved.path;
      $('inInstallDir').value = resolved.path;
    }
  }

  if (!(await showAvConfirm())) return;

  installFailed = false;
  stepIndex = STEPS.indexOf('progress');
  showPage(stepIndex);
  $('progressRing').textContent = '⚙️';
  $('progressPercent').textContent = '0%';
  $('progressFill').style.width = '0%';
  $('progressFile').textContent = '';
  const errorBox = $('progressError');
  errorBox.style.display = 'none';
  errorBox.textContent = '';
  const cancelBtn = $('btnCancelInstall');
  cancelBtn.style.display = 'inline-block';
  cancelBtn.disabled = false;
  cancelBtn.textContent = t('installer.cancel');

  const result = await window.installerAPI.startInstall(config);
  if (result.ok) {
    stepIndex = STEPS.indexOf('finish');
    showPage(stepIndex);
  } else if (result.cancelled) {
    installFailed = true;
    cancelBtn.style.display = 'none';
    $('progressRing').textContent = 'ℹ️';
    $('progressPercent').textContent = '';
    $('progressStatus').textContent = t('installer.cancelled.title');
    $('progressFile').textContent = t('installer.cancelled.desc');
    updateFooter(stepIndex);
  } else {
    installFailed = true;
    cancelBtn.style.display = 'none';
    $('progressRing').textContent = '❌';
    $('progressStatus').textContent = '';
    errorBox.textContent = result.error;
    errorBox.style.display = 'block';
    updateFooter(stepIndex);
  }
}

function requestCancelInstall() {
  const cancelBtn = $('btnCancelInstall');
  cancelBtn.disabled = true;
  cancelBtn.textContent = t('installer.cancelling');
  window.installerAPI.cancelInstall();
}

window.installerAPI.onInstallProgress((data) => {
  if (data.phase === 'done') {
    $('progressPercent').textContent = '100%';
    $('progressFill').style.width = '100%';
    return;
  }
  if (data.phase === 'error' || data.phase === 'cancelled') return;
  if (PHASE_LABELS[data.phase]) {
    $('progressStatus').textContent = t(PHASE_LABELS[data.phase]);
  }
  if (data.phase !== 'copy' && data.phase !== 'prepare') {
    $('btnCancelInstall').style.display = 'none';
  }
  if (typeof data.percent === 'number' && data.phase === 'copy') {
    $('progressPercent').textContent = `${data.percent}%`;
    $('progressFill').style.width = `${data.percent}%`;
  }
  if (data.phase !== 'copy') {
    $('progressFill').style.width = '100%';
    $('progressPercent').textContent = '…';
  }
  if (data.file) $('progressFile').textContent = data.file;
});

async function init() {
  $('tbMin').addEventListener('click', () => window.installerAPI.winMinimize());
  $('tbClose').addEventListener('click', () => window.installerAPI.winClose());

  const context = await window.installerAPI.getContext();
  model.installDir = context.defaultInstallDir;
  $('railVersion').textContent = `v${context.version}`;
  $('metaSize').textContent = formatBytes(context.payloadSize);
  $('brandingImg').src = context.brandingPath;

  // 重复安装/升级：回填已有设置，向导各页显示当前值，避免被默认值覆盖
  const ex = context.existingSettings;
  if (ex && typeof ex === 'object') {
    [
      'language', 'eewSource', 'eewCWA', 'eqSource', 'autoLocate',
      'userLatitude', 'userLongitude', 'pWaveSpeed', 'sWaveSpeed', 'earthRadius',
      'titleBarStyle', 'floatingNav',
      'aiDomain', 'aiFullUrl', 'aiApiKey', 'aiModel',
      'pushMode', 'barkUrl', 'barkDeviceKey', 'pushUrl', 'pushJsonTemplate', 'eqPushJsonTemplate'
    ].forEach((key) => {
      if (ex[key] !== undefined && ex[key] !== null) model[key] = ex[key];
    });
    if (ex.appMode === 'eewcn' || ex.appMode === 'standalone') model.mode = ex.appMode;
    if (typeof ex.autoStart === 'boolean') model.autoStart = ex.autoStart;
  }

  await loadLanguage(model.language === 'en' ? 'en' : 'zh-CN');
  applyI18n();

  // 已安装（升级或同版本覆盖）：跳过全部向导，直接在原目录安装
  if (context.upgradeInfo) {
    enterUpgradeMode(context.upgradeInfo);
  } else {
    showPage(0);
  }
}

function enterUpgradeMode(info) {
  upgradeMode = true;
  model.installDir = info.installDir;
  document.body.classList.add('upgrade-mode');

  document.querySelectorAll('.page').forEach((el) => el.classList.remove('active'));
  document.querySelector('.page[data-page="upgrade"]').classList.add('active');
  document.querySelectorAll('.rail-item').forEach((el) => el.classList.remove('active', 'done'));

  $('upgradeOldVer').textContent = `v${info.oldVersion}`;
  $('upgradeNewVer').textContent = `v${info.newVersion}`;
  $('upgradeDir').textContent = info.installDir;
  $('upgradeTitle').textContent = t(info.isUpgrade ? 'installer.upgrade.title' : 'installer.upgrade.titleSame');
  $('upgradeDesc').textContent = t(info.isUpgrade ? 'installer.upgrade.desc' : 'installer.upgrade.descSame');
  $('upgradeNote').textContent = t('installer.upgrade.note');
  updateFooter('upgrade');
}

init();
