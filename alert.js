let countdownTimer = null;
let remaining = 0;
// 横波理论到达时刻（本机时钟轴，毫秒）。倒计时始终与该绝对时刻比较，
// 不依赖收到/展示预警的时机，也不会随渲染层计时器累积漂移
let arrivalTimestamp = null;

function t(key) {
  try {
    return window.electronAPI && window.electronAPI.t ? window.electronAPI.t(key) : key;
  } catch (error) {
    return key;
  }
}

function renderCountdown() {
  const numEl = document.getElementById('countdownNum');
  const unitEl = document.getElementById('countdownUnit');
  if (remaining > 0) {
    numEl.textContent = remaining;
    numEl.classList.remove('arrived');
    unitEl.textContent = '秒';
  } else {
    numEl.textContent = '横波已到达';
    numEl.classList.add('arrived');
    unitEl.textContent = '';
  }
}

function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
}

// 锚定绝对到达时刻：每 250ms 用“到达时刻 - 当前时刻”重算，
// 展示前已经过去的传播时间（预警发出、传输、渲染耗时）天然被扣除
function refreshByArrivalTime() {
  const remainMs = arrivalTimestamp - Date.now();
  remaining = Math.max(0, Math.ceil(remainMs / 1000));
  renderCountdown();
  if (remainMs <= 0) stopCountdown();
}

// 兼容路径：主进程未给绝对到达时刻时，退化为按秒递减
function tickBySeconds() {
  if (remaining > 0) {
    remaining -= 1;
    renderCountdown();
  } else {
    stopCountdown();
  }
}

function startCountdown(seconds, arrivalTs) {
  stopCountdown();
  if (Number.isFinite(arrivalTs)) {
    arrivalTimestamp = arrivalTs;
    refreshByArrivalTime();
    if (arrivalTimestamp > Date.now()) {
      countdownTimer = setInterval(refreshByArrivalTime, 250);
    }
  } else {
    arrivalTimestamp = null;
    remaining = Math.max(0, parseInt(seconds, 10) || 0);
    renderCountdown();
    if (remaining > 0) {
      countdownTimer = setInterval(tickBySeconds, 1000);
    }
  }
}

let alertMapCtrl = null;
let alertMapInited = false;

function getAlertSettings() {
  try {
    return window.electronAPI && window.electronAPI.getSettings ? window.electronAPI.getSettings() : {};
  } catch (error) {
    return {};
  }
}

function getAlertCoord(eew) {
  const lat = parseFloat(eew.Latitude !== undefined ? eew.Latitude : eew.latitude);
  const lon = parseFloat(eew.Longitude !== undefined ? eew.Longitude : eew.longitude);
  return { lat, lon };
}

function renderAlertMap(data) {
  // 地图总开关或“预警弹窗地图”子开关关闭时：折叠整个地图区，
  // 不创建 Leaflet 实例、不请求任何瓦片（多报续报时会按最新设置重新判定）
  const wrap = document.getElementById('alertMapWrap');
  const s = getAlertSettings();
  const mapAllowed = !!window.SeismicMap && s.mapEnabled !== false && s.mapAlertEnabled !== false;
  if (wrap) wrap.style.display = mapAllowed ? '' : 'none';
  if (!mapAllowed) return;

  const eew = data.eew || {};
  const coord = getAlertCoord(eew);
  if (isNaN(coord.lat) || isNaN(coord.lon)) return;

  const hypocenter = eew.HypoCenter || eew.Hypocenter || eew.hypocenter || '未知地区';
  const magnitude = eew.Magnitude || eew.Magunitude || eew.magnitude || '--';

  let originMs = Number.isFinite(data.originMsLocal)
    ? data.originMsLocal
    : window.SeismicMap.getEventOriginMs(eew);
  if (!Number.isFinite(originMs)) originMs = Date.now();

  const depthRaw = parseFloat(eew.Depth !== undefined ? eew.Depth : eew.depth);
  const depth = isNaN(depthRaw) ? 10 : depthRaw;

  if (!alertMapInited) {
    alertMapCtrl = window.SeismicMap.create(
      document.getElementById('alertSeismicMap'),
      s
    );
    alertMapInited = true;
  }

  alertMapCtrl.showWarning({
    lat: coord.lat,
    lng: coord.lon,
    title: hypocenter + ' M' + magnitude,
    originMs: originMs,
    depth: depth,
    pSpeed: Number(s.pWaveSpeed) || 7,
    sSpeed: Number(s.sWaveSpeed) || 4,
    earthRadius: Number(s.earthRadius) || 6371,
    color: data.isCritical ? '#ef4444' : '#f59e0b',
    waves: true
  });

  const userLat = Number(s.userLatitude);
  const userLon = Number(s.userLongitude);
  if (isFinite(userLat) && isFinite(userLon)) {
    alertMapCtrl.showUser(userLat, userLon);
  }

  if (!alertMapCtrl._everFitted) {
    alertMapCtrl._everFitted = true;
    setTimeout(() => {
      alertMapCtrl.invalidate();
      alertMapCtrl.fitMarkers({ maxZoom: 9 });
    }, 60);
  } else {
    setTimeout(() => alertMapCtrl.invalidate(), 30);
  }
}

function renderAlert(data) {
  const eew = data.eew || {};
  const isCritical = !!data.isCritical;
  document.body.classList.toggle('normal', !isCritical);
  document.body.classList.toggle('critical', isCritical);

  renderAlertMap(data);

  document.getElementById('alertBadge').textContent = isCritical ? '紧急地震预警' : '地震预警';
  const reportNum = eew.ReportNum || eew.Serial || 0;
  document.getElementById('alertReport').textContent = reportNum ? `第 ${reportNum} 报` : '';
  document.getElementById('alertLocation').textContent =
    eew.HypoCenter || eew.Hypocenter || eew.hypocenter || '未知地区';
  document.getElementById('alertMagnitude').textContent =
    `震级 M${eew.Magnitude || eew.Magunitude || eew.magnitude || '--'}`;

  const local = Number(data.localIntensity);
  document.getElementById('localIntensity').textContent = isNaN(local) ? '--' : (Number.isInteger(local) ? local : local.toFixed(1));
  const dist = Number(data.distance);
  document.getElementById('distance').textContent = isNaN(dist) ? '--' : dist.toFixed(1);

  document.getElementById('advice').innerHTML =
    `预估有<b>${data.yhcd || '地震晃动'}</b>，请遵循<b>${data.bxjy || '保持冷静'}</b>`;

  startCountdown(data.sWaveSeconds, data.arrivalTimestamp);
}

window.electronAPI.onAlertData((data) => {
  renderAlert(data);
});

window.electronAPI.onAlertWaveArrived(() => {
  remaining = 0;
  arrivalTimestamp = null;
  renderCountdown();
  stopCountdown();
});

document.getElementById('closeBtn').addEventListener('click', () => {
  window.electronAPI.closeAlert();
});
