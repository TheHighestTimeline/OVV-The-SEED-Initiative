/* tools/nightshot.js — two targeted night captures to verify the lamp pools */
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
await page.goto(pathToFileURL(file).href + '?tier=balanced&debug=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__seedReady === true || window.__seedError, { timeout: 240000 });

const err = await page.evaluate(() => window.__seedError || null);
if (err) { console.log('BUILD ERROR', err); process.exit(1); }

const rep = await page.evaluate(() => {
  const r = window.__seedReport();
  return { fp: r.footprintConflicts.length, geo: r.geometryConflicts.length,
           road: r.roadProblems.length, walk: r.walkFailures.length };
});
console.log('gates', JSON.stringify(rep));

const dir = path.join(root, 'shots');
fs.mkdirSync(dir, { recursive: true });
for (const [vi, name] of [[3, 'community'], [0, 'overview']]) {
  await page.evaluate(([i]) => { window.__seedView(i); window.__seedTime('night'); }, [vi]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(dir, `pools_${name}_night.png`), timeout: 180000 });
  console.log('shot', name);
}
/* street level: stand on the town arterial sidewalk and look down the road */
await page.evaluate(() => { window.__seedTime('night'); window.__seedWalk(30, -866, Math.PI / 2); });
await page.waitForTimeout(2500);
await page.screenshot({ path: path.join(dir, 'pools_street_night.png'), timeout: 180000 });
console.log('shot street');
await browser.close();
