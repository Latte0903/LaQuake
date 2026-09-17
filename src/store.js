const Store = require('electron-store');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class DataStore {
  constructor(dataPath = null) {
    const options = {
      name: 'laquake-data',
      defaults: {
        eew: [],
        eqHistory: []
      }
    };
    if (dataPath) {
      options.cwd = dataPath;
    }
    this.store = new Store(options);
    this.laFilePath = null;
  }
  
  setLAFilePath(filePath) {
    this.laFilePath = filePath;
  }
  
  saveToLAFileSync(settingsData) {
    if (!this.laFilePath) return false;
    
    try {
      const dir = path.dirname(this.laFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      
      const eewData = this.store.get('eew', []);
      const eqData = this.store.get('eqHistory', []);
      
      const data = {
        version: 1,
        settings: settingsData,
        eew: eewData,
        eqHistory: eqData,
        isActivated: settingsData.isActivated || false,
        appMode: settingsData.appMode || 'standalone',
        createdAt: new Date().toISOString()
      };
      
      const content = `LAQUAKE_DATA_V1\n${JSON.stringify(data)}`;
      fs.writeFileSync(this.laFilePath, content, 'utf-8');
      return true;
    } catch (error) {
      console.error('Failed to save LA file:', error.message);
      return false;
    }
  }
  
  async loadFromLAFile(userLat = null, userLon = null) {
    if (!this.laFilePath || !fs.existsSync(this.laFilePath)) {
      return null;
    }
    
    try {
      const content = fs.readFileSync(this.laFilePath, 'utf-8');
      const lines = content.split('\n');
      
      if (lines.length < 2 || lines[0] !== 'LAQUAKE_DATA_V1') {
        return null;
      }
      
      const jsonData = JSON.parse(lines.slice(1).join('\n'));
      
      if (jsonData.eew && Array.isArray(jsonData.eew)) {
        for (const eew of jsonData.eew) {
          await this.addEEW(eew, eew._localIntensity || 0, userLat, userLon);
        }
      }
      
      if (jsonData.eqHistory && Array.isArray(jsonData.eqHistory)) {
        for (const eq of jsonData.eqHistory) {
          await this.addEQ(eq, userLat, userLon);
        }
      }
      
      return {
        settings: jsonData.settings || {},
        isActivated: jsonData.isActivated || false,
        appMode: jsonData.appMode || 'standalone'
      };
    } catch (error) {
      console.error('Failed to load LA file:', error.message);
      return null;
    }
  }

  init() {
    const currentVersion = 3;
    const storedVersion = this.store.get('_version', 0);
    
    if (storedVersion < currentVersion) {
      this.store.delete('eew');
      this.store.delete('eqHistory');
      this.store.set('_version', currentVersion);
      console.log('Data store migrated to version', currentVersion);
    }
    
    if (!this.store.has('eew')) {
      this.store.set('eew', []);
    }
    if (!this.store.has('eqHistory')) {
      this.store.set('eqHistory', []);
    }
  }

  close() {
  }

  async addEEW(eew, localIntensity = 0, userLat = null, userLon = null) {
    const eewList = this.store.get('eew', []);
    
    const eventId = eew.EventID || '';
    const reportNum = eew.ReportNum || eew.Serial || 0;
    
    console.log('Store addEEW:', eventId, reportNum, 'existing count:', eewList.length);
    
    const exists = eewList.some(item => 
      item.EventID === eventId && 
      (item.ReportNum || item.Serial || 0) === reportNum
    );
    
    if (exists) {
      console.log('Store addEEW: already exists');
      return false;
    }
    
    const sameEventReports = eewList.filter(item => item.EventID === eventId);
    const reportCount = sameEventReports.length + 1;
    
    let _distance = eew._distance || 0;
    if (userLat !== null && userLon !== null && eew.Latitude !== undefined && eew.Latitude !== null && !isNaN(eew.Latitude) && eew.Longitude !== undefined && eew.Longitude !== null && !isNaN(eew.Longitude)) {
      const radLat1 = userLat * (Math.PI / 180);
      const radLon1 = userLon * (Math.PI / 180);
      const radLat2 = eew.Latitude * (Math.PI / 180);
      const radLon2 = eew.Longitude * (Math.PI / 180);
      const dLat = radLat2 - radLat1;
      const dLon = radLon2 - radLon1;
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(radLat1) * Math.cos(radLat2) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      _distance = 6371 * c;
    }
    
    const record = {
      ...eew,
      _id: this.generateId(eew),
      _createdAt: new Date().toISOString(),
      _localIntensity: localIntensity,
      _reportCount: reportCount,
      _distance: _distance
    };
    
    eewList.push(record);
    
    eewList.sort((a, b) => {
      const timeA = new Date(a.OriginTime || a._createdAt).getTime();
      const timeB = new Date(b.OriginTime || b._createdAt).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return (b.ReportNum || b.Serial || 0) - (a.ReportNum || a.Serial || 0);
    });
    
    if (eewList.length > 1000) {
      eewList.splice(1000);
    }
    
    this.store.set('eew', eewList);
    return true;
  }

  async getEEWHistory(count = 10) {
    const eewList = this.store.get('eew', []);
    
    eewList.sort((a, b) => {
      const timeA = new Date(a.OriginTime || a._createdAt).getTime();
      const timeB = new Date(b.OriginTime || b._createdAt).getTime();
      if (timeB !== timeA) return timeB - timeA;
      return (b.ReportNum || b.Serial || 0) - (a.ReportNum || a.Serial || 0);
    });
    
    return eewList.slice(0, count);
  }

  async getEEWByEventId(eventId) {
    const eewList = this.store.get('eew', []);
    return eewList.filter(item => item.EventID === eventId);
  }

  async addEQ(eq, userLat = null, userLon = null, localIntensity = null, epicenterIntensity = null, region = null) {
    const eqList = this.store.get('eqHistory', []);
    
    const eventId = eq.EventID || '';
    
    if (!eventId) {
      return false;
    }
    
    const exists = eqList.some(item => item.EventID === eventId);
    
    if (exists) {
      return false;
    }

    if (localIntensity === null || localIntensity === undefined) {
      localIntensity = eq._localIntensity || 0;
    }
    if (epicenterIntensity === null || epicenterIntensity === undefined) {
      epicenterIntensity = eq._epicenterIntensity !== undefined ? eq._epicenterIntensity : null;
    }
    if (region === null || region === undefined) {
      region = eq._intRegion !== undefined ? eq._intRegion : null;
    }

    let _distance = eq._distance || 0;
    if (userLat !== null && userLon !== null) {
      const eqLat = parseFloat(eq.latitude || eq.Latitude || '0');
      const eqLon = parseFloat(eq.longitude || eq.Longitude || '0');
      if (!isNaN(eqLat) && !isNaN(eqLon) && eqLat !== 0 && eqLon !== 0) {
        const radLat1 = userLat * (Math.PI / 180);
        const radLon1 = userLon * (Math.PI / 180);
        const radLat2 = eqLat * (Math.PI / 180);
        const radLon2 = eqLon * (Math.PI / 180);
        const dLat = radLat2 - radLat1;
        const dLon = radLon2 - radLon1;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(radLat1) * Math.cos(radLat2) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        _distance = 6371 * c;
      }
    }
    
    const record = {
      ...eq,
      _id: this.generateId(eq),
      _createdAt: new Date().toISOString(),
      _localIntensity: localIntensity,
      _epicenterIntensity: epicenterIntensity,
      _intRegion: region,
      _distance: _distance
    };
    
    eqList.push(record);
    
    eqList.sort((a, b) => {
      const timeA = new Date(a.time || a.Time || a._createdAt).getTime();
      const timeB = new Date(b.time || b.Time || b._createdAt).getTime();
      return timeB - timeA;
    });
    
    if (eqList.length > 2000) {
      eqList.splice(2000);
    }
    
    this.store.set('eqHistory', eqList);
    return true;
  }

  async getEQHistory(count = 20) {
    const eqList = this.store.get('eqHistory', []);
    
    eqList.sort((a, b) => {
      const timeA = new Date(a.time || a.Time || a._createdAt).getTime();
      const timeB = new Date(b.time || b.Time || b._createdAt).getTime();
      return timeB - timeA;
    });
    
    return eqList.slice(0, count);
  }

  async clearEEWHistory() {
    this.store.set('eew', []);
    return true;
  }

  async clearEQHistory() {
    this.store.set('eqHistory', []);
    return true;
  }

  async getEEWCount() {
    return this.store.get('eew', []).length;
  }

  async getEQCount() {
    return this.store.get('eqHistory', []).length;
  }

  generateId(obj) {
    const str = JSON.stringify(obj);
    return crypto.createHash('md5').update(str).digest('hex');
  }
}

module.exports = { DataStore };
