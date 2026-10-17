# 地球 Online 进度 — 内容与数据

本文说明「地球」专题的内容结构、如何录入真实旅行记录，以及为什么本站不提供访客投票。

---

## 1. 内容数据

| 层 | 存放位置 | 谁写 | 内容 |
|---|---|---|---|
| **内容** | `src/content/data/travels.json`（Git） | 你，通过 CMS 或直接编辑 | 你去过哪里、什么时候、故事、照片 |

**本站没有访客互动数据。** 站点是个人作品集与个人空间：没有点赞、评论、收藏、投票或热门排行。所有内容都来自内容文件，由站点所有者通过 CMS 维护。

**也不要假设 CMS 能提供共享计数后端。** Decap CMS 只是把你写的内容提交到 Git 仓库，
它没有任何实时写入能力。

---

## 2. 地理事实 vs 个人经历

系统里有两件必须分开的事：

- **地区是地理事实。** 国界、ISO 代码、位置来自 Natural Earth（公有领域），
  与你是谁无关，177 个国家与地区全部可识别。
- **到访是你的个人记录。** 它来自 `travels.json`，**没填就是没填**。

分开的原因很直接：混在一起，一个从未去过的地方会看起来像去过。

---

## 3. 当前状态

`src/content/data/travels.json` **的 `items` 是空数组**。这是刻意的：

- 地球能识别 177 个国家与地区
- 但**没有任何一条真实旅行记录**
- 所以每个国家都显示「尚未记录」，并说明这是准确的状态而非疏漏

页面头部的统计（已到访 / 计划中 / 可识别）**由内容实时计算**，
没有硬编码。你现在看到的会是 `0 / 0 / 174`。

> 174 而不是 177：数据集里有 3 个几何要素没有可用的数字 ID，构建索引时被跳过。
> 这是数据源的问题，不是遗漏。

---

## 4. 如何录入真实旅行记录

### 方式一：CMS（推荐）

```bash
# 终端 A
pnpm dev
# 终端 B（本地写入后端）
pnpm cms
```

打开 http://127.0.0.1:5183/admin/ → 「地球与旅行」集合 → 新建。

### 方式二：直接编辑 JSON

编辑 `src/content/data/travels.json`：

```json
{
  "items": [
    {
      "regionId": "156",
      "status": "visited",
      "title": "环青海湖",
      "visitedAt": "2026-07-14",
      "story": "第一段……\n\n第二段……",
      "photoIds": ["my-photo-01", "my-photo-02"],
      "latitude": 36.62,
      "longitude": 100.11,
      "published": true
    }
  ]
}
```

### 字段说明

| 字段 | 必填 | 说明 |
|---|---|---|
| `regionId` | ✅ | ISO 3166-1 **数字**代码，字符串。中国 `"156"`、日本 `"392"`、美国 `"840"` |
| `status` | ✅ | `visited` \| `planned` \| `unrecorded` |
| `label` | | 覆盖内置中文名。只在默认名不对时才填 |
| `title` | | 例如一次旅行的名字 |
| `visitedAt` | | `YYYY-MM-DD`。**只有真的去过才填** |
| `story` | | 正文，空行分段 |
| `photoIds` | | 引用 `photography.json` 里的作品 `id` |
| `latitude` / `longitude` | | **只有记录了具体地点时才填** |
| `published` | | 是否公开显示 |

### 三种状态在页面上的行为

- **`visited`** → 显示日期、正文、关联照片、坐标（填了才显示）。
  正文或照片为空时显示「这次旅行还没有写下正文」，**不补造内容**。
- **`planned`** → 说明在计划中，并明确写出「计划不等于经历」。
- **`unrecorded`** → 直说「我还没有去过这里，因此这里没有任何旅行记录」。
  **不编造日期、路线、照片或来源。**

---

## 5. 访客互动：本站没有

汤圆 Vision 是个人作品集与个人空间，**不提供点赞、评论、收藏、投票或热门排行**。
地球页面用于探索地区、阅读真实旅行记录与摄影关联，不是投票工具：

- 未到访地区只如实说明「我还没有去过这里」，**没有「我也想去」按钮，也没有任何票数**。
- 没有目的地支持数、热度统计，也没有用户参与形成的榜单。
- 因此站点不需要任何访客互动后端：旧版的 Supabase 交互层与两个 hook 已在本轮移除，
  运行时不再发起任何互动请求。

`planned` 状态仍然保留，但它只表示**站点所有者自己的**出行计划，不是访客投票。
---

## 6. 中文国名从哪来

`src/features/earth/regions.ts` 里有约 120 个中文名，**刻意是部分映射**。

映射表外的国家回退到数据源里的英文名——**没有经过机器翻译**，
因为一个错误的中文名比一个正确的英文名更糟。

想补某个国家的名字，在 `REGION_LABELS` 里加一行：

```ts
'392': '日本',   // ISO 数字代码 -> 中文名
```

或者在某条旅行记录里用 `label` 字段单独覆盖。

---

## 7. 数据来源与许可

| 用途 | 来源 | 许可 |
|---|---|---|
| 昼面纹理 | NASA/Goddard — "Whole world - land and oceans" | 公有领域 |
| 夜间灯光 | DMSP 1994–1995（NASA GSFC / NOAA NGDC） | 公有领域 |
| 云层 | three.js 示例素材 | MIT |
| 国界 | Natural Earth 1:110m | 公有领域 |

完整的上游文件、原始尺寸、许可与体积记录在
`public/assets/earth/textures.json`（由 `tools/build-earth-textures.cjs` 生成）。

**两点必须知道：**

1. **夜间灯光是 1994–1995 年的数据**，是真实观测，但距今约三十年，
   不代表当下的灯光分布。页面与文档都标注了这一点。
2. **地表是静态贴图，不是实时卫星画面。** 昼夜分界是本地按真实太阳位置算的，
   但贴图本身是固定图像。

---

## 8. 城市层数据（Stage 2）

地球页新增一层**真实城市**，数据来自 **Natural Earth「Populated Places」(ne_110m)**，**公有领域**（无需署名）。

- 上游文件：`https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_110m_populated_places.geojson`
- 转换产物：`src/features/earth/data/cities.json`（由该 GeoJSON 精简而来；原始文件放在 `tools/_data/`，不入库）。
- 字段映射：`id`←`NE_ID`，`name`←`NAME`，`nameEn`←`NAME_EN`/`NAMEASCII`，`nameZh`←`NAME_ZH`，
  `lat`←`LATITUDE`，`lon`←`LONGITUDE`，`country`←`ADM0NAME`，`countryCode`←`ISO_A2`，`pop`←`POP_MAX`。
- **覆盖范围与限制：该数据集只有 243 条记录**，以首都与主要城市为主，**并不覆盖全球所有城市**。
  它是城市层的**第一版基础层**。本项目**不补造**城市、坐标或人口；缺失字段一律隐藏。
- 版本：Natural Earth Vector（ne_110m_populated_places）；人口为 `POP_MAX`（Natural Earth 的聚合估计，非实时）。

### 渲染方式（两套独立图层，同一份数据）
- **城市装饰光点**：全部 243 个真实坐标；点大小按 `log(pop)` 做克制区分；亮度按**真实太阳角度**在背光侧适度增强。
- **可交互城市标记**：同一坐标，更大的点，**仅在拉近到一定缩放级别后出现**（全局视图不显示），并随缩放逐步增加密度。
- 命中检测：把每个真实城市的世界坐标投影到屏幕，**只允许地球正面（world.z > 0）**命中；命中城市优先，
  未命中城市时回退到原有的国家/地区选区。射线穿透球体选择背面城市被禁止。

---

## 9. 一级行政区（Admin-1）数据（Stage 3A）

- 来源：**Natural Earth 1:50m Admin 1 – States/Provinces**（`ne_50m_admin_1_states_provinces.geojson`）。
  - URL：`https://github.com/nvkelso/natural-earth-vector/tree/master/geojson`
  - 许可：**公有领域（Public domain）**。
  - 导入日期：2026-10-15。覆盖：全球约 249 个国家/地区的一级行政区。
- 原始文件（约 **40.7 MB**）保留在 `tools/_data/admin1_states_provinces.geojson`，**不进入前端包**。
- 转换产物：`public/assets/earth/admin1/<ADM0_A3>.json`（按国家/地区分块，**按需加载**）+ `public/assets/earth/admin1/index.json`（国家 → 数量索引）。
  - 转换：坐标四舍五入到 **3 位小数（约 110 m）**，顶点按 **约 1 km** 做距离抽稀；保留 Polygon/MultiPolygon 及孔洞。
  - 统计：特征 **4596** → 保留 **4570**（**26** 条几何不可用而丢弃）；唯一 ID **4570**，重复 ID **0**，缺父级 **0**，缺 ID **0**；**249** 个国家分块；总产物 **约 17.4 MB**。
- 字段映射：`id`←`adm1_code`（回退 `iso_3166_2`/`ne_id`），`name`←`name`，`nameEn`←`name_en`，`nameZh`←`name_zh`（有则保留），`type`←`type_en`，`iso3166_2`←`iso_3166_2`，父级国家键 `adm0`←`adm0_a3`。
- **局限**：父级键为 **ISO alpha-3（adm0_a3）**；项目现有国家索引（`countries-110m.json`）使用 **ISO 数字**（`RegionShape.id`）。二者关联需要一份 alpha-3 ↔ 数字 的对照表（当前仓库暂无），因此在拿到该对照之前，Admin-1 分块**尚未接入运行时边界层与国家选区/资料卡层级**。
