/* ============================================================================
   05-roads.js — roads generated from a graph
   ----------------------------------------------------------------------------
   Every road in v3 was a hand-placed road(w,d,x,z) box. That is why three of
   them ran through buildings, both parking lots had no driveway at all, nine
   roads dead-ended in grass, and the perimeter "loop" had 20x70 m gaps at all
   four corners.

   Here a road is a graph. The carriageway, gutter pan, curb, markings,
   intersection returns, ADA ramps and crosswalks are all generated from it,
   in that order, per edge.
   ========================================================================== */

import * as THREE from 'three';
import { ELEV, RENDER_ORDER, LAYER, clamp, lerp, stream } from './00-config.js';
import { groundH } from './01-terrain.js';
import { MAT } from './03-materials.js';
import {
  resamplePath, sweep, mesh, box, cyl, decal, instanced, pointInPoly,
} from './geom.js';
import { registry, reserve } from './02-registry.js';

const rnd = stream('roads');

/* ------------------------------------------------------------- road classes
   width is curb face to curb face. */
export const ROAD_CLASS = {
  arterial: {
    width: 22, gutter: 0.75, curbH: 0.16, curbW: 0.18, verge: 6.0,
    sidewalk: 'both', shoulder: 0, returnR: 12, step: 3, fillet: 60,
    material: 'asphalt', truck: true,
    marks: [
      { u: -1.9, style: 'solid', col: 'markYellow', w: 0.12 },
      { u: -2.1, style: 'dashed', col: 'markYellow', w: 0.12, dash: [3, 9] },
      { u:  1.9, style: 'solid', col: 'markYellow', w: 0.12 },
      { u:  2.1, style: 'dashed', col: 'markYellow', w: 0.12, dash: [3, 9] },
      { u: -5.5, style: 'dashed', col: 'markWhite', w: 0.12, dash: [3, 9] },
      { u:  5.5, style: 'dashed', col: 'markWhite', w: 0.12, dash: [3, 9] },
      { u: -9.1, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  9.1, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },
  campusLoop: {
    /* 2 lanes at 3.65 plus 1.1 m shoulders each side = 9.5 m kerb to kerb */
    width: 9.5, gutter: 0.6, curbH: 0.15, curbW: 0.16, verge: 4.0,
    sidewalk: 'inner', shoulder: 2.5, returnR: 9, step: 3, fillet: 45,
    material: 'asphalt',
    marks: [
      { u: -0.08, style: 'solid', col: 'markYellow', w: 0.11 },
      { u:  0.08, style: 'solid', col: 'markYellow', w: 0.11 },
      { u: -3.75, style: 'solid', col: 'markWhite', w: 0.11 },
      { u:  3.75, style: 'solid', col: 'markWhite', w: 0.11 },
    ],
  },
  service: {
    /* haul route: 2 lanes at 4.2 for trucks, plus shoulders */
    width: 10.5, gutter: 0, curbH: 0, curbW: 0, verge: 5.0,
    sidewalk: 'none', shoulder: 3.0, returnR: 15, step: 3, fillet: 40,
    material: 'asphaltWorn', truck: true,
    marks: [
      { u: -0.09, style: 'dashed', col: 'markYellow', w: 0.12, dash: [3, 9] },
      { u:  0.09, style: 'dashed', col: 'markYellow', w: 0.12, dash: [3, 9] },
      { u: -4.3, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  4.3, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },
  avenue: {
    /* 2 lanes at 3.5 plus parking-width shoulders */
    width: 9.0, gutter: 0.6, curbH: 0.15, curbW: 0.16, verge: 5.0,
    sidewalk: 'both', shoulder: 0, returnR: 8, step: 2.5, fillet: 35,
    material: 'asphalt', streetTrees: true,
    marks: [
      { u: -0.09, style: 'solid', col: 'markYellow', w: 0.12 },
      { u:  0.09, style: 'solid', col: 'markYellow', w: 0.12 },
      { u: -3.6, style: 'solid', col: 'markWhite', w: 0.12 },
      { u:  3.6, style: 'solid', col: 'markWhite', w: 0.12 },
    ],
  },
  aisle: {
    width: 7, gutter: 0, curbH: 0.15, curbW: 0.16, verge: 0,
    sidewalk: 'none', shoulder: 0, returnR: 5, step: 2, fillet: 12,
    material: 'asphalt', marks: [],
  },
  fire: {
    width: 6, gutter: 0, curbH: 0, curbW: 0, verge: 0,
    sidewalk: 'none', shoulder: 0, returnR: 8, step: 2, fillet: 14,
    material: 'asphaltWorn',
    marks: [
      { u: -2.7, style: 'solid', col: 'markRed', w: 0.15 },
      { u:  2.7, style: 'solid', col: 'markRed', w: 0.15 },
    ],
  },
  drive: {
    width: 6.4, gutter: 0, curbH: 0.15, curbW: 0.16, verge: 2.0,
    sidewalk: 'none', shoulder: 0, returnR: 6, step: 2, fillet: 12,
    material: 'asphalt', marks: [],
  },
};

/* ================================================================ the graph */
export class RoadGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.group = new THREE.Group();
    this.group.name = 'roads';
    this.curbLines = [];     /* consumed by the walks module */
    this.crossings = [];
    this.aprons = [];
    this.destinations = new Map();
    this.warnings = [];
  }

  node(id, x, z, type) {
    if (this.nodes.has(id)) return this.nodes.get(id);
    const n = { id, x, z, type: type || 'intersection', edges: [] };
    this.nodes.set(id, n);
    return n;
  }

  /* pts: optional intermediate control points between from and to */
  edge(id, from, to, cls, pts, opts) {
    const a = this.nodes.get(from), b = this.nodes.get(to);
    if (!a) throw new Error(`[roads] edge ${id}: unknown node ${from}`);
    if (!b) throw new Error(`[roads] edge ${id}: unknown node ${to}`);
    const e = {
      id, a, b, cls, spec: ROAD_CLASS[cls], opts: opts || {},
      pts: [[a.x, a.z], ...(pts || []), [b.x, b.z]],
    };
    if (!e.spec) throw new Error(`[roads] edge ${id}: unknown class "${cls}"`);
    this.edges.push(e);
    a.edges.push({ e, end: 'a' });
    b.edges.push({ e, end: 'b' });
    return e;
  }

  /* ------------------------------------------------------------- validation */
  validate() {
    const problems = [];
    /* every terminus must be a declared cul-de-sac, gate or boundary */
    for (const n of this.nodes.values()) {
      if (n.edges.length === 1 &&
          ['terminus', 'cul-de-sac', 'gate', 'boundary', 'dock', 'lot'].indexOf(n.type) < 0) {
        problems.push(`node "${n.id}" has one edge but type "${n.type}" — a road ends in grass`);
      }
      if (n.edges.length === 0) problems.push(`node "${n.id}" is orphaned`);
    }
    /* connectivity from the public entry */
    const start = this.nodes.get('pub-entry') || this.nodes.values().next().value;
    const seen = new Set([start.id]);
    const stack = [start];
    while (stack.length) {
      const n = stack.pop();
      for (const { e } of n.edges) {
        const o = e.a === n ? e.b : e.a;
        if (!seen.has(o.id)) { seen.add(o.id); stack.push(o); }
      }
    }
    for (const n of this.nodes.values()) {
      if (!seen.has(n.id)) problems.push(`node "${n.id}" is unreachable from the public entry`);
    }
    return problems;
  }

  /* ------------------------------------------------------------------ build */
  build() {
    /* 1. resample every centreline and compute trim distances at each node */
    for (const e of this.edges) {
      e.samples = resamplePath(e.pts, e.spec.step, e.opts.fillet != null ? e.opts.fillet : e.spec.fillet);
      e.half = e.spec.width / 2;
    }
    for (const n of this.nodes.values()) {
      /* direction of each incident edge, pointing away from the node */
      n.arms = n.edges.map(({ e, end }) => {
        const s = e.samples;
        const p0 = end === 'a' ? s[0] : s[s.length - 1];
        const p1 = end === 'a' ? s[Math.min(3, s.length - 1)] : s[Math.max(0, s.length - 4)];
        let dx = p1.x - p0.x, dz = p1.z - p0.z;
        const L = Math.hypot(dx, dz) || 1;
        dx /= L; dz /= L;
        return { e, end, dx, dz, half: e.half, ang: Math.atan2(dz, dx) };
      });
      n.arms.sort((p, q) => p.ang - q.ang);
      if (n.arms.length >= 2) {
        let maxHalf = 0, maxR = 0;
        for (const a of n.arms) {
          maxHalf = Math.max(maxHalf, a.half);
          maxR = Math.max(maxR, a.e.spec.returnR);
        }
        /* trim far enough back that the widest arm's mouth clears the others */
        n.trim = maxHalf + Math.min(maxR, 14) * 0.55 + 1.2;
      } else {
        n.trim = 0;
      }
    }
    /* 2. per-edge geometry */
    for (const e of this.edges) this._buildEdge(e);
    /* 3. intersections */
    for (const n of this.nodes.values()) {
      if (n.arms.length >= 2) this._buildIntersection(n);
      else if (n.type === 'cul-de-sac') this._buildCulDeSac(n);
    }
    return this.group;
  }

  _trimmed(e) {
    const s = e.samples;
    const total = s.total;
    const t0 = e.a.trim, t1 = total - e.b.trim;
    const out = s.filter((p) => p.s >= t0 - 0.001 && p.s <= t1 + 0.001);
    if (out.length < 2) return null;
    out.total = out[out.length - 1].s - out[0].s;
    const s0 = out[0].s;
    return out.map((p) => ({ ...p, s: p.s - s0 })).concat();
  }

  _buildEdge(e) {
    const sp = e.spec;
    let sm = this._trimmed(e);
    if (!sm) { this.warnings.push(`edge ${e.id} is fully consumed by its intersections`); return; }
    sm.total = sm[sm.length - 1].s;
    e.geomSamples = sm;
    const g = new THREE.Group();
    g.name = 'road-' + e.id;
    const h = e.half, crown = 0.02;
    const asphaltMat = MAT[sp.material] || MAT.asphalt;

    /* --- 1. subgrade: a wider ribbon at the lowest ledger, so the road never
       shows a floating edge where the terrain is not perfectly flat */
    const sub = sweep(sm, [
      { u: -(h + sp.curbW + 0.9), dy: -0.02, toGround: true, groundLift: ELEV.subgrade },
      { u: -(h + sp.curbW + 0.2), dy: -0.02 },
      { u:  (h + sp.curbW + 0.2), dy: -0.02 },
      { u:  (h + sp.curbW + 0.9), dy: -0.02, toGround: true, groundLift: ELEV.subgrade },
    ], { lift: ELEV.subgrade, uvScale: 0.2 });
    if (sub) { const m = mesh(sub, MAT.gravel, null, null, null, { cast: false });
               m.renderOrder = RENDER_ORDER.subgrade; g.add(m); }

    /* --- 2. carriageway, crowned at 2% — with the crown TAPERED to zero over
       the last 12 m into every node, so the cross-section arrives flat at the
       mouth and meets the flat intersection paving without a step. The old
       constant crown left the arterial's edges 0.19 m below the intersection
       slab at every mouth. */
    const inner = h - sp.gutter;
    const TAPER = 12;
    const total = sm.total;
    const tap = (p) => clamp(Math.min(p.s, total - p.s) / TAPER, 0, 1);
    const car = sweep(sm, [
      { u: -inner, dy: (p) => -inner * crown * tap(p) },
      { u: -inner * 0.5, dy: (p) => -inner * 0.5 * crown * tap(p) },
      { u: 0, dy: 0 },
      { u: inner * 0.5, dy: (p) => -inner * 0.5 * crown * tap(p) },
      { u: inner, dy: (p) => -inner * crown * tap(p) },
    ], { lift: ELEV.asphalt, uvScale: 0.14 });
    if (car) { const m = mesh(car, asphaltMat, null, null, null, { cast: false });
               m.renderOrder = RENDER_ORDER.asphalt; g.add(m); }

    /* --- 3 + 4 + 5. gutter pan and curb, one swept assembly per side */
    if (sp.curbH > 0) {
      for (const side of [-1, 1]) {
        const flow = (p) => -h * crown * tap(p) - 0.035;
        const prof = [
          { u: side * inner, dy: (p) => -inner * crown * tap(p) },
          { u: side * (h - 0.06), dy: flow },
          { u: side * h, dy: flow },
          { u: side * h, dy: sp.curbH },
          { u: side * (h + sp.curbW * 0.35), dy: sp.curbH + 0.012 },
          { u: side * (h + sp.curbW), dy: sp.curbH + 0.012 },
          { u: side * (h + sp.curbW), dy: -0.10 },
        ];
        const cg = sweep(sm, side < 0 ? prof : prof.slice().reverse(),
          { lift: ELEV.gutter, uvScale: 0.3 });
        if (cg) {
          const m = mesh(cg, MAT.concreteCurb, null, null, null, { cast: true });
          m.renderOrder = RENDER_ORDER.gutter;
          g.add(m);
        }
        this.curbLines.push({ edge: e, side, offset: side * (h + sp.curbW), samples: sm });
      }
    } else if (sp.shoulder > 0) {
      /* no curb: a graded shoulder tying back into the ground */
      for (const side of [-1, 1]) {
        const sg = sweep(sm, [
          { u: side * inner, dy: (p) => -inner * crown * tap(p) },
          { u: side * (h + sp.shoulder), dy: 0, toGround: true, groundLift: ELEV.aggregate },
        ], { lift: ELEV.asphalt, uvScale: 0.25 });
        if (sg) { const m = mesh(sg, MAT.gravel, null, null, null, { cast: false });
                  m.renderOrder = RENDER_ORDER.aggregate; g.add(m); }
      }
    }

    /* --- 6. markings, generated from the lane spec. They follow the crown:
       painted flat they floated 0.16 m above the asphalt at the arterial's
       edge lines, because the carriageway falls away under them. */
    const markDy = (p, u) => -Math.min(Math.abs(u), inner) * crown * tap(p);
    for (const mk of (sp.marks || [])) this._marking(g, sm, mk, markDy);
    if (e.opts.marks) for (const mk of e.opts.marks) this._marking(g, sm, mk, markDy);

    /* --- 7. drainage: catch basins in the gutter, on real spacing */
    if (sp.curbH > 0) {
      const spacing = 58;
      const n = Math.floor(sm.total / spacing);
      for (let i = 1; i <= n; i++) {
        const p = sm[Math.round((i * spacing / sm.total) * (sm.length - 1))];
        if (!p) continue;
        for (const side of [-1, 1]) {
          const x = p.x + p.nx * side * (h - 0.35);
          const z = p.z + p.nz * side * (h - 0.35);
          const gy = groundH(x, z) + ELEV.gutter - 0.02;
          const grate = mesh(box(0.75, 0.06, 0.55), MAT.steelDark, x, gy, z,
            { rotY: Math.atan2(p.tz, p.tx), cast: false });
          grate.renderOrder = RENDER_ORDER.gutter + 1;
          g.add(grate);
        }
      }
    }

    this.group.add(g);
    e.group = g;

    /* --- registration: a corridor of OBBs the validator can test against */
    /* short registration chords: an 18 m chord across a 70 m corner radius
       bulges 0.6 m outside the true carriageway and collided with the fence */
    const step = Math.max(6, Math.round(sm.total / Math.max(1, Math.round(sm.total / 8))));
    const idsOfNodes = [e.a.id, e.b.id];
    const halfTotal = h + sp.curbW + 0.35;
    let k = 0;
    for (let s = 0; s < sm.total - 0.5; s += step) {
      const i0 = Math.round((s / sm.total) * (sm.length - 1));
      const i1 = Math.round((Math.min(s + step, sm.total) / sm.total) * (sm.length - 1));
      if (i1 <= i0) continue;
      const a = sm[i0], b = sm[i1];
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const y = groundH(cx, cz);
      reserve({
        id: `${e.id}#${k++}`, layer: LAYER.ROAD,
        footprint: { x: cx, z: cz, w: L + 0.6, d: halfTotal * 2, rot: Math.atan2(b.z - a.z, b.x - a.x) },
        y0: y - 0.4, y1: y + Math.max(0.35, sp.curbH + 0.2),
        groups: ['road', e.id, ...idsOfNodes],
        allowOverlapWith: ['road', ...idsOfNodes, e.id],
        site: `road edge ${e.id}`,
      });
    }
    e.registeredCount = k;
  }

  _marking(parent, sm, mk, dyAt) {
    const material = MAT[mk.col] || MAT.markWhite;
    const w = mk.w || 0.12;
    const dash = mk.style === 'dashed' ? (mk.dash || [3, 9]) : null;
    const pieces = [];
    if (!dash) {
      pieces.push([0, sm.total]);
    } else {
      const period = dash[0] + dash[1];
      for (let s = 1.5; s < sm.total - 1.5; s += period) {
        pieces.push([s, Math.min(s + dash[0], sm.total - 1)]);
      }
    }
    for (const [s0, s1] of pieces) {
      if (s1 - s0 < 0.2) continue;
      const i0 = Math.max(0, Math.round((s0 / sm.total) * (sm.length - 1)));
      const i1 = Math.min(sm.length - 1, Math.round((s1 / sm.total) * (sm.length - 1)));
      const seg = sm.slice(i0, i1 + 1);
      if (seg.length < 2) continue;
      seg.total = seg[seg.length - 1].s - seg[0].s;
      const g = sweep(seg, [
        { u: mk.u - w / 2, dy: dyAt ? (p) => dyAt(p, mk.u) : 0.0 },
        { u: mk.u + w / 2, dy: dyAt ? (p) => dyAt(p, mk.u) : 0.0 },
      ], { lift: ELEV.roadMarking, uvScale: 0.3 });
      if (!g) continue;
      const m = mesh(g, material, null, null, null, { cast: false, receive: false });
      m.renderOrder = RENDER_ORDER.roadMarking;
      parent.add(m);
    }
  }

  /* ------------------------------------------------------------ intersections
     v3 had none: roads simply butted together, and the perimeter loop had four
     20 x 70 m holes where the corners should have been. */
  _buildIntersection(n) {
    const g = new THREE.Group();
    g.name = 'xn-' + n.id;
    const arms = n.arms;
    const poly = [];
    const corners = [];

    const armPts = arms.map((a) => {
      const nx = -a.dz, nz = a.dx;
      const bx = n.x + a.dx * n.trim, bz = n.z + a.dz * n.trim;
      return {
        a, L: [bx + nx * a.half, bz + nz * a.half], R: [bx - nx * a.half, bz - nz * a.half],
        nx, nz, mouth: [bx, bz],
      };
    });

    for (let i = 0; i < armPts.length; i++) {
      const cur = armPts[i], nxt = armPts[(i + 1) % armPts.length];
      poly.push(cur.R, cur.L);
      /* corner return between cur's left boundary and nxt's right boundary */
      const P = lineIntersect(
        cur.L, [cur.a.dx, cur.a.dz],
        nxt.R, [nxt.a.dx, nxt.a.dz]);
      const A = cur.L, B = nxt.R;
      const ctrl = P || [(A[0] + B[0]) / 2 + (A[0] - n.x) * 0.4,
                         (A[1] + B[1]) / 2 + (A[1] - n.z) * 0.4];
      const steps = 8;
      for (let k = 1; k < steps; k++) {
        const t = k / steps, it = 1 - t;
        poly.push([
          it * it * A[0] + 2 * it * t * ctrl[0] + t * t * B[0],
          it * it * A[1] + 2 * it * t * ctrl[1] + t * t * B[1],
        ]);
      }
      corners.push({ a: A, b: B, ctrl, mid: [
        0.25 * A[0] + 0.5 * ctrl[0] + 0.25 * B[0],
        0.25 * A[1] + 0.5 * ctrl[1] + 0.25 * B[1]] });
    }

    /* --- paving as one continuous surface clipped to the polygon */
    /* the same tiling as the carriageway sweep, or the junction reads as a
       different, darker material dropped on top of the road */
    const cell = Math.max(2.5, n.trim / 6);
    const pav = polyGrid(poly, cell, ELEV.asphalt, null, 0.14);
    if (pav) {
      const m = mesh(pav, MAT.asphalt, null, null, null, { cast: false });
      m.renderOrder = RENDER_ORDER.asphalt;
      g.add(m);
    }

    /* --- corner returns: curb swept along each fillet, with an ADA ramp */
    const truck = arms.some((a) => a.e.spec.truck);
    for (const c of corners) {
      const path = [];
      const steps = 10;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps, it = 1 - t;
        path.push([
          it * it * c.a[0] + 2 * it * t * c.ctrl[0] + t * t * c.b[0],
          it * it * c.a[1] + 2 * it * t * c.ctrl[1] + t * t * c.b[1],
        ]);
      }
      const sm = resamplePath(path, 1.2, 0);
      if (sm.length < 2) continue;
      const curbH = 0.15;
      const cg = sweep(sm, [
        { u: 0, dy: -0.03 },
        { u: 0, dy: curbH },
        { u: 0.16, dy: curbH + 0.012 },
        { u: 0.16, dy: -0.10 },
      ], { lift: ELEV.gutter, uvScale: 0.3 });
      if (cg) {
        const m = mesh(cg, MAT.concreteCurb);
        m.renderOrder = RENDER_ORDER.gutter;
        g.add(m);
      }
      /* ADA curb ramp with a truncated-dome detectable warning panel */
      const mid = sm[Math.floor(sm.length / 2)];
      this._curbRamp(g, mid.x, mid.z, Math.atan2(mid.nz, mid.nx));
    }

    /* --- crosswalks: continental bars across every mouth, aligned to the ramps */
    for (const ap of armPts) {
      const cls = ap.a.e.spec;
      if (cls.sidewalk === 'none' && !ap.a.e.opts.crosswalk) continue;
      this._crosswalk(g, ap.mouth[0], ap.mouth[1], ap.a.dx, ap.a.dz, ap.a.half);
      /* stop bar just behind the crosswalk on the approach */
      const off = 3.4;
      const bx = ap.mouth[0] + ap.a.dx * off, bz = ap.mouth[1] + ap.a.dz * off;
      const sb = sweep(resamplePath([
        [bx - ap.nx * ap.a.half * 0.02, bz - ap.nz * ap.a.half * 0.02],
        [bx + ap.a.dx * 0.02, bz + ap.a.dz * 0.02],
      ], 1, 0), [], {});
      const bar = decal(0.6, ap.a.half, bx, bz, MAT.markWhite, 'roadMarking',
        Math.atan2(ap.a.dz, ap.a.dx));
      bar.scale.set(1, 1, 1);
      g.add(bar);
      this.crossings.push({
        node: n, edge: ap.a.e, x: ap.mouth[0], z: ap.mouth[1],
        dx: ap.a.dx, dz: ap.a.dz, half: ap.a.half,
      });
    }

    /* --- traffic control lives in 18-intersections, which reads the graph
       and builds the MUTCD assemblies. The crude in-module version that used
       to live here ran AS WELL, so every signalised node carried two mast
       sets — and the crude one's lenses faced the node instead of the
       approaching driver. One owner now. */

    this.group.add(g);
    n.group = g;

    let rad = 0;
    for (const p of poly) rad = Math.max(rad, Math.hypot(p[0] - n.x, p[1] - n.z));
    const y = groundH(n.x, n.z);
    reserve({
      id: `xn-${n.id}`, layer: LAYER.ROAD,
      /* the FULL outline: the decimated polygon cut inside the corner arcs,
         which is how canopy trees passed validation while standing on the
         kerb returns. Clearance keeps planting off the corners entirely. */
      footprint: { poly },
      clearance: 2.0,
      y0: y - 0.4, y1: y + 0.5,
      groups: ['road', n.id],
      allowOverlapWith: ['road', ...n.edges.map(({ e }) => e.id), n.id],
      site: `intersection ${n.id}`,
    });
    n.polygon = poly;
    n.radius = rad;
  }

  _buildCulDeSac(n) {
    const arm = n.arms[0];
    if (!arm) return;
    const R = n.type === 'cul-de-sac' ? (n.radius || 17) : 12;
    const cx = n.x + arm.dx * R * 0.55, cz = n.z + arm.dz * R * 0.55;
    const g = new THREE.Group();
    g.name = 'cds-' + n.id;
    const poly = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      poly.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
    }
    /* the circulatory carriageway is an annulus around a central island */
    const RI = Math.max(3.2, R * 0.42);
    const hole = [];
    for (let i = 0; i < 28; i++) {
      const a = -(i / 28) * Math.PI * 2;
      hole.push([cx + Math.cos(a) * RI, cz + Math.sin(a) * RI]);
    }
    const pav = polyGrid(poly, 1.6, ELEV.asphalt, [hole], 0.14);
    if (pav) { const m = mesh(pav, MAT.asphalt, null, null, null, { cast: false });
               m.renderOrder = RENDER_ORDER.asphalt; g.add(m); }

    const ringCurb = (rad, lift2) => {
      const ring = [];
      for (let i = 0; i <= 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        ring.push([cx + Math.cos(a) * rad, cz + Math.sin(a) * rad]);
      }
      const sm2 = resamplePath(ring, 1.2, 0);
      return sweep(sm2, [
        { u: 0, dy: -0.03 }, { u: 0, dy: 0.15 },
        { u: 0.16, dy: 0.162 }, { u: 0.16, dy: -0.10 },
      ], { lift: lift2, uvScale: 0.3 });
    };
    const cg = ringCurb(R, ELEV.gutter);
    if (cg) { const m = mesh(cg, MAT.concreteCurb); m.renderOrder = RENDER_ORDER.gutter; g.add(m); }
    /* the island: raised kerb, mulch bed, a specimen tree and a lit bollard ring */
    const ig = ringCurb(RI, ELEV.gutter);
    if (ig) { const m = mesh(ig, MAT.concreteCurb); m.renderOrder = RENDER_ORDER.gutter; g.add(m); }
    {
      const iy = groundH(cx, cz);
      const disc = new THREE.CircleGeometry(RI - 0.05, 40);
      disc.rotateX(-Math.PI / 2);
      disc.translate(cx, iy + ELEV.paver + 0.14, cz);
      const uvA = disc.attributes.uv, pA = disc.attributes.position;
      for (let i = 0; i < pA.count; i++) uvA.setXY(i, pA.getX(i), pA.getZ(i));
      const dm = mesh(disc, MAT.mulch, null, null, null, { cast: false });
      dm.renderOrder = RENDER_ORDER.paver; g.add(dm);
      g.add(mesh(cyl(0.30, 0.42, 5.6, 10), MAT.barkOak, cx, iy + 2.8, cz));
      for (let i = 0; i < 3; i++) {
        const cone = new THREE.ConeGeometry(RI * 0.62 - i * 0.5, 3.0, 12, 1, true);
        g.add(mesh(cone, MAT.folOak, cx, iy + 4.6 + i * 1.5, cz));
      }
      const n2 = Math.max(6, Math.round(RI * 1.4));
      for (let i = 0; i < n2; i++) {
        const a = (i / n2) * Math.PI * 2;
        const bx = cx + Math.cos(a) * (RI - 0.9), bz2 = cz + Math.sin(a) * (RI - 0.9);
        g.add(mesh(cyl(0.09, 0.10, 0.85, 8), MAT.steelDark, bx, groundH(bx, bz2) + 0.42, bz2));
      }
    }
    /* yield line where the approach meets the circulatory lane */
    if (arm) {
      const yx = n.x + arm.dx * 2.5, yz = n.z + arm.dz * 2.5;
      g.add(decal(arm.e.spec.width * 0.9, 0.5, yx, yz, MAT.markWhite, 'roadMarking',
        Math.atan2(arm.dz, arm.dx)));
    }
    this.group.add(g);
    n.group = g;
    n.cds = { cx, cz, R };
    const y = groundH(cx, cz);
    reserve({
      id: `cds-${n.id}`, layer: LAYER.ROAD, footprint: { x: cx, z: cz, r: R + 0.6 },
      y0: y - 0.4, y1: y + 0.4,
      groups: ['road', n.id],
      allowOverlapWith: ['road', ...n.edges.map(({ e }) => e.id), n.id],
      site: `cul-de-sac ${n.id}`,
    });
  }

  /* an ADA curb ramp assembly: flare, ramp, landing, detectable warning */
  _curbRamp(parent, x, z, outAng) {
    const dx = Math.cos(outAng), dz = Math.sin(outAng);
    const y = groundH(x, z);
    const g = new THREE.Group();
    /* the ramp itself, sloping from the gutter up to the walk */
    const rampL = 1.9, rampW = 1.6;
    const geo = new THREE.BufferGeometry();
    const px = x - dx * 0.1, pz = z - dz * 0.1;
    const nx = -dz, nz = dx;
    const v = [
      px + nx * rampW / 2, y + ELEV.gutter - 0.02, pz + nz * rampW / 2,
      px - nx * rampW / 2, y + ELEV.gutter - 0.02, pz - nz * rampW / 2,
      px - nx * rampW / 2 - dx * rampL, y + ELEV.concreteWalk + 0.16, pz - nz * rampW / 2 - dz * rampL,
      px + nx * rampW / 2 - dx * rampL, y + ELEV.concreteWalk + 0.16, pz + nz * rampW / 2 - dz * rampL,
    ];
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 2, 1, 0, 3, 2]);
    geo.computeVertexNormals();
    const rm = mesh(geo, MAT.concreteWalk, null, null, null, { cast: false });
    rm.renderOrder = RENDER_ORDER.concreteWalk;
    g.add(rm);
    /* truncated-dome detectable warning panel at the bottom of the ramp */
    const panel = decal(rampW, 0.62, px - dx * 0.34, pz - dz * 0.34, MAT.tactile, 'decal', outAng);
    g.add(panel);
    const domeGeo = new THREE.CylinderGeometry(0.017, 0.023, 0.005, 6);
    const tr = [];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 3; j++) {
        const lu = (i / 5 - 0.5) * (rampW - 0.16);
        const lv = (j / 2 - 0.5) * 0.44;
        tr.push({ x: px - dx * 0.34 + nx * lu - dx * lv,
                  y: y + ELEV.decal + 0.004,
                  z: pz - dz * 0.34 + nz * lu - dz * lv, s: 1 });
      }
    }
    g.add(instanced(domeGeo, MAT.tactile, tr, { cast: false }));
    parent.add(g);
  }

  _crosswalk(parent, x, z, dx, dz, half) {
    const nx = -dz, nz = dx;
    const bars = Math.max(4, Math.floor((half * 2 - 0.6) / 0.9));
    const barW = 0.45, len = 2.8;
    for (let i = 0; i < bars; i++) {
      const t = (i / (bars - 1) - 0.5) * (half * 2 - 0.9);
      const bx = x + nx * t + dx * 1.0, bz = z + nz * t + dz * 1.0;
      const geo = new THREE.PlaneGeometry(barW, len, 1, 3);
      geo.rotateX(-Math.PI / 2);
      geo.rotateY(-Math.atan2(dz, dx));
      geo.translate(bx, 0, bz);
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) p.setY(k, groundH(p.getX(k), p.getZ(k)) + ELEV.crosswalk);
      geo.computeVertexNormals();
      const m = mesh(geo, MAT.markWhite, null, null, null, { cast: false, receive: false });
      m.renderOrder = RENDER_ORDER.crosswalk;
      parent.add(m);
    }
  }


  /* --------------------------------------------------------------- driveways
     Every lot, dock and service entry connects to a road through a generated
     apron. In v3 both visitor parking lots were marooned 11.5 m from the
     nearest pavement across open lawn. */
  apron(id, fromEdge, atS, side, toX, toZ, width, cls) {
    const e = typeof fromEdge === 'string' ? this.edges.find((q) => q.id === fromEdge) : fromEdge;
    if (!e) throw new Error(`[roads] apron ${id}: unknown edge`);
    const sm = e.geomSamples || e.samples;
    const i = clamp(Math.round((atS / sm.total) * (sm.length - 1)), 0, sm.length - 1);
    const p = sm[i];
    const h = e.half + (e.spec.curbW || 0);
    const sx = p.x + p.nx * side * h, sz = p.z + p.nz * side * h;
    const g = new THREE.Group();
    g.name = 'apron-' + id;
    const w = width || 7.5;

    /* flared apron: wide at the road, narrowing to the drive width */
    const path = resamplePath([[sx, sz], [toX, toZ]], 1.2, 0);
    if (path.length < 2) return null;
    const flare = (smp, t) => lerp(w / 2 + 3.2, w / 2, clamp(t * 2.2, 0, 1));
    const pav = sweep(path, [
      { u: (s2, t) => -flare(s2, t), dy: 0 },
      { u: 0, dy: 0.02 },
      { u: (s2, t) => flare(s2, t), dy: 0 },
    ], { lift: ELEV.asphalt, uvScale: 0.16 });
    if (pav) { const m = mesh(pav, MAT.asphalt, null, null, null, { cast: false });
               m.renderOrder = RENDER_ORDER.asphalt; g.add(m); }
    /* flush curb transition across the apron mouth */
    for (const sg of [-1, 1]) {
      const cg = sweep(path.slice(0, 5), [
        { u: (s2, t) => sg * flare(s2, t), dy: 0 },
        { u: (s2, t) => sg * (flare(s2, t) + 0.16), dy: 0.02 },
      ], { lift: ELEV.gutter, uvScale: 0.3 });
      if (cg) { const m = mesh(cg, MAT.concreteCurb, null, null, null, { cast: false });
                m.renderOrder = RENDER_ORDER.gutter; g.add(m); }
    }
    this.group.add(g);
    this.aprons.push({ id, x: sx, z: sz, toX, toZ });

    const cx = (sx + toX) / 2, cz = (sz + toZ) / 2;
    const L = Math.hypot(toX - sx, toZ - sz);
    const y = groundH(cx, cz);
    reserve({
      id: `apron-${id}`, layer: LAYER.ROAD,
      footprint: { x: cx, z: cz, w: L + 2, d: w + 7, rot: Math.atan2(toZ - sz, toX - sx) },
      y0: y - 0.3, y1: y + 0.3,
      groups: ['road', 'apron'],
      allowOverlapWith: ['road', 'apron', e.id, e.a.id, e.b.id],
      site: `apron ${id}`,
    });
    return g;
  }

  destination(id, x, z, kind) {
    this.destinations.set(id, { id, x, z, kind: kind || 'vehicle' });
  }
}

/* ------------------------------------------------------------------ helpers */

function lineIntersect(p, d, q, e) {
  const den = d[0] * e[1] - d[1] * e[0];
  if (Math.abs(den) < 1e-6) return null;
  const t = ((q[0] - p[0]) * e[1] - (q[1] - p[1]) * e[0]) / den;
  if (t < 0 || t > 120) return null;
  return [p[0] + d[0] * t, p[1] + d[1] * t];
}

/* grid-fill a polygon, dropped onto the terrain */
export function polyGrid(poly, cell, lift, holes, uvScale) {
  const uvs = uvScale || 1;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const pos = [], uv = [], idx = [];
  const cols = nx + 1;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      let x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz);
      /* pull boundary vertices onto the polygon edge so the outline is clean */
      pos.push(x, groundH(x, z) + lift, z);
      uv.push(x * uvs, z * uvs);
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const cx = lerp(x0, x1, (i + 0.5) / nx), cz = lerp(z0, z1, (j + 0.5) / nz);
      if (!pointInPoly(cx, cz, poly)) continue;
      if (holes && holes.some((h) => pointInPoly(cx, cz, h))) continue;
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function stopSign(x, z, face) {
  const g = new THREE.Group();
  const y = groundH(x, z);
  g.add(mesh(cyl(0.045, 0.05, 2.4, 8), MAT.galv, x, y + 1.2, z));
  const oct = new THREE.CylinderGeometry(0.38, 0.38, 0.03, 8);
  const s = mesh(oct, MAT.markRed, x, y + 2.25, z, { rotX: Math.PI / 2, rotY: face });
  s.rotation.set(Math.PI / 2, 0, 0);
  s.rotation.z = -face;
  g.add(s);
  return g;
}
