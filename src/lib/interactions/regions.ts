/**
 * interactions/regions.ts — the "我也想去" (I want to go too) vote operations.
 *
 * Structurally identical to photos.ts, and deliberately NOT sharing an
 * implementation with it. See the note at the end of this file for why that
 * duplication is the cheaper choice here.
 *
 * The one behavioural difference worth remembering: a vote is a statement of
 * intent about a place, so the UI copy matters more than the arithmetic. A
 * failed vote must read as "没有记录上" and never as "已记录，谢谢参与" — the
 * latter is the fabricated success this project exists to avoid.
 */

import { requireVisitorHash, sanitiseIds, sharedBackend } from './client';
import type {
  OperationResult,
  RegionRankEntry,
  RegionVoteCount,
  RegionVoteCounts,
  RemoveOutcome,
  WriteOutcome,
} from './types';

/* --------------------------------------------------------------- backend -- */

// One memoised lookup for the whole interaction layer, in client.ts.

/**
 * Concurrent-write guard. The reason it exists rather than relying on a
 * disabled button is documented in photos.ts — briefly: two clicks inside a
 * single frame both reach the network before React can re-render, and the only
 * thing that makes a duplicate truly impossible is UNIQUE(region_id,
 * visitor_hash) in the database.
 */
const inFlight = new Set<string>();

function keyFor(action: string, id: string): string {
  return `${action}:${id}`;
}

/* ------------------------------------------------------------------ read -- */

/**
 * Vote counts for a list of region ids.
 *
 * Same contract as its photo counterpart: an entry per well-formed id,
 * `count: 0` only when the database actually counted zero, and a failure
 * instead of a number when the database could not be reached.
 */
export async function getVoteCounts(regionIds: string[]): Promise<OperationResult<RegionVoteCounts>> {
  const ids = sanitiseIds(regionIds);
  if (ids.length === 0) {
    return { ok: true, data: { kind: 'database', counts: [], votedStateKnown: true } };
  }

  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const totals = await db.regionVoteCounts(ids);
  if (!totals.ok) return totals;

  const byId = new Map<string, number>();
  ids.forEach((id) => byId.set(id, 0));
  totals.data.forEach((row) => {
    if (byId.has(row.region_id)) byId.set(row.region_id, Number(row.vote_count) || 0);
  });

  let owned: Set<string> | null = null;
  const hash = await requireVisitorHash();
  if (hash.ok) {
    const ownedResult = await db.ownedRegionIds(hash.data, ids);
    if (ownedResult.ok) owned = new Set(ownedResult.data);
  }

  const counts: RegionVoteCount[] = ids.map((regionId) => ({
    regionId,
    count: byId.get(regionId) ?? 0,
    votedByVisitor: owned?.has(regionId) ?? false,
  }));

  return { ok: true, data: { kind: db.kind, counts, votedStateKnown: owned !== null } };
}

/** The "most wanted" ranking, ordered and limited by the database. */
export async function getTopRegions(
  limit = 10
): Promise<OperationResult<{ kind: 'database' | 'demo'; entries: RegionRankEntry[] }>> {
  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const result = await db.regionVoteTop(limit);
  if (!result.ok) return result;

  const entries = result.data
    .filter((row) => sanitiseIds([row.region_id]).length === 1)
    .map((row) => ({ regionId: row.region_id, count: Number(row.vote_count) || 0 }));

  return { ok: true, data: { kind: db.kind, entries } };
}

/* ----------------------------------------------------------------- write -- */

/**
 * Vote for a region.
 *
 * A duplicate answers `ok: true, applied: false` with no count — the database
 * rejected it via UNIQUE and nothing changed. Reporting a count here would mean
 * either re-reading a number that did not move (harmless but pointless) or
 * adding one (a fabricated number, which is not acceptable at any size).
 */
export async function voteRegion(regionId: string): Promise<OperationResult<WriteOutcome>> {
  if (sanitiseIds([regionId]).length !== 1) {
    return { ok: false, code: 'invalid_input', error: '地区标识不合法，无法投票。' };
  }

  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const guard = keyFor('vote', regionId);
  if (inFlight.has(guard)) {
    return { ok: false, code: 'unknown', error: '正在处理上一步操作，请稍候。' };
  }
  inFlight.add(guard);
  try {
    const hash = await requireVisitorHash();
    if (!hash.ok) return hash;

    const written = await db.voteRegion(regionId, hash.data);
    if (!written.ok) return written;

    if (written.data.inserted === 0) {
      return { ok: true, data: { kind: db.kind, applied: false, count: null } };
    }

    const totals = await getVoteCounts([regionId]);
    if (!totals.ok) {
      // The vote is recorded; only the read-back failed. `applied: true` with
      // `count: null` is the only statement that is true in both halves.
      return { ok: true, data: { kind: db.kind, applied: true, count: null } };
    }
    return {
      ok: true,
      data: { kind: db.kind, applied: true, count: totals.data.counts[0]?.count ?? null },
    };
  } finally {
    inFlight.delete(guard);
  }
}

/**
 * Remove this visitor's vote.
 *
 * `removed: 0` is a successful request that changed nothing, and the UI must say
 * so plainly. The other reason a removal can affect zero rows is that the row
 * belongs to a different token — which can only happen if someone sent a hash
 * that was not theirs. See supabase/README.md §6.
 */
export async function unvoteRegion(regionId: string): Promise<OperationResult<RemoveOutcome>> {
  if (sanitiseIds([regionId]).length !== 1) {
    return { ok: false, code: 'invalid_input', error: '地区标识不合法，无法取消。' };
  }

  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const guard = keyFor('unvote', regionId);
  if (inFlight.has(guard)) {
    return { ok: false, code: 'unknown', error: '正在处理上一步操作，请稍候。' };
  }
  inFlight.add(guard);
  try {
    const hash = await requireVisitorHash();
    if (!hash.ok) return hash;

    const removed = await db.unvoteRegion(regionId, hash.data);
    if (!removed.ok) return removed;

    return { ok: true, data: { kind: db.kind, removed: removed.data.removed } };
  } finally {
    inFlight.delete(guard);
  }
}

/* ------------------------------------------------------------------- why -- */

// WHY THIS FILE IS A NEAR-COPY OF photos.ts RATHER THAN SHARING A GENERIC
//
// A generic `createInteractionApi(table, idColumn)` would remove roughly sixty
// lines. It would also introduce a runtime string that selects a table and a
// column, which is exactly the shape of a mistake that cannot be caught by the
// compiler: a typo in `region_votes` becomes an empty count in production, not a
// build error. The current version has every table name and column name written
// literally, and the return types differ (`PhotoLikeCount` vs `RegionVoteCount`),
// so a mix-up between the two features is a type error.
//
// The two files are also expected to diverge: regions are likely to gain a
// country/region hierarchy and a "visited / want to go / been there" tri-state,
// while photos will not. Sharing an implementation now would make that divergence
// a rewrite instead of an edit.
