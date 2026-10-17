'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { withBrowser } = require('./cdp.cjs');
const origin = (process.argv[2] || 'http://127.0.0.1:5184').replace(/\/$/, '');
const outDir = path.join(__dirname, '_verify', 'province');
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const helpers = `
function __h(){ return document.querySelector('[data-earth-ready="true"]'); }
function __fire(x,y,type){var h=__h(),d=h.ownerDocument,w=d.defaultView;var t=d.elementFromPoint(x,y)||h;t.dispatchEvent(new w.PointerEvent(type,{bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1}));}
function clickGeo(lon,lat){var a=__h().__earthAim;var r=a.provinceAtGeo(lon,lat);__fire(r.client.x,r.client.y,'pointermove');__fire(r.client.x,r.client.y,'pointerdown');__fire(r.client.x,r.client.y,'pointerup');return {probe:r.country,province:r.province&&r.province.nameZh,after:a.lastClick()};}
function selectGeo(lon,lat){var a=__h().__earthAim;a.provinceAtGeo(lon,lat);return a.selectAt(0,0);}
`;
withBrowser(async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__errs=[];
    window.addEventListener('error',e=>window.__errs.push('error: '+(e.message||e.error)));
    window.addEventListener('unhandledrejection',e=>window.__errs.push('rejection: '+((e.reason&&e.reason.message)||e.reason)));
    var _ce=console.error; console.error=function(){window.__errs.push('console.error: '+Array.from(arguments).map(String).join(' '));return _ce.apply(console,arguments);};
  ` });
  await page.goto(origin + '/earth'); await page.activate();
  await page.waitFor('!!document.querySelector(\'[data-earth-ready="true"]\')', 40000);
  await wait(4800); // let the entry overlay finish so the first click lands on the globe
  const report = { origin, errs: [], steps: [], ok: true };
  const note = (k, v) => report.steps.push({ [k]: v });
  const run = (body) => page.evaluate(`(function(){ ${helpers}; ${body} })()`);
  const panel = () => page.evaluate(`(function(){var p=document.querySelector('.rpanel');if(!p)return null;var c=p.querySelector('.rpanel__crumb--current');return{title:(p.querySelector('.rpanel__title')||{}).textContent,crumbs:!!p.querySelector('.rpanel__crumbs'),crumb:c?c.textContent.trim():null};})()`);

  const pac = await run(`return clickGeo(-140, 0);`);
  note('pacificClick', pac);
  await wait(400);
  const op = await page.evaluate(`!!document.querySelector('.rpanel')`);
  note('oceanOpenedPanel', op);
  if (op || pac.probe !== null || pac.province !== null) report.ok = false;

  await run(`return clickGeo(104, 35);`);
  await page.waitFor(`!!document.querySelector('.rpanel')`, 8000);
  await wait(2200);
  note('selectChina', await panel());

  const provs = [
    { geo: [101.5, 30.5], expect: '四川省' },
    { geo: [85.0, 41.0], expect: '新疆维吾尔自治区' },
    { geo: [88.0, 32.0], expect: '西藏自治区' },
    { geo: [112.0, 42.5], expect: '内蒙古自治区' },
    { geo: [99.0, 39.0], expect: '甘肃省' },
  ];
  const provRows = [];
  for (const p of provs) {
    const r = await run(`return clickGeo(${p.geo[0]}, ${p.geo[1]});`);
    await wait(450);
    const dom = await panel();
    const pass = !!(dom && dom.crumb === p.expect && r.province === p.expect && r.after && r.after.regionId === '156');
    provRows.push({ geo: p.geo, expect: p.expect, probe: r.province, domCrumb: dom && dom.crumb, pass });
    if (!pass) report.ok = false;
  }
  note('provinceClicks', provRows);
  // switching province within the same country updates the panel
  note('sameCountryProvinceSwitch', { a: provRows[0] && provRows[0].domCrumb, b: provRows[4] && provRows[4].domCrumb });

  const back = await page.evaluate(`(function(){var b=document.querySelector('.rpanel__crumbs .rpanel__crumb');if(!b)return false;b.click();return true;})()`);
  await wait(500);
  const afterBack = await panel();
  note('backToCountry', { clicked: back, after: afterBack });
  if (!back || (afterBack && afterBack.crumbs)) report.ok = false;

  const muni = [];
  for (const p of [{ geo: [121.47, 31.23], expect: '上海市' }, { geo: [116.40, 39.90], expect: '北京市' }]) {
    const id = await run(`return selectGeo(${p.geo[0]}, ${p.geo[1]});`);
    await wait(450);
    const dom = await panel();
    const pass = !!(dom && dom.crumb === p.expect);
    muni.push({ geo: p.geo, expect: p.expect, selectedId: id, domCrumb: dom && dom.crumb, pass });
    if (!pass) report.ok = false;
  }
  note('municipalityResolve', muni);

  await run(`return clickGeo(116.4, 39.9);`);
  await wait(600);
  note('cityPriority', await page.evaluate(`(function(){var c=document.querySelector('.epure__city');return c?{title:(c.querySelector('.epure__city-title')||{}).textContent}:null;})()`));

  await run(`return clickGeo(104, 35);`);
  await wait(2400);
  note('reselectChina', await panel());
  const eg = await run(`return clickGeo(28.5, 26);`);
  await wait(1600);
  note('switchCountryToEgypt', { probe: eg.probe, after: eg.after, panel: await panel() });
  if (!eg.after || eg.after.regionId !== '818') report.ok = false;

  note('contracts', await page.evaluate(`(function(){var a=document.querySelector('[data-earth-ready="true"]').__earthAim;a.provinceAtGeo(104,35);return{q:a.queryAt(0,0),p:a.pickAt(0,0)&&a.pickAt(0,0).id};})()`));

  report.errs = await page.evaluate(`window.__errs||[]`);
  if (report.errs.length) report.ok = false;
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  return report;
}).catch((e) => { console.error('VERIFY FAILED:', e.message); process.exit(1); });
