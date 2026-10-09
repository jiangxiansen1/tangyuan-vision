/**
 * probe-webgl.cjs — find browser flags that yield a real WebGL context here.
 *
 * The homepage capture DID show the globe while the Earth route did not, under
 * different flag sets. Rather than guess which combination worked, this tries each
 * candidate against both routes and reports which produces a mounted canvas. That
 * turns "the globe renders" from an assumption into a measured fact.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const origin = process.argv[2] || 'http://127.0.0.1:4183';
const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const outDir = path.join(__dirname, '_verify', 'webgl');
fs.mkdirSync(outDir, { recursive: true });

const VARIANTS = [
  ['baseline-disablegpu', ['--disable-gpu']],
  ['swiftshader-angle', ['--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader']],
  ['swiftshader-only', ['--enable-unsafe-swiftshader']],
  ['gl-swiftshader', ['--use-gl=swiftshader', '--enable-unsafe-swiftshader']],
  ['no-flags', []],
];

function probe(variant, args, routePath, tag) {
  const dump = path.join(outDir, `${variant}-${tag}.html`);
  const profile = path.join(os.tmpdir(), `tv-gl-${variant}-${tag}-${Date.now()}`);
  const full = [
    '--headless=new',
    '--no-sandbox',
    '--disable-extensions',
    '--disable-dev-shm-usage',
    ...args,
    '--window-size=1280,900',
    '--user-data-dir=' + profile,
    '--virtual-time-budget=13000',
    '--dump-dom',
    origin + routePath,
  ];
  const quoted = full.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(',');
  const sp = path.join(outDir, `run-${variant}-${tag}.ps1`);
  fs.writeFileSync(
    sp,
    `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
      `-PassThru -NoNewWindow -RedirectStandardOutput '${dump.replace(/'/g, "''")}' ` +
      `-RedirectStandardError '${path.join(outDir, `${variant}-${tag}.err`).replace(/'/g, "''")}'; ` +
      `if (-not $p.WaitForExit(140000)) { $p.Kill() }`,
    'utf8'
  );
  spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], { stdio: 'ignore', timeout: 160000 });

  const dom = fs.existsSync(dump) ? fs.readFileSync(dump, 'utf8') : '';
  const err = fs.existsSync(path.join(outDir, `${variant}-${tag}.err`))
    ? fs.readFileSync(path.join(outDir, `${variant}-${tag}.err`), 'utf8')
    : '';

  // Structural evidence, not a guess: the globe host reports data-ready only
  // after the renderer was constructed and a frame was scheduled, and the failure
  // string only appears when it was not.
  const ready = /class="eglobe"[^>]*data-ready/.test(dom) || /data-ready=""/.test(dom);
  const failed = /eglobe__fallback/.test(dom);
  const canvas = /<canvas/.test(dom);
  const glLost = /Could not create|WebGL not supported|Error creating WebGL/i.test(err);

  return { ready, failed, canvas, glLost, domBytes: dom.length, errTail: err.split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 150) };
}

console.log(`\nprobing WebGL availability at ${origin}\n`);
console.log('  variant                  route        canvas  ready  fallback  verdict');
console.log('  ' + '-'.repeat(84));

const results = [];
for (const [name, args] of VARIANTS) {
  for (const [tag, routePath] of [['home', '/'], ['earth', '/earth']]) {
    const r = probe(name, args, routePath, tag);
    const verdict = r.ready && !r.failed ? 'GLOBE RENDERS' : r.failed ? 'fallback' : 'indeterminate';
    console.log(
      `  ${name.padEnd(22)} ${tag.padEnd(12)} ${String(r.canvas).padEnd(7)} ${String(r.ready).padEnd(6)} ${String(r.failed).padEnd(9)} ${verdict}`
    );
    results.push({ variant: name, tag, ...r, verdict });
  }
}

const winners = results.filter((r) => r.verdict === 'GLOBE RENDERS');
console.log('\n' + '-'.repeat(86));
if (winners.length) {
  const best = winners.find((w) => w.tag === 'earth') || winners[0];
  console.log(`  WebGL WORKS with: ${best.variant}  (globe mounted on /earth)`);
  console.log(`  -> use these flags to verify the globe: [${VARIANTS.find((v) => v[0] === best.variant)[1].join(' ')}]`);
} else {
  console.log('  NO VARIANT produced a mounted globe. WebGL is unavailable in this');
  console.log('  headless environment, so the globe itself is UNVERIFIED here.');
  const interesting = results.filter((r) => r.glLost);
  for (const r of interesting.slice(0, 3)) console.log(`    ${r.variant}/${r.tag}: ${r.errTail}`);
}
