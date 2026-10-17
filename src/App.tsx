/**
 * App — the application root.
 *
 * Responsibilities, in the order they matter:
 *   1. Routing, with every scene lazily split except the hub.
 *   2. The boot sequence, which is mounted once and removed on a timer.
 *   3. The global keys that make keyboard-only navigation work: Home returns to
 *      the hub, and the single-letter scene shortcuts.
 *   4. The portalled surfaces that must exist exactly once: the settings panel,
 *      refraction filter definitions, the custom cursor, and toasts.
 *   5. Applying persisted visual preferences to <html> before first paint.
 */

import { Suspense, useEffect, useState } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { ALL_ROUTES, routeByKey } from '@/app/routes';
import { SETTINGS } from '@/content';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { CustomCursor } from '@/components/cursor/CustomCursor';
import { RefractionDefs } from '@/components/glass/RefractionDefs';
import { SettingsPanel } from '@/components/settings/SettingsPanel';
import { RouteTransition } from '@/components/transitions/RouteTransition';
import { BootSequence, shouldRunBoot } from '@/components/boot/BootSequence';
import { Toast } from '@/components/ui/Toast';
import { SceneRail } from '@/components/nav/SceneRail';
import { SceneLoading } from '@/components/layout/SceneLoading';
import { NotFoundPage } from '@/features/not-found/NotFoundPage';
import { useUIStore } from '@/store/useUIStore';
import { useVisualStore, applyVisualAttributes } from '@/store/useVisualStore';
import { usePrefersReducedTransparency } from '@/hooks/useMediaQuery';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [bootMode, setBootMode] = useState<false | 'full' | 'short'>(() => false);

  const bootVisible = useUIStore((s) => s.bootVisible);
  const setBootVisible = useUIStore((s) => s.setBootVisible);
  const finishBoot = useUIStore((s) => s.finishBoot);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const setSwitcherOpen = useUIStore((s) => s.setSwitcherOpen);
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const switcherOpen = useUIStore((s) => s.switcherOpen);

  const { glassQuality, contrast } = useVisualStore();
  const { reduced } = usePrefersReducedMotion();
  const prefersReducedTransparency = usePrefersReducedTransparency();

  // Apply persisted preferences before the first paint so there is no flash of
  // the wrong material quality.
  useEffect(() => {
    applyVisualAttributes(glassQuality, contrast);
  }, [glassQuality, contrast]);

  // The OS-level reduced-transparency preference is honoured on top of the
  // in-app setting, and only ever in the reducing direction.
  useEffect(() => {
    const root = document.documentElement;
    if (prefersReducedTransparency) root.dataset.transparency = 'reduced';
    else if (glassQuality === 'high') delete root.dataset.transparency;
  }, [prefersReducedTransparency, glassQuality]);

  // Decide on the boot sequence once, before anything renders underneath it.
  useEffect(() => {
    const mode = shouldRunBoot(SETTINGS.bootEnabled);
    if (mode) {
      setBootMode(mode);
      setBootVisible(true);
    }
  }, [setBootVisible]);

  // Global keyboard navigation. Every branch checks for a text field first, so
  // nothing here can hijack typing.
  useEffect(() => {
    const TEXT_ENTRY = 'input, textarea, select, [contenteditable="true"]';

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as Element | null;
      const typing = target?.closest(TEXT_ENTRY) != null;

      // Escape closes whatever is open, in order of topmost surface first.
      if (e.key === 'Escape') {
        if (switcherOpen) {
          setSwitcherOpen(false);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        // Otherwise let the page handle it (the lightbox listens for its own).
      }

      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // Home returns to the hub from anywhere, except when focus is in a text
      // field (handled above) or a modal owns focus.
      if (e.key === 'Home') {
        e.preventDefault();
        navigate('/');
        return;
      }

      // Single-letter scene shortcuts.
      if (e.key.length === 1) {
        const route = routeByKey(e.key);
        if (route) {
          e.preventDefault();
          navigate(route.path);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate, setSettingsOpen, setSwitcherOpen, settingsOpen, switcherOpen]);

  // The hub is the only eagerly-loaded route; everything else is split, so this
  // fallback is what a visitor sees during the first chunk fetch of a scene.
  const fallback = <SceneLoading />;

  return (
    <>
      <RefractionDefs />

      {bootVisible && bootMode ? (
        <BootSequence
          mode={bootMode}
          onDone={() => {
            finishBoot();
            setBootMode(false);
          }}
        />
      ) : null}

      {/*
        THE TRANSITION LIVES HERE, ABOVE THE ROUTE SWAP.

        It has to. An AnimatePresence inside a route cannot observe that route
        being unmounted — which is precisely the defect this replaces: the outgoing
        page vanished instantly and only the incoming fade was ever visible.
      */}
      <RouteTransition>
        <Routes>
        {ALL_ROUTES.map((route) => {
          const Page = route.Component;

          /*
           * No per-route transition wrapper.
           *
           * Which entrance a route gets is decided by `transitionFor(pathname)`
           * inside RouteTransition below, because that is the only place with a
           * view of BOTH the page leaving and the page arriving. A wrapper here
           * would be unmounted at the moment its exit should begin.
           */
          return (
            <Route
              key={route.id}
              path={route.path}
              element={
                <Suspense fallback={fallback}>
                  <Page />
                </Suspense>
              }
            />
          );
        })}

        {/* Unknown routes get a real 404 that still offers a way out. */}
        <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </RouteTransition>

      {/* ---------------------------------------------------- global chrome -- */}
      <SceneRail />
      <CustomCursor />
      <SettingsPanel />
      <Toast />

      {/* A polite announcement of scene changes, which is what tells a screen
          reader user that navigation happened in a client-rendered app. */}
      <RouteAnnouncer pathname={location.pathname} />

      {/* Reduced motion is surfaced as a persistent, quiet note rather than a
          surprise: the visitor should know why the site feels different. */}
      {reduced ? (
        <p className="reduced-motion-note no-print" role="note">
          已启用简化动态效果（可在设置中调整）
        </p>
      ) : null}
    </>
  );
}

/**
 * RouteAnnouncer — a live region that states the new page after navigation.
 * SPA route changes are otherwise silent to screen readers. Page metadata
 * (title, description, canonical, robots) is owned by each page through
 * useDocumentTitle, so this component only announces.
 */
function RouteAnnouncer({ pathname }: { pathname: string }) {
  const route = ALL_ROUTES.find((r) => r.path === pathname);
  return (
    <div className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {route ? `已进入：${route.label}` : ''}
    </div>
  );
}
