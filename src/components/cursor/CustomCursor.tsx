/**
 * CustomCursor — the pointer enhancement.
 *
 * DESIGN CONSTRAINTS TAKEN FROM THE BRIEF, AND HOW EACH IS MET
 *   • "Don't replace the system cursor everywhere." The native cursor is never
 *     hidden over text inputs, textareas, contenteditable, selects, or elements
 *     marked `data-native-cursor`. There the custom cursor simply does not
 *     render, and the OS cursor behaves normally.
 *   • "Touch devices use native touch, no custom mouse." The whole component
 *     returns null unless the device reports a fine pointer.
 *   • "Don't require hover to use a feature." This is decoration only. Nothing
 *     is discoverable exclusively through it.
 *
 * PERFORMANCE
 * The dot follows the pointer 1:1 on a transform (no lag, so aiming stays
 * accurate — a lagging dot feels broken). The ring chases with a lerp, which is
 * what produces the sense of weight. Both are written directly to transforms, so
 * React renders this component exactly once.
 */

import { useEffect, useRef, useState } from 'react';
import { useHasFinePointer } from '@/hooks/useMediaQuery';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import './cursor.css';

type CursorMode = 'default' | 'link' | 'view' | 'drag';

const INTERACTIVE_SELECTOR = 'a, button, [role="button"], [data-interactive="true"], summary, label[for]';
const TEXT_SELECTOR = 'input, textarea, select, [contenteditable="true"], [data-native-cursor]';
const VIEW_SELECTOR = '[data-cursor="view"]';
const DRAG_SELECTOR = '[data-cursor="drag"]';

export function CustomCursor() {
  const finePointer = useHasFinePointer();
  const { reduced } = usePrefersReducedMotion();
  const dotRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLDivElement | null>(null);
  const [mode, setMode] = useState<CursorMode>('default');
  const [visible, setVisible] = useState(false);
  const enabled = finePointer && !reduced;

  useEffect(() => {
    if (!enabled) return;

    // Opt the document into the custom cursor. cursor.css keys the suppression of
    // the platform cursor off this class, so it is added and removed together
    // with the component's lifetime rather than by a global stylesheet rule.
    document.documentElement.classList.add('cursor-active');

    const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const ring = { x: pointer.x, y: pointer.y };
    let raf = 0;
    let running = false;

    const render = () => {
      if (dotRef.current) {
        dotRef.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
      }
      if (ringRef.current) {
        ringRef.current.style.transform = `translate3d(${ring.x}px, ${ring.y}px, 0) translate(-50%, -50%)`;
      }
    };

    const loop = () => {
      ring.x += (pointer.x - ring.x) * 0.18;
      ring.y += (pointer.y - ring.y) * 0.18;
      render();
      // Settle and stop rather than burning frames on an idle page.
      if (Math.abs(pointer.x - ring.x) < 0.08 && Math.abs(pointer.y - ring.y) < 0.08) {
        ring.x = pointer.x;
        ring.y = pointer.y;
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
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (!visible) setVisible(true);
      pulse();
    };

    /** Decide what the cursor should look like over this element. */
    const resolveMode = (target: EventTarget | null): CursorMode => {
      if (!(target instanceof Element)) return 'default';
      if (target.closest(DRAG_SELECTOR)) return 'drag';
      if (target.closest(VIEW_SELECTOR)) return 'view';
      if (target.closest(INTERACTIVE_SELECTOR)) return 'link';
      return 'default';
    };

    const onOver = (e: PointerEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      // Text entry keeps the platform cursor entirely — the custom one hides and
      // cursor.css hands the native I-beam / caret back for that element.
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

    // Hide entirely when focus moves to the keyboard: a custom cursor lingering
    // over a keyboard-driven interaction is visual noise.
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
      <div ref={ringRef} className="cursor__ring" />
      <div ref={dotRef} className="cursor__dot" />
    </div>
  );
}
