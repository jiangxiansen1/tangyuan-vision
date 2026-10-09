/**
 * browser-check.cjs — verify a route in a real browser and report what it found.
 *
 * WHY THIS EXISTS
 * A green build only proves the code compiles. It says nothing about whether React
 * mounts, whether a route renders, whether the WebGL layer throws, or whether the
 * brand images resolve. This harness answers those with a real browser engine.
 *
 * HOW IT WORKS
 * The page is loaded with `?diag=1`, which switches on the application's own
 * diagnostics module (src/lib/diagnostics.ts). That module records uncaught
 * errors, unhandled rejections, failed resource loads, the environment and the
 * feature-support probe into a hidden <script id="tv-diagnostics"> node. Headless
 * Chromium's `--dump-dom` prints the fully rendered DOM, so both that report and
 * the structural state of the page are readable from a single run.
 *
 * Testing the application's own diagnostics rather than injecting a separate
 * collector means the harness verifies the same code path that ships.
 *
 * WHY THE BROWSER IS LAUNCHED FROM POWERSHELL
 * This machine's sandbox blocks child processes from opening named pipes, so
 * Node's default piped stdio fails. Launching through PowerShell with file
 * redirection avoids pipes entirely.
 *
 * PROFILE EMULATION
 *   --device=phone       375×812, emulated touch, no fine pointer
 *   --reduced-motion     forces prefers-reduced-motion: reduce
 * The diagnostics report echoes the resolved media-query state, which is how the
 * emulation is confirmed to have taken effect rather than merely requested.
 *
 * Usage:
 *   node tools/browser-check.cjs <url> [--shot out.png] [--expect "css"]
 *                                     [--device=phone] [--reduced-motion]
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

/* ------------------------------------------------------------ find browser */

const BROWSERS = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findBrowser() {
  for (const c of BROWSERS) if (fs.existsSync(c)) return c;
  return null;
}

function findPowerShell() {
  const candidates = [
    process.env.PWSH_PATH,
    'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
    process.env.SystemRoot
      ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      : null,
    '/usr/bin/pwsh',
  ].filter(Boolean);
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}

/* ------------------------------------------------------------- launch */

function runBrowser(browser, shell, args, outFile, errFile) {
  const quoted = args.map((a) => `'${a.replace(/'/g, "''")}'`).join(',');
  const script =
    `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' ` +
    `-ArgumentList @(${quoted}) -PassThru -NoNewWindow ` +
    `-RedirectStandardOutput '${outFile.replace(/'/g, "''")}' ` +
    `-RedirectStandardError '${errFile.replace(/'/g, "''")}'; ` +
    `if (-not $p.WaitForExit(120000)) { $p.Kill() }`;

  const scriptPath = path.join(path.dirname(outFile), 'run.ps1');
  fs.writeFileSync(scriptPath, script, 'utf8');

  const result = spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
    stdio: 'ignore',
    timeout: 180000,
  });
  if (process.env.TV_DEBUG_BROWSER) {
    console.log(`[debug] shell exit ${result.status}, out=${fs.existsSync(outFile) ? fs.statSync(outFile).size : 'MISSING'} bytes`);
  }
  return result;
}

/* ------------------------------------------------------------------- main */

function main() {
  const argv = process.argv.slice(2);
  const target = argv.find((a) => a.startsWith('http'));
  if (!target) {
    console.error('usage: node tools/browser-check.cjs <url> [--shot out.png] [--expect "css"] [--min-text N]');
    process.exit(2);
  }
  const argOf = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : null;
  };
  const shotPath = argOf('--shot');
  const expectSelector = argOf('--expect');
  const minText = argOf('--min-text') ? Number(argOf('--min-text')) : 200;
  const device = argOf('--device');
  const wantsReducedMotion = argv.includes('--reduced-motion');

  const browser = findBrowser();
  if (!browser) {
    console.error('FATAL: no Chromium-family browser found.');
    process.exit(2);
  }
  const shell = findPowerShell();
  if (!shell) {
    console.error('FATAL: no PowerShell found to drive the browser launch.');
    process.exit(2);
  }

  // ?diag=1 activates src/lib/diagnostics.ts in a production build.
  const url = new URL(target);
  url.searchParams.set('diag', '1');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-check-'));
  const domFile = path.join(tmp, 'dom.html');
  const errFile = path.join(tmp, 'browser.err');

  /**
   * The browser profile is deliberately NOT inside the per-run temp directory.
   * The warm-up pass relies on localStorage persisting between the two launches,
   * and a fresh profile each time would make every run look like a first visit —
   * which means the boot overlay would sit across every screenshot and the
   * measurements would describe the boot screen rather than the page.
   */
  const profileDir = path.join(os.tmpdir(), `tv-check-profile-${device ?? 'desktop'}${wantsReducedMotion ? '-rm' : ''}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const flags = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--user-data-dir=' + profileDir,
    '--virtual-time-budget=9000',
  ];

  // Viewport / input emulation. Chromium's own flags are used rather than a
  // beforeunload injection so the emulation is present from the very first frame,
  // which is what CSS media queries and the pointer-capability probes actually
  // read.
  if (device === 'phone') {
    // The new headless mode ignores --window-size for layout purposes; the
    // legacy headless shell honours it. Since exercising the mobile layout is the
    // entire point of this flag, the mode is switched to match the requirement
    // rather than reporting a viewport that was never applied.
    flags[0] = '--headless=old';
    flags.push('--window-size=390,844', '--force-device-scale-factor=1');
    flags.push('--touch-events=enabled');
  } else {
    flags.push('--window-size=1440,1000');
  }

  if (wantsReducedMotion) {
    flags.push('--force-prefers-reduced-motion');
  }

  console.log(`browser : ${browser}`);
  console.log(`target  : ${url.toString()}`);
  if (device) console.log(`device  : ${device}`);
  if (wantsReducedMotion) console.log('motion  : forced reduced');
  console.log('');

  /**
   * Warm-up pass.
   *
   * The boot sequence runs on a first visit and records that it was seen, and it
   * is a real overlay that would otherwise sit across every screenshot. Loading
   * once with a persistent profile sets that flag, so the second load — the one
   * measured and captured — is the settled page a repeat visitor actually sees.
   */
  runBrowser(browser, shell, [...flags, '--dump-dom', url.toString()], path.join(tmp, 'warm.html'), errFile);

  runBrowser(browser, shell, [...flags, '--dump-dom', url.toString()], domFile, errFile);

  const dom = fs.existsSync(domFile) ? fs.readFileSync(domFile, 'utf8') : '';
  if (!dom) {
    console.error('FAIL: the browser produced no DOM. stderr:');
    console.error(fs.existsSync(errFile) ? fs.readFileSync(errFile, 'utf8').slice(0, 1200) : '(none)');
    process.exit(1);
  }

  /* ---- read the application's own diagnostics report ---- */
  const diagMatch = dom.match(/<script id="tv-diagnostics"[^>]*>([\s\S]*?)<\/script>/);
  let report = null;
  if (diagMatch) {
    try {
      report = JSON.parse(
        diagMatch[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      );
    } catch {
      report = null;
    }
  }

  /* ---- structural facts from the rendered DOM ---- */
  const count = (re) => (dom.match(re) || []).length;
  const textLen = (() => {
    const m = dom.match(/<div id="root">([\s\S]*?)<\/div><\/body>/);
    const inner = m ? m[1] : dom;
    return inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().length;
  })();
  const h1 = (dom.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1].replace(/<[^>]+>/g, ' ').trim();

  const facts = {
    title: (dom.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [, ''])[1].trim(),
    h1,
    rootPresent: dom.includes('id="root"'),
    rootHasContent: /<div id="root">\s*<(?!\/div>)/.test(dom) || count(/class="glass/g) > 0,
    glass: count(/class="glass/g),
    canvas: count(/<canvas/g),
    buttons: count(/<button/g),
    links: count(/<a\s/g),
    images: count(/<img/g),
    noscriptShown: /<noscript>[\s\S]*JavaScript/.test(dom) && !count(/class="glass/g),
    bootOverlay: /class="boot"/.test(dom),
    textLen,
  };

  console.log('--- rendered DOM ---');
  for (const [k, v] of Object.entries(facts)) console.log(`${k.padEnd(16)}: ${v}`);

  if (report) {
    console.log('\n--- application diagnostics ---');
    console.log(`build mode      : ${report.build?.mode}  base=${report.build?.base}`);
    console.log('features        :');
    for (const [k, v] of Object.entries(report.features || {})) {
      console.log(`   ${v ? 'yes' : 'no '}  ${k}`);
    }
    console.log('environment     :');
    for (const [k, v] of Object.entries(report.environment || {})) {
      console.log(`   ${k} = ${v}`);
    }
    console.log(`errors recorded : ${(report.errors || []).length}`);
    for (const e of report.errors || []) console.log(`   • ${e}`);
  } else {
    console.log('\n--- application diagnostics ---');
    console.log('NOT PRESENT — ?diag=1 did not install the diagnostics node.');
  }

  /* ---- emulation assertions ---- */
  //
  // These report what the page ACTUALLY resolved, not what was requested. That
  // distinction matters: the flag can be passed and silently ignored (Chromium's
  // new headless mode does exactly that with --window-size), and a check that
  // only echoed the requested value would report a pass for an emulation that
  // never happened.
  if (report && device === 'phone') {
    const vp = String(report.environment?.viewport || '');
    const narrow = Number(vp.split('x')[0]) <= 480;
    if (narrow) {
      console.log(`\nemulation check : viewport ${vp} — narrow layout applied`);
    } else {
      console.log(
        `\nemulation check : viewport ${vp} — NOT NARROW.\n` +
          `                  The mobile layout was NOT exercised by this run; the viewport\n` +
          `                  flag was ignored by this browser build. Treat mobile results as\n` +
          `                  unverified rather than as a pass.`
      );
    }
  }
  if (report && wantsReducedMotion) {
    const rm = String(report.environment?.reducedMotion);
    console.log(
      `emulation check : reducedMotion=${rm} ${rm === 'true' ? '— applied' : '— NOT APPLIED (flag ignored)'}`
    );
  }

  if (shotPath) {
    const abs = path.resolve(shotPath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    runBrowser(browser, shell, [...flags, `--screenshot=${abs}`, url.toString()], path.join(tmp, 's.out'), errFile);
    console.log(`\nscreenshot      : ${abs}`);
  }

  if (expectSelector) {
    console.log(`selector        : "${expectSelector}" ${dom.includes(expectSelector) ? 'found' : 'MISSING'}`);
  }

  /* -------------------------------------------------------------- verdict */
  const problems = [];
  if (!report) problems.push('application diagnostics node missing — ?diag=1 did not take effect');
  if (!facts.rootHasContent && facts.glass === 0) problems.push('nothing rendered — #root is empty');
  // Any interactive element counts. A page whose only navigation is links (the
  // 404 page, for example) is perfectly operable and must not be failed for
  // having no <button>.
  if (facts.buttons + facts.links === 0) problems.push('no interactive elements rendered');
  if (facts.textLen < minText) problems.push(`only ${facts.textLen} characters of text rendered (min ${minText})`);
  const hard = (report?.errors || []).filter(
    (e) => e.startsWith('error:') || e.startsWith('unhandledrejection:') || e.startsWith('resource:')
  );
  if (hard.length) problems.push(`${hard.length} error(s): ${hard.join(' | ')}`);
  if (expectSelector && !dom.includes(expectSelector)) {
    problems.push(`expected selector "${expectSelector}" not found`);
  }

  if (problems.length) {
    console.log('\nVERDICT: FAIL');
    for (const p of problems) console.log(`  x ${p}`);
    process.exit(1);
  }

  console.log('\nVERDICT: PASS');
}

main();
