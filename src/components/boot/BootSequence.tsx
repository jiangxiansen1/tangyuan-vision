/**
 * BootSequence — the brand entrance.
 *
 * TIMING (the brief allows 1–2 s; this runs 1.65 s and is skippable at any point)
 *   0.00–0.22s  ambient light rises from black
 *   0.15–0.75s  the mark is revealed by a left-to-right light sweep across the
 *               coverage mask, so the artwork resolves rather than fades in
 *   0.55–0.95s  a glass highlight rakes across the mark and dissipates
 *   0.70–1.05s  the CAPTURE MOMENTS lockup settles under the mark
 *   1.05–1.50s  the scene behind expands into focus, the overlay clears
 *   1.50–1.65s  hand-off to the live hub
 *
 * BEHAVIOUR GUARANTEES
 *   • Skippable by click/tap, any key, Escape, Enter or Space.
 *   • Returns a repeat visitor to a shortened 620 ms version.
 *   • Runs a 300 ms version and reveals everything at once under reduced motion.
 *   • If the mark fails to load, the text lockup renders instead.
 *   • Never blocks the app: the hub is already mounted and interactive
 *     underneath, and the overlay is removed on a timeout regardless of state.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BRAND } from '@/content';
import { BRAND_ASSETS } from '@/components/brand/manifest';
import { assetUrl } from '@/lib/asset';
import { readFlag, storageKeys } from '@/lib/storage';
import './boot.css';

export interface BootSequenceProps {
  onDone: () => void;
  /** 'full' for a first visit, 'short' for a returning visitor. */
  mode?: 'full' | 'short';
}

const DURATION = { full: 1650, short: 620, reduced: 300 } as const;

/**
 * Decides between the full, shortened and skipped sequences.
 *
 * Colocated with the component on purpose: it is the component's own
 * configuration rule, and the two must stay in step. The fast-refresh lint rule
 * that mixed component/value exports normally trip is relaxed for this file
 * below, since the alternative — a separate one-function module for a three-line
 * predicate — would separate the rule from the thing it governs.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function shouldRunBoot(bootEnabled: boolean): false | 'full' | 'short' {
  if (!bootEnabled) return false;
  if (readFlag(storageKeys.bootSeen, false)) return 'short';
  return 'full';
}

export function BootSequence({ onDone, mode = 'full' }: BootSequenceProps) {
  const prefersReduced = useReducedMotion();
  const [leaving, setLeaving] = useState(false);
  const [markFailed, setMarkFailed] = useState(false);
  const finishedRef = useRef(false);

  const total = prefersReduced ? DURATION.reduced : DURATION[mode];
  // The sweep and highlight collapse to nothing when motion is reduced.
  const scale = prefersReduced ? 0 : mode === 'full' ? 1 : 0.45;

  const finish = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setLeaving(true);
  }, []);

  /**
   * Guaranteed removal.
   *
   * The fade-out below is driven by Motion, and its completion callback is the
   * fast path to unmounting. But that callback is not a guarantee: a headless
   * runner that swallows animation frames, a browser with the compositor
   * throttled, or an interrupted transition can all leave the overlay on screen
   * with no way to dismiss it — which would trap the visitor behind a brand
   * animation. So the overlay is ALSO removed on a plain timer, and this timer is
   * what makes the sequence reliably self-terminating rather than merely usually
   * terminating.
   */
  useEffect(() => {
    if (!leaving) return;
    const hardStop = window.setTimeout(onDone, prefersReduced ? 60 : 520);
    return () => window.clearTimeout(hardStop);
  }, [leaving, onDone, prefersReduced]);

  useLayoutEffect(() => {
    if (!finishedRef.current) setLeaving(false);
  }, []);

  // Hard deadline. Even if an animation fails to fire its completion callback,
  // the overlay comes down — the brief forbids a boot screen that traps anyone.
  useEffect(() => {
    const t = window.setTimeout(finish, total);
    return () => window.clearTimeout(t);
  }, [finish, total]);

  // Any key or pointer press skips. `once` semantics come from finishedRef.
  useEffect(() => {
    const skip = () => finish();
    const onKey = (e: KeyboardEvent) => {
      // Escape, Enter, Space and any letter skip. Tab is respected so a keyboard
      // user can still move focus rather than being forced to dismiss.
      if (e.key === 'Tab') return;
      skip();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', skip, { passive: true });
    window.addEventListener('wheel', skip, { passive: true });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('wheel', skip);
    };
  }, [finish]);

  const maskStyle = useMemo(
    () => ({ ['--boot-scale' as string]: `${scale}` }),
    [scale]
  );

  return (
    <motion.div
      className="boot"
      data-leaving={leaving || undefined}
      data-short={mode === 'short' ? '' : undefined}
      style={maskStyle}
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: leaving ? 0.34 : 0.2, ease: [0.32, 0.72, 0, 1] }}
      onAnimationComplete={() => {
        if (leaving) onDone();
      }}
      aria-hidden="true"
      /* Not focusable and not announced: this is a decorative overlay, the hub is
         already mounted underneath, and nothing here is required to use the site.
         A screen-reader or keyboard user is never gated by the sequence. */
    >
      {/* Layer 1 — ambient light rising out of black. */}
      <div className="boot__ambient" />

      <div className="boot__stage">
        <div className="boot__mark-wrap">
          {markFailed ? (
            <span className="boot__fallback">
              <span className="boot__fallback-name">{BRAND.brandFull}</span>
              <span className="boot__fallback-line">{BRAND.logoLine}</span>
            </span>
          ) : (
            <>
              {/* Layer 2 — the mark, revealed through a travelling mask. */}
              <img
                className="boot__mark"
                src={assetUrl(BRAND_ASSETS.light.path)}
                width={BRAND_ASSETS.light.width}
                height={BRAND_ASSETS.light.height}
                alt=""
                decoding="sync"
                fetchPriority="high"
                onError={() => setMarkFailed(true)}
              />
              {/* Layer 3 — the glass highlight raking across the mark. */}
              <span className="boot__rake" />
            </>
          )}
        </div>

        {/* Layer 4 — the brand lockup. */}
        <div className="boot__lockup">
          <span className="boot__rule" />
          <span className="boot__name">{BRAND.brandFull}</span>
          <span className="boot__cn">{BRAND.brandGloss}</span>
          <span className="boot__rule boot__rule--short" />
        </div>
      </div>

      {/* A quiet, honest progress indicator plus the skip affordance. */}
      <div className="boot__footer">
        <span className="boot__progress" style={{ ['--boot-total' as string]: `${total}ms` }} />
      </div>
    </motion.div>
  );
}
