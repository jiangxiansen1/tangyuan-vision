# DATA_SOURCES.md — 地理数据来源、版本、生成与约定

> 依据当前仓库实际文件编写（2026-10-15）。所有数据均为 **Natural Earth（公有领域）**。

## 1. 运行时地理数据

| 文件 | 内容 | 来源 | 许可 | 载体 |
|---|---|---|---|---|
| `src/features/earth/data/countries-110m.json` | 国家级边界（TopoJSON：`countries` + `land`，177 个要素，属性仅 `{name}` + 数字 `id`） | Natural Earth 1:110m Admin-0（world-atlas/natural-earth-vector 派生） | 公有领域 | 随构建打包 |
| `src/features/earth/data/cities.json` | 243 个主要城市点（`id,name,nameEn,nameZh,lat,lon,country,countryCode,pop`） | Natural Earth ne_110m populated places | 公有领域 | 随构建打包 |
| `public/assets/earth/admin1/<ADM0_A3>.json` | 各国一级行政区分块（Polygon/MultiPolygon，3 位小数≈110m，顶点≈1km 抽稀） | Natural Earth ne_50m Admin-1（`tools/_data/admin1_states_provinces.geojson`，4596 要素） | 公有领域 | **按需加载的静态资源** |
| `public/assets/earth/admin1/map.json` | `ADM0_A3 → ISO_N3` 交叉映射 | Natural Earth ne_10m Admin-0 countries | 公有领域 | 按需加载 |
| `public/assets/earth/admin1/index.json` | 国家 → 行政区块数量索引 | 由脚本生成 | 公有领域 | 按需加载 |
| `public/assets/earth/earth-day.jpg` / `earth-night.jpg` / `earth-specular.jpg` | 昼夜地表与镜面掩膜（仅用于**明暗**，不再用于海陆分类） | NASA Blue Marble / DMSP | 公有领域 | 静态资源 |

## 2. 坐标与球面约定（唯一定义）

- 地理→球面局部：`lonR = (−180 − lon)`、`latR = lat`（度→弧度），
  局部点 = `(0,0,R).applyAxisAngle(X_AXIS, −latR).applyAxisAngle(Y_AXIS, −lonR)`。
- 球面局部→地理：`src/features/earth/solar.ts` 的 `directionToLatLon(x,y,z)`
  = `lat = asin(ny)`，`lon = atan2(−nx, −nz)`（对向量归一化）。
- **国家级拾取**（`pickRegion`/`queryAtScreen`/`selectAtScreen`）与 **点阵海陆分类（`aLand`）** 均使用这套 `directionToLatLon` 约定 →
  可见轮廓与选区同源一致。
  - ⚠️ **不要**改用 `u·360−180 / v·180−90` 之类的简单 UV 换算：已实测该映射相对本项目的 `atan2(z,−x)` UV 存在经度偏移/镜像，会产生错误海陆分类。

### 2.1 拾取链路（国家 → 省 → 城市）

```
真实射线命中球面
  → 世界坐标 → 球体局部（乘旋转逆）
  → directionToLatLon(x,y,z)            # solar.ts，唯一约定
  → GeoIndex.lookup(lat, lon)           # geo-index.ts，1:110m 国家，网格索引
  → pickProvince(admin1Items, lon, lat) # admin1-pick.ts，纯函数，bbox 索引 + 内外环 + 日期变更线
      · 仅当该国的分块已加载且国家 id 匹配时才测试省级（否则退回国家级）
  → 城市标记：镜头拉近（distance < 2.25）时才可拾取，优先级最高
```

- 省级数据加载器：`src/features/earth/admin1.ts`（`loadAdmin1ForCountry(ISO_N3)`，
  按需 fetch + promise 缓存，失败不缓存为成功）。
- 省级命中测试：`src/features/earth/admin1-pick.ts`（`pickProvince` / `provinceCenter`），
  **纯函数**，无需相机即可单测；``WeakMap`` 缓存预处理后的包围盒。
- **旅行记录（`travels.json`）与行政区几何是两套数据**，选中行政区不等于到访。

## 3. 生成脚本与流程

- 城市：`tools/_data/city-places.geojson` → `src/features/earth/data/cities.json`（精简映射）。
- 省级：`tools/_data/admin1_states_provinces.geojson` → `public/assets/earth/admin1/*`（按 `ADM0_A3` 分块）。
- 交叉映射：`tools/_data/ne_10m_admin_0_countries.geojson` 的 `ADM0_A3`↔`ISO_N3` → `map.json`。
- 原始文件（`tools/_data/*.geojson`，约 40MB+）仅作源文件，**不打包进前端**。

## 4. 精度边界与已知限制

- 当前国家几何为 **1:110m（全球概览级，粗）**。本次仅完成"同源化"，**不是**高分辨率地理系统。
- 城市集仅 **243** 个主要城市，**不是**全球所有城市。
- 省级数据为 **1:50m**，覆盖约 249 个国家/地区；某些小属地无对应国家条目（`map.json` 未匹配），不显示边界。
- **1:10m 升级待办**：必须同时升级 国家几何 + `GeoIndex` + 点阵分类 + 省级边界（同一数据版本/约定），不能只换其一。