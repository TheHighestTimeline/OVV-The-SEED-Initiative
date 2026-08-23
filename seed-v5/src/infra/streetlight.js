/* ============================================================================
   infra/streetlight.js — solar roadway luminaire, built from spec
   ----------------------------------------------------------------------------
   Not a cylinder with a box on top. The assembly is, bottom to top:

     concrete pier, standing 4 in proud of grade
     bolted base plate under a flared anchor cover
     tapered aluminium shaft, hand hole at 18 in
     battery enclosure at 3 m, vented, on standoff brackets
     upswept arm with the luminaire on a 2 in tenon
     PV array above the luminaire on a wind-rated bracket, tilted 45 deg
       and facing due south

   The PV module count and the battery size come from solarKit(), which sizes
   them from the luminaire wattage — so a 120 W arterial head arrives with a
   two-module array and a 300 Ah pack, and a 25 W path bollard-height pole
   arrives with one module and a 50 Ah pack. Nothing here is decorative.
   ========================================================================== */

import * as THREE from 'three';
import { mesh, box, cyl } from '../geom.js';
import { MAT } from '../03-materials.js';
import { groundH } from '../01-terrain.js';
import {
  LIGHTING, POLE, LUMINAIRE, ARM, SOLAR, DARK_SKY,
  poleBaseDia, solarKit, IN, FT, DEG,
} from '../spec/index.js';

/* Segment counts. A pole is a silhouette against the sky more often than it
   is a surface, so it needs enough sides to not read as a prism, but it is
   also the single most repeated object in the world. Twelve is the point
   where the silhouette stops being visible as faceted at walking distance. */
const POLE_SEG = 12;
const ARM_SEG = 8;

/**
 * Build one solar street light IN LOCAL SPACE: base at the origin, arm along
 * +X, ground plane at y = 0.
 *
 * Local space is what makes the field instanceable. Every pole of a class is
 * the same twenty-odd meshes differing only by where they stand and which way
 * the arm points, so the prototype is built once and stamped with a per-pole
 * matrix. Building each pole in world space instead would put twenty thousand
 * meshes in the scene graph for the eight hundred poles this world carries.
 *
 * @param {string} cls        key into LIGHTING: arterial|collector|local|
 *                            pathway|plaza|parking
 * @param {object} opts.solar false to build a grid-tied pole with no PV
 * @returns {THREE.Group} with userData.lamp holding the light source in local
 *                        coordinates, for the caller to transform
 */
export function streetLightProto(cls, opts = {}) {
  const cfg = LIGHTING[cls];
  if (!cfg) throw new Error(`infra/streetlight: unknown class "${cls}"`);

  const g = new THREE.Group();
  g.name = `streetlight-${cls}`;
  const x = 0, z = 0, y0 = 0;
  const armAzimuth = 0;                     /* arm along +X, by construction */

  const H = cfg.mountHeight;
  const baseDia = poleBaseDia(H);
  const withSolar = opts.solar !== false;

  /* ------------------------------------------------------------ foundation */
  /* The drilled pier stands proud of grade so water does not pond against
     the base plate. It is a small detail and it is the difference between a
     pole that is planted and a pole that is stuck in. */
  g.add(mesh(
    cyl(POLE.foundationDia / 2, POLE.foundationDia / 2, POLE.foundationReveal, 16),
    MAT.concretePad, x, y0 + POLE.foundationReveal / 2, z));

  /* base plate, then the flared anchor-bolt cover over it */
  const plateY = y0 + POLE.foundationReveal;
  g.add(mesh(box(POLE.basePlate, IN(1.25), POLE.basePlate), MAT.galv,
    x, plateY + IN(0.625), z, { rotY: Math.PI / 4 }));
  g.add(mesh(
    cyl(POLE.baseCoverDia / 2 * 0.72, POLE.baseCoverDia / 2, POLE.baseCoverHeight, POLE_SEG),
    MAT.alu, x, plateY + POLE.baseCoverHeight / 2, z));

  /* ----------------------------------------------------------------- shaft */
  const shaftBase = plateY;
  const shaftLen = H - (shaftBase - y0);
  g.add(mesh(
    cyl(POLE.topDia / 2, baseDia / 2, shaftLen, POLE_SEG),
    MAT.alu, x, shaftBase + shaftLen / 2, z));

  /* hand hole — a small recessed plate, but it is at eye level in the POV
     and its absence is noticeable once you are standing next to the pole */
  const hhY = y0 + POLE.handHoleHeight;
  const hhR = poleRadiusAt(H, baseDia, POLE.handHoleHeight);
  g.add(mesh(box(POLE.handHoleW, POLE.handHoleH, IN(0.4)), MAT.steelDark,
    x + Math.cos(armAzimuth + Math.PI / 2) * hhR,
    hhY,
    z + Math.sin(armAzimuth + Math.PI / 2) * hhR,
    { rotY: -(armAzimuth + Math.PI / 2) }));

  /* --------------------------------------------------------------- the arm */
  const ax = Math.cos(armAzimuth), az = Math.sin(armAzimuth);
  let lumX = x, lumZ = z, lumY = y0 + H;

  if (cfg.armLength > 0) {
    const armY = y0 + H - ARM.riseOverRun * cfg.armLength;
    const rise = cfg.armLength * ARM.riseOverRun;
    const armLen = Math.hypot(cfg.armLength, rise);
    const arm = mesh(
      cyl(ARM.tipDia / 2, ARM.baseDia / 2, armLen, ARM_SEG),
      MAT.alu, 0, 0, 0);
    /* lay the arm from the shaft out to the tip, with its upsweep */
    arm.position.set(x + ax * cfg.armLength / 2, armY + rise / 2, z + az * cfg.armLength / 2);
    arm.rotation.order = 'YZX';
    arm.rotation.y = -armAzimuth;
    arm.rotation.z = Math.PI / 2 - Math.atan2(rise, cfg.armLength);
    g.add(arm);
    lumX = x + ax * cfg.armLength;
    lumZ = z + az * cfg.armLength;
    lumY = armY + rise;
  }

  /* ---------------------------------------------------------- the luminaire */
  const lum = new THREE.Group();
  lum.position.set(lumX, lumY, lumZ);
  lum.rotation.y = -armAzimuth;
  /* tenon: the short vertical pipe the slipfitter clamps to */
  lum.add(mesh(cyl(LUMINAIRE.tenonDia / 2, LUMINAIRE.tenonDia / 2,
    LUMINAIRE.tenonLength, 8), MAT.alu, 0, -LUMINAIRE.tenonLength / 2, 0));
  /* housing, uptilted the specified 2.5 degrees and no more — beyond that it
     starts throwing light above horizontal and breaks the U0 dark-sky rating */
  const housing = mesh(box(LUMINAIRE.length, LUMINAIRE.depth, LUMINAIRE.width),
    MAT.alu, 0, 0, 0);
  housing.rotation.z = DEG(LUMINAIRE.tiltDeg);
  lum.add(housing);
  /* the emitting face, inset into the housing underside */
  const lens = mesh(
    box(LUMINAIRE.length - LUMINAIRE.lensInset * 2, IN(0.5),
        LUMINAIRE.width - LUMINAIRE.lensInset * 2),
    MAT.emitWarm, 0, -LUMINAIRE.depth / 2 - IN(0.2), 0, { cast: false, receive: false });
  lens.rotation.z = DEG(LUMINAIRE.tiltDeg);
  lum.add(lens);
  g.add(lum);

  /* ------------------------------------------------------------- solar kit */
  let kit = null;
  if (withSolar) {
    kit = solarKit(cfg.watts);
    g.add(buildSolarArray(x, y0 + H + SOLAR.mountAbovePole, z, kit, H, baseDia));
    g.add(buildBatteryBox(x, y0, z, kit, H, baseDia, armAzimuth));
  }

  /* --------------------------------------------------- light source record
     Handed to the render pipeline, which pools real SpotLights and only
     activates the ones near the camera. Full cutoff means the cone stops at
     horizontal: penumbra shapes the edge, and nothing goes up. */
  g.userData.lamp = {
    pos: new THREE.Vector3(lumX, lumY - LUMINAIRE.depth / 2, lumZ),
    aim: new THREE.Vector3(lumX + ax * H * 0.35, y0, lumZ + az * H * 0.35),
    colour: cctToHex(DARK_SKY.cct),
    power: cfg.watts * 0.42,
    range: cfg.spacing * 0.85,
    angle: Math.atan2(cfg.spacing * 0.5, H),
    penumbra: 0.62,
    curfewDim: DARK_SKY.curfewDimming,
    curfewHour: DARK_SKY.curfewHour,
  };
  g.userData.spec = {
    cls, mountHeight: H, spacing: cfg.spacing, watts: cfg.watts,
    solar: kit && {
      modules: kit.count, moduleWatts: kit.module.watts,
      arrayWatts: kit.arrayWatts, batteryWh: kit.battery.wh,
      marginPercent: kit.marginPercent,
    },
  };
  return g;
}

/* --------------------------------------------------------------- one pole */
/**
 * A single street light placed in the world. Use for one-offs; use
 * `streetLightField` for a run of them.
 */
export function solarStreetLight(x, z, cls, armAzimuth, opts = {}) {
  const proto = streetLightProto(cls, opts);
  proto.position.set(x, groundH(x, z), z);
  proto.rotation.y = -armAzimuth;
  transformLampRecord(proto, x, groundH(x, z), z, armAzimuth);
  return proto;
}

/* ------------------------------------------------------------- the field */
/**
 * A whole run of street lights of one class as instanced geometry.
 *
 * Walks the prototype once, and for every mesh in it creates one
 * InstancedMesh carrying that piece for every pole. Twenty-five meshes per
 * pole across eight hundred poles collapses to twenty-five draw calls
 * instead of twenty thousand, with no loss of detail.
 *
 * @param placements [{x, z, azimuth}]
 * @returns {THREE.Group} with userData.lamps — the light records in world
 *                        space, ready for the render pipeline
 */
export function streetLightField(placements, cls, opts = {}) {
  const g = new THREE.Group();
  g.name = `streetlights-${cls}`;
  if (!placements.length) return g;

  const proto = streetLightProto(cls, opts);
  proto.updateMatrixWorld(true);

  /* per-pole world matrices */
  const poleMats = placements.map((p) => {
    const m = new THREE.Matrix4();
    m.compose(
      new THREE.Vector3(p.x, groundH(p.x, p.z), p.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -p.azimuth, 0)),
      new THREE.Vector3(1, 1, 1));
    return m;
  });

  /* collect the prototype's meshes with their local matrices */
  const parts = [];
  proto.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    parts.push({ geo: o.geometry, mat: o.material, local: o.matrixWorld.clone(),
                 cast: o.castShadow, receive: o.receiveShadow });
  });

  const tmp = new THREE.Matrix4();
  for (const part of parts) {
    const im = new THREE.InstancedMesh(part.geo, part.mat, placements.length);
    im.castShadow = part.cast; im.receiveShadow = part.receive;
    for (let i = 0; i < placements.length; i++) {
      tmp.multiplyMatrices(poleMats[i], part.local);
      im.setMatrixAt(i, tmp);
    }
    im.instanceMatrix.needsUpdate = true;
    im.frustumCulled = false;   /* the field spans the world; culling the
                                   whole batch on one bounds test hides it  */
    g.add(im);
  }

  /* light records, transformed out of local space into the world */
  const lamps = [];
  const lp = proto.userData.lamp;
  for (const p of placements) {
    const y0 = groundH(p.x, p.z);
    lamps.push(worldLamp(lp, p.x, y0, p.z, p.azimuth));
  }
  g.userData.lamps = lamps;
  g.userData.spec = { ...proto.userData.spec, count: placements.length,
                      drawCalls: parts.length };
  return g;
}

/* Rotate and translate a local-space lamp record into the world. */
function worldLamp(lp, x, y, z, azimuth) {
  const rot = (v) => {
    const c = Math.cos(-azimuth), s = Math.sin(-azimuth);
    return new THREE.Vector3(v.x * c + v.z * s, v.y, -v.x * s + v.z * c);
  };
  const p = rot(lp.pos), a = rot(lp.aim);
  return {
    ...lp,
    pos: new THREE.Vector3(p.x + x, p.y + y, p.z + z),
    aim: new THREE.Vector3(a.x + x, a.y + y, a.z + z),
  };
}

function transformLampRecord(g, x, y, z, azimuth) {
  g.userData.lamp = worldLamp(g.userData.lamp, x, y, z, azimuth);
}

/* --------------------------------------------------------------- PV array */
function buildSolarArray(x, yTop, z, kit, poleH, baseDia) {
  const a = new THREE.Group();
  a.name = 'pv-array';

  const tilt = DEG(SOLAR.tiltDeg);
  const m = kit.module;
  /* The array is tilted about the east-west axis and faces due south, which
     in this world's axes (+X east, +Z south) means the low edge is at +Z. */
  const arrayW = kit.arrayWidth;      /* across the slope, north-south       */
  const arrayL = kit.arrayLength;     /* along the ridge, east-west          */

  /* mounting bracket: a truss, not a strut. At 120 mph design wind a single
     post under a 1.8 m2 module is not a real detail. */
  const bh = SOLAR.bracketDepth;
  a.add(mesh(cyl(SOLAR.bracketTube / 2, SOLAR.bracketTube / 2, bh, 8),
    MAT.galv, x, yTop + bh / 2, z));
  for (const s of [-1, 1]) {
    const legLen = Math.hypot(arrayW / 2 * 0.8, bh);
    const leg = mesh(cyl(SOLAR.bracketTube / 2.4, SOLAR.bracketTube / 2.4, legLen, 6),
      MAT.galv, x, yTop + bh / 2, z + s * arrayW / 4 * 0.8);
    leg.rotation.x = -s * Math.atan2(arrayW / 2 * 0.8, bh);
    a.add(leg);
  }
  /* the rail the modules clamp to */
  a.add(mesh(box(arrayL * 0.92, SOLAR.bracketTube * 0.7, SOLAR.bracketTube * 0.7),
    MAT.galv, x, yTop + bh, z));

  /* the modules themselves */
  for (let i = 0; i < kit.count; i++) {
    const off = kit.count === 1 ? 0
      : (i - (kit.count - 1) / 2) * (m.width + 0.02);
    const p = new THREE.Group();
    /* frame */
    p.add(mesh(box(m.length, m.thick, m.width), MAT.alu, 0, 0, 0));
    /* laminate face, inset inside the frame so the frame reads as a frame */
    p.add(mesh(
      box(m.length - SOLAR.panelFrameWidth * 2, m.thick * 0.5,
          m.width - SOLAR.panelFrameWidth * 2),
      MAT.pv, 0, m.thick * 0.35, 0, { receive: false }));
    p.position.set(x, yTop + bh + Math.cos(tilt) * 0.02, z + off * Math.cos(tilt));
    p.rotation.x = -tilt;          /* low edge toward +Z, i.e. facing south  */
    a.add(p);
  }

  a.userData.pv = {
    watts: kit.arrayWatts, modules: kit.count,
    tiltDeg: SOLAR.tiltDeg, azimuthDeg: SOLAR.azimuthDeg,
    areaM2: +(m.length * m.width * kit.count).toFixed(2),
  };
  return a;
}

/* ------------------------------------------------------------ battery box */
function buildBatteryBox(x, y0, z, kit, poleH, baseDia, armAzimuth) {
  const b = new THREE.Group();
  b.name = 'battery-enclosure';
  const bt = kit.battery;
  const yc = y0 + SOLAR.boxMountHeight;
  /* hung on the side of the pole away from the carriageway, so a vehicle
     strike hits the pole and not the enclosure */
  const back = armAzimuth + Math.PI;
  const r = poleRadiusAt(poleH, baseDia, SOLAR.boxMountHeight);
  const bx = x + Math.cos(back) * (r + bt.d / 2 + 0.03);
  const bz = z + Math.sin(back) * (r + bt.d / 2 + 0.03);

  b.add(mesh(box(bt.w, bt.h, bt.d), MAT.alu, bx, yc, bz, { rotY: -back }));
  /* standoff brackets, so the box is not simply floating against the shaft */
  for (const s of [-1, 1]) {
    b.add(mesh(box(0.06, 0.04, 0.05), MAT.galv,
      bx - Math.cos(back) * (bt.d / 2 + 0.015) + Math.cos(back + Math.PI / 2) * s * bt.w * 0.35,
      yc + s * bt.h * 0.3,
      bz - Math.sin(back) * (bt.d / 2 + 0.015) + Math.sin(back + Math.PI / 2) * s * bt.w * 0.35,
      { rotY: -back }));
  }
  /* vent louvres on the low face — a sealed lithium enclosure in a South
     Carolina summer is a thermal problem, and real ones are vented */
  for (let i = 0; i < 3; i++) {
    b.add(mesh(box(bt.w * 0.5, 0.012, 0.008), MAT.steelDark,
      bx + Math.cos(back) * (bt.d / 2 + 0.004),
      yc - bt.h * 0.28 + i * 0.03,
      bz + Math.sin(back) * (bt.d / 2 + 0.004),
      { rotY: -back, cast: false }));
  }
  b.userData.battery = { wh: bt.wh, ah: bt.ah, chem: SOLAR.batteryChem };
  return b;
}

/* ------------------------------------------------------------------ utils */
/** Radius of a tapered shaft at a height above its base. */
function poleRadiusAt(poleH, baseDia, h) {
  const t = Math.min(1, Math.max(0, h / poleH));
  return (baseDia + (POLE.topDia - baseDia) * t) / 2;
}

/**
 * Correlated colour temperature to an sRGB hex, Planckian locus.
 * 2700 K is a genuinely warm light and rendering it as white throws away the
 * whole point of specifying it.
 */
export function cctToHex(K) {
  const t = K / 100;
  let r, gg, b;
  if (t <= 66) {
    r = 255;
    gg = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    gg = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return (c(r) << 16) | (c(gg) << 8) | c(b);
}
