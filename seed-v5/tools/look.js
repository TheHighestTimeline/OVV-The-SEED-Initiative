/* tools/look.js — look-development capture.
   The view sweep in shoot.js is all aerial, which is the wrong framing to
   judge a look by: at 1,150 m every city reads as a map. These are the
   eye-level and low-oblique framings the art direction is actually aimed at.
   usage: node tools/look.js [--tag=before] [--night] */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tag = (process.argv.find((a) => a.startsWith('--tag=')) || '--tag=shot').slice(6);
const file = path.join(root, 'dist', 'OVMG_SEED_CityWorld_20260823_v5.html');
if (!fs.existsSync(file)) { console.error('no build at', file); process.exit(1); }

const candidates = [
  process.env.SEED_CHROME || '',
  ...(fs.existsSync('/opt/pw-browsers') ? fs.readdirSync('/opt/pw-browsers')
      .filter((d) => d.startsWith('chromium'))
      .flatMap((d) => [
        path.join('/opt/pw-browsers', d, 'chrome-linux', 'chrome'),
        path.join('/opt/pw-browsers', d, 'chrome-linux', 'headless_shell'),
      ]) : []),
  '/usr/bin/chromium', '/usr/bin/google-chrome',
];

/* Eye-level and low-oblique framings, chosen to hold sky, ground plane and a
   built edge in the same frame — the composition every reference image uses. */
const FRAMES = [
  { n: 'street-arterial', time: 'afternoon', walk: [0, -40, Math.PI * 0.5] },
  { n: 'street-plaza',    time: 'afternoon', walk: [40, 250, Math.PI * 1.15] },
  { n: 'street-campus',   time: 'afternoon', walk: [-150, -120, Math.PI * 0.25] },
  { n: 'oblique-campus',  time: 'afternoon', goto: [-120, -60, 210, -0.85, 1.36] },
  { n: 'oblique-town',    time: 'afternoon', goto: [0, -760, 260, -0.30, 1.34] },
  { n: 'street-night',    time: 'night',     walk: [0, -40, Math.PI * 0.5] },
];

const browser = await chromium.launch({
  executablePath: candidates.filter(Boolean).find((p) => fs.existsSync(p)),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto('file://' + file.replace(/\\/g, '/'));
await page.waitForFunction(() => window.__seedReady === true, { timeout: 240000 });
console.log('ready');

const dir = path.join(root, 'shots');
fs.mkdirSync(dir, { recursive: true });
for (const f of FRAMES) {
  await page.evaluate((fr) => {
    window.__seedTime(fr.time);
    if (fr.walk) window.__seedWalk(fr.walk[0], fr.walk[1], fr.walk[2]);
    else window.__seedGoto(fr.goto[0], fr.goto[1], fr.goto[2], fr.goto[3], fr.goto[4]);
    /* hide the HUD chrome: this is a look check, not a UI check */
    document.querySelectorAll('#rail,#views,#hud,#pins,.bar,header,footer')
      .forEach((el) => { el.style.display = 'none'; });
  }, f);
  await page.waitForTimeout(1800);
  const out = path.join(dir, `${tag}_${f.n}.png`);
  await page.screenshot({ path: out, timeout: 300000 });
  console.log('shot', path.basename(out));
}
await browser.close();
