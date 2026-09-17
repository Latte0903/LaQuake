let countdownTimer = null;
let remaining = 0;

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

function startCountdown(seconds) {
  remaining = Math.max(0, parseInt(seconds, 10) || 0);
  renderCountdown();
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(() => {
    if (remaining > 0) {
      remaining -= 1;
      renderCountdown();
    } else {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
  }, 1000);
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

  startCountdown(data.sWaveSeconds);
}

window.electronAPI.onAlertData((data) => {
  renderAlert(data);
});

window.electronAPI.onAlertWaveArrived(() => {
  remaining = 0;
  renderCountdown();
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
});

document.getElementById('closeBtn').addEventListener('click', () => {
  window.electronAPI.closeAlert();
});
