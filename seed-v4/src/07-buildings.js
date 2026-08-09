/* ============================================================================
   07-buildings.js — the building kit of parts
   ----------------------------------------------------------------------------
   v3's building() produced a box with a solid slab on top: no entrance, no
   transparent glazing, no parapet ring, no ground contact, and a roof slab that
   swallowed the rooftop solar it was supposed to carry.

   Here every building is assembled from nine required parts, and a roof
   allocator keeps plant, PV and penetrations from ever occupying the same
   rectangle.
   ========================================================================== */

import * as THREE from 'three';
import { ELEV, LAYER, clamp, lerp, stream, DEG } from './00-config.js';
import { groundH, padLevel } from './01-terrain.js';
import { MAT, variant } from './03-materials.js';
import { mesh, box, cyl, decal, instanced, mergeGeometries } from './geom.js';

const rnd = stream('buildings');

export const FACE = {
  N: { dx: 0, dz: -1 }, S: { dx: 0, dz: 1 },
  E: { dx: 1, dz: 0 },  W: { dx: -1, dz: 0 },
};

function rot2(x, z, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [x * c - z * s, x * s + z * c];
}

/* ------------------------------------------------------------ roof allocator
   Rectangles claimed on the roof plan. Nothing may be placed over a claimed
   rectangle, which is what stops rooftop equipment and the PV array from
   intersecting. */
class RoofPlan {
  constructor(w, d, margin) {
    this.w = w; this.d = d; this.margin = margin;
    this.claims = [];
  }
  free(x, z, w, d) {
    if (Math.abs(x) + w / 2 > this.w / 2 - this.margin) return false;
    if (Math.abs(z) + d / 2 > this.d / 2 - this.margin) return false;
    for (const c of this.claims) {
      if (Math.abs(x - c.x) < (w + c.w) / 2 + 0.35 &&
          Math.abs(z - c.z) < (d + c.d) / 2 + 0.35) return false;
    }
    return true;
  }
  claim(x, z, w, d, tag) {
    this.claims.push({ x, z, w, d, tag });
    return { x, z, w, d, tag };
  }
  tryClaim(x, z, w, d, tag) {
    if (!this.free(x, z, w, d)) return null;
    return this.claim(x, z, w, d, tag);
  }
}

/* ============================================================ the kit */
export function buildBuilding(spec) {
  const {
    id, x, z, w, d, h,
    rot = 0,
    entryFace = 'S', serviceFace = 'N',
    wall = 'panelWall', accent = null,
    glazing = 'punched',              /* punched | curtain | strip | none */
    program = 'generic',
    roof = {},
    docks = 0,
    entries = 1,
    signage = null,
    plinth = 0.55,
  } = spec;

  const g = new THREE.Group();
  g.name = 'bld-' + id;
  const pad = padLevel(x, z, w + 2.4, d + 2.4, rot, 5);
  const base = pad.mean;
  const wallMat = MAT[wall] || MAT.panelWall;
  const accentMat = accent ? (MAT[accent] || MAT.precast) : MAT.precast;
  const hw = w / 2, hd = d / 2;
  const r = stream('bld-' + id);

  /* ------------------------------------------------- 1. ground contact
     A plinth, a 0.15 m reveal, and a 1.2 m concrete apron at the base. This is
     what makes a building look attached to the ground rather than dropped on
     it. Nothing in v3 had it. */
  const apronW = 1.4;
  const apron = decal(w + apronW * 2, d + apronW * 2, x, z, MAT.concretePad, 'pavementEdge', rot);
  g.add(apron);
  g.add(mesh(box(w + 0.34, plinth, d + 0.34), MAT.precast, x, base + plinth / 2, z, { rotY: rot }));
  /* the 0.15 m reveal: a shadow gap between plinth and wall */
  g.add(mesh(box(w + 0.08, 0.15, d + 0.08), MAT.steelDark, x, base + plinth + 0.075, z, { rotY: rot }));

  const wallBase = base + plinth + 0.15;
  const wallH = h - plinth - 0.15;

  /* ------------------------------------------------- 2. wall system */
  const bodyH = wallH;
  g.add(mesh(box(w, bodyH, d), wallMat, x, wallBase + bodyH / 2, z, { rotY: rot }));
  /* corner trim */
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const [lx, lz] = rot2(sx * hw, sz * hd, rot);
    g.add(mesh(box(0.30, bodyH, 0.30), accentMat, x + lx, wallBase + bodyH / 2, z + lz, { rotY: rot }));
  }
  /* base flashing */
  g.add(mesh(box(w + 0.12, 0.34, d + 0.12), accentMat, x, wallBase + 0.17, z, { rotY: rot }));
  /* a horizontal reveal band at mid height breaks up a large elevation */
  if (bodyH > 9) {
    g.add(mesh(box(w + 0.06, 0.22, d + 0.06), accentMat, x, wallBase + bodyH * 0.62, z, { rotY: rot }));
  }

  /* ------------------------------------------------- 3. fenestration */
  const glassParts = [];
  if (glazing !== 'none') {
    const sills = [];
    const faces = ['N', 'S', 'E', 'W'];
    for (const f of faces) {
      const isService = f === serviceFace;
      if (isService && glazing !== 'curtain') continue;
      const along = (f === 'N' || f === 'S') ? w : d;
      const dir = FACE[f];
      const [ox, oz] = rot2(dir.dx * (f === 'N' || f === 'S' ? hd : hw) * ((f === 'N' || f === 'S') ? 0 : 1)
        + (f === 'E' ? hw : f === 'W' ? -hw : 0),
        (f === 'S' ? hd : f === 'N' ? -hd : 0), rot);
      const nrm = rot2(dir.dx, dir.dz, rot);
      const tangent = [-nrm[1], nrm[0]];

      if (glazing === 'curtain') {
        const gh = Math.min(bodyH - 1.6, bodyH * 0.72);
        const gy = wallBase + 0.9 + gh / 2;
        const gw = along - 2.6;
        /* glass set back in the reveal */
        glassParts.push(makePane(x + ox + nrm[0] * 0.10, gy, z + oz + nrm[1] * 0.10,
          gw, gh, Math.atan2(nrm[1], nrm[0])));
        /* mullion grid */
        const bays = Math.max(2, Math.round(gw / 3.0));
        for (let i = 0; i <= bays; i++) {
          const t = (i / bays - 0.5) * gw;
          g.add(mesh(box(0.14, gh, 0.30), MAT.alu,
            x + ox + nrm[0] * 0.16 + tangent[0] * t, gy, z + oz + nrm[1] * 0.16 + tangent[1] * t,
            { rotY: -Math.atan2(nrm[1], nrm[0]) }));
        }
        /* transom, sill and head trim */
        for (const yy of [gy - gh / 2, gy, gy + gh / 2]) {
          g.add(mesh(box(gw + 0.3, 0.16, 0.34), MAT.alu,
            x + ox + nrm[0] * 0.16, yy, z + oz + nrm[1] * 0.16,
            { rotY: -Math.atan2(nrm[1], nrm[0]) }));
        }
        sills.push({ x: x + ox, z: z + oz });
      } else {
        /* punched openings on a regular module */
        const modu = 6.2;
        const n = Math.max(1, Math.floor((along - 5) / modu));
        const levels = Math.max(1, Math.floor((bodyH - 3.2) / 4.6));
        for (let i = 0; i < n; i++) {
          const t = (i - (n - 1) / 2) * modu;
          for (let k = 0; k < levels; k++) {
            const gy = wallBase + 2.6 + k * 4.6;
            const gw = glazing === 'strip' ? modu - 0.7 : 2.6;
            const gh = 1.9;
            const px = x + ox + nrm[0] * 0.06 + tangent[0] * t;
            const pz = z + oz + nrm[1] * 0.06 + tangent[1] * t;
            /* reveal frame */
            g.add(mesh(box(gw + 0.36, gh + 0.36, 0.42), accentMat,
              px + nrm[0] * 0.10, gy, pz + nrm[1] * 0.10, { rotY: -Math.atan2(nrm[1], nrm[0]) }));
            glassParts.push(makePane(px - nrm[0] * 0.06, gy, pz - nrm[1] * 0.06,
              gw, gh, Math.atan2(nrm[1], nrm[0])));
            /* sill with a drip */
            g.add(mesh(box(gw + 0.5, 0.10, 0.30), accentMat,
              px + nrm[0] * 0.14, gy - gh / 2 - 0.14, pz + nrm[1] * 0.14,
              { rotY: -Math.atan2(nrm[1], nrm[0]) }));
          }
        }
      }
    }
  }
  for (const p of glassParts) g.add(p);

  /* ------------------------------------------------- 4. a real entrance */
  const entryPts = [];
  const eDir = FACE[entryFace];
  const eNrm = rot2(eDir.dx, eDir.dz, rot);
  const eTan = [-eNrm[1], eNrm[0]];
  const eOff = (entryFace === 'N' || entryFace === 'S') ? hd : hw;
  for (let k = 0; k < entries; k++) {
    const t = entries === 1 ? 0 : (k - (entries - 1) / 2) * Math.min(w, d) * 0.42;
    const ex = x + eNrm[0] * eOff + eTan[0] * t;
    const ez = z + eNrm[1] * eOff + eTan[1] * t;
    const ang = -Math.atan2(eNrm[1], eNrm[0]);
    const eg = entranceAssembly(ex, ez, ang, eNrm, base, wallBase, k === 0);
    g.add(eg);
    entryPts.push({ x: ex + eNrm[0] * 5.2, z: ez + eNrm[1] * 5.2, ang });
  }

  /* ------------------------------------------------- 5. roof */
  const roofY = wallBase + bodyH;
  const parapetH = roof.parapet != null ? roof.parapet : 1.15;
  /* a parapet RING, not a solid box over the whole roof plan */
  const ringT = 0.34;
  for (const [ax, az, aw, ad] of [
    [0, -hd + ringT / 2, w, ringT], [0, hd - ringT / 2, w, ringT],
    [-hw + ringT / 2, 0, ringT, d - ringT * 2], [hw - ringT / 2, 0, ringT, d - ringT * 2],
  ]) {
    const [px, pz] = rot2(ax, az, rot);
    g.add(mesh(box(aw, parapetH, ad), wallMat, x + px, roofY + parapetH / 2, z + pz, { rotY: rot }));
    /* coping cap */
    g.add(mesh(box(aw + 0.16, 0.10, ad + 0.16), accentMat, x + px, roofY + parapetH + 0.05, z + pz, { rotY: rot }));
  }
  /* the membrane roof deck, inside the ring */
  const deck = mesh(box(w - ringT * 2, 0.16, d - ringT * 2), MAT.roofMembrane,
    x, roofY + 0.08, z, { rotY: rot, cast: false });
  g.add(deck);

  const plan = new RoofPlan(w - ringT * 2, d - ringT * 2, 1.3);
  const toWorld = (lx, lz) => { const [a, b] = rot2(lx, lz, rot); return [x + a, z + b]; };

  /* roof drains, scuppers and downspouts */
  const drains = [];
  const dnx = Math.max(1, Math.round(w / 26)), dnz = Math.max(1, Math.round(d / 26));
  for (let i = 0; i < dnx; i++) {
    for (let j = 0; j < dnz; j++) {
      const lx = (i - (dnx - 1) / 2) * (w / dnx) * 0.7;
      const lz = (j - (dnz - 1) / 2) * (d / dnz) * 0.7;
      if (!plan.tryClaim(lx, lz, 1.6, 1.6, 'drain')) continue;
      const [px, pz] = toWorld(lx, lz);
      /* a cricket: a shallow slope toward the drain */
      g.add(mesh(cyl(0.30, 0.42, 0.10, 12), MAT.steelDark, px, roofY + 0.14, pz, { cast: false }));
      drains.push([lx, lz]);
    }
  }
  for (const sx of [-1, 1]) {
    const [px, pz] = toWorld(sx * (hw - 0.2), hd * 0.55);
    g.add(mesh(box(0.42, 0.26, 0.42), accentMat, px, roofY + parapetH * 0.35, pz, { rotY: rot }));
    g.add(mesh(cyl(0.09, 0.09, roofY - base, 10), MAT.steelDark, px, base + (roofY - base) / 2, pz));
    g.add(mesh(box(0.30, 0.18, 0.30), MAT.steelDark, px, base + 0.35, pz));
  }

  /* ------------------------------------------------- 6. roof plant */
  if (roof.plant !== false) {
    const nRTU = roof.rtu != null ? roof.rtu : Math.max(2, Math.round(w * d / 900));
    let placed = 0;
    for (let attempt = 0; attempt < nRTU * 8 && placed < nRTU; attempt++) {
      const uw = 3.4 + r() * 1.8, ud = 2.2 + r() * 1.2;
      const lx = (r() - 0.5) * (w - ringT * 2 - uw - 3);
      const lz = (r() - 0.5) * (d - ringT * 2 - ud - 3);
      if (!plan.tryClaim(lx, lz, uw + 1.6, ud + 1.6, 'rtu')) continue;
      placed++;
      const [px, pz] = toWorld(lx, lz);
      /* curb, unit, condenser fans, duct drop */
      g.add(mesh(box(uw + 0.3, 0.34, ud + 0.3), MAT.steelDark, px, roofY + 0.33, pz, { rotY: rot }));
      g.add(mesh(box(uw, 1.55, ud), MAT.galv, px, roofY + 1.28, pz, { rotY: rot }));
      for (let f = 0; f < 2; f++) {
        const [fx, fz] = rot2((f - 0.5) * uw * 0.5, 0, rot);
        g.add(mesh(cyl(0.52, 0.52, 0.22, 12), MAT.steelDark, px + fx, roofY + 2.14, pz + fz));
      }
      /* ductwork running to the nearest edge */
      const [dx2, dz2] = toWorld(lx, lz + ud * 0.9);
      g.add(mesh(box(1.0, 0.7, 2.4), MAT.galv, dx2, roofY + 1.0, dz2, { rotY: rot }));
    }
    /* screen wall around the plant cluster on the public-facing side */
    if (roof.screen !== false && placed) {
      const [sx2, sz2] = toWorld(0, -hd + 3.2);
      g.add(mesh(box(w * 0.5, 2.3, 0.12), MAT.alu, sx2, roofY + 1.15, sz2, { rotY: rot }));
    }
    /* roof hatch, ladder and safety rail at the service face */
    const sN = rot2(FACE[serviceFace].dx, FACE[serviceFace].dz, rot);
    const [lx2, lz2] = [x + sN[0] * (hw - 2.2), z + sN[1] * (hd - 2.2)];
    g.add(mesh(box(1.2, 0.35, 1.2), MAT.steelDark, lx2, roofY + 0.34, lz2, { rotY: rot }));
    for (let i = 0; i < 3; i++) {
      g.add(mesh(box(0.06, 1.1, 0.06), MAT.galv, lx2 + 0.6 - i * 0.6, roofY + 0.95, lz2 + 0.7));
    }
    /* walk pads from the hatch */
    for (let i = 0; i < 6; i++) {
      const t = i / 5;
      const px = lerp(lx2, x, t), pz = lerp(lz2, z, t);
      g.add(mesh(box(0.9, 0.03, 0.9), MAT.rubber, px, roofY + 0.18, pz, { rotY: rot, cast: false }));
    }
  }

  /* ------------------------------------------------- 7. rooftop PV
     Mounted ABOVE the parapet plane on racking, with ballast and walk pads. In
     v3 the panels sat half inside the parapet slab and their legs went 1.8 m
     down into the building core. */
  let pvArea = 0;
  if (roof.pv) {
    const tilt = 12 * DEG;
    const panelW = 1.05, panelL = 1.75;
    const rowPitch = 3.0, colPitch = 1.12;
    const rackY = roofY + 0.34;                  /* clear of the membrane */
    const panels = [], rails = [], ballast = [];
    const rows = Math.floor((d - ringT * 2 - 5) / rowPitch);
    const cols = Math.floor((w - ringT * 2 - 5) / colPitch);
    for (let ri = 0; ri < rows; ri++) {
      const lz = (ri - (rows - 1) / 2) * rowPitch;
      let runStart = null;
      for (let ci = 0; ci < cols; ci++) {
        const lx = (ci - (cols - 1) / 2) * colPitch;
        if (!plan.free(lx, lz, colPitch, panelL + 0.4)) { runStart = null; continue; }
        const [px, pz] = toWorld(lx, lz);
        panels.push({ x: px, y: rackY + 0.42, z: pz, rx: -tilt, ry: rot, s: 1 });
        pvArea += panelW * panelL;
        if (runStart === null) runStart = lx;
        if (ci % 4 === 0) {
          ballast.push({ x: px, y: rackY + 0.06, z: pz, ry: rot, s: 1 });
        }
      }
      if (runStart !== null) {
        const [rx, rz] = toWorld(0, lz);
        rails.push({ x: rx, y: rackY + 0.20, z: rz, ry: rot, s: 1 });
      }
    }
    if (panels.length) {
      const pg = new THREE.BoxGeometry(colPitch - 0.05, 0.045, panelL);
      const pm = instanced(pg, MAT.pv, panels, { cast: true, receive: false });
      pm.name = 'pv-' + id;
      g.add(pm);
      const bg = new THREE.BoxGeometry(0.42, 0.12, 0.42);
      g.add(instanced(bg, MAT.concretePad, ballast, { cast: false }));
      const rg = new THREE.BoxGeometry(w - ringT * 2 - 4.6, 0.09, 0.09);
      g.add(instanced(rg, MAT.alu, rails, { cast: false }));
      /* inverter string at the service face */
      const sN = rot2(FACE[serviceFace].dx, FACE[serviceFace].dz, rot);
      for (let i = 0; i < 3; i++) {
        const px = x + sN[0] * (hw - 1.9) + (i - 1) * 1.3 * -sN[1];
        const pz = z + sN[1] * (hd - 1.9) + (i - 1) * 1.3 * sN[0];
        g.add(mesh(box(0.65, 1.05, 0.34), MAT.steel, px, roofY + 0.72, pz, { rotY: rot }));
      }
    }
  }

  /* ------------------------------------------------- 8. service face */
  const svcPts = [];
  const sDir = FACE[serviceFace];
  const sNrm = rot2(sDir.dx, sDir.dz, rot);
  const sTan = [-sNrm[1], sNrm[0]];
  const sOff = (serviceFace === 'N' || serviceFace === 'S') ? hd : hw;
  const sAlong = (serviceFace === 'N' || serviceFace === 'S') ? w : d;
  if (docks > 0) {
    for (let i = 0; i < docks; i++) {
      const t = (i - (docks - 1) / 2) * 4.6;
      const dx3 = x + sNrm[0] * sOff + sTan[0] * t;
      const dz3 = z + sNrm[1] * sOff + sTan[1] * t;
      const ang = -Math.atan2(sNrm[1], sNrm[0]);
      /* dock door, leveller, bumpers, light */
      g.add(mesh(box(3.4, 4.2, 0.30), MAT.steelDark, dx3 + sNrm[0] * 0.1, wallBase + 2.1, dz3 + sNrm[1] * 0.1, { rotY: ang }));
      g.add(mesh(box(3.6, 0.24, 1.5), MAT.steel, dx3 + sNrm[0] * 0.8, base + 1.22, dz3 + sNrm[1] * 0.8, { rotY: ang }));
      for (const s2 of [-1, 1]) {
        g.add(mesh(box(0.26, 0.42, 0.30), MAT.rubber,
          dx3 + sNrm[0] * 0.22 + sTan[0] * s2 * 1.85, base + 1.05, dz3 + sNrm[1] * 0.22 + sTan[1] * s2 * 1.85,
          { rotY: ang }));
      }
      g.add(mesh(box(0.22, 0.16, 0.5), MAT.emitAmber, dx3 + sNrm[0] * 0.3, wallBase + 4.6, dz3 + sNrm[1] * 0.3, { rotY: ang }));
      svcPts.push({ x: dx3 + sNrm[0] * 16, z: dz3 + sNrm[1] * 16 });
    }
    /* dock apron slab with bollards */
    const apx = x + sNrm[0] * (sOff + 9), apz = z + sNrm[1] * (sOff + 9);
    g.add(decal(sAlong * 0.9, 18, apx, apz, MAT.concretePad, 'pavementEdge', rot));
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) * (sAlong * 0.18);
      const bx = x + sNrm[0] * (sOff + 1.3) + sTan[0] * t;
      const bz = z + sNrm[1] * (sOff + 1.3) + sTan[1] * t;
      g.add(mesh(cyl(0.13, 0.15, 1.05, 10), MAT.markYellow, bx, groundH(bx, bz) + 0.52, bz));
    }
  }
  /* transformer pad, generator, gas meter, hose bib */
  {
    const px = x + sNrm[0] * (sOff + 3.4) + sTan[0] * (sAlong * 0.36);
    const pz = z + sNrm[1] * (sOff + 3.4) + sTan[1] * (sAlong * 0.36);
    const py = groundH(px, pz);
    g.add(mesh(box(3.2, 0.24, 2.4), MAT.concretePad, px, py + 0.12, pz, { rotY: rot }));
    g.add(mesh(box(2.0, 1.7, 1.5), MAT.steel, px - 0.4, py + 1.09, pz, { rotY: rot }));
    g.add(mesh(box(2.6, 1.5, 1.1), MAT.alu, px + 1.6, py + 0.99, pz, { rotY: rot }));
    for (let i = 0; i < 4; i++) {
      g.add(mesh(cyl(0.11, 0.12, 1.0, 8), MAT.markYellow,
        px - 1.9 + i * 1.5, py + 0.5, pz - 1.6));
    }
  }

  /* ------------------------------------------------- signage */
  if (signage) {
    const sx3 = x + eNrm[0] * (eOff + 0.10), sz3 = z + eNrm[1] * (eOff + 0.10);
    const ang = -Math.atan2(eNrm[1], eNrm[0]);
    g.add(mesh(box(Math.min(w * 0.42, 9), 0.85, 0.10), MAT.steelDark,
      sx3, wallBase + bodyH * 0.72, sz3, { rotY: ang }));
    g.add(mesh(box(Math.min(w * 0.42, 9) - 0.3, 0.55, 0.04), MAT.emitCool,
      sx3 + eNrm[0] * 0.08, wallBase + bodyH * 0.72, sz3 + eNrm[1] * 0.08, { rotY: ang }));
  }

  return {
    group: g, base, roofY, wallBase, bodyH,
    entryPoints: entryPts, servicePoints: svcPts,
    footprint: { x, z, w, d, rot },
    pvArea, plan,
  };
}

/* transparent glass with real reflectance and the bird-safe frit */
function makePane(x, y, z, w, h, ang) {
  const g = new THREE.PlaneGeometry(w, h);
  const m = new THREE.Mesh(g, MAT.glass);
  m.position.set(x, y, z);
  m.rotation.y = -ang + Math.PI / 2;
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}

/* doors, vestibule, canopy, steps or ramp with handrails, landing, bollards
   and a mat — on every public building */
export function entranceAssembly(x, z, ang, nrm, base, wallBase, primary) {
  const g = new THREE.Group();
  const tan = [-nrm[1], nrm[0]];
  const P = (a, b) => [x + nrm[0] * a + tan[0] * b, z + nrm[1] * a + tan[1] * b];

  /* landing */
  const [lx, lz] = P(2.4, 0);
  g.add(decal(6.4, 5.6, lx, lz, MAT.paver, 'paver', -ang));

  /* vestibule box projecting from the wall */
  const [vx, vz] = P(1.5, 0);
  g.add(mesh(box(5.2, 3.6, 3.0), MAT.precast, vx, base + 1.8, vz, { rotY: ang }));
  /* doors: two leaves with a transom, genuinely glazed */
  for (const s of [-1, 1]) {
    const [dx, dz] = P(-0.05, s * 0.58);
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.35), MAT.glass);
    pane.position.set(dx + nrm[0] * 1.55, base + 1.24, dz + nrm[1] * 1.55);
    pane.rotation.y = ang + Math.PI / 2;
    g.add(pane);
    const [fx, fz] = P(1.5, s * 1.16);
    g.add(mesh(box(0.10, 2.45, 0.14), MAT.alu, fx, base + 1.26, fz, { rotY: ang }));
  }
  const [tx, tz] = P(1.52, 0);
  const transom = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.85), MAT.glass);
  transom.position.set(tx, base + 2.9, tz);
  transom.rotation.y = ang + Math.PI / 2;
  g.add(transom);

  /* entry canopy on slender columns, stopping at the beam */
  const [cx, cz] = P(3.6, 0);
  g.add(mesh(box(7.0, 0.26, 4.4), MAT.alu, cx, base + 3.9, cz, { rotY: ang }));
  for (const s of [-1, 1]) {
    const [px, pz] = P(5.3, s * 2.9);
    g.add(mesh(cyl(0.11, 0.11, 3.75, 10), MAT.steelDark, px, base + 1.88, pz));
  }

  /* an accessible ramp with handrails, alongside a short flight of steps */
  if (primary) {
    for (let i = 0; i < 2; i++) {
      const [sx, sz] = P(5.6 + i * 0.34, 0);
      g.add(mesh(box(4.2, 0.17, 0.34), MAT.concretePad, sx, base + 0.09 + i * 0.17, sz, { rotY: ang }));
    }
    const [rx, rz] = P(4.2, 4.4);
    g.add(mesh(box(7.5, 0.14, 1.7), MAT.concretePad, rx, base + 0.22, rz, { rotY: ang + 0.055 }));
    for (const s of [-1, 1]) {
      const [hx, hz] = P(4.2, 4.4 + s * 0.85);
      g.add(mesh(box(7.5, 0.06, 0.06), MAT.galv, hx, base + 0.95, hz, { rotY: ang + 0.055 }));
      g.add(mesh(box(7.5, 0.06, 0.06), MAT.galv, hx, base + 0.68, hz, { rotY: ang + 0.055 }));
    }
  }

  /* bollards and a recessed mat */
  for (let i = 0; i < 4; i++) {
    const [bx, bz] = P(6.4, (i - 1.5) * 1.8);
    g.add(mesh(cyl(0.10, 0.11, 0.95, 10), MAT.steelDark, bx, groundH(bx, bz) + 0.48, bz));
  }
  const [mx, mz] = P(2.2, 0);
  g.add(decal(2.6, 1.5, mx, mz, MAT.rubber, 'decal', -ang));

  return g;
}

/* ---------------------------------------------------------- simple volumes
   For plant, silos, tanks and enclosures that are not occupiable buildings but
   still need real ground contact and a roof edge. */
export function industrialVolume(spec) {
  const { id, x, z, w, d, h, rot = 0, mat = 'panelWallD', roofMat = 'roofSeam',
          ribs = true, louvres = false, doors = 1 } = spec;
  const g = new THREE.Group();
  g.name = 'vol-' + id;
  const base = padLevel(x, z, w, d, rot, 4).mean;
  g.add(decal(w + 2.4, d + 2.4, x, z, MAT.concretePad, 'pavementEdge', rot));
  g.add(mesh(box(w + 0.3, 0.4, d + 0.3), MAT.precast, x, base + 0.2, z, { rotY: rot }));
  g.add(mesh(box(w, h, d), MAT[mat], x, base + 0.4 + h / 2, z, { rotY: rot }));
  g.add(mesh(box(w + 0.5, 0.34, d + 0.5), MAT[roofMat], x, base + 0.4 + h + 0.17, z, { rotY: rot }));
  if (ribs) {
    const n = Math.max(2, Math.round(w / 6));
    for (let i = 0; i <= n; i++) {
      const [px, pz] = rot2((i / n - 0.5) * w, d / 2, rot);
      g.add(mesh(box(0.22, h, 0.22), MAT.steelDark, x + px, base + 0.4 + h / 2, z + pz, { rotY: rot }));
      const [qx, qz] = rot2((i / n - 0.5) * w, -d / 2, rot);
      g.add(mesh(box(0.22, h, 0.22), MAT.steelDark, x + qx, base + 0.4 + h / 2, z + qz, { rotY: rot }));
    }
  }
  if (louvres) {
    for (let i = 0; i < 6; i++) {
      const [px, pz] = rot2(0, d / 2 + 0.08, rot);
      g.add(mesh(box(w * 0.7, 0.10, 0.16), MAT.alu, x + px, base + h * 0.55 + i * 0.22, z + pz, { rotY: rot }));
    }
  }
  for (let i = 0; i < doors; i++) {
    const [px, pz] = rot2((i - (doors - 1) / 2) * 5.0, d / 2 + 0.06, rot);
    g.add(mesh(box(3.6, 4.0, 0.14), MAT.steelDark, x + px, base + 2.4, z + pz, { rotY: rot }));
  }
  return { group: g, base, roofY: base + 0.4 + h };
}
