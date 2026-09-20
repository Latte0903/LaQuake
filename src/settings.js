const fs = require('fs');
const path = require('path');

class SettingsManager {
  constructor(dataPath = null) {
    this.settings = {};
    this.settingsPath = dataPath || path.join(process.cwd(), 'data', 'settings.json');
    this.defaultSettings = {
      language: 'zh-CN',
      eewSource: 'cenc',
      eewCWA: false,
      eqSource: 'cenc',
      eewPollInterval: 1000,
      eewCount: 10,
      eqPollInterval: 5000,
      eqCount: 20,
      requestTimeout: 30000,
      pushMode: 'simple',
      barkUrl: 'https://api.day.app/push',
      barkDeviceKey: '',
      pushUrl: '',
      pushJsonTemplate: '{\n  "device_key": "你的Key「可在BarkAPP获取」",\n  "title": "【LaQuake】",\n  "body": "紧急地震预警！{FZSK}{ZZMC}发生{ZHENJI}级地震。预估本地烈度{YGLD}度，横波将于{TIME}秒后到达。预估有{YHCD}，请遵循{BXJY}.来自中国地震预警网。",\n  "level": "critical",\n  "sound": "alarm",\n  "volume": 10\n}',
      eewPostUrl: '',
      eqPostUrl: '',
      minLocalIntensity: 0,
      minEpicenterIntensity: 0,
      minEQIntensity: 0,
      strongShakeIntensity: 5,
      criticalIntensity: 1,
      userLatitude: 30.67,
      userLongitude: 104.07,
      autoLocate: false,
      pWaveSpeed: 7,
      sWaveSpeed: 4,
      earthRadius: 6371,
      soundAlert: 'Media/eewalert.wav',
      soundCritical: 'Media/eewcritical.wav',
      soundUpdate: 'Media/eewupdate.wav',
      soundSWave: 'Media/swavearrive.wav',
      soundNewRecord: 'Media/newrecord.wav',
      soundWeakShake: 'Media/weakshake.wav',
      soundMidShake: 'Media/midshake.wav',
      soundStrongShake: 'Media/strongshake.wav',
      autoStart: false,
      soundEnabled: true,
      enableLogging: false,
      minimizeToTray: true,
      titleBarStyle: 'windows',
      floatingNav: false,
      windowSize: { width: 800, height: 600 }
    };
  }

  load() {
    try {
      if (fs.existsSync(this.settingsPath)) {
        const data = fs.readFileSync(this.settingsPath, 'utf-8');
        const savedSettings = JSON.parse(data);
        this.settings = { ...this.defaultSettings, ...savedSettings };
        if ((!this.settings.pushUrl || !String(this.settings.pushUrl).trim()) &&
            this.settings.eewPostUrl && String(this.settings.eewPostUrl).trim()) {
          this.settings.pushUrl = this.settings.eewPostUrl;
          this.settings.pushMode = 'pro';
        }
        const oldBarkUrl = String(this.settings.barkUrl || '').trim();
        if (oldBarkUrl && !oldBarkUrl.endsWith('/push')) {
          try {
            const parsed = new URL(oldBarkUrl);
            const segments = parsed.pathname.split('/').filter(Boolean);
            const keyIndex = segments.findIndex(seg => /^[A-Za-z0-9_-]{8,}$/.test(seg));
            if (keyIndex !== -1) {
              if (!this.settings.barkDeviceKey) {
                this.settings.barkDeviceKey = segments[keyIndex];
              }
              this.settings.barkUrl = `${parsed.protocol}//${parsed.host}/push`;
            }
          } catch (parseError) {}
        }
        if (!this.settings.barkUrl) this.settings.barkUrl = 'https://api.day.app/push';
        const OLD_DEFAULT_TEMPLATE = '{\n  "title": "{TITLE}",\n  "body": "{BODY}"\n}';
        if (this.settings.pushJsonTemplate === OLD_DEFAULT_TEMPLATE) {
          this.settings.pushJsonTemplate = this.defaultSettings.pushJsonTemplate;
        }
      } else {
        this.settings = { ...this.defaultSettings };
        this.save();
      }
    } catch (error) {
      console.error('Failed to load settings:', error.message);
      this.settings = { ...this.defaultSettings };
    }
    return this.settings;
  }

  save(newSettings = null) {
    if (newSettings) {
      this.settings = { ...this.settings, ...newSettings };
    }

    try {
      const dir = path.dirname(this.settingsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.settingsPath, JSON.stringify(this.settings, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error.message);
      return false;
    }
  }

  get(key, defaultValue = null) {
    return this.settings[key] !== undefined ? this.settings[key] : defaultValue;
  }

  set(key, value) {
    this.settings[key] = value;
    this.save();
  }

  getAll() {
    return { ...this.settings };
  }

  reset() {
    this.settings = { ...this.defaultSettings };
    this.save();
  }

  getEEWSourceOptions() {
    return [
      { value: 'cenc', label: '中国地震台网' },
      { value: 'sc', label: '四川省地震局' },
      { value: 'cwa', label: '中央气象署' }
    ];
  }

  getEQSourceOptions() {
    return [
      { value: 'cenc', label: '中国地震台网' },
      { value: 'jma', label: '日本气象厅' }
    ];
  }
}

module.exports = { SettingsManager };
