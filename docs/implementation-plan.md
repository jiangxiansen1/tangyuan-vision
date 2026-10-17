# implementation-plan.md — 实施计划（P0 后修订版，2026-10-11）

P0 验证已完成，报告见 `docs/p0-test-report.md`；CMS 专项见 `docs/cms-online-readiness.md`。
**优先级已按新需求重排：在线 /admin/ 编辑并发布个人宣言是最高优先级。**

阶段总览：
P1 CMS 链路修复（本地）→ P2 入场与首页（含宣言渲染）→ P3 SceneRail 骨架 →
P4 地球逐级浏览 → P5 摄影 → P6 创造与实验 → P7 联系与彩蛋 → P8 整体验收与部署。
**在线认证配置是 P8 的前置用户授权门**（见 cms-online-readiness §5），不阻塞 P1–P7。

---

## P0 已完成（摘要）

- 基线：master@50411f9，工作区仅 4 份新文档，无其他会话改动。
- CMS：`backend: local` 实测不存在（⛔）；proxy 后端下本地端到端 ✅（含写入、构建、恢复）；
  schema 必填 `latin` 与数据 `brandLatin` 不一致导致保存被拦（⛔）；travels 集合缺失（⛔）；
  首页不渲染宣言（⛔）；dev 下 /admin/ 被 SPA  fallback 抢占，需用 /admin/index.html。
- 地球：初始中国视角 z1.6 实测 ✅；完全离线时 MapLibre 仍启动但无瓦片→空球，
  EarthGlobe 回退不触发（onFail 只覆盖库加载/建图/样式错误）→ P4 需补"持续瓦片失败→回退"。
- 摄影：11 张全 sample；分类收敛为 风光/人像（其余样本归「未分类」但仍可见）；社交互动层已全站移除。
- 路由/彩蛋：N、W 未被占用（单字母快捷键为 a p e r l o j c；Shift+V 与口令属静默空间），无冲突。
- 结构探针：中线 IntersectionObserver 的轨同步在不等高场景下 5/5 正确；单时钟驱动容器+球体一致；
  reduced-motion 即时完成；390px 下轨收起为右缘进度条且无横向滚动。

## P1 · CMS 链路修复（最高优先，本地闭环）

1. `config.yml`：backend 改 `proxy` + `proxy_url`（本地可用）；线上切换留到授权后。
2. schema 对齐：`latin`→`brandLatin`（保留 hint），补 `brandFull`、`brandGloss`（string，必填），
   使编辑器读到的就是数据真值；重跑本地 E2E（复用 `tools/_verify/research/cms-admin.cjs save`）。
3. 新增 `travels` 集合（folder/file 集合按 travels.json 注释字段：regionId/status/label/title/
   visitedAt/story/photoIds/latitude/longitude/published），并同步 `docs/CMS.md`、`docs/CONTENT.md`。
4. `docs/CMS.md` 更正：dev 地址 /admin/index.html；proxy 后端；删除不存在的集合描述。
5. 验收：CMS 改宣言→保存→`git diff` 见 brand.json→`vite build`→dist 含新值→About 页显示；
   未授权/失败路径有清晰错误；恢复性测试不遗留测试文本。

## P2 · 品牌入场与首页

- 首页新增宣言渲染（`BRAND.statement`），版式按 scene-architecture §01；探索提示滚动淡出。
- 入场动画保持 ≤1.7s 与全部回退；新增"水印白.png（真 alpha，D:/素材/水印/）"作为可选再生成源：
  注意其二值 alpha 无抗锯齿，现有 JPG 亮度蒙版派生资源保留为默认，是否再生成由用户定。
- 验收：CMS 改宣言后首页与关于页同步更新（本地）；截图开场/结束/跳过/首屏。

## P3 · SceneRail 骨架

- 同步模型用**中线法**（rootMargin: -50% 0 -50%，threshold 0），P0 已验证不等高场景正确；
  不用 threshold 0.5（高场景永不满足）。
- 桌面左缘玻璃轨（standard 档）；<900px 右缘 3px 进度条 + 顶部胶囊；不锁滚轮。
- 路由映射先行落地（见 scene-architecture 附录 A），旧路由重定向保活。

## P4 · 地球逐级浏览

- P4a 布局（左文右 2/3 玻璃窗，HOME_VIEW [104,24] z1.6 保留）；
- P4b 展开状态机：单时钟驱动容器与相机（P0 探针模式）；返回复原视角/zoom/滚动；
- P4c 城市照片层：仅 travels.json 真实记录；照片引用 photoIds→photography.json；
- **补离线回退**：连续瓦片失败（如 8 次或 6s 零瓦片）→ setMapFailed(true) → EarthGlobe；
  断网 CDP 复测（复用 `tools/_verify/research/earth-p0c.cjs offline`）。
- 手势：默认关；本计划不引入 MediaPipe，除非用户另行授权并单开验证任务。

## P5 · 摄影

- 已实施：左图右文的编辑式阅读器（大图完整画幅 + 右侧信息 + 缩略图轨 + Lightbox）。
- 两分类：风光 / 人像（+ 全部）；历史分类（street/machine/sky/abstract）归「未分类」，
  仍在「全部」中可见，不丢弃；人像暂空，显示诚实空态。
- 全站移除点赞/收藏/评论/投票/热门排行（含 `usePhotoLikes`、`useRegionVotes`、
  `lib/interactions/*`、地球「我也想去」）。

## P6 · 创造与实验

- `/create` 聚合 lab(3 real+1 sample)/projects(1 real shipped 无 repo+1 sample)/硬件(空态)/Codex 过程；
  `/lab`、`/projects` 重定向；`/riding`、`/journal` 保留独立页并链接。
- 不显示计划为完成：status 徽章直读 projects.json。

## P7 · 联系与彩蛋

- 联系窗统一 glass--depth；未确认渠道显示「待填写」（现状 5 渠道全未确认）。
- N→W 状态机（≤1.2s 间隔、TEXT_ENTRY 守卫、Esc 归还焦点）；视频缺失空态；预加载 none。

## P8 · 整体验收与部署（含用户授权门）

- typecheck/lint/build/现有 verify 脚本/CDP 全场景/桌面+移动截图/键盘/reduced-motion/断网回退/
  子路径部署（VITE_BASE_PATH 模拟）/CMS 在线 E2E（**授权完成后才执行，未过不得宣称线上可用**）。
- 部署前置（用户操作）：建仓库+remote、默认分支 main、Pages Source=Actions、
  认证方案落地（推荐方案 B，见 cms-online-readiness §4）。

## 横切要求（不变）

每阶段：`tsc -b`、`eslint`、`vite build`（沙箱外）+ 相关 CDP 探针；产物落 tools/_verify（不入库）；
新资源 >200KB 需说明；免 key 地图源保留；社交互动层已按产品方向移除；不提交 tools/_verify。

---

## P1 状态（2026-10-11 完成）

- 全部六项修复落地并复验：CMS 保存 E2E、键保留、travels 集合、首页宣言实时读取、
  `pnpm exec tsc -b`/`pnpm build`/`pnpm lint` 退出码 0、测试文本零残留（dist 与 brand.json 均复原）。
- 本机 pnpm 执行方式：与 `packageManager` 一致的 pnpm 11.8.0（registry tarball 经 node 运行）；
  PATH 的 11.25 会因版本不一致触发 purge 确认并中止，勿答 Y。
- 下一步：P2（入场与首页定稿）；在线认证仍为 P8 前置授权门。
---

## P1 / P2 实施记录（2026-10-11 追加）

- **P1 已完成**：config.yml（`local_backend: true` + `proxy` 后端 + 线上 github 注释模板）、
  brand schema 对齐（brandLatin/brandFull/brandGloss）、travels 集合、首页宣言渲染、
  workflow pnpm 10→11、packageManager 字段、CMS.md/README/CONTENT 更正。
  本地 E2E 复测通过（保存→写入→构建→首页读取→恢复）。
- **P2 已完成**：首页重构为「品牌舞台(100dvh) + 折叠下探索带」两段式；入场色散边；
  舞台入场与 boot 交接（data-entered 门控）；滚动提示；`--rail-gutter` 为 P3 预留左缘；
  修复内容层未导出 `homeBackground` 的既有缺陷（背景照片此前永远无法显示）；
  摄影窗主视觉改为结构化样本。截图验收见 `tools/_verify/p2/`（gitignore）。
- **P2 遗留视觉问题**：样本图为程序生成的抽象渐变，背景与窗预览的"摄影感"有限，
  待真实作品替换后复评；移动端舞台上半留白偏大（刻意留白，可于复评时收紧）。
- **P3 待办不变**：SceneRail 落地时直接占用 `--rail-gutter`，无需再改舞台布局。
---

## P2 结构纠偏（2026-10-12 追加）

- 废除探索带堆叠：首页改为五场景垂直叙事（01 舞台 / 02 地球 / 03 摄影 / 04 创造 / 05 联系），
  每场景独立全屏、独立视觉中心、玻璃 CTA 进入完整路由体验。
  新增 `src/features/home/scenes/`（SceneShell/EarthScene/PhotoScene/CreateScene/ContactScene + scenes.css）。
- 验收：tsc/build/lint 全 0；桌面 5 场景 + 移动 5 场景真实截图（TEMP 验收目录），零横向溢出、
  零控制台错误；移动端地球提示与 HUD 重叠已修。
- 摄影分类仅 风光/人像；人像空态诚实；占位素材带示例标记并注明待复评。
- 保留清单全部满足：boot/跳过/reduced-motion/回退/宣言接入/homeBackground 修复/玻璃样式/
  地球与摄影功能入口/键盘与可访问性/全部未提交改动。
---

## P2 复验修复（2026-10-12 追加）

- 五个体验问题全部修复并实测：地球 34/66 split、摄影 64/36 反向 split、开场 3.8s 五阶段、
  滚轮单手势单切换（八项交互测试）、桌面五场景单屏高度。
- 新增 `src/hooks/useSceneWheel.ts`；MapGlobe/EarthGlobe 增加 `preview` 属性；
  SceneShell 增加 split/mediaFirst 变体；BootSequence 时序与 boot.css 延迟缩放。
- tsc/build/lint 全 0（lint 警告已清零）；截图与交互证据在 TEMP 验收目录 + http://127.0.0.1:8900/。
---

## P2.5 返工记录（2026-10-13）

- 背景系统 / 地球单一 Three 实例（0 瓦片请求）/ 转场单驱动 / 五个真实缺陷修复 / 手势模式，
  详见 scene-architecture.md 附录 H；截图在 `%TEMP%\tangyuan-vision-p2-visual-review`（含 base-* 基线）。
- 未验证：tsc/lint/build（审批评审通道故障）、CMS 保存链路（decap-server 未启动）、
  离屏暂停的真实帧率对比、手势识别的实际运行。
---

## P3 进展（2026-10-13）

- SceneRail 已实现并实测通过（桌面五节点/中线同步/悬停提示/Tab+Enter/跨路由/reduced/移动端 bar+pill），
  详见 scene-architecture.md 附录 I。
- 同轮小型修正：宣言连续空格显示；地球 focus 与拾取约定统一（重复 Enter 语义恢复为"开/关"切换）。
- 未执行（评审通道故障）：`pnpm exec tsc -b`、`pnpm run lint`、`pnpm run build` 对本轮改动的复跑。
- 未纳入本轮：背景首帧长任务、手势依赖、MapLibre 包体积警告（按指示单独记录）。
---

## P4 进展（2026-10-13）

- P4a 布局（三视口实测）、P4b 状态机 + ESC + 返回复原视角（同实例、自转恢复）、P4c 数据路径（网络层注入验证，
  零残留）、无 WebGL 降级（实测），详见 scene-architecture.md 附录 J。
- 判断并记录：首页场景无需瓦片回退（纯 Three、0 瓦片请求）；`/earth` 瓦片级空白仍单独记录。
- 未执行：`pnpm exec tsc -b` / `pnpm run lint` / `pnpm run build`（审批评审通道故障）。
---

## P4 收尾（2026-10-13）

- 四视口布局复核（含移动端胶囊与页头遮挡修复）、ESC/状态机语义文档化、CMS 字段映射补齐
  （`label` 覆盖面板标题、`visitedAt` 显示为时间），详见 scene-architecture.md 附录 K。
- 真实旅行记录仍需用户录入；数据链路已用网络层注入验证（零残留）。
- 未执行：`pnpm exec tsc -b` / `pnpm run lint` / `pnpm run build`（审批评审通道故障）。