/* quick structural probe of the height field — run with: node tools/probe-terrain.js */
import { SITE } from '../src/00-config.js';
import { siteH, groundH, perimU, waterY, slopeAt, CREEK } from '../src/01-terrain.js';

function row(label, v) { console.log(String(label).padEnd(34), v); }

console.log('\n=== PERIMETER CROSS-SECTION (south axis, x=0, away from any gate) ===');
console.log('u        z       y        note');
const stations = [
  [0, 'campus interior'], [370, 'interior edge'], [374, 'perimeter walk'],
  [385, 'ring road CL'], [396, 'fence'], [406.5, "swale outer shoulder"],
  [415, "swale invert"], [424, 'berm inner toe'], [440, 'berm face'],
  [469, "BERM CREST + acoustic wall base"], [480, 'berm outer face'],
  [514, "berm outer toe"], [540, 'natural grade'],
];
for (const [u, note] of stations) {
  const z = u;                       /* on the +Z axis, u == z */
  const y = siteH(-260, z);          /* x=-260 keeps us clear of the south gate at x=40 */
  console.log(String(u).padEnd(9), String(z).padEnd(7), y.toFixed(3).padEnd(9), note);
}

console.log('\n=== BERM SLOPE CHECK (max slope on the berm faces) ===');
let maxSlope = 0, at = null;
for (let z = 424; z <= 514; z += 0.5) {
  const s = slopeAt(-260, z, 0.5);
  if (s > maxSlope) { maxSlope = s; at = z; }
}
row('max berm slope (deg)', (maxSlope * 180 / Math.PI).toFixed(2) + '  at z=' + at);
row('required <= 3:1 (18.43 deg)', maxSlope * 180 / Math.PI <= 18.6 ? 'PASS' : 'FAIL');

console.log('\n=== PAD FLATNESS (campus interior) ===');
let padMin = Infinity, padMax = -Infinity;
for (let i = 0; i < 4000; i++) {
  const x = (Math.random() * 2 - 1) * 360, z = (Math.random() * 2 - 1) * 360;
  const y = siteH(x, z);
  padMin = Math.min(padMin, y); padMax = Math.max(padMax, y);
}
row('pad y range', padMin.toFixed(4) + ' .. ' + padMax.toFixed(4));
row('expected exactly ' + SITE.padY, (padMax - padMin) < 0.001 ? 'PASS' : 'FAIL');

console.log('\n=== GATE OPENINGS (berm must be interrupted) ===');
for (const g of SITE.gates) {
  const x = g.axis === 'z' ? g.at : g.sign * SITE.bermCrest;
  const z = g.axis === 'z' ? g.sign * SITE.bermCrest : g.at;
  row(g.id + ' crest y (want ~18)', siteH(x, z).toFixed(3));
}
row('control: crest away from gate', siteH(-260, SITE.bermCrest).toFixed(3) + '  (want ~30)');

console.log('\n=== CONTINUITY (no cliffs) — max |dy| per metre over 60k samples ===');
let worst = 0, worstAt = null;
for (let i = 0; i < 60000; i++) {
  const x = -1400 + Math.random() * 2800;
  const z = -1300 + Math.random() * 4400;
  const d = Math.abs(siteH(x + 1, z) - siteH(x, z)) + Math.abs(siteH(x, z + 1) - siteH(x, z));
  if (d > worst) { worst = d; worstAt = [x.toFixed(0), z.toFixed(0)]; }
}
row('worst combined dy/m', worst.toFixed(3) + '  at ' + worstAt);

console.log('\n=== SEAWARD PROFILE (x=200) ===');
for (const z of [500, 700, 900, 1100, 1180, 1250, 1288, 1322, 1352, 1392, 1450, 1600, 2200]) {
  const w = waterY(200, z);
  console.log('z=' + String(z).padEnd(6), 'ground', siteH(200, z).toFixed(2).padEnd(8),
    'water', w ? (w.y.toFixed(2) + ' ' + w.kind) : '-');
}

console.log('\n=== CREEK PROFILE ===');
row('creek nodes', CREEK.length);
row('bed at head / mouth',
  CREEK[0].bed.toFixed(2) + ' -> ' + CREEK[CREEK.length - 1].bed.toFixed(2));
let mono = true;
for (let i = 1; i < CREEK.length; i++) if (CREEK[i].bed > CREEK[i - 1].bed + 1e-6) mono = false;
row('bed falls monotonically', mono ? 'PASS' : 'FAIL');

console.log('\n=== PONDS BELOW GRADE ===');
let pondFail = 0;
for (let i = 0; i < 2000; i++) {
  const a = Math.random() * Math.PI * 2;
  for (const p of [[316, -290, 40], [322, -186, 35], [312, -92, 30]]) {
    const bank = groundH(p[0] + Math.cos(a) * (p[2] + 3), p[1] + Math.sin(a) * (p[2] + 3));
    const lvl = groundH(p[0], p[1]);
    if (lvl >= bank) pondFail++;
  }
}
row('pond bed above adjacent bank', pondFail === 0 ? 'PASS (0)' : 'FAIL (' + pondFail + ')');
console.log('');

console.log('\n=== SLOPE DISTRIBUTION (whole world, 40k samples) ===');
const buckets = {};
let over45 = 0, worstS = 0, worstP = null;
for (let i = 0; i < 40000; i++) {
  const x = -1400 + Math.random() * 2800, z = -1300 + Math.random() * 4400;
  const s = slopeAt(x, z, 1.5) * 180 / Math.PI;
  const b = Math.floor(s / 10) * 10;
  buckets[b] = (buckets[b] || 0) + 1;
  if (s > 45) over45++;
  if (s > worstS) { worstS = s; worstP = [x.toFixed(0), z.toFixed(0)]; }
}
Object.keys(buckets).sort((a,b)=>a-b).forEach(k =>
  console.log(('  ' + k + '-' + (+k+10) + ' deg').padEnd(16), buckets[k]));
console.log('  samples over 45 deg:', over45, ' worst', worstS.toFixed(1), 'at', worstP);

console.log('\n=== BIOSWALE OUTFALL / CREEK HEAD ===');
for (const z of [505, 514, 520, 540, 570, 620]) {
  const w = waterY(40, z);
  console.log('  z=' + String(z).padEnd(5), 'ground', siteH(40, z).toFixed(2).padEnd(7),
    'water', w ? w.y.toFixed(2) + ' ' + w.kind : '-');
}

console.log('\n=== TIDAL INLET (dune must be cut through) ===');
for (const z of [1150, 1250, 1288, 1322, 1392, 1450]) {
  console.log('  z=' + String(z).padEnd(5), 'inlet CL ground',
    siteH(-210 + Math.sin(Math.max(0,(z-1130))/370*2)*34, z).toFixed(2).padEnd(7),
    '| dune 400m east', siteH(190, z).toFixed(2));
}
