/* ============================================================================
   14-vegetation.js — every plant goes through the validator
   ----------------------------------------------------------------------------
   Species-specific trunk radius, canopy radius, mature height and minimum
   spacing. One wind system, with a matching customDepthMaterial, so the
   shadows sway too: in v3 the foliage swayed and its shadows stood still.
   ========================================================================== */

import * as THREE from 'three';
import { SITE, LAYER, DEG, clamp, lerp, smoothstep, stream } from './00-config.js';
import { groundH, siteH, perimU, slopeAt, waterY, PONDS } from './01-terrain.js';
import { MAT } from './03-materials.js';
import { reserve, registry, placeContainer } from './02-registry.js';
import { instanced, mesh, box, cyl } from './geom.js';

const r = stream('vegetation');

export const WIND = { value: 0 };

/* the stated native list (c4), plus the coastal species */
export const SPECIES = {
  loblolly:  { bark: 'barkPine',  fol: 'folPine',     h: [17, 30], trunk: 0.30, canopy: 4.6, form: 'conifer' },
  redcedar:  { bark: 'barkCedar', fol: 'folCedar',    h: [7, 13],  trunk: 0.20, canopy: 2.8, form: 'conifer' },
  poplar:    { bark: 'barkOak',   fol: 'folPoplar',   h: [16, 26], trunk: 0.34, canopy: 5.4, form: 'broad' },
  whiteoak:  { bark: 'barkOak',   fol: 'folOak',      h: [13, 21], trunk: 0.42, canopy: 7.2, form: 'broad' },
  riverbirch:{ bark: 'barkBirch', fol: 'folBirch',    h: [10, 17], trunk: 0.24, canopy: 4.4, form: 'broad' },
  sweetgum:  { bark: 'barkOak',   fol: 'folOak',      h: [12, 20], trunk: 0.30, canopy: 5.0, form: 'broad' },
  blackwalnut:{bark: 'barkOak',   fol: 'folPoplar',   h: [12, 19], trunk: 0.36, canopy: 5.8, form: 'broad' },
  willowoak: { bark: 'barkOak',   fol: 'folOak',      h: [14, 22], trunk: 0.38, canopy: 6.4, form: 'broad' },
  liveoak:   { bark: 'barkOak',   fol: 'folOak',      h: [9, 14],  trunk: 0.50, canopy: 9.0, form: 'spread' },
  waxmyrtle: { bark: 'barkCedar', fol: 'folPalmetto', h: [3, 5.5], trunk: 0.10, canopy: 2.0, form: 'shrub' },
};

/* ------------------------------------------------------------ tree geometry */
function treeGeometry(sp, lod) {
  const geos = { trunk: null, fol: null };
  const H = 1;                                   /* unit height; scaled per instance */
  /* Every lateral dimension is divided by the species' mean height, because the
     instance transform scales uniformly BY the height. Without this a 30 m
     loblolly got a 250 m canopy and a 9 m thick trunk. */
  const mh = (sp.h[0] + sp.h[1]) / 2;
  const CAN = sp.canopy / mh;
  const TRK = sp.trunk / mh;
  const seg = lod === 0 ? 8 : 5;
  const t = new THREE.CylinderGeometry(TRK * 0.55, TRK, H * 0.62, seg);
  t.translate(0, H * 0.31, 0);
  geos.trunk = t;

  const cards = [];
  const n = lod === 0 ? (sp.form === 'conifer' ? 5 : 6) : lod === 1 ? 3 : 1;
  for (let i = 0; i < n; i++) {
    let g;
    if (sp.form === 'conifer') {
      g = new THREE.PlaneGeometry(CAN * 1.8, H * 0.86);
      g.translate(0, H * 0.60, 0);
    } else if (sp.form === 'spread') {
      g = new THREE.PlaneGeometry(CAN * 2.2, H * 0.55);
      g.translate(0, H * 0.66, 0);
    } else {
      g = new THREE.PlaneGeometry(CAN * 1.9, H * 0.68);
      g.translate(0, H * 0.68, 0);
    }
    g.rotateY((i / n) * Math.PI);
    if (i % 2 === 1) g.rotateZ(0.16);
    cards.push(g);
  }
  geos.fol = mergePlanes(cards);
  return geos;
}

function mergePlanes(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2);
  const idx = new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    uv.set(g.attributes.uv.array, vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += n; io += g.index.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

/* -------------------------------------------------------------------- wind
   One system. The customDepthMaterial carries the same displacement, so a
   swaying canopy casts a swaying shadow. */
const WIND_CHUNK = `
  float wsway( vec3 wp, float h ) {
    float t = uWindTime;
    float p = wp.x * 0.045 + wp.z * 0.031;
    return ( sin( t * 1.35 + p ) * 0.55 + sin( t * 2.4 + p * 1.9 ) * 0.28
           + sin( t * 0.62 + p * 0.5 ) * 0.4 ) * h;
  }`;

export function applyWind(material, strength) {
  const uni = { uWindTime: { value: 0 }, uWindAmt: { value: strength } };
  material.userData.windUniforms = uni;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = function (sh, renderer) {
    if (prev) prev.call(this, sh, renderer);
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uWindTime; uniform float uWindAmt;
        ${WIND_CHUNK}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          /* instanceMatrix only exists when the draw is instanced. A single
             non-instanced mesh carrying a foliage material — the merge pass
             produces one — failed to compile the whole program without this
             guard, and the tree rendered as a shader error. */
          #ifdef USE_INSTANCING
            vec3 wp = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #else
            vec3 wp = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #endif
          float hf = clamp( transformed.y, 0.0, 6.0 );
          float s = wsway( wp, hf ) * uWindAmt;
          transformed.x += s;
          transformed.z += s * 0.55;
        }`);
  };
  material.customProgramCacheKey = () => 'wind' + strength;
  material.needsUpdate = true;

  /* the matching depth material */
  const dm = new THREE.MeshDepthMaterial({
    depthPacking: THREE.RGBADepthPacking,
    map: material.map, alphaTest: material.alphaTest,
  });
  dm.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uWindTime; uniform float uWindAmt;
        ${WIND_CHUNK}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          /* instanceMatrix only exists when the draw is instanced. A single
             non-instanced mesh carrying a foliage material — the merge pass
             produces one — failed to compile the whole program without this
             guard, and the tree rendered as a shader error. */
          #ifdef USE_INSTANCING
            vec3 wp = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #else
            vec3 wp = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
          #endif
          float hf = clamp( transformed.y, 0.0, 6.0 );
          float s = wsway( wp, hf ) * uWindAmt;
          transformed.x += s;
          transformed.z += s * 0.55;
        }`);
  };
  dm.customProgramCacheKey = () => 'winddepth' + strength;
  material.userData.depthMaterial = dm;
  return material;
}

export function updateWind(t) {
  WIND.value = t;
  for (const k of ['folPine', 'folCedar', 'folOak', 'folPoplar', 'folBirch', 'folPalmetto']) {
    const m = MAT[k];
    if (m && m.userData.windUniforms) m.userData.windUniforms.uWindTime.value = t;
  }
}

/* ============================================================== placement */
export function buildVegetation(world) {
  const g = new THREE.Group();
  g.name = 'vegetation';
  world.add(g);

  for (const k of ['folPine', 'folCedar', 'folOak', 'folPoplar', 'folBirch', 'folPalmetto']) {
    applyWind(MAT[k], 0.055);
  }

  const density = 1.0;
  const accepted = {};          /* species -> [transform] */
  let rejected = 0, tried = 0;
  const add = (spKey, x, z, opts) => {
    opts = opts || {};
    const sp = SPECIES[spKey];
    tried++;
    const h = lerp(sp.h[0], sp.h[1], opts.age != null ? opts.age : r.bell(0, 1));
    const scale = h;
    const canopyR = sp.canopy * (h / sp.h[1]) * (opts.canopyMul || 1);
    const y = groundH(x, z);
    const id = `veg-${spKey}-${accepted._n = (accepted._n || 0) + 1}`;
    const e = (() => {
      try {
        registry.strict = false;
        return reserve({
          id, layer: LAYER.VEGETATION,
          footprint: { x, z, r: Math.max(sp.trunk * 2.2, canopyR * (opts.tight ? 0.35 : 0.62)) },
          y0: y - 0.4, y1: y + h,
          clearance: opts.clearance != null ? opts.clearance : 0.8,
          allowOverlapWith: opts.allow || null,
          groups: ['vegetation'],
          site: 'planting',
        });
      } finally { registry.strict = true; }
    })();
    if (!e) { rejected++; return false; }
    (accepted[spKey] = accepted[spKey] || []).push({
      x, y, z, s: scale,
      ry: r() * Math.PI * 2,
      rz: (r() - 0.5) * (opts.lean || 0.06),
      lod: distanceLod(x, z),
    });
    return true;
  };

  /* --- 1. street trees in the verge of every avenue and the promenade */
  const streetSpecies = ['willowoak', 'sweetgum', 'poplar', 'blackwalnut', 'riverbirch'];
  for (const line of STREET_TREE_LINES) {
    const n = Math.floor(line.len / line.spacing);
    for (let i = 0; i <= n; i++) {
      const t = i / Math.max(1, n);
      const x = lerp(line.x0, line.x1, t) + line.ox;
      const z = lerp(line.z0, line.z1, t) + line.oz;
      add(streetSpecies[(i + line.seed) % streetSpecies.length], x, z,
        { clearance: 1.6, tight: true });
    }
  }

  /* --- 2. the evergreen screen ON the berm, not five metres outside its toe */
  for (let pass = 0; pass < 3; pass++) {
    const u = SITE.bermToeIn + 8 + pass * 13;
    const step = 7.5;
    const circ = 2 * Math.PI * u * 0.82;
    const n = Math.floor(circ / step);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const scale = perimScale(a, u);
      const x = Math.cos(a) * scale.x, z = Math.sin(a) * scale.z;
      const uu = perimU(x, z);
      if (uu < SITE.bermToeIn || uu > SITE.bermToeOut - 4) continue;
      add(r() > 0.4 ? 'loblolly' : 'redcedar', x + (r() - 0.5) * 4, z + (r() - 0.5) * 4,
        { age: 0.35 + r() * 0.6, clearance: 0.5 });
    }
  }

  /* --- 3. campus grounds, ponds and the agrivoltaic understory */
  scatter(add, 'campus-grounds', 1400 * density, () => {
    const x = (r() - 0.5) * 700, z = (r() - 0.5) * 700;
    if (perimU(x, z) > SITE.interior) return null;
    return [r.pick(['whiteoak', 'sweetgum', 'redcedar', 'riverbirch', 'poplar']), x, z,
      { clearance: 2.0 }];
  });
  for (const p of PONDS) {
    for (let i = 0; i < 60; i++) {
      const a = r() * Math.PI * 2, d = p.r + 4 + r() * 16;
      add(r() > 0.5 ? 'riverbirch' : 'waxmyrtle', p.x + Math.cos(a) * d, p.z + Math.sin(a) * d,
        { clearance: 0.5, allow: ['water'] });
    }
  }

  /* --- 4. beyond the fence: the street canopy at one tree per 30 ft (b4) */
  for (const st of [{ z: -880, n: 90 }, { z: -1180, n: 34 }, { z: -700, n: 100 }]) {
    for (let i = 0; i < st.n; i++) {
      const x = -820 + (i / st.n) * 1640;
      for (const s of [-1, 1]) {
        add(streetSpecies[i % streetSpecies.length], x + (r() - 0.5) * 3,
          st.z + s * 15 + (r() - 0.5) * 3, { clearance: 2.2, tight: true });
      }
    }
  }
  scatter(add, 'hood-yards', 900, () => {
    const x = -900 + r() * 1800, z = -1260 + r() * 520;
    return [r.pick(['whiteoak', 'sweetgum', 'redcedar', 'liveoak']), x, z, { clearance: 4.0 }];
  });

  /* --- 5. the riparian corridor: three planting bands */
  scatter(add, 'riparian', 2000, () => {
    const z = SITE.corridorStartZ + r() * (SITE.estuaryStartZ - SITE.corridorStartZ);
    const x = 40 + (r() - 0.5) * 300;
    const y = siteH(x, z);
    if (y < 0.8) return null;
    const w = waterY(x, z);
    if (w && y < w.y + 0.4) return null;
    const sp = y < 4 ? r.pick(['riverbirch', 'waxmyrtle'])
             : r.pick(['riverbirch', 'sweetgum', 'blackwalnut', 'loblolly', 'willowoak']);
    return [sp, x, z, { clearance: 0.6, allow: ['water', 'walk'] }];
  });

  /* --- 6. maritime forest behind the dune, and wax myrtle thickets */
  scatter(add, 'maritime', 900, () => {
    const x = -1200 + r() * 2400;
    const z = SITE.estuaryEndZ + r() * (SITE.duneStartZ - SITE.estuaryEndZ + 20);
    const y = siteH(x, z);
    if (y < 0.9 || y > 7) return null;
    return [r.pick(['liveoak', 'waxmyrtle', 'redcedar', 'loblolly']), x, z,
      { clearance: 0.5, age: 0.2 + r() * 0.5, lean: 0.22 }];
  });

  /* --- build the instanced meshes */
  let count = 0;
  for (const key of Object.keys(SPECIES)) {
    const list = accepted[key];
    if (!list || !list.length) continue;
    const sp = SPECIES[key];
    for (let lod = 0; lod < 3; lod++) {
      const sub = list.filter((t) => t.lod === lod);
      if (!sub.length) continue;
      const geo = treeGeometry(sp, lod);
      const tr = sub.map((t) => ({ x: t.x, y: t.y, z: t.z, ry: t.ry, rz: t.rz,
                                   sx: t.s, sy: t.s, sz: t.s }));
      const trunk = instanced(geo.trunk, MAT[sp.bark], tr, { cast: true, receive: true });
      trunk.name = `veg-trunk-${key}-${lod}`;
      trunk.userData.seedId = 'vegetation';
      const fol = instanced(geo.fol, MAT[sp.fol], tr, { cast: lod < 2, receive: true });
      fol.name = `veg-fol-${key}-${lod}`;
      fol.userData.seedId = 'vegetation';
      if (MAT[sp.fol].userData.depthMaterial) {
        fol.customDepthMaterial = MAT[sp.fol].userData.depthMaterial;
      }
      g.add(trunk, fol);
      count += sub.length;
    }
  }

  /* --- ground cover: sea oats on the dune, Spartina in the marsh, meadow
     grass cards near the camera, and the agrivoltaic understory with sheep */
  g.add(groundCover('sea-oats', 5200, MAT.folPalmetto, (x, z) => {
    const y = siteH(x, z);
    return z > SITE.duneStartZ - 20 && z < SITE.duneEndZ + 20 && y > 1.4;
  }, [-1300, 1300, SITE.duneStartZ - 20, SITE.duneEndZ + 20], 1.35, 0.55));

  g.add(groundCover('spartina', 7000, MAT.marsh, (x, z) => {
    const y = siteH(x, z);
    return y > -0.15 && y < 0.95 && z > SITE.estuaryStartZ - 40 && z < SITE.duneStartZ;
  }, [-520, 560, SITE.estuaryStartZ - 40, SITE.duneStartZ], 0.95, 0.5));

  g.add(groundCover('swale-grass', 4200, MAT.folPalmetto, (x, z) => {
    const u = perimU(x, z);
    return u > SITE.swaleOffset - 9 && u < SITE.swaleOffset + 9;
  }, [-460, 460, -460, 460], 0.85, 0.45));

  g.add(groundCover('agri-understory', 3600, MAT.crop, (x, z) => (
    x > 292 && x < 368 && z > 40 && z < 340
  ), [292, 368, 40, 340], 0.6, 0.5));

  /* grazing sheep under the agrivoltaic array (stated feature e2) */
  const sheep = [];
  for (let i = 0; i < 34; i++) {
    const x = 296 + r() * 68, z = 46 + r() * 288;
    sheep.push({ x, y: groundH(x, z) + 0.42, z, ry: r() * 6.28, s: 0.85 + r() * 0.3 });
  }
  const sg = new THREE.SphereGeometry(0.42, 8, 6);
  sg.scale(1.35, 0.9, 1);
  const sm = instanced(sg, MAT.canvas, sheep, { cast: true });
  sm.name = 'sheep';
  sm.userData.seedId = 'vegetation';
  g.add(sm);

  placeContainer({
    id: 'vegetation', layer: LAYER.VEGETATION,
    parent: g, site: 'vegetation container', build: () => new THREE.Group(),
  });

  return { group: g, planted: count, tried, rejected };
}

function scatter(add, tag, n, gen) {
  for (let i = 0; i < n; i++) {
    const a = gen();
    if (!a) continue;
    add(a[0], a[1], a[2], a[3]);
  }
}

function distanceLod(x, z) {
  const d = Math.min(
    Math.hypot(x, z),
    Math.hypot(x - 30, z - 265),
    Math.hypot(x - 120, z - 1290));
  if (d < 420) return 0;
  if (d < 900) return 1;
  return 2;
}

/* the perimeter ellipse-ish scaling used to ring the berm */
function perimScale(a, u) {
  const R = clamp(SITE.ringRadius + (u - 400), 3, u * 0.9);
  const H = u - R;
  const c = Math.cos(a), s = Math.sin(a);
  const k = Math.max(Math.abs(c), Math.abs(s));
  const f = (H + R * 0.72) / Math.max(k, 1e-3);
  return { x: f, z: f };
}

/* alpha-tested grass cards, instanced, tested against the terrain predicate */
function groundCover(name, n, material, predicate, bounds, height, width) {
  const tr = [];
  for (let i = 0; i < n; i++) {
    const x = lerp(bounds[0], bounds[1], r());
    const z = lerp(bounds[2], bounds[3], r());
    if (!predicate(x, z)) continue;
    tr.push({ x, y: siteH(x, z), z, ry: r() * Math.PI, s: 0.7 + r() * 0.7 });
  }
  const g = new THREE.PlaneGeometry(width, height);
  g.translate(0, height / 2, 0);
  const g2 = new THREE.PlaneGeometry(width, height);
  g2.translate(0, height / 2, 0);
  g2.rotateY(Math.PI / 2);
  const merged = mergePlanes([g, g2]);
  const m = instanced(merged, material, tr, { cast: false, receive: true });
  m.name = 'cover-' + name;
  m.userData.seedId = 'vegetation';
  return m;
}

/* street tree lines, declared rather than derived, so they land in the verge */
const STREET_TREE_LINES = [
  { x0: 0, z0: -370, x1: 0, z1: 140, ox: 12.5, oz: 0, spacing: 12, len: 510, seed: 0 },
  { x0: 0, z0: -370, x1: 0, z1: 140, ox: -12.5, oz: 0, spacing: 12, len: 510, seed: 2 },
  { x0: -320, z0: 150, x1: 370, z1: 150, ox: 0, oz: 13.5, spacing: 12, len: 690, seed: 1 },
  { x0: -320, z0: 150, x1: 370, z1: 150, ox: 0, oz: -13.5, spacing: 12, len: 690, seed: 3 },
  { x0: 130, z0: -370, x1: 130, z1: -10, ox: 12.5, oz: 0, spacing: 12, len: 360, seed: 4 },
  { x0: 130, z0: -370, x1: 130, z1: -10, ox: -12.5, oz: 0, spacing: 12, len: 360, seed: 2 },
  { x0: -820, z0: -700, x1: 820, z1: -700, ox: 0, oz: 19, spacing: 10, len: 1640, seed: 1 },
  { x0: -820, z0: -700, x1: 820, z1: -700, ox: 0, oz: -19, spacing: 10, len: 1640, seed: 3 },
];
