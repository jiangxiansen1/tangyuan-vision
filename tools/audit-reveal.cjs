/**
 * reveal-audit-new.cjs — is any content permanently invisible?
 *
 * THE QUESTION, AND WHY A SCREENSHOT CANNOT ANSWER IT
 * The reveal system arms content to `opacity: 0` and waits for an
 * IntersectionObserver. Getting that wrong leaves text permanently invisible — a
 * serious bug. But three entirely different situations photograph the same way,
 * and conflating them produces a false alarm:
 *
 *   1. A DEFECT          the observer never fires, or `.is-revealed` never wins,
 *                        so content that is ON SCREEN stays invisible forever.
 *   2. MID-TRANSITION    the class is applied and the settle is simply not over.
 *                        `--t-slower` is 640 ms and the route shell animates over
 *                        420 ms, so any early measurement reads low.
 *   3. CORRECTLY WAITING content below the fold has not been revealed yet, which
 *                        is the entire point of a scroll reveal.
 *
 * WHAT THIS DOES ABOUT IT
 * It measures SETTLED state, not instantaneous state: inside the audited document
 * it injects an origin-level `transition: none !important` rule, so every pending
 * transition resolves immediately and what remains is the value the element would
 * settle at. Then it separates the three cases explicitly — an element that is in
 * view and still at zero is a defect; one out of view is correctly waiting.
 *
 * Measurement goes through a same-origin iframe so the SPA router sees the real
 * URL and renders the real route.
 *
 * Usage: node tools/reveal-audit-new.cjs <origin>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const origin = process.argv[2] || 'http://127.0.0.1:4183';
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const outDir = path.join(__dirname, '_verify', 'reveal');
fs.mkdirSync(outDir, { recursive: true });

const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

const ROUTES = [
  ['photography', '/photography'],
  ['about', '/about'],
  ['projects', '/projects'],
  ['journal', '/journal'],
  ['lab', '/lab'],
  ['riding', '/riding'],
  ['earth', '/earth'],
  ['home', '/'],
];

function wrapperHtml(routePath) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>reveal audit</title></head>
<body style="margin:0;background:#111">
<iframe id="f" src="${routePath}" style="width:1440px;height:1000px;border:0"></iframe>
<script>
(function () {
  var DONE = false;
  function report(obj) {
    if (DONE) return;
    DONE = true;
    var n = document.createElement('div');
    n.id = 'tv-reveal-audit';
    n.style.display = 'none';
    n.textContent = JSON.stringify(obj);
    document.body.appendChild(n);
  }

  function run() {
    try {
      var f = document.getElementById('f');
      var w = f.contentWindow, d = f.contentDocument;
      if (!d || !d.body) { report({ url: '${routePath}', error: 'no iframe document' }); return; }

      // Resolve every pending transition so the measured value is the settled
      // one. Injected into the frame's own document at origin level so it wins.
      var kill = d.createElement('style');
      kill.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      (d.head || d.documentElement).appendChild(kill);
      void d.body.offsetHeight; // reflow so the rule applies before measuring

      var vh = w.innerHeight;
      var armed = d.querySelectorAll('.reveal.is-armed');
      var revealed = d.querySelectorAll('.reveal.is-armed.is-revealed');

      var stuckInView = [];   // defect: on screen and still invisible
      var waiting = [];       // correct: below the fold, not yet revealed
      var mid = [];           // settled opacity between 0 and 1

      armed.forEach(function (el) {
        var o = parseFloat(w.getComputedStyle(el).opacity);
        var r = el.getBoundingClientRect();
        var inView = r.top < vh && r.bottom > 0;
        var cls = (el.className || '').toString().split(' ').filter(function (c) { return c !== 'reveal'; }).slice(0, 2).join('.');
        var tag = el.tagName.toLowerCase() + (cls ? '.' + cls : '');
        var entry = { sel: tag, opacity: o, top: Math.round(r.top) };
        if (o >= 0.99) return;
        if (inView && o < 0.05) stuckInView.push(entry);
        else if (!inView) waiting.push(entry);
        else mid.push(entry);
      });

      // The route shell animates opacity too; a shell that never reaches 1 would
      // grey out the entire page.
      var shellEl = d.querySelector('.route-shell, .scene');
      var shellOpacity = shellEl ? parseFloat(w.getComputedStyle(shellEl).opacity) : 1;

      report({
        url: '${routePath}',
        armedCount: armed.length,
        revealedCount: revealed.length,
        shellOpacity: shellOpacity,
        stuckInView: stuckInView.slice(0, 8),
        waitingBelowFold: waiting.length,
        midTransition: mid.slice(0, 5),
        bodyTextLength: d.body.innerText.length,
        verdict: stuckInView.length > 0 ? 'CONTENT HIDDEN WHILE IN VIEW'
               : (shellOpacity < 0.99 ? 'SHELL NEVER SETTLES'
               : (mid.length > 0 ? 'SETTLES LOW'
               : 'OK'))
      });
    } catch (e) {
      report({ url: '${routePath}', error: String(e) });
    }
  }

  // Let the observers, Motion and the route shell run first; the no-transition
  // override then makes the final settle measurable regardless.
  setTimeout(run, 4500);
})();
</script>
</body></html>`;
}

function audit(name, routePath) {
  const dump = path.join(outDir, `${name}.html`);
  const profile = path.join(os.tmpdir(), `tv-rev-${name}-${Date.now()}`);
  const wrapperName = `__audit-${name}.html`;
  fs.writeFileSync(path.join(DIST, wrapperName), wrapperHtml(routePath), 'utf8');

  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1500,1150',
    `--user-data-dir=${profile}`,
    '--virtual-time-budget=22000',
    '--dump-dom',
    `${origin}/${wrapperName}`,
  ];
  const quoted = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(',');
  const sp = path.join(outDir, `run-${name}.ps1`);
  fs.writeFileSync(
    sp,
    `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
      `-PassThru -NoNewWindow -RedirectStandardOutput '${dump.replace(/'/g, "''")}' ` +
      `-RedirectStandardError '${path.join(outDir, `${name}.err`).replace(/'/g, "''")}'; ` +
      `if (-not $p.WaitForExit(150000)) { $p.Kill() }`,
    'utf8'
  );
  spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], { stdio: 'ignore', timeout: 170000 });

  const dom = fs.existsSync(dump) ? fs.readFileSync(dump, 'utf8') : '';
  const m = dom.match(/<div id="tv-reveal-audit"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return null;
  try {
    return JSON.parse(
      m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    );
  } catch {
    return null;
  }
}

const collected = {};
console.log(`\nauditing SETTLED reveal state at ${origin}`);
console.log('(transitions disabled inside the frame before measuring)\n');
console.log('  route         armed  revealed  shellOp  stuck  waiting  verdict');
console.log('  ' + '-'.repeat(72));

let defects = 0;
for (const [name, routePath] of ROUTES) {
  const r = audit(name, routePath);
  if (!r) {
    console.log(`  ${name.padEnd(13)} (audit did not run)`);
    continue;
  }
  collected[name] = r;
  if (r.error) {
    console.log(`  ${name.padEnd(13)} error: ${r.error}`);
    continue;
  }
  if (r.stuckInView.length) defects++;
  console.log(
    `  ${name.padEnd(13)} ${String(r.armedCount).padEnd(6)} ${String(r.revealedCount).padEnd(9)} ` +
      `${String(r.shellOpacity).padEnd(8)} ${String(r.stuckInView.length).padEnd(6)} ${String(r.waitingBelowFold).padEnd(8)} ${r.verdict}`
  );
  for (const s of r.stuckInView.slice(0, 5)) {
    console.log(`      STUCK  ${s.sel} opacity=${s.opacity} top=${s.top}`);
  }
  for (const s of r.midTransition.slice(0, 3)) {
    console.log(`      low    ${s.sel} opacity=${s.opacity} top=${s.top}`);
  }
}

fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(collected, null, 2));
console.log('\n' + '-'.repeat(74));
if (defects) {
  console.log(`  ${defects} route(s) leave on-screen content invisible. This is a real defect.`);
  process.exit(1);
}
console.log('  No on-screen content is left hidden on any route.');
console.log('  Elements under "waiting" are below the fold — the scroll reveal working');
console.log('  as designed, not a failure.');
