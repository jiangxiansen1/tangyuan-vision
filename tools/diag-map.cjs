/**
 * diag-map.cjs — why does the map stay in `loading`?
 *
 * The map component mounts and its `data-status` never leaves 'loading', which means
 * MapLibre's `load` event never fired. That is exactly the situation the audit cannot
 * explain on its own: it says "not ready", not "why".
 *
 * This attaches to the same browser over CDP, captures console messages and page
 * exceptions, and inspects the live map object for how far it got. The distinction
 * that matters is between:
 *
 *   - the style document never arriving (network / CORS / 404)
 *   - the style arriving but being REJECTED (a bad layer, an unknown source-layer,
 *     a font stack that does not exist)
 *   - the style being accepted but tiles failing
 *
 * Each has a different fix, and the page only reports the first.
 */

'use strict';

const { withBrowser } = require('./cdp.cjs');

const origin = (process.argv[2] || 'http://127.0.0.1:5183').replace(/\/$/, '');

(async () => {
  console.log(`\ndiagnosing the map at ${origin}/earth\n`);

  const out = await withBrowser(async (page) => {
    const logs = [];
    const errors = [];

    // Console and exceptions come through as CDP events; the Page class only routes
    // replies, so the raw socket is used for these.
    page.ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.method === 'Runtime.consoleAPICalled') {
        const text = (m.params.args || [])
          .map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type))
          .join(' ');
        logs.push(`[${m.params.type}] ${text}`);
      }
      if (m.method === 'Runtime.exceptionThrown') {
        const d = m.params.exceptionDetails;
        errors.push((d.exception && d.exception.description) || d.text || 'unknown');
      }
    });

    await page.goto(`${origin}/earth`);
    await page.activate();
    await page.waitFor('!!document.querySelector(".mglobe")', 40000);

    // Let it try for a while, collecting everything it complains about.
    await new Promise((r) => setTimeout(r, 25000));

    const state = await page.evaluate(`(function () {
      var host = document.querySelector('.mglobe');
      var canvasHost = document.querySelector('.mglobe__canvas');
      var aim = canvasHost ? canvasHost.__mapAim : null;
      var res = [];
      try { res = performance.getEntriesByType('resource') || []; } catch (e) {}
      function names(re) {
        var o = [];
        for (var i = 0; i < res.length; i++) if (re.test(res[i].name)) o.push(res[i].name.slice(0, 120));
        return o;
      }
      return {
        status: host ? host.getAttribute('data-status') : null,
        hostClass: host ? host.className : null,
        canvasHostChildren: canvasHost ? canvasHost.children.length : -1,
        canvasHostHTML: canvasHost ? canvasHost.innerHTML.slice(0, 300) : null,
        maplibreNodes: document.querySelectorAll('.maplibregl-map').length,
        canvasCount: document.querySelectorAll('.mglobe__canvas canvas').length,
        hasAim: !!aim,
        styleRequests: names(/openfreemap\\.org\\/planet(\\?|$)/),
        tileRequests: names(/openfreemap\\.org\\/planet\\/[0-9]/).length,
        gibsRequests: names(/gibs\\.earthdata/).length,
        glyphRequests: names(/openfreemap\\.org\\/fonts/).length,
        failed: names(/undefined|NaN/).length
      };
    })()`);

    return { state, logs, errors };
  });

  console.log('  live page state:');
  for (const [k, v] of Object.entries(out.state)) {
    console.log(`    ${k.padEnd(20)} : ${JSON.stringify(v)}`);
  }

  console.log('');
  console.log(`  console messages: ${out.logs.length}`);
  for (const l of out.logs.slice(0, 25)) console.log(`    ${l.slice(0, 160)}`);

  console.log('');
  console.log(`  page exceptions: ${out.errors.length}`);
  for (const e of out.errors.slice(0, 8)) {
    console.log(`    ${e.split('\n')[0].slice(0, 200)}`);
  }
  console.log('');
})().catch((e) => {
  console.error('  diagnostic failed:', e.message);
  process.exit(1);
});
