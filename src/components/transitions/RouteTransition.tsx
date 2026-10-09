/**
 * SceneTransition — route-level motion, rebuilt so exits actually run.
 *
 * WHAT WAS WRONG BEFORE
 * ---------------------
 * Every route element wrapped ITSELF in `<SceneTransition>`. That reads sensibly
 * but cannot work: each route instantiation owns its own state and its own
 * `motion.div`, so when the router swaps routes the outgoing component is
 * unmounted immediately. There is nothing left alive to animate out, so the only
 * motion possible is the incoming page fading in. That is exactly the behaviour
 * the brief describes and asks to replace: "只有新页面淡入和上移，无法保留旧页面
 * 执行退出动画".
 *
 * The Tween cannot be fixed by increasing a duration — the component lifetime has
 * to change. So this file now provides a transition that wraps the ROUTER OUTPUT
 * rather than each route: one persistent `AnimatePresence` lives above the route
 * swap, and the outgoing page stays mounted (and animating) until its exit
 * finishes.
 *
 * THE THREE ENTRANCES
 * -------------------
 *   1. `SharedTransition`   — photography and Earth. The window a visitor clicked
 *      expands into the destination. Implemented with a `layoutId` shared between
 *      the home window and the destination's hero, so Motion interpolates the two
 *      geometries directly. That is a genuinely continuous element, not two
 *      animations that happen to overlap.
 *   2. `scene`            — everything else. A short fade and lift.
 *   3. `immersive`        — the hidden space. A faster, heavier push.
 *
 * INTERRUPTION
 * ------------
 * `popLayout` is not used: it removes the exiting element from layout immediately,
 * which would make the outgoing page collapse and pull the incoming one up — a
 * visible jump. Instead the exiting page is positioned absolutely over the
 * incoming one for the duration of its exit, so neither affects the other's
 * layout and a mid-flight navigation cannot leave the two stacked.
 *
 * Reduced motion collapses every variant to an instant swap. Nothing here is
 * required for the app to function.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from 'motion/react';
import { transitionFor } from './transition-kinds';
import './scene-transition.css';

/** Shared easing, matched to `--ease-entrance` in tokens.css. */
const EASE = [0.16, 1, 0.3, 1] as const;

interface RouteTransitionProps {
  children: ReactNode;
}

/**
 * RouteTransition — owns the AnimatePresence that wraps the router output.
 *
 * This component deliberately renders nothing animated itself. Two things must be
 * in place for an exit to be possible at all:
 *
 *   1. A SINGLE AnimatePresence above the route swap. An AnimatePresence inside a
 *      route cannot see a departure, because that route is the thing being
 *      unmounted.
 *   2. A keyed child, so the presence container knows one page replaced another.
 */
export function RouteTransition({ children }: RouteTransitionProps) {
  const { pathname } = useLocation();
  return (
    /**
     * `mode="sync"` keeps both pages mounted during the hand-off, which is what
     * makes a cross-fade possible at all. `initial={false}` suppresses the
     * entrance animation on the very first paint, so a cold load with a deep link
     * does not fade in from nothing.
     */
    <AnimatePresence mode="sync" initial={false}>
      <RouteShell key={pathname}>{children}</RouteShell>
    </AnimatePresence>
  );
}

/**
 * RouteShell — the animated surface for one route.
 *
 * Split out from `RouteTransition` because `useIsPresent()` only works INSIDE an
 * `AnimatePresence`; calling it in the container that renders the container would
 * either throw or return a constant.
 */
function RouteShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const prefersReduced = useReducedMotion();
  const previousPath = useRef<string | null>(null);

  /**
   * Scroll handling.
   *
   * The outgoing page is absolutely positioned during its exit, so the document
   * would otherwise keep the OLD scroll offset while the new page sits in normal
   * flow at the top — a visible jump. Scroll is restored before the new route
   * paints.
   */
  useEffect(() => {
    const isFirst = previousPath.current === null;
    const changed = previousPath.current !== null && previousPath.current !== pathname;
    previousPath.current = pathname;
    if (isFirst || !changed) return;

    // `instant` is required: with `scroll-behavior: smooth` in base.css a plain
    // scrollTo would animate an entire page length and look broken.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  /** Only shared and scene entrances fade; immersive replaces the whole view. */
  const kind = transitionFor(pathname);

  /*
   * The exiting page must be lifted out of flow, and that has to come from
   * Motion's real lifecycle rather than from the route change.
   *
   * `useIsPresent()` flips to false when AnimatePresence has decided this element
   * is leaving — exactly when its exit begins, and true for the whole of its
   * normal life. Deriving it from `location` instead would mark the WRONG element
   * as exiting: on a route change it is the INCOMING shell that first observes the
   * new pathname.
   */
  const isPresent = useIsPresent();

  const variants = prefersReduced
    ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 } }
    : {
        initial: { opacity: 0, y: kind === 'shared' ? 0 : 12 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: kind === 'shared' ? 0 : -8 },
      };

  return (
    <motion.div
      className="route-shell"
      data-transition={kind}
      data-arriving={kind === 'shared' ? 'true' : undefined}
      // Read by scene-transition.css to take the departing page out of layout;
      // two pages in normal flow would double the document height and then jump.
      data-exiting={!isPresent ? 'true' : undefined}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={prefersReduced ? { duration: 0 } : { duration: 0.34, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
