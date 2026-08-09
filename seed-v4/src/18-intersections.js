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
import {
  signalMast, SignalController, postedSign, streetNameBlade,
  cornerRamps, hydrant,
} from './infra/index.js';
import {
  MAST, SPEED, LANE, CURB, curbFaceOffset, crossSection, FT, IN,
} from './spec/index.js';

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
          /* the corner sits between the two legs, at the curb return */
          const mid = midAngle(a.az, b.az);
          const radius = curbRadiusFor(a.cls, b.cls);
          const halfA = curbFaceOffset(a.cls), halfB = curbFaceOffset(b.cls);
          const diag = Math.hypot(halfA, halfB) + radius * 0.35;
          const cx = node.x + Math.cos(mid) * diag;
          const cz = node.z + Math.sin(mid) * diag;
          /* pedestrians cross each street heading INTO the roadway, i.e.
             perpendicular to the curb line they stand on */
          grp.add(cornerRamps(cx, cz, a.az + Math.PI, b.az + Math.PI, {
            radius: radius * 0.5,
          }));
          out.ramps += 2;
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

          for (const leg of legs) {
            /* the arm reaches across the road the driver is approaching on,
               so it hangs over the far lanes; the faces look back at the
               driver, i.e. along the approach toward the node */
            const armAz = leg.az + Math.PI / 2;
            const faceAz = leg.az;
            const armLen = clampArm(crossSection(leg.cls).halfWidth * 2 * 0.9);
            const setback = curbFaceOffset(leg.cls) + FT(3);
            const px = node.x + Math.cos(leg.az) * setback * 1.4
                              + Math.cos(leg.az - Math.PI / 2) * setback;
            const pz = node.z + Math.sin(leg.az) * setback * 1.4
                              + Math.sin(leg.az - Math.PI / 2) * setback;
            const mast = signalMast(px, pz, armLen, armAz, faceAz, {
              pedFacing: leg.az + Math.PI,
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
            /* A stop sign stands on the right-hand side of the approach, at
               the stop line. The face looks back along the approach at the
               driver — which is leg.az, since leg.az points away from the
               node and the driver is coming from that direction. */
            const off = curbFaceOffset(leg.cls) + FT(2) + IN(15);
            const back = curbFaceOffset(leg.cls) + FT(4);
            const sx = node.x + Math.cos(leg.az) * back
                              + Math.cos(leg.az - Math.PI / 2) * off;
            const sz = node.z + Math.sin(leg.az) * back
                              + Math.sin(leg.az - Math.PI / 2) * off;
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
