/* ============================================================================
   infra/curbramp.js — PROWAG curb ramp with a real detectable warning surface
   ----------------------------------------------------------------------------
   The domes are the point. PROWAG R305 specifies a truncated cone 0.9 to 1.4
   in at the base, 50 to 65 percent of that at the top, 0.2 in tall, at 1.6 to
   2.4 in on centre. At that pitch a 5 ft wide pad carries roughly 25 domes
   across and 10 deep — 250 of them per pad, and there are two pads at every
   corner. They are instanced for that reason.

   The ramp itself is a warped quad: it climbs the curb reveal at the built
   slope, is bounded by flares at 10 percent, and lands on a level turning
   space at the top. The turning space is the piece most often left out, and
   without it the ramp is a slope that ends in a step.
   ========================================================================== */

import * as THREE from 'three';
import { mesh, box, instanced } from '../geom.js';
import { MAT } from '../03-materials.js';
import { groundH } from '../01-terrain.js';
import { ELEV } from '../00-config.js';
import {
  CURB, CURB_RAMP, DETECTABLE_WARNING as DW, rampGeometry, IN, FT,
} from '../spec/index.js';

/* One truncated cone. Built once and instanced across every pad in the
   world, because there are tens of thousands of them. */
let domeGeo = null;
function getDomeGeo() {
  if (domeGeo) return domeGeo;
  const rb = DW.domeBaseDia / 2;
  const rt = rb * DW.domeTopRatio;
  domeGeo = new THREE.CylinderGeometry(rt, rb, DW.domeHeight, 10, 1, false);
  domeGeo.translate(0, DW.domeHeight / 2, 0);
  return domeGeo;
}

/**
 * A detectable warning pad: the yellow field plus its dome grid.
 *
 * @param cx, cz   centre of the pad
 * @param width    across the direction of travel
 * @param depth    along the direction of travel (24 in minimum)
 * @param heading  radians; the direction of travel across the pad
 */
export function detectableWarning(cx, cz, width, depth, heading) {
  const g = new THREE.Group();
  g.name = 'detectable-warning';
  depth = Math.max(depth, DW.depth);

  const y = groundH(cx, cz) + ELEV.walkJoint;
  /* the pad field itself, sitting just proud of the walk */
  g.add(mesh(box(width, IN(0.5), depth), MAT.dws, cx, y, cz, { rotY: -heading }));

  /* Dome grid, in-line and aligned with travel. The count comes from the
     spacing, not the other way round, so the pitch is always correct and the
     margin absorbs the remainder. */
  const cols = Math.max(1, Math.floor(width / DW.spacing));
  const rows = Math.max(1, Math.floor(depth / DW.spacing));
  const usedW = (cols - 1) * DW.spacing;
  const usedD = (rows - 1) * DW.spacing;

  const ch = Math.cos(-heading), sh = Math.sin(-heading);
  const xf = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lx = -usedW / 2 + c * DW.spacing;
      const lz = -usedD / 2 + r * DW.spacing;
      const wx = cx + lx * ch - lz * sh;
      const wz = cz + lx * sh + lz * ch;
      xf.push({ x: wx, y: y + IN(0.25), z: wz, s: 1 });
    }
  }
  const domes = instanced(getDomeGeo(), MAT.dws, xf, { cast: false, receive: true });
  domes.name = 'domes';
  g.add(domes);

  g.userData.spec = {
    width, depth, domes: xf.length, cols, rows,
    spacing: DW.spacing, domeBase: DW.domeBaseDia, domeHeight: DW.domeHeight,
  };
  return g;
}

/**
 * A perpendicular curb ramp.
 *
 * @param x, z     the point on the curb line the ramp lands at (gutter side)
 * @param heading  radians; direction of travel, pointing INTO the roadway
 * @param opts.width  clear ramp width, default the spec 5 ft
 * @param opts.reveal curb reveal to climb, default the spec 6 in
 */
export function curbRamp(x, z, heading, opts = {}) {
  const width = opts.width || CURB_RAMP.widthUsed;
  const reveal = opts.reveal != null ? opts.reveal : CURB.revealVertical;
  const geo = rampGeometry(reveal, width);

  const g = new THREE.Group();
  g.name = 'curb-ramp';
  const y0 = groundH(x, z);

  /* Back away from the roadway to build the ramp: the run climbs from the
     gutter line up to the level of the walk behind it. */
  const bx = -Math.cos(heading), bz = -Math.sin(heading);

  /* The ramp surface as a warped slab. Built as a thin box tilted about the
     axis perpendicular to travel, which is exactly what the running slope
     is, and then set so its low edge meets the gutter flush — the grade
     break at the bottom must have no lip at all (PROWAG R304.5.5). */
  const slopeAngle = Math.atan2(geo.rise, geo.run);
  const midX = x + bx * geo.run / 2;
  const midZ = z + bz * geo.run / 2;
  const ramp = mesh(box(width, IN(5), geo.run / Math.cos(slopeAngle)),
    MAT.concreteWalk, midX, y0 + geo.rise / 2 + ELEV.concreteWalk, midZ);
  ramp.rotation.order = 'YXZ';
  ramp.rotation.y = -heading;
  ramp.rotation.x = -slopeAngle;
  g.add(ramp);

  /* Flared sides at 10 percent. A flare is not a route and is not counted in
     the ramp width — it exists so someone walking along the sidewalk across
     the top of the ramp does not step off an edge. */
  for (const s of [-1, 1]) {
    const fw = geo.flareRun;
    const fx = midX + Math.cos(heading + Math.PI / 2) * s * (width / 2 + fw / 2);
    const fz = midZ + Math.sin(heading + Math.PI / 2) * s * (width / 2 + fw / 2);
    const flare = mesh(box(fw, IN(5), geo.run / Math.cos(slopeAngle)),
      MAT.concreteWalk, fx, y0 + geo.rise / 2 + ELEV.concreteWalk, fz);
    flare.rotation.order = 'YXZ';
    flare.rotation.y = -heading;
    flare.rotation.x = -slopeAngle;
    flare.rotation.z = s * Math.atan(CURB_RAMP.flareSlopeMax);
    g.add(flare);
  }

  /* The level turning space at the top. 4 x 4 ft at 2 percent maximum. */
  const lx = x + bx * (geo.run + CURB_RAMP.landingDepth / 2);
  const lz = z + bz * (geo.run + CURB_RAMP.landingDepth / 2);
  g.add(mesh(box(CURB_RAMP.landingWidth, IN(5), CURB_RAMP.landingDepth),
    MAT.concreteWalk, lx, y0 + geo.rise + ELEV.concreteWalk, lz, { rotY: -heading }));

  /* Detectable warning at the back of curb, the full width of the ramp. */
  const dwx = x + bx * (DW.depth / 2);
  const dwz = z + bz * (DW.depth / 2);
  g.add(detectableWarning(dwx, dwz, width, DW.depth, heading));

  g.userData.spec = {
    ...geo,
    slopePercent: geo.slopePercent,
    heading,
  };
  return g;
}

/**
 * Both ramps at an intersection corner — one per crossing direction, which
 * is what PROWAG expects. A single diagonal ramp serving both crossings puts
 * the user into the middle of the intersection and is not built here.
 *
 * @param cx, cz    the corner point (curb return centre)
 * @param headingA  direction of travel for the first crossing
 * @param headingB  direction of travel for the second, normally A + 90 deg
 */
export function cornerRamps(cx, cz, headingA, headingB, opts = {}) {
  const g = new THREE.Group();
  g.name = 'corner-ramps';
  const width = opts.width || CURB_RAMP.widthUsed;
  /* Each ramp slides along its own curb line, away from the corner return,
     by enough to clear the radius and half its own width. The ramp crossing
     street A moves away from street B, and vice versa — so the offset for
     one is the reverse of the other's heading. */
  const back = opts.offset != null
    ? opts.offset
    : (opts.radius != null ? opts.radius : CURB.radiusLocal) + width / 2;

  const place = (h, awayFrom) => {
    const ox = cx - Math.cos(awayFrom) * back;
    const oz = cz - Math.sin(awayFrom) * back;
    return curbRamp(ox, oz, h, { ...opts, width });
  };
  g.add(place(headingA, headingB));
  g.add(place(headingB, headingA));

  g.userData.spec = { corner: [cx, cz], back, width, ramps: 2 };
  return g;
}
