-- =============================================================================
--  20261009120002_interactions_grants_rls.sql
--  访客互动数据层 · 授权与行级安全（grants + RLS）
-- =============================================================================
--
--  ⚠️ 这个文件是整个方案里最重要的一个。表结构写错只是数据难看，
--     这个文件写错就是**数据泄露**，所以每一段都写了理由。
--
--  ── 先记住一条被广泛误解的事实 ────────────────────────────────────────────────
--  "开了 RLS 就安全了"是错的。Postgres 在触碰一张表之前要过两道关：
--    1. 权限（GRANT）：这个角色能不能对这张表做这个操作？不能 → 报 42501
--    2. 策略（POLICY）：能做的操作，作用于哪些行？
--  先过 GRANT，再过 POLICY（https://supabase.com/docs/guides/database/postgres/row-level-security）。
--  Supabase 的老项目会给 public 里**新建**的表自动授予 anon/authenticated
--  select, insert, update, delete。也就是说：如果你只写策略不收回权限，
--  anon 手上仍然握着 update/delete 的授权，任何策略写漏一处就是敞口。
--  所以本文件第一件事是 **revoke all**，然后只加回需要的。
--
--  ── 匿名访客做不到什么（本方案的真实边界）────────────────────────────────────
--  REST 接口只认两种角色：带 anon key 的请求 → anon，带了登录 JWT → authenticated。
--  我们**没有**给匿名访客加自定义角色：要给出访客一个独立角色，就必须先有登录
--  （哪怕是匿名登录）才能真正区分"谁"，那是另一套架构（Auth + RLS on auth.uid()）。
--  结论：所谓"匿名会话的身份"在数据库里只能体现为**请求体里的一个字符串**
--  （visitor_hash），而字符串是可以被伪造的。由此得到两条必须如实承认的事：
--    · INSERT 策略无法绑定"这个 hash 属于你"，只能校验格式
--    · DELETE 策略只能约束"删的必须是 body 里带的那个 hash"，无法证明它属于你
--  真正不可绕过的只有 UNIQUE(photo_id, visitor_hash)：它保证**同一行**不会
--  出现两次。它不能保证"同一个人"只出现一次。见 supabase/README.md 第 6 节。
--
--  幂等性：`drop policy if exists` + `create policy`，可以重复执行。
--  注意 `revoke` 是幂等的（撤销不存在的权限不报错）。
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. 打开行级安全
-- -----------------------------------------------------------------------------
--  Supabase 的建表向导通常已经打开了；这里再写一次，是为了让"RLS 有没有开"
--  只取决于这个文件，而不是取决于表是怎么建出来的。
alter table public.photo_likes  enable row level security;
alter table public.region_votes enable row level security;

--  FORCE 也一起打开：表的拥有者（postgres / service_role）默认不受 RLS 约束，
--  FORCE 让普通角色无论如何都走策略。拥有者本身仍可绕过（这是 Postgres 的
--  设计），但至少避免"迁移顺手以 owner 身份跑了一段，结果绕过策略"这种事故。
alter table public.photo_likes  force row level security;
alter table public.region_votes force row level security;

-- -----------------------------------------------------------------------------
--  2. 收回所有权限，只加回必要的
-- -----------------------------------------------------------------------------
--  这一段的顺序很关键：先全部 revoke，再逐条 grant。
--  反过来写（只 grant 不 revoke）会保留 Supabase 自动授予的 update/delete，
--  等于给 anon 留了两条本不该存在的通道。
revoke all on table public.photo_likes  from anon, authenticated;
revoke all on table public.region_votes from anon, authenticated;

--  anon：只给 insert（点赞/投票）、select（用于读取"自己那一行"，见第 4 节）、
--  delete（取消点赞，且仅限请求头里自称的那个 hash）。
--  **没有** update：点赞是"有/没有"的二元状态，没有需要修改的字段。
--  一条不该存在的 UPDATE 授权，是一个将来会被误用的入口。
--  注意 DELETE 并不需要 SELECT 授权——行的可见性只由 delete 策略自己的
--  using 决定。给 select 是为了让前端能回答"我点过哪些"，而不是为了让删除生效。
grant insert, select, delete on table public.photo_likes  to anon;
grant insert, select, delete on table public.region_votes to anon;

--  authenticated：**不给任何权限**。
--  本站没有登录功能；保留一个用不到的授权只会扩大攻击面。
--  如果将来真的加了登录（看板、管理员），那时再显式补水：
--    grant select on table public.photo_likes to authenticated;
--  注意：即使现在给 select，"看所有行"也是不可能的——下面的策略只允许
--  看到 visitor_hash 等于请求头的那些行。权限和策略是两条独立的闸门。
--  这里**什么都不给**，因为没有任何当前功能需要它。

--  sequence 权限不需要额外授予：主键用的是 gen_random_uuid()，没有 sequence。

-- -----------------------------------------------------------------------------
--  3. 写入策略：anon 可以 INSERT，但只能插入"格式正确"的行
-- -----------------------------------------------------------------------------
--  为什么策略里要重复做 check 约束已经做过的事（长度、正则）：
--  check 约束是数据完整性，不是授权。策略是"授权"层，它表达的是
--  "允许匿名写入什么样的行"。两者重合不是冗余——check 约束将来若被放宽
--  （比如允许更长的 id），授权边界不会跟着被无声放宽。写死在这里的规则，
--  要改必须有人明确地改这个文件。
--
--  为什么 coalesce(x, '') <> ''：body 里完全没有 visitor_hash 字段时，
--  表达式求值为 NULL，而 Postgres 的策略把 NULL 当作"不通过"。
--  保留 coalesce 是为了让这条规则的意图在 SQL 里可读，不依赖读者知道 NULL 语义。

drop policy if exists "anon can like a photo" on public.photo_likes;
create policy "anon can like a photo"
  on public.photo_likes
  for insert
  to anon
  with check (
    photo_id ~ '^[A-Za-z0-9._:-]{1,128}$'
    and visitor_hash ~ '^[0-9a-f]{16,64}$'
    and coalesce(visitor_hash, '') <> ''
  );

drop policy if exists "anon can vote for a region" on public.region_votes;
create policy "anon can vote for a region"
  on public.region_votes
  for insert
  to anon
  with check (
    region_id ~ '^[A-Za-z0-9._:-]{1,128}$'
    and visitor_hash ~ '^[0-9a-f]{16,64}$'
    and coalesce(visitor_hash, '') <> ''
  );

-- -----------------------------------------------------------------------------
--  4. 读取策略：anon 能看到的**只有"自己那一行"**
-- -----------------------------------------------------------------------------
--  ★ 这里有一个必须讲清楚的取舍：为什么不是"一条 select 都不给"。
--
--  PostgREST 的 DELETE 需要能读到它要删的行。如果 anon 完全没有 SELECT 权限，
--  取消点赞就只剩两种写法：
--    a) 全部改成 security definer 的 RPC —— 完全可行，见本节的实现 B
--    b) 让 DELETE "成功但什么都没删掉" —— 不可接受，那正是本项目
--       明令禁止的"假装成功"
--  默认选「给 select，但限制到自己那一行」，因为它让取消点赞继续走标准的
--  PostgREST DELETE，而策略本身足够窄。**先讲清楚策略为什么读不到请求体**，
--  这决定了它只能写成什么形状：
--
--  ⚠️ 策略里拿不到请求体。PostgREST 把 body 作为**参数**（$1）绑定给 SQL，
--     不会把它注入成 GUC。GUC 路由只覆盖少数内置项（request.jwt.claims、
--     request.headers、request.cookies…）。
--     Postgres 团队在邮件列表里把"策略里读请求体"归为**当前不支持**
--     （https://www.postgresql.org/message-id/CAL_2APB_iOprV1M0LJ4Gx9HHw1wMDQ3_dc%2B4w9tE_j5VEqfJzA%40mail.gmail.com）。
--     所以 policy 里的 "调用者" 只能是：JWT claims（匿名请求里只有 role=anon）
--     或请求头。
--
--  ── 实现 A（本项目默认）：用自定义请求头
--      前端在所有**读**操作上带 `x-visitor-hash: <hash>`（见 client.ts 的 ownerHeaders）。
--      写操作不带——点赞不需要读，少暴露一次就少一次。
--      策略里的 using 通过下面的 tv_visitor_hash() 读取它，
--      实际效果：
--        · 不带这个头 → 函数返回空串 → 返回零行
--        · 带自己 hash 的头 → 只能看到自己那一行
--        · 带别人的 hash → 看到的是对方的行（equals 自己自称是对方），
--          但请求者**必须已经知道**那个 hash 才能这么做
--        · 因此 visitor_hash **无法被枚举**：想列出它们就得先猜中它们，
--          而 32 位十六进制猜测的成功率可以忽略。这是实现 A 的收益。
--      ㊟ 这个头不是身份，是可以随手改写的字符串。它挡住的是"顺手遍历"，
--        不是"蓄意冒充"。这是匿名方案的天花板，README 第 6 节逐条写明。
--      ㊟ 依赖一个未在任何标准里冻结的行为：PostgREST 把请求头放进
--        `request.headers` GUC（见 PostgREST 文档 Reference → Configuration）。
--        它是文档化的配置项，但**不是** SQL 标准。所以它只被用在这两条
--        select 策略和一条 delete 策略上——即使某天它变了，坏掉的也只是
--        "取消点赞"和"读取自己点过什么"，计数与点赞本身完全不受影响。
--
--  ── 实现 B（更紧，数据敏感时用）：不给 anon 任何 select/delete 授权，
--      只暴露一个 security definer 函数，连读路径都不存在：
--        create or replace function public.tv_unlike_photo(p_photo_id text, p_visitor_hash text)
--        returns integer language sql security definer set search_path = public as $$
--          with removed as (
--            delete from public.photo_likes
--             where photo_id = p_photo_id and visitor_hash = p_visitor_hash
--            returning 1
--          ) select count(*)::integer from removed;
--        $$;
--        grant execute on function public.tv_unlike_photo(text, text) to anon;
--      RPC 同样无法证明 p_visitor_hash 属于调用者（无登录就无身份），
--      但它把"能不能删"从"策略 + 头两处都要对"收敛到一个入口，
--      且完全不存在 visitor_hash 的读路径。切换成本：删掉本节两条策略，
--      在 120002 里收回 anon 的 select/delete，并改 client.ts 的两条路径。
--
--  为什么不用 `using (false)`：那会让 DELETE 的 using 也一起为假，
--  取消点赞变成静默无效。宁可窄，也不要假。

--  前置：一个把请求头读成"可安全比较的字符串"的函数。
--
--  为什么不把这段逻辑直接写进 using：
--  PostgREST 把自定义请求头放在 GUC 里，但**头的种类与它携带的值不可控**。
--  如果 GUC 不存在，`current_setting('request.headers')` 报错；
--  如果有人发一个非 JSON 的值，`::json` 转换报错。
--  这两种情况的后果都不只是"策略不通过"，而是**每一次 select 都报错**——
--  页面的计数会全变成错误状态，而且看起来像是数据库挂了。
--  把读取收敛成一个函数（并用 `::jsonb` 做安全解析）之后，
--  "取不到头"永远退化成一个空串，于是策略的结论是"看不到任何行"，
--  即安全的那一侧。
--
--  `set search_path = ''` + 全限定名：这是被策略调用的函数，必须是
--  可预测的。它没有 security definer（不需要，它不碰任何表）。
--
--  头名用 `x-visitor-hash`：
--    · 以 `x-` 开头是自定义头的约定，不会和任何标准头冲突
--    · 小写：PostgREST 把请求头转成小写 key 后再放进 GUC，写成大写会永远取不到
--    · 前端固定发这个头（src/lib/interactions/client.ts 的 ownerHeader）
create or replace function public.tv_visitor_hash()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::jsonb ->> 'x-visitor-hash',
    ''
  )
$$;

comment on function public.tv_visitor_hash() is
  '从 PostgREST 暴露的 request.headers GUC 中取出 x-visitor-hash，取不到则返回空串（策略据此拒绝）。';

grant execute on function public.tv_visitor_hash() to anon, authenticated;

drop policy if exists "anon reads own likes only" on public.photo_likes;
create policy "anon reads own likes only"
  on public.photo_likes
  for select
  to anon
  using (visitor_hash = public.tv_visitor_hash());

drop policy if exists "anon reads own votes only" on public.region_votes;
create policy "anon reads own votes only"
  on public.region_votes
  for select
  to anon
  using (visitor_hash = public.tv_visitor_hash());

-- -----------------------------------------------------------------------------
--  5. 取消策略：只能删"请求里自称的那个 hash"
-- -----------------------------------------------------------------------------
--  using 决定"哪些行可以删"，而匿名请求能提供的只有请求头。所以同样是
--  实现 A 的形式：删的必须是 x-visitor-hash 声称的那个 hash。
--  · 没有 x-visitor-hash 头 → tv_visitor_hash() 返回空串 →
--    没有任何行的 hash 等于空串（check 约束保证长度 ≥ 16）→ 一行都删不掉。
--    这是安全的方向：忘了带头就是"什么都删不了"，而不是"什么都能删"。
--  · 自称别人的 hash → 能删掉对方的行。**这是本方案的已知缺口**，
--    见 README 第 6 节。挡住它需要登录态，代价远大于收益。
--  · 写操作（INSERT）**不需要**带这个头，因此一个只点赞不取消的页面
--    永远不会暴露自己的令牌。
drop policy if exists "anon can remove own like" on public.photo_likes;
create policy "anon can remove own like"
  on public.photo_likes
  for delete
  to anon
  using (visitor_hash = public.tv_visitor_hash());

drop policy if exists "anon can remove own vote" on public.region_votes;
create policy "anon can remove own vote"
  on public.region_votes
  for delete
  to anon
  using (visitor_hash = public.tv_visitor_hash());

-- -----------------------------------------------------------------------------
--  6. 明确**不**创建的策略（写出来是为了让"没有"成为可见的决定）
-- -----------------------------------------------------------------------------
--  RLS 是"默认拒绝"：没有策略的操作就是被拒绝的。下面这些不是漏写：
--
--  · update 策略 —— 一个都没有。两张表都没有需要修改的字段，
--    "改主意"的语义是 delete 或 insert，不是 update。
--    没有策略 + 已 revoke 授权 = 双重关闭。
--  · anon 之外的 select 策略 —— 没有。authenticated 连表权限都没有。
--  · "所有人都能读计数"的 select 策略 —— **刻意没有**。
--    计数是通过 security definer 的 RPC 暴露的（120003），
--    这样计数可以公开，而"谁赞了什么"永远出不去。

-- -----------------------------------------------------------------------------
--  7. 收尾自检：让配置错了就地失败
-- -----------------------------------------------------------------------------
--  这四项任何一项不对，都意味着"看起来配好了，其实没配好"：
do $$
declare
  missing text[];
begin
  -- (a) RLS 必须是开着的
  if not (select relrowsecurity from pg_class where oid = 'public.photo_likes'::regclass) then
    raise exception 'photo_likes 的 RLS 没有打开';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.region_votes'::regclass) then
    raise exception 'region_votes 的 RLS 没有打开';
  end if;

  -- (b) anon 不能持有 update 权限
  if has_table_privilege('anon', 'public.photo_likes', 'update')
     or has_table_privilege('anon', 'public.region_votes', 'update') then
    raise exception 'anon 仍然持有 update 权限，revoke 没有生效';
  end if;

  -- (c) 策略必须都在。少一条的后果不是"报错"，而是"某个功能静默不生效"——
  --     例如缺 select 策略时取消点赞会返回 204 但什么都没删。所以宁可这里炸。
  select array_agg(p) into missing
  from (
    values ('anon reads own likes only'), ('anon can like a photo'), ('anon can remove own like')
  ) as t(p)
  where not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'photo_likes' and policyname = t.p
  );
  if missing is not null then
    raise exception 'photo_likes 缺少策略：%', array_to_string(missing, ', ');
  end if;

  select array_agg(p) into missing
  from (
    values ('anon reads own votes only'), ('anon can vote for a region'), ('anon can remove own vote')
  ) as t(p)
  where not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'region_votes' and policyname = t.p
  );
  if missing is not null then
    raise exception 'region_votes 缺少策略：%', array_to_string(missing, ', ');
  end if;

  -- (d) 读取请求头的那个函数必须在，且必须不是 security definer
  --     （它不碰表，没有理由获得 owner 权限；给了就是白白多一个提权面）
  if to_regprocedure('public.tv_visitor_hash()') is null then
    raise exception '缺少函数 public.tv_visitor_hash()，三条策略会全部失效';
  end if;
  if (select prosecdef from pg_proc where oid = 'public.tv_visitor_hash()'::regprocedure) then
    raise exception 'tv_visitor_hash() 不应该是 security definer';
  end if;
end
$$;

-- -----------------------------------------------------------------------------
--  RLS 做不到的事（这一节是文档，不是可执行 SQL）
-- -----------------------------------------------------------------------------
--  1. 限流。RLS 只能回答"这一行允不允许"，它拿不到"过去一小时一共写了几次"——
--     那是聚合查询，而策略表达式里子查询的可见性取决于调用者的策略
--     （在策略里写 count(*) 子查询非常容易写成一个自己看不见自己的怪东西）。
--     限流的正确位置是 BEFORE INSERT 触发器 / RPC，见 120004。
--  2. 区分真人。无登录 = 无身份，任何"一人一票"的说法在这里都不成立。
--  3. 阻止自称。见第 5 节。
--  4. 隐藏计数。计数一旦公开，就可以通过差分被观测（反复读，
--     自己点一下看差值）。这是"公开计数"的固有代价，不是配置问题。
--  5. 保护数据库之外的任何东西。anon key 是公开的，任何人都能直接
--     对着 PostgREST 发请求；RLS 是唯一挡在中间的东西。
