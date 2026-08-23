/* ============================================================================
   01-terrain.js — one height field, one water table, one terrain mesh
   ----------------------------------------------------------------------------
   siteH(x,z) is the single source of truth for ground elevation. Every object
   in the world resolves its base Y from it.

   The berm, the bioswale valley, the dune ridge, the creek channel and the
   beach profile are all BAKED INTO THE HEIGHT FIELD rather than modelled as
   separate solids. That is the structural fix for v3's headline defect: the
   berm cannot phase through the acoustic wall because the berm is the ground,
   and the wall reads its base from the ground.
   ========================================================================== */

import * as THREE from 'three';
import {
  SITE, WORLD, fbm, ridged, vnoise, clamp, lerp, smoothstep, smootherstep,
  sdRoundRect, distToSeg, LAYER, ELEV,
} from './00-config.js';

/* ------------------------------------------------- perimeter offset coordinate
   A single scalar u(x,z): the distance from the campus centre measured through
   the rounded-rectangle field that the ring road, fence, swale, berm and wall
   all share. Because every perimeter feature is a function of u alone, they are
   concentric by construction and can never cross each other.                  */
const PERIM_REF = 400;
export function perimU(x, z) {
  return sdRoundRect(x, z, PERIM_REF, SITE.ringRadius) + PERIM_REF;
}

/* the outward unit normal of that same field, for sweeping the wall and fence */
export function perimNormal(x, z) {
  const e = 0.5;
  const dx = perimU(x + e, z) - perimU(x - e, z);
  const dz = perimU(x, z + e) - perimU(x, z - e);
  const L = Math.hypot(dx, dz) || 1;
  return { x: dx / L, z: dz / L };
}

/* ---------------------------------------------------------------- berm gates
   Each gate opens a gap in the swale and the berm. Returns 0 inside the
   opening, 1 well away from it, smoothly.                                     */
function gateOpen(x, z) {
  let k = 1;
  for (const g of SITE.gates) {
    const along = g.axis === 'z' ? x : z;
    const across = g.axis === 'z' ? z : x;
    if (Math.sign(across) !== g.sign) continue;
    const half = g.width / 2;
    const d = Math.abs(along - g.at);
    /* full opening across the gate width, feathered over 26 m of wing wall */
    k = Math.min(k, smootherstep(half, half + 26, d));
  }
  return k;
}

/* ------------------------------------------------------------- base regional
   Sandhills relief inland, trending down to the datum at the shore.           */
const TREND = [
  [-1400, 24.6], [-1000, 23.4], [-700, 22.2], [-300, 20.4], [0, 19.6],
  [ 500,  18.9], [ 1000, 18.2], [ 1400, 17.6],
];
function trendY(z) {
  if (z <= TREND[0][0]) return TREND[0][1];
  const n = TREND.length;
  if (z >= TREND[n - 1][0]) return TREND[n - 1][1];
  for (let i = 0; i < n - 1; i++) {
    if (z >= TREND[i][0] && z <= TREND[i + 1][0]) {
      const t = (z - TREND[i][0]) / (TREND[i + 1][0] - TREND[i][0]);
      return lerp(TREND[i][1], TREND[i + 1][1], smoothstep(0, 1, t));
    }
  }
  return 0;
}

/* relief amplitude tapers to nothing at the water so the beach reads flat */
function reliefAmp(x) {
  /* the upland rolls; the floodplain is flat alluvium */
  return 1 - 0.86 * smoothstep(SITE.river.bluffX0 - 60, SITE.river.bluffX1 + 90, x);
}

function regional(x, z) {
  const a = reliefAmp(x);
  const big = (fbm(x * 0.00085, z * 0.00085, 4) - 0.5) * 17.0;
  const mid = (fbm(x * 0.0034, z * 0.0034, 3) - 0.5) * 5.2;
  const fine = (vnoise(x * 0.021, z * 0.021) - 0.5) * 0.85;
  return trendY(z) + (big + mid) * a + fine * (0.35 + 0.65 * a);
}

/* ---------------------------------------------------------- grading corridors
   Design profiles for the roads that leave the flat campus pad. Terrain blends
   to the profile inside halfWidth and back to natural over blend. This is how
   real road grading works, and it is why no road in v4 hangs in the air or
   buries itself the way v3's beyond-the-fence road did (7.4 m up at one end,
   3.3 m down at the other).                                                    */
export const GRADE_CORRIDORS = [
  { id: 'arterial',  halfWidth: 17, blend: 46, pts: [
      [-1200, -700, 24.5], [-820, -700, 23.6], [-400, -700, 22.6],
      [    0, -700, 22.0], [ 400, -700, 21.4], [ 640, -700, 21.0],
      [ 1200, -700, 20.2] ] },
  { id: 'approach',  halfWidth: 13, blend: 40, pts: [
      [0, -700, 22.0], [0, -620, 21.2], [0, -560, 20.2], [0, -502, 18.9],
      [0, -463, 18.4], [0, -424, 18.0], [0, -396, 18.0] ] },
  { id: 'haul-west', halfWidth: 12, blend: 36, pts: [
      [-396, -120, 18.0], [-424, -120, 18.0], [-463, -120, 18.5],
      [-502, -120, 19.4], [-580, -120, 20.6], [-700, -120, 21.6] ] },
  { id: 'south-gate', halfWidth: 12, blend: 40, pts: [
      [40, 396, 18.0], [40, 424, 18.0], [40, 463, 17.6], [40, 502, 16.6],
      [40, 560, 15.2] ] },
  /* River Road runs along the top of the west bluff, then drops to the landing */
  { id: 'bluff-road', halfWidth: 13, blend: 40, pts: [
      [600, -900, 21.6], [600, -400, 20.4], [600, 0, 19.4], [600, 400, 18.6],
      [600, 900, 17.8], [600, 1300, 17.2] ] },
  { id: 'landing-road', halfWidth: 11, blend: 34, pts: [
      [600, 260, 18.8], [700, 280, 15.4], [800, 300, 10.6], [900, 310, 8.6],
      [980, 315, 8.3] ] },
  { id: 'hood-main', halfWidth: 13, blend: 34, pts: [
      [-820, -880, 25.0], [-400, -880, 24.2], [0, -880, 23.6],
      [400, -880, 23.0], [820, -880, 22.4] ] },
  { id: 'hood-cross', halfWidth: 11, blend: 30, pts: [
      [-260, -1180, 26.4], [-260, -880, 23.6], [-260, -700, 22.6] ] },
  { id: 'hood-cross2', halfWidth: 11, blend: 30, pts: [
      [300, -1180, 25.6], [300, -880, 23.0], [300, -700, 21.5] ] },
];

/* bounding boxes for a fast reject */
for (const c of GRADE_CORRIDORS) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of c.pts) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  const m = c.halfWidth + c.blend + 2;
  c.bbox = [x0 - m, x1 + m, z0 - m, z1 + m];
}

function corridorGrade(x, z) {
  let bestW = 0, bestY = 0;
  for (const c of GRADE_CORRIDORS) {
    const b = c.bbox;
    if (x < b[0] || x > b[1] || z < b[2] || z > b[3]) continue;
    let dMin = Infinity, yAt = 0;
    for (let i = 0; i < c.pts.length - 1; i++) {
      const a = c.pts[i], q = c.pts[i + 1];
      const r = distToSeg(x, z, a[0], a[1], q[0], q[1]);
      if (r.d < dMin) { dMin = r.d; yAt = lerp(a[2], q[2], r.t); }
    }
    const w = 1 - smootherstep(c.halfWidth, c.halfWidth + c.blend, dMin);
    if (w > bestW) { bestW = w; bestY = yAt; }
  }
  return { w: bestW, y: bestY };
}

/* ------------------------------------------------------------- the campus pad
   Flat at SITE.padY out to the swale, with a real 3:1 cut/fill batter beyond
   the berm's outer toe rather than v3's vertical step.                        */
function padTerm(u) {
  /* 1 inside the pad, feathering out through the swale shoulder */
  return 1 - smootherstep(SITE.interior + 20, SITE.bermToeIn + 6, u);
}

/* ------------------------------------------------------- perimeter earthworks
   A real earthwork batter is a straight face with a rounded toe and crest, not
   a sigmoid. A smootherstep ramp peaks at 1.875x its average slope, which is
   what turned a nominal 3:1 berm into a 32 degree face on the first pass.
   batter() holds the straight-section slope at exactly H/(run-fillet).        */
function batter(d, run, H, fil) {
  if (d <= 0) return 0;
  if (d >= run) return H;
  const s = H / (run - fil);
  if (d < fil) return s * d * d / (2 * fil);
  if (d > run - fil) { const e = run - d; return H - s * e * e / (2 * fil); }
  return s * (d - fil / 2);
}

function swaleCut(u) {
  const half = SITE.swaleWidth / 2;
  const d = Math.abs(u - SITE.swaleOffset);
  if (d >= half + SITE.swaleRun) return 0;
  if (d <= half) return -SITE.swaleDepth;
  return -(SITE.swaleDepth -
    batter(d - half, SITE.swaleRun, SITE.swaleDepth, SITE.swaleFillet));
}

function bermRise(u) {
  const H = SITE.bermHeight, R = SITE.bermRun, F = SITE.bermFillet;
  const toeIn = SITE.bermToeIn;
  const crestIn = toeIn + R;
  const crestOut = crestIn + SITE.bermCrestHalf * 2;
  if (u <= toeIn || u >= crestOut + R) return 0;
  if (u < crestIn) return batter(u - toeIn, R, H, F);
  if (u <= crestOut) return H;
  return H - batter(u - crestOut, R, H, F);
}

/* ------------------------------------------------------- watershed + coastal */

/* the creek centreline: bioswale outfall -> meandering channel -> estuary */
/* ======================================================= THE PEE DEE RIVER
   A meandering channel with point bars on the inside of every bend, cut banks
   on the outside, natural levees, backswamp behind them, and the bluff on the
   west bank that the campus sits above. */
const RV = SITE.river;

export function riverCentre(z) {
  const t = z / RV.meanderLen;
  return RV.centreX
    + Math.sin(t * Math.PI * 2) * RV.meanderAmp
    + Math.sin(t * Math.PI * 2 * 0.41 + 1.7) * RV.meanderAmp * 0.42;
}
function riverBend(z) {
  const e = 12;
  return (riverCentre(z + e) - riverCentre(z - e)) / (2 * e);
}
export function riverSurface(z) {
  return lerp(RV.surfN, RV.surfS, clamp((z + 1400) / 2800, 0, 1));
}

/* the valley floor before the channel is cut into it */
function valleyFloor(x, z) {
  const upland = regional(x, z);
  const bluff = smootherstep(RV.bluffX0, RV.bluffX1, x);
  let y = lerp(upland, RV.bluffToe, bluff);
  if (x <= RV.bluffX0) return y;

  const cx = riverCentre(z);
  const d = Math.abs(x - cx);
  const levee = Math.exp(-Math.pow((d - RV.halfWidth - 34) / 46, 2)) * RV.leveeH;
  const back = smoothstep(RV.halfWidth + 90, RV.halfWidth + 300, d)
             * (1 - smoothstep(RV.floodX1 - 120, RV.floodX1 + 80, x));
  const flood = lerp(RV.bluffToe, RV.backswampY, back) + levee;
  const inFlood = smootherstep(RV.bluffX1 - 40, RV.bluffX1 + 60, x)
                * (1 - smootherstep(RV.floodX1, RV.floodX1 + 220, x));
  y = lerp(y, flood, inFlood);

  const east = smootherstep(RV.floodX1, RV.floodX1 + 320, x);
  y = lerp(y, RV.eastRise + (fbm(x * 0.0016, z * 0.0016, 3) - 0.5) * 4.5, east);

  /* alluvial ridge-and-swale texture across the floodplain */
  y += (fbm(x * 0.0052, z * 0.0026, 3) - 0.5) * 1.5 * inFlood;
  return y;
}

/* the channel, asymmetric: point bar inside the bend, scarp outside */
function channelCut(x, z) {
  const cx = riverCentre(z);
  const bend = riverBend(z);
  const d = x - cx;
  const ad = Math.abs(d);
  const outer = Math.sign(d) === Math.sign(bend) ? 1 : -1;
  const half = RV.halfWidth * (1 + 0.16 * Math.sin(z * 0.0021));
  const bank = half + (outer > 0 ? 26 : 150);
  if (ad > bank) return null;
  if (ad <= half) {
    const across = d / half;
    const skew = clamp(across * Math.sign(bend || 1), -1, 1);
    const deep = RV.bedY - 0.9 * skew;
    return deep + Math.pow(Math.abs(across), 2.1) * 2.6;
  }
  const t = (ad - half) / (bank - half);
  const lip = outer > 0 ? riverSurface(z) + RV.cutBankH : RV.pointBarY;
  return lerp(RV.bedY + 2.6, lip, Math.pow(t, outer > 0 ? 0.55 : 1.35));
}

/* abandoned meanders left on the floodplain */
export const OXBOWS = [
  { x: 905,  z: -520, rx: 190, rz: 62, rot:  0.42, depth: 2.3 },
  { x: 1285, z:  480, rx: 150, rz: 54, rot: -0.55, depth: 2.0 },
  { x: 980,  z: 1080, rx: 165, rz: 48, rot:  0.22, depth: 1.8 },
];
function oxbowCut(x, z) {
  for (const o of OXBOWS) {
    const c = Math.cos(o.rot), s2 = Math.sin(o.rot);
    const dx = (x - o.x) * c + (z - o.z) * s2;
    const dz = -(x - o.x) * s2 + (z - o.z) * c;
    const r = Math.hypot(dx / o.rx, dz / o.rz);
    if (r > 1.5) continue;
    /* a crescent, not an ellipse: the inner side has silted up */
    const cres = clamp(1 - Math.abs(r - 0.72) / 0.30, 0, 1);
    if (cres <= 0) continue;
    return { y: riverSurface(o.z) - o.depth * cres, k: cres };
  }
  return null;
}


/* The campus tributary: it leaves the bioswale at the east berm toe, cuts the
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
})();

function creekCut(x, z) {
  if (x < CREEK[0].x - 60 || x > CREEK[CREEK.length - 1].x + 60) return null;
  if (z < -120 || z > 380) return null;
  /* the polyline is monotonic in x */
  const span = CREEK[CREEK.length - 1].x - CREEK[0].x;
  let i = Math.floor(((x - CREEK[0].x) / span) * (CREEK.length - 1));
  i = clamp(i, 0, CREEK.length - 2);
  let best = null;
  for (let k = Math.max(0, i - 4); k < Math.min(CREEK.length - 1, i + 5); k++) {
    const a = CREEK[k], b = CREEK[k + 1];
    const r = distToSeg(x, z, a.x, a.z, b.x, b.z);
    if (!best || r.d < best.d) {
      best = { d: r.d, w: lerp(a.w, b.w, r.t), bed: lerp(a.bed, b.bed, r.t) };
    }
  }
  return best;
}

/* the dune ridge — a real ridge line with blowouts, not a smooth wall */
function duneTerm(x, z) {
  if (z < SITE.duneStartZ - 30 || z > SITE.duneEndZ + 30) return 0;
  const crest = SITE.duneCrestZ + Math.sin(x * 0.0038) * 8 + (vnoise(x * 0.0021, 3.1) - 0.5) * 14;
  /* seaward face is steeper than the landward back, but both stay under the
     angle of repose for dry sand (about 33 degrees) */
  const halfIn = 56, halfOut = 40;
  const d = z - crest;
  const p = d < 0 ? 1 - smootherstep(0, halfIn, -d) : 1 - smootherstep(0, halfOut, d);
  /* height varies along the shore; blowouts where the ridged field dips */
  const hv = 0.58 + 0.42 * ridged(x * 0.0018, 11.7, 3);
  const blow = smoothstep(0.20, 0.52, vnoise(x * 0.0031, 5.3));
  return SITE.duneHeight * hv * p * lerp(0.34, 1.0, blow);
}

/* the beach face and the nearshore bar */
function beachTerm(x, z) {
  if (z < SITE.beachBackZ - 10) return 0;
  let y = 0;
  if (z <= SITE.swashZ) {
    /* dry sand -> wrack -> wet sand -> swash, gentle concave profile */
    const t = smoothstep(SITE.beachBackZ, SITE.swashZ, z);
    y = lerp(1.55, 0.02, Math.pow(t, 1.35));
    y += (vnoise(x * 0.05, z * 0.05) - 0.5) * 0.10;
  } else {
    const t = (z - SITE.swashZ);
    y = -0.9 * Math.pow(t / 60, 1.15);
    /* longshore bar at roughly 120 m out, then the shelf */
    const bar = Math.exp(-Math.pow((t - 120) / 46, 2)) * 1.35;
    y += bar;
    y = Math.max(y, trendY(z));
    y += (vnoise(x * 0.006, z * 0.006) - 0.5) * 1.4 * smoothstep(0, 200, t);
  }
  return y;
}

/* ------------------------------------------------------------- tidal inlet
   Without this the estuary is a sealed basin behind the dune. The inlet cuts
   the dune line and the beach so the marsh, the creek and the ocean are one
   connected body of water — which is the whole point of the watershed story. */
export const INLET = { x: -210, halfW: 44, z0: 1130, z1: 1500, bed: -2.8 };

export function inletCentre(z) {
  const t = clamp((z - INLET.z0) / (INLET.z1 - INLET.z0), 0, 1);
  return INLET.x + Math.sin(t * 2.0) * 34;
}

function inletCut(x, z) {
  if (z < INLET.z0 - 30 || z > INLET.z1) return null;
  const cx = inletCentre(z);
  const d = Math.abs(x - cx);
  const half = INLET.halfW * (0.62 + 0.55 * smoothstep(INLET.z0, INLET.z1, z));
  const bank = half + 34;
  if (d > bank) return null;
  const t = d <= half ? 0 : smootherstep(half, bank, d);
  const k = smootherstep(INLET.z0 - 30, INLET.z0 + 55, z) *
            (1 - smootherstep(INLET.z1 - 90, INLET.z1, z));
  if (k < 0.001) return null;
  /* ebb shoal just outside the mouth keeps the bar from reading as a wall */
  const shoal = smoothstep(SITE.swashZ, SITE.swashZ + 90, z) * 1.1;
  return { y: lerp(INLET.bed + shoal, 1.7, t), k };
}

/* tidal marsh flats: near-level platform just above the tide, cut by creeks */
function marshTerm(x, z) {
  if (z < SITE.estuaryStartZ - 40 || z > SITE.estuaryEndZ + 40) return null;
  const k = smootherstep(SITE.estuaryStartZ - 40, SITE.estuaryStartZ + 90, z) *
            (1 - smootherstep(SITE.estuaryEndZ - 70, SITE.estuaryEndZ + 40, z));
  if (k < 0.001) return null;
  const flat = 0.62 + (vnoise(x * 0.011, z * 0.011) - 0.5) * 0.36;
  /* dendritic tidal creeks incised into the flat */
  const den = Math.abs(fbm(x * 0.0042, z * 0.0042, 4) - 0.5) * 2;
  const chan = (1 - smoothstep(0.0, 0.14, den)) * 1.25;
  return { k, y: flat - chan };
}

/* ============================================================ THE HEIGHT FIELD */
export function siteH(x, z) {
  /* the valley surface already contains the upland, the bluff, the floodplain
     and the east bank */
  let y = valleyFloor(x, z);

  /* the channel is cut into it, then the abandoned meanders */
  const ch = channelCut(x, z);
  if (ch != null) y = Math.min(y, ch);
  const ox = oxbowCut(x, z);
  if (ox) y = lerp(y, Math.min(y, ox.y), ox.k);

  /* creek channel incision */
  const ck = creekCut(x, z);
  if (ck) {
    const half = ck.w / 2;
    const bank = half + Math.max(6, ck.w * 0.45);
    if (ck.d < bank) {
      const t = ck.d <= half ? 0 : smootherstep(half, bank, ck.d);
      const chan = lerp(ck.bed, y, t);
      y = Math.min(y, chan);
      /* a low natural levee just outside the bank */
      if (ck.d > half && ck.d < bank * 1.4) {
        y += 0.35 * Math.exp(-Math.pow((ck.d - bank) / (bank * 0.3), 2));
      }
    }
  }

  /* campus pad, swale and berm — all functions of the single offset u */
  const u = perimU(x, z);
  if (u < SITE.bermToeOut + 60) {
    if (u <= SITE.interior) {
      /* the graded campus pad, dead flat */
      y = lerp(y, SITE.padY, padTerm(u));
    } else {
      /* The perimeter section is referenced to the pad elevation, so the swale
         invert and the berm crest are level the whole way round. Because swale
         and berm are both functions of u alone, and the wall reads its base
         from this same field, the v3 berm-through-wall failure is not
         expressible. */
      const g = gateOpen(x, z);
      const perimY = SITE.padY + swaleCut(u) * g + bermRise(u) * g;
      /* re-tie the outer toe into natural ground with a 3:1 batter */
      const outT = smootherstep(SITE.bermToeOut, SITE.bermToeOut + 46, u);
      y = lerp(perimY, regional(x, z), outT);
    }
  }

  /* road grading corridors win over natural ground inside their envelope */
  const c = corridorGrade(x, z);
  if (c.w > 0.001) y = lerp(y, c.y, c.w);

  /* Hard constraint, applied last: the river bed stays below the river. The
     pad, the berm and the grading corridors all run after the channel is cut,
     and any of them could otherwise lift a bank back above the water line. */
  if (x > SITE.river.bluffX1) {
    const dCh = Math.abs(x - riverCentre(z));
    if (dCh < SITE.river.halfWidth) {
      const target = riverSurface(z) - lerp(2.4, 0.7, dCh / SITE.river.halfWidth);
      y = Math.min(y, target);
    }
  }

  return y;
}

/* central-difference normal and slope, used by the material splat and by the
   validator's slope checks */
export function siteNormal(x, z, e) {
  e = e || 1.0;
  const hL = siteH(x - e, z), hR = siteH(x + e, z);
  const hD = siteH(x, z - e), hU = siteH(x, z + e);
  const n = new THREE.Vector3(hL - hR, 2 * e, hD - hU);
  n.normalize();
  return n;
}
export function slopeAt(x, z, e) {
  const n = siteNormal(x, z, e);
  return Math.acos(clamp(n.y, -1, 1));           /* radians from vertical */
}

/* ============================================================== WATER TABLE */

export const PONDS = [
  { id: 'pond-a', x: 330, z: -290, r: 40, level: SITE.padY - 1.55, depth: 3.4 },
  { id: 'pond-b', x: 332, z: -186, r: 35, level: SITE.padY - 1.95, depth: 3.0 },
  { id: 'pond-c', x: 326, z:  -92, r: 30, level: SITE.padY - 2.35, depth: 2.6 },
];

/* pond bowls are excavated into the pad: the water sits BELOW surrounding
   grade. v3 floated its ponds 0.48 m above grade on a coplanar paver slab. */
function pondCut(x, z) {
  for (const p of PONDS) {
    const d = Math.hypot(x - p.x, z - p.z);
    const lip = p.r + 16;
    if (d > lip) continue;
    const bowl = p.level - p.depth * (1 - Math.pow(clamp(d / p.r, 0, 1), 2));
    if (d <= p.r) return bowl;
    const t = smootherstep(p.r, lip, d);
    return lerp(p.level - 0.15, SITE.padY, t);
  }
  return null;
}

/* siteH does not know about ponds; ponds are cut in a second pass so that the
   validator can also ask "is this point in a pond bowl?" */
const _siteH = siteH;
export function groundH(x, z) {
  const p = pondCut(x, z);
  const base = _siteH(x, z);
  return p != null ? Math.min(base, p) : base;
}

/* the water surface, or null where there is none */
export function waterY(x, z) {
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
  }
  /* creek */
  const ck = creekCut(x, z);
  if (ck && ck.d < ck.w / 2 + 1.5) {
    return { y: Math.max(ck.bed + Math.min(1.1, 0.22 + ck.w * 0.035), SITE.tideLevel), kind: 'creek' };
  }
  /* ponds */
  for (const p of PONDS) {
    if (Math.hypot(x - p.x, z - p.z) <= p.r) return { y: p.level, kind: 'pond', pond: p };
  }
  /* bioswale holds water only in the invert, and only intermittently */
  return null;
}

/* ================================================================== BIOMES
   Six terrain material layers, blended per vertex. Because the UVs are derived
   from world position, texel density is uniform by construction. v3 had grass
   at 87 m per tile on the terrain and 0.042 m per tile on the berm.           */
export const BIOME = { GRASS: 0, MEADOW: 1, SAND: 2, WETSAND: 3, GRAVEL: 4, SOIL: 5 };

export function biomeAt(x, z, y, slope) {
  const w = [0, 0, 0, 0, 0, 0];
  const u = perimU(x, z);

  /* the river valley */
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
              * (1 - smoothstep(SITE.river.floodX1, SITE.river.floodX1 + 200, x));

  /* campus disturbed ground near the industrial zone */
  const industrial = (x < -110 && z < 300 && u < SITE.interior)
    ? smoothstep(0.55, 0.15, Math.abs(x + 250) / 200) : 0;

  /* base */
  w[BIOME.GRASS] = 1.0;
  w[BIOME.MEADOW] = 0.10 + 0.55 * smoothstep(SITE.interior - 10, SITE.bermToeIn, u)
                    * (1 - smoothstep(SITE.bermToeOut, SITE.bermToeOut + 50, u));
  /* the whole bermed perimeter is meadow and native grass, not mown lawn */
  if (u > SITE.interior + 8 && u < SITE.bermToeOut + 20) {
    w[BIOME.MEADOW] += 1.3;
    w[BIOME.GRASS] *= 0.35;
  }
  /* far field is meadow too — mown lawn only reads on the campus itself */
  if (u > SITE.bermToeOut + 20) { w[BIOME.MEADOW] += 0.9; w[BIOME.GRASS] *= 0.5; }

  w[BIOME.SAND] += coastal * 2.4;
  w[BIOME.WETSAND] += (wet + sub) * 2.6;
  w[BIOME.SOIL] += mud * 2.2;
  w[BIOME.GRAVEL] += industrial * 1.1;

  /* slope-driven soil exposure on steep faces */
  const st = smoothstep(0.42, 0.72, slope);
  w[BIOME.SOIL] += st * 1.5;
  w[BIOME.GRASS] *= (1 - st * 0.7);
  w[BIOME.MEADOW] *= (1 - st * 0.4);

  /* under water it is all wet sand and silt */
  if (x > SITE.river.bluffX0 && y < surf + 0.10) {
    w[BIOME.WETSAND] += 1.8; w[BIOME.GRASS] = 0; w[BIOME.MEADOW] *= 0.2;
  }
  /* the floodplain is meadow and bottomland, never mown lawn */
  if (x > SITE.river.bluffX1) { w[BIOME.MEADOW] += 1.1; w[BIOME.GRASS] *= 0.25; }

  /* large-scale mottling so no biome reads as a flat wash */
  const m = fbm(x * 0.0045, z * 0.0045, 3);
  w[BIOME.MEADOW] *= 0.65 + 0.7 * m;
  w[BIOME.GRASS] *= 0.65 + 0.7 * (1 - m);

  let s = 0; for (let i = 0; i < 6; i++) { w[i] = Math.max(w[i], 0); s += w[i]; }
  if (s <= 0) { w[BIOME.SOIL] = 1; s = 1; }
  for (let i = 0; i < 6; i++) w[i] /= s;
  return w;
}

/* =========================================================== TERRAIN MESHES
   Three LOD layers, each split into chunks so frustum culling still works.
   Vertical skirts hide the cracks between layers.                             */

function buildChunk(x0, x1, z0, z1, cell, hole) {
  const nx = Math.max(1, Math.round((x1 - x0) / cell));
  const nz = Math.max(1, Math.round((z1 - z0) / cell));
  const pos = [], nor = [], uv = [], w0 = [], w1 = [], col = [], idx = [];
  const cols = nx + 1, rows = nz + 1;
  const H = new Float32Array(cols * rows);

  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = x0 + (i / nx) * (x1 - x0);
      const z = z0 + (j / nz) * (z1 - z0);
      const y = groundH(x, z);
      H[j * cols + i] = y;
      const n = siteNormal(x, z, Math.max(1, cell * 0.5));
      const sl = Math.acos(clamp(n.y, -1, 1));
      const b = biomeAt(x, z, y, sl);
      pos.push(x, y, z);
      nor.push(n.x, n.y, n.z);
      uv.push(x, z);
      w0.push(b[0], b[1], b[2], b[3]);
      w1.push(b[4], b[5], 0, 0);
      /* broad tonal break-up so a 500 m field is never one flat colour */
      const t = 0.82 + 0.36 * fbm(x * 0.0021, z * 0.0021, 3);
      col.push(t, t * (0.99 + 0.02 * vnoise(x * 0.004, z * 0.004)), t * 0.985);
    }
  }

  let any = false;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      if (hole) {
        const cx = x0 + ((i + 0.5) / nx) * (x1 - x0);
        const cz = z0 + ((j + 0.5) / nz) * (z1 - z0);
        if (cx > hole[0] && cx < hole[1] && cz > hole[2] && cz < hole[3]) continue;
      }
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
      any = true;
    }
  }
  if (!any) return null;

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('bw0', new THREE.Float32BufferAttribute(w0, 4));
  g.setAttribute('bw1', new THREE.Float32BufferAttribute(w1, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* a skirt around a LOD rect, dropped 6 m, so cracks are never visible */
function buildSkirt(x0, x1, z0, z1, cell, drop) {
  const pos = [], nor = [], uv = [], w0 = [], w1 = [], col = [], idx = [];
  const edges = [
    [x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0],
  ];
  let v = 0;
  for (const [ax, az, bx, bz] of edges) {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(2, Math.round(L / cell));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = lerp(ax, bx, t), z = lerp(az, bz, t);
      const y = groundH(x, z);
      const nn = siteNormal(x, z, cell);
      const b = biomeAt(x, z, y, Math.acos(clamp(nn.y, -1, 1)));
      pos.push(x, y, z, x, y - drop, z);
      nor.push(nn.x, nn.y, nn.z, nn.x, nn.y, nn.z);
      uv.push(x, z, x, z - drop);
      w0.push(b[0], b[1], b[2], b[3], b[0], b[1], b[2], b[3]);
      w1.push(b[4], b[5], 0, 0, b[4], b[5], 0, 0);
      col.push(0.8, 0.8, 0.8, 0.6, 0.6, 0.6);
      if (i < n) {
        const a0 = v + i * 2, a1 = a0 + 1, a2 = a0 + 2, a3 = a0 + 3;
        idx.push(a0, a1, a2, a2, a1, a3);
      }
    }
    v += (n + 1) * 2;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('bw0', new THREE.Float32BufferAttribute(w0, 4));
  g.setAttribute('bw1', new THREE.Float32BufferAttribute(w1, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export const LOD_RINGS = [
  { name: 'near', bounds: [-570, 570, -570, 620], cell: 3.2, chunks: [4, 4] },
  { name: 'mid',  bounds: [-1050, 1150, -1150, 1560], cell: 9.0, chunks: [4, 5] },
  { name: 'far',  bounds: [WORLD.minX, WORLD.maxX, WORLD.minZ, WORLD.maxZ], cell: 30, chunks: [3, 4] },
];

export function buildTerrain(material, quality) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const scale = quality && quality.name === 'Mobile' ? 2.6 : 1.0;
  let verts = 0, tris = 0;

  for (let r = 0; r < LOD_RINGS.length; r++) {
    const ring = LOD_RINGS[r];
    const [bx0, bx1, bz0, bz1] = ring.bounds;
    const hole = r > 0 ? LOD_RINGS[r - 1].bounds : null;
    const [cx, cz] = ring.chunks;
    const cell = ring.cell * scale;
    for (let i = 0; i < cx; i++) {
      for (let j = 0; j < cz; j++) {
        const x0 = lerp(bx0, bx1, i / cx), x1 = lerp(bx0, bx1, (i + 1) / cx);
        const z0 = lerp(bz0, bz1, j / cz), z1 = lerp(bz0, bz1, (j + 1) / cz);
        if (hole && x0 >= hole[0] && x1 <= hole[1] && z0 >= hole[2] && z1 <= hole[3]) continue;
        const g = buildChunk(x0, x1, z0, z1, cell, hole);
        if (!g) continue;
        const m = new THREE.Mesh(g, material);
        m.name = `terrain-${ring.name}-${i}-${j}`;
        m.receiveShadow = true;
        m.castShadow = r === 0;
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        group.add(m);
        verts += g.attributes.position.count;
        tris += g.index.count / 3;
      }
    }
    if (r < LOD_RINGS.length - 1) {
      const sk = new THREE.Mesh(buildSkirt(bx0, bx1, bz0, bz1, cell * 2, 8), material);
      sk.name = `terrain-skirt-${ring.name}`;
      sk.receiveShadow = false; sk.castShadow = false;
      sk.matrixAutoUpdate = false; sk.updateMatrix();
      group.add(sk);
    }
  }
  group.userData.stats = { verts, tris, draws: group.children.length };
  return group;
}

/* ------------------------------------------------------------------ helpers */

/* resolve a spec's base Y. 'ground' means the terrain; a number means an offset
   above it; 'abs' passes through. Everything ground-hugging uses ELEV. */
export function resolveY(x, z, y) {
  if (y == null || y === 'ground') return groundH(x, z);
  if (typeof y === 'number') return groundH(x, z) + y;
  if (y.abs != null) return y.abs;
  if (y.ground != null) return groundH(x, z) + y.ground;
  if (y.elev != null) return groundH(x, z) + (ELEV[y.elev] || 0);
  return groundH(x, z);
}

/* mean and max ground height over a footprint — used to set building pad levels
   so a structure never floats at one corner and buries itself at another */
export function padLevel(x, z, w, d, rot, samples) {
  samples = samples || 5;
  const c = Math.cos(rot || 0), s = Math.sin(rot || 0);
  let sum = 0, n = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const lx = (i / (samples - 1) - 0.5) * w;
      const lz = (j / (samples - 1) - 0.5) * d;
      const wx = x + lx * c - lz * s, wz = z + lx * s + lz * c;
      const h = groundH(wx, wz);
      sum += h; n++;
      if (h < min) min = h; if (h > max) max = h;
    }
  }
  return { mean: sum / n, min, max, range: max - min };
}
