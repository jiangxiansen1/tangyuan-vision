'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { withBrowser } = require('./cdp.cjs');
const outDir = path.join(__dirname, '_verify', 'province');
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const helpers = `
function __h(){ return document.querySelector('[data-earth-ready="true"]'); }
function __fire(x,y,type){var h=__h(),d=h.ownerDocument,w=d.defaultView;var t=d.elementFromPoint(x,y)||h;t.dispatchEvent(new w.PointerEvent(type,{bubbles:true,cancelable:true,composed:true,clientX:x,clientY:y,pointerId:1,pointerType:'mouse',isPrimary:true,button:0,buttons:type==='pointerup'?0:1}));}
function clickGeo(lon,lat){var a=__h().__earthAim;var r=a.provinceAtGeo(lon,lat);__fire(r.client.x,r.client.y,'pointermove');__fire(r.client.x,r.client.y,'pointerdown');__fire(r.client.x,r.client.y,'pointerup');return {probe:r.country,province:r.province&&r.province.nameZh};}
`;
async function shot(page, name){
  const r = await page.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(outDir, name), Buffer.from(r.data, 'base64'));
}
withBrowser(async (page) => {
  const out = {};
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[];window.addEventListener('error',e=>window.__errs.push(''+(e.message||e.error)));var _ce=console.error;console.error=function(){window.__errs.push('console.error '+Array.from(arguments).map(String).join(' '));return _ce.apply(console,arguments);};` });
  // ---- desktop ----
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.goto('http://127.0.0.1:5184/earth'); await page.activate();
  await page.waitFor('!!document.querySelector(\'[data-earth-ready="true"]\')', 40000);
  await wait(4800);
  await page.evaluate(`(function(){${helpers}; return clickGeo(104,35);})()`);
  await wait(2400);
  await page.evaluate(`(function(){${helpers}; return clickGeo(101.5,30.5);})()`);
  await wait(700);
  await shot(page, 'desktop-province.png');
  out.desktop = await page.evaluate(`(function(){var p=document.querySelector('.rpanel');return {title:p&&p.querySelector('.rpanel__title').textContent, crumb:p&&p.querySelector('.rpanel__crumb--current').textContent, overflow: document.documentElement.scrollWidth>window.innerWidth, canvas:(function(){var c=document.querySelector('.eglobe__canvas');return c?[c.clientWidth,c.clientHeight]:null;})(), errs:window.__errs};})()`);
  // ---- mobile ----
  await page.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.goto('http://127.0.0.1:5184/earth'); await page.activate();
  await page.waitFor('!!document.querySelector(\'[data-earth-ready="true"]\')', 40000);
  await wait(4800);
  await page.evaluate(`(function(){${helpers}; return clickGeo(104,35);})()`);
  await wait(2400);
  await page.evaluate(`(function(){${helpers}; return clickGeo(101.5,30.5);})()`);
  await wait(700);
  await shot(page, 'mobile-province.png');
  out.mobile = await page.evaluate(`(function(){var p=document.querySelector('.rpanel');return {title:p&&p.querySelector('.rpanel__title').textContent, crumb:p&&p.querySelector('.rpanel__crumb--current').textContent, overflowX: document.documentElement.scrollWidth - window.innerWidth, canvas:(function(){var c=document.querySelector('.eglobe__canvas');return c?[c.clientWidth,c.clientHeight]:null;})(), errs:window.__errs};})()`);
  console.log(JSON.stringify(out, null, 2));
}).catch((e)=>{console.error('FAILED',e.message);process.exit(1);});
