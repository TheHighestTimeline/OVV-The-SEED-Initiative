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
const dev = process.argv.includes('--dev');
const file = path.join(root, 'dist',
  `OVMG_SEED_CityWorld_20260823_v5${dev ? '_dev' : ''}.html`);
if (!fs.existsSync(file)) { console.error('no build; run node tools/build.js'); process.exit(1); }

/* http, not file:// — the ORM packer draws each texture into a canvas, and a
   canvas that has drawn a file:// image is tainted, so getImageData throws and
   every scanned set silently falls back. */
/* Content-Type matters here: fetch() returns bytes regardless, but an <img>
   will not decode a response the browser cannot type, so a server that omits
   it makes every texture look absent while the file is plainly reachable. */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
};
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '');
  fs.readFile(path.join(root, 'dist', rel), (e, b) => {
    if (e) { res.writeHead(404).end(); return; }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(rel).toLowerCase()] || 'application/octet-stream',
    }).end(b);
  });
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
/* Poll rather than waitForFunction: the world takes minutes to build under
   software rendering, and a page error means it will never be ready at all,
   so waiting the full deadline for one is wasted time. */
const deadline = Date.now() + 15 * 60 * 1000;
for (;;) {
  const state = await page.evaluate(
    () => ({ ready: window.__seedReady === true, err: window.__seedError || null }));
  if (state.ready) break;
  if (state.err) { console.error('world failed to build:\n' + state.err); break; }
  if (errs.length) { console.error('page error:\n  ' + errs.join('\n  ')); break; }
  if (Date.now() > deadline) { console.error('timed out after 15 min'); break; }
  await new Promise((r) => setTimeout(r, 3000));
}
if (!(await page.evaluate(() => window.__seedReady === true))) {
  await browser.close(); server.close(); process.exit(1);
}

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
    stats: window.__seedStats(), probe, heavy: window.__seedHeavy(14),
  };
});

const line = (label, got, want) =>
  console.log(`${label.padEnd(12)} ${String(got.length).padStart(2)}/${want.length}  ${got.join(', ') || '-'}`);

console.log('');
line('materials', r.materials.loaded, r.materials.expected);
const matMissing = r.materials.expected.filter((m) => !r.materials.loaded.includes(m));
if (matMissing.length) console.log(`${''.padEnd(12)} absent: ${matMissing.join(', ')}`);
if (r.materials.failures && r.materials.failures.length) {
  console.log(`${''.padEnd(12)} why:`);
  r.materials.failures.forEach((f) => console.log(`${''.padEnd(14)}${f}`));
}
line('models', r.models.loaded, r.models.expected);
if (r.models.missing.length) console.log(`${''.padEnd(12)} absent: ${r.models.missing.join(', ')}`);
console.log(`\nattempted ${r.materials.attempted}  probe: ${r.probe}`);
if (r.models.triangles) {
  const top = Object.entries(r.models.triangles).sort((a, b) => b[1] - a[1]).slice(0, 4);
  console.log('heaviest models: ' + top.map(([k, v]) => `${k} ${v.toLocaleString()}`).join(', '));
}
console.log(`\nscene triangles ${r.heavy.total.toLocaleString()}`);
r.heavy.top.forEach((t) => console.log(
  `  ${String(t.tris).padStart(12)}  ${String(t.instances).padStart(6)}x${String(t.per).padStart(8)}  ${t.name}`));
console.log(`draws ${r.stats.calls}  tris ${r.stats.tris}  textures ${r.stats.textures}`);
if (errs.length) { console.log('\npage errors:'); errs.forEach((e) => console.log('  ' + e)); }

await browser.close();
server.close();
