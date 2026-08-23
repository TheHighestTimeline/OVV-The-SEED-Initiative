/* tools/inspect.js — close-up captures of named problem areas
   usage: node tools/inspect.js [area ...]   (default: all) */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5.html');

const AREAS = {
  ponds:        { x: 320, z: -200, dist: 160, theta: -0.8, phi: 1.0 },
  agri:         { x: 322, z: 330, dist: 140, theta: -0.8, phi: 1.0 },
  gatehouse:    { x: 5, z: -405, dist: 110, theta: -2.2, phi: 0.9 },
  gateSouth:    { x: 40, z: 560, dist: 130, theta: 1.6, phi: 1.0 },
  xnCampus:     { x: 0, z: -370, dist: 110, theta: -0.9, phi: 0.9 },
  xnTown:       { x: 0, z: -880, dist: 110, theta: -0.9, phi: 0.9 },
  perimeterSW:  { x: -420, z: 420, dist: 260, theta: -2.2, phi: 1.0 },
  plaza:        { x: 0, z: 276, dist: 150, theta: -2.35, phi: 1.0 },
  hallRoof:     { x: -230, z: -180, dist: 150, theta: -0.95, phi: 0.7 },
  pondBw:       { x: 320, z: -250, dist: 90, theta: -0.8, phi: 1.05 },
  yard:         { x: 300, z: 260, dist: 150, theta: -2.2, phi: 0.95 },
  hut:          { x: -34, z: 196, dist: 60, theta: 1.8, phi: 0.95 },
  living:       { x: -240, z: 118, dist: 90, theta: -0.5, phi: 1.1 },
  pondPath:     { x: 320, z: -120, dist: 130, theta: -0.9, phi: 0.9 },
  dune:         { x: 60, z: 1265, dist: 220, theta: -1.6, phi: 0.9 },
};

const pick = process.argv.slice(2).filter((a) => AREAS[a]);
const names = pick.length ? pick : Object.keys(AREAS);

const exe = [
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium_headless_shell-1234', 'chrome-win', 'headless_shell.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.goto(pathToFileURL(file).href + '?tier=balanced&debug=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__seedReady === true || window.__seedError, { timeout: 240000 });
const err = await page.evaluate(() => window.__seedError || null);
if (err) { console.log('BUILD ERROR', err); process.exit(1); }

const dir = path.join(root, 'shots');
fs.mkdirSync(dir, { recursive: true });
for (const n of names) {
  const a = AREAS[n];
  await page.evaluate(([p]) => { window.__seedGoto(p.x, p.z, p.dist, p.theta, p.phi); }, [a]);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(dir, `insp_${n}.png`), timeout: 180000 });
  console.log('shot', n);
}
await browser.close();
