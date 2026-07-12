const path = require('path');
const fs = require('fs');

class SoundManager {
  constructor() {
    this.sounds = {};
    this.enabled = true;
    this.mediaDir = path.join(__dirname, '..', 'Media');
  }

  init() {
    const soundFiles = {
      alert: 'eewalert.wav',
      critical: 'eewcritical.wav',
      update: 'eewupdate.wav',
      swave: 'swavearrive.wav',
      newrecord: 'newrecord.wav',
      weakshake: 'weakshake.wav',
      midshake: 'midshake.wav',
      strongshake: 'strongshake.wav'
    };

    Object.keys(soundFiles).forEach((key) => {
      const filePath = path.join(this.mediaDir, soundFiles[key]);
      if (fs.existsSync(filePath)) {
        this.sounds[key] = filePath;
      }
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  play(soundName) {
    if (!this.enabled) return;

    const filePath = this.sounds[soundName];
    if (!filePath) return;

    console.log('Playing sound:', filePath);
  }

  getSoundFilePath(soundName) {
    return this.sounds[soundName] || '';
  }

  getAvailableSounds() {
    return Object.keys(this.sounds);
  }

  setSoundPath(soundName, filePath) {
    if (fs.existsSync(filePath)) {
      this.sounds[soundName] = filePath;
      return true;
    }
    console.log('Sound file not found:', filePath);
    return false;
  }
  
  updateFromSettings(settings) {
    const soundMap = {
      alert: settings.soundAlert,
      critical: settings.soundCritical,
      update: settings.soundUpdate,
      swave: settings.soundSWave,
      newrecord: settings.soundNewRecord,
      weakshake: settings.soundWeakShake,
      midshake: settings.soundMidShake,
      strongshake: settings.soundStrongShake
    };
    
    Object.keys(soundMap).forEach((key) => {
      const filePath = soundMap[key];
      if (filePath && fs.existsSync(filePath)) {
        this.sounds[key] = filePath;
        console.log('Updated sound path:', key, filePath);
      }
    });
  }
}

module.exports = { SoundManager };
