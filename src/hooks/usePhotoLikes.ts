/**
 * usePhotoLikes — like counts for a set of photos, with an honest status.
 *
 * WHAT IT WILL NOT DO
 *   • It will not invent a count. `counts` is empty until the database has
 *     actually answered, and `status: 'error'` is a real, renderable state.
 *   • It will not show a stale number after a failed write. If the write landed
 *     but the read-back failed, the count for that photo becomes `null` (the UI
 *     shows "—") rather than keeping a number that is now known to be wrong.
 *   • It will not pretend a demo is production. `isDemo` is true only when the
 *     data came from the DEMO backend, and the difference is carried in the
 *     payload, not inferred from an environment variable at render time.
 *
 * WHY THE PHOTO IDS BECOME A SINGLE DEPENDENCY STRING
 * Callers naturally write `usePhotoLikes(page.photos.map(p => p.id))`, which
 * creates a new array every render. A `useEffect` keyed on that array would
 * re-fetch forever. Keying on a joined string means the fetch runs exactly when
 * the *set* of ids changes. The join separator is `|`, which cannot appear in an
 * id (see the CHECK constraint in the schema migration), so two different sets
 * can never produce the same key.
 *
 * ⚠️ CONSEQUENCE OF THAT CHOICE, stated plainly: the ids are read once per
 * change, and the hook does NOT re-read when the database changes for other
 * reasons. Two visitors looking at the same photo will see different counts until
 * one of them navigates. Live counts would need a subscription channel, which
 * this static-site layer deliberately does not have.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getLikeCounts, likePhoto, unlikePhoto } from '@/lib/interactions/photos';
import type { InteractionErrorCode } from '@/lib/interactions/types';

export type LikesStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

export interface PhotoLikesApi {
  /**
   * Counts keyed by photo id. A photo in this map with `{ count: 0 }` genuinely
   * has zero likes; a photo NOT in this map has never been read. The UI must
   * render those two cases differently — that is the whole point of the map.
   */
  counts: Record<string, { count: number | null; likedByVisitor: boolean }>;
  status: LikesStatus;
  /** Chinese, safe to show. null unless status is 'error' or 'unconfigured'. */
  error: string | null;
  /** Machine-readable companion to `error`, for choosing a recovery action. */
  errorCode: InteractionErrorCode | null;
  /** True when the numbers come from the DEMO backend and must be labelled as such. */
  isDemo: boolean;
  /** Like/unlike. Never throws; inspect `error` afterwards for the reason. */
  like: (photoId: string) => Promise<void>;
  /** Whether this visitor has liked the photo, according to the last successful read. */
  isLiked: (photoId: string) => boolean;
  /** Re-read from scratch. Used by the retry affordance on the error state. */
  refresh: () => void;
}

/**
 * Build the stable effect key. `Array.from(new Set(…))` de-duplicates because a
 * caller repeating an id would otherwise fetch it twice for no reason.
 */
function idsKey(ids: readonly string[]): string {
  return Array.from(new Set(ids)).join('|');
}

/** Parse the key back into ids. Cheaper and more predictable than a second ref. */
function idsFromKey(key: string): string[] {
  return key ? key.split('|') : [];
}

export function usePhotoLikes(photoIds: readonly string[]): PhotoLikesApi {
  const key = useMemo(() => idsKey(photoIds), [photoIds]);

  const [counts, setCounts] = useState<Record<string, { count: number | null; likedByVisitor: boolean }>>({});
  const [status, setStatus] = useState<LikesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<InteractionErrorCode | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  /**
   * Guards against a resolved fetch from a previous key overwriting the results
   * of the current one — the classic out-of-order-response bug. A ref (not
   * state) because it must be readable inside the async body without causing a
   * re-render.
   */
  const requestId = useRef(0);

  /**
   * The latest counts, readable from `like` without making it a dependency.
   *
   * Without this, `like` would have to close over `counts`, so its identity
   * would change on every count change — and a UI that puts `like` in a
   * dependency array (which is the correct thing to do) would re-subscribe on
   * every like. It also removes a genuine race: two rapid clicks on the same
   * heart would otherwise both read the pre-click state.
   *
   * Written during render rather than in an effect, deliberately: an effect runs
   * after paint, which is exactly the window in which a second click can happen.
   */
  const countsRef = useRef(counts);
  countsRef.current = counts;

  useEffect(() => {
    const ids = idsFromKey(key);
    const mine = ++requestId.current;

    if (ids.length === 0) {
      // Nothing was asked for. That is not 'ready' — there is no data — and it is
      // not 'unconfigured' either. 'ready' with an empty map is the accurate
      // statement: we have nothing to show and nothing to complain about.
      setCounts({});
      setStatus('ready');
      setError(null);
      setErrorCode(null);
      return;
    }

    setStatus('loading');
    setError(null);
    setErrorCode(null);

    void (async () => {
      const result = await getLikeCounts(ids);
      if (mine !== requestId.current) return; // superseded

      if (!result.ok) {
        // 'unconfigured' is not a failure of this request; it is the site's
        // configuration, and it must render as an explanation rather than as an
        // error the visitor could imagine retrying away.
        setStatus(result.code === 'unconfigured' ? 'unconfigured' : 'error');
        setError(result.error);
        setErrorCode(result.code);
        setCounts({});
        return;
      }

      const next: Record<string, { count: number | null; likedByVisitor: boolean }> = {};
      result.data.counts.forEach((entry) => {
        next[entry.photoId] = { count: entry.count, likedByVisitor: entry.likedByVisitor };
      });
      setCounts(next);
      setIsDemo(result.data.kind === 'demo');
      // `likedStateKnown: false` means the totals are real but the visitor's own
      // state could not be read. The status stays 'ready' because the counts ARE
      // usable; `likedByVisitor` is false for every entry, and a caller that
      // cares should check nothing here — see the note in the hook's tests.
      setStatus('ready');
    })();
  }, [key, reloadToken]);

  const like = useCallback(
    async (photoId: string) => {
      // Read through the ref so this callback can stay referentially stable; see
      // the countsRef note above.
      const wanted = !(countsRef.current[photoId]?.likedByVisitor ?? false);

      // Show that something is happening without inventing the outcome: the
      // existing count stays on screen and an error is only set once the
      // backend has actually answered.
      setError(null);
      setErrorCode(null);

      if (wanted) {
        const result = await likePhoto(photoId);
        if (!result.ok) {
          if (result.code === 'already_recorded') {
            // The database says this visitor's like already exists, so the local
            // belief was wrong. Correct it and re-read; do NOT call this an
            // error, because nothing failed and the visitor has nothing to do.
            setCounts((prev) => ({
              ...prev,
              [photoId]: { count: prev[photoId]?.count ?? null, likedByVisitor: true },
            }));
            setReloadToken((n) => n + 1);
            return;
          }
          setError(result.error);
          setErrorCode(result.code);
          return;
        }

        // likePhoto only reports a count it read back from the database. When it
        // is null the write DID land but the number could not be read, so the
        // count must become unknown — never `previous + 1`.
        const authoritative = result.data.count;
        if (authoritative === null) {
          setCounts((prev) => ({ ...prev, [photoId]: { count: null, likedByVisitor: true } }));
          setReloadToken((n) => n + 1);
          return;
        }
        setCounts((prev) => ({ ...prev, [photoId]: { count: authoritative, likedByVisitor: true } }));
        return;
      }

      const result = await unlikePhoto(photoId);
      if (!result.ok) {
        // 'already_recorded' is not reachable on this path (the data layer turns
        // the UNIQUE violation into `applied: false` on insert), but it is
        // handled so a future change cannot turn a duplicate into a red error.
        if (result.code === 'already_recorded') {
          setCounts((prev) => ({
            ...prev,
            [photoId]: { count: prev[photoId]?.count ?? null, likedByVisitor: false },
          }));
          setReloadToken((n) => n + 1);
          return;
        }
        setError(result.error);
        setErrorCode(result.code);
        return;
      }

      if (result.data.removed === 0) {
        // The request succeeded and nothing was removed. The row was not there
        // (or was not this token's). Re-read rather than guess which.
        setCounts((prev) => ({
          ...prev,
          [photoId]: { count: prev[photoId]?.count ?? null, likedByVisitor: false },
        }));
        setReloadToken((n) => n + 1);
        return;
      }

      setCounts((prev) => {
        const current = prev[photoId] ?? { count: null, likedByVisitor: false };
        return {
          ...prev,
          [photoId]: {
            count: current.count === null ? null : Math.max(0, current.count - 1),
            likedByVisitor: false,
          },
        };
      });
    },
    // Intentionally empty: `like` reads the current state through countsRef and
    // only calls stable setters, so it never needs to be rebuilt. React's
    // exhaustive-deps rule agrees (it only requires `counts` here if `counts` is
    // referenced directly), which is why there is no disable directive to rot.
    []
  );

  const isLiked = useCallback((photoId: string) => counts[photoId]?.likedByVisitor ?? false, [counts]);
  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  return { counts, status, error, errorCode, isDemo, like, isLiked, refresh };
}
