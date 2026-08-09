import fs from 'node:fs';
const edit = (p, pairs) => {
  let s = fs.readFileSync(p, 'utf8');
  for (const [a, b] of pairs) {
    if (!s.includes(a)) { console.warn('MISS', p, JSON.stringify(a.slice(0, 70))); continue; }
    s = s.split(a).join(b);
  }
  fs.writeFileSync(p, s);
};

edit('src/00-config.js', [
  ['    pointBarY:  8.10,   /* sand deposit on the inside of a bend */',
   '    pointBarY:  8.10,   /* sand deposit on the inside of a bend */\n    cutBankH:   3.90,   /* scarp height on the outside of a bend */'],
]);

edit('src/01-terrain.js', [
  /* valleyFloor should build on the shared regional surface */
  ['  const upland = trendY(z) + (fbm(x * 0.0011, z * 0.0011, 3) - 0.5) * 6.5;',
   '  const upland = regional(x, z);'],
  ['const lip = outer > 0 ? riverSurface(z) + (RV.cutBankH != null ? RV.cutBankH : 4.2) : RV.pointBarY;',
   'const lip = outer > 0 ? riverSurface(z) + RV.cutBankH : RV.pointBarY;'],

  /* ---- the creek now runs EAST from the bioswale outfall to the river ---- */
  [`export const CREEK = [];
(function buildCreek() {
  const z0 = SITE.corridorStartZ, z1 = SITE.estuaryEndZ;
  for (let z = z0; z <= z1; z += 10) {
    const t = (z - z0) / (z1 - z0);
    const amp = lerp(26, 120, smoothstep(0, 1, t));
    const x = 40 + Math.sin(t * 7.1) * amp * 0.55 + Math.sin(t * 2.3 + 1.1) * amp * 0.45;
    /* channel widens and its bed falls continuously downstream */
    const w = lerp(7, 96, Math.pow(t, 1.7));
    const bed = lerp(15.2, -0.9, Math.pow(t, 0.78));
    CREEK.push({ x, z, w, bed });
  }
})();`,
`/* The campus tributary: it leaves the bioswale at the east berm toe, cuts the
   bluff in a short ravine and joins the Pee Dee on the floodplain. Roughly
   2 percent grade, which is why it has a real valley of its own. */
export const CREEK = [];
(function buildCreek() {
  const x0 = SITE.bermToeOut + 6;                 /* 520: just past the berm */
  const N = 64;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = lerp(x0, riverCentre(200) - SITE.river.halfWidth - 26, t);
    const z = 60 + Math.sin(t * 3.4) * 46 + t * 150;
    const w = lerp(6, 30, Math.pow(t, 1.5));
    const bed = lerp(15.6, riverSurface(z) + 0.25, Math.pow(t, 0.72));
    CREEK.push({ x, z, w, bed });
  }
})();`],

  /* creekCut indexed by z no longer works — index by x instead */
  [`function creekCut(x, z) {
  if (z < SITE.corridorStartZ - 40 || z > SITE.estuaryEndZ + 60) return null;
  /* index by z since the polyline is monotonic in z */
  let i = Math.floor((z - SITE.corridorStartZ) / 10);
  i = clamp(i, 0, CREEK.length - 2);
  let best = null;
  for (let k = Math.max(0, i - 3); k < Math.min(CREEK.length - 1, i + 4); k++) {`,
`function creekCut(x, z) {
  if (x < CREEK[0].x - 60 || x > CREEK[CREEK.length - 1].x + 60) return null;
  if (z < -120 || z > 380) return null;
  /* the polyline is monotonic in x */
  const span = CREEK[CREEK.length - 1].x - CREEK[0].x;
  let i = Math.floor(((x - CREEK[0].x) / span) * (CREEK.length - 1));
  i = clamp(i, 0, CREEK.length - 2);
  let best = null;
  for (let k = Math.max(0, i - 4); k < Math.min(CREEK.length - 1, i + 5); k++) {`],

  /* ---- siteH: valley and channel replace dune / beach / marsh / inlet ---- */
  [`export function siteH(x, z) {
  let y = regional(x, z);

  /* coastal shaping first — it owns the terrain seaward of the corridor */
  const dune = duneTerm(x, z);
  if (z > SITE.beachBackZ - 12) {
    const bt = beachTerm(x, z);
    const w = smootherstep(SITE.beachBackZ - 12, SITE.beachBackZ + 26, z);
    y = lerp(y, bt, w);
  }
  const marsh = marshTerm(x, z);
  if (marsh) y = lerp(y, marsh.y, marsh.k);
  if (dune > 0) y = Math.max(y, lerp(y, 1.1, 0.6) + dune);

  /* the inlet is cut last on the coastal side so it slices the dune ridge */
  const inl = inletCut(x, z);
  if (inl) y = lerp(y, Math.min(y, inl.y), inl.k);`,
`export function siteH(x, z) {
  /* the valley surface already contains the upland, the bluff, the floodplain
     and the east bank */
  let y = valleyFloor(x, z);

  /* the channel is cut into it, then the abandoned meanders */
  const ch = channelCut(x, z);
  if (ch != null) y = Math.min(y, ch);
  const ox = oxbowCut(x, z);
  if (ox) y = lerp(y, Math.min(y, ox.y), ox.k);`],

  /* ---- the water table ---- */
  [`export function waterY(x, z) {
  /* ocean and estuary */
  if (z > SITE.estuaryStartZ - 20) {
    const g = _siteH(x, z);
    if (g < SITE.tideLevel + 0.02) return { y: SITE.tideLevel, kind: z > SITE.beachBackZ ? 'ocean' : 'estuary' };
  }`,
`export function waterY(x, z) {
  /* the river, its oxbows, and the backswamp that ponds behind the levee */
  if (x > SITE.river.bluffX0) {
    const surf = riverSurface(z);
    const d = Math.abs(x - riverCentre(z));
    if (d < SITE.river.halfWidth * 1.22) return { y: surf, kind: 'river' };
    const ox = oxbowCut(x, z);
    if (ox && ox.k > 0.18) return { y: riverSurface(z) - 0.15, kind: 'oxbow' };
    if (x < SITE.river.floodX1 + 60 && _siteH(x, z) < surf - 0.12) {
      return { y: surf - 0.12, kind: 'backswamp' };
    }
  }`],
]);

/* the biome map: point bars are sand, backswamp is mud, floodplain is meadow */
edit('src/01-terrain.js', [
  [`  /* coastal */
  const coastal = smoothstep(SITE.duneStartZ - 60, SITE.duneStartZ + 30, z);
  const wet = smoothstep(SITE.wrackZ + 6, SITE.swashZ - 4, z);
  const sub = smoothstep(SITE.swashZ - 2, SITE.swashZ + 30, z);

  /* estuary mud */
  const mud = smoothstep(SITE.estuaryStartZ - 30, SITE.estuaryStartZ + 80, z) *
              (1 - smoothstep(SITE.duneStartZ - 90, SITE.duneStartZ - 10, z));`,
`  /* the river valley */
  const surf = riverSurface(z);
  const dCh = Math.abs(x - riverCentre(z));
  const inValley = smootherstep(SITE.river.bluffX0, SITE.river.bluffX1, x);
  /* exposed sand: point bars and the channel margin */
  const coastal = inValley * (1 - smoothstep(SITE.river.halfWidth * 1.5,
                                             SITE.river.halfWidth * 3.4, dCh));
  const wet = inValley * (1 - smoothstep(0, 0.9, Math.abs(y - surf)));
  const sub = inValley * (y < surf ? 1 : 0);
  /* backswamp mud behind the levee */
  const mud = inValley * smoothstep(SITE.river.halfWidth + 120,
                                    SITE.river.halfWidth + 320, dCh)
              * (1 - smoothstep(SITE.river.floodX1, SITE.river.floodX1 + 200, x));`],
  [`  /* below the tide line everything is wet sand or mud */
  if (y < SITE.tideLevel + 0.15 && z > SITE.estuaryStartZ) {
    w[BIOME.WETSAND] += 1.8; w[BIOME.GRASS] = 0; w[BIOME.MEADOW] *= 0.2;
  }`,
`  /* under water it is all wet sand and silt */
  if (x > SITE.river.bluffX0 && y < surf + 0.10) {
    w[BIOME.WETSAND] += 1.8; w[BIOME.GRASS] = 0; w[BIOME.MEADOW] *= 0.2;
  }
  /* the floodplain is meadow and bottomland, never mown lawn */
  if (x > SITE.river.bluffX1) { w[BIOME.MEADOW] += 1.1; w[BIOME.GRASS] *= 0.25; }`],
]);

console.log('patch-river-2 applied');
