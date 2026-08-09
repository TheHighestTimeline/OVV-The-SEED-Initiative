import fs from 'node:fs';

/* ---------------------------------------------------- SITE: the Pee Dee block */
{
  const p = 'src/00-config.js';
  let s = fs.readFileSync(p, 'utf8');
  const anchor = '  /* coastal / watershed corridor — all on the +Z (seaward) side */';
  if (!s.includes(anchor)) throw new Error('SITE anchor missing');
  s = s.replace(anchor, [
    '  /* ===================== THE GREAT PEE DEE RIVER, east of the campus ======',
    '     Bennettsville sits on the Coastal Plain upland; the Great Pee Dee runs',
    '     north to south about eight miles east and forms the Marlboro County',
    '     line. Campus stormwater genuinely drains to it, which is why the',
    '     corridor now runs east rather than to an invented beach. */',
    '  river: {',
    '    centreX:    1080,   /* mean channel centreline */',
    '    meanderAmp:  120,   /* how far the channel swings either side */',
    '    meanderLen:  980,   /* wavelength of the meander train */',
    '    halfWidth:    58,   /* half the low-water channel */',
    '    bedY:       1.60,   /* thalweg */',
    '    surfN:      7.45,   /* water surface at the north edge of the map */',
    '    surfS:      6.55,   /* and at the south: 0.9 m of fall over 2.8 km */',
    '    bluffX0:     620,   /* the west valley wall */',
    '    bluffX1:     815,',
    '    bluffTop:  19.20,',
    '    bluffToe:   8.55,',
    '    floodX1:    1540,   /* east edge of the floodplain */',
    '    leveeH:     1.05,   /* natural levee above the backswamp */',
    '    backswampY: 6.85,',
    '    eastRise:  12.60,',
    '    pointBarY:  8.10,   /* sand deposit on the inside of a bend */',
    '  },',
    '',
    '  /* legacy coastal keys, still defined so nothing that imports them throws',
    '     while the river zone replaces them */',
  ].join('\n'));
  fs.writeFileSync(p, s);
  console.log('SITE.river added');
}

/* --------------------------------------------- TERRAIN: valley replaces coast */
{
  const p = 'src/01-terrain.js';
  let s = fs.readFileSync(p, 'utf8');

  /* 1. the regional trend is now a gentle north-south fall on the upland,
        not a march to the sea */
  s = s.replace(
`const TREND = [
  [-1400, 27.5], [-1000, 25.0], [-700, 22.0], [-300, 19.5], [0, 18.5],
  [ 500,  15.0], [  700, 8.5],  [ 900,  3.0], [1180, 0.35], [1250, 1.10],
  [1322,  1.60], [ 1392, 0.00], [1500, -2.2], [1700, -6.0], [2200, -18.0],
  [2800, -32.0], [3400, -46.0],
];`,
`const TREND = [
  [-1400, 24.6], [-1000, 23.4], [-700, 22.2], [-300, 20.4], [0, 19.6],
  [ 500,  18.9], [ 1000, 18.2], [ 1400, 17.6],
];`);

  /* 2. relief tapers into the valley, not toward a shore */
  s = s.replace(
`function reliefAmp(z) {
  if (z < 400) return 1.0;
  if (z > 1180) return 0.10;
  return lerp(1.0, 0.10, smoothstep(400, 1180, z));
}`,
`function reliefAmp(x) {
  /* the upland rolls; the floodplain is flat alluvium */
  return 1 - 0.86 * smoothstep(SITE.river.bluffX0 - 60, SITE.river.bluffX1 + 90, x);
}`);
  s = s.replace(
`function regional(x, z) {
  const a = reliefAmp(z);`,
`function regional(x, z) {
  const a = reliefAmp(x);`);

  /* 3. the river itself -------------------------------------------------- */
  const RIVER_BLOCK = `
/* ======================================================= THE PEE DEE RIVER
   A meandering channel with point bars on the inside of every bend, cut banks
   on the outside, natural levees, backswamp behind them, and a bluff on the
   west bank that the campus sits above. */
const RV = SITE.river;

/* channel centreline as a function of z, plus the local bend curvature */
export function riverCentre(z) {
  const t = z / RV.meanderLen;
  return RV.centreX
    + Math.sin(t * Math.PI * 2) * RV.meanderAmp
    + Math.sin(t * Math.PI * 2 * 0.41 + 1.7) * RV.meanderAmp * 0.42;
}
function riverBend(z) {
  /* positive when the channel is swinging east, i.e. the point bar is west */
  const e = 12;
  return (riverCentre(z + e) - riverCentre(z - e)) / (2 * e);
}
export function riverSurface(z) {
  return lerp(RV.surfN, RV.surfS, clamp((z + 1400) / 2800, 0, 1));
}

/* the valley floor before the channel is cut into it */
function valleyFloor(x, z) {
  const bluff = smootherstep(RV.bluffX0, RV.bluffX1, x);
  const upland = trendY(z) + (fbm(x * 0.0011, z * 0.0011, 3) - 0.5) * 6.5;
  let y = lerp(upland, RV.bluffToe, bluff);
  if (x <= RV.bluffX0) return y;

  /* floodplain: natural levee beside the channel, backswamp behind it */
  const cx = riverCentre(z);
  const d = Math.abs(x - cx);
  const levee = Math.exp(-Math.pow((d - RV.halfWidth - 34) / 46, 2)) * RV.leveeH;
  const back = smoothstep(RV.halfWidth + 90, RV.halfWidth + 300, d)
             * (1 - smoothstep(RV.floodX1 - 120, RV.floodX1 + 80, x));
  const flood = lerp(RV.bluffToe, RV.backswampY, back) + levee;
  const inFlood = smootherstep(RV.bluffX1 - 40, RV.bluffX1 + 60, x)
                * (1 - smootherstep(RV.floodX1, RV.floodX1 + 220, x));
  y = lerp(y, flood, inFlood);

  /* east bank rises out of the floodplain */
  const east = smootherstep(RV.floodX1, RV.floodX1 + 320, x);
  y = lerp(y, RV.eastRise + (fbm(x * 0.0016, z * 0.0016, 3) - 0.5) * 4.5, east);

  /* alluvial ridge-and-swale texture across the floodplain */
  y += (fbm(x * 0.0052, z * 0.0026, 3) - 0.5) * 1.5 * inFlood;
  return y;
}

/* cut the channel, with an asymmetric section: point bar inside, scarp outside */
function channelCut(x, z) {
  const cx = riverCentre(z);
  const bend = riverBend(z);
  const d = x - cx;
  const ad = Math.abs(d);
  const outer = Math.sign(d) === Math.sign(bend) ? 1 : -1;   /* +1 = cut bank */
  const half = RV.halfWidth * (1 + 0.16 * Math.sin(z * 0.0021));
  const bank = half + (outer > 0 ? 26 : 150);                /* bar is wide, scarp is not */
  if (ad > bank) return null;
  if (ad <= half) {
    /* the thalweg hugs the outer bank */
    const across = d / half;
    const skew = clamp(across * Math.sign(bend), -1, 1);
    const deep = RV.bedY - 0.9 * skew;
    return deep + Math.pow(Math.abs(across), 2.1) * 2.6;
  }
  const t = (ad - half) / (bank - half);
  const lip = outer > 0 ? riverSurface(z) + RV.cutBank : RV.pointBarY;
  return lerp(RV.bedY + 2.6, lip, Math.pow(t, outer > 0 ? 0.55 : 1.35));
}

/* abandoned meanders left on the floodplain */
export const OXBOWS = [
  { x: 905,  z: -520, rx: 190, rz: 62, rot: 0.42, depth: 2.3 },
  { x: 1285, z:  480, rx: 150, rz: 54, rot: -0.55, depth: 2.0 },
  { x: 980,  z: 1080, rx: 165, rz: 48, rot: 0.22, depth: 1.8 },
];
function oxbowCut(x, z) {
  for (const o of OXBOWS) {
    const c = Math.cos(o.rot), s2 = Math.sin(o.rot);
    const dx = (x - o.x) * c + (z - o.z) * s2;
    const dz = -(x - o.x) * s2 + (z - o.z) * c;
    const r = Math.hypot(dx / o.rx, dz / o.rz);
    if (r > 1.5) continue;
    /* a crescent, not an ellipse: the inner side is filled with sediment */
    const cres = clamp(1 - Math.abs(r - 0.72) / 0.30, 0, 1);
    if (cres <= 0) continue;
    const surf = riverSurface(o.z);
    return { y: surf - o.depth * cres, k: cres };
  }
  return null;
}
`;
  s = s.replace('/* ------------------------------------------------------------- watershed + coastal */', RIVER_BLOCK + '\n/* ------------------------------------------------------------- watershed */');
  s = s.replace('RV.cutBank :', 'RV.cutBankH != null ? RV.cutBankH : 4.2 :');

  fs.writeFileSync(p, s);
  console.log('terrain: river block inserted');
}
