const fs = require('fs');
const path = require('path');

const i18nDir = path.join(__dirname, 'i18n');
const defaultLang = 'zh-CN';

let currentLang = defaultLang;
let translations = {};

function loadLanguage(lang) {
  const filePath = path.join(i18nDir, `${lang}.json`);
  if (fs.existsSync(filePath)) {
    try {
      translations = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      currentLang = lang;
      return true;
    } catch (error) {
      console.error(`Failed to load language file ${lang}:`, error.message);
    }
  }
  // Fallback to default
  const fallbackPath = path.join(i18nDir, `${defaultLang}.json`);
  if (fs.existsSync(fallbackPath)) {
    translations = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
    currentLang = defaultLang;
  }
  return false;
}

function t(key, ...args) {
  let value = translations[key];
  if (value === undefined) {
    return key;
  }
  // Replace {0}, {1}, etc. with arguments
  if (args.length > 0) {
    args.forEach((arg, index) => {
      value = value.replace(new RegExp(`\\{${index}\\}`, 'g'), String(arg));
    });
  }
  return value;
}

function getCurrentLang() {
  return currentLang;
}

function getTranslations() {
  return { ...translations };
}

// Load default language on module init
loadLanguage(defaultLang);

module.exports = { loadLanguage, t, getCurrentLang, getTranslations, defaultLang };