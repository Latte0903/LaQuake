class GeoCalculator {
  constructor() {
    this.earthRadius = 6371;
  }

  setEarthRadius(radius) {
    this.earthRadius = radius;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const radLat1 = this.toRadians(lat1);
    const radLon1 = this.toRadians(lon1);
    const radLat2 = this.toRadians(lat2);
    const radLon2 = this.toRadians(lon2);

    const dLat = radLat2 - radLat1;
    const dLon = radLon2 - radLon1;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(radLat1) * Math.cos(radLat2) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return this.earthRadius * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  calculateSWaveArrivalTime(distance, sWaveSpeed = 4, pWaveSpeed = 7) {
    const pWaveTime = distance / pWaveSpeed;
    const sWaveTime = distance / sWaveSpeed;
    return sWaveTime - pWaveTime;
  }

  // 按数据源声明的 UTC 偏移（JMA=+9，国内源/CWA=+8）把发震时间字符串解析为
  // 绝对时间戳，不依赖本机时区——非 UTC+8 机器或海外用户也能得到正确的已耗时
  parseSourceTime(value, utcOffsetHours = 8) {
    if (value === null || value === undefined || value === '') return NaN;
    if (typeof value === 'number') return value;
    const m = String(value).trim()
      .match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3})\d*)?/);
    if (!m) return new Date(value).getTime();
    const ms = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
    return Date.UTC(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6]), ms
    ) - Number(utcOffsetHours) * 3600000;
  }

  // 震源（地下 depthKm 处）到用户所在地的直线距离（考虑地球曲率）。
  // 横波沿震源→台站路径传播，用震源距而非地表震中距计算走时
  calcHypocentralDistance(depthKm, surfaceDistanceKm) {
    const r = this.earthRadius;
    const theta = surfaceDistanceKm / r;
    const a = r - depthKm;
    return Math.sqrt(a * a + r * r - 2 * a * r * Math.cos(theta));
  }

  getSafetyAdvice(intensity) {
    if (intensity >= 7) {
      return {
        level: 'danger',
        title: '紧急避险',
        advice: '强烈摇晃，立即寻找坚固的桌子或支撑物下方躲避，保护头部！远离窗户、玻璃和重物。'
      };
    } else if (intensity >= 5) {
      return {
        level: 'warning',
        title: '注意避险',
        advice: '明显摇晃，立即停止工作，寻找安全地方躲避。'
      };
    } else if (intensity >= 3) {
      return {
        level: 'caution',
        title: '保持警惕',
        advice: '轻微摇晃，注意观察周围情况，准备应急措施。'
      };
    } else {
      return {
        level: 'info',
        title: '正常',
        advice: '微弱或无摇晃，注意关注后续信息。'
      };
    }
  }

  getIntensityDescription(intensity) {
    if (intensity >= 7) return '毁灭性摇晃';
    if (intensity >= 6) return '剧烈摇晃';
    if (intensity >= 5) return '强烈摇晃';
    if (intensity >= 4) return '明显摇晃';
    if (intensity >= 3) return '中等摇晃';
    if (intensity >= 2) return '轻微摇晃';
    if (intensity >= 1) return '微弱摇晃';
    return '无感觉';
  }

  formatCoordinate(lat, lon) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
  }
}

module.exports = { GeoCalculator };
