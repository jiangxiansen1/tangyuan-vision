/**
 * interactions/client.ts — the Supabase REST (PostgREST) access layer.
 *
 * WHY THERE IS NO @supabase/supabase-js DEPENDENCY HERE
 * The whole data layer needs five HTTP calls: two aggregate RPCs, one filtered
 * SELECT and three INSERT/DELETE. supabase-js brings a client that also owns
 * auth, realtime channels, storage, edge functions and session persistence —
 * roughly 100 kB of runtime that this site would never call, plus its own
 * release cadence and its own CVE surface. A hand-written fetch wrapper over
 * PostgREST is about 200 lines, has no transitive dependencies, and makes the
 * exact wire format auditable in one file. That trade is only defensible
 * because the API surface is this small — if it grew to real-time subscriptions
 * or storage uploads, taking the dependency would be the right call.
 *
 * WHAT POSTGREST NEEDS FROM EVERY REQUEST
 *   apikey: <anon key>        — identifies the project (and the anon role)
 *   Authorization: Bearer …   — same key when there is no signed-in user
 *   Content-Type: application/json + Prefer: return=representation on writes
 * The anon key is a PUBLIC value: it is inlined into the bundle at build time
 * and anyone can read it. It grants nothing on its own — everything it can do
 * is decided by the RLS policies in supabase/migrations/20261009120002. That is
 * why the key belongs in a VITE_* variable and a service_role key never does:
 * the service_role key BYPASSES RLS, so publishing it would hand over the
 * database.
 *
 * ERRORS ARE TRANSLATED, NEVER SWALLOWED
 * PostgREST answers with `{ message, code, details, hint }`. Postgres error
 * codes are stable and machine-readable, so they are mapped to a small set of
 * InteractionErrorCode values. The one that matters most for this feature is
 * 23505: it is the UNIQUE(photo_id, visitor_hash) constraint doing its job, and
 * it must surface as "你已经赞过了" — an outcome, not a failure.
 */

import { deriveVisitorHash, peekVisitorHash } from './visitor';
import type {
  BackendKind,
  InteractionErrorCode,
  InteractionsConfig,
  OperationResult,
} from './types';

/* =========================================================== configuration */

const RAW_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const RAW_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/**
 * Remove the trailing slash so `new URL(path, origin)` cannot produce `//rest`.
 * A trailing slash is the single most common copy-paste artefact from the
 * Supabase dashboard, and it would otherwise turn every request into a 404 that
 * looks like a permissions problem.
 */
function normaliseUrl(raw: string): string {
  return raw.replace(/\/+$/, '');
}

/**
 * Detect a JWT's role without decoding anything.
 *
 * WHY THIS EXISTS: the most damaging mistake available to a site owner is
 * pasting the `service_role` key into VITE_SUPABASE_ANON_KEY. That key bypasses
 * Row Level Security completely, so the site would appear to work perfectly
 * while handing every visitor full read/write access to every row. It is worth
 * three lines of base64 inspection to refuse that configuration outright.
 *
 * This is a safety net, not a security control: it cannot stop someone who is
 * determined to publish their own secret, and it does not attempt to verify the
 * signature. It only refuses to *use* an obviously wrong key.
 */
function looksLikeSecretKey(key: string): boolean {
  if (key.startsWith('sb_secret_')) return true;
  // A modern publishable key is `sb_publishable_…`; an anon key is a JWT whose
  // payload carries `"role":"anon"`. Anything mentioning service_role is wrong.
  if (key.includes('service_role')) return true;
  const parts = key.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return payload.includes('"service_role"');
  } catch {
    return false;
  }
}

/**
 * Resolve the configuration once, at module load.
 *
 * The three failure branches produce three different Chinese sentences, because
 * "未配置" and "填错了" need different actions from whoever maintains the site.
 * Nothing is guessed and nothing is auto-enabled: an absent URL means the
 * interaction UI reports 'unconfigured' and shows no numbers at all.
 */
export function resolveConfig(): InteractionsConfig {
  if (!RAW_URL) {
    return { configured: false, reason: 'no-url' };
  }
  try {
    const parsed = new URL(RAW_URL);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { configured: false, reason: 'bad-url' };
    }
  } catch {
    return { configured: false, reason: 'bad-url' };
  }
  if (!RAW_KEY) {
    return { configured: false, reason: 'no-key' };
  }
  if (looksLikeSecretKey(RAW_KEY)) {
    // Deliberately surfaced even in production builds. A wrong key must be
    // loud, because the alternative (silently working with elevated rights) is
    // far worse than a visible "未配置".
    return { configured: false, reason: 'no-key' };
  }
  return { configured: true, kind: 'database' };
}

/**
 * The request origin, normalised so a trailing slash in the dashboard's
 * copy-paste string cannot produce `//rest/v1` (which answers 404 and looks
 * indistinguishable from a permissions problem). Empty when the URL is absent
 * or unparseable, in which case no request is ever built from it.
 */
const ORIGIN = (() => {
  try {
    return normaliseUrl(new URL(RAW_URL).origin);
  } catch {
    return '';
  }
})();

/** Human-readable explanation for each unconfigured reason. */
export const CONFIG_MESSAGES: Record<string, string> = {
  'no-url': '未配置 Supabase 项目地址（VITE_SUPABASE_URL），点赞与投票功能不可用。',
  'bad-url': 'VITE_SUPABASE_URL 不是合法的网址，点赞与投票功能不可用。',
  'no-key': '未配置有效的 anon 公钥（VITE_SUPABASE_ANON_KEY），点赞与投票功能不可用。',
  'no-crypto': '当前浏览器环境不支持 WebCrypto（需要 HTTPS），无法生成访客去重令牌。',
};

/* =============================================================== transport */

/**
 * How long a visitor waits before we call it a failure.
 *
 * 8 s: long enough for a slow mobile connection to answer a tiny JSON request,
 * short enough that a visitor on a captive-portal Wi-Fi sees an error instead
 * of an indefinitely spinning button. A hung request is not a success and must
 * not be rendered as one.
 */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * The header that lets the database scope SELECT/DELETE to the caller's own
 * rows. See 20261009120002_interactions_grants_rls.sql §4 for the policy that
 * reads it, and §6 of supabase/README.md for what it does and does not prove.
 *
 * It is sent ONLY on reads and deletes. An INSERT needs no identity, so a
 * visitor who only ever likes things never puts their token in a header at all
 * — one fewer place for it to be logged.
 */
function ownerHeaders(hash: string): Record<string, string> {
  return { 'x-visitor-hash': hash };
}

interface PostgrestErrorBody {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

/** Translate a Postgres/PostgREST error code into this layer's vocabulary. */
function mapDatabaseError(status: number, body: PostgrestErrorBody | null): {
  code: InteractionErrorCode;
  error: string;
  retryAfterSeconds?: number;
} {
  const rawCode = body?.code ?? '';
  const message = body?.message ?? `HTTP ${status}`;

  switch (rawCode) {
    // UNIQUE violation. The database did its job: this is a normal outcome, and
    // the caller turns it into "你已经赞过了" rather than an error state.
    case '23505':
      return { code: 'already_recorded', error: '你已经记录过一次了。' };

    // CHECK constraint / invalid text representation / malformed JSON body.
    case '23514':
    case '22P02':
    case '22023':
      return { code: 'invalid_input', error: '提交的标识格式不被接受。' };

    // Raised by the rate-limit trigger (20261009120004). The hint carries the
    // number of seconds the caller should wait; it is parsed rather than
    // re-derived so the message and the trigger can never disagree.
    case '53400': {
      const seconds = Number.parseInt(body?.hint ?? '', 10);
      const retry = Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
      return {
        code: 'rate_limited',
        error: retry ? `操作过于频繁，请等 ${retry} 秒后再试。` : '操作过于频繁，请稍后再试。',
        ...(retry ? { retryAfterSeconds: retry } : {}),
      };
    }

    // An RLS policy said no, or a GRANT is missing. This is nearly always a
    // deployment error (migration not run, grants not revoked), so the message
    // points at the migration rather than blaming the visitor.
    case '42501':
      return {
        code: 'denied',
        error: '数据库拒绝了这次操作（缺少权限或 RLS 策略未生效）。请确认迁移已全部执行。',
      };

    // PostgREST's own codes.
    case 'PGRST202':
      return {
        code: 'denied',
        error: '数据库里找不到对应的函数。请确认 supabase/migrations 已全部执行。',
      };
    case 'PGRST204':
    case 'PGRST205':
      return {
        code: 'denied',
        error: '数据库里找不到对应的表。请确认 supabase/migrations 已全部执行。',
      };
    default:
      break;
  }

  // No recognisable code: keep the backend's own words instead of inventing a
  // friendlier sentence. A wrong friendly message costs an hour of debugging.
  return { code: status >= 500 ? 'server' : 'unknown', error: message };
}

interface RequestOptions {
  /** e.g. `/rest/v1/photo_likes` or `/rest/v1/rpc/tv_photo_like_counts` */
  path: string;
  method?: 'GET' | 'POST' | 'DELETE';
  /** Query string without the leading `?`. */
  query?: string;
  body?: unknown;
  /** Extra headers — used to send x-visitor-hash on reads/deletes. */
  headers?: Record<string, string>;
  /**
   * Some endpoints are legitimately allowed to answer with no body (a DELETE
   * with return=minimal). When true, a 200/204 with an empty body yields `null`
   * instead of an error.
   */
  allowEmpty?: boolean;
}

/**
 * One request. Returns the same Result shape as everything else, so a network
 * failure never becomes an exception that the UI has to remember to catch.
 *
 * Nothing here is retried automatically. A retry on a POST could double-write,
 * and a retry on a timeout would multiply the wait a visitor experiences. If
 * retries are ever wanted they belong above this function, where the caller
 * knows whether the operation is safe to repeat.
 */
async function request<T>(options: RequestOptions): Promise<OperationResult<T>> {
  const url = `${ORIGIN}${options.path}${options.query ? `?${options.query}` : ''}`;

  const headers: Record<string, string> = {
    apikey: RAW_KEY,
    // With the anon key as the bearer token the request is evaluated by the
    // `anon` role, which is exactly the role the RLS policies are written for.
    Authorization: `Bearer ${RAW_KEY}`,
    Accept: 'application/json',
    ...options.headers,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    // Ask PostgREST to echo the written row back. Without this a successful
    // insert answers 201 with no body, and we would have no way to distinguish
    // "the row was created" from "the response was empty for another reason" —
    // and the rule here is that an unverifiable write is never reported as a
    // success.
    headers.Prefer = 'return=representation';
  }

  let response: Response;
  try {
    const init: RequestInit = {
      method: options.method ?? 'GET',
      headers,
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    };
    // AbortSignal.timeout is available in every browser this project targets
    // (es2022 baseline). It is defensive-checked because the failure mode of
    // getting it wrong here would be an "expected identifier" crash at load.
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    }
    response = await fetch(url, init);
  } catch (err) {
    const aborted = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return {
      ok: false,
      code: aborted ? 'timeout' : 'network',
      error: aborted ? '请求超时，未能连接数据库。' : '无法连接数据库（网络不可用或被拦截）。',
    };
  }

  // Read the body as text first: an empty body and an invalid JSON body are
  // different problems, and response.json() would collapse them into one.
  let text = '';
  try {
    text = await response.text();
  } catch {
    text = '';
  }

  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const mapped = mapDatabaseError(response.status, (parsed as PostgrestErrorBody | null) ?? null);
    return { ok: false, code: mapped.code, error: mapped.error, ...(mapped.retryAfterSeconds !== undefined ? { retryAfterSeconds: mapped.retryAfterSeconds } : {}) };
  }

  if (text === '' || parsed === null) {
    if (options.allowEmpty) return { ok: true, data: null as T };
    // A 2xx with nothing in it. We cannot know whether the write landed, so we
    // say so instead of assuming it did.
    return {
      ok: false,
      code: 'no_row',
      error: '数据库返回了空响应，无法确认操作是否生效。',
    };
  }

  return { ok: true, data: parsed as T };
}

/* ================================================================= backend */

/**
 * The operations `photos.ts` and `regions.ts` are written against.
 *
 * Both the real backend and the DEMO backend implement this interface, which is
 * what lets the demo be a small in-memory file instead of a parallel copy of the
 * whole layer. It also means `getBackend()` is the single place that decides
 * between them — there is no second switch to forget.
 */
export interface InteractionsBackend {
  readonly kind: BackendKind;
  photoLikeCounts(photoIds: string[]): Promise<OperationResult<PhotoCountRow[]>>;
  photoLikeTop(limit: number): Promise<OperationResult<PhotoCountRow[]>>;
  likePhoto(photoId: string, hash: string): Promise<OperationResult<WriteAnswer>>;
  unlikePhoto(photoId: string, hash: string): Promise<OperationResult<{ removed: number }>>;
  regionVoteCounts(regionIds: string[]): Promise<OperationResult<RegionCountRow[]>>;
  regionVoteTop(limit: number): Promise<OperationResult<RegionCountRow[]>>;
  voteRegion(regionId: string, hash: string): Promise<OperationResult<WriteAnswer>>;
  unvoteRegion(regionId: string, hash: string): Promise<OperationResult<{ removed: number }>>;
  /** Only the real backend can answer this: which ids this visitor has liked/voted. */
  ownedPhotoIds(hash: string, photoIds: string[]): Promise<OperationResult<string[]>>;
  ownedRegionIds(hash: string, regionIds: string[]): Promise<OperationResult<string[]>>;
}

export interface PhotoCountRow {
  photo_id: string;
  like_count: number;
}

export interface RegionCountRow {
  region_id: string;
  vote_count: number;
}

/** What the database reports back about a single write attempt. */
export interface WriteAnswer {
  /** 1 when a row was inserted, 0 when the UNIQUE constraint rejected it. */
  inserted: number;
}

/**
 * Maximum number of ids a single batch read will carry.
 *
 * Mirrors the server-side guard in 20261009120003 (unnest over an unbounded
 * array is a free amplification primitive). Enforced on this side too so an
 * over-long list is a visible client-side decision rather than a server error
 * the visitor cannot act on.
 */
export const MAX_BATCH_IDS = 512;

const ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * Drop ids the database would reject anyway (length, character set).
 *
 * Done here, in one place, because these ids come from content files: a typo in
 * photography.json would otherwise produce a 400 for the whole batch and take
 * every count on the page down with it. Silently dropping a malformed id is
 * correct here because the loader separately reports missing images and bad
 * records (see src/content/index.ts).
 */
export function sanitiseIds(ids: string[]): string[] {
  return ids.filter((id) => typeof id === 'string' && ID_PATTERN.test(id)).slice(0, MAX_BATCH_IDS);
}

/**
 * The live backend. Everything is a thin PostgREST call; the interesting part
 * is the error mapping above and the read-back-after-write below.
 */
const databaseBackend: InteractionsBackend = {
  kind: 'database',

  async photoLikeCounts(photoIds) {
    const ids = sanitiseIds(photoIds);
    if (ids.length === 0) return { ok: true, data: [] };
    const result = await request<PhotoCountRow[]>({
      path: '/rest/v1/rpc/tv_photo_like_counts',
      method: 'POST',
      body: { photo_ids: ids },
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data ?? [] };
  },

  async photoLikeTop(limit) {
    const result = await request<PhotoCountRow[]>({
      path: '/rest/v1/rpc/tv_top_photos',
      method: 'POST',
      body: { p_limit: limit },
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data ?? [] };
  },

  async likePhoto(photoId, hash) {
    const result = await request<Array<{ id: string }>>({
      path: '/rest/v1/photo_likes',
      method: 'POST',
      body: { photo_id: photoId, visitor_hash: hash },
    });

    if (!result.ok) {
      // 23505 is the constraint doing its job. It is NOT a failure of the
      // request, so it is reported as an answer: inserted = 0.
      if (result.code === 'already_recorded') {
        return { ok: true, data: { inserted: 0 } };
      }
      return result;
    }
    const rows = result.data ?? [];
    // An empty representation after a 2xx is not proof of a write.
    return { ok: true, data: { inserted: rows.length > 0 ? 1 : 0 } };
  },

  async unlikePhoto(photoId, hash) {
    const result = await request<Array<{ id: string }>>({
      path: '/rest/v1/photo_likes',
      query: `photo_id=eq.${encodeURIComponent(photoId)}`,
      method: 'DELETE',
      headers: ownerHeaders(hash),
      // A DELETE of a row that is not there answers 204 with no body, which is
      // correct and must not be dressed up as a failure — it is honestly
      // reported as removed: 0.
      allowEmpty: true,
    });
    if (!result.ok) return result;
    return { ok: true, data: { removed: (result.data ?? []).length } };
  },

  async regionVoteCounts(regionIds) {
    const ids = sanitiseIds(regionIds);
    if (ids.length === 0) return { ok: true, data: [] };
    const result = await request<RegionCountRow[]>({
      path: '/rest/v1/rpc/tv_region_vote_counts',
      method: 'POST',
      body: { region_ids: ids },
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data ?? [] };
  },

  async regionVoteTop(limit) {
    const result = await request<RegionCountRow[]>({
      path: '/rest/v1/rpc/tv_top_regions',
      method: 'POST',
      body: { p_limit: limit },
    });
    if (!result.ok) return result;
    return { ok: true, data: result.data ?? [] };
  },

  async voteRegion(regionId, hash) {
    const result = await request<Array<{ id: string }>>({
      path: '/rest/v1/region_votes',
      method: 'POST',
      body: { region_id: regionId, visitor_hash: hash },
    });
    if (!result.ok) {
      if (result.code === 'already_recorded') {
        return { ok: true, data: { inserted: 0 } };
      }
      return result;
    }
    const rows = result.data ?? [];
    return { ok: true, data: { inserted: rows.length > 0 ? 1 : 0 } };
  },

  async unvoteRegion(regionId, hash) {
    const result = await request<Array<{ id: string }>>({
      path: '/rest/v1/region_votes',
      query: `region_id=eq.${encodeURIComponent(regionId)}`,
      method: 'DELETE',
      headers: ownerHeaders(hash),
      allowEmpty: true,
    });
    if (!result.ok) return result;
    return { ok: true, data: { removed: (result.data ?? []).length } };
  },

  /**
   * Which of these photos has THIS visitor already liked.
   *
   * This is the only query that needs the owner header, and the reason the
   * select policy exists at all. It answers with complete honesty: if the
   * request fails, callers get a failure and must render "unknown" rather than
   * a heart that looks un-liked. A row's photo_id is the only column read, so
   * visitor_hash is never echoed back into the page.
   */
  async ownedPhotoIds(hash, photoIds) {
    const ids = sanitiseIds(photoIds);
    if (ids.length === 0) return { ok: true, data: [] };
    // PostgREST `in.(a,b,c)` — every id has already passed ID_PATTERN, so no
    // value can contain a comma, quote or parenthesis that would break the list.
    const list = ids.join(',');
    const result = await request<Array<{ photo_id: string }>>({
      path: '/rest/v1/photo_likes',
      query: `photo_id=in.(${list})&select=photo_id`,
      headers: ownerHeaders(hash),
    });
    if (!result.ok) return result;
    return { ok: true, data: (result.data ?? []).map((row) => row.photo_id) };
  },

  async ownedRegionIds(hash, regionIds) {
    const ids = sanitiseIds(regionIds);
    if (ids.length === 0) return { ok: true, data: [] };
    const list = ids.join(',');
    const result = await request<Array<{ region_id: string }>>({
      path: '/rest/v1/region_votes',
      query: `region_id=in.(${list})&select=region_id`,
      headers: ownerHeaders(hash),
    });
    if (!result.ok) return result;
    return { ok: true, data: (result.data ?? []).map((row) => row.region_id) };
  },
};

/* ============================================================ demo backend */

/**
 * The runtime half of the DEMO gate: the flags that are NOT known at build time.
 *
 * ⚠️ THE BUILD-TIME HALF MUST BE WRITTEN AT THE CALL SITE, NOT IN HERE.
 * Vite replaces `import.meta.env.DEV` with the literal `false` for a production
 * build, and `false && …` folds away — but only where the optimiser can see it.
 * A wrapper function is opaque across a module boundary: Rollup keeps the
 * function, the call and the dynamic import, and ships a demo chunk that can
 * never run. So every call site below reads
 * `import.meta.env.DEV && demoRequested()`, inline, which makes the whole branch
 * statically dead in production. This is verified with a real production build
 * (see supabase/README.md §8.5), not assumed.
 *
 * `?demo=1` is the part that matters day to day: a developer with the flag in
 * their .env still does not see fabricated numbers unless they ask for them in
 * the address bar.
 */
const DEMO_FLAG_SET = (import.meta.env.VITE_TV_DEMO as string | undefined) === '1';

function demoRequested(): boolean {
  if (!DEMO_FLAG_SET) return false;
  try {
    return new URLSearchParams(window.location.search).get('demo') === '1';
  } catch {
    // A hardened browser that refuses URLSearchParams must not enable the demo;
    // failing closed here means "no demo", which is always the safe side.
    return false;
  }
}

export type BackendState =
  | { kind: 'database'; backend: InteractionsBackend }
  | { kind: 'demo'; backend: InteractionsBackend }
  | { kind: 'unconfigured'; reason: string };

/**
 * Which backend the UI should talk to.
 *
 * Order matters: DEMO is checked before configuration, because a developer with
 * no Supabase project is exactly who the demo is for. In production the first
 * branch is statically dead — `import.meta.env.DEV` is inlined as `false` right
 * here, where the optimiser can see it — so a real deployment can only ever be
 * 'database' or 'unconfigured', and `demo.ts` is not emitted at all.
 */
export async function getBackend(): Promise<BackendState> {
  if (import.meta.env.DEV && demoRequested()) {
    const { createDemoBackend } = await import('./demo');
    return { kind: 'demo', backend: createDemoBackend() };
  }
  const config = resolveConfig();
  if (!config.configured) {
    return { kind: 'unconfigured', reason: config.reason };
  }
  return { kind: 'database', backend: databaseBackend };
}

/**
 * What the backend will be, known synchronously.
 *
 * A hook's first render happens before any promise can settle, and returning
 * `null` there would make the UI flash a "no data" state that is not true. This
 * reports the decision without loading the demo module, which is why it returns
 * a state and not a backend: there is nothing an async-free caller could safely
 * call yet. `getBackend()` remains the only way to obtain something callable.
 */
export type BackendStatus =
  | { kind: 'demo' }
  | { kind: 'database' }
  | { kind: 'unconfigured'; reason: string };

export function backendStatusNow(): BackendStatus {
  // Same inline build-time guard as getBackend(), for the same reason.
  if (import.meta.env.DEV && demoRequested()) return { kind: 'demo' };
  const config = resolveConfig();
  if (!config.configured) return { kind: 'unconfigured', reason: config.reason };
  return { kind: 'database' };
}

/* ================================================================ helpers */

/**
 * Resolve the visitor hash for a write, or produce the failure the UI shows.
 *
 * Every write goes through here, so "no token ⇒ no write ⇒ an honest error"
 * is stated once instead of at four call sites.
 */
export async function requireVisitorHash(): Promise<OperationResult<string>> {
  const cached = peekVisitorHash();
  if (cached) return { ok: true, data: cached };
  return deriveVisitorHash();
}

/** Re-export for callers that only need the message for an unconfigured state. */
export function messageForReason(reason: string): string {
  return CONFIG_MESSAGES[reason] ?? '互动功能未配置。';
}

/* ================================================== resolved backend cache */

let sharedPromise: Promise<OperationResult<InteractionsBackend>> | null = null;

/**
 * The single memoised backend lookup, shared by photos.ts and regions.ts.
 *
 * WHY IT IS HERE AND NOT IN EACH FEATURE FILE
 * A page with photos AND a region list mounts both modules in the same tick. If
 * each resolved the backend independently there would be two configuration
 * parses, two error strings that could drift apart, and — worse — two places to
 * edit when the DEMO rules change. One promise means the answer is computed once
 * and is identical everywhere, including its failure message.
 *
 * The failure is cached too: a deployment that is missing its environment
 * variables must not re-run the check on every call, and a session must not
 * change which backend it is talking to halfway through.
 */
export function sharedBackend(): Promise<OperationResult<InteractionsBackend>> {
  sharedPromise ??= (async () => {
    const state = await getBackend();
    if (state.kind === 'unconfigured') {
      return {
        ok: false as const,
        code: 'unconfigured' as const,
        error: messageForReason(state.reason),
      };
    }
    return { ok: true as const, data: state.backend };
  })();
  return sharedPromise;
}

/**
 * Forget the memoised backend.
 *
 * For tests, and for `vite dev`, where editing .env restarts the server but not
 * the module graph in a way that is guaranteed to clear this. Nothing in the UI
 * calls it.
 */
export function resetBackendCache(): void {
  sharedPromise = null;
}
