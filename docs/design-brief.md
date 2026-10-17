# design-brief.md — 汤圆Vision 视觉方向与设计研究

状态：第二阶段研究结论（2026-10-10/11 实测）。所有"观察到"的结论都来自
`tools/_verify/research/<site>/report.json` 与同目录截图（Edge headless，
复用 `tools/cdp.cjs`）。未能核实的地方在每节末尾明确写出，不得引用为事实。

---

## 1. 视觉方向（一句话）

深色电影感的个人空间：近黑的空间底、单一冷色高光、克制的液态玻璃、
摄影与地球承担叙事；普通滚动连续自然，重点场景才有明显的空间动画。

三个关键词：**纵深**（层与层之间有距离）、**克制**（材质与动效都有预算）、
**诚实**（示例内容带标记，缺失能力显示缺失态）。

## 2. 设计参考研究（实测）

### A. nanfu.global / nanfu.global/about — 滚动叙事

观察到：

- 首页是 7 个"场景行"（`.row`）拼成的 18464px 长卷：banner 2574px → y1 927px →
  y9 697px → r5 8151px（时间线）→ r1 3604px → y2 1716px。场景高度不等，节奏靠高度差。
- 场景 0：纯黑底 + 一个巨大的暗红环（canvas 2D，`bannerCv`），白色粗体标题
  「No. 1 Longest Lasting Alkaline Battery *」偏右排布，标题下只有一条细红竖线 +
  「Know More」微型入口。负空间极大。
- 明暗交替：黑场景之后是浅灰场景（扁平世界地图 + 红/灰圆点国家标记）、
  米白丝绸质感场景、天蓝摄影场景（About）。**底色切换本身就是转场语言**。
- 文字揭示：大标题逐词从灰到黑（或从半透明白到白）随滚动填充；
  220px 的巨型年份数字在时间线场景里滚动揭示。
- 引导：场景顶部居中的「scroll to explore」+ 鼠标图标；场景之间有点状弧线 +
  一个大箭头指向下一场景；右缘有一条红色滚动进度轨。
- 玻璃：仅 4 处 backdrop-filter。头部 `.mask` = blur(14.7px) + rgba(0,0,0,.5)；
  文末两块 `.txt f-30` = blur(20px) + rgba(0,0,0,.05) + 22px 圆角。**玻璃极少且只用在固定 chrome 上**。
- 技术：自有打包 JS（两个 index.*.js），未检测到任何公开动画库全局变量
  （无 gsap/Lenis/Locomotive/Swiper 等）。cnzz 统计。首屏传输约 21MB（52 张图 + 视频），非常重。

借鉴：场景高度不等的长卷节奏；明暗底色交替作为转场；逐词文字揭示；
「scroll to explore」微提示；点状轨迹 + 箭头引导下一场景；右缘进度轨（我们改为左缘玻璃轨）。

不复制：企业红品牌色与认证 Logo 墙；21MB 的资源策略；iconfont 图标（About 页图标加载失败露出空框，是反面教材）。

可实现方案：现有 `RouteTransition` + `useRevealOnView` 已具备逐元素揭示能力；
逐词揭示可用 Motion 的 stagger 实现，不需要新依赖。进度轨是新组件（见 scene-architecture）。

未核实：其动画是否为自研（只能确认"没有可识别的公开库全局变量"）；移动端表现（本次只测桌面）。

### B. barthkosi.com/explorations/glass — 液态玻璃

观察到：

- 这是一篇**文章页**（Next.js），不是 live demo。hero 是一段视频：ASCII 字符马群上
  叠一枚圆形玻璃透镜，透镜边缘有明显的彩虹色散环，镜内图像被放大并折射。
- 编辑器截图显示该效果由 **Unicorn Studio** 制作（页面带 "Made with unicorn.studio"
  水印），可调参数：Position / Shape / SVG / Scale / **Refraction** / **Dispersion** /
  Magnify / Angle / Invert / Show background / Blend mode；形状含 Circle、Vesica、Archway 等。
- 页面排版：白底、Manrope 大标题、Source Serif 4 正文、Instrument Sans 辅助；
  黑色胶囊 CTA「View Live」；右侧 sticky「ON THIS PAGE」目录。

借鉴（转成我们自己的 CSS/SVG 语言）：玻璃的说服力来自三件事——**边缘色散**、
**镜内折射位移**、**对背景的放大/扭曲**，而不是单纯 blur。我们 `glass--refract` 档的
SVG feTurbulence+feDisplacementMap 已覆盖折射；色散由 `.glass__chroma` 覆盖；
应补"镜内轻微放大"这一感知线索（backdrop 采样 scale 略 >1）。

不复制：Unicorn Studio 本身（付费 SaaS，授权不明，默认不接入）；白底文章版式。

未核实：live demo 页（"View Live" 指向的 unicorn.studio 作品）未单独抓取。

### C. labs.kraavon.com/experiment/particle-field — 鼠标粒子

观察到：

- 单屏实验页：底色 `#05070c`（与我们的 `--c-obsidian #05070a` 几乎同值），
  文字 `#eef3fb`，accent `#18b5ff`；字体 Inter + Noto Sans SC + JetBrains Mono（数值）。
- 一块全视口 canvas：GPU 点云（双色 #18B5FF / #8CE0FF），表面采样自几何体并被
  3D simplex noise 位移。说明文字自述："GPU-shaded point cloud, surface-sampled off a
  primitive and displaced by 3D simplex noise"。
- 右侧悬浮 CONTROLS 面板：半透明深色卡 rgba(14,19,28,.72)、14px 圆角、
  分段控件（Sphere/Torus/Box）、滑杆 + 等宽数值、开关（**Cursor push**、Auto-rotate）、
  色板、Restore defaults。
- 左下：等宽序号「01」+ 大白标题 + 灰说明 + 提示行「Drag to orbit · scroll to zoom」。
- 鼠标交互是**斥力场**（Cursor push + Push strength 可调），即粒子被指针推开/聚集，
  且强度交给用户。

借鉴：粒子强度与"指针推斥"做成设置项；控制面板的版式（右浮窗、等宽数值、分段+滑杆+开关）
直接作为我们悬浮控制面板的模板；单色相双色阶的粒子配色；序号+标题+提示的角落排版。

不复制：整页单实验的信息结构（我们是多场景站点）；792KB 的首屏脚本。

未核实：指针轨迹的衰减曲线细节（静态截图无法测量时间衰减；需交互探针，未做）。

### D. labs.kraavon.com/experiment/glass-form — 玻璃形态

观察到：

- 同一外壳（同 token：#05070c / #eef3fb / #18b5ff / 14px 圆角）。
- 主体是一个 faceted torus-knot，transmission 材质：近黑玻璃体、冷蓝边缘光、
  灰白高光带；参数面板给出**可抄的物理量**：Thickness 1.10、Roughness 0.08、
  **IOR 1.50**、Spin 0.60、Tint #9FE0FF。

借鉴：把 IOR≈1.5、roughness≈0.08、thickness≈1.1、冷色 tint 作为我们液态玻璃的
"物理锚点"——CSS 层的 blur/saturate 数值与 SVG displacement 强度向这组观感对齐；
玻璃在深色底上靠**边缘冷光 + 内部高光带**成立，而不是靠透明度本身。

不复制：3D 玻璃体作为全站主视觉（我们的主视觉是摄影与地球）。

### E. landing.love/sites/bitkraft — 深色空间

观察到：

- landing.love 本身是**策展文章页**（白底、Inter、含广告与多家统计脚本）。
  深色设计存在于其内嵌的 BITKRAFT 站点录屏中：近黑星空 + 稀疏星点、
  几块白色几何巨石漂浮、居中全大写压缩字重标题
  「WHERE PHYSICAL AND DIGITAL WORLDS CONVERGE.」、左下「SOUND OFF」开关、
  底部中央一个白色半球地平线。
- 层次：星点（远）→ 巨石（中）→ 标题（近）→ 地平线（前景），纵深靠亮度与尺寸差。

借鉴：深色空间的纵深公式 = 星点层 + 漂浮体层 + 标题层 + 前景地平线，各层亮度递减/递增有序；
声音开关放在角落且默认 OFF（我们已有 SoundControls，保持默认关）。

不复制：landing.love 的文章外壳与广告；BITKRAFT 的具体巨石造型。

未核实：BITKRAFT 原站（录屏之外的真实交互）未访问；录屏为内嵌视频/iframe，
headless 下仅取到静帧。

### F. github.com/Wencle-Sun/globe + wencle-sun.github.io/globe — 手势地球

观察到（演示站）：

- 单屏：底 `#04060c`，文字暖纸色 `#e9e5da`，accent 琥珀 `#e3a04c`；数值用 SF Mono。
- 左侧 HUD 仪表列：手势/倍率/航班/经度/纬度/帧率/卫星/空间站，等宽对齐；
  告警行用琥珀色如实报告降级：「没读到地球贴图 assets/earth.jpg，现在显示的是网格球」
  ——**降级可见化**，是极好的范例。
- 地球：暗球体 + 琥珀色发光城市点 + 中文城市标签 + 点状轨道环；左上太阳光晕、
  右下线框月球。左下多行手势/鼠标/键盘说明 + 「详细教程」按钮。
- 技术：p5.js 2.2.3 + MediaPipe Hands（本地文件，离线可跑）；摄像头数据仅本地处理。

授权核查（raw 文件直取，2026-10-11）：

- 项目原创代码：**MIT**（Copyright (c) 2026 Wenke Sun）。
- `js/p5.min.js`：p5.js 2.2.3，**LGPL-2.1**。
- `assets/mediapipe/`：MediaPipe Hands 0.4.1675469240，**Apache-2.0**。
- `assets/earth.jpg`：**许可未记录**——THIRD_PARTY_NOTICES.md 明确写"source URL and exact
  license have not yet been recorded…downstream users should confirm its terms"。
  **结论：不得复用该贴图。** 我们已有自产贴图（`public/assets/earth/*` + textures.json 出处）。

借鉴：手势映射表（手掌移动=旋转、五指收张=缩放、捏合两下=进入城市模式、摆手=切换城市）
作为**交互思想**复用（MIT 允许，保留版权与许可声明即可）；HUD 仪表列与降级可见化；
"摄像头可选、鼠标键盘永远可用"的产品姿态（README 明示拒绝授权即用鼠标）。

不复制：不整体嵌入该项目；不引入 p5（我们已有 three）；不使用其 earth.jpg；
不默认引入 MediaPipe（Apache-2.0 可用，但属"先验证再决定"项）。

未核实：github.com 网页 UI 在 headless Edge 中加载失败（chrome-error 页），
仓库内容改由 raw.githubusercontent.com 直取核实（README/LICENSE/index.html/THIRD_PARTY_NOTICES.md）。

### G. Apple Photos「按地点查找」— 逐级浏览逻辑

观察到（支持文档原文）：Map 视图 → 地图上按地点聚组的照片 →
"Double-click a thumbnail to zoom in on that section of the map"（更细粒度）→
Grid 视图按地点分组缩略图 → 单张照片的 Places 信息 + Nearby Photos。

借鉴：地球场景的层级 = 全球球面 → 区域/国家 → 城市聚组缩略图 → 单张照片（含拍摄信息+故事）
→ 返回时恢复上一层视角与滚动位置。"双击缩略图下钻"对应我们的"点击城市进入照片层"。

不复制：Apple 的具体界面与地图控件外观。

### H. unicorn.studio/inspiration — 可选灵感

观察到：外壳为近黑 `#08080a`、薰衣草灰文字 `#dad7de`/`#aeaac0`、紫色按钮；
**灵感画廊内容在 headless 下始终停在加载转圈，未渲染**（截图仅 23–34KB 的空壳）。

结论：仅确认其外壳配色与"画廊即灵感墙"的产品形态；**不接入 Unicorn Studio**
（付费、授权不明）。无更多可引用观察。

未核实：画廊条目本身（客户端加载失败）。如需要，改由人工浏览器查看后补记。

## 3. 颜色原则

- 底：`--c-void #030507` / `--c-obsidian #05070a` / `--c-deepspace #0b1017` /
  `--c-slate #141a23`。场景之间允许换"底色温度"（参考 A 的明暗交替），但公开面默认深色。
- 文：frost `#e8ecf2`(15.4:1) / silver `#97a2b0`(7.4:1) / fog `#8a95a3`(三级)。
- 高光：单一冷色 cryo `#8fe3ff`；场景 accent 每场景一个（见 `theme.css`），
  同屏高饱和色不超过 2 个。参考 C/D 的单色相双色阶是粒子与地球点光的配色模板。
- 覆盖色 `--c-mist` 只能用于 `color-mix(... transparent)` 叠加，**禁止**当不透明填充
  （V3 事故，见 tokens.css 注释）。

## 4. 字体原则

- 中文：系统栈优先（PingFang SC / Microsoft YaHei / Noto Sans SC），不引入中文字体文件
  （体积不可接受）。拉丁显示体与等宽体按需子集化后再考虑。
- 层级：场景大标题 1 行 ≤ 12 字、字重 600–700、行高 1.05–1.15；
   eyebrow/label 用等宽或加字距大写；数值一律等宽（参考 C/D 的 JetBrains Mono 位）。
- 逐词揭示只用于重点场景主标题；正文不做滚动动画。

## 5. 间距与版式原则

- 8px 基；场景内壳宽 `u-shell`；场景垂直呼吸 `clamp(72px,12vh,160px)`。
- 左右分栏是主语法：02 左文右地球窗（窗占约 2/3）、03 左作品右信息（反转）。
  分栏在 <900px 折叠为上下，地球窗保持 ≥ 60vh。
- 负空间是设计元素：重点场景至少 30% 面积无内容（参考 A 场景 0）。

## 6. 材质原则（液态玻璃统一规范）

四档，全部在 `src/styles/glass.css`，禁止在组件里自造玻璃：

| 档 | blur | saturate | tint | 用途 |
|---|---|---|---|---|
| standard | 14px | 1.5 | .60 | 小面板、按钮、导航轨 |
| depth | 26px | 1.7 | .74 | 中型窗口（区域面板、联系卡） |
| refract | 8px + SVG 位移 | 1.85 | .42 | 少数大静态窗（地球窗、首页核心窗） |
| solid | 32px | — | .94 | 需要完全可读的浮层（设置、灯箱 chrome） |

- 物理锚点（来自参考 D）：IOR≈1.5、roughness≈0.08、thickness≈1.1、冷 tint。
- 六层结构不变：底色 tint / 内描边 / 边缘光 / 镜面高光 / 色散 / 折射。
- 降级：`<768px`、`glassQuality=balanced|off`、`prefers-reduced-transparency`、
  Firefox 的 `url()` 问题——各自有既定回退，见 glass.css。
- 应用位（本阶段指定）：左侧场景导航轨、联系小窗、悬浮控制面板、地球窗 chrome、
  灯箱 chrome、设置面板。**其余位置默认不用玻璃**。

## 7. 粒子与动画边界

- 粒子只服务品牌氛围：首页 CursorField（已有）+ 入场 Logo 微光。数量三档
  900/460/220，DPR≤1.75，指针斥力强度进设置面板（参考 C）。
- 禁止：全屏持续高负载粒子、遮挡内容的粒子、不可关闭的自动旋转。
- 转场：普通滚动连续；场景切换用既有 RouteTransition 的进出两相；
  重点场景（00/02 展开）才允许空间位移动画，且 ≤1.2s、可跳过、reduced-motion 全降级。
- 入场动画 ≤1.7s（现 1.65s），回访 620ms，reduced 300ms；任何资源失败都有文字回退。

## 8. 明确不做

Unicorn Studio / p5 / MediaPipe / GSAP / Lenis 等默认不引入；街道级地图；
点赞/收藏/评论/投票/热门排行（全站）；假登录、假视频、假旅行记录；拼音主标题；
把每个小项目做成全屏场景。
