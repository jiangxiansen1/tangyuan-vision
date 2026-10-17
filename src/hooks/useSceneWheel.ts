/**
 * useSceneWheel — one wheel gesture, one scene (desktop home narrative).
 *
 * OBSERVABLE CONTRACT (docs/scene-architecture.md §F)
 *   • a valid wheel-down moves to the next scene, wheel-up to the previous one
 *   • one physical gesture triggers at most one transition: deltas are
 *     accumulated into a gesture and the accumulator resets after 240 ms of
 *     silence or once a transition fires
 *   • noise (|accum| < 90px) never triggers
 *   • during a transition the controller is locked; the lock releases when the
 *     animation finishes plus a 220 ms cooldown, so continuous browsing works
 *   • at the first scene, wheel-up does nothing; at the last scene, wheel-down
 *     scrolls once to the document end (quiet row + footer) and then rests
 *   • Arrow/PageUp/PageDown drive the same state machine
 *   • touch devices keep native scrolling: the controller only installs when
 *     the primary pointer is fine
 *   • inputs, textareas, selects, contenteditable and any element with its own
 *     vertical scrollbar keep their wheel — the controller never hijacks them
 *   • prefers-reduced-motion shortens the transition to 240 ms
 *
 * The transition is a rAF-driven eased scrollTo, not CSS scroll-snap: snap
 * fights keyboard users and over-tall scenes, while an explicit animation gives
 * the 900–1200 ms cadence the brief asks for and a precise lock window.
 */

import { useEffect, useRef } from 'react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';
const GESTURE_GAP_MS = 240;
const NOISE_PX = 90;
const COOLDOWN_MS = 220;

export interface UseSceneWheelOptions {
  /** Scenes in narrative order, e.g. '.vhome__stage, .vscene'. */
  sceneSelector: string;
  /** Root element carrying data-active-scene, for tests and the future rail. */
  rootSelector: string;
  enabled: boolean;
}

export function useSceneWheel({ sceneSelector, rootSelector, enabled }: UseSceneWheelOptions) {
  const { reduced } = usePrefersReducedMotion();
  const st = useRef({ index: 0, locked: false, accum: 0, lastWheel: 0, raf: 0 });

  useEffect(() => {
    if (!enabled) return;
    if (!window.matchMedia('(pointer: fine)').matches) return;
    const s0 = st.current;

    const scenes = () => Array.from(document.querySelectorAll<HTMLElement>(sceneSelector));

    const markIndex = (i: number) => {
      st.current.index = i;
      const root = document.querySelector(rootSelector);
      if (root) root.setAttribute('data-active-scene', String(i));
      const list = scenes();
      list.forEach((el, idx) => {
        if (idx === i) el.setAttribute('data-active', 'true');
        else el.removeAttribute('data-active');
      });
    };

    /** Centre-line detection: the scene crossing the viewport middle is current. */
    const syncIndex = () => {
      const mid = window.innerHeight / 2;
      const list = scenes();
      for (let i = 0; i < list.length; i++) {
        const r = list[i].getBoundingClientRect();
        if (r.top <= mid && r.bottom >= mid) {
          markIndex(i);
          return;
        }
      }
      // Below the last scene (quiet row / footer): stay on the last index.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) {
        markIndex(list.length - 1);
      }
    };

    const animateTo = (top: number, done: () => void) => {
      /*
       * ONE DRIVER ONLY.
       * reset.css sets html { scroll-behavior: smooth }. Left alone, every
       * window.scrollTo() inside this loop would start a second, competing
       * native animation — the stutter the visual review reported. The inline
       * override lasts exactly for the transition and is restored after, so
       * route scroll-to-top behaviour elsewhere is untouched.
       */
      const rootEl = document.documentElement;
      const previousBehavior = rootEl.style.scrollBehavior;
      rootEl.style.scrollBehavior = 'auto';
      const from = window.scrollY;
      const dist = top - from;
      const dur = reduced ? 240 : 1000;
      const t0 = performance.now();
      cancelAnimationFrame(st.current.raf);
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        /* easeInOutQuart: gentle launch, firm settle, no overshoot. */
        const e = p < 0.5 ? 8 * p * p * p * p : 1 - Math.pow(-2 * p + 2, 4) / 2;
        window.scrollTo(0, from + dist * e);
        if (p < 1) st.current.raf = requestAnimationFrame(step);
        else {
          rootEl.style.scrollBehavior = previousBehavior;
          syncIndex();
          window.setTimeout(() => {
            st.current.locked = false;
            done();
          }, COOLDOWN_MS);
        }
      };
      st.current.raf = requestAnimationFrame(step);
    };

    const goTo = (i: number) => {
      const list = scenes();
      const target = list[Math.max(0, Math.min(list.length - 1, i))];
      if (!target) return;
      st.current.locked = true;
      st.current.accum = 0;
      markIndex(Math.max(0, Math.min(list.length - 1, i)));
      const top = Math.round(target.getBoundingClientRect().top + window.scrollY);
      animateTo(top, () => undefined);
    };

    const goEnd = () => {
      st.current.locked = true;
      st.current.accum = 0;
      animateTo(document.documentElement.scrollHeight, () => undefined);
    };

    const scrollableAncestor = (el: Element | null): boolean => {
      let n = el;
      while (n && n !== document.body) {
        const he = n as HTMLElement;
        if (he.scrollHeight > he.clientHeight + 4) {
          const cs = getComputedStyle(he);
          if (/(auto|scroll)/.test(cs.overflowY)) return true;
        }
        n = n.parentElement;
      }
      return false;
    };

    const onWheel = (e: WheelEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest(TEXT_ENTRY)) return;
      if (e.ctrlKey) return; // pinch-zoom belongs to the browser
      if (scrollableAncestor(t)) return; // inner scroll regions keep their wheel

      const now = performance.now();
      const s = st.current;
      if (now - s.lastWheel > GESTURE_GAP_MS) s.accum = 0;
      s.lastWheel = now;
      s.accum += e.deltaY;

      if (s.locked) {
        // Swallow the gesture instead of letting it fight the animation.
        e.preventDefault();
        return;
      }
      if (Math.abs(s.accum) < NOISE_PX) {
        e.preventDefault();
        return;
      }

      const dir = s.accum > 0 ? 1 : -1;
      const list = scenes();
      const next = s.index + dir;
      s.accum = 0;

      if (next < 0) {
        e.preventDefault();
        return;
      }
      if (next >= list.length) {
        const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        if (!atEnd) {
          e.preventDefault();
          e.stopPropagation();
          goEnd();
        }
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      goTo(next);
    };

    const onKey = (e: KeyboardEvent) => {
      const t = e.target as Element | null;
      if (t && t.closest(TEXT_ENTRY)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      let dir = 0;
      if (e.key === 'ArrowDown' || e.key === 'PageDown') dir = 1;
      else if (e.key === 'ArrowUp' || e.key === 'PageUp') dir = -1;
      else return;
      // Only when the home narrative owns the focus, not a modal or the map.
      if (t && t.closest('[data-wheel-owner]')) return;
      e.preventDefault();
      if (st.current.locked) return;
      const list = scenes();
      const next = st.current.index + dir;
      if (next < 0) return;
      if (next >= list.length) {
        const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        if (!atEnd) goEnd();
        return;
      }
      goTo(next);
    };

    const onScroll = () => {
      if (!st.current.locked) syncIndex();
    };

    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, { passive: true });
    syncIndex();
    return () => {
      window.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(s0.raf);
    };
  }, [enabled, reduced, sceneSelector, rootSelector]);
}
