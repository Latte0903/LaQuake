/*
 * 地震地图模块（经典脚本，同时供主窗口 index.html 与预警弹窗 alert.html 使用）
 *
 * 能力：
 *  - 多图源切换：OpenStreetMap / 百度 / 高德 / Mapbox / Google
 *  - WGS84 -> GCJ02 / BD09 坐标纠偏，保证国内图源震中位置准确
 *  - 自绘 SVG 标记：速报用 X、预警用圆圈、所在地用蓝点（不使用 Emoji）
 *  - 收预警时以发震时刻为零点，按纵/横波速度实时扩散波前圆圈
 */
(function (global) {
  'use strict';

  var L = global.L;
  if (!L) {
    console.error('SeismicMap: Leaflet 未加载');
    return;
  }

  /* ---------------- 常量 ---------------- */

  var PROVIDERS = {
    osm: {
      label: 'OpenStreetMap',
      crs: 'mercator',
      coord: 'wgs84',
      needsKey: false,
      maxZoom: 19,
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      options: { subdomains: 'abc', attribution: '&copy; OpenStreetMap contributors' }
    },
    amap: {
      label: '高德地图',
      crs: 'mercator',
      coord: 'gcj02',
      needsKey: true,
      maxZoom: 18,
      url: 'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}',
      options: { subdomains: ['1', '2', '3', '4'], attribution: '&copy; 高德地图' }
    },
    mapbox: {
      label: 'Mapbox',
      crs: 'mercator',
      coord: 'wgs84',
      needsKey: true,
      maxZoom: 20,
      url: 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}@2x?access_token={accessToken}',
      options: { attribution: '&copy; Mapbox &copy; OpenStreetMap contributors', tileSize: 256, zoomOffset: 0 }
    },
    google: {
      label: 'Google 地图',
      crs: 'mercator',
      coord: 'wgs84',
      needsKey: true,
      maxZoom: 20,
      url: 'https://mt{s}.google.com/vt/lyrs=m&hl=zh-CN&gl=cn&x={x}&y={y}&z={z}',
      options: { subdomains: ['0', '1', '2', '3'], attribution: '&copy; Google' }
    },
    baidu: {
      label: '百度地图',
      crs: 'baidu',
      coord: 'bd09',
      needsKey: true,
      maxZoom: 19,
      url: 'https://maponline{s}.bdimg.com/tile/?x={x}&y={y}&z={z}&qt=vtile&styles=pl&showtext=1&scaler=1&v=083',
      options: { subdomains: ['0', '1', '2', '3'], minNativeZoom: 3, maxNativeZoom: 18, attribution: '&copy; 百度地图' }
    }
  };

  // 波形动画约束
  var WAVE_TICK_MS = 250;
  var WAVE_LIFETIME_MS = 300 * 1000; // 发震后 300 秒停止扩散并销毁波前圆圈
  var P_WAVE_MAX_KM = 2000;
  var S_WAVE_MAX_KM = 3000;

  var DEFAULT_CENTER = [33.5, 104.5];
  var DEFAULT_ZOOM = 4;

  /* ---------------- 坐标转换（WGS84 / GCJ02 / BD09） ---------------- */

  var GCJ_A = 6378245.0;
  var GCJ_EE = 0.00669342162296594323;
  var BD_XPI = Math.PI * 3000.0 / 180.0;

  function outOfChina(lat, lon) {
    return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271;
  }

  // 用户所在地是否位于中国大陆（含海南岛）粗略范围，用于地图主权标注免责声明的展示判断
  // 边界取中国大陆四至附近：经度 73°E–135°E，纬度 18°N–54°N
  function isInMainlandChina(lat, lon) {
    const la = Number(lat), lo = Number(lon);
    return Number.isFinite(la) && Number.isFinite(lo) &&
      la >= 18 && la <= 54 && lo >= 73 && lo <= 135;
  }

  function transformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
    return ret;
  }

  function transformLon(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
    return ret;
  }

  function wgs84ToGcj02(lat, lon) {
    if (outOfChina(lat, lon)) return [lat, lon];
    var dLat = transformLat(lon - 105.0, lat - 35.0);
    var dLon = transformLon(lon - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * Math.PI;
    var magic = Math.sin(radLat);
    magic = 1 - GCJ_EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtMagic) * Math.PI);
    dLon = (dLon * 180.0) / (GCJ_A / sqrtMagic * Math.cos(radLat) * Math.PI);
    return [lat + dLat, lon + dLon];
  }

  function gcj02ToBd09(lat, lon) {
    var z = Math.sqrt(lon * lon + lat * lat) + 0.00002 * Math.sin(lat * BD_XPI);
    var theta = Math.atan2(lat, lon) + 0.000003 * Math.cos(lon * BD_XPI);
    return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
  }

  function wgs84ToBd09(lat, lon) {
    var gcj = wgs84ToGcj02(lat, lon);
    return gcj02ToBd09(gcj[0], gcj[1]);
  }

  /* ---------------- 时间解析（与主进程 GeoCalculator.parseSourceTime 同构） ---------------- */

  var SOURCE_UTC_OFFSET = { cenc: 8, sc: 8, fj: 8, cq: 8, cwa: 8, jma: 9 };

  function parseSourceTime(value, utcOffsetHours) {
    if (value === null || value === undefined || value === '') return NaN;
    if (typeof value === 'number') return value > 0 && value < 1e12 ? value * 1000 : value;
    var m = String(value).trim()
      .match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,3})\d*)?/);
    if (!m) {
      var t = new Date(value).getTime();
      return isNaN(t) ? NaN : t;
    }
    var ms = m[7] ? Number(m[7].padEnd(3, '0')) : 0;
    return Date.UTC(
      Number(m[1]), Number(m[2]) - 1, Number(m[3]),
      Number(m[4]), Number(m[5]), Number(m[6]), ms
    ) - Number(utcOffsetHours || 8) * 3600000;
  }

  function getEventOriginMs(eew, fallbackOffset) {
    var offset = SOURCE_UTC_OFFSET[eew && eew._source];
    if (offset === undefined) offset = (fallbackOffset === undefined || fallbackOffset === null) ? 8 : fallbackOffset;
    var raw = eew ? (eew.OriginTime !== undefined ? eew.OriginTime : eew.origin_time) : '';
    return parseSourceTime(raw, offset);
  }

  /* ---------------- 百度专用 CRS 与瓦片图层（墨卡托投影 BD09 坐标） ---------------- */

  var baiduReady = false;
  function setupBaidu() {
    if (baiduReady) return;
    L.Projection.BaiduMercator = L.Util.extend({}, L.Projection.Mercator);
    L.CRS.Baidu = L.Util.extend({}, L.CRS.Earth, {
      code: 'Baidu',
      projection: L.Projection.BaiduMercator,
      // 百度瓦片 z 级比通用墨卡托偏移 1 级，且瓦片 y 轴自中心向上
      transformation: new L.Transformation(1, 0.5, -1, 0.5),
      scale: function (zoom) { return 1 / Math.pow(2, 18 - zoom); },
      zoom: function (scale) { return 18 - Math.log(1 / scale) / Math.LN2; },
      wrapLng: undefined,
      infinite: true
    });
    // 重写取片地址：把 Leaflet 瓦片坐标换算为百度 x/y（y 翻转）
    L.TileLayer.Baidu = L.TileLayer.extend({
      getTileUrl: function (coords) {
        var data = {
          s: this._getSubdomain(coords),
          x: coords.x,
          y: -1 - coords.y,
          z: this._getZoomForUrl(),
          r: ''
        };
        return L.Util.template(this._url, L.Util.extend(data, this.options));
      }
    });
    baiduReady = true;
  }

  /* ---------------- 样式注入（标记动画、暗色 tooltip） ---------------- */

  var styleInjected = false;
  function injectStyle() {
    if (styleInjected) return;
    styleInjected = true;
    var css = '' +
      '.seismic-marker{background:transparent;border:none;}' +
      '.seismic-maker-svg{display:block;}' +
      '@keyframes seismicWarnPing{0%{transform:scale(.7);opacity:.9;}70%{transform:scale(1.9);opacity:0;}100%{transform:scale(1.9);opacity:0;}}' +
      '.seismic-warn-icon{position:relative;width:30px;height:30px;}' +
      '.seismic-warn-icon .warn-ping{position:absolute;inset:0;border-radius:50%;background:rgba(245,158,11,.45);animation:seismicWarnPing 1.6s cubic-bezier(0,0,.2,1) infinite;}' +
      '.seismic-warn-icon svg{position:relative;display:block;}' +
      '.seismic-map-tooltip{background:rgba(15,23,42,.92)!important;border:1px solid rgba(255,255,255,.18)!important;border-radius:10px!important;color:#f1f5f9!important;font-size:12px!important;box-shadow:0 6px 18px rgba(0,0,0,.4)!important;padding:6px 10px!important;}' +
      '.seismic-map-tooltip:before{border-top-color:rgba(15,23,42,.92)!important;}' +
      '.seismic-key-notice{position:absolute;left:12px;right:12px;top:12px;z-index:600;background:rgba(15,23,42,.88);border:1px solid rgba(251,191,36,.55);color:#fde68a;font-size:13px;line-height:1.6;padding:10px 14px;border-radius:12px;backdrop-filter:blur(12px);pointer-events:none;text-align:center;}' +
      '.seismic-map-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:13px;background:rgba(15,23,42,.55);z-index:550;}' +
      '.leaflet-container{background:#0b1220;font-family:inherit;}' +
      '.leaflet-bar a{background:rgba(15,23,42,.9);color:#e2e8f0;border-color:rgba(255,255,255,.12);}' +
      '.leaflet-bar a:hover{background:#1e293b;}' +
      '.leaflet-control-attribution{background:rgba(15,23,42,.65)!important;color:#94a3b8!important;}' +
      '.leaflet-control-attribution a{color:#93c5fd!important;}' +
      '.seismic-eq-marker{cursor:pointer;}';
    var style = document.createElement('style');
    style.setAttribute('data-seismic-map', '1');
    style.textContent = css;
    document.head.appendChild(style);
  }

  /* ---------------- 自绘 SVG 标记 ---------------- */

  function svgIcon(html, size, anchor) {
    return L.divIcon({
      className: 'seismic-marker',
      html: html,
      iconSize: [size, size],
      iconAnchor: [anchor, anchor],
      tooltipAnchor: [0, -size / 2 + 2]
    });
  }

  // 速报：圆形底 + 白色 X
  function reportIcon(color) {
    var html =
      '<svg class="seismic-maker-svg" width="28" height="28" viewBox="0 0 28 28">' +
      '<circle cx="14" cy="14" r="10.5" fill="' + color + '" stroke="#ffffff" stroke-width="2.2"/>' +
      '<path d="M10.2 10.2 L17.8 17.8 M17.8 10.2 L10.2 17.8" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round"/>' +
      '</svg>';
    return svgIcon(html, 28, 14);
  }

  // 预警：双层圆圈 + 中心点 + 扩散光环
  function warningIcon(color) {
    var c = color || '#f59e0b';
    var html =
      '<div class="seismic-warn-icon">' +
      '<span class="warn-ping" style="background:' + hexToRgba(c, 0.45) + '"></span>' +
      '<svg width="30" height="30" viewBox="0 0 30 30">' +
      '<circle cx="15" cy="15" r="9.5" fill="' + hexToRgba(c, 0.22) + '" stroke="' + c + '" stroke-width="2.6"/>' +
      '<circle cx="15" cy="15" r="3" fill="' + c + '"/>' +
      '</svg></div>';
    return svgIcon(html, 30, 15);
  }

  // 震中（详情页/弹窗静态展示）：与预警同款圆圈，无动画光环
  function epicenterIcon(color) {
    var c = color || '#ef4444';
    var html =
      '<svg width="30" height="30" viewBox="0 0 30 30">' +
      '<circle cx="15" cy="15" r="9.5" fill="' + hexToRgba(c, 0.22) + '" stroke="' + c + '" stroke-width="2.6"/>' +
      '<circle cx="15" cy="15" r="3.2" fill="' + c + '"/>' +
      '</svg>';
    return svgIcon(html, 30, 15);
  }

  // 所在地：蓝色定位点
  function userIcon() {
    var html =
      '<svg width="24" height="24" viewBox="0 0 24 24">' +
      '<path d="M12 22s7-6.1 7-12a7 7 0 1 0-14 0c0 5.9 7 12 7 12z" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>' +
      '<circle cx="12" cy="10" r="2.6" fill="#ffffff"/>' +
      '</svg>';
    return L.divIcon({
      className: 'seismic-marker',
      html: html,
      iconSize: [24, 24],
      iconAnchor: [12, 22],
      tooltipAnchor: [0, -20]
    });
  }

  function hexToRgba(hex, alpha) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h.split('').map(function (ch) { return ch + ch; }).join('');
    var n = parseInt(h, 16);
    if (isNaN(n)) return hex;
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
  }

  /* ---------------- 波前半径：由走时反算震中距（与倒计时同一震源距模型） ---------------- */

  function waveSurfaceRadiusKm(elapsedSec, speedKmS, depthKm, earthRadiusKm) {
    if (!(elapsedSec > 0)) return 0;
    var R = earthRadiusKm || 6371;
    var d = Math.max(0, depthKm || 0);
    var hypo = speedKmS * elapsedSec; // 震源到波前的直线传播距离
    if (hypo <= d) return 0; // 波前尚未到达震中正下方地表
    var a = R - d;
    var cosTheta = (a * a + R * R - hypo * hypo) / (2 * a * R);
    if (cosTheta <= -1) return Infinity; // 越过对跖点
    if (cosTheta > 1) cosTheta = 1;
    return R * Math.acos(cosTheta);
  }

  /* ---------------- 波形动画器 ---------------- */

  function WaveAnimator(map, latlng, opts) {
    this.map = map;
    this.latlng = latlng;
    this.originMs = opts.originMs;
    this.pSpeed = Number(opts.pSpeed) || 7;
    this.sSpeed = Number(opts.sSpeed) || 4;
    this.depth = Number(opts.depth) || 0;
    this.R = Number(opts.earthRadius) || 6371;
    this.onTick = typeof opts.onTick === 'function' ? opts.onTick : null;
    this.onWavesEnded = typeof opts.onWavesEnded === 'function' ? opts.onWavesEnded : null;
    this.endNotified = false;
    this.ended = false;

    this.pCircle = L.circle(latlng, {
      radius: 10, color: '#67e8f9', weight: 2, opacity: 0.95,
      fill: false, interactive: false, pane: 'wavePane'
    });
    this.sCircle = L.circle(latlng, {
      radius: 10, color: '#f97316', weight: 2.6, opacity: 0.95,
      fillColor: '#f97316', fillOpacity: 0.12, interactive: false, pane: 'wavePane'
    });
    this.sCircle.addTo(map);
    this.pCircle.addTo(map);
    this.tick();
    this.timer = setInterval(this.tick.bind(this), WAVE_TICK_MS);
  }

  WaveAnimator.prototype.tick = function () {
    if (this.ended) return;
    var elapsed = (Date.now() - this.originMs) / 1000;
    if (Date.now() - this.originMs > WAVE_LIFETIME_MS) {
      if (!this.endNotified) {
        this.endNotified = true;
        if (this.onWavesEnded) { try { this.onWavesEnded(); } catch (cbError) {} }
      }
      this.destroy();
      return;
    }
    var pKm = waveSurfaceRadiusKm(elapsed, this.pSpeed, this.depth, this.R);
    var sKm = waveSurfaceRadiusKm(elapsed, this.sSpeed, this.depth, this.R);

    if (pKm > 0 && pKm <= P_WAVE_MAX_KM) {
      this.pCircle.setRadius(pKm * 1000);
      this.pCircle.setStyle({ opacity: 0.35 + 0.6 * (1 - pKm / P_WAVE_MAX_KM) });
      if (!this.map.hasLayer(this.pCircle)) this.pCircle.addTo(this.map);
    } else if (this.map.hasLayer(this.pCircle)) {
      this.map.removeLayer(this.pCircle);
    }

    if (sKm > 0 && sKm <= S_WAVE_MAX_KM) {
      this.sCircle.setRadius(sKm * 1000);
      this.sCircle.setStyle({ opacity: 0.35 + 0.6 * (1 - sKm / S_WAVE_MAX_KM) });
      if (!this.map.hasLayer(this.sCircle)) this.sCircle.addTo(this.map);
    } else if (this.map.hasLayer(this.sCircle)) {
      this.map.removeLayer(this.sCircle);
    }

    if (this.onTick) {
      try { this.onTick({ elapsed: elapsed, pKm: pKm, sKm: sKm }); } catch (cbError) {}
    }
  };

  WaveAnimator.prototype.destroy = function () {
    this.ended = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    [this.pCircle, this.sCircle].forEach(function (c) {
      if (c && this.map.hasLayer(c)) this.map.removeLayer(c);
    }, this);
    this.pCircle = null;
    this.sCircle = null;
  };

  /* ---------------- 地图控制器 ---------------- */

  function Controller(container, settings) {
    this.container = container;
    this.settings = settings || {};
    this.map = null;
    this.tileLayer = null;
    this.noticeEl = null;
    this.reportLayer = null;
    this.userMarker = null;
    this.warningMarker = null;
    this.waveAnimator = null;
    this.state = { reports: [], warning: null, user: null };
    this._build();
  }

  Controller.prototype._providerKey = function () {
    var provider = this.settings.mapProvider || 'osm';
    var keys = this.settings.mapApiKeys || {};
    return { name: provider, def: PROVIDERS[provider] || PROVIDERS.osm, key: keys[provider] || '' };
  };

  Controller.prototype._toLatLng = function (lat, lng) {
    var info = this._providerKey();
    if (info.def.coord === 'gcj02') {
      var gcj = wgs84ToGcj02(lat, lng);
      return L.latLng(gcj[0], gcj[1]);
    }
    if (info.def.coord === 'bd09') {
      var bd = wgs84ToBd09(lat, lng);
      return L.latLng(bd[0], bd[1]);
    }
    return L.latLng(lat, lng);
  };

  Controller.prototype._build = function () {
    injectStyle();
    setupBaidu();
    var info = this._providerKey();
    var crs = info.def.crs === 'baidu' ? L.CRS.Baidu : L.CRS.EPSG3857;
    var minZoom = info.def.crs === 'baidu' ? 3 : 2;

    this.map = L.map(this.container, {
      crs: crs,
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM,
      minZoom: minZoom,
      maxZoom: info.def.maxZoom,
      zoomControl: true,
      attributionControl: false,
      worldCopyJump: false,
      zoomAnimation: true,
      preferCanvas: false
    });
    L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(this.map);
    this.map.createPane('wavePane');
    this.map.getPane('wavePane').style.zIndex = 450;
    this.reportLayer = L.layerGroup().addTo(this.map);

    this._loadTiles(info);
    this._restoreState();
  };

  Controller.prototype._loadTiles = function (info) {
    this._clearNotice();
    if (this.tileLayer) {
      this.map.removeLayer(this.tileLayer);
      this.tileLayer = null;
    }
    if (info.def.needsKey && !info.key) {
      this._showNotice(info.def.label);
      return;
    }
    var opts = L.Util.extend({}, info.def.options);
    if (info.name === 'mapbox') opts.accessToken = info.key;
    if (info.name === 'baidu') {
      this.tileLayer = new L.TileLayer.Baidu(info.def.url, opts);
    } else {
      this.tileLayer = L.tileLayer(info.def.url, opts);
    }
    this.tileLayer.on('tileerror', this._onTileError.bind(this, info));
    this.tileLayer.addTo(this.map);
  };

  Controller.prototype._onTileError = function (info) {
    // 瓦片连续失败时提示（Key 无效或网络问题），避免只提示一次
    if (this._tileErrorShown) return;
    this._tileErrorShown = true;
    this._showNotice(info.def.label, true);
  };

  Controller.prototype._showNotice = function (label, isError) {
    this._clearNotice();
    var el = document.createElement('div');
    el.className = 'seismic-key-notice';
    var msg = isError
      ? ('「' + label + '」瓦片加载失败，请检查网络或密钥（Key/Token）是否有效')
      : ('当前图源「' + label + '」需要先在设置中填写自己的 Key / Token');
    el.textContent = msg;
    this.container.appendChild(el);
    this.noticeEl = el;
  };

  Controller.prototype._clearNotice = function () {
    if (this.noticeEl && this.noticeEl.parentNode) {
      this.noticeEl.parentNode.removeChild(this.noticeEl);
    }
    this.noticeEl = null;
    this._tileErrorShown = false;
  };

  Controller.prototype._restoreState = function () {
    var self = this;
    this.state.reports.forEach(function (r) { self._addReportMarker(r); });
    if (this.state.user) this._renderUser();
    if (this.state.warning) this._renderWarning();
  };

  /* 速报标记（X）。data: {id,lat,lng,color,title,time,onClick} */
  Controller.prototype.setReports = function (list) {
    this.state.reports = (list || []).filter(function (r) {
      return isFinite(r.lat) && isFinite(r.lng);
    });
    this.reportLayer.clearLayers();
    var self = this;
    this.state.reports.forEach(function (r) { self._addReportMarker(r); });
  };

  Controller.prototype._addReportMarker = function (r) {
    var marker = L.marker(this._toLatLng(r.lat, r.lng), {
      icon: reportIcon(r.color || '#3b82f6'),
      keyboard: false
    });
    if (r.title) marker.bindTooltip(r.title, { direction: 'top', opacity: 1, className: 'seismic-map-tooltip' });
    if (typeof r.onClick === 'function') marker.on('click', r.onClick);
    marker.addTo(this.reportLayer);
  };

  Controller.prototype.focusReport = function (id) {
    var found = null;
    this.state.reports.forEach(function (r) { if (String(r.id) === String(id)) found = r; });
    if (found) this.map.flyTo(this._toLatLng(found.lat, found.lng), Math.max(this.map.getZoom(), 8), { duration: 0.5 });
  };

  /* 预警事件（圆圈 + P/S 波）。data: {lat,lng,title,originMs,depth,pSpeed,sSpeed,earthRadius,color,waves} */
  Controller.prototype.showWarning = function (data) {
    this.clearWarning();
    this.state.warning = data;
    this._renderWarning();
  };

  Controller.prototype._renderWarning = function () {
    var w = this.state.warning;
    if (!w || !isFinite(w.lat) || !isFinite(w.lng)) return;
    var latlng = this._toLatLng(w.lat, w.lng);
    this.warningMarker = L.marker(latlng, { icon: warningIcon(w.color || '#f59e0b'), keyboard: false, zIndexOffset: 500 });
    if (w.title) this.warningMarker.bindTooltip(w.title, { direction: 'top', opacity: 1, className: 'seismic-map-tooltip', permanent: false });
    this.warningMarker.addTo(this.map);
    if (w.waves !== false && isFinite(w.originMs)) {
      this.waveAnimator = new WaveAnimator(this.map, latlng, w);
    }
  };

  Controller.prototype.clearWarning = function () {
    this.state.warning = null;
    if (this.waveAnimator) { this.waveAnimator.destroy(); this.waveAnimator = null; }
    if (this.warningMarker) {
      if (this.map.hasLayer(this.warningMarker)) this.map.removeLayer(this.warningMarker);
      this.warningMarker = null;
    }
  };

  /* 无动画的震中标记（详情页使用） */
  Controller.prototype.showEpicenter = function (data) {
    this.clearWarning();
    this.state.warning = {
      lat: data.lat, lng: data.lng, title: data.title,
      color: data.color || '#ef4444', waves: false
    };
    this._renderWarning();
  };

  Controller.prototype.showUser = function (lat, lng) {
    this.state.user = { lat: lat, lng: lng };
    this._renderUser();
  };

  Controller.prototype._renderUser = function () {
    if (this.userMarker) {
      if (this.map.hasLayer(this.userMarker)) this.map.removeLayer(this.userMarker);
      this.userMarker = null;
    }
    var u = this.state.user;
    if (!u || !isFinite(u.lat) || !isFinite(u.lng)) return;
    this.userMarker = L.marker(this._toLatLng(u.lat, u.lng), { icon: userIcon(), keyboard: false, zIndexOffset: 300 });
    this.userMarker.addTo(this.map);
  };

  Controller.prototype.panTo = function (lat, lng, zoom) {
    if (!isFinite(lat) || !isFinite(lng)) return;
    this.map.flyTo(this._toLatLng(lat, lng), zoom || Math.max(this.map.getZoom(), 8), { duration: 0.4 });
  };

  // 适配当前所有标记（震中/所在地/速报）
  Controller.prototype.fitMarkers = function (opts) {
    var pts = [];
    if (this.state.warning && isFinite(this.state.warning.lat)) {
      pts.push(this._toLatLng(this.state.warning.lat, this.state.warning.lng));
    }
    if (this.state.user && isFinite(this.state.user.lat)) {
      pts.push(this._toLatLng(this.state.user.lat, this.state.user.lng));
    }
    this.state.reports.forEach(function (r) { pts.push(this._toLatLng(r.lat, r.lng)); }, this);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      this.map.setView(pts[0], (opts && opts.singleZoom) || 8);
      return;
    }
    var bounds = L.latLngBounds(pts);
    this.map.flyToBounds(bounds, {
      paddingTopLeft: [50, 50],
      paddingBottomRight: [50, 50],
      maxZoom: (opts && opts.maxZoom) || 10,
      duration: 0.5
    });
  };

  Controller.prototype.invalidate = function () {
    if (this.map) this.map.invalidateSize();
  };

  Controller.prototype.applySettings = function (settings) {
    var oldProvider = this.settings.mapProvider || 'osm';
    this.settings = settings || this.settings;
    var newProvider = this.settings.mapProvider || 'osm';
    var oldCrs = (PROVIDERS[oldProvider] || PROVIDERS.osm).crs;
    var newCrs = (PROVIDERS[newProvider] || PROVIDERS.osm).crs;
    if (oldCrs !== newCrs) {
      // CRS 无法就地切换：销毁后以新投影重建，并恢复标记/波形
      this._teardownMap();
      this._build();
    } else {
      this.map.options.maxZoom = (PROVIDERS[newProvider] || PROVIDERS.osm).maxZoom;
      this._loadTiles(this._providerKey());
    }
  };

  Controller.prototype._teardownMap = function () {
    if (this.waveAnimator) { this.waveAnimator.destroy(); this.waveAnimator = null; }
    this.warningMarker = null;
    this.userMarker = null;
    this._clearNotice();
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    this.tileLayer = null;
    this.reportLayer = null;
  };

  Controller.prototype.destroy = function () {
    this._teardownMap();
    this.state = { reports: [], warning: null, user: null };
  };

  /* ---------------- 导出 ---------------- */

  global.SeismicMap = {
    VERSION: '1.0.0',
    PROVIDERS: PROVIDERS,
    create: function (container, settings) {
      return new Controller(container, settings);
    },
    wgs84ToGcj02: wgs84ToGcj02,
    wgs84ToBd09: wgs84ToBd09,
    isInMainlandChina: isInMainlandChina,
    parseSourceTime: parseSourceTime,
    getEventOriginMs: getEventOriginMs,
    waveSurfaceRadiusKm: waveSurfaceRadiusKm,
    icons: {
      report: reportIcon,
      warning: warningIcon,
      epicenter: epicenterIcon,
      user: userIcon
    }
  };
})(window);
