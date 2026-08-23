/* ============================================================================
   SEED Initiative Living Campus — v4
   00-config.js — seed, PRNG, ledgers, quality tiers, master site plan
   ----------------------------------------------------------------------------
   Datum: sea level = y 0.000. Campus graded pad = y 18.000.
   +X east, +Z south (seaward). All units metres.
   ========================================================================== */

export const VERSION = 'v5.0';
export const BUILD_DATE = '2026-08-23';

/* ------------------------------------------------------------- time states
   Two, only. No scrubber, no dawn, no dusk: a fixed afternoon with long soft
   shadows and a night where the lighting design actually shows. Each state
   is an hour fed to the same physical pipeline; the environment map and fog
   probe are baked per state and cached, so the toggle is a hard swap. */
export const TIME_STATES = {
  afternoon: 15.5,   /* ~27 deg sun elevation — long soft shadows */
  night: 21.6,       /* street lights on, windows lit, dark-sky east */
};

/* ---------------------------------------------------------------- seed / PRNG */
const qs = (typeof location !== 'undefined')
  ? new URLSearchParams(location.search) : new URLSearchParams('');

export const WORLD_SEED = (function () {
  const s = qs.get('seed');
  const n = s == null ? NaN : parseInt(s, 10);
  return Number.isFinite(n) ? (n >>> 0) : 20260809;
})();

/* mulberry32 — small, fast, well-distributed, fully deterministic */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const f = function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length) % arr.length];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  f.chance = (p) => f() < p;
  /* gaussian-ish, clamped */
  f.bell = (lo, hi) => {
    const t = (f() + f() + f()) / 3;
    return lo + (hi - lo) * t;
  };
  return f;
}

/* the global build stream. Sub-systems take their own named streams so that
   adding an object in one zone cannot shift the numbers in another. */
export const rnd = makeRng(WORLD_SEED);
const streamCache = new Map();
export function stream(name) {
  if (streamCache.has(name)) return streamCache.get(name);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0;
  }
  const r = makeRng((h ^ WORLD_SEED) >>> 0);
  streamCache.set(name, r);
  return r;
}
export function resetStreams() { streamCache.clear(); }

/* ------------------------------------------------------- the elevation ledger
   These are OFFSETS above the local ground height siteH(x,z), never absolute Y.
   Every ground-hugging surface in the project reads its Y from here. No ground
   surface anywhere else in the codebase may use a numeric Y literal.
   Adjacent layers are separated by >= 0.015.                                  */
export const ELEV = {
  terrain:      0.000,
  waterBed:     0.005,
  subgrade:     0.020,
  asphalt:      0.055,
  gutter:       0.072,
  roadMarking:  0.090,
  crosswalk:    0.108,
  aggregate:    0.120,
  concreteWalk: 0.138,
  walkJoint:    0.156,
  paver:        0.174,
  pavementEdge: 0.192,
  decal:        0.212,
  overlay:      0.230,
};
Object.freeze(ELEV);

/* every decal-class surface must carry these */
export const POLY_OFFSET = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };

/* render order runs in the same sequence as the ledger so the merge pass and
   the depth test agree */
export const RENDER_ORDER = {
  terrain: 0, waterBed: 1, subgrade: 2, asphalt: 3, gutter: 4,
  roadMarking: 5, crosswalk: 6, aggregate: 7, concreteWalk: 8, walkJoint: 9,
  paver: 10, pavementEdge: 11, decal: 12, overlay: 13, water: 20,
};

/* ------------------------------------------------------------- the layer ledger
   Every object declares one. The collision matrix in 02-registry is defined
   per layer pair. Nothing enters the world without a layer.                    */
export const LAYER = {
  TERRAIN:    'TERRAIN',
  WATER:      'WATER',
  ROAD:       'ROAD',
  WALK:       'WALK',
  STRUCTURE:  'STRUCTURE',
  CANOPY:     'CANOPY',
  PROP:       'PROP',
  VEGETATION: 'VEGETATION',
  UTILITY:    'UTILITY',
  MARKER:     'MARKER',
};
Object.freeze(LAYER);

/* ------------------------------------------------------------- quality tiers */
export const TIERS = {
  ultra: {
    name: 'Ultra', cascades: 4, shadowMap: 2048, ao: 'gtao', aoScale: 1.0,
    post: { bloom: true, taa: true, ssr: true, grain: true },
    pixelRatioCap: 2, vegetation: 1.00, drawBudget: 900, waveComponents: 8,
    detailNormals: true, probes: true, lightCull: 32,
  },
  high: {
    name: 'High', cascades: 3, shadowMap: 2048, ao: 'gtao', aoScale: 0.5,
    post: { bloom: true, taa: true, ssr: false, grain: true },
    pixelRatioCap: 2, vegetation: 1.00, drawBudget: 600, waveComponents: 6,
    detailNormals: true, probes: true, lightCull: 24,
  },
  balanced: {
    name: 'Balanced', cascades: 2, shadowMap: 1024, ao: 'ssao', aoScale: 0.5,
    post: { bloom: true, taa: false, ssr: false, grain: false },
    pixelRatioCap: 1, vegetation: 0.60, drawBudget: 350, waveComponents: 4,
    detailNormals: false, probes: false, lightCull: 12,
  },
  mobile: {
    name: 'Mobile', cascades: 1, shadowMap: 1024, ao: 'off', aoScale: 0,
    post: { bloom: false, taa: false, ssr: false, grain: false },
    pixelRatioCap: 1, vegetation: 0.35, drawBudget: 200, waveComponents: 3,
    detailNormals: false, probes: false, lightCull: 6, impostorsOnly: true,
  },
};
export const TIER_ORDER = ['mobile', 'balanced', 'high', 'ultra'];

/* ------------------------------------------------------------ render constants
   Defined once. v3 set exposure, sun intensity and sun elevation and then
   overwrote all three in setTime(); each value here has exactly one home.     */
export const CAMERA = { fov: 52, near: 4.0, far: 14000 };
export const TONEMAP_EXPOSURE = 1.0;          /* AgX baseline; time-of-day scales it */
export const TEXTURE_SIZE = { default: 512, mobile: 256 };

/* =============================================================== MASTER PLAN */
/* Everything downstream reads these. Change a number here and the roads, walks,
   berm, fence, bioswale and terrain all move together.                         */

export const SITE = {
  /* vertical */
  seaLevel:   0.0,
  padY:       18.0,          /* campus graded pad elevation */
  padBatter:  3.0,           /* cut/fill side slope, run:rise */

  /* campus plan — offsets measured from the campus centre along the axis normal */
  interior:      370,        /* usable campus interior half-extent */
  walkOffset:    374,        /* perimeter sidewalk centreline */
  ringOffset:    385,        /* perimeter road centreline */
  ringWidth:     15,
  ringRadius:    70,         /* corner radius of the perimeter ring */
  fenceOffset:   396,
  setback:       10.5,       /* fence -> bioswale outer shoulder (spec min 9.1) */
  swaleOffset:   415,        /* bioswale valley centreline */
  swaleWidth:    5,
  swaleDepth:    0,          /* flat — no valley (owner direction) */
  swaleRun:      6.0,        /* batter run; 1.2 rise over 4.8 straight = 4:1 */
  swaleFillet:   1.2,
  bermToeIn:     424,
  bermHeight:    0,          /* the earth berm is GONE (owner direction,
                                2026-08-23): the perimeter is a precast
                                concrete wall on the fence line, connected
                                to the gatehouses. The toe/crest offsets
                                stay as landmarks for the outfall and the
                                planted screen, now on flat ground. */
  bermRun:       42,         /* 12 rise over 36 straight = exactly 3:1 */
  bermFillet:    6,          /* rounded toe and crest, as real earthwork is */
  bermCrestHalf:  3,
  bermCrest:     469,        /* toeIn + run + crestHalf */
  bermToeOut:    514,        /* crest + crestHalf + run */
  wallHeight:    3.6,        /* precast perimeter wall on the fence line */
  wallThick:     0.65,
  boundary:      560,

  /* gates: {axis:'x'|'z', sign:-1|1, at: coordinate along the other axis, width} */
  gates: [
    { id: 'gate-north',  axis: 'z', sign: -1, at:    0, width: 34, kind: 'main' },
    { id: 'gate-west',   axis: 'x', sign: -1, at: -120, width: 30, kind: 'haul' },
    { id: 'gate-south',  axis: 'z', sign:  1, at:   40, width: 30, kind: 'community' },
  ],

  /* ===================== THE GREAT PEE DEE RIVER, east of the campus ======
     Bennettsville sits on the Coastal Plain upland; the Great Pee Dee runs
     north to south about eight miles east and forms the Marlboro County
     line. Campus stormwater genuinely drains to it, which is why the
     corridor now runs east rather than to an invented beach. */
  river: {
    centreX:    1080,   /* mean channel centreline */
    meanderAmp:  120,   /* how far the channel swings either side */
    meanderLen:  980,   /* wavelength of the meander train */
    halfWidth:    58,   /* half the low-water channel */
    bedY:       1.60,   /* thalweg */
    surfN:      7.45,   /* water surface at the north edge of the map */
    surfS:      6.55,   /* and at the south: 0.9 m of fall over 2.8 km */
    bluffX0:     620,   /* the west valley wall */
    bluffX1:     815,
    bluffTop:  19.20,
    bluffToe:   8.55,
    floodX1:    1540,   /* east edge of the floodplain */
    leveeH:     1.05,   /* natural levee above the backswamp */
    backswampY: 6.85,
    eastRise:  12.60,
    pointBarY:  8.10,   /* sand deposit on the inside of a bend */
    cutBankH:   3.90,   /* scarp height on the outside of a bend */
  },

  /* legacy coastal keys, still defined so nothing that imports them throws
     while the river zone replaces them */
  corridorStartZ:   520,     /* bioswale outfall headwall, just past the berm toe */
  corridorEndZ:     900,
  estuaryStartZ:    900,
  estuaryEndZ:     1180,
  shoreRoadZ:      1215,
  duneStartZ:      1250,
  duneCrestZ:      1288,
  duneEndZ:        1322,
  beachBackZ:      1322,
  wrackZ:          1352,
  swashZ:          1392,
  oceanEndZ:       3400,
  duneHeight:      6.4,
  tideLevel:        0.0,

  /* beyond the fence — north of the campus */
  arterialZ:      -700,
  hoodStartZ:    -1240,
  hoodEndZ:       -760,
  hoodMinX:       -820,
  hoodMaxX:        820,

  /* east parkway linking the arterial to the shore road */
  parkwayX:        640,
};
Object.freeze(SITE);
Object.freeze(SITE.gates);

/* the world's outer bound, used for terrain extent and fog tuning */
export const WORLD = {
  minX: -1500, maxX: 1500,
  minZ: -1400, maxZ: SITE.oceanEndZ,
};
Object.freeze(WORLD);

/* --------------------------------------------------------------- noise basis */
export function h2(x, y) {
  let n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
export function sm(t) { return t * t * (3 - 2 * t); }

export function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = sm(xf), v = sm(yf);
  const a = h2(xi, yi), b = h2(xi + 1, yi), c = h2(xi, yi + 1), d = h2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export function fbm(x, y, oct, lac, gain) {
  oct = oct || 4; lac = lac || 2.03; gain = gain || 0.5;
  let f = 1, a = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f);
    n += a; a *= gain; f *= lac;
  }
  return s / n;
}

/* ridged variant — used for the dune line and the beach berm */
export function ridged(x, y, oct) {
  oct = oct || 3;
  let f = 1, a = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * (1 - Math.abs(vnoise(x * f, y * f) * 2 - 1));
    n += a; a *= 0.5; f *= 2.07;
  }
  return s / n;
}

export function speckle(x, y) {
  return h2(Math.floor(x * 7.3), Math.floor(y * 7.3));
}

/* ------------------------------------------------------------------ helpers */
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/* C1-continuous, used wherever two terrain masks meet */
export const smootherstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/* squared distance from a point to a segment, plus the parametric t */
export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / L2 : 0;
  t = clamp(t, 0, 1);
  const cx = ax + t * dx, cz = az + t * dz;
  return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
}

/* signed distance to a rounded rectangle centred on the origin — the shape of
   the perimeter ring, the berm centreline and the fence line */
export function sdRoundRect(x, z, half, r) {
  const qx = Math.abs(x) - (half - r);
  const qz = Math.abs(z) - (half - r);
  const ax = Math.max(qx, 0), az = Math.max(qz, 0);
  return Math.hypot(ax, az) + Math.min(Math.max(qx, qz), 0) - r;
}

export const DEG = Math.PI / 180;
