import fs from 'node:fs';
const rw = (p, f) => { const s = fs.readFileSync(p, 'utf8'); fs.writeFileSync(p, f(s)); };

rw('src/11-perimeter.js', (s) => s.replace(
  "import { place } from './02-registry.js';",
  "import { place, reserve } from './02-registry.js';"));

const COAST_IDS = ['ocean', 'estuary-water', 'creek-water', 'inlet-water', 'creek-works',
  'oyster-reefs', 'living-shoreline', 'buoy-line', 'sand-fence',
  'wrack-line', 'cleanup-fleet', 'heritage-promenade'];

rw('src/13-coast.js', (s) => {
  s = s.replace("import { place } from './02-registry.js';",
                "import { place, placeContainer } from './02-registry.js';");
  for (const id of COAST_IDS) {
    const needle = `id: '${id}', layer:`;
    const at = s.indexOf(needle);
    if (at < 0) { console.warn('coast: not found', id); continue; }
    const open = s.lastIndexOf('place({', at);
    if (open < 0) { console.warn('coast: no place( for', id); continue; }
    s = s.slice(0, open) + 'placeContainer({' + s.slice(open + 'place({'.length);
  }
  return s;
});

rw('src/15-props.js', (s) => {
  s = s.replace("import { place, reserve, registry } from './02-registry.js';",
                "import { place, reserve, registry, placeContainer } from './02-registry.js';");
  for (const id of ['luminaires', 'street-furniture', 'ground-utilities',
                    'wayfinding', 'vehicles', 'detail-pass']) {
    const needle = `id: '${id}', layer:`;
    const at = s.indexOf(needle);
    if (at < 0) { console.warn('props: not found', id); continue; }
    const open = s.lastIndexOf('place({', at);
    s = s.slice(0, open) + 'placeContainer({' + s.slice(open + 'place({'.length);
  }
  return s;
});

rw('src/14-vegetation.js', (s) => s
  .replace("import { reserve, registry } from './02-registry.js';",
           "import { reserve, registry, placeContainer } from './02-registry.js';")
  .replace(`  reserve({
    id: 'vegetation', layer: LAYER.VEGETATION,
    footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
    y0: -100, y1: -99,                     /* deliberately out of the way */
    tags: ['no-geom-audit'], allowOverlapWith: ['*'],
    site: 'vegetation container',
  });`,
  `  placeContainer({
    id: 'vegetation', layer: LAYER.VEGETATION,
    parent: g, site: 'vegetation container', build: () => new THREE.Group(),
  });`));

for (const f of ['src/13-coast.js', 'src/15-props.js', 'src/14-vegetation.js']) {
  const s = fs.readFileSync(f, 'utf8');
  console.log(f, 'placeContainer:', (s.match(/placeContainer\(/g) || []).length);
}
