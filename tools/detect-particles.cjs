/**
 * detect-particles.cjs — is the particle field painting, measured from a screenshot?
 *
 * WHY THIS INSTEAD OF A DOM PROBE
 * The DOM probe could not run cleanly, and a probe that cannot run proves nothing.
 * A screenshot is direct evidence, and it answers the only question that matters:
 * are there small bright points on the page that the smooth backdrop does not
 * explain?
 *
 * HOW IT DISTINGUISHES PARTICLES FROM THE BACKDROP
 * The backdrop is a smooth multi-stop gradient — it varies slowly across hundreds of
 * pixels. A particle is the opposite: a few pixels that are much brighter than their
 * immediate neighbours. So the test is LOCAL CONTRAST (a pixel minus the median of
 * its neighbourhood), not absolute brightness. A bright gradient region has low
 * local contrast; a mote has high local contrast.
 *
 * A control region is included for calibration: if the detector fires on the
 * backdrop outside the field, the threshold is wrong and the result is discarded
 * rather than reported.
 *
 * Usage: node tools/detect-particles.cjs <screenshot.png>
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

function loadSharp() {
  for (const c of [
    path.resolve(__dirname, '..', 'node_modules', 'sharp'),
    'E:/AI/DSH/DSH Desktop/resources/app/node_modules/sharp',
    'sharp',
  ]) {
    try { return require(c); } catch { /* next */ }
  }
  console.error('FATAL: sharp unavailable');
  process.exit(1);
}
const sharp = loadSharp();

const file = process.argv[2];
if (!file || !fs.existsSync(file)) {
  console.error('usage: node tools/detect-particles.cjs <screenshot.png>');
  process.exit(1);
}

(async () => {
  const img = sharp(file);
  const meta = await img.metadata();
  const { data, info } = await img.raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const ch = info.channels;

  const luma = (i) => {
    const o = i * ch;
    // Rec. 709 luma; the field is near-white on near-black, so this is faithful.
    return 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
  };

  console.log(`\n  image: ${path.basename(file)}  ${W}x${H}  channels=${ch}`);
  console.log(`  ${meta.format}, ${(fs.statSync(file).size / 1024).toFixed(0)} KB\n`);

  /*
   * A particle is a local maximum that stands out from a 9x9 neighbourhood.
   * Sampling every pixel is unnecessary and slow; a stride of 1 over the interior
   * is fine because the image is only ~1400 wide.
   */
  const RAD = 4;
  const LOCAL_DELTA = 26; // luma units above the local median

  function scan(x0, y0, x1, y1) {
    const hits = [];
    for (let y = y0 + RAD; y < y1 - RAD; y += 1) {
      for (let x = x0 + RAD; x < x1 - RAD; x += 1) {
        const i = y * W + x;
        const v = luma(i);
        // Cheap pre-filter: a mote must be reasonably bright in absolute terms.
        if (v < 40) continue;

        // Local median over a sparse sample of the ring, which rejects a mote that
        // is merely part of a large bright object.
        const ring = [];
        for (let dy = -RAD; dy <= RAD; dy += 2) {
          for (let dx = -RAD; dx <= RAD; dx += 2) {
            if (dx === 0 && dy === 0) continue;
            ring.push(luma((y + dy) * W + (x + dx)));
          }
        }
        ring.sort((a, b) => a - b);
        const median = ring[Math.floor(ring.length / 2)];
        if (v - median < LOCAL_DELTA) continue;

        /*
         * ISOLATION TEST.
         *
         * A text edge or a gradient ridge is a RUN of similarly bright pixels; a
         * particle is a single isolated peak. Counting how many of the 8 immediate
         * neighbours are also well above the local median separates the two, and it
         * is what the first version lacked — which is why it mistook a letter stroke
         * for thousands of motes.
         */
        let brightNeighbours = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const ni = (y + dy) * W + (x + dx);
            const nv = luma(ni);
            if (nv < 40 || nv - median >= LOCAL_DELTA * 0.75) brightNeighbours++;
          }
        }
        // Fewer than five bright neighbours means it stands alone.
        if (brightNeighbours >= 5) continue;

        hits.push({ x, y, v: Math.round(v), d: Math.round(v - median) });
      }
    }
    return hits;
  }

  /*
   * Regions.
   *
   * The field spans the viewport, but most of it is covered by the brand, the two
   * glass panes and the lower entries. The cleanest place to look for motes is the
   * empty background: the strip between the top of the page and the panes, and the
   * gap between the brand and the panes.
   */
  /*
   * Bands chosen to contain BACKDROP ONLY.
   *
   * The earlier regions overlapped the brand text and the two panes, so most
   * "detections" were glyph edges. These strips are the actual empty background:
   *
   *   - the top band, above the first row of content (below the chrome, above the panes)
   *   - the left gutter, outside the photography pane
   *   - the right gutter, outside the Earth pane
   *   - the band between the brand column and the Earth pane
   */
  const regions = {
    'top band': [12, 108, W - 12, 140],
    'left gutter': [12, 300, 40, 560],
    'right gutter': [W - 40, 300, W - 12, 560],
    'band right of brand': [1000, 300, 1030, 420],
  };

  const results = {};
  for (const [name, r] of Object.entries(regions)) {
    const [x0, y0, x1, y1] = r.map((n) => Math.max(0, Math.min(n, name.includes('W') ? W : W)));
    const hits = scan(x0, Math.min(y0, H - 1), Math.min(x1, W), Math.min(y1, H - 1));
    results[name] = hits;
    const area = (Math.min(x1, W) - x0) * (Math.min(y1, H) - y0);
    console.log(
      `  ${name.padEnd(28)} ${String(hits.length).padStart(5)} local maxima in ${area.toLocaleString()} px` +
        `  (${((hits.length / Math.max(area, 1)) * 1e4).toFixed(2)} per 10k px)`
    );
  }

  /*
   * Calibration: the same detector pointed at a region with NO field should find
   * almost nothing. The page's own top-left corner is empty background. If it finds
   * motes there too, the threshold is measuring noise and the run is inconclusive.
   */
  const control = scan(10, 10, 200, 60);
  console.log(`  ${'control (page corner)'.padEnd(28)} ${String(control.length).padStart(5)} local maxima  <- calibration`);

  const totalHits = Object.values(results).reduce((s, h) => s + h.length, 0);

  console.log('');
  if (control.length > 2) {
    console.log('  INCONCLUSIVE — the detector fires on the plain backdrop too, so it');
    console.log('  cannot distinguish particles from gradient banding at this threshold.');
    process.exit(2);
  }
  if (totalHits === 0) {
    console.log('  NO PARTICLES DETECTED in the sampled background regions.');
    process.exit(1);
  }
  console.log(`  DETECTED ${totalHits} candidate particles, with the control region clean.`);
  console.log('  Sample detections:', JSON.stringify(Object.values(results).flat().slice(0, 6)));
})();
