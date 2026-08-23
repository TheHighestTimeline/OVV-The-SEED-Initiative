/* ============================================================================
   11-perimeter.js — acoustic wall, security fence, gates, bioswale
   ----------------------------------------------------------------------------
   In v3 the berm centreline sat at +/-312 and the wall centreline at +/-300
   with a 38 m berm base, so the 14 m wall was buried 4.7 to 7.3 m along its
   entire length and the berm's inboard toe reached 5.5 m past the wall into the
   campus, swallowing 14.5 of the 15 m perimeter carriageway.

   Here the berm IS the terrain and the wall reads its base from the terrain at
   the crest offset. The two share one centreline field. Interpenetration is not
   expressible.
   ========================================================================== */

import * as THREE from 'three';
import { SITE, ELEV, LAYER, DEG, clamp, lerp, stream } from './00-config.js';
import { groundH, perimU } from './01-terrain.js';
import { MAT } from './03-materials.js';
import { place, reserve } from './02-registry.js';
import { resamplePath, sweep, mesh, box, cyl, decal, instanced } from './geom.js';
import { PLOTS } from './08-siteplan.js';

const r = stream('perimeter');

/* The offset curve of the perimeter field at a given u. Because every feature
   is generated from this one function, they are concentric by construction. */
export function perimeterPath(u, step) {
  const s = step || 6;
  const R = clamp(SITE.ringRadius + (u - 400), 3, u * 0.9);
  const H = u - R;
  const pts = [];
  const line = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(L / s));
    for (let i = 0; i < n; i++) {
      const t = i / n;
      pts.push([ax + (bx - ax) * t, az + (bz - az) * t]);
    }
  };
  const arc = (cx, cz, a0, a1) => {
    const n = Math.max(4, Math.round(Math.abs(a1 - a0) * R / s));
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / n);
      pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
  };
  const Q = Math.PI / 2;
  /* The straights must be sampled too, not only the corner arcs. Sampling only
     the arcs meant no vertex ever landed near a gate, so splitAtGates never
     split and the wall ran straight across every gate opening. */
  line(-H, -u, H, -u);   arc(H, -H, -Q, 0);
  line(u, -H, u, H);     arc(H, H, 0, Q);
  line(H, u, -H, u);     arc(-H, H, Q, Math.PI);
  line(-u, H, -u, -H);   arc(-H, -H, Math.PI, Math.PI * 1.5);
  pts.push(pts[0].slice());
  return pts;
}

/* is this point inside a gate opening? */
function inGate(x, z, extra) {
  for (const g of SITE.gates) {
    const along = g.axis === 'z' ? x : z;
    const across = g.axis === 'z' ? z : x;
    if (Math.sign(across) !== g.sign) continue;
    if (Math.abs(along - g.at) < g.width / 2 + (extra || 0)) return g;
  }
  return null;
}

/* split a closed path into runs that avoid the gate openings */
function splitAtGates(pts, extra) {
  const runs = [];
  let cur = [];
  for (const p of pts) {
    if (inGate(p[0], p[1], extra)) {
      if (cur.length > 1) runs.push(cur);
      cur = [];
    } else cur.push(p);
  }
  if (cur.length > 1) runs.push(cur);
  return runs;
}

export function buildPerimeter(world, roads, pipeline) {
  const g = new THREE.Group();
  g.name = 'perimeter';
  world.add(g);
  const out = { group: g, anchors: {} };

  /* ================================================== the perimeter wall
     Precast concrete on the fence line, full loop, open only at the gates —
     the berm is gone (owner direction): the campus edge is a WALL that
     connects to the gatehouse at every entrance, the way a real secure
     campus is fenced. */
  {
    const path = perimeterPath(SITE.fenceOffset, 5);
    const runs = splitAtGates(path, 16);
    const H = SITE.wallHeight, T = SITE.wallThick;
    runs.forEach((run, i) => {
      const sm = resamplePath(run, 4, 0);
      if (sm.length < 3) return;
      const geo = sweep(sm, [
        { u: -T / 2, dy: -0.9 }, { u: -T / 2, dy: H },
        { u: -T / 2 - 0.10, dy: H + 0.12 }, { u: T / 2 + 0.10, dy: H + 0.12 },
        { u: T / 2, dy: H }, { u: T / 2, dy: -0.9 },
      ], { lift: 0, uvScale: 0.22 });
      if (!geo) return;
      registerRun('acoustic-wall-' + i, run, T / 2 + 1.0, -1, H + 1,
        LAYER.UTILITY, ['perimeter'], ['perimeter'], ['no-geom-audit']);
      const grp = new THREE.Group();
      grp.name = 'acoustic-wall-' + i;
      grp.add(mesh(geo, MAT.precast));
      /* buttress piers on the outboard face, every 12 m */
      for (let k = 0; k < sm.length; k += 3) {
        const p = sm[k];
        const px = p.x + p.nx * (T / 2 + 0.5), pz = p.z + p.nz * (T / 2 + 0.5);
        grp.add(mesh(box(0.8, H * 0.7, 1.0), MAT.precast, px, groundH(p.x, p.z) + H * 0.35, pz,
          { rotY: -Math.atan2(p.tz, p.tx) }));
      }
      g.add(grp);
    });
    /* lapped baffle returns at each gate, so sound does not leak through the
       opening the road needs */
    for (const gt of SITE.gates) {
      for (const s of [-1, 1]) {
        const along = gt.at + s * (gt.width / 2 + 3);
        const across = gt.sign * SITE.fenceOffset;
        const bx = gt.axis === 'z' ? along : across;
        const bz = gt.axis === 'z' ? across : along;
        const ang = gt.axis === 'z' ? 0 : Math.PI / 2;
        /* The wall RETURNS at each gate: wing walls running OUTWARD along
           the approach throat, so the perimeter wall physically connects to
           the gatehouse island instead of stopping dead at the opening.
           The old version ran the wings inward, away from the guard house. */
        place({
          id: `wall-baffle-${gt.id}-${s}`, layer: LAYER.UTILITY,
          footprint: { x: bx + (gt.axis === 'z' ? 0 : gt.sign * 9), z: bz + (gt.axis === 'z' ? gt.sign * 9 : 0), w: gt.axis === 'z' ? 1.2 : 20, d: gt.axis === 'z' ? 20 : 1.2 },
          y0: groundH(bx, bz) - 1, y1: groundH(bx, bz) + SITE.wallHeight + 1,
          parent: g, site: 'perimeter wall gate return',
          groups: ['perimeter'], allowOverlapWith: ['perimeter'],
          build: () => {
            const grp = new THREE.Group();
            const L = 18;
            for (let k = 0; k <= 9; k++) {
              const t = k / 9;
              const px = bx + (gt.axis === 'z' ? 0 : gt.sign * L * t);
              const pz = bz + (gt.axis === 'z' ? gt.sign * L * t : 0);
              grp.add(mesh(box(gt.axis === 'z' ? 1.0 : 2.4, SITE.wallHeight * (1 - t * 0.35), gt.axis === 'z' ? 2.4 : 1.0),
                MAT.precast, px, groundH(px, pz) + SITE.wallHeight * (1 - t * 0.35) / 2, pz));
            }
            return grp;
          },
        });
      }
    }
  }

  /* ================================================ bioswale valley furniture
     The stormwater valley w3 promises. In v3 the setback was NEGATIVE 7 m and
     there was no valley, no bioswale and no fence anywhere in the file. */
  {
    const path = perimeterPath(SITE.swaleOffset, 8);
    const sm = resamplePath(path, 6, 0);
    splitAtGates(path, 24).forEach((run, ri) =>
      registerRun('bioswale-' + ri, run, 8, -2.2, 0.6, LAYER.UTILITY,
        ['perimeter'], ['perimeter', 'road', 'walk', 'apron'], ['no-geom-audit']));
    {
        const grp = new THREE.Group();
        grp.name = 'bioswale';
        /* cobble check dams every 30 m */
        for (let k = 0; k < sm.length; k += 5) {
          const p = sm[k];
          if (inGate(p.x, p.z, 20)) continue;
          const cobbles = [];
          for (let i = 0; i < 22; i++) {
            const t = (i / 21 - 0.5) * 6.4;
            const px = p.x + p.nx * t + (r() - 0.5) * 0.5;
            const pz = p.z + p.nz * t + (r() - 0.5) * 0.5;
            cobbles.push({ x: px, y: groundH(px, pz) + 0.16, z: pz,
                           ry: r() * 6.28, s: 0.5 + r() * 0.45 });
          }
          grp.add(instanced(new THREE.DodecahedronGeometry(0.42, 0), MAT.gravel, cobbles,
            { cast: true, receive: true }));
        }
        g.add(grp);
    }
    /* the outfall: headwall, level spreader and energy dissipator at the south
       berm toe, where the swale discharges to the watershed corridor */
    const ox = 82, oz = SITE.bermToeOut + 4;
    place({
      id: 'swale-outfall', layer: LAYER.UTILITY,
      footprint: { x: ox, z: oz, w: 22, d: 16 },
      y0: groundH(ox, oz) - 2, y1: groundH(ox, oz) + 3,
      parent: g, site: 'bioswale outfall headwall',
      build: () => {
        const grp = new THREE.Group();
        const oy = groundH(ox, oz);
        grp.add(mesh(box(14, 2.4, 1.0), MAT.precast, ox, oy + 0.9, oz - 3));
        for (const s of [-1, 1]) {
          grp.add(mesh(box(1.0, 2.2, 7), MAT.precast, ox + s * 6.5, oy + 0.8, oz + 0.6, { rotY: s * 0.28 }));
        }
        grp.add(mesh(cyl(1.0, 1.0, 2.4, 16), MAT.precast, ox, oy + 0.7, oz - 3.6, { rotX: Math.PI / 2 }));
        /* level spreader lip and a riprap apron */
        grp.add(mesh(box(16, 0.35, 0.6), MAT.precast, ox, oy + 0.18, oz + 3.4));
        const rip = [];
        for (let i = 0; i < 90; i++) {
          const px = ox + (r() - 0.5) * 18, pz = oz + 1 + r() * 11;
          rip.push({ x: px, y: groundH(px, pz) + 0.2, z: pz, ry: r() * 6.28, s: 0.5 + r() * 0.8 });
        }
        grp.add(instanced(new THREE.DodecahedronGeometry(0.55, 0), MAT.gravel, rip));
        return grp;
      },
    });
    out.anchors.bioswale = [ox, groundH(ox, oz) + 3, oz - 30];
  }

  /* ============================================================== gatehouse
     With a visitor lane separate from the truck lane, which is the separation
     i3 describes. Nothing sits in the carriageway. */
  {
    const p = PLOTS.gatehouse;
    place({
      id: 'gatehouse', layer: LAYER.STRUCTURE,
      footprint: { x: p.x, z: p.z, w: p.w, d: p.d },
      y0: groundH(p.x, p.z) - 1, y1: groundH(p.x, p.z) + 8,
      clearance: 1.0, parent: g, site: 'gatehouse',
      build: () => {
        const grp = new THREE.Group();
        const gy = groundH(p.x, p.z);
        grp.add(decal(p.w + 4, p.d + 4, p.x, p.z, MAT.concretePad, 'pavementEdge'));
        grp.add(mesh(box(p.w, 0.4, p.d), MAT.precast, p.x, gy + 0.2, p.z));
        grp.add(mesh(box(p.w - 0.6, 3.2, p.d - 0.6), MAT.panelWallW, p.x, gy + 2.0, p.z));
        for (const s of [-1, 1]) {
          const pane = new THREE.Mesh(new THREE.PlaneGeometry(p.w - 1.6, 1.5), MAT.glass);
          pane.position.set(p.x, gy + 2.4, p.z + s * (p.d / 2 - 0.28));
          grp.add(pane);
        }
        grp.add(mesh(box(p.w + 3.4, 0.3, p.d + 3.4), MAT.roofSeam, gy ? p.x : p.x, gy + 3.8, p.z));
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          grp.add(mesh(cyl(0.09, 0.09, 3.6, 8), MAT.steelDark,
            p.x + sx * (p.w / 2 + 1.4), gy + 1.9, p.z + sz * (p.d / 2 + 1.4)));
        }
        /* Barrier arms ACROSS the lanes. The approach carriageway runs along
           x = 0, half-width 4.5: the inbound (west) lane gets an arm just
           north of the island, the outbound (east) lane just south, each
           spanning its lane from a pedestal at the lane edge. The old arms
           sat beside the road and read as furniture in the grass. */
        for (const lane of [
          { x0: -4.9, x1: -0.2, z: p.z - 5.2 },   /* inbound, arm before the island */
          { x0: 0.2, x1: 4.9, z: p.z + 5.2 },     /* outbound */
        ]) {
          const px = lane.x0 < 0 ? lane.x0 - 0.45 : lane.x1 + 0.45;
          grp.add(mesh(box(0.45, 1.15, 0.45), MAT.steel, px, groundH(px, lane.z) + 0.58, lane.z));
          const span = lane.x1 - lane.x0;
          const cx = (lane.x0 + lane.x1) / 2;
          const arm = mesh(box(span, 0.14, 0.20), MAT.markRed,
            cx, groundH(cx, lane.z) + 1.02, lane.z);
          arm.name = 'gate-arm-' + (lane.x0 < 0 ? 'in' : 'out');
          grp.add(arm);
          /* stop line on the pavement ahead of the arm */
          grp.add(mesh(box(span, 0.05, 0.45), MAT.markWhite,
            cx, groundH(cx, lane.z) + ELEV.roadMarking + 0.06,
            lane.z + (lane.x0 < 0 ? -2.2 : 2.2), { cast: false, receive: false }));
        }
        /* the stub that ties the gatehouse to the perimeter wall's gate
           return, so wall -> wing -> guard house is one continuous line */
        const wingX = 20;
        grp.add(mesh(box(wingX - (p.x + p.w / 2) + 0.6, 2.6, 0.6), MAT.precast,
          (p.x + p.w / 2 + wingX) / 2, gy + 1.3, p.z));
        grp.add(mesh(cyl(0.11, 0.14, 9, 10), MAT.galv, p.x + 7, gy + 4.5, p.z + 2));
        for (let i = 0; i < 3; i++) {
          grp.add(mesh(box(0.34, 0.18, 0.22), MAT.steelDark,
            p.x + 7 + Math.cos(i * 2.1) * 0.5, gy + 8.6, p.z + 2 + Math.sin(i * 2.1) * 0.5,
            { rotY: -i * 2.1 }));
        }
        grp.add(mesh(box(1.2, 0.6, 0.08), MAT.emitCool, p.x - 4, gy + 5.2, p.z - 3.9));
        return grp;
      },
    });
    out.anchors.gatehouse = [p.x, groundH(p.x, p.z) + 7, p.z];
  }

  return out;
}

/* Register a long linear run as a chain of short OBBs rather than one giant
   polygon. A single perimeter-sized footprint has a bounding radius of ~660 m,
   which defeats the spatial hash: every broad-phase query returns it and the
   SAT then runs against a 60-vertex polygon for every object in the world. */
export function registerRun(idBase, pts, half, y0off, y1off, layer, groups, allow, tags) {
  const step = 26;
  let acc = 0, k = 0, last = pts[0];
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc < step && i !== pts.length - 1) continue;
    const a = last, b = pts[i];
    const cx = (a[0] + b[0]) / 2, cz = (a[1] + b[1]) / 2;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 0.4) { last = pts[i]; acc = 0; continue; }
    const y = groundH(cx, cz);
    reserveSafe({
      id: `${idBase}#${k++}`, layer,
      footprint: { x: cx, z: cz, w: L + 0.4, d: half * 2,
                   rot: Math.atan2(b[1] - a[1], b[0] - a[0]) },
      y0: y + y0off, y1: y + y1off,
      groups, allowOverlapWith: allow, tags, site: idBase,
    });
    last = pts[i]; acc = 0;
  }
  return k;
}
function reserveSafe(spec) {
  try { return reserve(spec); } catch (e) { throw e; }
}

/* a thin band polygon along a closed path, for footprint registration */
function fenceBand(pts, halfWidth) {
  const hw = halfWidth || 0.6;
  const a = [], b = [];
  for (let i = 0; i < pts.length; i += 4) {
    const p = pts[i];
    const L = Math.hypot(p[0], p[1]) || 1;
    a.push([p[0] * (1 + hw / L), p[1] * (1 + hw / L)]);
    b.push([p[0] * (1 - hw / L), p[1] * (1 - hw / L)]);
  }
  return a.concat(b.reverse());
}
