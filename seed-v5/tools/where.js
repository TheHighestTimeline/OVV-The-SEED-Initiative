/* tools/where.js — ask the built world where things are.
   usage: node tools/where.js bench hydrant bin

   Every camera framing this session was a coordinate guessed in advance, and
   the render meant to demonstrate the props had none of them in frame. The
   world knows where it put things; this asks it. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5_dev.html');
const MIME = { '.html': 'text/html', '.jpg': 'image/jpeg', '.png': 'image/png',
               '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.json': 'application/json' };
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
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/${path.basename(file)}`);
for (let i = 0; i < 300; i++) {
  if (await page.evaluate(() => window.__seedReady === true)) break;
  await new Promise((r) => setTimeout(r, 3000));
}
for (const needle of (process.argv.slice(2).length ? process.argv.slice(2) : ['bench', 'bin', 'hydrant'])) {
  const hits = await page.evaluate((n) => window.__seedFind(n, 6), needle);
  console.log(`\n${needle}: ${hits.length ? '' : 'none found'}`);
  hits.forEach((h) => console.log(`  ${h.name.padEnd(22)} ${h.x}, ${h.y}, ${h.z}`));
}
await browser.close();
server.close();
