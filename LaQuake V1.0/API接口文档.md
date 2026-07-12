# LaQuake API 接口文档

## 一、接口概述

本软件使用 Wolfx Open API 提供的地震预警和地震速报数据接口。所有接口均为 HTTP GET 请求，返回 JSON 格式数据。

---

## 二、地震预警接口

### 1. 日本气象厅紧急地震速报

- **接口地址**: `https://api.wolfx.jp/jma_eew.json`
- **请求方式**: GET
- **数据源**: JMA（日本气象厅）
- **WebSocket地址**: `wss://ws-api.wolfx.jp/jma_eew`

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| type | String | WebSocket专用，固定值"jma_eew" |
| Title | String | 紧急地震速报标题 |
| CodeType | String | 发布分类说明 |
| Issue.Source | String | 发布机构位置 |
| Issue.Status | String | 发布状态 |
| EventID | String | 事件ID |
| Serial | Number | 速报序号 |
| AnnouncedTime | String | 发布时间（UTC+9） |
| OriginTime | String | 地震发生时间（UTC+9） |
| Hypocenter | String | 震源地 |
| Latitude | Number | 震源纬度 |
| Longitude | Number | 震源经度 |
| Magunitude | Number | 震级 |
| Depth | Number | 震源深度 |
| MaxIntensity | String | 最大震度（弱/强） |
| Accuracy.Epicenter | String | 震央精度信息 |
| Accuracy.Depth | String | 深度精度信息 |
| Accuracy.Magnitude | String | 震级精度信息 |
| MaxIntChange.String | String | 最大震度变化说明 |
| MaxIntChange.Reason | String | 最大震度变更原因 |
| WarnArea | Array | 警报对象地区列表 |
| isSea | Boolean | 是否为海域地震 |
| isTraining | Boolean | 是否为训练报 |
| isAssumption | Boolean | 是否为推定震源 |
| isWarn | Boolean | 是否为警报 |
| isFinal | Boolean | 是否为最终报 |
| isCancel | Boolean | 是否为取消报 |
| OriginalText | String | 气象厅发布原文 |

**WarnArea数组元素**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| Chiiki | String | 警报对象地区 |
| Shindo1 | String | 地区最大震度 |
| Shindo2 | String | 地区最小震度 |
| Time | String | 警报发布时间 |
| Type | String | 发布类型（预报/警报） |
| Arrive | Boolean | 地震波是否到达 |

---

### 2. 四川省地震局地震预警

- **接口地址**: `https://api.wolfx.jp/sc_eew.json`
- **请求方式**: GET
- **数据源**: SC（四川省地震局）
- **WebSocket地址**: `wss://ws-api.wolfx.jp/sc_eew`

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| type | String | WebSocket专用，固定值"sc_eew" |
| ID | Number | EEW发报ID |
| EventID | String | EEW发报事件ID |
| ReportTime | String | EEW发报时间（UTC+8） |
| ReportNum | Number | EEW发报数 |
| OriginTime | String | 发震时间（UTC+8） |
| HypoCenter | String | 震源地 |
| Latitude | Number | 震源纬度 |
| Longitude | Number | 震源经度 |
| Magunitude | Number | 震级 |
| Depth | Number | 震源深度（可能为null） |
| MaxIntensity | Number | 最大烈度 |

---

### 3. 中国地震台网地震预警

- **接口地址**: `https://api.wolfx.jp/cenc_eew.json`
- **请求方式**: GET
- **数据源**: CENC（中国地震台网）
- **WebSocket地址**: `wss://ws-api.wolfx.jp/cenc_eew`

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| type | String | WebSocket专用，固定值"cenc_eew" |
| ID | String | EEW发报ID |
| EventID | String | EEW发报事件ID |
| ReportTime | String | EEW发报时间（UTC+8） |
| ReportNum | Number | EEW发报数 |
| OriginTime | String | 发震时间（UTC+8） |
| HypoCenter | String | 震源地 |
| Latitude | Number | 震源纬度 |
| Longitude | Number | 震源经度 |
| Magnitude | Number | 震级 |
| Depth | Number | 震源深度（可能为null） |
| MaxIntensity | Number | 最大烈度 |

---

### 4. 福建省地震局地震预警

- **接口地址**: `https://api.wolfx.jp/fj_eew.json`
- **请求方式**: GET
- **数据源**: FJ（福建省地震局）
- **WebSocket地址**: `wss://ws-api.wolfx.jp/fj_eew`

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| type | String | WebSocket专用，固定值"fj_eew" |
| ID | Number | EEW发报ID |
| EventID | String | EEW发报事件ID |
| ReportTime | String | EEW发报时间（UTC+8） |
| ReportNum | Number | EEW发报数 |
| OriginTime | String | 发震时间（UTC+8） |
| HypoCenter | String | 震源地 |
| Latitude | Number | 震源纬度 |
| Longitude | Number | 震源经度 |
| Magunitude | Number | 震级 |
| isFinal | Boolean | 是否为最终报 |

---

### 5. 重庆市地震局地震预警

- **接口地址**: `https://api.wolfx.jp/cq_eew.json`
- **请求方式**: GET
- **数据源**: CQ（重庆市地震局）
- **WebSocket地址**: `wss://ws-api.wolfx.jp/cq_eew`

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| type | String | WebSocket专用，固定值"cq_eew" |
| ID | String | EEW发报ID |
| EventID | String | EEW发报事件ID |
| ReportTime | String | EEW发报时间（UTC+8） |
| ReportNum | Number | EEW发报数 |
| OriginTime | String | 发震时间（UTC+8） |
| HypoCenter | String | 震源地 |
| Latitude | Number | 震源纬度 |
| Longitude | Number | 震源经度 |
| Magnitude | Number | 震级 |
| Depth | Number | 震源深度（可能为null） |
| MaxIntensity | Number | 最大烈度 |

---

### 6. CWA地震预警（仅服务大陆地区）

- **接口地址**: `https://api.wolfx.jp/cwa_eew.json`
- **请求方式**: GET
- **数据源**: CWA（交通部中央气象署）

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| ID | Number | EEW发报ID |
| ReportTime | String | EEW发报时间（UTC+8） |
| ReportNum | Number | EEW发报数 |
| OriginTime | String | 发震时间（UTC+8） |
| HypoCenter | String | 震源地 |
| Latitude | Number | 震源纬度 |
| Longitude | Number | 震源经度 |
| Magunitude | Number | 震级 |
| Depth | Number | 震源深度 |
| MaxIntensity | String | 最大震度（弱/強） |

---

## 三、地震速报历史接口

### 1. 中国地震台网地震信息

- **接口地址**: `https://api.wolfx.jp/cenc_eqlist.json`
- **请求方式**: GET
- **数据源**: CENC（中国地震台网）
- **WebSocket地址**: `wss://ws-api.wolfx.jp/cenc_eqlist`
- **数据数量**: 50条

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| type | String | WebSocket专用，固定值"cenc_eqlist" |
| No | String | 条目序号（1~50） |
| type | String | 信息类型（automatic/reviewed） |
| time | String | 发震时间（UTC+8） |
| location | String | 震源地（处理后） |
| placeName | String | 震源地（原始） |
| magnitude | String | 震级 |
| depth | String | 震源深度 |
| latitude | String | 震源纬度 |
| longitude | String | 震源经度 |
| intensity | String | 最大烈度 |
| md5 | String | 更新校验码 |

---

### 2. 日本气象厅地震情报

- **接口地址**: `https://api.wolfx.jp/jma_eqlist.json`
- **请求方式**: GET
- **数据源**: JMA（日本气象厅）
- **WebSocket地址**: `wss://ws-api.wolfx.jp/jma_eqlist`
- **数据数量**: 50条

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| type | String | WebSocket专用，固定值"jma_eqlist" |
| Title | String | 发报报头 |
| No | String | 条目序号（1~50） |
| time | String | 发震时间（UTC+9） |
| location | String | 震源地 |
| magnitude | String | 震级 |
| shindo | String | 最大震度 |
| depth | String | 震源深度 |
| latitude | String | 震源纬度 |
| longitude | String | 震源经度 |
| info | String | 津波情报（仅第一条） |
| md5 | String | 更新校验码 |

---

## 四、辅助接口

### 1. 服务器时间获取

- **接口地址**: `https://api.wolfx.jp/ntp.json`
- **请求方式**: GET

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| JST | String | 日本标准时间（UTC+9） |
| CST | String | 中国标准时间（UTC+8） |
| str | String | 当前日期时间 |
| int | Number | 当前日期时间（数值） |
| timestamp | Number | 当前时间戳 |

---

### 2. IP地址信息查询

- **接口地址**: `https://api.wolfx.jp/geoip.php`
- **请求方式**: GET
- **参数**: `?ip=<IP地址>`（可选）

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| ip | String | 请求IP |
| country_code | String | 国家/地区缩写 |
| country_name | String | 国家/地区 |
| country_name_zh | String | 国家/地区（中文） |
| province_code | String | 省/州代码 |
| province_name | String | 省/州 |
| province_name_zh | String | 省/州（中文） |
| city | String | 城市 |
| city_zh | String | 城市（中文） |
| latitude | Number | 纬度 |
| longitude | Number | 经度 |

---

### 3. 公网IP地址获取

- **接口地址**: `https://api.wolfx.jp/ip.php`
- **请求方式**: GET
- **返回格式**: 纯文本

---

### 4. 气象实况排行

- **接口地址**: `https://api.wolfx.jp/weather_rank.json`
- **请求方式**: GET

**返回字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| YYYYMMDDHH00 | String | 时间标识 |
| tempRank | Array | 气温排行（前10） |
| rainRank | Array | 降水排行（前10） |
| windSRank | Array | 风速排行（前10） |
| md5 | String | 更新校验码 |

---

### 5. 随机动漫图片

- **接口地址**: `https://api.wolfx.jp/img.php`
- **请求方式**: GET
- **参数**: `?return=<img/json>`

---

## 五、接口调用注意事项

1. **请求频率**: 建议预警接口每1秒查询一次，速报历史接口每5秒查询一次
2. **超时设置**: 建议设置30秒超时时间
3. **数据去重**: 建议根据EventID+Serial或md5+No进行数据去重
4. **时区处理**: 日本气象厅数据使用UTC+9，其他数据源使用UTC+8
5. **错误处理**: 接口可能返回空数据，需做好异常处理

---

## 六、软件内部API

### 主进程API（通过IPC通信）

| API方法 | 说明 | 参数 | 返回值 |
|---------|------|------|--------|
| getSettings | 获取所有设置 | 无 | settings对象 |
| saveSettings | 保存设置 | settings对象 | true/false |
| getEEWHistory | 获取预警历史 | count（数量） | EEW列表 |
| getEQHistory | 获取速报历史 | count（数量） | EQ列表 |
| playSound | 播放声音 | soundName（声音名称） | 无 |
| testSound | 测试声音 | soundName（声音名称） | 无 |
| closeAlert | 关闭预警弹窗 | 无 | 无 |
| setAutoStart | 设置开机自启 | enable（布尔值） | true/false |
| checkAutoStart | 检查开机自启状态 | 无 | true/false |

### 渲染进程事件监听

| 事件名 | 说明 | 参数 |
|--------|------|------|
| eewHistory | 预警历史更新 | EEW列表 |
| eqHistory | 速报历史更新 | EQ列表 |
| eewAlert | 预警通知 | {eew, localIntensity} |
| criticalAlert | 强提醒预警 | {eew, localIntensity, distance, sWaveSeconds} |
| sWaveCountdown | 横波倒计时更新 | seconds |
| sWaveArrived | 横波到达 | {eew, localIntensity} |

---

## 七、数据存储结构

### EEW表（eew）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键自增 |
| event_id | TEXT | 事件ID |
| serial | INTEGER | 速报序号 |
| report_num | INTEGER | 发报数 |
| title | TEXT | 标题 |
| code_type | TEXT | 发布分类 |
| issue_source | TEXT | 发布机构 |
| issue_status | TEXT | 发布状态 |
| announced_time | TEXT | 发布时间 |
| origin_time | TEXT | 发震时间 |
| hypocenter | TEXT | 震源地 |
| latitude | REAL | 纬度 |
| longitude | REAL | 经度 |
| magnitude | REAL | 震级 |
| depth | REAL | 深度 |
| max_intensity | TEXT | 最大烈度 |
| accuracy_epicenter | TEXT | 震央精度 |
| accuracy_depth | TEXT | 深度精度 |
| accuracy_magnitude | TEXT | 震级精度 |
| is_sea | INTEGER | 是否海域地震 |
| is_training | INTEGER | 是否训练报 |
| is_warn | INTEGER | 是否警报 |
| is_final | INTEGER | 是否最终报 |
| is_cancel | INTEGER | 是否取消报 |
| data | TEXT | 原始JSON数据 |
| created_at | TEXT | 创建时间 |

### EQ历史表（eq_history）

| 字段名 | 类型 | 说明 |
|--------|------|------|
| id | INTEGER | 主键自增 |
| md5 | TEXT | 更新校验码 |
| no | TEXT | 条目序号 |
| type | TEXT | 信息类型 |
| time | TEXT | 发震时间 |
| location | TEXT | 震源地 |
| place_name | TEXT | 原始震源地 |
| magnitude | TEXT | 震级 |
| depth | TEXT | 深度 |
| latitude | TEXT | 纬度 |
| longitude | TEXT | 经度 |
| intensity | TEXT | 烈度 |
| shindo | TEXT | 震度 |
| title | TEXT | 标题 |
| info | TEXT | 津波情报 |
| data | TEXT | 原始JSON数据 |
| created_at | TEXT | 创建时间 |

---

## 八、地理计算模型

### 距离计算公式（Haversine公式）

```
a = sin²(Δφ/2) + cos(φ1) · cos(φ2) · sin²(Δλ/2)
c = 2 · atan2(√a, √(1-a))
distance = R · c
```

其中：
- φ = 纬度（弧度）
- λ = 经度（弧度）
- R = 地球半径（默认6371km）

### 横波到达时间计算

```
P波传播时间 = 距离 / P波速度（默认7km/s）
S波传播时间 = 距离 / S波速度（默认4km/s）
预警时间 = S波传播时间 - P波传播时间
```

### 烈度计算公式

```
r = √(距离² + 深度²)

若震级 ≥ 5:
  烈度 = 2.66 + 1.63 × 震级 - 2.02 × log10(r)

若震级 < 5:
  烈度 = 1.24 + 2.2 × 震级 - 2.02 × log10(r)
```

---

文档版本: v1.0.0  
生成时间: 2026-07-11
