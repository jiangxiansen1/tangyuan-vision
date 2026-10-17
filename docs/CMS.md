# 内容管理（Decap CMS）

---

## 1. 结论先说

| 问题 | 答案 |
|---|---|
| 用的是真 CMS 吗？ | 是。**Decap CMS**，MIT 许可，仍在维护，基于 Git 工作流 |
| 需要付费吗？ | 不需要。软件免费，**本地后端零配置**；线上后端用免费额度的中转服务 |
| 需要自己的服务器吗？ | 不需要。后台是静态文件，挂在 `/admin/` |
| 需要数据库吗？ | 不需要。内容就是仓库里的 JSON，Git 提交即历史 |
| 现在能用吗？ | **能，用本地代理后端**（`proxy` + `local_backend`）。见第 3 节 |
| 线上能登录吗？ | **需要你手动配一次 OAuth 中转**。见第 4 节 |
| 配好之前站点能用吗？ | 完全可用。公开站点从不依赖后台在线 |

---

## 2. 为什么后台不能自己完成登录

这是**协议层面的限制**，不是本项目没做。

GitHub 的 OAuth 授权码流程需要两步：

1. 浏览器把用户送到 GitHub 授权页，带 `client_id`；
2. 拿回 `code` 后，**用 `client_id` + `client_secret` 换取 access token**。

第 2 步必须在一个**能保守秘密的地方**完成。GitHub Pages 只提供静态文件，
不运行任何服务端代码，所以它做不了第 2 步。而 `client_secret` 一旦写进
前端代码或 `VITE_*` 环境变量就等于公开 —— `VITE_*` 是**构建时内联进
产物**的，任何访客都能在 bundle 里读到。

**因此必须有一个 OAuth 中转（relay）来保守这个秘密。**

> 本项目**没有**把 token 写进任何前端文件，**没有**把 `VITE_*` 当成安全存储，
> 也**没有**伪造一个本地登录状态来假装认证已经实现。

---

## 3. 方案 A · 本地代理后端（现在就能用，2026-10-11 实测）

后台默认配置（P1 修复后）：

```yaml
# public/admin/config.yml
local_backend: true          # localhost 上一律走 decap-server 代理
backend:
  name: proxy                # 注意：不是 local！
  proxy_url: http://localhost:8081/api/v1
```

**为什么不是 `local`**：任何 decap-cms 版本（实测 3.8.4→latest）都没有注册名为
`local` 的后端，旧配置会在后台直接报 "Backend not found: local"。官方本地代理的
后端名是 `proxy`（见 https://decapcms.org/docs/decap-proxy/ ）。
`local_backend: true` 的作用是**环境边界**：在 localhost/127.0.0.1 上强制走代理，
与 `backend` 的取值无关——将来把 `backend` 换成线上 github 后端时本地流程不变。

用法：

```bash
# 终端 1（pnpm 版本不一致时可直接用 node_modules\.bin\decap-server.CMD）
pnpm cms          # 启动 decap-server，默认代理 http://localhost:8081

# 终端 2
pnpm dev
```

打开 `http://127.0.0.1:5183/admin/index.html`，即可增删改内容。
**注意**：开发服务器上 `/admin/` 会被 SPA fallback 抢占渲染成站内 404，
必须带 `index.html`；生产静态主机上 `/admin/` 目录索引正常，两种地址都可用。
保存会**直接写入你的工作副本**，然后你像平常一样 `git commit && git push`。
发布按钮是两级菜单：`发布` → `立即发布`。

**特点：**

- ✅ 零配置、零成本、无需 GitHub App
- ✅ 是**真实**的内容工作流 —— 写的是与线上完全相同的文件
- ⚠️ 只能在本机使用（这是本地代理，不是线上服务）

---

## 4. 方案 B · GitHub 后端（线上编辑）

线上编辑需要一个 OAuth 中转。以下三种都是**免费且可维护**的。

> **照着做就行的手册：[`docs/CMS-OAUTH-SETUP.md`](./CMS-OAUTH-SETUP.md)**
> 那一份是本仓库专用的逐步操作手序：确切的仓库名/分支（`master`）、
> `ALLOWED_DOMAINS` 的取值、callback URL 的准确格式、每个环境变量的名字，
> 以及七种常见失败的对照表。本节只做方案对比，逐步操作看那一份。

### 选项 1 · Cloudflare Workers + sveltia-cms-auth（推荐）

免费额度对个人站点绰绰有余，冷启动快。

1. 在 Cloudflare Workers 部署开源的 `sveltia-cms-auth`
   （仓库：`sveltia/sveltia-cms-auth`，MIT）。
2. 记下 Worker 地址，例如 `https://tv-oauth.你的子域.workers.dev`。
3. **创建一个 GitHub OAuth App**：
   - GitHub → Settings → Developer settings → **OAuth Apps** → New OAuth App
   - **Homepage URL**：`https://你的用户名.github.io/你的仓库名/`
   - **Authorization callback URL**：`https://tv-oauth.你的子域.workers.dev/callback`
4. 把 OAuth App 的 `Client ID` 与 `Client Secret` 填进 Worker 的环境变量。
5. 修改 `public/admin/config.yml`：

```yaml
backend:
  name: github
  repo: 你的用户名/你的仓库名
  branch: main
  base_url: https://tv-oauth.你的子域.workers.dev
  auth_endpoint: auth
```

6. 提交并等待部署完成。

### 选项 2 · Netlify Identity + Git Gateway

Netlify 自家托管的认证，不需要自己写任何服务端代码。

1. 把仓库连到 Netlify（免费计划即可，**不需要**用 Netlify 托管站点）。
2. 在 Netlify 站点启用 **Identity**，把注册方式设为 **Invite only**。
3. 启用 **Git Gateway**。
4. 邀请你自己的邮箱。
5. 配置：

```yaml
backend:
  name: git-gateway
  branch: main
```

6. 站点仍然部署在 GitHub Pages 上 —— Netlify 只提供认证。

### 选项 3 · Vercel / Netlify Function 跑社区版 OAuth provider

与选项 1 等价，只是把中转换成 Serverless Function。
适合已有 Vercel / Netlify 账号的情况。

### 权限范围（最小权限原则）

OAuth App 需要的 scope 只有：

- **`repo`** —— 读写仓库内容。Decap 需要提交到你指定的仓库。

**不要**授予 `admin:*`、`delete_repo`、`workflow` 等不相关权限。
中转服务只应请求 `repo`。

---

## 5. 如果没有完成第 4 节会怎样

`/admin/` 依然可以打开，但会显示一个**明确的说明页**：当前后端是 `local`，
只能在本地使用，并列出要改成 `github` 需要做什么。

它**不会**显示一个无法成功的登录表单。一个点了没反应的登录按钮，
比一段说明更糟。

如果 Decap 的 CDN 脚本加载失败（离线、CSP 拦截），6 秒后会显示同样的说明，
而不是让页面永远转圈。

---

## 6. 后台能管理什么

字段与 `src/content/types.ts` **一一对应**。后台保存的值立刻就是类型化的值。

| 集合 | 文件 | 关键字段 |
|---|---|---|
| 个人品牌 | `brand.json` | 昵称、英文标识(brandLatin)、品牌全称(brandFull)、中文释义(brandGloss)、Logo 文字、标语、**宣言(statement)** |
| 四条线索 | `profile.json` | 列表：标识 / 标题 / 正文 / 补充说明 |
| 摄影作品 | `photography.json` | 图片、分类、尺寸、主色调、可选的拍摄信息 |
| 摩旅与骑行 | `riding.json` | 车辆档案、路线（含点位坐标）、维护记录 |
| AI 与编程 | `lab.json` | 问题 / 方法 / **结论**（强制填写） |
| 个人项目 | `projects.json` | 状态、技术栈、封面、仓库与演示地址 |
| 随笔 | `journal.json` | 类型、摘要、段落列表、标签 |
| 地球与旅行 | `travels.json` | regionId/status/title/visitedAt/story/photoIds/经纬度/是否公开（P1 新增集合；`notes` 说明键不在 schema 内，保存时原样保留） |
| 联系方式 | `contact.json` | 渠道、账号、链接、是否公开 |
| 网站设置 | `settings.json` | 标题、描述、主题色、分享图、开关 |
| 隐藏空间 | `secret.json` | 标题、输入口令、宣言、留给以后的位置 |

### 每个列表都有「内容来源」字段

`real` / `sample`。选 `sample` 时页面上会出现 **示例 / SAMPLE** 标记。
把内容换成真实的之后，记得改成 `real`。

---

## 7. 数据格式的一个细节

Decap 的根级列表控件写入的是：

```json
{ "items": [ { … }, { … } ] }
```

而 `riding.json` 是**多键文件**（`motorcycle` / `routes` / `serviceRecords` /
`serviceRecordNote` 平级）。Decap 按 key 合并保存，**它不认识的 key 会原样保留**，
所以三个入口写在同一个文件里是安全的。

`src/content/index.ts` 的 `itemsOf()` **同时接受**包裹形态和裸数组。
这样手工编辑不会静默清空页面。

---

## 8. 如实说明的限制

| 事项 | 实情 |
|---|---|
| 草稿 / 发布双态 | Decap 内置的是 `editorial_workflow`，它需要 GitHub 后端并产生 PR 流程。本项目用 `publish_mode: simple`（直接写入），**没有**做成看起来像有草稿功能的假界面 |
| 删除图片文件 | CMS 里删除条目只是从数组移除，`public/assets/uploads/` 里的文件仍在。需要手动清理。**这一点没有被自动化** |
| 字段校验 | 后台只做**结构性**校验（必填、类型、选项）。跨字段的语义规则（例如"计划中的路线不应带日期"）由构建期兜底 |
| 图片处理 | CMS 上传原图到 `public/assets/uploads/`，**不生成多尺寸**。需要 `srcset` 时要自己加构建步骤 |

---

## 9. 不经过后台也能改

内容就是普通 JSON。用编辑器直接改 `src/content/data/*.json` 完全可以 ——
**这和 CMS 写入的是同一批文件**。

改完运行：

```bash
pnpm typecheck && pnpm build
```

如果某条记录有问题，开发模式的控制台会打印文件与路径：

```
[content] 1 content problem(s) detected. The site still renders; fix these in src/content/data/ …
  • photography.json → [3]: missing "src"
```

**页面照常渲染**：坏记录被跳过并上报，不会让整个板块白屏。
这是 `src/content/index.ts` 的运行时校验在做的事。
