/**
 * diagnostics.ts — runtime error visibility.
 *
 * WHY THIS EXISTS IN THE APPLICATION, NOT ONLY IN A TEST HARNESS
 * A site built out of WebGL, SVG filters, backdrop-filter and a boot sequence has
 * a lot of ways to fail quietly in a specific browser: a shader that will not
 * compile, a filter the engine refuses, an audio context that will not start.
 * Those failures do not throw into the console in a way anyone sees, and they are
 * exactly the ones worth knowing about. So the app records them.
 *
 * WHAT IT DOES
 *   • Captures uncaught errors and unhandled promise rejections.
 *   • Records the environment facts that decide which degradation paths run
 *     (WebGL availability, backdrop-filter support, reduced-motion, DPR).
 *   • Publishes them to a hidden DOM node so any tool — a human in devtools, or
 *     the headless browser checker — can read the real state of a running page.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   • No network reporting, no analytics, no third-party endpoint. Nothing leaves
 *     the page.
 *   • No user-visible error UI. A caught error must not interrupt browsing; it is
 *     recorded and the site continues on its degradation path.
 *
 * It is active in development always, and in production only when explicitly
 * asked for with `?diag=1`, so a normal visitor gets no extra DOM.
 */

export interface DiagnosticsReport {
  errors: string[];
  environment: Record<string, string>;
  features: Record<string, boolean>;
  build: { mode: string; base: string };
}

const errors: string[] = [];
const MAX_ERRORS = 25;

function note(kind: string, message: string): void {
  if (errors.length >= MAX_ERRORS) return;
  errors.push(`${kind}: ${message}`);
  render();
}

/* ------------------------------------------------------------- detection */

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return false;
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function collectEnvironment(): Record<string, string> {
  const n = navigator as Navigator & { deviceMemory?: number };
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: String(window.devicePixelRatio),
    hardwareConcurrency: String(n.hardwareConcurrency ?? 'unknown'),
    deviceMemory: String(n.deviceMemory ?? 'unknown'),
    colorScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    reducedMotion: String(window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    reducedTransparency: String(window.matchMedia('(prefers-reduced-transparency: reduce)').matches),
    locale: document.documentElement.lang || 'unset',
  };
}

function collectFeatures(): Record<string, boolean> {
  return {
    webgl: detectWebGL(),
    backdropFilter:
      CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)'),
    // The refractive tier depends on url() inside backdrop-filter, which is the
    // least portable part of the whole design, so it is probed separately.
    backdropFilterUrl: CSS.supports('backdrop-filter', 'url(#x)'),
    maskComposite: CSS.supports('mask-composite', 'exclude') || CSS.supports('-webkit-mask-composite', 'xor'),
    containerQueries: CSS.supports('container-type', 'inline-size'),
    audioContext: typeof window.AudioContext !== 'undefined',
    intersectionObserver: typeof IntersectionObserver !== 'undefined',
    resizeObserver: typeof ResizeObserver !== 'undefined',
    // @property is what lets the boot sequence's mask sweep interpolate; without
    // it the sweep snaps instead of animating.
    atProperty: 'registerProperty' in CSS,
  };
}

/* -------------------------------------------------------------- publish */

function node(): HTMLElement {
  let el = document.getElementById('tv-diagnostics');
  if (!el) {
    el = document.createElement('script');
    el.id = 'tv-diagnostics';
    el.setAttribute('type', 'application/json');
    document.head.appendChild(el);
  }
  return el;
}

function render(): void {
  try {
    const report: DiagnosticsReport = {
      errors,
      environment: collectEnvironment(),
      features: collectFeatures(),
      build: {
        mode: import.meta.env.MODE,
        base: import.meta.env.BASE_URL,
      },
    };
    node().textContent = JSON.stringify(report);
  } catch {
    /* Diagnostics must never be the thing that breaks the page. */
  }
}

/** Whether diagnostics should be active for this page load. */
export function diagnosticsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return new URLSearchParams(window.location.search).has('diag');
  } catch {
    return false;
  }
}

/**
 * Install the listeners. Called once from main.tsx, before React mounts, so an
 * error thrown during module evaluation is still captured.
 */
export function installDiagnostics(): void {
  window.addEventListener('error', (e) => {
    if (e.message) {
      note('error', `${e.message} @ ${e.filename || '?'}:${e.lineno || 0}:${e.colno || 0}`);
    } else if (e.target instanceof HTMLElement) {
      const src =
        (e.target as HTMLImageElement).src ||
        (e.target as HTMLAnchorElement).href ||
        e.target.tagName;
      note('resource', `${e.target.tagName} failed to load: ${src}`);
    }
  }, true);

  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string } | string | undefined;
    note('unhandledrejection', typeof reason === 'string' ? reason : (reason?.message ?? String(reason)));
  });

  // Mark the moment the app is interactive, which is what a perf check needs to
  // distinguish "slow" from "broken".
  window.addEventListener('load', () => {
    const mark = document.getElementById('tv-diagnostics');
    if (mark) mark.setAttribute('data-load', String(Math.round(performance.now())));
  });

  render();
}

/** Exposed so a caller that recovers from an error can record it too. */
export function reportError(kind: string, message: string): void {
  note(kind, message);
}
