/**
 * CoreWindow — one of the two windows that carry the site.
 *
 * THIS COMPONENT NOW ACTUALLY USES THE GLASS MATERIAL
 * ---------------------------------------------------
 * In V3 it did not. It was a plain <button> with a dark scrim gradient, a 1px
 * border and a box-shadow, and the preview image was painted OPAQUE across the
 * whole surface. That is not glass under any definition: an opaque child blocks
 * the backdrop entirely, so `backdrop-filter` has nothing to blur and the material
 * can never appear no matter how the CSS is written.
 *
 * Three changes make the material real, and all three are required:
 *
 *   1. The surface is a `GlassSurface` (tier `refract`) rather than a button with
 *      border styling, so the six layers come from the design system.
 *   2. The preview image is held at PARTIAL OPACITY, and the scrim is a tint
 *      rather than an opaque wash. Opaque content over a glass pane is the single
 *      mistake that makes glass impossible, so this is the load-bearing change.
 *   3. The ambient backdrop sits behind the pane in the same stacking context,
 *      giving the blur something with actual structure to sample.
 *
 * The text still has to be readable, so contrast is carried by a gradient scrim
 * on the lower third only — where the text is — instead of across the whole pane.
 */

import { lazy, Suspense, useCallback, useRef } from 'react';
import type { SceneRoute } from '@/app/routes';
import { GlassSurface } from '@/components/glass/GlassSurface';
import { Icon, SceneIcon } from '@/components/ui/Icon';
import { SmartImage } from '@/components/ui/SmartImage';
import { PHOTOS } from '@/content';
import { useHasFinePointer } from '@/hooks/useMediaQuery';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { useVisualStore } from '@/store/useVisualStore';
import './core-window.css';

/** Lazy: the globe is heavy and only one window needs it. */
const EarthGlobe = lazy(() =>
  import('@/features/earth/EarthGlobe').then((m) => ({ default: m.EarthGlobe }))
);

export interface CoreWindowProps {
  route: SceneRoute;
  side: 'left' | 'right';
  onOpen: () => void;
  onFocus: () => void;
}

/** The most presentable photograph for a scene, by category preference. */
function heroPhoto(sceneId: string) {
  const preferred: Record<string, string[]> = {
    photography: ['landscape', 'street', 'sky', 'abstract'],
    earth: ['sky', 'landscape'],
  };
  for (const category of preferred[sceneId] ?? []) {
    const found = PHOTOS.find((p) => p.category === category && p.width >= p.height);
    if (found) return found;
  }
  return PHOTOS.find((p) => p.feature) ?? PHOTOS[0] ?? null;
}

export function CoreWindow({ route, side, onOpen, onFocus }: CoreWindowProps) {
  const ref = useRef<HTMLElement>(null);
  const finePointer = useHasFinePointer();
  const { reduced } = usePrefersReducedMotion();
  const glassQuality = useVisualStore((s) => s.glassQuality);

  const isEarth = route.id === 'earth';
  const photo = isEarth ? null : heroPhoto(route.id);
  const stack = isEarth ? [] : PHOTOS.filter((p) => p.category === 'landscape').slice(0, 3);

  const tiltEnabled = finePointer && !reduced;

  /**
   * Tilt and parallax, written straight to CSS custom properties.
   *
   * React never re-renders during the gesture: the handler writes four variables
   * and CSS does the rest. A per-move setState here would re-render a subtree
   * containing a WebGL canvas, which is the fastest way to make a hover feel
   * broken.
   */
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLElement>) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;

      if (tiltEnabled) {
        // Capped at 3.2deg — enough to read as a physical pane, far short of the
        // seasick tilt 3D card grids tend to use.
        el.style.setProperty('--cw-tilt-x', `${((0.5 - py) * 3.2).toFixed(2)}deg`);
        el.style.setProperty('--cw-tilt-y', `${((px - 0.5) * 3.2).toFixed(2)}deg`);
      }
      // The preview drifts opposite the tilt, which is what sells depth.
      el.style.setProperty('--cw-par-x', `${((px - 0.5) * -10).toFixed(1)}px`);
      el.style.setProperty('--cw-par-y', `${((py - 0.5) * -8).toFixed(1)}px`);
      // The glass material reads these for its own specular layer.
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
    },
    [tiltEnabled]
  );

  const onPointerLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--cw-tilt-x', '0deg');
    el.style.setProperty('--cw-tilt-y', '0deg');
    el.style.setProperty('--cw-par-x', '0px');
    el.style.setProperty('--cw-par-y', '0px');
  }, []);

  /**
   * Tier follows the visitor's quality setting, so "minimum" genuinely costs less
   * rather than merely looking different.
   */
  const tier = glassQuality === 'off' ? 'standard' : glassQuality === 'balanced' ? 'depth' : 'refract';

  return (
    <li className="cwin" data-side={side} data-scene={route.id}>
      <GlassSurface
        as="button"
        ref={ref}
        tier={tier}
        interactive
        radius="var(--r-2xl)"
        data-window={route.id}
        className="cwin__surface"
        onClick={onOpen}
        onFocus={onFocus}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        aria-label={`${route.label} — ${route.blurb}`}
        data-cursor={isEarth ? 'drag' : 'view'}
      >
        {/* ------------------------------------------------ preview layer --
            Held at partial opacity so the backdrop-filter has something to act
            on. Opaque content here is what made the V3 surface unable to be glass. */}
        <span className="cwin__preview" aria-hidden="true">
          {isEarth ? (
            <span className="cwin__globe">
              {glassQuality === 'off' ? (
                <span className="cwin__globe-static" />
              ) : (
                <Suspense fallback={<span className="cwin__globe-static" />}>
                  <EarthGlobe quality={glassQuality === 'balanced' ? 'balanced' : 'high'} />
                </Suspense>
              )}
            </span>
          ) : photo ? (
            <>
              {stack[1] ? (
                <span className="cwin__stack cwin__stack--b">
                  <SmartImage
                    src={stack[1].src}
                    thumb={stack[1].thumb}
                    alt=""
                    width={stack[1].width}
                    height={stack[1].height}
                    tone={stack[1].tone}
                    sizes="30vw"
                    failureLabel=""
                  />
                </span>
              ) : null}
              {stack[2] ? (
                <span className="cwin__stack cwin__stack--c">
                  <SmartImage
                    src={stack[2].src}
                    thumb={stack[2].thumb}
                    alt=""
                    width={stack[2].width}
                    height={stack[2].height}
                    tone={stack[2].tone}
                    sizes="30vw"
                    failureLabel=""
                  />
                </span>
              ) : null}

              <span className="cwin__frameframe">
                <SmartImage
                  src={photo.src}
                  thumb={photo.thumb}
                  alt=""
                  width={photo.width}
                  height={photo.height}
                  tone={photo.tone}
                  sizes="(max-width: 900px) 92vw, 34vw"
                  className="cwin__image"
                  failureLabel="预览图未加载"
                />
              </span>
            </>
          ) : (
            <span className="cwin__frameframe cwin__frameframe--empty" />
          )}

          {/* The scrim is a gradient over the LOWER THIRD only, because that is
              where the text is. A full-surface scrim would reintroduce the opaque
              wash that kills the glass. */}
          <span className="cwin__scrim" />
        </span>

        {/* ------------------------------------------------------ content -- */}
        <span className="cwin__body">
          <span className="cwin__head">
            <span className="cwin__icon">
              <SceneIcon scene={route.id} size={18} />
            </span>
            <span className="cwin__eyebrow u-label">{route.labelEn}</span>
          </span>

          <span className="cwin__titles">
            <span className="cwin__title">{route.label}</span>
            <span className="cwin__blurb">{route.blurb}</span>
          </span>

          <span className="cwin__foot">
            <span className="cwin__enter">
              {isEarth ? '进入地球' : '进入作品集'}
              <Icon name="arrow-right" size={15} />
            </span>
            {route.key ? (
              <span className="cwin__key" aria-hidden="true">
                <kbd>{route.key.toUpperCase()}</kbd>
              </span>
            ) : null}
          </span>
        </span>
      </GlassSurface>
    </li>
  );
}
