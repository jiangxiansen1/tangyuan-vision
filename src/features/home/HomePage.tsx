/**
 * HomePage — the spatial hub.
 *
 * V4 LAYOUT: ONE ROW, THREE COLUMNS
 *
 *   ┌──────────────┬─────────────────┬──────────────┐
 *   │  摄影        │   汤圆Vision    │  地球        │
 *   │  PHOTOGRAPHY │   汤圆视界      │  EARTH ONLINE│
 *   │  (主窗口)    │  A WORLD BEYOND │  (主窗口)    │
 *   │              │  THE FRAME      │              │
 *   └──────────────┴─────────────────┴──────────────┘
 *          ↓ smaller secondary entries ↓
 *
 * WHY THIS REPLACES THE V3 STACK
 * V3 put the brand in its own band ABOVE a two-up window grid. The brief calls
 * that out: the brand must sit genuinely BETWEEN the two windows, so the three
 * read as one composition rather than a title with cards underneath. A three-track
 * grid does that structurally — the brand is a sibling of the windows, not a
 * header for them, so it cannot drift above them at any width.
 *
 * The three tracks are deliberately unequal (the windows are wider than the brand
 * column) because the windows are the interactive surfaces and the brand is the
 * anchor. Equal thirds would make the brand compete with the things you can click.
 *
 * THE THREE TIERS OF WEIGHT
 *   1. the two core windows — large, glass, previewed, the only things with tilt
 *   2. Lab and Projects — compact windows, no tilt, no preview stack
 *   3. About / Journal / Contact / hidden — text-weight links, no surface at all
 *
 * ACCESSIBILITY
 *   • The core pair is a real list of real buttons; arrow keys rove across them.
 *   • Every destination is also a plain link below, so orientation never depends
 *     on reading the spatial layout.
 *   • The brand is an h1 carrying the full name once, for screen readers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRAND, SETTINGS } from '@/content';
import { NAVIGABLE_ROUTES, routeByKey, type SceneRoute, type SceneId } from '@/app/routes';
import { Logo } from '@/components/brand/Logo';
import { SceneIcon } from '@/components/ui/Icon';
import { SoundControls } from '@/components/audio/SoundControls';
import { SettingsTrigger } from '@/components/settings/SettingsTrigger';
import { useSecretEntry } from '@/hooks/useSecretEntry';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { useSceneStore } from '@/store/useSceneStore';
import { useUIStore } from '@/store/useUIStore';
import { playSfx } from '@/store/useSoundStore';
import { BrandCore } from './BrandCore';
import { VisionBackdrop } from './VisionBackdrop';
import { CursorField } from './CursorField';
import { CoreWindow } from './CoreWindow';
import { MiniWindow } from './MiniWindow';
import { SecretSignal } from './SecretSignal';
import './home.css';

/** The two windows that carry the site. */
const CORE_IDS = ['photography', 'earth'] as const;
/** Compact windows. */
const MINI_IDS = ['lab', 'projects'] as const;
/** Quiet, text-weight links. */
const QUIET_IDS = ['about', 'journal', 'contact'] as const;

export default function HomePage() {
  const navigate = useNavigate();
  const { focusIndex, setFocusIndex, setWindowCount, moveFocus, reset } = useSceneStore();
  const pushToast = useUIStore((s) => s.pushToast);
  const interacted = useUIStore((s) => s.interacted);
  const markInteracted = useUIStore((s) => s.markInteracted);
  const { enter: enterSecret } = useSecretEntry();

  const rowRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);

  useDocumentTitle({
    title: '',
    description: SETTINGS.siteDescription,
    image: SETTINGS.ogImage,
    path: '/',
  });

  const { core: coreWindows, mini: miniWindows, quiet: quietWindows } = useMemo(() => {
    const byId = new Map<string, SceneRoute>(NAVIGABLE_ROUTES.map((r) => [r.id as string, r]));
    const pick = (ids: readonly SceneId[]) =>
      ids.map((id) => byId.get(id)).filter((r): r is SceneRoute => Boolean(r));
    return { core: pick(CORE_IDS), mini: pick(MINI_IDS), quiet: pick(QUIET_IDS) };
  }, []);

  /**
   * Focus roving spans only the two core windows.
   *
   * Including the compact pair would make arrow-key navigation walk four stops of
   * unequal weight, which is worse than letting Tab reach the smaller links.
   */
  useEffect(() => {
    setWindowCount(coreWindows.length);
    return () => reset();
  }, [coreWindows.length, setWindowCount, reset]);

  useEffect(() => {
    const measure = () => {
      const el = rowRef.current;
      if (!el) return;
      const cols = getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length;
      setColumns(Math.max(1, cols));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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

  const onRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          moveFocus(1, columns);
          return;
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          moveFocus(-1, columns);
          return;
        case 'Home':
          e.preventDefault();
          setFocusIndex(0);
          return;
        case 'End':
          e.preventDefault();
          setFocusIndex(coreWindows.length - 1);
          return;
        default:
          break;
      }
      if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const route = routeByKey(e.key);
        if (route) {
          e.preventDefault();
          open(route);
        }
      }
    },
    [columns, coreWindows.length, moveFocus, open, setFocusIndex]
  );

  useEffect(() => {
    if (focusIndex < 0) return;
    const nodes = rowRef.current?.querySelectorAll<HTMLElement>('[data-window]');
    nodes?.[focusIndex]?.focus({ preventScroll: false });
  }, [focusIndex]);

  const [left, right] = coreWindows;

  return (
    <div className="scene vhome" data-scene="home">
      <VisionBackdrop />

      {/* The spatial particle field. It sits ABOVE the backdrop and BELOW the
          content, so motes drift BEHIND the glass panes — which is also what gives
          the material something moving to refract. It is `pointer-events: none`
          and therefore cannot interfere with either core window. */}
      <CursorField />

      <a className="skip-link" href="#core-windows">
        跳到核心窗口 <span className="skip-link__en">Skip to windows</span>
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

      {/* ============================== THE ONE ROW: window · brand · window ==
          A single grid with three tracks. The brand is a sibling of the two
          windows, which is what guarantees it sits BETWEEN them rather than
          above them, at any viewport width. */}
      <main className="vhome__row" ref={rowRef} onKeyDown={onRowKeyDown} id="core-windows">
        <h2 className="visually-hidden">核心空间</h2>

        <ul className="vhome__slot vhome__slot--left">
          {left ? (
            <CoreWindow
              route={left}
              side="left"
              onOpen={() => open(left)}
              onFocus={() => setFocusIndex(0)}
            />
          ) : null}
        </ul>

        {/* The brand column. Not a card, and deliberately not wrapped in a
            surface — see BrandCore for why. */}
        <section className="vhome__axis" aria-label="品牌">
          <BrandCore variant="full" />
        </section>

        <ul className="vhome__slot vhome__slot--right">
          {right ? (
            <CoreWindow
              route={right}
              side="right"
              onOpen={() => open(right)}
              onFocus={() => setFocusIndex(1)}
            />
          ) : null}
        </ul>

        <p className="visually-hidden" role="status" aria-live="polite">
          {focusIndex >= 0 && focusIndex < coreWindows.length
            ? `当前窗口：${coreWindows[focusIndex].label}。按回车打开。`
            : ''}
        </p>
      </main>

      {/* -------------------------------------------------- secondary tier -- */}
      <section className="vhome__mini" aria-labelledby="mini-label">
        <h2 id="mini-label" className="u-label vhome__section-label">
          继续探索 / EXPLORE FURTHER
        </h2>
        <ul className="vhome__mini-grid">
          {miniWindows.map((route) => (
            <MiniWindow key={route.id} route={route} onOpen={() => open(route)} />
          ))}
        </ul>
      </section>

      {/* ------------------------------------------------------ quiet tier -- */}
      <nav className="vhome__quiet" aria-label="更多入口">
        <ul className="vhome__quiet-list">
          {quietWindows.map((route) => (
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
          onClick={() => pushToast('这个页面本身就是完整的索引：每个入口都对应一个专题页。', 'info')}
        >
          <SceneIcon scene="projects" size={14} />
          <span>空间索引</span>
        </button>
        <span className="vhome__footer-note">{BRAND.logoLine} · 示例内容均已标注</span>
      </footer>
    </div>
  );
}
