/* tools/build.js — bundle every module and inline into one self-contained HTML */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const dev = process.argv.includes('--dev');

const stamp = (() => {
  const d = process.env.BUILD_DATE || '2026-08-23';
  return d.replace(/-/g, '');
})();

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['chrome110', 'firefox110', 'safari16'],
  minify: !dev,
  sourcemap: false,
  legalComments: 'none',
  write: false,
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': dev ? '"development"' : '"production"' },
});

const bundle = result.outputFiles[0].text;
/* index.html is the single source of markup — the Vite entry and the
   standalone export read the same file. Vite's module script tag is swapped
   for the inlined IIFE so the export has no external requests. */
const tpl = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tag = /<script[^>]*type="module"[^>]*src="\/src\/main\.js"[^>]*><\/script>/;
if (!tag.test(tpl)) {
  console.error('index.html no longer contains the module entry script tag');
  process.exit(1);
}
const html = tpl.replace(tag, () => `<script>${bundle}</script>`);

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
const name = `OVMG_SEED_CityWorld_${stamp}_v5${dev ? '_dev' : ''}.html`;
const out = path.join(outDir, name);
fs.writeFileSync(out, html);

const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`built ${name}  ${mb} MB  (bundle ${(bundle.length / 1048576).toFixed(2)} MB)`);

/* verify: no external requests except the fonts link */
const ext = [...html.matchAll(/(?:src|href)\s*=\s*["'](https?:\/\/[^"']+)/g)].map((m) => m[1]);
const bad = ext.filter((u) => !/fonts\.(googleapis|gstatic)\.com/.test(u));
if (bad.length) { console.error('EXTERNAL REQUESTS FOUND:', bad); process.exit(1); }
console.log(`external requests: ${ext.length} (fonts only) — OK`);
if (Buffer.byteLength(html) > 12 * 1048576) {
  console.error(`FAIL: output exceeds the 12 MB budget`); process.exit(1);
}
