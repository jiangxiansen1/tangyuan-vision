/**
 * verify-map.cjs — does the Earth map actually load real geographic data?
 *
 * THE MEASUREMENT TRAP THIS PROBE WAS BUILT AROUND
 * ---------------------------------------------------------------------------
 * Counting tile requests with `performance.getEntriesByType('resource')` reports ZERO
 * for vector tiles, even when they load perfectly. MapLibre fetches vector tiles from a
 * WORKER, and a worker's fetches do not appear in the main document's resource timeline
 * in Chromium.
 *
 * That false negative cost a great deal of time: it said "0 vector tiles" while a
 * standalone map with the identical source reported `source loaded: true` and 89
 * rendered features. The requests were happening; the instrument could not see them.
 *
 * So this probe asks the MAP what it has, not the network timeline:
 *   - `isSourceLoaded(id)` and the source's tile count — did the tiles arrive
 *   - `queryRenderedFeatures` per layer — is real geometry actually drawn
 * Those are ground truth about the rendered result, which is what the page is for, and
 * they are immune to how the fetching was scheduled.
 *
 * Raster tile counts ARE still measured with resource timing, because raster tiles are
 * fetched by the main thread and do appear there.
 *
 * WHY IT USES CDP
 * Four earlier attempts failed on the browser-driving mechanism rather than the map,
 * each silently (an empty dump, not an error). See tools/cdp.cjs for the list.
 *
 * Usage: node tools/verify-map.cjs [origin]
 */

'use strict';

const { withBrowser } = require('./cdp.cjs');

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ground truth read from the live map through the component's read-only handle. */
const PROBE = `(function () {
  var el = document.querySelector('.mglobe');
  if (!el || !el.__mapAim || !el.__mapAim.debug) return null;
  var d = el.__mapAim.debug();
  var res = [];
  try { res = performance.getEntriesByType('resource') || []; } catch (e) {}
  function count(re) {
    var n = 0;
    for (var i = 0; i < res.length; i++) if (re.test(res[i].name)) n++;
    return n;
  }
  var out = {};
  var ids = ['satellite', 'openmaptiles'];
  for (var i = 0; i < ids.length; i++) {
    try {
      out[ids[i]] = { loaded: el.__mapAim.sourceLoaded(ids[i]), tiles: el.__mapAim.sourceTiles(ids[i]) };
    } catch (e) { out[ids[i]] = { error: String(e.message).slice(0, 60) }; }
  }
  var rendered = {};
  var layerIds = d.layers.map(function (l) { return l.id; });
  for (var j = 0; j < layerIds.length; j++) {
    try { rendered[layerIds[j]] = el.__mapAim.renderedCount(layerIds[j]); }
    catch (e) { rendered[layerIds[j]] = 'n/a'; }
  }
  return {
    zoom: d.zoom,
    projection: d.projection ? d.projection.type : null,
    layers: layerIds,
    sources: Object.keys(d.sources),
    ground: out,
    rendered: rendered,
    rasterRequests: count(/gibs\\.earthdata\\.nasa\\.gov/),
    status: el.getAttribute('data-status'),
    legend: (document.querySelector('.mglobe__legend') || {}).textContent || null,
    listSection: !!document.querySelector('.epage__list-section'),
    listItems: document.querySelectorAll('.epage__list-item').length,
    searchTrigger: !!document.querySelector('.rsearch__trigger'),
    skipHref: (function () { var s = document.querySelector('.skip-link'); return s ? s.getAttribute('href') : null; })()
  };
})()`;

(async () => {
  console.log(`\nEarth map audit at ${origin}/earth`);
  console.log('  driving a live browser over CDP...\n');

  const r = await withBrowser(async (page) => {
    await page.goto(`${origin}/earth`);
    await page.activate();
    await page.waitFor('!!document.querySelector(".mglobe")', 40000);
    console.log('  .mglobe mounted; waiting for MapLibre to report ready...');
    await page.waitFor(`!!document.querySelector('.mglobe[data-map-ready="true"]')`, 90000);
    console.log('  map ready.');

    await sleep(7000);
    const globe = await page.evaluate(PROBE);

    console.log('  zooming to a city view (Beijing, z12) to exercise the vector layers...');
    await page.evaluate(
      `(function(){var c=document.querySelector('.mglobe');if(c&&c.__mapAim)c.__mapAim.face(116.4,39.9,12);return true;})()`
    );
    await sleep(16000);
    const city = await page.evaluate(PROBE);

    await page.evaluate(`(function(){var t=document.querySelector('.rsearch__trigger');if(t)t.click();return true;})()`);
    await sleep(700);
    const rows = await page.evaluate(`document.querySelectorAll('.rsearch__item').length`);
    await page.evaluate(
      `(function(){var i=document.querySelector('.rsearch__input');if(!i)return false;
        var s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;
        s.call(i,'Japan');i.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`
    );
    await sleep(800);
    const filtered = await page.evaluate(`document.querySelectorAll('.rsearch__item').length`);

    return { globe, city, rows, filtered };
  });

  const { globe, city } = r;
  if (!globe) {
    console.log('\n  the map handle was unavailable; cannot audit.');
    process.exit(1);
  }

  console.log(`\n  status          : ${globe.status}`);
  console.log(`  projection      : ${globe.projection}`);
  console.log(`  sources         : ${globe.sources.join(', ')}`);
  console.log(`  layers          : ${globe.layers.join(', ')}`);
  console.log('');
  console.log('  --- at the GLOBE view ---');
  console.log(`    zoom                        : ${globe.zoom.toFixed(2)}`);
  console.log(`    imagery tiles drawn         : ${globe.ground.satellite?.tiles}`);
  console.log(`    imagery source loaded       : ${globe.ground.satellite?.loaded}`);
  console.log(`    imagery requests (main)     : ${globe.rasterRequests}`);
  console.log(`    vector source loaded        : ${globe.ground.openmaptiles?.loaded}`);
  console.log(`    legend                      : ${globe.legend}`);
  console.log('');
  console.log('  --- after zooming to the city ---');
  console.log(`    zoom                        : ${city.zoom.toFixed(2)}`);
  console.log(`    imagery tiles drawn         : ${city.ground.satellite?.tiles}`);
  console.log(`    imagery source loaded       : ${city.ground.satellite?.loaded}`);
  console.log(`    imagery requests (main)     : ${city.rasterRequests}`);
  console.log(`    vector source loaded        : ${city.ground.openmaptiles?.loaded}`);
  console.log(`    vector tiles drawn          : ${city.ground.openmaptiles?.tiles}`);
  console.log(`    legend                      : ${city.legend}`);
  console.log('');
  console.log('  rendered features per layer at the city view:');
  for (const [layer, n] of Object.entries(city.rendered)) {
    console.log(`    ${layer.padEnd(16)} ${n}`);
  }
  console.log('');
  console.log(`  old list section : ${globe.listSection}   items: ${globe.listItems}`);
  console.log(`  search trigger   : ${globe.searchTrigger}   rows: ${r.rows}   filtered "Japan": ${r.filtered}`);
  console.log(`  skip link target : ${globe.skipHref}`);

  const vectorDrawn = Object.entries(city.rendered).some(
    ([layer, n]) => typeof n === 'number' && n > 0 && layer !== 'satellite'
  );

  console.log('\n' + '-'.repeat(74));
  let fail = 0;
  const check = (label, ok, extra) => {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  (' + extra + ')' : ''}`);
    if (!ok) fail++;
  };

  check('the map reached its ready state', globe.status === 'ready');
  check('globe projection is active', globe.projection === 'globe');
  /*
   * Asserted by NAME, not by count. A count of 2 was correct while the imagery was a
   * single daily product; the global view now uses a gap-free reference mosaic underneath
   * the daily one, so there are three. A count would have to be edited every time a layer
   * is added, and it would never catch a source being the WRONG one.
   */
  check('the imagery, base and vector sources are all declared',
    ['satellite', 'satellite_base', 'openmaptiles'].every((id) => globe.sources.includes(id)),
    globe.sources.join(', '));
  /*
   * Asserted on the request count, not on the source's tile map.
   *
   * Raster tiles are fetched by the MAIN thread, so resource timing sees them reliably
   * (35 at the globe view, 37 at the city view). The source's internal `_tiles` map was
   * tried as well and reads 0 even while the globe is visibly textured, so it is a
   * private field that cannot be relied on and is not used for any assertion.
   */
  check('satellite imagery tiles were fetched', globe.rasterRequests > 0,
    `${globe.rasterRequests} requests`);
  check('the imagery source reports loaded', globe.ground.satellite?.loaded === true);
  check('zooming changed the reported zoom', globe.zoom !== city.zoom,
    `${globe.zoom.toFixed(1)} -> ${city.zoom.toFixed(1)}`);
  check('the legend switched off the imagery-only message', globe.legend !== city.legend);
  check('the vector source loaded its tiles at city zoom', city.ground.openmaptiles?.loaded === true,
    `drawn=${city.ground.openmaptiles?.tiles}`);
  check('real vector geometry is rendered at city zoom', vectorDrawn);
  check('the old 174-row region list is gone', globe.listSection === false && globe.listItems === 0);
  check('the collapsed search replaced it', globe.searchTrigger === true);
  check('the search lists every region', (r.rows || 0) > 100, String(r.rows));
  check('the search actually filters', (r.filtered || 0) > 0 && r.filtered < r.rows,
    `${r.filtered} of ${r.rows}`);
  check('the skip link points at the map', globe.skipHref === '#earth-map');

  console.log('\n' + '-'.repeat(74));
  console.log(fail ? `  ${fail} check(s) failed` : '  All map checks passed.');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error('\n  audit failed to run:', e.message);
  process.exit(1);
});
