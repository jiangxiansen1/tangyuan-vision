# Decap CMS 线上登录：逐步搭建手册

本文是把 `/admin/` 从「只能本地编辑」变成「线上能登录、能保存」的**完整操作手序**。
背景与设计取舍见 `docs/CMS.md`；本文只写**照着做就能完成**的步骤。

---

## 0. 先说清楚：为什么必须有中转

GitHub Pages 是纯静态主机，没有任何服务端代码。OAuth 授权码换访问令牌这一步
**必须带 client secret**，而 client secret 不能出现在静态站点里（`config.yml` 是公开文件）。
所以需要一个能保存秘密的小服务来完成交换。这个服务只做一件事：把 `code` 换成 `token`，
不接触你的内容，也不存储任何东西。

本仓库选定：**Cloudflare Workers + `sveltia/sveltia-cms-auth`**（开源、免费计划够用、无需信用卡即可起步）。

---

## 1. 本仓库的确切事实（照抄，不要猜）

| 项 | 值 |
| --- | --- |
| 仓库 | `jiangxiansen1/tangyuan-vision` |
| **分支** | **`master`** ← 不是 `main`，配置里写错会一直报 404 |
| 站点 | `https://jiangxiansen1.github.io/tangyuan-vision/` |
| 后台 | `https://jiangxiansen1.github.io/tangyuan-vision/admin/` |
| Pages 根域名 | `jiangxiansen1.github.io` ← 后面配 `ALLOWED_DOMAINS` 用 |
| 当前后端 | `backend: proxy` + `local_backend: true`（**只有本地能用**） |

---

## 2. 步骤一：把 OAuth 中转部署到 Cloudflare Workers

1. 注册/登录 https://dash.cloudflare.com
2. 打开 https://github.com/sveltia/sveltia-cms-auth
3. 页面里的 **Deploy to Cloudflare Workers** 按钮 → 授权 GitHub → 选你的账号 → Deploy
   （也可以在本地 `git clone` 后 `wrangler deploy`，效果一样）
4. 部署完成后，进 Cloudflare 控制台 → **Workers & Pages** → 点开 `sveltia-cms-auth`
5. 复制它的地址，形如：
   ```
   https://sveltia-cms-auth.<你的子域>.workers.dev
   ```
   **记下这个地址**（步骤二、四都要用）。末尾**不要**带 `/`。

---

## 3. 步骤二：在 GitHub 注册 OAuth App

1. 打开 https://github.com/settings/applications/new
2. 按下面填（大小写和路径都要对）：

| 字段 | 填什么 |
| --- | --- |
| Application name | `汤圆Vision CMS`（随意） |
| Homepage URL | `https://jiangxiansen1.github.io/tangyuan-vision/` |
| Application description | 留空即可 |
| **Authorization callback URL** | **`<你的 Worker 地址>/callback`** ← 最容易错的一项 |

callback 举例（假设 Worker 地址是 `https://sveltia-cms-auth.abc123.workers.dev`）：
```
https://sveltia-cms-auth.abc123.workers.dev/callback
```
必须是 `/callback`，不是 `/auth`，也不是站点域名。

3. 点 **Register application**
4. 页面上点 **Generate a new client secret**
5. 现在你有两个值：**Client ID**（可公开）和 **Client Secret**（机密）

> ⚠️ **scope 说明**：GitHub OAuth App 页面本身没有 scope 输入框。实际申请的 scope
> 由 CMS 发起授权时决定，Decap 的 github 后端只请求 **`repo`**。
> 不要在任何地方申请 `admin:*`、`delete_repo`、`workflow`。

---

## 4. 步骤三：把机密填进 Worker 的环境变量

Cloudflare 控制台 → `sveltia-cms-auth` → **Settings** → **Variables and Secrets** → 添加：

| 变量名 | 值 | 说明 |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | 步骤二的 Client ID | 普通变量 |
| `GITHUB_CLIENT_SECRET` | 步骤二的 Client Secret | **点 Encrypt / Secret 按钮加密**，不要选 plaintext |
| `ALLOWED_DOMAINS` | `jiangxiansen1.github.io` | 防滥用：只允许你的站点用这个中转 |

- 如果你以后绑了自定义域名，把它追加进去，逗号分隔：`jiangxiansen1.github.io, example.com`
- 如果用的是 GitHub Enterprise，才需要 `GITHUB_HOSTNAME`，个人账号不需要

保存后 **Deploy**（改了 Variables 必须重新部署一次才生效）。

> 🔒 **Client Secret 任何时候都不要发给我、不要粘到聊天里、不要写进任何 `config.yml` 或 `.env` 里。**
> 它只存在于 Cloudflare 的加密变量中。

---

## 5. 步骤四：改 `public/admin/config.yml`

把下面这段的**公开值**给我（Worker 地址），我来改；你也可以自己改：

```yaml
# 现在（只能本地用）
backend:
  name: proxy
  proxy_url: http://localhost:8081/api/v1
```

改成：

```yaml
backend:
  name: github
  repo: jiangxiansen1/tangyuan-vision
  branch: master                     # ← 必须是 master
  base_url: https://sveltia-cms-auth.<你的子域>.workers.dev
  auth_endpoint: auth
```

**必须保留 `local_backend: true`**（在这段之前），这样 `pnpm cms` + `pnpm dev` 的本地流程不变。

改完提交并推送，等 GitHub Actions 的 deploy 跑完（约 1–3 分钟）：
```powershell
git add public/admin/config.yml
git commit -m "feat(cms): enable the github backend with the OAuth relay"
git push origin master
```

---

## 6. 步骤五：验证全链路

用浏览器打开（无痕窗口最干净）：
```
https://jiangxiansen1.github.io/tangyuan-vision/admin/
```

依次确认：

1. 出现 Decap 的**登录**界面（不是空白、不是报错）
2. 点「登录」→ 跳转 GitHub → 显示授权页，请求的权限是 **repo**
3. 点 **Authorize** → 回到 `/admin/` 并进入集合列表
4. 左侧应出现：个人品牌 / 摄影作品 / 摩旅与骑行 / AI 与编程 / 个人项目 / 随笔与思考 / 地球与旅行 / 联系方式 / 网站设置
5. 打开 **个人品牌 → 品牌与宣言**，把「个人宣言」改一句
6. 点 Publish / 保存 → 等 1–3 分钟 Actions 部署完成
7. 打开站点首页，确认新句子出现在首屏

第 4 步如果显示「暂无内容」且控制台有 `localhost:8081` 的请求，说明 `config.yml` 还没改或还没部署完。

---

## 7. 常见失败与原因对照

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 点登录后 GitHub 报 `redirect_uri_mismatch` | OAuth App 的 callback 和 Worker 地址不一致 | 回到步骤二，callback 必须是 `<WORKER_URL>/callback` |
| 授权后回到空白页 / 报 `Not Found` | Worker 变量没设或没重新部署 | 检查 `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`，改完必须 Deploy |
| 报 `Forbidden` / 拒绝发放 token | `ALLOWED_DOMAINS` 不含你的站点域名 | 加上 `jiangxiansen1.github.io` |
| 登录成功但集合全是「暂无内容」 | `config.yml` 的 `backend` 还是 `proxy`，或推送后没等部署 | 确认线上 `config.yml` 已是 `name: github` |
| 保存后前台没变化 | Actions 还没跑完，或浏览器缓存 | 看 Actions 是否 SUCCESS，然后强刷 `Ctrl+Shift+R` |
| 推送到远程时报 `Connection was reset` | 本机到 github.com 的 TLS 被重置 | 本仓库已配 `git config --local http.proxy http://127.0.0.1:7890`，换机器要重配 |

---

## 8. 成本与权限边界

- **花钱**：不需要。Cloudflare Workers 免费计划对个人站点足够；GitHub OAuth App 免费。
- **谁能编辑**：只有能登录你这个 GitHub 账号（或被加为仓库协作者）的人。
- **能改什么**：只有 `repo` scope 下的这个仓库。
- **数据在哪**：内容始终是仓库里的 JSON 文件，CMS 只是它的一个编辑器；站点构建从不依赖后台在线。

---

## 9. 其他还需要你（或需要你拍板）的事情

下面每一条都基于当前仓库的**实测状态**，不是清单模板。

### 9.1 必须由你提供真实信息的（内容诚实性）

| 项 | 当前实测状态 | 你要做的 |
| --- | --- | --- |
| 个人宣言 `brand.statement` | `"你这一生太安静   该出发了"`，`provenance: sample` | 用你自己的话写一句，通过 CMS 改（`个人品牌 → 品牌与宣言 → 个人宣言`） |
| 联系页三通道 | `douyin` / `email` / `github` 全部 `handle: null, url: null, confirmed: false` | 给真实抖音主页、公开邮箱、GitHub 主页；没有就让它继续显示「待填写」 |
| 旅行记录 `travels.json` | **0 条记录**（所以地球页统计是 已到访 0 / 计划中 0 / 可识别 174） | 想显示「地球进度」就填真实到访，没有就保持空状态 |
| 摄影作品 | 11 条全部 `provenance: sample` | 换成真实照片后把来源改成 `real` |
| 个人简介 `profile.json` | 4 条 `sample` | 同上 |
| 随笔 / 摩旅 / 项目 | journal 2、riding 2、projects 1 条 `sample` | 同上 |

> 示例内容在界面上带「示例」标记，不会被当作真实经历展示。替换后记得改 `provenance: real`。

### 9.2 可选项（不做也能正常用）

| 项 | 说明 | 你给什么 |
| --- | --- | --- |
| MapTiler key | 现在用免 key 的 NASA GIBS 卫星图（z9 到头）+ OpenStreetMap 矢量。有 key 可获得更高清卫星影像 | 申请后写成 `.env.local` 的 `VITE_MAPTILER_KEY`（**注意：VITE_* 会被内联进前端，它不是秘密**，真正保护靠 MapTiler 后台的 Origin 限制） |
| 视频彩蛋 | `public/media/easter-egg.mp4` 目前**不存在**，界面显示「尚未放入影片」 | 把 mp4 放到该路径即可 |
| 自定义域名 | 现在是 `jiangxiansen1.github.io/tangyuan-vision/` | 买域名 → 配 CNAME → Pages 设 Custom domain → 记得把域名加进 `ALLOWED_DOMAINS` |

### 9.3 我可以代做（你说一声）

- 补一份「内容录入指南」，把上面 9.1 的每一项对应到 CMS 的哪个集合、哪个字段
- 把 `docs/CMS.md` 第 4 节替换成本文的链接，避免两份步骤逐渐不一致
- 清理已经不再被引用的旧资源（如需）

---

## 10. 一句话总结你要做的事

1. 部署 `sveltia-cms-auth` 到 Cloudflare Workers（10 分钟）
2. 注册 GitHub OAuth App，callback 填 `<Worker>/callback`（5 分钟）
3. Worker 里填 `GITHUB_CLIENT_ID`、`GITHUB_CLIENT_SECRET`（加密）、`ALLOWED_DOMAINS=jiangxiansen1.github.io`（3 分钟）
4. **把 Worker 地址发给我**（公开值，可以发）
5. 我把 `config.yml` 改成 `github` 后端并推送，等部署
6. 打开 `/admin/` 登录，改一次「个人宣言」，确认前台更新
7. 顺手补：个人宣言、联系页三项、真实旅行记录、真实照片
