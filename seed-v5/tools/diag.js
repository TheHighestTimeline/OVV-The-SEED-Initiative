/* tools/diag.js — census of what is drawing: mesh counts by zone and type */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5.html');

const candidates = [
  path.join(process.env.LOCALAPPDATA || '',
    'ms-playwright', 'chromium_headless_shell-1234', 'chrome-win64', 'headless_shell.exe'),
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
];
const exe = candidates.find((p) => fs.existsSync(p));
const browser = await chromium.launch({
  executablePath: exe, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(pathToFileURL(file).href + '?tier=high&debug=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__seedReady === true || window.__seedError, { timeout: 240000 });

const census = await page.evaluate(() => {
  const scene = window.__seedScene || null;
  if (!scene) return { error: 'no __seedScene hook' };
  const groups = {};
  let meshes = 0, instanced = 0;
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine)) return;
    if (o.isInstancedMesh) instanced++; else meshes++;
    const mat = o.material && (o.material.name || 'anon-mat');
    const key = [
      o.isInstancedMesh ? 'INST' : 'MESH',
      mat,
      o.castShadow ? 'cast' : '-',
      o.userData.noMerge ? 'noMerge' : '-',
    ].join(' | ');
    let g = groups[key];
    if (!g) g = groups[key] = { n: 0, verts: 0, insts: 0, uuids: new Set(), sample: '' };
    g.n++;
    g.verts += o.geometry.attributes.position ? o.geometry.attributes.position.count : 0;
    g.insts += o.count || 0;
    g.uuids.add(o.material ? o.material.uuid : '');
    if (!g.sample) {
      const chain = [];
      let p = o;
      while (p && p !== scene) { chain.unshift(p.name || '?'); p = p.parent; }
      g.sample = chain.join('/');
    }
  });
  const rows = Object.entries(groups)
    .map(([k, g]) => ({ k, n: g.n, verts: g.verts, insts: g.insts,
      mats: g.uuids.size, sample: g.sample.slice(0, 90) }))
    .sort((a, b) => b.n - a.n).slice(0, 45);
  return { meshes, instanced, rows };
});
console.log('meshes', census.meshes, 'instanced', census.instanced);
for (const r of census.rows || []) {
  console.log(String(r.n).padStart(5), 'mats' + String(r.mats).padStart(4),
    'verts' + String(r.verts).padStart(9), r.k, '  @', r.sample);
}
await browser.close();
