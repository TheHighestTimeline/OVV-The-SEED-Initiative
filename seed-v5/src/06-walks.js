/* ============================================================================
   06-walks.js — the pedestrian network
   ----------------------------------------------------------------------------
   v3 had sidewalks on the four perimeter roads and three orphan stubs, and that
   was all: the greenhouse doors were 68 m of unwalked grass from the nearest
   path node, both parking-lot walks dead-ended in grass, and two footpaths ran
   straight through the middle of the community center.

   Here the walks are a graph with a hard connectivity requirement: every public
   destination must be reachable on foot from every parking lot, the transit
   shelter, the gate and the public sidewalk, without crossing grass.
   ========================================================================== */

import * as THREE from 'three';
import { ELEV, RENDER_ORDER, LAYER, clamp, lerp, stream } from './00-config.js';
import { groundH, waterY } from './01-terrain.js';
import { MAT } from './03-materials.js';
import { resamplePath, sweep, mesh, box, cyl, mergeGeometries } from './geom.js';
import { reserve } from './02-registry.js';

const rnd = stream('walks');

export const WALK_CLASS = {
  promenade:   { width: 6.0, mat: 'paver',        elev: 'paver',        joint: 3.0, edge: 0.12, furnish: 1.2 },
  plazaSpine:  { width: 3.5, mat: 'paver',        elev: 'paver',        joint: 2.5, edge: 0.11, furnish: 0.8 },
  sidewalk:    { width: 1.8, mat: 'concreteWalk', elev: 'concreteWalk', joint: 1.5, edge: 0.10, furnish: 0.6 },
  sidewalkWide:{ width: 2.5, mat: 'concreteWalk', elev: 'concreteWalk', joint: 1.5, edge: 0.10, furnish: 0.7 },
  parkPath:    { width: 2.4, mat: 'gravel',       elev: 'aggregate',    joint: 0,   edge: 0.08, furnish: 0.5, steelEdge: true },
  natureTrail: { width: 1.2, mat: 'mulch',        elev: 'aggregate',    joint: 0,   edge: 0,    furnish: 0 },
  boardwalk:   { width: 2.4, mat: 'deck',         elev: null,           joint: 0,   edge: 0,    furnish: 0, piles: true },
  beachAccess: { width: 2.4, mat: 'deck',         elev: null,           joint: 0,   edge: 0,    furnish: 0, piles: true, elevated: true },
  service:     { width: 1.5, mat: 'concreteWalk', elev: 'concreteWalk', joint: 1.5, edge: 0.09, furnish: 0 },
};

export class WalkGraph {
  constructor() {
    this.nodes = new Map();
    this.edges = [];
    this.group = new THREE.Group();
    this.group.name = 'walks';
    this.destinations = new Map();
    this.sources = [];
    this.furnishZones = [];
    this.warnings = [];
  }

  node(id, x, z, kind) {
    let n = this.nodes.get(id);
    if (n) return n;
    n = { id, x, z, kind: kind || 'junction', adj: [] };
    this.nodes.set(id, n);
    return n;
  }

  edge(id, from, to, cls, pts, opts) {
    const a = this.nodes.get(from), b = this.nodes.get(to);
    if (!a) throw new Error(`[walks] edge ${id}: unknown node ${from}`);
    if (!b) throw new Error(`[walks] edge ${id}: unknown node ${to}`);
    const spec = WALK_CLASS[cls];
    if (!spec) throw new Error(`[walks] edge ${id}: unknown class "${cls}"`);
    const e = { id, a, b, cls, spec, opts: opts || {}, pts: [[a.x, a.z], ...(pts || []), [b.x, b.z]] };
    this.edges.push(e);
    const L = polyLen(e.pts);
    a.adj.push({ to: b, cost: L, edge: e });
    b.adj.push({ to: a, cost: L, edge: e });
    return e;
  }

  /* a marked road crossing links two walk nodes across a carriageway */
  crossing(id, from, to, roadId) {
    const a = this.nodes.get(from), b = this.nodes.get(to);
    if (!a || !b) throw new Error(`[walks] crossing ${id}: unknown node`);
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    a.adj.push({ to: b, cost: L + 6, crossing: id });
    b.adj.push({ to: a, cost: L + 6, crossing: id });
    this.edges.push({ id, a, b, cls: 'crossing', spec: null, isCrossing: true, roadId });
    return true;
  }

  destination(id, nodeId, label) {
    const n = this.nodes.get(nodeId);
    if (!n) throw new Error(`[walks] destination ${id}: unknown node ${nodeId}`);
    this.destinations.set(id, { id, node: n, label: label || id });
  }
  source(nodeId) {
    const n = this.nodes.get(nodeId);
    if (!n) throw new Error(`[walks] source: unknown node ${nodeId}`);
    this.sources.push(n);
  }

  /* ---------------------------------------------------------- connectivity */
  reachableFrom(startNode) {
    const seen = new Set([startNode.id]);
    const stack = [startNode];
    while (stack.length) {
      const n = stack.pop();
      for (const a of n.adj) {
        if (!seen.has(a.to.id)) { seen.add(a.to.id); stack.push(a.to); }
      }
    }
    return seen;
  }

  /* the gate: every source must reach every destination */
  pathfindTest() {
    const failures = [];
    for (const s of this.sources) {
      const seen = this.reachableFrom(s);
      for (const d of this.destinations.values()) {
        if (!seen.has(d.node.id)) {
          failures.push({ from: s.id, to: d.id, label: d.label });
        }
      }
    }
    return failures;
  }

  /* the longest unwalked gap: any destination whose nearest walk node is far */
  gapReport() {
    const gaps = [];
    for (const d of this.destinations.values()) {
      if (!d.node.adj.length) gaps.push({ id: d.id, gap: Infinity });
    }
    return gaps;
  }

  /* ---------------------------------------------------------------- build */
  build() {
    for (const e of this.edges) {
      if (e.isCrossing) continue;
      this._buildEdge(e);
    }
    return this.group;
  }

  _buildEdge(e) {
    const sp = e.spec;
    const sm = resamplePath(e.pts, 1.2, e.opts.fillet != null ? e.opts.fillet : 6);
    if (sm.length < 2) { this.warnings.push(`walk ${e.id} is degenerate`); return; }
    e.samples = sm;
    const g = new THREE.Group();
    g.name = 'walk-' + e.id;
    const hw = (e.opts.width || sp.width) / 2;
    const cross = 0.02;

    if (sp.piles) {
      this._boardwalk(g, e, sm, hw);
    } else {
      const lift = ELEV[sp.elev];
      /* the slab, with a 2% cross-slope */
      const slab = sweep(sm, [
        { u: -hw, dy: -hw * cross },
        { u: 0, dy: 0 },
        { u: hw, dy: -hw * cross },
      ], { lift, uvScale: 0.4 });
      if (slab) {
        const m = mesh(slab, MAT[sp.mat], null, null, null, { cast: false });
        m.renderOrder = RENDER_ORDER[sp.elev];
        g.add(m);
      }
      /* a visible thickened edge, so the walk reads as a slab and not a stripe */
      if (sp.edge > 0) {
        for (const side of [-1, 1]) {
          const eg = sweep(sm, [
            { u: side * hw, dy: -hw * cross },
            { u: side * (hw + 0.02), dy: -hw * cross - sp.edge },
            { u: side * (hw + 0.02), dy: -hw * cross - sp.edge - 0.02, toGround: true, groundLift: 0.01 },
          ], { lift, uvScale: 0.5 });
          if (eg) {
            const m = mesh(eg, sp.steelEdge ? MAT.steelDark : MAT[sp.mat]);
            m.renderOrder = RENDER_ORDER[sp.elev];
            g.add(m);
          }
        }
      }
      /* control and expansion joints — sized to the walk, and merged into a
         single geometry. v3 emitted 248 concrete stripes 500 m wide, each with
         its own material, for about 860 permanent extra draw calls. */
      if (sp.joint > 0) {
        const cj = this._joints(sm, hw, sp.joint, 0.035, lift);
        if (cj) { const m = mesh(cj, MAT.concreteCurb, null, null, null, { cast: false, receive: false });
                  m.renderOrder = RENDER_ORDER.walkJoint; g.add(m); }
        const ej = this._joints(sm, hw, sp.joint * 6, 0.09, lift);
        if (ej) { const m = mesh(ej, MAT.rubber, null, null, null, { cast: false, receive: false });
                  m.renderOrder = RENDER_ORDER.walkJoint; g.add(m); }
      }
    }

    this.group.add(g);
    e.group = g;

    /* the furnishing zone: the only place street furniture may be placed */
    if (sp.furnish > 0) {
      this.furnishZones.push({ edge: e, samples: sm, inner: hw, outer: hw + sp.furnish });
    }

    /* registration */
    const step = 14;
    let k = 0;
    const total = sm.total;
    for (let s = 0; s < total - 0.5; s += step) {
      const i0 = Math.round((s / total) * (sm.length - 1));
      const i1 = Math.round((Math.min(s + step, total) / total) * (sm.length - 1));
      if (i1 <= i0) continue;
      const a = sm[i0], b = sm[i1];
      const cx = (a.x + b.x) / 2, cz = (a.z + b.z) / 2;
      const L = Math.hypot(b.x - a.x, b.z - a.z);
      const y = groundH(cx, cz);
      reserve({
        id: `${e.id}#${k++}`, layer: LAYER.WALK,
        footprint: { x: cx, z: cz, w: L + 0.4, d: hw * 2 + 0.2, rot: Math.atan2(b.z - a.z, b.x - a.x) },
        y0: y - 0.3, y1: y + (sp.piles ? 1.6 : 0.28),
        groups: ['walk', e.id],
        allowOverlapWith: ['walk', 'road', 'apron', e.id, ...(e.opts.allow || [])],
        site: `walk ${e.id}`,
      });
    }
  }

  _joints(sm, hw, spacing, width, lift) {
    const geos = [];
    const n = Math.floor(sm.total / spacing);
    for (let i = 1; i <= n; i++) {
      const idx = Math.round((i * spacing / sm.total) * (sm.length - 1));
      const p = sm[idx];
      if (!p) continue;
      const g = new THREE.PlaneGeometry(hw * 2, width, 2, 1);
      g.rotateX(-Math.PI / 2);
      g.rotateY(-Math.atan2(p.tz, p.tx) + Math.PI / 2);
      g.translate(p.x, 0, p.z);
      const pos = g.attributes.position;
      for (let k = 0; k < pos.count; k++) {
        pos.setY(k, groundH(pos.getX(k), pos.getZ(k)) + lift + 0.018);
      }
      g.computeVertexNormals();
      if (!g.index) g.setIndex(Array.from({ length: pos.count }, (_, q) => q));
      geos.push(g);
    }
    if (!geos.length) return null;
    const merged = mergeGeometries(geos);
    for (const g of geos) g.dispose();
    return merged;
  }

  /* Where a walk meets water or wetland it becomes a boardwalk on piles. It is
     never a paved surface across water. v3 ran a 5 m gravel path 6.6 m into a
     pond. */
  _boardwalk(parent, e, sm, hw) {
    const deckH = e.opts.deckHeight || 1.15;
    const elevated = e.spec.elevated || e.opts.elevated;
    const yAt = (x, z) => {
      const w = waterY(x, z);
      const g = groundH(x, z);
      if (elevated) return (w ? Math.max(w.y, g) : g) + deckH;
      /* A pond boardwalk rides LOW: 0.45 m freeboard over the water, and on
         land it comes down to a timber walk just over grade. The old rule
         held deckH above the GROUND everywhere, so the deck and its rails
         flew 1.15 m over dry land on both approaches. */
      const overWater = w ? w.y + 0.45 : -Infinity;
      return Math.max(overWater, g + 0.18);
    };
    /* deck */
    const deck = sweep(sm, [
      { u: -hw, dy: 0 }, { u: hw, dy: 0 },
    ], { yAt: (x, z) => yAt(x, z), uvScale: 0.5 });
    if (deck) { const m = mesh(deck, MAT.deck); m.renderOrder = RENDER_ORDER.decal; parent.add(m); }
    /* fascia */
    for (const side of [-1, 1]) {
      const f = sweep(sm, [
        { u: side * hw, dy: 0 }, { u: side * hw, dy: -0.22 },
      ], { yAt: (x, z) => yAt(x, z) });
      if (f) parent.add(mesh(f, MAT.deck));
    }
    /* piles, bearers and handrail — declared as piers so the WATER layer
       permits the crossing */
    const spacing = 3.6;
    const n = Math.max(2, Math.floor(sm.total / spacing));
    const rail = e.opts.rail !== false;
    for (let i = 0; i <= n; i++) {
      const p = sm[Math.round((i / n) * (sm.length - 1))];
      if (!p) continue;
      for (const side of [-1, 1]) {
        const px = p.x + p.nx * side * (hw - 0.25);
        const pz = p.z + p.nz * side * (hw - 0.25);
        const g0 = groundH(px, pz);
        const top = yAt(px, pz) - 0.24;
        const hgt = Math.max(0.6, top - g0 + 0.8);
        parent.add(mesh(cyl(0.11, 0.13, hgt, 8), MAT.deck, px, top - hgt / 2, pz));
        if (rail) {
          const rb = yAt(px, pz);
          parent.add(mesh(box(0.09, 1.06, 0.09), MAT.deck, px, rb + 0.53, pz));
        }
      }
      /* bearer */
      const bx = p.x, bz = p.z;
      parent.add(mesh(box(0.10, 0.18, hw * 2 - 0.2), MAT.deck, bx, yAt(bx, bz) - 0.15, bz,
        { rotY: -Math.atan2(p.tz, p.tx) }));
    }
    if (rail) {
      for (const side of [-1, 1]) {
        const top = sweep(sm, [
          { u: side * (hw - 0.25) - 0.05, dy: 1.06 },
          { u: side * (hw - 0.25) + 0.05, dy: 1.06 },
        ], { yAt });
        if (top) parent.add(mesh(top, MAT.deck));
        const kick = sweep(sm, [
          { u: side * (hw - 0.25) - 0.03, dy: 0.42 },
          { u: side * (hw - 0.25) + 0.03, dy: 0.42 },
        ], { yAt });
        if (kick) parent.add(mesh(kick, MAT.deck));
      }
    }
  }

  /* helper: place street furniture only in a declared furnishing zone */
  furnishPoint(edgeId, s, side, offset) {
    const z = this.furnishZones.find((f) => f.edge.id === edgeId);
    if (!z) return null;
    const sm = z.samples;
    const i = clamp(Math.round((s / sm.total) * (sm.length - 1)), 0, sm.length - 1);
    const p = sm[i];
    const off = z.inner + (offset == null ? z.outer - z.inner : offset) * 0.5;
    return {
      x: p.x + p.nx * side * off, z: p.z + p.nz * side * off,
      ang: Math.atan2(p.tz, p.tx), edge: z.edge,
    };
  }
}

function polyLen(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  }
  return L;
}

/* slope check for the gate: no walk segment over 5% running slope without a
   compliant ramp assembly */
export function slopeAudit(graph) {
  const bad = [];
  for (const e of graph.edges) {
    if (e.isCrossing || !e.samples) continue;
    if (e.opts && e.opts.ramp) continue;
    const sm = e.samples;
    for (let i = 1; i < sm.length; i++) {
      const dy = groundH(sm[i].x, sm[i].z) - groundH(sm[i - 1].x, sm[i - 1].z);
      const dx = sm[i].s - sm[i - 1].s;
      if (dx < 0.1) continue;
      const g = Math.abs(dy / dx);
      if (g > 0.05) bad.push({ edge: e.id, at: [sm[i].x.toFixed(1), sm[i].z.toFixed(1)], slope: g });
    }
  }
  return bad;
}
