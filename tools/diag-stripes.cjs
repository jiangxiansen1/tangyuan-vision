/**
 * diag-stripes.cjs — which GIBS tiles fail, and why are there black stripes?
 *
 * The globe renders with real natural-colour imagery, and it has vertical black bands
 * where tiles did not arrive. A stripe is a column of missing tiles, so the question is
 * narrow: at which zoom, and which x/y.
 *
 * Resource timing gives the URL for every raster request, and the URL contains z/y/x.
 * Rather than reason about the WMTS matrix set, this prints the failing coordinates
 * and then re-requests them directly to see the server's own answer.
 */

'use strict';

const path = require('node:path');
const { withBrowser } = require(path.join(__dirname, 'cdp.cjs'));

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');

(async () => {
  console.log(`\nGIBS tile-stripe diagnosis at ${origin}/earth\n`);

  const out = await withBrowser(async (page) => {
    const failures = [];
    page.ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.method === 'Log.entryAdded') {
        const e = m.params.entry;
        if (e.level === 'error' && /gibs/i.test(e.url || '')) failures.push(e.url);
      }
      if (m.method === 'Network.loadingFailed') failures.push('loadingFailed: ' + JSON.stringify(m.params).slice(0, 160));
    });
    await page.send('Log.enable');
    await page.send('Network.enable');

    await page.goto(`${origin}/earth`);
    await page.waitFor('!!document.querySelector(".mglobe[data-map-ready=\\"true\\"]")', 90000);
    await new Promise((r) => setTimeout(r, 12000));

    const all = await page.evaluate(`(function () {
      var res = performance.getEntriesByType('resource') || [];
      var gibs = [];
      for (var i = 0; i < res.length; i++) {
        if (res[i].name.indexOf('gibs') !== -1) gibs.push(res[i].name);
      }
      return { count: gibs.length, urls: gibs };
    })()`);
    return { all, failures };
  });

  console.log(`  GIBS requests observed: ${out.all.count}`);

  // Parse z/y/x out of the WMTS URL and summarise by zoom.
  const byZoom = new Map();
  const parsed = [];
  for (const u of out.all.urls) {
    const m = u.match(/GoogleMapsCompatible_Level9\/(\d+)\/(\d+)\/(\d+)\.jpg/);
    if (!m) continue;
    const [, z, y, x] = m;
    parsed.push({ z: +z, y: +y, x: +x });
    if (!byZoom.has(+z)) byZoom.set(+z, { n: 0, xs: new Set(), ys: new Set() });
    const e = byZoom.get(+z);
    e.n++;
    e.xs.add(+x);
    e.ys.add(+y);
  }

  console.log('');
  console.log('  by zoom:');
  for (const [z, e] of [...byZoom.entries()].sort((a, b) => a[0] - b[0])) {
    const xr = [...e.xs].sort((a, b) => a - b);
    const yr = [...e.ys].sort((a, b) => a - b);
    const full = Math.pow(2, z);
    console.log(
      `    z${z}: ${String(e.n).padStart(3)} tiles   x ${xr[0]}..${xr[xr.length - 1]}/${full - 1}` +
        `   y ${yr[0]}..${yr[yr.length - 1]}/${full - 1}`
    );
  }

  console.log('');
  console.log(`  browser-reported failures: ${out.failures.length}`);
  const seen = new Set();
  for (const f of out.failures) {
    const key = f.slice(0, 120);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(`    ${key}`);
    if (seen.size >= 10) break;
  }

  console.log('');
  console.log('  re-requesting a sample of the tiles the map asked for, to see the server answer:');
  const sample = parsed.slice(0, 8);
  for (const t of sample) {
    const u = `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-07-01/GoogleMapsCompatible_Level9/${t.z}/${t.y}/${t.x}.jpg`;
    try {
      const r = await fetch(u, { headers: { 'User-Agent': 'tangyuan-vision-probe/1.0' } });
      const b = Buffer.from(await r.arrayBuffer());
      console.log(`    z${t.z} y${t.y} x${t.x}  HTTP ${r.status}  ${(b.length / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.log(`    z${t.z} y${t.y} x${t.x}  ERR ${e.message.slice(0, 50)}`);
    }
  }
  console.log('');
})().catch((e) => {
  console.error('  failed:', e.message);
  process.exit(1);
});
