/**
 * HomePage — the vertical scene narrative (P2 structural correction).
 *
 * ONE THEME, ONE FULL-SCREEN SCENE, ONE VISUAL CENTRE
 * ===================================================
 * The P2 explore band collapsed four themes into one content area. That is the
 * defect this revision removes. The page is now a single vertical narrative of
 * five independent full-screen scenes, in the order docs/scene-architecture.md
 * defines:
 *
 *   01  the brand stage   — 汤圆Vision / 汤圆视界 / the CMS statement / hint
 *   02  EarthScene        — the live globe IS the scene
 *   03  PhotoScene        — the photograph mosaic IS the scene
 *   04  CreateScene       — lab notes, projects, the hardware empty state
 *   05  ContactScene      — the contact cards, in liquid glass
 *
 * Each scene owns its 100svh room, its eyebrow/title/lede from the single route
 * registry, and a glass CTA into its full route experience (/earth, /photography,
 * /lab + /projects, /contact). Nothing is crammed, nothing is a card in someone
 * else's scene. Sub-pages that are not main scenes (about / journal / riding)
 * keep their quiet text-weight row above the footer, plus the hidden signal.
 *
 * PRESERVED FROM P2: the boot handoff (data-entered), the scroll hint and its
 * scroll-away, the rail gutter, the backdrop and particle layers, keyboard
 * single-letter shortcuts (App level), and every accessibility affordance.
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND, SETTINGS } from '@/content';
import { NAVIGABLE_ROUTES, routeByKey, type SceneRoute } from '@/app/routes';
import { Logo } from '@/components/brand/Logo';
import { SceneIcon } from '@/components/ui/Icon';
import { SoundControls } from '@/components/audio/SoundControls';
import { SettingsTrigger } from '@/components/settings/SettingsTrigger';
import { useSecretEntry } from '@/hooks/useSecretEntry';
import { useSceneWheel } from '@/hooks/useSceneWheel';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useUIStore } from '@/store/useUIStore';
import { playSfx } from '@/store/useSoundStore';
import { BrandCore } from './BrandCore';
import { VisionBackdrop } from './VisionBackdrop';
import { CursorField } from './CursorField';
import { SecretSignal } from './SecretSignal';
import { EarthScene } from './scenes/EarthScene';
import { PhotoScene } from './scenes/PhotoScene';
import { CreateScene } from './scenes/CreateScene';
import { ContactScene } from './scenes/ContactScene';
import './home.css';

/** Sub-pages that are not main scenes; kept as quiet links, never deleted. */
const QUIET_IDS = ['about', 'journal', 'riding'] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const pushToast = useUIStore((s) => s.pushToast);
  const interacted = useUIStore((s) => s.interacted);
  const markInteracted = useUIStore((s) => s.markInteracted);
  const bootVisible = useUIStore((s) => s.bootVisible);
  const { enter: enterSecret } = useSecretEntry();

  /** One wheel gesture = one scene on desktop; touch keeps native scrolling.
      The controller ignores inputs and inner scroll regions, and the earth
      preview surrenders its wheel zoom (preview prop) so the two never fight. */
  useSceneWheel({
    sceneSelector: '.vhome__stage, .vscene',
    rootSelector: '.vhome',
    enabled: true,
  });

  const [entered, setEntered] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useDocumentTitle({
    title: '',
    description: SETTINGS.siteDescription,
    image: SETTINGS.ogImage,
    path: '/',
  });

  const quiet = NAVIGABLE_ROUTES.filter((r) =>
    (QUIET_IDS as readonly string[]).includes(r.id as string)
  );

  /** The stage rises once the boot overlay is gone; when the boot never runs,
      bootVisible is already false at mount and the stage animates in on load. */
  useEffect(() => {
    if (bootVisible) return;
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, [bootVisible]);

  /** The scroll hint earns its place by leaving once it has been obeyed. */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (interacted) return;
    const once = () => markInteracted();
    window.addEventListener('pointerdown', once, { once: true, passive: true });
    window.addEventListener('keydown', once, { once: true });
    return () => {
      window.removeEventListener('pointerdown', once);
      window.removeEventListener('keydown', once);
    };
  }, [interacted, markInteracted]);

  const open = useCallback(
    (route: SceneRoute) => {
      playSfx('open');
      navigate(route.path);
    },
    [navigate]
  );

  /** Single-letter scene shortcuts still work while focus is on the home page. */
  const onSceneKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const route = routeByKey(e.key);
        if (route) {
          e.preventDefault();
          open(route);
        }
      }
    },
    [open]
  );

  return (
    <div
      className="scene vhome"
      data-scene="home"
      data-entered={entered || undefined}
      data-scrolled={scrolled || undefined}
      onKeyDown={onSceneKeyDown}
    >
      <VisionBackdrop />
      <CursorField />

      <a className="skip-link" href="#scene-earth">
        跳到地球场景 <span className="skip-link__en">Skip to Earth scene</span>
      </a>

      {/* ------------------------------------------------------------ chrome -- */}
      <header className="vhome__chrome no-print">
        <div className="vhome__brand-mark">
          <Logo height={26} decorative />
          <span className="vhome__brand-name">{BRAND.brandFull}</span>
        </div>
        <div className="vhome__tools">
          <SoundControls compact />
          <SettingsTrigger compact />
        </div>
      </header>

      {/* ============================================= 01 · the brand stage -- */}
      <section className="vhome__stage" aria-label="汤圆Vision">
        <div className="vhome__stage-inner">
          <p className="vhome__eyebrow u-label">
            <span className="vhome__eyebrow-rule" aria-hidden="true" />
            {BRAND.logoLine}
          </p>
          <BrandCore variant="full" />
        </div>

        <p className="vhome__scroll-hint" aria-hidden="true">
          <span className="vhome__scroll-text">
            向下探索
            <span className="vhome__scroll-en">SCROLL</span>
          </span>
          <span className="vhome__scroll-line" />
        </p>
      </section>

      {/* =========================== 02–05 · one full-screen scene per theme -- */}
      <EarthScene />
      <PhotoScene />
      <CreateScene />
      <ContactScene />

      {/* ------------------------------------- quiet row: sub-pages, not scenes -- */}
      <nav className="vhome__quiet" aria-label="更多入口">
        <ul className="vhome__quiet-list">
          {quiet.map((route) => (
            <li key={route.id}>
              <button type="button" className="vhome__quiet-link" onClick={() => open(route)}>
                <SceneIcon scene={route.id} size={15} />
                <span>{route.label}</span>
                <span className="vhome__quiet-en">{route.labelEn}</span>
              </button>
            </li>
          ))}
          {SETTINGS.secretEnabled ? (
            <SecretSignal onEnter={() => enterSecret('signal')} onFocus={() => undefined} />
          ) : null}
        </ul>
      </nav>

      <footer className="vhome__footer no-print">
        <button
          type="button"
          className="vhome__index-toggle"
          onClick={() => pushToast('五个主场景沿垂直叙事排列；每个入口都对应一个专题页。', 'info')}
        >
          <SceneIcon scene="projects" size={14} />
          <span>空间索引</span>
        </button>
        <span className="vhome__footer-note">{BRAND.logoLine} · 示例内容均已标注</span>
      </footer>
    </div>
  );
}
