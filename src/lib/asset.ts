/**
 * asset.ts — the ONLY place that turns a public asset path into a usable URL.
 *
 * GitHub Pages serves this app from a project sub-path (or the repo root, or a
 * custom domain), and Vite's `base` is resolved at build time. Hardcoding a
 * leading `/` anywhere else in the codebase would break sub-path deploys, so
 * every runtime reference routes through `assetUrl()`.
 *
 * Contract:
 *   entries store paths WITHOUT the base, e.g. "/assets/photography/x.webp"
 *   assetUrl() prepends import.meta.env.BASE_URL exactly once.
 */

/** Vite guarantees BASE_URL ends with "/". */
const BASE = import.meta.env.BASE_URL || '/';

/** Join the deploy base with a root-relative asset path. */
export function assetUrl(path: string | undefined | null): string {
  if (!path) return '';
  // Absolute URLs and data URIs are already complete.
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }
  const clean = path.startsWith('/') ? path.slice(1) : path;
  return `${BASE}${clean}`;
}

/** True when a link should open in a new tab (external origin). */
export function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * Placeholder used whenever an optional link/asset has not been supplied.
 * We never fabricate a URL, so the UI renders this marker instead of a
 * plausible-looking dead link.
 */
export const PENDING_MARKER = '待填写 / TBD';

export function isPending(value: string | undefined | null): boolean {
  return !value || value.trim() === '' || value === PENDING_MARKER;
}
