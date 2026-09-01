/* tools/verify-assets.js — which downloaded assets actually reached the world.
   usage: node tools/verify-assets.js

   scanned.js and models.js are both fail-soft by design: an asset that is
   absent, misnamed or unreadable leaves the procedural version in place and
   says nothing. That is the right behaviour and it is also how a texture can
   sit in the repo for a week without ever being used. This asks the running
   world what it actually got. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5.html');
if (!fs.existsSync(file)) { console.error('no build; run node tools/build.js'); process.exit(1); }

/* http, not file:// — the ORM packer draws each texture into a canvas, and a
   canvas that has drawn a file:// image is tainted, so getImageData throws and
   every scanned set silently falls back. */
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  fs.readFile(path.join(root, 'dist', rel), (e, b) => (e ? res.writeHead(404).end() : res.end(b)));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));

const exe = fs.readdirSync('/opt/pw-browsers').filter((d) => d.startsWith('chromium'))
  .map((d) => `/opt/pw-browsers/${d}/chrome-linux/chrome`).find((p) => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: exe || process.env.SEED_CHROME, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(`http://127.0.0.1:${server.address().port}/${path.basename(file)}`);
await page.waitForFunction(() => window.__seedReady === true, { timeout: 300000 });

const r = await page.evaluate(async () => {
  /* Fetch one texture the way the loader would reach it, so a 0/N result
     separates "never looked" from "looked and got a 404". */
  let probe;
  try {
    const res = await fetch('assets/materials/asphalt/color.jpg');
    probe = `${res.status} ${res.headers.get('content-type')} ${res.url}`;
  } catch (e) { probe = 'threw: ' + e.message; }
  return {
    materials: window.__seedMaterials(), models: window.__seedModels(),
    stats: window.__seedStats(), probe,
  };
});

const line = (label, got, want) =>
  console.log(`${label.padEnd(12)} ${String(got.length).padStart(2)}/${want.length}  ${got.join(', ') || '-'}`);

console.log('');
line('materials', r.materials.loaded, r.materials.expected);
const matMissing = r.materials.expected.filter((m) => !r.materials.loaded.includes(m));
if (matMissing.length) console.log(`${''.padEnd(12)} absent: ${matMissing.join(', ')}`);
line('models', r.models.loaded, r.models.expected);
if (r.models.missing.length) console.log(`${''.padEnd(12)} absent: ${r.models.missing.join(', ')}`);
console.log(`\nattempted ${r.materials.attempted}  probe: ${r.probe}`);
console.log(`draws ${r.stats.calls}  tris ${r.stats.tris}  textures ${r.stats.textures}`);
if (errs.length) { console.log('\npage errors:'); errs.forEach((e) => console.log('  ' + e)); }

await browser.close();
server.close();
