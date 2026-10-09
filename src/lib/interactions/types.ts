/**
 * interactions/types.ts — the result vocabulary for the visitor-interaction layer.
 *
 * WHY EVERY FUNCTION RETURNS A RESULT INSTEAD OF THROWING OR RETURNING DATA
 * This project's hardest rule is that a fabricated success is worse than a
 * visible failure. A like button that increments a number optimistically, or a
 * counter that renders "0" when the query failed, are both lies of that kind:
 * the visitor cannot tell them apart from the truth.
 *
 * So the layer has exactly one way to report an outcome: a discriminated union
 * that a caller must narrow before it can see any data. There is no code path
 * that returns a number it did not obtain from the backend, and no code path
 * that reports success while the write did not happen.
 *
 * `code` is a STRING, never a raw Postgres/PostgREST integer, because the
 * message shown to a visitor depends on the meaning, not on the vendor's
 * numbering (see client.ts → mapDatabaseError, which is the only place that
 * translates one into the other).
 */

/**
 * The kind of backend that produced a value.
 *
 * `database` — came from Supabase. `demo` — came from the in-memory DEMO
 * backend, which only exists during `pnpm dev` with VITE_TV_DEMO=1.
 *
 * It is part of the success type on purpose: the UI is then unable to render a
 * demo number without having been handed the fact that it is demo data. The
 * "DEMO" badge is therefore not a convention that can be forgotten — it is
 * enforced by the type.
 */
export type BackendKind = 'database' | 'demo';

/** Why the interaction backend is not usable, in a form the UI can explain. */
export type UnconfiguredReason =
  /** VITE_SUPABASE_URL is absent or not a usable URL. */
  | 'no-url'
  /** VITE_SUPABASE_URL is present but is not a URL a browser can call. */
  | 'bad-url'
  /** VITE_SUPABASE_ANON_KEY is absent, or is a secret key pasted by mistake. */
  | 'no-key'
  /** The environment looks right but this browser is too old to sign a request. */
  | 'no-crypto';

/**
 * Configuration state, checked once at module load.
 *
 * Only `configured: true` may be used to build a client. `configured: false`
 * carries the reason, which the UI shows verbatim rather than a generic
 * "出错了" — a visitor who is told "未配置 Supabase" can act on it, one who is
 * told "加载失败" cannot. It also stops the site from ever pretending the counts
 * are merely late.
 */
export type InteractionsConfig = { configured: true; kind: BackendKind } | { configured: false; reason: UnconfiguredReason };

/** The half of an outcome that means "the backend answered, and here is the data". */
export interface OperationSuccess<T> {
  ok: true;
  data: T;
}

/** The half of an outcome that means "this did not happen, and here is why". */
export interface OperationFailure {
  ok: false;
  /** Chinese, already safe to show in the interface. */
  error: string;
  /** Stable machine-readable identifier — see InteractionErrorCode. */
  code: InteractionErrorCode;
  /** Extra data for one specific case: how long the rate limiter wants the caller to wait. */
  retryAfterSeconds?: number;
}

/** Every read and write in this layer resolves to this. */
export type OperationResult<T> = OperationSuccess<T> | OperationFailure;

/**
 * The complete set of ways an interaction can fail. Kept small on purpose:
 * every member is a case the UI actually behaves differently for. Anything
 * that is not one of these becomes `unknown` with the backend's own message
 * attached, rather than being forced into a wrong bucket.
 */
export type InteractionErrorCode =
  /** Not configured / unreachable — nothing was written, nothing is known. */
  | 'unconfigured'
  /** The request never came back: offline, DNS, blocked, timeout. */
  | 'network'
  /** The backend answered with an error. `error` carries what it said. */
  | 'server'
  /** The database refused the row: shape, length, or a value outside the allowed set. */
  | 'invalid_input'
  /** UNIQUE(photo_id, visitor_hash) / UNIQUE(region_id, visitor_hash) rejected the duplicate. */
  | 'already_recorded'
  /** The rate-limit trigger's time window is full. Carries retryAfterSeconds. */
  | 'rate_limited'
  /** RLS or a missing GRANT said no. Almost always a deployment error, not a visitor error. */
  | 'denied'
  /** The write was accepted without an error but no row came back — never reported as success. */
  | 'no_row'
  /** Ran out of the caller's own patience (see REQUEST_TIMEOUT_MS). */
  | 'timeout'
  /** Anything unrecognised. The backend's raw message is in `error`. */
  | 'unknown';

/** A count for one photo. */
export interface PhotoLikeCount {
  photoId: string;
  /** **Total** likes for this photo, counted by the database over all visitors. */
  count: number;
  /** Whether *this visitor* has liked it, as far as the backend can tell. */
  likedByVisitor: boolean;
}

/** A count for one region. */
export interface RegionVoteCount {
  regionId: string;
  count: number;
  votedByVisitor: boolean;
}

/** One row of the "most liked" ranking. */
export interface PhotoRankEntry {
  photoId: string;
  count: number;
}

/** One row of the "most wanted" ranking. */
export interface RegionRankEntry {
  regionId: string;
  count: number;
}

/**
 * Batch read result.
 *
 * `kind` distinguishes real data from DEMO data so the UI can label it.
 * `totals` are the raw totals as returned by the backend, always integers:
 * we never coerce a missing entry into 0 here — the database's LEFT JOIN is
 * what produces a legitimate 0, and `getLikeCounts` only ever reports ids it
 * was asked about.
 *
 * An empty `counts` array with `ok: true` means "these ids genuinely have no
 * likes yet", which is a different statement from `ok: false` ("we do not
 * know"). That distinction is the whole point of this type.
 */
export interface PhotoLikeCounts {
  kind: BackendKind;
  counts: PhotoLikeCount[];
  /** True when the visitor's own like state could be read (it needs an extra query). */
  likedStateKnown: boolean;
}

export interface RegionVoteCounts {
  kind: BackendKind;
  counts: RegionVoteCount[];
  votedStateKnown: boolean;
}

/**
 * Result of a write that changes one count.
 *
 * Note there is no "already liked → ok, and here is +1": a duplicate writes
 * NOTHING (the UNIQUE constraint rejects it), so `applied: false` must never be
 * paired with a count that the caller could mistake for having grown.
 */
export interface WriteOutcome {
  kind: BackendKind;
  /** True only when a row was actually inserted. */
  applied: boolean;
  /**
   * The count AFTER the write, as read back from the database.
   *
   * `null` in two cases, both legitimate: the write was rejected as a duplicate
   * (nothing changed, so there is nothing to read back), or the write landed but
   * the follow-up count query failed. In the second case `applied` is still true
   * — the row IS in the database — so a caller that renders this must show the
   * count as unknown and re-read, never as the previous value and never as
   * `previous + 1`. A guessed increment is exactly the fabricated number this
   * project forbids.
   */
  count: number | null;
}

/** Result of removing one row. */
export interface RemoveOutcome {
  kind: BackendKind;
  /** Number of rows actually deleted. 0 is a legitimate, honestly reported answer. */
  removed: number;
}
