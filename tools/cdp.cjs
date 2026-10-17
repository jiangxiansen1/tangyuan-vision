/**
 * cdp.cjs — a minimal Chrome DevTools Protocol driver.
 *
 * WHY THIS EXISTS
 * The tools in this folder used to drive the browser with `--dump-dom` plus
 * `--virtual-time-budget`. That is a good fit for a page whose assets are local: the
 * page settles, the budget is satisfied, the DOM is dumped.
 *
 * It fails for anything that loads real data over the network, and the failure is
 * silent — an empty file, not an error:
 *
 *   • `--virtual-time-budget` only advances while the page is IDLE, and a map is never
 *     idle. It has a continuous render loop and a stream of tile requests, so the
 *     budget was never satisfied and the dump was ZERO BYTES.
 *   • Without the budget, `--dump-dom` writes at the LOAD event — long before a map has
 *     finished fetching tiles. Every audit captured the pre-load page.
 *   • Storing a result and reloading does not help: the browser is killed on dump
 *     completion without a clean shutdown.
 *   • Blocking the load event with a synchronous XHR freezes the main thread, and
 *     because the iframe shares that thread the app can never mount.
 *
 * CDP has none of these problems. It attaches to a live browser, evaluates in real
 * time for as long as needed, and reports whatever it gets. Node 24 ships a global
 * WebSocket, so this needs no dependency.
 *
 * Usage:
 *   const { withBrowser } = require('./cdp.cjs');
 *   const result = await withBrowser(async (page) => {
 *     await page.goto('http://127.0.0.1:5183/earth');
 *     await page.waitFor('!!document.querySelector(".mglobe")', 30000);
 *     return page.evaluate('document.title');
 *   });
 */

'use strict';

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const http = require('node:http');

const BROWSER = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

/** Ask the browser's HTTP endpoint for the debugger socket of the first page target. */
function listTargets(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/json/list', timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Page {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || 'cdp error'));
        else resolve(msg.result);
      }
    });
  }

  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      // A hung CDP call must not hang the whole run.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`cdp timeout: ${method}`));
        }
      }, 60000);
    });
  }

  /** Evaluate an expression in the page and return its JSON value. */
  async evaluate(expression, opts = {}) {
    const r = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: opts.awaitPromise !== false,
      // The audits return live DOM readings; a thrown expression surfaces as an
      // exception rather than silently returning null.
      throwOnSideEffect: false,
    });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(`page threw: ${(d.exception && d.exception.description) || d.text}`);
    }
    return r.result ? r.result.value : undefined;
  }

  /**
   * Poll an expression until it is truthy. Returns the final value, or throws with the
   * last reading so a failure says what the page actually looked like.
   */
  async waitFor(expression, timeoutMs = 30000, everyMs = 400) {
    const deadline = Date.now() + timeoutMs;
    let last;
    while (Date.now() < deadline) {
      try {
        last = await this.evaluate(expression);
        if (last) return last;
      } catch (e) {
        last = `threw: ${e.message}`;
      }
      await sleep(everyMs);
    }
    throw new Error(`waitFor timed out after ${timeoutMs}ms: ${expression}\n  last: ${JSON.stringify(last)}`);
  }

  async goto(url) {
    await this.send('Page.navigate', { url });
  }

  /** Bring the page to the foreground so rendering is not throttled as background. */
  async activate() {
    try { await this.send('Page.bringToFront'); } catch { /* optional */ }
  }
}

/**
 * Launch a browser, hand a Page to `fn`, and always shut the browser down.
 *
 * The profile is fresh per call, so a previous run's storage, cache or service worker
 * cannot make a failing page look like it passed.
 */
async function withBrowser(fn, options = {}) {
  const port = options.port || 9333 + Math.floor(Math.random() * 400);
  const profile = path.join(os.tmpdir(), `tv-cdp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`);
  fs.mkdirSync(profile, { recursive: true });

  /* Test-only knob: extra Chromium flags (e.g. a fake camera device) without
     changing any behaviour for normal runs. Comma-separated in TV_BROWSER_ARGS. */
  const extraArgs = (process.env.TV_BROWSER_ARGS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const args = [
    ...extraArgs,
    '--headless=new',
    '--no-sandbox',
    '--disable-extensions',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=1440,1000',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    ...extraArgs,
    'about:blank',
  ];

  const child = spawn(BROWSER, args, { stdio: 'ignore', detached: false });

  let ws = null;
  try {
    // Wait for the debugger endpoint. It takes a moment even on a warm start.
    let targets = null;
    for (let i = 0; i < 60 && !targets; i++) {
      try {
        targets = await listTargets(port);
        if (!targets.length) targets = null;
      } catch {
        await sleep(250);
      }
    }
    if (!targets) throw new Error(`browser debugger never came up on port ${port}`);

    const page = targets.find((t) => t.type === 'page') || targets[0];
    ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('debugger socket failed')));
      setTimeout(() => reject(new Error('debugger socket timed out')), 10000);
    });

    const p = new Page(ws);
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    return await fn(p);
  } finally {
    try { if (ws) ws.close(); } catch { /* already closed */ }
    try { child.kill('SIGKILL'); } catch { /* already gone */ }
    // Give the OS a moment to release the profile directory, then remove it.
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked; harmless */ }
  }
}

module.exports = { withBrowser, BROWSER };
