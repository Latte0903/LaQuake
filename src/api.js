const axios = require('axios');

class SeismicAPI {
  constructor() {
    this.baseURL = 'https://api.wolfx.jp';
    this.timeout = 30000;
  }

  async getEEW(source) {
    const urls = {
      cenc: `${this.baseURL}/cenc_eew.json`,
      sc: `${this.baseURL}/sc_eew.json`,
      cwa: `${this.baseURL}/cwa_eew.json`,
      fj: `${this.baseURL}/fj_eew.json`,
      cq: `${this.baseURL}/cq_eew.json`,
      jma: `${this.baseURL}/jma_eew.json`
    };

    const url = urls[source] || urls.cenc;

    try {
      const response = await axios.get(url, { timeout: this.timeout });
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch EEW from ${source}:`, error.message);
      return null;
    }
  }

  async getEQList(source) {
    const urls = {
      cenc: `${this.baseURL}/cenc_eqlist.json`,
      jma: `${this.baseURL}/jma_eqlist.json`
    };

    const url = urls[source] || urls.cenc;

    try {
      const response = await axios.get(url, { timeout: this.timeout });
      const data = response.data;
      
      if (data && typeof data === 'object') {
        const result = [];
        for (const key of Object.keys(data)) {
          if (key.startsWith('No') && !isNaN(parseInt(key.replace('No', '')))) {
            result.push(data[key]);
          }
        }
        return result.sort((a, b) => {
          const timeA = new Date(a.time || a.Time || '').getTime();
          const timeB = new Date(b.time || b.Time || '').getTime();
          if (isNaN(timeA) || isNaN(timeB)) {
            const numA = parseInt(a.EventID?.match(/\d+/)?.[0] || '0');
            const numB = parseInt(b.EventID?.match(/\d+/)?.[0] || '0');
            return numB - numA;
          }
          return timeB - timeA;
        });
      }
      
      return [];
    } catch (error) {
      console.error(`Failed to fetch EQ list from ${source}:`, error.message);
      return [];
    }
  }

  async getServerTime() {
    try {
      const response = await axios.get(`${this.baseURL}/ntp.json`, { timeout: this.timeout });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch server time:', error.message);
      return null;
    }
  }

  async getGeoIP(ip = null) {
    try {
      const url = ip ? `${this.baseURL}/geoip.php?ip=${ip}` : `${this.baseURL}/geoip.php`;
      const response = await axios.get(url, { timeout: this.timeout });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch geoIP:', error.message);
      return null;
    }
  }

  async getWeatherRank() {
    try {
      const response = await axios.get(`${this.baseURL}/weather_rank.json`, { timeout: this.timeout });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch weather rank:', error.message);
      return null;
    }
  }

  async getPublicIP() {
    try {
      const response = await axios.get(`${this.baseURL}/ip.php`, { timeout: this.timeout });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch public IP:', error.message);
      return null;
    }
  }

  async getRandomImage(format = 'img') {
    try {
      const response = await axios.get(`${this.baseURL}/img.php?return=${format}`, { timeout: this.timeout });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch random image:', error.message);
      return null;
    }
  }
}

module.exports = { SeismicAPI };
