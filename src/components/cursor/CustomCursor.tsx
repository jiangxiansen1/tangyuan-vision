/**
 * CustomCursor — a comet, not a ring.
 *
 * WHY THIS CHANGED
 * The first version was a dot plus a lagging ring. That reads as a "crosshair with
 * weight": it is a circle around a dot and nothing else, so the pointer never
 * appears to be in motion — fast movement across the page looks identical to slow
 * movement.
 *
 * This version is a comet: the head tracks the pointer EXACTLY (a lagging head makes
 * aiming feel broken), and a tail of motes follows through a chain of lerps. The
 * tail bends on turns and stretches with speed, so direction and speed become
 * visible, which is the whole point.
 *
 * DESIGN CONSTRAINTS THAT STILL HOLD
 *   • The native cursor is never hidden over text entry (input/textarea/select/
 *     contenteditable/[data-native-cursor]); the comet hides and the platform
 *     I-beam returns for those elements.
 *   • Touch devices and `prefers-reduced-motion` get nothing at all: the whole
 *     component returns null, leaving the platform cursor untouched.
 *   • Decoration only. Nothing is discoverable exclusively through it.
 *
 * PERFORMANCE
 * One pointer listener, one rAF loop that stops as soon as the tail settles, and
 * direct transform writes — React renders this component exactly once. The tail is
 * a fixed array of elements; nothing is allocated while the pointer moves.
 */

import { useEffect, useRef, useState } from 'react';
import { useHasFinePointer } from '@/hooks/useMediaQuery';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import './cursor.css';

type CursorMode = 'default' | 'link' | 'view' | 'drag';

/** Tail motes behind the head. Enough to read as a tail, few enough to stay cheap. */
const TAIL = 9;

const INTERACTIVE_SELECTOR = 'a, button, [role="button"], [data-interactive="true"], summary, label[for]';
const TEXT_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-native-cursor]';
const VIEW_SELECTOR = '[data-cursor="view"]';
const DRAG_SELECTOR = '[data-cursor="drag"]';

export function CustomCursor() {
  const finePointer = useHasFinePointer();
  const { reduced } = usePrefersReducedMotion();
  const headRef = useRef<HTMLDivElement | null>(null);
  const tailRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [mode, setMode] = useState<CursorMode>('default');
  const [visible, setVisible] = useState(false);
  const enabled = finePointer && !reduced;

  useEffect(() => {
    if (!enabled) return;

    document.documentElement.classList.add('cursor-active');

    const head = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    // Each mote chases the one before it, so the chain is what bends on a turn.
    const tail = Array.from({ length: TAIL }, () => ({ x: head.x, y: head.y }));
    let raf = 0;
    let running = false;

    const render = () => {
      if (headRef.current) {
        headRef.current.style.transform = `translate3d(${head.x}px, ${head.y}px, 0) translate(-50%, -50%)`;
      }
      for (let i = 0; i < TAIL; i++) {
        const el = tailRefs.current[i];
        if (el) {
          el.style.transform = `translate3d(${tail[i].x}px, ${tail[i].y}px, 0) translate(-50%, -50%)`;
        }
      }
    };

    const loop = () => {
      let settled = true;

      // The first mote follows tightly, later ones more loosely: the decaying
      // stiffness is what makes the tail taper and straighten out behind a turn.
      for (let i = 0; i < TAIL; i++) {
        const lead = i === 0 ? head : tail[i - 1];
        const stiffness = 0.46 - i * 0.035;
        const dx = lead.x - tail[i].x;
        const dy = lead.y - tail[i].y;
        tail[i].x += dx * stiffness;
        tail[i].y += dy * stiffness;
        if (Math.abs(dx) > 0.12 || Math.abs(dy) > 0.12) settled = false;
      }

      render();

      // Stop when the tail has caught up: an idle page should cost no frames.
      if (settled) {
        for (let i = 0; i < TAIL; i++) {
          tail[i].x = head.x;
          tail[i].y = head.y;
        }
        render();
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const pulse = () => {
      if (!running) {
        running = true;
        raf = requestAnimationFrame(loop);
      }
    };

    const onMove = (e: PointerEvent) => {
      head.x = e.clientX;
      head.y = e.clientY;
      if (!visible) setVisible(true);
      pulse();
    };

    /** Decide what the comet should look like over this element. */
    const resolveMode = (target: EventTarget | null): CursorMode => {
      if (!(target instanceof Element)) return 'default';
      if (target.closest(DRAG_SELECTOR)) return 'drag';
      if (target.closest(VIEW_SELECTOR)) return 'view';
      if (target.closest(INTERACTIVE_SELECTOR)) return 'link';
      return 'default';
    };

    const onOver = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      // Text entry keeps the platform cursor entirely — the comet hides and css
      // hands the native I-beam / caret back for that element.
      const overText = el?.closest(TEXT_SELECTOR) != null;
      document.documentElement.dataset.cursorHidden = overText ? 'true' : 'false';
      if (!overText) setMode(resolveMode(e.target));
    };

    const onDown = () => {
      document.documentElement.dataset.cursorPressed = 'true';
    };
    const onUp = () => {
      delete document.documentElement.dataset.cursorPressed;
    };
    const onLeaveWindow = () => setVisible(false);
    const onEnterWindow = () => setVisible(true);

    // Hide entirely when focus moves to the keyboard: a comet lingering over a
    // keyboard-driven interaction is visual noise.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') document.documentElement.dataset.cursorKeyboard = 'true';
    };
    const onPointerBack = () => delete document.documentElement.dataset.cursorKeyboard;

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerover', onOver, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeaveWindow);
    document.addEventListener('pointerenter', onEnterWindow);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointermove', onPointerBack, { passive: true, once: true });

    render();

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerover', onOver);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeaveWindow);
      document.removeEventListener('pointerenter', onEnterWindow);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointermove', onPointerBack);
      if (raf) cancelAnimationFrame(raf);
      document.documentElement.classList.remove('cursor-active');
      delete document.documentElement.dataset.cursorHidden;
      delete document.documentElement.dataset.cursorPressed;
      delete document.documentElement.dataset.cursorKeyboard;
    };
  }, [enabled, visible]);

  // Nothing is rendered on touch devices or under reduced motion — the platform
  // cursor is left completely untouched.
  if (!enabled) return null;

  return (
    <div className="cursor" data-visible={visible || undefined} data-mode={mode} aria-hidden="true">
      {Array.from({ length: TAIL }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            tailRefs.current[i] = el;
          }}
          className="cursor__mote"
          style={{ ['--i' as string]: String(i) }}
        />
      ))}
      <div ref={headRef} className="cursor__head" />
    </div>
  );
}
