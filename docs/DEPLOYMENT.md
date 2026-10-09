# 部署与深层链接

本文只讲部署。内容维护见 [CONTENT.md](CONTENT.md)，后台配置见 [CMS.md](CMS.md)。

---

## 1. 一次性配置

1. 把仓库推送到 GitHub。
2. **Settings → Pages → Build and deployment → Source = `GitHub Actions`**
   - **不要**选分支。工作流上传 artifact，不推 `gh-pages` 分支。
3. 如果默认分支不是 `main`，修改 `.github/workflows/deploy.yml` 的
   `on.push.branches`。
4. 之后每次推送到该分支都会自动构建 + 部署。

工作流会依次执行：安装 → 类型检查 → ESLint → 构建 → **校验 `dist/404.html`
存在** → 上传 artifact → 部署。

> 类型检查或 lint 失败会**中断部署**。这是刻意的：发布一个坏构建比不发布更糟。

---

## 2. base 路径是怎么解析的

`vite.config.ts` 的 `resolveBasePath()` 按顺序：

| 顺序 | 来源 | 例子 |
|---|---|---|
| 1 | `VITE_BASE_PATH` 环境变量 | `/my-site/` |
| 2 | `GITHUB_REPOSITORY`（Actions 自动注入） | `owner/TangyuanVision` → `/TangyuanVision/` |
| 3 | 兜底 | `/` |

用户 / 组织站点（`owner.github.io`）会被自动识别并解析为 `/`。

### 三条铁律

1. **代码里不要硬编码前导 `/` 的资源路径。**
   一律走 `assetUrl()`：

   ```ts
   import { assetUrl } from '@/lib/asset';
   <img src={assetUrl('/assets/photography/a.jpg')} />
   ```

   内容文件里的路径**不带 base**（`/assets/photography/a.jpg`），
   `assetUrl()` 负责拼接。

2. **不要加 `<base>` 标签。** 它会破坏相对 hash 链接，也会干扰深层链接回退。

3. **`index.html` 里用相对路径引用 favicon**（本项目用 `./favicon.png`），
   这样在子路径与根路径下都正确。

---

## 3. 深层链接：为什么需要，以及怎么做

### 问题

GitHub Pages 是静态文件主机，**没有重写规则**。请求 `/repo/photography`
找不到对应文件，主机返回**它自己的 404 页面**。于是任何深层链接、任何刷新、
任何直接访问，都会看到 GitHub 的 404，而不是应用。

### 解决办法（两半缺一不可）

**第一半 —— `public/404.html`**

捕获主机级 404，把路径改写成查询形式后跳回入口：

```
/repo/photography   →   /repo/?/photography
/repo/journal?a=1   →   /repo/?/journal&a=1
```

**第二半 —— `src/lib/deepLink.ts`**

在 React Router 创建**之前**读取这个查询形式，
用 `history.replaceState` 还原成干净路径。

因此地址栏里显示的是 **`/photography`**，不是 `#/photography`。
这也是本项目选择 `BrowserRouter` 而不是 `HashRouter` 的原因。

### 一个常见的坑

网上广泛流传的写法是：

```js
var l = seg[0].slice(1);
location.replace(location.origin + l + '?/&' + seg[1].slice(1));
```

它**假设站点部署在域名根路径**。在项目子路径（GitHub Pages 最常见的形态
`https://owner.github.io/repo/…`）下，`location.origin + l` 会丢掉 `/repo/`
前缀，把浏览器送到一个不存在的路径 —— 结果就是**404 死循环**。

本项目的 `404.html` 从**自身脚本的 URL**推导 base，因此三种部署形态都正确：

- `https://owner.github.io/repo/<deep>`
- `https://owner.github.io/<deep>`（用户站点）
- `https://自定义域名/<deep>`

---

## 4. 部署后自检

按顺序做一遍：

```bash
# 1. 构建产物是否完整
ls dist/404.html dist/index.html dist/admin/index.html

# 2. 用与生产一致的方式本地验证子路径部署
VITE_BASE_PATH=/TangyuanVision/ pnpm build
pnpm preview
# 然后访问 http://127.0.0.1:4183/TangyuanVision/photography
# 并刷新页面 —— 不应出现 404
```

线上检查：

1. 打开首页，确认 Logo、摄影图、字体全部加载（无 404）。
2. **打开 `/photography` 后按 F5**——应停留在摄影页。
3. **打开 `/the-quiet-space` 后按 F5**——应停留在隐藏空间。
4. 按浏览器后退键两次——应正确回到上一层，而不是离开站点。
5. 访问一个不存在的路径 `/foo`——应看到站内的 404 页面（不是 GitHub 的）。
6. 访问 `/photography?diag=1`，在 devtools 里查找
   `<script id="tv-diagnostics">`，确认 `errors` 数组为空。

---

## 5. 故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| 白屏，控制台报资源 404 | `base` 解析错误 | 看构建日志里 `GITHUB_REPOSITORY`；或显式设置 `VITE_BASE_PATH` |
| 刷新子页显示 GitHub 404 | `dist/404.html` 没发布，或 Pages 没设成 `GitHub Actions` | 检查 Pages 设置与 artifact 内容 |
| 资源路径看着对但 404 | 代码里硬编码了 `/assets/...` | 改用 `assetUrl()` |
| 部署成功但页面没更新 | Actions 未触发 / 浏览器缓存 | 查 Actions 运行记录；硬刷新 |
| 样式正常，功能异常 | 运行时错误 | 访问 `?diag=1` 读错误清单 |
| 折射效果在 Firefox 上不生效 | `url()` 在 backdrop-filter 中不可靠 | **这是预期的**，已自动降级为更重的模糊 |
| 移动端没有自定义光标 | 设计如此 | 触屏设备使用系统光标 |

### 回滚

Pages 的部署是不可变的 artifact。要回滚，revert 对应提交并推送，
Actions 会重新构建并发布。
或用 `workflow_dispatch` 在旧提交上手动触发。

---

## 6. 自定义域名

1. 在仓库 `public/` 下放 `CNAME` 文件，内容为你的域名（Vite 会原样复制）。
2. 在 DNS 配置 `CNAME` 记录指向 `owner.github.io`。
3. **Settings → Pages → Custom domain** 填入域名并启用 HTTPS。
4. 因为站点现在在域名根路径，`base` 会通过第 3 条规则解析为 `/`——
   不需要改代码，也不需要设 `VITE_BASE_PATH`。

---

## 7. 关于 SEO 的如实说明

这是纯客户端渲染的 SPA。

- **静态外壳**带站点级的 `title`、`description`、`theme-color`、Open Graph、
  Twitter Card。这些由 `vite.config.ts` 的 `htmlMetaPlugin` 在构建时从
  `src/content/data/settings.json` 注入。
- **逐路由元数据**由 `src/components/../useDocumentTitle` 在运行时写入，
  包括 canonical URL 与 `noindex`（隐藏空间必须不被索引）。

**限制**：不执行 JavaScript 的爬虫只能看到站点级元数据，看不到每个专题的
独立标题与描述。这是 SPA 的固有代价。

项目**没有**用预渲染 / SSR 来掩盖这一点，也没有伪造 `sitemap.xml` 里的
逐页内容。若这个限制对你不利，可行方向是：

- 接入预渲染（例如 `vite-plugin-prerender`），为 7 个专题生成静态 HTML；

这需要额外的构建步骤，且会让路由架构复杂化，因此没有默认启用。
