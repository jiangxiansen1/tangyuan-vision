/**
 * useFocusTrap — keep keyboard focus inside a modal surface, and restore it on
 * close.
 *
 * Implemented by hand rather than pulling a dependency: the requirements are
 * small and explicit (Tab wraps, Shift+Tab wraps backwards, Escape closes, first
 * focusable element receives focus, previous focus is restored), and getting the
 * restore step wrong is the most common accessibility bug in overlay UI.
 */

import { useEffect, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
  'audio[controls]',
  'video[controls]',
  'summary',
].join(',');

function focusableWithin(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.hasAttribute('inert')) return false;
    // Skip anything the browser considers invisible.
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    return el.tabIndex !== -1;
  });
}

interface Options {
  active: boolean;
  onEscape?: () => void;
  /** Where focus should land on open. Defaults to the first focusable element. */
  initialFocus?: RefObject<HTMLElement | null>;
  /** Return focus here on close instead of the previously focused element. */
  restoreTo?: RefObject<HTMLElement | null>;
}

export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  { active, onEscape, initialFocus, restoreTo }: Options
): void {
  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Capture the elements to restore at effect time, not at cleanup time: by
    // the time cleanup runs, `restoreTo.current` may point at a different node
    // (or React may have detached it), and the ref value would be stale.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const explicitRestore = restoreTo?.current ?? null;

    // Move focus in. rAF lets the surface finish mounting first so its children
    // exist and are measurable.
    const raf = requestAnimationFrame(() => {
      const target = initialFocus?.current ?? focusableWithin(container)[0] ?? container;
      target.focus({ preventScroll: true });
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;

      const items = focusableWithin(container);
      if (items.length === 0) {
        e.preventDefault();
        container.focus({ preventScroll: true });
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement as HTMLElement | null;

      // Focus escaped the container (e.g. the browser moved it to the URL bar):
      // pull it back to a sane end rather than losing the trap.
      if (!current || !container.contains(current)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (e.shiftKey && current === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!e.shiftKey && current === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', onKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown, true);
      const restore = explicitRestore ?? previouslyFocused;
      if (restore && document.contains(restore)) {
        restore.focus({ preventScroll: true });
      }
    };
  }, [active, containerRef, initialFocus, restoreTo, onEscape]);
}
