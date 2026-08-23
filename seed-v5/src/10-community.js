/* ============================================================================
   10-community.js — community center, event plaza, academy, parking
   ----------------------------------------------------------------------------
   v3's community center was a sealed 80 m opaque drum with no door, no readable
   windows, a 32 m solid concrete silo growing through its roof, two footpaths
   tunnelling through its exact centre, and a bench, two flower beds and two
   lamp posts inside it.

   Here it is a ring with a glazed atrium courtyard, two real entrances, and
   five visible program wedges.
   ========================================================================== */

import * as THREE from 'three';
import { ELEV, LAYER, DEG, clamp, lerp, stream } from './00-config.js';
import { groundH } from './01-terrain.js';
import { MAT } from './03-materials.js';
import { place } from './02-registry.js';
import { buildBuilding, entranceAssembly } from './07-buildings.js';
import { mesh, box, cyl, decal, instanced, polygonPavingDense } from './geom.js';
import { PLOTS } from './08-siteplan.js';

const r = stream('community');

export const PROGRAM = [
  { key: 'coffee',  label: '$1 coffee house', a0: -18, a1: 46,  colour: 0xd9a35e },
  { key: 'maker',   label: 'Maker space',     a0: 46,  a1: 122, colour: 0x6fa8c9 },
  { key: 'teen',    label: 'Teen center',     a0: 122, a1: 190, colour: 0x8e7bc9 },
  { key: 'senior',  label: 'Senior hall',     a0: 190, a1: 258, colour: 0x7cc09a },
  { key: 'services',label: 'Services wing',   a0: 258, a1: 342, colour: 0xc98f8f },
];

export function buildCommunity(world, roads, walks) {
  const g = new THREE.Group();
  g.name = 'community';
  world.add(g);
  const out = { group: g, anchors: {} };
  const A = (id, x, y, z) => { out.anchors[id] = [x, y, z]; };

  const cc = PLOTS.community;
  const by = groundH(cc.x, cc.z);

  /* =============================================== the community center ring */
  place({
    id: 'community-center', layer: LAYER.STRUCTURE,
    footprint: { x: cc.x, z: cc.z, r: cc.r + 1.0 },
    y0: by - 1, y1: by + 17,
    clearance: 2.0, parent: g, site: 'community center',
    groups: ['cc'], allowOverlapWith: ['walk'],
    build: () => {
      const grp = new THREE.Group();
      const R0 = cc.rInner, R1 = cc.r;
      const wallH = 8.4;

      /* ring floor plate and plinth */
      grp.add(ringMesh(cc.x, cc.z, R0 - 1.2, R1 + 1.4, by, 0.55, MAT.precast, 72));
      grp.add(ringMesh(cc.x, cc.z, R0 - 0.6, R1 + 0.9, by + 0.55, 0.16, MAT.steelDark, 72));

      /* outer wall, cut into program wedges with real glass between piers */
      for (const p of PROGRAM) {
        const a0 = p.a0 * DEG, a1 = p.a1 * DEG;
        const seg = Math.max(4, Math.round((p.a1 - p.a0) / 7));
        for (let i = 0; i < seg; i++) {
          const t0 = lerp(a0, a1, i / seg), t1 = lerp(a0, a1, (i + 1) / seg);
          const mid = (t0 + t1) / 2;
          const glazed = i % 2 === 0;
          const wx = cc.x + Math.cos(mid) * R1, wz = cc.z + Math.sin(mid) * R1;
          const chord = R1 * (t1 - t0);
          if (glazed) {
            const pane = new THREE.Mesh(new THREE.PlaneGeometry(chord * 0.94, wallH - 1.4), MAT.glass);
            pane.position.set(wx, by + 0.71 + (wallH - 1.4) / 2 + 0.5, wz);
            pane.rotation.y = -mid + Math.PI / 2;
            grp.add(pane);
            grp.add(mesh(box(chord, 0.55, 0.5), MAT.precast, wx, by + 0.98, wz, { rotY: -mid }));
            grp.add(mesh(box(chord, 0.45, 0.6), MAT.precast, wx, by + wallH + 0.55, wz, { rotY: -mid }));
          } else {
            grp.add(mesh(box(chord, wallH, 0.52), MAT.brick, wx, by + 0.71 + wallH / 2, wz, { rotY: -mid }));
          }
          /* pier between bays */
          const px = cc.x + Math.cos(t0) * R1, pz = cc.z + Math.sin(t0) * R1;
          grp.add(mesh(box(0.55, wallH + 0.6, 0.8), MAT.precast, px, by + 0.71 + (wallH + 0.6) / 2, pz,
            { rotY: -t0 }));
        }
      }

      /* inner wall onto the atrium: fully glazed, so the courtyard reads as the
         light-filled commons it is meant to be */
      const inSeg = 44;
      for (let i = 0; i < inSeg; i++) {
        const t = (i / inSeg) * Math.PI * 2, t2 = ((i + 1) / inSeg) * Math.PI * 2;
        const mid = (t + t2) / 2;
        const wx = cc.x + Math.cos(mid) * R0, wz = cc.z + Math.sin(mid) * R0;
        const chord = R0 * (t2 - t);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(chord * 0.92, wallH - 1.0), MAT.glass);
        pane.position.set(wx, by + 0.71 + (wallH - 1.0) / 2 + 0.35, wz);
        pane.rotation.y = -mid + Math.PI / 2;
        grp.add(pane);
        if (i % 2 === 0) {
          grp.add(mesh(box(0.28, wallH, 0.28), MAT.alu, wx, by + 0.71 + wallH / 2, wz, { rotY: -mid }));
        }
      }

      /* the colonnade: columns that stop at the beam, not through the soffit */
      const nCol = 36;
      for (let i = 0; i < nCol; i++) {
        const t = (i / nCol) * Math.PI * 2;
        const cx2 = cc.x + Math.cos(t) * (R1 + 3.4), cz2 = cc.z + Math.sin(t) * (R1 + 3.4);
        grp.add(mesh(cyl(0.24, 0.26, wallH - 0.5, 12), MAT.precast, cx2, by + 0.71 + (wallH - 0.5) / 2, cz2));
      }
      grp.add(ringMesh(cc.x, cc.z, R1 + 2.4, R1 + 4.6, by + 0.71 + wallH - 0.5, 0.55, MAT.precast, 72));
      /* the shading canopy over the colonnade */
      grp.add(ringMesh(cc.x, cc.z, R1 + 0.4, R1 + 5.4, by + 0.71 + wallH + 0.05, 0.34, MAT.alu, 72));

      /* roof: a ring roof with a clerestory that is actually visible, a green
         roof over the services wing and PV over the rest */
      const roofY = by + 0.71 + wallH + 0.4;
      grp.add(ringMesh(cc.x, cc.z, R0, R1 + 0.9, roofY, 0.5, MAT.roofMembrane, 72));
      /* clerestory band standing proud of the roof */
      for (let i = 0; i < 40; i++) {
        const t = (i / 40) * Math.PI * 2;
        const mid = t + Math.PI / 40;
        const cx2 = cc.x + Math.cos(mid) * (R0 + 7), cz2 = cc.z + Math.sin(mid) * (R0 + 7);
        const chord = (R0 + 7) * (Math.PI * 2 / 40);
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(chord * 0.9, 2.1), MAT.glass);
        pane.position.set(cx2, roofY + 1.55, cz2);
        pane.rotation.y = -mid + Math.PI / 2;
        grp.add(pane);
      }
      grp.add(ringMesh(cc.x, cc.z, R0 + 5.4, R0 + 8.8, roofY + 2.7, 0.4, MAT.alu, 60));
      /* PV field on the outer roof ring */
      const pv = [];
      for (let ring2 = 0; ring2 < 4; ring2++) {
        const rr = R0 + 12 + ring2 * 8;
        const n = Math.round(2 * Math.PI * rr / 3.6);
        for (let i = 0; i < n; i++) {
          const t = (i / n) * Math.PI * 2;
          const px = cc.x + Math.cos(t) * rr, pz = cc.z + Math.sin(t) * rr;
          const a = Math.atan2(pz - cc.z, px - cc.x);
          if (a * (180 / Math.PI) > 258 - 360 && a * (180 / Math.PI) < -18) continue;
          pv.push({ x: px, y: roofY + 0.85, z: pz, ry: -t, rx: -12 * DEG, s: 1 });
        }
      }
      grp.add(instanced(new THREE.BoxGeometry(3.2, 0.05, 1.7), MAT.pv, pv, { cast: true, receive: false }));
      /* green roof over the services wing */
      grp.add(ringSector(cc.x, cc.z, R0 + 10, R1 - 2, 258 * DEG, 342 * DEG, roofY + 0.62, MAT.planting));

      /* atrium courtyard floor, trees and skylights over the ring at the atrium */
      grp.add(circleMesh(cc.x, cc.z, R0 - 1.0, by + 0.24, MAT.paver, 48));
      for (let i = 0; i < 5; i++) {
        const t = (i / 5) * Math.PI * 2 + 0.4;
        const px = cc.x + Math.cos(t) * (R0 * 0.55), pz = cc.z + Math.sin(t) * (R0 * 0.55);
        grp.add(mesh(box(2.4, 0.10, 2.4), MAT.steelDark, px, by + 0.30, pz));
      }

      /* ------- the two entrances. This is the single most important fix here. */
      /* primary: facing the event plaza to the east */
      const eAng = 0;
      const ex = cc.x + Math.cos(eAng) * R1, ez = cc.z + Math.sin(eAng) * R1;
      grp.add(entranceAssembly(ex, ez, -eAng, [Math.cos(eAng), Math.sin(eAng)], by, by + 0.71, true));
      /* secondary: facing the drop-off to the north */
      const nAng = -Math.PI / 2;
      const nx = cc.x + Math.cos(nAng) * R1, nz = cc.z + Math.sin(nAng) * R1;
      grp.add(entranceAssembly(nx, nz, -nAng, [Math.cos(nAng), Math.sin(nAng)], by, by + 0.71, false));

      /* program signage on the glazing so the wedges read from outside */
      for (const p of PROGRAM) {
        const mid = ((p.a0 + p.a1) / 2) * DEG;
        const sx = cc.x + Math.cos(mid) * (R1 + 0.35);
        const sz = cc.z + Math.sin(mid) * (R1 + 0.35);
        grp.add(mesh(box(5.4, 0.7, 0.09), MAT.steelDark, sx, by + 7.6, sz, { rotY: -mid }));
        const lit = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.42, 0.05), MAT.emitWarm);
        lit.position.set(sx + Math.cos(mid) * 0.06, by + 7.6, sz + Math.sin(mid) * 0.06);
        lit.rotation.y = -mid;
        grp.add(lit);
      }
      return grp;
    },
  });
  A('community-center', cc.x, by + 12, cc.z);

  /* the maker space's work yard, with a roll-up door */
  {
    const mx = cc.x + Math.cos(84 * DEG) * (cc.r + 22);
    const mz = cc.z + Math.sin(84 * DEG) * (cc.r + 22);
    place({
      id: 'maker-yard', layer: LAYER.PROP,
      footprint: { x: mx, z: mz, w: 22, d: 18 },
      y0: groundH(mx, mz) - 0.3, y1: groundH(mx, mz) + 3.2,
      parent: g, site: 'maker space work yard',
      build: () => {
        const grp = new THREE.Group();
        grp.add(decal(22, 18, mx, mz, MAT.concretePad, 'pavementEdge'));
        for (let i = 0; i < 4; i++) {
          grp.add(mesh(box(1.8, 0.85, 0.9), MAT.steel, mx - 7 + i * 4.4, groundH(mx, mz) + 0.42, mz + 6));
        }
        return grp;
      },
    });
  }

  /* ==================================================== the event plaza
     v3's plaza was a paver disc on an identical paver slab, so it had no
     boundary at all. Here it has a raised edge, a seat wall and a tree bosque. */
  const pz0 = PLOTS.plaza;
  place({
    id: 'event-plaza', layer: LAYER.WALK,
    footprint: { x: pz0.x, z: pz0.z, r: pz0.r },
    y0: groundH(pz0.x, pz0.z) - 0.3, y1: groundH(pz0.x, pz0.z) + 0.9,
    parent: g, site: 'event plaza',
    groups: ['plaza'], allowOverlapWith: ['walk', 'plaza', 'road'],
    build: () => {
      const grp = new THREE.Group();
      const py = groundH(pz0.x, pz0.z);
      grp.add(circleMesh(pz0.x, pz0.z, pz0.r, py + ELEV.paver, MAT.paver, 72));
      /* a raised edge kerb all the way round, with declared gaps */
      const gaps = [[-30, 30], [150, 200], [250, 290]];
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * 360;
        if (gaps.some(([g0, g1]) => a >= g0 + 360 * (g0 < 0 ? 1 : 0) % 360 && a <= g1)) continue;
        if (gaps.some(([g0, g1]) => (a - 360) >= g0 && (a - 360) <= g1)) continue;
        const t = a * DEG, t2 = (a + 360 / 96) * DEG, mid = (t + t2) / 2;
        const ex = pz0.x + Math.cos(mid) * pz0.r, ez = pz0.z + Math.sin(mid) * pz0.r;
        const chord = pz0.r * (t2 - t) * 1.06;
        grp.add(mesh(box(chord, 0.42, 0.5), MAT.concreteCurb, ex, py + 0.21, ez, { rotY: -mid }));
        /* low seat wall on the south arc */
        if (a > 200 && a < 340) {
          grp.add(mesh(box(chord, 0.45, 0.7), MAT.precast, ex - Math.cos(mid) * 1.2,
            py + 0.66, ez - Math.sin(mid) * 1.2, { rotY: -mid }));
        }
      }
      /* a change of paving marks the inner performance area */
      grp.add(circleMesh(pz0.x, pz0.z + 22, 34, py + ELEV.decal, MAT.concretePad, 48));
      return grp;
    },
  });
  A('event-plaza', pz0.x, groundH(pz0.x, pz0.z) + 6, pz0.z);

  /* -------------------------------------------------------------- the stage */
  {
    const s = PLOTS.stage;
    place({
      id: 'stage', layer: LAYER.STRUCTURE,
      footprint: { x: s.x, z: s.z + 4, w: s.w + 10, d: s.d + 14 },
      y0: groundH(s.x, s.z) - 0.5, y1: groundH(s.x, s.z) + 13,
      parent: g, site: 'permanent stage',
      allowOverlapWith: ['plaza', 'walk'],
      build: () => {
        const grp = new THREE.Group();
        const sy = groundH(s.x, s.z);
        /* deck on a real substructure, with cable trenches */
        grp.add(mesh(box(s.w, 1.35, s.d), MAT.precast, s.x, sy + 0.67, s.z));
        grp.add(mesh(box(s.w - 0.6, 0.12, s.d - 0.6), MAT.deck, s.x, sy + 1.40, s.z));
        for (let i = 0; i < 3; i++) {
          grp.add(mesh(box(0.5, 0.06, s.d - 2), MAT.steelDark, s.x - 8 + i * 8, sy + 1.47, s.z));
        }
        /* proscenium and wings */
        for (const sx of [-1, 1]) {
          grp.add(mesh(box(1.4, 9.5, s.d), MAT.precast, s.x + sx * (s.w / 2 + 0.7), sy + 4.75 + 1.35, s.z));
        }
        grp.add(mesh(box(s.w + 3, 1.6, 1.4), MAT.precast, s.x, sy + 10.4, s.z - s.d / 2));
        /* backstage room */
        grp.add(mesh(box(s.w + 3, 4.4, 9), MAT.panelWallW, s.x, sy + 2.2, s.z + s.d / 2 + 4.5));
        grp.add(mesh(box(s.w + 3.6, 0.3, 9.6), MAT.roofSeam, s.x, sy + 4.55, s.z + s.d / 2 + 4.5));
        /* rigging grid */
        for (let i = 0; i < 5; i++) {
          grp.add(mesh(box(s.w + 2, 0.16, 0.16), MAT.steelDark, s.x, sy + 9.6, s.z - s.d / 2 + 1.5 + i * 3.4));
        }
        for (let i = 0; i < 6; i++) {
          const lx = s.x - 12 + i * 4.8;
          grp.add(mesh(box(0.32, 0.42, 0.32), MAT.steelDark, lx, sy + 9.2, s.z - 5));
          grp.add(mesh(cyl(0.14, 0.18, 0.14, 10), MAT.emitWarm, lx, sy + 8.95, s.z - 5));
        }
        /* flush power pedestals every 30 ft — a stated m2 feature */
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const px = pz0.x + Math.cos(a) * 46, pzz = pz0.z + Math.sin(a) * 46;
          grp.add(mesh(box(0.6, 0.14, 0.6), MAT.steelDark, px, groundH(px, pzz) + ELEV.decal, pzz));
          grp.add(mesh(box(0.34, 0.30, 0.34), MAT.markYellow, px, groundH(px, pzz) + 0.24, pzz));
        }
        /* back-of-house hardstand linking the stage to the load-in road */
        grp.add(decal(70, 16, s.x + 45, s.z + 8, MAT.asphaltWorn, 'pavementEdge'));
        return grp;
      },
    });
    A('stage', s.x, groundH(s.x, s.z) + 11, s.z);
  }

  /* ------------------------------------------- the plaza canopy and lighting
     v3 balanced a 48 m open cone on a single mast, and its string-light arcs
     overshot by half a sector and terminated in mid-air. */
  place({
    id: 'plaza-canopy', layer: LAYER.CANOPY,
    footprint: { x: pz0.x, z: pz0.z + 6, r: 30 },
    y0: groundH(pz0.x, pz0.z) + 5.4, y1: groundH(pz0.x, pz0.z) + 12.5,
    parent: g, site: 'plaza tensile canopy',
    allowOverlapWith: ['plaza', 'stage', 'walk'],
    build: () => {
      const grp = new THREE.Group();
      const py = groundH(pz0.x, pz0.z);
      const cols = 6, R1 = 27;
      for (let i = 0; i < cols; i++) {
        const a = (i / cols) * Math.PI * 2 + 0.5;
        const px = pz0.x + Math.cos(a) * R1, pzz = pz0.z + 6 + Math.sin(a) * R1;
        grp.add(mesh(cyl(0.17, 0.22, 9.2, 12), MAT.steelDark, px, groundH(px, pzz) + 4.6, pzz));
        /* guy back to a ground anchor */
        grp.add(mesh(cyl(0.035, 0.035, 6.4, 5), MAT.galv,
          px + Math.cos(a) * 2.4, groundH(px, pzz) + 6.2, pzz + Math.sin(a) * 2.4,
          { rotZ: -Math.cos(a) * 0.6, rotX: Math.sin(a) * 0.6 }));
      }
      /* the fabric: a proper conic between the ring beam and a centre mast */
      grp.add(mesh(cyl(0.24, 0.28, 13, 12), MAT.steelDark, pz0.x, py + 6.5, pz0.z + 6));
      const cone = new THREE.ConeGeometry(R1 + 1.2, 4.4, cols * 6, 1, true);
      /* open cone shows its inside — needs DoubleSide, but on a CLONE:
         setting .side on the shared MAT.canvas would flip every canvas
         surface in the world */
      const canvasDS = MAT.canvas.clone();
      canvasDS.name = 'canvasTensile';
      canvasDS.side = THREE.DoubleSide;
      const cm = new THREE.Mesh(cone, canvasDS);
      cm.position.set(pz0.x, py + 11.0, pz0.z + 6);
      grp.add(cm);
      for (let i = 0; i < cols; i++) {
        const a = (i / cols) * Math.PI * 2 + 0.5;
        grp.add(mesh(box(R1, 0.10, 0.10), MAT.steelDark,
          pz0.x + Math.cos(a) * R1 / 2, py + 9.2, pz0.z + 6 + Math.sin(a) * R1 / 2,
          { rotY: -a }));
      }
      /* string lights: every catenary starts and ends at a pole */
      const poles = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const px = pz0.x + Math.cos(a) * (pz0.r - 6), pzz = pz0.z + Math.sin(a) * (pz0.r - 6);
        poles.push([px, pzz, groundH(px, pzz)]);
        grp.add(mesh(cyl(0.09, 0.11, 6.4, 10), MAT.steelDark, px, groundH(px, pzz) + 3.2, pzz));
      }
      for (let i = 0; i < poles.length; i++) {
        const a = poles[i], b = poles[(i + 1) % poles.length];
        const bulbs = [];
        const n = 16;
        for (let k = 0; k <= n; k++) {
          const t = k / n;
          const x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t);
          const sag = Math.sin(t * Math.PI) * 1.35;
          bulbs.push({ x, y: lerp(a[2], b[2], t) + 6.2 - sag, z, s: 1 });
        }
        grp.add(instanced(new THREE.SphereGeometry(0.075, 6, 5), MAT.emitWarm, bulbs,
          { cast: false, receive: false }));
      }
      return grp;
    },
  });

  /* ------------------------------------------ restroom / security building */
  {
    const p = PLOTS.restroom;
    place({
      id: 'restroom', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 6,
      clearance: 1.0, parent: g, site: 'restrooms and event security',
      allowOverlapWith: ['plaza', 'walk'],
      build: () => buildBuilding({
        id: 'restroom', x: p.x, z: p.z, w: p.w, d: p.d, h: 4.6,
        entryFace: 'S', serviceFace: 'N', wall: 'brick', accent: 'precast',
        glazing: 'punched', docks: 0, entries: 1,
        roof: { pv: true, plant: false, parapet: 0.8 },
      }).group,
    });
  }

  /* ------------------------------------------------------------ farm stand */
  {
    const p = PLOTS.farmstand;
    place({
      id: 'farm-stand', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w + 2, d: p.d + 2 },
      y0: groundH(p.x, p.z) - 0.5, y1: groundH(p.x, p.z) + 5,
      parent: g, site: 'farm stand', allowOverlapWith: ['walk'],
      build: () => {
        const grp = new THREE.Group();
        const sy = groundH(p.x, p.z);
        grp.add(decal(p.w + 4, p.d + 4, p.x, p.z, MAT.paver, 'paver'));
        grp.add(mesh(box(p.w, 0.35, p.d), MAT.precast, p.x, sy + 0.17, p.z));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          grp.add(mesh(box(0.18, 3.4, 0.18), MAT.deck,
            p.x + sx * (p.w / 2 - 0.4), sy + 1.7, p.z + sz * (p.d / 2 - 0.4)));
        }
        grp.add(mesh(box(p.w + 2.4, 0.22, p.d + 2.4), MAT.deck, p.x, sy + 3.5, p.z));
        grp.add(mesh(box(p.w + 2.6, 0.10, p.d + 2.6), MAT.roofSeam, p.x, sy + 3.66, p.z));
        for (let i = 0; i < 3; i++) {
          grp.add(mesh(box(p.w - 3, 0.08, 1.1), MAT.deck, p.x, sy + 0.95 + i * 0.42, p.z - 3 + i * 1.5));
        }
        return grp;
      },
    });
  }

  /* -------------------------------------------------- academy + training yard */
  {
    const p = PLOTS.academy;
    place({
      id: 'academy', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 16,
      clearance: 1.4, parent: g, site: 'trades and vocational academy',
      build: () => buildBuilding({
        id: 'academy', x: p.x, z: p.z, w: p.w, d: p.d, h: 12.5,
        entryFace: 'N', serviceFace: 'S', wall: 'brick', accent: 'precast',
        glazing: 'curtain', docks: 2, entries: 2, signage: true,
        roof: { pv: true, plant: true, rtu: 3, parapet: 1.1 },
      }).group,
    });
    A('academy', p.x, groundH(p.x, p.z) + 14, p.z);

    const y2 = PLOTS.trainyard;
    place({
      id: 'training-yard', layer: LAYER.PROP,
      footprint: { x: y2.x, z: y2.z, w: y2.w, d: y2.d },
      y0: groundH(y2.x, y2.z) - 0.4, y1: groundH(y2.x, y2.z) + 9,
      parent: g, site: 'training yard',
      build: () => {
        const grp = new THREE.Group();
        const yy = groundH(y2.x, y2.z);
        grp.add(decal(y2.w, y2.d, y2.x, y2.z, MAT.gravel, 'aggregate'));
        /* mock structures for trades practice */
        for (let i = 0; i < 4; i++) {
          const bx = y2.x - 26 + i * 18, bz = y2.z - 12;
          grp.add(mesh(box(7, 3.2, 5), MAT.brick, bx, yy + 1.6, bz));
          grp.add(mesh(box(7.4, 0.2, 5.4), MAT.deck, bx, yy + 3.3, bz));
        }
        /* scaffold tower, pipe rack, welding bays */
        for (let i = 0; i < 3; i++) {
          const sx = y2.x - 20 + i * 20, sz = y2.z + 14;
          for (const ax of [-1, 1]) for (const az of [-1, 1]) {
            grp.add(mesh(cyl(0.05, 0.05, 8, 6), MAT.galv, sx + ax * 1.2, yy + 4, sz + az * 1.2));
          }
          for (let k = 0; k < 4; k++) {
            grp.add(mesh(box(2.6, 0.06, 2.6), MAT.deck, sx, yy + 2 + k * 2, sz));
          }
        }
        for (let i = 0; i < 5; i++) {
          grp.add(mesh(cyl(0.16, 0.16, 12, 10), MAT.steelDark, y2.x + 22, yy + 0.9 + i * 0.4, y2.z, { rotZ: Math.PI / 2 }));
        }
        return grp;
      },
    });
  }

  /* =========================================================== parking lots
     Generated from a bay spec, with ADA stalls, islands, wheel stops, lighting
     and solar carports with EV chargers (stated feature e3, absent from v3). */
  buildLot(g, 'lotA', PLOTS.lotA, { carports: true, ev: 8, aisles: 3 });
  buildLot(g, 'lotB', PLOTS.lotB, { carports: true, ev: 4, aisles: 2 });
  A('lotA', PLOTS.lotA.x, groundH(PLOTS.lotA.x, PLOTS.lotA.z) + 7, PLOTS.lotA.z);

  return out;
}

/* --------------------------------------------------------------- lot builder */
function buildLot(parent, id, p, opts) {
  const stallW = 2.7, stallL = 5.4, aisleW = 7.0;
  place({
    id, layer: LAYER.ROAD,
    footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
    y0: groundH(p.x, p.z) - 0.4, y1: groundH(p.x, p.z) + 0.4,
    parent, site: `parking ${id}`,
    groups: ['road', 'lot', id],
    allowOverlapWith: ['road', 'apron', 'lot'],
    build: () => {
      const grp = new THREE.Group();
      const py = groundH(p.x, p.z);
      grp.add(decal(p.w, p.d, p.x, p.z, MAT.asphalt, 'asphalt'));
      /* perimeter curb, standing ABOVE the asphalt. v3's sat 1.5 cm under it,
         invisible, and the lot was drawn twice. */
      for (const [ax, az, aw, ad] of [
        [0, -p.d / 2, p.w, 0.32], [0, p.d / 2, p.w, 0.32],
        [-p.w / 2, 0, 0.32, p.d], [p.w / 2, 0, 0.32, p.d]]) {
        const cx = p.x + ax, cz = p.z + az;
        grp.add(mesh(box(aw, 0.34, ad), MAT.concreteCurb, cx, groundH(cx, cz) + 0.17 + ELEV.asphalt, cz));
      }
      /* bays: rows of stalls either side of each aisle */
      const rows = opts.aisles * 2;
      const bandD = p.d / rows;
      const stalls = [];
      for (let rIdx = 0; rIdx < rows; rIdx++) {
        const z0 = p.z - p.d / 2 + bandD * (rIdx + 0.5);
        const n = Math.floor((p.w - 6) / stallW);
        for (let i = 0; i < n; i++) {
          const sx = p.x - (n * stallW) / 2 + i * stallW + stallW / 2;
          stalls.push({ x: sx, z: z0, i, rIdx });
          /* stall line */
          grp.add(mesh(box(0.12, 0.01, stallL), MAT.markWhite,
            sx - stallW / 2, groundH(sx, z0) + ELEV.roadMarking, z0, { cast: false, receive: false }));
        }
        grp.add(mesh(box(p.w - 6, 0.01, 0.12), MAT.markWhite,
          p.x, groundH(p.x, z0) + ELEV.roadMarking, z0 + (rIdx % 2 ? -1 : 1) * stallL / 2,
          { cast: false, receive: false }));
        /* wheel stops on every third stall */
        for (let i = 0; i < stalls.length; i += 3) {
          const s = stalls[i];
          if (s.rIdx !== rIdx) continue;
          grp.add(mesh(box(1.7, 0.15, 0.16), MAT.concretePad, s.x, groundH(s.x, s.z) + 0.08 + ELEV.asphalt,
            s.z + (rIdx % 2 ? -1 : 1) * (stallL / 2 - 0.8)));
        }
      }
      /* ADA stalls with hatched access aisles, nearest the exit */
      for (let i = 0; i < 4; i++) {
        const ax = p.x - p.w / 2 + 8 + i * (stallW * 2 + 1.6);
        const az = p.z + p.d / 2 - stallL / 2 - 1.2;
        grp.add(mesh(box(stallW * 2, 0.01, stallL), MAT.markBlue, ax, groundH(ax, az) + ELEV.roadMarking + 0.002, az,
          { cast: false, receive: false }));
        for (let k = 0; k < 6; k++) {
          grp.add(mesh(box(0.10, 0.01, stallL * 1.1), MAT.markWhite,
            ax + stallW * 0.6 + k * 0.42, groundH(ax, az) + ELEV.roadMarking + 0.004, az,
            { rotY: 0.5, cast: false, receive: false }));
        }
        grp.add(mesh(cyl(0.05, 0.05, 2.2, 6), MAT.galv, ax, groundH(ax, az) + 1.1, az - stallL / 2 - 0.6));
        grp.add(mesh(box(0.4, 0.6, 0.03), MAT.markBlue, ax, groundH(ax, az) + 2.2, az - stallL / 2 - 0.6));
      }
      /* landscape islands, one per ten to twelve stalls */
      for (let i = 0; i < opts.aisles; i++) {
        const ix = p.x - p.w / 2 + 16 + i * ((p.w - 32) / Math.max(1, opts.aisles - 1 || 1));
        const iz = p.z;
        grp.add(mesh(box(4.4, 0.34, p.d - 8), MAT.concreteCurb, ix, groundH(ix, iz) + 0.17 + ELEV.asphalt, iz));
        grp.add(mesh(box(3.8, 0.28, p.d - 8.6), MAT.mulch, ix, groundH(ix, iz) + 0.30 + ELEV.asphalt, iz));
      }
      /* light poles on bases */
      for (let i = 0; i < 4; i++) {
        const lx = p.x - p.w / 2 + 14 + i * ((p.w - 28) / 3);
        const lz = p.z;
        grp.add(mesh(cyl(0.34, 0.4, 0.75, 12), MAT.concretePad, lx, groundH(lx, lz) + 0.37, lz));
        grp.add(mesh(cyl(0.10, 0.13, 8.5, 10), MAT.steelDark, lx, groundH(lx, lz) + 5.0, lz));
        grp.add(mesh(box(0.9, 0.14, 0.42), MAT.alu, lx, groundH(lx, lz) + 9.2, lz));
      }
      return grp;
    },
  });

  /* solar carports with EV chargers, declared as a canopy above the aisles */
  if (opts.carports) {
    place({
      id: id + '-carport', layer: LAYER.CANOPY,
      footprint: { x: p.x, z: p.z - p.d / 4, w: p.w - 14, d: p.d / 2 - 4 },
      y0: groundH(p.x, p.z) + 2.6, y1: groundH(p.x, p.z) + 6.4,
      parent, site: `solar carport ${id}`,
      allowOverlapWith: ['road', 'lot', id],
      build: () => {
        const grp = new THREE.Group();
        const py = groundH(p.x, p.z);
        const bays = Math.floor((p.w - 16) / 8);
        const panels = [];
        for (let i = 0; i < bays; i++) {
          const cx = p.x - (bays * 8) / 2 + i * 8 + 4;
          const cz = p.z - p.d / 4;
          grp.add(mesh(cyl(0.16, 0.19, 5.2, 10), MAT.steelDark, cx, py + 2.6, cz - 7));
          grp.add(mesh(cyl(0.16, 0.19, 5.8, 10), MAT.steelDark, cx, py + 2.9, cz + 7));
          grp.add(mesh(box(0.30, 0.34, 15.4), MAT.steelDark, cx, py + 5.3, cz, { rotX: 0.045 }));
          for (let k = 0; k < 8; k++) {
            panels.push({ x: cx, y: py + 5.55 + (k - 3.5) * 0.085, z: cz - 6.6 + k * 1.9,
                          rx: 0.055, s: 1 });
          }
        }
        grp.add(instanced(new THREE.BoxGeometry(7.6, 0.05, 1.85), MAT.pv, panels,
          { cast: true, receive: false }));
        /* EV chargers on the aisle head */
        for (let i = 0; i < opts.ev; i++) {
          const ex = p.x - (opts.ev * 5.4) / 2 + i * 5.4 + 2.7;
          const ez = p.z - p.d / 4 + 8.2;
          grp.add(mesh(box(0.9, 0.18, 0.7), MAT.concretePad, ex, groundH(ex, ez) + 0.09, ez));
          grp.add(mesh(box(0.44, 1.45, 0.28), MAT.panelWallW, ex, groundH(ex, ez) + 0.9, ez));
          grp.add(mesh(box(0.30, 0.34, 0.05), MAT.emitCool, ex, groundH(ex, ez) + 1.28, ez + 0.16));
        }
        return grp;
      },
    });
  }
}

/* ------------------------------------------------------------ ring helpers */
function ringMesh(cx, cz, r0, r1, y, h, material, seg) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r1, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, r0, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: seg || 48 });
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y + h, cz);
  const m = new THREE.Mesh(g, material);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function circleMesh(cx, cz, r0, y, material, seg) {
  const g = new THREE.CircleGeometry(r0, seg || 48);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y, cz);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true; m.castShadow = false;
  return m;
}

function ringSector(cx, cz, r0, r1, a0, a1, y, material) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, r1, a0, a1, false);
  shape.absarc(0, 0, r0, a1, a0, true);
  const g = new THREE.ShapeGeometry(shape, 40);
  g.rotateX(-Math.PI / 2);
  g.translate(cx, y, cz);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true;
  return m;
}
