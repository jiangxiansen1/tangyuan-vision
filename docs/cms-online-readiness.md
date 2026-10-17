# cms-online-readiness.md — 在线 CMS 发布链路诊断（P0-B）

日期：2026-10-11。所有结论来自本阶段实测（命令与产物见 `docs/p0-test-report.md`）。
状态标记：✅ 实测通过 ｜ 🟡 源码审计通过但未运行验证 ｜ ⛔ 实测不可用 ｜ 🔒 需用户授权。

---

## 1. 结论摘要

| 问题 | 答案 | 状态 |
|---|---|---|
| 改 `brand.statement` 改哪个文件 | `src/content/data/brand.json`（CMS `brand` 集合 → `品牌与宣言` 条目） | ✅ |
| 前端是否统一内容层读取 | 是：`src/content/index.ts` 导出 `BRAND.statement` | ✅ |
| 字段缺失会白屏吗 | 不会：校验降级为 `''` + dev 控制台告警 | ✅（审计+构建验证） |
| 保存后构建/部署能否更新线上 | 能，但前提是 commit+push 到 **main** 触发 Actions；**本工作区尚未配置任何 git remote** | 🟡/🔒 |
| 发布分支 / Pages 部署方式 | workflow 监听 `main`；Pages Source = GitHub Actions artifact（无 gh-pages 分支） | ✅（读配置） |
| 根路径还是子路径 | 子路径：`resolveBasePath()` 由 `GITHUB_REPOSITORY` 推导 `/<repo>/`（owner.github.io 除外） | ✅（读配置） |
| 在线后台地址 | `https://<owner>.github.io/<repo>/admin/`（workflow summary 亦如此打印）；dev 环境为 `/admin/index.html` | ✅ |
| `backend: local` 是什么 | **不存在的后端名**。任何 decap-cms 版本（3.8.4→latest）只注册 git-gateway/azure/github/gitlab/gitea/bitbucket/test-repo/**proxy**。官方 decap-server README 的本地后端是 `name: proxy` + `proxy_url` | ⛔ 实测 "Backend not found: local" |
| `pnpm cms` 还能用吗 | decap-server 本体正常（8081）；但 PATH 的 pnpm 11.25.0 与安装者 11.8.0 不一致会触发"删除 node_modules 重装"交互确认；直接用 `node_modules\.bin\decap-server.CMD` 正常 | 🟡 |
| 本地 CMS 端到端（临时 proxy 配置下） | 登录→集合→编辑器读到宣言→修改→发布→**文件真实写入**→生产构建包含新值→恢复原值 | ✅ |
| 首页是否渲染宣言 | **否**。当前只有 AboutPage 渲染 `BRAND.statement`；首页需补 | ⛔ 缺口 |
| CMS schema 与数据是否一致 | 不一致：schema 要 `latin`(必填)，数据存 `brandLatin`；`brandFull/brandGloss` 不在 schema；**保存会被必填校验拦下** | ⛔ |
| travels 有 CMS 集合吗 | **没有**。travels.json 注释与 docs/CMS.md 声称的「地球与旅行」集合不存在 | ⛔ 文档过时 |
| 在线认证 | 未配置。两个候选方案见 §4 | 🔒 |

## 2. 数据链路（实测路径）

`public/admin/config.yml`(brand.identity → file: src/content/data/brand.json)
→ Decap 编辑器（CDN `decap-cms@3.8.4`，`public/admin/index.html`）
→ 后端 proxy → decap-server(8081) → 写工作副本 JSON
→ `src/content/index.ts` `BRAND.statement`（`b.statement ?? ''`）
→ 组件渲染（现仅 AboutPage；首页待补）
→ `vite build` 内联进 `dist/assets/index-*.js`（已用测试串 grep 证实）
→ push main → Actions(typecheck→lint→build→upload-pages-artifact) → Pages 发布。

关键事实：

- 内容在**构建期**内联，因此"在线保存→线上生效"必须经过一次 Actions 构建；CMS 提交到分支后由 webhook/push 触发。
- Decap 保存**保留 schema 之外的键**（实测 `brandFull/brandGloss/brandLatin` 在保存后仍在），但会重排键序。
- 发布按钮是两级菜单：`发布` → `立即发布`，且均为 `<span role="button">`（自动化测试需注意）。
- 必填校验真实生效：`latin` 为空时发布被拦并给出明确中文错误（"你漏掉了一个必填项…'英文标识'是必填项"）。

## 3. 本地验证记录（可恢复测试）

1. 备份 `config.yml`、`brand.json` 至 `tools/_verify/cms/backup/`。
2. 临时把 backend 改为 `proxy` + `proxy_url: http://localhost:8081/api/v1`。
3. 真实浏览器（Edge headless CDP）走完：登录（local/proxy 后端无需凭据）→ 个人品牌 → 品牌与宣言 → 读字段 → 改宣言与 latin → 发布 → 立即发布。
4. 磁盘确认：`statement` 变为测试串；`latin` 写入；其余键保留。
5. `tsc -b && vite build` 后在 `dist/assets/index-*.js` grep 到测试串。
6. 从备份恢复两文件；`git diff` 为空；重建 dist 后测试串消失。

未遗留任何测试文本；未触碰 git 历史。

## 4. 在线认证方案比较（依据 2026-10-11 官方文档）

### 方案 A · Decap Turbo（托管后端）

- 配置：`backend: { name: turbo-github, turbo_site_id: <uuid>, branch: main }`；
  CMS bundle 需用 **beta dist-tag**（如 `decap-cms@3.17.0-beta.0`）——稳定版不含 turbo 后端。
- 流程：注册 Turbo 组织（邮箱+密码）→ 连接 Git 提供商（**授权第三方 GitHub App 访问仓库**）→ 创建站点 → 改 config。
- 写入：每次保存仍是**你自己仓库的真实 commit**（配置分支）；内容不离开 Git；编辑器无需 GitHub 账号；权限服务端强制。
- 稳定性：**public preview**；beta bundle 可能在 minor 版本带 breaking change（官方明示）。
- 费用（官方 pricing 页实测）：Free €0 = 1 站 + 1 席，"free forever"，无需信用卡；Pro €19/月（预览期内免费至 2026-10-15，之后 14 天试用）；媒体库 S3 为 Pro 及以上。未来产生费用的条件：第 2 席/第 2 站/媒体库/预览期结束后的 Pro 试用到期（Free 不受影响）。
- 密钥位置：Git 连接凭据在 Turbo 服务端；浏览器无 secret。
- 自定义域名：不要求。
- 维护：几乎为零；代价是**接受第三方托管服务的 ToS 与 preview 风险**。
- `pnpm cms` 本地：不受影响（config 二选一，本地可另用 proxy 测试副本）。

### 方案 B · 稳定 github 后端 + 自托管 OAuth 中转

- 配置：`backend: { name: github, repo: owner/repo, branch: main, base_url: <worker>, auth_endpoint: auth }`；bundle 用**稳定版**（当前 3.8.4 即可，已实测加载正常）。
- 流程：自建 GitHub OAuth App（scope 仅 `repo`）→ 把 Client ID/Secret 放进中转服务环境变量 → 部署中转（推荐 Cloudflare Workers + 开源 `sveltia-cms-auth`，MIT）→ 改 config。
- 写入：编辑器用**你自己的 GitHub 账号** OAuth 登录（单作者站点即本人），Decap 直连 GitHub API 提交；需要本人对仓库有 push 权限（满足）。
- 稳定性：github 后端是 Decap 最老最稳的路径；中转为社区维护的小函数。
- 费用：Cloudflare Workers 免费档（10 万请求/日）对个人编辑绰绰有余；OAuth App 免费。产生费用的条件：几乎无（超免费档才计费）。
- 密钥位置：Client Secret 只在 Worker 环境变量；**不进仓库、不进 VITE_*、不进浏览器**。
- 自定义域名：不要求（Workers 子域即可作 callback）。
- 维护：部署一次后基本免维护；升级中转跟随上游 release。
- `pnpm cms` 本地：不受影响。

### 推荐

**推荐方案 B**：稳定版 bundle + 密钥在自己手里 + 零月费 + 不依赖 preview 服务；
维护成本与 Turbo 同量级（一次部署），信任面更小（只有 GitHub 与自己的 Worker）。
若你更想要"零基础设施、零运维"，且接受 beta bundle + 第三方 ToS + 授权 GitHub App，
方案 A 的 Free 档也完全够用。**两者都不要求付费；都不改变内容仍在 Git 的事实。**
（另有 Netlify Git Gateway 路线：需 Netlify 账号与 Identity 邀请流程，多一个平台账号，不优先。）

## 5. 需要用户授权/操作的事项（我不代做）

1. 🔒 创建 GitHub 仓库并添加 remote；确认默认分支为 `main`（本地现为 `master` 且无 remote）。
2. 🔒 仓库 Settings → Pages → Source = GitHub Actions（一次性）。
3. 🔒 方案 B：创建 OAuth App（callback 指向 Worker）、部署 Worker、把 Client ID/Secret 填入 Worker 环境变量。
   方案 A：注册 Turbo 组织、连接 Git 提供商、创建站点、接受其 ToS。
4. 🔒 批准仓库内修改：`config.yml` 后端切换（proxy→github 或 turbo-github）、schema 对齐（§6）、
   workflow 的 pnpm 版本（10→11，否则 CI 的 esbuild postinstall 可能被拦）、首页渲染宣言。
5. 提供真实内容：宣言定稿、社交链接、旅行记录、摄影作品（CMS 或我代录均需你给数据）。

## 6. 仓库内待修清单（按依赖排序，均待批准后实施）

1. `public/admin/config.yml`：backend 名修正（本地验证用 proxy；线上切换按 §5）。
2. schema 对齐：`latin` 改名为 `brandLatin`（或数据迁移），补 `brandFull`/`brandGloss` 字段或设为隐藏默认；
   保证必填校验不再拦保存。
3. 新增 `travels` CMS 集合（字段表已在 travels.json 注释中定义）。
4. 首页渲染 `BRAND.statement`（P2）。
5. `.github/workflows/deploy.yml`：pnpm 10 → 11（与 pnpm-workspace.yaml 的 `allowBuilds` 语法匹配）。
6. `docs/CMS.md`：更正 dev 地址为 `/admin/index.html`、更正"local 后端"章节为 proxy、删除不存在的「地球与旅行」集合描述。

## 7. 在线端到端验收清单（未来执行，未通过前不得宣称线上可用）

- [ ] 在线 `/admin/` 打开并登录成功（未授权用户无法登录/保存）。
- [ ] 编辑 `brand.statement` → 发布 → 在 GitHub 仓库正确分支看到真实 commit。
- [ ] Actions 构建成功 → Pages 发布 → 正式首页/关于页显示新宣言（非硬编码旧文案）。
- [ ] OAuth Secret 不在浏览器 bundle 与公开仓库中（grep 验证）。
- [ ] 保存失败时 CMS 显示清晰错误（断网/坏 token 各测一次）。
- [ ] 重复构建不丢内容（构建只读 JSON，不写回）。
- [ ] 本地 `pnpm cms`（或 bin 直启）仍可用。

当前状态：**本地测试通过（proxy 临时配置）；线上 = 配置中/未开始**。

---

## 8. P1 修复记录（2026-10-11，已实测复验）

| 项 | 修复 | 复验证据 |
|---|---|---|
| backend 名 | `local`→`proxy`+`proxy_url`，并加 `local_backend: true` 作环境边界（localhost 恒走代理；将来换 github 后端不影响本地） | 后台登录→集合→编辑→发布全通 |
| schema 对齐 | `latin`→`brandLatin`，新增 `brandFull`、`brandGloss` | 编辑器读到 Vision/汤圆Vision/汤圆视界；保存后键全保留 |
| travels 集合 | 新增「地球与旅行 → 旅行记录」file 集合（字段同 regions.ts 模型；`notes` 在 schema 外被保留） | 侧栏出现集合；编辑器打开「0 旅行记录 / 新增旅行记录」无报错 |
| 首页宣言 | `BrandCore` full 变体渲染 `BRAND.statement`（.bcore__statement） | CMS 改宣言→发布→首页实时显示测试串→恢复后显示原文 |
| pnpm 版本 | workflow `version: 10`→`11`；package.json 增 `packageManager: pnpm@11.8.0` | 匹配版 pnpm 下 `pnpm exec tsc -b`、`pnpm build`、`pnpm lint` 全 0 退出 |
| 文档 | CMS.md/README/CONTENT.md/AGENTS.md 更正 dev 地址、proxy 后端、travels 集合 | 本文件与 p0-test-report 同步 |

遗留（仍需授权，见 §5）：线上仓库/remote、Pages Source、OAuth 中转或 Turbo、config 的 github 块启用。
本地 pnpm 注意：PATH 的 pnpm 11.25 与安装者 11.8.0 不一致时，`pnpm` 任何命令都会触发
"purge node_modules" 确认并中止（答 n 亦中止）。本机验证使用与 packageManager 一致的
pnpm 11.8.0（官方 registry tarball 经 node 运行）；CI 为全新安装不受影响。