/**
 * VisionBackdrop — the cinematic field behind the brand.
 *
 * WHY THIS IS A COMPONENT AND NOT A CSS BACKGROUND
 * The brief wants the home background to be the author's own photograph, managed
 * through one configurable path. That has three consequences a static CSS rule
 * cannot handle:
 *
 *   1. The image can fail to load. A CSS background that 404s leaves a white
 *      page behind a white wordmark — invisible. So the drawn composition below
 *      is ALWAYS present, and the photograph composites on top of it. There is no
 *      state in which the backdrop is missing.
 *   2. The wordmark over it must stay legible. Contrast is therefore managed
 *      here, from the image's own dominant tone, rather than hoped for.
 *   3. On a light ground, a photograph at full strength would make the page a
 *      photo viewer instead of a site. It is held well back and desaturated, so
 *      it supplies atmosphere and the layout supplies information.
 *
 * The path comes from `settings.json → homeBackground.src`. Nothing hard-codes it.
 */

import { useEffect, useState } from 'react';
import { SETTINGS } from '@/content';
import { assetUrl } from '@/lib/asset';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import './vision-backdrop.css';

/**
 * A deterministic star field.
 *
 * WHY NOT `(i * prime) % n`
 * The first version used modular arithmetic, which is a linear congruential walk:
 * with a prime step it distributes the points perfectly evenly, and a perfectly even
 * sky reads as a texture, not as stars. A real sky is clumped, with a few prominent
 * stars and a great many barely visible ones.
 *
 * So: mulberry32 — still deterministic (same sky on every reload and every build, so
 * screenshots stay comparable), but with the irregularity of a random field. Brightness
 * follows a power curve, which is what produces "a few bright, many faint" instead of
 * uniform dots.
 */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STARS = (() => {
  const rand = mulberry32(20261019);
  return Array.from({ length: 128 }, () => {
    const x = rand();
    const y = rand();
    const r = rand();
    return {
      x: x * 100,
      y: y * 62,
      // Power curve: most stars are specks, a handful are prominent.
      size: 0.7 + Math.pow(r, 3.4) * 2.8,
      opacity: 0.2 + Math.pow(r, 1.7) * 0.8,
      // Independent period per star, so they never pulse in unison.
      duration: 3.4 + rand() * 5.2,
      delay: rand() * 7,
    };
  });
})();

interface HomeBackground {
  src?: string;
  tone?: string;
  overlay?: number;
  provenance?: 'sample' | 'real';
  note?: string;
}

export function VisionBackdrop() {
  const cfg = (SETTINGS as unknown as { homeBackground?: HomeBackground }).homeBackground ?? {};
  const { reduced } = usePrefersReducedMotion();

  const [src, setSrc] = useState(cfg.src ?? '');
  const [status, setStatus] = useState<'idle' | 'loaded' | 'error'>(cfg.src ? 'idle' : 'error');

  /**
   * Probe the configured photograph before painting it.
   *
   * Doing this in JS rather than relying on CSS error handling means the drawn
   * composition underneath is never revealed as a half-state: either the photo
   * arrives and fades in over it, or it never appears at all and the drawn field
   * is simply the backdrop. Both are finished designs.
   */
  useEffect(() => {
    if (!cfg.src) {
      setStatus('error');
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      if (!cancelled) {
        setSrc(cfg.src!);
        setStatus('loaded');
      }
    };
    img.onerror = () => {
      if (!cancelled) {
        setSrc('');
        setStatus('error');
      }
    };
    img.src = assetUrl(cfg.src);
    return () => {
      cancelled = true;
    };
  }, [cfg.src]);

  return (
    <div className="vback" aria-hidden="true">
      {/* Layer 1 — the drawn field. Always present. */}
      <div className="vback__drawn" />

      {/*
        Layer 1b — the planetary horizon.

        The reference scene is a planet's limb: a black body, a brilliant band of
        atmosphere hugging it, stars above, and the sun catching the edge. Drawn here
        rather than embedded from a third-party WebGL service: no CDN round trip, no
        tracking script, nothing to fail offline, and it inherits the page's own
        colours. It sits UNDER the photograph so a configured CMS image still wins.
      */}
      <div className="vback__stars">
        {STARS.map((star, i) => (
          <span
            key={i}
            className="vback__star"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.size,
              height: star.size,
              opacity: star.opacity,
              animationDuration: `${star.duration}s`,
              animationDelay: `${star.delay}s`,
            }}
          />
        ))}
      </div>
      <div className="vback__planet" />

      {/* Layer 2 — the photograph, when one resolves. */}
      {status === 'loaded' && src ? (
        <div
          className="vback__photo"
          style={{
            backgroundImage: `url("${assetUrl(src)}")`,
            ['--photo-tone' as string]: cfg.tone ?? '#8fa4bb',
            ['--photo-overlay' as string]: String(cfg.overlay ?? 0.5),
          }}
        />
      ) : null}

      {/* Layer 3 — the legibility wash and the light. */}
      <div className="vback__wash" />
      <div className="vback__light" />

      {/* Layer 4 — grain, which is what stops large soft gradients from banding
          and gives the whole field a photographic surface rather than a
          digital one. Static: an animated grain would be a strobe. */}
      <div className={`vback__grain${reduced ? '' : ' ambient-drift'}`} />
    </div>
  );
}
