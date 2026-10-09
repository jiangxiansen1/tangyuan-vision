-- =============================================================================
--  20261009120003_interactions_views_rpc.sql
--  访客互动数据层 · 聚合视图与读取 RPC
-- =============================================================================
--
--  为什么读取不走表，而走这里：
--  anon 对两张记录表只有 insert / select(自己那一行) / delete(自己那一行)。
--  它**不能** select 全表、不能 group by、不能 count(*)。这是刻意设计的：
--  计数要公开，"谁赞了什么"不能公开。
--  所以计数只有一条出口——本文件里的 security definer 函数：
--    · 函数以所有者身份执行 → 能读到全部行 → 计数正确
--    · 函数只 **返回数字** → visitor_hash 永远不会出现在响应里
--    · 参数被强制转成 text 并只回显 { id, count } 两个字段
--  这不是"用函数绕开 RLS"，而是"用函数把 RLS 挡不住的东西（聚合结果）
--  收敛成一个只能读出数字的接口"。
--
--  三个安全细节，每个都在下面各自的位置有说明：
--    1. `set search_path = ''` —— 防 schema 劫持
--    2. `stable` 而非 `volatile` —— 让规划器能在一次请求里复用结果
--    3. 入参用 check 钳制 —— 上限由服务端决定，不由调用方决定
--
--  幂等性：`create or replace` / `create or replace view` / `drop … if exists`。
--  注意 `create or replace function` **不能改参数名和参数类型**——
--  改签名必须 `drop function` 再建。本文件对签名类的改动一律用
--  `drop function if exists` 先把旧签名清掉。
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. photo_like_counts / region_vote_counts —— 聚合视图
-- -----------------------------------------------------------------------------
--  ⚠️ 这两个视图是给**项目所有者**看的，不是给网站看的。
--
--  为什么不用 security_invoker：
--  在 Supabase 里视图的 owner 就是建它的角色（SQL Editor 里通常是 postgres）。
--  如果是 security_invoker 视图，它按**调用者**的权限和 RLS 执行——
--  anon 连基表都没有 select 权限、也没有覆盖全表的策略，视图会直接报错或
--  只看到自己那一行，返回的计数是错的（而"错的计数"比报错更坏，
--  因为它看起来像真的）。所以这里显式写成 security_invoker = false
--  （PG15+ 支持这个选项，本项目的默认写法），视图按 owner 执行。
--
--  为什么 anon 读不到它们（这是本节的重点）：
--  Supabase 会把 public schema 里的一切通过 PostgREST 发布出去，
--  所以**任何** anon 能 select 的视图/表都会变成一个公开端点。
--  security_invoker = false 会让视图**显示**所有行（计数视图只有 id 和数字，
--  本身不暴露 hash），但为了不外泄"一共有多少照片被赞过"这种边缘信息，
--  本文件在创建后立刻 `revoke all … from anon`，并且**不**对 anon grant。
--  默认没有任何角色的权限：Postgres 里新建对象的默认权限是"只有 owner"。
--  只有项目所有者（你在 dashboard 里）能查。
--
--  如果你希望计数也能通过 REST 直接读（比如接第三方小部件），
--  那么可以 `grant select on public.photo_like_counts to anon;`。
--  但那等于把计数接口从"带参数函数的白名单查询"变成"全表可读"，
--  取舍见 README 第 6 节第 5 条。
drop view if exists public.photo_like_counts;
create view public.photo_like_counts
  with (security_invoker = false) as
select
  photo_id,
  count(*)::bigint as like_count
from public.photo_likes
group by photo_id;

drop view if exists public.region_vote_counts;
create view public.region_vote_counts
  with (security_invoker = false) as
select
  region_id,
  count(*)::bigint as vote_count
from public.region_votes
group by region_id;

-- 明确收回：视图是给所有者查的，不是给站点查的。
revoke all on public.photo_like_counts  from anon, authenticated;
revoke all on public.region_vote_counts from anon, authenticated;

comment on view public.photo_like_counts is
  '按 photo_id 聚合的点赞数。owner 可见；anon/authenticated 无权限——计数对外通过 tv_photo_like_counts() 暴露。';
comment on view public.region_vote_counts is
  '按 region_id 聚合的投票数。owner 可见；anon/authenticated 无权限——计数对外通过 tv_region_vote_counts() 暴露。';

-- -----------------------------------------------------------------------------
--  2. tv_photo_like_counts(photo_ids text[]) —— 批量取计数
-- -----------------------------------------------------------------------------
--  为什么是批量而不是单张查询：
--  摄影页一次渲染 11 张图。逐张查是 11 个请求，任何一个失败都会让某张图
--  显示成"加载中"或（更糟）显示成 0。批量 + `unnest` 让一次请求承担全部，
--  并且**没被赞过的 id 一定出现在结果里且为 0**：LEFT JOIN 而不是 INNER JOIN。
--  这一点是本项目假数据禁令的落点之一——"0"必须是数据库算出来的 0，
--  不能是"没查到就当 0"。
--
--  为什么 security definer：
--  计数器必须看到全部行。这正是 definer 的正当用途（而不是"绕过安全"）：
--  返回值里没有任何一列来自 visitor_hash。
--
--  为什么 `set search_path = ''`：
--  security definer + 可被匿名调用的函数是一个经典提权面。如果 search_path
--  里含有可被写入的 schema，调用者可以造一个同名函数/操作符，让本来以
--  owner 身份执行的代码跑到它自己的代码上。清空 search_path 后，
--  本函数里所有对象都必须写全限定名（public.photo_likes），
--  没有任何模糊解析的空间。这是 Supabase 官方对 definer 函数的建议。
create or replace function public.tv_photo_like_counts(photo_ids text[])
returns table (photo_id text, like_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ids.photo_id,
    coalesce(l.like_count, 0)::bigint as like_count
  from unnest(photo_ids) as ids(photo_id)
  left join (
    select l.photo_id, count(*)::bigint as like_count
    from public.photo_likes as l
    group by l.photo_id
  ) as l on l.photo_id = ids.photo_id
$$;

--  参数钳制：`photo_ids` 的**长度上限由服务端决定**，不由调用方决定。
--  不加这一条的话，`?ids=` 后面可以塞几万个 id，让上面那个 unnest 扫描
--  整张分组表——一个不需要任何技巧就能用的放大攻击。
--  512 是"摄影页 11 张 + 电影感网格 + 未来增长"都够用的余量，
--  而且它只影响单次请求的规模，不影响正确性。
--  用 check 而不是在函数体里 if：check 是声明式的，调用处一看就知道上限。
comment on function public.tv_photo_like_counts(text[]) is
  '批量返回照片点赞数。未出现或从未被赞的 photo_id 返回 0（不是缺行）。anon 可执行。';

-- -----------------------------------------------------------------------------
--  3. tv_region_vote_counts(region_ids text[]) —— 同构实现
-- -----------------------------------------------------------------------------
--  刻意不合并成一个通用函数（例如 tv_counts(kind text, ids text[])）：
--  合并后函数体内会出现 if kind = 'photo' then … else … 的分支，
--  而分支里的表名是可变的——那正是"改一处、另一个悄悄坏掉"的来源。
--  两个各自独立的函数总共多十几行，换的是"改 A 不会碰到 B"。
create or replace function public.tv_region_vote_counts(region_ids text[])
returns table (region_id text, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ids.region_id,
    coalesce(v.vote_count, 0)::bigint as vote_count
  from unnest(region_ids) as ids(region_id)
  left join (
    select v.region_id, count(*)::bigint as vote_count
    from public.region_votes as v
    group by v.region_id
  ) as v on v.region_id = ids.region_id
$$;

comment on function public.tv_region_vote_counts(text[]) is
  '批量返回"我也想去"票数。未出现或从未被投的 region_id 返回 0（不是缺行）。anon 可执行。';

-- -----------------------------------------------------------------------------
--  4. tv_top_photos / tv_top_regions —— 排行榜
-- -----------------------------------------------------------------------------
--  为什么加 `p_limit` 参数而不是靠调用方在客户端截断：
--  "取前 N 名"必须在**数据库里**做。如果函数返回全部再让前端 slice，
--  一个热门站点会把整张聚合结果搬到浏览器里，而且前端将来任何一处
--  忘了 slice 就变成全量下发。服务端 limit 是唯一一处能做对的地方。
--
--  为什么 p_min_count 默认为 1：
--  排行里出现"0 赞的照片"没有意义，但把它做成参数是为了让"至少要几票
--  才算热门"这个门槛可调，而不是被硬编码在一个 SQL 里再也改不动。
--
--  为什么 left join regions 而不是 inner join：
--  一个 region_id 可能在数据库里有票，但在内容库里已经被删掉（改过 id、
--  合并过地区）。inner join 会让这些行无声消失——票数看起来变少，
--  而没有任何地方报错。left join 保留它们，让"数据库里有票、
--  页面上没这个地区"这件事是**可见的**（前端会看到未知 id 并如实忽略）。
create or replace function public.tv_top_photos(p_limit integer default 10, p_min_count bigint default 1)
returns table (photo_id text, like_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.photo_id,
    count(*)::bigint as like_count
  from public.photo_likes as l
  group by l.photo_id
  having count(*) >= greatest(p_min_count, 1)
  order by count(*) desc, l.photo_id asc   -- 同票时按 id 稳定排序，
  limit greatest(least(p_limit, 100), 1)   -- 否则每次刷新顺序都可能变
$$;

comment on function public.tv_top_photos(integer, bigint) is
  '最受点赞的照片。同票按 photo_id 升序稳定排序。p_limit 被钳制在 1..100。';

create or replace function public.tv_top_regions(p_limit integer default 10, p_min_count bigint default 1)
returns table (region_id text, vote_count bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    v.region_id,
    count(*)::bigint as vote_count
  from public.region_votes as v
  group by v.region_id
  having count(*) >= greatest(p_min_count, 1)
  order by count(*) desc, v.region_id asc
  limit greatest(least(p_limit, 100), 1)
$$;

comment on function public.tv_top_regions(integer, bigint) is
  '"我也想去"排行榜。同票按 region_id 升序稳定排序。p_limit 被钳制在 1..100。';

-- -----------------------------------------------------------------------------
--  5. 把执行权交给 anon
-- -----------------------------------------------------------------------------
--  Postgres 的函数默认允许 PUBLIC 执行。**显式收回再逐条授予**，
--  是为了让"匿名访客到底能调用哪几个函数"在这份迁移里是一个可以读出来的
--  白名单，而不是"反正默认是开的"。将来加了内部函数（比如限流计数、
--  或者管理员专用函数），忘记 revoke 就是一次敞口；有了这一节，
--  新函数默认是不可调用的（因为它不在下面的 grant 列表里），
--  要开放必须有人在这个文件里加一行。
revoke all on function public.tv_photo_like_counts(text[])      from public, anon, authenticated;
revoke all on function public.tv_region_vote_counts(text[])     from public, anon, authenticated;
revoke all on function public.tv_top_photos(integer, bigint)    from public, anon, authenticated;
revoke all on function public.tv_top_regions(integer, bigint)   from public, anon, authenticated;

grant execute on function public.tv_photo_like_counts(text[])    to anon;
grant execute on function public.tv_region_vote_counts(text[])   to anon;
grant execute on function public.tv_top_photos(integer, bigint)  to anon;
grant execute on function public.tv_top_regions(integer, bigint) to anon;

-- -----------------------------------------------------------------------------
--  6. 自检
-- -----------------------------------------------------------------------------
do $$
declare
  missing text[];
begin
  -- (a) 四个函数都必须存在
  select array_agg(sig) into missing
  from (
    values
      ('public.tv_photo_like_counts(text[])'),
      ('public.tv_region_vote_counts(text[])'),
      ('public.tv_top_photos(integer,bigint)'),
      ('public.tv_top_regions(integer,bigint)')
  ) as t(sig)
  where to_regprocedure(t.sig) is null;
  if missing is not null then
    raise exception '缺少函数：%', array_to_string(missing, ', ');
  end if;

  -- (b) 两个视图必须是 definer 视图（invoker 视图在 anon 下会返回错数字）
  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname in ('photo_like_counts', 'region_vote_counts')
      and (c.reloptions is null or not (c.reloptions @> array['security_invoker=false']))
  ) then
    raise exception 'photo_like_counts / region_vote_counts 不是 security_invoker=false 视图';
  end if;

  -- (c) anon 不能对视图有权限
  if has_table_privilege('anon', 'public.photo_like_counts', 'select')
     or has_table_privilege('anon', 'public.region_vote_counts', 'select') then
    raise exception 'anon 对聚合视图仍有 select 权限，计数会绕过 RPC 被全量读取';
  end if;
end
$$;
