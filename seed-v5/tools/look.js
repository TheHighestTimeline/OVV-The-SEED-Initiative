/* tools/look.js — look-development capture.
   The view sweep in shoot.js is all aerial, which is the wrong framing to
   judge a look by: at 1,150 m every city reads as a map. These are the
   eye-level and low-oblique framings the art direction is actually aimed at.
   usage: node tools/look.js [--tag=before] [--night] */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import http from 'node:http';
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
/* Framings taken from where the world actually put things — see tools/where.js.
   The coordinates below are real bench and bin positions in the community
   plaza, not positions that seemed likely. */
const FRAMES = [
  /* The gauntlet set: the places a critic has to judge, at the distances a
     visitor actually sees them from. */
  { n: 'g-plaza',      time: 'afternoon', goto: [15.4, 335.4, 40, -2.35, 1.20] },
  { n: 'g-street',     time: 'afternoon', walk: [24, 340, Math.PI * 1.22] },
  { n: 'g-greenhouse', time: 'afternoon', goto: [227, -214, 26, -1.2, 1.36] },
  { n: 'g-campus',     time: 'afternoon', goto: [-120, -60, 210, -0.85, 1.30] },
  { n: 'g-coast',      time: 'afternoon', goto: [110, 1270, 260, 2.90, 1.24] },
  { n: 'g-night',      time: 'night',     goto: [15.4, 335.4, 60, -2.35, 1.22] },
  /* Inside a greenhouse and inside the aquaponics hall — the two rooms whose
     defects were found by eye and never by a gate. */
  { n: 'greenhouse',   time: 'afternoon', goto: [227, -214, 26, -1.2, 1.36] },
  { n: 'aquaponics',   time: 'afternoon', goto: [228, -100, 30, -1.9, 1.34] },
  { n: 'plaza-bench',  time: 'afternoon', goto: [15.4, 335.4, 14, -2.35, 1.34] },
  { n: 'plaza-bin',    time: 'afternoon', goto: [-20.5, 278.6, 16, -0.9, 1.32] },
  { n: 'plaza-walk',   time: 'afternoon', walk: [24, 340, Math.PI * 1.22] },
  { n: 'plaza-night',  time: 'night',     goto: [15.4, 335.4, 18, -2.35, 1.30] },
  { n: 'street-arterial', time: 'afternoon', walk: [0, -40, Math.PI * 0.5] },
  { n: 'street-plaza',    time: 'afternoon', walk: [40, 250, Math.PI * 1.15] },
  { n: 'street-campus',   time: 'afternoon', walk: [-150, -120, Math.PI * 0.25] },
  { n: 'oblique-campus',  time: 'afternoon', goto: [-120, -60, 210, -0.85, 1.36] },
  { n: 'oblique-town',    time: 'afternoon', goto: [0, -760, 260, -0.30, 1.34] },
  { n: 'street-night',    time: 'night',     walk: [0, -40, Math.PI * 0.5] },
];

/* Serve dist over http rather than loading it as file://. Textures reach the
   page through a canvas to pack the ORM map, and a canvas that has drawn a
   file:// image is tainted - getImageData throws SecurityError and every
   scanned material silently falls back to the generated one. Serving is also
   what Netlify does, so this exercises the real path. */
const server = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
  const abs = path.join(root, 'dist', rel);
  if (!abs.startsWith(path.join(root, 'dist'))) { res.writeHead(403).end(); return; }
  fs.readFile(abs, (err, buf) => {
    if (err) { res.writeHead(404).end(); return; }
    const type = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg',
                   '.png': 'image/png', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
                   '.css': 'text/css' }[path.extname(abs).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type }).end(buf);
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
console.log('serving dist at', origin);

const browser = await chromium.launch({
  executablePath: candidates.filter(Boolean).find((p) => fs.existsSync(p)),
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl', '--disable-gpu-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${origin}/${path.basename(file)}`);
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
server.close();
