/**
 * diag-layers.cjs — is the BlueMarble base present, and is it drawing?
 *
 * The globe still shows swath gaps after adding an opaque, gap-free base layer beneath
 * the daily imagery. Possible causes, each with a different fix:
 *
 *   a) the `satellite_base` source was not added at all (a style construction mistake)
 *   b) it was added but no layer references it
 *   c) it draws, but the daily layers above it are opaque enough to hide it
 *   d) it draws nowhere because its own tiles fail
 *
 * Reading the layer list and each layer's source settles (a), (b) and (d) immediately.
 */

'use strict';

const path = require('node:path');
const { withBrowser } = require(path.join(__dirname, 'cdp.cjs'));

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');

(async () => {
  console.log(`\nlayer inspection at ${origin}/earth\n`);

  const r = await withBrowser(async (page) => {
    page.ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error') console.log(`    [log error] ${(e.text || '').slice(0, 150)}`);
      }
    });
    await page.send('Log.enable');

    await page.goto(`${origin}/earth`);
    await page.waitFor('!!document.querySelector(".mglobe")', 40000);
    await page.waitFor(`!!document.querySelector('.mglobe[data-map-ready="true"]')`, 90000);
    await new Promise((r) => setTimeout(r, 10000));

    return page.evaluate(`(function () {
      var el = document.querySelector('.mglobe');
      var d = el.__mapAim.debug();
      var out = { sources: [], layers: [] };
      var ids = Object.keys(d.sources);
      for (var i = 0; i < ids.length; i++) {
        var s = d.sources[ids[i]];
        out.sources.push({
          id: ids[i], type: s.type,
          tiles: s.tiles ? s.tiles[0] : null,
          minzoom: s.minzoom, maxzoom: s.maxzoom,
          loaded: el.__mapAim.sourceLoaded(ids[i])
        });
      }
      var ls = d.layers;
      for (var j = 0; j < ls.length; j++) {
        out.layers.push({ id: ls[j].id, source: ls[j].source, sourceLayer: ls[j].sourceLayer, rendered: el.__mapAim.renderedCount(ls[j].id) });
      }
      return out;
    })()`);
  });

  console.log(`  sources (${r.sources.length}):`);
  for (const s of r.sources) {
    console.log(`    "${s.id}"  type=${s.type}  loaded=${s.loaded}  zoom ${s.minzoom}-${s.maxzoom}`);
    console.log(`        ${s.tiles || '(no template)'}`);
  }
  console.log('');
  console.log(`  layers (${r.layers.length}), in draw order — LAST is drawn on TOP:`);
  for (const l of r.layers) {
    console.log(`    ${String(l.id).padEnd(18)} source=${String(l.source).padEnd(20)} rendered=${l.rendered}`);
  }
  console.log('');
})().catch((e) => {
  console.error('  failed:', e.message);
  process.exit(1);
});
