/* tools/mobile-check.js — load the world as a phone would.
   usage: node tools/mobile-check.js

   Emulates an iPhone viewport, touch input and devicePixelRatio 3, then
   reports which tier the world chose, whether it laid out for touch, and
   whether page zoom is actually blocked. Every one of those was wrong at
   some point and none of them is visible from a desktop browser. */
import { chromium, devices } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5_dev.html');
const MIME = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png',
               '.glb': 'model/gltf-binary', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  fs.readFile(path.join(root, 'dist', rel), (e, b) => {
    if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream' }).end(b);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium'))
  .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ ...devices['iPhone 13 Pro'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/${path.basename(file)}`);
for (let i = 0; i < 300; i++) {
  const st = await page.evaluate(() => ({ r: window.__seedReady === true, e: window.__seedError || null }));
  if (st.r) break;
  if (st.e) { console.error('build failed:\n' + st.e); break; }
  await new Promise((r) => setTimeout(r, 3000));
}

const r = await page.evaluate(() => ({
  ready: window.__seedReady === true,
  tier: window.__seedStats ? window.__seedStats().tier : null,
  pixelRatio: window.devicePixelRatio,
  touchClass: document.documentElement.classList.contains('touch'),
  canvasTouchAction: getComputedStyle(document.getElementById('c')).touchAction,
  walkHidden: getComputedStyle(document.getElementById('walkBtn')).display === 'none',
  peekPresent: !!document.getElementById('peek'),
  viewport: document.querySelector('meta[name=viewport]').content,
  stats: window.__seedStats ? window.__seedStats() : null,
}));
console.log(JSON.stringify(r, null, 1));
if (errs.length) console.log('page errors:\n  ' + errs.join('\n  '));
await browser.close();
server.close();
