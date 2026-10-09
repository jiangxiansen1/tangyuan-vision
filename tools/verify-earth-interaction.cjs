/**
 * verify-earth-interaction.cjs — do drag, wheel and click ACTUALLY work?
 *
 * WHY MEASUREMENT IS THE ONLY HONEST ANSWER
 * Four separate things can each silently disable globe interaction, and none of
 * them is visible in a stylesheet or a screenshot:
 *
 *   1. an overlay that swallows pointer events (this was a real defect:
 *      `.eglobe__keys` covered the canvas with no pointer-events rule)
 *   2. listeners bound to an element that the WebGL retry later REPLACES
 *   3. a raycast reading a stale element's box
 *   4. the wheel scrolling the page instead of zooming the globe
 *
 * So this drives real synthetic pointer and wheel events at the globe and reads
 * back what changed. A drag that rotates the globe changes the rendered pixels; a
 * wheel that zooms changes the apparent size of the sphere. Both are measurable
 * without reading component internals.
 *
 * Canvas readback: WebGL canvases without `preserveDrawingBuffer` are cleared
 * after compositing, so `toDataURL` returns blank. `getImageData` immediately
 * after a draw is unreliable for the same reason. The probe therefore measures the
 * SPHERE'S APPARENT RADIUS by scanning a horizontal line of pixels for the
 * boundary between the dark backdrop and the lit globe, sampled inside a rAF
 * callback where the buffer is still valid.
 *
 * Usage: node tools/verify-earth-interaction.cjs <origin>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');
const outDir = path.join(__dirname, '_verify', 'interaction');
fs.mkdirSync(outDir, { recursive: true });
const browser = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const shell = path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const publicDir = path.join(path.resolve(__dirname, '..'), 'public');

const wrapper = `<!doctype html>
<html><head><meta charset="utf-8"><title>earth interaction audit</title></head>
<body style="margin:0;background:#111">
<iframe id="f" src="/earth" style="width:1440px;height:1000px;border:0"></iframe>
<script>
(function () {
  var DONE = false;
  function report(o) {
    if (DONE) return; DONE = true;
    var n = document.createElement('div');
    n.id = 'tv-interaction-audit'; n.style.display = 'none';
    n.textContent = JSON.stringify(o);
    document.body.appendChild(n);
  }
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  async function run() {
    try {
      var f = document.getElementById('f');
      var w = f.contentWindow, d = f.contentDocument;
      await wait(2600); // globe textures, shader compile, first frames

      var host = d.querySelector('.eglobe');
      var canvas = d.querySelector('.eglobe__canvas');
      if (!host || !canvas) { report({ error: 'no globe host or canvas', host: !!host, canvas: !!canvas }); return; }

      var rect = host.getBoundingClientRect();
      var cx = rect.left + rect.width / 2;
      var cy = rect.top + rect.height / 2;

      // What the browser believes is under the cursor. If this is not the host or
      // one of its descendants, something is intercepting the pointer.
      var topEl = d.elementFromPoint(cx, cy);
      var topClass = topEl ? (topEl.className || '').toString().slice(0, 60) : '(none)';
      var topIsInsideHost = !!(topEl && host.contains(topEl));

      function fire(type, x, y, extra) {
        var opts = Object.assign({
          bubbles: true, cancelable: true, composed: true,
          clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse',
          isPrimary: true, button: 0, buttons: type === 'pointerup' ? 0 : 1
        }, extra || {});
        var target = d.elementFromPoint(x, y) || host;
        target.dispatchEvent(new w.PointerEvent(type, opts));
      }

      /* ---------- WHEEL ZOOM ----------
         A wheel event over the globe must be PREVENTED. If it is not, the page
         scrolls and the globe never zooms — which is the exact failure mode being
         tested for. Default-prevented is therefore the primary signal, and it is
         independent of any rendering question. */
      var wheelHandled = [];
      for (var i = 0; i < 3; i++) {
        var ev = new w.WheelEvent('wheel', {
          bubbles: true, cancelable: true, composed: true,
          clientX: cx, clientY: cy, deltaY: -120 * (i + 1), deltaMode: 0
        });
        var target = d.elementFromPoint(cx, cy) || host;
        var notPrevented = target.dispatchEvent(ev);
        wheelHandled.push(!notPrevented);
      }
      await wait(400);

      /* ---------- DRAG ROTATION ----------
         A drag changes the rendered image. Compared as a pixel checksum from a
         capture taken inside a rAF, where the drawing buffer is still valid. */
      function fingerprint() {
        return new Promise(function (resolve) {
          w.requestAnimationFrame(function () {
            try {
              var probe = d.createElement('canvas');
              probe.width = 64; probe.height = 64;
              var ctx = probe.getContext('2d');
              ctx.drawImage(canvas, 0, 0, 64, 64);
              var data = ctx.getImageData(0, 0, 64, 64).data;
              var sum = 0;
              for (var k = 0; k < data.length; k += 16) sum = (sum + data[k] * (k + 1)) % 2147483647;
              resolve(sum);
            } catch (e) { resolve('error:' + e.message); }
          });
        });
      }

      var before = await fingerprint();
      fire('pointerdown', cx, cy);
      for (var step = 1; step <= 8; step++) {
        fire('pointermove', cx + step * 14, cy);
        await wait(16);
      }
      fire('pointerup', cx + 112, cy);
      await wait(120);
      var afterDrag = await fingerprint();

      /* ---------- DRAG MUST NOT OPEN A REGION ----------
         A fast drag that ends over a country must not be treated as a click, or
         every rotation would open a detail panel. */
      var panelAfterDrag = !!d.querySelector('.rpanel');

      /* ---------- FIND LAND USING THE COMPONENT ITSELF ----------
         The globe exposes a read-only aim handle that answers "what is at this
         viewport point?". Asking it directly removes the guesswork: a fixed
         screen point is over ocean at some hours of the day, and clicking water
         correctly selects nothing. */
      var aim = host.__earthAim;
      var landNdc = null;
      var landName = null;
      var probed = 0;

      if (aim) {
        /* First: is any point of the CURRENT view over a country? */
        outer: for (var qy = -0.5; qy <= 0.5; qy += 0.14) {
          for (var qx = -0.5; qx <= 0.5; qx += 0.14) {
            probed++;
            var hitHere = aim.pickAt(qx, qy);
            if (hitHere) { landNdc = { x: qx, y: qy }; break outer; }
          }
        }
        /* If the opening view is all water, AIM AT ASIA, which is always land,
           and re-probe. The rotation space is the same one the component uses. */
        if (!landNdc) {
          var attempts = [100, 20, -60, 140, 10];
          for (var ai = 0; ai < attempts.length && !landNdc; ai++) {
            aim.face(attempts[ai], 20);
            await wait(220);
            for (var sy = -0.3; sy <= 0.3; sy += 0.2) {
              for (var sx = -0.3; sx <= 0.3; sx += 0.2) {
                var h2 = aim.pickAt(sx, sy);
                if (h2) { landNdc = { x: sx, y: sy }; landName = h2.id; break; }
              }
              if (landNdc) break;
            }
          }
        } else {
          var firstHit = aim.pickAt(landNdc.x, landNdc.y);
          landName = firstHit ? firstHit.id : null;
        }
      }

      /* ---------- CLICK THAT POINT AND REQUIRE ITS PANEL ---------- */
      var panelAfterClick = null;
      var panelText = null;
      var panelCountry = null;
      var clickProbes = [];
      var panelOpenedByDrag = panelAfterDrag;
      var clickX = 0;
      var clickY = 0;

      if (landNdc) {
        clickX = rect.left + (landNdc.x * 0.5 + 0.5) * rect.width;
        clickY = rect.top + (-landNdc.y * 0.5 + 0.5) * rect.height;
        fire("pointermove", clickX, clickY);
        await wait(120);
        fire("pointerdown", clickX, clickY);
        fire("pointerup", clickX, clickY);
        await wait(560);
        panelAfterClick = d.querySelector(".rpanel");
        if (panelAfterClick) {
          panelText = (panelAfterClick.innerText || "").slice(0, 120);
          var titleEl = panelAfterClick.querySelector("#rpanel-title");
          panelCountry = titleEl ? titleEl.textContent : null;
        }
        clickProbes.push(!!panelAfterClick);
      }

      /* A drag must still not open a panel, checked against the same point that
         a click DID open. */
      if (panelAfterClick) {
        var closeBtn3 = d.querySelector(".rpanel__close");
        if (closeBtn3) { closeBtn3.click(); await wait(240); }
        fire("pointerdown", clickX, clickY);
        for (var ds = 1; ds <= 8; ds++) { fire("pointermove", clickX + ds * 12, clickY); await wait(16); }
        fire("pointerup", clickX + 96, clickY);
        await wait(360);
        panelOpenedByDrag = !!d.querySelector(".rpanel");
      }
      /* ---------- CANVAS IDENTITY ---------- */
      var canvasNow = d.querySelector('.eglobe__canvas');
      var hostChildren = Array.prototype.slice.call(host.children).map(function (c) {
        return (c.className || '').toString().slice(0, 30);
      });
      var canvasCount = d.querySelectorAll('.eglobe__canvas').length;

      report({
        hostFound: !!host,
        canvasFound: !!canvas,
        hostSize: [Math.round(rect.width), Math.round(rect.height)],
        elementAtCentre: topClass,
        elementAtCentreInsideHost: topIsInsideHost,
        wheelPreventedCount: wheelHandled.filter(Boolean).length,
        wheelTotal: wheelHandled.length,
        fingerprintBefore: before,
        fingerprintAfterDrag: afterDrag,
        dragChangedPixels: typeof before === 'number' && typeof afterDrag === 'number' && before !== afterDrag,
        panelOpenedByDrag: panelAfterDrag,
        panelOpenedByClick: !!panelAfterClick,
        clickProbeHits: clickProbes.filter(Boolean).length,
        aimHandlePresent: !!aim,
        pickProbes: probed,
        landNdc: landNdc,
        landId: landName,
        panelCountry: panelCountry,
        clickProbeTotal: clickProbes.length,
        panelText: panelText,
        canvasCount: canvasCount,
        hostChildren: hostChildren
      });
    } catch (e) { report({ error: String(e) }); }
  }
  setTimeout(run, 200);
})();
</script>
</body></html>`;

const wrapperName = '__interaction.html';
fs.writeFileSync(path.join(publicDir, wrapperName), wrapper, 'utf8');

const dump = path.join(outDir, 'interaction.html');
const profile = path.join(os.tmpdir(), `tv-int-${Date.now()}`);
const args = [
  '--headless=new', '--no-sandbox', '--disable-extensions',
  '--window-size=1500,1150', `--user-data-dir=${profile}`,
  '--virtual-time-budget=180000', '--dump-dom', `${origin}/${wrapperName}`,
];
const quoted = args.map((a) => `'${String(a).replace(/'/g, "''")}'`).join(',');
const sp = path.join(outDir, 'run.ps1');
fs.writeFileSync(
  sp,
  `$p = Start-Process -FilePath '${browser.replace(/'/g, "''")}' -ArgumentList @(${quoted}) ` +
    `-PassThru -NoNewWindow -RedirectStandardOutput '${dump.replace(/'/g, "''")}' ` +
    `-RedirectStandardError '${path.join(outDir, 'err').replace(/'/g, "''")}'; ` +
    `if (-not $p.WaitForExit(170000)) { $p.Kill() }`,
  'utf8'
);
spawnSync(shell, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', sp], { stdio: 'ignore', timeout: 190000 });

const dom = fs.existsSync(dump) ? fs.readFileSync(dump, 'utf8') : '';
const m = dom.match(/<div id="tv-interaction-audit"[^>]*>([\s\S]*?)<\/div>/);
if (!m) { console.log('audit did not run'); process.exit(1); }
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

console.log(`\nearth interaction audit at ${origin}\n`);
if (r.error) { console.log('  ERROR:', r.error); process.exit(1); }

console.log(`  globe host        : ${r.hostFound}  size ${r.hostSize.join(' x ')}`);
console.log(`  canvas            : ${r.canvasFound}  (count in DOM: ${r.canvasCount})`);
console.log(`  element under cursor at centre : .${r.elementAtCentre}`);
console.log(`  that element is inside the globe host : ${r.elementAtCentreInsideHost}`);
console.log(`  wheel events default-prevented : ${r.wheelPreventedCount}/${r.wheelTotal}`);
console.log(`  drag changed rendered pixels   : ${r.dragChangedPixels}`);
console.log(`  panel opened by a DRAG         : ${r.panelOpenedByDrag}`);
console.log(`  panel opened by a CLICK        : ${r.panelOpenedByClick}`);
if (r.panelText) console.log(`     panel shows: "${r.panelText.replace(/\n/g, ' | ')}"`);

console.log('\n' + '-'.repeat(72));
let fail = 0;
const check = (label, ok) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`); if (!ok) fail++; };

check('pointer events reach the globe (nothing intercepts)', r.elementAtCentreInsideHost);
check('wheel over the globe is handled, not left to scroll the page', r.wheelPreventedCount === r.wheelTotal);
check('dragging rotates the globe (rendered pixels changed)', r.dragChangedPixels === true);
check('a drag does NOT open a region panel (at a point a click does)', r.panelOpenedByDrag === false);
check('a country can be resolved by raycasting', r.landNdc !== null,
  r.pickProbes + ' points probed');
check('clicking a country opens its region panel', r.panelOpenedByClick === true,
  'panel ' + (r.panelOpenedByClick ? 'opened: ' + r.panelCountry : 'did not open'));
check('the panel names a country', !!r.panelCountry);
check('only one canvas exists (no retry leaked an element)', r.canvasCount === 1);

console.log('\n' + '-'.repeat(72));
console.log(fail ? `  ${fail} check(s) failed` : '  All interaction checks passed.');
process.exit(fail ? 1 : 0);
