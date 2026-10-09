/**
 * audit-stack.cjs — for a given element, walk the ancestor chain and report what
 * each level actually paints, so a dark ground can be traced to its source
 * instead of guessed at.
 *
 * A contrast failure says text and background are the same colour. It does not
 * say WHICH element is painting the wrong one — and in a design system with
 * pseudo-element layers that is the whole question.
 *
 * Usage: node tools/audit-stack.cjs <origin> <routePath> <selector>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');
const routePath = process.argv[3] || '/photography';
const targetSel = process.argv[4] || 'h1';

const outDir = path.join(__dirname, '_verify', 'stack');
fs.mkdirSync(outDir, { recursive: true });
const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const publicDir = path.join(path.resolve(__dirname, '..'), 'public');

const wrapper = `<!doctype html>
<html><head><meta charset="utf-8"><title>stack audit</title></head>
<body style="margin:0;background:#888">
<iframe id="f" src="${routePath}" style="width:1440px;height:1000px;border:0"></iframe>
<script>
(function () {
  var DONE = false;
  function report(o) {
    if (DONE) return; DONE = true;
    var n = document.createElement('div');
    n.id = 'tv-stack-audit'; n.style.display = 'none';
    n.textContent = JSON.stringify(o);
    document.body.appendChild(n);
  }
  function run() {
    try {
      var f = document.getElementById('f');
      var w = f.contentWindow, d = f.contentDocument;
      var el = d.querySelector(${JSON.stringify(targetSel)});
      if (!el) { report({ error: 'selector not found: ' + ${JSON.stringify(targetSel)} }); return; }

      var chain = [];
      var node = el;
      var depth = 0;
      while (node && depth < 14) {
        var s = w.getComputedStyle(node);
        var before = w.getComputedStyle(node, '::before');
        var after = w.getComputedStyle(node, '::after');
        chain.push({
          depth: depth,
          tag: node.tagName.toLowerCase(),
          cls: (node.className || '').toString().slice(0, 70),
          bg: s.backgroundColor,
          color: s.color,
          opacity: s.opacity,
          filter: s.filter !== 'none' ? s.filter : undefined,
          backdrop: s.backdropFilter && s.backdropFilter !== 'none' ? s.backdropFilter : undefined,
          bgImage: s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 110) : undefined,
          beforeBg: before.backgroundColor !== 'rgba(0, 0, 0, 0)' ? before.backgroundColor : undefined,
          beforeBgImage: before.backgroundImage !== 'none' ? before.backgroundImage.slice(0, 80) : undefined,
          afterBoxShadow: after.boxShadow !== 'none' ? after.boxShadow.slice(0, 90) : undefined
        });
        node = node.parentElement;
        depth++;
      }

      var target = w.getComputedStyle(el);
      report({
        selector: ${JSON.stringify(targetSel)},
        text: (el.innerText || '').trim().slice(0, 40),
        color: target.color,
        // The token values ARE resolvable at runtime, whatever the audit showed.
        tokensAtElement: {
          canvas: target.getPropertyValue('--color-canvas').trim(),
          text: target.getPropertyValue('--color-text').trim(),
          mist: target.getPropertyValue('--c-mist').trim(),
          mistSoft: target.getPropertyValue('--c-mist-soft').trim()
        },
        chain: chain
      });
    } catch (e) { report({ error: String(e) }); }
  }
  setTimeout(run, 3200);
})();
</script>
</body></html>`;

const wrapperName = '__stack.html';
fs.writeFileSync(path.join(publicDir, wrapperName), wrapper, 'utf8');

const dump = path.join(outDir, 'stack.html');
const profile = path.join(os.tmpdir(), `tv-stk-${Date.now()}`);
const args = [
  '--headless=new', '--no-sandbox', '--disable-extensions',
  '--window-size=1500,1150', `--user-data-dir=${profile}`,
  '--virtual-time-budget=18000', '--dump-dom', `${origin}/${wrapperName}`,
];
const quoted = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(',');
const sp = path.join(outDir, 'run.ps1');
fs.writeFileSync(
  sp,
  `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
    `-PassThru -NoNewWindow -RedirectStandardOutput '${dump.replace(/'/g, "''")}' ` +
    `-RedirectStandardError '${path.join(outDir, 'err').replace(/'/g, "''")}'; ` +
    `if (-not $p.WaitForExit(140000)) { $p.Kill() }`,
  'utf8'
);
spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], { stdio: 'ignore', timeout: 160000 });

const dom = fs.existsSync(dump) ? fs.readFileSync(dump, 'utf8') : '';
const m = dom.match(/<div id="tv-stack-audit"[^>]*>([\s\S]*?)<\/div>/);
if (!m) { console.log('audit did not run'); process.exit(1); }
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

if (r.error) { console.log('ERROR:', r.error); process.exit(1); }

console.log(`\nselector: ${r.selector}   text: "${r.text}"`);
console.log(`computed color: ${r.color}`);
console.log('tokens as seen AT THE ELEMENT:');
for (const [k, v] of Object.entries(r.tokensAtElement)) console.log(`  ${k.padEnd(12)} ${v}`);
console.log('\nancestor chain (outermost last):');
for (const c of r.chain) {
  console.log(`  [${String(c.depth).padStart(2)}] <${c.tag}> .${c.cls}`);
  const bits = [];
  if (c.bg && c.bg !== 'rgba(0, 0, 0, 0)') bits.push(`bg=${c.bg}`);
  bits.push(`color=${c.color}`);
  if (c.opacity !== '1') bits.push(`opacity=${c.opacity}`);
  if (c.bgImage) bits.push(`bgImage=${c.bgImage}`);
  if (c.backdrop) bits.push(`backdrop=${c.backdrop}`);
  if (c.filter) bits.push(`filter=${c.filter}`);
  if (c.beforeBg) bits.push(`::before bg=${c.beforeBg}`);
  if (c.beforeBgImage) bits.push(`::before img=${c.beforeBgImage}`);
  if (c.afterBoxShadow) bits.push(`::after shadow=${c.afterBoxShadow}`);
  console.log(`      ${bits.join('  ')}`);
}
