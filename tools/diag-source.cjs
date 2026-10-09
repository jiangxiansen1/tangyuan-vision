/**
 * diag-source.cjs — inspect the vector source inside the live map.
 *
 * The network evidence narrowed this down: the style document loads (1 request), the
 * glyph server is used (1 request), the raster globe renders (35 tiles) — and NOT ONE
 * vector tile is requested. Glyphs being fetched means a text layer believes it has
 * something to label, so the layer graph exists; what is missing is the tile data
 * underneath it.
 *
 * Three candidates remain, and each has a different fix, so this asks the map itself
 * rather than guessing:
 *
 *   - the source's TileJSON never resolved into a tile template
 *   - the source resolved but reports minzoom above the current zoom, so no tile is
 *     ever needed
 *   - the source-layer names in the style do not exist in the served tiles, so every
 *     layer draws nothing and MapLibre culls the tiles
 *
 * MapLibre stores its Map instance on the container element, so the source's own
 * state is readable from the page.
 */

'use strict';

const { withBrowser } = require('./cdp.cjs');

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');

(async () => {
  console.log(`\ninspecting the vector source at ${origin}/earth\n`);

  const out = await withBrowser(async (page) => {
    await page.goto(`${origin}/earth`);
    await page.activate();
    await page.waitFor('!!document.querySelector(".mglobe")', 40000);
    await page.waitFor(
      `(function(){var h=document.querySelector('.mglobe');var s=h&&h.getAttribute('data-status');return s==='ready'||s==='failed'?s:false;})()`,
      90000
    );
    await new Promise((r) => setTimeout(r, 9000));

    return page.evaluate(`(function () {
      var el = document.querySelector('.mglobe__canvas');
      var aim = el && el.__mapAim;
      if (!aim || !aim.debug) return { error: 'no __mapAim.debug handle on the component' };
      return aim.debug();
    })()`);
  });

  if (out.error) {
    console.log('  ' + out.error);
    console.log('  container keys:', JSON.stringify(out.containerKeys));
    return;
  }

  console.log(`  zoom ${out.zoom}  center ${JSON.stringify(out.center)}`);
  console.log(`  projection: ${JSON.stringify(out.projection)}`);
  console.log('');
  console.log(`  sources (${out.sourceIds.length}):`);
  for (const [id, s] of Object.entries(out.sources)) {
    console.log(`    "${id}"`);
    console.log(`       type        : ${s.type}`);
    console.log(`       loaded      : ${s.loaded}`);
    console.log(`       tiles       : ${s.tiles ? s.tiles[0] : '(none resolved)'}`);
    console.log(`       min/maxzoom : ${s.minzoom} / ${s.maxzoom}`);
    console.log(`       tile records: ${s.hasVectorData}`);
  }
  console.log('');
  console.log(`  layers (${out.layers.length}):`);
  for (const l of out.layers) {
    console.log(`    ${String(l.id).padEnd(16)} source=${l.source} layer=${l.sourceLayer || '-'} minzoom=${l.minzoom}`);
  }
  console.log('');
})().catch((e) => {
  console.error('  diagnostic failed:', e.message);
  process.exit(1);
});
