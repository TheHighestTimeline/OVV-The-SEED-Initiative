/* ============================================================================
   18-intersections.js — traffic control at every real junction
   ----------------------------------------------------------------------------
   Reads the road graph rather than a hand-written list of positions, so an
   intersection cannot be furnished in the wrong place and a new road cannot
   be added without its control appearing. Every node of degree three or more
   is an intersection and gets, in order of what the approaches justify:

     signalised   — any approach is an arterial or collector, or the node is
                    a four-way carrying a campus loop. Mast arm per approach,
                    pedestrian heads, APS buttons, one controller per node.
     all-way stop — a four-way of local streets. STOP with an ALL WAY plaque
                    on every approach.
     two-way stop — a T or a junction of unequal classes. STOP on the minor
                    approaches only, which is what the major/minor rule
                    actually produces.

   Curb ramps are placed at every corner of every intersection regardless of
   control, because a crossing without a ramp is not a crossing.
   ========================================================================== */

import * as THREE from 'three';
import { LAYER } from './00-config.js';
import { placeContainer } from './02-registry.js';
import { groundH } from './01-terrain.js';
import { MAT } from './03-materials.js';
import {
  signalMast, SignalController, postedSign, streetNameBlade,
  curbRamp, hydrant,
} from './infra/index.js';
import {
  MAST, SPEED, LANE, CURB, CURB_RAMP, MOUNT, crossSection, FT, IN,
} from './spec/index.js';

/* ============================================================ real geometry
   Everything here reads the road as it was actually BUILT, from the edge's
   own half-width and curb width, not from spec/street.js `crossSection()`.

   Those two disagree — the world is built from ROAD_CLASS in 05-roads.js and
   the spec cross-sections describe a different (more standards-correct)
   street. On an arterial the real curb face is at 11.00 m while the spec puts
   it at 9.60 m, so furniture placed off the spec landed 1.4 m inside the
   carriageway. Until ROAD_CLASS is migrated onto the spec, the geometry that
   wins is the geometry that got built.                                     */

/** Lateral offset from the centreline to the face of the curb, as built. */
function curbFace(e) {
  return e.half + (e.spec.curbW || 0);
}

/** Where a pole, sign or hydrant stands: in the verge, clear of the curb. */
function vergeOffset(e, setback) {
  const verge = e.spec.verge || 0;
  const want = curbFace(e) + (setback != null ? setback : FT(2));
  /* never push furniture past the verge into whatever is beyond it */
  return verge > 0 ? Math.min(want, curbFace(e) + verge * 0.6) : want;
}

/**
 * The true corner point between two adjacent approaches: the intersection of
 * their two curb lines.
 *
 * The previous version guessed this as `hypot(halfA, halfB)` along the bisector,
 * which is not the corner of anything — it is why the ramps came out scattered
 * across the grass at angles unrelated to the kerb.
 *
 * Leg A runs out along azimuth `a`; the curb line bounding the sector toward B
 * is A's centreline pushed sideways by A's curb-face offset. Same for B. Two
 * lines, one intersection.
 */
function cornerPoint(node, legA, legB) {
  const a = legA.az, b = legB.az;
  const wA = curbFace(legA.e), wB = curbFace(legB.e);
  /* offset direction for A's curb line is 90 deg toward B, and vice versa */
  const pA = a + Math.PI / 2, pB = b - Math.PI / 2;
  const ax = node.x + Math.cos(pA) * wA, az = node.z + Math.sin(pA) * wA;
  const bx = node.x + Math.cos(pB) * wB, bz = node.z + Math.sin(pB) * wB;
  const dax = Math.cos(a), daz = Math.sin(a);
  const dbx = Math.cos(b), dbz = Math.sin(b);
  const den = dax * dbz - daz * dbx;
  /* near-parallel legs have no usable corner; fall back to the bisector */
  if (Math.abs(den) < 1e-4) {
    const mid = midAngle(a, b);
    const d = Math.max(wA, wB);
    return { x: node.x + Math.cos(mid) * d, z: node.z + Math.sin(mid) * d };
  }
  const t = ((bx - ax) * dbz - (bz - az) * dbx) / den;
  let cx = ax + dax * t, cz = az + daz * t;

  /* Two curb lines meeting at a shallow angle intersect a long way from the
     node — geometrically the true corner, but not a place a kerb return
     exists or a ramp belongs. Left unclamped this threw ramps up to 12.8 m
     out into the grass on the acute legs. Pull anything beyond a plausible
     return back along the same bearing. */
  const dx = cx - node.x, dz = cz - node.z;
  const dist = Math.hypot(dx, dz);
  const limit = Math.hypot(wA, wB) * 1.25;
  if (dist > limit && dist > 1e-6) {
    const k = limit / dist;
    cx = node.x + dx * k; cz = node.z + dz * k;
  }
  return { x: cx, z: cz };
}

/**
 * Walk an edge's REAL sampled geometry outward from a node and return the
 * sample at a given arc length, with its actual normal.
 *
 * Straight-line azimuths from the node are only right while the road is
 * straight. The ring returns here are 70 m radius curves, so a ramp placed by
 * projecting along the initial bearing drifts off the kerb — measured at up to
 * 9.85 m adrift, which is what put the corner slabs out in the grass. Reading
 * the geometry that was actually built removes the guess entirely.
 */
function sampleAlongFromNode(e, node, dist) {
  const sm = e.geomSamples;
  if (!sm || !sm.length) return null;
  const fromA = e.a === node;
  const n = sm.length;
  const stepLen = sm.total / Math.max(1, n - 1);
  let idx = Math.round(dist / stepLen);
  if (idx > n - 1) idx = n - 1;
  const p = fromA ? sm[idx] : sm[n - 1 - idx];
  if (!p) return null;
  /* normals face consistently along the ribbon; flip when walking backward so
     "left of travel away from the node" means the same thing at both ends */
  const f = fromA ? 1 : -1;
  return { x: p.x, z: p.z, nx: p.nx * f, nz: p.nz * f };
}

/* Approach azimuth of an edge measured AT a node: the direction pointing
   away from the node along that edge. */
function approachAzimuth(node, e) {
  const other = e.a === node ? e.b : e.a;
  /* use the first interior control point if the edge is curved, so a bend
     just past the junction does not throw the angle off */
  let tx = other.x, tz = other.z;
  if (e.pts && e.pts.length > 2) {
    const p = e.a === node ? e.pts[1] : e.pts[e.pts.length - 2];
    tx = p[0]; tz = p[1];
  }
  return Math.atan2(tz - node.z, tx - node.x);
}

const MAJOR = ['arterial', 'collector', 'avenue'];
const rank = (cls) => (cls === 'arterial' ? 3 : cls === 'collector' || cls === 'avenue' ? 2
  : cls === 'campusLoop' ? 1 : 0);

function classify(node) {
  const legs = node.edges.map(({ e }) => ({ e, cls: e.cls, r: rank(e.cls) }));
  const maxR = Math.max(...legs.map((l) => l.r));
  const deg = legs.length;
  if (maxR >= 2) return 'signal';
  if (deg >= 4 && maxR >= 1) return 'signal';
  if (deg >= 4) return 'allway';
  return 'twoway';
}

export function buildIntersections(world, roads, pipeline) {
  const g = new THREE.Group();
  g.name = 'intersections';
  world.add(g);

  const out = {
    group: g, controllers: [], signalised: 0, allway: 0, twoway: 0,
    ramps: 0, lamps: [],
  };

  /* nodes that are genuinely junctions */
  const junctions = [...roads.nodes.values()].filter((n) => n.edges.length >= 3);

  placeContainer({
    id: 'intersection-control', layer: LAYER.PROP,
    footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
    y0: -800, y1: -799,
    tags: ['no-geom-audit'], allowOverlapWith: ['*'],
    parent: g, site: 'signals, stop control and curb ramps',
    build: () => {
      const grp = new THREE.Group();

      for (const node of junctions) {
        const kind = classify(node);
        const legs = node.edges.map(({ e }) => ({
          e, cls: e.cls, r: rank(e.cls), az: approachAzimuth(node, e),
        })).sort((a, b) => b.r - a.r);

        /* ---------------------------------------------- curb ramps first */
        /* One pair per corner, between each adjacent pair of approaches. */
        const sorted = [...legs].sort((a, b) => a.az - b.az);
        for (let i = 0; i < sorted.length; i++) {
          const a = sorted[i], b = sorted[(i + 1) % sorted.length];
          if (a.e.spec.curbH <= 0 || b.e.spec.curbH <= 0) continue;  /* no curb, no ramp */
          const radius = curbRadiusFor(a.cls, b.cls);
          /* far enough out along the leg to be clear of the kerb return */
          const back = radius + CURB_RAMP.widthUsed / 2;

          /* The ramp serving street A sits ON A's kerb line, on the side of A
             facing this corner, and its user steps perpendicular to A. Both
             the point and the direction come from the road's own sample, so
             the ramp follows the kerb through a curve instead of leaving it. */
          const place = (leg, otherLeg) => {
            const sp = sampleAlongFromNode(leg.e, node, back);
            if (!sp) return;
            /* which side of `leg` this corner is on: the side whose normal
               points toward the other leg */
            const s = (sp.nx * Math.cos(otherLeg.az) + sp.nz * Math.sin(otherLeg.az)) >= 0 ? 1 : -1;
            const w = curbFace(leg.e);
            const rx = sp.x + sp.nx * s * w;
            const rz = sp.z + sp.nz * s * w;
            /* into the roadway = back along the offset normal */
            const heading = Math.atan2(-sp.nz * s, -sp.nx * s);
            grp.add(curbRamp(rx, rz, heading, {
              reveal: leg.e.spec.curbH,
              width: Math.min(CURB_RAMP.widthUsed, leg.e.half * 0.9),
            }));
            out.ramps++;
          };
          place(a, b);
          place(b, a);
        }

        /* ---------------------------------------------------- the control */
        if (kind === 'signal') {
          out.signalised++;
          const mainLegs = legs.filter((l) => l.r === legs[0].r);
          const crossLegs = legs.filter((l) => l.r !== legs[0].r);
          const mainWidth = crossSection(legs[0].cls).halfWidth * 2;
          const crossWidth = crossSection(
            (crossLegs[0] || legs[0]).cls).halfWidth * 2;

          const ctrl = new SignalController({
            mainWidth, crossWidth,
            mainSpeed: speedFor(legs[0].cls),
            crossSpeed: speedFor((crossLegs[0] || legs[0]).cls),
            /* offset each intersection so the whole campus does not change
               phase in lockstep, which reads as obviously synthetic */
            offset: (Math.abs(node.x * 7 + node.z * 13) % 97),
          });

          /* One cloned lens-material set per LEG of this intersection. Every
             head on a leg shows the same aspect at the same instant, so the
             controller drives the shared materials and the merge pass can
             collapse what was 600+ individually-clothed lens meshes. */
          const lensSets = {
            main:  { lens: [MAT.lensRed.clone(), MAT.lensYellow.clone(), MAT.lensGreen.clone()],
                     ped: { hand: MAT.lensPedHand.clone(), walk: MAT.lensPedWalk.clone(),
                            count: MAT.lensPedHand.clone() } },
            cross: { lens: [MAT.lensRed.clone(), MAT.lensYellow.clone(), MAT.lensGreen.clone()],
                     ped: { hand: MAT.lensPedHand.clone(), walk: MAT.lensPedWalk.clone(),
                            count: MAT.lensPedHand.clone() } },
          };

          for (const leg of legs) {
            /* the arm reaches across the road the driver is approaching on,
               so it hangs over the far lanes; the faces look back at the
               driver, i.e. along the approach toward the node */
            const armAz = leg.az + Math.PI / 2;
            const faceAz = leg.az;
            /* The arm has to reach across the road it signals, so its length
               comes from that road's real width, not from the spec's. */
            const armLen = clampArm(leg.e.half * 2 * 0.95);
            const off = vergeOffset(leg.e, FT(3));
            const back = curbFace(leg.e) + FT(8);
            const sp = sampleAlongFromNode(leg.e, node, back);
            if (!sp) continue;
            const rd = leg.az - Math.PI / 2;
            const s = (sp.nx * Math.cos(rd) + sp.nz * Math.sin(rd)) >= 0 ? 1 : -1;
            const px = sp.x + sp.nx * s * off;
            const pz = sp.z + sp.nz * s * off;
            const set = lensSets[leg.r === legs[0].r ? 'main' : 'cross'];
            const mast = signalMast(px, pz, armLen, armAz, faceAz, {
              pedFacing: leg.az + Math.PI,
              lensMats: set.lens, pedMats: set.ped,
            });
            grp.add(mast);
            ctrl.add(mast, leg.r === legs[0].r ? 'main' : 'cross');
            /* the mast already carries a luminaire arm; register its light */
            out.lamps.push({
              pos: new THREE.Vector3(px, groundH(px, pz) + MAST.shaftHeight, pz),
              aim: new THREE.Vector3(node.x, groundH(node.x, node.z), node.z),
              colour: 0xffd9a8, power: 34, range: 55,
              angle: 1.02, penumbra: 0.6,
            });
          }
          out.controllers.push(ctrl);

        } else {
          /* --------------------------------------------- stop controlled */
          const allWay = kind === 'allway';
          if (allWay) out.allway++; else out.twoway++;
          const minorRank = Math.min(...legs.map((l) => l.r));
          for (const leg of legs) {
            if (!allWay && leg.r !== minorRank) continue;
            /* A stop sign stands in the verge on the driver's right, near the
               stop line. The face looks back along the approach at the driver,
               which is leg.az — that points away from the node, and the driver
               is coming from that direction.

               Right-hand side: travel is toward the node, direction -leg.az.
               Rotating that about +Y by -90 deg gives leg.az - 90, so the
               offset direction is leg.az - PI/2. The magnitude comes from the
               BUILT curb face, not the spec — using the spec put this sign
               1.4 m inside the carriageway on every arterial. */
            const off = vergeOffset(leg.e, MOUNT.offsetUrban + IN(15));
            const back = curbFace(leg.e) + FT(6);
            const sp = sampleAlongFromNode(leg.e, node, back);
            if (!sp) continue;
            /* driver's right: travel is toward the node, so the right-hand
               verge is the side whose normal opposes leg.az - 90 */
            const rd = leg.az - Math.PI / 2;
            const s = (sp.nx * Math.cos(rd) + sp.nz * Math.sin(rd)) >= 0 ? 1 : -1;
            const sx = sp.x + sp.nx * s * off;
            const sz = sp.z + sp.nz * s * off;
            grp.add(postedSign(sx, sz, 'stop', leg.az, {
              roadClass: leg.cls,
              plaque: allWay ? 'allWayPlaque' : null,
            }));
          }
        }
      }
      return grp;
    },
  });

  for (const rec of out.lamps) pipeline.registerLuminaire(rec);

  out.update = (dt) => {
    for (const c of out.controllers) c.update(dt);
  };

  return out;
}

/* ------------------------------------------------------------------ utils */
function midAngle(a, b) {
  let d = b - a;
  while (d < 0) d += Math.PI * 2;
  while (d > Math.PI * 2) d -= Math.PI * 2;
  return a + d / 2;
}

function curbRadiusFor(clsA, clsB) {
  const r = Math.max(rank(clsA), rank(clsB));
  return r >= 2 ? CURB.radiusBus : CURB.radiusLocal;
}

function speedFor(cls) {
  if (cls === 'arterial') return SPEED.arterial;
  if (cls === 'collector' || cls === 'avenue') return SPEED.collector;
  if (cls === 'service') return SPEED.campusService;
  return SPEED.campusLoop;
}

function clampArm(len) {
  const stepped = Math.round(len / MAST.armStep) * MAST.armStep;
  return Math.min(MAST.armLengthMax, Math.max(MAST.armLengthMin, stepped));
}
