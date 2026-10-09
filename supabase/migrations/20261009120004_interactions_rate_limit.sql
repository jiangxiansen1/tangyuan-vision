-- =============================================================================
--  20261009120004_interactions_rate_limit.sql
--  访客互动数据层 · 时间窗限流（RLS 做不到的那件事）
-- =============================================================================
--
--  ★ 先说清楚为什么这个文件必须存在
--  RLS 只回答一个问题："这一行允不允许被写"。它**没有**"过去一小时写了几次"
--  这个概念——那是聚合，而策略表达式里既拿不到请求体、也不适合做跨行统计
--  （策略里的子查询会带上调用者自己的策略，很容易写成一个自己看不见自己的
--  怪东西）。所以"同一台设备别刷屏"必须落在写路径上：BEFORE INSERT 触发器。
--
--  触发器的位置很关键：
--    · 放在 RLS 之后（BEFORE INSERT 触发器）：策略先放行，触发器再判时间窗。
--      两者是独立的闸门，任何一道拒绝都拦截。
--    · 放在应用层（前端节流）：只是礼貌，任何人绕过页面直接打 REST 就没了。
--      本项目**不**把前端节流写成"限流"，它只是体验优化。
--
--  这不是完美的限流。它挡的是"一台浏览器狂点"和"一个脚本用一个令牌刷"，
--  挡不住"一个脚本每次换一个令牌"。原因见下面第 3 节的说明，
--  README 第 6 节也重复了一遍——因为它是最容易被承诺过头的地方。
--
--  幂等性：函数用 create or replace，触发器用 drop if exists 再建。
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. 时间窗表：把"最近一次写入"记在独立的小表里
-- -----------------------------------------------------------------------------
--  为什么不用 `select count(*) from photo_likes where visitor_hash = … and
--  created_at > now() - interval '1 minute'`：
--    1. 那张表将来会有几十万行，而这个查询要在**每次插入前**跑一遍。
--       真正的限流表最多只有"最近有活动的令牌"那么多行，可以被清理到很小。
--    2. 记录表会被"取消点赞"删掉行。如果限流依赖记录表，
--       删掉再点一次就等于绕过了限流——一个可以被正常功能打开的缺口。
--       限流表**从不删除**（除非到了保留期），因此窗口是真实的。
--  两张表的 UNIQUE 约束保证每个令牌每个桶只有一行，所以这张表天然有界：
--  行数 ≤ 令牌数 × 桶数，而不是 ≤ 写入次数。
create table if not exists public.interaction_rate_limit (
  visitor_hash text        not null,
  -- 写入的**内容 id**，不区分照片/地区。理由见第 3 节"为什么按令牌跨表计数"。
  bucket       text        not null,
  window_start timestamptz not null default now(),
  last_write   timestamptz not null default now(),
  hits         integer     not null default 1,

  constraint interaction_rate_limit_pkey primary key (visitor_hash, bucket),
  constraint interaction_rate_limit_hits_positive check (hits > 0)
);

comment on table public.interaction_rate_limit is
  '限流状态表。每个 (令牌, 内容id) 一行，记录窗口起点、最后写入时间与命中的限流次数。与照片/地区记录表独立，因此删除点赞不会重置限流。';

-- 清理任务按 last_write 扫描（见第 5 节）。
create index if not exists interaction_rate_limit_last_write_idx
  on public.interaction_rate_limit (last_write);

--  这张表对任何客户端都不可见：它记着 visitor_hash，
--  而且它的内容属于"服务端内部状态"，没有任何理由对外暴露。
--  RLS 打开 + 一条策略都不建 = 只有 definer 函数与所有者能碰。
--  （触发器函数是 security definer，所以它读得到。）
alter table public.interaction_rate_limit enable row level security;
alter table public.interaction_rate_limit force row level security;
revoke all on table public.interaction_rate_limit from anon, authenticated;

-- -----------------------------------------------------------------------------
--  2. 限额参数：一个函数，而不是散落在各处的魔法数字
-- -----------------------------------------------------------------------------
--  300 秒 / 20 次：
--    · 单个访客的合理行为是"看一圈，喜欢就点"，几十次点击不会集中在 5 分钟内。
--    · 20 次/5 分钟 ≈ 4 次/分钟，对真人足够宽松；
--      对脚本而言，把 11 张照片刷满需要 5 分钟，成本足够高到不值得。
--    · 这两个数字**故意写成一个函数**（而不是触发器里的字面量），
--      因为将来要调的时候只改一处，而且"限额是多少"这个问题有唯一答案。
--  改法：直接 `create or replace` 这一节，不需要动触发器。
create or replace function public.tv_interaction_limit_seconds()
returns integer language sql immutable as $$ select 300 $$;

create or replace function public.tv_interaction_limit_max_writes()
returns integer language sql immutable as $$ select 20 $$;

-- -----------------------------------------------------------------------------
--  3. 限流判定函数（两个表共用）
-- -----------------------------------------------------------------------------
--  为什么按 **令牌** 而不是按 **IP** 计数：
--  Frontend 拿不到访客的 IP（浏览器不会告诉页面）。Supabase 的边缘层知道 IP，
--  但它不会把真实 IP 交给 PostgREST 的策略或触发器（x-forwarded-for 可以被
--  伪造，用它做安全决策比不用更危险）。所以按令牌计数是这个架构里唯一
--  能做到的事——也因此它能被"换令牌"绕过。
--
--  为什么两个表共用一个函数（bucket 参数）：
--  限流状态按 (令牌, 内容id) 记录，但**判定时按令牌汇总**——
--  也就是说，五分钟内无论点照片还是投地区，都算同一个额度。
--  这是一个刻意的选择：如果分表计数，脚本可以交替打两个端点，
--  把额度翻倍。合并计数让"跨表刷"没有额外收益。
--  代价：一个真的又点照片又投地区的访客会更快撞到上限。20 次足够覆盖。
--
--  为什么返回 table 而不是 boolean：
--  前端需要能告诉访客"还有多久可以再点"。只返回 true/false 会让 UI 只能
--  显示一句无信息量的"操作失败"。返回 {allowed, retry_after_seconds,
--  window_seconds} 让提示可以是具体的（"请等 42 秒后再试"）。
create or replace function public.tv_rate_limit_check(
  p_visitor_hash text,
  p_bucket       text
)
returns table (allowed boolean, retry_after_seconds integer, window_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit_seconds integer := public.tv_interaction_limit_seconds();
  v_max_writes    integer := public.tv_interaction_limit_max_writes();
  v_total_hits    integer;
  v_oldest        timestamptz;
begin
  -- 没带令牌就拒绝。空字符串会通过 varchar 的类型检查但没有任何去重意义，
  -- 放到这里拒绝比放进策略更容易解释（限流表也就不用处理空值）。
  if p_visitor_hash is null or p_visitor_hash = '' then
    return query select false, v_limit_seconds, v_limit_seconds;
    return;
  end if;

  -- 本令牌在当前窗口内所有内容上的写入次数之和。
  -- window_start > now() - interval 而不是 last_write：两者的差别在
  -- "第一次写入之后第 280 秒又写了一次"这种情况——按 last_write 判定会
  -- 滑动窗口无限续期，一个每 4 分钟点一次的人可以永远点下去。
  select coalesce(sum(rl.hits), 0),
         min(rl.window_start)
    into v_total_hits, v_oldest
    from public.interaction_rate_limit as rl
   where rl.visitor_hash = p_visitor_hash
     and rl.window_start > now() - make_interval(secs => v_limit_seconds);

  if v_total_hits >= v_max_writes then
    -- 最早那次写入的窗口过期时，额度回来一格。
    return query
      select
        false,
        greatest(
          1,
          ceil(extract(epoch from (v_oldest + make_interval(secs => v_limit_seconds) - now())))::integer
        ),
        v_limit_seconds;
    return;
  end if;

  return query select true, 0, v_limit_seconds;
end;
$$;

comment on function public.tv_rate_limit_check(text, text) is
  '时间窗限流判定。按令牌跨内容汇总计数。返回 allowed / retry_after_seconds / window_seconds。仅由触发器调用，anon 无执行权。';

-- -----------------------------------------------------------------------------
--  4. 写入限流状态（触发器调用）
-- -----------------------------------------------------------------------------
--  这个函数只做一件事：把这次写入记进限流表。
--  注意它与 tv_rate_limit_check 是分开的：判定失败时**不记**状态
--  （否则被拒绝的尝试也会消耗额度，让攻击者能用一次失败把受害者锁住……
--  虽然这里没有"受害者"，但"被拒绝的尝试不算数"是更符合直觉的语义：
--  额度只统计真正写进数据库的成功操作）。
create or replace function public.tv_rate_limit_record(
  p_visitor_hash text,
  p_bucket       text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit_seconds integer := public.tv_interaction_limit_seconds();
begin
  insert into public.interaction_rate_limit as rl (visitor_hash, bucket, window_start, last_write, hits)
  values (p_visitor_hash, p_bucket, now(), now(), 1)
  on conflict (visitor_hash, bucket) do update
     set last_write = now(),
         -- 窗口过期则开新窗；否则累加。这个 CASE 是"固定窗口"的实现：
         -- 简单、可预测、每令牌每桶只占一行。滑动窗口更平滑，
         -- 但需要一个额外的历史表，对这个场景收益不明显。
         hits         = case
                          when rl.window_start <= now() - make_interval(secs => v_limit_seconds)
                            then 1
                          else rl.hits + 1
                        end,
         window_start = case
                          when rl.window_start <= now() - make_interval(secs => v_limit_seconds)
                            then now()
                          else rl.window_start
                        end;
end;
$$;

-- -----------------------------------------------------------------------------
--  5. 触发器函数：两张表共用
-- -----------------------------------------------------------------------------
--  NEW.visitor_hash / NEW.photo_id / NEW.region_id 在 plpgsql 里是 record
--  的字段，需要 `to_jsonb(NEW)` 取出，再用 TG_ARGV 选择取哪一个 id 列。
--  用 TG_ARGV 而不是写两个几乎相同的函数：这两段逻辑的任何一处改动都
--  应该在两张表上同时生效，复制成两份只会让它们将来分叉。
create or replace function public.tv_enforce_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row    jsonb := to_jsonb(new);
  v_hash   text  := v_row ->> 'visitor_hash';
  v_id_col text  := coalesce(tg_argv[1], 'photo_id');
  v_bucket text  := v_row ->> v_id_col;
  v_check  record;
begin
  select * into v_check from public.tv_rate_limit_check(v_hash, v_bucket);

  if not v_check.allowed then
    --  抛 53400（configuration_limit_exceeded）。
    --  为什么不用一个自定义 SQLSTATE：PostgREST 会把未知的 5 位状态码
    --  原样放进响应的 `code` 字段，前端 client.ts 会把 53400 映射成
    --  中文的"太频繁了，请 N 秒后再试"。用标准状态码的好处是不会被
    --  PostgREST 的已知错误表改写语义（例如 23505 会被当成唯一冲突）。
    --  ERRCODE 之外的 P0001 会被当作普通错误、丢掉自解释的语义。
    raise exception
      '写入过于频繁，请在 % 秒后重试', v_check.retry_after_seconds
      using errcode = '53400',
            hint = greatest(v_check.retry_after_seconds, 1)::text;
  end if;

  perform public.tv_rate_limit_record(v_hash, v_bucket);
  return new;
end;
$$;

--  触发器必须 SECURITY DEFINER 吗？是的，而且这是刻意的：
--  触发器函数默认按**调用者**（anon）身份执行，而 anon 对限流表没有任何
--  权限（上面 revoke 了），触发器会在第一步就报权限错误。
--  definer + 空 search_path 让它能读写限流表，同时不接受调用者的任何
--  名字解析影响。
drop trigger if exists photo_likes_rate_limit on public.photo_likes;
create trigger photo_likes_rate_limit
  before insert on public.photo_likes
  for each row
  execute function public.tv_enforce_rate_limit('photo_id');

drop trigger if exists region_votes_rate_limit on public.region_votes;
create trigger region_votes_rate_limit
  before insert on public.region_votes
  for each row
  execute function public.tv_enforce_rate_limit('region_id');

-- -----------------------------------------------------------------------------
--  6. 内部函数的执行权：收回
-- -----------------------------------------------------------------------------
--  这几个函数是**内部**实现，不是 API。
--  · tv_rate_limit_check / tv_rate_limit_record 由 definer 触发器调用，
--    不需要任何客户端执行权。放开它只会多两个能被匿名调用的聚合查询端点
--    （可以被用来探测"某个令牌是否活跃"）。
--  · tv_enforce_rate_limit 是触发器函数：直接调用它在 Postgres 里会报错
--    （触发器函数不能作为普通函数直接调用），但仍然显式收回，保持
--    "anon 能执行什么"在这份仓库里是一个可以 grep 出来的清单。
revoke all on function public.tv_rate_limit_check(text, text)
  from public, anon, authenticated;
revoke all on function public.tv_rate_limit_record(text, text)
  from public, anon, authenticated;
revoke all on function public.tv_enforce_rate_limit()
  from public, anon, authenticated;
-- 注意：tv_interaction_limit_seconds() / _max_writes() 保持默认
-- （可被任何角色执行）是**故意的**：它们是两个只读的常量，
-- 前端和服务端需要读同一组数字。让它们保持一致，比"保密"重要得多。

-- -----------------------------------------------------------------------------
--  7. 清理：限流表必须会被清理，否则它就是一张只涨不掉的小表
-- -----------------------------------------------------------------------------
--  Supabase 免费版自带 pg_cron（在 Database → Extensions 里启用）。
--  这一节是**幂等且可选**的：如果 pg_cron 没启用，它只是跳过并留下一条
--  warning，不会让迁移失败（一个"可选功能没配"不应该挡住整个迁移）。
--
--  保留期取 24 小时：远大于 5 分钟窗口，因此清理永远不会把仍在生效的
--  窗口删掉，同时又让这张表只保留"最近一天活跃过的令牌"。
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise warning
      '[tv] 未检测到 pg_cron，限流表的自动清理未启用。手动清理：delete from public.interaction_rate_limit where last_write < now() - interval ''24 hours''; 详见 supabase/README.md 第 7 节。';
    return;
  end if;

  -- cron.schedule 对同名任务会覆盖，因此重复执行是安全的。
  perform cron.schedule(
    'tv-prune-rate-limit',
    '17 4 * * *',   -- 每天 04:17 UTC，避开整点（那个时刻 Supabase 侧任务最密）
    $cron$delete from public.interaction_rate_limit where last_write < now() - interval '24 hours'$cron$
  );

  raise notice '[tv] 已注册每日清理任务 tv-prune-rate-limit';
exception
  when others then
    -- 例如当前角色没有 cron 权限。清理是维护性的，不应该让迁移失败。
    raise warning '[tv] 注册自动清理失败（%）。请按 supabase/README.md 第 7 节手动清理。', sqlerrm;
end
$$;

-- -----------------------------------------------------------------------------
--  8. 自检
-- -----------------------------------------------------------------------------
do $$
declare
  missing text[];
begin
  select array_agg(t) into missing
  from (values ('photo_likes_rate_limit'), ('region_votes_rate_limit')) as v(t)
  where not exists (
    select 1 from pg_trigger
    where tgname = v.t and not tgisinternal
  );
  if missing is not null then
    raise exception '缺少触发器：%', array_to_string(missing, ', ');
  end if;

  if has_function_privilege('anon', 'public.tv_rate_limit_check(text,text)', 'execute') then
    raise exception 'anon 仍能执行 tv_rate_limit_check，内部函数不应对外开放';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.interaction_rate_limit'::regclass) then
    raise exception 'interaction_rate_limit 的 RLS 没有打开';
  end if;
end
$$;

-- ⚠️ 最后如实说明这个限流挡不住什么（README 第 6 节有完整清单）：
--   1. 换令牌。清掉 localStorage 就得到一个新的 visitor_hash，
--      额度从头开始。要挡住它必须有登录（或 Supabase 匿名登录 + JWT claim），
--      那是另一套架构。
--   2. 大量并发的不同令牌。触发器串行不了跨令牌的意图，但数据库本身
--      会正常写入——这是限流的配额问题，不是正确性问题。
--   3. 分布式脚本同时用几百个令牌打。免费版有项目级的带宽/请求配额，
--      真正的兜底在那里（以及随时可以暂停项目）。
--   4. 触发器的判定是"按令牌汇总"，所以一个令牌在照片和地区上的额度是共享的。
--      这是刻意设计（防跨表刷），代价写在上面第 3 节。
