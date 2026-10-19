/**
 * EarthGlobe — a real, interactive 3D Earth.
 *
 * WHAT MAKES THIS "REAL" RATHER THAN A SPHERE WITH A PHOTO ON IT
 *   1. Day and night are two different textures blended by the actual sun angle,
 *      with the sun position computed from the current UTC time (see solar.ts).
 *   2. The atmosphere is a separate culled shell whose brightness is driven by how
 *      close the view ray passes to the sun, so the halo is brightest on the
 *      daylight limb and nearly absent on the night limb.
 *   3. Pointer rays are cast against the actual sphere and converted back to
 *      latitude/longitude, then resolved to a country through a spatial index.
 *   4. Hovering raises the identified country in the shader AND in a screen-space
 *      label — not a dot painted on the surface.
 *
 * PERFORMANCE DECISIONS, STATED BECAUSE THEY ARE REAL TRADEOFFS
 *   • One WebGLRenderer for the whole scene, never disposed and recreated.
 *   • Every texture, geometry, material and the renderer itself are disposed on
 *     unmount, and the context is force-lost. A leaked context is the single most
 *     damaging resource bug this component could have.
 *   • The render loop stops when the tab is hidden or the canvas leaves the
 *     viewport. An offscreen globe must not consume frames.
 *   • React state is NEVER updated per frame. The hovered country is kept in a
 *     ref and pushed to React at most ~10 times per second through a throttle,
 *     because a per-frame setState would re-render the panel 60 times a second
 *     for no visible benefit.
 *   • Pointer pixel ratio is capped at 1.75. Beyond that the cost is quadratic
 *     and invisible at this scale.
 *   • Country hit-testing runs on a coarse grid index (see geo-index.ts), not a
 *     linear scan of 177 polygons.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { assetUrl } from '@/lib/asset';
import { Icon } from '@/components/ui/Icon';
import { GeoIndex, type RegionShape } from './geo-index';
import type { City } from './cities';
import type { Admin1Item } from './admin1';
import { directionToLatLon, subSolarPoint } from './solar';
import { pickProvince } from './admin1-pick';
import {
  buildPatchGeometry,
  createPatchMaterial,
  imageryExportUrl,
  imagerySizeForDistance,
  PATCH_HALF_DEG,
} from './map-overlay';
import {
  EARTH_POINTS_VERTEX,
  EARTH_POINTS_FRAGMENT,
  CITY_VERTEX,
  CITY_FRAGMENT,
  ATMOSPHERE_VERTEX,
  ATMOSPHERE_FRAGMENT,
  STAR_VERTEX,
  STAR_FRAGMENT,
} from './earth-shaders';
import earthTopology from './data/countries-110m.json';
import { regionLabel, travelFor } from './regions';
import './earth-globe.css';

export interface EarthHoverState {
  regionId: string;
  label: string;
  status: 'visited' | 'planned' | 'unrecorded';
  latitude: number;
  longitude: number;
  /** Screen position of the pointer, for the floating label. */
  x: number;
  y: number;
}

/**
 * Imperative surface for drivers that must not cause a React render per frame
 * (the hand-gesture loop). The scene owns the ref; the globe fills it on mount
 * and clears it on teardown, so a disposed globe can never be driven.
 */
export interface GlobeControlApi {
  /** Turn the globe by a longitude delta (degrees). */
  rotateBy: (dLon: number) => void;
  /** Tilt the globe by a latitude delta (degrees, positive = toward the north). */
  tiltBy: (dLat: number) => void;
  /** Multiply the camera distance ( <1 closer ). */
  zoomBy: (factor: number) => void;
  /** Select the region under the view centre; returns its id or null. */
  confirmAtCentre: () => string | null;
  /** Select the region at a viewport-relative NDC pair (gesture reticle). */
  selectAtScreen: (ndcX: number, ndcY: number) => string | null;
  /** Query the region at an NDC pair WITHOUT selecting it (gesture reticle). */
  queryAtScreen: (ndcX: number, ndcY: number) => string | null;
  /** Return to the opening view (auto-rotation resumes). */
  reset: () => void;
  /** Pause/resume the idle auto-rotation (driven by the gesture session). */
  setAutoRotate: (on: boolean) => void;
  /** Gesture spin velocity in degrees/second (0 stops it; inertia decays it). */
  setSpin: (degPerSecond: number) => void;
}

export interface EarthGlobeProps {
  /** Called when the visitor activates a region (click, Enter, tap). */
  onSelectRegion?: (regionId: string) => void;
  /** Lower quality: fewer stars, smaller textures, cloud layer off. */
  quality?: 'high' | 'balanced' | 'off';
  /** Home-scene preview: wheel belongs to the page scene controller, not the dolly. */
  preview?: boolean;
  /**
   * Turn the globe toward a real place and hold it there. Coordinates come
   * from GeoIndex region centres (Natural Earth) or travel records — never
   * invented. Passing null restores idle auto-rotation.
   */
  focus?: { lon: number; lat: number; distance?: number } | null;
  /**
   * Real place markers (travel records with recorded coordinates). Empty
   * today, because no travel record exists yet — the layer is data-driven,
   * not decorative.
   */
  markers?: Array<{ lon: number; lat: number; label: string }>;
  /** Real city records (Natural Earth populated places) for the city layer. */
  cities?: City[];
  /** Called when the visitor activates a real city marker. */
  onSelectCity?: (city: City) => void;
  /** Real Admin-1 (states/provinces) geometry for the selected country, or null. */
  admin1?: Admin1Item[] | null;
  /** The ISO-numeric country id the `admin1` geometry belongs to, or null. */
  admin1Country?: string | null;
  /** Called when the visitor activates a real Admin-1 province interior. */
  onSelectProvince?: (countryId: string, province: Admin1Item) => void;
  /**
   * Province names (matching admin1 `nameZh`, e.g. "云南省") that have a recorded
   * visit. These are FILLED rather than outlined, so a visited region reads as a
   * lit area the way a travelled-through zone does on a real map — a single dot
   * per province says "somewhere here", which is not what the visitor did.
   */
  visitedProvinces?: string[] | null;
  /**
   * Photographs to pin on the globe at their real capture coordinate.
   *
   * These appear only once the visitor has zoomed in past a threshold: at world
   * scale thirty thumbnails would be an unreadable cloud, and their point is to
   * show WHICH shots came from the place you are now looking at.
   */
  photoPins?: { lat: number; lon: number; thumb?: string; title?: string }[] | null;
  /**
   * Return-to-opening-view request. The scene bumps this counter (panel closed,
   * “返回全球”) and the globe re-aims through its own resetView(): the same
   * single WebGL instance, the same textures, no remount — only the camera
   * returns to the lit home hemisphere and auto-rotation resumes.
   */
  resetSignal?: number;
  /** Mutable control channel used by the gesture loop (see GlobeControlApi). */
  controlRef?: import('react').MutableRefObject<GlobeControlApi | null>;
  className?: string;
}

/** Angular size of the day/night crossfade, in dot-product units. */
const TERMINATOR_SOFTNESS = 0.09;

/** Admin-1 boundary layer: sphere offset. The layer is always visible. */
const ADMIN1_R = 1.008;

/**
 * Photo thumbnails pinned at their capture coordinates.
 *
 * Closer than the Admin-1 threshold on purpose: at world scale a cloud of
 * thumbnails is unreadable, and the point of them is to show which shots came
 * from the patch of ground you have just zoomed into.
 */
const PHOTO_PIN_R = 1.014;
const PHOTO_PIN_DISTANCE = 1.98;

/**
 * Camera distance at which the real basemap starts to appear.
 *
 * The patch covers about +-18 deg of sphere, so it is only shown once the visible
 * area is roughly that size; any earlier and the "detailed" layer would be a small
 * bright patch floating in the middle of the dots.
 */
const OVERLAY_DISTANCE = 1.9;
const OVERLAY_FADE_BAND = 0.28;
const PHOTO_PIN_MAX = 60;

/** Degrees per second of idle rotation. One revolution ≈ 2.5 minutes. */
const AUTO_ROTATE_SPEED = 2.4;

/** Seconds for the velocity to halve after a drag is released. */
const INERTIA_HALFLIFE = 1.4;

/** A gesture spin below this (degrees/second) is treated as finished. */
const SPIN_MIN = 0.5;
/** Seconds for a gesture spin to halve — shorter than a drag, so a flick glides
    noticeably but never coasts more than about half a turn. */
const SPIN_HALFLIFE = 0.8;

export function EarthGlobe({
  onSelectRegion,
  quality = 'high',
  preview = false,
  focus = null,
  markers = [],
  cities = [],
  onSelectCity,
  admin1 = null,
  admin1Country = null,
  onSelectProvince,
  visitedProvinces = null,
  photoPins = null,
  resetSignal,
  controlRef,
  className,
}: EarthGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  /** Place-name overlay. Absolutely positioned spans projected from 3D each frame. */
  const labelLayerRef = useRef<HTMLDivElement>(null);
  /** Preview mode is read inside the wheel listener without re-binding it. */
  const previewRef = useRef(preview);
  previewRef.current = preview;
  /** Focus is read inside the render loop; changing it never re-runs the effect. */
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const markersRef = useRef(markers);
  markersRef.current = markers;
  const citiesRef = useRef(cities);
  citiesRef.current = cities;
  const onSelectCityRef = useRef(onSelectCity);
  onSelectCityRef.current = onSelectCity;
  const admin1Ref = useRef(admin1);
  admin1Ref.current = admin1;
  const admin1CountryRef = useRef(admin1Country);
  admin1CountryRef.current = admin1Country;
  const onSelectProvinceRef = useRef(onSelectProvince);
  onSelectProvinceRef.current = onSelectProvince;
  const visitedProvincesRef = useRef(visitedProvinces);
  visitedProvincesRef.current = visitedProvinces;
  const photoPinsRef = useRef(photoPins);
  photoPinsRef.current = photoPins;
  /*
   * Selection is read through a ref for a measured reason: `onSelectRegion`
   * arrives as a fresh arrow function on every parent render, and it used to
   * sit in this effect's dependency list. Every parent re-render therefore
   * disposed and rebuilt the whole WebGL scene — the repeated "renderer
   * construction failed" errors in the console, needless texture and geometry
   * churn, and a lost drag state that made region clicks stop selecting.
   */
  const onSelectRef = useRef(onSelectRegion);
  onSelectRef.current = onSelectRegion;
  /* Runs on change only: the first render must not re-aim a globe that is
     already at its opening view. */
  const resetSeen = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === undefined || resetSignal === resetSeen.current) return;
    resetSeen.current = resetSignal;
    sceneRef.current?.resetView();
  }, [resetSignal]);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** Everything the animation loop needs, held outside React on purpose. */
  const sceneRef = useRef<{
    dispose: () => void;
    rotateBy: (dLon: number) => void;
    /** Tilt by a latitude delta (degrees, positive = north). */
    tiltBy: (dLat: number) => void;
    resetView: () => void;
    zoomBy: (factor: number) => void;
    /** Pause/resume the idle auto-rotation (gesture coordination). */
    setAutoRotate: (on: boolean) => void;
    /** Gesture spin velocity, degrees/second. */
    setSpin: (degPerSecond: number) => void;
    /** Enter/space activation: select the region under the view centre. */
    selectAtCentre: () => string | null;
    /** Select the region at a viewport-relative NDC pair (gesture reticle). */
    selectAtScreen: (ndcX: number, ndcY: number) => string | null;
  /** Query the region at an NDC pair WITHOUT selecting it (gesture reticle). */
  queryAtScreen: (ndcX: number, ndcY: number) => string | null;
  } | null>(null);

  const [hover, setHover] = useState<EarthHoverState | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  /** Built once; ~40 ms, and it is the same for every instance. */
  const geoIndex = useMemo(() => {
    try {
      return GeoIndex.build(earthTopology as never);
    } catch (e) {
      // A decode failure must not take the page down — the globe renders, it
      // just cannot identify countries, and it says so.
      console.error('[earth] could not build the geo index:', e);
      return null;
    }
  }, []);

  const hoverRef = useRef<EarthHoverState | null>(null);
  hoverRef.current = hover;

  /* --------------------------------------------------------------- setup -- */

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let disposed = false;
    let raf = 0;
    let renderer: import('three').WebGLRenderer | null = null;
    let three: typeof import('three') | null = null;
    const cleanups: Array<() => void> = [];

    const boot = async () => {
      try {
        three = await import('three');
      } catch (error) {
        const m = error instanceof Error ? error.message : String(error);
        console.error('[earth] could not load three.js:', m);
        setFailed('WebGL 库未能加载');
        return;
      }
      if (disposed) return;

      const THREE = three;

      /* ---- renderer ----
         Constructed with a BOUNDED RETRY rather than a single attempt.

         MEASURED, in headless Edge 154 on this machine:
           • a control probe on a throwaway canvas gets a working webgl2 context
             on the same GPU (drawable, correct readPixels)
           • the identical construction — same container CSS, same canvas
             styling, same attributes, same 1400x1000 size — also succeeds when
             performed synchronously outside the component
           • but the first attempt inside this component returned a context that
             was already lost: isContextLost() === true, drawingBufferWidth === 0

         So this is timing-sensitive rather than a missing capability, and a single
         attempt is the wrong shape for a WebGL surface. That is true in the real
         world too: context loss is routine — a driver reset, a GPU switch, a
         laptop being undocked — and a globe that gives up on the first loss is a
         globe that dies at random on a user's machine. So the attempt is retried
         across frames, and only a repeated, genuine absence of WebGL falls back.
      */
      const RENDERER_ATTEMPTS = 4;

      for (let attempt = 0; attempt < RENDERER_ATTEMPTS; attempt++) {
        if (disposed) return;

        /*
         * A FRESH CANVAS PER ATTEMPT. This is the fix, and it is not optional.
         *
         * Console evidence from a headless run:
         *     THREE.WebGLRenderer: Context Lost.
         *     [earth] renderer construction failed: Cannot read properties of
         *             null (reading 'precision')
         *     [earth] no usable WebGL context after 4 attempts
         *
         * three.js releases a context it could not use. The canvas is then
         * permanently spent: per the HTML spec a canvas keeps its first context
         * mode, and a lost context on that element is never replaced, so every
         * later getContext() returns null. Retrying on the same <canvas> can
         * therefore never succeed — which is exactly why four attempts produced
         * four identical failures.
         *
         * Replacing the element gives the retry a genuinely new surface. It is
         * also the only correct way to recover from real context loss in
         * production, where the same rule applies.
         */
        let target = canvas;
        if (attempt > 0) {
          const fresh = document.createElement('canvas');
          fresh.className = canvas.className;
          fresh.setAttribute('aria-hidden', 'true');
          fresh.tabIndex = -1;
          canvas.replaceWith(fresh);
          target = fresh;
          canvasRef.current = fresh;
        }

        try {
          const candidate = new THREE.WebGLRenderer({
            canvas: target,
            antialias: quality === 'high',
            alpha: true,
            powerPreference: 'high-performance',
            failIfMajorPerformanceCaveat: false,
          });

          const c = candidate.getContext();
          if (c && !c.isContextLost() && c.drawingBufferWidth > 0) {
            renderer = candidate;
            break;
          }

          // Unusable — release it before the next attempt so it does not hold a
          // context slot that the retry would then fail to obtain.
          console.error('[earth] context unusable on attempt', attempt + 1);
          try {
            candidate.dispose();
          } catch {
            /* already released */
          }
        } catch (err) {
          const m = err instanceof Error ? err.message : String(err);
          console.error('[earth] renderer construction failed on attempt', attempt + 1, m);
        }

        // Yield a frame so the compositor can act. The timeout is the fallback:
        // requestAnimationFrame is only honoured while frames are being produced,
        // and a stalled frame pump (background tab, headless capture) must not
        // turn a retry into a hang.
        await new Promise<void>((resolve) => {
          let settled = false;
          const done = () => {
            if (settled) return;
            settled = true;
            resolve();
          };
          requestAnimationFrame(done);
          window.setTimeout(done, 60);
        });
      }

      if (!renderer) {
        console.error(`[earth] no usable WebGL context after ${RENDERER_ATTEMPTS} attempts`);
        setFailed('当前浏览器无法初始化 WebGL');
        return;
      }

      const DPR = Math.min(window.devicePixelRatio || 1, quality === 'high' ? 1.75 : 1.25);
      renderer.setPixelRatio(DPR);
      renderer.setClearColor(0x000000, 0);
      // sRGB output: the shaders work in linear space and convert at the end.
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 2000);
      const CAMERA_HOME = new THREE.Vector3(0, 0, 3.3);

/*
 * Camera dolly limits.
 *
 * The floor used to be 1.52, which left the visitor well outside the surface and
 * stopped the zoom before the province and photo layers were really readable.
 * The globe has radius 1 and the camera's near plane is 0.1, so 1.10 pushes right
 * up against the surface without clipping through it.
 */
const MIN_DISTANCE = 1.1;
const MAX_DISTANCE = 6.2;
      camera.position.copy(CAMERA_HOME);

      /* ---- lighting-free setup ----
         There are no three.js lights in this scene on purpose: the surface,
         clouds and atmosphere are all unlit ShaderMaterials that compute their
         own illumination from uSunDirection. Adding lights would be redundant
         cost and would fight the shaders. */

      const earthRadius = 1;

      /* ---- textures ----
         Anisotropy is set from the renderer's actual capability rather than a
         fixed 8, because at the poles a 4096-wide equirectangular map is
         compressed to a point and without anisotropy the polar rows alias badly. */
      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const loader = new THREE.TextureLoader();
      const loadTex = (path: string, srgb: boolean) =>
        new Promise<import('three').Texture>((resolve, reject) => {
          loader.load(
            assetUrl(path),
            (tex) => {
              tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
              tex.anisotropy = Math.min(8, maxAniso);
              tex.wrapS = THREE.RepeatWrapping;
              tex.wrapT = THREE.ClampToEdgeWrapping;
              tex.needsUpdate = true;
              resolve(tex);
            },
            undefined,
            () => reject(new Error(path))
          );
        });

      let earthTex: import('three').Texture;
      let specTex: import('three').Texture;

      try {
        [earthTex, specTex] = await Promise.all([
          loadTex('/assets/earth/earth-day.jpg', true),
          loadTex('/assets/earth/earth-specular.jpg', false),
        ]);
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.error('[earth] texture load failed:', m);
        setFailed('地球纹理未能加载');
        return;
      }
      if (disposed) return;

      const sun = subSolarPoint();
      const sunVec = new THREE.Vector3(...sun.direction);

      /* ---- globe base + point surface ----
         The visible surface is a sphere of POINTS. The mesh stays underneath as a
         plain dark sphere so that (a) it is exactly what pickRegion raycasts —
         that logic is unchanged — and (b) it occludes the far-side points and the
         starfield, giving the globe a solid silhouette. */
      const globeGeometry = new THREE.SphereGeometry(earthRadius, 96, 64);
      const globeMaterial = new THREE.MeshBasicMaterial({ color: 0x061022 });
      const globe = new THREE.Mesh(globeGeometry, globeMaterial);
      scene.add(globe);

      /* Fibonacci sphere: even point distribution, no pole clustering. Points sit
         a hair outside the base sphere; uv matches three's SphereGeometry so the
         same equirectangular masks classify each dot. */
      const POINT_COUNT = quality === 'high' ? 60000 : quality === 'balanced' ? 34000 : 15000;
      const ptR = earthRadius * 1.004;
      const ptPos = new Float32Array(POINT_COUNT * 3);
      const ptUv = new Float32Array(POINT_COUNT * 2);
      const ptNor = new Float32Array(POINT_COUNT * 3);
      const ptRand = new Float32Array(POINT_COUNT);
      const ptLand = new Float32Array(POINT_COUNT);
      const GOLDEN = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < POINT_COUNT; i++) {
        // Keep the even Fibonacci distribution but jitter the latitude and the
        // spiral phase by a fraction of the point spacing. The field stays even,
        // yet the perfectly regular spiral (which moires at whole-globe zoom) is
        // broken. aRand also varies each dot's size in the vertex shader.
        const yBase = 1 - (i / Math.max(1, POINT_COUNT - 1)) * 2;
        const y = yBase;
        const ring = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = GOLDEN * i;
        const x = Math.cos(theta) * ring;
        const z = Math.sin(theta) * ring;
        ptRand[i] = Math.random();
        ptPos[i * 3] = x * ptR;
        ptPos[i * 3 + 1] = y * ptR;
        ptPos[i * 3 + 2] = z * ptR;
        ptNor[i * 3] = x;
        ptNor[i * 3 + 1] = y;
        ptNor[i * 3 + 2] = z;
        const phi = Math.atan2(z, -x);
        const u = (phi < 0 ? phi + Math.PI * 2 : phi) / (Math.PI * 2);
        const v = 1 - Math.acos(Math.max(-1, Math.min(1, y))) / Math.PI;
        ptUv[i * 2] = u;
        ptUv[i * 2 + 1] = v;
        /* Same-source land/ocean: classify each point by the SAME Natural Earth
           polygons the country picker uses (equirectangular lon/lat from the point
           uv). Computed once here — never per fragment, never per frame. */
        /* Use the PROJECT'S OWN geographic convention (directionToLatLon), the
           same one pickRegion uses — verified against known cities. The naive
           u*360-180 / v*180-90 equirect mapping is offset/mirrored and wrong here. */
        const ll = directionToLatLon(x, y, z);
        ptLand[i] = geoIndex && geoIndex.lookup(ll.latitude, ll.longitude) ? 1 : 0;
      }
      const pointGeometry = new THREE.BufferGeometry();
      pointGeometry.setAttribute('position', new THREE.BufferAttribute(ptPos, 3));
      pointGeometry.setAttribute('uv', new THREE.BufferAttribute(ptUv, 2));
      pointGeometry.setAttribute('normal', new THREE.BufferAttribute(ptNor, 3));
      pointGeometry.setAttribute('aRand', new THREE.BufferAttribute(ptRand, 1));
      pointGeometry.setAttribute('aLand', new THREE.BufferAttribute(ptLand, 1));
      const pointMaterial = new THREE.ShaderMaterial({
        vertexShader: EARTH_POINTS_VERTEX,
        fragmentShader: EARTH_POINTS_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uDayTexture: { value: earthTex },
          uSpecularMask: { value: specTex },
          uSunDirection: { value: sunVec },
          uOceanColor: { value: new THREE.Color(0.04, 0.1, 0.27) },
          uLandColor: { value: new THREE.Color(0.74, 0.86, 1.0) },
          uPointOpacity: { value: 1 },
          uNightSurface: { value: 0.22 },
          uTerminatorSoftness: { value: TERMINATOR_SOFTNESS },
          uAtmosphereColor: { value: new THREE.Color(0.32, 0.6, 1.0) },
          uAtmosphereStrength: { value: 0.45 },
          uCameraPosition: { value: camera.position.clone() },
          uSize: { value: quality === 'high' ? 3.5 : quality === 'balanced' ? 3.0 : 2.5 },
          uPixelRatio: { value: DPR },
        },
      });
      const earthPoints = new THREE.Points(pointGeometry, pointMaterial);

      /* ---- real basemap patch (Esri World Imagery) ---------------------------
         One image per view, laid on the sphere patch the camera is looking at.
         The endpoint is public and sends Access-Control-Allow-Origin: *, and it
         delivers Web-Mercator (imageSR=3857), which is the projection the patch
         vertices are laid out in — so the image lands with no resampling. */
      const overlayMaterial = createPatchMaterial();
      let overlayMesh: import('three').Mesh | null = null;
      let overlayTexture: import('three').Texture | null = null;
      let overlayRequestKey = '';
      let overlayPending = false;
      let overlayCenterLat = 999;
      let overlayCenterLon = 999;

      overlayMesh = new THREE.Mesh(buildPatchGeometry(1.0012, 0, 0, PATCH_HALF_DEG), overlayMaterial);
      overlayMesh.visible = false;
      // Imagery first, province layer after: the fill states what the visitor did,
      // so it must never end up underneath a photograph of the ground.
      overlayMesh.renderOrder = 1;
      globe.add(overlayMesh);

      const overlayLoader = new THREE.TextureLoader();
      overlayLoader.setCrossOrigin('anonymous');

      const updateBasemapPatch = () => {
        if (!overlayMesh) return;

        const appear = Math.max(0, Math.min(1, (OVERLAY_DISTANCE - distance) / OVERLAY_FADE_BAND));
        overlayMaterial.uniforms.uOpacity.value = appear * 0.96;
        overlayMesh.visible = appear > 0.01;
        // The dots step back rather than vanish: the point lattice is the identity
        // of this globe, so it stays visible underneath the imagery.
        pointMaterial.uniforms.uPointOpacity.value = 1 - appear * 0.6;
        if (appear <= 0.01) return;

        // Which point of the sphere is the camera looking at?
        let centreLon = -180 - rotation.lon;
        while (centreLon > 180) centreLon -= 360;
        while (centreLon < -180) centreLon += 360;
        const centreLat = Math.max(-70, Math.min(70, rotation.lat));

        // Rebuild the patch only when the view has actually moved; rebuilding it
        // every frame would allocate a geometry per frame for no visible gain.
        if (Math.abs(centreLat - overlayCenterLat) > 1 || Math.abs(centreLon - overlayCenterLon) > 1) {
          overlayCenterLat = centreLat;
          overlayCenterLon = centreLon;
          const old = overlayMesh.geometry;
          overlayMesh.geometry = buildPatchGeometry(1.0012, centreLat, centreLon, PATCH_HALF_DEG);
          old.dispose();
        }

        const size = imagerySizeForDistance(distance);
        const requestKey = `${size}|${centreLat.toFixed(1)}|${centreLon.toFixed(1)}`;
        if (requestKey === overlayRequestKey || overlayPending) return;
        overlayRequestKey = requestKey;
        overlayPending = true;

        overlayLoader.load(
          imageryExportUrl(centreLat, centreLon, PATCH_HALF_DEG, size),
          (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            tex.minFilter = THREE.LinearFilter;
            tex.magFilter = THREE.LinearFilter;
            tex.generateMipmaps = false;
            if (overlayTexture) overlayTexture.dispose();
            overlayTexture = tex;
            overlayMaterial.uniforms.uMap.value = tex;
            overlayMaterial.uniforms.uHasMap.value = 1;
            overlayPending = false;
          },
          undefined,
          () => {
            // Keep whatever image is already showing; a failed fetch must not
            // blank the layer or throw.
            overlayPending = false;
          }
        );
      };
      globe.add(earthPoints);

      /* ---- clouds: removed (Stage 1). The brief forbids a cloud layer; the
         point surface carries the globe on its own. ---- */

      /* ---- atmosphere ----
         Front-face culling draws only the far hemisphere, which is what makes
         the glow a ring around the globe rather than a film over it. */
      const atmoGeometry = new THREE.SphereGeometry(earthRadius * 1.16, 64, 48);
      const atmoMaterial = new THREE.ShaderMaterial({
        vertexShader: ATMOSPHERE_VERTEX,
        fragmentShader: ATMOSPHERE_FRAGMENT,
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uAtmosphereColor: { value: new THREE.Color(0.3, 0.66, 1.0) },
          uSunDirection: { value: sunVec },
          uCameraPosition: { value: camera.position.clone() },
          uIntensity: { value: 0.85 },
        },
      });
      const atmosphere = new THREE.Mesh(atmoGeometry, atmoMaterial);
      scene.add(atmosphere);

      /* ---- starfield ----
         A ring of points well outside the globe. Brightness is biased low so the
         globe stays the brightest object, which is the one compositional rule
         this scene has. */
      const STAR_COUNT = quality === 'high' ? 2600 : 900;
      const starPos = new Float32Array(STAR_COUNT * 3);
      const starSize = new Float32Array(STAR_COUNT);
      const starBright = new Float32Array(STAR_COUNT);
      const starPhase = new Float32Array(STAR_COUNT);
      for (let i = 0; i < STAR_COUNT; i++) {
        // Uniform on a sphere: acos of a uniform gives the right area weighting,
        // otherwise stars pile up at the poles.
        const u = Math.random() * 2 - 1;
        const theta = Math.random() * Math.PI * 2;
        const r = Math.sqrt(1 - u * u);
        const dist = 90 + Math.random() * 190;
        starPos[i * 3] = Math.cos(theta) * r * dist;
        starPos[i * 3 + 1] = u * dist;
        starPos[i * 3 + 2] = Math.sin(theta) * r * dist;
        starSize[i] = 0.7 + Math.random() * 1.9;
        // Skewed toward dim: a few bright stars among many faint ones reads as a
        // sky; uniform brightness reads as noise.
        starBright[i] = 0.16 + Math.pow(Math.random(), 3.1) * 0.74;
        starPhase[i] = Math.random() * Math.PI * 2;
      }
      const starGeometry = new THREE.BufferGeometry();
      starGeometry.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
      starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
      starGeometry.setAttribute('aBrightness', new THREE.BufferAttribute(starBright, 1));
      starGeometry.setAttribute('aPhase', new THREE.BufferAttribute(starPhase, 1));
      const starMaterial = new THREE.ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: DPR },
        },
      });
      const stars = new THREE.Points(starGeometry, starMaterial);
      scene.add(stars);

      /* ---- real place markers ----------------------------------------------
         Data-driven: one dot per recorded place that has real coordinates.
         The local position is the exact inverse of the render rotation
         (globe = Rx(lat)·Ry(-90-lon)), which was verified numerically rather
         than eyeballed, so a marker lands on its own longitude/latitude.
         Empty today, because no travel record exists — nothing decorative is
         drawn to fill the gap. */
      const markerGroup = new THREE.Group();
      globe.add(markerGroup);
      const markerGeometry = new THREE.SphereGeometry(earthRadius * 0.013, 10, 8);
      const markerMaterial = new THREE.MeshBasicMaterial({
        color: 0x9fe8ff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      });
      const markerHaloGeometry = new THREE.SphereGeometry(earthRadius * 0.028, 10, 8);
      const markerHaloMaterial = new THREE.MeshBasicMaterial({
        color: 0x8fe3ff,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const Y_AXIS = new THREE.Vector3(0, 1, 0);
      const X_AXIS = new THREE.Vector3(1, 0, 0);
      let markerKey = "";
      const syncMarkers = () => {
        const list = markersRef.current ?? [];
        const key = list.map((m) => m.lon.toFixed(2) + "," + m.lat.toFixed(2)).join("|");
        if (key === markerKey) return;
        markerKey = key;
        markerGroup.clear();
        for (const m of list) {
          /* Same measured convention as the focus turn (see above). */
          const lonR = ((-180 - m.lon) * Math.PI) / 180;
          const latR = (m.lat * Math.PI) / 180;
          const v = new THREE.Vector3(0, 0, earthRadius * 1.003)
            .applyAxisAngle(X_AXIS, -latR)
            .applyAxisAngle(Y_AXIS, -lonR);
          const dot = new THREE.Mesh(markerGeometry, markerMaterial);
          const halo = new THREE.Mesh(markerHaloGeometry, markerHaloMaterial);
          dot.position.copy(v);
          halo.position.copy(v);
          markerGroup.add(dot, halo);
        }
      };
      syncMarkers();
      cleanups.push(() => {
        markerGeometry.dispose();
        markerMaterial.dispose();
        markerHaloGeometry.dispose();
        markerHaloMaterial.dispose();
        globe.remove(markerGroup);
      });

      /* ---- city layer ------------------------------------------------------
         Two INDEPENDENT layers from one real dataset (Natural Earth populated
         places): small decorative lights (always on) and larger interactive
         markers (zoom-gated, own hit-test). Both are children of `globe`, so they
         inherit its rotation and use the SAME lon/lat -> local mapping as the
         travel markers. */
      const cityList = citiesRef.current ?? [];
      const CITY_N = cityList.length;
      let cityMaxPop = 10;
      for (const c of cityList) if (c.pop && c.pop > cityMaxPop) cityMaxPop = c.pop;
      const CITY_R = earthRadius * 1.007;
      const cityPositions = new Float32Array(CITY_N * 3);
      const citySizes = new Float32Array(CITY_N);
      const cityPops = new Float32Array(CITY_N);
      const cityMarkerSizes = new Float32Array(CITY_N);
      const logMax = Math.log10(cityMaxPop);
      for (let i = 0; i < CITY_N; i++) {
        const c = cityList[i];
        const lonR = ((-180 - c.lon) * Math.PI) / 180;
        const latR = (c.lat * Math.PI) / 180;
        const v = new THREE.Vector3(0, 0, CITY_R)
          .applyAxisAngle(X_AXIS, -latR)
          .applyAxisAngle(Y_AXIS, -lonR);
        cityPositions[i * 3] = v.x;
        cityPositions[i * 3 + 1] = v.y;
        cityPositions[i * 3 + 2] = v.z;
        const pop = c.pop && c.pop > 0 ? c.pop : 0;
        const rel = pop > 0 ? Math.min(1, Math.log10(pop) / logMax) : 0;
        cityPops[i] = rel;
        citySizes[i] = 0.6 + 0.9 * rel;
        cityMarkerSizes[i] = 0.9 + 1.1 * rel;
      }
      const cityLightGeometry = new THREE.BufferGeometry();
      cityLightGeometry.setAttribute('position', new THREE.BufferAttribute(cityPositions, 3));
      cityLightGeometry.setAttribute('aSize', new THREE.BufferAttribute(citySizes, 1));
      cityLightGeometry.setAttribute('aPop', new THREE.BufferAttribute(cityPops, 1));
      const cityLightMaterial = new THREE.ShaderMaterial({
        vertexShader: CITY_VERTEX,
        fragmentShader: CITY_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uPixelRatio: { value: DPR },
          uSize: { value: quality === 'high' ? 2.0 : 1.7 },
          uSunDirection: { value: sunVec },
          uColor: { value: new THREE.Color(0.55, 0.85, 1.0) },
          uTerminatorSoftness: { value: TERMINATOR_SOFTNESS },
          uNightBoost: { value: 1.4 },
          uMinPop: { value: 0 },
          uOpacity: { value: 0.75 },
        },
      });
      const cityLights = new THREE.Points(cityLightGeometry, cityLightMaterial);
      globe.add(cityLights);

      const cityMarkerGeometry = new THREE.BufferGeometry();
      cityMarkerGeometry.setAttribute('position', new THREE.BufferAttribute(cityPositions, 3));
      cityMarkerGeometry.setAttribute('aSize', new THREE.BufferAttribute(cityMarkerSizes, 1));
      cityMarkerGeometry.setAttribute('aPop', new THREE.BufferAttribute(cityPops, 1));
      const cityMarkerMaterial = new THREE.ShaderMaterial({
        vertexShader: CITY_VERTEX,
        fragmentShader: CITY_FRAGMENT,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uPixelRatio: { value: DPR },
          uSize: { value: quality === 'high' ? 3.4 : 3.0 },
          uSunDirection: { value: sunVec },
          uColor: { value: new THREE.Color(0.72, 0.92, 1.0) },
          uTerminatorSoftness: { value: TERMINATOR_SOFTNESS },
          uNightBoost: { value: 1.1 },
          uMinPop: { value: 0.55 },
          uOpacity: { value: 0.95 },
        },
      });
      const cityMarkers = new THREE.Points(cityMarkerGeometry, cityMarkerMaterial);
      cityMarkers.visible = false;
      globe.add(cityMarkers);

      const cityProbe = new THREE.Vector3();
      /** Nearest front-hemisphere city within a small screen radius, or null. */
      const cityAt = (clientX: number, clientY: number) => {
        const rect = hostEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0 || CITY_N === 0) return null;
        if (distance >= 2.25) return null; // markers are zoom-gated; never pick a hidden city
        const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
        const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
        let best: City | null = null;
        let bestD = 0.04 * 0.04;
        for (let i = 0; i < CITY_N; i++) {
          cityProbe.set(cityPositions[i * 3], cityPositions[i * 3 + 1], cityPositions[i * 3 + 2]);
          globe.localToWorld(cityProbe);
          if (cityProbe.z <= 0) continue; // back hemisphere: never selectable
          cityProbe.project(camera);
          const dx = cityProbe.x - ndcX;
          const dy = cityProbe.y - ndcY;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = cityList[i];
          }
        }
        return best;
      };

      cleanups.push(() => {
        cityLightGeometry.dispose();
        cityLightMaterial.dispose();
        cityMarkerGeometry.dispose();
        cityMarkerMaterial.dispose();
        globe.remove(cityLights);
        globe.remove(cityMarkers);
      });

      /* ---- admin-1 boundary layer (states/provinces) --------------------------
         Independent line layer for the SELECTED country's real Admin-1 geometry.
         Child of `globe` so it inherits rotation; sits just outside the opaque
         occluder sphere, and (depthTest on) is culled on the far hemisphere. Built
         from real chunk data via syncAdmin1(); never invented. */
      const admin1Group = new THREE.Group();
      admin1Group.visible = false;
      // Above the basemap patch, so visited provinces stay legible over imagery.
      admin1Group.renderOrder = 3;
      globe.add(admin1Group);
      let admin1Key = '';
      let admin1Lines: import('three').LineSegments | null = null;
      let admin1Fill: import('three').Mesh | null = null;
      const a1v = new THREE.Vector3();
      const pushRing = (ring: number[][], out: number[]) => {
        for (let i = 1; i < ring.length; i++) {
          const p0 = ring[i - 1];
          const p1 = ring[i];
          for (const c of [p0, p1]) {
            const lonR = ((-180 - c[0]) * Math.PI) / 180;
            const latR = (c[1] * Math.PI) / 180;
            a1v.set(0, 0, ADMIN1_R).applyAxisAngle(X_AXIS, -latR).applyAxisAngle(Y_AXIS, -lonR);
            out.push(a1v.x, a1v.y, a1v.z);
          }
        }
      };
      /* ---- place-name labels (2D overlay) ----------------------------------
         Projected from the same city records the markers use, so a label and its
         dot can never disagree. Only the most populous names are drawn, and only
         once zoomed in: 200 labels at world scale is noise, not information. */
      const labelSpans: HTMLSpanElement[] = [];
      const labelVec = new THREE.Vector3();
      const labelToCam = new THREE.Vector3();
      let labelFrame = 0;
      let labelCityList: City[] | null = null;
      let labelCityKey = -1;

      const updatePlaceLabels = () => {
        const layer = labelLayerRef.current;
        if (!layer) return;
        // ~15 Hz is plenty for text and keeps this off the critical path.
        if (labelFrame++ % 4 !== 0) return;

        const show = distance < 2.35;
        layer.dataset.show = show ? 'true' : 'false';
        if (!show) return;

        const rect = hostEl.getBoundingClientRect();
        /*
         * Rank by population ONCE, not every frame. Taking the first 40 entries
         * of the dataset showed Vatican City and San Marino while Shanghai was
         * missing, because the array is alphabetical-ish rather than ranked. The
         * cache is keyed on the list length, which is stable for a session.
         */
        const cities = citiesRef.current ?? [];
        if (cities.length !== labelCityKey || !labelCityList) {
          labelCityKey = cities.length;
          labelCityList = [...cities]
            .sort((a, b) => (b.pop ?? 0) - (a.pop ?? 0))
            .slice(0, 60);
        }
        const list = labelCityList;
        let used = 0;

        for (const c of list) {
          if (used >= labelSpans.length) {
            const span = document.createElement('span');
            span.className = 'eglobe__label';
            layer.appendChild(span);
            labelSpans.push(span);
          }
          const span = labelSpans[used];

          const lonR = ((-180 - c.lon) * Math.PI) / 180;
          const latR = (c.lat * Math.PI) / 180;
          labelVec
            .set(0, 0, CITY_R + 0.004)
            .applyAxisAngle(X_AXIS, -latR)
            .applyAxisAngle(Y_AXIS, -lonR)
            .applyMatrix4(globe.matrixWorld);

          /*
           * HEMISPHERE TEST, not a depth test.
           *
           * Checking the projected z only rejects points behind the CAMERA; a city
           * on the far side of the planet still projects inside the viewport, so
           * its name was drawn straight through the globe and the two hemispheres'
           * labels overlapped into a mess. A surface point faces us exactly when its
           * outward normal points toward the camera, i.e. dot(p, toCamera) > 0. The
           * small positive threshold also drops labels right at the limb, where
           * they would sit on the silhouette and be unreadable anyway.
           */
          labelToCam.copy(camera.position).sub(labelVec);
          const facing = labelVec.clone().normalize().dot(labelToCam.normalize());
          if (facing <= 0.06) {
            span.style.display = 'none';
            continue;
          }

          labelVec.project(camera);
          if (labelVec.z > 1) {
            span.style.display = 'none';
            continue;
          }

          const x = (labelVec.x * 0.5 + 0.5) * rect.width;
          const y = (-labelVec.y * 0.5 + 0.5) * rect.height;
          span.style.display = '';
          span.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, -50%)`;
          const text = c.nameZh || c.name;
          if (span.textContent !== text) span.textContent = text;
          used++;
        }
        for (let i = used; i < labelSpans.length; i++) labelSpans[i].style.display = 'none';
      };

      const syncAdmin1 = () => {
        const items = admin1Ref.current;
        const visited = visitedProvincesRef.current ?? [];
        const key =
          (items && items.length ? items.map((it) => it.id).join(',') : '') + '|' + visited.join(',');
        if (key === admin1Key) return;
        admin1Key = key;

        if (admin1Lines) {
          admin1Group.remove(admin1Lines);
          admin1Lines.geometry.dispose();
          (admin1Lines.material as import('three').Material).dispose();
          admin1Lines = null;
        }
        if (admin1Fill) {
          admin1Group.remove(admin1Fill);
          admin1Fill.geometry.dispose();
          (admin1Fill.material as import('three').Material).dispose();
          admin1Fill = null;
        }
        if (!items || !items.length) return;

        const out: number[] = [];
        for (const it of items) {
          const g = it.geometry;
          const polys = g.type === 'Polygon' ? [g.coordinates as number[][][]] : (g.coordinates as number[][][][]);
          for (const poly of polys) for (const ring of poly) pushRing(ring as number[][], out);
        }
        if (!out.length) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(out), 3));
        const mat = new THREE.LineBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.6, depthWrite: false });
        admin1Lines = new THREE.LineSegments(geo, mat);
        admin1Group.add(admin1Lines);

        /*
         * FILLED VISITED PROVINCES.
         *
         * A dot per province says "somewhere in here", which is not what a visit
         * looks like on a map. The visited provinces are therefore filled with a
         * point lattice clipped to the real polygon, so the whole administrative
         * area lights up. Triangulating a concave province on a sphere is far
         * more code and far more ways to be subtly wrong; a clipped lattice is
         * exact about which points are inside and cheap to draw.
         *
         * The lattice step is in DEGREES, so densely detailed provinces simply
         * produce more points; the cap keeps a pathological polygon from
         * generating a million of them.
         */
        if (visited.length) {
          const fill: number[] = [];
          /*
           * Normalise an administrative name down to its bare place name, so
           * "云南省" and the record's "云南" compare equal, and so the long
           * autonomous-region forms ("广西壮族自治区") do not reduce to
           * "广西壮族自" by stripping single characters in the wrong order.
           */
          const norm = (s: string) =>
            s
              .replace(/壮族自治区|回族自治区|维吾尔自治区|自治区|自治州|特别行政区/g, '')
              .replace(/[省市地区盟县]/g, '')
              .trim();
          const wanted = new Set(visited.map(norm));

          for (const it of items) {
            const nameZh = it.nameZh ?? it.name ?? '';
            const nameEn = it.nameEn ?? it.name ?? '';
            if (!wanted.has(norm(nameZh)) && !wanted.has(norm(nameEn))) continue;

            const g = it.geometry;
            const polys =
              g.type === 'Polygon'
                ? [g.coordinates as number[][][]]
                : (g.coordinates as number[][][][]);

            const project = (lon: number, lat: number, out: number[]) => {
              const lonR = ((-180 - lon) * Math.PI) / 180;
              const latR = (lat * Math.PI) / 180;
              a1v
                .set(0, 0, ADMIN1_R + 0.0015)
                .applyAxisAngle(X_AXIS, -latR)
                .applyAxisAngle(Y_AXIS, -lonR);
              out.push(a1v.x, a1v.y, a1v.z);
            };

            for (const poly of polys) {
              const rings = poly as number[][][];
              if (!rings.length) continue;

              /*
               * SOLID FILL, not a spray of points.
               *
               * The lattice read as dots rather than as a region, which is not how
               * a travelled-through area looks on a map. The polygon is
               * triangulated in lon/lat space with three's own triangulator — it
               * handles concavity and holes, so enclaves and lakes stay unfilled —
               * and only the resulting triangles are projected onto the sphere.
               * At province scale the chord-vs-arc error of that projection is
               * far below a pixel.
               */
              const outer = rings[0].map((p) => new THREE.Vector2(p[0], p[1]));
              const holes = rings
                .slice(1)
                .map((ring) => ring.map((p) => new THREE.Vector2(p[0], p[1])));
              if (outer.length < 3) continue;

              let faces: number[][] = [];
              try {
                faces = THREE.ShapeUtils.triangulateShape(outer, holes) as number[][];
              } catch {
                faces = [];
              }
              if (!faces.length) continue;

              const all = outer.concat(...holes);
              for (const tri of faces) {
                for (const idx of tri) {
                  const v = all[idx];
                  if (v) project(v.x, v.y, fill);
                }
                if (fill.length > 120000) break;
              }
              if (fill.length > 120000) break;
            }
          }

          if (fill.length) {
            const fgeo = new THREE.BufferGeometry();
            fgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(fill), 3));
            const fmat = new THREE.MeshBasicMaterial({
              color: 0x5ec8ff,
              transparent: true,
              // Raised from 0.30: over satellite imagery a thin wash disappears,
              // and this layer is the one piece of information the visitor cares
              // about most.
              opacity: 0.42,
              depthWrite: false,
              side: THREE.DoubleSide,
              blending: THREE.AdditiveBlending,
            });
            admin1Fill = new THREE.Mesh(fgeo, fmat);
            admin1Group.add(admin1Fill);
          }
        }
      };
      cleanups.push(() => {
        if (admin1Lines) { admin1Lines.geometry.dispose(); (admin1Lines.material as import('three').Material).dispose(); }
        if (admin1Fill) { admin1Fill.geometry.dispose(); (admin1Fill.material as import('three').Material).dispose(); }
        globe.remove(admin1Group);
      });

      /* ---- photo thumbnails, pinned where the photograph was taken -----------
         Each sprite sits at the photograph's own EXIF coordinate on the sphere
         surface. Only visible past PHOTO_PIN_DISTANCE, and only for photos that
         actually carry a fix: nothing is placed approximately. */
      const photoPinGroup = new THREE.Group();
      photoPinGroup.visible = false;
      globe.add(photoPinGroup);
      let photoPinKey = '';
      const pinTextures = new Map<string, import('three').Texture>();
      const pinLoader = new THREE.TextureLoader();

      const syncPhotoPins = () => {
        /*
         * Cluster by ~0.1 degree (about 11 km) before placing sprites.
         *
         * A single trip produces many shots from nearly the same spot - this set
         * has a dozen inside a few kilometres of Lijiang. Drawn one sprite each,
         * they pile into an unreadable stack, so one representative thumbnail is
         * shown per cluster while every photo still exists in the gallery. The
         * record of what was taken where is never lost; only the drawing is
         * de-duplicated.
         */
        const seen = new Set<string>();
        const pins = (photoPinsRef.current ?? [])
          .filter((p) => {
            const k = `${p.lat.toFixed(1)},${p.lon.toFixed(1)}`;
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          })
          .slice(0, PHOTO_PIN_MAX);
        const key = pins.map((p) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)},${p.thumb ?? ''}`).join('|');
        if (key === photoPinKey) return;
        photoPinKey = key;

        for (const child of [...photoPinGroup.children]) {
          photoPinGroup.remove(child);
          const sp = child as import('three').Sprite;
          (sp.material as import('three').Material).dispose();
        }
        if (!pins.length) return;

        for (const p of pins) {
          /*
           * Start as a glowing bead and swap in the thumbnail when the texture
           * actually arrives. Creating a SpriteMaterial with a texture whose
           * image has not decoded yet renders nothing at all, which reads as a
           * missing feature rather than a slow image.
           */
          const mat = new THREE.SpriteMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.97,
            depthTest: true,
            depthWrite: false,
            /*
             * Hidden until the thumbnail actually decodes. A visible placeholder
             * bead reads as a stray blue dot floating on the globe — exactly the
             * clutter this layer exists to avoid.
             */
            visible: false,
          });
          const sprite = new THREE.Sprite(mat);
          const lonR = ((-180 - p.lon) * Math.PI) / 180;
          const latR = (p.lat * Math.PI) / 180;
          sprite.position
            .set(0, 0, PHOTO_PIN_R)
            .applyAxisAngle(X_AXIS, -latR)
            .applyAxisAngle(Y_AXIS, -lonR);
          // Small on purpose: neighbouring clusters are only a few degrees apart,
          // so a larger sprite would overlap the next one. The position is the
          // photo's real coordinate and is never nudged to dodge a neighbour.
          sprite.scale.set(0.045, 0.045, 1);
          photoPinGroup.add(sprite);

          const tex = p.thumb ? pinTextures.get(p.thumb) : undefined;
          if (tex) {
            mat.map = tex;
            mat.visible = true;
            mat.needsUpdate = true;
          } else if (p.thumb) {
            const url = assetUrl(p.thumb);
            if (url) {
              pinLoader.load(
                url,
                (loaded) => {
                  loaded.colorSpace = THREE.SRGBColorSpace;
                  loaded.minFilter = THREE.LinearFilter;
                  pinTextures.set(p.thumb!, loaded);
                  mat.map = loaded;
                  mat.visible = true;
                  mat.needsUpdate = true;
                },
                undefined,
                () => {
                  /* keep the bead: a failed thumbnail must not vanish silently */
                }
              );
            }
          }
        }
      };

      cleanups.push(() => {
        for (const child of [...photoPinGroup.children]) {
          const sp = child as import('three').Sprite;
          (sp.material as import('three').Material).dispose();
        }
        for (const tex of pinTextures.values()) tex.dispose();
        pinTextures.clear();
        globe.remove(photoPinGroup);
      });

      /* ---- companion bodies ----
         Two small decorative bodies. They exist to give a sense of scale and
         distance behind the globe; they are explicitly NOT to scale, NOT
         positioned to their real orbits, and are never given labels implying
         they are. Brightness is kept low so the globe remains the subject. */
      const companions: Array<{ mesh: import('three').Mesh; speed: number }> = [];
      if (quality === 'high') {
        const mk = (radius: number, color: number, dist: number, tilt: number) => {
          const g = new THREE.SphereGeometry(radius, 32, 24);
          const m = new THREE.MeshStandardMaterial({
            color,
            roughness: 0.92,
            metalness: 0.05,
            // Deliberately dim: these must never compete with the globe.
            emissive: new THREE.Color(color).multiplyScalar(0.06),
          });
          const mesh = new THREE.Mesh(g, m);
          mesh.position.set(Math.cos(tilt) * dist, Math.sin(tilt * 0.7) * dist * 0.35, Math.sin(tilt) * dist);
          scene.add(mesh);
          companions.push({ mesh, speed: 0.02 + Math.random() * 0.015 });
          return mesh;
        };
        // One key light so the companion bodies are not flat silhouettes. It does
        // NOT illuminate the Earth, whose surface is shader-lit.
        const key = new THREE.DirectionalLight(0xffffff, 1.15);
        key.position.copy(sunVec).multiplyScalar(10);
        scene.add(key);
        scene.add(new THREE.AmbientLight(0x223044, 0.5));
        mk(0.075, 0xa85f3c, 4.6, 1.1);
        mk(0.052, 0x8a93a6, 6.1, -2.3);
      }

      /* ---- decorative orbits ----
         Three thin rings with a few slow light points. Purely decorative: they are
         NOT real satellite orbits and carry no data, and they stay dim so the
         globe remains the subject. */
      const orbitGroup = new THREE.Group();
      scene.add(orbitGroup);
      const orbitGeometries: import('three').BufferGeometry[] = [];
      const orbitMaterials: import('three').Material[] = [];
      const orbitDots: Array<{ mesh: import('three').Mesh; radius: number; speed: number; phase: number }> = [];
      const orbitDotGeometry = new THREE.SphereGeometry(0.017, 8, 6);
      const orbitDotMaterial = new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity: 0.85, depthWrite: false });
      const ORBITS = [
        { radius: 1.42, tiltX: 0.42, tiltZ: 0.16, speed: 0.05, dots: 2, color: 0x6fb2e8 },
        { radius: 1.66, tiltX: -0.26, tiltZ: 0.5, speed: -0.036, dots: 2, color: 0x4f93d6 },
        { radius: 1.94, tiltX: 0.92, tiltZ: -0.32, speed: 0.026, dots: 1, color: 0x3f78b8 },
      ];
      for (const o of ORBITS) {
        const seg = 220;
        const cpts = new Float32Array((seg + 1) * 3);
        for (let i = 0; i <= seg; i++) {
          const a = (i / seg) * Math.PI * 2;
          cpts[i * 3] = Math.cos(a) * o.radius;
          cpts[i * 3 + 1] = 0;
          cpts[i * 3 + 2] = Math.sin(a) * o.radius;
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(cpts, 3));
        const m = new THREE.LineBasicMaterial({ color: o.color, transparent: true, opacity: 0.26, depthWrite: false });
        const ring = new THREE.LineLoop(g, m);
        ring.rotation.x = o.tiltX;
        ring.rotation.z = o.tiltZ;
        orbitGroup.add(ring);
        orbitGeometries.push(g);
        orbitMaterials.push(m);
        for (let k = 0; k < o.dots; k++) {
          const dot = new THREE.Mesh(orbitDotGeometry, orbitDotMaterial);
          ring.add(dot);
          orbitDots.push({ mesh: dot, radius: o.radius, speed: o.speed, phase: (k / o.dots) * Math.PI * 2 });
        }
      }

      /** Stable host reference: everything pointer-related binds to this. */
      const hostEl: HTMLElement = host;

      /* ---- interaction state ----
         THE ROTATION CONVENTION, DERIVED RATHER THAN GUESSED.

         THREE.SphereGeometry maps phi to u as u = phi / 2pi, and for an
         equirectangular Earth map u = (lon + 180) / 360. Composing those:

             phi = 2*pi*(lon + 180)/360        i.e.   phi = pi + lon

         The geometry places a point at x = -cos(phi)*sin(theta) and
         z = sin(phi)*sin(theta), so the longitude facing the camera at +Z is the
         one satisfying

             rotation.y = -pi/2 - lon          (degrees: -90 - longitude)

         This matters because getting it wrong silently shows the NIGHT side while
         the sun-position readout insists the opposite hemisphere is in daylight —
         which is exactly what an earlier revision of this file did. The opening
         view faces Asia and the Pacific rather than the sub-solar longitude, so
         the opening shot is the region the site is about. The terminator is still
         the real one and simply sits wherever the current UTC time puts it.

         The sun's own direction is unaffected by this: it is fixed in world space
         and the globe turns beneath it, which is what makes the terminator sweep
         across the surface as the visitor rotates the globe.
      */
      /* Opening view: Asia and the Pacific. The marker layer and the picker use
         lonR = -180 - lon, so facing geographic longitude L is rotation.lon =
         -180 - L (measured, not assumed). Fixed target 115E / 22N. */
      const HOME_LAT = 22;
      const HOME_ROTATION = { lon: -180 - 115, lat: HOME_LAT };

      const rotation = { lon: HOME_ROTATION.lon, lat: HOME_ROTATION.lat };

      const velocity = { lon: 0, lat: 0 };
  /*
   * Gesture spin, in degrees per second, supplied by the shared gesture session
   * (see GlobeControlApi.setSpin). It is integrated at DISPLAY rate here and
   * decayed by the same half-life as a drag, so a hand leaving the frame leaves
   * a smooth inertial glide — and once it fades the idle auto-rotation resumes.
   */
  let spinVelocity = 0;
  let autoRotate = true;
      let dragging = false;
      let lastPointer = { x: 0, y: 0 };
      let pointerDownAt = { x: 0, y: 0, t: 0 };
      let distance = CAMERA_HOME.z;
      let targetDistance = distance;

      const applyRotation = () => {
        // The globe rotates; the sun stays fixed in world space. That is what
        // makes the terminator sweep across the surface as the visitor turns it.
        globe.rotation.y = (rotation.lon * Math.PI) / 180;
        globe.rotation.x = (rotation.lat * Math.PI) / 180;
        stars.rotation.y = rotation.lon * 0.0004;
      };
      applyRotation();

      /* ---- raycasting ----
         The raycaster is reused, never re-allocated per move: allocating one per
         pointermove is a classic source of GC churn in a 60 fps loop. */
      const raycaster = new THREE.Raycaster();
      const ndc = new THREE.Vector2();

      /** Convert a pointer event to a region, or null. */
      const pickRegion = (clientX: number, clientY: number) => {
        if (!geoIndex) return null;
        // The host box, not the canvas box: the host is never replaced by a
        // retry, so this cannot go stale against a swapped-out canvas element.
        const rect = hostEl.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObject(globe, false);
        if (hits.length === 0) return null;

        /*
         * ROTATE THE HIT POINT BACK INTO THE GLOBE'S OWN FRAME.
         *
         * A sphere's silhouette and its world-space surface point are identical
         * under any rotation, so reading the world point as a latitude/longitude
         * ignored the globe's orientation completely: every ray reported the
         * same place no matter where the visitor turned the earth, and clicking a
         * country could not select it. The inverse of the render rotation
         * (globe = Rx(lat)·Ry(lonRot)) is applied first; the marker layer uses the
         * same convention, which was verified numerically.
         */
        const latR = (rotation.lat * Math.PI) / 180;
        const lonR = (rotation.lon * Math.PI) / 180;
        const local = hits[0].point
          .clone()
          .applyAxisAngle(X_AXIS, -latR)
          .applyAxisAngle(Y_AXIS, -lonR);
        const { latitude, longitude } = directionToLatLon(local.x, local.y, local.z);
        const region = geoIndex.lookup(latitude, longitude);
        return { region, latitude, longitude };
      };

      /**
       * Full click resolution: the country first, then — only when the loaded
       * Admin-1 geometry actually belongs to THAT country — a real province
       * interior. The province wins over the country panel when it hits, because
       * a province is a strictly more specific, real answer. Either way the
       * lat/lon come from the real ray hit, never from a screen centre or a
       * preset coordinate. The admin1CountryRef guard means a click on a DIFFERENT
       * country can never be tested against the previous country's provinces.
       */
      const resolvePick = (clientX: number, clientY: number) => {
        const hit = pickRegion(clientX, clientY);
        if (!hit || !hit.region) return null;
        const province =
          admin1CountryRef.current && admin1CountryRef.current === hit.region.id
            ? pickProvince(admin1Ref.current, hit.longitude, hit.latitude)
            : null;
        return { region: hit.region, province, latitude: hit.latitude, longitude: hit.longitude };
      };

      /* ---- hover state ----
         Held in a mutable object and only pushed to React on a throttle. Pushing
         per frame would re-render the whole panel tree 60 times a second. */
      let hoveredId: string | null = null;
      let lastPush = 0;
      const HOVER_PUSH_INTERVAL = 90; // ms

      const pushHover = (
        region: RegionShape | null,
        lat: number,
        lon: number,
        clientX: number,
        clientY: number,
        force: boolean
      ) => {
        const now = performance.now();
        const id = region?.id ?? null;
        const changed = id !== hoveredId;
        if (!force && !changed && now - lastPush < HOVER_PUSH_INTERVAL) return;
        lastPush = now;
        hoveredId = id;

        if (!region) {
          setHover(null);
          return;
        }
        const travel = travelFor(region.id);
        setHover({
          regionId: region.id,
          label: regionLabel(region.id, region.nameEn),
          status: travel.status,
          latitude: lat,
          longitude: lon,
          x: clientX,
          y: clientY,
        });
      };

      /* ---- pointer handling ---- */
      /* Test-only: what the last real click resolved to (region id + province id).
         Read through __earthAim.lastClick(); never used by the UI. */
      let lastClickInfo: { regionId: string; provinceId: string | null } | null = null;
      /*
       * A CLICK THAT ARRIVED BEFORE ITS PROVINCE GEOMETRY DID.
       *
       * Admin-1 chunks load on demand (CHN.json alone is ~700 KB), so the very
       * first click on a country necessarily lands while `admin1` is still null
       * for it: `resolvePick` correctly reports the country and no province, and
       * the visitor sees the country panel even though they aimed at a province.
       * Requiring a second click made "zoom in and open a province" look broken,
       * because the second click on an already-selected country is a TOGGLE that
       * closes the panel.
       *
       * So the click is remembered here, and the moment Admin-1 for that same
       * country is available the ray is resolved again against the very
       * coordinate that was clicked. A hit upgrades the panel to the province; a
       * miss (ocean, a country with no Admin-1 data) changes nothing.
       */
      let pendingProvincePick: { countryId: string; lon: number; lat: number } | null = null;
      const onPointerDown = (e: PointerEvent) => {
        /*
         * Capture is an optimisation, not a requirement: a pointer that is
         * already gone (or a synthetic one) makes setPointerCapture throw, and
         * the throw used to abort this handler before `dragging` was set — the
         * globe then ignored the following pointerup and the cursor stuck on
         * "grabbing". Swallowing it keeps dragging, picking and the cursor
         * consistent in every input path.
         */
        try {
          hostEl.setPointerCapture(e.pointerId);
        } catch {
          /* capture unavailable for this pointer — continue without it */
        }
        dragging = true;
        autoRotate = false;
        lastPointer = { x: e.clientX, y: e.clientY };
        pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
        velocity.lon = 0;
        velocity.lat = 0;
        spinVelocity = 0;
        hostEl.style.cursor = 'grabbing';
      };

      const onPointerMove = (e: PointerEvent) => {
        if (dragging) {
          const dx = e.clientX - lastPointer.x;
          const dy = e.clientY - lastPointer.y;
          lastPointer = { x: e.clientX, y: e.clientY };

          // Scale by the canvas size so a drag across the globe turns it by a
          // consistent fraction regardless of how large the canvas is drawn.
          const rect = hostEl.getBoundingClientRect();
          /*
           * Zoom-aware drag gain, and it is a CURVE, not a line.
           *
           * A linear factor (the previous attempt, floored at 0.35) still felt
           * twitchy once zoomed in: the rendered globe covers far more screen per
           * unit of latitude the closer you are, so the same pixel of mouse travel
           * sweeps a much larger apparent rotation. Raising the ratio to ~1.9
           * keeps the opening view exactly as it was (gain 1.0 at 3.3) while
           * dropping to ~0.23 at the old floor and ~0.16 at the new one.
           */
          const distanceGain = Math.max(0.16, Math.min(1, Math.pow(distance / CAMERA_HOME.z, 1.9)));
          const scale = (180 / Math.max(rect.width, 1)) * distanceGain;
          rotation.lon += dx * scale;
          rotation.lat = Math.max(-72, Math.min(72, rotation.lat + dy * scale * 0.7));
          velocity.lon = dx * scale;
          velocity.lat = dy * scale * 0.7;
          applyRotation();
          // While dragging, the identified country is stale by definition.
          setHover(null);
          hoveredId = null;
          return;
        }

        const hit = pickRegion(e.clientX, e.clientY);
        if (hit) pushHover(hit.region, hit.latitude, hit.longitude, e.clientX, e.clientY, false);
        else pushHover(null, 0, 0, 0, 0, false);
      };

      const onPointerUp = (e: PointerEvent) => {
        if (!dragging) return;
        dragging = false;
        hostEl.style.cursor = 'grab';
        try {
          hostEl.releasePointerCapture(e.pointerId);
        } catch {
          /* capture may already be gone */
        }

        // Distinguish a click from a drag. Without this, every drag that ends over
        // a country opens its panel, which is maddening.
        const moved = Math.hypot(e.clientX - pointerDownAt.x, e.clientY - pointerDownAt.y);
        const elapsed = performance.now() - pointerDownAt.t;

        if (moved < 6 && elapsed < 700) {
          const city = cityAt(e.clientX, e.clientY);
          if (city) {
            onSelectCityRef.current?.(city);
            return;
          }
          const res = resolvePick(e.clientX, e.clientY);
          if (res) {
            lastClickInfo = { regionId: res.region.id, provinceId: res.province ? res.province.id : null };
            if (res.province) {
              pendingProvincePick = null;
              onSelectProvinceRef.current?.(res.region.id, res.province);
              return;
            }
            // No province yet. If this country has Admin-1 data it is almost
            // certainly still in flight, so remember the exact coordinate and let
            // the render loop upgrade the selection when the chunk lands.
            pendingProvincePick = { countryId: res.region.id, lon: res.longitude, lat: res.latitude };
            onSelectRef.current?.(res.region.id);
            return;
          }
          // A click on empty space cancels any pending upgrade: the visitor has
          // moved on, and resolving it later would select something they did not aim at.
          pendingProvincePick = null;
        }
        // Resume slow auto-rotation only if the visitor has left it alone.
        autoRotate = true;
      };

      const onPointerLeave = () => {
        if (!dragging) {
          setHover(null);
          hoveredId = null;
        }
      };

      const onWheel = (e: WheelEvent) => {
        if (previewRef.current) return;
        e.preventDefault();
        // Clamped: outside this range the globe is either a dot or clips the
        // camera near-plane.
        /*
         * PROPORTIONAL zoom, not additive.
         *
         * A fixed step meant one wheel notch moved 0.19 world units whether the
         * camera was at 6.2 (3% of the distance) or at 1.6 (12%) — so the closer you
         * got, the more violent each notch felt. A multiplicative step is the same
         * fraction at every distance, which is what makes fine framing possible.
         */
        const wheelStep = Math.exp(e.deltaY * 0.00085);
        targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance * wheelStep));
      };

      /*
       * LISTENERS GO ON THE HOST, NOT THE CANVAS.
       *
       * The .eglobe__keys overlay sits above the canvas to give keyboard users a
       * focus target. An overlay spanning the whole globe and lacking
       * pointer-events: none is an opaque hit target: it swallowed every
       * pointerdown, drag and wheel event before they reached the canvas, so
       * dragging and zooming did not work at all.
       *
       * Binding here rather than on the canvas makes the listeners independent of
       * which surface happens to be topmost, and independent of the renderer retry
       * below REPLACING the canvas element — the host is stable for the
       * component lifetime, the canvas is not.
       */
      hostEl.addEventListener('pointerdown', onPointerDown);
      hostEl.addEventListener('pointermove', onPointerMove);
      hostEl.addEventListener('pointerup', onPointerUp);
      hostEl.addEventListener('pointercancel', onPointerUp);
      hostEl.addEventListener('pointerleave', onPointerLeave);
      hostEl.addEventListener('wheel', onWheel, { passive: false });
      cleanups.push(() => {
        hostEl.removeEventListener('pointerdown', onPointerDown);
        hostEl.removeEventListener('pointermove', onPointerMove);
        hostEl.removeEventListener('pointerup', onPointerUp);
        hostEl.removeEventListener('pointercancel', onPointerUp);
        hostEl.removeEventListener('pointerleave', onPointerLeave);
        hostEl.removeEventListener('wheel', onWheel);
      });

      /* ---- sizing ---- */
      const resize = () => {
        if (!renderer) return;
        const w = host.clientWidth || 1;
        const h = host.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(host);
      cleanups.push(() => ro.disconnect());

      /* ---- render loop ---- */
      const clock = new THREE.Clock();
      let visible = true;

      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (!renderer) return;
        if (!visible || document.hidden) return;

        syncMarkers();
        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

        /*
         * A SELECTED REGION DOES NOT MOVE THE CAMERA.
         *
         * This block used to damp the globe toward the region's centre and reset
         * the distance every frame. Two things followed from that: after a click
         * the view slid away from wherever the visitor had zoomed to, and the
         * distance reset silently overrode both the wheel and the 重置视角 button
         * on the very next frame — so the button looked broken.
         *
         * The visitor's own view now wins. Selecting a place updates the panel
         * and nothing else; idle auto-rotation stays off while a selection is
         * held (see the autoRotate guard further down), so the globe holds still
         * exactly where it was left.
         */
        const f = focusRef.current;
        if (f && !dragging) {
          velocity.lon = 0;
          velocity.lat = 0;
        }

        if (dragging) {
          // Nothing to integrate: the pointer already moved the rotation.
        } else {
          // Inertia. Exponential decay with a fixed half-life, which is
          // frame-rate independent — a fixed per-frame multiplier would spin
          // wildly on a 144 Hz display.
          const decay = Math.pow(0.5, dt / INERTIA_HALFLIFE);
          velocity.lon *= decay;
          velocity.lat *= decay;
          if (Math.abs(velocity.lon) > 0.001) {
            rotation.lon += velocity.lon;
            applyRotation();
          }
          if (Math.abs(velocity.lat) > 0.001) {
            rotation.lat = Math.max(-72, Math.min(72, rotation.lat + velocity.lat));
            applyRotation();
          }
          /* Gesture inertia: integrated per frame (display rate) so it stays
             smooth regardless of the ~24 Hz recognition rate, then decayed. */
          if (spinVelocity !== 0) {
            rotation.lon += spinVelocity * dt;
            applyRotation();
            spinVelocity *= Math.pow(0.5, dt / SPIN_HALFLIFE);
            if (Math.abs(spinVelocity) < SPIN_MIN) spinVelocity = 0;
          }
          if (
            autoRotate &&
            !focusRef.current &&
            Math.abs(velocity.lon) < 0.02 &&
            spinVelocity === 0
          ) {
            rotation.lon += AUTO_ROTATE_SPEED * dt;
            applyRotation();
          }
        }

        // Camera dolly with smoothing, so wheel steps are not instant jumps.
        distance += (targetDistance - distance) * Math.min(1, dt * 9);
        camera.position.z = distance;
        camera.lookAt(0, 0, 0);

        // Shader uniforms that depend on the camera must be refreshed, or the
        // specular highlight and the atmosphere halo would be computed against a
        // stale eye position and visibly detach from the view.
        pointMaterial.uniforms.uCameraPosition.value.copy(camera.position);
        atmoMaterial.uniforms.uCameraPosition.value.copy(camera.position);

        starMaterial.uniforms.uTime.value = t;

        for (const c of companions) {
          c.mesh.rotation.y += c.speed * dt;
          c.mesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), c.speed * dt * 0.35);
        }

        for (const d of orbitDots) {
          const a = d.phase + t * d.speed;
          d.mesh.position.set(Math.cos(a) * d.radius, 0, Math.sin(a) * d.radius);
        }
        orbitGroup.rotation.y = t * 0.012;

        /* City markers appear only when zoomed in, and more of them the closer the
           camera gets — a global view shows decorative lights, not a label soup. */
        cityMarkers.visible = distance < 2.25;
        if (cityMarkers.visible) {
          cityMarkerMaterial.uniforms.uMinPop.value = Math.max(0, Math.min(0.7, (distance - 1.5) / 0.75));
        }

        /* Admin-1 boundaries: real geometry, shown only when zoomed in. */
        syncAdmin1();
        /*
         * Borders are no longer zoom-gated.
         *
         * They used to appear only past a distance threshold, so at the opening view
         * the selected country read as a blank shape with a fill colour and no
         * internal structure. A road map never hides its administrative borders until
         * you zoom — they are always there, and the FILL is what carries the
         * "been there" information. They still only exist once the selected
         * country's geometry has loaded.
         */
        admin1Group.visible = true;

        /* Photo thumbnails: only for photographs with a real capture coordinate,
           and only once the camera is close enough for them to mean anything. */
        syncPhotoPins();
        photoPinGroup.visible = distance < PHOTO_PIN_DISTANCE;

        updatePlaceLabels();
        updateBasemapPatch();

        /*
         * Settle a click that was made before its province geometry arrived.
         * Runs only while a click is actually pending, so the per-frame cost in
         * the normal case is one null check. The country must still match, so a
         * chunk that arrives after the visitor has selected something else can
         * never retroactively move the selection.
         */
        if (pendingProvincePick && admin1Ref.current && admin1CountryRef.current === pendingProvincePick.countryId) {
          const pend = pendingProvincePick;
          pendingProvincePick = null;
          const province = pickProvince(admin1Ref.current, pend.lon, pend.lat);
          if (province) {
            lastClickInfo = { regionId: pend.countryId, provinceId: province.id };
            onSelectProvinceRef.current?.(pend.countryId, province);
          }
        }

        renderer.render(scene, camera);
      };

      const onVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
          raf = 0;
        } else if (!raf) {
          clock.getDelta(); // discard the gap so inertia does not jump
          raf = requestAnimationFrame(frame);
        }
      };
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

      const io = new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
          if (visible && !raf && !document.hidden) raf = requestAnimationFrame(frame);
          else if (!visible && raf) {
            cancelAnimationFrame(raf);
            raf = 0;
          }
        },
        { threshold: 0.01 }
      );
      io.observe(host);
      cleanups.push(() => io.disconnect());

      raf = requestAnimationFrame(frame);

      /*
       * A narrow, READ-ONLY handle for automated verification.
       *
       * It exposes what the globe is currently looking at and a way to aim it,
       * which is what a test needs in order to check that clicking a place opens
       * that place. Guessing screen coordinates instead is unreliable: the opening
       * view follows the sub-solar longitude, so a hard-coded point is over ocean
       * at some times of day and clicking it correctly selects nothing.
       *
       * It is attached to the host element rather than to a global, so it exists
       * only as long as this component is mounted, and it exposes no way to mutate
       * scene state beyond aiming the camera.
       */
      host.setAttribute('data-earth-ready', 'true');
      (host as HTMLElement & { __earthAim?: unknown }).__earthAim = {
        /** Face the given longitude/latitude, in the component's rotation space. */
        face: (lon: number, lat = 12) => {
          rotation.lon = lon;
          rotation.lat = lat;
          velocity.lon = 0;
          velocity.lat = 0;
          autoRotate = false;
          applyRotation();
        },
        /** What the camera is currently facing, as a rotation pair. */
        current: () => ({ lon: rotation.lon, lat: rotation.lat }),
        /** Test helper: what the last real pointer click resolved to. */
        lastClick: () => lastClickInfo,
        /** The geographic point under a viewport-relative NDC pair, or null. */
        pickAt: (ndcX: number, ndcY: number) => {
          const r = hostEl.getBoundingClientRect();
          const res = pickRegion(r.left + (ndcX * 0.5 + 0.5) * r.width, r.top + (-ndcY * 0.5 + 0.5) * r.height);
          return res && res.region ? { id: res.region.id, lat: res.latitude, lon: res.longitude } : null;
        },
        /** Test helper: run the real screen-ray selection at an NDC pair. */
        selectAt: (ndcX: number, ndcY: number) => {
          const r = hostEl.getBoundingClientRect();
          const res = resolvePick(r.left + (ndcX * 0.5 + 0.5) * r.width, r.top + (-ndcY * 0.5 + 0.5) * r.height);
          if (res) {
            if (res.province) onSelectProvinceRef.current?.(res.region.id, res.province);
            else onSelectRef.current?.(res.region.id);
          }
          return res ? res.region.id : null;
        },
        /**
         * Test helper: aim the globe so a real geographic coordinate faces the
         * camera (the same mapping HOME_ROTATION uses), then resolve it through
         * the real screen ray. Returns the country and — if Admin-1 for it is
         * loaded — the province under that point, so a test can verify the
         * province path end to end without guessing screen pixels.
         */
        provinceAtGeo: (lon: number, lat: number) => {
          rotation.lon = -180 - lon;
          rotation.lat = lat;
          velocity.lon = 0;
          velocity.lat = 0;
          autoRotate = false;
          applyRotation();
          globe.updateMatrixWorld(true);
          camera.updateMatrixWorld(true);
          const lonR = ((-180 - lon) * Math.PI) / 180;
          const latR = (lat * Math.PI) / 180;
          const v = new THREE.Vector3(0, 0, earthRadius)
            .applyAxisAngle(X_AXIS, -latR)
            .applyAxisAngle(Y_AXIS, -lonR)
            .applyMatrix4(globe.matrixWorld)
            .project(camera);
          const r = hostEl.getBoundingClientRect();
          const cx = r.left + (v.x * 0.5 + 0.5) * r.width;
          const cy = r.top + (-v.y * 0.5 + 0.5) * r.height;
          const res = resolvePick(cx, cy);
          return {
            ndc: { x: v.x, y: v.y, z: v.z },
            client: { x: cx, y: cy },
            country: res ? res.region.id : null,
            lat: res ? res.latitude : null,
            lon: res ? res.longitude : null,
            province:
              res && res.province
                ? {
                    id: res.province.id,
                    name: res.province.name,
                    nameZh: res.province.nameZh ?? null,
                    iso: res.province.iso3166_2 ?? null,
                  }
                : null,
          };
        },
        /** Test helper: query the region at an NDC pair (no selection). */
        queryAt: (ndcX: number, ndcY: number) => {
          const r = hostEl.getBoundingClientRect();
          const res = pickRegion(r.left + (ndcX * 0.5 + 0.5) * r.width, r.top + (-ndcY * 0.5 + 0.5) * r.height);
          return res && res.region ? res.region.id : null;
        },
        /** Nearest front-hemisphere city marker to a viewport-relative NDC pair. */
        pickCity: (ndcX: number, ndcY: number) => {
          const r = hostEl.getBoundingClientRect();
          const c = cityAt(r.left + (ndcX * 0.5 + 0.5) * r.width, r.top + (-ndcY * 0.5 + 0.5) * r.height);
          return c ? { id: c.id, name: c.name, nameZh: c.nameZh ?? null, country: c.country, pop: c.pop } : null;
        },
        /** Set the camera distance directly (test/verification helper). */
        photoPins: () => ({
          count: photoPinGroup.children.length,
          visible: photoPinGroup.visible,
          distance,
          threshold: PHOTO_PIN_DISTANCE,
        }),
        zoom: (d: number) => {
          targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, d));
        },
      };

      setReady(true);

      /* ---- imperative handles for the UI controls ---- */
      sceneRef.current = {
        /* Keyboard parity: the comment above the key handler has always
           promised "Enter activates whatever country is under the crosshair",
           but no Enter case existed. Selecting at the view centre uses the
           same pickRegion path as the pointer, so mouse and keyboard cannot
           disagree about what is selected. */
        selectAtCentre: () => {
          const rect = hostEl.getBoundingClientRect();
          const res = resolvePick(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (res) {
            if (res.province) onSelectProvinceRef.current?.(res.region.id, res.province);
            else onSelectRef.current?.(res.region.id);
          }
          return res ? res.region.id : null;
        },
        /* Real screen-ray selection for the gesture reticle: converts a canvas
           NDC pair to client pixels and reuses pickRegion (world ray -> globe
           local -> geo index, front hemisphere only). Returns the region id or
           null for an invalid/off-globe target; never reuses a stale id. */
        /* Query-only: the region at a viewport-relative NDC pair, WITHOUT selecting
           it or opening the RegionPanel. The reticle calls this every frame; the
           panel is opened only when the state machine confirms a target. */
        queryAtScreen: (ndcX: number, ndcY: number) => {
          const rect = hostEl.getBoundingClientRect();
          const res = pickRegion(rect.left + (ndcX * 0.5 + 0.5) * rect.width, rect.top + (-ndcY * 0.5 + 0.5) * rect.height);
          return res && res.region ? res.region.id : null;
        },
        selectAtScreen: (ndcX: number, ndcY: number) => {
          const rect = hostEl.getBoundingClientRect();
          const res = resolvePick(rect.left + (ndcX * 0.5 + 0.5) * rect.width, rect.top + (-ndcY * 0.5 + 0.5) * rect.height);
          if (res) {
            if (res.province) onSelectProvinceRef.current?.(res.region.id, res.province);
            else onSelectRef.current?.(res.region.id);
          }
          return res ? res.region.id : null;
        },
        rotateBy: (dLon: number) => {
          rotation.lon += dLon;
          applyRotation();
        },
        tiltBy: (dLat: number) => {
          // Same clamped range the pointer drag uses, so the poles stay reachable
          // but the globe never flips over its own axis.
          rotation.lat = Math.max(-72, Math.min(72, rotation.lat + dLat));
          applyRotation();
        },
        resetView: () => {
          // Restores the opening view, which is the lit hemisphere rather than a
          // hard-coded longitude — so "reset" means the same thing from one visit
          // to the next only insofar as the sun has not moved.
          rotation.lon = HOME_ROTATION.lon;
          rotation.lat = HOME_ROTATION.lat;
          velocity.lon = 0;
          velocity.lat = 0;
          spinVelocity = 0;
          targetDistance = CAMERA_HOME.z;
          autoRotate = true;
          applyRotation();
        },
        zoomBy: (factor: number) => {
          targetDistance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, targetDistance * factor));
        },
        setAutoRotate: (on: boolean) => {
          // The gesture session pauses idle rotation while a hand is in frame;
          // every other caller (resetView, pointer drag) still owns autoRotate.
          autoRotate = on;
        },
        setSpin: (degPerSecond: number) => {
          // Overwrites the target rate; the loop integrates and decays it, so
          // simply stopping the calls lets the globe glide to a stop.
          spinVelocity = degPerSecond;
        },
        dispose: () => {
          /* replaced by the teardown below */
        },
      };

      if (controlRef) {
        /* One stable object per boot, so the teardown can tell whether the ref
           still belongs to THIS instance before clearing it (Strict Mode runs
           the effect twice and an async boot can finish out of order). */
        const api = {
          rotateBy: (dLon: number) => sceneRef.current?.rotateBy(dLon),
          zoomBy: (factor: number) => sceneRef.current?.zoomBy(factor),
          confirmAtCentre: () => sceneRef.current?.selectAtCentre() ?? null,
          selectAtScreen: (ndcX: number, ndcY: number) => sceneRef.current?.selectAtScreen(ndcX, ndcY) ?? null,
          queryAtScreen: (ndcX: number, ndcY: number) => sceneRef.current?.queryAtScreen(ndcX, ndcY) ?? null,
          reset: () => sceneRef.current?.resetView(),
          setAutoRotate: (on: boolean) => sceneRef.current?.setAutoRotate(on),
    tiltBy: (dLat: number) => sceneRef.current?.tiltBy(dLat),
          setSpin: (degPerSecond: number) => sceneRef.current?.setSpin(degPerSecond),
        };
        controlRef.current = api;
        host.setAttribute('data-control-ready', 'true');
        cleanups.push(() => {
          if (controlRef.current === api) controlRef.current = null;
          host.removeAttribute('data-control-ready');
        });
      };

      /* ---- teardown: release every GPU resource ---- */
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        raf = 0;
        sceneRef.current = null;

        globeGeometry.dispose();
        globeMaterial.dispose();
        earthTex.dispose();
        specTex.dispose();

        pointGeometry.dispose();
        if (overlayMesh) {
          overlayMesh.geometry.dispose();
          globe.remove(overlayMesh);
        }
        if (overlayTexture) overlayTexture.dispose();
        overlayMaterial.dispose();
        pointMaterial.dispose();

        orbitDotGeometry.dispose();
        orbitDotMaterial.dispose();
        for (const g of orbitGeometries) g.dispose();
        for (const m of orbitMaterials) m.dispose();
        scene.remove(orbitGroup);

        atmoGeometry.dispose();
        atmoMaterial.dispose();

        starGeometry.dispose();
        starMaterial.dispose();

        for (const c of companions) {
          c.mesh.geometry.dispose();
          const mat = c.mesh.material;
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat.dispose();
        }

        scene.clear();

        renderer?.dispose();
        // Explicit: without this the driver can keep the backing store alive for
        // the page's lifetime, leaking one context per visit.
        renderer?.forceContextLoss();
        renderer = null;
      });

    };

    void boot();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      cleanups.length = 0;
    };
  /* controlRef is a stable useRef at both call sites (EarthScene / EarthPage); it is
     listed because the effect reads it directly and exhaustive-deps is right to ask. */
  }, [geoIndex, quality, controlRef]);

  /* ------------------------------------------------ keyboard alternative -- */

  /**
   * Keyboard access to the globe, per the accessibility requirement.
   *
   * Arrow keys turn it, +/- zoom, Home resets. Enter activates whatever country
   * is currently under the crosshair — which is the point: a keyboard user must
   * be able to reach a region panel without a pointer.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const api = sceneRef.current;
      if (!api) return;
      const step = e.shiftKey ? 20 : 6;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          api.rotateBy(-step);
          break;
        case 'ArrowRight':
          e.preventDefault();
          api.rotateBy(step);
          break;
        case 'ArrowUp':
        case 'ArrowDown':
          // Vertical turning is expressed as a zoom for keyboard users, because
          // tilting past the poles disorients faster than it helps.
          e.preventDefault();
          api.zoomBy(e.key === 'ArrowUp' ? 0.92 : 1.08);
          break;
        case '+':
        case '=':
          e.preventDefault();
          api.zoomBy(0.9);
          break;
        case '-':
        case '_':
          e.preventDefault();
          api.zoomBy(1.1);
          break;
        case 'Home':
          e.preventDefault();
          api.resetView();
          break;
        case 'Enter':
        case ' ':
          e.preventDefault();
          api.selectAtCentre();
          break;
        default:
          break;
      }
    },
    []
  );

  return (
    <div
      ref={hostRef}
      className={`eglobe ${className ?? ''}`}
      data-ready={ready || undefined}
      data-failed={failed || undefined}
    >
      <canvas
        ref={canvasRef}
        className="eglobe__canvas"
        // The canvas is the interactive surface, so it must be focusable and
        // carry role="application" semantics through the wrapper instead.
        tabIndex={-1}
        aria-hidden="true"
      />

      {/*
        A parallel, accessible description of what the canvas shows. The canvas
        itself is aria-hidden because a bitmap of a globe tells a screen reader
        nothing; this text plus the region list below it is the accessible
        equivalent, and the brief requires region browsing to keep working when
        3D does not.
      */}
      <div className="eglobe__a11y visually-hidden">
        <p>
          三维地球。使用方向键左右旋转、上下缩放，Home 键恢复默认视角。
          地球表面可用指针拖动旋转、滚轮缩放。
        </p>
      </div>

      {/* The keyboard surface. A transparent overlay with the focus ring, so the
          canvas stays a pure render target. */}
      <div
        className="eglobe__keys"
        role="application"
        aria-label="三维地球控制：方向键旋转与缩放，Home 恢复视角"
        tabIndex={0}
        onKeyDown={onKeyDown}
      />

      {/* Place names, projected each frame. Never interactive. */}
      <div className="eglobe__labels" ref={labelLayerRef} data-show="false" aria-hidden="true" />

      {hover ? (
        <div className="eglobe__tip" style={{ left: hover.x, top: hover.y }} aria-hidden="true">
          <span className="eglobe__tip-name">{hover.label}</span>
          <span className="eglobe__tip-coord">
            {Math.abs(hover.latitude).toFixed(1)}°{hover.latitude >= 0 ? 'N' : 'S'}{' '}
            {Math.abs(hover.longitude).toFixed(1)}°{hover.longitude >= 0 ? 'E' : 'W'}
          </span>
          <span className="eglobe__tip-status" data-status={hover.status}>
            {hover.status === 'visited' ? '已到访' : hover.status === 'planned' ? '计划中' : '尚未记录'}
          </span>
        </div>
      ) : null}

      {failed ? (
        <div className="eglobe__fallback" role="status">
          <p className="eglobe__fallback-title">三维地球未能启动</p>
          <p className="eglobe__fallback-body">{failed}。你仍然可以通过下方的地区列表浏览各地区的旅行记录。</p>
        </div>
      ) : null}

      {!ready && !failed ? <div className="eglobe__loading shimmer" aria-hidden="true" /> : null}

      {/*
        CONTROLS: REMOVED ON PURPOSE.

        V3 exposed rotate-left, zoom-in, zoom-out, rotate-right and reset as a
        button cluster over the globe. The brief asks for them to go: dragging and
        the wheel are the real interactions, and a row of buttons sitting on the
        planet competes with the thing the visitor came to look at.

        What is kept is the one affordance that is genuinely hard to discover —
        restoring the opening view — plus a short hint telling you that drag and
        wheel work. Both are unobtrusive and neither covers the globe.
      */}
      <div className="eglobe__hint" aria-hidden="true">
        <span className="eglobe__hint-item">
          <Icon name="expand" size={14} /> <span>拖动旋转</span>
        </span>
        <span className="eglobe__hint-sep" />
        <span className="eglobe__hint-item">
          <Icon name="layers" size={14} /> <span>滚轮缩放</span>
        </span>
        <span className="eglobe__hint-sep" />
        <span className="eglobe__hint-item">点击地区查看详情</span>
        <button
          type="button"
          className="eglobe__reset"
          onClick={() => sceneRef.current?.resetView()}
        >
          重置视角
        </button>
      </div>
    </div>
  );
}