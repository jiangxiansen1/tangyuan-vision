# AGENTS.md — 汤圆Vision 项目工作规范

本文件是任何代理（以及任何人）在本仓库工作前必须阅读的第一份文档。
它只写**约束与事实**；设计理由见 `docs/design-brief.md`，场景结构见
`docs/scene-architecture.md`，实施顺序见 `docs/implementation-plan.md`。
既有专题文档（`docs/CMS.md`、`docs/CONTENT.md`、`docs/EARTH.md`、`docs/THEME.md`、
`docs/TESTING.md`、`docs/DEPLOYMENT.md`、`docs/V3.md`、`docs/V4.md`）仍然有效，
本文件不复制它们的内容，只指向它们。

---

## 0. 项目身份

- 品牌主标题：**汤圆Vision**（中文释义：**汤圆视界**）。辅助文字：**CAPTURE MOMENTS**。
- **禁止**用拼音 `TangyuanVision` 作为主标题或品牌名出现。`src/content/index.ts`
  对旧的 `latin` 字段做了迁移处理，新增代码不得 reintroduce 拼音主标题。
- 定位：以摄影与「地球 Online 进度」为核心的沉浸式个人数字空间。深色电影感、
  空间纵深、克制的液态玻璃；摄影与地球承担主要视觉表达。
- 内容诚实性是第一原则：所有旅行记录、作品、拍摄信息、社交账号、GitHub 链接
  必须来自 `src/content/data/*.json` 中 `provenance: "real"` 的记录或用户后续提供。
  `provenance: "sample"` 的内容在界面上必须带示例标记。**不得编造**。

## 1. 技术栈约束（实测自 package.json，不得随意增删）

| 依赖 | 版本 | 用途 | 约束 |
|---|---|---|---|
| react / react-dom | ^19.1 | UI | 函数组件 + hooks |
| typescript | ~5.9 | 类型 | `pnpm typecheck` 必须通过 |
| vite | ^7.1 | 构建 | 子路径部署，`base` 与 workflow 一致 |
| react-router-dom | ^7.9 | 路由 | BrowserRouter + basename；路由唯一注册表是 `src/app/routes.ts` |
| three | ^0.180 | 地球离线渲染、粒子场 | 动态 import；用完必须 dispose |
| motion | ^12.23 | 转场与入场动画 | 只用 `motion/react` |
| zustand | ^5 | 偏好与 UI 状态 | store 放 `src/store/` |
| maplibre-gl | ^6.13 | 地球真实地图 | 无 key 源优先；key 只能来自 `VITE_MAPTILER_KEY` |
| decap-server | ^3.3.3 (dev) | 本地 CMS 后端 | `pnpm cms` |

禁止事项：

- **不得**因为参考网站而新增大型依赖（GSAP、Lenis、Locomotive、Unicorn Studio、
  p5、MediaPipe 等一律默认不引入）。需要手势识别等能力时，先写验证报告再讨论。
- **不得**重建项目、更换构建工具或路由方案。
- **不得**把密钥写进前端：`VITE_*` 是构建期内联的公开值。CMS OAuth、Supabase service
  key 等任何 secret 不进仓库、不进 `config.yml`、不进 `VITE_*`。
- 地图服务 / API Key / CMS 线上认证 / 远端数据库 / 任何付费服务：**未经用户授权不处理**。
  现状：MapLibre 使用免 key 的 OpenFreeMap 矢量瓦片 + NASA GIBS 卫星图（z9 止）；
  MapTiler 仅在用户自行提供 key 时启用。

## 2. 信息架构

路由唯一注册表：`src/app/routes.ts`。新增场景 = 加一条记录 + 一个页面组件，没有第二处。

当前已注册场景（10 个）：`home`(主空间/枢纽)、`about`、`photography`、`earth`、
`riding`、`lab`、`projects`、`journal`、`contact`、`secret`(隐藏，不进导航)。

目标主场景架构（见 `docs/scene-architecture.md`）把公开体验收敛为
**00 入场 → 01 首页 → 02 地球 → 03 摄影 → 04 创造与实验 → 05 联系我**，
外加贯穿全站的左侧竖向进度导航。收敛方式是**合并与重排，不是删除**：
`riding` / `journal` / `about` 的既有内容并入 04 或保留为可达子页，
任何既有 URL 不得变成死链（重定向或保留）。

键盘：单字母场景快捷键在 `routes.ts` 的 `key` 字段；`Home` 回枢纽；`Esc` 逐层关闭。
所有全局键监听必须先检查 `TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]'`，
输入中绝不触发。

## 3. CMS 编辑规则（Decap CMS）

- 后台配置：`public/admin/config.yml`；内容唯一真源：`src/content/data/*.json`。
  站点构建期 import 同一批文件，**公开站点从不依赖后台在线**。
- **首页个人宣言必须通过 CMS 修改**（`brand` 集合 → `identity` → `statement` 字段）。
  不允许把宣言改成源码常量。目标默认文案「记录所见，探索未至，创造可能。」只是默认值；
  实测现状 brand.json 中是一段 sample 占位宣言，替换动作走 CMS，不走源码。
- 当前后端是 `proxy` + `local_backend: true`（`pnpm cms` + `pnpm dev`，写工作副本；
  dev 地址为 `/admin/index.html`）。**线上 OAuth 尚未配置**：
  需要 GitHub OAuth App + 免费中转（sveltia-cms-auth / Netlify Git Gateway），
  步骤见 `docs/CMS.md` 第 4 节。未配置前不得宣称线上发布可用。
- 每条列表记录带 `provenance: real | sample`。替换为真实内容后必须改 `real`。
- 手工编辑 JSON 与 CMS 写入等价；改完跑 `pnpm typecheck && pnpm build`。
  `src/content/index.ts` 的运行时校验会让坏记录降级而不是白屏。

## 4. 品牌资源规则

- 原始素材：`C:\Users\pc\Pictures\水印白.jpg`（2508×1672，无 alpha，实测存在）。
- 派生资源在 `public/assets/brand/`：`logo-light.png`(主)、`logo-light-raw.png`、
  `logo-dark.png`(派生着色，**不是**真实黑色版本)、`logo-mark.png`、`wordmark.png`、
  `logo-mask-light.png`(8-bit 覆盖率蒙版，驱动入场揭示)。几何与出处记录在
  `src/components/brand/manifest.ts` 与 `public/assets/brand/brand.json`。
- **入场动画必须使用这份蒙版/轮廓**，不得重画替代 Logo。资源加载失败时回退到文字
  锁定（`BootSequence` 已实现），不得卡住站点。
- 重新生成：`pnpm assets:brand`（`tools/build-brand-assets.cjs`）。若用户提供真实
  `水印黑.png`，用它替换派生的 dark 版本。

## 5. 地球交互规则

- 双渲染器：`MapGlobe`（MapLibre，真实瓦片，逐级加载）为主；`MapLibre` 起不来时回退
  `EarthGlobe`（three.js，全离线，无需网络/key）。`mapFailed` 状态切换，见 `EarthPage.tsx`。
- 数据两层：地理事实（`countries-110m.json`，Natural Earth）与个人经历
  （`travels.json`，CMS 管理）**必须分开**。未到访地区 UI 必须如实显示，不得暗示旅行。
- 交互层级：全球 → 区域/国家 → 城市 → 照片与故事 → 返回恢复视角。不需要街道级地图；
  **禁止**拉伸低清贴图冒充城市级精度。
- 手势/摄像头是**可选增强**：默认关闭；用户主动开启才申请摄像头；关闭立即停止识别循环。
  鼠标、触摸、键盘必须始终可用。区域列表在首屏之下，作为无障碍等价路径。
- **全站不做社交互动**：没有点赞、评论、收藏、投票或热门排行。旧版的「我也想去」投票与
  照片点赞（`useRegionVotes`、`usePhotoLikes`、`src/lib/interactions/*`）已按产品方向移除；
  地球未到访地区只显示诚实的「暂无旅行记录」。

## 6. 无障碍与性能约束

- `prefers-reduced-motion`：入场 300ms 全显、粒子停漂移与指针响应、转场降级；
  并在界面留一条安静说明（`App.tsx` 的 reduced-motion-note）。
- `prefers-reduced-transparency` 与设置面板 `glassQuality` 只朝"更简化"方向叠加。
- 焦点：skip link、焦点陷阱（灯箱/设置）、路由变更用 live region 播报。
- 玻璃：`refract` 档只给少数大静态面板；<768px、低质量档、reduced-transparency 下关闭
  SVG 折射；Firefox 用 blur 替代 `url()`。详见 `src/styles/glass.css` 注释。
- 粒子：GPU 顶点着色器模拟，数量 900/460/220 三档，DPR 上限 1.75，`pointer-events:none`，
  标签页隐藏或离开视口即暂停，卸载时 dispose + force context loss。
- 对比度底线（对 `#05070a`）：frost 15.4:1、silver 7.4:1、fog 4.6:1。fog 只用于三级文字。
- 任何覆盖全视口的装饰层必须 `pointer-events: none`，不得吞掉滚动与点击。

## 7. 验收标准

每个改动至少满足：

1. `pnpm typecheck`、`pnpm lint`、`pnpm build` 全绿。
2. 用 `tools/cdp.cjs`（Edge headless CDP，零依赖）或 `tools/verify-*.cjs` 在真实浏览器
   里验证关键路径；截图与读数落盘到 `tools/_verify/`（gitignore，不入库）。
3. 键盘全流程：Tab 可达、Esc 可退、输入框内快捷键失效。
4. `prefers-reduced-motion` 与 `glassQuality=off` 下页面仍然完整可读。
5. 不新增未授权的网络依赖、key、付费服务；不新增 >200KB 的入库二进制资源（音频/贴图
   例外需说明）。
6. 文档同步：改了行为就改对应 `docs/*.md` 与本文件。

## 8. 参考网站（第二阶段实测，结论见 docs/design-brief.md）

- 滚动叙事：https://nanfu.global/ 与 https://www.nanfu.global/about
- 液态玻璃：https://www.barthkosi.com/explorations/glass
- 鼠标粒子：https://labs.kraavon.com/experiment/particle-field
- 玻璃形态：https://labs.kraavon.com/experiment/glass-form
- 深色空间：https://www.landing.love/sites/bitkraft/
- 手势地球：https://github.com/Wencle-Sun/globe （演示 https://wencle-sun.github.io/globe/）
- 地理浏览逻辑：https://support.apple.com/en-mide/guide/photos/pht4c00b8ddc/mac
- 可选灵感：https://www.unicorn.studio/inspiration

研究脚本：`tools/_verify/research/probe.cjs`（gitignore 目录，复用 `tools/cdp.cjs`）。
观测产物：`tools/_verify/research/<site>/report.json` + 截图。

## 9. 隐藏彩蛋与隐藏空间（两套，不要混淆）

- 隐藏空间「静默空间」：`/the-quiet-space`，入口 = 首页信号按钮 / Shift+V / 连打口令
  （`secret.json` 的 `phrase`，默认 "explore beyond"）。已存在，保留。
- 视频彩蛋（目标新增）：在「联系我」场景先按 **N** 再按 **W** 触发覆盖层；输入框内不触发；
  `Esc` 退出；视频文件预留 `public/media/easter-egg.mp4`。**文件未提供前不得生成假视频
  或错误链接**——覆盖层应显示"尚未放入影片"的诚实状态。
