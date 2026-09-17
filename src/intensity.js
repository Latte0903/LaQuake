const EARTH_RADIUS_KM = 6371.0088;

const CN_SOURCES = ['cenc', 'sc', 'fj', 'cq'];
const JP_SOURCES = ['jma', 'cwa'];

const REGION_CN = 'cn';
const REGION_JP = 'jp';
const REGION_OTHER = 'other';

const isCnSource = source => CN_SOURCES.includes(source);
const isJpSource = source => JP_SOURCES.includes(source);

const isValidCoord = value => value !== null && value !== undefined && value !== '' && !isNaN(Number(value));

const inBox = (lat, lon, minLat, maxLat, minLon, maxLon) =>
  lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;

const isMainlandChina = (lat, lon) => {
  lat = Number(lat);
  lon = Number(lon);
  if (isNaN(lat) || isNaN(lon)) return false;
  if (!inBox(lat, lon, 18.0, 53.6, 73.0, 135.0)) return false;
  if (inBox(lat, lon, 21.5, 25.6, 119.5, 122.6)) return false;
  if (inBox(lat, lon, 32.5, 39.0, 124.3, 130.8)) return false;
  if (inBox(lat, lon, 30.0, 32.6, 129.0, 146.0)) return false;
  if (inBox(lat, lon, 24.0, 30.0, 125.5, 135.0)) return false;
  return true;
};

const classifyRegion = (source, lat, lon) => {
  if (isValidCoord(lat) && isValidCoord(lon)) {
    if (isMainlandChina(lat, lon)) return REGION_CN;
    return isJpSource(source) ? REGION_JP : REGION_OTHER;
  }
  return isJpSource(source) ? REGION_JP : REGION_CN;
};

const calcLineDistance = (depth, surfaceDistance) => {
  const r = EARTH_RADIUS_KM;
  const theta = surfaceDistance / r;
  const a = r - depth;
  return Math.sqrt(a * a + r * r - 2 * a * r * Math.cos(theta));
};

const calcCeaCsis = (m, dis = 0) =>
  1.297 * m - 4.368 * Math.log10(dis + 15) + 5.363;

const calcCsis = (m, depth = 10, dis = 0) => {
  m = Number(m);
  depth = Number(depth);
  dis = Number(dis);
  if (isNaN(m) || isNaN(dis)) return 0;
  if (dis > 10000) return 0;
  if (isNaN(depth) || depth === null || depth < 10) depth = 10;
  const lineDis = calcLineDistance(depth, dis);
  const faultLength = 10 ** ((m - 3.821) / 1.86);
  const hypoDis = Math.max(
    lineDis - 10 - faultLength,
    dis - faultLength,
    0.2 * (lineDis - 10),
    0
  );
  const ceaCsis1 = calcCeaCsis(m, dis);
  const ceaCsis2 = calcCeaCsis(m, hypoDis);
  return (ceaCsis1 + ceaCsis2) / 2;
};

const calcCsisLevel = (m, depth = 10, dis = 0) => {
  const csis = calcCsis(m, depth, dis);
  return Math.min(Math.max(Math.round(csis), 0), 12);
};

const calcJmaShindo = (mj, depth, surfaceDistance, arv = 1) => {
  mj = Number(mj);
  depth = Number(depth);
  surfaceDistance = Number(surfaceDistance);
  if (isNaN(mj) || isNaN(surfaceDistance)) return null;
  if (isNaN(depth) || depth === null || depth < 0) depth = 0;
  const mw = mj - 0.171;
  const faultLength = 10 ** (0.5 * mw - 1.85) / 2;
  const lineDis = calcLineDistance(depth, surfaceDistance);
  const hypoDist = lineDis - faultLength;
  const x = Math.max(hypoDist, 3);
  const pgv600 =
    10 **
    (0.58 * mw +
      0.0038 * depth -
      1.29 -
      Math.log10(x + 0.0028 * 10 ** (0.5 * mw)) -
      0.002 * x);
  const pgv400 = pgv600 * 1.307;
  const pgv = pgv400 * arv;
  return 2.68 + 1.72 * Math.log10(pgv);
};

const getShindoFromInstShindo = (instShindo, useSymbol = true) => {
  if (instShindo === null || isNaN(instShindo) || instShindo < -3.0) return '?';
  else if (instShindo < 0.5) return '0';
  else if (instShindo < 1.5) return '1';
  else if (instShindo < 2.5) return '2';
  else if (instShindo < 3.5) return '3';
  else if (instShindo < 4.5) return '4';
  else if (instShindo < 5.0) return useSymbol ? '5-' : '5弱';
  else if (instShindo < 5.5) return useSymbol ? '5+' : '5強';
  else if (instShindo < 6.0) return useSymbol ? '6-' : '6弱';
  else if (instShindo < 6.5) return useSymbol ? '6+' : '6強';
  else return '7';
};

const SHINDO_VALUE_MAP = {
  '0': 0,
  '1': 1,
  '2': 2,
  '3': 3,
  '4': 4,
  '5-': 4.75,
  '5弱': 4.75,
  '5+': 5.25,
  '5強': 5.25,
  '5强': 5.25,
  '6-': 5.75,
  '6弱': 5.75,
  '6+': 6.25,
  '6強': 6.25,
  '6强': 6.25,
  '7': 6.75
};

const parseShindo = value => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const text = String(value).trim();
  if (text in SHINDO_VALUE_MAP) return SHINDO_VALUE_MAP[text];
  const normalized = text
    .replace('強', '+')
    .replace('强', '+')
    .replace('弱', '-')
    .replace('級', '')
    .replace('级', '');
  if (normalized in SHINDO_VALUE_MAP) return SHINDO_VALUE_MAP[normalized];
  const num = parseFloat(normalized);
  return isNaN(num) ? null : num;
};

const round1 = value => Math.round(value * 10) / 10;

const getEventMagnitude = event => {
  const value = event.Magnitude ?? event.Magunitude ?? event.magnitude;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
};

const getEventDepth = (event, defaultDepth = 10) => {
  const raw = event.Depth ?? event.depth;
  const num = parseFloat(raw);
  if (isNaN(num) || num === null) return defaultDepth;
  return num;
};

const getEventLatLon = event => {
  const lat = event.Latitude ?? event.latitude;
  const lon = event.Longitude ?? event.longitude;
  if (!isValidCoord(lat) || !isValidCoord(lon)) return { lat: null, lon: null };
  return { lat: Number(lat), lon: Number(lon) };
};

const getOfficialCnIntensity = event => {
  const raw = event.MaxIntensity ?? event.max_intensity ?? event.intensity;
  if (raw === null || raw === undefined || raw === '') return null;
  const text = String(raw).trim();
  if (!/^-?\d+(\.\d+)?$/.test(text)) return null;
  const num = parseFloat(text);
  return isNaN(num) || num <= 0 ? null : num;
};

const getOfficialJpIntensity = event =>
  parseShindo(event.MaxIntensity ?? event.max_intensity ?? event.shindo);

const estimateLocalIntensity = (region, magnitude, depth, distance) => {
  if (magnitude === null || magnitude === undefined || isNaN(magnitude)) return 0;
  if (distance === null || distance === undefined || isNaN(distance)) return 0;
  let value;
  if (region === REGION_JP) {
    const shindo = calcJmaShindo(magnitude, depth, distance, 1);
    if (shindo === null) return 0;
    value = Math.max(shindo, 0);
  } else if (region === REGION_CN) {
    value = Math.max(calcCsis(magnitude, depth, distance), 0);
  } else {
    return 0;
  }
  return round1(value);
};

const estimateEpicenterIntensity = (region, magnitude, depth) => {
  if (magnitude === null || magnitude === undefined || isNaN(magnitude)) return null;
  if (region === REGION_JP) {
    const shindo = calcJmaShindo(magnitude, depth, 0, 1);
    if (shindo === null || shindo < 0.5) return null;
    return round1(shindo);
  }
  if (region === REGION_CN) {
    return calcCsisLevel(magnitude, depth, 0);
  }
  return null;
};

const getShakeDegree = intensity => {
  const value = Number(intensity) || 0;
  if (value >= 9) return '严重破坏性地震 请立即避险';
  if (value >= 6) return '有破坏性紧急避险';
  if (value >= 3) return '强烈摇晃注意避险';
  return '无感请勿惊慌';
};

const getAvoidanceAdvice = intensity => {
  const value = Number(intensity) || 0;
  if (value >= 3) return '伏地遮挡手抓牢';
  return '无需避险';
};

module.exports = {
  EARTH_RADIUS_KM,
  REGION_CN,
  REGION_JP,
  REGION_OTHER,
  isCnSource,
  isJpSource,
  isMainlandChina,
  classifyRegion,
  isValidCoord,
  calcLineDistance,
  calcCsis,
  calcCsisLevel,
  calcJmaShindo,
  getShindoFromInstShindo,
  parseShindo,
  getEventMagnitude,
  getEventDepth,
  getEventLatLon,
  getOfficialCnIntensity,
  getOfficialJpIntensity,
  estimateLocalIntensity,
  estimateEpicenterIntensity,
  getShakeDegree,
  getAvoidanceAdvice
};
