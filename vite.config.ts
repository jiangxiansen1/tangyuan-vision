import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * htmlMetaPlugin — substitutes the {{TOKEN}} markers in index.html from the
 * content files at build time.
 *
 * WHY THIS IS A BUILD STEP AND NOT A RUNTIME WRITE
 * A client-rendered SPA can set its own <title> and meta tags at runtime, and
 * this project does exactly that per route (see useDocumentTitle). But a crawler
 * or link unfurler that does not execute JavaScript sees only the static shell —
 * so the shell itself must already carry the correct site-level metadata. Reading
 * it from src/content/data/settings.json means there is still exactly one source
 * of truth for the site's name and description.
 *
 * WHY `order: 'post'`: Vite's own HTML pipeline substitutes %VITE_*% tokens
 * during the pre/environment stage and warns about anything else that looks like
 * one. Running afterwards lets this plugin own its own markers cleanly, and the
 * doubled-brace form avoids colliding with Vite's syntax at all.
 */
function htmlMetaPlugin(): Plugin {
  /** Emits a build warning through the Vite plugin logger when available. */
  const warn = (message: string, ctx?: { warn?: (m: string) => void }): void => {
    if (ctx?.warn) ctx.warn(message);
    else console.warn(`[tv-html-meta] ${message}`);
  };

  const readJson = (rel: string): Record<string, unknown> => {
    try {
      return JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8'));
    } catch (err) {
      warn(`could not read ${rel}: ${(err as Error).message}`);
      return {};
    }
  };

  const subst = (html: string, tokens: Record<string, string>): string =>
    html.replace(/\{\{([A-Z_]+)\}\}/g, (match, key: string) => tokens[key] ?? match);

  return {
    name: 'tv-html-meta',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const settings = readJson('./src/content/data/settings.json');
        const title = String(settings.siteTitleSuffix ?? settings.siteTitle ?? '汤圆Vision');
        const description = String(settings.siteDescription ?? '');
        const themeColor = String(settings.themeColor ?? '#F4F6F8');
        const ogImage = String(settings.ogImage ?? '/assets/brand/logo-light.png');
        const keywords = Array.isArray(settings.keywords) ? settings.keywords.join(',') : '';

        // The inline shell needs three literal colours, not one. It paints before
        // the stylesheet exists, so it cannot reference a custom property — and a
        // single themeColor would leave the pre-stylesheet text and links with the
        // wrong contrast on a light ground.
        const shell = {
          SHELL_BG: themeColor,
          SHELL_FG: String(settings.shellForeground ?? '#161B22'),
          SHELL_MUTED: String(settings.shellMuted ?? '#5C6672'),
          SHELL_ACCENT: String(settings.shellAccent ?? '#1B83B8'),
        };

        const base = resolveBasePath();
        // The social image must be an absolute URL for unfurlers. Without a known
        // deployment origin we emit the base-relative path, which is the honest
        // best available answer rather than an invented domain.
        const ogUrl = ogImage.startsWith('http') ? ogImage : `${base.replace(/\/$/, '')}${ogImage}`;

        const out = subst(html, {
          SITE_TITLE: title,
          SITE_DESCRIPTION: description,
          THEME_COLOR: themeColor,
          OG_IMAGE: ogUrl,
          SITE_KEYWORDS: keywords,
          ...shell,
        });

        // Fail loudly rather than shipping a page titled "{{SITE_TITLE}}".
        const leftover = out.match(/\{\{[A-Z_]+\}\}/);
        if (leftover) warn(`unsubstituted token in index.html: ${leftover[0]}`, this);

        return out;
      },
    },
  };
}

/**
 * maplibreWorkerPlugin — ship MapLibre's web worker next to the bundle.
 *
 * THE FAILURE THIS PREVENTS, AND WHY IT IS INVISIBLE
 * MapLibre derives its worker URL from its OWN module filename:
 *
 *   let t = e.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs';
 *   let i = new URL(`./${t}`, e);
 *
 * In dev that resolves to the real file in node_modules and everything works. In a
 * production build Rollup bundles the library into `assets/vendor-maplibre-*.js`, so the
 * same expression looks for `assets/maplibre-gl-worker.mjs` — a file the build never
 * emits, because Rollup has no idea the string refers to an asset.
 *
 * The result is not a build error. The map renders its raster basemap perfectly, because
 * raster tiles are fetched on the main thread — and silently draws NO vector geometry at
 * all, because vector tiles are parsed in the worker. Measured on the production build:
 * `roads 0`, `place-city 0`, `water 0`. The same audit against the dev server reports
 * `roads 6383`, `water 103`, `place-city 8`.
 *
 * So this copies the worker into the output directory after the bundle is written. That
 * makes the relative URL resolve in both the dev server and the built site.
 */
function maplibreWorkerPlugin(): Plugin {
  return {
    name: 'tv-maplibre-worker',
    apply: 'build',
    writeBundle(options) {
      try {
        const outDir = options.dir ?? fileURLToPath(new URL('./dist', import.meta.url));
        const from = fileURLToPath(
          new URL('./node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url)
        );
        // The assets subdirectory is where the bundled chunk lands, so the worker must
        // sit beside it rather than at the output root.
        const to = join(outDir, 'assets', 'maplibre-gl-worker.mjs');
        mkdirSync(dirname(to), { recursive: true });
        copyFileSync(from, to);
        const kb = Math.round(statSync(to).size / 1024);
        console.log(`\n  [tv-maplibre-worker] copied maplibre-gl-worker.mjs -> assets/ (${kb} KB)`);
      } catch (err) {
        // Loud, because a missing worker removes all vector geometry without any other
        // symptom, and a silent skip here would look exactly like a working build.
        this.error(`could not copy the MapLibre worker: ${(err as Error).message}`);
      }
    },
  };
}

/**
 * GitHub Pages sub-path support.
 *
 * The public site is hosted from a project sub-path, so every emitted asset URL
 * must be prefixed. We deliberately do NOT hardcode the repository name — that
 * is not known yet — so the base is resolved in this order:
 *
 *   1. VITE_BASE_PATH           — explicit override, e.g. "/my-repo/"
 *   2. GITHUB_REPOSITORY        — set automatically inside GitHub Actions,
 *                                 e.g. "owner/TangyuanVision" -> "/TangyuanVision/"
 *   3. "/"                      — local dev and any root-hosted deploy
 *
 * A user/organisation Pages site (owner.github.io) must resolve to "/", which
 * the GITHUB_REPOSITORY branch handles automatically by detecting the
 * "<owner>.github.io" repository name.
 *
 * All runtime asset references in the app go through `import.meta.env.BASE_URL`
 * (see src/lib/asset.ts) so nothing depends on a leading "/" literal.
 */
function resolveBasePath(): string {
  const explicit = process.env.VITE_BASE_PATH?.trim();
  if (explicit) return explicit.endsWith('/') ? explicit : `${explicit}/`;

  const repo = process.env.GITHUB_REPOSITORY?.trim();
  if (repo && repo.includes('/')) {
    const [owner, name] = repo.split('/');
    if (name.toLowerCase() === `${owner.toLowerCase()}.github.io`) return '/';
    return `/${name}/`;
  }

  return '/';
}

export default defineConfig(({ mode }) => {
  const base = resolveBasePath();
  return {
    base,
    plugins: [react(), htmlMetaPlugin(), maplibreWorkerPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __BASE_PATH__: JSON.stringify(base),
    },
    /*
     * maplibre-gl MUST NOT be dependency-pre-bundled.
     *
     * This is a measured requirement, not a preference. Left in the default
     * `optimizeDeps` set, Vite rewrites the library through its dep optimizer, and
     * MapLibre's internal web worker then fails to start:
     *
     *   Error: Worker failed to load. Check that the worker URL is correct.
     *
     * The failure is quiet and misleading. The style document loads, raster tiles are
     * fetched (35 of them in the measured run) and the globe even appears — but the
     * worker is what parses VECTOR tiles, so `load` never fires, `data-status` stays
     * 'loading' forever, and the map never becomes interactive. It reads as "the map
     * is slow" rather than as an error, which is why it is worth stating here.
     *
     * Excluding it keeps the library on its own build, where the worker's blob URL is
     * correct.
     */
    optimizeDeps: {
      exclude: ['maplibre-gl'],
    },
    build: {
      target: 'es2022',
      cssTarget: 'chrome111',
      sourcemap: mode !== 'production',
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Route-level code splitting keeps the 3D engine out of the initial
          // payload; these manual chunks only separate vendored libraries that
          // are genuinely shared between lazily-loaded routes.
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('three')) return 'vendor-three';
            // MapLibre gets its own chunk because it is large (~290 KB gzip) and is
            // needed by exactly one route.
            if (id.includes('maplibre')) return 'vendor-maplibre';
            if (id.includes('motion') || id.includes('framer')) return 'vendor-motion';
            if (id.includes('react-router')) return 'vendor-router';
            if (id.includes('react')) return 'vendor-react';
            return undefined;
          },
        },
      },
    },
    server: {
      host: '127.0.0.1',
      port: 5183,
      strictPort: false,
    },
    preview: {
      host: '127.0.0.1',
      port: 4183,
      strictPort: false,
    },
  };
});
