# 批量导入照片 · 更换首页背景

两件彼此独立的事，都只需要在本地跑一条命令或点几下后台。

---

## 一、批量导入照片（摄影作品 + 地球进度）

### 核心原则：位置来自文件，不是来自猜测

每张照片的拍摄位置，如果相机或手机写进了 **EXIF GPS**，那就是**硬数据**，
读出来直接可用。脚本只信这个。

没有 GPS 的照片，脚本**只导入摄影作品，不会生成地球记录** —— 不猜位置。
「看起来像在海边」不是坐标，写进地球进度就是假的。

### 1. 准备照片

把照片放进任意一个文件夹，例如：

```
C:\Users\pc\Pictures\待导入\
```

支持 `jpg / jpeg / png / webp / tif / tiff`。子文件夹会被递归扫描。

> ⚠️ **最容易踩的坑：微信 / QQ 发送会把 EXIF 剥掉。**
> 聊天软件默认「压缩发送」，GPS 和拍摄参数会一起消失。
> 必须用 **文件 / 原图** 传输，或者直接读相机 SD 卡、手机相册原始文件。
>
> 检查一张图有没有 GPS：右键 → 属性 → 详细信息 → 看「纬度 / 经度」是否存在。

### 2. 先预演（不写任何文件）

用 DSH 自带的 Python（已装 Pillow）：

```powershell
cd C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision
& "C:\Users\pc\.dsh\dsh-runtimes\dsh-plugin-desktop-primary-runtime\dependencies\python\python.exe" `
  tools\import-photos.py "C:\Users\pc\Pictures\待导入"
```

输出示例（这是用测试图跑出来的真实结果）：

```
图片文件：4   可导入：4   跳过：0

【导入清单】
  2026-05-04-beijing
    文件 beijing.jpg   1200x800   拍摄 2026-05-04
    GPS  39.9042, 116.4074   国家 China (ISO 156)
    器材 TestMake Test Cam X1
  ...
【没有 GPS 的照片 —— 只进摄影作品，不上地球】
  no-gps.jpg  1200x800
```

**先看这份报告再动手**：国家判得对不对、哪些没有 GPS、器材信息有没有读出来。

### 3. 确认后真正写入

```powershell
& "C:\Users\pc\.dsh\dsh-runtimes\dsh-plugin-desktop-primary-runtime\dependencies\python\python.exe" `
  tools\import-photos.py "C:\Users\pc\Pictures\待导入" --apply
```

它会：

| 动作 | 位置 |
| --- | --- |
| 原图转存（应用 EXIF 方向） | `public/assets/photography/<id>.jpg` |
| 生成缩略图（长边 480） | `public/assets/photography/<id>@thumb.jpg` |
| 追加作品条目 | `src/content/data/photography.json` |
| 追加带 GPS 的旅行记录 | `src/content/data/travels.json` |

同一国家的多张照片会被**合并成一条**旅行记录，`photoIds` 里挂上所有照片，
不会一个国家冒出几十条。

### 4. 可选参数

| 参数 | 作用 |
| --- | --- |
| `--replace-samples` | 同时删除 `provenance: sample` 的示例作品（默认保留） |
| `--category portrait` | 这批图按人像分类导入（默认 `landscape`） |
| `--title-prefix "京都 "` | 给这批图加标题前缀 |

### 5. 导入之后

```powershell
git add -A
git commit -m "content: import photos from <文件夹名>"
git push origin master
```

等 1–3 分钟 Actions 部署完，再看：

- `/photography` — 新作品是否出现、灯箱是否正常
- `/earth` — 点那些国家，面板里应该有照片；统计的「已到访」会变

### 6. 没有 GPS 的照片怎么补位置

两条路，都不需要改代码：

1. **后台**：`摄影作品` 里填 `location`（只是文字），`地球与旅行` 里新建/编辑一条记录填 `latitude` / `longitude`。
2. **手改 JSON**：给作品加 `location`，再在 `travels.json` 对应国家加坐标。

---

## 二、更换首页背景

### 机制本来就有，只是没接到后台

首页背景由 [`VisionBackdrop.tsx`](../src/features/home/VisionBackdrop.tsx) 渲染，
读取 `settings.json → homeBackground`。四层结构：

```
L1 程序绘制的渐变场（永远存在，所以永远不会白屏）
L2 你的照片（加载成功才盖上去）
L3 可读性压暗层
L4 颗粒质感
```

**照片加载失败时自动回退到渐变**，不会破图，这一点是设计保证的。

### 方式 A：在后台改（现在已可用）

后台 → **网站设置 → 基础设置 → 首页背景**：

| 字段 | 作用 | 建议 |
| --- | --- | --- |
| **背景图片** | 上传照片，存到 `/assets/uploads/` | 横向、较暗、主体不居中的照片 |
| **主色调** | 取自照片的主色 | 用于字标对比度，填个近似深色即可 |
| **压暗程度** | 0 = 原图，1 = 全压黑 | 深色主题建议 **0.55–0.75** |
| **图片来源** | real / sample | 用自己的照片选 `real` |

改完 **Publish**，1–3 分钟生效。只影响首页，不影响其他页面。

### 方式 B：直接改 JSON

`src/content/data/settings.json`：

```json
"homeBackground": {
  "src": "/assets/photography/2026-05-04-beijing.jpg",
  "tone": "#0b1017",
  "overlay": 0.55,
  "provenance": "real",
  "note": "首页背景"
}
```

`src` 以 `/` 开头（相对站点根），不要写 `public/` 前缀 —— `assetUrl()` 会自动拼部署子路径。

### 参数怎么调才好看

- **overlay 太低（<0.4）**：背景抢戏，大标题「汤圆Vision」对比度下降
- **overlay 太高（>0.85）**：等于没有背景
- **tone 要接近照片整体色**：它参与字标与背景之间的对比计算，填错会让文字发灰
- **主体不居中**：中间是品牌大字，居中构图会和文字打架

### 其他页面的背景

`/earth`、`/photography` 等页面**不是照片背景**，是各自 CSS 里的绘制渐变
（`earth-pure.css`、`photography.css` 的 `background` 渐变）。
要改就是改那些 CSS 里的颜色值，或者告诉我你要什么效果。

---

## 三、两条命令速查

```powershell
$PY = "C:\Users\pc\.dsh\dsh-runtimes\dsh-plugin-desktop-primary-runtime\dependencies\python\python.exe"
cd C:\Users\pc\Documents\deepseek-harness\default-workspace\tangyuan-vision

# 预演
& $PY tools\import-photos.py "C:\Users\pc\Pictures\待导入"

# 写入
& $PY tools\import-photos.py "C:\Users\pc\Pictures\待导入" --apply
```

## 四、按文件夹自动分类（人像 / 风光）

脚本会**从子文件夹名读出分类**，所以一次导入就能把两类放好，不用分两批、也不用每次传参数。

支持的文件夹名（中英文都认）：

```
待导入/
├── 人像/          → category: portrait   （也可命名 portrait）
│   ├── P001.jpg
│   └── P002.jpg
├── 风光/          → category: landscape  （也可命名 风景 / landscape）
│   ├── L001.jpg
│   └── L002.jpg
└── 其他直接放根目录的 → 用 --category 的默认值（landscape）
```

或者英文目录名：

```
待导入/
├── portrait/
└── landscape/
```

判定规则是按**文件的相对路径**做包含匹配，所以 `旅行/2026海南/人像/xxx.jpg` 这种多层嵌套也能正确归到 portrait。

验证过：

```
文件 root-01.jpg      分类 landscape   （根目录，默认）
文件 portrait-01.jpg  分类 portrait    （人像/）
文件 landscape-01.jpg 分类 landscape   （风光/）
```

导入命令不变，一条就够：

```powershell
& $PY tools\import-photos.py "C:\Users\pc\Pictures\待导入" --apply
```

之后在后台「摄影作品」里，`category` 字段就是分好类的，可以再手工调整。
