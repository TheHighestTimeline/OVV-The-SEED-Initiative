/* ============================================================================
   13-coast.js — watershed corridor, estuary, dune, beach, ocean, heritage
   ----------------------------------------------------------------------------
   Bennettsville sits in the Yadkin-Pee Dee basin and the Great Pee Dee runs
   southeast into Winyah Bay and the Atlantic. This zone builds that continuum
   as one walkable ribbon: campus stormwater -> bioswale -> creek -> river ->
   estuary -> beach -> ocean, with an honest in-world scale marker.

   The heritage promenade is the point of the whole zone: the cleanups did not
   start when the campus broke ground and do not stop because it was built.
   ========================================================================== */

import * as THREE from 'three';
import { SITE, ELEV, LAYER, DEG, clamp, lerp, smoothstep, stream } from './00-config.js';
import { groundH, siteH, CREEK, INLET, inletCentre } from './01-terrain.js';
import { MAT } from './03-materials.js';
import { place, placeContainer } from './02-registry.js';
import { mesh, box, cyl, decal, instanced } from './geom.js';
import { makeWaterMaterial, waterPlane, creekSurface, updateWaters } from './water.js';

const r = stream('coast');

/* --------------------------------------------------------------------------
   TODO_FACT — the heritage markers below need real data from OVMG: which
   cleanups, what years, where, roughly how many volunteers, roughly how much
   material recovered. The geometry and layout are built; the copy carries
   visible TODO_FACT placeholders rather than invented numbers, because the
   OneVibeEarth claim rule is that no figure appears in a public asset without
   measured data behind it.
   -------------------------------------------------------------------------- */
export const HERITAGE = [
  { id: 'h1', z: 1252, title: 'Cleanup — TODO_FACT: location',
    year: 'TODO_FACT', volunteers: 'TODO_FACT', recovered: 'TODO_FACT' },
  { id: 'h2', z: 1264, title: 'Cleanup — TODO_FACT: location',
    year: 'TODO_FACT', volunteers: 'TODO_FACT', recovered: 'TODO_FACT' },
  { id: 'h3', z: 1276, title: 'Cleanup — TODO_FACT: location',
    year: 'TODO_FACT', volunteers: 'TODO_FACT', recovered: 'TODO_FACT' },
  { id: 'h4', z: 1288, title: 'Cleanup — TODO_FACT: location',
    year: 'TODO_FACT', volunteers: 'TODO_FACT', recovered: 'TODO_FACT' },
  { id: 'h5', z: 1300, title: 'next one', year: '', volunteers: '', recovered: '', blank: true },
];

export const THEN_NOW = [
  { id: 'tn1', then: 'Volunteer cleanup crews', now: 'Trades and vocational academy', link: 'k1' },
  { id: 'tn2', then: 'Festival waste diversion', now: 'Waste to energy plant', link: 'e5' },
  { id: 'tn3', then: 'Carbon Sponge', now: 'Carbon capture and biochar', link: 'c1' },
];

export function buildCoast(world, roads, walks, pipeline) {
  const g = new THREE.Group();
  g.name = 'coast';
  world.add(g);
  const out = { group: g, anchors: {}, animated: [] };
  const A = (id, x, y, z) => { out.anchors[id] = [x, y, z]; };

  /* ======================================================= water surfaces */
  const oceanMat = makeWaterMaterial({
    kind: 'ocean', components: pipeline.tier.waveComponents,
    amplitude: 0.62, baseLength: 88, windDir: -1.45, spread: 1.1,
    shallow: 0x2e8478, deep: 0x06263f, surfZ: SITE.swashZ, level: SITE.tideLevel,
  });
  const estuaryMat = makeWaterMaterial({
    kind: 'estuary', components: 3, amplitude: 0.10, baseLength: 16,
    shallow: 0x4a6b56, deep: 0x1d3a3a, opacity: 0.90, level: SITE.tideLevel,
  });
  const creekMat = makeWaterMaterial({
    kind: 'creek', components: 3, amplitude: 0.045, baseLength: 7,
    shallow: 0x476b58, deep: 0x22403c, opacity: 0.88,
  });

  placeContainer({
    id: 'ocean', layer: LAYER.WATER,
    footprint: { poly: [[-1500, SITE.swashZ - 40], [1500, SITE.swashZ - 40],
                        [1500, SITE.oceanEndZ], [-1500, SITE.oceanEndZ]] },
    y0: -60, y1: SITE.tideLevel + 2.4, parent: g, site: 'the Atlantic',
    groups: ['water'], allowOverlapWith: ['walk', 'water', 'PROP', 'STRUCTURE', 'VEGETATION'],
    tags: ['no-geom-audit'],
    build: () => waterPlane(-1500, 1500, SITE.swashZ - 40, SITE.oceanEndZ,
      SITE.tideLevel, oceanMat, pipeline.tier.name === 'Mobile' ? 26 : 11),
  });
  A('ocean', 240, 4, 1700);

  placeContainer({
    id: 'estuary-water', layer: LAYER.WATER,
    footprint: { poly: [[-520, SITE.estuaryStartZ - 20], [560, SITE.estuaryStartZ - 20],
                        [560, SITE.duneStartZ + 40], [-520, SITE.duneStartZ + 40]] },
    y0: -8, y1: SITE.tideLevel + 0.6, parent: g, site: 'tidal estuary',
    groups: ['water'], allowOverlapWith: ['walk', 'water', 'PROP', 'STRUCTURE', 'VEGETATION'],
    tags: ['no-geom-audit'],
    build: () => waterPlane(-520, 560, SITE.estuaryStartZ - 20, SITE.duneStartZ + 40,
      SITE.tideLevel, estuaryMat, 9),
  });

  placeContainer({
    id: 'creek-water', layer: LAYER.WATER,
    footprint: { poly: creekBand() },
    y0: -2, y1: 17, parent: g, site: 'the creek',
    groups: ['water'], allowOverlapWith: ['walk', 'water', 'PROP', 'STRUCTURE', 'VEGETATION'],
    tags: ['no-geom-audit'],
    build: () => creekSurface(CREEK, creekMat),
  });

  /* the tidal inlet water, cutting the dune */
  placeContainer({
    id: 'inlet-water', layer: LAYER.WATER,
    footprint: { poly: [[INLET.x - 120, INLET.z0], [INLET.x + 90, INLET.z0],
                        [INLET.x + 130, INLET.z1], [INLET.x - 90, INLET.z1]] },
    y0: -6, y1: SITE.tideLevel + 0.4, parent: g, site: 'tidal inlet',
    groups: ['water'], allowOverlapWith: ['walk', 'water', 'PROP', 'STRUCTURE', 'VEGETATION'],
    tags: ['no-geom-audit'],
    build: () => waterPlane(INLET.x - 130, INLET.x + 140, INLET.z0, INLET.z1,
      SITE.tideLevel, estuaryMat, 8),
  });

  /* ============================================ PHASE 11: watershed corridor */

  /* check dams and riffle-pool sequence along the creek */
  placeContainer({
    id: 'creek-works', layer: LAYER.PROP,
    footprint: { poly: creekBand(14) },
    y0: -2, y1: 18, parent: g, site: 'creek check dams and riparian works',
    allowOverlapWith: ['walk', 'water', 'VEGETATION'],
    tags: ['no-geom-audit'],
    build: () => {
      const grp = new THREE.Group();
      for (let i = 4; i < CREEK.length - 6; i += 5) {
        const n = CREEK[i], m = CREEK[i + 1];
        let tx = m.x - n.x, tz = m.z - n.z;
        const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
        const nx = -tz, nz = tx;
        const half = n.w / 2 + 2.5;
        const cobbles = [];
        for (let k = 0; k < 26; k++) {
          const t = (k / 25 - 0.5) * half * 2;
          const px = n.x + nx * t + (r() - 0.5) * 0.7;
          const pz = n.z + nz * t + (r() - 0.5) * 0.7;
          cobbles.push({ x: px, y: groundH(px, pz) + 0.22, z: pz, ry: r() * 6.28,
                         s: 0.55 + r() * 0.55 });
        }
        grp.add(instanced(new THREE.DodecahedronGeometry(0.48, 0), MAT.gravel, cobbles));
        /* woody debris and a gravel bar on alternating bends */
        if (i % 15 === 4) {
          const px = n.x + nx * (half * 0.7), pz = n.z + nz * (half * 0.7);
          grp.add(mesh(cyl(0.22, 0.3, 6.5, 8), MAT.deck, px, groundH(px, pz) + 0.35, pz,
            { rotZ: Math.PI / 2, rotY: r() * 3 }));
        }
      }
      return grp;
    },
  });

  /* water quality monitoring station with a live display board (a2 / s2) */
  {
    const wx = 126, wz = 832;
    place({
      id: 'water-quality', layer: LAYER.STRUCTURE,
      footprint: { x: wx, z: wz, w: 6, d: 5 },
      y0: groundH(wx, wz) - 1, y1: groundH(wx, wz) + 6,
      parent: g, site: 'water quality monitoring station',
      build: () => {
        const grp = new THREE.Group();
        const y = groundH(wx, wz);
        grp.add(decal(9, 8, wx, wz, MAT.concretePad, 'pavementEdge'));
        grp.add(mesh(box(2.6, 2.4, 2.0), MAT.panelWallW, wx, y + 1.2, wz));
        grp.add(mesh(box(3.0, 0.18, 2.4), MAT.roofSeam, wx, y + 2.45, wz));
        grp.add(mesh(box(2.2, 0.05, 1.5), MAT.pv, wx, y + 2.6, wz));
        /* the public dashboard board */
        for (const s of [-1, 1]) {
          grp.add(mesh(cyl(0.07, 0.07, 2.6, 8), MAT.galv, wx + s * 1.5, y + 1.3, wz + 3.4));
        }
        grp.add(mesh(box(3.4, 1.9, 0.10), MAT.steelDark, wx, y + 2.0, wz + 3.4));
        grp.add(mesh(box(3.1, 1.6, 0.03), MAT.emitCool, wx, y + 2.0, wz + 3.46));
        /* the sonde on its stilling well, in the creek */
        grp.add(mesh(cyl(0.12, 0.12, 4.2, 10), MAT.galv, wx - 12, y - 0.8, wz + 2));
        grp.add(mesh(box(0.3, 0.5, 0.3), MAT.steel, wx - 12, y + 1.4, wz + 2));
        return grp;
      },
    });
    A('water-quality', wx, groundH(wx, wz) + 5, wz);
  }

  /* the overlook deck and the honest scale marker */
  {
    const ox = 150, oz = 900;
    place({
      id: 'creek-overlook', layer: LAYER.WALK,
      footprint: { x: ox, z: oz, w: 12, d: 9 },
      y0: groundH(ox, oz) - 1, y1: groundH(ox, oz) + 3,
      parent: g, site: 'creek overlook deck',
      allowOverlapWith: ['walk', 'water'],
      build: () => {
        const grp = new THREE.Group();
        const y = Math.max(groundH(ox, oz), SITE.tideLevel + 1.2) + 1.1;
        grp.add(mesh(box(11, 0.16, 8), MAT.deck, ox, y, oz));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          const px = ox + sx * 4.8, pz = oz + sz * 3.4;
          const gh = groundH(px, pz);
          grp.add(mesh(cyl(0.13, 0.15, y - gh + 1.2, 8), MAT.deck, px, (y + gh) / 2 - 0.3, pz));
        }
        for (let i = 0; i <= 10; i++) {
          const px = ox - 5.5 + i * 1.1;
          grp.add(mesh(box(0.09, 1.05, 0.09), MAT.deck, px, y + 0.6, oz + 4));
        }
        grp.add(mesh(box(11, 0.09, 0.09), MAT.deck, ox, y + 1.1, oz + 4));
        grp.add(interpSign(ox + 4, y + 0.05, oz - 2, 0.6,
          'Great Pee Dee River — 150 mi to the Atlantic. Shown compressed.'));
        return grp;
      },
    });
    A('watershed', 150, groundH(150, 900) + 6, 900);
  }

  /* interpretive trail signage: three riparian planting bands */
  {
    const bands = [
      [70, 600, 'Emergent zone'], [104, 700, 'Shrub zone'], [56, 790, 'Canopy zone'],
    ];
    bands.forEach(([sx, sz, label], i) => {
      place({
        id: 'riparian-sign-' + i, layer: LAYER.PROP,
        footprint: { x: sx, z: sz, w: 2.2, d: 0.6 },
        y0: groundH(sx, sz) - 0.2, y1: groundH(sx, sz) + 2.0,
        parent: g, site: 'riparian interpretive sign',
        allowOverlapWith: ['walk', 'VEGETATION'],
        build: () => interpSign(sx, groundH(sx, sz), sz, 0.0, label),
      });
    });
  }

  /* ============================================== PHASE 12.1: the estuary */
  placeContainer({
    id: 'oyster-reefs', layer: LAYER.PROP,
    footprint: { poly: [[-360, 940], [420, 940], [420, 1180], [-360, 1180]] },
    y0: -3, y1: SITE.tideLevel + 1.2, parent: g, site: 'oyster reef beds',
    allowOverlapWith: ['water', 'walk', 'VEGETATION'],
    tags: ['no-geom-audit'],
    build: () => {
      const grp = new THREE.Group();
      const bags = [];
      for (let i = 0; i < 620; i++) {
        const x = -340 + r() * 740, z = 960 + r() * 200;
        const gy = siteH(x, z);
        if (gy > SITE.tideLevel + 0.35 || gy < -1.6) continue;
        bags.push({ x, y: gy + 0.16, z, ry: r() * 6.28, s: 0.6 + r() * 0.8 });
      }
      grp.add(instanced(new THREE.DodecahedronGeometry(0.55, 0), MAT.shell, bags,
        { cast: true, receive: true }));
      return grp;
    },
  });

  /* living shoreline: oyster-bag sills, marsh-grass plugs, coir logs.
     No bulkhead and no riprap; that is the point. */
  placeContainer({
    id: 'living-shoreline', layer: LAYER.PROP,
    footprint: { poly: [[-300, 1120], [400, 1120], [400, 1206], [-300, 1206]] },
    y0: -2, y1: SITE.tideLevel + 1.4, parent: g, site: 'living shoreline',
    allowOverlapWith: ['water', 'walk', 'VEGETATION'],
    tags: ['no-geom-audit'],
    build: () => {
      const grp = new THREE.Group();
      const sills = [], logs = [];
      for (let x = -280; x < 400; x += 3.2) {
        const z = 1158 + Math.sin(x * 0.011) * 9;
        const gy = siteH(x, z);
        if (gy > SITE.tideLevel + 0.8) continue;
        sills.push({ x, y: gy + 0.3, z, ry: r() * 0.4, s: 1 });
        if (Math.floor(x) % 14 === 0) logs.push({ x, y: gy + 0.34, z: z - 5.5, rz: Math.PI / 2, s: 1 });
      }
      grp.add(instanced(new THREE.BoxGeometry(3.0, 0.65, 1.4), MAT.shell, sills));
      grp.add(instanced(new THREE.CylinderGeometry(0.34, 0.34, 3.6, 8), MAT.mulch, logs));
      return grp;
    },
  });

  /* research and monitoring dock on piles */
  {
    const dx = -92, dz = 1052;
    place({
      id: 'estuary-dock', layer: LAYER.STRUCTURE,
      footprint: { x: dx, z: dz, w: 16, d: 10 },
      y0: -3, y1: SITE.tideLevel + 4.5, parent: g, site: 'estuary research dock',
      allowOverlapWith: ['water', 'walk'],
      build: () => {
        const grp = new THREE.Group();
        const y = SITE.tideLevel + 1.5;
        grp.add(mesh(box(15, 0.16, 9), MAT.deck, dx, y, dz));
        for (let i = 0; i < 8; i++) {
          const px = dx - 6.5 + (i % 4) * 4.3, pz = dz - 3.5 + Math.floor(i / 4) * 7;
          const gy = siteH(px, pz);
          grp.add(mesh(cyl(0.16, 0.18, y - gy + 1.6, 8), MAT.deck, px, (y + gy) / 2 - 0.3, pz));
        }
        for (let i = 0; i <= 14; i++) {
          grp.add(mesh(box(0.09, 1.05, 0.09), MAT.deck, dx - 7 + i, y + 0.6, dz + 4.5));
        }
        grp.add(mesh(box(15, 0.09, 0.09), MAT.deck, dx, y + 1.1, dz + 4.5));
        grp.add(mesh(box(3.2, 2.6, 2.6), MAT.panelWallW, dx + 4.5, y + 1.4, dz));
        grp.add(mesh(box(3.6, 0.16, 3.0), MAT.roofSeam, dx + 4.5, y + 2.78, dz));
        grp.add(mesh(box(2.6, 0.05, 1.7), MAT.pv, dx + 4.5, y + 2.9, dz));
        return grp;
      },
    });
    A('estuary', dx, SITE.tideLevel + 6, dz);
  }

  /* monitoring buoys on a line, matching the a2 and s2 sensor network */
  placeContainer({
    id: 'buoy-line', layer: LAYER.PROP,
    footprint: { poly: [[-60, 1420], [520, 1420], [520, 1900], [-60, 1900]] },
    y0: -4, y1: SITE.tideLevel + 3.4, parent: g, site: 'monitoring buoy line',
    allowOverlapWith: ['water'], tags: ['no-geom-audit'],
    build: () => {
      const grp = new THREE.Group();
      for (let i = 0; i < 7; i++) {
        const bx = 20 + i * 78, bz = 1470 + i * 62;
        const bg = new THREE.Group();
        bg.position.set(bx, SITE.tideLevel, bz);
        bg.add(mesh(cyl(0.6, 0.75, 1.5, 12), MAT.markYellow, 0, 0.25, 0));
        bg.add(mesh(cyl(0.09, 0.09, 2.4, 8), MAT.galv, 0, 1.8, 0));
        bg.add(mesh(box(0.5, 0.05, 0.34), MAT.pv, 0, 2.9, 0));
        bg.add(mesh(cyl(0.11, 0.11, 0.12, 8), MAT.emitAmber, 0, 3.05, 0));
        bg.userData.bob = { phase: i * 0.9, base: SITE.tideLevel };
        bg.userData.noMerge = true;   /* it bobs — merging bakes it static */
        out.animated.push(bg);
        grp.add(bg);
      }
      return grp;
    },
  });

  /* ========================================== PHASE 12.2: dune and beach */

  /* sand fence along the dune toe, in staggered runs with real blowout gaps */
  placeContainer({
    id: 'sand-fence', layer: LAYER.PROP,
    footprint: { poly: [[-1400, SITE.duneStartZ - 6], [1400, SITE.duneStartZ - 6],
                        [1400, SITE.duneEndZ + 6], [-1400, SITE.duneEndZ + 6]] },
    y0: -1, y1: 14, parent: g, site: 'dune sand fence',
    allowOverlapWith: ['walk', 'water', 'VEGETATION'], tags: ['no-geom-audit'],
    build: () => {
      const grp = new THREE.Group();
      const slats = [], posts = [];
      for (let x = -1300; x < 1300; x += 0.32) {
        if (Math.abs(x - inletCentre(1300)) < INLET.halfW + 40) continue;
        const run = Math.floor((x + 1300) / 62);
        if ((x + 1300) % 62 > 48) continue;               /* staggered gaps */
        const z = SITE.duneCrestZ + 26 + (run % 2) * 10 + Math.sin(x * 0.004) * 8;
        const gy = siteH(x, z);
        if (gy < 0.6) continue;
        slats.push({ x, y: gy + 0.55, z, ry: 0.02 * Math.sin(x), s: 1 });
        if (Math.abs(x % 2.4) < 0.32) posts.push({ x, y: gy + 0.7, z, s: 1 });
      }
      grp.add(instanced(new THREE.BoxGeometry(0.075, 1.1, 0.03), MAT.deck, slats,
        { cast: true, receive: false }));
      grp.add(instanced(new THREE.CylinderGeometry(0.05, 0.06, 1.5, 6), MAT.deck, posts));
      return grp;
    },
  });

  /* wrack line: shell hash, seaweed and driftwood, with a deliberately
     uncleaned stretch and a cleaned stretch so the before/after is legible */
  placeContainer({
    id: 'wrack-line', layer: LAYER.PROP,
    footprint: { poly: [[-1400, SITE.wrackZ - 14], [1400, SITE.wrackZ - 14],
                        [1400, SITE.wrackZ + 16], [-1400, SITE.wrackZ + 16]] },
    y0: -1, y1: 3, parent: g, site: 'wrack line',
    allowOverlapWith: ['walk', 'water', 'VEGETATION'], tags: ['no-geom-audit'],
    build: () => {
      const grp = new THREE.Group();
      const shell = [], weed = [], wood = [], debris = [];
      for (let i = 0; i < 2600; i++) {
        const x = -1300 + r() * 2600;
        const z = SITE.wrackZ + (r() - 0.5) * 11 + Math.sin(x * 0.01) * 4;
        const gy = siteH(x, z);
        if (gy < 0.02 || gy > 1.5) continue;
        const t = r();
        if (t < 0.62) shell.push({ x, y: gy + 0.03, z, ry: r() * 6.28, s: 0.3 + r() * 0.5 });
        else if (t < 0.94) weed.push({ x, y: gy + 0.04, z, ry: r() * 6.28, s: 0.5 + r() * 0.9 });
        else wood.push({ x, y: gy + 0.14, z, ry: r() * 6.28, rz: Math.PI / 2, s: 0.6 + r() * 1.4 });
      }
      grp.add(instanced(new THREE.DodecahedronGeometry(0.10, 0), MAT.shell, shell, { cast: false }));
      grp.add(instanced(new THREE.PlaneGeometry(0.55, 0.28), MAT.marsh, weed,
        { cast: false, receive: true }));
      grp.add(instanced(new THREE.CylinderGeometry(0.09, 0.11, 1.5, 6), MAT.deck, wood));

      /* the untreated stretch, west of the crossover: debris still present */
      for (let i = 0; i < 220; i++) {
        const x = -900 + r() * 620;
        const z = SITE.wrackZ + (r() - 0.5) * 13;
        const gy = siteH(x, z);
        if (gy < 0.05 || gy > 1.5) continue;
        debris.push({ x, y: gy + 0.08, z, ry: r() * 6.28, rz: r() * 1.2,
                      s: 0.25 + r() * 0.55 });
      }
      grp.add(instanced(new THREE.BoxGeometry(0.34, 0.18, 0.22), MAT.rubber, debris,
        { cast: true }));
      /* the cleaned stretch is simply empty of debris; a sign explains it */
      grp.add(interpSign(-260, siteH(-260, SITE.wrackZ - 16), SITE.wrackZ - 16, 0,
        'Cleaned stretch. Everything east of this marker was cleared by hand.'));
      grp.add(interpSign(-640, siteH(-640, SITE.wrackZ - 16), SITE.wrackZ - 16, 0,
        'Untreated stretch, left as found. TODO_FACT: last survey date.'));
      return grp;
    },
  });

  /* beach access: rinse station, bins, and the parking bay off the shore road */
  {
    const bx = 620, bz = 1250;
    place({
      id: 'beach-parking', layer: LAYER.ROAD,
      footprint: { x: bx, z: bz, w: 76, d: 42 },
      y0: groundH(bx, bz) - 0.4, y1: groundH(bx, bz) + 4,
      parent: g, site: 'beach access parking',
      groups: ['road', 'lot'], allowOverlapWith: ['road', 'apron', 'lot', 'walk'],
      build: () => {
        const grp = new THREE.Group();
        const y = groundH(bx, bz);
        grp.add(decal(76, 42, bx, bz, MAT.gravel, 'aggregate'));
        for (let i = 0; i < 20; i++) {
          const sx = bx - 34 + (i % 10) * 7.0;
          const sz = bz - 10 + Math.floor(i / 10) * 20;
          grp.add(mesh(box(0.1, 0.01, 5.2), MAT.markWhite, sx, groundH(sx, sz) + ELEV.roadMarking, sz,
            { cast: false, receive: false }));
        }
        /* rinse station and bins */
        grp.add(mesh(box(1.4, 0.2, 1.4), MAT.concretePad, bx + 32, y + 0.1, bz - 16));
        grp.add(mesh(cyl(0.06, 0.06, 2.2, 8), MAT.galv, bx + 32, y + 1.1, bz - 16));
        grp.add(mesh(cyl(0.09, 0.09, 0.5, 8), MAT.galv, bx + 32, y + 2.1, bz - 15.7, { rotX: 1.0 }));
        for (let i = 0; i < 3; i++) {
          grp.add(mesh(cyl(0.42, 0.38, 1.0, 12), MAT.steelDark, bx + 28 + i * 1.4, y + 0.5, bz - 18.5));
        }
        return grp;
      },
    });
  }

  /* ================================================== PHASE 12.4: the fleet */
  {
    const fleet = new THREE.Group();
    fleet.name = 'cleanup-fleet';
    /* skimmer vessel with an active collection boom, on a slow loop */
    const skim = vessel(18, 6.4, MAT.panelWallW, true);
    skim.userData.route = { cx: 200, cz: 1900, rx: 320, rz: 210, speed: 0.021, phase: 0 };
    fleet.add(skim);
    out.animated.push(skim);
    for (let i = 0; i < 2; i++) {
      const rib = vessel(6.5, 2.4, MAT.markRed, false);
      rib.userData.route = { cx: 160, cz: 1760, rx: 190 + i * 70, rz: 120 + i * 40,
                             speed: 0.045 + i * 0.012, phase: i * 2.1 };
      fleet.add(rib);
      out.animated.push(rib);
    }
    const barge = vessel(24, 9, MAT.steelWeather ? 'weathering' : MAT.panelWallD, false);
    barge.userData.route = { cx: 40, cz: 1620, rx: 60, rz: 40, speed: 0.006, phase: 1.4 };
    fleet.add(barge);
    out.animated.push(barge);
    /* the debris boom arc */
    const boom = [];
    for (let i = 0; i <= 60; i++) {
      const a = -0.9 + (i / 60) * 1.8;
      boom.push({ x: 200 + Math.sin(a) * 260, y: SITE.tideLevel + 0.2,
                  z: 1780 + Math.cos(a) * 150, ry: -a, s: 1 });
    }
    fleet.add(instanced(new THREE.BoxGeometry(9, 0.5, 0.42), MAT.markYellow, boom,
      { cast: false, receive: false }));

    placeContainer({
      id: 'cleanup-fleet', layer: LAYER.PROP,
      footprint: { poly: [[-200, 1440], [620, 1440], [620, 2200], [-200, 2200]] },
      y0: SITE.tideLevel - 2, y1: SITE.tideLevel + 12,
      parent: g, site: 'ocean cleanup fleet',
      allowOverlapWith: ['water'], tags: ['no-geom-audit'],
      build: () => fleet,
    });
    A('fleet', 200, SITE.tideLevel + 8, 1800);
  }

  /* shore crew: figures with bags and grabbers, a sorting station and a
     weigh-in board with a running total */
  {
    const sx = -120, sz = SITE.wrackZ - 26;
    place({
      id: 'shore-crew', layer: LAYER.PROP,
      footprint: { x: sx, z: sz, w: 26, d: 16 },
      y0: siteH(sx, sz) - 0.5, y1: siteH(sx, sz) + 4,
      parent: g, site: 'shore cleanup crew and sorting station',
      allowOverlapWith: ['walk', 'VEGETATION'],
      build: () => {
        const grp = new THREE.Group();
        const y = siteH(sx, sz);
        /* pop-up sorting station */
        for (const ax of [-1, 1]) for (const az of [-1, 1]) {
          grp.add(mesh(cyl(0.05, 0.05, 2.4, 6), MAT.galv, sx + ax * 3, y + 1.2, sz + az * 3));
        }
        grp.add(mesh(box(6.6, 0.12, 6.6), MAT.canvas, sx, y + 2.5, sz));
        for (let i = 0; i < 4; i++) {
          grp.add(mesh(box(1.0, 0.9, 1.0), [MAT.markBlue, MAT.markYellow, MAT.markRed, MAT.steelDark][i],
            sx - 2.4 + i * 1.6, y + 0.45, sz + 1.6));
        }
        /* weigh-in board */
        for (const s of [-1, 1]) {
          grp.add(mesh(cyl(0.07, 0.07, 2.6, 8), MAT.galv, sx + 8 + s * 1.3, y + 1.3, sz - 3));
        }
        grp.add(mesh(box(3.2, 1.9, 0.10), MAT.steelDark, sx + 8, y + 2.0, sz - 3));
        grp.add(mesh(box(2.9, 1.6, 0.03), MAT.emitCool, sx + 8, y + 2.0, sz - 2.94));
        /* the crew */
        for (let i = 0; i < 7; i++) {
          const px = sx - 10 + r() * 26, pz = sz + 6 + r() * 18;
          grp.add(figure(px, siteH(px, pz), pz, r() * 6.28, r() > 0.5));
        }
        return grp;
      },
    });
  }

  /* ============================================ PHASE 13: heritage promenade */
  {
    const hx = 60;
    placeContainer({
      id: 'heritage-promenade', layer: LAYER.PROP,
      footprint: { poly: [[30, 1240], [200, 1240], [200, 1320], [30, 1320]] },
      y0: 0, y1: 14, parent: g, site: 'heritage promenade',
      allowOverlapWith: ['walk', 'VEGETATION', 'water'],
      tags: ['no-geom-audit'],
      build: () => {
        const grp = new THREE.Group();
        /* one marker per past cleanup, in chronological order, walking seaward */
        HERITAGE.forEach((h, i) => {
          const t = i / (HERITAGE.length - 1);
          const px = 44 + t * 82;
          const pz = h.z;
          const gy = siteH(px, pz);
          const mg = new THREE.Group();
          mg.add(mesh(box(1.1, 1.05, 0.42), MAT.precast, px, gy + 0.53, pz, { rotY: -0.5 }));
          const plate = mesh(box(0.86, 0.62, 0.05), h.blank ? MAT.steelDark : MAT.bronze,
            px + 0.16, gy + 0.86, pz + 0.14, { rotY: -0.5, rotX: -0.42 });
          mg.add(plate);
          mg.userData.heritage = h;
          grp.add(mg);
        });
        return grp;
      },
    });
    A('heritage', 90, 8, 1272);

    /* the recovered-material sculpture at the dune crest. This is the image
       people photograph. */
    const scx = 122, scz = 1292;
    place({
      id: 'recovered-sculpture', layer: LAYER.STRUCTURE,
      footprint: { x: scx, z: scz, r: 7 },
      y0: siteH(scx, scz) - 1, y1: siteH(scx, scz) + 13,
      parent: g, site: 'recovered-material sculpture',
      allowOverlapWith: ['walk'],
      build: () => {
        const grp = new THREE.Group();
        const y = siteH(scx, scz);
        grp.add(mesh(cyl(3.4, 3.8, 0.8, 20), MAT.concretePad, scx, y + 0.4, scz));
        /* an armature wound with recovered net, rope, plastic, buoys and metal */
        grp.add(mesh(cyl(0.32, 0.42, 11, 10), MAT.weathering, scx, y + 6.3, scz));
        const bits = [];
        const mats = [MAT.markYellow, MAT.markRed, MAT.markBlue, MAT.rubber, MAT.galv];
        for (let i = 0; i < 260; i++) {
          const t = r();
          const a = r() * Math.PI * 2;
          const rad = (0.7 + Math.sin(t * Math.PI) * 3.1) * (0.5 + r() * 0.6);
          bits.push({ x: scx + Math.cos(a) * rad, y: y + 1.1 + t * 10.2,
                      z: scz + Math.sin(a) * rad, ry: r() * 6.28, rz: r() * 6.28,
                      s: 0.22 + r() * 0.5, mat: Math.floor(r() * mats.length) });
        }
        for (let m = 0; m < mats.length; m++) {
          const sub = bits.filter((b) => b.mat === m);
          if (!sub.length) continue;
          grp.add(instanced(new THREE.TorusGeometry(0.42, 0.13, 5, 9), mats[m], sub));
        }
        /* net drapery */
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          const nm = mesh(new THREE.PlaneGeometry(3.6, 8.2), MAT.marsh,
            scx + Math.cos(a) * 2.2, y + 5.6, scz + Math.sin(a) * 2.2, { rotY: -a });
          nm.material = MAT.marsh;
          grp.add(nm);
        }
        /* lit at night, visible from the beach and the estuary overlook */
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI * 2 + 0.4;
          const lx = scx + Math.cos(a) * 4.4, lz = scz + Math.sin(a) * 4.4;
          grp.add(mesh(box(0.34, 0.18, 0.26), MAT.steelDark, lx, siteH(lx, lz) + 0.2, lz));
          grp.add(mesh(box(0.24, 0.06, 0.18), MAT.emitWarm, lx, siteH(lx, lz) + 0.30, lz));
        }
        grp.add(interpSign(scx + 5.5, y, scz + 4, 0.7,
          'Made from material taken out of the water. TODO_FACT: total mass and sources.'));
        return grp;
      },
    });
    A('sculpture', scx, siteH(scx, scz) + 12, scz);

    /* the three then/now pairs */
    THEN_NOW.forEach((tn, i) => {
      const px = 52 + i * 26, pz = 1226;
      place({
        id: 'then-now-' + i, layer: LAYER.PROP,
        footprint: { x: px, z: pz, w: 2.6, d: 0.8 },
        y0: siteH(px, pz) - 0.3, y1: siteH(px, pz) + 2.4,
        parent: g, site: 'then / now marker',
        allowOverlapWith: ['walk', 'VEGETATION'],
        build: () => {
          const grp = new THREE.Group();
          const y = siteH(px, pz);
          for (const s of [-1, 1]) {
            grp.add(mesh(cyl(0.055, 0.055, 2.0, 6), MAT.weathering, px + s * 1.0, y + 1.0, pz));
          }
          grp.add(mesh(box(2.4, 1.15, 0.06), MAT.steelDark, px, y + 1.5, pz, { rotX: -0.3 }));
          grp.add(mesh(box(1.05, 0.9, 0.02), MAT.bronze, px - 0.6, y + 1.52, pz + 0.05, { rotX: -0.3 }));
          grp.add(mesh(box(1.05, 0.9, 0.02), MAT.copper, px + 0.6, y + 1.52, pz + 0.05, { rotX: -0.3 }));
          grp.userData.thenNow = tn;
          return grp;
        },
      });
    });
  }

  /* per-frame animation for this zone */
  out.update = (t, dt) => {
    for (const o of out.animated) {
      if (o.userData.route) {
        const R2 = o.userData.route;
        const a = t * R2.speed + R2.phase;
        const x = R2.cx + Math.cos(a) * R2.rx;
        const z = R2.cz + Math.sin(a) * R2.rz;
        o.position.set(x, SITE.tideLevel + Math.sin(t * 0.8 + R2.phase) * 0.22, z);
        o.rotation.y = -a + Math.PI / 2;
        o.rotation.z = Math.sin(t * 0.9 + R2.phase) * 0.035;
      } else if (o.userData.bob) {
        o.position.y = o.userData.bob.base + Math.sin(t * 1.1 + o.userData.bob.phase) * 0.32;
        o.rotation.z = Math.sin(t * 0.9 + o.userData.bob.phase) * 0.07;
      }
    }
  };

  return out;
}

/* --------------------------------------------------------------- helpers */
function creekBand(extra) {
  const e = extra || 4;
  const a = [], b = [];
  for (let i = 0; i < CREEK.length; i += 3) {
    const n = CREEK[i];
    const m = CREEK[Math.min(CREEK.length - 1, i + 1)];
    let tx = m.x - n.x, tz = m.z - n.z;
    const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const half = n.w / 2 + e;
    a.push([n.x - (-tz) * half, n.z - tx * half]);
    b.push([n.x + (-tz) * half, n.z + tx * half]);
  }
  return a.concat(b.reverse());
}

function interpSign(x, y, z, rot, text) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    g.add(mesh(cyl(0.045, 0.045, 1.35, 6), MAT.weathering, x + s * 0.55, y + 0.68, z, { rotY: rot }));
  }
  const panel = mesh(box(1.45, 0.72, 0.05), MAT.signBrown, x, y + 1.14, z, { rotY: rot, rotX: -0.42 });
  panel.userData.interpText = text;
  g.add(panel);
  g.add(mesh(box(1.30, 0.60, 0.02), MAT.canvas, x + Math.sin(rot) * 0.03, y + 1.155, z + Math.cos(rot) * 0.03,
    { rotY: rot, rotX: -0.42 }));
  return g;
}

function vessel(len, beam, hullMat, boom) {
  const g = new THREE.Group();
  g.userData.noMerge = true;   /* every vessel sails a route — see car() */
  const m = typeof hullMat === 'string' ? MAT[hullMat] : hullMat;
  g.add(mesh(box(beam, 1.5, len), m, 0, 0.35, 0));
  g.add(mesh(box(beam * 0.9, 0.7, len * 0.94), MAT.deck, 0, 1.2, 0, { cast: false }));
  g.add(mesh(box(beam * 0.55, 1.9, len * 0.22), MAT.panelWallW, 0, 2.35, -len * 0.2));
  const bridge = new THREE.Mesh(new THREE.PlaneGeometry(beam * 0.5, 0.9), MAT.glassSimple);
  bridge.position.set(0, 2.75, -len * 0.2 - len * 0.11);
  g.add(bridge);
  g.add(mesh(cyl(0.06, 0.06, 2.4, 6), MAT.galv, 0, 4.4, -len * 0.2));
  g.add(mesh(cyl(0.09, 0.09, 0.12, 8), MAT.emitAmber, 0, 5.6, -len * 0.2));
  if (boom) {
    /* the collection boom: two arms and a floating skirt */
    for (const s of [-1, 1]) {
      g.add(mesh(box(0.28, 0.28, 14), MAT.steelDark, s * beam * 0.4, 1.4, len * 0.5 + 6,
        { rotY: s * 0.42 }));
      const seg = [];
      for (let i = 0; i < 12; i++) {
        seg.push({ x: s * (beam * 0.4 + i * 1.0), y: 0.25, z: len * 0.5 + 3 + i * 1.5, s: 1 });
      }
      g.add(instanced(new THREE.BoxGeometry(1.5, 0.42, 0.34), MAT.markYellow, seg, { cast: false }));
    }
    g.add(mesh(box(beam * 0.8, 1.4, 3.0), MAT.galv, 0, 1.9, len * 0.34));
  }
  return g;
}

function figure(x, y, z, rot, hiVis) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = rot;
  g.add(mesh(cyl(0.13, 0.15, 0.86, 8), MAT.steelDark, 0, 0.43, 0));
  g.add(mesh(box(0.42, 0.62, 0.24), hiVis ? MAT.markYellow : MAT.markBlue, 0, 1.2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.115, 10, 8), MAT.dirt, 0, 1.63, 0));
  g.add(mesh(cyl(0.04, 0.04, 0.6, 6), MAT.galv, 0.26, 1.1, 0.16, { rotZ: 0.3 }));
  g.add(mesh(box(0.28, 0.36, 0.18), MAT.canvas, -0.3, 0.9, 0.1));
  return g;
}
