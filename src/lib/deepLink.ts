/**
 * deepLink.ts — the other half of the GitHub Pages deep-link fix.
 *
 * public/404.html rewrites an unknown deep path into a query form:
 *
 *     /repo/photography          →  /repo/?/photography
 *     /repo/journal?x=1#y        →  /repo/?/journal&x=1#y
 *
 * This module detects that form, restores the real path with
 * history.replaceState, and returns true so the caller knows the URL was
 * rewritten. React Router then mounts against a clean URL and no route, link or
 * component has to be aware that any of this happened.
 *
 * The rewrite is also why the address bar shows the correct path afterwards —
 * a hash-based router would have shown `#/photography` permanently, which the
 * brief explicitly wanted to avoid.
 *
 * MUST RUN BEFORE React Router is created. See src/main.tsx.
 */

const PREFIX = '?/';

/**
 * Restore the original URL if the current one is in the 404-fallback form.
 * @returns true when a rewrite was applied.
 */
export function restoreDeepLink(): boolean {
  if (typeof window === 'undefined') return false;

  const { search, hash } = window.location;
  if (!search.startsWith(PREFIX)) return false;

  // `?/photography&a=1` -> path "photography", query "a=1"
  const raw = search.slice(PREFIX.length);

  // The original query string, if the fallback appended one, is delimited by the
  // first "&" — any that follow belong to that original query.
  const ampIndex = raw.indexOf('&');
  const path = ampIndex === -1 ? raw : raw.slice(0, ampIndex);
  const query = ampIndex === -1 ? '' : raw.slice(ampIndex + 1);

  // Decode then re-encode is not safe here: the path was inserted verbatim by the
  // fallback page. Guard against injection of a protocol-relative URL, which
  // would turn this into an open redirect.
  const safePath = path.replace(/^\/+/, '');
  if (safePath.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(safePath)) return false;

  const base = import.meta.env.BASE_URL || '/';
  const restored = `${base}${safePath}${query ? `?${query}` : ''}${hash}`;

  try {
    window.history.replaceState(null, '', restored);
    return true;
  } catch {
    // If replaceState is refused (rare, e.g. sandboxed iframe), leave the URL as
    // it is: Router will then see the query form and render the 404 page, which
    // is a better outcome than throwing during start-up.
    return false;
  }
}

/**
 * True when the app is being served from a project sub-path rather than a domain
 * root. Used by the diagnostics panel and the delivery docs.
 */
export function isSubPathDeploy(): boolean {
  const base = import.meta.env.BASE_URL || '/';
  return base !== '/';
}
