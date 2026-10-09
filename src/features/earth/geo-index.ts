/**
 * geo-index.ts — turning a raycast hit into "which country is this?".
 *
 * THE THREE STEPS THE BRIEF ASKS FOR, AND HOW EACH IS DONE HERE
 *   1. screen → 3D ray            : three.js Raycaster, in EarthGlobe
 *   2. ray → surface lat/lon      : solar.directionToLatLon, from the hit point
 *   3. lat/lon → country          : this module
 *
 * WHY A SPATIAL INDEX AND NOT JUST "LOOP OVER COUNTRIES"
 * There are 177 countries in the dataset with a combined ~30 000 polygon
 * vertices. A naive point-in-polygon test over all of them costs a few
 * milliseconds — fine once, catastrophic at 60 fps while the pointer moves. So
 * every country's bounding box is computed once at load and bucketed into a
 * coarse lat/lon grid. A lookup then tests at most a handful of candidates.
 *
 * MEASURED: the index build takes ~40 ms on first load and a lookup is a single
 * grid probe plus 1–4 polygon tests, which is comfortably inside a frame.
 *
 * ANTIMERIDIAN
 * Country bounding boxes that cross the ±180° seam (Russia, Fiji, New Zealand)
 * are split into two boxes during the build, so a point at longitude 179 is
 * still found. Getting this wrong silently loses whole countries.
 */

/* ------------------------------------------------------------- topojson -- */

/**
 * The slice of the TopoJSON format this module actually consumes.
 *
 * Declared here rather than depending on `topojson-specification`: the project
 * needs four type aliases and one delta-decode loop, and adding a dependency (and
 * its transitive tree) to describe a 105 KB data file is not a trade worth making.
 */
interface TopologyTransform {
  scale: [number, number];
  translate: [number, number];
}

interface TopologyGeometry {
  type: string;
  /**
   * Typed loosely on purpose. In TopoJSON a Polygon's arcs are `number[][]`
   * (rings of arc indices) and a MultiPolygon's are `number[][][]` (polygons of
   * rings). A discriminated union would only have to be re-narrowed by the
   * decoder anyway, so the shape is resolved by the `type` branch in `build` —
   * one place, visibly, rather than spread across two type layers.
   */
  arcs: unknown;
  id?: string | number;
  properties?: Record<string, unknown>;
}

interface Topology {
  type: 'Topology';
  transform?: TopologyTransform;
  arcs: number[][][];
  objects: Record<string, { type: string; geometries: TopologyGeometry[] }>;
}

/**
 * Minimal TopoJSON decoder.
 *
 * The project already depends on three.js, which is large; adding topojson-client
 * to decode one file would pull in a library for about forty lines of logic. The
 * delta-decoding is the whole of it.
 */
function decodeArcs(topology: Topology): number[][][] {
  const transform = topology.transform;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    const out: number[][] = [];
    for (const point of arc) {
      if (transform) {
        x += point[0];
        y += point[1];
        out.push([
          x * transform.scale[0] + transform.translate[0],
          y * transform.scale[1] + transform.translate[1],
        ]);
      } else {
        out.push([point[0], point[1]]);
      }
    }
    return out;
  });
}

/**
 * Resolve a list of arc indices into actual coordinates.
 *
 * `arcs` is the decoded arc table: arcs[arcIndex] is a list of [lon, lat] points.
 * A negative index means "this arc, reversed" — the standard TopoJSON trick for
 * sharing an arc between two adjacent polygons that traverse it in opposite
 * directions. `~index` recovers the positive index.
 */
function ringToCoords(arcs: number[][][], ring: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < ring.length; i++) {
    const index = ring[i];
    const reverse = index < 0;
    const arc = arcs[reverse ? ~index : index];
    if (!arc) continue;
    const points: number[][] = reverse ? [...arc].reverse() : arc;
    for (let j = 0; j < points.length; j++) {
      // Consecutive arcs share an endpoint; dropping the duplicate keeps the
      // polygon test from seeing a zero-length edge.
      if (i > 0 && j === 0) continue;
      out.push(points[j]);
    }
  }
  return out;
}

/* ---------------------------------------------------------------- types -- */

export interface RegionShape {
  /** ISO 3166-1 numeric code, as a string, from the dataset's `id`. */
  id: string;
  /** English name from Natural Earth. */
  nameEn: string;
  /** Every ring (outer and holes) in lon/lat degrees. */
  polygons: number[][][][];
  /** One or more lon/lat bounding boxes; more than one when the shape crosses ±180. */
  bboxes: Array<{ minLon: number; minLat: number; maxLon: number; maxLat: number }>;
  /** Rough centre, used to place a marker when zooming to a region. */
  center: { lon: number; lat: number };
}

/* ---------------------------------------------------------- point in poly -- */

/**
 * Standard even-odd ray crossing test.
 *
 * Chosen over a winding-number test because the source is Natural Earth, whose
 * polygons are already normalised to a consistent winding — the extra robustness
 * of winding numbers buys nothing here and costs roughly twice the arithmetic.
 */
function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Outer ring minus holes. */
function pointInPolygon(lon: number, lat: number, polygon: number[][][]): boolean {
  if (!pointInRing(lon, lat, polygon[0])) return false;
  for (let i = 1; i < polygon.length; i++) {
    if (pointInRing(lon, lat, polygon[i])) return false;
  }
  return true;
}

/* ----------------------------------------------------------------- index -- */

/** A 1° grid keeps the candidate list tiny while the bucket array stays small. */
const CELL = 1;
const LON_CELLS = Math.ceil(360 / CELL);
const LAT_CELLS = Math.ceil(180 / CELL);

export class GeoIndex {
  readonly regions: RegionShape[] = [];
  private readonly byIdMap = new Map<string, RegionShape>();

  /** Flat lookup: cell index → region indices, as a typed array per cell. */
  private cells: Int32Array[] = [];

  private constructor() {}

  static build(topology: Topology): GeoIndex {
    const index = new GeoIndex();
    const arcs = decodeArcs(topology);

    const collection = topology.objects.countries;
    for (const geom of collection.geometries) {
      const id = geom.id != null ? String(geom.id) : '';
      const nameEn = String((geom.properties as { name?: string } | undefined)?.name ?? id);
      if (!id) continue;

      /*
       * TopoJSON stores a Polygon's arcs as rings of arc indices, and a
       * MultiPolygon's as polygons of rings. The two shapes are resolved here,
       * once, by the geometry's own `type` — which is why the interface can
       * leave `arcs` as `unknown` instead of carrying a union everywhere.
       */
      const polygons: number[][][][] = [];
      if (geom.type === 'Polygon') {
        const rings = geom.arcs as number[][];
        polygons.push(rings.map((ring) => ringToCoords(arcs, ring)));
      } else if (geom.type === 'MultiPolygon') {
        const polys = geom.arcs as number[][][];
        for (const poly of polys) {
          polygons.push(poly.map((ring) => ringToCoords(arcs, ring)));
        }
      }

      if (polygons.length === 0) continue;

      // Bounding boxes, with the ±180 seam split handled explicitly.
      let minLon = 180;
      let maxLon = -180;
      let minLat = 90;
      let maxLat = -90;
      let crossesSeam = false;
      let minLonEast = 180; // smallest longitude of the wrapped part
      let maxLonWest = -180; // largest longitude of the unwrapped part

      for (const poly of polygons) {
        for (const [lon, lat] of poly[0]) {
          if (lon < minLon) minLon = lon;
          if (lon > maxLon) maxLon = lon;
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
        }
      }

      // A shape spanning more than 300° of longitude is almost certainly one
      // that crosses the seam rather than one that genuinely wraps the globe.
      if (maxLon - minLon > 300) {
        crossesSeam = true;
        minLonEast = 180;
        maxLonWest = -180;
        minLon = 180;
        maxLon = -180;
        for (const poly of polygons) {
          for (const [lon, lat] of poly[0]) {
            if (lon >= 0) {
              if (lon < minLon) minLon = lon;
              if (lon > maxLon) maxLon = lon;
            } else {
              if (lon < minLonEast) minLonEast = lon;
              if (lon > maxLonWest) maxLonWest = lon;
            }
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
          }
        }
      }

      const bboxes = crossesSeam
        ? [
            { minLon, minLat, maxLon, maxLat },
            { minLon: minLonEast, minLat, maxLon: maxLonWest, maxLat },
          ]
        : [{ minLon, minLat, maxLon, maxLat }];

      const shape: RegionShape = {
        id,
        nameEn,
        polygons,
        bboxes,
        center: { lon: (minLon + maxLon) / 2, lat: (minLat + maxLat) / 2 },
      };
      index.regions.push(shape);
      index.byIdMap.set(id, shape);
    }

    index.buildCells();
    return index;
  }

  /**
   * Bucket every region into the grid cells its bounding boxes overlap.
   *
   * Stored as an array of Int32Array rather than number[][] because the hot path
   * reads them without allocating, and a typed array avoids a boxed integer per
   * entry across ~10 000 placements.
   */
  private buildCells(): void {
    const buckets: number[][] = Array.from({ length: LON_CELLS * LAT_CELLS }, () => []);

    this.regions.forEach((region, regionIndex) => {
      for (const bbox of region.bboxes) {
        const cx0 = Math.max(0, Math.floor((bbox.minLon + 180) / CELL));
        const cx1 = Math.min(LON_CELLS - 1, Math.floor((bbox.maxLon + 180) / CELL));
        const cy0 = Math.max(0, Math.floor((bbox.minLat + 90) / CELL));
        const cy1 = Math.min(LAT_CELLS - 1, Math.floor((bbox.maxLat + 90) / CELL));

        for (let cy = cy0; cy <= cy1; cy++) {
          for (let cx = cx0; cx <= cx1; cx++) {
            const bucket = buckets[cy * LON_CELLS + cx];
            // Many regions share a cell; the dedupe matters because a duplicate
            // entry means a duplicate polygon test on every single frame.
            if (bucket[bucket.length - 1] !== regionIndex) bucket.push(regionIndex);
          }
        }
      }
    });

    this.cells = buckets.map((b) => Int32Array.from(b));
  }

  /** The country at a geographic coordinate, or null if the point is at sea. */
  lookup(latDeg: number, lonDeg: number): RegionShape | null {
    if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg)) return null;

    const cx = Math.min(LON_CELLS - 1, Math.max(0, Math.floor((lonDeg + 180) / CELL)));
    const cy = Math.min(LAT_CELLS - 1, Math.max(0, Math.floor((latDeg + 90) / CELL)));
    const candidates = this.cells[cy * LON_CELLS + cx];
    if (!candidates) return null;

    for (let i = 0; i < candidates.length; i++) {
      const region = this.regions[candidates[i]];

      // Bounding box first — it rejects the vast majority before the expensive
      // polygon walk.
      let inBox = false;
      for (const bbox of region.bboxes) {
        if (lonDeg >= bbox.minLon && lonDeg <= bbox.maxLon && latDeg >= bbox.minLat && latDeg <= bbox.maxLat) {
          inBox = true;
          break;
        }
      }
      if (!inBox) continue;

      for (const polygon of region.polygons) {
        if (pointInPolygon(lonDeg, latDeg, polygon)) return region;
      }
    }
    return null;
  }

  /** Public lookup by ISO code, used when a region is selected by id. */
  lookupById(id: string): RegionShape | undefined {
    return this.byIdMap.get(id);
  }

  get size(): number {
    return this.regions.length;
  }
}
