/**
 * SceneShell — the shared frame every full-screen theme scene renders in.
 *
 * TWO LAYOUTS, ONE LANGUAGE
 *   • stack — head on top, body below (contact, and any scene whose content is
 *     a wide grid of equal cards)
 *   • split — head and body side by side in one viewport: text column ~34%,
 *     media column ~66% (earth), or mirrored 64/36 (photography). This is the
 *     layout the brief fixes for the two visual themes; the P2 correction round
 *     proved that stacking them reads as an ordinary page, not a scene.
 *
 * Titles, labels and accents come from the single route registry; the shell
 * carries no content of its own. The left gutter (--rail-gutter) is inherited
 * from .vhome so the P3 rail overlays every scene identically.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SceneRoute } from '@/app/routes';
import './scenes.css';

export interface SceneCta {
  to: string;
  label: string;
  en?: string;
  primary?: boolean;
}

export interface SceneShellProps {
  route: SceneRoute;
  /** Two-digit scene number in the vertical narrative, e.g. "02". */
  index: string;
  lede?: ReactNode;
  headExtra?: ReactNode;
  ctas?: SceneCta[];
  children: ReactNode;
  bodyClassName?: string;
  /** 'stack' (default) or 'split' (two columns inside one viewport). */
  variant?: 'stack' | 'split';
  /** split only: put the media column first (photography). */
  mediaFirst?: boolean;
}

export function SceneShell({
  route,
  index,
  lede,
  headExtra,
  ctas = [],
  children,
  bodyClassName,
  variant = 'stack',
  mediaFirst = false,
}: SceneShellProps) {
  const ctasNode =
    ctas.length > 0 ? (
      <div className="vscene__ctas">
        {ctas.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            data-interactive="true"
            className={`vscene__cta glass glass--standard${c.primary ? ' vscene__cta--primary' : ''}`}
          >
            <span>{c.label}</span>
            {c.en ? <span className="vscene__cta-en u-mono">{c.en}</span> : null}
          </Link>
        ))}
      </div>
    ) : null;

  const head = (
    <header className="vscene__head">
      <p className="vscene__eyebrow">
        <span className="vscene__index u-mono" aria-hidden="true">
          {index}
        </span>
        <span className="u-label">{route.labelEn}</span>
        <span className="vscene__eyebrow-rule" aria-hidden="true" />
      </p>
      <h2 className="vscene__title" id={`scene-${route.id}-title`}>
        {route.title}
      </h2>
      {lede ? <p className="vscene__lede">{lede}</p> : null}
      {headExtra}
      {variant === 'split' ? ctasNode : null}
    </header>
  );

  return (
    <section
      className={`vscene${variant === 'split' ? ' vscene--split' : ''}${mediaFirst ? ' vscene--media-first' : ''}`}
      id={`scene-${route.id}`}
      data-scene-id={route.id}
      aria-labelledby={`scene-${route.id}-title`}
      style={{ ['--scene-accent' as string]: route.accent } as CSSProperties}
    >
      {head}
      <div className={`vscene__body ${bodyClassName ?? ''}`}>{children}</div>
      {variant === 'stack' ? ctasNode : null}
    </section>
  );
}
