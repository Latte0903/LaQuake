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

function renderAlert(data) {
  const eew = data.eew || {};
  const isCritical = !!data.isCritical;
  document.body.classList.toggle('normal', !isCritical);
  document.body.classList.toggle('critical', isCritical);

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
