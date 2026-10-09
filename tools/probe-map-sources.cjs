/**
 * probe-map-sources.cjs — verify map imagery sources before recommending them.
 *
 * WHY MEASURE INSTEAD OF QUOTE THE DOCS
 * A tile URL in a doc is not a working tile endpoint. What decides whether a source
 * is usable here is: does it answer without a key, what is the REAL maximum zoom
 * before it returns blanks, and does it send CORS headers.
 *
 * THE PROBE POINTS ARE CITIES, ON PURPOSE
 * The first version of this sampled the tile nearest the middle of the world, which
 * at high zoom is open ocean. Ocean tiles are legitimately tiny — near-empty vector
 * tiles and flat blue imagery — so the probe read "496 bytes at z12" and would have
 * reported that a perfectly good source had no detail at city zoom. It was
 * measuring water.
 *
 * So every probe now targets a real city, where the answer means something.
 *
 * WHY NOT POWERSHELL
 * Three attempts through Invoke-WebRequest failed with mojibake'd host errors that
 * had nothing to do with the endpoints and made every source look dead. Node's
 * fetch and the OS curl are independent of that, so they are used instead.
 *
 * Usage: node tools/probe-map-sources.cjs
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const outDir = path.join(__dirname, '_verify', 'map');
fs.mkdirSync(outDir, { recursive: true });
const UA = 'tangyuan-vision-probe/1.0 (personal site build research)';

/** Web Mercator tile coordinates for a lon/lat, which is the standard slippy-map maths. */
function tileFor(lon, lat, z) {
  const n = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Real places, so a small response means "no data", not "this is the sea". */
const PLACES = [
  { name: '北京', lon: 116.4074, lat: 39.9042 },
  { name: '伦敦', lon: -0.1276, lat: 51.5072 },
];

const SOURCES = [
  {
    name: 'NASA GIBS — MODIS Terra TrueColor (EPSG:3857, Level9)',
    note: 'NASA Earthdata. Full and open data, acknowledgement requested, no key.',
    url: (z, x, y) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-07-01/GoogleMapsCompatible_Level9/${z}/${y}/${x}.jpg`,
    zooms: [0, 5, 8, 9, 10],
    place: 0,
  },
  {
    name: 'NASA GIBS — MODIS Terra TrueColor (EPSG:4326, 250m)',
    note: 'The geographic matrix set. Tests whether a non-Mercator matrix goes deeper.',
    url: (z, x, y) =>
      `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/2024-07-01/250m/${z}/${y}/${x}.jpg`,
    zooms: [5, 7, 8, 9, 10],
    place: 0,
  },
  {
    name: 'OpenFreeMap — vector tile (pbf)',
    note: 'MIT, no key, no stated limits, OpenStreetMap data. Streets, not imagery.',
    url: (z, x, y) => `https://tiles.openfreemap.org/planet/20240924_001001_pt/${z}/${x}/${y}.pbf`,
    zooms: [5, 10, 12, 14, 15, 16],
    place: 0,
  },
  {
    name: 'Esri World Imagery (unauthenticated)',
    note: 'Included to DOCUMENT licensing reality, NOT to recommend.',
    url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`,
    zooms: [5, 12, 15, 17, 19],
    place: 0,
  },
];

async function viaFetch(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, redirect: 'follow' });
    const buf = Buffer.from(await res.arrayBuffer());
    return {
      status: res.status,
      ct: (res.headers.get('content-type') || '').split(';')[0],
      len: buf.length,
      cors: res.headers.get('access-control-allow-origin') || '',
      via: 'fetch',
    };
  } catch (e) {
    return { status: 0, ct: '', len: 0, cors: '', via: 'fetch', err: String(e.message).slice(0, 50) };
  }
}

function viaCurl(url) {
  try {
    const out = execFileSync(
      'curl.exe',
      ['-sS', '-L', '--max-time', '40', '-A', UA, '-o', 'NUL', '-w', '%{http_code}|%{content_type}|%{size_download}', url],
      { encoding: 'utf8', timeout: 50000 }
    ).trim();
    const [status, ct, size] = out.split('|');
    return { status: Number(status) || 0, ct: (ct || '').split(';')[0], len: Number(size) || 0, cors: '', via: 'curl' };
  } catch (e) {
    return { status: 0, ct: '', len: 0, cors: '', via: 'curl', err: String(e.message).slice(0, 50) };
  }
}

async function probe(url) {
  const a = await viaFetch(url);
  if (a.status > 0) return a;
  const b = viaCurl(url);
  return b.status > 0 ? b : a;
}

(async () => {
  const place = PLACES[0];
  console.log(`\nprobing map sources — real HTTP, no key`);
  console.log(`probe location: ${place.name}  (${place.lat}, ${place.lon})\n`);

  const results = [];
  for (const src of SOURCES) {
    console.log(`  ${src.name}`);
    console.log(`      ${src.note}`);
    const perZoom = [];
    for (const z of src.zooms) {
      const { x, y } = tileFor(place.lon, place.lat, z);
      const p = await probe(src.url(z, x, y));
      perZoom.push({ z, x, y, ...p });
      const kb = p.len ? (p.len / 1024).toFixed(1) + ' KB' : '—';
      console.log(
        `      z${String(z).padStart(2)}  tile ${x}/${y}  HTTP ${String(p.status).padEnd(3)} ${p.ct.padEnd(20)} ${kb.padStart(9)}  CORS=${p.cors || '(none)'}${p.err ? '  ' + p.err : ''}`
      );
    }
    results.push({ name: src.name, note: src.note, perZoom });
    console.log('');
  }

  /* Second location, to make sure a finding is not one city's quirk. */
  console.log(`  cross-check at ${PLACES[1].name} (vector tiles only)`);
  const vector = SOURCES.find((s) => s.name.includes('OpenFreeMap'));
  for (const z of [12, 15]) {
    const { x, y } = tileFor(PLACES[1].lon, PLACES[1].lat, z);
    const p = await probe(vector.url(z, x, y));
    console.log(`      z${z}  tile ${x}/${y}  HTTP ${p.status}  ${(p.len / 1024).toFixed(1)} KB`);
  }

  fs.writeFileSync(path.join(outDir, 'sources.json'), JSON.stringify(results, null, 2));

  console.log('\n  ' + '-'.repeat(78));
  console.log('  SUMMARY\n');
  for (const r of results) {
    const ok = r.perZoom.filter((p) => p.status === 200);
    const real = ok.filter((p) => p.len > 3000);
    const cors = ok.some((p) => p.cors && p.cors !== '');
    console.log(`    ${r.name}`);
    console.log(`      HTTP 200 at zooms        : ${ok.map((p) => p.z).join(', ') || 'none'}`);
    console.log(`      real payload (>3KB)      : ${real.map((p) => p.z).join(', ') || 'none'}`);
    console.log(`      CORS                     : ${cors ? 'present' : 'none seen'}`);
    const errs = r.perZoom.filter((p) => p.status >= 400);
    if (errs.length) console.log(`      HTTP errors              : ${errs.map((p) => `z${p.z}->${p.status}`).join(', ')}`);
    const tiny = ok.filter((p) => p.len > 0 && p.len <= 3000);
    if (tiny.length) console.log(`      thin payload (<=3KB)     : ${tiny.map((p) => `z${p.z}=${p.len}B`).join(', ')}`);
  }
  console.log('\n  Raw results: tools/_verify/map/sources.json');
})();
