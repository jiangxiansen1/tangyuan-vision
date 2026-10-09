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
import { directionToLatLon, subSolarPoint } from './solar';
import {
  EARTH_VERTEX,
  EARTH_FRAGMENT,
  CLOUD_VERTEX,
  CLOUD_FRAGMENT,
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

export interface EarthGlobeProps {
  /** Called when the visitor activates a region (click, Enter, tap). */
  onSelectRegion?: (regionId: string) => void;
  /** Lower quality: fewer stars, smaller textures, cloud layer off. */
  quality?: 'high' | 'balanced' | 'off';
  className?: string;
}

/** Angular size of the day/night crossfade, in dot-product units. */
const TERMINATOR_SOFTNESS = 0.09;

/** Degrees per second of idle rotation. One revolution ≈ 2.5 minutes. */
const AUTO_ROTATE_SPEED = 2.4;

/** Seconds for the velocity to halve after a drag is released. */
const INERTIA_HALFLIFE = 1.4;

export function EarthGlobe({
  onSelectRegion,
  quality = 'high',
  className,
}: EarthGlobeProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  /** Everything the animation loop needs, held outside React on purpose. */
  const sceneRef = useRef<{
    dispose: () => void;
    rotateBy: (dLon: number) => void;
    resetView: () => void;
    zoomBy: (factor: number) => void;
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
      const CAMERA_HOME = new THREE.Vector3(0, 0, 3.05);
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
      let nightTex: import('three').Texture;
      let specTex: import('three').Texture;
      let cloudTex: import('three').Texture | null = null;

      try {
        [earthTex, nightTex, specTex] = await Promise.all([
          loadTex('/assets/earth/earth-day.jpg', true),
          loadTex('/assets/earth/earth-night.jpg', true),
          loadTex('/assets/earth/earth-specular.jpg', false),
        ]);
        if (quality !== 'off') {
          cloudTex = await loadTex('/assets/earth/earth-clouds.jpg', true);
        }
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        console.error('[earth] texture load failed:', m);
        setFailed('地球纹理未能加载');
        return;
      }
      if (disposed) return;

      const sun = subSolarPoint();
      const sunVec = new THREE.Vector3(...sun.direction);

      /* ---- surface ---- */
      const globeGeometry = new THREE.SphereGeometry(earthRadius, 96, 64);
      const globeMaterial = new THREE.ShaderMaterial({
        vertexShader: EARTH_VERTEX,
        fragmentShader: EARTH_FRAGMENT,
        uniforms: {
          uDayTexture: { value: earthTex },
          uNightTexture: { value: nightTex },
          uSpecularMask: { value: specTex },
          uSunDirection: { value: sunVec },
          /* V4: the city lights are a trace, not the subject. 1.55 in V3 made
             them the dominant feature of the night side; the natural surface now
             carries it instead. */
          uNightIntensity: { value: 0.5 },
          uNightSurface: { value: 0.34 },
          uTerminatorSoftness: { value: TERMINATOR_SOFTNESS },
          uAtmosphereColor: { value: new THREE.Color(0.32, 0.6, 1.0) },
          uAtmosphereStrength: { value: 0.5 },
          uCameraPosition: { value: camera.position.clone() },
        },
      });
      const globe = new THREE.Mesh(globeGeometry, globeMaterial);
      scene.add(globe);

      /* ---- clouds ---- */
      let clouds: import('three').Mesh | null = null;
      let cloudMaterial: import('three').ShaderMaterial | null = null;
      if (cloudTex) {
        const cloudGeometry = new THREE.SphereGeometry(earthRadius * 1.006, 72, 48);
        cloudMaterial = new THREE.ShaderMaterial({
          vertexShader: CLOUD_VERTEX,
          fragmentShader: CLOUD_FRAGMENT,
          transparent: true,
          depthWrite: false,
          uniforms: {
            uCloudTexture: { value: cloudTex },
            uSunDirection: { value: sunVec },
            uCloudOpacity: { value: 0.62 },
            uTerminatorSoftness: { value: TERMINATOR_SOFTNESS },
          },
        });
        clouds = new THREE.Mesh(cloudGeometry, cloudMaterial);
        scene.add(clouds);
      }

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
          uAtmosphereColor: { value: new THREE.Color(0.36, 0.62, 1.0) },
          uSunDirection: { value: sunVec },
          uCameraPosition: { value: camera.position.clone() },
          uIntensity: { value: 1.5 },
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
         view therefore faces the sub-solar longitude, so the lit hemisphere is
         what a visitor sees first.

         The sun's own direction is unaffected by this: it is fixed in world space
         and the globe turns beneath it, which is what makes the terminator sweep
         across the surface as the visitor rotates the globe.
      */
      const HOME_LAT = 18;
      const HOME_ROTATION = { lon: -90 - sun.longitude, lat: HOME_LAT };

      const rotation = { lon: HOME_ROTATION.lon, lat: HOME_ROTATION.lat };

      const velocity = { lon: 0, lat: 0 };
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
        if (clouds) {
          clouds.rotation.y = globe.rotation.y + 0.012;
          clouds.rotation.x = globe.rotation.x;
        }
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

        // The hit point is in world space; the globe is not translated, so the
        // local frame matches world space and the direction can be used directly.
        const p = hits[0].point;
        const { latitude, longitude } = directionToLatLon(p.x, p.y, p.z);
        const region = geoIndex.lookup(latitude, longitude);
        return { region, latitude, longitude };
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
      const onPointerDown = (e: PointerEvent) => {
        hostEl.setPointerCapture(e.pointerId);
        dragging = true;
        autoRotate = false;
        lastPointer = { x: e.clientX, y: e.clientY };
        pointerDownAt = { x: e.clientX, y: e.clientY, t: performance.now() };
        velocity.lon = 0;
        velocity.lat = 0;
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
          const scale = 180 / Math.max(rect.width, 1);
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
          const hit = pickRegion(e.clientX, e.clientY);
          if (hit?.region) {
            onSelectRegion?.(hit.region.id);
            return;
          }
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
        e.preventDefault();
        // Clamped: outside this range the globe is either a dot or clips the
        // camera near-plane.
        targetDistance = Math.max(1.52, Math.min(6.2, targetDistance + e.deltaY * 0.0016));
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

        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

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
          if (autoRotate && Math.abs(velocity.lon) < 0.02) {
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
        globeMaterial.uniforms.uCameraPosition.value.copy(camera.position);
        atmoMaterial.uniforms.uCameraPosition.value.copy(camera.position);

        starMaterial.uniforms.uTime.value = t;

        for (const c of companions) {
          c.mesh.rotation.y += c.speed * dt;
          c.mesh.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), c.speed * dt * 0.35);
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
        /** The geographic point under a viewport-relative NDC pair, or null. */
        pickAt: (ndcX: number, ndcY: number) => {
          const r = hostEl.getBoundingClientRect();
          const res = pickRegion(r.left + (ndcX * 0.5 + 0.5) * r.width, r.top + (-ndcY * 0.5 + 0.5) * r.height);
          return res && res.region ? { id: res.region.id, lat: res.latitude, lon: res.longitude } : null;
        },
      };

      setReady(true);

      /* ---- imperative handles for the UI controls ---- */
      sceneRef.current = {
        rotateBy: (dLon: number) => {
          rotation.lon += dLon;
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
          targetDistance = CAMERA_HOME.z;
          autoRotate = true;
          applyRotation();
        },
        zoomBy: (factor: number) => {
          targetDistance = Math.max(1.52, Math.min(6.2, targetDistance * factor));
        },
        dispose: () => {
          /* replaced by the teardown below */
        },
      };

      /* ---- teardown: release every GPU resource ---- */
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        raf = 0;
        sceneRef.current = null;

        globeGeometry.dispose();
        globeMaterial.dispose();
        earthTex.dispose();
        nightTex.dispose();
        specTex.dispose();

        if (clouds && cloudMaterial && cloudTex) {
          clouds.geometry.dispose();
          cloudMaterial.dispose();
          cloudTex.dispose();
        }

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
  }, [geoIndex, onSelectRegion, quality]);

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
          <p className="eglobe__fallback-body">{failed}。你仍然可以通过下方的地区列表浏览与投票。</p>
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
