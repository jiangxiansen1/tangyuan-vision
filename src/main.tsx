import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { restoreDeepLink } from './lib/deepLink';
import { diagnosticsEnabled, installDiagnostics } from './lib/diagnostics';
import './styles/index.css';
import './styles/globals.css';

/**
 * Entry point.
 *
 * BrowserRouter (the HTML5 history API) rather than HashRouter, because the
 * brief requires directly-addressable scene URLs that read normally. That choice
 * obliges us to handle the GitHub Pages deep-link problem, and the two halves of
 * the fix are:
 *
 *   1. public/404.html   — catches the host-level 404 and rewrites the path into
 *                          a query form, preserving the deploy base.
 *   2. restoreDeepLink()  — below, restores the clean path BEFORE the router is
 *                          created, so the address bar shows the real URL.
 *
 * See docs/DEPLOYMENT.md for verification steps.
 */

// Must run before the router is instantiated: it rewrites the URL in place.
restoreDeepLink();

/*
 * START AT THE TOP, ALWAYS.
 *
 * The home page is a narrative of five full-viewport scenes (01 hub -> 02 earth
 * -> 03 photography -> 04 create -> 05 contact). With the browser's default
 * `scrollRestoration: 'auto'`, a reload or a revisit of the same URL restores the
 * previous scroll offset — so a visitor who had scrolled to the earth and came
 * back later was dropped straight onto the SECOND screen, with the hub they
 * expected nowhere in sight. Measured: scroll to 900, reload, still 900.
 *
 * 'manual' makes the browser stop restoring, and the document starts at 0.
 * In-app navigation is unaffected: RouteTransition already scrolls to the top on
 * every route change, so this only removes the one behaviour nobody wanted.
 */
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Installed before React mounts so an error thrown while a module evaluates is
// still captured. Active in development, and in production only with ?diag=1.
if (diagnosticsEnabled()) installDiagnostics();

const container = document.getElementById('root');

if (!container) {
  // If the shell is missing there is nothing to render into; say so plainly
  // rather than throwing into a blank page.
  document.body.innerHTML =
    '<p style="font:14px/1.6 system-ui;color:#e8ecf2;background:#05070a;padding:24px">' +
    '应用挂载点 #root 不存在，index.html 可能已被修改。' +
    '</p>';
} else {
  createRoot(container).render(
    <StrictMode>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}
