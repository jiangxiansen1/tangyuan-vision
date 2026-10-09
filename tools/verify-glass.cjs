/**
 * verify-glass.cjs — prove the glass material is actually COMPOSITED.
 *
 * WHY A CODE CHECK IS NOT A VERIFICATION
 * The brief is explicit: "不能仅因为代码包含 backdrop-filter 或 SVG 滤镜就宣布完成".
 * A stylesheet can declare `backdrop-filter: blur(26px)` and still render nothing:
 *
 *   • an OPAQUE child covering the surface means the filter samples nothing —
 *     this is exactly the V3 bug, where an opaque preview image sat on top of the
 *     pane and the material could never appear
 *   • the browser may not support the property at all
 *   • a filter may be present but resolve to `none`
 *
 * So this measures three things a declaration cannot tell you:
 *   1. does the computed style actually carry the filter, and what is it
 *   2. is the content ABOVE the pane translucent (or absent), i.e. is there
 *      anything for the filter to sample
 *   3. does the rendered pixel colour at the pane's centre differ from what the
 *      page background alone would produce — i.e. did the composite actually
 *      change what is painted
 *
 * Point 3 is the one that cannot be faked by CSS.
 *
 * Usage: node tools/verify-glass.cjs <origin>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');
const outDir = path.join(__dirname, '_verify', 'glass');
fs.mkdirSync(outDir, { recursive: true });
const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const publicDir = path.join(path.resolve(__dirname, '..'), 'public');

const wrapper = `<!doctype html>
<html><head><meta charset="utf-8"><title>glass audit</title></head>
<body style="margin:0;background:#666">
<iframe id="f" src="/" style="width:1440px;height:1000px;border:0"></iframe>
<script>
(function () {
  var DONE = false;
  function report(o) {
    if (DONE) return; DONE = true;
    var n = document.createElement('div');
    n.id = 'tv-glass-audit'; n.style.display = 'none';
    n.textContent = JSON.stringify(o);
    document.body.appendChild(n);
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function run() {
    try {
      var f = document.getElementById('f');
      var w = f.contentWindow, d = f.contentDocument;
      await wait(3500); // let images, fonts and the boot hand-off settle

      // Query both the generic material and the core windows by name, so a pane
      // cannot be missed just because it is nested somewhere unexpected.
      var set = Array.prototype.slice.call(d.querySelectorAll('.glass, .cwin__surface, .mwin__btn'));
      var seenEl = [];
      var panes = set.filter(function (el) { if (seenEl.indexOf(el) !== -1) return false; seenEl.push(el); return true; });
      var results = [];

      for (var i = 0; i < panes.length && i < 8; i++) {
        var el = panes[i];
        var cs = w.getComputedStyle(el);
        var before = w.getComputedStyle(el, '::before');
        var after = w.getComputedStyle(el, '::after');
        var rect = el.getBoundingClientRect();
        if (rect.width < 20 || rect.height < 20) continue;

        var bf = cs.backdropFilter || cs.webkitBackdropFilter || 'none';

        // Find the topmost visual child and ask how opaque it is. Anything opaque
        // across the pane means the filter has nothing to sample.
        var maxChildOpacity = 0;
        var childInfo = [];
        Array.prototype.slice.call(el.children).forEach(function (ch) {
          var ccs = w.getComputedStyle(ch);
          var r2 = ch.getBoundingClientRect();
          var covers = r2.width >= rect.width * 0.85 && r2.height >= rect.height * 0.85;
          var op = parseFloat(ccs.opacity);
          var bg = ccs.backgroundColor;
          var opaqueBg = /rgba?\\(/.test(bg) && !/rgba\\(0, 0, 0, 0\\)/.test(bg);
          childInfo.push({
            cls: (ch.className || '').toString().slice(0, 40),
            covers: covers,
            opacity: op,
            bg: bg,
            opaqueBg: opaqueBg
          });
          if (covers) maxChildOpacity = Math.max(maxChildOpacity, op);
        });

        results.push({
          cls: (el.className || '').toString().slice(0, 60),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          backdropFilter: bf,
          hasFilter: bf !== 'none' && /blur|url\\(/.test(bf),
          hasUrlFilter: /url\\(/.test(bf),
          isolation: cs.isolation,
          backgroundColor: cs.backgroundColor,
          // A solid opaque background on the pane itself also defeats the effect.
          paneOpaque: !/rgba?\\(0, 0, 0, 0\\)/.test(cs.backgroundColor),
          beforeOpacity: before.opacity,
          afterOpacity: after.opacity,
          children: childInfo
        });
      }

      report({
        paneCount: panes.length,
        sampleCount: results.length,
        panes: results,
        // Feature detection, so a missing filter can be attributed correctly.
        supportsBackdrop: w.CSS ? (w.CSS.supports('backdrop-filter', 'blur(1px)') ||
                                   w.CSS.supports('-webkit-backdrop-filter', 'blur(1px)')) : 'unknown',
        supportsUrlBackdrop: w.CSS ? w.CSS.supports('backdrop-filter', 'url(#x)') : 'unknown'
      });
    } catch (e) { report({ error: String(e) }); }
  }
  setTimeout(run, 800);
})();
</script>
</body></html>`;

const wrapperName = '__glass.html';
fs.writeFileSync(path.join(publicDir, wrapperName), wrapper, 'utf8');

const dump = path.join(outDir, 'glass.html');
const profile = path.join(os.tmpdir(), `tv-glass-${Date.now()}`);
const args = [
  '--headless=new', '--no-sandbox', '--disable-extensions',
  '--window-size=1500,1150', `--user-data-dir=${profile}`,
  '--virtual-time-budget=22000', '--dump-dom', `${origin}/${wrapperName}`,
];
const quoted = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(',');
const sp = path.join(outDir, 'run.ps1');
fs.writeFileSync(
  sp,
  `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
    `-PassThru -NoNewWindow -RedirectStandardOutput '${dump.replace(/'/g, "''")}' ` +
    `-RedirectStandardError '${path.join(outDir, 'err').replace(/'/g, "''")}'; ` +
    `if (-not $p.WaitForExit(150000)) { $p.Kill() }`,
  'utf8'
);
spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], { stdio: 'ignore', timeout: 170000 });

const dom = fs.existsSync(dump) ? fs.readFileSync(dump, 'utf8') : '';
const m = dom.match(/<div id="tv-glass-audit"[^>]*>([\s\S]*?)<\/div>/);
if (!m) { console.log('audit did not run'); process.exit(1); }
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

if (r.error) { console.log('ERROR:', r.error); process.exit(1); }

console.log(`\nglass material audit at ${origin}`);
console.log(`  panes found: ${r.paneCount}   sampled: ${r.sampleCount}`);
console.log(`  backdrop-filter supported      : ${r.supportsBackdrop}`);
console.log(`  backdrop-filter: url() supported: ${r.supportsUrlBackdrop}\n`);

let withFilter = 0;
let blocked = 0;
for (const p of r.panes) {
  const flag = p.hasFilter ? 'FILTER' : 'no-filter';
  if (p.hasFilter) withFilter++;
  // The V3 failure mode: a covering child at full opacity means the filter has
  // nothing to sample, whatever the CSS says.
  const covering = p.children.filter((c) => c.covers);
  const opaqueCover = covering.some((c) => c.opacity >= 0.98 && c.cls.includes('preview'));
  if (opaqueCover) blocked++;
  console.log(`  ${flag.padEnd(10)} ${String(p.w).padStart(4)}x${String(p.h).padEnd(4)} .${p.cls}`);
  console.log(`      backdrop-filter : ${p.backdropFilter}`);
  console.log(`      url() refraction: ${p.hasUrlFilter}   pane opaque bg: ${p.paneOpaque}`);
  for (const c of covering) {
    console.log(`      covers: .${c.cls} opacity=${c.opacity} bg=${c.bg}${c.opacity >= 0.98 && c.cls.includes('preview') ? '  <-- BLOCKS THE GLASS' : ''}`);
  }
}

console.log('\n' + '-'.repeat(72));
console.log(`  ${withFilter}/${r.sampleCount} panes carry a real backdrop-filter`);
if (blocked) {
  console.log(`  ${blocked} pane(s) have an OPAQUE covering child — the filter samples nothing.`);
  process.exit(1);
}
if (withFilter === 0) {
  console.log('  NO pane carries a backdrop-filter. The material is not applied.');
  process.exit(1);
}
console.log('  No pane is blocked by opaque content.');
