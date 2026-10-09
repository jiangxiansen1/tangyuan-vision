/**
 * useParallax — subtle pointer-driven translation for layered depth.
 *
 * Constrained on purpose. The brief explicitly rejects heavy parallax, so the
 * supplied strength is clamped to a hard ceiling of 12px and the whole hook is
 * inert on touch devices and under reduced motion. Translation is written as a
 * CSS custom property so only `transform` changes — no layout work, no repaint
 * of anything but the layer itself.
 */

import { useEffect, useRef } from 'react';
import { useHasFinePointer } from './useMediaQuery';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

const MAX_PX = 12;

export function useParallax<T extends HTMLElement = HTMLDivElement>(strength: number) {
  const ref = useRef<T | null>(null);
  const finePointer = useHasFinePointer();
  const { reduced } = usePrefersReducedMotion();
  const depth = Math.min(MAX_PX, Math.max(0, strength));

  useEffect(() => {
    if (!finePointer || reduced || depth === 0) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;

    const apply = () => {
      el.style.setProperty('--par-x', `${currentX.toFixed(2)}px`);
      el.style.setProperty('--par-y', `${currentY.toFixed(2)}px`);
    };

    const loop = () => {
      currentX += (targetX - currentX) * 0.12;
      currentY += (targetY - currentY) * 0.12;
      apply();
      if (Math.abs(targetX - currentX) > 0.05 || Math.abs(targetY - currentY) > 0.05) {
        raf = requestAnimationFrame(loop);
      } else {
        raf = 0;
      }
    };

    const onMove = (e: PointerEvent) => {
      const w = window.innerWidth || 1;
      const h = window.innerHeight || 1;
      // -1 .. 1 from viewport centre
      targetX = ((e.clientX / w) * 2 - 1) * depth;
      targetY = ((e.clientY / h) * 2 - 1) * depth;
      if (!raf) raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    apply();
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (raf) cancelAnimationFrame(raf);
      el.style.removeProperty('--par-x');
      el.style.removeProperty('--par-y');
    };
  }, [finePointer, reduced, depth]);

  return ref;
}
