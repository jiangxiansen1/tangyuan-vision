/**
 * verify-deeplink.cjs — prove the GitHub Pages deep-link fallback works.
 *
 * THE PROBLEM BEING TESTED
 * GitHub Pages is a static host with no rewrite rules: requesting a path with no
 * file returns the contents of 404.html WITH an HTTP 404 status. The app's
 * fallback then has to rewrite that path into a query form and hand it to the
 * entry document, where src/lib/deepLink.ts restores the real URL.
 *
 * Each half is verified in the way it actually runs:
 *
 *   1. HOST BEHAVIOUR (Node)
 *      A server that mimics Pages exactly — unknown path => 404.html with status
 *      404. This proves dist/404.html is published and contains the base-
 *      derivation logic, which is the part that breaks on sub-path deploys.
 *
 *   2. BROWSER ROUND TRIP (headless Chromium)
 *      The real redirect is a client-side script, so reading the static HTML
 *      proves nothing about it. A real browser loads the deep URL, the fallback
 *      runs, and we assert on the FINAL URL and the RENDERED page: the address
 *      bar must show the clean path (no "?/" left) and the scene must have
 *      actually rendered.
 *
 * Usage:
 *   node tools/verify-deeplink.cjs                       # host behaviour only
 *   node tools/verify-deeplink.cjs --browser             # + browser round trip
 */

'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const DIST = path.resolve(__dirname, '..', 'dist');
const BASE = process.env.VERIFY_BASE || '/';
const PORT = Number(process.env.VERIFY_PORT || 4199);
const WITH_BROWSER = process.argv.includes('--browser');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.ico': 'image/x-icon',
};

/* ------------------------------------------------------- fake Pages host */

function resolveFile(urlPath) {
  let rel = urlPath;
  if (BASE !== '/') {
    if (!rel.startsWith(BASE)) return null;
    rel = rel.slice(BASE.length);
  }
  rel = decodeURIComponent(rel.split('?')[0].split('#')[0]);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';

  const abs = path.resolve(DIST, rel);
  if (!abs.startsWith(DIST)) return null;
  return fs.existsSync(abs) && fs.statSync(abs).isFile() ? abs : null;
}

function createHost() {
  return http.createServer((req, res) => {
    const file = resolveFile(req.url);
    if (!file) {
      const notFound = path.join(DIST, '404.html');
      if (fs.existsSync(notFound)) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(notFound));
      } else {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('no dist/404.html');
      }
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

/* ------------------------------------------------------------ browser */

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
];

function findBrowser() {
  for (const b of BROWSERS) if (fs.existsSync(b)) return b;
  return null;
}

function findPowerShell() {
  const c = [
    process.env.PWSH_PATH,
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : null,
    '/usr/bin/pwsh',
  ].filter(Boolean);
  for (const x of c) if (fs.existsSync(x)) return x;
  return null;
}

/**
 * Load a URL in a real browser and report the final URL plus the rendered state.
 *
 * ASYNC ON PURPOSE. The test server runs in this same Node process, so launching
 * the browser with spawnSync would block the event loop for the whole page load —
 * the browser would ask for the page and the server could never answer. Awaiting
 * an async spawn leaves the loop free to serve the requests.
 */
function browserProbe(url, name) {
  const browser = findBrowser();
  const shell = findPowerShell();
  if (!browser || !shell) return Promise.resolve(null);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-deep-'));
  const outFile = path.join(tmp, 'dom.html');
  const errFile = path.join(tmp, 'err.txt');

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-http-cache',
    '--user-data-dir=' + path.join(tmp, 'p'),
    '--virtual-time-budget=9000',
    '--dump-dom',
    url,
  ];

  const quoted = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
  const script =
    `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
    `-PassThru -NoNewWindow -RedirectStandardOutput '${outFile.replace(/'/g, "''")}' ` +
    `-RedirectStandardError '${errFile.replace(/'/g, "''")}'; if (-not $p.WaitForExit(120000)) { $p.Kill() }`;
  const sp = path.join(tmp, 'run.ps1');
  fs.writeFileSync(sp, script, 'utf8');

  return new Promise((resolve) => {
    const child = spawn(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], {
      stdio: 'ignore',
    });
    child.on('exit', () => {
      const dom = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : '';
      const canonical = (dom.match(/<link rel="canonical" href="([^"]*)"/) || [, ''])[1];
      resolve({
        dom,
        canonical,
        glass: (dom.match(/class="glass/g) || []).length,
        title: (dom.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [, ''])[1].trim(),
        textLen: dom.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length,
        name,
      });
    });
    child.on('error', () => resolve(null));
  });
}

/* ------------------------------------------------------------------ main */

(async () => {
  const server = createHost();
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const origin = `http://127.0.0.1:${PORT}`;

  console.log(`simulating GitHub Pages — base="${BASE}"  origin=${origin}\n`);

  /**
   * Guard against testing the wrong artifact.
   *
   * The deploy base is baked into the build. If dist/ was produced with a
   * different base than this run is simulating, every deep-link assertion fails
   * for a reason that has nothing to do with the fallback — the app would
   * restore "/photography" while the server is mounted at "/TangyuanVision/".
   * So the mismatch is detected up front and reported as a setup error.
   */
  const indexHtml = path.join(DIST, 'index.html');
  if (!fs.existsSync(indexHtml)) {
    console.error('FATAL: dist/index.html not found. Run the build first.');
    process.exit(2);
  }
  const builtBase = (() => {
    const m = fs.readFileSync(indexHtml, 'utf8').match(/(?:src|href)="(\/[^"]*?\/)assets\//);
    return m ? m[1] : '/';
  })();

  if (builtBase !== BASE) {
    console.error(
      `FATAL: dist/ was built with base "${builtBase}" but this run simulates "${BASE}".\n` +
        `       Rebuild with the matching base, e.g.:\n` +
        `         VITE_BASE_PATH=${BASE} pnpm build\n` +
        `       (A mismatch would fail every deep-link assertion for the wrong reason.)`
    );
    server.close();
    process.exit(2);
  }

  let pass = 0;
  let fail = 0;

  /* ---- part 1: host behaviour ---- */
  console.log('--- host behaviour (what GitHub Pages does with no rewrites) ---');
  const hostCases = [
    { label: 'base root', p: BASE, expect404: false },
    { label: 'deep scene', p: `${BASE}photography`, expect404: true },
    { label: 'hidden space', p: `${BASE}the-quiet-space`, expect404: true },
    { label: 'unknown path', p: `${BASE}not-a-route`, expect404: true },
  ];

  for (const c of hostCases) {
    const res = await fetch(`${origin}${c.p}`);
    const body = await res.text();
    const is404 = res.status === 404;
    const fallbackServed = is404 && body.includes('tv-diagnostics') === false && body.includes('location.replace');
    const ok = c.expect404 ? is404 && fallbackServed : res.status === 200 && body.includes('id="root"');

    console.log(
      `${ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(13)} ${String(res.status).padEnd(4)} ` +
        `${c.expect404 ? '→ 404.html served' : '→ index.html served'}`
    );
    if (ok) pass++;
    else fail++;
  }

  /* ---- part 2: browser round trip ---- */
  if (WITH_BROWSER) {
    console.log('\n--- browser round trip (the fallback actually running) ---');
    const browser = findBrowser();
    if (!browser) {
      console.log('SKIP  no browser available');
    } else {
      const cases = [
        { label: 'photography', p: `${BASE}photography`, expect: '摄影' },
        { label: 'riding', p: `${BASE}riding`, expect: '摩旅' },
        { label: 'journal', p: `${BASE}journal`, expect: '随笔' },
      ];

      for (const c of cases) {
        const r = await browserProbe(`${origin}${c.p}`, c.label);
        if (!r) {
          console.log(`SKIP  ${c.label}`);
          continue;
        }

        // The restored canonical URL must be the clean deep path, with the base
        // preserved and no "?/" residue.
        const expectedPath = c.p.replace(/\/$/, '');
        const canonicalOk = r.canonical.includes(expectedPath) && !r.canonical.includes('?/');
        const rendered = r.glass > 0 && r.textLen > 500;
        const sceneOk = r.dom.includes(c.expect);

        const ok = canonicalOk && rendered && sceneOk;
        console.log(
          `${ok ? 'PASS' : 'FAIL'}  ${c.label.padEnd(13)} url restored:${canonicalOk ? 'yes' : 'NO'} ` +
            `scene rendered:${rendered ? 'yes' : 'NO'} expected text:${sceneOk ? 'yes' : 'NO'}`
        );
        console.log(`      canonical: ${r.canonical || '(none)'}`);
        console.log(`      title: ${r.title}`);
        console.log(`      glass surfaces: ${r.glass}`);
        if (ok) pass++;
        else fail++;
      }
    }
  }

  server.close();
  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail) process.exit(1);
})();
