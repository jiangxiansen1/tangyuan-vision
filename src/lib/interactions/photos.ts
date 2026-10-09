/**
 * interactions/photos.ts — the photo "like" operations.
 *
 * The public surface is four functions and every one of them can say "I don't
 * know". That is the design: `getLikeCounts` either produces the numbers the
 * database gave it or a failure the UI can render, and there is no third
 * outcome that looks like a number.
 *
 * WHY THE BACKEND IS RESOLVED LAZILY AND ONCE
 * A page with eleven photos, a lightbox, and a "most liked" strip will call
 * these functions from several components in the same tick. Resolving the
 * backend per call would mean either several `import()`s of the demo module or
 * a second configuration parse each time. One memoised promise keeps the
 * decision singular — and, more importantly, keeps it in ONE file, so a future
 * change to the rules cannot leave half the calls on the old path.
 *
 * WHY `kind: 'demo'` SURVIVES ALL THE WAY TO THE CALLER
 * `counts.kind` is propagated into every result. The UI is then structurally
 * unable to render a demo number without also having been handed the fact that
 * it is demo data, which is what makes the DEMO badge a contract rather than a
 * convention someone can forget.
 */

import { requireVisitorHash, sanitiseIds, sharedBackend } from './client';
import type {
  OperationResult,
  PhotoLikeCount,
  PhotoLikeCounts,
  PhotoRankEntry,
  RemoveOutcome,
  WriteOutcome,
} from './types';

/* --------------------------------------------------------------- backend -- */

// `sharedBackend()` lives in client.ts: one memoised lookup for the whole layer,
// so photos and regions can never end up on different backends. See the note
// there for why the failure is cached as well as the success.

/**
 * Guard against the same photo being written twice concurrently.
 *
 * WHY THIS IS NOT JUST A DISABLED BUTTON: a disabled button is a rendering
 * decision, and rendering happens after the click. Two clicks inside one frame,
 * or a keyboard submit racing a pointer event, both reach the network before
 * any re-render. This set is checked at call time. The database's UNIQUE
 * constraint is still the thing that makes a duplicate impossible — this only
 * stops the UI from generating pointless requests, and turns the second one
 * into an honest "正在处理中" rather than a silent no-op.
 */
const inFlight = new Set<string>();

function keyFor(action: string, id: string): string {
  return `${action}:${id}`;
}

/* ------------------------------------------------------------------ read -- */

/**
 * Counts for a list of photo ids.
 *
 * Always returns an entry for every id that was asked about and is well-formed:
 * the totals come from the RPC's LEFT JOIN, which is what makes "0" a fact
 * rather than a fallback. Ids that fail the format check are dropped — and the
 * caller can detect that by comparing lengths, which is deliberate: a malformed
 * id in a content file is a content bug that should be visible, not silently
 * absorbed.
 *
 * `likedByVisitor` costs a second request, because the totals RPC deliberately
 * cannot see visitor_hash. If that second request fails, the totals are still
 * returned and `likedStateKnown` is false, so the UI can render a count while
 * honestly showing the visitor's own state as unknown instead of as "not liked".
 */
export async function getLikeCounts(photoIds: string[]): Promise<OperationResult<PhotoLikeCounts>> {
  const ids = sanitiseIds(photoIds);
  if (ids.length === 0) {
    // Nothing to ask. This is a complete, correct answer for an empty list, and
    // `kind: 'database'` is not a claim about a backend we never contacted — it
    // can never be labelled DEMO because no demo data is involved.
    return { ok: true, data: { kind: 'database', counts: [], likedStateKnown: true } };
  }

  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const totals = await db.photoLikeCounts(ids);
  if (!totals.ok) return totals;

  const byId = new Map<string, number>();
  ids.forEach((id) => byId.set(id, 0));
  totals.data.forEach((row) => {
    if (byId.has(row.photo_id)) byId.set(row.photo_id, Number(row.like_count) || 0);
  });

  let owned: Set<string> | null = null;
  const hash = await requireVisitorHash();
  if (hash.ok) {
    const ownedResult = await db.ownedPhotoIds(hash.data, ids);
    if (ownedResult.ok) owned = new Set(ownedResult.data);
  }

  const counts: PhotoLikeCount[] = ids.map((photoId) => ({
    photoId,
    count: byId.get(photoId) ?? 0,
    likedByVisitor: owned?.has(photoId) ?? false,
  }));

  return { ok: true, data: { kind: db.kind, counts, likedStateKnown: owned !== null } };
}

/** The "most liked" ranking, already ordered and limited by the database. */
export async function getTopPhotos(limit = 10): Promise<OperationResult<{ kind: 'database' | 'demo'; entries: PhotoRankEntry[] }>> {
  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const result = await db.photoLikeTop(limit);
  if (!result.ok) return result;

  const entries = result.data
    .filter((row) => sanitiseIds([row.photo_id]).length === 1)
    .map((row) => ({ photoId: row.photo_id, count: Number(row.like_count) || 0 }));

  return { ok: true, data: { kind: db.kind, entries } };
}

/* ----------------------------------------------------------------- write -- */

/**
 * Like a photo. Idempotent by database constraint, not by client state.
 *
 * A repeat like answers `ok: true` with `applied: false` — the honest report of
 * what the database did, which is nothing (Postgres error 23505 is translated in
 * client.ts). It is reported as a success because the visitor's intent is
 * satisfied: the row exists. It is NOT reported with a count, because no count
 * changed.
 */
export async function likePhoto(photoId: string): Promise<OperationResult<WriteOutcome>> {
  if (sanitiseIds([photoId]).length !== 1) {
    return { ok: false, code: 'invalid_input', error: '照片标识不合法，无法点赞。' };
  }

  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const guard = keyFor('like', photoId);
  if (inFlight.has(guard)) {
    return { ok: false, code: 'unknown', error: '正在处理上一步操作，请稍候。' };
  }
  inFlight.add(guard);
  try {
    const hash = await requireVisitorHash();
    if (!hash.ok) return hash;

    const written = await db.likePhoto(photoId, hash.data);
    if (!written.ok) return written;

    if (written.data.inserted === 0) {
      return { ok: true, data: { kind: db.kind, applied: false, count: null } };
    }

    // Read the new total back instead of returning `previous + 1`. The database
    // may have counted other visitors' likes since the last read, and an
    // optimistic increment would be a fabricated number either way.
    const totals = await getLikeCounts([photoId]);
    if (!totals.ok) {
      // The write succeeded; only the read-back failed. Say exactly that.
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
 * Remove this visitor's like.
 *
 * `removed: 0` is a real answer, not a failure: either nothing was there, or the
 * row belonged to a different token (see the RLS discussion in
 * supabase/migrations/20261009120002 §5). The UI must show it as "没有可取消的记录"
 * rather than as an error, because the request itself succeeded.
 */
export async function unlikePhoto(photoId: string): Promise<OperationResult<RemoveOutcome>> {
  if (sanitiseIds([photoId]).length !== 1) {
    return { ok: false, code: 'invalid_input', error: '照片标识不合法，无法取消。' };
  }

  const resolved = await sharedBackend();
  if (!resolved.ok) return resolved;
  const db = resolved.data;

  const guard = keyFor('unlike', photoId);
  if (inFlight.has(guard)) {
    return { ok: false, code: 'unknown', error: '正在处理上一步操作，请稍候。' };
  }
  inFlight.add(guard);
  try {
    const hash = await requireVisitorHash();
    if (!hash.ok) return hash;

    const removed = await db.unlikePhoto(photoId, hash.data);
    if (!removed.ok) return removed;

    return { ok: true, data: { kind: db.kind, removed: removed.data.removed } };
  } finally {
    inFlight.delete(guard);
  }
}

/* ------------------------------------------------------------------- test -- */

/**
 * Forget the memoised backend. Re-exported here because a caller that touched
 * only this module should not have to know that the cache lives in client.ts.
 * Tests and HMR only; nothing in the UI calls it.
 */
export { resetBackendCache } from './client';
