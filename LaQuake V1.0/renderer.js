let currentPage = 'eew';
let settings = {};
let allEEWData = [];
let allEQData = [];
let previousPage = 'eew';
let selectedMode = '';

function init() {
  document.body.classList.add('normal-mode');
  
  window.electronAPI.onShowActivation(() => {
    showActivationFlow();
  });
  
  loadSettings();
  loadEEWHistory();
  loadEQHistory();
  setupEventListeners();
  
  document.getElementById('agree-check').addEventListener('change', (e) => {
    document.getElementById('agree-next-btn').disabled = !e.target.checked;
  });
}

function showActivationFlow() {
  const activationFlow = document.getElementById('activation-flow');
  if (activationFlow) {
    activationFlow.style.display = 'flex';
    document.body.classList.remove('normal-mode');
  }
}

function hideActivationFlow() {
  const activationFlow = document.getElementById('activation-flow');
  if (activationFlow) {
    activationFlow.style.display = 'none';
    document.body.classList.add('normal-mode');
  }
}

function nextActivationStep() {
  const steps = ['step-welcome', 'step-mode', 'step-agreement'];
  let currentStep = '';
  
  steps.forEach((stepId) => {
    if (document.getElementById(stepId).classList.contains('active')) {
      currentStep = stepId;
    }
  });
  
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex < steps.length - 1) {
    document.getElementById(currentStep).classList.remove('active');
    document.getElementById(steps[currentIndex + 1]).classList.add('active');
  }
}

function prevActivationStep() {
  const steps = ['step-welcome', 'step-mode', 'step-agreement'];
  let currentStep = '';
  
  steps.forEach((stepId) => {
    if (document.getElementById(stepId).classList.contains('active')) {
      currentStep = stepId;
    }
  });
  
  const currentIndex = steps.indexOf(currentStep);
  if (currentIndex > 0) {
    document.getElementById(currentStep).classList.remove('active');
    document.getElementById(steps[currentIndex - 1]).classList.add('active');
  }
}

function selectMode(mode) {
  selectedMode = mode;
  
  document.querySelectorAll('.mode-option').forEach((el) => {
    el.classList.remove('selected');
  });
  
  if (mode === 'eewcn') {
    document.querySelector('.mode-option[onclick="selectMode(\'eewcn\')"]').classList.add('selected');
    document.getElementById('mode-warning').style.display = 'block';
  } else {
    document.querySelector('.mode-option[onclick="selectMode(\'standalone\')"]').classList.add('selected');
    document.getElementById('mode-warning').style.display = 'none';
  }
  
  document.getElementById('mode-next-btn').disabled = false;
}

function completeActivation() {
  const soundMap = window.electronAPI.completeActivation(selectedMode);
  
  if (soundMap && selectedMode === 'eewcn') {
    for (const [key, value] of Object.entries(soundMap)) {
      const el = document.getElementById(key);
      if (el) {
        el.value = value;
      }
    }
    
    const newSettings = { ...settings, ...soundMap };
    try {
      window.electronAPI.saveSettings(newSettings);
      settings = newSettings;
    } catch (error) {
      console.error('Failed to save sound settings:', error);
    }
  }
  
  hideActivationFlow();
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
  document.getElementById('eewSource').value = settings.eewSource || 'sc';
  document.getElementById('eqSource').value = settings.eqSource || 'cenc';
  document.getElementById('eewPollInterval').value = (settings.eewPollInterval || 1000) / 1000;
  document.getElementById('eewCount').value = settings.eewCount || 10;
  document.getElementById('eqPollInterval').value = (settings.eqPollInterval || 5000) / 1000;
  document.getElementById('eqCount').value = settings.eqCount || 20;
  document.getElementById('requestTimeout').value = (settings.requestTimeout || 30000) / 1000;
  document.getElementById('eewPostUrl').value = settings.eewPostUrl || '';
  document.getElementById('eqPostUrl').value = settings.eqPostUrl || '';
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

  toggleSwitchState('autoStart', settings.autoStart || false);
  toggleSwitchState('soundEnabled', settings.soundEnabled || true);
  toggleSwitchState('enableLogging', settings.enableLogging || false);
  toggleSwitchState('minimizeToTray', settings.minimizeToTray || true);
  
  document.getElementById('aiDomain').value = settings.aiDomain || '';
  document.getElementById('aiApiKey').value = settings.aiApiKey || '';
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

  window.electronAPI.onCriticalAlert((data) => {
    showCriticalAlert(data);
  });

  window.electronAPI.onEEWAlert((data) => {
    const { eew, distance, sWaveSeconds } = data;
    const epicenterIntensity = parseFloat(eew.MaxIntensity || eew.max_intensity || 0);
    
    if (epicenterIntensity >= 4 && epicenterIntensity < 6) {
      showCriticalAlert(data);
    }
  });

  window.electronAPI.onSWaveCountdown((seconds) => {
    updateCountdown(seconds);
  });

  window.electronAPI.onSWaveArrived((data) => {
    handleSWaveArrived(data);
  });
  
  window.electronAPI.onPlaySound = (filePath) => {
    playSound(filePath);
  };
  
  window.addEventListener('message', (event) => {
    if (event.data.type === 'playSound') {
      playSound(event.data.filePath);
    }
  });
  
  document.addEventListener('focusin', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
      window.isInputFocused = true;
    }
  });
  
  document.addEventListener('focusout', () => {
    window.isInputFocused = false;
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
  const navMap = { 'eew': 0, 'eq': 1, 'settings': 2 };
  if (navItems[navMap[pageId]]) {
    navItems[navMap[pageId]].classList.add('active');
  }

  if (pageId === 'eew') {
    loadEEWHistory();
  } else if (pageId === 'eq') {
    loadEQHistory();
  }
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

function renderEEWList(data) {
  if (window.isInputFocused) return;
  
  const container = document.getElementById('eewList');
  
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
        </svg>
        <p>暂无地震预警记录</p>
      </div>
    `;
    return;
  }

  console.log('renderEEWList called with:', data.length, 'items');

  container.innerHTML = data.map((item) => {
    const eventId = item.EventID || item.event_id || '';
    const magnitude = item.Magnitude || item.magnitude || item.Magunitude || '0';
    const localIntensity = parseFloat(item._localIntensity || '0');
    const epicenterIntensity = parseFloat(item.MaxIntensity || item.max_intensity || '0');
    const reportNum = item.ReportNum || item.report_num || item.Serial || 0;
    const reportCount = item._reportCount || 1;
    const hypocenter = item.HypoCenter !== undefined && item.HypoCenter !== '' ? item.HypoCenter : (item.hypocenter !== undefined && item.hypocenter !== '' ? item.hypocenter : '未知震源');
    const originTime = item.OriginTime || item.origin_time || '';
    const depth = item.Depth || item.depth || '';
    
    let severity = '';
    if (localIntensity >= 5) severity = 'danger';
    else if (localIntensity >= 3) severity = 'warning';
    else if (epicenterIntensity >= 5) severity = 'warning';

    return `
      <div class="list-item ${severity}" data-type="eew" data-index="${data.indexOf(item)}">
        <div class="list-item-header">
          <span class="list-item-title">${hypocenter} ${reportCount > 1 ? `(第${reportCount}报)` : ''}</span>
          <span class="list-item-time">${formatTime(originTime)}</span>
        </div>
        <div class="list-item-info">
          <span>震级: ${magnitude}</span>
          <span>本地烈度: ${localIntensity.toFixed(1)}</span>
          <span>震中烈度: ${epicenterIntensity}</span>
          <span>报数: ${reportNum}</span>
          ${depth !== undefined && depth !== null && depth !== '' ? `<span>深度: ${depth}km</span>` : ''}
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
        <p>暂无地震速报记录</p>
      </div>
    `;
    return;
  }

  container.innerHTML = data.map((item) => {
    const magnitude = item.magnitude || item.Magnitude || '0';
    const intensity = parseFloat(item.intensity || item.shindo || '0');
    const depth = item.depth || item.Depth || '';
    const location = item.location || item.placeName || item.place_name || item.Location || '未知地点';
    const eqType = item.type || item.Type || '';
    const time = item.time || item.Time || '';
    
    let severity = '';
    if (intensity >= 5) severity = 'danger';
    else if (intensity >= 3) severity = 'warning';

    return `
      <div class="list-item ${severity}" data-type="eq" data-index="${data.indexOf(item)}">
        <div class="list-item-header">
          <span class="list-item-title">${location}</span>
          <span class="list-item-time">${formatTime(time)}</span>
        </div>
        <div class="list-item-info">
          <span>震级: ${magnitude}</span>
          <span>烈度: ${intensity}</span>
          ${depth ? `<span>深度: ${depth}</span>` : ''}
          ${eqType ? `<span>类型: ${eqType === 'automatic' || eqType === 'Automatic' ? '自动' : '正式'}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function formatTime(timeStr) {
  if (!timeStr) return '未知时间';
  
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
  const navMap = { 'eew': 0, 'eq': 1, 'settings': 2 };
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
    });
  }
  
  return { relatedEEW, relatedEQ };
}

function renderDetail(type, item) {
  const { relatedEEW, relatedEQ } = findRelatedEvents(item, type);
  
  const title = item.HypoCenter || item.hypocenter || item.location || item.placeName || item.place_name || item.Location || '未知地震';
  document.getElementById('detail-title').textContent = title;
  
  const mainData = relatedEEW.length > 0 ? relatedEEW[0] : (relatedEQ.length > 0 ? relatedEQ[0] : item);
  
  const overviewLocation = title;
  const overviewMagnitude = mainData.Magnitude || mainData.magnitude || mainData.Magunitude || '0';
  const overviewDistance = mainData._distance !== undefined ? mainData._distance.toFixed(1) : (mainData.distance || '0');
  const overviewIntensity = parseFloat(mainData.MaxIntensity || mainData.max_intensity || mainData.intensity || mainData.shindo || mainData._localIntensity || '0');
  
  document.getElementById('overview-location').textContent = overviewLocation;
  document.getElementById('overview-magnitude').textContent = overviewMagnitude;
  document.getElementById('overview-distance').textContent = overviewDistance;
  document.getElementById('overview-intensity').textContent = overviewIntensity.toFixed(1);
  
  const eewSection = document.getElementById('detail-eew-section');
  const eqSection = document.getElementById('detail-eq-section');
  
  if (relatedEEW.length > 0) {
    eewSection.style.display = 'block';
    document.getElementById('detail-eew-list').innerHTML = relatedEEW.map(eew => {
      const localIntensity = parseFloat(eew._localIntensity || '0');
      const epicenterIntensity = parseFloat(eew.MaxIntensity || eew.max_intensity || '0');
      let severity = '';
      if (localIntensity >= 5) severity = 'danger';
      else if (localIntensity >= 3) severity = 'warning';
      else if (epicenterIntensity >= 5) severity = 'warning';
      
      return `
        <div class="detail-item ${severity}">
          <div class="detail-item-title">${eew.Hypocenter || eew.hypocenter || '未知震源'} ${eew.ReportNum ? `(第${eew.ReportNum}报)` : ''}</div>
          <div class="detail-item-time">发震时间: ${formatTime(eew.OriginTime || eew.origin_time || '')} | 报告时间: ${formatTime(eew.ReportTime || eew.report_time || '')}</div>
          <div class="detail-info-grid">
            <div class="detail-info-item"><label>震级:</label><value>${eew.Magnitude || eew.magnitude || eew.Magunitude || '0'}</value></div>
            <div class="detail-info-item"><label>震中烈度:</label><value>${epicenterIntensity}</value></div>
            <div class="detail-info-item"><label>本地烈度:</label><value>${localIntensity.toFixed(1)}</value></div>
            <div class="detail-info-item"><label>深度:</label><value>${eew.Depth || eew.depth || '未知'}km</value></div>
            <div class="detail-info-item"><label>纬度:</label><value>${eew.Latitude || eew.latitude || '未知'}</value></div>
            <div class="detail-info-item"><label>经度:</label><value>${eew.Longitude || eew.longitude || '未知'}</value></div>
            ${eew._distance ? `<div class="detail-info-item"><label>震中距:</label><value>${eew._distance.toFixed(1)}km</value></div>` : ''}
            ${eew._sWaveSeconds ? `<div class="detail-info-item"><label>横波到达:</label><value>${eew._sWaveSeconds.toFixed(1)}秒</value></div>` : ''}
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
      const intensity = parseFloat(eq.intensity || eq.shindo || '0');
      let severity = '';
      if (intensity >= 5) severity = 'danger';
      else if (intensity >= 3) severity = 'warning';
      
      return `
        <div class="detail-item ${severity}">
          <div class="detail-item-title">${eq.location || eq.placeName || eq.place_name || eq.Location || '未知地点'} ${eq.type === 'automatic' || eq.type === 'Automatic' ? '(自动速报)' : '(正式速报)'}</div>
          <div class="detail-item-time">发震时间: ${formatTime(eq.time || eq.Time || '')}</div>
          <div class="detail-info-grid">
            <div class="detail-info-item"><label>震级:</label><value>${eq.magnitude || eq.Magnitude || '0'}</value></div>
            <div class="detail-info-item"><label>烈度:</label><value>${intensity}</value></div>
            <div class="detail-info-item"><label>深度:</label><value>${eq.depth || eq.Depth || '未知'}km</value></div>
            <div class="detail-info-item"><label>纬度:</label><value>${eq.latitude || eq.Latitude || '未知'}</value></div>
            <div class="detail-info-item"><label>经度:</label><value>${eq.longitude || eq.Longitude || '未知'}</value></div>
            ${eq.type ? `<div class="detail-info-item"><label>类型:</label><value>${eq.type === 'automatic' || eq.type === 'Automatic' ? '自动' : '正式'}</value></div>` : ''}
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
  const timeStr = originTimeEl ? originTimeEl.textContent.replace('发震时间: ', '').split(' | ')[0] : '';
  
  const keyword = `${timeStr} ${location} ${magnitude} 相关信息`;
  
  window.electronAPI.searchEarthquake(keyword);
}

function summarizeEarthquake() {
  const aiDomain = settings.aiDomain || '';
  const aiApiKey = settings.aiApiKey || '';
  
  if (!aiDomain || !aiApiKey) {
    alert('请先在设置页面配置AI域名和API密钥');
    return;
  }
  
  const location = document.getElementById('overview-location').textContent;
  const magnitude = document.getElementById('overview-magnitude').textContent;
  
  const originTimeEl = document.querySelector('#detail-eew-list .detail-item-time');
  const timeStr = originTimeEl ? originTimeEl.textContent.replace('发震时间: ', '').split(' | ')[0] : '';
  
  const prompt = `${timeStr} ${location} ${magnitude} 相关信息`;
  
  const container = document.getElementById('ai-summary-container');
  const content = document.getElementById('ai-summary-content');
  
  container.style.display = 'block';
  content.innerHTML = '<div class="ai-loading">正在思考中...</div>';
  
  window.electronAPI.summarizeEarthquake(prompt, aiDomain, aiApiKey, (data) => {
    if (data.type === 'chunk') {
      content.innerHTML = data.content;
    } else if (data.type === 'error') {
      content.innerHTML = `<div style="color: #ef4444;">${data.content}</div>`;
    } else if (data.type === 'done') {
      content.innerHTML = data.content;
    }
  });
}

function toggleSwitch(id) {
  const el = document.getElementById(id);
  const isActive = el.classList.toggle('active');
  
  if (id === 'autoStart') {
    try {
      window.electronAPI.setAutoStart(isActive);
    } catch (error) {
      console.error('Failed to set auto start:', error);
    }
  }
}

function testSound(soundName) {
  try {
    window.electronAPI.testSound(soundName);
  } catch (error) {
    console.error('Failed to test sound:', error);
  }
}

function showEEWTestModal() {
  const modal = document.getElementById('eewTestModal');
  const now = new Date();
  const nowStr = now.toISOString().slice(0, 16);
  
  document.getElementById('testReportTime').value = nowStr;
  document.getElementById('testOriginTime').value = nowStr;
  
  modal.classList.add('show');
}

function closeEEWTestModal() {
  const modal = document.getElementById('eewTestModal');
  modal.classList.remove('show');
}

function sendEEWTest() {
  const reportTime = document.getElementById('testReportTime').value;
  const reportNum = parseInt(document.getElementById('testReportNum').value);
  const originTime = document.getElementById('testOriginTime').value;
  const hypoCenter = document.getElementById('testHypoCenter').value;
  const latitude = parseFloat(document.getElementById('testLatitude').value);
  const longitude = parseFloat(document.getElementById('testLongitude').value);
  const magnitude = parseFloat(document.getElementById('testMagnitude').value);
  const depth = parseInt(document.getElementById('testDepth').value);
  const maxIntensity = parseInt(document.getElementById('testMaxIntensity').value);
  
  if (!reportTime || !originTime || !hypoCenter) {
    alert('请填写完整的测试数据');
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
    alert('测试预警已发送');
  } catch (error) {
    console.error('Failed to send test EEW:', error);
    alert('发送测试预警失败');
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
  if (!confirm('确定要清除所有预警历史记录吗？此操作不可撤销。')) {
    return;
  }
  
  try {
    window.electronAPI.clearEEWHistory();
    alert('预警列表已清除');
  } catch (error) {
    console.error('Failed to clear EEW history:', error);
    alert('清除预警列表失败');
  }
}

function saveSettings() {
  const newSettings = {
    eewSource: document.getElementById('eewSource').value,
    eqSource: document.getElementById('eqSource').value,
    eewPollInterval: parseInt(document.getElementById('eewPollInterval').value) * 1000,
    eewCount: parseInt(document.getElementById('eewCount').value),
    eqPollInterval: parseInt(document.getElementById('eqPollInterval').value) * 1000,
    eqCount: parseInt(document.getElementById('eqCount').value),
    requestTimeout: parseInt(document.getElementById('requestTimeout').value) * 1000,
    eewPostUrl: document.getElementById('eewPostUrl').value,
    eqPostUrl: document.getElementById('eqPostUrl').value,
    minLocalIntensity: parseFloat(document.getElementById('minLocalIntensity').value),
    minEpicenterIntensity: parseFloat(document.getElementById('minEpicenterIntensity').value),
    minEQIntensity: parseFloat(document.getElementById('minEQIntensity').value),
    strongShakeIntensity: parseFloat(document.getElementById('strongShakeIntensity').value),
    criticalIntensity: parseFloat(document.getElementById('criticalIntensity').value),
    userLatitude: parseFloat(document.getElementById('userLatitude').value),
    userLongitude: parseFloat(document.getElementById('userLongitude').value),
    pWaveSpeed: parseFloat(document.getElementById('pWaveSpeed').value),
    sWaveSpeed: parseFloat(document.getElementById('sWaveSpeed').value),
    earthRadius: parseInt(document.getElementById('earthRadius').value),
    autoStart: document.getElementById('autoStart').classList.contains('active'),
    soundEnabled: document.getElementById('soundEnabled').classList.contains('active'),
    enableLogging: document.getElementById('enableLogging').classList.contains('active'),
    minimizeToTray: document.getElementById('minimizeToTray').classList.contains('active'),
    aiDomain: document.getElementById('aiDomain').value,
    aiApiKey: document.getElementById('aiApiKey').value
  };

  try {
    window.electronAPI.saveSettings(newSettings);
    settings = newSettings;
    alert('设置已保存');
  } catch (error) {
    console.error('Failed to save settings:', error);
    alert('保存设置失败');
  }
}

function resetSettings() {
  if (confirm('确定要恢复默认设置吗？')) {
    try {
      window.electronAPI.resetSettings();
      loadSettings();
      alert('已恢复默认设置');
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  }
}

function showAbout() {
  document.getElementById('about-modal').classList.add('active');
}

function closeAbout() {
  document.getElementById('about-modal').classList.remove('active');
}

function showCriticalAlert(data) {
  const alertOverlay = document.getElementById('criticalAlert');
  const { eew, localIntensity, distance, sWaveSeconds } = data;
  
  const reportNum = eew.ReportNum || eew.Serial || 0;
  const epicenterIntensity = eew.MaxIntensity || eew.max_intensity || '0';
  
  document.getElementById('alertInfo').textContent = eew.Hypocenter || eew.hypocenter || '未知';
  document.getElementById('alertMagnitude').textContent = `M${eew.Magnitude || eew.Magunitude || eew.magnitude || '0'}`;
  document.getElementById('alertIntensity').textContent = `${epicenterIntensity}度`;
  
  const advice = getSafetyAdvice(parseFloat(epicenterIntensity));
  const alertText = reportNum > 0 
    ? `第${reportNum}报 - ${advice}` 
    : advice;
  document.getElementById('alertAdvice').textContent = alertText;
  
  document.body.classList.remove('normal-mode');
  document.body.classList.add('alert-mode');
  alertOverlay.classList.add('active');
}

function updateCountdown(seconds) {
}

function handleSWaveArrived(data) {
}

function closeAlert() {
  const alertOverlay = document.getElementById('criticalAlert');
  alertOverlay.classList.remove('active');
  
  alertOverlay.style.animation = 'none';
  
  document.body.classList.remove('alert-mode');
  document.body.classList.add('normal-mode');
  window.isInputFocused = false;
  
  setTimeout(() => {
    document.body.focus();
    
    const activePage = document.querySelector('.page.active');
    if (activePage) {
      const inputElements = activePage.querySelectorAll('input, select');
      if (inputElements.length > 0) {
        inputElements[0].focus();
      }
    }
  }, 100);
  
  try {
    window.electronAPI.closeAlert();
  } catch (error) {
    console.error('Failed to close alert:', error);
  }
}

function getSafetyAdvice(intensity) {
  if (intensity >= 6) {
    return '强震预警！立即寻找坚固的桌子或支撑物下方躲避，保护头部！远离窗户、玻璃和重物。';
  } else if (intensity >= 4) {
    return '中震预警！立即停止工作，寻找安全地方躲避。';
  } else {
    return '弱震预警！注意观察周围情况，准备应急措施。';
  }
}

document.addEventListener('DOMContentLoaded', init);
