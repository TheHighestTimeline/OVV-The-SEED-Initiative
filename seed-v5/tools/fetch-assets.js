/* tools/fetch-assets.js — pull scanned PBR sets into public/assets/materials.
   usage: node tools/fetch-assets.js [set ...]        (default: every set)

   ambientCG publishes its material scans under CC0, and its API hands back a
   direct zip per resolution. This downloads the 2K JPG variant, unpacks the
   four maps this project wants and renames them to the layout scanned.js
   expects. Re-running is cheap: a set already on disk is skipped.

   If this fails with a proxy 403, the environment's network policy does not
   allow ambientcg.com yet — that is the whole blocker, and the fix is an
   allowlist entry, not a code change. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'assets', 'materials');

/* directory -> ambientCG asset id. Kept here rather than in scanned.js so the
   runtime carries no knowledge of where its textures came from. */
const SETS = {
  'asphalt':         'Asphalt026',
  'asphalt-worn':    'Asphalt014',
  'asphalt-rubber':  'Asphalt023',
  'concrete-walk':   'Concrete042',
  'concrete-curb':   'Concrete033',
  'paving-stones':   'PavingStones131',
  'gravel':          'Gravel023',
  'metal-panel':     'Metal046',
  'roof-seam':       'Metal032',
  'timber-deck':     'WoodFloor041',
};

/* ambientCG map suffix -> the name this project uses. NormalGL, never
   NormalDX: three.js is OpenGL convention and a DX map inverts green, which
   lights every bump as a dent. */
const MAPS = {
  '_Color.jpg': 'color.jpg',
  '_NormalGL.jpg': 'normal.jpg',
  '_Roughness.jpg': 'roughness.jpg',
  '_AmbientOcclusion.jpg': 'ao.jpg',
};

const want = process.argv.slice(2);
const todo = Object.entries(SETS).filter(([dir]) => !want.length || want.includes(dir));
if (!todo.length) {
  console.error('no such set. known:', Object.keys(SETS).join(', '));
  process.exit(1);
}

fs.mkdirSync(out, { recursive: true });
let done = 0, skipped = 0, failed = 0;

for (const [dir, id] of todo) {
  const dest = path.join(out, dir);
  if (fs.existsSync(path.join(dest, 'color.jpg'))) {
    console.log(`skip  ${dir} (already present)`);
    skipped++;
    continue;
  }
  const url = `https://ambientcg.com/get?file=${id}_2K-JPG.zip`;
  const zip = path.join(out, `.${dir}.zip`);
  try {
    execFileSync('curl', ['-sSL', '--fail', '-m', '180', '-o', zip, url], { stdio: 'pipe' });
    fs.mkdirSync(dest, { recursive: true });
    const tmp = path.join(out, `.${dir}.unzip`);
    fs.rmSync(tmp, { recursive: true, force: true });
    execFileSync('unzip', ['-qo', zip, '-d', tmp], { stdio: 'pipe' });
    let kept = 0;
    for (const f of fs.readdirSync(tmp)) {
      for (const [suffix, name] of Object.entries(MAPS)) {
        if (f.endsWith(suffix)) { fs.copyFileSync(path.join(tmp, f), path.join(dest, name)); kept++; }
      }
    }
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(zip, { force: true });
    if (!kept) throw new Error('zip held none of the expected maps');
    console.log(`ok    ${dir}  <- ${id}  (${kept} maps)`);
    done++;
  } catch (e) {
    fs.rmSync(zip, { force: true });
    const msg = String(e.stderr || e.message || e).trim().split('\n').pop();
    console.error(`FAIL  ${dir}  <- ${id}: ${msg}`);
    failed++;
  }
}

/* The runtime probes one manifest rather than firing a request per map, so a
   world with no textures costs a single 404 instead of forty. Rewrite it from
   what is actually on disk, not from what this run fetched. */
const onDisk = Object.keys(SETS).filter((dir) =>
  fs.existsSync(path.join(out, dir, 'color.jpg')));
fs.writeFileSync(path.join(out, 'index.json'),
  JSON.stringify({ sets: onDisk, written: new Date().toISOString() }, null, 2) + '\n');
console.log(`\nindex.json lists ${onDisk.length} set${onDisk.length === 1 ? '' : 's'}`);

console.log(`${done} fetched, ${skipped} already present, ${failed} failed`);
if (failed) {
  console.error('\nIf these are proxy 403s, ambientcg.com is not on this');
  console.error('environment\'s network allowlist yet. That is the blocker.');
  process.exit(1);
}
