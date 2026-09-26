let currentPage = 'eew';
let settings = {};
let allEEWData = [];
let allEQData = [];
let previousPage = 'eew';

function t(key, ...args) {
  return window.electronAPI.t(key, ...args);
}

let toastTimer = null;
function showToast(message, type = 'error', duration = 2600) {
  const el = document.getElementById('app-toast');
  if (!el) return;
  el.textContent = message;
  el.className = `app-toast show ${type}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, duration);
}

function showConfirmDialog(message, callback) {
  const overlay = document.getElementById('app-confirm');
  const textEl = document.getElementById('app-confirm-text');
  const okBtn = document.getElementById('app-confirm-ok');
  const cancelBtn = document.getElementById('app-confirm-cancel');
  if (!overlay) {
    callback(true);
    return;
  }
  textEl.textContent = message;
  overlay.style.display = 'flex';

  const cleanup = (result) => {
    overlay.style.display = 'none';
    okBtn.onclick = null;
    cancelBtn.onclick = null;
    callback(result);
  };
  okBtn.onclick = () => cleanup(true);
  cancelBtn.onclick = () => cleanup(false);
}

function setupTitlebar() {
  const bind = (id, handler) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  };
  bind('minBtn', () => window.electronAPI.winMinimize());
  bind('macMinBtn', () => window.electronAPI.winMinimize());
  bind('maxBtn', () => window.electronAPI.winToggleMaximize());
  bind('macMaxBtn', () => window.electronAPI.winToggleMaximize());
  bind('closeBtn', () => window.electronAPI.winClose());
  bind('macCloseBtn', () => window.electronAPI.winClose());

  const statusBox = document.getElementById('statusBox');
  if (statusBox) statusBox.addEventListener('click', () => runHealthCheck(true));

  if (window.electronAPI.onMaximizeChange) {
    window.electronAPI.onMaximizeChange(updateMaximizeIcon);
  }

  const titlebar = document.getElementById('titlebar');
  if (titlebar) {
    titlebar.addEventListener('dblclick', (e) => {
      if (e.target.closest('button') || e.target.closest('.status')) return;
      window.electronAPI.winToggleMaximize();
    });
  }
  updateMaximizeIcon(window.electronAPI.winIsMaximized ? window.electronAPI.winIsMaximized() : false);
}

function updateMaximizeIcon(isMaximized) {
  const btn = document.getElementById('maxBtn');
  if (!btn) return;
  btn.innerHTML = isMaximized
    ? '<svg width="11" height="11" viewBox="0 0 12 12"><rect x="2.6" y="2.6" width="6.6" height="6.6" fill="none" stroke="currentColor" stroke-width="1"/><path d="M4 2.6 V1.6 H10.4 V8 H9.4" fill="none" stroke="currentColor" stroke-width="1"/></svg>'
    : '<svg width="11" height="11" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>';
}

let healthRunning = false;
async function runHealthCheck(manual) {
  if (healthRunning || !window.electronAPI.runHealthCheck) return;
  healthRunning = true;
  const dot = document.getElementById('statusDot');
  const textEl = document.getElementById('statusText');
  const pingEl = document.getElementById('statusPing');
  dot.className = 'status-dot checking';
  textEl.textContent = manual ? t('status.checking') : t('status.running');
  try {
    const r = await window.electronAPI.runHealthCheck();
    pingEl.textContent = (r.net && r.pingMs !== null) ? `${r.pingTarget} ${r.pingMs}ms` : '';
    if (r.api) {
      dot.className = 'status-dot ok';
      textEl.textContent = t('status.running');
    } else if (r.net) {
      dot.className = 'status-dot danger';
      textEl.textContent = t('status.apiError');
    } else {
      dot.className = 'status-dot danger';
      textEl.textContent = t('status.netError');
    }
  } catch (error) {
    dot.className = 'status-dot danger';
    textEl.textContent = t('status.netError');
    pingEl.textContent = '';
  } finally {
    healthRunning = false;
  }
}

function applyAppearance() {
  const style = settings.titleBarStyle === 'mac' ? 'mac' : 'windows';
  document.body.classList.toggle('titlebar-mac', style === 'mac');
  document.body.classList.toggle('floating-nav', !!settings.floatingNav);
  const radio = document.querySelector(`input[name="titleBarStyle"][value="${style}"]`);
  if (radio) radio.checked = true;
}

function translatePage() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const attr = el.getAttribute('data-i18n-attr');
    if (attr) {
      el.setAttribute(attr, t(key));
    } else {
      // Only set textContent if element has no child elements (safety check)
      if (el.children.length === 0) {
        el.textContent = t(key);
      } else {
        // Element has child elements - skip to avoid destroying them
        console.warn('translatePage: skipping element with children:', key, el.tagName);
      }
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    el.placeholder = t(key);
  });
  document.title = t('app.title');
  document.documentElement.lang = window.electronAPI.getCurrentLang();
}

function changeLanguage(lang) {
  try {
    window.electronAPI.setLanguage(lang);
  } catch (error) {
    console.error('Failed to set language:', error);
  }
  settings.language = lang;
  translatePage();
  if (currentPage === 'eew') {
    loadEEWHistory();
  } else if (currentPage === 'eq') {
    loadEQHistory();
  }
}

function init() {
  document.body.classList.add('normal-mode');

  try {
    const ver = `V${window.electronAPI.getVersion()}`;
    const badge = document.getElementById('appVersionBadge');
    const about = document.getElementById('appVersionAbout');
    if (badge) badge.textContent = ver;
    if (about) about.textContent = ver;
  } catch (error) {}

  setupTitlebar();
  setupAppearancePreview();
  loadSettings();
  translatePage();
  loadEEWHistory();
  loadEQHistory();
  setupEventListeners();
  runHealthCheck(true);
  setInterval(() => runHealthCheck(false), 120000);
}

function loadSettings() {
  try {
    settings = window.electronAPI.getSettings();
    applySettings();
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

function applySettings() {
  const eewSource = settings.eewSource || 'cenc';
  const radio = document.querySelector(`input[name="eewSource"][value="${eewSource}"]`);
  if (radio) radio.checked = true;
  document.getElementById('eqSource').value = settings.eqSource || 'cenc';
  document.getElementById('eewPollInterval').value = (settings.eewPollInterval || 1000) / 1000;
  document.getElementById('eewCount').value = settings.eewCount || 10;
  document.getElementById('eqPollInterval').value = (settings.eqPollInterval || 5000) / 1000;
  document.getElementById('eqCount').value = settings.eqCount || 20;
  document.getElementById('requestTimeout').value = (settings.requestTimeout || 30000) / 1000;
  loadPushSettingsUI();
  document.getElementById('minLocalIntensity').value = settings.minLocalIntensity || 0;
  document.getElementById('minEpicenterIntensity').value = settings.minEpicenterIntensity || 0;
  document.getElementById('minEQIntensity').value = settings.minEQIntensity || 0;
  document.getElementById('strongShakeIntensity').value = settings.strongShakeIntensity || 5;
  document.getElementById('criticalIntensity').value = settings.criticalIntensity || 1;
  document.getElementById('userLatitude').value = settings.userLatitude || 30.67;
  document.getElementById('userLongitude').value = settings.userLongitude || 104.07;
  document.getElementById('pWaveSpeed').value = settings.pWaveSpeed || 7;
  document.getElementById('sWaveSpeed').value = settings.sWaveSpeed || 4;
  document.getElementById('earthRadius').value = settings.earthRadius || 6371;

  toggleSwitchState('autoStart', getActualAutoStartState());
  toggleSwitchState('autoLocate', settings.autoLocate || false);
  toggleSwitchState('soundEnabled', settings.soundEnabled || true);
  toggleSwitchState('enableLogging', settings.enableLogging || false);
  toggleSwitchState('minimizeToTray', settings.minimizeToTray || true);
  toggleSwitchState('aiFullUrl', settings.aiFullUrl || false);
  toggleSwitchState('eewCWA', settings.eewCWA || false);
  toggleSwitchState('floatingNav', settings.floatingNav || false);
  applyAppearance();

  document.getElementById('aiDomain').value = settings.aiDomain || '';
  document.getElementById('aiApiKey').value = settings.aiApiKey || '';
  document.getElementById('aiModel').value = settings.aiModel || '';
  
  if (settings.language) {
    window.electronAPI.setLanguage(settings.language);
    const langSelect = document.getElementById('languageSelect');
    if (langSelect) langSelect.value = settings.language;
  }
}

function getActualAutoStartState() {
  try {
    return !!window.electronAPI.checkAutoStart();
  } catch (error) {
    return false;
  }
}

function toggleSwitchState(id, enabled) {
  const el = document.getElementById(id);
  if (enabled) {
    el.classList.add('active');
  } else {
    el.classList.remove('active');
  }
}

function setupEventListeners() {
  window.electronAPI.onEEWHistory((data) => {
    allEEWData = data || [];
    if (currentPage !== 'settings' && currentPage !== 'detail') {
      renderEEWList(data);
    }
  });

  window.electronAPI.onEQHistory((data) => {
    allEQData = data || [];
    if (currentPage !== 'settings' && currentPage !== 'detail') {
      renderEQList(data);
    }
  });

  window.electronAPI.onPlaySound = (filePath) => {
    playSound(filePath);
  };

  if (window.electronAPI.onAutoLocated) {
    window.electronAPI.onAutoLocated((data) => {
      if (!data || isNaN(parseFloat(data.lat)) || isNaN(parseFloat(data.lon))) return;
      const lat = Number(data.lat);
      const lon = Number(data.lon);
      settings.userLatitude = lat;
      settings.userLongitude = lon;
      const latEl = document.getElementById('userLatitude');
      const lonEl = document.getElementById('userLongitude');
      if (latEl) latEl.value = lat.toFixed(4);
      if (lonEl) lonEl.value = lon.toFixed(4);
      const statusEl = document.getElementById('locateStatus');
      if (statusEl && data.label) {
        statusEl.textContent = data.label;
        statusEl.style.color = '#34d399';
      }
    });
  }
  
  window.addEventListener('message', (event) => {
    if (event.data.type === 'playSound') {
      playSound(event.data.filePath);
    }
  });
  
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
      const inModal = e.target.closest('.modal-overlay');
      window.isInputFocused = !inModal;
    }
  });

  document.addEventListener('focusout', (e) => {
    const next = e.relatedTarget;
    if (next && (next.tagName === 'INPUT' || next.tagName === 'SELECT' || next.tagName === 'TEXTAREA')) {
      const inModal = next.closest && next.closest('.modal-overlay');
      window.isInputFocused = !inModal;
    } else {
      window.isInputFocused = false;
    }
  });
  
  document.addEventListener('click', (e) => {
    const listItem = e.target.closest('.list-item');
    if (listItem) {
      const type = listItem.dataset.type;
      const index = parseInt(listItem.dataset.index);
      if (type && !isNaN(index)) {
        const item = type === 'eew' ? allEEWData[index] : allEQData[index];
        if (item) {
          showDetail(type, item);
        }
      }
    }
  });
}

function switchPage(pageId) {
  previousPage = currentPage;
  currentPage = pageId;

  document.querySelectorAll('.page').forEach((page) => {
    page.classList.remove('active');
  });
  document.getElementById(`page-${pageId}`).classList.add('active');

  document.querySelectorAll('.nav-item').forEach((nav) => {
    nav.classList.remove('active');
  });
  
  const navItems = document.querySelectorAll('.nav-item');
  const navMap = { 'eew': 0, 'eq': 1, 'push': 2, 'settings': 3 };
  if (navItems[navMap[pageId]]) {
    navItems[navMap[pageId]].classList.add('active');
  }

  if (pageId === 'eew') {
    loadEEWHistory();
  } else if (pageId === 'eq') {
    loadEQHistory();
  } else if (pageId === 'settings') {
    openSettingsMenu();
  }
}

function openSettingsMenu() {
  const menu = document.getElementById('settings-menu');
  const detail = document.getElementById('settings-detail');
  if (menu) menu.style.display = 'block';
  if (detail) detail.style.display = 'none';
}

function openSettingsGroup(group) {
  const menu = document.getElementById('settings-menu');
  const detail = document.getElementById('settings-detail');
  if (menu) menu.style.display = 'none';
  if (detail) detail.style.display = 'block';
  document.querySelectorAll('[data-settings-group]').forEach(section => {
    section.style.display = section.dataset.settingsGroup === group ? 'block' : 'none';
  });
  const container = document.querySelector('#page-settings .settings-container');
  if (container) container.scrollTop = 0;
}

async function loadEEWHistory() {
  try {
    const data = await window.electronAPI.getEEWHistory(10);
    console.log('EEW History loaded:', data);
    allEEWData = data || [];
    renderEEWList(data);
  } catch (error) {
    console.error('Failed to load EEW history:', error);
  }
}

async function loadEQHistory() {
  try {
    const data = await window.electronAPI.getEQHistory(20);
    allEQData = data || [];
    renderEQList(data);
  } catch (error) {
    console.error('Failed to load EQ history:', error);
  }
}

function parseIntensityValue(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  const text = String(value).trim();
  const match = text.match(/\d+(\.\d+)?/);
  if (!match) return null;
  let num = parseFloat(match[0]);
  if (text.includes('弱') || text.includes('-')) num -= 0.25;
  else if (text.includes('強') || text.includes('强') || text.includes('+')) num += 0.25;
  return num;
}

function getEpicenterInfo(item) {
  if (item._intRegion === 'cn') {
    let num = item._epicenterIntensity === undefined || item._epicenterIntensity === null
      ? parseIntensityValue(item.MaxIntensity ?? item.max_intensity ?? item.intensity)
      : Number(item._epicenterIntensity);
    if (num === null || isNaN(num)) return { display: '—', value: 0 };
    num = Number(num);
    return { display: Number.isInteger(num) ? num : num.toFixed(1), value: num };
  }
  const raw = item.MaxIntensity ?? item.max_intensity ?? item.intensity ?? item.shindo;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const value = parseIntensityValue(raw);
    return { display: raw, value: value === null ? 0 : value };
  }
  const estimated = item._epicenterIntensity;
  const num = estimated === undefined || estimated === null ? 0 : Number(estimated);
  return { display: num, value: isNaN(num) ? 0 : num };
}

function getLocalIntensity(item) {
  const value = parseFloat(item._localIntensity);
  return isNaN(value) ? 0 : value;
}

function renderEEWList(data) {
  if (window.isInputFocused) return;
  
  const container = document.getElementById('eewList');
  
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <p>${t('eew.empty')}</p>
      </div>
    `;
    return;
  }

  console.log('renderEEWList called with:', data.length, 'items');

  container.innerHTML = data.map((item) => {
    const eventId = item.EventID || item.event_id || '';
    const magnitude = item.Magnitude || item.magnitude || item.Magunitude || '0';
    const localIntensity = getLocalIntensity(item);
    const epicenter = getEpicenterInfo(item);
    const reportNum = item.ReportNum || item.report_num || item.Serial || 0;
    const reportCount = item._reportCount || 1;
    const hypocenter = item.HypoCenter !== undefined && item.HypoCenter !== '' ? item.HypoCenter : (item.Hypocenter !== undefined && item.Hypocenter !== '' ? item.Hypocenter : (item.hypocenter !== undefined && item.hypocenter !== '' ? item.hypocenter : t('detail.unknownEpicenter')));
    const originTime = item.OriginTime || item.origin_time || '';
    const depth = item.Depth || item.depth || '';

    let severity = '';
    if (localIntensity >= 5) severity = 'danger';
    else if (localIntensity >= 3) severity = 'warning';
    else if (epicenter.value >= 5) severity = 'warning';

    return `
      <div class="list-item ${severity}" data-type="eew" data-index="${data.indexOf(item)}">
        <div class="list-item-header">
          <span class="list-item-title">${hypocenter} ${reportCount > 1 ? t('eew.reportCount', reportCount) : ''}</span>
          <span class="list-item-time">${formatTime(originTime)}</span>
        </div>
        <div class="list-item-info">
          <span>${t('label.magnitude')}: ${magnitude}</span>
          <span>${t('label.localIntensity')}: ${localIntensity.toFixed(1)}</span>
          <span>${t('label.epicenterIntensity')}: ${epicenter.display}</span>
          <span>${t('label.reportNum')}: ${reportNum}</span>
          ${depth !== undefined && depth !== null && depth !== '' ? `<span>${t('label.depth')}: ${depth}km</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function renderEQList(data) {
  if (window.isInputFocused) return;
  
  const container = document.getElementById('eqList');
  
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 20V10M8 20V4M3 20h18M3 4h18"/>
        </svg>
        <p>${t('eq.empty')}</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.map((item) => {
    const magnitude = item.magnitude || item.Magnitude || '0';
    const localIntensity = getLocalIntensity(item);
    const epicenter = getEpicenterInfo(item);
    const depth = item.depth || item.Depth || '';
    const location = item.location || item.placeName || item.place_name || item.Location || t('detail.unknown');
    const eqType = item.type || item.Type || '';
    const time = item.time || item.Time || '';

    let severity = '';
    if (localIntensity >= 5 || epicenter.value >= 5) severity = 'danger';
    else if (localIntensity >= 3 || epicenter.value >= 3) severity = 'warning';

    return `
      <div class="list-item ${severity}" data-type="eq" data-index="${data.indexOf(item)}">
        <div class="list-item-header">
          <span class="list-item-title">${location}</span>
          <span class="list-item-time">${formatTime(time)}</span>
        </div>
        <div class="list-item-info">
          <span>${t('label.magnitude')}: ${magnitude}</span>
          <span>${t('label.localIntensity')}: ${localIntensity.toFixed(1)}</span>
          <span>${t('label.epicenterIntensity')}: ${epicenter.display}</span>
          ${depth ? `<span>${t('label.depth')}: ${depth}</span>` : ''}
          ${eqType ? `<span>${t('eq.type')}: ${eqType === 'automatic' || eqType === 'Automatic' ? t('eq.type.auto') : t('eq.type.formal')}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function formatTime(timeStr) {
  if (!timeStr) return t('label.unknownTime');
  
  try {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) {
      return timeStr;
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (error) {
    return timeStr;
  }
}

function showDetail(type, item) {
  previousPage = currentPage;
  currentPage = 'detail';
  
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.remove('active');
  });
  document.getElementById('page-detail').classList.add('active');
  
  document.querySelectorAll('.nav-item').forEach((nav) => {
    nav.classList.remove('active');
  });
  
  renderDetail(type, item);
}

function goBack() {
  currentPage = previousPage;
  
  document.querySelectorAll('.page').forEach((page) => {
    page.classList.remove('active');
  });
  document.getElementById(`page-${currentPage}`).classList.add('active');
  
  const navItems = document.querySelectorAll('.nav-item');
  const navMap = { 'eew': 0, 'eq': 1, 'push': 2, 'settings': 3 };
  if (navItems[navMap[currentPage]]) {
    navItems[navMap[currentPage]].classList.add('active');
  }
}

function getTimeInSeconds(timeStr) {
  if (!timeStr) return 0;
  try {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) {
      const match = timeStr.match(/(\d{2})(\d{2})(\d{2})(\d{2})/);
      if (match) {
        const day = parseInt(match[1]);
        const hour = parseInt(match[2]);
        const minute = parseInt(match[3]);
        const second = parseInt(match[4]);
        return day * 86400 + hour * 3600 + minute * 60 + second;
      }
      return 0;
    }
    return date.getTime() / 1000;
  } catch (error) {
    return 0;
  }
}

function findRelatedEvents(mainItem, mainType) {
  const mainTime = getTimeInSeconds(mainItem.OriginTime || mainItem.origin_time || mainItem.time || mainItem.Time || '');
  
  let relatedEEW = [];
  let relatedEQ = [];
  
  if (mainType === 'eew') {
    relatedEEW = allEEWData.filter(eew => {
      const eewTime = getTimeInSeconds(eew.OriginTime || eew.origin_time || '');
      const eventId = eew.EventID || eew.event_id || '';
      const mainEventId = mainItem.EventID || mainItem.event_id || '';
      return eventId === mainEventId || Math.abs(eewTime - mainTime) < 10;
    }).sort((a, b) => {
      const aNum = a.ReportNum || a.Serial || 0;
      const bNum = b.ReportNum || b.Serial || 0;
      return bNum - aNum;
    });
    
    relatedEQ = allEQData.filter(eq => {
      const eqTime = getTimeInSeconds(eq.time || eq.Time || '');
      return Math.abs(eqTime - mainTime) < 10;
    });
  } else {
    relatedEQ = allEQData.filter(eq => {
      const eqTime = getTimeInSeconds(eq.time || eq.Time || '');
      return Math.abs(eqTime - mainTime) < 10;
    });
    
    relatedEEW = allEEWData.filter(eew => {
      const eewTime = getTimeInSeconds(eew.OriginTime || eew.origin_time || '');
      return Math.abs(eewTime - mainTime) < 10;
    }).sort((a, b) => {
      const aNum = a.ReportNum || a.Serial || 0;
      const bNum = b.ReportNum || b.Serial || 0;
      return bNum - aNum;
    });
  }
  
  return { relatedEEW, relatedEQ };
}

function renderDetail(type, item) {
  const { relatedEEW, relatedEQ } = findRelatedEvents(item, type);
  
  const title = item.HypoCenter || item.Hypocenter || item.hypocenter || item.location || item.placeName || item.place_name || item.Location || t('detail.unknown');
  document.getElementById('detail-title').textContent = title;
  
  const mainData = relatedEEW.length > 0 ? relatedEEW[0] : (relatedEQ.length > 0 ? relatedEQ[0] : item);
  
  const overviewLocation = title;
  const overviewMagnitude = mainData.Magnitude || mainData.magnitude || mainData.Magunitude || '0';
  const overviewDistance = mainData._distance !== undefined ? mainData._distance.toFixed(1) : (mainData.distance || '0');
  const overviewLocalIntensity = getLocalIntensity(mainData);
  const overviewEpicenter = getEpicenterInfo(mainData);
  const overviewIntensity = overviewLocalIntensity > 0 ? overviewLocalIntensity : overviewEpicenter.value;

  document.getElementById('overview-location').textContent = overviewLocation;
  document.getElementById('overview-magnitude').textContent = overviewMagnitude;
  document.getElementById('overview-distance').textContent = overviewDistance;
  document.getElementById('overview-intensity').textContent = Number.isInteger(overviewIntensity) ? overviewIntensity.toString() : overviewIntensity.toFixed(1);
  
  const eewSection = document.getElementById('detail-eew-section');
  const eqSection = document.getElementById('detail-eq-section');
  
  if (relatedEEW.length > 0) {
    eewSection.style.display = 'block';
    document.getElementById('detail-eew-list').innerHTML = relatedEEW.map(eew => {
      const localIntensity = getLocalIntensity(eew);
      const epicenter = getEpicenterInfo(eew);
      let severity = '';
      if (localIntensity >= 5) severity = 'danger';
      else if (localIntensity >= 3) severity = 'warning';
      else if (epicenter.value >= 5) severity = 'warning';
      
      return `
        <div class="detail-item ${severity}">
          <div class="detail-item-title">${eew.HypoCenter || eew.Hypocenter || eew.hypocenter || t('detail.unknownEpicenter')} ${eew.ReportNum ? t('eew.reportCount', eew.ReportNum) : ''}</div>
          <div class="detail-item-time">${t('label.originTime')}: ${formatTime(eew.OriginTime || eew.origin_time || '')} | ${t('label.reportTime')}: ${formatTime(eew.ReportTime || eew.report_time || '')}</div>
          <div class="detail-info-grid">
            <div class="detail-info-item"><label>${t('label.magnitude')}:</label><value>${eew.Magnitude || eew.magnitude || eew.Magunitude || '0'}</value></div>
            <div class="detail-info-item"><label>${t('label.epicenterIntensity')}:</label><value>${epicenter.display}</value></div>
            <div class="detail-info-item"><label>${t('label.localIntensity')}:</label><value>${localIntensity.toFixed(1)}</value></div>
            <div class="detail-info-item"><label>${t('label.depth')}:</label><value>${eew.Depth || eew.depth || t('label.unknown')}km</value></div>
            <div class="detail-info-item"><label>${t('label.latitude')}:</label><value>${eew.Latitude || eew.latitude || t('label.unknown')}</value></div>
            <div class="detail-info-item"><label>${t('label.longitude')}:</label><value>${eew.Longitude || eew.longitude || t('label.unknown')}</value></div>
            ${eew._distance ? `<div class="detail-info-item"><label>${t('label.distance')}:</label><value>${eew._distance.toFixed(1)}km</value></div>` : ''}
            ${eew._sWaveSeconds ? `<div class="detail-info-item"><label>${t('label.sWaveArrive')}:</label><value>${eew._sWaveSeconds.toFixed(1)}${t('label.second')}</value></div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    eewSection.style.display = 'none';
  }
  
  if (relatedEQ.length > 0) {
    eqSection.style.display = 'block';
    document.getElementById('detail-eq-list').innerHTML = relatedEQ.map(eq => {
      const localIntensity = getLocalIntensity(eq);
      const epicenter = getEpicenterInfo(eq);
      let severity = '';
      if (localIntensity >= 5 || epicenter.value >= 5) severity = 'danger';
      else if (localIntensity >= 3 || epicenter.value >= 3) severity = 'warning';
      
      return `
        <div class="detail-item ${severity}">
          <div class="detail-item-title">${eq.location || eq.placeName || eq.place_name || eq.Location || t('detail.unknown')} ${eq.type === 'automatic' || eq.type === 'Automatic' ? '(' + t('eew.autoReport') + ')' : '(' + t('eew.formalReport') + ')'}</div>
          <div class="detail-item-time">${t('label.originTime')}: ${formatTime(eq.time || eq.Time || '')}</div>
          <div class="detail-info-grid">
            <div class="detail-info-item"><label>${t('label.magnitude')}:</label><value>${eq.magnitude || eq.Magnitude || '0'}</value></div>
            <div class="detail-info-item"><label>${t('label.epicenterIntensity')}:</label><value>${epicenter.display}</value></div>
            <div class="detail-info-item"><label>${t('label.localIntensity')}:</label><value>${localIntensity.toFixed(1)}</value></div>
            <div class="detail-info-item"><label>${t('label.depth')}:</label><value>${eq.depth || eq.Depth || t('label.unknown')}km</value></div>
            <div class="detail-info-item"><label>${t('label.latitude')}:</label><value>${eq.latitude || eq.Latitude || t('label.unknown')}</value></div>
            <div class="detail-info-item"><label>${t('label.longitude')}:</label><value>${eq.longitude || eq.Longitude || t('label.unknown')}</value></div>
            ${eq.type ? `<div class="detail-info-item"><label>${t('eq.type')}:</label><value>${eq.type === 'automatic' || eq.type === 'Automatic' ? t('eew.auto') : t('eew.formal')}</value></div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    eqSection.style.display = 'none';
  }
}

function searchEarthquake() {
  const location = document.getElementById('overview-location').textContent;
  const magnitude = document.getElementById('overview-magnitude').textContent;
  
  const originTimeEl = document.querySelector('#detail-eew-list .detail-item-time');
  const timeStr = originTimeEl ? originTimeEl.textContent.replace(t('label.originTime') + ': ', '').split(' | ')[0] : '';
  
  const keyword = `${timeStr} ${location} ${magnitude} info`;
  
  window.electronAPI.searchEarthquake(keyword);
}

function summarizeEarthquake() {
  const aiDomain = settings.aiDomain || '';
  const aiFullUrl = settings.aiFullUrl || false;
  const aiApiKey = settings.aiApiKey || '';
  const aiModel = settings.aiModel || '';
  
  if (!aiDomain || !aiApiKey || !aiModel) {
    showToast(t('alert.ai.config'), 'error', 3200);
    return;
  }
  
  let apiUrl = aiDomain;
  if (aiFullUrl) {
    apiUrl = aiDomain.replace(/\/$/, '') + '/chat/completions';
  }
  
  const location = document.getElementById('overview-location').textContent;
  const magnitude = document.getElementById('overview-magnitude').textContent;
  
  const originTimeEl = document.querySelector('#detail-eew-list .detail-item-time');
  const timeStr = originTimeEl ? originTimeEl.textContent.replace(t('label.originTime') + ': ', '').split(' | ')[0] : '';
  
  const prompt = `${timeStr} ${location} ${magnitude} info`;
  
  const container = document.getElementById('ai-summary-container');
  const content = document.getElementById('ai-summary-content');
  
  container.style.display = 'block';
  content.innerHTML = '<div class="ai-loading">' + t('detail.ai.thinking') + '</div>';
  
  window.electronAPI.summarizeEarthquake(prompt, apiUrl, aiApiKey, aiModel, (data) => {
    if (data.type === 'chunk') {
      content.innerHTML = data.content;
    } else if (data.type === 'error') {
      content.innerHTML = `<div style="color: #ef4444;">${data.content}</div>`;
    } else if (data.type === 'done') {
      content.innerHTML = data.content;
    }
  });
}

function persistSetting(partial) {
  try {
    window.electronAPI.saveSettings(partial);
  } catch (error) {
    console.error('Failed to persist setting:', error);
  }
}

function toggleSwitch(id) {
  const el = document.getElementById(id);
  const isActive = el.classList.toggle('active');

  if (id === 'autoStart') {
    let ok = false;
    try {
      ok = window.electronAPI.setAutoStart(isActive);
    } catch (error) {
      console.error('Failed to set auto start:', error);
    }
    if (!ok) {
      el.classList.remove('active');
      showToast(t('settings.autoStart.fail'), 'error');
    } else {
      settings.autoStart = isActive;
      persistSetting({ autoStart: isActive });
    }
  }
  if (id === 'autoLocate') {
    if (isActive) {
      locateNow(true);
    } else {
      settings.autoLocate = false;
      persistSetting({ autoLocate: false });
    }
  }
  if (id === 'floatingNav') {
    document.body.classList.toggle('floating-nav', isActive);
  }
}

let locating = false;
async function locateNow(fromSwitch = false) {
  if (locating || !window.electronAPI.autoLocate) return;
  locating = true;
  const statusEl = document.getElementById('locateStatus');
  if (statusEl) {
    statusEl.textContent = t('settings.autoLocate.locating');
    statusEl.style.color = '#94a3b8';
  }
  const finishFail = () => {
    if (fromSwitch) toggleSwitchState('autoLocate', false);
    if (statusEl) statusEl.textContent = '';
    showToast(t('settings.autoLocate.fail'), 'error');
  };
  try {
    const result = await window.electronAPI.autoLocate();
    if (result && result.ok && !isNaN(parseFloat(result.lat)) && !isNaN(parseFloat(result.lon))) {
      const lat = Number(result.lat);
      const lon = Number(result.lon);
      const latText = lat.toFixed(4);
      const lonText = lon.toFixed(4);
      document.getElementById('userLatitude').value = latText;
      document.getElementById('userLongitude').value = lonText;
      settings.userLatitude = lat;
      settings.userLongitude = lon;
      const label = result.label || '';
      if (statusEl) {
        statusEl.textContent = label;
        statusEl.style.color = '#34d399';
      }
      if (fromSwitch) {
        settings.autoLocate = true;
        persistSetting({ autoLocate: true, userLatitude: lat, userLongitude: lon });
      }
      showToast(t('settings.autoLocate.success', label, latText, lonText), 'success');
    } else {
      finishFail();
    }
  } catch (error) {
    console.error('Failed to auto locate:', error);
    finishFail();
  } finally {
    locating = false;
  }
}

function setupAppearancePreview() {
  document.querySelectorAll('input[name="titleBarStyle"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.body.classList.toggle('titlebar-mac', radio.value === 'mac');
    });
  });
}

function testSound(soundName) {
  try {
    window.electronAPI.testSound(soundName);
  } catch (error) {
    console.error('Failed to test sound:', error);
  }
}

// 已导入的要石(kanameishi)模拟配置；非 null 时“发送”按 forms 时序推送多报
let importedSimConfig = null;

function toDatetimeLocalValue(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function setTestImportStatus(message, isError) {
  const el = document.getElementById('eewTestImportStatus');
  if (!el) return;
  if (!message) {
    el.style.display = 'none';
    el.textContent = '';
    el.classList.remove('error');
    return;
  }
  el.textContent = message;
  el.classList.toggle('error', !!isError);
  el.style.display = 'block';
}

function isAutoMaxIntensity(value) {
  if (value === undefined || value === null || value === '') return true;
  const text = String(value).trim();
  return text === '自动' || /^auto$/i.test(text);
}

// 用要石 forms 首报预填表单（仅用于预览；真正推送以完整配置时序为准）
function fillTestFormFromKanameishi(form) {
  const base = Date.now();
  const origin = new Date(base + (Number(form.originDelay) || 0) * 1000);
  const report = new Date(base + (Number(form.reportDelay) || 0) * 1000);
  document.getElementById('testReportTime').value = toDatetimeLocalValue(report);
  document.getElementById('testOriginTime').value = toDatetimeLocalValue(origin);
  document.getElementById('testReportNum').value = 1;
  document.getElementById('testHypoCenter').value = form.hypocenter || '';
  document.getElementById('testLatitude').value = form.lat ?? '';
  document.getElementById('testLongitude').value = form.lng ?? '';
  document.getElementById('testMagnitude').value = form.magnitude ?? '';
  document.getElementById('testDepth').value = form.depth ?? 10;
  document.getElementById('testMaxIntensity').value = isAutoMaxIntensity(form.maxIntensity) ? '' : form.maxIntensity;
}

// 兼容单条预警 JSON（wolfx API 风格 / 内部字段命名），取第一个可用值
function pickFirst(obj, keys) {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null && obj[key] !== '') return obj[key];
  }
  return '';
}

function normalizeTimeInput(value) {
  const text = String(value || '').trim().replace('T', ' ');
  // "YYYY-MM-DD HH:mm:ss" → datetime-local 需要的 "YYYY-MM-DDTHH:mm"
  return text.slice(0, 16).replace(' ', 'T');
}

function fillTestFormFromEEW(obj) {
  const setVal = (id, value) => {
    if (value !== '' && value !== null && value !== undefined) {
      document.getElementById(id).value = value;
    }
  };
  setVal('testReportTime', normalizeTimeInput(pickFirst(obj, ['ReportTime', 'report_time', 'AnnouncedTime'])));
  setVal('testOriginTime', normalizeTimeInput(pickFirst(obj, ['OriginTime', 'origin_time'])));
  setVal('testReportNum', pickFirst(obj, ['ReportNum', 'Serial']) || 1);
  setVal('testHypoCenter', pickFirst(obj, ['HypoCenter', 'Hypocenter', 'hypocenter', 'location']));
  setVal('testLatitude', pickFirst(obj, ['Latitude', 'latitude', 'lat']));
  setVal('testLongitude', pickFirst(obj, ['Longitude', 'longitude', 'lng', 'lon']));
  setVal('testMagnitude', pickFirst(obj, ['Magnitude', 'Magunitude', 'magnitude']));
  setVal('testDepth', pickFirst(obj, ['Depth', 'depth']));
  setVal('testMaxIntensity', pickFirst(obj, ['MaxIntensity', 'max_intensity', 'shindo', 'intensity']));
}

async function importTestEEWJson() {
  try {
    const res = await window.electronAPI.importTestEEWFile();
    if (!res || res.canceled) return;
    if (res.error) {
      setTestImportStatus(t('test.import.readFail') + res.error, true);
      showToast(t('test.import.readFail'), 'error');
      return;
    }
    let obj;
    try {
      obj = JSON.parse(res.content);
    } catch (error) {
      setTestImportStatus(t('test.import.invalid'), true);
      showToast(t('test.import.invalid'), 'error');
      return;
    }

    if (obj && typeof obj === 'object' && Array.isArray(obj.forms) && obj.forms.length > 0) {
      importedSimConfig = obj;
      fillTestFormFromKanameishi(obj.forms[0]);
      let message = t('test.import.loaded').replace('{n}', obj.forms.length);
      if (obj.id) message += ` ID: ${obj.id}`;
      if (obj.useShindo === true) message += `（${t('test.import.shindo')}）`;
      if (isAutoMaxIntensity(obj.forms[0].maxIntensity)) message += `（${t('test.import.autoNote')}）`;
      setTestImportStatus(message, false);
      showToast(t('test.import.ok'), 'success');
    } else if (
      obj && typeof obj === 'object' &&
      (pickFirst(obj, ['OriginTime', 'origin_time']) !== '' || pickFirst(obj, ['Latitude', 'latitude', 'lat']) !== '')
    ) {
      importedSimConfig = null;
      fillTestFormFromEEW(obj);
      setTestImportStatus(t('test.import.single'), false);
      showToast(t('test.import.ok'), 'success');
    } else {
      setTestImportStatus(t('test.import.invalid'), true);
      showToast(t('test.import.invalid'), 'error');
    }
  } catch (error) {
    console.error('Import test EEW JSON failed:', error);
    showToast(t('test.import.invalid'), 'error');
  }
}

// 按要石标准导出当前表单（单报，原点为发震时刻，报告延迟=报告时间-发震时间）
async function exportTestEEWJson() {
  const hypoCenter = document.getElementById('testHypoCenter').value.trim();
  const latitude = parseFloat(document.getElementById('testLatitude').value);
  const longitude = parseFloat(document.getElementById('testLongitude').value);
  const magnitude = parseFloat(document.getElementById('testMagnitude').value);
  const depth = parseInt(document.getElementById('testDepth').value, 10);
  const maxIntensity = parseInt(document.getElementById('testMaxIntensity').value, 10);

  const required = [
    ['testHypoCenter', hypoCenter],
    ['testLatitude', latitude],
    ['testLongitude', longitude],
    ['testMagnitude', magnitude],
    ['testDepth', depth],
    ['testMaxIntensity', maxIntensity]
  ];
  const invalid = required.find(([, value]) => value === '' || value === null || Number.isNaN(value));
  if (invalid) {
    showToast(t('alert.test.incomplete'), 'error');
    const el = document.getElementById(invalid[0]);
    if (el) { el.focus(); if (typeof el.select === 'function') el.select(); }
    return;
  }

  const rangeCheck = [
    ['testLatitude', latitude, -90, 90],
    ['testLongitude', longitude, -180, 180],
    ['testMagnitude', magnitude, 0, 12],
    ['testDepth', depth, 0, 1000],
    ['testMaxIntensity', maxIntensity, 0, 12]
  ];
  const outOfRange = rangeCheck.find(([, value, min, max]) => value < min || value > max);
  if (outOfRange) {
    showToast(t('alert.test.invalidRange'), 'error');
    const el = document.getElementById(outOfRange[0]);
    if (el) { el.focus(); if (typeof el.select === 'function') el.select(); }
    return;
  }

  let reportDelay = 0;
  const reportTimeVal = document.getElementById('testReportTime').value;
  const originTimeVal = document.getElementById('testOriginTime').value;
  if (reportTimeVal && originTimeVal) {
    const diff = (new Date(reportTimeVal).getTime() - new Date(originTimeVal).getTime()) / 1000;
    if (Number.isFinite(diff)) reportDelay = Math.max(0, Math.round(diff));
  }

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const idSuffix = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}`;

  const config = {
    id: `LaQuake${idSuffix}`,
    title: 'LaQuake 模拟预警',
    useShindo: false,
    forms: [
      {
        originDelay: 0,
        reportDelay,
        isAssumption: false,
        isWarn: false,
        isCanceled: false,
        hypocenter: hypoCenter,
        lat: latitude,
        lng: longitude,
        depth,
        magnitude,
        maxIntensity
      }
    ]
  };

  try {
    const res = await window.electronAPI.exportTestEEWFile(`${config.id}.json`, JSON.stringify(config, null, 2));
    if (!res || res.canceled) return;
    if (res.error) {
      showToast(t('test.export.fail'), 'error');
      return;
    }
    showToast(t('test.export.ok'), 'success');
  } catch (error) {
    console.error('Export test EEW JSON failed:', error);
    showToast(t('test.export.fail'), 'error');
  }
}

function showEEWTestModal() {
  const modal = document.getElementById('eewTestModal');
  if (importedSimConfig && Array.isArray(importedSimConfig.forms) && importedSimConfig.forms.length > 0) {
    // 已加载要石配置：预览首报的相对时刻（基准=此刻）
    fillTestFormFromKanameishi(importedSimConfig.forms[0]);
  } else {
    const now = new Date();
    const nowStr = toDatetimeLocalValue(now);
    document.getElementById('testReportTime').value = nowStr;
    document.getElementById('testOriginTime').value = nowStr;
  }
  modal.classList.add('show');
}

function closeEEWTestModal() {
  const modal = document.getElementById('eewTestModal');
  modal.classList.remove('show');
}

async function sendEEWTest() {
  // 已导入要石配置：按 forms 中各报的 reportDelay 时序自动推送，不走单报校验
  if (importedSimConfig) {
    try {
      const res = await window.electronAPI.sendTestEEWSequence(importedSimConfig);
      if (res && res.ok) {
        closeEEWTestModal();
        showToast(t('test.sequence.sent').replace('{n}', res.count), 'success');
      } else {
        showToast(t('test.sequence.fail'), 'error');
      }
    } catch (error) {
      console.error('Failed to run EEW simulation:', error);
      showToast(t('test.sequence.fail'), 'error');
    }
    return;
  }
  const fields = [
    { id: 'testReportTime', value: document.getElementById('testReportTime').value },
    { id: 'testReportNum', value: document.getElementById('testReportNum').value },
    { id: 'testOriginTime', value: document.getElementById('testOriginTime').value },
    { id: 'testHypoCenter', value: document.getElementById('testHypoCenter').value.trim() },
    { id: 'testLatitude', value: document.getElementById('testLatitude').value },
    { id: 'testLongitude', value: document.getElementById('testLongitude').value },
    { id: 'testMagnitude', value: document.getElementById('testMagnitude').value },
    { id: 'testDepth', value: document.getElementById('testDepth').value },
    { id: 'testMaxIntensity', value: document.getElementById('testMaxIntensity').value }
  ];

  const firstInvalid = fields.find(f => f.value === '' || f.value === null || f.value === undefined);
  if (firstInvalid) {
    showToast(t('alert.test.incomplete'), 'error');
    const el = document.getElementById(firstInvalid.id);
    if (el) {
      el.focus();
      if (typeof el.select === 'function') el.select();
    }
    return;
  }

  const reportTime = document.getElementById('testReportTime').value;
  const reportNum = parseInt(document.getElementById('testReportNum').value, 10);
  const originTime = document.getElementById('testOriginTime').value;
  const hypoCenter = document.getElementById('testHypoCenter').value.trim();
  const latitude = parseFloat(document.getElementById('testLatitude').value);
  const longitude = parseFloat(document.getElementById('testLongitude').value);
  const magnitude = parseFloat(document.getElementById('testMagnitude').value);
  const depth = parseInt(document.getElementById('testDepth').value, 10);
  const maxIntensity = parseInt(document.getElementById('testMaxIntensity').value, 10);

  const numericFields = [
    ['testLatitude', latitude, -90, 90],
    ['testLongitude', longitude, -180, 180],
    ['testMagnitude', magnitude, 0, 12],
    ['testDepth', depth, 0, 1000],
    ['testMaxIntensity', maxIntensity, 0, 12]
  ];
  const outOfRange = numericFields.find(([, val, min, max]) => isNaN(val) || val < min || val > max);
  if (outOfRange) {
    showToast(t('alert.test.invalidRange'), 'error');
    const el = document.getElementById(outOfRange[0]);
    if (el) {
      el.focus();
      el.select();
    }
    return;
  }

  const testData = {
    ReportTime: reportTime.replace('T', ' '),
    ReportNum: reportNum,
    OriginTime: originTime.replace('T', ' '),
    HypoCenter: hypoCenter,
    Latitude: latitude,
    Longitude: longitude,
    Magnitude: magnitude,
    Depth: depth,
    MaxIntensity: maxIntensity
  };

  try {
    window.electronAPI.sendTestEEW(testData);
    closeEEWTestModal();
    showToast(t('alert.test.sent'), 'success');
  } catch (error) {
    console.error('Failed to send test EEW:', error);
    showToast(t('alert.test.fail'), 'error');
  }
}

function playSound(filePath) {
  try {
    const audio = new Audio(`file:///${filePath.replace(/\\/g, '/')}`);
    audio.volume = 1.0;
    audio.play().catch((error) => {
      console.error('Failed to play sound:', error.message);
    });
  } catch (error) {
    console.error('Error playing sound:', error.message);
  }
}

function clearEEWHistory() {
  showConfirmDialog(t('alert.clearEEW.confirm'), (confirmed) => {
    if (!confirmed) return;
    try {
      window.electronAPI.clearEEWHistory();
      showToast(t('alert.clearEEW.success'), 'success');
    } catch (error) {
      console.error('Failed to clear EEW history:', error);
      showToast(t('alert.clearEEW.fail'), 'error');
    }
  });
}

function saveSettings() {
  const eewSourceRadio = document.querySelector('input[name="eewSource"]:checked');
  const newSettings = {
    language: document.getElementById('languageSelect').value || 'zh-CN',
    eewSource: eewSourceRadio ? eewSourceRadio.value : 'cenc',
    eewCWA: document.getElementById('eewCWA').classList.contains('active'),
    eqSource: document.getElementById('eqSource').value,
    eewPollInterval: parseInt(document.getElementById('eewPollInterval').value) * 1000,
    eewCount: parseInt(document.getElementById('eewCount').value),
    eqPollInterval: parseInt(document.getElementById('eqPollInterval').value) * 1000,
    eqCount: parseInt(document.getElementById('eqCount').value),
    requestTimeout: parseInt(document.getElementById('requestTimeout').value) * 1000,
    minLocalIntensity: parseFloat(document.getElementById('minLocalIntensity').value),
    minEpicenterIntensity: parseFloat(document.getElementById('minEpicenterIntensity').value),
    minEQIntensity: parseFloat(document.getElementById('minEQIntensity').value),
    strongShakeIntensity: parseFloat(document.getElementById('strongShakeIntensity').value),
    criticalIntensity: parseFloat(document.getElementById('criticalIntensity').value),
    userLatitude: parseFloat(document.getElementById('userLatitude').value),
    userLongitude: parseFloat(document.getElementById('userLongitude').value),
    autoLocate: document.getElementById('autoLocate').classList.contains('active'),
    pWaveSpeed: parseFloat(document.getElementById('pWaveSpeed').value),
    sWaveSpeed: parseFloat(document.getElementById('sWaveSpeed').value),
    earthRadius: parseInt(document.getElementById('earthRadius').value),
    autoStart: document.getElementById('autoStart').classList.contains('active'),
    soundEnabled: document.getElementById('soundEnabled').classList.contains('active'),
    enableLogging: document.getElementById('enableLogging').classList.contains('active'),
    minimizeToTray: document.getElementById('minimizeToTray').classList.contains('active'),
    titleBarStyle: (document.querySelector('input[name="titleBarStyle"]:checked') || {}).value || 'windows',
    floatingNav: document.getElementById('floatingNav').classList.contains('active'),
    aiDomain: document.getElementById('aiDomain').value,
    aiFullUrl: document.getElementById('aiFullUrl').classList.contains('active'),
    aiApiKey: document.getElementById('aiApiKey').value,
    aiModel: document.getElementById('aiModel').value
  };

  try {
    window.electronAPI.saveSettings(newSettings);
    settings = newSettings;
    showToast(t('alert.save.success'), 'success');
  } catch (error) {
    console.error('Failed to save settings:', error);
    showToast(t('alert.save.fail'), 'error');
  }
}

function resetSettings() {
  showConfirmDialog(t('alert.reset.confirm'), (confirmed) => {
    if (!confirmed) return;
    try {
      window.electronAPI.resetSettings();
      loadSettings();
      showToast(t('alert.reset.success'), 'success');
    } catch (error) {
      console.error('Failed to reset settings:', error);
      showToast(t('alert.save.fail'), 'error');
    }
  });
}

const DEFAULT_PUSH_JSON = '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "紧急地震预警！{FZSK}{ZZMC}发生{ZHENJI}级地震。预估本地烈度{YGLD}度，横波将于{TIME}秒后到达。预估有{YHCD}，请遵循{BXJY}.来自中国地震预警网。",\n  "level": "critical",\n  "sound": "alarm",\n  "volume": 10\n}';
const DEFAULT_EQ_PUSH_JSON = '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "地震速报：{FZSK}{ZZMC}发生{ZHENJI}级地震，预估本地烈度{YGLD}度，震中距{ZZJ}km。预估有{YHCD}，请遵循{BXJY}。来自中国地震预警网。",\n  "level": "timeSensitive",\n  "sound": "minuet",\n  "volume": 10\n}';

function loadPushSettingsUI() {
  const mode = settings.pushMode || 'simple';
  const modeRadio = document.querySelector(`input[name="pushMode"][value="${mode}"]`);
  if (modeRadio) modeRadio.checked = true;
  document.getElementById('barkUrl').value = settings.barkUrl || 'https://api.day.app/push';
  document.getElementById('barkDeviceKey').value = settings.barkDeviceKey || '';
  document.getElementById('pushUrl').value = settings.pushUrl || '';
  const tpl = settings.pushJsonTemplate;
  document.getElementById('pushJsonTemplate').value =
    tpl === undefined || tpl === null || String(tpl).trim() === '' ? DEFAULT_PUSH_JSON : tpl;
  const eqTpl = settings.eqPushJsonTemplate;
  document.getElementById('eqPushJsonTemplate').value =
    eqTpl === undefined || eqTpl === null || String(eqTpl).trim() === '' ? DEFAULT_EQ_PUSH_JSON : eqTpl;
  // 记录最后聚焦的模板编辑框，供变量插入按钮选择目标
  ['pushJsonTemplate', 'eqPushJsonTemplate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('focus', () => { lastFocusedPushTextarea = el; });
  });
  switchPushMode(mode);
}

function switchPushMode(mode) {
  const simplePanel = document.getElementById('pushSimplePanel');
  const proPanel = document.getElementById('pushProPanel');
  if (mode === 'pro') {
    simplePanel.style.display = 'none';
    proPanel.style.display = 'block';
  } else {
    simplePanel.style.display = 'block';
    proPanel.style.display = 'none';
  }
}

// 记录最后聚焦的模板编辑框，变量插入按钮据此选择目标
let lastFocusedPushTextarea = null;

function insertPushVar(token) {
  const textarea = lastFocusedPushTextarea || document.getElementById('pushJsonTemplate');
  const start = textarea.selectionStart !== null ? textarea.selectionStart : textarea.value.length;
  const end = textarea.selectionEnd !== null ? textarea.selectionEnd : textarea.value.length;
  textarea.value = textarea.value.slice(0, start) + token + textarea.value.slice(end);
  textarea.focus();
  textarea.selectionStart = textarea.selectionEnd = start + token.length;
}

function collectPushSettings() {
  const modeRadio = document.querySelector('input[name="pushMode"]:checked');
  return {
    ...settings,
    pushMode: modeRadio ? modeRadio.value : 'simple',
    barkUrl: document.getElementById('barkUrl').value.trim() || 'https://api.day.app/push',
    barkDeviceKey: document.getElementById('barkDeviceKey').value.trim(),
    pushUrl: document.getElementById('pushUrl').value.trim(),
    pushJsonTemplate: document.getElementById('pushJsonTemplate').value,
    eqPushJsonTemplate: document.getElementById('eqPushJsonTemplate').value
  };
}

function savePushSettings() {
  const updated = collectPushSettings();
  if (updated.pushMode === 'pro') {
    for (const id of ['pushJsonTemplate', 'eqPushJsonTemplate']) {
      try {
        JSON.parse(updated[id === 'pushJsonTemplate' ? 'pushJsonTemplate' : 'eqPushJsonTemplate']);
      } catch (error) {
        showToast(t('push.jsonInvalid'), 'error', 3200);
        document.getElementById(id).focus();
        return;
      }
    }
  } else if (!updated.barkDeviceKey) {
    showToast(t('push.deviceKey.required'), 'error');
    document.getElementById('barkDeviceKey').focus();
    return;
  }
  try {
    window.electronAPI.saveSettings(updated);
    settings = updated;
    showToast(t('alert.save.success'), 'success');
  } catch (error) {
    console.error('Failed to save push settings:', error);
    showToast(t('alert.save.fail'), 'error');
  }
}

async function testPushSettings() {
  const updated = collectPushSettings();
  if (updated.pushMode === 'pro') {
    for (const id of ['pushJsonTemplate', 'eqPushJsonTemplate']) {
      try {
        JSON.parse(updated[id === 'pushJsonTemplate' ? 'pushJsonTemplate' : 'eqPushJsonTemplate']);
      } catch (error) {
        showToast(t('push.jsonInvalid'), 'error', 3200);
        document.getElementById(id).focus();
        return;
      }
    }
  } else if (!updated.barkDeviceKey) {
    showToast(t('push.deviceKey.required'), 'error');
    document.getElementById('barkDeviceKey').focus();
    return;
  }
  window.electronAPI.saveSettings(updated);
  settings = updated;
  try {
    const result = await window.electronAPI.testPush();
    if (result && result.ok) {
      showToast(t('push.test.success'), 'success', 3200);
    } else {
      showToast(t('push.test.fail') + (result && result.error ? '：' + result.error : ''), 'error', 4000);
    }
  } catch (error) {
    console.error('Failed to test push:', error);
    showToast(t('push.test.fail'), 'error');
  }
}

function showAbout() {
  document.getElementById('about-modal').classList.add('active');
}

function closeAbout() {
  document.getElementById('about-modal').classList.remove('active');
}

function showDisclaimer() {
  document.getElementById('disclaimer-modal').classList.add('active');
}

function closeDisclaimer() {
  document.getElementById('disclaimer-modal').classList.remove('active');
}

document.addEventListener('DOMContentLoaded', init);
