/**
 * GlassSurface — the one component every translucent surface in the app uses.
 *
 * Rendering the six layers by hand in each caller is how a design system rots,
 * so the material is centralised here. Layers are emitted only when the current
 * quality tier actually uses them, which keeps the DOM small on phones.
 *
 * See src/styles/glass.css for what each layer does.
 */

import {
  forwardRef,
  useCallback,
  useState,
  type CSSProperties,
  type ElementType,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { usePointerHighlight } from '@/hooks/usePointerHighlight';

export type GlassTier = 'standard' | 'depth' | 'refract';

export interface GlassSurfaceProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** Material tier. See glass.css — higher tiers cost more to composite. */
  tier?: GlassTier;
  /** Renders an opaque surface; use for surfaces over busy content. */
  solid?: boolean;
  /** Adds cursor/hover affordances and a press ripple. */
  interactive?: boolean;
  /** Plays the press ripple on pointer-down. Defaults to `interactive`. */
  ripple?: boolean;
  /** Element to render. Defaults to `div`. */
  as?: ElementType;
  /** Corner radius override. */
  radius?: string;
  children?: ReactNode;
}

let rippleSeq = 0;

export const GlassSurface = forwardRef<HTMLElement, GlassSurfaceProps>(function GlassSurface(
  {
    tier = 'depth',
    solid = false,
    interactive = false,
    ripple,
    as: Tag = 'div',
    radius,
    className,
    style,
    children,
    onPointerDown,
    ...rest
  },
  forwardedRef
) {
  const { ref: highlightRef, enabled: highlightEnabled } = usePointerHighlight<HTMLElement>();
  const [ripples, setRipples] = useState<Array<{ id: number; x: number; y: number; size: number }>>([]);
  const wantsRipple = ripple ?? interactive;

  const setRefs = useCallback(
    (node: HTMLElement | null) => {
      highlightRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef, highlightRef]
  );

  const handlePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      onPointerDown?.(e);
      if (!wantsRipple) return;
      // Only a real press produces a ripple; hover already has the specular.
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen' && e.pointerType !== 'touch') return;
      const rect = e.currentTarget.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 0.6;
      const id = ++rippleSeq;
      setRipples((prev) => [
        ...prev.slice(-2), // at most three ripples alive at once
        { id, x: e.clientX - rect.left, y: e.clientY - rect.top, size },
      ]);
      window.setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== id));
      }, 700);
    },
    [onPointerDown, wantsRipple]
  );

  const classes = [
    'glass',
    `glass--${tier}`,
    solid ? 'glass--solid' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  const mergedStyle: CSSProperties = {
    ...(radius ? { ['--glass-radius' as string]: radius } : {}),
    ...style,
  };

  return (
    <Tag
      {...rest}
      ref={setRefs}
      className={classes}
      style={mergedStyle}
      data-interactive={interactive ? 'true' : undefined}
      onPointerDown={handlePointerDown}
    >
      {/* L3/L4 — inner stroke and rim light live on ::before/::after */}
      {/* L5 — specular. Rendered only when the pointer tracker is running. */}
      {highlightEnabled ? <span className="glass__specular" aria-hidden="true" /> : null}
      {/* L6 — dispersion. Only the refractive tier pays for it. */}
      {tier === 'refract' ? <span className="glass__dispersion" aria-hidden="true" /> : null}
      {tier === 'refract' ? <span className="glass__chroma" aria-hidden="true" /> : null}

      {children}

      {ripples.map((r) => (
        <span
          key={r.id}
          className="glass__ripple"
          aria-hidden="true"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </Tag>
  );
});
