'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { withBrowser } = require('./cdp.cjs');
const origin = (process.argv[2] || 'http://127.0.0.1:5184').replace(/\/$/, '');
const outDir = path.join(__dirname, '_verify', 'routes');
fs.mkdirSync(outDir, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const routes = ['/', '/about', '/photography', '/earth', '/riding', '/lab', '/projects', '/journal', '/contact', '/the-quiet-space'];
withBrowser(async (page) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__errs=[];
    window.addEventListener('error',e=>window.__errs.push('error: '+(e.message||e.error)));
    window.addEventListener('unhandledrejection',e=>window.__errs.push('rejection: '+((e.reason&&e.reason.message)||e.reason)));
    var _ce=console.error; console.error=function(){window.__errs.push('console.error: '+Array.from(arguments).map(String).join(' '));return _ce.apply(console,arguments);};
    window.__pk = window.__pk || {};
  ` });
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  const out = [];
  for (const r of routes) {
    await page.goto(origin + r);
    await wait(2000);
    const info = await page.evaluate(`(function(){
      var main=document.querySelector('main')||document.body;
      var txt=(main.innerText||'').replace(/\\s+/g,' ').trim();
      return {
        title: document.title,
        len: txt.length,
        h1: (document.querySelector('h1')||{}).textContent || null,
        overflowX: document.documentElement.scrollWidth - window.innerWidth,
        errs: (window.__errs||[]).slice(),
        hasNav: !!document.querySelector('nav, [class*="rail"], [class*="nav"]'),
      };
    })()`);
    await page.evaluate(`window.__errs=[]`);
    out.push({ route: r, ...info });
  }
  // contact specifics
  await page.goto(origin + '/contact'); await wait(1800);
  const contact = await page.evaluate(`(function(){
    var items=[].slice.call(document.querySelectorAll('.contact__channel, li[class*="channel"], .contact__pending-list li'));
    var labels=items.map(function(li){return (li.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40);});
    var body=document.body.innerText;
    return { labels: labels, mentionsWechat: /微信|QQ|微博|哔哩|小红书|电话/.test(body), hasDouyin:/抖音/.test(body), hasEmail:/邮箱/.test(body), hasGithub:/GitHub/.test(body) };
  })()`);
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ out, contact }, null, 2));
  console.log(JSON.stringify({ out, contact }, null, 2));
}).catch((e)=>{console.error('FAILED',e.message);process.exit(1);});
