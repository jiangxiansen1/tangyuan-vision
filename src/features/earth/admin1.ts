/**
 * admin1.ts — on-demand loading of the real Admin-1 (states/provinces) chunks.
 *
 * STATIC, CACHED, FAILURE-TOLERANT
 * The 40 MB source was converted to per-country chunks under
 * `public/assets/earth/admin1/<ADM0_A3>.json` plus `index.json` and `map.json`
 * (ADM0_A3 → ISO_N3). Nothing here is bundled; chunks load on demand and are
 * cached by promise so repeated viewing never re-downloads. A failed load returns
 * null and is NOT cached as success, so the globe and existing boundaries stay up.
 * Admin-1 belongs to a country; the app's country id is ISO-NUMERIC, so we go
 * ISO_N3 → ADM0_A3 (via map.json) → chunk file.
 */

import { assetUrl } from '@/lib/asset';

export interface Admin1Item {
  id: string;
  name: string;
  nameEn: string;
  nameZh?: string;
  type: string;
  iso3166_2?: string;
  geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
}
export interface Admin1Chunk {
  adm0: string;
  items: Admin1Item[];
}

const BASE = 'assets/earth/admin1/';

let mapPromise: Promise<Record<string, string> | null> | null = null;

/** ADM0_A3 → ISO_N3 (built from Natural Earth; public domain). Loaded once. */
export function loadAdmin1Map(): Promise<Record<string, string> | null> {
  if (!mapPromise) {
    mapPromise = fetch(assetUrl(BASE + 'map.json'))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { map?: Record<string, string> } | null) => (j && j.map) || null)
      .catch(() => {
        mapPromise = null; // allow a retry
        return null;
      });
  }
  return mapPromise;
}

const chunkCache = new Map<string, Promise<Admin1Chunk | null>>();

async function fetchChunkByAdm0(adm0: string): Promise<Admin1Chunk | null> {
  try {
    const r = await fetch(assetUrl(BASE + adm0 + '.json'));
    if (!r.ok) return null;
    const j = (await r.json()) as Admin1Chunk;
    return j && Array.isArray(j.items) ? j : null;
  } catch {
    return null;
  }
}

/** Load the Admin-1 chunk for a country, given the app's ISO-NUMERIC country id. */
export async function loadAdmin1ForCountry(isoN3: string): Promise<Admin1Chunk | null> {
  const map = await loadAdmin1Map();
  if (!map) return null;
  const n3 = String(isoN3).padStart(3, '0');
  let adm0: string | null = null;
  for (const [a3, code] of Object.entries(map)) {
    if (code === n3) {
      adm0 = a3;
      break;
    }
  }
  if (!adm0) return null; // country has no reliable Admin-1 data — never invented
  let p = chunkCache.get(adm0);
  if (!p) {
    p = fetchChunkByAdm0(adm0);
    chunkCache.set(adm0, p);
    // Do not cache a failure: drop it so a later attempt can retry.
    p.then((c) => {
      if (!c) chunkCache.delete(adm0);
    });
  }
  return p;
}