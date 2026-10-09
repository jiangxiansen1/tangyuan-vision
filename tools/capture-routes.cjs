/**
 * capture-routes.cjs — screenshot every route for visual verification.
 *
 * The boot sequence is a full-screen overlay that runs on a first visit, and it
 * is genuinely in the way of photographing the settled interface. Rather than
 * weaken the boot sequence or special-case it with a test-only URL parameter in
 * shipped code, this script flips `bootEnabled` in the *built* settings file for
 * the duration of the capture and restores it afterwards. Shipped behaviour is
 * therefore untouched, and what is photographed is exactly what a returning
 * visitor sees.
 *
 * Usage: node tools/capture-routes.cjs <origin> [outDir]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const os = require('node:os');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

const origin = process.argv[2] || 'http://127.0.0.1:4184';
const outDir = path.resolve(process.argv[3] || path.join(__dirname, '_verify', 'routes'));
fs.mkdirSync(outDir, { recursive: true });

const ROUTES = [
  ['home', '/'],
  ['photography', '/photography'],
  ['earth', '/earth'],
  ['lab', '/lab'],
  ['projects', '/projects'],
  ['about', '/about'],
  ['riding', '/riding'],
  ['journal', '/journal'],
  ['contact', '/contact'],
  ['secret', '/the-quiet-space'],
  ['notfound', '/this-route-does-not-exist'],
];

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const browser = BROWSERS.find((b) => fs.existsSync(b));
if (!browser) {
  console.error('no browser found');
  process.exit(2);
}

const shell = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe'
);

/* ---- locate the built settings file and disable the boot overlay ---------- */

function findBuiltSettings() {
  // Vite hashes JS asset names, so the settings JSON is inlined into whichever
  // chunk imports it. Find the chunk that contains the settings signature.
  const dir = path.join(DIST, 'assets');
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.js')) continue;
    const content = fs.readFileSync(path.join(dir, f), 'utf8');
    if (content.includes('secretEnabled') && content.includes('bootEnabled')) {
      return path.join(dir, f);
    }
  }
  return null;
}

/**
 * Disable the boot overlay inside the built bundle.
 *
 * Vite's minifier hoists the settings values into short local variables, so the
 * emitted code looks like:
 *
 *     secretEnabled:Kt, bootEnabled:Jt
 *
 * where Jt was assigned `!0` earlier. Replacing the property value directly
 * therefore does nothing — the object refers to a variable. Instead we swap the
 * VARIABLE's initialiser, which is what both the settings object and the
 * getter actually read.
 */
function patchBootFlag(content) {
  const m = content.match(/secretEnabled:([A-Za-z_$][\w$]*),bootEnabled:([A-Za-z_$][\w$]*)/);
  if (!m) return null;
  const bootVar = m[2];
  // Match this variable's own declaration: `,Jt=!0,` or `var Jt=!0,`.
  const decl = new RegExp(`([,;{]\\s*(?:var\\s+)?)${bootVar}=(?:!0|true)([,;])`);
  if (!decl.test(content)) return null;
  return content.replace(decl, `$1${bootVar}=!1$2`);
}

const settingsFile = findBuiltSettings();
let original = null;

if (settingsFile) {
  original = fs.readFileSync(settingsFile, 'utf8');
  const patched = patchBootFlag(original);
  if (patched && patched !== original) {
    fs.writeFileSync(settingsFile, patched, 'utf8');
    console.log(`boot overlay disabled for capture in ${path.basename(settingsFile)}`);
  } else {
    console.warn('warning: could not disable the boot overlay — the captures may show it');
  }
}

/* --------------------------------------------------------------- capture */

/**
 * Each capture gets a FRESH profile directory.
 *
 * Vite emits content-hashed asset filenames, but a rebuild with identical source
 * produces identical hashes — so a persistent profile keeps serving the
 * previously cached bundle and the screenshot shows the old behaviour. The
 * profile is therefore per-run, and the HTTP cache is disabled outright.
 */
function shoot(name, routePath) {
  const url = `${origin}${routePath}`;
  const out = path.join(outDir, `${name}.png`);
  const profile = path.join(os.tmpdir(), `tv-capture-${name}-${Date.now()}`);

  const script =
    `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' ` +
    `-ArgumentList @('--headless=new','--no-sandbox','--disable-extensions',` +
    `'--disable-dev-shm-usage','--hide-scrollbars','--window-size=1440,1050',` +
    // NOTE: --disable-gpu is deliberately NOT used. It removes WebGL entirely,
    // which makes the Earth capture photograph the fallback panel instead of the
    // globe. The verification suite runs without it and reports the globe as
    // mounted, so the captures have to use the same conditions or they document a
    // product that does not match what was verified.
    `'--disable-http-cache','--disk-cache-size=1','--media-cache-size=1',` +
    `'--force-device-scale-factor=1',` +
    `'--user-data-dir=${profile.replace(/'/g, "''")}','--virtual-time-budget=14000',` +
    `'--screenshot=${out.replace(/'/g, "''")}','${url}') ` +
    `-PassThru -NoNewWindow -RedirectStandardOutput '${out}.log' ` +
    `-RedirectStandardError '${path.join(outDir, 'browser.err')}'; ` +
    `if (-not $p.WaitForExit(120000)) { $p.Kill() }`;

  const sp = path.join(outDir, `run-${name}.ps1`);
  fs.writeFileSync(sp, script, 'utf8');
  spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], {
    stdio: 'ignore',
    timeout: 180000,
  });

  const ok = fs.existsSync(out);
  console.log(`  ${name.padEnd(12)} ${routePath.padEnd(28)} ${ok ? `${(fs.statSync(out).size / 1024).toFixed(0)} KB` : 'FAILED'}`);
  return ok;
}

console.log(`\ncapturing ${ROUTES.length} routes -> ${outDir}\n`);
let failures = 0;
for (const [name, routePath] of ROUTES) {
  if (!shoot(name, routePath)) failures++;
}

/* ---------------------------------------------------------------- restore */

if (settingsFile && original !== null) {
  fs.writeFileSync(settingsFile, original, 'utf8');
  console.log('\nboot overlay setting restored in the built chunk.');
}

console.log(`\n${ROUTES.length - failures}/${ROUTES.length} captured`);
if (failures) process.exit(1);
