# 内容模型与替换指南

内容全部在 **`src/content/data/*.json`**。用后台改或直接改文件都行 —— 都是同一批文件。

---

## 1. 通用约定

### 文件形态

除 `riding.json` 外，每个集合都是：

```json
{ "items": [ { "id": "...", ... } ] }
```

这是 Decap 根级列表控件的写入形态。`src/content/index.ts` 的 `itemsOf()`
**同时接受**这种形态和裸数组，所以手写不会出问题。

`riding.json` 是**多键**文件：

```json
{
  "motorcycle": { ... },
  "routes": [ ... ],
  "serviceRecords": [ ... ],
  "serviceRecordNote": "..."
}
```

### 可选字段的规则

**没填就不要写这个 key，或者写 `null` / 空字符串。**

页面在字段为空时**整行不渲染**，不会出现空标签。这一点适用于：
`takenAt`、`location`、`camera`、`lens`、`exif`、`distanceKm`、`riddenAt`、
`lat` / `lng`、`repoUrl`、`demoUrl`、`cover`、`thumb`、`tags`、`highlights` 等。

### `provenance` 字段

每个内容记录都有它：

| 值 | 界面表现 |
|---|---|
| `"real"` | 无标记 —— 这是你的真实内容 |
| `"sample"` | 显示 **示例 / SAMPLE** 徽章 |

换成真实内容后请改成 `"real"`。这是内容诚实性的执行机制，
而且它是**在界面上**执行的，不是写在文档里的承诺。

### 校验

改完后运行：

```bash
pnpm typecheck && pnpm dev
```

有问题的记录会在控制台列出文件与路径，同时**页面照常渲染**（坏记录被跳过）。

---

## 2. `brand.json` — 个人品牌

```json
{
  "nickname": "汤圆Vision",
  "brandLatin": "Vision",
      "brandFull": "汤圆Vision",
      "brandGloss": "汤圆视界",
  "logoLine": "CAPTURE MOMENTS",
  "tagline": "记录经过的光，也记录尚未抵达的远方。",
  "taglineEn": "Capture moments. Explore beyond.",
  "statement": "……",
  "statementEn": "……",
  "roles": ["摄影", "摩托车与摩旅", "AI 与编程", "独立创作"],
  "provenance": "sample"
}
```

| 字段 | 用在哪里 |
|---|---|
| `nickname` | 首页大标题下的中文行、页脚、元数据 |
| `latin` | 首页主标题（视觉中心）、Logo 组件 |
| `logoLine` | 细眉标题、页脚 —— **必须与 Logo 图片上的文字一致** |
| `tagline` / `taglineEn` | 首页与随笔页的主标语 |

- **`nickname` 保持昵称即可。** 项目从不要求、也不建议填写真实姓名。
- `location` 在模型里是**可选且默认不填**的。若你要公开所在城市可以填，
  但不要填住址。
- 把 `provenance` 改成 `"real"` 后，示例徽章会消失。**推荐先自己改写
  `statement` 与 `tagline`，再改这个标记** —— 否则等于把示例文案认作自己的话。

---

## 3. `profile.json` — 四条线索

关于我页面的四个板块，每个是一个兴趣方向，**不是成就列表**。

```json
{
  "id": "photography",
  "title": "摄影",
  "titleEn": "Photography",
  "body": "……",
  "note": "……",
  "provenance": "sample"
}
```

`id` 决定窗口图标（`photography` `machine` `ai` `independent`），
也用于主空间窗口的预览绘制。

**`note` 是用于说明"这部分还是示例"的地方。** 内容变成真实的之后可以删掉它。

---

## 4. `photography.json` — 摄影作品

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
  "takenAt": "2026-04-12",
  "location": "某地",
  "camera": "某机身",
  "lens": "某镜头",
  "feature": true,
  "order": 1,
  "provenance": "real"
}
```

| 字段 | 必填 | 说明 |
|---|---|---|
| `id` | ✅ | 唯一，英文小写。用于灯箱定位 |
| `title` | ✅ | 显示在作品阅读器与灯箱 |
| `category` | ✅ | `landscape`（风光）/ `portrait`（人像）/ `other`（未分类、历史值） |
| `src` | ✅ | 原图路径（**不带 base**） |
| `thumb` | | 缩略图。省略则自动用原图 |
| `width` `height` | ✅ | **真实像素尺寸** |
| `description` | ✅ | 灯箱中的描述 |
| `tone` | | 主色调，用于占位背景与灯箱环境色 |
| `takenAt` `location` `camera` `lens` | | **可选。未提供就不显示该行** |
| `feature` | | 保留字段（旧版大幅横向头条排版用）；当前作品集阅读器不再使用 |
| `order` | | 排序权重，小的在前 |

### 三个必须注意的点

1. **`width` / `height` 必须是真的。** 页面用它预留 `aspect-ratio`，
   填错会导致图片加载完成后版面跳动。
2. **不要填推测的拍摄信息。** 没有 EXIF 就不显示这些字段，
   这比填一个看起来合理但错误的信息要好。
3. **`category` 驱动分类浏览。** 风光 / 人像 两个分类 + 全部；未归入这两类的历史作品
   作为「未分类」仍显示在「全部」中。人像为空时显示诚实空态，不生成假作品。

---

## 5. `riding.json` — 摩旅与骑行

### 车辆

```json
"motorcycle": {
  "model": "无极 250RR",
  "modelEn": "Wuji 250RR",
  "confirmedDetails": [
    { "label": "车型", "value": "无极 250RR" }
  ],
  "pendingDetails": ["年份与具体版本", "累计里程", "……"],
  "note": "……",
  "provenance": "real"
}
```

- `confirmedDetails` 是**已确认**的参数，逐条显示。
- `pendingDetails` 会渲染成一个"待补充"清单 —— 这是**有意的设计**。
  把没确认的信息写进 `confirmedDetails` 就等于在撒谎；
  放在 `pendingDetails` 里则是诚实地说明"还没填"。

### 路线

```json
{
  "id": "route-01",
  "name": "路线名称",
  "origin": "出发地",
  "destination": "目的地",
  "distanceKm": 320,
  "riddenAt": "2026-05-03",
  "status": "ridden",
  "summary": "……",
  "stops": [
    { "name": "点位名", "lat": 30.1234, "lng": 120.5678, "note": "备注" }
  ],
  "highlights": ["……"],
  "provenance": "real"
}
```

- **`status: "ridden"` 只有在真的骑完之后才改。** 界面用不同的徽章与
  不同的左边缘样式区分"已完成"与"计划中"，示例数据一律是 `planned`。
- `distanceKm` / `riddenAt` 未完成时**留空**。留空会显示"尚未骑行"，
  而不是一个编造的数字。
- `lat` / `lng` **不要编造**。没有坐标的点位不会出现在示意图上，
  页面会明确说明"这些点位没有坐标"。
- 示意路线图是**本地数据绘制的 SVG**，不依赖任何地图 API。
  没有地图服务也不会影响页面运行。

### 维护记录

`serviceRecords` 默认为**空数组**，页面显示空状态提示。
这是刻意的：伪造的保养记录是关于一台真实机器的真实谎言。

---

## 6. `lab.json` — 实验记录

```json
{
  "id": "lab-001",
  "title": "标题",
  "titleEn": "Latin title",
  "date": "2026-01-02",
  "question": "在问什么",
  "approach": "怎么做的",
  "outcome": "结论是什么",
  "tools": ["Vite", "sharp"],
  "provenance": "real"
}
```

结构是 **问题 → 方法 → 结论**。这个结构是刻意的：它逼着"结论"字段被填写，
**哪怕结论是"这个方案不行"** —— 那恰恰是大多数项目页面会悄悄省略的部分。

按 `date` 倒序排列。`tools` 会在页面底部汇总成工具清单。

> 页面上**没有**伪造的模型状态、滚动日志或推理延迟。
> 日志面板是最容易造假的界面元素，所以本项目不提供它。
> 唯一的交互演示是"材质实验台"，它演示的是本项目**真实存在**的玻璃材质，
> 参数改动直接作用在真实的 DOM 上，并且能把浏览器实际解析出的计算值读回来核对。

---

## 7. `projects.json` — 个人项目

```json
{
  "id": "my-project",
  "name": "项目名称",
  "nameEn": "Project",
  "status": "shipped",
  "summary": "简介",
  "detail": "详情",
  "stack": ["React", "TypeScript"],
  "cover": "/assets/photography/cover.jpg",
  "repoUrl": null,
  "demoUrl": null,
  "highlights": ["……"],
  "order": 1,
  "provenance": "real"
}
```

- `status`：`shipped` / `building` / `exploring` / `paused`。
- **`repoUrl` / `demoUrl` 没有就保持 `null`。** 页面会显示
  「待填写 / TBD」标记，而**不会**生成一个看起来合理但打不开的地址。
  这是明确要求。
- `cover` 省略时，页面绘制一个"预留位"图形，而不是塞一张无关的图。

---

## 8. `journal.json` — 随笔

```json
{
  "id": "journal-001",
  "title": "标题",
  "titleEn": "Latin title",
  "kind": "essay",
  "excerpt": "摘要",
  "body": ["第一段", "第二段"],
  "tags": ["随笔"],
  "date": "2026-01-01",
  "provenance": "real"
}
```

- `kind`：`essay` / `note` / `log`。`essay` 使用首字下沉的排版。
- `body` 是**段落数组**，不是一整段文本。第一段会得到首字下沉处理。
- `date` 参与列表排序。

---

## 9. `contact.json` — 联系方式

```json
{
  "channels": [
    {
      "id": "email",
      "label": "电子邮箱",
      "labelEn": "Email",
      "handle": "you@example.com",
      "url": null,
      "confirmed": true,
      "note": "……"
    }
  ],
  "privacyNote": "……",
  "formNote": "……"
}
```

- **`confirmed: false` 的渠道会列在「尚未提供」面板里**，
  并显示其 `note` 说明为什么是空的。
- `handle` 用于显示与"复制"按钮；`url` 用于外部链接按钮。
  两者可以只填一个。
- 邮箱填了之后，页面会出现 `mailto:` 按钮，并预填主题。
  这个链接**不经过任何服务器**，不需要后端。

### 关于留言表单

**没有表单，这是设计决定。**

纯静态站点没有接收表单的接口。显示一个"提交成功"的提示就是撒谎。
页面上直接说明了原因，并指出如果确实需要，可以接入免费的第三方表单服务
（Formspree、Getform 等）。

---

## 9.5 `travels.json` — 地球与旅行（P1 新增 CMS 集合）

CMS 集合：`地球与旅行 → 旅行记录`（file 集合，根级 `items` 列表）。
字段与 `src/features/earth/regions.ts` 的 `RegionTravel` 一致：

| 字段 | 类型 | 说明 |
|---|---|---|
| `regionId` | string | ISO 3166-1 数字代码，如 `"156"` |
| `status` | enum | `visited` / `planned` / `unrecorded` |
| `label` | string? | 中文名称覆盖 |
| `title` | string? | 旅行名称 |
| `visitedAt` | string? | `YYYY-MM-DD`，仅真实到访才填 |
| `story` | string? | 正文 |
| `photoIds` | string[] | 引用 `photography.json` 的作品 id |
| `latitude` / `longitude` | number? | 仅记录了具体地点时才填 |
| `published` | boolean | 是否公开显示 |

**没有真实记录就保持空列表。** 文件里的 `notes` 键是说明文字，不在 CMS schema 内，
Decap 保存时会原样保留（P0 实测）。
## 10. `settings.json` — 网站设置

```json
{
  "siteTitle": "汤圆Vision",
  "siteTitleSuffix": "汤圆Vision",
  "siteDescription": "用于搜索引擎与分享预览的描述",
  "themeColor": "#05070A",
  "ogImage": "/assets/brand/logo-light.png",
  "homeScene": "home",
  "secretEnabled": true,
  "bootEnabled": true,
  "locale": "zh-CN",
  "keywords": ["……"]
}
```

| 字段 | 作用 |
|---|---|
| `siteTitleSuffix` | 浏览器标签标题后缀（`页面名 · 后缀`） |
| `siteDescription` | 静态 HTML 外壳的 meta description —— **构建时注入**，所以改了要重新构建 |
| `themeColor` | 既是 meta theme-color，也是 HTML 外壳的初始背景色（防白屏闪烁） |
| `ogImage` | 分享预览图 |
| `secretEnabled` | `false` 时首页不再渲染隐藏入口（路由本身仍存在） |
| `bootEnabled` | `false` 时完全跳过启动动画 |

> `themeColor` 在 `index.html` 的内联样式中也用到（防止慢网络下先闪白屏），
> 由构建时替换。改完记得 `pnpm build`。

---

## 11. `secret.json` — 隐藏空间

```json
{
  "title": "静默空间",
  "titleEn": "THE QUIET SPACE",
  "phrase": "explore",
  "manifesto": ["第一句", "第二句"],
  "artifacts": [
    { "id": "a1", "label": "名称", "body": "说明", "state": "unwritten" }
  ]
}
```

- `phrase` 是**站内连续输入**的口令（默认 `explore`）。
  输入框获得焦点时该监听器会让位，所以不会打断打字。
- `state`：`unwritten`（显示"尚未写下"）或 `ready`。
  这两态驱动不同的边框样式 —— 未写下的格子用虚线框。
- 进入方式有三种，都支持键盘：主空间的暗点按钮、`Shift+V`、输入口令。
- 退出方式有四种：`Esc`、顶部按钮、走廊区域的两个按钮、页脚完整索引。
- 这个页面带 `noindex`。被索引的隐藏页面就不再是隐藏的了。

---

## 12. 替换素材文件

| 素材 | 目录 | 说明 |
|---|---|---|
| Logo | `public/assets/brand/` | 见 README 的「替换 Logo」一节 |
| 摄影图 | `public/assets/photography/` | 原图 + `@thumb.jpg` 缩略图 |
| 音频 | `public/assets/audio/` | `ambient.m4a` 优先，`ambient.wav` 回退 |
| CMS 上传 | `public/assets/uploads/` | 后台自动写入 |

**路径写进内容文件时不带 base**（`/assets/photography/a.jpg`），
运行时由 `assetUrl()` 拼接部署前缀。

---

## 13. 自检清单

替换内容后过一遍：

- [ ] `pnpm typecheck` 无错误
- [ ] `pnpm dev` 控制台没有 `[content]` 开头的警告
- [ ] 每个专题页都打开一次，确认没有空标签、没有破图
- [ ] 摄影页的分类筛选按钮计数正确
- [ ] 灯箱能打开、能左右键切换、能 `Esc` 关闭
- [ ] 换成真实内容后 `provenance` 已改为 `real`，示例徽章已消失
- [ ] 没有填入任何推测的日期、里程、坐标、设备或 EXIF
- [ ] 未提供的链接仍然是「待填写」，没有变成假地址

### L. P4 CMS 旅行记录录入体验（2026-10-13，实测）

**照片在哪里上传**：`photography` 集合（「摄影作品」，file 集合）的每个作品条目里，`src`（原图）与
`thumb`（缩略图）都是 `widget: image`；上传落到 `media_folder: public/assets/uploads`，对外路径
`public_folder: /assets/uploads`，与前台 `assetUrl()` 一致（实测：媒体库上传后 `/assets/uploads/<file>` 返回 200）。

**旅行记录如何关联作品**：`travels.photoIds` 是字符串列表，值必须等于作品条目「唯一标识（id）」字段，
例如 `sample-ridge-01`；前台 `toPhoto()` 以显式 `id` 为键，地球面板用 `PHOTOS.find(p => p.id === id)`
解析缩略图。**不是 slug，也不是文件名**。

**relation widget 实测结论**：把 `photoIds` 临时改为 `widget: relation, collection: photography` 后，
配置能通过校验，但**不产生任何可选项**（DOM 中无选项节点）——因为 `photography` 是 **file 集合**，
relation 只对 folder 集合可用。故回滚为 list，并采用最小可靠替代：把指引写进**可见位置**
（有记录时字段 hint 可见；无记录时集合描述可见）。

**指引落点（实测可见）**：
- 摄影作品集合描述：「照片在这里上传…每张作品必须有一个「唯一标识」id…旅行记录的 photoIds 引用的就是这个 id」。
- 作品 `id` 字段 hint：「旅行记录的 photoIds 引用这个值…定好之后不要改」。
- 旅行记录集合描述（无记录时也可见）：「照片不在这个集合上传…先用 photoIds 引用那个 id」。
- `photoIds` 字段 hint（有记录时可见）：完整指引 + 当前 11 个作品 id 示例。

**本次真实验证**：媒体库上传真实图片成功（字节一致、路径可达）；旅行记录→面板缩略图链路此前已用
真实作品 id（sample-ridge-01）验证。**测试上传产物已删除**，`photography.json` / `travels.json`
`git diff` 均为空，零残留。