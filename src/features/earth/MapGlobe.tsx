/**
 * MapGlobe — the Earth page's real, multi-level map.
 *
 * WHAT THIS REPLACES, AND WHY
 * The old component rendered one fixed 4096x2048 equirectangular texture on a
 * sphere. Zooming it did nothing but magnify those pixels: the imagery carries about
 * 610 m per pixel and there is no more detail behind it. Meanwhile the upstream
 * source itself only serves 3840x1920, so the existing texture already EXCEEDS its
 * source — a higher-resolution copy cannot be obtained from it at all.
 *
 * So the fix is not a bigger texture or a wider zoom range. It is a renderer that can
 * load more data as you descend:
 *
 *   z0–z3    MapLibre's globe projection, natural-colour NASA imagery, atmosphere
 *   z4–z9    continent and country detail from the same imagery, country outlines
 *   z10–z16  OpenStreetMap VECTOR data: real roads, buildings and place names
 *
 * The imagery genuinely stops at z9 (measured: GIBS returns HTTP 400 at z10). Beyond
 * that the vector map continues, and the UI says so rather than implying the
 * satellite photography follows. That boundary is stated on the page.
 *
 * WHY MAPLIBRE AND NOT MORE THREE.JS
 * Reusing the existing Three.js globe for this would mean writing a tile pyramid, a
 * tile cache, an LOD selector and a spherical raster reprojection by hand — a large
 * amount of subtle code, to arrive where MapLibre already is. MapLibre brings globe
 * projection, continuous zoom, vector styling and label placement, and it is
 * open source with no key required. The existing globe component is NOT deleted: it
 * stays as the WebGL-failure fallback, because it needs no network at all.
 *
 * INTERACTION CONTRACT
 *   • drag to rotate, wheel to zoom, pinch to zoom — MapLibre's own handlers
 *   • hovering the surface reports the country under the cursor via the GeoIndex,
 *     which is the SAME index the old globe used, so region identification is
 *     unchanged
 *   • clicking a country opens the existing RegionPanel
 *   • the map is keyboard reachable and has a visible focus ring
 */

import { useEffect, useRef, useState } from 'react';
import type { GeoIndex, RegionShape } from './geo-index';
import { buildMapStyle, readMapTilerKey, GIBS_MAX_ZOOM } from './map-sources';
import './map-globe.css';

export interface MapGlobeProps {
  /** Region lookup, shared with the rest of the page. */
  geoIndex: GeoIndex | null;
  /** Called when the visitor picks a country. */
  onSelectRegion?: (regionId: string) => void;
  /** Called when the cursor moves over a region, or off it (null). */
  onHoverRegion?: (region: RegionShape | null, label: { lat: number; lon: number } | null) => void;
  /**
   * Called when the map genuinely cannot run: the library failed to load, or the
   * style was rejected. The parent switches to the offline globe.
   *
   * Deliberately NOT called for a tile error. Satellite tiles legitimately stop at
   * z9 — the server returns HTTP 400 past it — so treating tile failures as fatal
   * would replace a working map with the fallback the moment a visitor zoomed in.
   */
  onFail?: (reason: string) => void;
  className?: string;
}

/** Where the globe opens. Roughly the middle of the populated world. */
const HOME_VIEW = { center: [104, 24] as [number, number], zoom: 1.6 };

export function MapGlobe({ geoIndex, onSelectRegion, onHoverRegion, onFail, className }: MapGlobeProps) {
  /*
   * TWO REFS, BECAUSE TWO DIFFERENT ELEMENTS ARE INVOLVED — and conflating them was a
   * real bug that took far too long to find.
   *
   *  - `hostRef`  is the container MapLibre renders into (`.mglobe__canvas`). It must be
   *    the element whose box MapLibre measures, so it has to be the inner div.
   *  - `shellRef` is the outer `.mglobe`, which carries the status attributes that React
   *    renders (`data-status`, `data-imagery`) and the ones the effect writes
   *    (`data-map-ready`, `data-map-boots`).
   *
   * With a single ref on the inner div, the effect wrote its readiness attributes to one
   * element while the stylesheet selector and every test looked at the other. The symptom
   * was not an error — it was a contradiction: `setStatus('ready')` was reachable only
   * from inside the guarded load handler, yet the attribute it writes never appeared,
   * while `data-status` did. Two nodes, one name each.
   *
   * React's own attributes and MapLibre's container are now on the elements that
   * actually own them.
   */
  const hostRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('maplibre-gl').Map | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [failure, setFailure] = useState<string | null>(null);
  const [zoom, setZoom] = useState(HOME_VIEW.zoom);

  /*
   * The callbacks live in a ref so the map is built ONCE.
   *
   * MapLibre's handlers are registered at construction. Putting `onSelectRegion` in
   * the effect's dependency array would tear the whole map down and rebuild it every
   * time the parent re-rendered with a new closure — losing the camera position, the
   * tile cache and the WebGL context each time. The ref keeps the current handler
   * reachable without making the map depend on it.
   */
  const handlers = useRef({ onSelectRegion, onHoverRegion, onFail });
  handlers.current = { onSelectRegion, onHoverRegion, onFail };

  useEffect(() => {
    const host = hostRef.current;
    const shell = shellRef.current;
    if (!host || !shell) return;

    let disposed = false;
    let map: import('maplibre-gl').Map | null = null;

    const boot = async () => {
      let maplibregl: typeof import('maplibre-gl');
      try {
        maplibregl = await import('maplibre-gl');
      } catch (err) {
        console.error('[map-globe] maplibre-gl failed to load:', err);
        if (!disposed) {
          setFailure('地图库未能加载');
          setStatus('failed');
          handlers.current.onFail?.('library load failed');
        }
        return;
      }
      if (disposed) return;

      const { style } = buildMapStyle({ maptilerKey: readMapTilerKey() });

      try {
        map = new maplibregl.Map({
          container: host,
          style: style as never,
          center: HOME_VIEW.center,
          zoom: HOME_VIEW.zoom,
          minZoom: 0,
          // MapLibre will overzoom the last available tile past the source's maxzoom,
          // so allowing a deeper camera than the imagery is not a lie as long as the
          // UI states where imagery ends. The vector layers stay real all the way.
          maxZoom: 17,
          /*
           * No `projection` here on purpose.
           *
           * Globe projection is a STYLE property, not a Map option — verified against
           * the installed style-spec types, where `projection` is top-level on
           * StyleSpecification and absent from MapOptions. It is declared in
           * buildMapStyle() instead.
           */
          // The site is dark; letting MapLibre's default attribution pick its own
          // colours would put a light box on a black page.
          attributionControl: false,
          // No rotation or pitch: this is an atlas, and a tilted globe is harder to
          // read for the one thing the page is for — finding places.
          pitchWithRotate: false,
          dragRotate: false,
          touchPitch: false,
          /*
           * NO WRAPPED WORLD COPIES, AND THIS IS A MEASURED FIX.
           *
           * With `renderWorldCopies: true`, MapLibre draws the planet several times side
           * by side so a flat map can be panned past the date line without a gap. On a
           * GLOBE that is wrong twice over: there is nothing beyond the horizon to fill,
           * and the extra copies request tiles from columns that a regional imagery
           * service does not serve.
           *
           * Measured with copies enabled: 35 tiles at z3, all HTTP 200, no browser-reported
           * failures — and the rendered globe had four BLACK VERTICAL STRIPES, because the
           * wrapped columns had no imagery to draw. Nothing was erroring; the map was
           * faithfully drawing nothing where a wrapped copy used to be.
           */
          renderWorldCopies: false,
        });
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.error('[map-globe] map construction failed:', m);
        if (!disposed) {
          setFailure(m.slice(0, 120));
          setStatus('failed');
          handlers.current.onFail?.(m);
        }
        return;
      }

      if (disposed) {
        map.remove();
        return;
      }
      mapRef.current = map;

      /* ---- attribution: required by the sources, so it is rendered, not optional ---- */
      map.addControl(
        new maplibregl.AttributionControl({
          compact: true,
          customAttribution: 'Imagery: NASA EOSDIS GIBS · © OpenMapTiles · Data from OpenStreetMap',
        }),
        'bottom-right'
      );
      // Zoom buttons ARE wanted here, unlike on the old globe: a map with no visible
      // zoom affordance is unusable without a wheel.
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

      /* ---- diagnostics for a hard failure ---- */
      map.on('error', (e) => {
        // Tile 404s are routine (the imagery stops at z9) and must not be reported as
        // a broken map. Only a failure of the STYLE itself is fatal.
        const msg = e?.error?.message ?? '';
        if (/style|glyph/i.test(msg)) {
          console.error('[map-globe] style error:', msg);
          setFailure(msg.slice(0, 120));
          setStatus('failed');
          handlers.current.onFail?.(msg);
        }
      });

      map.on('load', () => {
        /*
         * How many times this container's map announced `load`.
         *
         * Under React 19 StrictMode the effect double-mounts, so two map instances get
         * created and the first is disposed. This count has been observed at exactly 1.
         * Keeping it means a future regression — a map built twice, or a handler
         * attached twice — is visible on the element instead of inferred from timing.
         * It is read by tools/diag-attr.cjs.
         */
        shell.setAttribute('data-map-loads', String(Number(shell.getAttribute('data-map-loads') ?? 0) + 1));

        /*
         * THE OLD `if (disposed) return;` GUARD WAS THE BUG, AND IT IS GONE.
         *
         * That guard was copied from the effect's other exit paths. In StrictMode the
         * effect mounts, cleans up and mounts again, so two Map instances are created
         * against this container. The first is disposed immediately — but MapLibre
         * still completes its style load, and `load` fires on THAT instance, whose
         * closure has `disposed === true`.
         *
         * The handler therefore returned early, silently, with no exception thrown
         * anywhere. What matters is not which effect instance owns the handler but
         * whether THIS map is the one currently attached, so the live ref is compared
         * instead. That is also correct in production, where there is no double mount.
         */
        if (mapRef.current !== map) return;

        /*
         * The ready flag is set FIRST, before any by-hand diagnostics. It must mean
         * "the map loaded" and nothing else, so it cannot depend on optional tooling
         * succeeding.
         */
        shell.setAttribute('data-map-ready', 'true');
        setStatus('ready');

        /*
         * The verification handle. Everything in here is optional tooling, so every
         * step is guarded: a fault in it must not be able to affect the map.
         */
        try {
          (shell as HTMLElement & { __mapAim?: unknown }).__mapAim = {
            current: () => ({ zoom: map!.getZoom(), center: map!.getCenter().toArray() }),
            face: (lon: number, lat: number, z?: number) => {
              map!.jumpTo({ center: [lon, lat], zoom: z ?? map!.getZoom() });
            },

            /*
             * GROUND TRUTH ABOUT WHAT ARRIVED, AND WHY THESE EXIST.
             *
             * `performance.getEntriesByType('resource')` reports ZERO vector tiles even
             * when they load perfectly, because MapLibre fetches them from a WORKER and
             * a worker's fetches do not appear in the main document's resource timeline.
             * That false negative made a working map look broken for a long time.
             *
             * These three read the map's own state instead. A test that asks "did the
             * source load and is geometry drawn" cannot be fooled by how the fetching
             * was scheduled.
             */
            sourceLoaded: (id: string) => {
              try {
                return map!.isSourceLoaded(id);
              } catch {
                return false;
              }
            },
            sourceTiles: (id: string) => {
              // `_tiles` is internal, so this is guarded and read-only. It is diagnostic
              // tooling only and never feeds a decision in the app.
              try {
                const tiles = (map!.getSource(id) as { _tiles?: Record<string, unknown> } | undefined)?._tiles;
                return tiles ? Object.keys(tiles).length : 0;
              } catch {
                return 0;
              }
            },
            renderedCount: (layerId: string) => {
              try {
                return map!.queryRenderedFeatures({ layers: [layerId] }).length;
              } catch {
                // Thrown for a layer that is not currently rendered, which is an answer
                // rather than an error.
                return 0;
              }
            },

            debug: () => {
              const style = map!.getStyle();
              const sources: Record<string, unknown> = {};
              for (const id of Object.keys(style.sources ?? {})) {
                const src = map!.getSource(id) as
                  | { type?: string; serialize?: () => Record<string, unknown> }
                  | undefined;
                let serialized: Record<string, unknown> | null = null;
                try {
                  serialized = src?.serialize?.() ?? null;
                } catch {
                  /* a source that cannot be serialized is itself worth knowing about */
                }
                sources[id] = {
                  type: src?.type,
                  tiles: serialized?.tiles ?? null,
                  minzoom: serialized?.minzoom ?? null,
                  maxzoom: serialized?.maxzoom ?? null,
                };
              }
              return {
                zoom: map!.getZoom(),
                center: map!.getCenter().toArray(),
                projection: style.projection ?? null,
                sourceIds: Object.keys(style.sources ?? {}),
                sources,
                layers: (style.layers ?? []).map((l) => ({
                  id: l.id,
                  source: (l as { source?: string }).source,
                  sourceLayer: (l as { 'source-layer'?: string })['source-layer'] ?? null,
                  minzoom: (l as { minzoom?: number }).minzoom ?? null,
                })),
              };
            },
          };
        } catch (err) {
          console.error('[map-globe] verification handle unavailable:', err);
        }
      });

      map.on('zoom', () => {
        if (!disposed) setZoom(map!.getZoom());
      });

      /* ---- hover and click, resolved through the SAME GeoIndex as before ---- */

      /**
       * Which country is at a screen point?
       *
       * The old globe cast a ray against a sphere and inverted the rotation. Here
       * MapLibre already knows the geographic coordinate under the cursor, so the
       * maths collapses to one `unproject` call plus the grid lookup — the expensive
       * part (the spatial index) is shared with the old implementation and unchanged.
       */
      const regionAt = (point: { x: number; y: number }) => {
        if (!geoIndex || !map) return null;
        const ll = map.unproject([point.x, point.y]);
        const region = geoIndex.lookup(ll.lat, ll.lng);
        return region ? { region, lat: ll.lat, lon: ll.lng } : { region: null, lat: ll.lat, lon: ll.lng };
      };

      map.on('mousemove', (e) => {
        const hit = regionAt(e.point);
        if (!hit) {
          handlers.current.onHoverRegion?.(null, null);
          return;
        }
        handlers.current.onHoverRegion?.(
          hit.region,
          hit.region ? { lat: hit.lat, lon: hit.lon } : null
        );
      });

      map.on('mouseout', () => handlers.current.onHoverRegion?.(null, null));

      map.on('click', (e) => {
        const hit = regionAt(e.point);
        if (hit?.region) handlers.current.onSelectRegion?.(hit.region.id);
      });

      // The cursor tells the visitor the surface is draggable, which a bare canvas
      // does not.
      map.getCanvas().style.cursor = 'grab';
      map.on('dragstart', () => { if (map) map.getCanvas().style.cursor = 'grabbing'; });
      map.on('dragend', () => { if (map) map.getCanvas().style.cursor = 'grab'; });
    };

    void boot();

    return () => {
      disposed = true;
      // MapLibre owns its own GL resources; `remove()` releases the context, the
      // tile cache and every DOM node it created. Without it, each visit to this page
      // leaks a full WebGL context.
      try {
        map?.remove();
      } catch {
        /* already gone */
      }
      mapRef.current = null;
      (shell as HTMLElement & { __mapAim?: unknown }).__mapAim = undefined;
      shell.removeAttribute('data-map-ready');
    };
  }, [geoIndex]);

  const maptilerActive = readMapTilerKey() !== null;

  return (
    <div
      ref={shellRef}
      className={`mglobe ${className ?? ''}`}
      data-status={status}
      data-imagery={maptilerActive ? 'maptiler' : 'gibs'}
    >
      <div ref={hostRef} className="mglobe__canvas" />

      {status === 'loading' ? (
        <div className="mglobe__loading" role="status">
          <span className="mglobe__spinner" aria-hidden="true" />
          <span>正在载入地图…</span>
        </div>
      ) : null}

      {status === 'failed' ? (
        <div className="mglobe__failed" role="alert">
          <p className="mglobe__failed-title">地图未能启动</p>
          <p className="mglobe__failed-body">
            {failure || '地图库或影像源不可用'}。已切换到本地三维地球，地区识别与投票仍然可用。
          </p>
        </div>
      ) : null}

      {/*
        The zoom readout is not decoration: it is how the page tells the truth about
        what you are looking at. Below z10 you are seeing satellite imagery; past it
        you are seeing a street map, and the note changes with you.
      */}
      <div className="mglobe__hud" aria-hidden={status !== 'ready'}>
        <span className="mglobe__zoom u-mono">z{zoom.toFixed(1)}</span>
        <span className="mglobe__legend">
          {zoom <= GIBS_MAX_ZOOM
            ? maptilerActive
              ? '卫星影像'
              : 'NASA 卫星影像（公有领域）'
            : maptilerActive
              ? '卫星影像 · 路网与地名'
              : '街道矢量图 · OpenStreetMap（卫星影像到此为止）'}
        </span>
      </div>
    </div>
  );
}
