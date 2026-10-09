/**
 * SecretSignal — the discoverable door to the hidden space.
 *
 * DESIGN INTENT
 * It sits inside the same window field as the seven scenes, so it is reached by
 * exactly the same interaction: tabbing, arrow keys, Enter. It is visually
 * recessive — a small, unlit object rather than an eighth card — because the
 * brief asks for something findable but not advertised.
 *
 * ACCESSIBILITY
 * It is a real <button> with a real accessible name. A screen-reader visitor
 * hears "进入静默空间" as they tab past it. Nothing about the hidden space
 * requires a mouse, a hover, or a specific keystroke — those are additional
 * routes in, not the only one.
 */

import { useCallback, useRef } from 'react';
import { useUIStore } from '@/store/useUIStore';
import './secret-signal.css';

export interface SecretSignalProps {
  onEnter: () => void;
  onFocus?: () => void;
}

export function SecretSignal({ onEnter, onFocus }: SecretSignalProps) {
  const unlocked = useUIStore((s) => s.secretUnlocked);
  const ref = useRef<HTMLButtonElement>(null);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--sig-x', `${(((e.clientX - rect.left) / rect.width) * 100).toFixed(1)}%`);
    el.style.setProperty('--sig-y', `${(((e.clientY - rect.top) / rect.height) * 100).toFixed(1)}%`);
    el.style.setProperty('--sig-glow', '1');
  }, []);

  const onPointerLeave = useCallback(() => {
    ref.current?.style.setProperty('--sig-glow', '0');
  }, []);

  return (
    <li className="secret-signal">
      <button
        ref={ref}
        type="button"
        className="secret-signal__btn"
        onClick={onEnter}
        onFocus={onFocus}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        data-unlocked={unlocked || undefined}
      >
        <span className="secret-signal__orb" aria-hidden="true">
          <span className="secret-signal__ring" />
          <span className="secret-signal__ring" />
          <span className="secret-signal__core" />
        </span>

        <span className="secret-signal__text">
          <span className="secret-signal__label">静默空间</span>
          <span className="secret-signal__hint">
            {unlocked ? '你已经去过那里了' : '这里有东西——但不明显'}
          </span>
        </span>

        {/* A real name for assistive tech. The visual label stays deliberately
            vague; the accessible name does not have to be. */}
        <span className="visually-hidden">进入静默空间（隐藏页面）</span>
      </button>
    </li>
  );
}
