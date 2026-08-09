/* ============================================================================
   infra/signal.js — signalised intersection: masts, heads, ped signals, APS
   ----------------------------------------------------------------------------
   The assembly per approach is a mast-arm pole carrying two through faces
   (MUTCD 4D.14 wants at least two), a post-mounted near-side face, a
   pedestrian head per crossing, and an accessible push button within reach
   of the landing.

   The controller runs the phase plan from spec/signals.js, which derives the
   yellow change from the ITE kinematic equation and the pedestrian clearance
   from the crossing width at 3.5 ft/s. Nothing is on a made-up timer — if
   the intersection gets wider, the walk phase gets longer on its own.
   ========================================================================== */

import * as THREE from 'three';
import { mesh, box, cyl } from '../geom.js';
import { MAT } from '../03-materials.js';
import { groundH } from '../01-terrain.js';
import {
  SIGNAL, MAST, PED_SIGNAL, PUSH_BUTTON, phasePlan,
  IN, FT, DEG,
} from '../spec/index.js';
import { postedSign } from './sign.js';

/* --------------------------------------------------------------- one head */
/**
 * A three-section 12 in signal head with a backplate and tunnel visors.
 * Returns a group whose userData.lenses are the three lens meshes, top to
 * bottom, so the controller can drive them.
 */
export function signalHead(sections = 3) {
  const g = new THREE.Group();
  g.name = 'signal-head';

  const sw = SIGNAL.sectionWidth, sh = SIGNAL.sectionHeight, sd = SIGNAL.sectionDepth;
  const total = sh * sections + SIGNAL.capHeight * 2;

  /* backplate first, so it sits behind everything */
  g.add(mesh(
    box(sw + SIGNAL.backplateBorder * 2, total + SIGNAL.backplateBorder * 2,
        SIGNAL.backplateThick),
    MAT.steelDark, 0, 0, -sd / 2 - SIGNAL.backplateThick, { receive: false }));
  /* the retroreflective yellow border strip MUTCD 4D.12 recommends — a real
     one is a 1 in tape around the backplate edge and it is very visible */
  const bpW = sw + SIGNAL.backplateBorder * 2;
  const bpH = total + SIGNAL.backplateBorder * 2;
  for (const [w, h, ox, oy] of [
    [bpW, SIGNAL.backplateStripe, 0, bpH / 2 - SIGNAL.backplateStripe / 2],
    [bpW, SIGNAL.backplateStripe, 0, -bpH / 2 + SIGNAL.backplateStripe / 2],
    [SIGNAL.backplateStripe, bpH, bpW / 2 - SIGNAL.backplateStripe / 2, 0],
    [SIGNAL.backplateStripe, bpH, -bpW / 2 + SIGNAL.backplateStripe / 2, 0],
  ]) {
    g.add(mesh(box(w, h, IN(0.06)), MAT.signYellow,
      ox, oy, -sd / 2 - SIGNAL.backplateThick - IN(0.04), { cast: false }));
  }

  /* caps */
  g.add(mesh(box(sw, SIGNAL.capHeight, sd), MAT.steelDark, 0, total / 2 - SIGNAL.capHeight / 2, 0));
  g.add(mesh(box(sw, SIGNAL.capHeight, sd), MAT.steelDark, 0, -total / 2 + SIGNAL.capHeight / 2, 0));

  /* Cloned per head, never shared. The library instances are one material
     for the whole world, so driving them would light every red lens at every
     intersection in unison — which is exactly the defect v4 fixed in the
     building windows and would be just as wrong here. */
  const lensMats = [MAT.lensRed.clone(), MAT.lensYellow.clone(), MAT.lensGreen.clone()];
  const lenses = [];
  for (let i = 0; i < sections; i++) {
    const cy = total / 2 - SIGNAL.capHeight - sh / 2 - i * sh;
    /* housing */
    g.add(mesh(box(sw, sh, sd), MAT.steelDark, 0, cy, 0));
    /* lens, proud of the housing face */
    const lens = mesh(
      cyl(SIGNAL.lensDia / 2, SIGNAL.lensDia / 2, IN(0.9), 20),
      lensMats[i % 3], 0, cy, sd / 2 + IN(0.3),
      { cast: false, receive: false });
    lens.rotation.x = Math.PI / 2;
    g.add(lens);
    lenses.push(lens);

    /* tunnel visor: an open-bottomed hood, built as a partial cylinder so it
       actually shades the lens rather than being a flat brim */
    const visor = new THREE.Mesh(
      new THREE.CylinderGeometry(
        SIGNAL.lensDia / 2 + IN(0.6), SIGNAL.lensDia / 2 + IN(0.6),
        SIGNAL.visorProjection, 16, 1, true,
        Math.PI * 0.08, Math.PI * 1.34),
      MAT.steelDark);
    visor.rotation.x = Math.PI / 2;
    visor.rotation.y = Math.PI;
    visor.position.set(0, cy, sd / 2 + SIGNAL.visorProjection / 2);
    visor.castShadow = true; visor.receiveShadow = true;
    visor.material.side = THREE.DoubleSide;
    g.add(visor);
  }

  g.userData.lenses = lenses;
  g.userData.height = total;
  return g;
}

/* ------------------------------------------------------- pedestrian signal */
export function pedSignalHead() {
  const g = new THREE.Group();
  g.name = 'ped-signal';
  const w = PED_SIGNAL.housingWidth, h = PED_SIGNAL.housingHeight, d = PED_SIGNAL.housingDepth;
  g.add(mesh(box(w, h, d), MAT.steelDark, 0, 0, 0));
  /* the face is one module carrying both symbols and the countdown, which is
     how a modern head is built — not two separate windows */
  /* cloned per head, for the same reason the vehicle lenses are */
  const hand = mesh(box(w * 0.42, PED_SIGNAL.symbolHeight, IN(0.4)),
    MAT.lensPedHand.clone(), -w * 0.22, h * 0.12, d / 2 + IN(0.2), { cast: false, receive: false });
  const walk = mesh(box(w * 0.42, PED_SIGNAL.symbolHeight, IN(0.4)),
    MAT.lensPedWalk.clone(), w * 0.22, h * 0.12, d / 2 + IN(0.2), { cast: false, receive: false });
  const count = mesh(box(w * 0.5, PED_SIGNAL.countdownDigitHeight, IN(0.4)),
    MAT.lensPedHand.clone(), 0, -h * 0.3, d / 2 + IN(0.2), { cast: false, receive: false });
  g.add(hand, walk, count);
  g.userData.hand = hand; g.userData.walk = walk; g.userData.count = count;
  return g;
}

/* ----------------------------------------------------------- push button */
/**
 * Accessible pedestrian signal push button. The operable part lands at 42 in,
 * which is the PROWAG R209.4 maximum and the MUTCD 4E.09 value — the number
 * that decides whether the crossing is usable from a wheelchair.
 */
export function pushButton(x, z, facing, opts = {}) {
  const g = new THREE.Group();
  g.name = 'aps-button';
  const y0 = groundH(x, z);
  const fx = Math.cos(facing), fz = Math.sin(facing);

  /* a dedicated pedestal where there is no signal pole to hang it on */
  if (opts.pedestal !== false) {
    g.add(mesh(cyl(PUSH_BUTTON.poleDia / 2, PUSH_BUTTON.poleDia / 2, FT(4), 10),
      MAT.alu, x, y0 + FT(2), z));
  }

  const r = PUSH_BUTTON.poleDia / 2;
  const bx = x + fx * (r + PUSH_BUTTON.housingDepth / 2);
  const bz = z + fz * (r + PUSH_BUTTON.housingDepth / 2);
  const by = y0 + PUSH_BUTTON.heightUsed;

  g.add(mesh(box(PUSH_BUTTON.housingWidth, PUSH_BUTTON.housingHeight,
    PUSH_BUTTON.housingDepth), MAT.alu, bx, by, bz, { rotY: -facing }));
  /* the button itself, proud of the housing so it can be found by touch */
  const btn = mesh(cyl(PUSH_BUTTON.buttonDia / 2, PUSH_BUTTON.buttonDia / 2,
    PUSH_BUTTON.buttonRaise, 12), MAT.markYellow,
    bx + fx * (PUSH_BUTTON.housingDepth / 2 + PUSH_BUTTON.buttonRaise / 2), by,
    bz + fz * (PUSH_BUTTON.housingDepth / 2 + PUSH_BUTTON.buttonRaise / 2),
    { cast: false });
  btn.rotation.z = Math.PI / 2;
  btn.rotation.y = -facing;
  g.add(btn);

  /* R10-3e instruction sign directly above the button */
  const sy = by + PUSH_BUTTON.housingHeight / 2 + PUSH_BUTTON.signHeight / 2 + IN(1);
  g.add(mesh(box(PUSH_BUTTON.signWidth, PUSH_BUTTON.signHeight, IN(0.08)),
    MAT.signWhite,
    x + fx * (r + IN(0.5)), sy, z + fz * (r + IN(0.5)), { rotY: -facing }));

  g.userData.button = btn;
  g.userData.spec = { controlHeight: PUSH_BUTTON.heightUsed };
  return g;
}

/* ------------------------------------------------------- mast arm assembly */
/**
 * One signalised approach: mast pole, arm reaching over the carriageway, two
 * through faces on the arm, a near-side face on the pole, and the pedestrian
 * head and button for the crossing at that corner.
 *
 * @param armAzimuth radians — the direction the arm reaches (across the road)
 * @param faceAzimuth radians — the direction the signal faces look (back down
 *                    the approach, i.e. armAzimuth rotated to face traffic)
 */
export function signalMast(x, z, armLength, armAzimuth, faceAzimuth, opts = {}) {
  const g = new THREE.Group();
  g.name = 'signal-mast';
  const y0 = groundH(x, z);

  /* --- foundation and shaft --- */
  g.add(mesh(cyl(MAST.basePlate / 2 * 1.3, MAST.basePlate / 2 * 1.3, IN(6), 16),
    MAT.concretePad, x, y0 + IN(3), z));
  g.add(mesh(cyl(MAST.skirtDia / 2 * 0.8, MAST.skirtDia / 2, MAST.skirtHeight, 14),
    MAT.galv, x, y0 + IN(6) + MAST.skirtHeight / 2, z));
  const shaftBase = y0 + IN(6);
  g.add(mesh(cyl(MAST.shaftTopDia / 2, MAST.shaftBaseDia / 2, MAST.shaftHeight, 14),
    MAT.galv, x, shaftBase + MAST.shaftHeight / 2, z));

  /* --- the arm --- */
  const ax = Math.cos(armAzimuth), az = Math.sin(armAzimuth);
  const armY = y0 + MAST.armMountHeight;
  const rise = MAST.armRise;
  const armGeoLen = Math.hypot(armLength, rise);
  const arm = mesh(cyl(MAST.armTipDia / 2, MAST.armBaseDia / 2, armGeoLen, 12),
    MAT.galv,
    x + ax * armLength / 2, armY + rise / 2, z + az * armLength / 2);
  arm.rotation.order = 'YZX';
  arm.rotation.y = -armAzimuth;
  arm.rotation.z = Math.PI / 2 - Math.atan2(rise, armLength);
  g.add(arm);

  /* --- through faces on the arm ---
     MUTCD 4D.14: at least two faces for the through movement, positioned so
     a driver stopped at the stop line still sees one. They hang at the
     17.5 ft used height, which is inside the 15 to 25.5 ft window. */
  const heads = [];
  const hangY = y0 + SIGNAL.heightOverRoadUsed;
  const positions = opts.headOffsets || [armLength * 0.45, armLength * 0.85];
  for (const d of positions) {
    const head = signalHead(3);
    head.position.set(x + ax * d, hangY + head.userData.height / 2, z + az * d);
    head.rotation.y = -faceAzimuth;
    /* the hanger bracket back up to the arm */
    const armAtD = armY + rise * (d / armLength);
    const gap = armAtD - (hangY + head.userData.height);
    if (gap > 0.02) {
      g.add(mesh(cyl(IN(1.6), IN(1.6), gap, 8), MAT.galv,
        x + ax * d, hangY + head.userData.height + gap / 2, z + az * d));
    }
    g.add(head);
    heads.push(head);
  }

  /* --- near-side face on the pole itself ---
     Post-mounted and not over a lane, so the 8 ft minimum applies. */
  const near = signalHead(3);
  const nr = MAST.shaftBaseDia / 2;
  near.position.set(
    x + Math.cos(faceAzimuth) * (nr + SIGNAL.sectionDepth),
    y0 + SIGNAL.heightPostUsed + near.userData.height / 2,
    z + Math.sin(faceAzimuth) * (nr + SIGNAL.sectionDepth));
  near.rotation.y = -faceAzimuth;
  g.add(near);
  heads.push(near);

  /* --- pedestrian head and button --- */
  const peds = [];
  if (opts.pedestrian !== false) {
    const ped = pedSignalHead();
    const pedFace = opts.pedFacing != null ? opts.pedFacing : faceAzimuth + Math.PI;
    ped.position.set(
      x + Math.cos(pedFace) * (nr + PED_SIGNAL.housingDepth),
      y0 + PED_SIGNAL.heightUsed + PED_SIGNAL.housingHeight / 2,
      z + Math.sin(pedFace) * (nr + PED_SIGNAL.housingDepth));
    ped.rotation.y = -pedFace;
    g.add(ped);
    peds.push(ped);

    /* Button on the pole rather than a pedestal, since the pole is right
       here — MUTCD 4E.09 wants it within 5 ft of the crosswalk extension. */
    const btn = pushButton(
      x + Math.cos(pedFace) * (nr + 0.02),
      z + Math.sin(pedFace) * (nr + 0.02),
      pedFace, { pedestal: false });
    g.add(btn);
    g.userData.button = btn;
  }

  /* --- luminaire arm, since the pole is already here --- */
  if (MAST.hasLuminaireArm && opts.luminaire !== false) {
    const lx = armAzimuth + Math.PI;
    const llen = FT(8);
    const lArm = mesh(cyl(IN(2), IN(3), llen, 8), MAT.galv,
      x + Math.cos(lx) * llen / 2, y0 + MAST.shaftHeight, z + Math.sin(lx) * llen / 2);
    lArm.rotation.order = 'YZX';
    lArm.rotation.y = -lx;
    lArm.rotation.z = Math.PI / 2;
    g.add(lArm);
    g.add(mesh(box(0.76, 0.11, 0.38), MAT.alu,
      x + Math.cos(lx) * llen, y0 + MAST.shaftHeight, z + Math.sin(lx) * llen));
  }

  g.userData.heads = heads;
  g.userData.peds = peds;
  g.userData.spec = {
    armLength, armAzimuth, faceAzimuth,
    headHeight: SIGNAL.heightOverRoadUsed,
  };
  return g;
}

/* ============================================================== controller
   Runs the derived phase plan across a set of masts. Two phases, main and
   cross, with the pedestrian phase concurrent with its parallel green.   */
export class SignalController {
  constructor({ mainWidth, crossWidth, mainSpeed, crossSpeed, offset = 0 }) {
    this.plan = phasePlan({ mainWidth, crossWidth, mainSpeed, crossSpeed });
    this.mainMasts = [];
    this.crossMasts = [];
    this.t = offset % this.plan.cycle;
    /* interval boundaries within the cycle */
    const p = this.plan;
    this.marks = {
      mainGreenEnd:  p.main.green,
      mainYellowEnd: p.main.green + p.main.yellow,
      mainRedEnd:    p.main.green + p.main.yellow + p.main.red,
      crossGreenEnd: p.main.green + p.main.yellow + p.main.red + p.cross.green,
      crossYellowEnd: p.main.green + p.main.yellow + p.main.red + p.cross.green + p.cross.yellow,
    };
  }

  add(mast, leg) { (leg === 'main' ? this.mainMasts : this.crossMasts).push(mast); }

  /** Phase of one leg at the current cycle time: 'green' | 'yellow' | 'red'. */
  stateOf(leg) {
    const t = this.t, m = this.marks;
    if (leg === 'main') {
      if (t < m.mainGreenEnd) return 'green';
      if (t < m.mainYellowEnd) return 'yellow';
      return 'red';
    }
    if (t < m.mainRedEnd) return 'red';
    if (t < m.crossGreenEnd) return 'green';
    if (t < m.crossYellowEnd) return 'yellow';
    return 'red';
  }

  /** Pedestrian state for the crossing parallel to a leg. */
  pedStateOf(leg) {
    const t = this.t, m = this.marks, p = this.plan;
    /* Pedestrians cross the CROSS street while the MAIN street has green. */
    if (leg === 'main') {
      if (t < p.cross.ped.walk) return { phase: 'walk', count: 0 };
      if (t < m.mainGreenEnd) {
        return { phase: 'clear', count: Math.ceil(m.mainGreenEnd - t) };
      }
      return { phase: 'dont', count: 0 };
    }
    const s = m.mainRedEnd;
    if (t >= s && t < s + p.main.ped.walk) return { phase: 'walk', count: 0 };
    if (t >= s && t < m.crossGreenEnd) {
      return { phase: 'clear', count: Math.ceil(m.crossGreenEnd - t) };
    }
    return { phase: 'dont', count: 0 };
  }

  update(dt) {
    this.t = (this.t + dt) % this.plan.cycle;
    for (const leg of ['main', 'cross']) {
      const st = this.stateOf(leg);
      const ped = this.pedStateOf(leg);
      const masts = leg === 'main' ? this.mainMasts : this.crossMasts;
      for (const mast of masts) {
        for (const head of mast.userData.heads || []) {
          const L = head.userData.lenses;
          if (!L) continue;
          setLens(L[0], st === 'red');
          setLens(L[1], st === 'yellow');
          setLens(L[2], st === 'green');
        }
        for (const p of mast.userData.peds || []) {
          const walking = ped.phase === 'walk';
          const clearing = ped.phase === 'clear';
          setLens(p.userData.walk, walking);
          /* the hand flashes during the clearance interval, which is the
             actual MUTCD behaviour and reads correctly at a glance */
          setLens(p.userData.hand, !walking &&
            (!clearing || Math.floor(this.t * 2) % 2 === 0));
          setLens(p.userData.count, clearing);
        }
      }
    }
  }
}

function setLens(m, on) {
  if (!m) return;
  /* Materials are frozen after build, so this writes to the mesh's own
     material instance. Each lens gets a cloned material at build time via
     the pipeline's variant registration. */
  if (m.material.emissiveIntensity !== undefined) {
    m.material.emissiveIntensity = on ? 2.6 : 0.0;
  }
}
