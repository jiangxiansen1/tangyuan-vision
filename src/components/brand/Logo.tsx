/**
 * Logo — the brand mark, with the two failure paths the brief requires.
 *
 * Both PNGs are real assets derived from the supplied 水印白.jpg (see
 * tools/build-brand-assets.cjs). This component:
 *   • reserves the correct aspect ratio from the build manifest, so the mark
 *     never causes a layout shift while loading;
 *   • swaps to a decorative text lockup if the image fails to load, instead of
 *     leaving a broken-image icon in the header;
 *   • is always exposed with an accessible name, since it carries the brand line
 *     "CAPTURE MOMENTS" that appears nowhere else in the DOM.
 */

import { useCallback, useState } from 'react';
import { assetUrl } from '@/lib/asset';
import { BRAND } from '@/content';
import { BRAND_ASSETS } from './manifest';
import './logo.css';

export interface LogoProps {
  /** 'light' = white ink for dark surfaces (the default). */
  ink?: 'light' | 'dark';
  /** Rendered height in px. Width follows the mark's true aspect ratio. */
  height?: number;
  /** Use the tight camera-glyph crop instead of the full lockup. */
  variant?: 'full' | 'mark' | 'wordmark';
  /** Hide from assistive tech when a wrapping element already names the brand. */
  decorative?: boolean;
  className?: string;
  /** Fill the parent's width instead of using a fixed height. */
  fluid?: boolean;
}

export function Logo({
  ink = 'light',
  height = 34,
  variant = 'full',
  decorative = false,
  className,
  fluid = false,
}: LogoProps) {
  const [failed, setFailed] = useState(false);

  const entry =
    variant === 'mark'
      ? BRAND_ASSETS.mark
      : variant === 'wordmark'
        ? BRAND_ASSETS.wordmark
        : ink === 'dark'
          ? BRAND_ASSETS.dark
          : BRAND_ASSETS.light;

  const onError = useCallback(() => setFailed(true), []);

  const label = `${BRAND.nickname} — ${BRAND.logoLine}`;

  // Fallback: a typographic lockup in the same proportions. This is what a
  // visitor sees if the asset pipeline was never run on a fresh clone.
  if (failed) {
    return (
      <span
        className={`logo logo--fallback ${className ?? ''}`}
        style={{ height, ['--logo-fallback-size' as string]: `${Math.max(12, height * 0.48)}px` }}
        role={decorative ? undefined : 'img'}
        aria-label={decorative ? undefined : label}
        aria-hidden={decorative || undefined}
      >
        <span className="logo__fallback-name">{BRAND.brandFull}</span>
        <span className="logo__fallback-line">{BRAND.logoLine}</span>
      </span>
    );
  }

  return (
    <img
      src={assetUrl(entry.path)}
      width={fluid ? undefined : Math.round(height * entry.aspect)}
      height={fluid ? undefined : height}
      alt={decorative ? '' : label}
      aria-hidden={decorative || undefined}
      decoding="async"
      loading="eager"
      fetchPriority="high"
      draggable={false}
      onError={onError}
      className={`logo logo--${ink} ${fluid ? 'logo--fluid' : ''} ${className ?? ''}`}
      style={fluid ? undefined : { height, width: 'auto' }}
    />
  );
}
