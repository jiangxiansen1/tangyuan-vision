# CONTENT_GUIDE.md — 内容维护指南

> 目标：**不修改任何 React 组件**，就能更换背景、替换品牌素材、增删摄影作品、
> 编辑宣言与介绍、管理旅行档案、增删 Lab 与 Projects、填写联系方式。
> 内容全部来自 `src/content/data/*.json`，由 Decap CMS 写入。本文件如实描述现状（2026-10-15）。

---

## 0. 两种改法，效果相同

- **A. 后台（推荐给所有人）**：`pnpm cms`（本地后端）+ `pnpm dev`，浏览器打开
  `http://localhost:5173/admin/index.html`。改完即写入工作副本的 JSON。
- **B. 直接改 JSON**：编辑 `src/content/data/*.json`。与 A 等价。

两种方式改完都请运行 `pnpm typecheck && pnpm build`。

> **线上后台状态**：`public/admin/config.yml` 当前是 `local_backend` + `proxy` 后端，
> **线上 OAuth 尚未配置**，因此线上的 `/admin` 暂时不能写回仓库。配置方法见 `docs/CMS.md` 第 4 节。

---

## 1. 换首页背景图

- 字段：`src/content/data/settings.json` → `homeBackground`。
- 步骤：把你的图片放进 `public/assets/photography/`，把 `homeBackground.src` 改成
  `/assets/photography/<文件名>`，可调 `overlay`（深色遮罩 0.55–0.75 较稳），
  并把 `provenance` 从 `sample` 改成 `real`。
- 未填写/加载失败时回退为程序绘制的渐变场景，**不会破图**。

## 2. 替换品牌素材 / Logo

- 原始素材：`C:\Users\pc\Pictures\水印白.jpg`（2508×1672，无 alpha）。
- 派生资源在 `public/assets/brand/`（`logo-light.png` 为主，另有 raw / dark / mark /
  wordmark / mask）。重新生成：`pnpm assets:brand`（脚本 `tools/build-brand-assets.cjs`）。
- 入场动画使用 `logo-mask-light.png` 蒙版；资源缺失时 `BootSequence` 回退到文字锁定，不会卡死。
- 若你有真实的黑色版本（`水印黑.png`），用它替换派生的 dark 版本。

## 3. 摄影作品与分类（`photography.json`）

- 文件：`src/content/data/photography.json` → `items[]`。每条字段：
  `id, title, category, src, thumb, width, height, description, tone, feature?, order, provenance`，
  可选 `takenAt, location, camera, lens`。
- 分类：当前真实分类是 `landscape`（风光）与 `portrait`（人像）。分类标签由
  `PHOTO_CATEGORY_LABELS` 映射；归入其它 `category` 的作品会落入「未分类」，仍出现在「全部」里，
  **不会被静默丢弃**。
- 加一张照片：
  1. 把原图放 `public/assets/photography/`，生成缩略图放同目录（命名如 `xxx@thumb.jpg`）。
  2. 在 `items[]` 里加一条，填 `src` / `thumb` / `width` / `height`（用于避免布局跳动）。
  3. 有真实拍摄信息就填 `takenAt/location/camera/lens`；**没有就留空**，界面不会编造。
  4. 真实作品把 `provenance` 设为 `real`（当前是示例图，标记为 `sample`，前台会显示
     「示例图像，不是真实作品」提示）。
- 推荐格式：原图 JPEG/WebP、长边 2000–2560；缩略图长边 ~1200、质量 75。
- **不要在首屏一次性加载全部原图**：列表与缩略图轨使用 `thumb`。

## 4. 编辑个人宣言与个人介绍

- **个人宣言**：`src/content/data/brand.json` → `statement`。
  > ⚠️ 硬性要求：宣言**必须**能在 CMS 后台改，不允许改成源码常量。
  > 当前值是 `你这一生太安静   该出发了`（占位/示例内容，可自行替换）。
- 品牌副标题 / 标语：`brand.json` → `tagline`、`statementEn`、`taglineEn`、
  `brandFull`、`brandGloss`、`roles`。
- 个人介绍分组：`src/content/data/profile.json` → `items[]`（标题 + 正文 + 备注 + `provenance`）。

## 5. 人生经历 / 想法记录

- 经历类内容与随笔分别由 `profile.json` / `journal.json` 驱动（结构见文件）。
- **没有真实内容时显示空状态**——请只填写真实的经历，不要编造履历、成就或观点。
- 旧字段升级时保持向后兼容：`src/content/index.ts` 的运行时校验会把缺字段的记录降级读取，
  不会让页面白屏。

## 6. 旅行档案（`travels.json`）

- 文件：`src/content/data/travels.json`（当前 **0 条**）。
- 每条记录建议字段：`regionId`（对应 `GeoIndex` 的 ISO 数字 id）、`status`
  （`visited` / `planned`）、`label`、`title`、`visitedAt`、`story`、`photoIds`、
  可选 `latitude` / `longitude`。
- **地理事实与个人经历是两套数据**：省界来自 Natural Earth，旅行记录来自这里。
  选中一个行政区**不代表**到访。没有记录的地区在地球面板里如实显示「暂无旅行记录」。
- 在 `travels.json` 里出现的真实坐标/日期，会在地球上生成真实标记。

## 7. Lab（`lab.json`）与 Projects（`projects.json`）

- Lab：`lab.json` 定义分组与条目。没有真实内容的实验请留空或用明确「未开放」状态，
  **不要伪造"已成功运行"**。
- Projects：`projects.json` → `items[]`，字段含 `name, nameEn, status, summary, detail,
  stack[], repoUrl, demoUrl, cover, order, provenance`。
  - **真实存在的仓库**才填 `repoUrl`（真实 GitHub 地址）；没有就留 `null`，页面显示「待填写」，
    **不会生成不存在的 URL**。
  - 增加项目只需在 `items[]` 加一条，不用复制组件代码。

## 8. 联系方式（只允许三个：抖音 / 邮箱 / GitHub）

- 文件：`src/content/data/contact.json` → `channels[]`。当前恰好三项：
  `douyin`（抖音）、`email`（邮箱）、`github`（GitHub）。
- 填法（对每一项）：
  - 邮箱：`handle` 填邮箱地址（如 `name@example.com`），`confirmed: true`。前台会生成
    正确的 `mailto:` 链接（带预填主题）。
  - 抖音：`url` 填真实主页链接（如 `https://www.douyin.com/user/xxxx`），`confirmed: true`。
  - GitHub：`url` 填 `https://github.com/<用户名>`，`confirmed: true`。
- **未填写时**：前台显示「待填写」，**不会**伪造账号，也不会给 `#` 之类的假链接。
- `privacyNote` / `formNote` 也在此文件里编辑。
- **禁止**新增微信 / QQ / 电话 / 微博 / 二维码等其它渠道。

## 9. 隐藏空间与彩蛋

- 隐藏空间「静默空间」：`src/content/data/secret.json`（口令 `phrase`、宣言、入口提示）。
- 视频彩蛋（如启用）：预留 `public/media/easter-egg.mp4`；**文件未提供前不生成假视频**，
  覆盖层显示「尚未放入影片」的诚实状态。

## 10. 哪些走 CMS / 哪些是资源文件

| 内容 | 位置 | 维护方式 |
|---|---|---|
| 照片、分类、旅行、宣言、介绍、经历、想法、Lab、Projects、联系方式、网站设置 | `src/content/data/*.json` | **Decap CMS**（或手改 JSON） |
| 背景图 / 照片原图与缩略图 | `public/assets/photography/` | 放文件 + 在 JSON 里引用路径 |
| 品牌 Logo / 蒙版 | `public/assets/brand/` | `pnpm assets:brand` 生成 |
| 地球贴图 / 省级分块 | `public/assets/earth/` | 数据脚本生成（见 `docs/DATA_SOURCES.md`） |

> 图片路径请用**以 `/assets/...` 开头的基路径相对写法**（构建期会拼上 GitHub Pages 的 `base`）。
