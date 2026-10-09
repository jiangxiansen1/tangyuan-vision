/**
 * Button and IconButton — the two interactive primitives.
 *
 * Both are thin wrappers over <button> so that focus, keyboard activation and
 * disabled semantics come from the platform rather than being re-implemented.
 * The `magnetic` behaviour is a small translate toward the pointer, hard-capped
 * so it never moves far enough to feel like a target that dodges the cursor.
 */

import {
  forwardRef,
  useCallback,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { useHasFinePointer } from '@/hooks/useMediaQuery';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { Icon, type IconName } from './Icon';
import './button.css';

const MAGNET_MAX = 4;

export type ButtonVariant = 'solid' | 'glass' | 'ghost' | 'line';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Glyph rendered before the label. */
  icon?: IconName;
  /** Glyph rendered after the label. */
  iconAfter?: IconName;
  /** Fill the available width. */
  block?: boolean;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'glass', size = 'md', icon, iconAfter, block, className, children, ...rest },
  ref
) {
  return (
    <button
      {...rest}
      ref={ref}
      className={[
        'btn',
        `btn--${variant}`,
        `btn--${size}`,
        block ? 'btn--block' : '',
        !children ? 'btn--icon-only' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 15 : 17} className="btn__icon" /> : null}
      {children ? <span className="btn__label">{children}</span> : null}
      {iconAfter ? <Icon name={iconAfter} size={size === 'sm' ? 15 : 17} className="btn__icon" /> : null}
    </button>
  );
});

export interface MagneticButtonProps extends ButtonProps {
  /** Maximum displacement in px. Clamped internally to a hard ceiling. */
  strength?: number;
}

/**
 * MagneticButton — a button that leans very slightly toward the pointer.
 * Bounded to 4px by design: at this magnitude it reads as responsiveness rather
 * than as motion, which is the intent stated in the brief.
 */
export const MagneticButton = forwardRef<HTMLButtonElement, MagneticButtonProps>(function MagneticButton(
  { strength = 3, onPointerMove, onPointerLeave, style, ...rest },
  ref
) {
  const finePointer = useHasFinePointer();
  const { reduced } = usePrefersReducedMotion();
  const localRef = useRef<HTMLButtonElement | null>(null);
  const depth = Math.min(MAGNET_MAX, Math.max(0, strength));
  const enabled = finePointer && !reduced;

  const setRefs = useCallback(
    (node: HTMLButtonElement | null) => {
      localRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref]
  );

  const handleMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      onPointerMove?.(e);
      if (!enabled) return;
      const el = localRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = ((e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)) * depth;
      const dy = ((e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2)) * depth;
      el.style.setProperty('--magnet-x', `${dx.toFixed(2)}px`);
      el.style.setProperty('--magnet-y', `${dy.toFixed(2)}px`);
    },
    [depth, enabled, onPointerMove]
  );

  const handleLeave = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      onPointerLeave?.(e);
      const el = localRef.current;
      if (!el) return;
      el.style.setProperty('--magnet-x', '0px');
      el.style.setProperty('--magnet-y', '0px');
    },
    [onPointerLeave]
  );

  return (
    <Button
      {...rest}
      ref={setRefs}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{ ...style, ['--magnet-strength' as string]: `${depth}` }}
    />
  );
});
