# 访客互动（Supabase）

点赞（照片）与「我也想去」（国家 / 地区）共用的数据层。后端是 Supabase 免费版，
但**这不是"接了一个数据库"那么简单**：真正决定安全的是 `supabase/migrations/`
里的权限与 RLS 策略，而**不是**你在前端填了什么、藏了什么。

内容维护见 [CONTENT.md](CONTENT.md)，后台（Decap CMS）见 [CMS.md](CMS.md)，
部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。

---

## 1. 结论先说

| 问题 | 答案 |
|---|---|
| 免费吗？ | 是。免费版含 500 MB 数据库、5 GB 出站流量、无限 API 请求 |
| 需要服务器吗？ | 不需要。前端用 `fetch` 直连 Supabase 的 REST 接口 |
| 需要装 `@supabase/supabase-js` 吗？ | **不需要**。只用了 5 个端点，自己写 200 行 `fetch` 封装（`src/lib/interactions/client.ts`） |
| anon key 放在前端会被偷吗？ | **它本来就是公开的**。所有 `VITE_*` 变量都会在 `vite build` 时被内联进 JS，任何访客都能读到。安全来自 RLS，不来自藏 key |
| 会把 `service_role` key 放进前端吗？ | **不会，永远不会**。它绕过 RLS，放在前端等于公开整个数据库。`client.ts` 还会主动拒绝这种配置 |
| 没配置数据库时站点能跑吗？ | **能**。互动区域显示「未配置」并说明原因，**不会**显示任何数字，也不会白屏 |
| 数字是真实的吗？ | 是。**本项目禁止伪造数字**：读不到就显示错误状态，永不显示随机的、硬编码的或"猜一个"的计数 |
| 一人只能点一次赞吗？ | 数据库层保证「一个令牌对一张照片只有一行」。**但不能保证"一个人"一次**，见第 6 节 |
| 能防住刷票吗？ | 能挡住"一台浏览器狂点"和"一个令牌刷"，挡不住"每次换一个令牌"。第 6 节逐条写明 |

---

## 2. 一次性配置：创建项目、执行迁移、拿到两个值

### 2.1 创建项目

1. 打开 <https://supabase.com/dashboard>，新建项目（免费版最多 2 个活跃项目）。
2. **Region 选离你访客最近的**（例如 `East Asia (Tokyo)`）。
   延迟只影响点击后的反馈速度，不影响正确性。
3. 设置数据库密码。**这个密码不要写进任何前端文件、不要写进 `.env`。**
   本项目的方案根本不需要它——前端只用 anon key 走 REST 接口。
   把它存进密码管理器即可。
4. 等 1～2 分钟，项目初始化完成。

### 2.2 执行迁移（二选一）

迁移文件是**幂等**的，可以重复执行；重复执行不会丢数据。

#### 方式 A · Dashboard SQL Editor（推荐，零依赖）

Dashboard → **SQL Editor** → New query，然后**按文件名顺序**逐个粘贴执行：

| 顺序 | 文件 | 内容 |
|---|---|---|
| 1 | `supabase/migrations/20261009120001_interactions_schema.sql` | 两张记录表 + UNIQUE 约束 |
| 2 | `supabase/migrations/20261009120002_interactions_grants_rls.sql` | 权限收回 + RLS 策略 |
| 3 | `supabase/migrations/20261009120003_interactions_views_rpc.sql` | 聚合视图 + 计数 RPC |
| 4 | `supabase/migrations/20261009120004_interactions_rate_limit.sql` | 时间窗限流触发器 |

顺序不能换：2 的策略引用 1 的表，3 的函数统计 1 的数据，4 的触发器依赖 2 的权限状态。

每个文件**末尾都有一段 `do $$ … $$` 自检**，缺表、缺约束、缺策略、
权限没收回，都会当场 `raise exception` 并告诉你少了什么。
看到红色报错就当迁移没做完，不要跳过。

> ⚠️ 如果 Dashboard 里 `anon` / `authenticated` 角色不存在（新建项目通常都有），
> 第 2 个文件会报 `role "anon" does not exist`。这时项目不正常，换一个项目重来。

#### 方式 B · Supabase CLI

```bash
# 安装（任选其一）
brew install supabase/tap/supabase          # macOS
scoop install supabase                       # Windows
npm i -g supabase                            # 有 Node 的环境

supabase login                               # 会打开浏览器授权
supabase link --project-ref <你的-project-ref>   # ref 在 Dashboard URL 里

# 先看一眼会执行什么（不会真的写入）
supabase db push --dry-run
supabase db push                             # 真正执行
```

`supabase db push` 会按文件名顺序执行 `supabase/migrations/` 下**尚未执行**的文件，
并把已执行的版本号记在数据库里，因此重复运行是安全的。
需要数据库密码时会提示输入——**只输入到 CLI，不要写进任何文件**。

#### 执行完自检

在 SQL Editor 里跑这几条，应该看到 4 张表/视图和 8 个函数：

```sql
-- 表与视图（应有 4 行：interaction_rate_limit, photo_like_counts,
--                    photo_likes, region_vote_counts, region_votes）
select table_name from information_schema.tables
 where table_schema = 'public'
   and table_name in ('photo_likes','region_votes','photo_like_counts',
                      'region_vote_counts','interaction_rate_limit')
 order by table_name;

-- RLS 必须全部为 true
select relname, relrowsecurity from pg_class
 where oid in ('public.photo_likes'::regclass, 'public.region_votes'::regclass,
               'public.interaction_rate_limit'::regclass);

-- 策略清单（应看到 6 条 anon 策略：2 组 × (insert / select / delete)）
select tablename, policyname, cmd from pg_policies
 where schemaname = 'public' and tablename in ('photo_likes','region_votes')
 order by tablename, cmd;

-- anon 不该有任何 update 权限，也不该能读聚合视图
select has_table_privilege('anon','public.photo_likes','update')  as anon_can_update,
       has_table_privilege('anon','public.photo_like_counts','select') as anon_reads_view;
```

最后一条两个字段都必须是 `false`。

### 2.3 拿到 URL 与 anon key

| 值 | 位置 | 长什么样 |
|---|---|---|
| Project URL | Dashboard → **Project Settings → Data API** → `Project URL` | `https://abcdefgh.supabase.co`（**结尾无斜杠**） |
| anon key | Dashboard → **Project Settings → API Keys** → `anon` / `public` 那一条 | `eyJhbGciOiJIUzI1NiIs…`（一长串 JWT）或 `sb_publishable_…` |

> ⚠️ **认准标题是 `anon` / `public`。** 旁边就是 `service_role`，两者长得像，
> 功能却完全相反。填错就等于把数据库交出去。`client.ts` 里有一段代码会解析
> JWT 载荷、发现 `service_role` 就拒绝启用——这是**兜底，不是保险**。

### 2.4 写进环境变量

```bash
cp .env.example .env
```

`.env`（已被 `.gitignore` 忽略）：

```dotenv
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....
```

**变量名必须一字不差**（Vite 只暴露以 `VITE_` 开头的变量）：

| 变量名 | 必需 | 说明 |
|---|---|---|
| `VITE_SUPABASE_URL` | 是 | 项目 URL，结尾**不要**斜杠 |
| `VITE_SUPABASE_ANON_KEY` | 是 | anon / public key |
| `VITE_VISITOR_SALT` | 否 | 访客去重令牌的盐；留空用内置常量。换 Supabase 项目时建议改一次 |
| `VITE_TV_DEMO` | 否 | **仅开发用**。设 `1` 后配合地址 `?demo=1` 启用内存假后端 |

### 2.5 部署到 GitHub Pages 时

Actions 里跑构建，**读不到你本机的 `.env`**。到
仓库 → Settings → Secrets and variables → Actions → **Variables** 添加两个同名变量
（值是公开的，用 Variables 或 Secrets 都可以）。

改完必须**重新部署**：值是构建期内联的，改仓库变量不会影响已经发布出去的产物。

---

## 3. 数据流与权限模型

```
浏览器                                  Supabase
──────────────────────────────────────  ──────────────────────────────────────
visitor.ts                              photo_likes / region_votes
  本地随机 UUID                            UNIQUE(photo_id, visitor_hash)
  └ SHA-256(盐 + UUID) → 32 位 hex         ↑ 重复点赞在这里被拒（23505）
                    │                      │
                    ├─ POST /rest/v1/photo_likes           （写，不带令牌头）
                    │      → RLS insert 策略（校验格式）
                    │      → BEFORE INSERT 时间窗限流触发器
                    │
                    ├─ POST /rpc/tv_photo_like_counts      （读计数）
                    │      → security definer 函数：只回 { id, count }
                    │
                    └─ GET /rest/v1/photo_likes?select=photo_id
                           x-visitor-hash: <hex>           （读"我点过哪些"）
                           → RLS select 策略：只能看到自己那一行
```

| 谁 | 能看到什么 | 能写什么 |
|---|---|---|
| `anon`（匿名访客） | 聚合计数（经 RPC）；仅自己 `visitor_hash` 的行 | 插入点赞/投票；删除自己那一行 |
| `authenticated` | **什么都没有**（没有表权限） | **什么都没有** |
| `service_role` | 全部 | 全部（绕过 RLS，**只存在于服务端**） |
| 项目所有者（你，SQL Editor） | 全部，含 `photo_like_counts` 视图 | 全部 |

`photo_like_counts` / `region_vote_counts` 这两个视图**故意不给 anon 权限**。
它们是给你在 Dashboard 里查的。对外只开放 4 个 `security definer` 函数，
它们只返回 `{ id, count }`，`visitor_hash` 永远不出现在响应里。

---

## 4. 免费版的真实额度

以下数字来自 Supabase 官方定价页（<https://supabase.com/pricing>），
**会变**，请以官方页面为准：

| 项目 | 免费版 |
|---|---|
| 月费 | $0 |
| API 请求 | 无限 |
| 数据库大小 | 500 MB |
| 出站流量 | 5 GB / 月 |
| 文件存储 | 1 GB（本项目不用） |
| 月活用户 | 50,000（本项目没有登录，用不到） |
| 活跃项目数 | 2 |
| 空闲暂停 | **7 天无请求会被暂停** |
| 日志保留 | 1 天 |
| 自动备份 | 无 |

### 500 MB 能存多少次点赞？

一条记录约 100 字节（含索引开销），因此 500 MB ≈ **数百万次点赞**。
免费版真正的瓶颈不是容量，而是：

1. **7 天无访问会被暂停。** 站点长期没人点，项目会睡过去。
   恢复：Dashboard 里点 Restore，几秒即可，数据不丢。
   一个每月只有几百次浏览的个人站点**完全可能遇到**，这是预期行为，不是故障。
2. **出站流量 5 GB/月。** 计数响应只有几百字节，
   但要留意：如果将来有人把聚合视图直接开放给公开端点并做轮询，
   流量会以访问量 × 轮询频率增长。

### 限流表的维护

`interaction_rate_limit` 只记「最近有活动的令牌」，但**它不会自己变小**。
迁移 4 里如果检测到 `pg_cron` 扩展已启用，会注册一个每日清理任务
（`tv-prune-rate-limit`，保留 24 小时）；没启用则只会 `raise warning` 并跳过。

手动清理（SQL Editor）：

```sql
delete from public.interaction_rate_limit
 where last_write < now() - interval '24 hours';
```

想启用自动清理：Dashboard → **Database → Extensions** → 打开 `pg_cron`，
然后重新执行迁移 4（幂等，会补注册那个任务）。

---

## 5. RLS 保护什么，不保护什么

### 保护（这些是被强制执行的，不是君子协定）

| 事项 | 实现方式 |
|---|---|
| 重复点赞不可能发生 | `UNIQUE(photo_id, visitor_hash)`，Postgres 返回 23505 |
| `visitor_hash` 无法被枚举 | anon 只能看到自己那（通过 `x-visitor-hash` 声称的）行；想列出所有 hash 必须先猜中 |
| anon 不能改任何东西 | `update` 策略一条都没有，且 `grant` 里也没有 update；`revoke all` 之后逐条加回 |
| anon 不能删别人的行 | delete 策略限定 `visitor_hash = tv_visitor_hash()`（请求头里的值） |
| 计数不能造假 | 计数由 `security definer` 函数在数据库里 `count(*)` 算出来，前端不参与运算 |
| 单令牌刷屏会被挡 | `BEFORE INSERT` 触发器做时间窗判定（默认 300 秒内 20 次，按令牌跨表汇总） |
| 越权调用内部函数 | 4 个对外函数显式 `grant execute`，其余 `revoke … from public, anon, authenticated` |

### 不保护（写在文档里，也写在代码注释里）

| 事项 | 实情 |
|---|---|
| 「一人一票」 | **做不到。** 清掉浏览器存储就是新令牌，等于新的一票 |
| 冒充别人的令牌 | 任何人只要知道某个 hash，就能用它发请求。**没有登录就没有身份**，这是匿名方案的天花板 |
| IP 级限流 | 前端拿不到访客 IP；`x-forwarded-for` 可伪造，用它做安全决策比不用更危险 |
| 限流被绕 | 每次换一个新令牌即可绕过。限流挡的是"狂点"和"写错循环"，不是攻击者 |
| 计数被观测 | 计数是公开的，反复读 + 自己点一下看差值，就能算出增量。这是"公开计数"的固有性质 |
| 数据库之外的任何东西 | anon key 是公开的，任何人都能直接对着 REST 接口发请求 |
| 项目被暂停 | 免费版 7 天无访问会暂停，与权限无关 |

---

## 6. 匿名投票的安全边界（明确清单）

这一节是这份文档里最需要被认真读的部分。**不要**对访客或对你自己承诺更多。

1. **没有身份。** 本站没有登录、没有会话、没有 cookie 识别。
   数据库能看到的只是一个字符串 `visitor_hash`。
   「这个令牌是不是他自己生成的」这个问题，数据库**无法回答**。
2. **去重令牌是"尽力而为"，不是身份证明。**
   它存在浏览器 `localStorage` 里。清站点数据、无痕窗口、
   换浏览器、换设备 —— 都会产生一个新令牌，并被视为一位新访客。
3. **UNIQUE 约束保证的是"行不重复"，不是"人不重复"。**
   它让同一令牌的第二次点赞在数据库层被拒（23505），
   这是真实且不可绕过的；但它管不了"换一个令牌再来一次"。
4. **`x-visitor-hash` 请求头不是认证。** 它是公开的、可改写的字符串。
   RLS 用它把读/删范围收窄到"你声称的那个 hash"。
   收益：`visitor_hash` 无法通过 REST 被枚举（猜不中就拿不到）。
   缺口：自称别人 hash 的人可以删掉对方的点赞。挡住它需要登录态，
   代价远大于收益，因此**本项目选择不挡，并把它写在这里**。
5. **限流是配额，不是安全控制。** 300 秒 / 20 次（按令牌跨照片与地区汇总）
   能挡住脚本用同一个令牌刷满全站，也能挡住写错的循环。
   换令牌即绕过。真正的兜底是 Supabase 的项目级配额，以及你随时可以暂停项目。
6. **数字是真实的，但会滞后。** 计数是查询时算出来的，不做缓存、不做乐观 +1。
   两个访客看同一张照片，谁先刷新谁看到新数字。要让计数实时更新需要订阅通道，
   本数据层**故意没有**做——静态站点加一条长连接，代价远大于收益。
7. **DEMO 数据不进生产。** `src/lib/interactions/demo.ts` 只在
   `import.meta.env.DEV && VITE_TV_DEMO === '1' && 地址带 ?demo=1` 时才加载。
   生产构建里 `import.meta.env.DEV` 是编译期常量 `false`，整个分支被 Rollup 折叠，
   该模块**不在产物里**。见第 8 节的自检方法。

---

## 7. 故障排查

| 症状 | 原因 | 处理 |
|---|---|---|
| 页面上显示「未配置 Supabase…」 | 环境变量没填 / 填错名字 | 变量名必须是 `VITE_SUPABASE_URL` 与 `VITE_SUPABASE_ANON_KEY`，改完**重启 dev server** |
| 显示「提交的标识不被接受」 | 内容文件里的 id 含非法字符 | id 只允许 `A-Z a-z 0-9 . _ : -`，长度 1–128 |
| 显示「数据库拒绝了这次操作（缺少权限或 RLS 策略未生效）」 | 迁移 2 没执行完，或没执行 | 重跑迁移 2，它的自检会告诉你缺什么 |
| 显示「找不到对应的函数」 | 迁移 3 没执行 | 执行迁移 3 |
| 显示「操作过于频繁，请等 N 秒」 | 时间窗限流生效了（这是设计） | 等待；若阈值不合适，改迁移 4 的 `tv_interaction_limit_seconds()` / `_max_writes()` |
| 点赞后计数没变 | 该令牌已点过赞（23505，被正确报告为"已点过"） | 在浏览器控制台执行 `localStorage.clear()` 再试（**这会重置你的令牌**） |
| 计数永远是 0，但数据库里有行 | 内容的 `id` 和数据库里的 `photo_id` 不一致 | 在 SQL Editor 里 `select photo_id, count(*) from photo_likes group by 1;` 对比 |
| 全部请求 404，路径里出现 `//rest` | `VITE_SUPABASE_URL` 结尾多了斜杠 | 去掉斜杠（`client.ts` 也会规范化一次，但请从源头改对） |
| 项目"睡"了 | 免费版 7 天无访问自动暂停 | Dashboard → Restore，几秒恢复，数据不丢 |
| 想确认生产产物里没有 DEMO 代码 | —— | `pnpm build` 后在 `dist/assets/` 里搜 `demo-token-a`，**应该搜不到** |

### 想彻底关掉互动功能

把 `.env` 里的 `VITE_SUPABASE_URL` 留空即可。站点照常运行，
互动区域显示「未配置」。**不需要**改任何代码。

---

## 8. 验证清单（部署前后各做一次）

```bash
pnpm typecheck && pnpm lint && pnpm build
```

1. **没配数据库时**：打开摄影页，点赞区域应显示「未配置…」的说明文字，
   **不应**出现任何数字，也不应白屏。
2. **配好之后**：点赞一次 → 计数 +1；再点一次 → 计数回到原值。
   刷新页面 → 状态保持（因为令牌和行都在）。
3. **重复点赞**：点赞后立刻连点两次，第二次应立即返回"已点过"，
   计数**只加 1**。数据库里 `select count(*) from photo_likes where photo_id = '…'`
   应与页面一致。
4. **限流**：在控制台连续调用 `likePhoto` 二十几次，应出现
   「操作过于频繁，请等 N 秒后再试」。这个 N 来自数据库触发器的 hint，
   不是前端算的。
5. **DEMO 不可达**：`pnpm build`，然后
   `grep -r "demo-token" dist/assets/` → **应无输出**。
6. **RLS 生效**：打开浏览器控制台（配好环境变量后）：

   ```js
   // 用 anon key 直接尝试读取原始行 —— 应为空数组
   const url = import.meta.env.VITE_SUPABASE_URL;   // 在 dev 下可用
   const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
   const r = await fetch(`${url}/rest/v1/photo_likes?select=visitor_hash`,
     { headers: { apikey: key, Authorization: `Bearer ${key}` } });
   console.log(r.status, await r.json());          // 期望：200 [] —— 一行都看不到
   ```

   得到 `[]` 而不是一大串 hash，说明"不可枚举"这条成立。

---

## 9. 卸载 / 迁移

- **换 Supabase 项目**：改 `.env` 的两个值（并建议改一次 `VITE_VISITOR_SALT`，
  否则同一个浏览器在两个项目里会算出同一个 hash），重新部署。
- **清空所有互动数据**：

  ```sql
  truncate table public.photo_likes, public.region_votes, public.interaction_rate_limit;
  ```

- **完全移除**：删掉 `supabase/` 目录与 `src/lib/interactions/`、两个 hook，
  再把调用它们的组件去掉。数据库侧删掉项目即可。

---

## 10. 文件在哪

| 路径 | 作用 |
|---|---|
| `supabase/migrations/20261009120001_interactions_schema.sql` | 表与 UNIQUE 约束 |
| `supabase/migrations/20261009120002_interactions_grants_rls.sql` | 权限收回 + RLS 策略（**最重要**） |
| `supabase/migrations/20261009120003_interactions_views_rpc.sql` | 聚合视图 + 4 个对外函数 |
| `supabase/migrations/20261009120004_interactions_rate_limit.sql` | 时间窗限流与清理任务 |
| `src/lib/interactions/client.ts` | PostgREST 封装、错误码映射、DEMO 判定 |
| `src/lib/interactions/types.ts` | 结果类型（`{ ok: true, data } \| { ok: false, error, code }`） |
| `src/lib/interactions/visitor.ts` | 匿名去重令牌（本地 UUID + 盐 + SHA-256） |
| `src/lib/interactions/photos.ts` | 照片点赞的四个操作 |
| `src/lib/interactions/regions.ts` | 地区投票的四个操作 |
| `src/lib/interactions/demo.ts` | 内存假后端（**仅开发**，生产产物里不存在） |
| `src/hooks/usePhotoLikes.ts` | 照片点赞的 React 状态（`unconfigured \| loading \| ready \| error`） |
| `src/hooks/useRegionVotes.ts` | 地区投票的 React 状态 |
| `.env.example` | 环境变量模板与说明 |
