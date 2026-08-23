import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5.html');
const exe = [
  path.join(process.env.LOCALAPPDATA || '', 'ms-playwright', 'chromium_headless_shell-1234', 'chrome-win', 'headless_shell.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: exe, headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--enable-webgl', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await page.goto(pathToFileURL(file).href + '?tier=balanced&debug=1', { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction(() => window.__seedReady === true || window.__seedError, { timeout: 240000 });
/* gatehouse view; pick the centre of the white band and a few nearby points */
const out = await page.evaluate(() => {
  window.__seedGoto(0, -560, 130, -1.5, 1.0);
  const picks = {};
  for (let i = -5; i <= 5; i++) { const label = "x" + i, nx = i * 0.1, ny = 0;
    picks[label] = window.__seedPick(nx, ny);
  }
  return picks;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
