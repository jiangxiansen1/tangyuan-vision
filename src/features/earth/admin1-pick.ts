/**
 * admin1-pick.ts — province INTERIOR hit-testing over a loaded Admin-1 chunk.
 *
 * WHY THIS IS PURE
 * The click → lat/lon work is done by the globe (real ray → directionToLatLon);
 * this module only answers "which province polygon (if any) contains this
 * lon/lat". Keeping it pure makes it unit-testable without a camera or globe.
 *
 * USES THE REAL GEOMETRY ONLY — Polygon/MultiPolygon with holes — and a per-chunk
 * bounding-box index so a click tests a handful of candidates, never the whole
 * world. Dateline-crossing rings are handled by testing lon and lon+360.
 */

import type { Admin1Item } from './admin1';

type Ring = number[][];
type BBox = [number, number, number, number]; // minLon, minLat, maxLon, maxLat

interface Prepared {
  item: Admin1Item;
  bbox: BBox;
  /** Each polygon = [outerRing, ...holes]. */
  polygons: Ring[][];
}

function ringBBox(ring: Ring, into: BBox) {
  for (const c of ring) {
    const lon = c[0];
    const lat = c[1];
    if (lon < into[0]) into[0] = lon;
    if (lat < into[1]) into[1] = lat;
    if (lon > into[2]) into[2] = lon;
    if (lat > into[3]) into[3] = lat;
  }
}

/** Even-odd ray casting on the lon/lat plane. */
function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function contains(prep: Prepared, lon: number, lat: number): boolean {
  for (const poly of prep.polygons) {
    const outer = poly[0];
    if (!outer || !inRing(lon, lat, outer)) continue;
    let inHole = false;
    for (let h = 1; h < poly.length; h++) {
      if (inRing(lon, lat, poly[h])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return false;
}

const cache = new WeakMap<Admin1Item[], Prepared[]>();

function prepare(items: Admin1Item[]): Prepared[] {
  const cached = cache.get(items);
  if (cached) return cached;
  const out: Prepared[] = [];
  for (const item of items) {
    const g = item.geometry;
    const polys: number[][][][] = g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
    const bbox: BBox = [Infinity, Infinity, -Infinity, -Infinity];
    const polygons: Ring[][] = [];
    for (const poly of polys) {
      polygons.push(poly as Ring[]);
      for (const ring of poly) ringBBox(ring as Ring, bbox);
    }
    if (!polygons.length) continue;
    out.push({ item, bbox, polygons });
  }
  cache.set(items, out);
  return out;
}

/**
 * The province whose interior contains (lon, lat), or null. Tests each candidate
 * at both lon and lon+360 so dateline-crossing rings (which jump −180↔180) work.
 */
export function pickProvince(items: Admin1Item[] | null, lon: number, lat: number): Admin1Item | null {
  if (!items || items.length === 0) return null;
  for (const prep of prepare(items)) {
    const [minLon, minLat, maxLon, maxLat] = prep.bbox;
    const latIn = lat >= minLat && lat <= maxLat;
    if (!latIn) continue;
    const spansDateline = maxLon - minLon > 180;
    if (!spansDateline && (lon < minLon || lon > maxLon)) continue;
    const lons = spansDateline ? [lon, lon + 360] : [lon];
    for (const l of lons) {
      if (contains(prep, l, lat)) return prep.item;
    }
  }
  return null;
}
/**
 * A representative centre for a province, derived from its real geometry: the
 * average of the outer ring of its largest polygon. Used only to place a marker
 * and show a coordinate/local-time readout — it is a geometric centre, not a
 * claimed capital or a travel record.
 */
export function provinceCenter(item: Admin1Item): { lon: number; lat: number } {
  const g = item.geometry;
  const polys: number[][][][] =
    g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
  let best: number[][] | null = null;
  for (const poly of polys) {
    const outer = poly[0] as number[][];
    if (outer && (!best || outer.length > best.length)) best = outer;
  }
  if (!best || best.length === 0) return { lon: 0, lat: 0 };
  let sumLon = 0;
  let sumLat = 0;
  for (const c of best) {
    sumLon += c[0];
    sumLat += c[1];
  }
  return { lon: sumLon / best.length, lat: sumLat / best.length };
}
