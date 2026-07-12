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
  
  async loadFromLAFile() {
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
          await this.addEEW(eew, eew._localIntensity || 0);
        }
      }
      
      if (jsonData.eqHistory && Array.isArray(jsonData.eqHistory)) {
        for (const eq of jsonData.eqHistory) {
          await this.addEQ(eq);
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

  async addEEW(eew, localIntensity = 0) {
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
    
    const record = {
      ...eew,
      _id: this.generateId(eew),
      _createdAt: new Date().toISOString(),
      _localIntensity: localIntensity,
      _reportCount: reportCount
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

  async addEQ(eq) {
    const eqList = this.store.get('eqHistory', []);
    
    const eventId = eq.EventID || '';
    
    if (!eventId) {
      return false;
    }
    
    const exists = eqList.some(item => item.EventID === eventId);
    
    if (exists) {
      return false;
    }
    
    const record = {
      ...eq,
      _id: this.generateId(eq),
      _createdAt: new Date().toISOString()
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
