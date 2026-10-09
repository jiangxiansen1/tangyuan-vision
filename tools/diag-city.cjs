/**
 * diag-city.cjs — why are no vector tiles requested at city zoom?
 *
 * State of the evidence:
 *   - the map reaches ready, projection is globe, the legend switches to the vector
 *     basemap at z12, the satellite layer keeps loading (37 tiles)
 *   - NOT ONE vector tile is requested, even where the style says the vector layers
 *     should be drawing
 *
 * The legend switching proves the component saw the zoom change, so this is not a
 * wiring problem. What is left is either
 *   (a) the source has no usable tile template, so MapLibre has nothing to request, or
 *   (b) the requests happen but a FAILED request leaves no resource-timing entry...
 *       which is false in Chromium: failures are recorded, usually with transferSize 0.
 *
 * So this asks the map what it thinks, at the city zoom, and fetches the tile the map
 * itself says it would use. One of those answers is the bug.
 */

'use strict';

const path = require('node:path');
const { withBrowser } = require(path.join(__dirname, 'cdp.cjs'));

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log(`\ncity-zoom diagnosis at ${origin}/earth\n`);

  const out = await withBrowser(async (page) => {
    await page.goto(`${origin}/earth`);
    await page.waitFor('!!document.querySelector(".mglobe")', 40000);
    await page.waitFor(`!!document.querySelector('.mglobe[data-map-ready="true"]')`, 60000);
    await sleep(5000);

    // Zoom to Beijing through the component's handle.
    await page.evaluate(
      `(function(){var c=document.querySelector('.mglobe');if(c&&c.__mapAim)c.__mapAim.face(116.4,39.9,12);return true;})()`
    );
    await sleep(15000);

    return page.evaluate(`(function () {
      var el = document.querySelector('.mglobe');
      var d = el.__mapAim.debug();
      var res = performance.getEntriesByType('resource') || [];
      var ofm = [];
      for (var i = 0; i < res.length; i++) {
        if (res[i].name.indexOf('openfreemap') !== -1) {
          ofm.push({ url: res[i].name.slice(0, 130), size: res[i].transferSize || 0,
                     dur: Math.round(res[i].duration) });
        }
      }
      return { debug: d, openfreemapRequests: ofm, totalRequests: res.length };
    })()`);
  });

  console.log(`  zoom ${out.debug.zoom}   center ${JSON.stringify(out.debug.center)}`);
  console.log(`  projection ${JSON.stringify(out.debug.projection)}`);
  console.log('');
  console.log('  sources as the map reports them:');
  for (const [id, s] of Object.entries(out.debug.sources)) {
    console.log(`    "${id}"  type=${s.type}`);
    console.log(`       tiles   : ${s.tiles ? s.tiles[0] : '(null — no template resolved)'}`);
    console.log(`       min/max : ${s.minzoom} / ${s.maxzoom}`);
  }
  console.log('');
  console.log(`  OpenFreeMap requests: ${out.openfreemapRequests.length}`);
  for (const r of out.openfreemapRequests) {
    console.log(`    ${String(r.size).padStart(7)}B  ${String(r.dur).padStart(6)}ms  ${r.url}`);
  }
  console.log('');
  console.log(`  total network requests: ${out.totalRequests}`);
  console.log('');

  // The decisive question: does the map have a tile template at all?
  const src = out.debug.sources.openmaptiles;
  if (!src || !src.tiles) {
    console.log('  VERDICT: the vector source resolved NO tile template, so MapLibre has');
    console.log('  nothing to request. The TileJSON fetch happens but the result is not');
    console.log('  being applied to the source.');
  } else {
    console.log('  VERDICT: the source HAS a template but no tile was requested.');
  }
  console.log('');
})().catch((e) => {
  console.error('  failed:', e.message);
  process.exit(1);
});
