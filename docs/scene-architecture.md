# scene-architecture.md — 主场景架构与转场

本文件定义目标体验结构。它是**设计契约**：实施阶段（见 implementation-plan.md）
按此施工；与本文件冲突的旧行为以本文件为准，但旧 URL 与旧内容不得消失。

场景编号是体验顺序，不是路由顺序。路由仍由 `src/app/routes.ts` 单点注册。

---

## 00 入场动画（BootSequence，已存在，按此收敛）

- 素材：`logo-mask-light.png` 覆盖率蒙版（源自 水印白.jpg，见 AGENTS.md §4）。
- 序列（现实现，保留）：0–0.22s 环境光起 → 0.15–0.75s 光扫揭示轮廓 →
  0.55–0.95s 玻璃高光掠过的折射感 → 0.70–1.05s CAPTURE MOMENTS 落定 →
  1.05–1.50s 背后场景展开 → 1.50–1.65s 交接首页。
- 硬约束：总长 ≤1.7s；回访 620ms；reduced-motion 300ms 全显；任意键/点击/滚轮可跳过；
  蒙版加载失败回退文字锁定；硬定时器兜底卸载，绝不卡站。
- 衔接：结束后首页品牌标题与主视觉已就位（首页在覆盖层下已挂载）。
- 允许的微增强：揭示瞬间的极细色散边（复用 `.glass__chroma` 思路）与 8–12 粒微光；
  不允许新增网络资源。

## 01 汤圆Vision 首页

内容（顺序即视觉权重）：

1. 主标题 **汤圆Vision**；2. 释义 **汤圆视界**；3. 辅助行 CAPTURE MOMENTS；
4. **个人宣言**（CMS `brand.statement`；目标默认文案「记录所见，探索未至，创造可能。」。
   实测现状：brand.json 当前存的是一段 sample 占位宣言，P2 通过 CMS 换成目标文案，
   并把 provenance 由 sample 改为 real 之前保持示例标记）；
5. 精选背景摄影（`settings.homeBackground`，`provenance` 诚实标记；缺失回退程序渐变）；
6. 向下探索提示（参考 nanfu 的「scroll to explore」微提示：小字 + 鼠标/箭头图标，
   滚动 1 屏后淡出）。

版式：标题组偏左下或居中偏左（二选一，实施时定稿），背景摄影压暗 overlay ≥0.7；
CursorField 粒子层在背景与内容之间，`pointer-events:none`。

## 02 地球 Online 进度

初始布局（桌面 ≥900px）：

- 左 1/3：场景标题、一句宣言感短句、简单进度信息（已到访 N / 记录 M，来自真实数据）。
- 右 2/3：**液态玻璃窗**（`glass--refract`）内嵌地球，初始视角聚焦中国及东亚
  （MapGlobe 初始 center/zoom 常量；EarthGlobe 回退渲染器同参数）。

点击地球窗（或窗内"展开"控件）后：

1. 窗平滑展开至近全视口（≤900ms，可跳过）；
2. 地球拉远到全球视角（相机/zoom 动画，不是贴图切换）；
3. 出现区域/城市选择：区域来自 `geo-index`（Natural Earth 事实），
   城市来自 `travels.json` 中真实记录的城市；无记录的区域显示"尚未到访"；
4. 选城市 → 照片层：该城市真实照片 + 拍摄信息 + 故事（CMS 内容）；
5. 返回：逐级回退，**恢复进入时的视角、zoom 与滚动位置**（状态存组件内 +
   `history.state`，刷新后允许回到场景初始态，但同会话返回必须复原）。

禁止：街道级地图；拉伸低清贴图冒充高精度；编造城市/照片/经历。
手势/摄像头：设置面板中独立开关，默认关；开启才 `getUserMedia`；关闭立即
`stopTracks()` 并停识别循环。鼠标/触摸/键盘始终可用；区域列表（首屏下）是无障碍等价路径。

## 03 汤圆视界摄影（02 的左右反转）

- 左：当前作品大图（完整画幅，不裁切）；右：标题、分类、描述与真实拍摄信息。
- 分类：**风光 / 人像** 两类 + 全部；其他/历史分类作为「未分类」仍出现在全部里，不静默丢弃。
- 详情：Lightbox（Portal + 焦点陷阱 + Esc + 关闭后焦点归还）；缩略图轨切换作品；左右方向键浏览。
- **全站不做点赞/收藏/评论/投票/热门排行**（详见 §Q）；地球未到访地区没有投票入口。

## 04 创造与实验（合并场景，非全屏堆叠）

一个场景内的分区（锚点跳转，不拆路由）：

1. **AI 与编程**（现 `lab` 内容：问题/方法/结论，含未跑通的结论）；
2. **Codex 开发过程**（现 `lab`/`journal` 中 kind=log 的记录 + 本仓库 docs 的链接）；
3. **硬件实验**（ESP32 / STM32，现 `riding`/`lab` 中相关记录；无记录则显示空态）；
4. **个人项目**（现 `projects`：状态 shipped/building/exploring/paused 真实展示，
   仓库链接仅填真实存在的 URL）；
5. 摩旅与骑行、随笔作为**可达子页保留**（`/riding`、`/journal` 不删，
   从 04 的分区入口链接过去），避免死链与信息丢失。

版式：卡片流 + 状态徽章；同屏最多 1 个玻璃 depth 面板；不做全屏轮播。

## 05 联系我

- 真实社交入口：`contact.json` 中 `confirmed: true` 的渠道；未确认显示「待填写」。
- 所有联系小窗统一 `glass--depth`，等宽网格，hover 镜面高光（已有交互态）。
- 隐私说明与"无留言表单"说明保留（contact.json 字段）。
- **视频彩蛋**：键序 N → W（间隔 ≤1.2s，缓冲复用 useSecretEntry 的模式但独立实现）；
  输入框内不触发；覆盖层 `glass--solid` + 视频 `public/media/easter-egg.mp4`；
  Esc 关闭并归还焦点；**文件不存在时覆盖层显示诚实空态**（"影片尚未放入"），
  不渲染坏链接、不生成假视频。

## 全站场景进度导航（新组件 SceneRail）

- 位置：桌面左缘垂直居中；液态玻璃 `glass--standard` 细轨（宽 ≤56px）。
- 节点：00 不占节点；01–05 五个节点 + 隐藏空间不显示。
- 状态：当前场景节点点亮（accent + 微光）；滚动位置与节点同步
  （IntersectionObserver 观察各场景 sentinel，阈值 0.5 视口高）；
  点击节点平滑滚动/路由跳转（同路由内场景用 scroll，跨路由用 navigate）。
- 悬停：右侧浮出场景名（中文 + 拉丁小字），玻璃 tooltip。
- 键盘：轨是 `role="navigation"` 的链接列表，Tab 可达，Enter 跳转，
  `aria-current="true"` 标记当前。
- 移动端（<900px）：收起为右缘 3px 进度条 + 顶部场景名胶囊；不占内容宽度。
- **不锁定滚轮**：普通连续滚动；节点只是指示与捷径（明确反对逐屏幻灯片）。

## 转场规则

- 路由间：既有 `RouteTransition` 两相（出/入），时长 ≤600ms，reduced-motion 直接切换。
- 场景内重点转场仅三处：00→01 交接、02 窗展开/收回、03 Lightbox 开合。
- 明暗底色交替只用于 02 的"窗内深空"与页面底的对比，不做整页闪白/闪黑。
- 所有转场可被 Esc / 点击跳过；跳转后焦点落在场景 `<h1>` 或主操作。

---

## 附录（P0 验证后补充，2026-10-11）

### A. 路由映射表（10 旧路由 → 5 主场景，旧链接保活）

| 旧路由 | 去向 | 方式 |
|---|---|---|
| `/` | 01 首页 | 保持 |
| `/earth` | 02 地球 | 保持 |
| `/photography` | 03 摄影 | 保持 |
| `/lab` | 04 创造与实验 `#lab` | 重定向 |
| `/projects` | 04 `#projects` | 重定向 |
| `/about` | 04 `#about`（四条线索并入） | 重定向 |
| `/riding` | 独立子页保留，04 内链接 | 保持 |
| `/journal` | 独立子页保留，04 内链接 | 保持 |
| `/contact` | 05 联系我 | 保持 |
| `/the-quiet-space` | 隐藏空间（不进导航、不进轨） | 保持 |

重定向用 react-router `Navigate`，保留 `replace:false` 以使浏览器返回行为正常；
404 页既有深层链接回退不变。

### B. 进度导航同步模型（实测结论）

- **中线法**：`IntersectionObserver({ rootMargin: '-50% 0px -50% 0px', threshold: 0 })`。
  P0 探针在 100/140/100/70/100vh 不等高场景上 5/5 正确；`threshold: 0.5` 对高于视口的
  场景永远不满足，**禁用**。
- 点击节点：`scrollIntoView({behavior: reduced?'auto':'smooth'})`；跨路由节点用 navigate。
- 移动端：轨隐藏 → 右缘 3px 进度条（scroll 比例）+ 顶部场景名胶囊；390px 无横向滚动（实测）。

### C. 地球状态模型（实测结论）

- 渲染器选择：`mapFailed ? EarthGlobe : MapGlobe`。`onFail` 现仅覆盖
  maplibre 动态导入失败 / 建图抛错 / style error；**瓦片级失败不触发**（设计如此）。
- 实测完全离线：MapLibre 仍启动、HUD 显示 z1.6、球面全黑无影像、区域列表仍可用。
  → P4 增加"持续瓦片失败"判定后切回退渲染器；判定阈值与提示文案在 P4 定稿。
- 视角常量：`HOME_VIEW = { center: [104, 24], zoom: 1.6 }`（中国及东亚，实测截图确认）；
  minZoom 0 / maxZoom 17；ref 暴露 `current()` 与 `jumpTo()`，展开状态机经此读写相机。
- 展开动画：容器与相机共用单一 rAF/Motion 时钟（P0 探针验证二者同帧一致）；
  reduced-motion 下 D=0 即时完成。
- 数据：travels.json 为空（刻意）；schema 已含 regionId/status/label/title/visitedAt/
  story/photoIds/latitude/longitude/published；**CMS 集合缺失，P1 补**。
- 手势：不引入；鼠标/触摸/键盘为唯一保证路径。

### D. 首页宣言（需求落点）

首页必须渲染 `BRAND.statement`（当前仅 AboutPage 渲染，P0 实测确认）。P2 落地；
CMS 字段与发布链路见 cms-online-readiness.md。
### E. P2 首页结构（已实施，2026-10-11）

- 舞台（100dvh）：eyebrow(CAPTURE MOMENTS) → 锁印 → 释义 → 英文微行 → 宣言；
  底部居中滚动提示（滚动 24px 后淡出）。chrome 浮于舞台顶（absolute）。
- 探索带（折叠下）：核心双窗（双列 diptych）→ 紧凑双窗 → 安静链接 → 页脚。
  带顶以渐变沉入画布色，双窗落在实地而非照片上。
- 入场：`data-entered` 门控（boot 结束或 mount），子元素 900ms 错峰上升；
  reduced-motion 下直接可见。boot 增加 1.5px 双色散边（45% 关键帧收敛）。
- 左缘 `--rail-gutter`（≥900px 时 64px）为 P3 SceneRail 预留，现阶段为空边距。
- 背景照片经内容层 `SETTINGS.homeBackground`（P2 修复导出缺陷）；默认样本
  `sample-ridge-01`、overlay 0.55；缺失时回退绘制场，不破版。
### F. P2 结构纠偏（2026-10-12 实施）：首页 = 五场景垂直叙事

探索带（双窗+卡片堆叠）已废除。首页现在是单一垂直叙事的五个独立全屏场景，
顺序与本文档 §00–05 一致：

| # | 场景 | 实现 | 视觉中心 | CTA 去向 |
|---|---|---|---|---|
| 01 | 品牌舞台 | `HomePage.tsx` `.vhome__stage`（100svh） | 锁印/释义/宣言 | 滚动提示 |
| 02 | 地球 Online | `scenes/EarthScene.tsx`（100svh+） | 实时 MapGlobe/EarthGlobe 回退 | `/earth` |
| 03 | 汤圆视界 | `scenes/PhotoScene.tsx` | 作品马赛克（风光/人像筛选） | `/photography` |
| 04 | 创造与实验 | `scenes/CreateScene.tsx` | 实验记录+项目卡+硬件空态 | `/lab`、`/projects` |
| 05 | 联系我 | `scenes/ContactScene.tsx` | 液态玻璃联系卡 | `/contact` |

- 场景外壳统一 `scenes/SceneShell.tsx`：eyebrow(序号+labelEn)/标题/lede/正文/CTA，
  标题与 accent 取自 `routes.ts` 单点注册表。
- 每场景 `min-height: 100svh`（内容更高时自然增长，不裁切）；场景间 hairline 分界 +
  极轻底色交替；不使用 scroll-snap（避免键盘/超高内容问题）。
- 子页（about/journal/riding）与静默空间信号保留为页脚前安静行，未被删除。
- P3 SceneRail 的节点将一一对应 `#scene-earth / #scene-photography / #scene-lab /
  #scene-contact` 锚点与舞台；`--rail-gutter` 预留不变。
- 移动端地球场景的操作提示 pill 移至玻璃窗顶部，避免与 MapLibre HUD 重叠（实测修正）。
### G. P2 复验修复（2026-10-12 实施，实测通过）

针对用户复验发现的五个体验问题：

1. **地球 split**：`SceneShell variant="split"`，桌面 34/66 双栏同屏（实测列宽 408/791 @1440）；
   首页预览加 `preview` 属性——MapGlobe 禁 scrollZoom、EarthGlobe 忽略滚轮，
   滚轮让位给场景切换；完整交互保留在 /earth。
2. **摄影反向 split**：`mediaFirst`，64/36（实测 767/432）；场景内只放 lead+2 紧凑组合，
   完整瀑布流留在 /photography；风光/人像筛选与人像诚实空态保留。
3. **开场 3.8s**：DURATION full 3800 / short 900 / reduced 300；boot.css 所有延迟随
   `--boot-scale` 缩放，gloss（汤圆视界）独立成拍（boot-cn）；五阶段截图取证
   （0.7 揭示 / 1.8 高光 / 2.8 品牌名 / 3.6 释义 / 交接首页）；跳过与 reduced 不变。
4. **滚轮场景切换**：`src/hooks/useSceneWheel.ts`——手势归并（240ms 间隙）、噪声阈值 90px、
   过渡锁定（1000ms + 220ms 冷却）、中线法更新 `data-active-scene`、PageUp/Down/方向键同步、
   输入框与内部滚动区不劫持、触摸设备不安装、reduced 240ms。实测八项全过。
5. **单屏高度**：桌面五场景实测 [900,900,900,900,900] @1440×900、[768×5] @1365×768；
   创造场景降密度（2+2 卡、两行截断、硬件空态单行）；移动端允许自然延长
   （[844,841,892,1076,1121]），触摸自然滚动实测通过。

移动端 split 折叠顺序：地球文字优先、摄影图片优先（镜像各自桌面阅读顺序）。
### H. P2.5 视觉与性能返工（2026-10-13 实施，浏览器实测）

1. **场景背景系统**：每场景独立 `--scene-bg`（地球=深空星点/冷核，摄影=中性不抢色，
   创造=细网格+斜射光工作台，联系=顶光最安静）+ 统一 130px 顶部渐隐；首页舞台减弱蓝雾并加暗角。
2. **地球＝单一 Three.js 地球仪**：首页地球场景不再挂载 MapLibre；整轮实测 **0 次瓦片/矢量请求**；
   展开为 CSS 类（同一实例，实测 558→738px 不重建）；`/earth` 路由已在 §N 改为同一套纯 Three.js 地球（不再用 MapLibre 瓦片）。
3. **修复 5 个真实缺陷**：全局 `scroll-behavior: smooth` 与滚轮 rAF 双重驱动；
   `setPointerCapture` 抛错中断 pointerdown（光标卡 grabbing）；
   地球 effect 依赖每次渲染新建的 `onSelectRegion` → 每次父渲染重建整个 WebGL 地球；
   **地区拾取忽略地球旋转**（球体世界交点与旋转无关 → 永远指向同一地点）；
   组件注释承诺的键盘 Enter 选点从未实现。以上均已修复并实测（点选墨西哥/智利/纳米比亚与画面一致；
   键盘 Enter/Space 选中；重渲染后 canvas 同一元素、0 条 renderer 错误；宿主外松开光标复位）。
4. **手势模式**：完整生命周期 + 依赖未安装的诚实态（点击后显示所需官方包与体积，不开摄像头）。
5. **已知未解决**：场景背景首次绘制时长任务 198/191ms（后续同类转场实测 0 条）；
   `<dl>` 内嵌 `<tbody>` 的无效 HTML（PhotographyPage.spec-table，控制台警告，非本轮引入）；
   城市标记/弧线等待真实旅行记录；FPS 未做可靠测量（headless rAF 不受限）。
### I. P3 SceneRail（2026-10-13 实施，桌面/移动实测）

按本文档 §「全站场景进度导航」与附录 B 原样实现，未改变 P3 定义：

- 新增 `src/components/nav/SceneRail.tsx` + `scene-rail.css`，在 `App.tsx` 全站挂载。
- 桌面（≥900px）：左缘 16px、垂直居中，玻璃胶囊宽 38px，五个节点 01–05（00 与隐藏空间不显示）；
  当前节点点亮（accent + 微光）；`aria-current="true"`；悬停/聚焦浮出中英名提示。
- 同步：**中线法** `rootMargin:-50% 0 -50%`（与滚轮控制器同一模型）；跨路由高亮该路由所属场景。
- 点击：同页 smooth scroll（reduced-motion → 即时）；跨路由 navigate；不锁定滚轮。
- 移动（<900px）：轨隐藏 → 右缘 3px 进度条 + 顶部场景名胶囊；不占内容宽度。
- 实测（1440×900 / 390×844）：轨 rect x=16/w=38/cy=450（在预留 64px 槽内）；点节点 03 → scrollY 1800
  且 `#scene-photography` top=0；滚动到地球场景 → 节点 02 自动点亮；悬停 tip opacity=1；Tab 13 次可达并 Enter 跳转；
  reduced 下 300ms 内即达目标；移动端 bar/pill 正常且无横向溢出。

同时（作为与本轮相关的小型修正，独立于 P3 主体）：

- 宣言连续空格：`.bcore__statement` 加 `white-space: pre-wrap` + 渲染时 trim（文件原文不变，实测桌面/移动
  均显示「你这一生太安静   该出发了」）。
- 地球"转向"与"拾取"纬度/经度约定不一致（暴力搜索 4/4 测定 `rotation.lon = -180 - lon`）→ 修正 focus 与
  标记层约定；实测聚焦后准星仍在该地区（aim 不变），重复按 Enter 因此可正常开/关面板。
### J. P4 地球逐级浏览（2026-10-13 实施，浏览器实测）

- **P4a 布局**：沿用既有 split（34/66）。实测 1440×900 → head 408 / pane 791；1365×768 → 385 / 748；
  390×844 → 上下堆叠（文字在上）、无横向溢出。
- **P4b 状态机**（`EarthScene` 内已写明并挂载 `data-earth-state`）：
  `default → expanded → region → region-expanded → 返回全球/ESC → default`。
  实测：展开 558→738px 且 **canvas 同一元素（无重挂载）**；选中地区 → `region`；收起地球保留选中（规则已注明）；
  **ESC** 先关面板并回到 `default`，随后自转恢复（实测 rotation -88.3 → -84.7）；ESC 在空状态无副作用；
  展开后 ESC 收起。零控制台错误。
- **返回复原视角**：新增 `resetSignal` 属性，场景通过组件既有的 `resetView()` 回到开场半球并恢复自转
  （不改拾取/键盘/指针行为，不重建 WebGL）。
- **P4c 数据路径**：以 **CDP 网络层注入**一条合成记录（不写仓库、不碰 CMS）验证真实代码路径：
  面板出现「已到访」状态、记录标题与故事、`photoIds → 作品缩略图`（1 张），左侧统计「已到访」变为 1，
  地球上出现真实坐标标记点（截图 p4c-injected-record.png）。测试后 `travels.json` 仍为 `items:0 / notes:29`，
  **零残留**。真实记录通过既有 CMS「地球与旅行」集合添加即可（字段：regionId/status/title/story/photoIds/latitude/longitude/published）。
- **故障回退判断**：首页场景已是纯 Three.js、**0 瓦片请求**，旧计划"连续瓦片失败→切回退渲染器"对首页**不再适用**；
  真正需要的"无 WebGL 时诚实降级"已实测：stub `getContext` 后 `data-failed="当前浏览器无法初始化 WebGL"`，
  回退文案出现，场景其余部分（chrome/CTA）仍可用。`/earth` 路由的瓦片级空白由 §N 的纯 Three.js 改造消除。
### K. P4 收尾（2026-10-13）：移动端复核、ESC 语义、字段映射

**移动端/桌面复核（实测四视口）**
- 视口 390×844 / 375×667 / 430×932 / 1440×900。
- 地球窗高宽比：移动 0.92–1.07（近正方），桌面 1.42；展开后移动 0.68–0.82、桌面 1.07。
- 展开/收起前后 `pane.top` **完全一致**（390:516→516；1440:172→172）→ 无布局跳动。
- 面板：≥390 时内容自足（不可滚动）；375×667 时内容超出 26px → **面板内部可滚动**（0→26），
  关闭按钮与 CTA 始终可达；面板内滚动**不带动页面**（page 821 不变）。
- 四视口均无横向溢出；桌面布局未退化（head 408 / pane 791）。
- **修复**：移动端顶部胶囊与品牌标识在 390px 实测矩形相交 → 现规则为"胶囊在页头滚出前保持透明，
  滚过 60px 后淡入"，淡入时实测不再重叠（`data-pill` 可观测）。

**ESC 与状态机语义（与代码注释一致，已实测）**
| 状态 | 含义 | 可观测 |
|---|---|---|
| `default` | 默认地球，开场半球 + 自转 | `data-earth-state="default"` |
| `expanded` | 就地放大（同一 WebGL 实例） | `"expanded"` |
| `region` | 已选地区，面板显示（收起地球时保持） | `"region"` |
| `region-expanded` | 已选地区 + 展开 | `"region-expanded"` |

- ESC：面板开→关并 `resetView()` 回 `default`（自转恢复）；空状态→无副作用；仅展开→收起。
- 返回全球 / Enter / Space 与 ESC 结果一致：均不重建 renderer/canvas（实测 canvas 同一元素）；
  无重复触发（单次按键一次状态变化）；键盘操作后焦点仍在 `.eglobe__keys`。

**CMS 字段映射（已在展示链路中使用）**
`regionId`→拾取与面板对应；`status`→状态徽章与统计（仅 `published` 且 `visited` 计入"已到访"）；
`label`→面板标题覆盖（新增使用）；`title`/`story`→面板副标题与正文；`visitedAt`→"时间：…"（新增展示，
缺失即不显示）；`photoIds`→作品缩略图；`latitude`/`longitude`→地图标记；`published`→过滤统计与标记。
`travels.json` 为空时一切照常，面板显示诚实空态。
### M. P4 手势控制（2026-10-13 实施，浏览器实测）

**资源（全部本地，运行时零 CDN）**
- `public/vendor/mediapipe/`：`vision_bundle.mjs`（API）+ `wasm/vision_wasm_internal.{js,wasm}`（SIMD）+
  `wasm/vision_wasm_nosimd_internal.{js,wasm}`（老设备回退）+ `NOTICE.md`（来源、版本、Apache-2.0、体积说明）。
- `public/models/hand_landmarker.task`：官方 float16 手部模型。
- 合计约 32.2MB（SIMD wasm 12.4 + 无 SIMD 11.6 + 加载器 0.64 + API 0.15 + 模型 7.46）；
  按 AGENTS 的 >200KB 规则已在 NOTICE.md 单独说明理由与替换方式。
- 加载方式：`fetch` 源码 → `Blob` URL 动态 import（绕开 dev 对 public 模块的 `?import` 转换，实测该路径曾 500）；
  手势识别器优先 `delegate: 'GPU'`，失败回落 `CPU`。

**手势映射（本节已被 §O 修订）**：手掌左右位移 → `rotateBy`；深度（靠近/远离）→ `zoomBy`；拇指食指捏合**连续 8 帧稳定** → `confirmAtCentre()`
选中准星地区；带死区与阻尼，捏合一次只确认一次。识别结果写入**可变控制通道**（`GlobeControlApi`），
不经 React 状态，避免每帧渲染。

**生命周期与释放（实测，假摄像头设备）**
| 步骤 | 结果 |
|---|---|
| 初始 | `off`，无 video，`getUserMedia` 调用 **0** 次（未触碰摄像头） |
| 点击启用 | `requesting → running`；本地 4 个资源全部 **200**；流 `live` |
| 关闭 | `off`；video 移除；track 全部 **ended** |
| 再次启用 | 新流（调用计数 2），无遗留 |
| 离开地球场景（滚动离开） | 自动 `off`，track **ended** |
| 控制台 | **0 错误** |

**尚未验证**：真实手掌动作驱动地球（假设备无手部影像；需真人在真机前测试）。密钥级回归：Enter 选中 →
`region` + 面板；ESC → `default` + 面板关闭 + canvas 同一元素；SceneRail 节点 02 仍点亮。

### N. P4 手势跨页延续 + 纯净 /earth（2026-10-13 第二轮，浏览器实测）

**先定位的两个真实根因（不猜测）**
1. 首页 → 大地球是**路由跳转**（`<Link to="/earth">`），`EarthScene` 整棵卸载，其内嵌的手势控制随卸载 stop 掉
   摄像头；而 `/earth` 当时没有手势 UI —— 所以"进入大地球摄像头就没了"。§M 表中"滚动离开即自动 off"是旧行为。
2. 即便摄像头在，**手势也驱动不了地球**：`EarthGlobe` 在 boot 里发布控制 API 后，紧接着一行
   `if (controlRef) controlRef.current = null;` 又把引用清空 → `hasTarget` 永远 false。**本轮删除该行。**
3. `/earth` 当时主渲染器是 MapGlobe（MapLibre 瓦片）+ 底部"数据与素材来源"列表 —— 用户指出的第 2 个问题。

**架构修复**
- 新增 `src/features/earth/gesture/gestureSession.ts`：**整个地球体验共用一个手势会话**，实例缓存在 `globalThis`
  （dev 下模块可能被实例化两次，实测曾出现"globe 已 `data-control-ready` 但会话 `hasTarget=false`"的双实例）。
  摄像头流、识别器、识别循环、启用状态都由它持有；`GestureControl.tsx` 退化为订阅状态的薄 UI。
- 控制目标**按帧解析**：各地球面板把手里的 `MutableRefObject<GlobeControlApi|null>` 交给会话（`setTarget`），
  识别循环每帧读 `ref.current` → 路由切换后驱动**新挂载**的地球，绝不操作已卸载实例，且**不重复申请摄像头**。
- 离开判定按**地址栏**而非卸载：`attach()/detach()` + 700ms 宽限 + `isEarthSurface()`（`/` 与 `/earth`）。
  `/earth` 为 lazy 路由，首次跳转的 chunk 加载可能超过宽限期，纯宽限会误停；现改为宽限到期时若地址仍在 earth 面
  则继续等待，只有真正离开（如 `/about`）才 `disable()`（停 track、关识别器、清循环）。
- `/earth` 改为**单一 Three.js `EarthGlobe`**（新 `EarthPage.tsx` + `earth-pure.css`）：无 MapLibre、无瓦片、无来源
  列表；仅保留一行紧凑公有领域署名。地区拾取、旅行标记、空态、Enter/Space、ESC 与 SceneRail 全部保留。

**实测（Edge headless CDP + 假摄像头设备，同一次运行）**
| 步骤 | 结果 |
|---|---|
| 首页开启手势 | `running`；`getUserMedia` 1 次；track `live`；`hasTarget=true` |
| 应用内进入 `/earth` | 仍 `running`；track `live`；`getUserMedia` **仍为 1（无重复申请）**；`hasTarget=true`；**0 次瓦片请求**；无来源列表；`canvas` 1 个 |
| 返回首页 | 仍 `running` |
| 进入非地球路由 `/about` | track `ended`；会话 `off` |

- 识别资源：本轮 4 个本地请求（bundle / wasm.js / wasm / 模型）各 200，识别过程中不重复下载。
- 桌面 1440×900 与移动 390×844 均**无横向溢出**（scrollWidth 1430 / 390），控制台 **0 错误**。

**尚未验证（不得据此宣称通过）**：真实手掌动作 → 地球旋转/缩放/捏合选中。假摄像头无手部影像，`counts` 仍为 0；
需真人在真机前用真实摄像头复测。观测点：`window.__tvGesture.snapshot()` 的 `counts` 与 `detail="已识别到手…"`。

### O. P4 手势手感返工：位移旋转 + 深度缩放（2026-10-13 第三轮）

**旧手感问题的真实原因（先定位）**：`analyse()` 用的是**掌心相对画面中心的绝对偏移**（摇杆模型）——手掌停在
偏离中心处就会每帧持续累加旋转/缩放；并且它与自动旋转同时修改 `rotation.lon`，用户无法判断地球是被谁推动。
缩放还被"上下位置"和"张合"两套输入共同驱动，彼此打架，所以"不好控制"。

**新映射（三个互不冲突的动作）**
- 左右移动手掌（相邻有效帧的掌心 x 位移 `dx`）→ `rotateBy`。`MIRROR_X = -1` 修正"原始摄像头未镜像、而预览
  已 `scaleX(-1)`"的方向差，使手势与鼠标拖拽同向。位移进入增益前先平滑，再取每帧上限。
- 手掌靠近 / 远离摄像头（掌心表观尺度 `handScale` 的相对变化）→ `zoomBy`。**靠近 = 缩小地球、远离 = 放大地球**
  （与常见捏合缩放相反，按用户明确要求）。`zoomBy(factor)` 是相机距离的**倍率**：`factor > 1` 距离变大 → 地球变小。
- 拇指—食指捏合（连续 8 帧稳定）→ `confirmAtCentre()` 选中准星地区；一次捏合只确认一次，松开达到释放阈值后才重新武装。
- **取消**"张开 / 收拢"与"上下位置"对缩放的映射（MediaPipe 仍识别完整手部关键点，只是不再映射到缩放）。

**自动旋转与手势的协调**：`GlobeControlApi` 新增 `setAutoRotate(on)`。识别到手即置 `false`（画面里有手时，
地球的运动只应来自用户），手丢失 `HAND_LOST_GRACE_MS = 1500ms` 后恢复 `true`；关闭手势、切换控制目标或离开
地球体验时复位并把自转交还给地球。

**参数（集中定义，全部为归一化、与分辨率无关的量）**：`MOVE_DEADZONE = 0.003`、`SCALE_DEADZONE = 0.008`、
`SMOOTHING_ALPHA = 0.4`、`ROTATE_GAIN = 300`、`ZOOM_GAIN = 2.5`、`MAX_ROTATE_STEP = 8`、`MAX_ZOOM_STEP = 0.03`、
`CONFIRM_FRAMES = 8`（不变）、`PINCH_ON / PINCH_OFF = 0.42 / 0.62`（不变）。

**尚未验证**：真人手掌动作的最终手感（旋转速度、缩放幅度是否符合直觉）。假摄像头无手部影像，`counts` 无法增长；
需在真机 + 真实摄像头前复测后才能判定手感通过——不得以 `status:"running"` 或计数增长替代。

### P. P4 手势：惯性旋转 + 深度缩放方向更正 + 全画幅识别（2026-10-13 第四轮）

**惯性旋转（作用于真实 Three.js 旋转状态，非 CSS）**
- 手势不再直接 `rotateBy`，而是把估算角速度交给地球：`GlobeControlApi.setSpin(degPerSecond)`。
- 会话侧：相邻有效帧位移 `dx` → `step = clamp(dx·ROTATE_GAIN, ±MAX_ROTATE_STEP)`；`omega = step/dt`（度/秒）；
  `spin` 以 `VELOCITY_SMOOTHING` 平滑并限幅 `MAX_ANGULAR_VELOCITY`，每检测帧 `setSpin(spin)`。
- 地球侧（`EarthGlobe`）：`spinVelocity` 在**渲染帧**按 `rotation.lon += spinVelocity·dt` 积分，并以
  `SPIN_HALFLIFE` 半衰期衰减；低于 `SPIN_MIN` 归零。积分在显示帧率进行，识别帧率变化不影响滑行手感。
- 互斥：手势/惯性期间 `setAutoRotate(false)`；手丢失满 `HAND_LOST_GRACE_MS` 后 `setAutoRotate(true)`，而自动旋转
  只在 `spinVelocity === 0` 时写入 —— 三套旋转不会同时驱动，交接无叠加、无反向、无突停。
- 参数：会话 `MAX_ANGULAR_VELOCITY=160`、`VELOCITY_SMOOTHING=0.4`；地球 `SPIN_MIN=0.5`、`SPIN_HALFLIFE=0.8`
  （短于拖拽的 1.4，避免甩过头）。

**深度缩放方向（本轮更正）**：**靠近 = 放大、远离 = 缩小**。
`factor = clamp(1 − relative·ZOOM_GAIN, ±MAX_ZOOM_STEP)`：靠近时 `relative > 0` → `factor < 1` → 相机距离变小 →
地球放大。捏合期间暂停缩放，释放后重建尺度基准。

**全画幅识别**：`getUserMedia` 增加 `resizeMode:'none'`（请求浏览器不裁切/缩放帧，不支持时忽略）；预览
`object-fit` 由 `cover` 改为 `contain`，与送入识别器的整帧一致。源码内无任何人脸追踪或自动居中；若画面仍随人脸
移动，则是 Windows Studio Effects「自动取景」或摄像头厂商软件的行为，需在系统或摄像头软件中关闭，网页无法代关。

**验证状态**：旋转/缩放/惯性/捏合已做**公式级数值模拟**（方向、单调性、滑行衰减、静止不漂移、捏合一次一次），
但**真人摄像头手感仍未验收**——需真机复测。

### Q. P5 摄影作品集 + 全站社交功能清理（2026-10-14）

**摄影页（左图右文）**：`PhotographyPage` 重写为编辑式阅读器——左侧当前作品大图
（`SmartImage fit="contain"`，完整画幅、不裁切，`max-height:78vh` 防竖幅溢出），右侧标题/分类/
描述/真实拍摄信息，缩略图轨切换，`Lightbox` 提供大图（左/右方向键、Esc、焦点归还）。
移动端（≤900px）改为上下堆叠。页面不使用 `feature/rest` 网格，也没有任何社交互动区。

**分类**：`PhotoCategory` 收敛为 `landscape | portrait | other`；解析器把 `landscape/portrait`
之外的（含历史 `street/machine/sky/abstract`）归为 `other`，**不丢弃**；UI 的 Tab 为 全部 / 风光 / 人像。
CMS `config.yml` 的 category 选项同步为 landscape/portrait/other。

**全站社交清理**：删除点赞、评论、收藏、投票、热门排行的前台入口与数据层——
`RegionPanel` 的「我也想去」投票段与其 props/类型、`useRegionVotes`、`usePhotoLikes`、
`src/lib/interactions/*`、`region-panel.css` 的投票样式、地球回退文案中的「投票」措辞。
交互层无其他引用（确认后处理）。摄影页原本就没有点赞 UI。
