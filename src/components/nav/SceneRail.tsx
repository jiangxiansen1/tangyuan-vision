/**
 * SceneRail — the site-wide scene progress rail (P3).
 *
 * WHAT THE DESIGN DOC ASKS FOR (docs/scene-architecture.md, unchanged)
 *   • desktop: left edge, vertically centred, liquid glass `standard`, ≤56px;
 *   • five nodes 01–05; the boot (00) is not a node and the hidden route never
 *     appears;
 *   • the current node is lit; scroll position syncs with it through the
 *     measured CENTRE-LINE model (rootMargin -50% / 0 / -50%), the same model
 *     the wheel controller uses — never threshold 0.5;
 *   • click: same page → smooth scroll (reduced motion → instant); other route →
 *     navigate;
 *   • hover/focus → the scene name (Chinese + Latin small caps) in a glass tip;
 *   • keyboard: a navigation list, Tab reachable, Enter jumps, aria-current;
 *   • mobile (<900px): the rail collapses to a 3px right-edge progress bar plus
 *     a top scene-name pill that takes no content width;
 *   • it NEVER locks the wheel — it reports and shortcuts, nothing more.
 *
 * It lives in the reserved 64px gutter (`--rail-gutter`), so no scene reflows.
 */

import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import './scene-rail.css';

interface RailNode {
  key: string;
  /** Anchor of the narrative section on the home page (null = the stage). */
  sectionId: string | null;
  /** Route that owns this scene when the visitor is elsewhere. */
  path: string;
  cn: string;
  en: string;
  index: string;
}

/** Mirrors the five-scene narrative; ids match the `#scene-*` anchors. */
const NODES: RailNode[] = [
  { key: 'home', sectionId: null, path: '/', cn: '汤圆Vision', en: 'HOME', index: '01' },
  { key: 'earth', sectionId: 'scene-earth', path: '/earth', cn: '地球 Online', en: 'EARTH', index: '02' },
  { key: 'photography', sectionId: 'scene-photography', path: '/photography', cn: '汤圆视界', en: 'PHOTOGRAPHY', index: '03' },
  { key: 'create', sectionId: 'scene-lab', path: '/lab', cn: '创造与实验', en: 'CREATE', index: '04' },
  { key: 'contact', sectionId: 'scene-contact', path: '/contact', cn: '联系我', en: 'CONTACT', index: '05' },
];

export function SceneRail() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { reduced } = usePrefersReducedMotion();
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);
  /** Mobile: the pill appears only after the header scrolls away, so the scene
      capsule and the brand mark can never overlap (measured collision at 390px). */
  const [pastHeader, setPastHeader] = useState(false);
  const onHome = pathname === '/';

  /** Where a node points on this page, if its section exists here. */
  const sectionOf = useCallback((node: RailNode): Element | null => {
    if (!onHome) return null;
    if (!node.sectionId) return document.querySelector('.vhome__stage');
    return document.getElementById(node.sectionId);
  }, [onHome]);

  /* Active node: centre-line on the home narrative, route ownership elsewhere. */
  useEffect(() => {
    if (!onHome) {
      const i = NODES.findIndex((n) => n.path !== '/' && pathname.startsWith(n.path));
      setActive(i);
      return;
    }
    const targets = NODES.map((n) => (n.sectionId ? document.getElementById(n.sectionId) : document.querySelector('.vhome__stage')));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = targets.indexOf(e.target);
          if (i >= 0) setActive(i);
        }
      },
      /* The measured centre-line model — threshold 0.5 can never be satisfied
         by a scene taller than the viewport (P0 finding). */
      { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
    );
    for (const t of targets) if (t) io.observe(t);
    return () => io.disconnect();
  }, [onHome, pathname]);

  /* Mobile progress bar: scroll ratio, home only (elsewhere it is meaningless). */
  useEffect(() => {
    if (!onHome) return;
    const onScroll = () => {
      const h = document.documentElement;
      /*
         * `h` is document.documentElement — an HTMLElement, which has no
         * innerHeight (that lives on window). clientHeight is the element's
         * own viewport box and is the same measurement here, so the ratio
         * (scrollTop / scrollable distance) is unchanged; it simply type-checks.
         */
      setProgress(Math.min(1, Math.max(0, h.scrollTop / Math.max(1, h.scrollHeight - h.clientHeight))));
      setPastHeader(h.scrollTop > 60);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [onHome]);

  const jump = useCallback(
    (node: RailNode) => {
      const target = sectionOf(node);
      if (target) {
        target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
        return;
      }
      navigate(node.path === '/' ? '/' : node.path);
    },
    [navigate, reduced, sectionOf]
  );

  const current = active >= 0 ? NODES[active] : NODES[0];

  return (
    <>
      <nav className="rail no-print" aria-label="场景进度" data-context={onHome ? 'narrative' : 'scene'}>
        <ol className="rail__list">
          {NODES.map((n, i) => (
            <li key={n.key} className="rail__item">
              <button
                type="button"
                className="rail__node"
                onClick={() => jump(n)}
                data-active={i === active || undefined}
                aria-current={i === active ? 'true' : undefined}
                aria-label={n.index + ' ' + n.cn + ' ' + n.en}
              >
                <span className="rail__dot" aria-hidden="true" />
                <span className="rail__tip glass glass--solid" aria-hidden="true">
                  <b>{n.cn}</b>
                  <span className="rail__tip-en u-mono">{n.en}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {onHome ? (
        <>
          <div className="rail-bar" aria-hidden="true">
            <i style={{ height: (progress * 100).toFixed(1) + '%' }} />
          </div>
          <p className="rail-pill glass glass--standard" role="status" data-pill={pastHeader ? 'on' : 'off'}>
            <span className="u-mono">{current.index}</span>
            <span>{current.cn}</span>
          </p>
        </>
      ) : null}
    </>
  );
}
