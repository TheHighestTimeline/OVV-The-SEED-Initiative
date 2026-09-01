/* ============================================================================
   infra/furniture.js — bins, benches, racks, bollards, hydrants
   ----------------------------------------------------------------------------
   Replaces the placeholder pieces in 15-props.js. Each of these is a thing a
   person operates, so each is built around the dimension that decides whether
   it works: the bin around its opening height, the bench around its seat
   height, the rack around the two points it supports a frame at, the hydrant
   around its nozzle height.
   ========================================================================== */

import * as THREE from 'three';
import { mesh, box, cyl } from '../geom.js';
import { MAT } from '../03-materials.js';
import { groundH } from '../01-terrain.js';
import { BIN, BENCH, BIKE_RACK, BOLLARD, HYDRANT, IN, FT, DEG } from '../spec/index.js';
import { placeModel, hasModel } from '../models.js';

/* ------------------------------------------------------------ waste bins */
/**
 * A litter and recycling pair, which is how public bins are actually
 * deployed — a lone litter bin means the recycling ends up in it.
 */
export function binPair(x, z, facing) {
  /* The downloaded set is a triple, which stands in for the pair: the point
     of the pair is separated waste streams, and three streams is more of
     that, not less. */
  const m = placeModel('bin', x, groundH(x, z), z, -facing);
  if (m) { m.name = 'bin-pair'; return m; }

  const g = new THREE.Group();
  g.name = 'bin-pair';
  const y0 = groundH(x, z);
  const perp = facing + Math.PI / 2;
  const gap = (BIN.litter.bodyDia + BIN.recycling.bodyDia) / 2 + BIN.pairGap;

  const one = (spec, ox, colour, round) => {
    const b = new THREE.Group();
    const bx = x + Math.cos(perp) * ox, bz = z + Math.sin(perp) * ox;
    const mat = colour === 'blue' ? MAT.markBlue : MAT.steelDark;
    /* body, slightly tapered as a real spun or rolled bin is */
    b.add(mesh(cyl(spec.bodyDia / 2, spec.baseDia ? spec.baseDia / 2 : spec.bodyDia / 2 * 0.94,
      spec.bodyHeight, 16), mat, bx, y0 + spec.bodyHeight / 2, bz));
    /* lid, overhanging so rain runs off outside the body */
    b.add(mesh(cyl(spec.bodyDia / 2 * 1.06, spec.bodyDia / 2 * 1.02, spec.lidHeight, 16),
      MAT.alu, bx, y0 + spec.bodyHeight + spec.lidHeight / 2, bz));

    /* The opening. This is the dimension that matters: its centre lands
       inside the 15 to 48 in seated reach range, which is checked by the
       spec audit. A top-hole bin fails that check, which is why these are
       side-opening. */
    if (round) {
      const o = mesh(cyl(spec.openingDia / 2, spec.openingDia / 2, IN(1.2), 12),
        MAT.rubber, bx + Math.cos(facing) * (spec.bodyDia / 2 - IN(0.4)),
        y0 + spec.openingCentre,
        bz + Math.sin(facing) * (spec.bodyDia / 2 - IN(0.4)), { cast: false });
      o.rotation.z = Math.PI / 2; o.rotation.y = -facing;
      b.add(o);
    } else {
      b.add(mesh(box(spec.openingWidth, spec.openingHeight, IN(1.2)), MAT.rubber,
        bx + Math.cos(facing) * (spec.bodyDia / 2 - IN(0.4)),
        y0 + spec.openingCentre,
        bz + Math.sin(facing) * (spec.bodyDia / 2 - IN(0.4)),
        { rotY: -facing, cast: false }));
    }
    /* a hoop band round the body, where a real bin has its liner retainer */
    b.add(mesh(cyl(spec.bodyDia / 2 * 1.02, spec.bodyDia / 2 * 1.02, IN(1.5), 16),
      MAT.alu, bx, y0 + spec.bodyHeight * 0.22, bz, { cast: false }));
    return b;
  };

  g.add(one(BIN.litter, -gap / 2, 'dark', false));
  g.add(one(BIN.recycling, gap / 2, 'blue', true));
  g.userData.spec = {
    openingHeight: BIN.litter.openingCentre,
    capacityL: Math.round(BIN.litter.capacity * 1000),
    footprintWidth: gap + BIN.litter.bodyDia,
  };
  return g;
}

/* ---------------------------------------------------------------- bench */
export function bench(x, z, facing, opts = {}) {
  /* A downloaded bench, where one exists, at the seat height the spec sets.
     Swapping here rather than at the call sites means every bench in the
     world — plaza, promenade, transit stop — changes together, and the
     procedural build below stays as the fallback rather than dead code. */
  const m = placeModel('bench', x, groundH(x, z), z, -facing);
  if (m) { m.name = 'bench'; return m; }

  const g = new THREE.Group();
  g.name = 'bench';
  const y0 = groundH(x, z);
  const L = opts.short ? BENCH.lengthShort : BENCH.length;
  const seatY = y0 + BENCH.seatHeight;

  /* Slatted seat. The gaps are what make a bench read as a bench rather than
     a plank, and they are the reason rain does not sit on it. */
  const nSlats = Math.max(3, Math.floor(BENCH.seatDepth / (BENCH.slatWidth + BENCH.slatGap)));
  const perp = facing + Math.PI / 2;
  for (let i = 0; i < nSlats; i++) {
    const d = -BENCH.seatDepth / 2 + (i + 0.5) * (BENCH.seatDepth / nSlats);
    g.add(mesh(box(L, BENCH.slatThickness, BENCH.slatWidth), MAT.deck,
      x + Math.cos(facing) * d, seatY, z + Math.sin(facing) * d, { rotY: -facing }));
  }

  /* Back, reclined the specified 10 degrees. Vertical backs are why airport
     benches are unpleasant, and the angle is visible. */
  if (opts.noBack !== true) {
    const backH = BENCH.backHeight - BENCH.seatHeight;
    const nBack = 3;
    for (let i = 0; i < nBack; i++) {
      const up = (i + 0.5) * (backH / nBack);
      const lean = Math.tan(DEG(BENCH.backAngleDeg)) * up;
      g.add(mesh(box(L, BENCH.slatWidth, BENCH.slatThickness), MAT.deck,
        x - Math.cos(facing) * (BENCH.seatDepth / 2 - BENCH.slatWidth / 2 + lean),
        seatY + up,
        z - Math.sin(facing) * (BENCH.seatDepth / 2 - BENCH.slatWidth / 2 + lean),
        { rotY: -facing }));
    }
  }

  /* End frames, and the armrest on one end only — ADA 903 wants at least one
     end clear so a transfer from a wheelchair is possible. */
  for (const s of [-1, 1]) {
    const ex = x + Math.cos(perp) * s * (L / 2 - BENCH.frameThickness);
    const ez = z + Math.sin(perp) * s * (L / 2 - BENCH.frameThickness);
    g.add(mesh(box(BENCH.frameThickness, BENCH.seatHeight, BENCH.seatDepth),
      MAT.steelDark, ex, y0 + BENCH.seatHeight / 2, ez, { rotY: -facing }));
    if (s === -1) {
      g.add(mesh(box(BENCH.frameThickness, BENCH.slatThickness, BENCH.seatDepth * 0.8),
        MAT.steelDark, ex, y0 + BENCH.armHeight, ez, { rotY: -facing }));
    }
  }

  g.userData.spec = { seatHeight: BENCH.seatHeight, length: L };
  return g;
}

/* ------------------------------------------------------------ bike rack */
/** A row of inverted-U racks at the APBP spacing. */
export function bikeRackRow(x, z, facing, count = 3) {
  if (hasModel('bikeRack')) {
    const row = new THREE.Group();
    row.name = 'bike-rack-row';
    const perp = facing + Math.PI / 2;
    for (let i = 0; i < count; i++) {
      const o = (i - (count - 1) / 2) * (BIKE_RACK.width + BIKE_RACK.rackSpacing);
      const rx = x + Math.cos(perp) * o, rz = z + Math.sin(perp) * o;
      const r = placeModel('bikeRack', rx, groundH(rx, rz), rz, -facing);
      if (r) row.add(r);
    }
    if (row.children.length) return row;
  }
  const g = new THREE.Group();
  g.name = 'bike-rack';
  const y0 = groundH(x, z);
  const r = BIKE_RACK.pipeOD / 2;
  const perp = facing + Math.PI / 2;

  /* The U is built as a torus for the bend plus two legs, rather than a
     rectangle — the radius at the top is what a real bent-pipe rack has. */
  const halfW = BIKE_RACK.width / 2;
  const legH = BIKE_RACK.height - halfW;

  for (let i = 0; i < count; i++) {
    const o = (i - (count - 1) / 2) * BIKE_RACK.rackSpacing;
    const bx = x + Math.cos(perp) * o, bz = z + Math.sin(perp) * o;
    for (const s of [-1, 1]) {
      g.add(mesh(cyl(r, r, legH, 8), MAT.galv,
        bx + Math.cos(facing) * s * halfW, y0 + legH / 2,
        bz + Math.sin(facing) * s * halfW));
    }
    const bend = new THREE.Mesh(
      new THREE.TorusGeometry(halfW, r, 8, 16, Math.PI), MAT.galv);
    bend.position.set(bx, y0 + legH, bz);
    bend.rotation.y = -facing + Math.PI / 2;
    bend.castShadow = true; bend.receiveShadow = true;
    g.add(bend);
  }

  g.userData.spec = {
    racks: count, capacity: count * 2,     /* two bikes per U               */
    height: BIKE_RACK.height, spacing: BIKE_RACK.rackSpacing,
  };
  return g;
}

/* -------------------------------------------------------------- bollards */
/**
 * A run of bollards along a line, at the spacing that leaves an accessible
 * 36 in opening between them.
 */
export function bollardRun(ax, az, bx, bz, opts = {}) {
  const g = new THREE.Group();
  g.name = 'bollards';
  const spec = opts.security ? BOLLARD.security : BOLLARD;
  const len = Math.hypot(bx - ax, bz - az);
  const n = Math.max(2, Math.round(len / spec.spacingOnCentre) + 1);
  const ux = (bx - ax) / len, uz = (bz - az) / len;

  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * len;
    const px = ax + ux * t, pz = az + uz * t;
    const y0 = groundH(px, pz);
    g.add(mesh(cyl(spec.dia / 2, spec.dia / 2, spec.height, 12), MAT.steelDark,
      px, y0 + spec.height / 2, pz));
    /* domed cap — a flat-topped bollard collects water and looks unfinished */
    g.add(mesh(new THREE.SphereGeometry(spec.dia / 2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      MAT.steelDark, px, y0 + spec.height, pz));
    /* base collar */
    g.add(mesh(cyl(spec.dia / 2 * 1.25, spec.dia / 2 * 1.35, IN(4), 12), MAT.steelDark,
      px, y0 + IN(2), pz));
    /* the reflective band, so the bollard exists after dark */
    g.add(mesh(cyl(spec.dia / 2 * 1.02, spec.dia / 2 * 1.02, BOLLARD.bandHeight, 12),
      MAT.markWhite, px, y0 + BOLLARD.bandCentre, pz, { cast: false }));
  }

  g.userData.spec = {
    count: n, spacing: spec.spacingOnCentre,
    clearBetween: spec.spacingOnCentre - spec.dia,
    security: !!opts.security,
  };
  return g;
}

/* -------------------------------------------------------------- hydrant */
/**
 * AWWA dry-barrel hydrant. The pumper nozzle faces the street, which is a
 * real placement rule — a hydrant turned the wrong way costs a crew time.
 */
export function hydrant(x, z, facingStreet, flow = 'med') {
  const m = placeModel('hydrant', x, groundH(x, z), z, -facingStreet);
  if (m) { m.name = 'hydrant'; return m; }

  const g = new THREE.Group();
  g.name = 'hydrant';
  const y0 = groundH(x, z);
  const r = HYDRANT.barrelDia / 2;

  /* breakaway flange at grade — the barrel shears here rather than tearing
     out the main. Its absence is one of the clearest tells in a modelled
     street, because every real hydrant has this collar. */
  g.add(mesh(cyl(HYDRANT.breakawayFlangeDia / 2, HYDRANT.breakawayFlangeDia / 2,
    HYDRANT.breakawayFlangeHeight, 12), MAT.markRed,
    x, y0 + HYDRANT.breakawayFlangeHeight / 2, z));

  /* barrel */
  g.add(mesh(cyl(r, r * 1.08, HYDRANT.bonnetHeight - HYDRANT.breakawayFlangeHeight, 12),
    MAT.markRed, x,
    y0 + HYDRANT.breakawayFlangeHeight +
      (HYDRANT.bonnetHeight - HYDRANT.breakawayFlangeHeight) / 2, z));

  /* bonnet, colour-coded to flow per NFPA 291 */
  const bonnetCol = flow === 'high' ? MAT.planting
    : flow === 'low' ? MAT.markRed : MAT.markYellow;
  g.add(mesh(cyl(HYDRANT.bonnetDia / 2 * 0.7, HYDRANT.bonnetDia / 2, IN(5), 12),
    bonnetCol, x, y0 + HYDRANT.bonnetHeight + IN(2.5), z));
  /* operating nut on top */
  g.add(mesh(cyl(IN(1.6), IN(1.9), IN(2.5), 5), bonnetCol,
    x, y0 + HYDRANT.bonnetHeight + IN(6), z));

  /* pumper nozzle facing the street, hose nozzles at 90 degrees either side */
  const nozzle = (ang, dia) => {
    const nx = x + Math.cos(ang) * (r + HYDRANT.nozzleProjection / 2);
    const nz = z + Math.sin(ang) * (r + HYDRANT.nozzleProjection / 2);
    const m = mesh(cyl(dia / 2, dia / 2 * 1.15, HYDRANT.nozzleProjection, 10),
      MAT.markRed, nx, y0 + HYDRANT.nozzleHeight, nz);
    m.rotation.z = Math.PI / 2;
    m.rotation.y = -ang;
    g.add(m);
  };
  nozzle(facingStreet, HYDRANT.pumperNozzleDia);
  nozzle(facingStreet + Math.PI / 2, HYDRANT.hoseNozzleDia);
  nozzle(facingStreet - Math.PI / 2, HYDRANT.hoseNozzleDia);

  g.userData.spec = {
    nozzleHeight: HYDRANT.nozzleHeight,
    clearRadius: HYDRANT.clearRadius,
    flow,
  };
  return g;
}
