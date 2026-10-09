/**
 * useDocumentTitle — per-route metadata.
 *
 * A client-rendered SPA cannot emit per-route <head> content at build time, so
 * these writes are what actually gives each scene a distinct title, description
 * and Open Graph block for in-app navigation. They are also what a link
 * unfurler sees when a crawler executes JavaScript.
 *
 * The static index.html carries the same baseline tags, so a crawler that does
 * NOT execute JavaScript still gets correct metadata for the site root. That
 * limitation is documented in docs/DEPLOYMENT.md rather than hidden.
 */

import { useEffect } from 'react';
import { SITE_TITLE_SUFFIX } from '@/content';
import { assetUrl } from '@/lib/asset';

function setMeta(attr: 'name' | 'property', key: string, value: string): void {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function setLink(rel: string, href: string): void {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export interface PageMeta {
  title: string;
  description: string;
  /** Path of the social preview image, without the deploy base. */
  image?: string;
  /** Route path, used as the canonical URL suffix. */
  path: string;
  /** Set true for pages that must not be indexed (the hidden space). */
  noindex?: boolean;
  type?: 'website' | 'article';
}

export function useDocumentTitle({ title, description, image, path, noindex, type = 'website' }: PageMeta): void {
  useEffect(() => {
    const fullTitle = title ? `${title} · ${SITE_TITLE_SUFFIX}` : SITE_TITLE_SUFFIX;
    document.title = fullTitle;

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);

    if (image) {
      const url = new URL(assetUrl(image), window.location.origin).toString();
      setMeta('property', 'og:image', url);
      setMeta('name', 'twitter:image', url);
      setMeta('name', 'twitter:card', 'summary_large_image');
    }

    // Canonical URL. The base + path is the best available approximation of the
    // deployed URL; it is correct for the Pages project sub-path and for a
    // custom domain alike, because both are derived from the same base value.
    const canonical = new URL(assetUrl(path.replace(/^\//, '')), window.location.origin).toString();
    setLink('canonical', canonical);
    setMeta('property', 'og:url', canonical);

    // Robots: the hidden space must stay out of indexes.
    let robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noindex) {
      if (!robots) {
        robots = document.createElement('meta');
        robots.setAttribute('name', 'robots');
        document.head.appendChild(robots);
      }
      robots.setAttribute('content', 'noindex, nofollow');
    } else if (robots) {
      robots.setAttribute('content', 'index, follow');
    }
  }, [title, description, image, path, noindex, type]);
}
