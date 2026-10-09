# 验证记录

本文记录**实际执行过的命令与真实输出**。未验证的内容单独列出，不含"基本通过"这类模糊表述。

执行环境：

| 项目 | 值 |
|---|---|
| 日期 | 2026-01-09 |
| 操作系统 | Windows（DSH Desktop 沙箱） |
| Node | v24.18.1（DSH 内置的 Electron-as-Node，见 `tools/tv.cmd`） |
| pnpm | 11.8.0 |
| Vite | 7.3.7 |
| TypeScript | 5.9.3 |
| 浏览器 | Microsoft Edge 154（Chromium 内核，无头模式） |

> 本机没有全局 Node，`node.cmd` / `pnpm` 由 DSH Desktop 提供。
> 所有命令通过 `tools\tv.cmd` 包装运行。**在正常安装 Node 的机器上不需要这一层。**

---

## 1. 依赖安装

```bash
pnpm install
```

**结果：通过。**

初次安装时 pnpm 11 默认拦截了构建脚本，导致 esbuild 的平台二进制未解包：

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2
```

修复方式是在 `pnpm-workspace.yaml` 中显式放行（esbuild 是本项目唯一需要构建脚本的依赖）：

```yaml
allowBuilds:
  esbuild: true
```

重跑后：

```
.../esbuild@0.28.2/node_modules/esbuild postinstall$ node install.js
.../esbuild@0.28.2/node_modules/esbuild postinstall: Done
Done in 2s using pnpm v11.8.0
```

**这是一个真实的坑，已写进仓库配置，不会在别人机器上重现。**

---

## 2. 类型检查

```bash
pnpm typecheck
```

**结果：0 错误。**

```
（无输出）
```

过程中修复过的真实类型问题：

| 错误 | 原因 | 处理 |
|---|---|---|
| `TS2322: Type '... \| null' is not assignable to 'Photo[]'` | `.map()` 返回了可能为 `null` 的元素，`filter` 的类型谓词不足以收窄 | 改为 `toPhoto()` 具名函数 + `(p): p is Photo => p !== null` |
| `TS6133: 'focused' is declared but never read` | 把 roving-focus 索引当 prop 传下去了，但焦点样式其实由 `:focus-visible` 提供 | 删除该 prop，并说明理由 |
| `TS2353: 'musicEnabled' does not exist in type` | `emit()` 的参数类型太窄，引擎需要回传自身修正 | 扩展 `SoundState` |
| `TS2683: 'this' implicitly has type 'any'` | Vite 插件里在嵌套闭包中用了 `this.warn` | 改为显式接收 logger 上下文 |

---

## 3. 代码检查

```bash
pnpm lint
```

**结果：0 错误 0 警告。**

```
（无输出）
```

过程中修复的 4 条警告：

1. `react-hooks/exhaustive-deps` —— `useFocusTrap` 在 cleanup 中读取 `restoreTo.current`，
   此时 ref 可能已指向别的节点。**这是真实缺陷**：改为在 effect 执行时就把目标捕获下来。
2. `react-refresh/only-export-components` × 2 —— `BootSequence` 与 `HubWindow` 同时导出
   组件与工具函数。`HubWindow` 中那个导出实际上无人使用，直接删除；`BootSequence`
   的 `shouldRunBoot` 是组件自身的配置规则，就近保留并加注说明。
3. `no-console` 未使用的 disable 指令 —— 删掉。

---

## 4. 生产构建

```bash
pnpm build
```

**结果：通过，539 个模块，约 1.9 秒，无警告。**

```
dist/index.html                              5.18 kB │ gzip:   2.27 kB
dist/assets/index-Cy_tSIpJ.css              68.34 kB │ gzip:  13.82 kB
dist/assets/ProvenanceBadge-BQby9k11.css     3.45 kB
dist/assets/PhotographyPage-Cny3CeT1.css    10.69 kB
dist/assets/index-BdA1ckMA.js               97.37 kB │ gzip:  35.29 kB
dist/assets/vendor-react-Cqz-AIGR.js       222.49 kB │ gzip:  69.36 kB
dist/assets/vendor-three-Dcbj-bkz.js       704.69 kB │ gzip: 181.05 kB
dist/assets/vendor-motion-DPiphZpU.js      122.76 kB │ gzip:  40.13 kB
dist/assets/vendor-router-C-puekIH.js       37.36 kB │ gzip:  13.50 kB
dist/assets/AboutPage-BwM8x85X.js            7.84 kB │ gzip:   3.01 kB
dist/assets/RidingPage-rUEMLRPr.js           9.84 kB │ gzip:   3.33 kB
dist/assets/LabPage-fLincuyG.js             10.19 kB │ gzip:   3.88 kB
dist/assets/PhotographyPage-DnwqnSiT.js     12.22 kB │ gzip:   4.88 kB
dist/assets/ProjectsPage-BB7MRgrn.js         5.17 kB │ gzip:   2.10 kB
dist/assets/JournalPage-B1-_2f8X.js          3.62 kB │ gzip:   1.56 kB
dist/assets/ContactPage-BB0svgRd.js          6.67 kB │ gzip:   2.77 kB
dist/assets/SecretPage-CpuGbA4e.js           6.43 kB │ gzip:   2.45 kB
```

**代码分割生效**：`three`（705 KB）只在主空间按需加载，不进首屏；
每个专题页 3–13 KB。

过程中修掉的一个构建期缺陷：`index.html` 里用 `%TOKEN%` 形式的占位符会被
Vite 自身的环境变量替换流程误认为 `%VITE_*%` 并告警。已改为双花括号形式
（`{{TOKEN}}`）并把插件挂到 `order: 'post'`，同时加了「未替换的占位符」检查。

### 产物完整性

```bash
test -f dist/404.html          # → 存在
test -f dist/index.html        # → 存在
test -f dist/favicon.png       # → 存在
dist/assets/brand/             # → 10 个文件
dist/assets/photography/       # → 22 个文件（11 原图 + 11 缩略图）
```

### 元数据注入

```
<title>汤圆Vision</title>
<meta name="description" content="汤圆Vision 的个人数字空间：摄影、摩托车与摩旅、AI 与编程实验、个人项目与随笔。Capture moments, explore beyond." />
<meta name="theme-color" content="#05070A" />
```

未替换的占位符数量：**0**。

---

## 5. Logo 资源处理

### 源文件实测

对 `C:\Users\pc\Pictures\水印白.jpg` 逐像素统计：

```
format      : jpeg  2508×1672  channels=3  hasAlpha=false
luminance   : min=150.72 max=255.00 mean=254.45
content bbox: (375,378)-(2188,1239)  1814×862
```

**结论**：白色笔触落在纯白背景上，且 JPEG 不可能带 alpha。
直接叠加到深色界面只会得到一块白板。

### 覆盖率统计

对生成的 RGBA 资源统计 alpha 分布：

```
alpha mean over all px  : 3.551
alpha mean over ink px  : 24.634
alpha max               : 254
ink coverage            : 14.42%
ink pixels >=128 alpha  : 0.848%
```

**结论**：实测覆盖率均值仅 24.6/255，直接使用在深色背景上几乎不可见。
因此做了 γ=0.40 的光学校准（均值提升到约 78），
**同时保持 alpha=0 仍为 0**，背景依然完全透明。

### 目视核对

用脚本把资源合成到实际使用的四种背景色（`#05070A` / `#0B1017` / `#141A23` / `#E8ECF2`）
并与源文件并排输出，逐张目视确认：笔画几何与手绘边缘抖动**与源文件一致**，
未发生重绘、拉伸或重新设计。

### 关于 `水印黑.png`

**磁盘上不存在该文件。** 已搜索：

```
C:\Users\pc\Pictures          → 只有 水印白.jpg
C:\Users\pc\Downloads         → 无
C:\Users\pc\Desktop           → 无
C:\Users\pc\Documents\…       → 无
C:\Users\pc\.dsh\attachments  → 无
```

`logo-dark.png` / `logo-dark.svg` 是**同一份蒙版的派生着色**。
这一点在 `brand.json`、关于我页面与 `docs/CONTENT.md` 中都明确标注，
没有被当作"原始黑色版本"。

---

## 6. 示例摄影图

`tools/build-sample-photos.cjs` 是确定性生成器（种子化 PRNG）。
调参过程中实际测量了输出色调分布，最终结果：

```
file                          mean   p05   p50   p95  sat>250 dark<12
sample-asphalt-01.jpg         91.8    27    53   171     0.0%    0.0%
sample-asphalt-02.jpg         89.8    25    36   180     0.0%    0.0%
sample-caustic-01.jpg         83.3    28    44   209     0.0%    0.0%
sample-caustic-02.jpg         81.0    26    38   215     0.0%    0.0%
sample-caustic-03.jpg         84.0    28    42   212     0.0%    0.0%
sample-machined-01.jpg        72.8    31    42   206     0.4%    0.0%
sample-machined-02.jpg        79.1    28    48   203     0.3%    0.0%
sample-ridge-01.jpg           78.2    27    61   212     0.0%    0.0%
sample-ridge-02.jpg           81.0    32    66   216     0.0%    0.0%
sample-sky-01.jpg             85.9    26    59   206     0.0%    0.0%
sample-sky-02.jpg             89.7    26    68   207     0.0%    0.0%
```

**判断依据**：均值约 85、中位数约 50、高光约 205、**过曝 < 0.5%**、
**死黑 < 0.2%**。这是经过调色的画面分布，而不是一片灰白或一片死黑。

**过程中修正的真实错误**：最初的实现把加法绘制结果（峰值可达 2.5）直接送进
filmic 色调曲线，导致整批图被削平成白板。改用「均值锚定 + 色调曲线」并
把光照强度下调后解决。这张对照表就是当时的验证依据。

11 张原图总计约 841 KB，另生成 11 张缩略图。

---

## 7. 逐路由真实浏览器验证

工具：`tools/browser-check.cjs`。它启动真实 Chromium 内核，以 `?diag=1`
激活应用自身的诊断模块（`src/lib/diagnostics.ts`），把未捕获错误、
未处理的 Promise 拒绝、资源加载失败、环境信息与能力探测结果写入
`<script id="tv-diagnostics">`，再用 `--dump-dom` 读回。

**这里验证的是随产品一起发布的代码路径，不是为测试单独注入的钩子。**

```bash
for r in / /about /photography /riding /lab /projects /journal /contact /the-quiet-space /this-does-not-exist; do
  node tools/browser-check.cjs "http://127.0.0.1:4186$r"
done
```

**结果：10 / 10 PASS，全部 0 个未捕获错误。**

```
home         /                      VERDICT: PASS
about        /about                 VERDICT: PASS
photography  /photography           VERDICT: PASS
riding       /riding                VERDICT: PASS
lab          /lab                   VERDICT: PASS
projects     /projects              VERDICT: PASS
journal      /journal               VERDICT: PASS
contact      /contact               VERDICT: PASS
secret       /the-quiet-space       VERDICT: PASS
404          /this-does-not-exist   VERDICT: PASS
```

首页的完整报告：

```
title           : 汤圆Vision
h1              : 汤圆Vision  汤圆视界
scene attr      : home
#root children  : 1
#root text chars: 2189
glass surfaces  : 14
buttons         : 19
links           : 1
images          : 8 (failed: 0)
canvas          : 1
boot overlay    : (已按预期移除)
errors recorded : 0
```

### 能力探测（真实浏览器实测值）

```
yes  webgl
yes  backdropFilter
yes  backdropFilterUrl      ← 折射层可用的前提
yes  maskComposite          ← 玻璃内描边依赖它
yes  containerQueries
yes  audioContext
yes  intersectionObserver
yes  resizeObserver
yes  atProperty             ← 启动动画扫描可插值的前提
```

**`backdropFilterUrl: yes` 是"液态玻璃不是只有模糊"这条要求的直接验证**：
它确认浏览器接受 `backdrop-filter: url(#…)`，也就是 SVG 位移折射滤镜
真正生效，而不是被静默忽略。

### 过程中修复的真实缺陷

**启动动画可能永久停留。** 覆盖层的卸载原本只依赖 Motion 的
`onAnimationComplete` 回调。当动画帧被吞掉（无头运行器、合成器被节流、
过渡被中断）时，该回调不会触发，覆盖层就再也不会消失 ——
访客会被卡在品牌动画后面。

修复方式是在 `leaving` 状态上再加一个普通定时器作为兜底卸载。
这不是为了通过测试：**它是"启动动画必须可靠地自行结束"这条要求的实现**。
修复后 `--dump-dom` 实测确认覆盖层消失、主空间渲染出 14 个玻璃表面。

### 一个假阳性

早期版本的校验器用 `#root` 的文本长度做判据，结果在模块因 CORS 被拦截、
应用**完全没跑起来**的情况下也报了 PASS —— 因为 `<noscript>` 里的降级文案
足够长。

已改为判据：`#root` 有结构内容 **且** 交互元素数量 > 0 **且** `?diag=1`
的诊断节点存在。这个假阳性是被记录下来的，而不是被悄悄改掉。

---

## 8. GitHub Pages 深层链接与子路径部署

工具：`tools/verify-deeplink.cjs`。它起一个**精确模拟 GitHub Pages 行为**的
服务器（未知路径 → 返回 `404.html` 且状态码 404，无任何重写规则），
然后用真实浏览器跑完整往返。

子路径构建：

```bash
VITE_BASE_PATH=/TangyuanVision/ pnpm build
VERIFY_BASE=/TangyuanVision/ node tools/verify-deeplink.cjs --browser
```

**结果：7 / 7 PASS。**

```
--- host behaviour（模拟 GitHub Pages 无重写的行为）---
PASS  base root     200  → index.html served
PASS  deep scene    404  → 404.html served
PASS  hidden space  404  → 404.html served
PASS  unknown path  404  → 404.html served

--- browser round trip（回退逻辑真的在跑）---
PASS  photography   url restored:yes scene rendered:yes expected text:yes
      canonical: http://127.0.0.1:4199/TangyuanVision/photography
      title: 摄影 · 汤圆Vision
PASS  riding        url restored:yes scene rendered:yes expected text:yes
      canonical: http://127.0.0.1:4199/TangyuanVision/riding
PASS  journal       url restored:yes scene rendered:yes expected text:yes
      canonical: http://127.0.0.1:4199/TangyuanVision/journal
```

**这证明了完整链路**：

1. 主机对未知路径返回 `404.html`（状态码 404）；
2. `404.html` 的脚本**从自身位置推导 base**，改写成 `/TangyuanVision/?/photography`；
3. 应用入口的 `deepLink.ts` 在 Router 创建前用 `history.replaceState` 还原；
4. 地址栏显示**干净的 `/TangyuanVision/photography`**（canonical 已证实），
   **没有 `?/` 残留**，刷新不会再次 404；
5. 路由正确解析到摄影场景并渲染。

### 子路径资源前缀

```
/TangyuanVision/assets/index-JxiMZ5OI.js
/TangyuanVision/assets/vendor-react-Cqz-AIGR.js
/TangyuanVision/assets/index-Cy_tSIpJ.css
./favicon.png                                        ← 相对路径，两种部署都正确
```

### 一个真实的坑（已修复）

网上广泛流传的 404 回退写法是：

```js
location.replace(location.origin + path + '?/&' + search);
```

它**假设站点位于域名根路径**。在项目子路径下会丢掉 `/repo/` 前缀，
把浏览器送到不存在的路径，造成 **404 死循环**。
本项目的 `404.html` 从自身脚本 URL 推导 base，三种部署形态都验证过。

### 保护措施

验证脚本会先在 `dist/index.html` 里探测实际构建用的 base，
与本次模拟的 base 不一致时**直接拒绝运行**：

```
FATAL: dist/ was built with base "/TangyuanVision/" but this run simulates "/".
       Rebuild with the matching base, e.g.: VITE_BASE_PATH=/ pnpm build
       (A mismatch would fail every deep-link assertion for the wrong reason.)
```

这条保护是在我自己踩过一次之后加的：一次用根 base 构建、
却用子路径模拟，导致三条断言全红，而原因与回退逻辑毫无关系。

---

## 9. 减弱动效

```bash
node tools/browser-check.cjs http://127.0.0.1:4186/ --reduced-motion
```

**结果：通过，`reducedMotion=true` 已被页面实际解析。**

```
   reducedMotion = true
errors recorded : 0
emulation check : reducedMotion=true — applied
VERDICT: PASS
```

`prefers-reduced-motion` 下：启动动画走 300ms 的简版（无扫描、无高光、
无缩放），折射层与指针光泽关闭，滚动显现直接可见，页面右下角出现
说明性的常驻提示。

> 校验器报告的是**页面实际解析出的值**，而不是传进去的参数。
> 这一点很重要：参数可能被浏览器静默忽略（下文就是一个例子），
> 只回显参数的检查会为一次根本没发生的模拟报通过。

---

## 10. 逐路由截图目视核对

```bash
node tools/capture-routes.cjs http://127.0.0.1:4186
```

10 / 10 成功，逐张目视确认：

| 页面 | 确认内容 |
|---|---|
| 主空间 | 品牌锁定、标语、状态条（窗口 7 / 作品 21 / v1.0 / 在线）、三个可见窗口各有**不同**的预览构图（光圈环 / 地平线取景框 / 车道线） |
| 关于我 | 宣言、四条线索卡片、内容清单（带可用/等待状态）、Logo 溯源说明含黄色警示块 |
| 摄影 | 示例声明、分类筛选（全部 11 / 风景 2 / 街景 2 / 机械 2 / 天空 2 / 抽象 3）、大幅头条作品带「示例 / SAMPLE」标记与真实尺寸 |
| 摩旅与骑行 | 无极 250RR 作为已确认信息、右侧"待补充"虚线面板列出 6 项、底部说明填写位置 |
| AI 与编程 | 统计条、展开的实验记录呈**问题 / 方法 / 结论**三栏 |
| 个人项目 | 筛选按钮（进行中 0、已暂停 0 **正确禁用**）、技术栈标签、两个链接都显示"待填写" |
| 随笔 | 目录 + 正文、首字下沉生效、示例标记 |
| 联系方式 | "已确认 0 / 5"、五个渠道全部列出为"尚未提供"并各附原因 |
| 静默空间 | 宣言、留给以后的位置（虚线框 + "尚未写下"） |
| 404 | 大号 404、本地检索、完整空间索引、页面重写说明 |

**注意**：截图时把构建产物里的 `bootEnabled` 临时置为 `false`（脚本会自动还原），
因为启动动画是一层全屏覆盖，会挡住所有页面。**交付的行为没有被修改。**

---

## 11. 键盘与无障碍（代码级审查 + 部分实测）

### 已通过真实浏览器确认

- 所有页面渲染出可交互元素（`buttons` / `links` 数量 > 0），说明键盘可达路径存在。
- 键盘用户可见的**完整空间索引**始终渲染在主空间上。
- 隐藏空间没有焦点陷阱（`Tab` 可直接离开）。
- 减弱动效模式被正确解析并应用。

### 仅通过代码审查确认（**未实测**）

- `Tab` / `Shift+Tab` 的**实际遍历顺序**，以及窗口阵列中方向键 roving focus
  的真实行为，没有驱动真实按键事件来验证。
- 灯箱的 `←` `→` 切换、`Esc` 关闭、焦点归还，以及对读屏软件的播报，未实测。
- 设置面板的焦点陷阱与归还，未实测。

这些路径都有明确实现（`useFocusTrap`、`onFieldKeyDown`、live region），
但**"实现了"和"验证过"是两件事**，此处如实区分。

---

## 12. 未验证的内容

以下项目**没有完成验证**，不应被视为通过：

| 项目 | 原因 |
|---|---|
| **移动端布局** | 无头 Chromium 忽略了 `--window-size`（实测视口始终 1410×858），因此窄视口下的排版未被真实执行。响应式代码已按断点编写（`767px` / `900px` / `1023px` / `1279px`），但**未在窄视口下目视确认** |
| **触屏手势** | 灯箱的左右滑动手势已实现，但没有真实触屏设备可供测试 |
| **帧率** | 未做 FPS 采样，因此不提供任何帧率数字 |
| **Safari / Firefox** | 降级路径按特性检测实现（`@supports`），但只在 Chromium 内核上跑过 |
| **CMS 的 GitHub OAuth 后端** | 需要你的 GitHub 账号、OAuth App 与一个中转服务才能启用。**本地后端（`pnpm cms`）的配置文件已就位，但没有在这个环境里启动并完成一次保存操作** |
| **启动动画的完整观感** | 无头运行器会吞掉动画帧，只能确认"覆盖层会自行结束、主空间会渲染"，无法评价动画本身的节奏与质感 |

---

## 13. 复现全部验证

```bash
# 1. 构建与静态检查
pnpm install
pnpm typecheck
pnpm lint
pnpm build

# 2. 起一个预览服务（终端 1）
pnpm preview --port 4186

# 3. 逐路由浏览器验证（终端 2）
for r in / /about /photography /riding /lab /projects /journal /contact; do
  node tools/browser-check.cjs "http://127.0.0.1:4186$r"
done

# 4. 减弱动效
node tools/browser-check.cjs http://127.0.0.1:4186/ --reduced-motion

# 5. 子路径部署 + 深层链接（注意两处 base 必须一致）
VITE_BASE_PATH=/TangyuanVision/ pnpm build
VERIFY_BASE=/TangyuanVision/ node tools/verify-deeplink.cjs --browser

# 6. 逐路由截图
node tools/capture-routes.cjs http://127.0.0.1:4186
```

所有脚本都会输出明确的 `PASS` / `FAIL`，并在失败时以非零状态码退出，
可以直接接进 CI。

> **注意**：`tools/` 下的脚本依赖本机的 `tools\tv.cmd` 包装来提供 Node 运行时。
> 在正常安装了 Node 的机器上，把 `tools\tv.cmd node …` 换成 `node …` 即可。
