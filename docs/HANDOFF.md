# HANDOFF.md — 接手开发指南

> 写给下一个接手这个仓库的人。目标是**只看这一份文档**就能明白：项目结构、
> 数据怎么流、哪些部分已经可用、哪些还没有、以及哪些地方不要乱动。
> 内容依据当前仓库真实文件整理（2026-10-15）。

---

## 0. 一分钟版本

- **是什么**：汤圆Vision / 汤圆视界，一个静态个人数字空间。双核心是「摄影」与
  「地球 Online 进度」。
- **技术栈**：React 19 + TypeScript 5.9 + Vite 7 + Three.js 0.180 + Motion + Zustand +
  React Router 7；内容用 Decap CMS；静态部署到 GitHub Pages（Actions 上传 artifact）。
- **包管理**：pnpm 11（`packageManager: pnpm@11.8.0`）。不要换 npm/yarn。
- **公开站点**：`src/`（构建期内联 `src/content/data/*.json`）。后台是否可用**不影响访客**。
- **后台**：`public/admin/config.yml`（Decap CMS，本地 `local_backend` + `proxy` 后端；线上
  OAuth 未配置）。
- **没有服务端、没有数据库、没有访客互动 API。** 点赞/收藏/排行**已移除**。

---

## 1. 目录与架构

```
src/
  app/            # 路由唯一注册表 routes.ts、App 外壳、字体/主题引导
  components/     # 通用 UI：Icon、Button、GlassSurface、SmartImage、ProvenanceBadge…
  content/        # 内容层：types.ts（类型）、index.ts（读取 + 运行时降级校验）、data/*.json
  features/       # 每个场景一个目录：home / about / photography / earth / riding /
                  #   lab / projects / journal / contact / secret / not-found
  hooks/          # useFocusTrap、useDocumentTitle、usePrefersReducedMotion…
  lib/            # asset（base 路径拼接）、其他无状态工具
  store/          # zustand：useUIStore、useVisualStore、useSoundStore
  styles/         # 全局 CSS（glass.css、tokens 等）
public/
  admin/          # Decap CMS 后台（index.html + config.yml）
  assets/         # 品牌、摄影示例图、earth 贴图与 admin1 分块
tools/            # 构建/校验脚本（品牌资源、示例图、音频、CDP 浏览器验证）
docs/             # 本目录
```

**路由唯一真源**：`src/app/routes.ts`。新增场景 = 加一条记录 + 一个页面组件，没有第二处。
当前九个公开场景 + 一个隐藏场景（`/the-quiet-space`）。

---

## 2. 关键文件

| 关注点 | 文件 |
|---|---|
| 路由注册 | `src/app/routes.ts` |
| App 外壳 / 键盘快捷键 / 路由播报 | `src/App.tsx` |
| 内容类型 | `src/content/types.ts` |
| 内容读取 + 坏数据降级 | `src/content/index.ts` |
| 内容数据 | `src/content/data/*.json` |
| 地球三维渲染 + 拾取 | `src/features/earth/EarthGlobe.tsx` |
| 地球页面（`/earth`） | `src/features/earth/EarthPage.tsx` |
| 国家空间索引 | `src/features/earth/geo-index.ts` |
| 省级命中测试（纯函数） | `src/features/earth/admin1-pick.ts` |
| 省级数据按需加载 | `src/features/earth/admin1.ts` |
| 经纬度 ↔ 球面局部坐标 | `src/features/earth/solar.ts` |
| 地区面板（国家 / 省两级） | `src/features/earth/RegionPanel.tsx` |
| 摄影页 | `src/features/photography/PhotographyPage.tsx` |
| 灯箱 | `src/features/photography/Lightbox.tsx` |
| 手势 / 摄像头（可选增强） | `src/features/earth/gesture/*` |
| CMS 配置 | `public/admin/config.yml` |

---

## 3. 数据流

### 3.1 内容（所有页面）

```
src/content/data/*.json
  → src/content/index.ts （import + 运行时校验，坏记录降级为默认值，不白屏）
  → 页面/组件 import 具名常量（PHOTOS、CONTACT_CHANNELS、BRAND…）
```
公开站点在**构建时**把 JSON 内联，`/admin` 的写入只是改这些 JSON 再走 Git。
手工编辑 JSON 与 CMS 写入等价；改完请跑 `pnpm typecheck && pnpm build`。

### 3.2 地球（`/earth`）

```
指针事件 → 真实射线（three Raycaster）命中球面
  → 命中点由世界坐标转回球体局部坐标（乘旋转的逆）
  → directionToLatLon(x,y,z) 得到经纬度        ← 唯一坐标约定，勿改
  → GeoIndex.lookup(lat, lon) 得国家（natural earth 1:110m）
  → 若该国的 Admin-1 分块已加载：pickProvince(items, lon, lat) 得省
      · 省级命中 → 省级面板（优先）
      · 无命中/未加载 → 国家级面板
  → 城市标记（放大到某距离才出现）优先于以上两者
```
- 外部接口 **`pickRegion` / `queryAtScreen` / `selectAtScreen` 的行为契约保持不变**：
  `queryAtScreen` 只查询不选中，`selectAtScreen` 选中并开面板。
- 省级数据来自 `public/assets/earth/admin1/*`，**按需加载 + 缓存**，不打包；每个国家一份。
- **选中一个行政区 ≠ 到访**。旅行记录独立来自 `travels.json`（当前 0 条）。

### 3.3 摄影（`/photography`）

`photography.json` → 分类过滤 → 编辑式阅读器（左图右文）+ 缩略图轨 + `Lightbox`。
灯箱是独立 portal：无循环翻页（首尾停住）、缩略图胶片带、`Esc` 关闭、锁背景滚动、
触屏左右滑动、快速切图按 `key` 重挂载以避免旧请求覆盖新图。

### 3.4 Lab / Projects / Journal / About / Contact

均由对应 `*.json` 驱动。没有内容的模块显示**诚实的空状态**，不编造。

---

## 4. 当前功能状态

标记含义：**已实现** = 代码完成；**代码检查** = 类型/Lint/Build；**浏览器实测** =
用 `tools/cdp.cjs` 在真实 Edge headless 中跑过；**需所有者配置** = 缺账号/密钥/OAuth；
**未验证** = 本轮环境无法验证。

| 模块 | 状态 |
|---|---|
| 地球：国家轮廓 + 拾取同源（`directionToLatLon`） | 已实现 · 浏览器实测 |
| 地球：点阵海陆分类 `aLand` 同源 | 已实现 · 浏览器实测 |
| 地球：**省级边界渲染 + 内部点击 + 两级导航** | 已实现 · 浏览器实测（桌面+手机） |
| 地球：城市标记 / 城市卡片 | 已实现 · 浏览器实测 |
| 地球：手势 / 摄像头 | 已实现 · **摄像头未验证**（本环境无摄像头） |
| 摄影：分类 / 阅读器 / 灯箱（无循环+胶片带+Esc+触控） | 已实现 · 浏览器实测 |
| 点赞 / 收藏 / 热门排行 | **已移除**（产品方向）；共享后端不存在，**需所有者配置** |
| Lab / Projects / Journal / About / Riding / Secret 页面 | 已实现 · 浏览器实测（可达、无报错） |
| 联系页：仅 抖音 / 邮箱 / GitHub | 已实现 · 浏览器实测；三项真实值**需所有者配置** |
| CMS 本地后台（`pnpm cms` + `pnpm dev`） | 已实现 |
| CMS 线上 OAuth / Git 写回 | **需所有者配置**（未上线，勿宣称可用） |
| GitHub Pages 部署 | 已实现（workflow）；线上发布**未验证** |

---

## 5. 关键设计决策（以及为什么）

1. **坐标约定只有一套**：地理↔球面局部统一走 `solar.ts` 的
   `latLonToDirection` / `directionToLatLon`。点阵海陆分类、国家拾取、省级拾取、标记
   全部复用。**禁止**改用 `u*360-180 / v*180-90` 的简单 UV 换算——已实测该映射相对本项目
   的 `atan2(-x,-z)` UV 有经度偏移/镜像。
2. **地理事实与个人经历分离**：国界/省界来自 Natural Earth；旅行来自 CMS 内容。
   未到访地区只显示「暂无旅行记录」。
3. **没有后台不阻塞前台**：内容构建期内联。
4. **不做社交互动**：没有点赞/评论/收藏/排行。
5. **静态优先**：没有服务端；留言表单被有意移除，并在页面上说明原因。

---

## 6. 建议的接手顺序

1. `pnpm install`；`pnpm dev` 跑起来，浏览器过一遍 `/`、`/earth`、`/photography`、`/contact`。
2. `pnpm cms`（另一个终端）→ 打开 `/admin/index.html` 改一条内容，确认前台生效。
3. 读 `src/app/routes.ts` 与 `src/content/index.ts`，建立"页面/内容"心智模型。
4. 若要碰地球：先读 `docs/EARTH.md` 与 `docs/DATA_SOURCES.md`，再动 `EarthGlobe.tsx`。
5. 若要升级到高精度地理：见 `docs/DATA_SOURCES.md` 第 4 节的 1:10m 待办。

---

## 7. 关键接口 / 数据格式

- `GlobeControlApi`（`EarthGlobe.tsx` 导出）：`rotateBy / zoomBy / confirmAtCentre /
  selectAtScreen / queryAtScreen / reset / setAutoRotate / setSpin`。手势会话通过 `controlRef`
  驱动，避免每帧 React 渲染。
- `__earthAim`（挂在球体宿主元素上的**只读**测试句柄）：
  `face / faceGeo / current / pickAt / selectAt / queryAt / pickCity / provinceAtGeo /
  lastClick / zoom`。仅供 `tools/` 下的验证脚本使用，UI 不依赖。
- 内容类型见 `src/content/types.ts`；每条列表记录带 `provenance: real | sample`。

---

## 8. 已知风险与限制

- **地理精度**：国家几何为 1:110m，省级为 1:50m。这不是高精度系统；升级必须同源升级
  国家几何 + GeoIndex + 点阵分类 + 省级边界（见 DATA_SOURCES.md）。
- **城市集**：仅 243 个主要城市，**不是**全球全部城市。
- **启动动画**：首屏 `BootSequence` 覆盖层约 3.5–4s 才完全淡出；在此之前点击会命中覆盖层。
  若觉得过长，改 `src/components/boot/`（注意 `prefers-reduced-motion` 已有降级）。
- **CMS 线上认证**：未配置，`/admin` 在线上目前只读不了仓库。
- **`node_modules/.pnpm` 在某些受限执行环境不可读**，会导致 `tsc`/`eslint`/`vite build`
  无法在该环境代跑；请在本机正常终端运行。

---

## 9. 仍需网站所有者提供 / 配置

- 真实的 **抖音主页链接**、**公开邮箱**、**GitHub 主页地址**（填入 CMS「联系方式」→ 三个渠道的
  `handle` / `url`，并把 `confirmed` 置为 `true`）。
- **CMS 线上认证**：GitHub OAuth App + 免费中转（sveltia-cms-auth / Netlify Git Gateway），
  见 `docs/CMS.md` 第 4 节。
- 真实摄影作品与拍摄信息（替换 `src/content/data/photography.json`，`provenance` 改 `real`）。
- 真实旅行记录（替换 `travels.json`）。
- 个人宣言/介绍/经历/想法等真实文本（CMS 可改）。
- 若提供 MapTiler key，可设 `VITE_MAPTILER_KEY`（可选，地球无 key 也能工作）。

---

## 10. 已验证 / 尚未验证

- **浏览器实测通过**（本轮，`tools/cdp.cjs`，桌面 1440×900 + 手机 390×844）：
  地球国家/省/城市交互、省级两级导航、摄影灯箱（无循环/胶片带/Esc/滚动恢复）、
  全站路由可达无报错、联系页仅三项。
- **代码检查**：请在本机运行 `pnpm exec tsc -b`、`pnpm run lint`、`pnpm run build` 并记录退出码
  （本执行环境无法读 `node_modules`，不代跑、不虚报）。
- **摄像头**：未验证。
- **CMS 线上登录 / 线上发布**：未验证（需所有者配置）。
