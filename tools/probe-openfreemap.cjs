/**
 * probe-openfreemap.cjs — verify the endpoints the map style depends on.
 *
 * The style in src/features/earth/map-sources.ts names three OpenFreeMap endpoints
 * that were NOT part of the earlier probe: the TileJSON document, the glyph (font)
 * server, and a specific fontstack. Guessing any of them produces a map that renders
 * basemap and no labels, or fails to initialise — and neither failure says why.
 */

const UA = 'tangyuan-vision-probe/1.0';

async function get(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' } });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, ct: res.headers.get('content-type') || '', len: buf.length, buf };
  } catch (e) {
    return { status: 0, ct: '', len: 0, err: String(e.message).slice(0, 60) };
  }
}

const TARGETS = [
  ['TileJSON (planet)', 'https://tiles.openfreemap.org/planet'],
  ['TileJSON (planet, dated path)', 'https://tiles.openfreemap.org/planet/20240924_001001_pt'],
  ['glyphs (Noto Sans Regular)', 'https://tiles.openfreemap.org/fonts/Noto%20Sans%20Regular/0-255.pbf'],
  ['glyphs (name only)', 'https://tiles.openfreemap.org/fonts/Noto Sans Regular/0-255.pbf'],
];

(async () => {
  console.log('\nprobing OpenFreeMap endpoints the map style depends on\n');

  for (const [label, url] of TARGETS) {
    const r = await get(url);
    const kb = r.len ? (r.len / 1024).toFixed(1) + ' KB' : '—';
    console.log(`  ${label.padEnd(32)} HTTP ${String(r.status).padEnd(4)} ${r.ct.slice(0, 26).padEnd(26)} ${kb.padStart(10)}  ${r.err || ''}`);

    // For the TileJSON, show what it actually declares — this is what MapLibre reads.
    if (label.startsWith('TileJSON') && r.status === 200 && r.len < 20000) {
      try {
        const j = JSON.parse(r.buf.toString('utf8'));
        console.log(`      tiles      : ${Array.isArray(j.tiles) ? j.tiles[0] : '(none)'}`);
        console.log(`      minzoom    : ${j.minzoom}   maxzoom: ${j.maxzoom}   format: ${j.format || '(unset)'}`);
        console.log(`      vector_layers: ${(j.vector_layers || []).length}`);
        if (j.vector_layers) {
          // The style's source-layers must exist in this list or the layers draw
          // nothing at all, silently.
          const wanted = ['water', 'boundary', 'transportation', 'place'];
          for (const w of wanted) {
            const found = j.vector_layers.some((v) => v.id === w);
            console.log(`        ${found ? 'found  ' : 'MISSING'} source-layer "${w}"`);
          }
        }
      } catch (e) {
        console.log(`      (could not parse TileJSON: ${String(e.message).slice(0, 50)})`);
        console.log(`      first 160 bytes: ${r.buf.toString('utf8').slice(0, 160)}`);
      }
    }
  }
  console.log('');
})();
