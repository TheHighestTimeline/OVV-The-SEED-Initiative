/* tools/shoot.js — headless verification + screenshots
   usage: node tools/shoot.js [--dev] [--shots] [--tier=high] */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dev = process.argv.includes('--dev');
const doShots = process.argv.includes('--shots');
const tierArg = (process.argv.find((a) => a.startsWith('--tier=')) || '').split('=')[1] || 'high';

const file = path.join(root, 'dist',
  `OVMG_SEED_CityWorld_20260823_v5${dev ? '_dev' : ''}.html`);
if (!fs.existsSync(file)) { console.error('no build at', file); process.exit(1); }

/* The bundled ms-playwright chromium on this machine is corrupt (side-by-side
   configuration error), so fall back through the browsers that actually run. */
const candidates = [
  path.join(process.env.LOCALAPPDATA || '',
    'ms-playwright', 'chromium_headless_shell-1234', 'chrome-win64', 'headless_shell.exe'),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const exe = candidates.find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  headless: true,
  args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox',
  ],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack || ''}`));

const url = pathToFileURL(file).href + `?tier=${tierArg}&debug=1`;
await page.goto(url, { waitUntil: 'load', timeout: 120000 });

let ready = false;
try {
  await page.waitForFunction(() => window.__seedReady === true || window.__seedError,
    { timeout: 240000 });
  ready = await page.evaluate(() => !!window.__seedReady);
} catch (e) {
  logs.push('[timeout] world never became ready');
}

const err = await page.evaluate(() => window.__seedError || null);
if (err) {
  console.log('\n=== BUILD ERROR ===\n' + err);
}

if (ready) {
  const rep = await page.evaluate(() => window.__seedReport());
  console.log('\n=== WORLD REPORT ===');
  console.log('seed', rep.seed, 'tier', rep.tier, 'registered', rep.registered);
  console.log('terrain', JSON.stringify(rep.terrain));
  console.log('road problems      ', rep.roadProblems.length);
  rep.roadProblems.slice(0, 12).forEach((p) => console.log('   ', p));
  console.log('footprint conflicts', rep.footprintConflicts.length);
  rep.footprintConflicts.slice(0, 20).forEach((c) =>
    console.log(`    ${c.a} [${c.la}] x ${c.b} [${c.lb}]  ${c.depth.toFixed(2)} m  (${c.rule})`));
  console.log('geometry conflicts ', rep.geometryConflicts.length);
  rep.geometryConflicts.slice(0, 20).forEach((c) =>
    console.log(`    ${c.a} x ${c.b}  ${c.volume.toFixed(1)} m3  ext ${c.ext.map((v) => v.toFixed(1))}`));
  console.log('walk failures      ', rep.walkFailures.length);
  rep.walkFailures.slice(0, 20).forEach((f) => console.log(`    ${f.from} -> ${f.to}`));
  console.log('walk slope warnings', rep.walkSlope);
  console.log('destinations', rep.destinations, 'sources', rep.sources, 'merged', rep.collapsed);
  console.log('material violations', (rep.materialViolations || []).length);
  const uniqViol = [...new Set(rep.materialViolations || [])];
  uniqViol.slice(0, 15).forEach((v) => console.log('    ', v));

  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => window.__seedStats());
  console.log('draws', stats.calls, 'tris', stats.tris, 'geo', stats.geometries, 'tex', stats.textures);

  const hash = await page.evaluate(() => window.__seedHash());
  console.log('scene hash', hash.hash, 'meshes', hash.meshes);

  if (doShots) {
    const dir = path.join(root, 'shots');
    fs.mkdirSync(dir, { recursive: true });
    const views = ['overview', 'compute', 'living', 'community', 'beyond', 'watershed', 'coast', 'ocean'];
    const times = [{ h: 'afternoon', n: 'afternoon' }, { h: 'night', n: 'night' }];
    for (let i = 0; i < views.length; i++) {
      for (const t of times) {
        await page.evaluate(([vi, hh]) => { window.__seedView(vi); window.__seedTime(hh); },
          [i, t.h]);
        await page.waitForTimeout(1400);
        /* SwiftShader pushes ~20M tris on the CPU; a frame can take minutes */
        await page.screenshot({
          path: path.join(dir, `${String(i).padStart(2, '0')}_${views[i]}_${t.n}.png`),
          timeout: 180000,
        });
      }
    }
    console.log('screenshots written to shots/');
  }
}

const bad = logs.filter((l) => /\[error\]|\[pageerror\]|\[warning\]/.test(l));
console.log('\n=== CONSOLE (' + logs.length + ' lines, ' + bad.length + ' error/warn) ===');
logs.slice(0, 60).forEach((l) => console.log(l.slice(0, 700)));

await browser.close();
process.exit(ready && !err ? 0 : 1);
