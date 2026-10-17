'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { withBrowser } = require('./cdp.cjs');
const outDir = path.join(__dirname, '_verify', 'photography');
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
withBrowser(async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__errs=[];window.addEventListener('error',e=>window.__errs.push(''+(e.message||e.error)));var _ce=console.error;console.error=function(){window.__errs.push('console.error '+Array.from(arguments).map(String).join(' '));return _ce.apply(console,arguments);};` });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await page.goto('http://127.0.0.1:5184/photography'); await page.activate();
  await wait(5200);
  const report = { steps: [], ok: true };
  const note = (k, v) => report.steps.push({ [k]: v });
  const e = (b) => page.evaluate('(function(){ ' + b + ' })()');

  note('railCount', await e(`return document.querySelectorAll('.ph__rail-btn').length;`));
  await e(`var b=document.querySelector('.ph__stage-button'); if(b) b.click(); return true;`);
  await wait(500);
  const open = await e(`var l=document.querySelector('.lightbox'); if(!l) return null; return {counter:(l.querySelector('.lightbox__counter')||{}).textContent, film:l.querySelectorAll('.lightbox__film-btn').length, prevDisabled:(l.querySelector('.lightbox__nav--prev')||{}).disabled, nextDisabled:(l.querySelector('.lightbox__nav--next')||{}).disabled};`);
  note('opened', open);
  if (!open || open.film < 2 || open.prevDisabled !== true) report.ok = false;

  let steps = 0;
  while (steps < 30) {
    const nd = await e(`var b=document.querySelector('.lightbox__nav--next'); return b ? b.disabled : true;`);
    if (nd) break;
    await e(`document.querySelector('.lightbox__nav--next').click(); return true;`);
    await wait(180);
    steps++;
  }
  const endState = await e(`var l=document.querySelector('.lightbox'); return {counter:(l.querySelector('.lightbox__counter')||{}).textContent, nextDisabled:(l.querySelector('.lightbox__nav--next')||{}).disabled, prevDisabled:(l.querySelector('.lightbox__nav--prev')||{}).disabled};`);
  note('atEnd', { steps, endState });
  if (steps !== 10 || endState.nextDisabled !== true) report.ok = false;

  await e(`var b=document.querySelector('.lightbox__nav--next'); if(b && !b.disabled) b.click(); return true;`);
  await wait(220);
  const stillEnd = await e(`return document.querySelector('.lightbox__counter').textContent;`);
  note('noWrapAtEnd', { before: endState.counter, after: stillEnd });
  if (stillEnd !== endState.counter) report.ok = false;

  await e(`document.querySelectorAll('.lightbox__film-btn')[3].click(); return true;`);
  await wait(320);
  const jumped = await e(`return {counter: document.querySelector('.lightbox__counter').textContent, title: document.querySelector('.lightbox__title').textContent};`);
  note('filmJump', jumped);
  if (jumped.counter !== '04 / 11') report.ok = false;

  await e(`(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true;`);
  await wait(400);
  const closed = await e(`return {lightbox: !!document.querySelector('.lightbox'), bodyOverflow: document.body.style.overflow};`);
  note('escapeClose', closed);
  if (closed.lightbox || closed.bodyOverflow === 'hidden') report.ok = false;

  await e(`document.querySelector('.ph__stage-button').click(); return true;`); await wait(400);
  note('reopenPrevDisabled', await e(`var b=document.querySelector('.lightbox__nav--prev'); return b ? b.disabled : null;`));
  await e(`(document.activeElement||document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); return true;`);

  report.errs = await page.evaluate(`window.__errs||[]`);
  if (report.errs.length) report.ok = false;
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}).catch((err)=>{console.error('FAILED',err.message);process.exit(1);});

