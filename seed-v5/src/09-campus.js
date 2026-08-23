/* ============================================================================
   09-campus.js — compute core, utilities, and the living-systems zone
   ========================================================================== */

import * as THREE from 'three';
import { ELEV, LAYER, DEG, clamp, lerp, stream } from './00-config.js';
import { groundH, PONDS } from './01-terrain.js';
import { MAT } from './03-materials.js';
import { place, reserve } from './02-registry.js';
import { buildBuilding, industrialVolume, FACE } from './07-buildings.js';
import { mesh, box, cyl, decal, instanced, grounded } from './geom.js';
import { PLOTS } from './08-siteplan.js';
import { makeWaterMaterial, pondSurface } from './water.js';

const r = stream('campus');

export function buildCampus(world, roads, walks) {
  const g = new THREE.Group();
  g.name = 'campus';
  world.add(g);
  const out = { group: g, anchors: {} };
  const A = (id, x, y, z) => { out.anchors[id] = [x, y, z]; };

  /* ------------------------------------------------------- compute halls */
  const halls = ['hall1', 'hall2', 'hall3', 'hall4'];
  halls.forEach((k, i) => {
    const p = PLOTS[k];
    place({
      id: k, layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 21,
      clearance: 1.2, parent: g, site: `compute hall ${i + 1}`,
      groups: ['compute'],
      build: () => buildBuilding({
        id: k, x: p.x, z: p.z, w: p.w, d: p.d, h: 17.5,
        entryFace: p.entry, serviceFace: p.service,
        wall: i % 2 ? 'panelWall' : 'panelWallD', accent: 'precast',
        glazing: 'strip', docks: 4, entries: 1, signage: i === 0,
        roof: { pv: true, plant: true, rtu: 6, parapet: 1.3 },
      }).group,
    });
    A(k, p.x, groundH(p.x, p.z) + 19, p.z);
    /* waste-heat pipe run toward the greenhouses (stated feature w1) */
    if (i === 0) {
      const grp = new THREE.Group();
      for (let s = 0; s < 2; s++) {
        const y = groundH(0, 0) + 4.2 + s * 0.9;
        grp.add(mesh(box(360, 0.45, 0.45), MAT.alu, 60, y, -352));
      }
      for (let x = -110; x < 240; x += 26) {
        grp.add(mesh(box(0.4, 4.6, 0.4), MAT.steelDark, x, groundH(x, -352) + 2.3, -352));
      }
      place({
        id: 'heat-main', layer: LAYER.UTILITY,
        footprint: { x: 60, z: -352, w: 362, d: 1.6 },
        y0: groundH(60, -352) + 3.4, y1: groundH(60, -352) + 5.6,
        parent: g, site: 'waste heat main', build: () => grp,
      });
    }
  });

  /* ------------------------------------------------------- meet-me room */
  {
    const p = PLOTS.meetme;
    place({
      id: 'meetme', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 14,
      clearance: 1.0, parent: g, site: 'meet-me room',
      build: () => {
        const b = buildBuilding({
          id: 'meetme', x: p.x, z: p.z, w: p.w, d: p.d, h: 11,
          entryFace: p.entry, serviceFace: p.service,
          wall: 'panelWallW', accent: 'precast', glazing: 'punched',
          docks: 1, signage: true, roof: { pv: true, plant: true, rtu: 2 },
        });
        /* fiber entrance vaults and a microwave/antenna mast */
        for (let i = 0; i < 3; i++) {
          b.group.add(mesh(box(1.6, 0.12, 1.2), MAT.concretePad,
            p.x - 12 + i * 6, groundH(p.x, p.z) + 0.06, p.z + 22));
        }
        const my = groundH(p.x + 18, p.z);
        b.group.add(mesh(cyl(0.22, 0.32, 26, 10), MAT.galv, p.x + 18, my + 13, p.z));
        for (let i = 0; i < 3; i++) {
          b.group.add(mesh(cyl(0.9, 0.9, 0.28, 14), MAT.alu,
            p.x + 18.9, my + 15 + i * 3.4, p.z, { rotZ: Math.PI / 2 }));
        }
        b.group.add(mesh(box(0.3, 0.3, 0.3), MAT.emitRed, p.x + 18, my + 26.2, p.z));
        return b.group;
      },
    });
    A('meetme', p.x, groundH(p.x, p.z) + 13, p.z);
  }

  /* ------------------------------------------------------- cooling plant */
  {
    const p = PLOTS.cooling;
    place({
      id: 'cooling', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d + 26 },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 22,
      clearance: 1.2, parent: g, site: 'closed loop cooling plant',
      build: () => {
        const grp = new THREE.Group();
        const v = industrialVolume({
          id: 'cooling', x: p.x, z: p.z, w: p.w, d: p.d, h: 13,
          mat: 'panelWallD', louvres: true, doors: 2,
        });
        grp.add(v.group);
        /* six cooling cells with drift eliminators, in a row clear of the hall */
        for (let i = 0; i < 6; i++) {
          const cx = p.x - p.w / 2 + 8 + i * 15;
          const cz = p.z + p.d / 2 + 13;
          const by = groundH(cx, cz);
          grp.add(mesh(box(12.5, 0.5, 11.5), MAT.concretePad, cx, by + 0.25, cz));
          grp.add(mesh(box(11.6, 6.4, 10.6), MAT.panelWallW, cx, by + 3.7, cz));
          /* louvred air inlets */
          for (let k = 0; k < 5; k++) {
            grp.add(mesh(box(11.0, 0.14, 0.24), MAT.alu, cx, by + 1.6 + k * 0.7, cz + 5.4));
          }
          /* fan stack and drift eliminator ring */
          grp.add(mesh(cyl(3.3, 3.6, 2.6, 20), MAT.alu, cx, by + 8.2, cz));
          grp.add(mesh(cyl(3.5, 3.5, 0.3, 20), MAT.steelDark, cx, by + 9.6, cz));
          const fan = mesh(box(6.2, 0.16, 0.7), MAT.steelDark, cx, by + 9.2, cz);
          fan.name = 'fan-cool-' + i;
          fan.userData.spin = 0.9 + r() * 0.35;
          grp.add(fan);
          /* header piping back to the plant */
          grp.add(mesh(cyl(0.42, 0.42, 12, 10), MAT.alu, cx, by + 2.4, cz - 6.5, { rotX: Math.PI / 2 }));
        }
        return grp;
      },
    });
    A('cooling', p.x, groundH(p.x, p.z) + 16, p.z + 14);
  }

  /* ------------------------------------------------ turbine enclosure
     v3 wrapped this in a wireframe box "trellis" on a wind-animated material,
     which made the whole building sway. Here it is real trellis geometry with
     instanced vines on a fixed frame. */
  {
    const p = PLOTS.turbine;
    place({
      id: 'turbine', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w + 1.6, d: p.d + 1.6 },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 18,
      clearance: 1.2, parent: g, site: 'turbine enclosure',
      build: () => {
        const grp = new THREE.Group();
        const v = industrialVolume({
          id: 'turbine', x: p.x, z: p.z, w: p.w, d: p.d, h: 14,
          mat: 'panelWallD', ribs: false, doors: 2,
        });
        grp.add(v.group);
        const by = v.base;
        /* trellis: vertical cables and horizontal rails, standing 0.6 m off the
           wall so the planting has air behind it */
        const off = 0.75;
        for (const side of [-1, 1]) {
          const zz = p.z + side * (p.d / 2 + off);
          for (let i = 0; i <= 24; i++) {
            const x = p.x - p.w / 2 + (i / 24) * p.w;
            grp.add(mesh(cyl(0.018, 0.018, 12.4, 5), MAT.galv, x, by + 6.6, zz));
          }
          for (let k = 0; k < 5; k++) {
            grp.add(mesh(box(p.w, 0.05, 0.05), MAT.galv, p.x, by + 1.2 + k * 2.8, zz));
          }
          /* instanced vine clusters on the trellis */
          const tr = [];
          for (let i = 0; i < 130; i++) {
            tr.push({
              x: p.x - p.w / 2 + r() * p.w, y: by + 0.6 + r() * 11.6,
              z: zz + side * 0.14, ry: r() * 6.28, rz: (r() - 0.5) * 0.6,
              s: 0.5 + r() * 0.9,
            });
          }
          grp.add(instanced(new THREE.PlaneGeometry(1.5, 1.5), MAT.folPoplar, tr,
            { cast: false, receive: true }));
        }
        /* the turbine hall's exhaust and intake stacks */
        for (let i = 0; i < 2; i++) {
          const sx = p.x - 14 + i * 28;
          grp.add(mesh(cyl(1.1, 1.25, 9, 14), MAT.galv, sx, by + 14.4 + 4.5, p.z - 8));
          grp.add(mesh(cyl(1.35, 1.35, 0.4, 14), MAT.steelDark, sx, by + 23.2, p.z - 8));
        }
        return grp;
      },
    });
    A('turbine', p.x, groundH(p.x, p.z) + 16, p.z);
  }

  /* -------------------------------------------------- waste to energy plant
     v3 had three interpenetrating volumes (24x28, 12x24 and 25x5 m of overlap)
     and stacks clipping the roof. Here every volume is placed separately and
     the carbon-capture skids sit outside the main hall. */
  {
    const p = PLOTS.wte;
    place({
      id: 'wte', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 30,
      clearance: 1.4, parent: g, site: 'waste to energy plant',
      groups: ['wte-complex'],
      build: () => industrialVolume({
        id: 'wte-main', x: p.x, z: p.z, w: p.w, d: p.d, h: 26,
        mat: 'panelWallD', louvres: true, doors: 0,
      }).group,
    });
    /* tipping hall, attached on the haul-road side as a declared complex */
    const tx = p.x - p.w / 2 - 18, tz = p.z;
    place({
      id: 'wte-tipping', layer: LAYER.STRUCTURE,
      footprint: { x: tx, z: tz, w: 34, d: 46 },
      y0: groundH(tx, tz) - 1, y1: groundH(tx, tz) + 16,
      parent: g, site: 'wte tipping hall',
      groups: ['wte-complex'], allowOverlapWith: ['wte-complex'],
      build: () => {
        const grp = industrialVolume({
          id: 'wte-tip', x: tx, z: tz, w: 34, d: 46, h: 14,
          mat: 'panelWallW', doors: 3,
        }).group;
        return grp;
      },
    });
    /* stacks, clear of the roof plan and standing on their own bases */
    for (let i = 0; i < 2; i++) {
      const sx = p.x + (i - 0.5) * 26, sz = p.z + p.d / 2 + 9;
      place({
        id: 'wte-stack-' + i, layer: LAYER.STRUCTURE,
        footprint: { x: sx, z: sz, r: 3.4 },
        y0: groundH(sx, sz) - 1, y1: groundH(sx, sz) + 56,
        parent: g, site: 'wte stack',
        build: () => {
          const grp = new THREE.Group();
          const by = groundH(sx, sz);
          grp.add(mesh(cyl(3.2, 3.6, 1.0, 20), MAT.concretePad, sx, by + 0.5, sz));
          grp.add(mesh(cyl(1.5, 2.4, 52, 20), MAT.precast, sx, by + 27, sz));
          grp.add(mesh(cyl(1.7, 1.7, 1.2, 20), MAT.steelDark, sx, by + 53.2, sz));
          for (let k = 0; k < 4; k++) {
            grp.add(mesh(cyl(2.0 - k * 0.1, 2.0 - k * 0.1, 0.16, 20), MAT.galv,
              sx, by + 14 + k * 11, sz));
          }
          grp.add(mesh(box(0.28, 0.28, 0.28), MAT.emitRed, sx, by + 54.2, sz));
          return grp;
        },
      });
    }
    /* carbon-capture skids, outside the main hall */
    const cx = p.x + p.w / 2 + 15;
    place({
      id: 'carbon-capture', layer: LAYER.STRUCTURE,
      footprint: { x: cx, z: p.z, w: 22, d: 54 },
      y0: groundH(cx, p.z) - 1, y1: groundH(cx, p.z) + 20,
      parent: g, site: 'carbon capture skids',
      build: () => {
        const grp = new THREE.Group();
        const by = groundH(cx, p.z);
        grp.add(decal(24, 56, cx, p.z, MAT.concretePad, 'pavementEdge'));
        for (let i = 0; i < 3; i++) {
          const zz = p.z - 18 + i * 18;
          grp.add(mesh(cyl(3.0, 3.0, 15, 18), MAT.alu, cx - 4, by + 7.5, zz));
          grp.add(mesh(cyl(3.2, 3.2, 0.5, 18), MAT.steelDark, cx - 4, by + 15.3, zz));
          grp.add(mesh(box(6, 3.2, 4), MAT.steel, cx + 5, by + 1.8, zz));
          grp.add(mesh(cyl(0.3, 0.3, 18, 10), MAT.alu, cx + 0.5, by + 12, zz, { rotZ: Math.PI / 2 }));
        }
        /* biochar silo and bagging */
        grp.add(mesh(cyl(2.6, 2.6, 12, 16), MAT.galv, cx + 7, by + 6, p.z + 24));
        grp.add(mesh(cyl(2.6, 0.9, 3.4, 16), MAT.galv, cx + 7, by + 13.7, p.z + 24));
        return grp;
      },
    });
    A('wte', p.x, groundH(p.x, p.z) + 28, p.z);
    A('carbon', cx, groundH(cx, p.z) + 17, p.z);
  }

  /* ------------------------------------------------------------ substation
     v3 had no fence, no busbar, no gantry, and the transformers were not
     connected to the pylons 60 m away. */
  {
    const p = PLOTS.substation;
    place({
      id: 'substation', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 26,
      clearance: 2.0, parent: g, site: 'substation and microgrid',
      build: () => {
        const grp = new THREE.Group();
        const by = groundH(p.x, p.z);
        grp.add(decal(p.w, p.d, p.x, p.z, MAT.gravel, 'aggregate'));
        /* security fence with barbed top */
        for (const [ax, az, aw, ad] of [
          [0, -p.d / 2, p.w, 0.1], [0, p.d / 2, p.w, 0.1],
          [-p.w / 2, 0, 0.1, p.d], [p.w / 2, 0, 0.1, p.d]]) {
          for (let i = 0; i <= 12; i++) {
            const px = p.x + ax + (aw > 1 ? (i / 12 - 0.5) * aw : 0);
            const pz = p.z + az + (ad > 1 ? (i / 12 - 0.5) * ad : 0);
            grp.add(mesh(cyl(0.055, 0.055, 3.0, 6), MAT.galv, px, by + 1.5, pz));
          }
          grp.add(mesh(box(aw > 1 ? aw : 0.05, 0.05, ad > 1 ? ad : 0.05), MAT.galv,
            p.x + ax, by + 2.9, p.z + az));
          const meshPanel = mesh(box(aw > 1 ? aw : 0.02, 2.7, ad > 1 ? ad : 0.02),
            MAT.galv, p.x + ax, by + 1.45, p.z + az, { cast: false });
          meshPanel.material = MAT.galv;
          grp.add(meshPanel);
        }
        /* transformers, radiators, bushings */
        for (let i = 0; i < 3; i++) {
          const tx = p.x - 26 + i * 26, tz = p.z - 12;
          grp.add(mesh(box(9, 0.3, 7), MAT.concretePad, tx, by + 0.15, tz));
          grp.add(mesh(box(6.4, 5.0, 4.6), MAT.steel, tx, by + 2.8, tz));
          for (let k = 0; k < 6; k++) {
            grp.add(mesh(box(0.2, 4.0, 1.6), MAT.steelDark, tx - 3.4, by + 2.6, tz - 1.8 + k * 0.7));
          }
          for (let k = 0; k < 3; k++) {
            grp.add(mesh(cyl(0.22, 0.30, 2.6, 10), MAT.precast, tx - 1.6 + k * 1.6, by + 6.6, tz));
          }
        }
        /* busbar gantry with insulator strings */
        const gz = p.z + 16;
        for (let i = 0; i < 4; i++) {
          const gx = p.x - 34 + i * 23;
          grp.add(mesh(box(0.5, 15, 0.5), MAT.galv, gx, by + 7.5, gz));
        }
        for (let k = 0; k < 3; k++) {
          grp.add(mesh(box(78, 0.16, 0.16), MAT.alu, p.x - 3, by + 12.4 + k * 1.1, gz));
          for (let i = 0; i < 4; i++) {
            const gx = p.x - 34 + i * 23;
            for (let d2 = 0; d2 < 6; d2++) {
              grp.add(mesh(cyl(0.16, 0.16, 0.10, 8), MAT.precast,
                gx, by + 14.6 - d2 * 0.24 + k * 0.02, gz));
            }
          }
        }
        grp.add(mesh(box(9, 3.4, 4.2), MAT.panelWallW, p.x + 34, by + 1.7, p.z + 20));
        return grp;
      },
    });
    /* transmission line running west, crossing the berm overhead */
    const pyX = [-545, -700, -860];
    pyX.forEach((px, i) => {
      place({
        id: 'pylon-' + i, layer: LAYER.UTILITY,
        footprint: { x: px, z: 320, w: 16, d: 16 },
        y0: groundH(px, 320) - 1, y1: groundH(px, 320) + 44,
        parent: g, site: 'transmission pylon',
        build: () => {
          const grp = new THREE.Group();
          const by = groundH(px, 320);
          for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
            grp.add(mesh(cyl(0.12, 0.22, 38, 6), MAT.galv,
              px + sx * 2.6, by + 19, 320 + sz * 2.6, { rotZ: -sx * 0.055, rotX: sz * 0.055 }));
          }
          for (let k = 0; k < 7; k++) {
            const yy = by + 5 + k * 4.6;
            const s = lerp(5.4, 2.2, k / 6);
            grp.add(mesh(box(s, 0.12, 0.12), MAT.galv, px, yy, 322.6));
            grp.add(mesh(box(s, 0.12, 0.12), MAT.galv, px, yy, 317.4));
          }
          for (let k = 0; k < 3; k++) {
            const yy = by + 30 + k * 4;
            grp.add(mesh(box(0.12, 0.12, 17), MAT.galv, px, yy, 320));
            for (const sz of [-1, 1]) {
              for (let d2 = 0; d2 < 5; d2++) {
                grp.add(mesh(cyl(0.17, 0.17, 0.11, 8), MAT.precast,
                  px, yy - 0.4 - d2 * 0.26, 320 + sz * 7.4));
              }
            }
          }
          return grp;
        },
      });
    });
    A('substation', p.x, groundH(p.x, p.z) + 18, p.z);
  }

  /* ------------------------------------------------------------------ BESS */
  {
    const p = PLOTS.bess;
    place({
      id: 'bess', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 8,
      clearance: 1.2, parent: g, site: 'battery energy storage',
      build: () => {
        const grp = new THREE.Group();
        const by = groundH(p.x, p.z);
        grp.add(decal(p.w + 4, p.d + 4, p.x, p.z, MAT.gravel, 'aggregate'));
        for (let i = 0; i < 8; i++) {
          const cx = p.x - 24 + (i % 4) * 16;
          const cz = p.z - 8 + Math.floor(i / 4) * 16;
          grp.add(mesh(box(13, 0.24, 3.2), MAT.concretePad, cx, by + 0.12, cz));
          grp.add(mesh(box(12.2, 2.9, 2.44), MAT.panelWallW, cx, by + 1.68, cz));
          for (let k = 0; k < 4; k++) {
            grp.add(mesh(box(0.9, 0.9, 0.14), MAT.steelDark, cx - 4 + k * 2.7, by + 1.9, cz + 1.25));
          }
          grp.add(mesh(box(2.2, 0.5, 2.0), MAT.alu, cx + 4, by + 3.4, cz));
        }
        for (let i = 0; i < 3; i++) {
          grp.add(mesh(box(1.4, 2.2, 0.9), MAT.steel, p.x - 22 + i * 4, by + 1.1, p.z + 14));
        }
        return grp;
      },
    });
    A('bess', p.x, groundH(p.x, p.z) + 6, p.z);
  }

  /* ---------------------------------------------------------------- cistern */
  {
    const cx = -60, cz = 60;
    place({
      id: 'cistern', layer: LAYER.STRUCTURE,
      footprint: { x: cx, z: cz, r: 15 },
      y0: groundH(cx, cz) - 1, y1: groundH(cx, cz) + 17,
      clearance: 2.0, parent: g, site: '500,000 gallon cistern',
      build: () => {
        const grp = new THREE.Group();
        const by = groundH(cx, cz);
        grp.add(decal(36, 36, cx, cz, MAT.concretePad, 'pavementEdge'));
        grp.add(mesh(cyl(13.6, 13.9, 0.7, 40), MAT.concretePad, cx, by + 0.35, cz));
        grp.add(mesh(cyl(13.0, 13.0, 13.5, 40), MAT.galv, cx, by + 7.45, cz));
        for (let k = 0; k < 5; k++) {
          grp.add(mesh(cyl(13.1, 13.1, 0.14, 40), MAT.steelDark, cx, by + 1.6 + k * 2.7, cz));
        }
        grp.add(mesh(cyl(13.2, 11.4, 2.4, 40), MAT.roofSeam, cx, by + 15.4, cz));
        /* external stair and level gauge */
        for (let k = 0; k < 22; k++) {
          const a = k * 0.24;
          grp.add(mesh(box(1.5, 0.06, 0.4), MAT.galv,
            cx + Math.cos(a) * 13.8, by + 0.9 + k * 0.62, cz + Math.sin(a) * 13.8,
            { rotY: -a }));
        }
        grp.add(mesh(box(0.14, 12, 0.14), MAT.alu, cx + 13.2, by + 7.4, cz - 3));
        /* inlet and outlet mains */
        grp.add(mesh(cyl(0.42, 0.42, 26, 12), MAT.alu, cx, by + 1.4, cz - 26, { rotX: Math.PI / 2 }));
        return grp;
      },
    });
    A('cistern', cx, groundH(cx, cz) + 15, cz);
  }

  /* ============================================== LIVING SYSTEMS (east band) */

  /* --------- greenhouses. v3 had three rotation bugs that turned the ridge
     vents into 89.6 m planes running from y -13 to +30, rendered the rafters
     as vertical posts above the ridge, and put the glazed slopes at 59 deg
     instead of 31, leaving a 1.2 m gap at every eave. It then hid the modelled
     interior inside an opaque backdrop box. */
  ['gh1', 'gh2', 'gh3', 'gh4'].forEach((k, i) => {
    const p = PLOTS[k];
    place({
      id: k, layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 11,
      clearance: 1.4, parent: g, site: `greenhouse ${i + 1}`,
      build: () => greenhouse(p, i),
    });
    A(k, p.x, groundH(p.x, p.z) + 9, p.z);
  });

  /* --------- aquaponics: the reef tank goes INSIDE the envelope (in v3 it was
     5 m through the east wall) and the viewing wall is really glazed. */
  {
    const p = PLOTS.aquaponics;
    place({
      id: 'aquaponics', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 14,
      clearance: 1.4, parent: g, site: 'aquaponics and marine showcase',
      build: () => {
        const b = buildBuilding({
          id: 'aquaponics', x: p.x, z: p.z, w: p.w, d: p.d, h: 11.5,
          entryFace: 'W', serviceFace: 'E', wall: 'panelWallW', accent: 'precast',
          glazing: 'curtain', docks: 1, entries: 1, signage: true,
          roof: { pv: true, plant: true, rtu: 2, parapet: 1.0 },
        });
        const by = b.base;
        /* fish tanks and grow beds, inside */
        for (let i = 0; i < 4; i++) {
          const tx = p.x - 26 + i * 15;
          b.group.add(mesh(cyl(5.2, 5.2, 2.6, 24), MAT.panelWallW, tx, by + 1.9, p.z - 12));
          b.group.add(mesh(cyl(5.0, 5.0, 0.1, 24), MAT.glassSimple, tx, by + 3.1, p.z - 12));
        }
        for (let i = 0; i < 3; i++) {
          b.group.add(mesh(box(60, 0.7, 3.0), MAT.alu, p.x, by + 1.1, p.z + 4 + i * 6));
          b.group.add(mesh(box(58, 0.35, 2.6), MAT.crop, p.x, by + 1.6, p.z + 4 + i * 6));
        }
        /* the 5,000 gallon reef tank, fully inside the envelope, with a real
           glazed viewing wall on the entry side */
        const rx = p.x - p.w / 2 + 10;
        b.group.add(mesh(box(9, 3.4, 14), MAT.precast, rx, by + 1.7, p.z + 4));
        const glassWall = new THREE.Mesh(new THREE.PlaneGeometry(13.4, 3.0), MAT.glass);
        glassWall.position.set(rx - 4.55, by + 1.9, p.z + 4);
        glassWall.rotation.y = -Math.PI / 2;
        b.group.add(glassWall);
        b.group.add(mesh(box(8.6, 2.6, 13.6), MAT.glassSimple, rx, by + 1.85, p.z + 4));
        return b.group;
      },
    });
    A('aquaponics', p.x, groundH(p.x, p.z) + 12, p.z);
  }

  /* --------- food hub */
  {
    const p = PLOTS.foodhub;
    place({
      id: 'foodhub', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 12,
      clearance: 1.2, parent: g, site: 'food hub',
      build: () => buildBuilding({
        id: 'foodhub', x: p.x, z: p.z, w: p.w, d: p.d, h: 9.5,
        entryFace: 'W', serviceFace: 'E', wall: 'panelWallW', accent: 'brick',
        glazing: 'curtain', docks: 2, entries: 1, signage: true,
        roof: { pv: true, plant: true, rtu: 2, parapet: 1.0 },
      }).group,
    });
    A('foodhub', p.x, groundH(p.x, p.z) + 10, p.z);
  }

  /* --------- ponds, channel, and the treatment train */
  {
    const pondMat = makeWaterMaterial({
      kind: 'pond', components: 3, amplitude: 0.05, baseLength: 9,
      shallow: 0x3f6a52, deep: 0x16303a, opacity: 0.86,
    });
    const grp = new THREE.Group();
    grp.name = 'ponds';
    for (const p of PONDS) grp.add(pondSurface(p, pondMat));
    /* connecting channels with cobble weirs */
    for (let i = 0; i < PONDS.length - 1; i++) {
      const a = PONDS[i], b = PONDS[i + 1];
      const n = 10;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = lerp(a.x + 4, b.x - 4, t), z = lerp(a.z + a.r, b.z - b.r, t);
        grp.add(mesh(cyl(1.5, 1.9, 0.5, 10), MAT.gravel, x, groundH(x, z) + 0.1, z, { cast: false }));
      }
    }
    place({
      id: 'ponds', layer: LAYER.WATER,
      footprint: { poly: [[286, -338], [374, -338], [374, -56], [286, -56]] },
      y0: 14, y1: 17.2, parent: g, site: 'constructed wetland ponds',
      /* NOT a blanket VEGETATION allowance: that let the campus canopy
         scatter stand trees in open water. Bank species declare their own
         water overlap; everything else is rejected. */
      groups: ['water'], allowOverlapWith: ['walk', 'water'],
      tags: ['no-geom-audit'],
      build: () => grp,
    });
    A('ponds', 320, groundH(320, -200) + 4, -200);
  }

  /* --------- agrivoltaics: the pins in v3 pointed at empty grass */
  {
    const ax = PLOTS.agri.x, az = PLOTS.agri.z, aw = PLOTS.agri.w, ad = PLOTS.agri.d;
    place({
      id: 'agrivoltaics', layer: LAYER.CANOPY,
      footprint: { x: ax, z: az, w: aw, d: ad },
      y0: groundH(ax, az) + 1.4, y1: groundH(ax, az) + 5.2,
      clearance: 6.0,
      parent: g, site: 'agrivoltaic array',
      groups: ['agri'], allowOverlapWith: ['VEGETATION'],
      build: () => {
        const grp = new THREE.Group();
        /* Single-axis tracker rows, the way a real agrivoltaic array is
           built: a torque tube runs the length of each row on posts at
           ~7 m spacing, and short panel modules tilt ABOUT the tube. The
           old version hung 8.6 m panels every 4.25 m (they interpenetrated)
           and gave two thirds of them no post at all, so the array read as
           slabs floating over the pasture. Every module now sits on the
           tube and every tube sits on posts that reach the ground. */
        const panels = [], posts = [], tubes = [];
        const rows = 12;
        const tilt = -22 * DEG;
        const hubH = 3.2;                      /* tube height over ground   */
        const rowLen = ad - 14;
        const z0 = az - rowLen / 2;
        for (let i = 0; i < rows; i++) {
          const px = ax - aw / 2 + 5 + i * ((aw - 10) / (rows - 1));
          /* posts, then one tube segment between each post pair */
          const nPost = Math.ceil(rowLen / 7) + 1;
          for (let k = 0; k < nPost; k++) {
            const pz = z0 + (k / (nPost - 1)) * rowLen;
            const py = groundH(px, pz);
            posts.push({ x: px, y: py + hubH / 2, z: pz, sy: hubH / 3.5 });
          }
          /* modules every 4.2 m, 4.0 m long, tilted about the row axis */
          const nMod = Math.floor(rowLen / 4.2);
          for (let k = 0; k < nMod; k++) {
            const pz = z0 + 2.1 + k * 4.2;
            const by = groundH(px, pz);
            panels.push({ x: px, y: by + hubH + 0.12, z: pz, rz: tilt, s: 1 });
            tubes.push({ x: px, y: by + hubH, z: pz, rx: Math.PI / 2, s: 1 });
          }
        }
        grp.add(instanced(new THREE.BoxGeometry(3.4, 0.06, 4.0), MAT.pv, panels,
          { cast: true, receive: false }));
        grp.add(instanced(new THREE.CylinderGeometry(0.07, 0.07, 4.2, 6), MAT.galv, tubes,
          { cast: false, receive: false }));
        grp.add(instanced(new THREE.CylinderGeometry(0.09, 0.11, 3.5, 8), MAT.galv, posts));
        return grp;
      },
    });
    A('agrivoltaics', ax, groundH(ax, az) + 5, az);
  }

  return out;
}

/* ---------------------------------------------------------------- greenhouse */
function greenhouse(p, i) {
  const grp = new THREE.Group();
  const by = groundH(p.x, p.z);
  const hw = p.w / 2, hd = p.d / 2;
  const eave = 4.6, ridge = 8.0;
  const slopeRun = hd, slopeRise = ridge - eave;
  const slopeAng = Math.atan2(slopeRise, slopeRun);          /* about 31 deg */
  const slopeLen = Math.hypot(slopeRun, slopeRise);

  /* pad and knee wall */
  grp.add(decal(p.w + 3, p.d + 3, p.x, p.z, MAT.concretePad, 'pavementEdge'));
  grp.add(mesh(box(p.w + 0.4, 0.9, p.d + 0.4), MAT.precast, p.x, by + 0.45, p.z));

  /* glazed side walls */
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(p.w, eave - 0.9), MAT.ghGlazing);
    wall.position.set(p.x, by + 0.9 + (eave - 0.9) / 2, p.z + s * hd);
    grp.add(wall);
  }
  for (const s of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(p.d, eave - 0.9), MAT.ghGlazing);
    wall.position.set(p.x + s * hw, by + 0.9 + (eave - 0.9) / 2, p.z);
    wall.rotation.y = Math.PI / 2;
    grp.add(wall);
  }
  /* gable ends */
  for (const s of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(-hd, 0); shape.lineTo(hd, 0); shape.lineTo(0, slopeRise); shape.lineTo(-hd, 0);
    const gg = new THREE.ShapeGeometry(shape);
    const gm = new THREE.Mesh(gg, MAT.ghGlazing);
    gm.position.set(p.x + s * hw, by + eave, p.z);
    gm.rotation.y = Math.PI / 2;
    grp.add(gm);
  }

  /* glazed roof slopes at the true 31 degrees, meeting the eave with no gap */
  for (const s of [-1, 1]) {
    const g2 = new THREE.PlaneGeometry(p.w, slopeLen);
    const m = new THREE.Mesh(g2, MAT.ghGlazing);
    m.rotation.order = 'YXZ';
    m.rotation.x = -Math.PI / 2 + s * slopeAng;
    m.position.set(p.x, by + eave + slopeRise / 2, p.z + s * hd / 2);
    grp.add(m);
  }

  /* rafters, running up the slope in the plane of the glazing */
  const nR = Math.round(p.w / 3.2);
  for (let k = 0; k <= nR; k++) {
    const rx = p.x - hw + (k / nR) * p.w;
    for (const s of [-1, 1]) {
      const raf = mesh(box(0.10, 0.20, slopeLen), MAT.alu,
        rx, by + eave + slopeRise / 2, p.z + s * hd / 2);
      raf.rotation.x = s * slopeAng;
      grp.add(raf);
    }
    grp.add(mesh(box(0.14, eave, 0.14), MAT.alu, rx, by + eave / 2, p.z - hd));
    grp.add(mesh(box(0.14, eave, 0.14), MAT.alu, rx, by + eave / 2, p.z + hd));
    /* an internal column line so the span reads structurally */
    if (k % 3 === 0) grp.add(mesh(box(0.16, eave + slopeRise * 0.4, 0.16), MAT.alu,
      rx, by + (eave + slopeRise * 0.4) / 2, p.z));
  }
  /* ridge beam and a continuous ridge vent lying flat along the ridge */
  grp.add(mesh(box(p.w, 0.22, 0.26), MAT.alu, p.x, by + ridge, p.z));
  const vent = mesh(box(p.w - 2, 0.10, 1.15), MAT.ghGlazing, p.x, by + ridge + 0.42, p.z + 0.55);
  vent.rotation.x = -0.34;
  grp.add(vent);
  grp.add(mesh(box(p.w, 0.16, 0.16), MAT.alu, p.x, by + eave, p.z - hd));
  grp.add(mesh(box(p.w, 0.16, 0.16), MAT.alu, p.x, by + eave, p.z + hd));

  /* the real interior. v3 modelled benches, crops and grow lights and then hid
     all of them inside an opaque block that also protruded 2 m above the eave. */
  const rows = 5;
  for (let k = 0; k < rows; k++) {
    const rz = p.z - hd + 4 + k * ((p.d - 8) / (rows - 1));
    grp.add(mesh(box(p.w - 6, 0.10, 1.9), MAT.alu, p.x, by + 0.85, rz));
    for (let q = 0; q < 10; q++) {
      grp.add(mesh(box(0.06, 0.85, 0.06), MAT.alu, p.x - (p.w - 8) / 2 + q * ((p.w - 8) / 9), by + 0.42, rz));
    }
    const crops = [];
    for (let q = 0; q < 44; q++) {
      crops.push({ x: p.x - (p.w - 8) / 2 + (q / 43) * (p.w - 8),
                   y: by + 1.16, z: rz + (Math.random() - 0.5) * 1.2,
                   ry: Math.random() * 6.28, s: 0.7 + Math.random() * 0.5 });
    }
    grp.add(instanced(new THREE.PlaneGeometry(0.8, 0.55), MAT.crop, crops,
      { cast: false, receive: false }));
    /* LED grow bars */
    grp.add(mesh(box(p.w - 7, 0.09, 0.14), MAT.emitCool, p.x, by + 3.3, rz));
  }
  /* headhouse on the entry side */
  const hx = p.x - hw - 5.4;
  grp.add(mesh(box(9, 4.2, p.d * 0.55), MAT.panelWallW, hx, by + 2.1, p.z));
  grp.add(mesh(box(9.6, 0.3, p.d * 0.55 + 0.6), MAT.roofSeam, hx, by + 4.35, p.z));
  const door = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.4), MAT.glass);
  door.position.set(hx - 4.55, by + 1.2, p.z);
  door.rotation.y = -Math.PI / 2;
  grp.add(door);
  return grp;
}
