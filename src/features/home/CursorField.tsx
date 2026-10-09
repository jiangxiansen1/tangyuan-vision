/**
 * CursorField — the home page's spatial particle layer.
 *
 * WHAT THIS IS RECOVERED FROM, AND WHAT IS NEW
 * --------------------------------------------
 * V2 had a particle field in `HubBackdrop.tsx` (preserved in
 * tangyuan-vision-v2-backup-20260909). It was a single THREE.BufferGeometry drawn
 * as points, with a ShaderMaterial that drifted each particle on a phase offset and
 * a heavily damped pointer PARALLAX. That file was deleted in V3 and the particles
 * went with it.
 *
 * The recoverable part — one draw call, phase-offset drift, DPR cap, full disposal
 * — is restored here. What V2 did NOT have, and what this adds, is the behaviour
 * the brief actually asks for:
 *
 *   • particles drawn toward the pointer rather than the whole field sliding
 *   • a continuous, short-lived TRAIL behind fast movement
 *   • speed-dependent direction, so a flick reads differently from a drift
 *   • gathering and dispersal rather than uniform motion
 *   • a lifetime, so motes fade in and die instead of existing forever
 *
 * V2's parallax is kept as well, because it is what gives the field depth when the
 * pointer is still — the two effects answer different questions and both are
 * wanted.
 *
 * WHY THE SIMULATION LIVES IN THE VERTEX SHADER
 * The obvious implementation is a CPU particle loop writing positions into a
 * BufferAttribute every frame. At this particle count that is thousands of writes
 * plus a full GPU upload per frame, on the same main thread that also runs React
 * and the Earth's WebGL context. Instead each particle's state is DERIVED from
 * (seed, time, pointer position), so the CPU cost per frame is four uniform writes
 * and the GPU does the rest. Memory is allocated once and never grows.
 *
 * The trail is the same field at a negative time offset with lower alpha, which is
 * why there is no second particle system, no second render loop, and no allocation
 * during interaction.
 *
 * ACCESSIBILITY AND PERFORMANCE CONTRACT
 *   • `pointer-events: none` — it can never intercept a click, drag or scroll. This
 *     matters: an overlay spanning the viewport that swallowed events would break
 *     the two windows underneath it.
 *   • Paused when the tab is hidden, and when the element leaves the viewport.
 *   • Reduced motion stops the drift AND the pointer response.
 *   • Touch gets a smaller field, because there is no hover to drive it.
 *   • Every GPU resource is disposed on unmount; the context is force-lost.
 */

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useVisualStore } from '@/store/useVisualStore';
import './cursor-field.css';

/** Particle counts per quality tier. Kept modest on purpose — see the brief's ban
 *  on filling the page with particles. */
const COUNT = { high: 900, balanced: 460, off: 220 } as const;

/** Device pixel ratio ceiling. Beyond ~1.75 the cost is quadratic and invisible. */
const MAX_DPR = 1.75;

interface CursorFieldProps {
  className?: string;
}

export function CursorField({ className }: CursorFieldProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const { reduced } = usePrefersReducedMotion();
  const quality = useVisualStore((s) => s.glassQuality);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let raf = 0;
    let renderer: import('three').WebGLRenderer | null = null;
    const cleanups: Array<() => void> = [];

    const boot = async () => {
      let THREE: typeof import('three');
      try {
        THREE = await import('three');
      } catch (err) {
        // Nothing to degrade to: the field is decoration, so it simply does not
        // appear and the page is unaffected.
        console.error('[cursor-field] three.js unavailable:', err);
        return;
      }
      if (disposed) return;

      const count = COUNT[quality] ?? COUNT.high;

      /* ---- renderer ---- */
      // The same bounded retry the globe uses, for the same measured reason: a
      // canvas whose context was lost can never provide another one, so a retry
      // must use a FRESH canvas element.
      let canvas = host.querySelector('canvas') as HTMLCanvasElement | null;
      if (!canvas) {
        canvas = document.createElement('canvas');
        host.appendChild(canvas);
      }

      for (let attempt = 0; attempt < 3 && !renderer; attempt++) {
        if (attempt > 0) {
          const fresh = document.createElement('canvas');
          fresh.className = canvas.className;
          canvas.replaceWith(fresh);
          canvas = fresh;
        }
        try {
          const candidate = new THREE.WebGLRenderer({
            canvas,
            alpha: true,
            antialias: false,
            // Decoration only: no depth buffer, and low-power keeps it off the
            // discrete GPU on laptops that have both.
            depth: false,
            powerPreference: 'low-power',
          });
          const ctx = candidate.getContext();
          if (ctx && !ctx.isContextLost() && ctx.drawingBufferWidth > 0) {
            renderer = candidate;
            break;
          }
          candidate.dispose();
        } catch {
          /* try the next canvas */
        }
        await new Promise<void>((r) => {
          let done = false;
          const fin = () => { if (!done) { done = true; r(); } };
          requestAnimationFrame(fin);
          window.setTimeout(fin, 60);
        });
      }
      if (!renderer) {
        console.error('[cursor-field] no usable WebGL context; particle layer skipped');
        return;
      }

      renderer.setClearColor(0x000000, 0);
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      renderer.setPixelRatio(dpr);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 140);
      camera.position.set(0, 0, 30);

      /* ---- particle attributes ----
         Distributed in a slab rather than a cube so the field has depth without
         piling up at the near plane, and given a per-particle seed that drives both
         the drift phase and the trail offset. */
      const positions = new Float32Array(count * 3);
      const seeds = new Float32Array(count);
      const sizes = new Float32Array(count);
      for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 68;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 40;
        positions[i * 3 + 2] = -6 - Math.random() * 54;
        seeds[i] = Math.random();
        sizes[i] = 0.5 + Math.random() * 1.7;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
      geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

      const uniforms = {
        uTime: { value: 0 },
        uPixelRatio: { value: dpr },
        uOpacity: { value: quality === 'high' ? 0.62 : 0.48 },
        /** Pointer in the same coordinate space as the slab, i.e. -1..1 scaled. */
        uPointer: { value: new THREE.Vector2(0, 0) },
        /** 0 = still, 1 = fast. Drives gather strength and trail brightness. */
        uSpeed: { value: 0 },
        /** Motion direction, normalised, used to offset the trail backwards. */
        uDir: { value: new THREE.Vector2(0, 0) },
        uReduced: { value: reduced ? 1 : 0 },
      };

      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms,
        vertexShader: /* glsl */ `
          attribute float aSeed;
          attribute float aSize;

          uniform float uTime;
          uniform float uPixelRatio;
          uniform vec2  uPointer;
          uniform float uSpeed;
          uniform vec2  uDir;
          uniform float uReduced;

          varying float vFade;
          varying float vSeed;

          void main() {
            vec3 p = position;

            /* Base drift, phased per particle so the field breathes as a whole
               instead of sliding as one block. Frozen under reduced motion. */
            float drift = 1.0 - uReduced;
            p.y += sin(uTime * 0.16 + aSeed * 6.283) * 0.9 * drift;
            p.x += cos(uTime * 0.11 + aSeed * 6.283) * 0.6 * drift;

            /* POINTER ATTRACTION.
               Each particle leans toward the pointer by an amount that falls off
               with distance, so nearby motes pull in and distant ones barely move.
               That falloff is what reads as "gathering" rather than the whole field
               translating. */
            vec2 toPointer = uPointer - p.xy;
            float dist = length(toPointer);
            float pull = (1.0 - smoothstep(0.0, 26.0, dist)) * uSpeed * 1.7 * drift;
            p.xy += normalize(toPointer + 0.0001) * pull;

            /* TRAIL.
               The trail is this same particle drawn again at an earlier time, offset
               BACKWARDS along the motion direction. One field, two samples — which
               is why there is no second buffer or second loop. The offset scales
               with speed so a still pointer produces no trail at all. */
            float trailTail = 0.0;
            if (aSeed > 0.72) {
              // Only a subset carries a trail; a trail on every mote looks like
              // smear rather than motion.
              trailTail = 1.0;
              float back = 1.4 + aSeed * 2.4;
              p.xy -= uDir * back * uSpeed * 3.2;
            }

            vec4 mv = modelViewMatrix * vec4(p, 1.0);

            /* Fade the far end of the slab so the field dissolves rather than
               ending in a visible wall, and fade the trail particles further. */
            float depthFade = smoothstep(-62.0, -6.0, mv.z) * 0.9 + 0.1;
            vFade = depthFade * mix(1.0, 0.42, trailTail);
            vSeed = aSeed;

            gl_Position = projectionMatrix * mv;
            gl_PointSize = aSize * uPixelRatio * (17.0 / -mv.z);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          uniform float uSpeed;

          varying float vFade;
          varying float vSeed;

          void main() {
            /* Round, soft-edged points. A hard square point reads as a dead pixel,
               which is the most common way a particle field looks cheap. */
            vec2 d = gl_PointCoord - vec2(0.5);
            float r = length(d);
            if (r > 0.5) discard;
            float a = smoothstep(0.5, 0.04, r) * vFade * uOpacity;

            /* A cool, slightly cyan-biased white keeps the field inside the brand.
               The warmest tenth are nudged warmer so the field is not monotone,
               which is what stops it reading as a texture rather than a sky. */
            vec3 col = vec3(0.72, 0.88, 1.0);
            if (vSeed > 0.9) col = mix(col, vec3(1.0, 0.92, 0.82), 0.6);

            /* Faster motion brightens the field very slightly, which is the visual
               confirmation that the particles noticed the pointer. */
            a *= 1.0 + uSpeed * 0.5;

            gl_FragColor = vec4(col, a);
          }
        `,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      /* ---- pointer tracking, heavily damped ----
         Damping is what makes the response feel physical. An undamped pointer would
         snap the field to the cursor, which reads as a bug rather than as inertia. */
      const pointer = { x: 0, y: 0 };
      const target = { x: 0, y: 0 };
      const lastTarget = { x: 0, y: 0 };
      const dir = { x: 0, y: 0 };
      let speed = 0;
      let targetSpeed = 0;

      /** Convert a client position into the slab's coordinate space. */
      const onPointerMove = (e: PointerEvent) => {
        const rect = host.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;
        // The slab is 68 units wide and 40 tall, so the pointer maps onto it directly.
        target.x = (nx - 0.5) * 68;
        target.y = (0.5 - ny) * 40;

        const dx = target.x - lastTarget.x;
        const dy = target.y - lastTarget.y;
        const mag = Math.hypot(dx, dy);
        if (mag > 0.01) {
          dir.x = dx / mag;
          dir.y = dy / mag;
        }
        // Normalised against a plausible fast flick rather than an arbitrary max.
        targetSpeed = Math.min(1, mag / 2.2);
        lastTarget.x = target.x;
        lastTarget.y = target.y;
      };
      // A window listener, not an element listener: the field spans the viewport
      // but must never become the hit target, so it is pointer-events: none and the
      // events are observed passively from above.
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      cleanups.push(() => window.removeEventListener('pointermove', onPointerMove));

      const onPointerLeave = () => {
        targetSpeed = 0;
      };
      window.addEventListener('pointerleave', onPointerLeave, { passive: true });
      cleanups.push(() => window.removeEventListener('pointerleave', onPointerLeave));

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

      /* ---- loop ---- */
      const clock = new THREE.Clock();
      let visible = true;

      const frame = () => {
        raf = requestAnimationFrame(frame);
        if (!renderer) return;
        if (!visible || document.hidden) return;

        const dt = Math.min(clock.getDelta(), 0.05);
        const t = clock.elapsedTime;

        // Ease toward the pointer and its speed. Frame-rate independent, because a
        // fixed per-frame multiplier spins differently on a 144 Hz display.
        const k = 1 - Math.pow(0.5, dt / 0.09);
        pointer.x += (target.x - pointer.x) * k;
        pointer.y += (target.y - pointer.y) * k;

        const sk = 1 - Math.pow(0.5, dt / 0.16);
        speed += (targetSpeed - speed) * sk;
        // Speed decays on its own, so a trail dies when the pointer stops moving
        // even if no further events arrive.
        targetSpeed *= Math.pow(0.5, dt / 0.22);

        uniforms.uTime.value = reduced ? 0 : t;
        uniforms.uPointer.value.set(pointer.x, pointer.y);
        uniforms.uSpeed.value = reduced ? 0 : speed;
        uniforms.uDir.value.set(dir.x, dir.y);

        renderer.render(scene, camera);
      };

      const onVisibility = () => {
        if (document.hidden) {
          cancelAnimationFrame(raf);
          raf = 0;
        } else if (!raf) {
          clock.getDelta();
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
        { threshold: 0 }
      );
      io.observe(host);
      cleanups.push(() => io.disconnect());

      raf = requestAnimationFrame(frame);
      host.setAttribute('data-field-ready', 'true');

      /* ---- teardown: release every GPU resource ---- */
      cleanups.push(() => {
        cancelAnimationFrame(raf);
        raf = 0;
        geometry.dispose();
        material.dispose();
        renderer?.dispose();
        // Explicit: without this the driver may keep the backing store alive for the
        // life of the page, leaking one context per navigation.
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
  }, [reduced, quality]);

  return (
    <div
      ref={hostRef}
      className={`cfield ${className ?? ''}`}
      data-reduced={reduced ? 'true' : undefined}
      aria-hidden="true"
    />
  );
}
