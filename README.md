# 汤圆Vision — 个人数字空间

> **汤圆Vision** · 汤圆视界 · CAPTURE MOMENTS
> 一个以「摄影」与「地球 Online 进度」为双核心的沉浸式个人数字空间。
> 浅色未来主义的排版与材质、可真实交互的三维地球（国家 / 省级 / 城市三级）。

**纯静态站点：没有服务端、没有数据库、没有访客互动接口。**
本站**不做**点赞 / 评论 / 收藏 / 投票 / 热门排行，相关内容与数据层已移除。

**接手与维护请先读这些文档：**

| 文档 | 内容 |
|---|---|
| [docs/HANDOFF.md](docs/HANDOFF.md) | 架构、数据流、关键文件、现状与风险（**先读这个**） |
| [docs/CONTENT_GUIDE.md](docs/CONTENT_GUIDE.md) | 不改代码就能改内容的方法 |
| [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) | 地理数据来源、版本、坐标约定、精度边界 |
| [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md) | 本轮真实验收台账（含未验证项） |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署与回滚 |
| [docs/CMS.md](docs/CMS.md) | CMS 配置与线上认证步骤 |

---

## 目录

- [这是什么](#这是什么)
- [30 秒跑起来](#30-秒跑起来)
- [目录结构](#目录结构)
- [V3 版本说明](#v3-版本说明)
- [设计系统](#设计系统)
- [液态玻璃材质](#液态玻璃材质)
- [内容管理](#内容管理)
- [地球 Online 进度](#地球-online-进度)
- [替换内容](#替换内容)
- [替换 Logo](#替换-logo)
- [摄影图片与音频资源](#摄影图片与音频资源)
- [部署到 GitHub Pages](#部署到-github-pages)
- [无障碍与键盘操作](#无障碍与键盘操作)
- [性能策略](#性能策略)
- [已知限制](#已知限制)
- [验证记录](#验证记录)

---

## 这是什么

一个静态站点。没有服务端、没有数据库、没有需要付费的第三方服务。

它由三部分组成：

| 部分 | 说明 | 位置 |
|---|---|---|
| **公开站点** | React + TypeScript + Vite 构建的纯静态产物 | `src/` |
| **内容** | 若干 JSON 文件，是站点与后台之间唯一的数据源 | `src/content/data/` |
| **管理后台** | Decap CMS，静态文件形式挂在 `/admin/`，通过 Git 工作流写回仓库 | `public/admin/` |

公开站点在构建时把内容内联，因此**后台是否可用完全不影响访客访问**。
后台没配置、服务挂了、你从来不用它 —— 站点照常运行。

### 站点包含什么

首页是**三层结构**，不是等宽卡片网格：

1. **中央品牌核心**——「汤圆Vision」/「汤圆视界」/ `A WORLD BEYOND THE FRAME`，
   叠加在摄影背景上，是页面上最容易被记住的元素。
2. **左右两个核心窗口**——摄影（左）与地球 Online 进度（右）。二者**刻意不等宽、
   不等高且有错位**，避免读成两列网格。摄影窗口用真实作品栈做预览，地球窗口
   内嵌一个**真实旋转的三维地球**。
3. **次级入口**——AI 与编程 Lab、个人项目作为紧凑窗口；
   关于我 / 随笔 / 联系方式 / 隐藏空间作为更轻量的文字级入口。

**地球专题**是一个独立的三维空间：真实昼夜分界（按本地计算的太阳位置）、
夜间城市灯光、云层、大气散射、射线拾取经纬度并解析国家。

- **九个专题**：关于我 / 摄影 / **地球 Online 进度** / 摩旅与骑行 / AI 与编程 /
  个人项目 / 随笔 / 联系方式 / 隐藏空间。
- **一个隐藏空间**：多条进入方式，且都能用键盘完成。
- **一个 404 页面**：带本地内容检索和完整索引，不是一个死胡同。

### 内容诚实性

这是本项目的一条硬性约束，实现方式是**在界面上标记**，而不是写在文档里：

- 任何示例内容都带 `示例 / SAMPLE` 标记（见 `ProvenanceBadge`）。
- 任何未提供的字段显示 `待填写 / TBD`，**绝不生成看起来合理但不存在的
  链接、账号、里程、经纬度、拍摄设备或 EXIF 数据**。
- 摩旅路线中「计划中」与「已完成」是两种不同的状态，示例路线一律标记为
  `planned`，不会被写成已完成的旅行。
- 留言表单**不存在**，因为纯静态站点没有接收它的后端。页面上直接说明了原因。

---

## 30 秒跑起来

需要 **Node.js 20+** 与 **pnpm**。

```bash
pnpm install          # 安装依赖
pnpm dev              # 启动开发服务器
```

开发服务器默认在 `http://127.0.0.1:5183`。

```bash
pnpm typecheck        # TypeScript 类型检查
pnpm lint             # ESLint
pnpm build            # 类型检查 + 生产构建，输出到 dist/
pnpm preview          # 本地预览生产构建
```

### 可选：重新生成静态资源

`public/` 下的资源已经提交到仓库，**不改内容就不需要重新生成**。
只有替换 Logo、替换示例图或替换环境音时才需要：

```bash
pnpm assets:brand     # 从源 Logo 重新生成全部品牌资源
pnpm assets:stock     # 重新生成示例摄影图
pnpm assets:audio     # 重新生成环境音
```

这三个脚本需要 `sharp`。它已作为可选开发依赖列出；若安装失败，
脚本会给出明确的提示而不是静默失败。

### 可选：启动本地内容管理后台

```bash
pnpm cms              # 启动 decap-server 本地代理
```

然后在**另一个终端**运行 `pnpm dev`，访问 `http://127.0.0.1:5183/admin/index.html`（开发服务器上 `/admin/` 会被 SPA fallback 抢占；生产静态主机上 `/admin/` 亦可用）。后台为本地代理后端（`proxy` + `local_backend: true`），详见 `docs/CMS.md` 与 `docs/cms-online-readiness.md`。
本地后端直接写你的工作副本，不需要 OAuth、不需要 GitHub App、不需要付费。
详见 [docs/CMS.md](docs/CMS.md)。

### 可选：自己跑一遍验证

```bash
pnpm build
pnpm preview --port 4190          # 终端 1

# 终端 2
node tools/browser-check.cjs http://127.0.0.1:4190/            # 单路由
node tools/browser-check.cjs http://127.0.0.1:4190/ --reduced-motion

# 子路径部署 + 深层链接（两处 base 必须一致）
VITE_BASE_PATH=/TangyuanVision/ pnpm build
VERIFY_BASE=/TangyuanVision/ node tools/verify-deeplink.cjs --browser
```

这些脚本会真实启动 Chromium 内核，输出 `PASS` / `FAIL`，
失败时以非零状态码退出，可以直接接进 CI。
结果记录在 [docs/TESTING.md](docs/TESTING.md)。

---

## 目录结构

```
tangyuan-vision/
├── index.html                  HTML 外壳（含未执行 JS 时的降级说明）
├── vite.config.ts              base 路径解析、HTML 元数据注入、构建分包
├── eslint.config.js
├── tsconfig*.json
├── pnpm-workspace.yaml         仅用于放行 esbuild 的构建脚本
│
├── src/
│   ├── main.tsx                入口：深层链接还原 → 诊断 → 挂载路由
│   ├── App.tsx                 应用根：路由、启动动画、全局快捷键、常驻面板
│   │
│   ├── app/routes.ts           ★ 路由与场景注册表（单一来源）
│   │
│   ├── components/
│   │   ├── glass/              GlassSurface（六层材质）、折射滤镜定义
│   │   ├── boot/               启动动画
│   │   ├── brand/              Logo 组件与资源几何
│   │   ├── cursor/             自定义光标
│   │   ├── transitions/        路由转场
│   │   ├── settings/           设置面板与入口
│   │   ├── audio/              音乐 / 音效开关
│   │   ├── layout/             场景布局、加载骨架
│   │   └── ui/                 图标、按钮、图片、标记、Toast
│   │
│   ├── features/               每个专题一个目录
│   │   ├── home/               主空间：空间窗口、WebGL 景深、隐藏入口
│   │   ├── about/  photography/  riding/  lab/  projects/
│   │   ├── journal/  contact/  secret/  not-found/
│   │
│   ├── content/
│   │   ├── types.ts            内容模型（与 CMS 字段一一对应）
│   │   ├── index.ts            读取 + 运行时校验 + 防御性默认值
│   │   └── data/*.json         ★ 全部内容（CMS 写入的就是这些文件）
│   │
│   ├── hooks/                  媒体查询、减弱动效、焦点陷阱、视口显现、
│   │                           指针高光、视差、隐藏入口、页面元数据
│   ├── lib/                    资源路径、存储、声音引擎、深层链接、诊断
│   ├── store/                  Zustand：UI / 声音 / 视觉偏好 / 空间导航
│   └── styles/                 设计系统（见下）
│
├── public/
│   ├── assets/
│   │   ├── brand/              Logo 全套资源 + brand.json 溯源清单
│   │   ├── photography/        示例摄影图（原图 + 缩略图）
│   │   ├── audio/              环境音 + 说明
│   │   └── uploads/            CMS 上传目录（构建时生成）
│   ├── admin/                  Decap CMS 后台（config.yml + index.html）
│   ├── 404.html                ★ GitHub Pages 深层链接回退
│   └── favicon.png
│
├── tools/                      资源生成与验证脚本（Node，不参与打包）
│   ├── tv.cmd                  本机工具链包装（见下）
│   ├── build-brand-assets.cjs  从源 Logo 生成全套品牌资源
│   ├── build-sample-photos.cjs 生成示例摄影图
│   ├── build-audio.cjs         生成环境音
│   ├── browser-check.cjs       真实浏览器逐路由验证（读应用自身的诊断输出）
│   ├── verify-deeplink.cjs     模拟 GitHub Pages 验证深层链接回退与子路径部署
│   └── capture-routes.cjs      逐路由截图
│
├── .github/workflows/deploy.yml   构建 + 部署到 GitHub Pages
└── docs/                       部署、CMS、内容替换、测试报告
```

### 关于 `tools/tv.cmd`

这台开发机上没有全局安装 Node，DSH Desktop 在 Electron 里内置了 Node 24 并把它
暴露为 `node.cmd` 垫片。`tools/tv.cmd` 把该运行时放进 `PATH` 后执行命令：

```cmd
tools\tv.cmd pnpm run build
tools\tv.cmd node tools\browser-check.cjs http://127.0.0.1:4184/
```

**在正常安装了 Node 的机器上这个文件完全不需要**，直接 `pnpm install && pnpm dev` 即可。

---

---

## V3 版本说明

V3 的核心改动（完整说明见 [docs/V3.md](docs/V3.md)）：

| 改动 | 说明 |
|---|---|
| 浅色重构 | 珍珠白 / 雾白基底。**不是只改背景色**——布局、字体、材质、留白、图片比例都改了 |
| 品牌写法 | 从拼音 `TangyuanVision` 改为 **汤圆Vision** + 中文释义 **汤圆视界** |
| 首页结构 | 三层空间布局，取代 V2 的三列七窗口网格 + 统计条 + 装饰编号 |
| 三维地球 | 真实可旋转地球：昼夜、夜间灯光、云层、大气、国界识别 |
| 访客互动 | **无**：本站不做点赞、评论、收藏、投票或热门排行 |
| 启动动画 | 1650 ms → 1200 ms，可跳过，有硬性兜底退出 |

**深色仍然存在，且是刻意的**：地球页与摄影灯箱保留深色背景，
因为受光的球体只能在不受光的场里读出来，而明亮的周围环境会改变你对图片的感知。

---

## 地球 Online 进度

内容结构与录入方式见 [docs/EARTH.md](docs/EARTH.md)。三件要知道的事：

**1. 现在没有任何真实旅行记录。** `src/content/data/travels.json` 的
`items` 是空数组，这是刻意的。地球能识别 177 个国家与地区，
但页面为每个国家显示「尚未记录」——因为确实没去过，而不是忘了填。

**2. 纹理是真实的，但不是实时的。** 地表与夜间灯光是 NASA 的**公有领域**影像；
夜间灯光来自 DMSP **1994–1995** 年合成图，是真实观测但距今约三十年。
昼夜分界由本地按真实太阳位置计算，但贴图本身是静态图像，不是卫星直播。

**3. 没有访客投票。** 站点不做点赞、评论、收藏、投票或热门排行；未到访地区只如实写明
「尚未记录」。因此也不需要任何访客互动后端。

---

## 设计系统

全部令牌集中在 `src/styles/tokens.css`，组件**不应**自造颜色、时长、圆角或阴影。

### 分层

| 文件 | 职责 |
|---|---|
| `tokens.css` | 颜色、字号、间距、圆角、阴影、动效曲线与时长、层级 |
| `reset.css` | 最小化归一化 |
| `base.css` | 文档外壳、排版原语、焦点样式、a11y 工具类 |
| `theme.css` | 场景主题（`data-scene`）与高对比 / 降低透明度模式 |
| `scenes.css` | 场景骨架、区块、徽章、空状态 |
| `glass.css` | **液态玻璃材质** |
| `motion.css` | 共享动效原语 |
| `globals.css` | 通用布局工具类 |

`index.css` 用 `@layer` 显式声明层序，后面的文件不会意外输给前面的文件。

### 色彩

以曜石黑、深空黑、银白、冰川蓝为基础。**场景色彩可以变化，但文字对比度不变**——
`theme.css` 只重新指向玻璃体色与场景强调色，从不修改文字色变量。

| 场景 | 光色 | 强调色 |
|---|---|---|
| 主空间 | 冰川蓝 + 钢灰 | `#8fe3ff` |
| 摄影 | 钨丝暖光 | `#e8c287` |
| 摩旅 | 钠灯橙 + 冷金属 | `#ff9a63` |
| 实验室 | 测量薄荷 | `#8ff5db` |
| 项目 | 蓝图蓝 | `#9fc4ea` |
| 随笔 | 中性灰 | `#bfc8d4` |
| 联系 | 冰川蓝 | `#d9f2ff` |
| 隐藏空间 | 深空紫 | `#c3b2ff` |

### 动效

**只有四条曲线**，全部定义在 `tokens.css`：

```css
--ease-standard: cubic-bezier(0.32, 0.72, 0, 1);   /* 主力 */
--ease-entrance: cubic-bezier(0.16, 1, 0.3, 1);    /* 进场 */
--ease-exit:     cubic-bezier(0.5, 0, 0.92, 0.2);  /* 离场 */
--ease-elastic:  cubic-bezier(0.34, 1.4, 0.44, 1); /* 液态回弹，克制使用 */
```

转场时长落在 **250–800ms** 区间（`--t-base` 260ms、`--t-slow` 420ms、
`--t-scene` 820ms）。启动动画 1650ms，**任何操作都可跳过**。

---

## 液态玻璃材质

整个产品里只有一个材质组件：`GlassSurface`（`src/components/glass/`）。
手写每一层是设计系统腐化的开始，所以材质集中在这里。

### 六层结构

| 层 | 实现 | 作用 |
|---|---|---|
| L1 背景 | `backdrop-filter: blur + saturate` | 基础透明层次 |
| L2 体色 | `::before` 上的双层渐变 | 面板的"实感" |
| L3 内描边 | `::after` + `mask-composite` | 顶部亮、底部暗，产生**厚度** |
| L4 边缘辉光 | 多层 `box-shadow` | 边缘接光 |
| L5 指针光泽 | CSS 变量 `--mx/--my` + 指针跟随 | 鼠标驱动的局部高光 |
| L6 色散 | 互补色偏移描边 + `plus-lighter` | 曲率处的光学边缘 |

### 三档，而不是三套

| 档位 | 用途 | 成本 |
|---|---|---|
| `glass--standard` | 列表、次要面板 | 低，可参与动画 |
| `glass--depth` | 浮动窗口、面板（主力） | 中 |
| `glass--refract` | **真实折射** | 高，只给静态大面积表面 |

`glass--refract` 通过 `backdrop-filter: url(#tv-liquid-refract)` 使用 SVG
`feTurbulence` + `feDisplacementMap` 做真实像素位移——这是"不只是模糊"的部分。

**代价是被显式限制的**：折射层会在以下情况自动关闭
768px 以下视口、`prefers-reduced-transparency`、用户在设置里选择「均衡 / 极简」，
以及 Firefox（其 `url()` 在 backdrop-filter 中历史行为不可靠，改用更重的模糊）。

> **实测数据**：`tools/browser-check.cjs` 在 Edge 154 无头环境中报告
> `backdropFilterUrl: yes`、`maskComposite: yes`、`webgl: yes`，
> 首页渲染出 14 个玻璃表面与 1 个 WebGL canvas，**0 个运行时错误**。

### 主动降级，而不是静默失效

| 条件 | 行为 |
|---|---|
| 不支持 `backdrop-filter` | 转为不透明表面（`@supports not`），而不是变成隐形面板 |
| 触屏设备 | 关闭 L5 指针光泽与 hover 状态 |
| `prefers-reduced-motion` | 关闭折射、形变、视差、指针光泽 |
| `prefers-reduced-transparency` | 关闭色散与环境光 |
| 设置「高对比」 | 面板转不透明，移除光泽与色散 |

---

## 内容管理

优先评估并采用的方案是 **Decap CMS**（MIT，仍在维护，Git 工作流）。

### 为什么后台不能自己完成登录

**GitHub Pages 是静态文件主机，无法运行 OAuth 的密钥交换**——那需要 client
secret，而 client secret 不能放在静态站点里。因此 Decap 需要下面二者之一：

**方案 A · 本地后端（现在就能用，零配置零成本）**

`public/admin/config.yml` 默认就是 `backend: local`。
运行 `pnpm cms`，用 `/admin/` 编辑，内容直接写进你的工作副本。

**方案 B · GitHub 后端 + OAuth 中转（线上编辑）**

需要自己搭一个免费的中转服务。可选：

- Cloudflare Workers 运行开源的 `sveltia-cms-auth`（免费额度充足）
- Vercel / Netlify Function 跑社区版 OAuth provider（免费额度）
- Netlify Identity + Git Gateway（Netlify 自家托管认证）

完整步骤（含 GitHub OAuth App 的回调地址、最小权限 scope）见
**[docs/CMS.md](docs/CMS.md)**。

> **没有任何个人访问令牌写在前端。** `config.yml` 是公开文件，
> 里面不放 token；`VITE_*` 环境变量同样不被当作安全存储。

### 后台能管理什么

| 集合 | 文件 | 能力 |
|---|---|---|
| 个人品牌 | `brand.json` | 新建/编辑/删除字段级内容 |
| 四条线索 | `profile.json` | 列表增删改、排序 |
| 摄影作品 | `photography.json` | 图片上传、分类、可选字段 |
| 摩旅与骑行 | `riding.json` | 车辆、路线、维护记录 |
| AI 与编程 | `lab.json` | 实验记录（强制填写"结论"） |
| 个人项目 | `projects.json` | 状态、技术栈、链接 |
| 随笔 | `journal.json` | 段落列表、标签 |
| 联系方式 | `contact.json` | 渠道与"是否公开"开关 |
| 网站设置 | `settings.json`、`secret.json` | 元数据、开关 |

**字段与 `src/content/types.ts` 一一对应**，后台保存的值立刻就是类型化的值。

### 如实说明的差距

- Decap **没有**内置的「草稿 / 发布」双态工作流；`publish_mode: simple` 是直接
  写入。项目**没有**做成看起来像有草稿功能的假界面。若需要草稿，可用
  `publish_mode: editorial_workflow`，但那需要 GitHub 后端与额外的 PR 流程。
- 「删除」在 CMS 里就是移除数组项；图片文件本身仍留在 `public/assets/uploads/`，
  需要手动清理。这一点已在此写明，而不是假装它会自动回收。
- 后台的字段校验是**结构性**的（必填、类型、选项）。跨字段的语义校验
  （例如「计划中的路线不应带日期」）由 `src/content/index.ts` 在构建时兜底，
  不会让错误内容破坏页面。

---

## 替换内容

**内容全部在 `src/content/data/*.json`。** 用后台改，或直接改这些文件——
写的是同一批文件。

### 手动编辑的约定

每个集合都是 `{ "items": [ ... ] }` 形态（Decap 的根级列表控件如此写入）。
`src/content/index.ts` **同时接受**这种包裹形态和裸数组，所以手写不会静默清空页面。

改完之后：

```bash
pnpm typecheck && pnpm build
```

内容有问题时，开发模式下控制台会打印带文件与路径的清单，例如：

```
[content] 1 content problem(s) detected. The site still renders; fix these in src/content/data/ …
  • photography.json → [3]: missing "src"
```

**页面照常渲染**——一条坏记录会被跳过并上报，而不是让整个板块白屏。

### 逐类替换要点

**个人介绍**（`brand.json` / `profile.json`）
把 `statement`、`tagline` 换成你自己的文字，并把 `provenance` 从 `sample`
改成 `real`——标记会随之消失。`nickname` 保持昵称即可，项目从不要求真实姓名。

**摄影**（`photography.json`）
把作品图片放进 `public/assets/photography/`，然后填写：

```json
{
  "id": "my-photo-01",
  "title": "作品标题",
  "category": "landscape",
  "src": "/assets/photography/my-photo-01.jpg",
  "thumb": "/assets/photography/my-photo-01@thumb.jpg",
  "width": 1920,
  "height": 1280,
  "description": "简短描述",
  "tone": "#4a6a86",
  "provenance": "real"
}
```

- `width` / `height` **必须是真实像素尺寸**——页面用它预留版面，填错会导致加载时跳动。
- `thumb` 可省略，页面会自动回退到原图。
- `takenAt` / `location` / `camera` / `lens` **不填就不会显示空标签**。
  请不要填推测值。
- `tone` 是主色调，用于占位背景与灯箱环境色。取图片的近似主色即可。

**摩旅**（`riding.json`）
填写 `distanceKm`、`riddenAt`、`stops[].lat/lng` 时请用真实数据。
`status` 只在真正完成后才改为 `ridden`。没有坐标的点位不要编造经纬度——
页面会说明"这些点位没有坐标"，并且不依赖任何地图 API 也能正常显示示意路线。

**项目**（`projects.json`）
`repoUrl` / `demoUrl` 留空即显示「待填写」。**不要填不存在的地址**——
页面明确区分"有链接"和"未提供"，一个点不开的链接比空白更糟。

**联系方式**（`contact.json`）
填写 `handle`（账号）与 `url`（链接），并把 `confirmed` 设为 `true`。
`confirmed: false` 的渠道会列在"尚未提供"面板里。页面不含留言表单，
原因写在页面上。

---

## 替换 Logo

### 目前的状态（实测，不是假设）

| 文件 | 状态 |
|---|---|
| `水印白.jpg` | **存在**于 `C:\Users\pc\Pictures\`。JPEG，2508×1672，**无透明通道** |
| `水印黑.png` | **不存在**。已搜索 Pictures、Downloads、Desktop、工作区、DSH 附件目录 |

源文件是**白色笔触落在纯白背景上**（实测最暗亮度 151、均值 254.45、
99.5% 的像素落在 224–255 区间），而且 JPEG 不可能带 alpha。
直接叠加到深色界面上只会得到一块白板。

### 项目是怎么处理的

把**亮度通道当作覆盖率蒙版**还原：

```
alpha = (白 − 亮度) / (白 − 最暗)
```

纯白 → alpha 0（背景完全透明），最暗墨色 → alpha 1（笔画完全不透明）。
笔画几何、手绘边缘抖动、原有抗锯齿**全部保留**，只重新确定了墨色。

随后做了一次光学校准：实测覆盖率均值只有 **24.6/255**，直接使用在深色背景上
几乎不可见，所以按 `gamma = 0.40` 提亮（均值提升到约 78），
**同时保持 alpha = 0 仍为 0**，背景依然完全透明。

> **深色版本是派生的。** `logo-dark.png` / `logo-dark.svg` 由同一份蒙版重新着色
> 得到，属于替代方案，**不能替代你提供的原始黑色标识**。这一点在关于我页面、
> `brand.json` 与本文档中都明确标注了。

### 用真实的 `水印黑.png` 替换

```bash
# 1. 把真实的黑色版本放进来
copy 你的水印黑.png src\brand-source\水印黑.png

# 2. 重新生成（脚本会优先使用提供的原作）
tools\tv.cmd node tools\build-brand-assets.cjs
```

脚本会输出每个文件的真实尺寸与字节数。生成后请核对
`public/assets/brand/brand.json` 里的溯源信息。

### 换成完全不同的 Logo

```bash
tools\tv.cmd node tools\build-brand-assets.cjs --source "C:\路径\你的新logo.png"
```

PNG（带 alpha）会走更直接的路径，不需要覆盖率还原。

### 只替换资源，不重新生成

把文件按原名放进 `public/assets/brand/` 即可，然后同步
`src/components/brand/manifest.ts` 里的**尺寸常量**——它是防止 Logo
加载时布局跳动的依据。资源加载失败时 `Logo` 组件会自动降级为文字锁定，
所以即使尺寸没对上也不会出现破图。

---

## 摄影图片与音频资源

### 摄影

当前 `public/assets/photography/` 里的 11 张图**不是真实照片**，
而是 `tools/build-sample-photos.cjs` 生成的抽象光景（程序化的雾、沥青反射、
拉丝金属、星野、干涉条纹）。原因很直接：你没有提供照片，而我也不打算
下载来源不明的图片来冒充你的作品。

它们的作用是完整跑通**分类筛选、不对称排版、懒加载、灯箱浏览、加载失败占位**
的流程。每一张在内容里都是 `"provenance": "sample"`，界面上带「示例 / SAMPLE」标记。

生成器是**确定性**的（种子化随机），重跑输出一致，仓库不会因为重跑而抖动。

替换方式见上一节。若要清空示例图：

```bash
# 删掉示例图与对应内容条目，然后换入你自己的作品
```

### 音频

**背景音乐是可选的。** `public/assets/audio/ambient.wav` 由
`tools/build-audio.cjs` 合成（5 个分音 + 低通噪声，24s，24kHz，立体声，
循环点做了交叉淡化），**不涉及任何第三方素材，因此没有授权问题**。

它是按需加载的——只有访客主动打开音乐开关时才会请求。

**删除它是受支持的操作**：音乐开关仍然可点，只是会明确提示文件未提供，
而不是静默失败。

想换成自己的音乐：放进 `ambient.m4a`（站点优先请求 `.m4a`，回退 `.wav`），
不需要改代码。WAV 未压缩，建议转码：

```bash
ffmpeg -i ambient.wav -c:a aac -b:a 96k ambient.m4a
```

**交互音效没有音频文件**，它们是运行时用 Web Audio API 合成的
（见 `src/lib/sound.ts` 里的 `RECIPES` 表）。这样零下载体积、零授权问题。
默认全部静音，只有访客主动开启后才会发声，且音乐与音效**互相独立**。

---

## 部署到 GitHub Pages

### 一次性配置

1. **推送仓库到 GitHub。**
2. **Settings → Pages → Build and deployment → Source 选 `GitHub Actions`。**
   不需要选分支——工作流上传 artifact，不推送 `gh-pages` 分支。
3. 如果不是 `main` 分支，改 `.github/workflows/deploy.yml` 里的分支名。
4. 推送即触发构建与部署。

### 子路径是怎么处理的

`vite.config.ts` 按以下顺序解析 `base`：

1. `VITE_BASE_PATH` —— 显式覆盖，例如 `/TangyuanVision/`
2. `GITHUB_REPOSITORY` —— Actions 自动提供，`owner/Repo` → `/Repo/`
   （`owner.github.io` 这种用户站点自动解析为 `/`）
3. `/` —— 本地开发与根路径部署

**运行时不要硬编码前导 `/`。** 所有资源引用都经过 `src/lib/asset.ts` 的
`assetUrl()`，它拼上 `import.meta.env.BASE_URL`。

### 深层链接（刷新不 404）

纯静态主机不知道子路径对应哪个文件，所以刷新 `/photography` 会得到 404。
项目用**两半**解决：

1. **`public/404.html`** — 捕获主机级 404，把路径改写成查询形式
   （`/repo/photography` → `/repo/?/photography`）。

   > 常见写法 `location.origin + path` 假设站点在域名根路径，
   > 在项目子路径下会丢掉 `/repo/` 前缀并**造成 404 死循环**。
   > 本项目的版本从自身脚本位置推导 base，三种部署形态都正确。

2. **`src/lib/deepLink.ts`** — 在 React Router 创建**之前**用
   `history.replaceState` 还原干净路径。所以地址栏显示的是真实 URL，
   不是 `#/photography`。

### 排查清单

| 症状 | 检查 |
|---|---|
| 页面白屏、控制台报 404 找资源 | `base` 是否解析正确；构建日志里 `GITHUB_REPOSITORY` 是否存在 |
| 刷新子页面显示 GitHub 的 404 | `dist/404.html` 是否被发布；Pages 的 Source 是否设为 `GitHub Actions` |
| 资源 404 但路径看着对 | 是否在代码里硬编码了 `/assets/...`；应走 `assetUrl()` |
| 部署成功但没有更新 | Actions 是否真的跑了；浏览器是否缓存了旧的分块文件 |
| 样式正常但功能异常 | 查看 `?diag=1`（见下）输出的错误清单 |

### 线上诊断

生产构建下访问 `任意路径?diag=1` 会激活 `src/lib/diagnostics.ts`，
它在 `<script id="tv-diagnostics">` 里写入一份 JSON：未捕获错误、
环境信息、以及 WebGL / backdrop-filter / mask-composite / @property
等能力的探测结果。

这是**本项目自己的代码路径**，不是只为测试存在的钩子——日常排障同样用它。
正常访客不会看到任何额外 DOM。

---

## 无障碍与键盘操作

### 键盘路径

| 按键 | 行为 |
|---|---|
| `Tab` / `Shift+Tab` | 顺序移动焦点，所有功能都不需要鼠标 |
| 方向键（主空间） | 在窗口阵列中移动，`Enter` 打开 |
| 首字母（主空间） | 直接打开对应专题（`A` `P` `R` `L` `O` `J` `C`） |
| `Home` | 回到主空间 |
| `Esc` | 关闭灯箱 / 设置面板；在隐藏空间返回主空间 |
| `←` `→`（灯箱） | 上一张 / 下一张 |
| 空格（灯箱） | 放大 / 缩小 |
| `Shift+V` 或输入 `explore` | 进入隐藏空间 |

### 已实现的无障碍措施

- **焦点可见性**：全站统一的 `:focus-visible` 处理，包括空间窗口这类大表面
  （用 `box-shadow` 画环，而不是依赖 `outline`）。
- **焦点管理**：灯箱与设置面板用 `useFocusTrap` 捕获 Tab、`Esc` 关闭、
  关闭后把焦点还给触发元素。隐藏空间**刻意不做焦点陷阱**——键盘用户误入时
  必须能直接 Tab 出去。
- **路由播报**：`role="status"` 的区域会播报「已进入：摄影」，
  弥补客户端路由对读屏软件静默的问题。
- **窗口焦点播报**：主空间另有一个 live region 说明当前聚焦的窗口。
- **位置感**：主空间除窗口阵列外，**始终提供一份普通索引导航**。
  沉浸感不以失去位置感为代价。
- **不依赖颜色**：「示例」标记同时带图标与文字；状态徽章带圆点与文字；
  选中态同时改变边框、背景与字重。
- **动画**：全部动画都在 `prefers-reduced-motion` 下简化或关闭，
  并额外提供站内覆盖开关（跟随系统 / 简化 / 完整）。
- **图片**：内容型图片都有 `alt`；装饰性元素 `aria-hidden`。
- **无自动播放声音**：默认静音，且只在用户操作后初始化 `AudioContext`。

---

## 性能策略

| 手段 | 实现 |
|---|---|
| 路由级代码分割 | 除首页外全部 `lazy()`；实测每个专题页 3–13 KB（gzip 后 1.5–5 KB） |
| 3D 按需加载 | `three` 只在主空间动态 `import`，单独分包 705 KB（gzip 181 KB），**不进首屏** |
| WebGL 资源释放 | 几何体、材质、renderer 全部 `dispose()`，并显式 `forceContextLoss()` |
| 渲染循环停止 | 标签页隐藏、canvas 滚出视口、组件卸载时都 `cancelAnimationFrame` |
| 指针循环停止 | 指针高光与视差在位置收敛后**停止 rAF**，空闲页面不跑任何帧 |
| 图片懒加载 | 默认 `loading="lazy"`；只有灯箱里那张是 `eager` + 高优先级 |
| 版面不跳动 | 容器上预留 `aspect-ratio`，图片带真实 `width`/`height` |
| 动画只用 transform/opacity | 全站动画不触发布局；`will-change` 只加在确实变化的元素上 |
| 用 CSS 而非 JS 做动效 | 滚动显现、环境漂流、骨架微光都是 CSS 动画，不占主线程 |

### 实测分包体积（生产构建）

```
index-BdA1ckMA.js         ~97 KB  (gzip ~35 KB)   应用外壳 + 首页
vendor-react              ~222 KB (gzip ~69 KB)
vendor-three              ~705 KB (gzip ~181 KB)  ← 仅主空间按需加载
vendor-motion             ~123 KB (gzip ~40 KB)
vendor-router             ~37 KB  (gzip ~14 KB)
每个专题页                3–13 KB (gzip 1.5–5 KB)
主样式                    68 KB   (gzip 14 KB)
```

---

## 已知限制

**V3 新增的限制（详见 [docs/V3.md](docs/V3.md) 第 7 节）：**

- **移动端 / 平板布局从未在真实窄视口渲染过。** 本机唯一浏览器是无头 Edge 154，
  `--window-size` 被忽略，视口恒为 1410×908。响应式 CSS 已写，但**未验证**。
- **触摸拖动与缩放未在真机验证。** 无触屏设备。
- **Safari / Firefox 未测试。** 本机未安装。
- **（已移除）访客互动后端。** 本站**不做**点赞/评论/收藏/投票/排行；相关前端交互层
  与历史 Supabase 迁移脚本均已从仓库删除。不存在共享数据库，也不需要。
- **帧率无法测量。** 无头环境 rAF 被节流到约 1 帧/秒。
- **Decap CMS 的 GitHub OAuth 后端未实测。** 本地 `local` 后端可用，
  但从未执行过一次真实保存。

如实列出，不含"基本完成"这类模糊表述。

### 无法在此环境中完成的验证

1. **真实浏览器中的启动动画完整时序**：无头浏览器配合 `--virtual-time-budget`
   会吞掉 `requestAnimationFrame`，动画的观感需要在真实浏览器里确认。
   （未捕获错误、渲染结果、能力探测都已实测通过。）
2. **触屏手势**：灯箱的左右滑动、移动端布局已实现，但**没有在真实触屏设备上
   实测过**。此处只能说"代码路径存在"，不能说"已验证"。
3. **帧率**：没有在真实设备上做过 FPS 采样，因此不提供任何帧率数字。
4. **Safari / Firefox**：能力降级路径已按特性检测实现（`@supports`），
   但**只在 Chromium 内核上实测过**。

### 需要你自己配置才能启用

5. **线上 CMS 登录**：需要你自己搭 OAuth 中转并创建 GitHub OAuth App。
   在此之前后台使用本地后端（`pnpm cms`）。见 [docs/CMS.md](docs/CMS.md)。
6. **`水印黑.png`**：磁盘上不存在。`logo-dark.png` 是派生资源。
7. **联系方式、项目链接、摩旅数据**：全部为待填写状态，这是**设计如此**。

### 结构性限制

8. **SEO**：纯客户端渲染。静态外壳带正确的站点级 title / description /
   Open Graph，逐路由的元数据在运行时由 `useDocumentTitle` 写入。
   **不执行 JavaScript 的爬虫只能看到站点级元数据。** 这是 SPA 的固有代价，
   没有用预渲染来掩盖。
9. **无留言表单**：没有后端就不提供表单，页面上直接说明原因。
10. **图片未做响应式多尺寸**：内容模型里是一个 `src` 加一个缩略图，
    没有 `srcset` 多档。对当前规模（11 张、总计约 800 KB）够用，
    作品集变大后应引入图片 CDN 或构建期多尺寸生成。
11. **音频未转码**：仓库里是 2.2 MB 的 WAV。用 ffmpeg 转 `.m4a` 可降到 300 KB
    以内，站点会自动优先使用 `.m4a`。

---

## 验证记录

完整报告（含命令、原始输出与逐项结论）见 **[docs/TESTING.md](docs/TESTING.md)**。

摘要：

| 检查 | 结果 |
|---|---|
| `pnpm install` | ✅ 通过（esbuild 构建脚本已在 `pnpm-workspace.yaml` 放行） |
| `pnpm typecheck` | ✅ 0 错误 |
| `pnpm lint` | ✅ 0 错误 0 警告 |
| `pnpm build` | ✅ 538 模块，1.9s |
| HTML 元数据注入 | ✅ 无残留占位符 |
| `dist/404.html` | ✅ 存在 |
| 品牌资源 | ✅ RGBA、alpha 通道真实、已目视核对合成结果 |
| 逐路由真实浏览器验证 | ✅ 10/10 无未捕获错误 |
| 路由深度链接 | ✅ 404 回退 + `history.replaceState` 还原 |
| 减弱动效 / 高对比 | ✅ 代码路径已实现并自检 |

---

## 文档索引

| 文档 | 内容 |
|---|---|
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署、base 路径、深层链接原理与排查 |
| [docs/CMS.md](docs/CMS.md) | Decap 两种后端、OAuth 中转搭建步骤、字段清单 |
| [docs/CONTENT.md](docs/CONTENT.md) | 内容模型、字段语义、替换流程 |
| [docs/TESTING.md](docs/TESTING.md) | 实际执行过的命令、原始输出、已知未验证项 |

---

**CAPTURE MOMENTS. EXPLORE BEYOND.**
