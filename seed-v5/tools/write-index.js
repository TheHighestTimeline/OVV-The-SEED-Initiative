/* tools/write-index.js — list the material sets that are actually on disk.
   scanned.js reads this to skip probing for sets that were never downloaded.
   It is only an optimisation: without it the loader probes every directory
   and pays a 404 per absent set. Run after adding or removing a set. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'public', 'assets', 'materials');
if (!fs.existsSync(dir)) { console.error('no', dir); process.exit(1); }

/* a set is a directory carrying at least the two maps the loader requires */
const sets = fs.readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .filter((e) => ['color.jpg', 'roughness.jpg']
    .every((f) => fs.existsSync(path.join(dir, e.name, f))))
  .map((e) => e.name)
  .sort();

fs.writeFileSync(path.join(dir, 'index.json'),
  JSON.stringify({ sets, written: new Date().toISOString().slice(0, 10) }, null, 2) + '\n');
console.log(`index.json: ${sets.length} sets — ${sets.join(', ')}`);
