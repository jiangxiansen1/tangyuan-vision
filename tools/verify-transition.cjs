/**
 * verify-transition.cjs — prove the route transition has a real EXIT phase.
 *
 * THE CLAIM UNDER TEST
 * The brief's complaint is specific: the old system only faded the new page in,
 * because each route owned its own transition and was unmounted before it could
 * animate out. The fix moves the transition above the route swap. So the thing to
 * verify is not "does motion run" but:
 *
 *   DOES THE OUTGOING PAGE STILL EXIST WHILE THE INCOMING ONE IS ARRIVING?
 *
 * A screenshot cannot answer that — by the time anything is captured the swap is
 * over. So this drives a real navigation inside the page and samples the DOM
 * across the following frames, counting route shells and recording their opacity.
 *
 *   0 shells during a navigation  -> the old defect (nothing animates out)
 *   1 shell                       -> a plain swap, no cross-fade
 *   2 shells with the old one dimming -> a genuine exit phase
 *
 * Usage: node tools/verify-transition.cjs <origin>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');
const outDir = path.join(__dirname, '_verify', 'transition');
fs.mkdirSync(outDir, { recursive: true });
const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const publicDir = path.join(path.resolve(__dirname, '..'), 'public');

/**
 * The probe navigates by clicking a real link, then samples.
 *
 * It uses history.pushState + a popstate-free click on an in-app anchor, so the
 * router's own client-side navigation runs — measuring a full page load would
 * prove nothing about SPA transitions.
 */
const wrapper = `<!doctype html>
<html><head><meta charset="utf-8"><title>transition audit</title></head>
<body style="margin:0;background:#333">
<iframe id="f" src="/" style="width:1440px;height:1000px;border:0"></iframe>
<script>
(function () {
  var DONE = false;
  function report(o) {
    if (DONE) return; DONE = true;
    var n = document.createElement('div');
    n.id = 'tv-transition-audit'; n.style.display = 'none';
    n.textContent = JSON.stringify(o);
    document.body.appendChild(n);
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function run() {
    try {
      var f = document.getElementById('f');
      var w = f.contentWindow, d = f.contentDocument;
      if (!d || !d.body) { report({ error: 'no document' }); return; }

      await wait(3500); // let the home page settle

      function shells() {
        return Array.prototype.slice.call(d.querySelectorAll('.route-shell')).map(function (el) {
          return {
            transition: el.getAttribute('data-transition'),
            exiting: el.getAttribute('data-exiting') === 'true',
            opacity: Math.round(parseFloat(w.getComputedStyle(el).opacity) * 100) / 100
          };
        });
      }

      var beforeNav = shells();

      /*
       * Navigate through the History API rather than by clicking.
       *
       * The home page's windows are <button> elements that call navigate(), not
       * anchors, so "find a link and click it" finds nothing. Driving pushState +
       * popstate exercises the same client-side route change the router performs,
       * and does not depend on which element happens to be an <a>.
       */
      var beforeUrl = w.location.pathname;
      w.history.pushState({}, '', '/photography');
      w.dispatchEvent(new w.PopStateEvent('popstate', { state: {} }));

      // Fall back to a real click if the router did not react to popstate.
      await wait(120);
      if (!/photography/.test(w.location.pathname)) {
        var btn = d.querySelector('[data-window="photography"]');
        if (btn) btn.click();
        else { report({ error: 'neither popstate nor a photography button navigated', beforeNav: beforeNav, beforeUrl: beforeUrl }); return; }
      }

      // Sample densely for ~700 ms, which covers the 340 ms transition twice over.
      var samples = [];
      for (var i = 0; i < 28; i++) {
        samples.push({ t: i * 25, shells: shells(), url: w.location.pathname });
        await wait(25);
      }

      var maxShells = 0;
      var sawExiting = false;
      var sawTwoShells = false;
      var exitOpacities = [];

      samples.forEach(function (s) {
        maxShells = Math.max(maxShells, s.shells.length);
        if (s.shells.length >= 2) sawTwoShells = true;
        s.shells.forEach(function (sh) {
          if (sh.exiting) {
            sawExiting = true;
            exitOpacities.push(sh.opacity);
          }
        });
      });

      report({
        reachedUrl: w.location.pathname,
        initialShells: beforeNav.length,
        initialTransition: beforeNav[0] && beforeNav[0].transition,
        maxShellsDuringNav: maxShells,
        sawTwoShells: sawTwoShells,
        sawExitingFlag: sawExiting,
        exitOpacityRange: exitOpacities.length
          ? [Math.min.apply(null, exitOpacities), Math.max.apply(null, exitOpacities)]
          : null,
        // A monotonic rise in exit opacity would mean it is fading IN, not out.
        exitMonotonicRise: (function () {
          if (exitOpacities.length < 3) return null;
          var rises = 0;
          for (var i = 1; i < exitOpacities.length; i++) if (exitOpacities[i] > exitOpacities[i - 1]) rises++;
          return rises > exitOpacities.length / 2;
        })(),
        finalShells: shells().length,
        reachedPhotography: /photography/.test(w.location.pathname)
      });
    } catch (e) { report({ error: String(e) }); }
  }
  setTimeout(run, 700);
})();
</script>
</body></html>`;

const wrapperName = '__transition.html';
fs.writeFileSync(path.join(publicDir, wrapperName), wrapper, 'utf8');

const dump = path.join(outDir, 'transition.html');
const profile = path.join(os.tmpdir(), `tv-tr-${Date.now()}`);
const args = [
  '--headless=new', '--no-sandbox', '--disable-extensions',
  '--window-size=1500,1150', `--user-data-dir=${profile}`,
  '--virtual-time-budget=30000', '--dump-dom', `${origin}/${wrapperName}`,
];
const quoted = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(',');
const sp = path.join(outDir, 'run.ps1');
fs.writeFileSync(
  sp,
  `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
    `-PassThru -NoNewWindow -RedirectStandardOutput '${dump.replace(/'/g, "''")}' ` +
    `-RedirectStandardError '${path.join(outDir, 'err').replace(/'/g, "''")}'; ` +
    `if (-not $p.WaitForExit(160000)) { $p.Kill() }`,
  'utf8'
);
spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], { stdio: 'ignore', timeout: 180000 });

const dom = fs.existsSync(dump) ? fs.readFileSync(dump, 'utf8') : '';
const m = dom.match(/<div id="tv-transition-audit"[^>]*>([\s\S]*?)<\/div>/);
if (!m) { console.log('audit did not run'); process.exit(1); }
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

console.log(`\nroute transition audit at ${origin}\n`);
if (r.error) { console.log('  ERROR:', r.error); console.log(' ', JSON.stringify(r.beforeNav)); process.exit(1); }

console.log(`  initial : ${r.initialShells} shell(s), transition="${r.initialTransition}"`);
console.log(`  navigating to: ${r.reachedUrl}`);
console.log(`  max route shells DURING the navigation : ${r.maxShellsDuringNav}`);
console.log(`  two shells coexisted                   : ${r.sawTwoShells}`);
console.log(`  an exiting shell was flagged           : ${r.sawExitingFlag}`);
console.log(`  exit opacity range                     : ${r.exitOpacityRange ? r.exitOpacityRange.join(' .. ') : 'n/a'}`);
console.log(`  final  : ${r.finalShells} shell(s), reached /photography: ${r.reachedPhotography}`);

console.log('\n' + '-'.repeat(70));
const pass = r.sawTwoShells && r.sawExitingFlag && r.reachedPhotography;
if (pass) {
  console.log('  PASS — the outgoing page stays mounted while the incoming one arrives,');
  console.log('         so the transition has a real exit phase rather than a swap.');
} else {
  console.log('  FAIL — no exit phase was observed:');
  if (!r.sawTwoShells) console.log('         only one route shell ever existed (a plain swap)');
  if (!r.sawExitingFlag) console.log('         no shell reported data-exiting="true"');
  if (!r.reachedPhotography) console.log('         navigation did not reach /photography');
  process.exit(1);
}
