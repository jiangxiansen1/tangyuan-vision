/**
 * useRevealOnView — declarative scroll reveal.
 *
 * Progressive enhancement by construction: the `reveal` class is only ARMED
 * (i.e. given its hidden starting state) once the IntersectionObserver is
 * actually running, and it is disarmed immediately on unmount. If JavaScript
 * fails, the observer never registers, or the visitor prefers reduced motion,
 * the content is simply visible. There is no code path in which the observer
 * failing leaves content invisible.
 */

import { useEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface Options {
  /** Delay before this element transitions in, in ms. */
  delay?: number;
  /** Fraction of the element that must be visible before revealing. */
  threshold?: number;
  /** Reveal only once (default) or every time it enters the viewport. */
  once?: boolean;
  /** Root margin, e.g. '0px 0px -12% 0px' to reveal slightly after entering. */
  rootMargin?: string;
}

export function useRevealOnView<T extends HTMLElement = HTMLDivElement>(options: Options = {}) {
  const { delay = 0, threshold = 0.12, once = true, rootMargin = '0px 0px -8% 0px' } = options;
  const ref = useRef<T | null>(null);
  const { reduced } = usePrefersReducedMotion();

  const [armed, setArmed] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) return; // content stays plainly visible
    if (typeof IntersectionObserver === 'undefined') return;

    // If the element is already fully in view on mount (above the fold, or a
    // short page), skip the animation entirely rather than flashing it in.
    const rect = el.getBoundingClientRect();
    const inView = rect.top < window.innerHeight * 0.9 && rect.bottom > 0;
    if (inView && !once) {
      setRevealed(true);
      return;
    }

    setArmed(true);
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setRevealed(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setRevealed(false);
          }
        }
      },
      { threshold, rootMargin }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced, threshold, rootMargin, once]);

  return {
    ref,
    className: armed ? `reveal is-armed${revealed ? ' is-revealed' : ''}` : 'reveal',
    style: { ['--reveal-delay' as string]: `${delay}ms` } as React.CSSProperties,
  };
}
