-- =============================================================================
--  20261009120001_interactions_schema.sql
--  访客互动数据层 · 表结构（schema only, no policies）
-- =============================================================================
--
--  这个文件只做一件事：把两张记录表和它们的约束建出来。
--  权限（grants）与 RLS 在 120002，聚合与读取 RPC 在 120003，限流在 120004。
--  分开是因为这三件事的失败模式完全不同：
--    · 表结构错了   → 数据写坏，且难以回滚
--    · 权限错了     → 数据泄露（最严重）
--    · 聚合/限流错了 → 只是数字不准或被人刷
--  分开以后，改任何一个都不需要碰另外两个。
--
--  幂等性：本文件可以在同一个项目上重复执行。
--  用法：`create table if not exists` / `create index if not exists` /
--  `alter table … add column if not exists`。没有一句 `drop`，因此重复执行
--  不会丢数据。注意：**不会**删除已存在的多余列或约束——那属于破坏性变更，
--  必须手写，不能藏在"幂等迁移"里。
--
--  ⚠️ 关于 `visitor_hash` 的定位（后面 120002 会反复用到）
--  它不是身份，不参与登录，也不是"用户"。它只是**尽力而为的去重令牌**：
--  浏览器本地生成一个随机 UUID，加盐做 SHA-256 后前 32 位十六进制。
--  换个浏览器、清一次站点数据、开无痕窗口，就是一条新记录。
--  所以这里的 UNIQUE 约束保证的是"同一个令牌对同一张照片只有一行"，
--  而不是"同一个人只能点一次赞"。见 supabase/README.md 第 6 节。
-- =============================================================================

-- -----------------------------------------------------------------------------
--  1. photo_likes — 每张照片的点赞记录
-- -----------------------------------------------------------------------------
--
--  为什么主键用 uuid 而不是 bigserial：
--  这两张表的主键对客户端完全不可见（anon 没有 SELECT 权限），所以它不承担
--  任何业务含义，只承担"这一行唯一"的职责。uuid 的好处是不泄露总量——
--  一个自增主键会通过任何可能的侧信道（比如未来某天放开的部分读取）暴露
--  "本站一共被点了多少次赞"。gen_random_uuid() 在 PG13+ 是内置函数，
--  不需要 uuid-ossp 扩展，Supabase 的 PG15/17 直接可用。
--
--  为什么 photo_id 是 text 而不是外键：
--  内容在 Git 仓库里（src/content/data/photography.json），不在数据库里。
--  构建期才有照片列表，数据库无法对它建外键，也不应该：数据库一旦持有一份
--  照片清单，就多出一个必须同步的副本。代价是**可以**写进一个不存在的
--  photo_id（例如 'x' 或别人删掉的照片）。这不是安全问题——它最多让那行
--  永远不被任何页面读出来——所以用 check 约束挡住明显垃圾，而不是假装
--  有引用完整性：
--    · 长度 1..128：挡住空串和超长垃圾
--    · 正则：只允许 [A-Za-z0-9._:-]，即内容 id 的实际字符集
--  真要做引用完整性，需要一个 photo_id 白名单表 + 构建期同步步骤，
--  本项目**没有**做，也没把它伪装成已做。
create table if not exists public.photo_likes (
  id           uuid        primary key default gen_random_uuid(),

  -- 内容 id，对应 src/content/types.ts 里 Photo.id。
  photo_id     text        not null,

  -- 去重令牌（见文件头说明）。64 位留足余量：现在写入 32 位十六进制，
  -- 将来若把摘要加长（比如完整 64 位 SHA-256），不需要迁移列类型。
  visitor_hash text        not null,

  -- timestamptz 而非 timestamp：这个值会被限流函数用来做时间窗比较，
  -- 而 Supabase 的数据库实例时区不是调用方可以假定的。带时区的时间戳
  -- 让"最近一小时"在任何实例上都是同一个含义。
  created_at   timestamptz not null default now(),

  constraint photo_likes_photo_id_len   check (char_length(photo_id) between 1 and 128),
  constraint photo_likes_photo_id_shape check (photo_id ~ '^[A-Za-z0-9._:-]+$'),
  constraint photo_likes_visitor_hash_shape check (visitor_hash ~ '^[0-9a-f]{16,64}$'),

  -- ★ 本文件最重要的一行。重复点赞在**数据库层**不可能发生：
  --   不是靠按钮变灰，不是靠 localStorage 记一下，而是唯一索引。
  --   并发双击、脚本刷、两条网络请求同时到达，都只会插入一行；
  --   第二行会以 Postgres 错误码 23505 失败，前端把它映射成
  --   "你已经点过赞了"（见 src/lib/interactions/client.ts 的 errorCode 映射）。
  --   用表级 UNIQUE 而不是唯一索引，是为了让"约束"在 \d+ 里一眼可见。
  constraint photo_likes_photo_id_visitor_hash_key unique (photo_id, visitor_hash)
);

-- 计数聚合（120003 的 RPC 与视图）都按 photo_id 分组。
create index if not exists photo_likes_photo_id_idx
  on public.photo_likes (photo_id);

-- 不为 (photo_id, visitor_hash) 单独建索引：上面那条 UNIQUE 约束已经
-- 自带了同列同序的索引，再建一条只是重复占空间。

comment on table public.photo_likes is
  '照片点赞记录。一行 = 同一个 visitor_hash 对同一张 photo_id 的一次点赞。匿名访客看不到本表的任何一行。';
comment on column public.photo_likes.visitor_hash is
  '尽力而为的去重令牌，不是身份。浏览器本地随机 UUID 加盐 SHA-256 后的前 32 位十六进制；清站点数据即重置。';

-- -----------------------------------------------------------------------------
--  2. region_votes — 每个国家/地区的"我也想去"投票
-- -----------------------------------------------------------------------------
--
--  结构与 photo_likes 完全对称。刻意**不**抽成一张多态表
--  （target_type + target_id）：多态表在 RLS 策略里会变成
--  `target_type = 'photo' and …` 这样的条件分支，一旦写错就是跨表越权；
--  而两张结构相同的表总共只多了十几行 DDL。
--  两张表的权限、聚合与限流函数也各自独立，改一个不会波及另一个。
--
--  region_id 指的是"国家/地区"，不是骑行路线（rides 里的 route-template-01）。
--  id 由构建期内容生成，同样不受数据库约束。
create table if not exists public.region_votes (
  id           uuid        primary key default gen_random_uuid(),
  region_id    text        not null,
  visitor_hash text        not null,
  created_at   timestamptz not null default now(),

  constraint region_votes_region_id_len   check (char_length(region_id) between 1 and 128),
  constraint region_votes_region_id_shape check (region_id ~ '^[A-Za-z0-9._:-]+$'),
  constraint region_votes_visitor_hash_shape check (visitor_hash ~ '^[0-9a-f]{16,64}$'),

  -- 与 photo_likes 同理：同一个令牌对一个地区只能投一票。
  constraint region_votes_region_id_visitor_hash_key unique (region_id, visitor_hash)
);

create index if not exists region_votes_region_id_idx
  on public.region_votes (region_id);

comment on table public.region_votes is
  '"我也想去"投票记录。一行 = 同一个 visitor_hash 对同一个 region_id 的一票。匿名访客看不到本表的任何一行。';
comment on column public.region_votes.visitor_hash is
  '尽力而为的去重令牌，不是身份。与会话、IP、账号均无关。';

-- -----------------------------------------------------------------------------
--  3. 自检：这一节故意写成会报错的形式
-- -----------------------------------------------------------------------------
--
--  迁移在 SQL Editor 里粘贴执行时，最容易被忽略的失败是"表建出来了，
--  但唯一约束没建出来"——那样 23505 永远不会出现，重复点赞会静默累积，
--  而前端看起来一切正常。所以这里主动断言一次，让缺约束的情况**立刻炸**，
--  而不是等三个月后在数据里发现重复行。
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.photo_likes'::regclass
      and contype  = 'u'
      and conname  = 'photo_likes_photo_id_visitor_hash_key'
  ) then
    raise exception 'photo_likes 缺少 UNIQUE(photo_id, visitor_hash) 约束，迁移未完成';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.region_votes'::regclass
      and contype  = 'u'
      and conname  = 'region_votes_region_id_visitor_hash_key'
  ) then
    raise exception 'region_votes 缺少 UNIQUE(region_id, visitor_hash) 约束，迁移未完成';
  end if;
end
$$;
