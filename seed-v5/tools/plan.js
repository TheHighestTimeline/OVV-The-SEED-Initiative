/* tools/plan.js — near-orthographic top-down captures for layout review */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5.html');
const AREAS = {
  gateN:   { x: 0, z: -480, dist: 260 },
  campusN: { x: 0, z: -300, dist: 420 },
  campusS: { x: 0, z: 250, dist: 460 },
  ponds:   { x: 320, z: -210, dist: 320 },
  whole:   { x: 0, z: 0, dist: 1500 },
};
const pickArgs = process.argv.slice(2).filter((a) => AREAS[a]);
const names = pickArgs.length ? pickArgs : Object.keys(AREAS);
const exe = [
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium_headless_shell-1234', 'chrome-win', 'headless_shell.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(pathToFileURL(file).href + '?tier=balanced&debug=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__seedReady === true || window.__seedError, { timeout: 240000 });
const dir = path.join(root, 'shots');
fs.mkdirSync(dir, { recursive: true });
for (const n of names) {
  const a = AREAS[n];
  await page.evaluate(([p]) => { window.__seedGoto(p.x, p.z, p.dist, -Math.PI / 2, 0.08); }, [a]);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: path.join(dir, `plan_${n}.png`), timeout: 180000 });
  console.log('shot', n);
}
await browser.close();
