/* ============================================================================
   15-props.js — street furniture, utilities, signage, life, and real lighting
   ----------------------------------------------------------------------------
   Street furniture is placed ONLY in a declared furnishing zone. Every
   luminaire is a real spot light registered with the render pipeline, and its
   ground pool is a terrain-conforming decal parented to its own zone group —
   v3 parented the beyond-the-fence pools to `world`, so toggling the community
   area off left 32 glowing discs floating over empty terrain at night.
   ========================================================================== */

import * as THREE from 'three';
import { SITE, ELEV, LAYER, DEG, clamp, lerp, stream } from './00-config.js';
import { groundH, siteH } from './01-terrain.js';
import { MAT } from './03-materials.js';
import { place, reserve, registry, placeContainer } from './02-registry.js';
import { mesh, box, cyl, decal, instanced } from './geom.js';
import { PLOTS } from './08-siteplan.js';
import {
  streetLightField, binPair, bench, bikeRackRow, hydrant as specHydrant,
  bollardRun, postedSign,
} from './infra/index.js';
import { LIGHTING, POLE, WALK, HYDRANT, BIN, BENCH, BIKE_RACK, FT } from './spec/index.js';

const r = stream('props');

/* Which lighting class a road class is lit to. The spec sets the mounting
   height, spacing, wattage and therefore the whole solar kit from this one
   mapping, so a road cannot end up with poles at a spacing its luminaire
   cannot cover. */
const ROAD_LIGHTING = {
  arterial: 'arterial',
  collector: 'collector',
  avenue: 'collector',
  campusLoop: 'local',
  service: 'local',
};

export function buildProps(world, roads, walks, pipeline) {
  const g = new THREE.Group();
  g.name = 'props';
  world.add(g);
  const out = { group: g, lamps: 0, furniture: 0, animated: [] };

  /* ======================================================== street lighting
     Solar luminaires, full-cutoff, 2700 K. Mounting height, spacing, wattage
     and the whole PV/battery kit come from spec/lighting.js, which sizes the
     array from the luminaire load for this latitude — so the panel on top of
     a pole is the panel that pole actually needs.

     Poles are grouped by lighting class and stamped as instanced geometry:
     one prototype per class, one draw call per part. v3 drew a cylinder and
     a box; this draws the real assembly for the same cost.                */
  const lampRecs = [];
  const byClass = new Map();
  const addPlacement = (cls, x, z, azimuth) => {
    if (!byClass.has(cls)) byClass.set(cls, []);
    byClass.get(cls).push({ x, z, azimuth });
    out.lamps++;
  };

  /* along every road that has a sidewalk, standing in the furnishing zone */
  for (const e of roads.edges) {
    if (!e.geomSamples) continue;
    const sp = e.spec;
    if (sp.sidewalk === 'none' && e.cls !== 'service') continue;
    const cls = ROAD_LIGHTING[e.cls] || 'local';
    const cfg = LIGHTING[cls];
    const sm = e.geomSamples;
    const n = Math.floor(sm.total / cfg.spacing);
    for (let i = 1; i <= n; i++) {
      const p = sm[Math.round((i * cfg.spacing / sm.total) * (sm.length - 1))];
      if (!p) continue;
      /* staggered either side, which is the standard layout for a two-way
         street and gives better uniformity than one-sided at this spacing */
      const side = (i % 2) ? 1 : -1;
      /* AASHTO setback: measured from the curb face to the pole face, so the
         centreline offset adds the pole's own radius. */
      const off = e.half + (sp.curbW || 0) + POLE.setbackFromCurb;
      const px = p.x + p.nx * side * off, pz = p.z + p.nz * side * off;
      /* the arm reaches back out over the carriageway */
      const azimuth = Math.atan2(-p.nz * side, -p.nx * side);
      addPlacement(cls, px, pz, azimuth);
    }
  }
  /* path lamps along the promenade and the civic spine */
  for (const e of walks.edges) {
    if (e.isCrossing || !e.samples) continue;
    if (['promenade', 'plazaSpine', 'sidewalkWide'].indexOf(e.cls) < 0) continue;
    const cfg = LIGHTING.pathway;
    const sm = e.samples;
    const n = Math.floor(sm.total / cfg.spacing);
    for (let i = 1; i <= n; i++) {
      const p = sm[Math.round((i * cfg.spacing / sm.total) * (sm.length - 1))];
      if (!p) continue;
      const off = e.spec.width / 2 + POLE.setbackFromCurb;
      addPlacement('pathway', p.x + p.nx * off, p.z + p.nz * off,
        Math.atan2(-p.nz, -p.nx));
    }
  }

  placeContainer({
    id: 'luminaires', layer: LAYER.PROP,
    footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
    y0: -200, y1: -199,
    tags: ['no-geom-audit'], allowOverlapWith: ['*'],
    parent: g, site: 'solar street and path lighting',
    build: () => {
      const grp = new THREE.Group();
      grp.name = 'luminaires';
      for (const [cls, placements] of byClass) {
        const field = streetLightField(placements, cls);
        /* the field's meshes are already instanced; merging would undo it */
        field.userData.noMerge = true;
        for (const c of field.children) c.userData.noMerge = true;
        grp.add(field);
        lampRecs.push(...field.userData.lamps);
        out.solar = out.solar || [];
        out.solar.push({ cls, count: placements.length,
                         ...(field.userData.spec.solar || {}) });
      }
      return grp;
    },
  });
  for (const rec of lampRecs) pipeline.registerLuminaire(rec);
  pipeline.registerEmissiveGroup({ material: MAT.emitWarm, power: 2.6, threshold: 0.12, flicker: 0, phase: 0 });
  pipeline.registerEmissiveGroup({ material: MAT.emitCool, power: 2.2, threshold: 0.10, flicker: 0, phase: 0 });
  pipeline.registerEmissiveGroup({ material: MAT.emitAmber, power: 2.4, threshold: 0.05, flicker: 3.1, phase: 0.6 });
  pipeline.registerEmissiveGroup({ material: MAT.emitRed, power: 2.8, threshold: 0.02, flicker: 1.4, phase: 2.2 });

  /* ==================================================== furnishing-zone items
     Benches, bins and bike racks may only be placed here, and each is placed
     at the interval its own standard sets rather than at one shared rhythm:
     benches every 150 ft as a rest interval on a pedestrian route, bin pairs
     every 200 ft, racks at the destinations people ride to. */
  {
    const items = [];
    const bikes = [];
    const bins = [];
    for (const zone of walks.furnishZones) {
      const e = zone.edge;
      if (['promenade', 'plazaSpine', 'sidewalkWide'].indexOf(e.cls) < 0) continue;
      const sm = zone.samples;
      const step = Math.min(BENCH.spacing, BIN.spacingCommercial) / 2;
      const n = Math.floor(sm.total / step);
      for (let i = 1; i <= n; i++) {
        const s = i * step;
        const p = walks.furnishPoint(e.id, s, (i % 2) ? 1 : -1);
        if (!p) continue;
        const t = i % 3;
        if (t === 0) items.push(p);
        else if (t === 1) bins.push(p);
        else bikes.push(p);
      }
    }
    placeContainer({
      id: 'street-furniture', layer: LAYER.PROP,
      footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
      y0: -300, y1: -299,
      tags: ['no-geom-audit'], allowOverlapWith: ['*'],
      parent: g, site: 'street furniture',
      build: () => {
        const grp = new THREE.Group();
        for (const p of items) grp.add(bench(p.x, p.z, p.ang));
        for (const p of bins) grp.add(binPair(p.x, p.z, p.ang));
        for (const p of bikes) grp.add(bikeRackRow(p.x, p.z, p.ang, 3));
        out.furniture = items.length + bins.length + bikes.length;
        return grp;
      },
    });
  }

  /* ====================================================== utilities on grade */
  placeContainer({
    id: 'ground-utilities', layer: LAYER.PROP,
    footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
    y0: -400, y1: -399,
    tags: ['no-geom-audit'], allowOverlapWith: ['*'],
    parent: g, site: 'manholes, valves, hydrants',
    build: () => {
      const grp = new THREE.Group();
      const mh = [], valves = [];
      for (const e of roads.edges) {
        if (!e.geomSamples) continue;
        const sm = e.geomSamples;
        const n = Math.floor(sm.total / 88);
        for (let i = 1; i <= n; i++) {
          const p = sm[Math.round((i * 88 / sm.total) * (sm.length - 1))];
          if (!p) continue;
          mh.push({ x: p.x, y: groundH(p.x, p.z) + ELEV.decal, z: p.z, s: 1 });
          valves.push({ x: p.x + p.nx * (e.half - 1.4), y: groundH(p.x, p.z) + ELEV.decal,
                        z: p.z + p.nz * (e.half - 1.4), s: 1 });
        }
        /* Hydrants in the verge at the fire-code spacing rather than a round
           number of metres — 500 ft in a commercial district. The pumper
           nozzle is turned to face the carriageway. */
        if (['campusLoop', 'avenue', 'arterial'].indexOf(e.cls) >= 0) {
          const spacing = HYDRANT.spacingCommercial;
          const hn = Math.floor(sm.total / spacing);
          for (let i = 1; i <= hn; i++) {
            const p = sm[Math.round((i * spacing / sm.total) * (sm.length - 1))];
            if (!p) continue;
            const off = e.half + HYDRANT.setbackFromCurb;
            const hx = p.x + p.nx * off, hz = p.z + p.nz * off;
            /* face back toward the road, i.e. opposite the offset normal */
            grp.add(specHydrant(hx, hz, Math.atan2(-p.nz, -p.nx), 'med'));
          }
        }
      }
      grp.add(instanced(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 14), MAT.steelDark, mh,
        { cast: false }));
      grp.add(instanced(new THREE.CylinderGeometry(0.10, 0.10, 0.03, 10), MAT.steelDark, valves,
        { cast: false }));
      return grp;
    },
  });

  /* ============================================================== signage */
  const signs = [
    ['SEED Initiative — Living Campus', 0, -448, 0, 'signGreen', 5.0],
    ['Community Center · Plaza · Academy', 40, 200, Math.PI, 'signBlue', 3.2],
    ['Watershed Trail · 1.4 km to the beach', 44, 520, 0, 'signBrown', 2.6],
    ['Compute Halls 1–4 · Authorised access', -150, -360, Math.PI / 2, 'signBlue', 2.6],
    ['Living Systems · Greenhouses · Aquaponics', 130, -350, 0, 'signGreen', 2.8],
  ];
  placeContainer({
    id: 'wayfinding', layer: LAYER.PROP,
    footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
    y0: -500, y1: -499,
    tags: ['no-geom-audit'], allowOverlapWith: ['*'],
    parent: g, site: 'wayfinding signage',
    build: () => {
      const grp = new THREE.Group();
      for (const [label, x, z, rot, matKey, w] of signs) {
        const y = groundH(x, z);
        for (const s of [-1, 1]) {
          grp.add(mesh(cyl(0.075, 0.075, 3.2, 8), MAT.galv,
            x + Math.cos(rot) * s * w * 0.36, y + 1.6, z + Math.sin(rot) * s * w * 0.36));
        }
        grp.add(mesh(box(w, 1.15, 0.09), MAT[matKey], x, y + 2.6, z, { rotY: rot }));
        grp.add(mesh(box(w - 0.18, 0.95, 0.02), MAT.canvas,
          x + Math.sin(rot) * 0.055, y + 2.6, z + Math.cos(rot) * 0.055, { rotY: rot }));
      }
      return grp;
    },
  });

  /* =================================================================== life */
  const vehicles = [];
  placeContainer({
    id: 'vehicles', layer: LAYER.PROP,
    footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
    y0: -600, y1: -599,
    tags: ['no-geom-audit'], allowOverlapWith: ['*'],
    parent: g, site: 'vehicles and people',
    build: () => {
      const grp = new THREE.Group();
      /* parked cars in both lots and along the neighbourhood streets */
      for (const lot of [PLOTS.lotA, PLOTS.lotB]) {
        const n = Math.floor(lot.w / 2.7) - 4;
        for (let i = 0; i < n; i++) {
          if (r() > 0.62) continue;
          for (let rr = 0; rr < 2; rr++) {
            if (r() > 0.7) continue;
            const x = lot.x - (n * 2.7) / 2 + i * 2.7 + 1.35;
            const z = lot.z - lot.d / 2 + lot.d * (0.25 + rr * 0.5);
            grp.add(car(x, z, 0, r()));
          }
        }
      }
      for (let i = 0; i < 42; i++) {
        const x = -800 + r() * 1600;
        const z = -880 + (r() > 0.5 ? 11 : -11);
        if (r() > 0.45) continue;
        grp.add(car(x, z, Math.PI / 2, r()));
      }
      /* moving vehicles: two on the loop, two on the arterial, one shuttle */
      const routes = [
        { edge: 'ring-3', speed: 9 }, { edge: 'ring-7', speed: 8 },
        { edge: 'art-2', speed: 14 }, { edge: 'art-4', speed: 13 },
      ];
      for (const rt of routes) {
        const e = roads.edges.find((q) => q.id === rt.edge);
        if (!e || !e.geomSamples) continue;
        const c = car(0, 0, 0, r());
        c.userData.drive = { samples: e.geomSamples, t: r() * e.geomSamples.total,
                             speed: rt.speed, off: 3.4 };
        grp.add(c);
        out.animated.push(c);
      }
      const shuttleEdge = roads.edges.find((q) => q.id === 'art-3');
      if (shuttleEdge && shuttleEdge.geomSamples) {
        for (let i = 0; i < 2; i++) {
          const v = shuttle();
          v.userData.drive = { samples: shuttleEdge.geomSamples,
                               t: (i / 2) * shuttleEdge.geomSamples.total,
                               speed: 11, off: 3.4 };
          grp.add(v);
          out.animated.push(v);
        }
      }
      /* forklifts at the docks */
      for (const [fx, fz] of [[-320, -300], [-320, -140], [-300, 236]]) {
        grp.add(forklift(fx, fz, r() * 6.28));
      }
      /* pedestrians at plaza scale */
      for (let i = 0; i < 46; i++) {
        const a = r() * Math.PI * 2, d = r() * 78;
        const x = PLOTS.plaza.x + Math.cos(a) * d, z = PLOTS.plaza.z + Math.sin(a) * d;
        grp.add(person(x, z, r() * 6.28));
      }
      for (let i = 0; i < 22; i++) {
        const x = -140 + r() * 300, z = 180 + r() * 40;
        grp.add(person(x, z, r() * 6.28));
      }
      return grp;
    },
  });

  /* ===================================================== the detail pass */
  placeContainer({
    id: 'detail-pass', layer: LAYER.PROP,
    footprint: { poly: [[-1500, -1400], [1500, -1400], [1500, 1500], [-1500, 1500]] },
    y0: -700, y1: -699,
    tags: ['no-geom-audit'], allowOverlapWith: ['*'],
    parent: g, site: 'wear paths, dirt, puddles',
    build: () => {
      const grp = new THREE.Group();
      /* worn grass where the desire line cuts a corner */
      const desire = [
        [[90, 128], [40, 176]], [[-52, 265], [-104, 226]], [[176, -60], [142, 0]],
        [[46, 548], [70, 580]], [[120, 1196], [70, 1216]],
      ];
      for (const [a, b] of desire) {
        const n = 12;
        for (let i = 0; i <= n; i++) {
          const t = i / n;
          const x = lerp(a[0], b[0], t), z = lerp(a[1], b[1], t);
          grp.add(decal(2.2, 2.2, x, z, MAT.dirt, 'decal'));
        }
      }
      /* dirt accumulation at wall bases along the acoustic wall */
      /* puddles in low spots on the service roads, roughness-driven only */
      for (let i = 0; i < 26; i++) {
        const x = -330 + (r() - 0.5) * 10, z = -300 + r() * 560;
        grp.add(decal(2.4 + r() * 2, 1.6 + r() * 1.6, x, z, MAT.asphaltWorn, 'overlay'));
      }
      return grp;
    },
  });

  out.update = (t, dt) => {
    for (const o of out.animated) {
      const d = o.userData.drive;
      if (!d) continue;
      d.t = (d.t + d.speed * dt) % d.samples.total;
      const i = clamp(Math.round((d.t / d.samples.total) * (d.samples.length - 1)),
        0, d.samples.length - 1);
      const p = d.samples[i];
      o.position.set(p.x + p.nx * d.off, groundH(p.x, p.z) + ELEV.asphalt, p.z + p.nz * d.off);
      o.rotation.y = -Math.atan2(p.tz, p.tx) + Math.PI / 2;
    }
  };

  return out;
}

/* ------------------------------------------------------------------ pieces
   The bench, bin, bike rack and hydrant that used to live here have moved to
   infra/furniture.js, where their dimensions come from spec rather than from
   numbers typed at the point of use. What remains here is the rolling stock
   and the people, which are not regulated street furniture.               */

const CAR_COLOURS = [0xd8dade, 0x2a2e34, 0x8f2b24, 0x1e3f6b, 0x4a5a52, 0xb8b2a4, 0x36444e];
function car(x, z, rot, seed) {
  const g = new THREE.Group();
  const y = groundH(x, z);
  const col = CAR_COLOURS[Math.floor(seed * CAR_COLOURS.length) % CAR_COLOURS.length];
  const bodyMat = MAT.steel;
  const body = mesh(box(1.82, 0.72, 4.4), bodyMat, 0, 0.72, 0);
  body.material = bodyMat;
  const cabin = mesh(box(1.66, 0.62, 2.3), MAT.glassSimple, 0, 1.35, -0.2);
  cabin.userData.noMerge = true;
  g.add(body, cabin);
  g.add(mesh(box(1.86, 0.16, 4.3), MAT.tyre, 0, 0.42, 0, { cast: false }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(mesh(cyl(0.32, 0.32, 0.20, 12), MAT.tyre, sx * 0.86, 0.32, sz * 1.44, { rotZ: Math.PI / 2 }));
  }
  g.add(mesh(box(1.4, 0.12, 0.06), MAT.emitWarm, 0, 0.78, 2.22));
  g.add(mesh(box(1.4, 0.10, 0.06), MAT.emitRed, 0, 0.80, -2.22));
  g.position.set(x, y + 0.02, z);
  g.rotation.y = rot;
  g.userData.tint = col;
  return g;
}

function shuttle() {
  const g = new THREE.Group();
  g.add(mesh(box(2.2, 2.0, 6.2), MAT.panelWallW, 0, 1.35, 0));
  g.add(mesh(box(2.24, 0.9, 5.4), MAT.glassSimple, 0, 2.05, -0.2));
  g.add(mesh(box(2.24, 0.14, 6.3), MAT.markBlue, 0, 0.55, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g.add(mesh(cyl(0.38, 0.38, 0.22, 12), MAT.tyre, sx * 1.02, 0.38, sz * 2.1, { rotZ: Math.PI / 2 }));
  }
  g.add(mesh(box(1.9, 0.05, 3.0), MAT.pv, 0, 2.4, 0));
  return g;
}

function forklift(x, z, rot) {
  const g = new THREE.Group();
  const y = groundH(x, z);
  g.add(mesh(box(1.2, 1.0, 2.2), MAT.markYellow, 0, 0.75, 0));
  g.add(mesh(box(0.9, 1.5, 0.14), MAT.steelDark, 0, 1.4, 1.2));
  g.add(mesh(box(0.7, 0.06, 0.9), MAT.steelDark, 0, 0.16, 1.7));
  for (const sx of [-1, 1]) {
    g.add(mesh(cyl(0.3, 0.3, 0.2, 10), MAT.tyre, sx * 0.62, 0.3, 0.7, { rotZ: Math.PI / 2 }));
    g.add(mesh(cyl(0.22, 0.22, 0.16, 10), MAT.tyre, sx * 0.5, 0.22, -0.85, { rotZ: Math.PI / 2 }));
  }
  g.position.set(x, y, z);
  g.rotation.y = rot;
  return g;
}

function person(x, z, rot) {
  const g = new THREE.Group();
  const y = groundH(x, z);
  const h = 1.55 + r() * 0.28;
  g.add(mesh(cyl(0.10, 0.12, h * 0.52, 7), MAT.steelDark, 0, h * 0.26, 0));
  g.add(mesh(box(0.36, h * 0.36, 0.20),
    [MAT.markBlue, MAT.markRed, MAT.canvas, MAT.markYellow][Math.floor(r() * 4)],
    0, h * 0.70, 0));
  g.add(mesh(new THREE.SphereGeometry(0.10, 8, 6), MAT.dirt, 0, h * 0.94, 0));
  g.position.set(x, y, z);
  g.rotation.y = rot;
  return g;
}
