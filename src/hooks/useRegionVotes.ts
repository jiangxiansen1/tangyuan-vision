/**
 * useRegionVotes — "我也想去" vote counts for a set of regions, with an honest status.
 *
 * Deliberately identical in shape to usePhotoLikes: the same four statuses, the
 * same `count: number | null` distinction between "counted zero" and "not read",
 * and the same refusal to increment a number locally. See usePhotoLikes for the
 * full reasoning behind the id-join dependency key, the out-of-order response
 * guard, and the revision counter.
 *
 * The parts unique to regions:
 *   • A vote is a statement of intent, so the copy shown after a failure must
 *     never read as participation. `status === 'error'` means the interface must
 *     say 没有记录上, not 感谢参与.
 *   • Un-voting exists for the same reason it does on photos: a visitor who
 *     misclicks must be able to take it back, and the honest way to support that
 *     is a DELETE against the caller's own row, not a hidden "already voted" flag
 *     that only lives in this browser.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVoteCounts, unvoteRegion, voteRegion } from '@/lib/interactions/regions';
import type { InteractionErrorCode } from '@/lib/interactions/types';

export type VotesStatus = 'unconfigured' | 'loading' | 'ready' | 'error';

export interface RegionVotesApi {
  /**
   * Counts keyed by region id. Absent means "never read"; present with `0` means
   * the database counted zero votes. Rendering both as "0" would be the exact
   * fabrication this layer exists to prevent.
   */
  counts: Record<string, { count: number | null; votedByVisitor: boolean }>;
  status: VotesStatus;
  error: string | null;
  errorCode: InteractionErrorCode | null;
  isDemo: boolean;
  /** Vote or un-vote, depending on the current known state. Never throws. */
  vote: (regionId: string) => Promise<void>;
  hasVoted: (regionId: string) => boolean;
  refresh: () => void;
}

function idsKey(ids: readonly string[]): string {
  return Array.from(new Set(ids)).join('|');
}

function idsFromKey(key: string): string[] {
  return key ? key.split('|') : [];
}

export function useRegionVotes(regionIds: readonly string[]): RegionVotesApi {
  const key = useMemo(() => idsKey(regionIds), [regionIds]);

  const [counts, setCounts] = useState<Record<string, { count: number | null; votedByVisitor: boolean }>>({});
  const [status, setStatus] = useState<VotesStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<InteractionErrorCode | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const requestId = useRef(0);

  // See usePhotoLikes: a render-time mirror so `vote` can stay referentially
  // stable and cannot read a pre-click state during a double activation.
  const countsRef = useRef(counts);
  countsRef.current = counts;

  useEffect(() => {
    const ids = idsFromKey(key);
    const mine = ++requestId.current;

    if (ids.length === 0) {
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
      const result = await getVoteCounts(ids);
      if (mine !== requestId.current) return; // a newer request superseded this one

      if (!result.ok) {
        setStatus(result.code === 'unconfigured' ? 'unconfigured' : 'error');
        setError(result.error);
        setErrorCode(result.code);
        setCounts({});
        return;
      }

      const next: Record<string, { count: number | null; votedByVisitor: boolean }> = {};
      result.data.counts.forEach((entry) => {
        next[entry.regionId] = { count: entry.count, votedByVisitor: entry.votedByVisitor };
      });
      setCounts(next);
      setIsDemo(result.data.kind === 'demo');
      setStatus('ready');
    })();
  }, [key, reloadToken]);

  const vote = useCallback(async (regionId: string) => {
    const wanted = !(countsRef.current[regionId]?.votedByVisitor ?? false);

    setError(null);
    setErrorCode(null);

    if (wanted) {
      const result = await voteRegion(regionId);
      if (!result.ok) {
        // 'already_recorded' can no longer reach here — the data layer turns the
        // UNIQUE violation into `applied: false` — but it is handled anyway so a
        // future change in that mapping cannot turn a duplicate into an error.
        if (result.code === 'already_recorded') {
          setCounts((prev) => ({
            ...prev,
            [regionId]: { count: prev[regionId]?.count ?? null, votedByVisitor: true },
          }));
          setReloadToken((n) => n + 1);
          return;
        }
        setError(result.error);
        setErrorCode(result.code);
        return;
      }

      const authoritative = result.data.count;
      if (authoritative === null) {
        // Recorded, but the count could not be read back: report it as unknown
        // and re-read, rather than showing a number nobody verified.
        setCounts((prev) => ({ ...prev, [regionId]: { count: null, votedByVisitor: true } }));
        setReloadToken((n) => n + 1);
        return;
      }
      setCounts((prev) => ({ ...prev, [regionId]: { count: authoritative, votedByVisitor: true } }));
      return;
    }

    const result = await unvoteRegion(regionId);
    if (!result.ok) {
      setError(result.error);
      setErrorCode(result.code);
      return;
    }

    if (result.data.removed === 0) {
      // Nothing was removed. The request succeeded and the local belief is
      // therefore suspect — re-read instead of asserting either state.
      setCounts((prev) => ({
        ...prev,
        [regionId]: { count: prev[regionId]?.count ?? null, votedByVisitor: false },
      }));
      setReloadToken((n) => n + 1);
      return;
    }

    setCounts((prev) => {
      const current = prev[regionId] ?? { count: null, votedByVisitor: false };
      return {
        ...prev,
        [regionId]: {
          count: current.count === null ? null : Math.max(0, current.count - 1),
          votedByVisitor: false,
        },
      };
    });
  }, []);

  const hasVoted = useCallback((regionId: string) => counts[regionId]?.votedByVisitor ?? false, [counts]);
  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  return { counts, status, error, errorCode, isDemo, vote, hasVoted, refresh };
}
