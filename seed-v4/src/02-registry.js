/* ============================================================================
   02-registry.js — the placement validator
   ----------------------------------------------------------------------------
   In v3 only trees went through a validator. In v4 nothing reaches the scene
   graph except through place(). A conflict throws; it is never silently nudged,
   because silent nudging is how v3's forty interpenetrations became invisible.
   ========================================================================== */

import * as THREE from 'three';
import { LAYER } from './00-config.js';

/* ------------------------------------------------------------ shape helpers */

/* A footprint is normalised to a convex polygon in world XZ plus a bounding
   circle for the broad phase. Rectangles, rotated rectangles, circles and
   explicit convex polygons all reduce to this. */
function normaliseFootprint(fp, id) {
  let pts;
  if (fp.poly) {
    pts = fp.poly.map((p) => [p[0], p[1]]);
    if (pts.length < 3) throw new Error(`[registry] ${id}: polygon needs >= 3 points`);
  } else if (fp.r != null) {
    /* circle -> 16-gon; slightly circumscribed so it never under-reports */
    const n = 16, k = 1 / Math.cos(Math.PI / n);
    pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push([fp.x + Math.cos(a) * fp.r * k, fp.z + Math.sin(a) * fp.r * k]);
    }
  } else {
    const hw = fp.w / 2, hd = fp.d / 2, rot = fp.rot || 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    pts = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) =>
      [fp.x + lx * c - lz * s, fp.z + lx * s + lz * c]);
  }
  let cx = 0, cz = 0;
  for (const p of pts) { cx += p[0]; cz += p[1]; }
  cx /= pts.length; cz /= pts.length;
  let rad = 0;
  for (const p of pts) rad = Math.max(rad, Math.hypot(p[0] - cx, p[1] - cz));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1]; if (p[1] > maxZ) maxZ = p[1];
  }
  return { pts, cx, cz, rad, minX, maxX, minZ, maxZ };
}

/* Inflate a convex polygon outward by d along its vertex bisectors. Good enough
   for clearance bands; exact for rectangles. */
function inflate(shape, d) {
  if (d <= 0) return shape;
  const pts = shape.pts.map(([x, z]) => {
    const dx = x - shape.cx, dz = z - shape.cz;
    const L = Math.hypot(dx, dz) || 1;
    return [x + (dx / L) * d, z + (dz / L) * d];
  });
  return { ...shape, pts, rad: shape.rad + d,
    minX: shape.minX - d, maxX: shape.maxX + d,
    minZ: shape.minZ - d, maxZ: shape.maxZ + d };
}

/* SAT on two convex polygons. Returns 0 when disjoint, otherwise the minimum
   translation depth in metres — the number we report to the operator. */
function satOverlap(A, B) {
  let best = Infinity;
  for (const poly of [A, B]) {
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const p = poly[i], q = poly[(i + 1) % n];
      let ax = -(q[1] - p[1]), az = (q[0] - p[0]);
      const L = Math.hypot(ax, az); if (L < 1e-9) continue;
      ax /= L; az /= L;
      let aMin = Infinity, aMax = -Infinity, bMin = Infinity, bMax = -Infinity;
      for (const v of A) { const d = v[0] * ax + v[1] * az; if (d < aMin) aMin = d; if (d > aMax) aMax = d; }
      for (const v of B) { const d = v[0] * ax + v[1] * az; if (d < bMin) bMin = d; if (d > bMax) bMax = d; }
      const o = Math.min(aMax, bMax) - Math.max(aMin, bMin);
      if (o <= 0) return 0;
      if (o < best) best = o;
    }
  }
  return best === Infinity ? 0 : best;
}

/* ---------------------------------------------------------- collision matrix
   Default is FORBID. 'declared' means the pair is legal only when one entry
   names the other (or its group) in allowOverlapWith. 'allow' is unconditional.
   Vertical separation is tested first and independently: two footprints that
   overlap in plan but not in elevation never collide, which is what lets a
   solar carport sit over a parking aisle and a boardwalk cross a creek.      */
const M = {};
function rule(a, b, v) { M[a + '|' + b] = v; M[b + '|' + a] = v; }
const L = LAYER;

rule(L.STRUCTURE, L.STRUCTURE, 'declared');   /* only a declared connected complex */
rule(L.STRUCTURE, L.ROAD,      'forbid');
/* 'declared', not 'forbid': a stage inside a plaza and a restroom block on a
   paved square are legitimate, but each one has to say so explicitly. The
   default is still to reject. */
rule(L.STRUCTURE, L.WALK,      'declared');
rule(L.STRUCTURE, L.PROP,      'forbid');
rule(L.STRUCTURE, L.VEGETATION,'forbid');
rule(L.STRUCTURE, L.UTILITY,   'forbid');
rule(L.STRUCTURE, L.WATER,     'declared');   /* piers, intakes, outfalls */
rule(L.STRUCTURE, L.CANOPY,    'declared');   /* attached entry canopy, carport */
rule(L.STRUCTURE, L.MARKER,    'allow');

rule(L.ROAD, L.ROAD,       'declared');       /* only at an intersection node */
rule(L.ROAD, L.WALK,       'declared');       /* only at a crossing node */
rule(L.ROAD, L.PROP,       'declared');       /* only furnishing-zone items */
rule(L.ROAD, L.VEGETATION, 'forbid');
rule(L.ROAD, L.UTILITY,    'forbid');
rule(L.ROAD, L.WATER,      'declared');       /* culvert / bridge */
rule(L.ROAD, L.CANOPY,     'declared');
rule(L.ROAD, L.MARKER,     'allow');

rule(L.WALK, L.WALK,       'declared');       /* only at a junction node */
rule(L.WALK, L.PROP,       'declared');       /* furnishing zone */
rule(L.WALK, L.VEGETATION, 'declared');       /* tree grates */
rule(L.WALK, L.UTILITY,    'forbid');
rule(L.WALK, L.WATER,      'declared');       /* boardwalk piers */
rule(L.WALK, L.CANOPY,     'declared');
rule(L.WALK, L.MARKER,     'allow');

rule(L.PROP, L.PROP,       'forbid');
rule(L.PROP, L.VEGETATION, 'forbid');
rule(L.PROP, L.UTILITY,    'forbid');
rule(L.PROP, L.WATER,      'declared');
rule(L.PROP, L.CANOPY,     'declared');
rule(L.PROP, L.MARKER,     'allow');

rule(L.VEGETATION, L.VEGETATION, 'forbid');
rule(L.VEGETATION, L.UTILITY,    'forbid');
rule(L.VEGETATION, L.WATER,      'declared');  /* emergent + marsh species */
rule(L.VEGETATION, L.CANOPY,     'forbid');
rule(L.VEGETATION, L.MARKER,     'allow');

rule(L.UTILITY, L.UTILITY, 'declared');        /* berm + wall share a centreline */
rule(L.UTILITY, L.WATER,   'declared');
rule(L.UTILITY, L.CANOPY,  'forbid');
rule(L.UTILITY, L.MARKER,  'allow');

rule(L.WATER, L.WATER,   'allow');
rule(L.WATER, L.CANOPY,  'declared');
rule(L.WATER, L.MARKER,  'allow');

rule(L.CANOPY, L.CANOPY, 'forbid');
rule(L.CANOPY, L.MARKER, 'allow');
rule(L.MARKER, L.MARKER, 'allow');

/* TERRAIN never registers a footprint; it is the ground everything sits on. */
for (const k of Object.keys(L)) rule(L.TERRAIN, L[k], 'allow');

function matrix(a, b) { return M[a + '|' + b] || 'forbid'; }

/* ================================================================ Registry */

const CELL = 32;

export class Registry {
  constructor() {
    this.entries = [];
    this.byId = new Map();
    this.grid = new Map();
    this.violations = [];
    this.strict = true;          /* throw on conflict */
    this.stats = { placed: 0, reserved: 0, rejected: 0 };
  }

  _key(ix, iz) { return ix + ':' + iz; }

  _insert(e) {
    /* Insert by the INFLATED bounds. Inserting by the raw footprint while
       querying by the inflated one let an entry's clearance band straddle a
       cell boundary and go unseen: a pair could pass placement and then turn
       up in the audit, which is exactly what three plantings did. */
    const s = e.clearance > 0 ? inflate(e.shape, e.clearance) : e.shape;
    const x0 = Math.floor(s.minX / CELL), x1 = Math.floor(s.maxX / CELL);
    const z0 = Math.floor(s.minZ / CELL), z1 = Math.floor(s.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = this._key(ix, iz);
        let a = this.grid.get(k);
        if (!a) { a = []; this.grid.set(k, a); }
        a.push(e);
      }
    }
  }

  _near(shape) {
    const out = new Set();
    const x0 = Math.floor(shape.minX / CELL), x1 = Math.floor(shape.maxX / CELL);
    const z0 = Math.floor(shape.minZ / CELL), z1 = Math.floor(shape.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const a = this.grid.get(this._key(ix, iz));
        if (a) for (const e of a) out.add(e);
      }
    }
    return out;
  }

  /* does `a` explicitly permit overlapping `b`? groups let a whole road or
     building complex be whitelisted in one declaration. */
  static permits(a, b) {
    const w = a.allowOverlapWith;
    if (!w || !w.length) return false;
    for (const t of w) {
      if (t === '*') return true;
      if (t === b.id) return true;
      if (b.groups && b.groups.indexOf(t) >= 0) return true;
      if (t === b.layer) return true;
    }
    return false;
  }

  /* the single conflict test */
  conflict(cand) {
    const infl = inflate(cand.shape, cand.clearance || 0);
    const near = this._near(infl);
    const hits = [];
    for (const e of near) {
      if (e === cand) continue;
      if (e.id === cand.id) continue;
      /* vertical separation: 0.005 m tolerance so coplanar ledger layers
         (asphalt at +0.055 vs marking at +0.090) are not treated as solids */
      const gap = Math.max(cand.y0 - e.y1, e.y0 - cand.y1);
      if (gap > 0.004) continue;

      const m = matrix(cand.layer, e.layer);
      if (m === 'allow') continue;
      if (m === 'declared' &&
          (Registry.permits(cand, e) || Registry.permits(e, cand))) continue;

      const other = inflate(e.shape, e.clearance || 0);
      /* broad phase */
      if (Math.hypot(infl.cx - other.cx, infl.cz - other.cz) > infl.rad + other.rad) continue;
      const depth = satOverlap(infl.pts, other.pts);
      if (depth > 0.001) {
        hits.push({ other: e, depth, rule: m });
      }
    }
    hits.sort((a, b) => b.depth - a.depth);
    return hits;
  }

  /* register a footprint with no geometry — keep-outs, corridors, nodes */
  reserve(spec) {
    const id = spec.id;
    if (!id) throw new Error('[registry] every entry needs an id');
    if (this.byId.has(id)) throw new Error(`[registry] duplicate id "${id}"`);
    if (!spec.layer || !LAYER[spec.layer]) {
      throw new Error(`[registry] "${id}" has no valid layer (got ${spec.layer})`);
    }
    const shape = normaliseFootprint(spec.footprint, id);
    const e = {
      id, layer: spec.layer, shape,
      y0: spec.y0, y1: spec.y1,
      clearance: spec.clearance || 0,
      allowOverlapWith: spec.allowOverlapWith || null,
      groups: spec.groups || null,
      tags: spec.tags || null,
      site: spec.site || null,
      object: null,
    };
    if (!(isFinite(e.y0) && isFinite(e.y1))) {
      throw new Error(`[registry] "${id}" has a non-finite elevation range ${e.y0}..${e.y1}`);
    }

    const hits = this.conflict(e);
    if (hits.length) {
      this.stats.rejected++;
      const msg = this.describeConflict(e, hits);
      const v = { id, hits: hits.map((h) => ({ id: h.other.id, depth: h.depth })), msg };
      this.violations.push(v);
      if (this.strict) throw new Error(msg);
      return null;
    }
    this.entries.push(e);
    this.byId.set(id, e);
    this._insert(e);
    this.stats.reserved++;
    return e;
  }

  describeConflict(e, hits) {
    const lines = [`[PLACEMENT REJECTED] "${e.id}" (${e.layer})`];
    if (e.site) lines.push(`  declared at ${e.site}`);
    lines.push(`  elevation ${e.y0.toFixed(2)} .. ${e.y1.toFixed(2)}`);
    for (const h of hits.slice(0, 6)) {
      lines.push(
        `  overlaps "${h.other.id}" (${h.other.layer}) by ${h.depth.toFixed(2)} m` +
        `  [rule ${e.layer}|${h.other.layer} = ${h.rule}]` +
        (h.other.site ? `\n      other declared at ${h.other.site}` : '')
      );
    }
    lines.push('  Fix the design. The validator does not nudge.');
    return lines.join('\n');
  }

  /* the real entry point: reserve, then build, then add */
  place(spec) {
    const e = this.reserve(spec);
    if (!e) return null;
    const obj = spec.build ? spec.build(e) : null;
    if (obj) {
      obj.userData.seedId = spec.id;
      obj.userData.layer = spec.layer;
      e.object = obj;
      (spec.parent || this.root).add(obj);
      this.stats.placed++;
    }
    return obj;
  }

  get(id) { return this.byId.get(id) || null; }
  has(id) { return this.byId.has(id); }

  /* ---------------------------------------------------------------- audit */

  /* Re-test every registered footprint against the complete final registry.
     v3 did this for trees only. */
  auditFootprints() {
    const out = [];
    const seen = new Set();
    for (const e of this.entries) {
      const hits = this.conflict(e);
      for (const h of hits) {
        const k = [e.id, h.other.id].sort().join('~');
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ a: e.id, b: h.other.id, la: e.layer, lb: h.other.layer,
                   depth: h.depth, rule: h.rule });
      }
    }
    out.sort((x, y) => y.depth - x.depth);
    return out;
  }

  /* Build a real AABB list from the actual scene graph and sweep for volume
     intersections. Catches anything a footprint declaration got wrong. */
  auditGeometry(root, opts) {
    opts = opts || {};
    const minVol = opts.minVolume != null ? opts.minVolume : 0.75;
    const boxes = [];
    const tmp = new THREE.Box3();
    root.updateWorldMatrix(true, true);

    root.traverse((o) => {
      /* One AABB over thousands of instances says nothing useful and makes the
         sweep degenerate, because a 2 km wide box never breaks the inner loop.
         Instanced scatter is validated per item at placement instead. */
      if (o.isInstancedMesh) return;
      if (!o.isMesh) return;
      let holder = o;
      while (holder && !holder.userData.seedId) holder = holder.parent;
      if (!holder) return;
      const ent = this.byId.get(holder.userData.seedId);
      if (!ent) return;
      if (ent.tags && ent.tags.indexOf('no-geom-audit') >= 0) return;
      tmp.setFromObject(o, true);
      if (!isFinite(tmp.min.x)) return;
      boxes.push({
        ent, id: holder.userData.seedId, layer: ent.layer,
        min: tmp.min.clone(), max: tmp.max.clone(),
      });
    });

    /* sort-sweep on X */
    boxes.sort((a, b) => a.min.x - b.min.x);
    const found = new Map();
    for (let i = 0; i < boxes.length; i++) {
      const A = boxes[i];
      for (let j = i + 1; j < boxes.length; j++) {
        const B = boxes[j];
        if (B.min.x > A.max.x) break;
        if (A.id === B.id) continue;
        const ox = Math.min(A.max.x, B.max.x) - Math.max(A.min.x, B.min.x);
        const oy = Math.min(A.max.y, B.max.y) - Math.max(A.min.y, B.min.y);
        const oz = Math.min(A.max.z, B.max.z) - Math.max(A.min.z, B.min.z);
        if (ox <= 0.02 || oy <= 0.02 || oz <= 0.02) continue;
        const vol = ox * oy * oz;
        if (vol < minVol) continue;
        const m = matrix(A.layer, B.layer);
        if (m === 'allow') continue;
        if (m === 'declared' &&
            (Registry.permits(A.ent, B.ent) || Registry.permits(B.ent, A.ent))) continue;
        const k = [A.id, B.id].sort().join('~');
        const prev = found.get(k);
        if (!prev || prev.volume < vol) {
          found.set(k, { a: A.id, b: B.id, la: A.layer, lb: B.layer,
                         volume: vol, ext: [ox, oy, oz] });
        }
      }
    }
    return Array.from(found.values()).sort((a, b) => b.volume - a.volume);
  }

  report(root) {
    const fp = this.auditFootprints();
    const geo = root ? this.auditGeometry(root) : [];
    return { footprint: fp, geometry: geo, stats: { ...this.stats },
             total: this.entries.length };
  }
}

/* one registry per world build */
export const registry = new Registry();

/* place() and reserve() are the only paths into the scene graph. */
export function place(spec) { return registry.place(spec); }
export function reserve(spec) { return registry.reserve(spec); }
export function setRoot(o) { registry.root = o; }

/* ---------------------------------------------------------------- containers
   Procedural scatter that is generated FROM the terrain — wrack, oyster bags,
   sand-fence slats, marsh grass, buoys, street furniture, planting — cannot
   meaningfully collide with anything, because its own generator already tests
   the ground it lands on. Registering each of those as a world-sized footprint
   is also the one thing that defeats the spatial hash: a 3 km bounding circle
   makes every broad-phase query return it.

   These get a container entry parked well outside the world, so they still
   appear in the registry and the scene graph with a seedId, but they do not
   distort the broad phase. Their individual members ARE validated where it
   matters: vegetation reserves one footprint per plant.                       */
let containerSlot = 0;
export function placeContainer(spec) {
  const i = containerSlot++;
  return registry.place({
    id: spec.id, layer: spec.layer,
    footprint: { x: 9000 + i * 6, z: 9000, w: 4, d: 4 },
    y0: -9000, y1: -8999,
    tags: ['container', 'no-geom-audit'],
    allowOverlapWith: ['*'],
    parent: spec.parent, site: spec.site, build: spec.build,
  });
}
export function containerCount() { return containerSlot; }
