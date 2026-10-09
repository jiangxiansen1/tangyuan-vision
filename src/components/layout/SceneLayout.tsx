/**
 * SceneLayout — the shared shell every content scene renders inside.
 *
 * Two jobs:
 *   1. Establish the scene theme (`data-scene`) so the ambient light, accent and
 *      glass tint resolve from src/styles/theme.css rather than being passed
 *      down as props.
 *   2. Provide the chrome the brief requires for orientation: a skip link, a
 *      breadcrumb that states where you are, a persistent way back to the hub,
 *      and the scene title as an <h1>.
 *
 * The hub itself does NOT use this layout — it has its own spatial chrome.
 */

import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '@/components/ui/Icon';
import { SoundControls } from '@/components/audio/SoundControls';
import { SettingsTrigger } from '@/components/settings/SettingsTrigger';
import { HOME_ROUTE } from '@/app/routes';
import type { SceneRoute } from '@/app/routes';
import './scene-layout.css';

export interface SceneLayoutProps {
  route: SceneRoute;
  children: ReactNode;
  /** Extra classes for the inner body, e.g. to widen a gallery. */
  bodyClassName?: string;
  /** Hide the standard scene header when a page provides its own hero. */
  hideHeader?: boolean;
}

export function SceneLayout({ route, children, bodyClassName, hideHeader = false }: SceneLayoutProps) {
  const scene = route.id;

  // The scene attribute drives the whole theme. Set on the wrapper rather than
  // on <html> so a nested preview can theme itself independently.
  useEffect(() => {
    // Keep the root in step too: the boot overlay and portalled surfaces (the
    // lightbox, settings sheet) render outside this subtree and still need the
    // correct scene tokens.
    document.documentElement.dataset.scene = scene;
    return () => {
      delete document.documentElement.dataset.scene;
    };
  }, [scene]);

  return (
    <div className="scene scene-layout" data-scene={scene}>
      <div className="scene-ambient" aria-hidden="true" />
      <div className="scene__grain" aria-hidden="true" />

      <a className="skip-link" href="#scene-main">
        跳到主要内容 <span className="skip-link__en">Skip to content</span>
      </a>

      <header className="scene-layout__chrome shared-chrome no-print">
        <nav className="scene-layout__nav" aria-label="面包屑">
          <Link to={HOME_ROUTE.path} className="scene-layout__home magnetic-target">
            <Icon name="arrow-left" size={15} />
            <span>{HOME_ROUTE.label}</span>
            <span className="scene-layout__home-en">{HOME_ROUTE.labelEn}</span>
          </Link>

          <span className="scene-layout__crumb-sep" aria-hidden="true">
            /
          </span>

          {/* aria-current marks this as the page you are on, which is the
              machine-readable half of the orientation the brief asks for. */}
          <span className="scene-layout__crumb" aria-current="page">
            {route.label}
          </span>
        </nav>

        <div className="scene-layout__tools">
          <SoundControls compact />
          <SettingsTrigger compact />
        </div>
      </header>

      <main id="scene-main" className={`scene__body scene-layout__body ${bodyClassName ?? ''}`}>
        <div className="u-shell">
          {hideHeader ? null : (
            <header className="scene-header shared-hero">
              <p className="scene-header__eyebrow u-label">
                <Icon name="sparkle" size={13} />
                {route.labelEn}
              </p>
              <h1 className="scene-header__title">
                {route.title}
                <span className="scene-header__cn">{route.label}</span>
              </h1>
              <p className="scene-header__sub">{route.description}</p>
            </header>
          )}

          {children}
        </div>
      </main>

      <footer className="scene-layout__footer no-print">
        <div className="u-shell scene-layout__footer-inner">
          <span className="u-label">CAPTURE MOMENTS</span>
          <span className="scene-layout__footer-note">
            这是一个持续施工中的个人空间 · 示例内容均已标注
          </span>
        </div>
      </footer>
    </div>
  );
}
