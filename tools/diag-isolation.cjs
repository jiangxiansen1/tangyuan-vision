/**
 * diag-isolation.cjs — is the vector-source problem caused by the GLOBE projection?
 *
 * The app-level evidence: the style is accepted, globe projection is active, 35 raster
 * tiles load and render, the legend switches to the vector basemap at z12 — and not one
 * vector tile is requested. Meanwhile the tile directory is current and a z12 tile for
 * Beijing returns HTTP 200 with 8.1 KB of real vector data.
 *
 * That leaves the projection as the variable. This loads a standalone page with the
 * same source and two trivially visible vector layers, then switches that SAME map to
 * Mercator. If tiles only start arriving after the switch, the projection is the cause.
 *
 * TWO MECHANISM DETAILS THAT COST REAL TIME, RECORDED SO THEY DO NOT COST IT AGAIN:
 *
 *  1. MapLibre is imported from a copy placed in `public/`, NOT from `/node_modules`
 *     and NOT from a CDN.
 *       - Requests under `/node_modules` or `/@fs` are answered by Vite's SPA fallback
 *         with index.html (verified: 5881 bytes of HTML), so a bare module import
 *         silently failed and the page never executed.
 *       - The CDN is unreachable from this headless browser (verified: "Failed to
 *         fetch dynamically imported module" from cdn.jsdelivr.net), which is consistent
 *         with the npm registry being reachable but not every CDN.
 *     A copy in `public/` is served raw at the site root and needs no network.
 *
 *  2. The worker file must be copied ALONGSIDE the bundle. The ESM build resolves
 *     `maplibre-gl-worker.mjs` as a sibling, so copying only the main file produces a
 *     map that renders a basemap and nothing else — the same silent symptom.
 *
 * The fixture and the copies are removed afterwards so nothing can be published.
 */

'use strict';

const path = require('node:path');
const fs = require('node:fs');
const { withBrowser } = require(path.join(__dirname, 'cdp.cjs'));

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const dist = path.join(root, 'node_modules', 'maplibre-gl', 'dist');

const COPIES = ['maplibre-gl.mjs', 'maplibre-gl-worker.mjs'].map((name) => ({
  from: path.join(dist, name),
  // Original filename, deliberately: the bundle derives its worker URL from this name.
  to: path.join(publicDir, name),
}));

const fixture = path.join(publicDir, '__isolation.html');

const HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>maplibre isolation</title>
<style>html,body{margin:0;background:#111;color:#ddd;font:12px monospace}
#map{width:1100px;height:620px}pre{padding:10px;white-space:pre-wrap}</style></head>
<body>
<pre id="out">running</pre>
<div id="map"></div>
<script type="module">
/*
 * The ESM build has NO default export — verified by running it: "The requested module
 * '/__maplibre-gl.mjs' does not provide an export named 'default'". Named imports work.
 */
import { Map as MlMap } from '/maplibre-gl.mjs';

const log = [];
const say = (s) => { log.push(s); document.getElementById('out').textContent = log.join('\\n'); };
window.addEventListener('error', (e) => say('WINDOW ERROR: ' + e.message));
window.addEventListener('unhandledrejection', (e) => say('REJECTION: ' + ((e.reason && e.reason.message) || e.reason)));

const TILES = 'https://tiles.openfreemap.org/planet/20261004_113936_pt/{z}/{x}/{y}.pbf';
const VEC = /openfreemap\\.org\\/planet\\/[^?]*\\/\\d+\\/\\d+\\/\\d+\\.pbf/;
const countVec = () => (performance.getEntriesByType('resource') || []).filter((r) => VEC.test(r.name));

function makeStyle(projectionType) {
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    projection: { type: projectionType },
    sources: { omt: { type: 'vector', tiles: [TILES], minzoom: 0, maxzoom: 14 } },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': '#05070a' } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water',
        paint: { 'fill-color': '#1d4ed8', 'fill-opacity': 0.9 } },
      { id: 'borders', type: 'line', source: 'omt', 'source-layer': 'boundary',
        paint: { 'line-color': '#ff9f1c', 'line-width': 1.6 } },
    ],
  };
}

function features() {
  try { return map.queryRenderedFeatures({ layers: ['water', 'borders'] }).length; }
  catch (e) { return 'query threw: ' + e.message; }
}

say('maplibre module loaded');
say('creating map, projection = globe, zoom 12 over Beijing');

const map = new MlMap({
  container: 'map', style: makeStyle('globe'),
  center: [116.4, 39.9], zoom: 12, attributionControl: false,
});
map.on('error', (e) => say('MAP ERROR: ' + ((e && e.error && e.error.message) || String(e))));
map.on('load', () => { say('LOAD fired (globe)'); setTimeout(step1, 13000); });

function step1() {
  say('');
  say('--- GLOBE ---');
  say('vector tile requests : ' + countVec().length);
  say('rendered features    : ' + features());
  say('source loaded        : ' + (() => { try { return map.isSourceLoaded('omt'); } catch (e) { return 'threw'; } })());
  say('');
  say('switching the same map to MERCATOR');
  try { map.setProjection({ type: 'mercator' }); } catch (e) { say('setProjection threw: ' + e.message); }
  setTimeout(step2, 13000);
}

function step2() {
  say('');
  say('--- MERCATOR ---');
  say('vector tile requests : ' + countVec().length);
  say('rendered features    : ' + features());
  countVec().slice(-2).forEach((r) => say('    ' + String(r.transferSize || 0).padStart(8) + 'B  ' + r.name.slice(0, 106)));
  say('');
  say('DONE');
}
</script></body></html>`;

let created = [];

async function run() {
  try {
    for (const c of COPIES) {
      if (!fs.existsSync(c.from)) throw new Error(`missing source file: ${c.from}`);
      fs.copyFileSync(c.from, c.to);
      created.push(c.to);
    }
    fs.writeFileSync(fixture, HTML, 'utf8');
    created.push(fixture);

    console.log(`\nisolating the vector source at ${origin}/__isolation.html\n`);

    const text = await withBrowser(async (page) => {
      page.ws.addEventListener('message', (ev) => {
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }
        if (m.method === 'Runtime.consoleAPICalled') {
          const t = (m.params.args || [])
            .map((a) => (a.value !== undefined ? String(a.value) : a.description))
            .join(' ');
          if (!/vite|DevTools/.test(t)) console.log(`    [console] ${t.slice(0, 220)}`);
        }
        if (m.method === 'Runtime.exceptionThrown') {
          const d = m.params.exceptionDetails;
          console.log(
            `    [exception] ${((d.exception && d.exception.description) || d.text || '').split('\n')[0].slice(0, 220)}`
          );
        }
      });

      await page.goto(`${origin}/__isolation.html`);
      await page
        .waitFor(`document.getElementById('out').textContent.indexOf('DONE') !== -1`, 160000, 1000)
        .catch(() => null);
      return page.evaluate(`document.getElementById('out').textContent`);
    });

    console.log('');
    for (const line of String(text).split('\n')) console.log(`  ${line}`);
    console.log('');
  } catch (e) {
    console.error('  failed:', e.message);
    process.exitCode = 1;
  } finally {
    for (const f of created) {
      try { fs.unlinkSync(f); } catch { /* already gone */ }
    }
  }
}

void run();
