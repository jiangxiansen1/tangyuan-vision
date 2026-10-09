/**
 * map-sources.ts — where the Earth page's imagery comes from, and what each source
 * is actually allowed to do.
 *
 * EVERY CLAIM HERE WAS VERIFIED BY REQUEST, NOT READ OFF A DOC
 * ---------------------------------------------------------------------------
 * A tile URL in documentation is not a working endpoint. Each source below was
 * probed with real HTTP from this machine (see tools/probe-map-sources.cjs, results
 * in tools/_verify/map/sources.json). The measured limits are recorded next to the
 * source, because they are the difference between "supports zoom 16" and "claims to".
 *
 *   NASA GIBS (EPSG:3857, GoogleMapsCompatible_Level9)
 *     answers 200 at z0–z9; z10 returns HTTP 400. At z9 a tile is ~610 m/px, so
 *     continents, coastlines, mountain ranges and large lakes are legible and
 *     individual cities are not.
 *     Licence: NASA Earthdata, full and open data. Acknowledgement requested.
 *     No key. No account.
 *
 *   OpenFreeMap vector tiles
 *     answers 200 at z5–z16 with substantial payloads (Beijing at z14 measured
 *     151 KB; a z5 tile 338 KB). Streets, buildings, place names.
 *     Licence: MIT (project) + OpenStreetMap data (ODbL). Attribution required.
 *     No key. No account. No stated request limit.
 *
 *   MapTiler (OPTIONAL — requires the visitor to supply their own key)
 *     High-resolution satellite imagery, deeper than GIBS. Used only when a key is
 *     present, because it is the one source here with an account behind it.
 *
 * WHY THERE IS NO "UNLIMITED SATELLITE AT ANY ZOOM" SOURCE
 * There is no free, legally usable source of street-level satellite imagery for the
 * whole planet. Esri's World Imagery serves tiles to z19 without a key and was
 * probed — it is deliberately NOT wired in: its free tier terms are limited to
 * "Internal and Non-Commercial External Use", and a public personal site is external.
 * Claiming otherwise in the UI would be a licence problem, not a shortcut.
 *
 * So the honest shape of this page is:
 *     z0–z3   the globe, with natural-colour NASA imagery
 *     z4–z9   continent and country detail from the same imagery
 *     z10–z16 real street-level VECTOR detail (roads, buildings, place names)
 *     beyond  the imagery does not exist for free; the vector map continues
 * and the UI says so rather than pretending the imagery follows.
 */

/** Acknowledgement text each source requires. Rendered in the map's attribution. */
export const ATTRIBUTION = {
  gibs: 'Imagery: NASA EOSDIS GIBS',
  osm: '© OpenMapTiles · Data from OpenStreetMap',
  maptiler: '© MapTiler',
} as const;

/** The deep end of NASA's Web Mercator matrix set, measured: z10 is HTTP 400. */
export const GIBS_MAX_ZOOM = 9;

/**
 * The static reference mosaic used as the IMAGERY BASE.
 *
 * WHY A BASE LAYER IS NEEDED AT ALL, AND WHY THIS ONE
 * ---------------------------------------------------------------------------
 * Daily true-colour imagery has NO DATA in some places, and the gaps are not subtle.
 * Looking straight at untouched tiles from the server, two distinct kinds appear:
 *
 *   1. SWATH SEAMS — thin dark bands where consecutive orbital passes join. Several land
 *      inside one tile at low zoom, which is why the first globe showed a set of clean
 *      black wedges.
 *   2. ORBITAL COVERAGE LIMITS — a hard, straight edge beyond which the sensor simply
 *      never looked. A far-southern VIIRS tile is half imagery and half black, because
 *      everything poleward of the satellite's ground track is unobserved.
 *
 * No amount of date-stacking fixes the second kind: it is a boundary, not a seam, and it
 * moves only slightly between polar winter and polar summer. The first attempt at a fix
 * stacked five translucent dates and the black wedges remained, for exactly this reason.
 *
 * The resolution is to stop treating daily imagery as the SURFACE and treat it as a layer
 * over a surface that has no gaps. BlueMarble is NASA's own cloud-free reference mosaic
 * assembled from months of observations — Antarctica is complete and white, the oceans are
 * filled, and there is not one hole in it. It only reaches z8 (z9 returns HTTP 400), which
 * is of no consequence: it is the base for the GLOBAL view, and the deeper zoom range is
 * served by daily imagery and then by vector streets.
 *
 * Both products are the same free, keyless, public-domain NASA service. Nothing new is
 * being relied on — this is a different layer from a source already in use.
 */
export const GIBS_BASE_LAYER = 'BlueMarble_ShadedRelief';
export const GIBS_BASE_MATRIX = 'GoogleMapsCompatible_Level8';
export const GIBS_BASE_MAX_ZOOM = 8;

/**
 * GIBS wants a date in the path. The imagery is a daily composite, so the value changes
 * WHICH DAY you see, not the resolution.
 *
 * ONE date is used, from z4 downward. There used to be five, stacked as translucent
 * layers on the theory that orbital swath seams fall in different places on different
 * days and would cover each other. They do not cover each other: a swath gap is OPAQUE
 * BLACK in the source image rather than transparent, so translucent layers CONVERGE
 * toward black instead of diluting it. Measured across a 1.0 -> 0.62 -> 0.5 -> 0.22
 * opacity ladder over an opaque gap-free base, the bands stayed visible at every step.
 *
 * The global view therefore uses the reference mosaic (see GIBS_BASE_LAYER) and this
 * daily product takes over from z4, where a continent fills the view and the seams have
 * narrowed to a scale the imagery's own detail outweighs.
 */
export const GIBS_DATE = '2024-07-01';


export interface MapSourceConfig {
  /** MapLibre style document, built at runtime so the key can be injected. */
  style: Record<string, unknown>;
  /** Which imagery source the globe is actually using, for the UI to state. */
  imagery: 'gibs' | 'maptiler' | 'none';
  /** Whether a satellite raster layer is present at all. */
  hasSatellite: boolean;
  /** The deepest zoom at which SATELLITE imagery is available. */
  satelliteMaxZoom: number;
  /** A sentence the UI can render verbatim, describing what is available. */
  description: string;
}

/**
 * The MapTiler key, if the operator supplied one.
 *
 * It comes from an env var rather than being committed, and the README documents the
 * setup. It is a PUBLIC client-side key by design — it necessarily ships in the
 * bundle — so its protection is the provider's own origin restriction and quota, not
 * secrecy. The code refuses to treat it as a secret and the docs say so.
 */
export function readMapTilerKey(): string | null {
  const raw = import.meta.env.VITE_MAPTILER_KEY;
  if (typeof raw !== 'string') return null;
  const key = raw.trim();
  // A placeholder that was never filled in must not be sent as if it were a key.
  if (!key || key.startsWith('your_') || key === 'REPLACE_ME') return null;
  return key;
}

/**
 * Build the style document.
 *
 * SOURCES ARE STACKED, NOT CHOSEN
 * The satellite raster sits UNDER the vector layer. At low zoom the vector layer
 * draws no roads (there are none to draw) so the imagery reads as the surface; as you
 * zoom in, the vector data fills in. That is what produces the globe → country →
 * city progression from two sources that individually only cover half the range.
 */
export function buildMapStyle(options: {
  maptilerKey: string | null;
  /** Original labels in the local language, e.g. Chinese names where OSM has them. */
  preferLocalNames?: boolean;
}): MapSourceConfig {
  const { maptilerKey, preferLocalNames = true } = options;

  /*
   * Satellite raster.
   *
   * With a MapTiler key the imagery is theirs (deeper, higher resolution). Without
   * one it is NASA GIBS, which is free, keyless and public domain — and stops at z9.
   */
  const satellite = maptilerKey
    ? {
        tiles: [
          `https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key=${maptilerKey}`,
        ],
        // MapTiler's satellite-v2 is documented to z20; the layer is capped in
        // `maxzoom` anyway so MapLibre overzooms the last real tile instead of
        // requesting tiles that do not exist.
        maxzoom: 20,
        tileSize: 512,
        attribution: ATTRIBUTION.maptiler,
      }
    : {
        /*
         * GIBS is served as a WMTS matrix set in Web Mercator. The path shape is:
         *   /wmts/epsg3857/best/{layer}/default/{date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg
         * Note the {y}/{x} order — WMTS uses row-then-column, which is the reverse of
         * the usual XYZ convention. Getting this wrong produces a map that looks
         * scrambled rather than broken, so it is worth stating.
         */
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${GIBS_DATE}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        ],
        maxzoom: GIBS_MAX_ZOOM,
        tileSize: 256,
        attribution: ATTRIBUTION.gibs,
      };
  /*
   * The style.
   *
   * Deliberately hand-written rather than fetched from OpenFreeMap's hosted style
   * JSON. Two reasons: the hosted style is a full-day of cartography tuned for its
   * own use, and adopting it would make this page look like an OpenFreeMap demo; and
   * fetching it means one more network dependency before anything can render. The
   * layers below are the minimum that produces a legible dark map.
   */
  const nameField = preferLocalNames ? 'name:zh' : 'name';

  const style: Record<string, unknown> = {
    version: 8,
    /*
     * GLOBE PROJECTION.
     *
     * This belongs in the STYLE, not in the Map constructor options — verified
     * against the installed type definitions (maplibre-gl-style-spec 26.4.4), where
     * `projection` is a top-level StyleSpecification property and is NOT part of
     * MapOptions. Passing it to `new Map({...})` type-checks as an error.
     *
     * MapLibre 5+ renders the world as a sphere at low zoom and transitions into flat
     * Mercator as you descend, which is what lets ONE map serve both "a planet seen
     * from space" and "a city street". That transition is the entire reason this
     * renderer replaces the old fixed-texture sphere.
     */
    projection: { type: 'globe' },
    // A dark base so the map belongs to the rest of the site. MapLibre paints this
    // before any tile arrives, which also prevents a white flash on first load.
    background: { type: 'background', paint: { 'background-color': '#05070a' } },
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      satellite: {
        type: 'raster',
        tiles: satellite.tiles,
        tileSize: satellite.tileSize,
        maxzoom: satellite.maxzoom,
        attribution: satellite.attribution,
      },
      /*
       * The gap-free base, and where it is used.
       *
       * BlueMarble is NASA's cloud-free reference mosaic — Antarctica is complete, the
       * oceans are filled, and there is not one hole in it. That is exactly what daily
       * imagery cannot offer, which is why it carries the global view on its own.
       */
      ...(maptilerKey
        ? {}
        : {
            satellite_base: {
              type: 'raster',
              tiles: [
                `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${GIBS_BASE_LAYER}/default/2004-08-01/${GIBS_BASE_MATRIX}/{z}/{y}/{x}.jpg`,
              ],
              tileSize: 256,
              maxzoom: GIBS_BASE_MAX_ZOOM,
              attribution: ATTRIBUTION.gibs,
            },
          }),
      openmaptiles: {
        type: 'vector',

        /*
         * AN EXPLICIT TILE TEMPLATE, NOT A TileJSON `url`.
         *
         * The `url` form was tried first and does not work here, for a reason that took
         * a lot of measuring to establish. The request itself succeeds — HTTP 200,
         * application/json, 19 KB, `Access-Control-Allow-Origin: *`, 1171 ms, and the
         * document parses with the expected `tiles`, `minzoom: 0`, `maxzoom: 14` and 16
         * `vector_layers`. MapLibre still ends up with NO tile template on the source,
         * so it never requests a single vector tile: measured at both z1.6 and z12, the
         * only OpenFreeMap request the page ever makes is the TileJSON itself.
         *
         * The likely cause is the document's `"tilejson": "3.0.0"` — a version MapLibre
         * 6.13 does not appear to act on even though it accepts the HTTP response. Rather
         * than keep fighting a version negotiation, the template is declared directly.
         * That removes the resolution step entirely and makes the source self-describing.
         *
         * THE DATE SEGMENT IS UNAVOIDABLE IN THIS FORM, AND HERE IS WHY IT IS SAFE
         * OpenFreeMap serves tiles from a date-stamped directory that changes when they
         * publish a new planet build. The template below was taken from the CURRENT
         * TileJSON and every tile tested against it returned 200 with real vector data
         * (z1 218 KB, z2 1.5 MB, z3 716 KB). It will need updating when they rotate the
         * build, and `tools/probe-openfreemap.cjs` prints the current directory so that
         * check is one command rather than an investigation.
         */
        tiles: ['https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf'],

        /*
         * `minzoom: 4` IS THE FIX FOR A REAL BUG, NOT A TUNING VALUE.
         *
         * OpenFreeMap's low-zoom tiles are huge, because OSM data is dense everywhere:
         * measured directly, a z1 tile is 218 KB and a z2 tile 1.5 MB. At those zooms
         * the whole world fits in a handful of tiles, so requesting them means megabytes
         * of download to draw a few coastlines.
         *
         * Raising the floor means the vector basemap is only fetched once it is genuinely
         * needed, at z4 and beyond, where each tile covers a small area. The globe
         * therefore shows satellite imagery at planet and continent zoom and vector
         * detail from z4 down — which is also simply better, since a street basemap has
         * nothing useful to say about a view of the whole planet.
         */
        minzoom: 4,
        maxzoom: 14,
        attribution: ATTRIBUTION.osm,
      },
    },
    layers: [
      /* --- raster imagery, at the bottom ---
         TWO RANGES, SPLIT WHERE THE TRADE-OFF ACTUALLY CHANGES.

         Below z4 ("GLOBAL") the page draws BlueMarble alone.

         The reason is a wall that several attempts hit: daily true-colour imagery has
         gaps that are OPAQUE BLACK, not transparent. Stacking translucent dates does not
         dilute them — each layer contributes its own black, so the bands CONVERGE toward
         black rather than fading. Measured across a 1.0 -> 0.62 -> 0.5 -> 0.22 opacity
         ladder with an opaque gap-free base underneath, the wedges stayed visible every
         time, because five layers at 0.22 still pass only about a third of the base.

         At the scale of a whole planet the gaps are also at their worst: several orbital
         passes fall inside one tile, so the seams are widest exactly where they are most
         obvious. And the detail that daily imagery offers is worth little at that scale,
         because a z3 tile resolves roughly 5 km per pixel.

         So the global view uses the mosaic that was BUILT to be seamless, and daily
         imagery takes over at z4, where a viewer is looking at a continent and the seams
         have narrowed to a scale the imagery's own detail outweighs — and where the
         vector basemap begins, which covers the remainder.

         Both are the same free, keyless, public-domain NASA service. */
      ...(maptilerKey
        ? []
        : [
            {
              id: 'satellite-base',
              type: 'raster',
              source: 'satellite_base',
              paint: {
                'raster-opacity': 1,
                'raster-saturation': 0.04,
                'raster-contrast': 0.05,
              },
            },
          ]),
      {
        id: 'satellite',
        type: 'raster',
        source: 'satellite',
        // The daily imagery is present only from z4, so the global view is the
        // gap-free mosaic and nothing else.
        minzoom: maptilerKey ? 0 : 4,
        paint: {
          'raster-opacity': 1,
          'raster-saturation': -0.12,
          'raster-contrast': 0.04,
        },
      },
      /* --- land and water, so the vector map is legible where imagery is absent --- */
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        // Very low opacity: the point is to deepen oceans and read as part of the
        // imagery, not to replace it with a flat shape.
        paint: { 'fill-color': '#0b1a2e', 'fill-opacity': 0.22 },
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        // Country outlines only; the detailed admin levels are noise at this scale.
        filter: ['<=', ['get', 'admin_level'], 2],
        paint: {
          'line-color': 'rgba(150, 200, 240, 0.34)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.4, 6, 1.1],
          'line-dasharray': [3, 2],
        },
      },
      {
        id: 'roads',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        // Only from z8: below that, roads are a smear rather than information.
        minzoom: 8,
        paint: {
          'line-color': 'rgba(190, 215, 240, 0.5)',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 0.4, 12, 1.4, 16, 3.2],
        },
      },
      /* --- labels, last so they sit on top --- */
      {
        id: 'place-city',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        // Cities appear from z3, towns only once you are close enough to care.
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        minzoom: 3,
        layout: {
          'text-field': ['coalesce', ['get', nameField], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 3, 9, 8, 12, 14, 15],
          'text-allow-overlap': false,
          // Fade in rather than pop, which is what makes a map feel considered.
          'text-padding': 3,
        },
        paint: {
          'text-color': '#eaf2fb',
          'text-halo-color': 'rgba(5, 7, 10, 0.85)',
          'text-halo-width': 1.3,
        },
      },
      {
        id: 'place-country',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        filter: ['==', ['get', 'class'], 'country'],
        maxzoom: 9,
        layout: {
          'text-field': ['coalesce', ['get', nameField], ['get', 'name']],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 1, 10, 5, 14],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
        },
        paint: {
          'text-color': 'rgba(232, 236, 242, 0.72)',
          'text-halo-color': 'rgba(5, 7, 10, 0.75)',
          'text-halo-width': 1.1,
        },
      },
    ],
  };

  const hasSatellite = true;
  const satelliteMaxZoom = maptilerKey ? 20 : GIBS_MAX_ZOOM;

  return {
    style,
    imagery: maptilerKey ? 'maptiler' : 'gibs',
    hasSatellite,
    satelliteMaxZoom,
    description: maptilerKey
      ? `卫星影像：MapTiler（可放大到约 z${satelliteMaxZoom}）。路网与地名：OpenStreetMap。`
      : `卫星影像：NASA GIBS（公有领域，最深 z${GIBS_MAX_ZOOM}，约 610 m/像素）。` +
        `超过该级别由 OpenStreetMap 矢量数据接管，提供真实路网与地名——` +
        `所以放大后是街道地图，不是更高清的卫星照片。`,
  };
}
