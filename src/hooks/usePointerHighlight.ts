/**
 * usePointerHighlight — the desktop specular tracker for glass surfaces.
 *
 * Responsibilities, and the reasons for each:
 *   • Report the pointer position as CSS custom properties (--mx/--my) so the
 *     highlight is rendered entirely by CSS. React never re-renders per frame.
 *   • Apply inertia: the reported position chases the real pointer with a
 *     critically-damped lerp, which is what makes the highlight feel like it has
 *     mass instead of jittering on every mousemove.
 *   • Fade out smoothly on leave, rather than snapping to zero.
 *   • Do nothing at all on touch devices or when motion is reduced.
 *
 * The rAF loop stops the moment the highlight settles, so an idle page runs no
 * animation frames at all.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useHasFinePointer } from './useMediaQuery';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import { readRaw, storageKeys } from '@/lib/storage';

interface Options {
  /** lerp factor per frame; higher = snappier. */
  ease?: number;
  /** Minimum change (in %) required to mark the position as settled. */
  epsilon?: number;
}

export function usePointerHighlight<T extends HTMLElement = HTMLDivElement>(options: Options = {}) {
  const { ease = 0.14, epsilon = 0.06 } = options;
  const ref = useRef<T | null>(null);
  const finePointer = useHasFinePointer();
  const { reduced } = usePrefersReducedMotion();

  // Glass quality setting: 'off' disables the whole effect for low-end devices.
  const [glassQuality, setGlassQuality] = useState<string>(() => readRaw(storageKeys.glass) ?? 'high');
  useEffect(() => {
    const onStorage = () => setGlassQuality(readRaw(storageKeys.glass) ?? 'high');
    window.addEventListener('storage', onStorage);
    window.addEventListener('tv:pref-changed', onStorage as EventListener);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('tv:pref-changed', onStorage as EventListener);
    };
  }, []);

  const enabled = finePointer && !reduced && glassQuality !== 'off';
  const [active, setActive] = useState(false);

  const targetRef = useRef({ x: 50, y: 0 });
  const currentRef = useRef({ x: 50, y: 0 });
  const opacityRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  const apply = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty('--mx', `${currentRef.current.x.toFixed(2)}%`);
    el.style.setProperty('--my', `${currentRef.current.y.toFixed(2)}%`);
    el.style.setProperty('--glass-specular-opacity', opacityRef.current.toFixed(3));
  }, []);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    runningRef.current = false;
  }, []);

  const tick = useCallback(() => {
    const t = targetRef.current;
    const c = currentRef.current;

    const dx = t.x - c.x;
    const dy = t.y - c.y;
    c.x += dx * ease;
    c.y += dy * ease;

    // Fade toward the target opacity at the same rate so enter/leave match.
    const targetOpacity = active ? 1 : 0;
    opacityRef.current += (targetOpacity - opacityRef.current) * ease;

    apply();

    const settled =
      Math.abs(dx) < epsilon && Math.abs(dy) < epsilon && Math.abs(targetOpacity - opacityRef.current) < 0.01;

    if (settled) {
      c.x = t.x;
      c.y = t.y;
      opacityRef.current = targetOpacity;
      apply();
      stop();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [active, apply, ease, epsilon, stop]);

  const ensureRunning = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      targetRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
      if (!active) setActive(true);
      ensureRunning();
    };

    const onLeave = () => {
      setActive(false);
      // Park the target at the last known point; only opacity animates out.
      ensureRunning();
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      stop();
    };
  }, [enabled, active, ensureRunning, stop]);

  // Reacting to `active` inside tick requires the loop to be restarted on the
  // leave transition, which onLeave already handles.
  useEffect(() => {
    if (enabled && active) ensureRunning();
  }, [active, enabled, ensureRunning]);

  // Never leave work behind.
  useEffect(() => stop, [stop]);

  return { ref, enabled };
}
