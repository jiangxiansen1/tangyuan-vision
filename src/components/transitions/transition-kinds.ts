/**
 * transition-kinds.ts — which entrance a route gets.
 *
 * WHY THIS IS NOT IN RouteTransition.tsx
 * Fast refresh (and the lint rule that guards it) requires a module that exports a
 * component to export ONLY components. Routing the `transitionFor` helper through
 * that file would break hot reload for the transition system — a real cost for a
 * helper that is a pure function of a pathname and belongs on its own anyway.
 *
 * The mapping lives here rather than being inferred from the component tree
 * because the entrance is a property of the ROUTE, and the router is the only
 * thing that knows which route is arriving.
 */

/** Which entrance a route uses. */
export type TransitionKind =
  /** The two core spaces: a scale-and-grow hand-off. */
  | 'shared'
  /** Everything else: a short fade and lift. */
  | 'scene'
  /** The hidden space: a full-view camera push. */
  | 'immersive';

export function transitionFor(pathname: string): TransitionKind {
  if (pathname === '/the-quiet-space') return 'immersive';
  if (pathname === '/photography' || pathname === '/earth') return 'shared';
  return 'scene';
}
