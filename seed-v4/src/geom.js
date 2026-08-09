/* ============================================================================
   geom.js — the geometry kernel
   Path resampling with corner fillets, swept cross-sections, terrain-conforming
   ribbons, polygon paving, and a merge pass that preserves renderOrder.
   ========================================================================== */

import * as THREE from 'three';
import { clamp, lerp, ELEV, RENDER_ORDER } from './00-config.js';
import { groundH } from './01-terrain.js';

/* ------------------------------------------------------------------- paths */

/* Insert a circular fillet at every interior corner, then resample at `step`.
   Returns [{x, z, tx, tz, nx, nz, s}] — position, unit tangent, left normal,
   and distance along the path. */
export function resamplePath(pts, step, radius) {
  step = step || 1.5;
  radius = radius || 0;
  let p = pts.map((q) => ({ x: q[0], z: q[1] }));

  if (radius > 0 && p.length > 2) {
    const out = [p[0]];
    for (let i = 1; i < p.length - 1; i++) {
      const a = p[i - 1], b = p[i], c = p[i + 1];
      let v1x = a.x - b.x, v1z = a.z - b.z;
      let v2x = c.x - b.x, v2z = c.z - b.z;
      const L1 = Math.hypot(v1x, v1z), L2 = Math.hypot(v2x, v2z);
      if (L1 < 1e-6 || L2 < 1e-6) { out.push(b); continue; }
      v1x /= L1; v1z /= L1; v2x /= L2; v2z /= L2;
      const dot = clamp(v1x * v2x + v1z * v2z, -1, 1);
      const ang = Math.acos(dot);
      if (ang > Math.PI - 0.02 || ang < 0.02) { out.push(b); continue; }
      const tan = radius / Math.tan(ang / 2);
      /* A fillet may consume almost the whole run toward a path END, but only
         half the run toward another corner, or two fillets would overlap.
         Clamping both sides to 0.48 silently halved every ring corner radius
         and pushed the carriageway out through the security fence. */
      const lim1 = (i - 1 === 0) ? L1 * 0.95 : L1 * 0.48;
      const lim2 = (i + 1 === p.length - 1) ? L2 * 0.95 : L2 * 0.48;
      const t = Math.min(tan, lim1, lim2);
      const p1 = { x: b.x + v1x * t, z: b.z + v1z * t };
      const p2 = { x: b.x + v2x * t, z: b.z + v2z * t };
      /* the true circular fillet: centre on the angle bisector, radius set by
         the tangent length actually used */
      const R = t * Math.tan(ang / 2);
      let bx = v1x + v2x, bz = v1z + v2z;
      const bl = Math.hypot(bx, bz);
      if (bl < 1e-6) { out.push(b); continue; }
      bx /= bl; bz /= bl;
      const cd = Math.sqrt(t * t + R * R);
      const cx = b.x + bx * cd, cz = b.z + bz * cd;
      let a1 = Math.atan2(p1.z - cz, p1.x - cx);
      let a2 = Math.atan2(p2.z - cz, p2.x - cx);
      let da = a2 - a1;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      const n = Math.max(4, Math.round(Math.abs(da) * R / Math.max(step, 0.5)));
      for (let k = 0; k <= n; k++) {
        const a = a1 + da * (k / n);
        out.push({ x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R });
      }
    }
    out.push(p[p.length - 1]);
    p = out;
  }

  /* cumulative length */
  const seg = [];
  let total = 0;
  for (let i = 0; i < p.length - 1; i++) {
    const L = Math.hypot(p[i + 1].x - p[i].x, p[i + 1].z - p[i].z);
    seg.push({ a: p[i], b: p[i + 1], L, s0: total });
    total += L;
  }
  if (!seg.length) return [];

  const n = Math.max(1, Math.round(total / step));
  const samples = [];
  let si = 0;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * total;
    while (si < seg.length - 1 && s > seg[si].s0 + seg[si].L) si++;
    const g = seg[si];
    const u = g.L > 1e-9 ? clamp((s - g.s0) / g.L, 0, 1) : 0;
    samples.push({
      x: lerp(g.a.x, g.b.x, u), z: lerp(g.a.z, g.b.z, u), s,
      tx: 0, tz: 0, nx: 0, nz: 0,
    });
  }
  /* smoothed tangents so the swept normal does not jitter at fillet joints */
  for (let i = 0; i < samples.length; i++) {
    const a = samples[Math.max(0, i - 1)], b = samples[Math.min(samples.length - 1, i + 1)];
    let tx = b.x - a.x, tz = b.z - a.z;
    const L = Math.hypot(tx, tz) || 1;
    tx /= L; tz /= L;
    samples[i].tx = tx; samples[i].tz = tz;
    samples[i].nx = -tz; samples[i].nz = tx;      /* left normal */
  }
  samples.total = total;
  return samples;
}

export function pathLength(samples) { return samples.total || 0; }

/* point at distance s along a resampled path */
export function pointAt(samples, s) {
  const t = clamp(s / (samples.total || 1), 0, 1);
  const i = clamp(Math.round(t * (samples.length - 1)), 0, samples.length - 1);
  return samples[i];
}

/* ------------------------------------------------------------------ ribbons */

/* Sweep a cross-section along a path. The cross-section is a list of
   { u, dy, uv } where u is the lateral offset and dy the height above the
   reference. `yAt` resolves the reference height for a sample; by default that
   is the terrain plus a ledger offset, which is how every ground surface in
   this project gets its Y. */
export function sweep(samples, cross, opts) {
  opts = opts || {};
  const lift = opts.lift || 0;
  const conform = opts.conform !== false;
  const closeEnds = opts.closeEnds || false;
  const uvScale = opts.uvScale || 1;
  const yAt = opts.yAt || ((x, z) => (conform ? groundH(x, z) : 0) + lift);

  const pos = [], nor = [], uv = [], idx = [];
  const N = samples.length, M = cross.length;
  if (N < 2 || M < 2) return null;

  for (let i = 0; i < N; i++) {
    const sm = samples[i];
    const base = yAt(sm.x, sm.z, sm);
    for (let j = 0; j < M; j++) {
      const c = cross[j];
      const u = typeof c.u === 'function' ? c.u(sm, i / (N - 1)) : c.u;
      const dy = typeof c.dy === 'function' ? c.dy(sm, i / (N - 1)) : c.dy;
      const x = sm.x + sm.nx * u, z = sm.z + sm.nz * u;
      let y = base + dy;
      if (c.toGround) y = groundH(x, z) + (c.groundLift || 0);
      pos.push(x, y, z);
      nor.push(0, 1, 0);
      uv.push(c.uv != null ? c.uv : u * uvScale, sm.s * uvScale);
    }
  }
  /* Winding depends on whether the cross-section is listed in increasing or
     decreasing lateral offset. Assuming one order for both inverted the normal
     on every ribbon whose section runs left-to-right — which is to say every
     carriageway, every sidewalk slab, every lane marking and every subgrade.
     They were all backface-culled from above, so the roads read as a pair of
     thin curb lines on bare grass. Curbs survived because their profiles happen
     to be listed outward, i.e. in decreasing offset. */
  const uAt = (c) => (typeof c.u === 'function' ? c.u(samples[0], 0) : c.u);
  const flip = (uAt(cross[M - 1]) - uAt(cross[0])) < 0;
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < M - 1; j++) {
      if (cross[j].skipTo) continue;
      const a = i * M + j, b = a + 1, c = a + M, d = c + 1;
      if (flip) idx.push(a, c, b, b, c, d);
      else idx.push(a, b, c, b, d, c);
    }
  }
  if (closeEnds) {
    const capIdx = (base, flip) => {
      for (let j = 1; j < M - 1; j++) {
        if (flip) idx.push(base, base + j, base + j + 1);
        else idx.push(base, base + j + 1, base + j);
      }
    };
    capIdx(0, false);
    capIdx((N - 1) * M, true);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* a flat terrain-conforming ribbon at a ledger elevation, with 2% crown */
export function pavementRibbon(samples, halfWidth, elevKey, crown) {
  const lift = ELEV[elevKey];
  const c = crown == null ? 0.02 : crown;
  const cross = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const t = i / n * 2 - 1;                       /* -1 .. 1 */
    const u = typeof halfWidth === 'function' ? null : t * halfWidth;
    cross.push({
      u: typeof halfWidth === 'function'
        ? ((sm, p) => t * halfWidth(sm, p)) : u,
      dy: -Math.abs(t) * (typeof halfWidth === 'function' ? 4 : halfWidth) * c,
    });
  }
  return sweep(samples, cross, { lift, uvScale: 1 });
}

/* a ribbon whose outer edge ties down to natural ground: shoulders and verges */
export function tieRibbon(samples, uInner, dyInner, uOuter) {
  const cross = [
    { u: uInner, dy: dyInner },
    { u: lerp(uInner, uOuter, 0.35), dy: dyInner * 0.55, toGroundBlend: true },
    { u: uOuter, dy: 0, toGround: true },
  ];
  /* middle point blends between the two, resolved per sample */
  return sweep(samples, [
    { u: uInner, dy: dyInner },
    { u: uOuter, dy: 0, toGround: true, groundLift: 0.01 },
  ], { lift: 0 });
}

/* ----------------------------------------------------------------- polygons */

/* Fan/ear-clip triangulation of a simple polygon, laid at a ledger elevation
   and conformed to terrain. Used for intersection paving and plazas. */
export function polygonPaving(poly, elevKey, opts) {
  opts = opts || {};
  const lift = ELEV[elevKey] != null ? ELEV[elevKey] : (opts.lift || 0);
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p[0], p[1])));
  if (opts.holes) {
    for (const h of opts.holes) {
      shape.holes.push(new THREE.Path(h.map((p) => new THREE.Vector2(p[0], p[1]))));
    }
  }
  const g = new THREE.ShapeGeometry(shape, opts.curveSegments || 24);
  /* ShapeGeometry lays out in XY; rotate into XZ and drop each vertex onto
     the terrain so a large plaza follows grade rather than floating */
  const p = g.attributes.position;
  const uv = [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getY(i);
    p.setXYZ(i, x, groundH(x, z) + lift + (opts.crown ? -opts.crown * dist2(x, z, opts.crownCentre) : 0), z);
    uv.push(x, z);
  }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}
function dist2(x, z, c) { return c ? Math.hypot(x - c[0], z - c[1]) * 0.01 : 0; }

/* subdivide a polygon paving so a large area actually follows the ground */
export function polygonPavingDense(poly, elevKey, cell, opts) {
  opts = opts || {};
  const lift = ELEV[elevKey] != null ? ELEV[elevKey] : 0;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const p of poly) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }
  const nx = Math.max(1, Math.ceil((x1 - x0) / cell));
  const nz = Math.max(1, Math.ceil((z1 - z0) / cell));
  const pos = [], uv = [], idx = [];
  const inside = [];
  const cols = nx + 1;
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = lerp(x0, x1, i / nx), z = lerp(z0, z1, j / nz);
      pos.push(x, groundH(x, z) + lift, z);
      uv.push(x, z);
      inside.push(pointInPoly(x, z, poly));
    }
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * cols + i, b = a + 1, c = a + cols, d = c + 1;
      const cx = lerp(x0, x1, (i + 0.5) / nx), cz = lerp(z0, z1, (j + 0.5) / nz);
      if (!pointInPoly(cx, cz, poly)) continue;
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

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) &&
        x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/* ------------------------------------------------------------------ solids */

export function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
export function cyl(rt, rb, h, seg) { return new THREE.CylinderGeometry(rt, rb, h, seg || 16); }

export function mesh(geo, material, x, y, z, opts) {
  const m = new THREE.Mesh(geo, material);
  if (x != null) m.position.set(x, y, z);
  opts = opts || {};
  m.castShadow = opts.cast !== false;
  m.receiveShadow = opts.receive !== false;
  if (opts.rotY) m.rotation.y = opts.rotY;
  if (opts.rotX) m.rotation.x = opts.rotX;
  if (opts.rotZ) m.rotation.z = opts.rotZ;
  if (opts.order != null) m.renderOrder = opts.order;
  if (opts.name) m.name = opts.name;
  return m;
}

/* a box whose base sits on the terrain at (x,z) */
export function grounded(w, h, d, x, z, material, opts) {
  const y = groundH(x, z) + h / 2 + ((opts && opts.lift) || 0);
  return mesh(box(w, h, d), material, x, y, z, opts);
}

/* a ground-hugging decal plate at a ledger elevation */
export function decal(w, d, x, z, material, elevKey, rotY) {
  const g = new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 6)), Math.max(1, Math.round(d / 6)));
  g.rotateX(-Math.PI / 2);
  if (rotY) g.rotateY(rotY);
  g.translate(x, 0, z);
  const p = g.attributes.position;
  const lift = ELEV[elevKey] != null ? ELEV[elevKey] : 0;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, groundH(p.getX(i), p.getZ(i)) + lift);
    /* world-space UV: the material's repeat is now tiles per metre, so gravel
       reads as gravel at any slab size */
    uv.setXY(i, p.getX(i), p.getZ(i));
  }
  uv.needsUpdate = true;
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = true; m.castShadow = false;
  m.renderOrder = RENDER_ORDER[elevKey] != null ? RENDER_ORDER[elevKey] : 10;
  return m;
}

/* extrude a 2D profile (in the cross-section plane) along a path — curbs,
   walls, handrails, kerb returns */
export function extrudeProfile(samples, profile, opts) {
  opts = opts || {};
  const cross = profile.map((p) => ({ u: p[0], dy: p[1] }));
  const g = sweep(samples, cross, {
    lift: opts.lift || 0, closeEnds: opts.closeEnds !== false,
    uvScale: opts.uvScale || 0.25, conform: opts.conform !== false,
  });
  return g;
}

/* ------------------------------------------------------------------- merge */

/* Merge compatible static meshes. renderOrder, castShadow and receiveShadow
   are all carried across; v3's mergeStatic silently dropped renderOrder, which
   undid the one z-fighting fix it had. */
export function mergeStatic(group, opts) {
  opts = opts || {};
  const buckets = new Map();
  const keep = [];
  group.traverse((o) => {
    /* InstancedMesh extends Mesh. Merging one would bake a single instance and
       silently delete every other copy — the wrack line, the oyster beds, the
       sand fence, the PV arrays and the plantings all live in instanced meshes. */
    if (!o.isMesh || o.isInstancedMesh || o.userData.noMerge) return;
    if (o.geometry.attributes.position.count > (opts.maxVerts || 60000)) { keep.push(o); return; }
    const key = [o.material.uuid, o.renderOrder, o.castShadow ? 1 : 0,
                 o.receiveShadow ? 1 : 0, o.userData.seedId || ''].join('|');
    let b = buckets.get(key);
    if (!b) { b = { material: o.material, order: o.renderOrder,
                    cast: o.castShadow, recv: o.receiveShadow, list: [] };
              buckets.set(key, b); }
    b.list.push(o);
  });
  const out = [];
  for (const b of buckets.values()) {
    if (b.list.length < 2) continue;
    const geos = [];
    for (const m of b.list) {
      m.updateWorldMatrix(true, false);
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const a of Object.keys(g.attributes)) {
        if (['position', 'normal', 'uv'].indexOf(a) < 0) g.deleteAttribute(a);
      }
      if (!g.attributes.uv) {
        const n = g.attributes.position.count;
        g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
      }
      if (!g.index) {
        const n = g.attributes.position.count;
        g.setIndex(Array.from({ length: n }, (_, i) => i));
      }
      geos.push(g);
    }
    const merged = mergeGeometries(geos);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, b.material);
    m.renderOrder = b.order;
    m.castShadow = b.cast;
    m.receiveShadow = b.recv;
    m.matrixAutoUpdate = false;
    out.push({ mesh: m, replaced: b.list });
    for (const g of geos) g.dispose();
  }
  return out;
}

/* minimal geometry merge — avoids pulling in BufferGeometryUtils */
export function mergeGeometries(geos) {
  if (!geos.length) return null;
  const attrs = ['position', 'normal', 'uv'];
  let vCount = 0, iCount = 0;
  for (const g of geos) { vCount += g.attributes.position.count; iCount += g.index.count; }
  const out = new THREE.BufferGeometry();
  const arrays = {};
  for (const a of attrs) {
    const size = geos[0].attributes[a] ? geos[0].attributes[a].itemSize : 3;
    arrays[a] = new Float32Array(vCount * size);
  }
  const index = vCount > 65535 ? new Uint32Array(iCount) : new Uint16Array(iCount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    for (const a of attrs) {
      const src = g.attributes[a];
      if (!src) continue;
      arrays[a].set(src.array, vo * src.itemSize);
    }
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) index[io + i] = gi[i] + vo;
    vo += n; io += gi.length;
  }
  for (const a of attrs) {
    const size = geos[0].attributes[a] ? geos[0].attributes[a].itemSize : 3;
    out.setAttribute(a, new THREE.BufferAttribute(arrays[a], size));
  }
  out.setIndex(new THREE.BufferAttribute(index, 1));
  out.computeBoundingSphere();
  return out;
}

/* apply the merge in place, keeping the scene graph tidy */
export function collapse(group, opts) {
  const results = mergeStatic(group, opts);
  for (const r of results) {
    for (const old of r.replaced) {
      if (old.parent) old.parent.remove(old);
      old.geometry.dispose();
    }
    r.mesh.updateMatrix();
    group.add(r.mesh);
  }
  return results.length;
}

/* --------------------------------------------------------------- instancing */
export function instanced(geo, material, transforms, opts) {
  opts = opts || {};
  const im = new THREE.InstancedMesh(geo, material, transforms.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const e = new THREE.Euler();
  const col = opts.colours ? new THREE.Color() : null;
  for (let i = 0; i < transforms.length; i++) {
    const t = transforms[i];
    p.set(t.x, t.y, t.z);
    e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    q.setFromEuler(e);
    s.set(t.sx != null ? t.sx : (t.s || 1), t.sy != null ? t.sy : (t.s || 1),
          t.sz != null ? t.sz : (t.s || 1));
    m.compose(p, q, s);
    im.setMatrixAt(i, m);
    if (col && t.colour != null) { col.setHex(t.colour); im.setColorAt(i, col); }
  }
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = opts.cast !== false;
  im.receiveShadow = opts.receive !== false;
  im.frustumCulled = opts.culled !== false;
  return im;
}

/* ---------------------------------------------------------------- disposal */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (m.userData.libraryName) continue;      /* library materials are shared */
        m.dispose();
      }
    }
  });
}
