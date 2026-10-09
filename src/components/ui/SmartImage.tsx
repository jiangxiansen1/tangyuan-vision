/**
 * SmartImage — every image in the product goes through this.
 *
 * Implements the full set of image requirements from the brief in one place:
 *   • lazy loading below the fold, eager for the LCP image
 *   • a tone-matched placeholder that prevents a flash of empty space and uses
 *     the photo's own dominant colour, so loading looks intentional
 *   • a real failure state with an explanatory label, never a broken-image icon
 *   • the intrinsic aspect ratio reserved up front, so nothing reflows
 *   • decoding off the main thread where the browser allows it
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { assetUrl } from '@/lib/asset';
import './smart-image.css';

export interface SmartImageProps {
  /** Path WITHOUT the deploy base. */
  src: string;
  /** Optional separate thumbnail; falls back to `src`. */
  thumb?: string;
  alt: string;
  width: number;
  height: number;
  /** Dominant colour from the content model — drives the placeholder. */
  tone?: string;
  /** Only ONE image per page should set this. */
  priority?: boolean;
  sizes?: string;
  className?: string;
  /** How the image fills its box. */
  fit?: 'cover' | 'contain';
  /** Caption shown in the failure state; defaults to a generic message. */
  failureLabel?: string;
  onLoadStateChange?: (state: ImageState) => void;
}

export type ImageState = 'idle' | 'loading' | 'loaded' | 'error';

export function SmartImage({
  src,
  thumb,
  alt,
  width,
  height,
  tone = '#101820',
  priority = false,
  sizes,
  className,
  fit = 'cover',
  failureLabel,
  onLoadStateChange,
}: SmartImageProps) {
  const [state, setState] = useState<ImageState>('idle');
  const imgRef = useRef<HTMLImageElement | null>(null);

  const report = useCallback(
    (next: ImageState) => {
      setState(next);
      onLoadStateChange?.(next);
    },
    [onLoadStateChange]
  );

  // An image restored from the bfcache, or one that finished before React
  // attached its handlers, will already be `complete` on mount. Without this the
  // UI would sit in the loading state forever behind a cached image.
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    if (el.complete) {
      report(el.naturalWidth > 0 ? 'loaded' : 'error');
    }
  }, [report]);

  const requested = priority ? src : (thumb ?? src);

  return (
    <div
      className={`smart-image smart-image--${fit} ${className ?? ''}`}
      style={{
        aspectRatio: `${width} / ${height}`,
        ['--tone' as string]: tone,
      }}
      data-state={state}
    >
      <img
        ref={imgRef}
        src={assetUrl(requested)}
        alt={alt}
        width={width}
        height={height}
        sizes={sizes}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        fetchPriority={priority ? 'high' : 'auto'}
        draggable={false}
        onLoad={() => report('loaded')}
        onError={() => {
          // A missing thumbnail is not fatal — try the full asset once before
          // declaring failure, because the two are generated together.
          if (thumb && requested === thumb) {
            const el = imgRef.current;
            if (el) {
              el.src = assetUrl(src);
              return;
            }
          }
          report('error');
        }}
        style={{ objectFit: fit }}
      />

      {state !== 'loaded' && state !== 'error' ? (
        <span className="smart-image__placeholder shimmer" aria-hidden="true" />
      ) : null}

      {state === 'error' ? (
        <span className="smart-image__failure" role="img" aria-label={alt}>
          <span className="smart-image__failure-mark" aria-hidden="true" />
          <span className="smart-image__failure-text">
            {failureLabel ?? '图像未能加载'}
            <span className="smart-image__failure-hint">IMAGE UNAVAILABLE</span>
          </span>
        </span>
      ) : null}
    </div>
  );
}
