/**
 * interactions/demo.ts — the in-memory DEMO backend.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE NUMBERS IN THIS FILE ARE FABRICATED. THAT IS WHAT THE FILE IS FOR.
 *  They may only be shown to a human when the interface says DEMO next to them.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY IT EXISTS
 * Without a configured Supabase project there is no way to exercise the states
 * that actually need designing: a photo that already has likes, a photo the
 * visitor has already liked, a count that grows, an un-like that goes back
 * down. Driving those from a real database during UI work is slow, and not
 * having them means the error and empty states are the only ones ever seen.
 *
 * WHY IT CANNOT REACH A PRODUCTION BUILD
 * It is imported only from `client.ts`, inside a branch guarded by
 * `import.meta.env.DEV` — a compile-time constant that Vite replaces with the
 * literal `false` for `vite build`. Rollup then folds the branch away and drops
 * this module entirely, so it is not merely unreachable in production, it is
 * absent from the bundle. On top of that the branch also requires
 * VITE_TV_DEMO=1 and a `?demo=1` query parameter. Three independent conditions,
 * one of which is decided by the build rather than by anything a visitor sends.
 *
 * WHAT IT MUST NEVER DO
 *   • Claim to be the real backend. Every result is tagged `kind: 'demo'`, and
 *     the type system makes the tag impossible to drop silently.
 *   • Write anything anywhere. All state lives in the closure of one
 *     `createDemoBackend()` call and is gone on reload.
 *   • Pretend to be a security boundary. It has none: any token is accepted.
 *     It exists to exercise UI states, nothing else.
 *
 * DELIBERATE DIVERGENCES FROM THE REAL BACKEND — all of them are honest, none of
 * them model security:
 *   • Seeded counts, so the first render is not a page of zeros.
 *   • The visitor's own like state is tracked in memory, so a reload starts
 *     fresh — the real backend persists it in the database.
 *   • No rate limiting. Liking twice with the same token IS rejected (so the
 *     "already liked" path gets exercised), but nothing else is enforced.
 */

import type { InteractionsBackend, PhotoCountRow, RegionCountRow, WriteAnswer } from './client';
import type { OperationResult } from './types';

/**
 * Known content ids, used only to make the demo look like the real site.
 *
 * DEMO PHOTO IDS mirror src/content/data/photography.json. The REGION IDS ARE
 * INVENTED — this project's content model has no country/region collection yet;
 * the page that renders the vote UI supplies its own ids. If that feature lands
 * with different ids, change these: a demo whose ids match nothing on the page
 * is worse than one with obvious placeholders, because it looks broken instead
 * of looking fake.
 */
const DEMO_PHOTO_IDS = [
  'sample-ridge-01',
  'sample-ridge-02',
  'sample-asphalt-01',
  'sample-asphalt-02',
  'sample-machined-01',
  'sample-machined-02',
  'sample-sky-01',
  'sample-sky-02',
  'sample-caustic-01',
  'sample-caustic-02',
  'sample-caustic-03',
] as const;

const DEMO_REGION_IDS = [
  'region-cn-xizang',
  'region-cn-xinjiang',
  'region-cn-qinghai',
  'region-cn-yunnan',
  'region-np-mustang',
  'region-is-ring-road',
] as const;

/**
 * Stand-in tokens. They are not hashes, because nothing in the demo hashes
 * anything — which is itself the honest signal that this data never left the
 * page. Counts are seeded by writing real rows for these tokens, so the numbers
 * are derived the same way the live ones are (a count over rows) rather than
 * being a literal parked next to a list.
 */
const SEED_TOKENS = ['demo-token-a', 'demo-token-b', 'demo-token-c', 'demo-token-d'] as const;

type Row = { target: string; token: string };

/** One seeded row list per content id, with a stable non-uniform distribution. */
function seedRows(ids: readonly string[]): Row[] {
  const rows: Row[] = [];
  ids.forEach((target, index) => {
    // 0..4 rows per item. No Math.random anywhere: a demo that reshuffles on
    // every reload makes it impossible to tell a UI bug from the seed moving.
    const count = (index + 1) % (SEED_TOKENS.length + 1);
    for (let i = 0; i < count; i++) {
      rows.push({ target, token: SEED_TOKENS[(index + i) % SEED_TOKENS.length] });
    }
  });
  return rows;
}

/**
 * Count rows per id, ensuring every REQUESTED id is present.
 *
 * The real RPCs use a LEFT JOIN for exactly this reason: an id with no rows must
 * come back as a legitimate 0, never as a missing entry that a caller might
 * mistake for "unknown".
 */
function countsFor(rows: Row[], requested: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  requested.forEach((id) => counts.set(id, 0));
  rows.forEach((row) => {
    if (counts.has(row.target)) counts.set(row.target, (counts.get(row.target) ?? 0) + 1);
  });
  return counts;
}

export function createDemoBackend(): InteractionsBackend {
  const likes = seedRows(DEMO_PHOTO_IDS);
  const votes = seedRows(DEMO_REGION_IDS);

  const photoRows = (ids: readonly string[]): PhotoCountRow[] =>
    Array.from(countsFor(likes, ids), ([photo_id, like_count]) => ({ photo_id, like_count }));

  const regionRows = (ids: readonly string[]): RegionCountRow[] =>
    Array.from(countsFor(votes, ids), ([region_id, vote_count]) => ({ region_id, vote_count }));

  /** The UNIQUE constraints, modelled in memory. */
  const exists = (rows: Row[], target: string, token: string): boolean =>
    rows.some((row) => row.target === target && row.token === token);

  const remove = (rows: Row[], target: string, token: string): number => {
    const index = rows.findIndex((row) => row.target === target && row.token === token);
    if (index === -1) return 0;
    rows.splice(index, 1);
    return 1;
  };

  const rankPhotos = (limit: number): PhotoCountRow[] =>
    photoRows(DEMO_PHOTO_IDS)
      .filter((row) => row.like_count >= 1)
      // Ties break by id so the ranking does not reshuffle between renders,
      // matching the ORDER BY in public.tv_top_photos.
      .sort((a, b) => b.like_count - a.like_count || a.photo_id.localeCompare(b.photo_id))
      .slice(0, Math.max(1, Math.min(limit, 100)));

  const rankRegions = (limit: number): RegionCountRow[] =>
    regionRows(DEMO_REGION_IDS)
      .filter((row) => row.vote_count >= 1)
      .sort((a, b) => b.vote_count - a.vote_count || a.region_id.localeCompare(b.region_id))
      .slice(0, Math.max(1, Math.min(limit, 100)));

  return {
    kind: 'demo',

    async photoLikeCounts(photoIds): Promise<OperationResult<PhotoCountRow[]>> {
      return { ok: true, data: photoRows(photoIds) };
    },

    async photoLikeTop(limit): Promise<OperationResult<PhotoCountRow[]>> {
      return { ok: true, data: rankPhotos(limit) };
    },

    async likePhoto(photoId, hash): Promise<OperationResult<WriteAnswer>> {
      if (exists(likes, photoId, hash)) {
        // The same answer the database gives via error 23505: an outcome, not a
        // failure. Nothing was inserted, so inserted = 0 and the count does not move.
        return { ok: true, data: { inserted: 0 } };
      }
      likes.push({ target: photoId, token: hash });
      return { ok: true, data: { inserted: 1 } };
    },

    async unlikePhoto(photoId, hash) {
      return { ok: true, data: { removed: remove(likes, photoId, hash) } };
    },

    async regionVoteCounts(regionIds) {
      return { ok: true, data: regionRows(regionIds) };
    },

    async regionVoteTop(limit) {
      return { ok: true, data: rankRegions(limit) };
    },

    async voteRegion(regionId, hash) {
      if (exists(votes, regionId, hash)) return { ok: true, data: { inserted: 0 } };
      votes.push({ target: regionId, token: hash });
      return { ok: true, data: { inserted: 1 } };
    },

    async unvoteRegion(regionId, hash) {
      return { ok: true, data: { removed: remove(votes, regionId, hash) } };
    },

    /**
     * Which of these the visitor has already liked.
     *
     * The demo answers "none" and lets the calling hook remember what was liked
     * during this session. That is the honest answer: the seeded rows belong to
     * imaginary tokens, and attributing them to the real visitor would be a
     * fabrication of exactly the kind this project forbids. The real backend
     * scopes the same question to the caller's own rows through RLS plus the
     * x-visitor-hash header; there is no owner column to scope on here.
     */
    async ownedPhotoIds(_hash, _photoIds) {
      return { ok: true, data: [] };
    },

    async ownedRegionIds(_hash, _regionIds) {
      return { ok: true, data: [] };
    },
  };
}
