/* ============================================================================
   03-materials.js — procedural PBR library and colour management
   ----------------------------------------------------------------------------
   Every material carries albedo + normal + roughness + AO. v3 had zero
   roughness maps, zero AO maps and zero metalness maps in the entire file, and
   set outputEncoding without ever setting encoding on a single texture, so all
   sixteen albedo maps were decoded as linear.

   Normal maps are generated from their OWN height field, not from the albedo
   drawing, so they carry independent surface information.

   Materials are frozen after creation. v3 had two lines that flipped
   MAT.stoneTrim and MAT.metal to DoubleSide globally, affecting every curb,
   cap, column, bench and post in the scene.
   ========================================================================== */

import * as THREE from 'three';
import { TEXTURE_SIZE, stream, clamp, lerp } from './00-config.js';

let MAXANISO = 8;
let SIZE = TEXTURE_SIZE.default;

/* ------------------------------------------------------------ fast value noise
   A permutation-table gradient noise. Much faster than the sin-hash used for
   the height field, which matters because we fill tens of millions of texels. */
const PERM = new Uint8Array(512);
(function () {
  const r = stream('texture-perm');
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
})();

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function grad2(h, x, y) {
  switch (h & 3) {
    case 0: return  x + y; case 1: return -x + y;
    case 2: return  x - y; default: return -x - y;
  }
}
/* tileable perlin: period must be an integer for seamless wrap */
function perlin(x, y, period) {
  const P = period || 256;
  const wrap = (v) => ((v % P) + P) % P;
  const X0 = Math.floor(x), Y0 = Math.floor(y);
  const xf = x - X0, yf = y - Y0;
  const u = fade(xf), v = fade(yf);
  const x0 = wrap(X0), x1 = wrap(X0 + 1), y0 = wrap(Y0), y1 = wrap(Y0 + 1);
  const aa = PERM[(PERM[x0 & 255] + y0) & 255];
  const ba = PERM[(PERM[x1 & 255] + y0) & 255];
  const ab = PERM[(PERM[x0 & 255] + y1) & 255];
  const bb = PERM[(PERM[x1 & 255] + y1) & 255];
  const n0 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
  const n1 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
  return (lerp(n0, n1, v) + 1) * 0.5;
}
function pfbm(x, y, oct, period, gain) {
  oct = oct || 4; gain = gain == null ? 0.5 : gain;
  let f = 1, a = 1, s = 0, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * perlin(x * f, y * f, (period || 256) * f);
    n += a; a *= gain; f *= 2;
  }
  return s / n;
}
/* deterministic per-texel hash */
function ihash(i, j, k) {
  let h = (i * 374761393 + j * 668265263 + (k || 0) * 2147483647) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

/* ------------------------------------------------------------ canvas helpers */
function makeCanvas(size) {
  const c = (typeof OffscreenCanvas !== 'undefined')
    ? new OffscreenCanvas(size, size)
    : Object.assign(document.createElement('canvas'), { width: size, height: size });
  return c;
}

/* Build a texture from a per-texel callback returning [r,g,b] in 0..1 */
function fieldTexture(size, cb, colorSpace, repeatU, repeatV) {
  const data = new Uint8Array(size * size * 4);
  const out = [0, 0, 0];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      cb(i, j, out);
      const o = (j * size + i) * 4;
      data[o]     = clamp(out[0], 0, 1) * 255;
      data[o + 1] = clamp(out[1], 0, 1) * 255;
      data[o + 2] = clamp(out[2], 0, 1) * 255;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.colorSpace = colorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = MAXANISO;
  t.needsUpdate = true;
  if (repeatU != null) t.repeat.set(repeatU, repeatV == null ? repeatU : repeatV);
  return t;
}

/* Sobel a height field into a tangent-space normal map. The height field is
   sampled independently of the albedo, which is the whole point. */
function normalFromHeightArray(size, H, strength, repeatU, repeatV) {
  const at = (i, j) => H[(((j % size) + size) % size) * size + (((i % size) + size) % size)];
  const s = strength == null ? 1 : strength;
  return fieldTexture(size, (i, j, o) => {
    const dx = (at(i + 1, j - 1) + 2 * at(i + 1, j) + at(i + 1, j + 1))
             - (at(i - 1, j - 1) + 2 * at(i - 1, j) + at(i - 1, j + 1));
    const dy = (at(i - 1, j + 1) + 2 * at(i, j + 1) + at(i + 1, j + 1))
             - (at(i - 1, j - 1) + 2 * at(i, j - 1) + at(i + 1, j - 1));
    let nx = -dx * s * 4, ny = -dy * s * 4, nz = 1;
    const L = Math.hypot(nx, ny, nz);
    o[0] = nx / L * 0.5 + 0.5; o[1] = ny / L * 0.5 + 0.5; o[2] = nz / L * 0.5 + 0.5;
  }, THREE.NoColorSpace, repeatU, repeatV);
}

/* separable box blur, wrapping — O(2R) per texel instead of O(R*R).
   The naive square kernel was the single biggest cost in the whole boot. */
function blurWrap(src, size, R) {
  const tmp = new Float32Array(size * size);
  const out = new Float32Array(size * size);
  const inv = 1 / (2 * R + 1);
  for (let j = 0; j < size; j++) {
    const row = j * size;
    let acc = 0;
    for (let k = -R; k <= R; k++) acc += src[row + ((k % size) + size) % size];
    for (let i = 0; i < size; i++) {
      tmp[row + i] = acc * inv;
      acc -= src[row + ((i - R) % size + size) % size];
      acc += src[row + ((i + R + 1) % size + size) % size];
    }
  }
  for (let i = 0; i < size; i++) {
    let acc = 0;
    for (let k = -R; k <= R; k++) acc += tmp[((((k % size) + size) % size)) * size + i];
    for (let j = 0; j < size; j++) {
      out[j * size + i] = acc * inv;
      acc -= tmp[((((j - R) % size) + size) % size) * size + i];
      acc += tmp[((((j + R + 1) % size) + size) % size) * size + i];
    }
  }
  return out;
}

/* Ambient occlusion approximated as a cavity term from the same height field.
   Built at half resolution: AO and roughness are low-frequency by nature. */
function ormFromHeightArray(size, H, roughFn, repeatU, repeatV) {
  const half = Math.max(64, size >> 1);
  const Hs = new Float32Array(half * half);
  const q = size / half;
  for (let j = 0; j < half; j++) {
    for (let i = 0; i < half; i++) {
      Hs[j * half + i] = H[Math.min(size - 1, (j * q | 0)) * size + Math.min(size - 1, (i * q | 0))];
    }
  }
  const M = blurWrap(Hs, half, Math.max(2, Math.round(half / 48)));
  return fieldTexture(half, (i, j, o) => {
    const h = Hs[j * half + i];
    const cav = clamp(0.5 + (h - M[j * half + i]) * 3.2, 0, 1);
    const ao = clamp(0.35 + cav * 0.75, 0, 1);
    const rg = roughFn ? roughFn(i * q, j * q, cav) : 0.8;
    /* r = AO, g = roughness, b = metalness — an ORM packing */
    o[0] = ao; o[1] = clamp(rg, 0, 1); o[2] = 0;
  }, THREE.NoColorSpace, repeatU, repeatV);
}

/* -------------------------------------------------------- surface definitions
   Each returns { albedo(i,j,out), height(i,j), rough(i,j,cav) }.             */
const S = SIZE;
const SURFACES = {};

function reg(name, def) { SURFACES[name] = def; }

const mix3 = (a, b, t, o) => {
  o[0] = a[0] + (b[0] - a[0]) * t;
  o[1] = a[1] + (b[1] - a[1]) * t;
  o[2] = a[2] + (b[2] - a[2]) * t;
};

/* ---- asphalt: aggregate, tyre polish in the wheel paths, tar seams, ravel */
function asphaltDef(opts) {
  const base = opts.base, agg = opts.agg, wear = opts.wear || 0;
  return {
    size: 1024,
    albedo(i, j, o, n) {
      const s = n;
      const a = pfbm(i / s * 26, j / s * 26, 4, 26);
      const grit = ihash(i, j, 1);
      const stone = a > 0.56 ? (a - 0.56) * 2.4 : 0;
      mix3(base, agg, clamp(stone + grit * 0.20, 0, 1), o);
      /* tar seam running the length of the tile */
      const seam = Math.abs((i / s) - 0.5);
      if (seam < 0.012) { o[0] *= 0.62; o[1] *= 0.62; o[2] *= 0.64; }
      /* wheel-path polish: darker, smoother, off the centreline */
      const wp = Math.exp(-Math.pow(((i / s) - 0.24) / 0.10, 2))
               + Math.exp(-Math.pow(((i / s) - 0.76) / 0.10, 2));
      const k = 1 - wp * wear * 0.30;
      o[0] *= k; o[1] *= k; o[2] *= k;
      /* edge ravel along the tile boundary */
      const ed = Math.min(j / s, 1 - j / s);
      if (ed < 0.03) { const t = 1 - ed / 0.03; o[0] += t * 0.05 * grit; }
    },
    height(i, j) {
      const s = this.size;
      const a = pfbm(i / s * 34, j / s * 34, 4, 34);
      const grit = ihash(i, j, 7) * 0.35;
      const wp = Math.exp(-Math.pow(((i / s) - 0.24) / 0.10, 2))
               + Math.exp(-Math.pow(((i / s) - 0.76) / 0.10, 2));
      return (a * 0.7 + grit) * (1 - wp * wear * 0.55);
    },
    rough(i, j, cav) {
      const s = this.size;
      const wp = Math.exp(-Math.pow(((i / s) - 0.24) / 0.10, 2))
               + Math.exp(-Math.pow(((i / s) - 0.76) / 0.10, 2));
      /* puddle-prone low spots read wetter */
      return clamp(0.94 - wp * wear * 0.34 - cav * 0.10, 0.30, 1.0);
    },
  };
}
reg('asphaltNew',  asphaltDef({ base: [0.115, 0.118, 0.125], agg: [0.30, 0.30, 0.31], wear: 0.25 }));
reg('asphaltWorn', asphaltDef({ base: [0.185, 0.186, 0.192], agg: [0.42, 0.42, 0.43], wear: 1.0 }));
reg('asphaltRubber', asphaltDef({ base: [0.095, 0.094, 0.100], agg: [0.24, 0.235, 0.245], wear: 0.6 }));

/* ---- broom-finish concrete sidewalk with control joints and cold joints */
reg('concreteWalk', {
  size: 1024,
  albedo(i, j, o, n) {
    const s = n;
    const mot = pfbm(i / s * 7, j / s * 7, 4, 7);
    const grain = ihash(i, j, 3);
    const v = 0.545 + mot * 0.115 + grain * 0.045;
    o[0] = v; o[1] = v * 0.996; o[2] = v * 0.972;
    /* broom finish: fine parallel striations across the walk */
    const broom = Math.sin(j / s * Math.PI * 2 * 190 + perlin(i / s * 12, j / s * 3, 12) * 5);
    o[0] += broom * 0.011; o[1] += broom * 0.011; o[2] += broom * 0.011;
    /* cold-joint colour shift between pours */
    if ((i / s) > 0.5) { o[0] *= 0.975; o[1] *= 0.978; o[2] *= 0.985; }
    /* control joint */
    const cj = Math.abs((j / s) - 0.5);
    if (cj < 0.006) { const t = 1 - cj / 0.006; o[0] -= t * 0.16; o[1] -= t * 0.16; o[2] -= t * 0.15; }
  },
  height(i, j) {
    const s = this.size;
    let h = pfbm(i / s * 9, j / s * 9, 3, 9) * 0.35 + ihash(i, j, 5) * 0.10;
    h += Math.sin(j / s * Math.PI * 2 * 190) * 0.05;
    const cj = Math.abs((j / s) - 0.5);
    if (cj < 0.006) h -= (1 - cj / 0.006) * 0.55;
    /* chipped edges */
    const ed = Math.min(i / s, 1 - i / s);
    if (ed < 0.02 && ihash(Math.floor(j / 6), 0, 9) > 0.72) h -= 0.25;
    return h;
  },
  rough: (i, j, cav) => clamp(0.84 - cav * 0.12, 0.4, 1),
});

/* ---- float-finish curb concrete with form lines and gutter staining */
reg('concreteCurb', {
  size: 512,
  albedo(i, j, o, n) {
    const s = n;
    const mot = pfbm(i / s * 6, j / s * 6, 4, 6);
    const v = 0.585 + mot * 0.09 + ihash(i, j, 11) * 0.03;
    o[0] = v; o[1] = v * 0.995; o[2] = v * 0.975;
    /* form line every 2.4 m of the run */
    const fl = Math.abs(((i / s) * 3 % 1) - 0.5);
    if (fl > 0.485) { o[0] *= 0.93; o[1] *= 0.93; o[2] *= 0.94; }
    /* staining rises from the gutter face at the bottom of the tile */
    const st = clamp(1 - (j / s) / 0.30, 0, 1);
    const stn = st * (0.35 + 0.65 * pfbm(i / s * 14, j / s * 5, 3, 14));
    o[0] *= 1 - stn * 0.24; o[1] *= 1 - stn * 0.245; o[2] *= 1 - stn * 0.23;
  },
  height(i, j) {
    const s = this.size;
    let h = pfbm(i / s * 11, j / s * 11, 3, 11) * 0.4 + ihash(i, j, 13) * 0.08;
    const fl = Math.abs(((i / s) * 3 % 1) - 0.5);
    if (fl > 0.485) h -= 0.3;
    return h;
  },
  rough: (i, j, cav) => clamp(0.78 - cav * 0.1, 0.4, 1),
});

/* ---- concrete unit paver, running bond, per-unit colour variance */
reg('paver', {
  size: 1024,
  albedo(i, j, o, n) {
    const s = n;
    const rows = 8, cols = 4;
    const ry = Math.floor(j / s * rows);
    const off = (ry % 2) * 0.5;
    const fx = (i / s) * cols + off;
    const cxi = Math.floor(fx);
    const u = fx - cxi, v = (j / s) * rows - ry;
    const jointU = Math.min(u, 1 - u), jointV = Math.min(v, 1 - v);
    const joint = Math.min(jointU * cols, jointV * rows);
    const tone = ihash(cxi, ry, 17);
    const base = [0.52 + tone * 0.14, 0.505 + tone * 0.135, 0.478 + tone * 0.12];
    const grain = pfbm(i / s * 40, j / s * 40, 3, 40) * 0.08 + ihash(i, j, 19) * 0.04;
    o[0] = base[0] + grain; o[1] = base[1] + grain; o[2] = base[2] + grain;
    if (joint < 0.09) {
      const t = 1 - joint / 0.09;
      /* joint sand, lighter and much rougher */
      const sand = 0.60 + ihash(i, j, 23) * 0.16;
      mix3(o, [sand, sand * 0.96, sand * 0.86], t * 0.9, o);
    }
  },
  height(i, j) {
    const s = this.size;
    const rows = 8, cols = 4;
    const ry = Math.floor(j / s * rows);
    const off = (ry % 2) * 0.5;
    const fx = (i / s) * cols + off;
    const u = fx - Math.floor(fx), v = (j / s) * rows - ry;
    const joint = Math.min(Math.min(u, 1 - u) * cols, Math.min(v, 1 - v) * rows);
    let h = 0.72 + pfbm(i / s * 30, j / s * 30, 3, 30) * 0.10;
    if (joint < 0.09) h -= (1 - joint / 0.09) * 0.62;
    return h;
  },
  rough: (i, j, cav) => clamp(0.72 - cav * 0.18, 0.35, 1),
});

/* ---- profiled metal wall panel: seam ribs, fastener lines, oil-canning */
reg('panelWall', {
  size: 512,
  albedo(i, j, o, n) {
    const s = n;
    const ribs = 6;
    const f = (i / s) * ribs;
    const u = f - Math.floor(f);
    const rib = Math.abs(u - 0.5) > 0.44 ? 1 : 0;
    let v = 0.60 + pfbm(i / s * 5, j / s * 5, 3, 5) * 0.045;
    if (rib) v *= 0.90;
    /* fastener line every panel, quarter points down the sheet */
    const fy = Math.abs(((j / s) * 5 % 1) - 0.5);
    if (fy > 0.47 && Math.abs(u - 0.5) < 0.06) v *= 0.72;
    o[0] = v; o[1] = v * 1.005; o[2] = v * 1.02;
  },
  height(i, j) {
    const s = this.size;
    const ribs = 6;
    const f = (i / s) * ribs, u = f - Math.floor(f);
    let h = 0.5 + (Math.abs(u - 0.5) > 0.44 ? 0.42 : 0);
    /* oil-canning: very low-frequency, low-amplitude dishing between ribs */
    h += (pfbm(i / s * 2.0, j / s * 1.4, 2, 2) - 0.5) * 0.16;
    const fy = Math.abs(((j / s) * 5 % 1) - 0.5);
    if (fy > 0.47 && Math.abs(u - 0.5) < 0.06) h += 0.22;
    return h;
  },
  rough: (i, j, cav) => clamp(0.44 + cav * 0.16 + pfbm(i / 64, j / 64, 2, 8) * 0.10, 0.2, 0.9),
});

/* ---- standing-seam roof: ribs, panel-length variation, weathering streaks */
reg('roofSeam', {
  size: 512,
  albedo(i, j, o, n) {
    const s = n;
    const ribs = 8;
    const f = (i / s) * ribs, u = f - Math.floor(f);
    const seam = Math.abs(u - 0.5) > 0.455;
    let v = 0.375 + pfbm(i / s * 6, j / s * 6, 3, 6) * 0.05;
    if (seam) v *= 1.14;
    /* weathering streaks running down-slope */
    const streak = pfbm(i / s * 46, j / s * 2.2, 3, 46);
    v *= 1 - clamp((streak - 0.55) * 1.5, 0, 1) * 0.22 * (j / s);
    o[0] = v; o[1] = v * 1.01; o[2] = v * 1.035;
  },
  height(i, j) {
    const s = this.size;
    const ribs = 8;
    const f = (i / s) * ribs, u = f - Math.floor(f);
    let h = 0.4 + (Math.abs(u - 0.5) > 0.455 ? 0.55 : 0);
    if (Math.abs(((j / s) * 3 % 1) - 0.5) > 0.492) h += 0.12;   /* panel end lap */
    return h;
  },
  rough: (i, j, cav) => clamp(0.36 + cav * 0.2 + pfbm(i / 40, j / 20, 2, 8) * 0.16, 0.2, 0.95),
});

/* ---- grass, meadow, sand, wet sand, gravel, soil: the terrain array layers */
function grassDef(opts) {
  return {
    size: 1024,
    albedo(i, j, o, n) {
      const s = n;
      const dir = opts.dir || 1;
      /* blade direction: stretched noise along one axis */
      const bl = pfbm(i / s * (opts.bladeU || 130) * dir, j / s * (opts.bladeV || 26), 3, 130);
      const clump = pfbm(i / s * 9, j / s * 9, 4, 9);
      const t = clamp(bl * 0.55 + clump * 0.55, 0, 1);
      mix3(opts.dark, opts.light, t, o);
      /* seasonal / stress patches */
      const dry = clamp((pfbm(i / s * 3.1, j / s * 3.1, 3, 3) - 0.52) * 3.4, 0, 1);
      mix3(o, opts.dry, dry * (opts.dryAmt || 0.5), o);
      const sp = ihash(i, j, 29);
      o[0] += (sp - 0.5) * 0.035; o[1] += (sp - 0.5) * 0.04; o[2] += (sp - 0.5) * 0.025;
    },
    height(i, j) {
      const s = this.size;
      return pfbm(i / s * 26, j / s * 10, 3, 26) * 0.35 + pfbm(i / s * 7, j / s * 7, 3, 7) * 0.65;
    },
    rough: (i, j, cav) => clamp(0.90 - cav * 0.08, 0.6, 1),
  };
}
reg('grass', grassDef({
  dark: [0.105, 0.175, 0.072], light: [0.235, 0.335, 0.128], dry: [0.34, 0.335, 0.17],
  dryAmt: 0.40, bladeU: 150, bladeV: 24,
}));
reg('meadow', grassDef({
  dark: [0.155, 0.185, 0.098], light: [0.345, 0.365, 0.196], dry: [0.46, 0.425, 0.245],
  dryAmt: 0.75, bladeU: 90, bladeV: 30,
}));

function sandDef(wet) {
  return {
    size: 1024,
    albedo(i, j, o, n) {
      const s = n;
      /* ripple field */
      const rip = Math.sin((j / s) * Math.PI * 2 * 34 + pfbm(i / s * 5, j / s * 5, 3, 5) * 9) * 0.5 + 0.5;
      const grain = ihash(i, j, 31);
      const base = wet ? [0.325, 0.288, 0.238] : [0.665, 0.615, 0.512];
      const hi = wet ? [0.395, 0.352, 0.292] : [0.795, 0.748, 0.638];
      mix3(base, hi, clamp(rip * 0.55 + grain * 0.45, 0, 1), o);
      /* shell hash */
      if (ihash(Math.floor(i / 3), Math.floor(j / 3), 37) > 0.986) {
        o[0] = 0.86; o[1] = 0.84; o[2] = 0.79;
      }
      /* moisture mottling */
      const mo = pfbm(i / s * 4, j / s * 4, 3, 4);
      const k = wet ? (0.86 + mo * 0.26) : (0.94 + mo * 0.13);
      o[0] *= k; o[1] *= k; o[2] *= k;
    },
    height(i, j) {
      const s = this.size;
      return Math.sin((j / s) * Math.PI * 2 * 34 + pfbm(i / s * 5, j / s * 5, 3, 5) * 9) * 0.28 + 0.5
           + ihash(i, j, 41) * 0.18;
    },
    rough: (i, j, cav) => (wet ? clamp(0.34 + cav * 0.16, 0.15, 0.7) : clamp(0.92 - cav * 0.05, 0.7, 1)),
  };
}
reg('sand', sandDef(false));
reg('wetSand', sandDef(true));

reg('gravel', {
  size: 1024,
  albedo(i, j, o, n) {
    const s = n;
    /* cellular stones */
    const cx = Math.floor(i / s * 44), cy = Math.floor(j / s * 44);
    let best = 9, bi = 0, bj = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const gx = cx + di, gy = cy + dj;
      const px = (gx + ihash(gx, gy, 43)) / 44 * s, py = (gy + ihash(gx, gy, 47)) / 44 * s;
      const d = Math.hypot(i - px, j - py);
      if (d < best) { best = d; bi = gx; bj = gy; }
    }
    const tone = ihash(bi, bj, 53);
    const v = 0.30 + tone * 0.30;
    o[0] = v * (0.96 + ihash(bi, bj, 59) * 0.12);
    o[1] = v * 0.985; o[2] = v * 0.94;
    const rim = clamp(best / (s / 44) * 1.6, 0, 1);
    const k = 0.55 + rim * 0.5;
    o[0] *= k; o[1] *= k; o[2] *= k;
  },
  height(i, j) {
    const s = this.size;
    const cx = Math.floor(i / s * 44), cy = Math.floor(j / s * 44);
    let best = 9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const gx = cx + di, gy = cy + dj;
      const px = (gx + ihash(gx, gy, 43)) / 44 * s, py = (gy + ihash(gx, gy, 47)) / 44 * s;
      best = Math.min(best, Math.hypot(i - px, j - py));
    }
    return clamp(1 - best / (s / 44) * 1.15, 0, 1);
  },
  rough: (i, j, cav) => clamp(0.86 - cav * 0.12, 0.5, 1),
});

reg('soil', {
  size: 1024,
  albedo(i, j, o, n) {
    const s = n;
    const cl = pfbm(i / s * 16, j / s * 16, 4, 16);
    const fi = ihash(i, j, 61);
    const v = 0.20 + cl * 0.16 + fi * 0.05;
    o[0] = v * 1.14; o[1] = v * 0.93; o[2] = v * 0.72;
    /* leaf litter and organic flecks */
    if (ihash(Math.floor(i / 2), Math.floor(j / 2), 67) > 0.978) {
      o[0] *= 1.5; o[1] *= 1.25; o[2] *= 0.7;
    }
  },
  height(i, j) {
    const s = this.size;
    return pfbm(i / s * 22, j / s * 22, 4, 22) * 0.7 + ihash(i, j, 71) * 0.3;
  },
  rough: (i, j, cav) => clamp(0.93 - cav * 0.1, 0.6, 1),
});

/* ---- PV module: cell grid, busbars, AR coat, frame, dust */
reg('pv', {
  size: 512,
  albedo(i, j, o, n) {
    const s = n;
    const cols = 6, rows = 10;
    const fx = (i / s) * cols, fy = (j / s) * rows;
    const u = fx - Math.floor(fx), v = fy - Math.floor(fy);
    const gap = Math.min(Math.min(u, 1 - u) * cols, Math.min(v, 1 - v) * rows);
    /* monocrystalline blue-black with slight per-cell variance */
    const cv = ihash(Math.floor(fx), Math.floor(fy), 73) * 0.06;
    o[0] = 0.028 + cv * 0.4; o[1] = 0.036 + cv * 0.5; o[2] = 0.062 + cv;
    if (gap < 0.10) { o[0] = 0.10; o[1] = 0.105; o[2] = 0.115; }   /* cell gap */
    /* busbars: three fine silver lines per cell */
    const bb = Math.abs((u * 3 % 1) - 0.5);
    if (bb > 0.474 && gap > 0.10) { o[0] = 0.55; o[1] = 0.56; o[2] = 0.58; }
    /* frame */
    const ed = Math.min(i / s, 1 - i / s, j / s, 1 - j / s);
    if (ed < 0.018) { o[0] = 0.62; o[1] = 0.63; o[2] = 0.65; }
    /* dust accumulation, heavier at the low edge */
    const dust = clamp((pfbm(i / s * 8, j / s * 8, 3, 8) - 0.45) * 2, 0, 1) * (j / s) * 0.5;
    mix3(o, [0.42, 0.39, 0.33], dust * 0.30, o);
  },
  height(i, j) {
    const s = this.size;
    const cols = 6, rows = 10;
    const fx = (i / s) * cols, fy = (j / s) * rows;
    const u = fx - Math.floor(fx), v = fy - Math.floor(fy);
    const gap = Math.min(Math.min(u, 1 - u) * cols, Math.min(v, 1 - v) * rows);
    const ed = Math.min(i / s, 1 - i / s, j / s, 1 - j / s);
    let h = 0.5;
    if (gap < 0.10) h -= 0.18;
    if (ed < 0.018) h += 0.55;
    return h;
  },
  rough: (i, j, cav) => {
    const s = 512;
    const ed = Math.min(i / s, 1 - i / s, j / s, 1 - j / s);
    if (ed < 0.018) return 0.45;
    const dust = clamp((pfbm(i / s * 8, j / s * 8, 3, 8) - 0.45) * 2, 0, 1) * (j / s);
    return clamp(0.085 + dust * 0.35, 0.05, 0.6);
  },
});

/* ---- bark, one definition parameterised per species */
function barkDef(o1, o2, ridgeF, plate) {
  return {
    size: 512,
    albedo(i, j, o, n) {
      const s = n;
      const ridge = Math.abs(pfbm(i / s * ridgeF, j / s * (ridgeF * 0.16), 4, ridgeF) - 0.5) * 2;
      const t = clamp(1 - ridge * 1.5, 0, 1);
      mix3(o1, o2, t, o);
      if (plate) {
        const pl = ihash(Math.floor(i / s * 14), Math.floor(j / s * 22), 79);
        const k = 0.82 + pl * 0.36;
        o[0] *= k; o[1] *= k; o[2] *= k;
      }
      const g = ihash(i, j, 83) * 0.06;
      o[0] += g; o[1] += g * 0.9; o[2] += g * 0.8;
    },
    height(i, j) {
      const s = this.size;
      const ridge = Math.abs(pfbm(i / s * ridgeF, j / s * (ridgeF * 0.16), 4, ridgeF) - 0.5) * 2;
      let h = 1 - ridge;
      if (plate) h += (ihash(Math.floor(i / s * 14), Math.floor(j / s * 22), 79) - 0.5) * 0.4;
      return h * 0.8 + ihash(i, j, 89) * 0.2;
    },
    rough: (i, j, cav) => clamp(0.94 - cav * 0.08, 0.7, 1),
  };
}
reg('barkPine',  barkDef([0.135, 0.088, 0.058], [0.315, 0.222, 0.148], 20, true));
reg('barkOak',   barkDef([0.098, 0.086, 0.070], [0.245, 0.222, 0.188], 26, false));
reg('barkBirch', barkDef([0.560, 0.548, 0.520], [0.815, 0.808, 0.782], 12, true));
reg('barkCedar', barkDef([0.150, 0.098, 0.078], [0.330, 0.238, 0.190], 34, false));

/* ---- foliage card: alpha-tested leaf cluster */
function foliageDef(dark, light, kind) {
  return {
    size: 512, alpha: true,
    albedo(i, j, o, n) {
      const s = n;
      const v = pfbm(i / s * 14, j / s * 14, 4, 14);
      const d = pfbm(i / s * 46, j / s * 46, 3, 46);
      mix3(dark, light, clamp(v * 0.6 + d * 0.55, 0, 1), o);
    },
    /* the alpha channel is written by the mask function */
    mask(i, j) {
      const s = 512;
      const cx = i / s - 0.5, cy = j / s - 0.5;
      const r = Math.hypot(cx, cy) * 2;
      if (kind === 'needle') {
        const ang = Math.atan2(cy, cx);
        const spray = Math.abs(Math.sin(ang * 14 + r * 9)) * 0.55 + 0.45;
        return r < spray * (0.85 + pfbm(i / s * 30, j / s * 30, 2, 30) * 0.3) ? 1 : 0;
      }
      const lump = pfbm(i / s * 7, j / s * 7, 3, 7);
      const detail = pfbm(i / s * 30, j / s * 30, 3, 30);
      return r < (0.62 + lump * 0.5) * (0.72 + detail * 0.52) ? 1 : 0;
    },
    height(i, j) {
      const s = this.size;
      return pfbm(i / s * 20, j / s * 20, 3, 20);
    },
    rough: () => 0.86,
  };
}
reg('folPine',    foliageDef([0.055, 0.115, 0.062], [0.145, 0.245, 0.118], 'needle'));
reg('folCedar',   foliageDef([0.062, 0.108, 0.070], [0.130, 0.212, 0.122], 'needle'));
reg('folOak',     foliageDef([0.072, 0.135, 0.055], [0.205, 0.310, 0.112], 'broad'));
reg('folPoplar',  foliageDef([0.088, 0.158, 0.062], [0.255, 0.352, 0.135], 'broad'));
reg('folBirch',   foliageDef([0.098, 0.168, 0.070], [0.288, 0.375, 0.152], 'broad'));
reg('folPalmetto',foliageDef([0.070, 0.128, 0.058], [0.185, 0.288, 0.108], 'needle'));

/* ---- architectural glass with a bird-safe frit pattern (stated feature c5) */
reg('fritGlass', {
  size: 512,
  albedo(i, j, o) {
    /* the frit is white dots on a 100 mm grid; the rest is clear */
    const gx = (i % 26) - 13, gy = (j % 26) - 13;
    const d = Math.hypot(gx, gy);
    const dot = d < 3.1 ? 1 : 0;
    const v = dot ? 0.90 : 0.055;
    o[0] = v; o[1] = v; o[2] = v * (dot ? 1 : 1.16);
  },
  height(i, j) {
    const gx = (i % 26) - 13, gy = (j % 26) - 13;
    return Math.hypot(gx, gy) < 3.1 ? 0.8 : 0.4;
  },
  rough: (i, j) => {
    const gx = (i % 26) - 13, gy = (j % 26) - 13;
    return Math.hypot(gx, gy) < 3.1 ? 0.72 : 0.035;
  },
});

/* ---- greenhouse glazing: diffusion, condensation, glazing-bar shadowing */
reg('ghGlazing', {
  size: 512,
  albedo(i, j, o, n) {
    const s = n;
    const cond = clamp((pfbm(i / s * 30, j / s * 30, 3, 30) - 0.42) * 2.2, 0, 1);
    const v = 0.11 + cond * 0.26;
    o[0] = v * 0.96; o[1] = v * 1.02; o[2] = v * 1.05;
  },
  height(i, j) {
    const s = this.size;
    return pfbm(i / s * 26, j / s * 26, 3, 26) * 0.5 + 0.3;
  },
  rough: (i, j, cav) => {
    const s = 512;
    const cond = clamp((pfbm(i / s * 30, j / s * 30, 3, 30) - 0.42) * 2.2, 0, 1);
    return clamp(0.06 + cond * 0.34, 0.04, 0.55);
  },
});

/* ---- metals */
function metalDef(base, rough, streak) {
  return {
    size: 512,
    albedo(i, j, o, n) {
      const s = n;
      const g = pfbm(i / s * 9, j / s * 9, 3, 9) * 0.09 + ihash(i, j, 97) * 0.03;
      o[0] = base[0] + g; o[1] = base[1] + g; o[2] = base[2] + g;
      if (streak) {
        const st = clamp((pfbm(i / s * 30, j / s * 2.4, 3, 30) - 0.5) * 2.4, 0, 1);
        mix3(o, streak, st * 0.55, o);
      }
    },
    height(i, j) {
      const s = this.size;
      return pfbm(i / s * 40, j / s * 40, 3, 40) * 0.6 + ihash(i, j, 101) * 0.4;
    },
    rough: (i, j, cav) => clamp(rough + cav * 0.14 + pfbm(i / 50, j / 50, 2, 10) * 0.1, 0.05, 1),
  };
}
reg('steelPainted',  metalDef([0.205, 0.213, 0.222], 0.42, null));
reg('steelGalv',     metalDef([0.560, 0.575, 0.588], 0.36, null));
reg('steelWeather',  metalDef([0.318, 0.168, 0.098], 0.72, [0.44, 0.22, 0.11]));
reg('aluminium',     metalDef([0.700, 0.710, 0.725], 0.22, null));

/* ---- timber decking for the boardwalks and dune crossovers */
reg('deckTimber', {
  size: 512,
  albedo(i, j, o, n) {
    const s = n;
    const boards = 7;
    const fy = (j / s) * boards, bi = Math.floor(fy), v = fy - bi;
    const gap = Math.min(v, 1 - v) * boards;
    const tone = ihash(bi, 0, 103);
    const grain = pfbm(i / s * 90, (j / s) * 6 + bi * 3.7, 4, 90);
    const base = 0.335 + tone * 0.13 + grain * 0.13;
    o[0] = base * 1.10; o[1] = base * 0.97; o[2] = base * 0.79;
    if (gap < 0.09) { const t = 1 - gap / 0.09; o[0] *= 1 - t * 0.7; o[1] *= 1 - t * 0.7; o[2] *= 1 - t * 0.7; }
    /* fastener heads at the bearer lines */
    const fx = Math.abs(((i / s) * 4 % 1) - 0.5);
    if (fx > 0.492 && Math.abs(v - 0.5) < 0.10) { o[0] = 0.30; o[1] = 0.30; o[2] = 0.32; }
  },
  height(i, j) {
    const s = this.size;
    const boards = 7;
    const fy = (j / s) * boards, v = fy - Math.floor(fy);
    const gap = Math.min(v, 1 - v) * boards;
    let h = 0.62 + pfbm(i / s * 70, j / s * 5, 3, 70) * 0.22;
    if (gap < 0.09) h -= (1 - gap / 0.09) * 0.7;
    return h;
  },
  rough: (i, j, cav) => clamp(0.85 - cav * 0.1, 0.55, 1),
});

/* ============================================================ TEXTURE BUILD */

/* The pixel data is cached by NAME ONLY. Different tile scales are separate
   textures that share one image source, so asking for concreteWalk at four
   different repeats costs one generation and one GPU upload, not four. */
const rawCache = new Map();

function buildSurfaceRaw(name) {
  if (rawCache.has(name)) return rawCache.get(name);
  const def = SURFACES[name];
  if (!def) throw new Error(`[materials] unknown surface "${name}"`);
  const n = Math.min(def.size, SIZE);

  /* one height field, shared by the normal map and the ORM map */
  const H = new Float32Array(n * n);
  const ctx = { size: n };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) H[j * n + i] = def.height.call(ctx, i, j);
  }

  /* albedo (+ alpha where the surface declares a mask) */
  const data = new Uint8Array(n * n * 4);
  const out = [0, 0, 0];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      def.albedo.call(ctx, i, j, out, n);
      const o = (j * n + i) * 4;
      data[o]     = clamp(out[0], 0, 1) * 255;
      data[o + 1] = clamp(out[1], 0, 1) * 255;
      data[o + 2] = clamp(out[2], 0, 1) * 255;
      data[o + 3] = def.mask ? def.mask(i, j) * 255 : 255;
    }
  }
  const albedo = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  albedo.colorSpace = THREE.SRGBColorSpace;
  albedo.wrapS = albedo.wrapT = THREE.RepeatWrapping;
  albedo.minFilter = THREE.LinearMipmapLinearFilter;
  albedo.magFilter = THREE.LinearFilter;
  albedo.generateMipmaps = true;
  albedo.anisotropy = MAXANISO;
  albedo.needsUpdate = true;

  const normal = normalFromHeightArray(n, H, def.normalStrength || 1, 1, 1);
  const orm = ormFromHeightArray(n, H, (i, j, c) => def.rough(i, j, c), 1, 1);

  const set = { albedo, normal, orm, size: n };
  rawCache.set(name, set);
  return set;
}

const tiledCache = new Map();

/* the public texture factory — every call takes EXPLICIT repeatU and repeatV.
   v3 declared four factories with one parameter and called them with two, so
   the second repeat value was silently discarded and bark tiled 1:1 instead
   of 1:3. */
export function surface(name, repeatU, repeatV) {
  if (repeatU == null || repeatV == null) {
    throw new Error(`[materials] surface("${name}") requires explicit repeatU and repeatV`);
  }
  const key = name + '|' + repeatU + '|' + repeatV;
  if (tiledCache.has(key)) return tiledCache.get(key);
  const raw = buildSurfaceRaw(name);
  if (repeatU === 1 && repeatV === 1) { tiledCache.set(key, raw); return raw; }
  const set = { size: raw.size };
  for (const k of ['albedo', 'normal', 'orm']) {
    const t = raw[k].clone();          /* shares .source: one GPU upload */
    t.repeat.set(repeatU, repeatV);
    t.needsUpdate = true;
    set[k] = t;
  }
  tiledCache.set(key, set);
  return set;
}

/* ---------------------------------------------------------- material factory */
const MATS = new Map();
let frozen = false;

export function mat(name, build) {
  if (MATS.has(name)) return MATS.get(name);
  if (frozen) throw new Error(`[materials] library is frozen; cannot create "${name}"`);
  const m = build();
  m.name = name;
  m.userData.libraryName = name;
  MATS.set(name, m);
  return m;
}

/* explicit, registered clone — the only legal way to vary a library material */
export function variant(baseName, id, tweak) {
  const key = baseName + '#' + id;
  if (MATS.has(key)) return MATS.get(key);
  const base = MATS.get(baseName);
  if (!base) throw new Error(`[materials] no base material "${baseName}"`);
  const m = base.clone();
  m.name = key;
  m.userData.libraryName = key;
  tweak(m);
  MATS.set(key, m);
  return m;
}

function std(surfName, ru, rv, opts) {
  opts = opts || {};
  const s = surface(surfName, ru, rv);
  const m = new THREE.MeshStandardMaterial({
    map: s.albedo,
    normalMap: s.normal,
    roughnessMap: s.orm,
    aoMap: s.orm,
    roughness: opts.roughness != null ? opts.roughness : 1.0,
    metalness: opts.metalness != null ? opts.metalness : 0.0,
    color: opts.color != null ? new THREE.Color(opts.color) : 0xffffff,
    side: opts.side || THREE.FrontSide,
    transparent: !!opts.transparent,
    opacity: opts.opacity != null ? opts.opacity : 1,
    alphaTest: opts.alphaTest || 0,
    envMapIntensity: opts.envMapIntensity != null ? opts.envMapIntensity : 1.0,
  });
  /* three reads roughness from .g and AO from .r of the ORM texture */
  m.userData.ormPacked = true;
  if (opts.polygonOffset) {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -2;
  }
  if (opts.normalScale) m.normalScale = new THREE.Vector2(opts.normalScale, opts.normalScale);
  return m;
}

/* three's MeshStandardMaterial samples aoMap from uv2/uv1. Point it at uv0 and
   read roughness from the green channel — the standard ORM convention. */
function patchORM(m) {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <aomap_fragment>',
      `#ifdef USE_AOMAP
        float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
        reflectedLight.indirectDiffuse *= ambientOcclusion;
        #if defined( USE_CLEARCOAT )
          clearcoatSpecularIndirect *= ambientOcclusion;
        #endif
        #if defined( USE_SHEEN )
          sheenSpecularIndirect *= ambientOcclusion;
        #endif
        #if defined( USE_ENVMAP ) && defined( STANDARD )
          float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
          reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
        #endif
      #endif`
    );
  };
  return m;
}

/* ================================================================== LIBRARY */
export const MAT = {};

export function buildMaterialLibrary(renderer, quality) {
  MAXANISO = renderer.capabilities.getMaxAnisotropy();
  const q = (typeof location !== 'undefined') ? new URLSearchParams(location.search).get('tex') : null;
  SIZE = q ? parseInt(q, 10) : (quality.name === 'Mobile' ? 256 : TEXTURE_SIZE.default);

  const P = { polygonOffset: true };

  /* --- paving and ground-hugging surfaces (all ledger layers) */
  MAT.asphalt      = mat('asphalt',      () => patchORM(std('asphaltNew',   0.14, 0.14, { roughness: 1 })));
  MAT.asphaltWorn  = mat('asphaltWorn',  () => patchORM(std('asphaltWorn',  0.14, 0.14, { roughness: 1 })));
  MAT.asphaltRubber= mat('asphaltRubber',() => patchORM(std('asphaltRubber',0.14, 0.14, { roughness: 1 })));
  MAT.concreteWalk = mat('concreteWalk', () => patchORM(std('concreteWalk', 0.22, 0.22, { roughness: 1 })));
  MAT.concreteCurb = mat('concreteCurb', () => patchORM(std('concreteCurb', 0.5,  1.6,  { roughness: 1 })));
  MAT.concretePad  = mat('concretePad',  () => patchORM(std('concreteWalk', 0.16, 0.16, { roughness: 1, color: 0xdedad2 })));
  MAT.paver        = mat('paver',        () => patchORM(std('paver',        0.30, 0.30, { roughness: 1 })));
  MAT.gravel       = mat('gravel',       () => patchORM(std('gravel',       0.5,  0.5,  { roughness: 1 })));
  MAT.deck         = mat('deck',         () => patchORM(std('deckTimber',   0.35, 0.35, { roughness: 1 })));

  /* --- markings: bright, flat, and offset so they never z-fight the asphalt */
  MAT.markWhite  = mat('markWhite',  () => new THREE.MeshStandardMaterial({
    color: 0xe8e8e2, roughness: 0.72, metalness: 0, ...P, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  MAT.markYellow = mat('markYellow', () => new THREE.MeshStandardMaterial({
    color: 0xe0ab27, roughness: 0.72, metalness: 0, ...P, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  MAT.markBlue   = mat('markBlue',   () => new THREE.MeshStandardMaterial({
    color: 0x2c62b8, roughness: 0.74, metalness: 0, ...P, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  MAT.markRed    = mat('markRed',    () => new THREE.MeshStandardMaterial({
    color: 0xa8332b, roughness: 0.74, metalness: 0, ...P, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  MAT.tactile    = mat('tactile',    () => new THREE.MeshStandardMaterial({
    color: 0xb8562a, roughness: 0.82, metalness: 0 }));

  /* --- envelope */
  MAT.panelWall  = mat('panelWall',  () => patchORM(std('panelWall', 0.25, 0.25, { roughness: 1, metalness: 0.55, envMapIntensity: 1.1 })));
  MAT.panelWallW = mat('panelWallW', () => patchORM(std('panelWall', 0.25, 0.25, { roughness: 1, metalness: 0.5, color: 0xe9ebee })));
  MAT.panelWallD = mat('panelWallD', () => patchORM(std('panelWall', 0.25, 0.25, { roughness: 1, metalness: 0.5, color: 0x6e7681 })));
  MAT.roofSeam   = mat('roofSeam',   () => patchORM(std('roofSeam',  0.20, 0.20, { roughness: 1, metalness: 0.62 })));
  MAT.roofMembrane = mat('roofMembrane', () => patchORM(std('concreteWalk', 0.10, 0.10, { roughness: 1, color: 0xbfc3c2 })));
  MAT.precast    = mat('precast',    () => patchORM(std('concreteCurb', 0.14, 0.14, { roughness: 1, color: 0xcfcabf })));
  MAT.brick      = mat('brick',      () => patchORM(std('paver', 0.5, 0.5, { roughness: 1, color: 0x9a5f49 })));

  /* --- glass. v3's glazing had no transparent flag at all — it was solid. */
  MAT.glass = mat('glass', () => {
    const s = surface('fritGlass', 3, 3);
    return patchORM(new THREE.MeshPhysicalMaterial({
      map: s.albedo, normalMap: s.normal, roughnessMap: s.orm,
      color: 0x9fb4c4, metalness: 0.0, roughness: 0.06,
      transmission: 0.86, thickness: 0.06, ior: 1.52,
      transparent: true, opacity: 1, side: THREE.DoubleSide,
      envMapIntensity: 1.6, specularIntensity: 1.0,
    }));
  });
  MAT.glassSimple = mat('glassSimple', () => new THREE.MeshPhysicalMaterial({
    color: 0x8ea8bd, metalness: 0.05, roughness: 0.07, transparent: true,
    opacity: 0.30, side: THREE.DoubleSide, envMapIntensity: 1.7,
  }));
  MAT.ghGlazing = mat('ghGlazing', () => {
    const s = surface('ghGlazing', 4, 4);
    return new THREE.MeshPhysicalMaterial({
      map: s.albedo, normalMap: s.normal, roughnessMap: s.orm,
      color: 0xd6e6ec, metalness: 0, roughness: 0.16,
      transparent: true, opacity: 0.42, side: THREE.DoubleSide,
      envMapIntensity: 1.25,
    });
  });

  /* --- metals */
  MAT.steel      = mat('steel',      () => patchORM(std('steelPainted', 0.6, 0.6, { roughness: 1, metalness: 0.85 })));
  MAT.steelDark  = mat('steelDark',  () => patchORM(std('steelPainted', 0.6, 0.6, { roughness: 1, metalness: 0.85, color: 0x4a4f56 })));
  MAT.galv       = mat('galv',       () => patchORM(std('steelGalv',    0.6, 0.6, { roughness: 1, metalness: 0.9 })));
  MAT.weathering = mat('weathering', () => patchORM(std('steelWeather', 0.5, 0.5, { roughness: 1, metalness: 0.6 })));
  MAT.alu        = mat('alu',        () => patchORM(std('aluminium',    0.6, 0.6, { roughness: 1, metalness: 0.95 })));

  /* --- PV */
  MAT.pv = mat('pv', () => patchORM(std('pv', 1, 1, { roughness: 1, metalness: 0.25, envMapIntensity: 1.5 })));

  /* --- vegetation */
  MAT.barkPine  = mat('barkPine',  () => patchORM(std('barkPine',  1, 3, { roughness: 1 })));
  MAT.barkOak   = mat('barkOak',   () => patchORM(std('barkOak',   1, 3, { roughness: 1 })));
  MAT.barkBirch = mat('barkBirch', () => patchORM(std('barkBirch', 1, 3, { roughness: 1 })));
  MAT.barkCedar = mat('barkCedar', () => patchORM(std('barkCedar', 1, 3, { roughness: 1 })));

  const fol = (n, sName, col) => mat(n, () => {
    const s = surface(sName, 1, 1);
    return new THREE.MeshStandardMaterial({
      map: s.albedo, normalMap: s.normal, roughnessMap: s.orm,
      alphaTest: 0.42, transparent: false, side: THREE.DoubleSide,
      roughness: 1, metalness: 0, color: col || 0xffffff,
    });
  });
  MAT.folPine     = fol('folPine', 'folPine');
  MAT.folCedar    = fol('folCedar', 'folCedar');
  MAT.folOak      = fol('folOak', 'folOak');
  MAT.folPoplar   = fol('folPoplar', 'folPoplar');
  MAT.folBirch    = fol('folBirch', 'folBirch');
  MAT.folPalmetto = fol('folPalmetto', 'folPalmetto');

  /* --- flat utility colours, used only where a texture would be invisible */
  const flat = (n, c, r, m2) => mat(n, () => new THREE.MeshStandardMaterial({
    color: c, roughness: r == null ? 0.8 : r, metalness: m2 || 0 }));
  flat('rubber', 0x22242a, 0.95);
  flat('dirt', 0x6a5540, 0.98);
  flat('mulch', 0x4a3526, 0.98);
  flat('shell', 0xd8d2c4, 0.9);
  flat('canvas', 0xe4e0d6, 0.88);
  flat('signGreen', 0x1d5c3c, 0.7);
  flat('signBrown', 0x4a3a26, 0.72);
  flat('signBlue', 0x1c4a86, 0.7);
  flat('bronze', 0x6b4a2a, 0.44, 0.75);
  flat('copper', 0x7a4a34, 0.42, 0.8);
  flat('planting', 0x2c4a24, 0.95);
  flat('crop', 0x3d6b28, 0.92);
  flat('marsh', 0x6d7a44, 0.94);
  flat('foam', 0xf2f4f2, 0.75);
  flat('tyre', 0x1a1b1e, 0.94);
  MAT.rubber = MATS.get('rubber'); MAT.dirt = MATS.get('dirt');
  MAT.mulch = MATS.get('mulch');   MAT.shell = MATS.get('shell');
  MAT.canvas = MATS.get('canvas'); MAT.signGreen = MATS.get('signGreen');
  MAT.signBrown = MATS.get('signBrown'); MAT.signBlue = MATS.get('signBlue');
  MAT.bronze = MATS.get('bronze'); MAT.copper = MATS.get('copper');
  MAT.planting = MATS.get('planting'); MAT.crop = MATS.get('crop');
  MAT.marsh = MATS.get('marsh'); MAT.foam = MATS.get('foam');
  MAT.tyre = MATS.get('tyre');

  /* --- emissive sets for night. One material per building group, not one
         shared material for the whole campus: in v3 every window in the world
         lit at identical intensity at the identical instant. */
  MAT.emitWarm = mat('emitWarm', () => new THREE.MeshStandardMaterial({
    color: 0x120e08, emissive: 0xffca7a, emissiveIntensity: 0.0, roughness: 0.35 }));
  MAT.emitCool = mat('emitCool', () => new THREE.MeshStandardMaterial({
    color: 0x080c12, emissive: 0xbcd8ff, emissiveIntensity: 0.0, roughness: 0.3 }));
  MAT.emitAmber = mat('emitAmber', () => new THREE.MeshStandardMaterial({
    color: 0x140c04, emissive: 0xff9a3c, emissiveIntensity: 0.0, roughness: 0.4 }));
  MAT.emitRed = mat('emitRed', () => new THREE.MeshStandardMaterial({
    color: 0x160404, emissive: 0xff3320, emissiveIntensity: 0.0, roughness: 0.4 }));

  /* --- MUTCD sign faces.
     Sign sheeting is retroreflective, not painted: it returns light toward
     the source rather than scattering it. A flat diffuse material makes
     every sign go dead at night, which is precisely backwards — at night a
     sign is the brightest thing on the street. Modelled as a low-roughness
     dielectric with a small emissive floor, so it stays legible after dark
     without pretending to be a light source. The colours are the published
     PMS equivalents from spec/signage.js. */
  const sheet = (n, c, emissive) => mat(n, () => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.34, metalness: 0.0,
    emissive: emissive == null ? c : emissive, emissiveIntensity: 0.06,
  }));
  sheet('signRed',        0xaf1e2d);   /* PMS 187 — STOP                     */
  sheet('signWhite',      0xf2f2f2);
  sheet('signBlack',      0x1a1a1a, 0x000000);
  sheet('signYellow',     0xffcc00);   /* PMS 116 — warning                  */
  sheet('signFluorGreen', 0xd6e64b);   /* fluorescent yellow-green           */
  sheet('signOrange',     0xf58220);   /* PMS 152 — temporary control        */
  MAT.signRed = MATS.get('signRed');       MAT.signWhite = MATS.get('signWhite');
  MAT.signBlack = MATS.get('signBlack');   MAT.signYellow = MATS.get('signYellow');
  MAT.signFluorGreen = MATS.get('signFluorGreen');
  MAT.signOrange = MATS.get('signOrange');

  /* --- traffic signal lenses.
     Four materials, not one: a lens that is dark is a different surface from
     a lens that is lit, and the world swaps between them as the controller
     runs. Emissive intensity is driven per-frame by the signal system. */
  const lens = (n, c) => mat(n, () => new THREE.MeshStandardMaterial({
    color: 0x0a0c0e, emissive: c, emissiveIntensity: 0.0,
    roughness: 0.22, metalness: 0.0 }));
  MAT.lensRed    = lens('lensRed',    0xff2418);
  MAT.lensYellow = lens('lensYellow', 0xffb400);
  MAT.lensGreen  = lens('lensGreen',  0x00d05a);
  MAT.lensPedHand = lens('lensPedHand', 0xff5a2b);
  MAT.lensPedWalk = lens('lensPedWalk', 0xf5f5f5);
  MAT.lensDark   = mat('lensDark', () => new THREE.MeshStandardMaterial({
    color: 0x14181c, roughness: 0.28, metalness: 0.1 }));

  /* --- detectable warning surface.
     Safety yellow, and deliberately glossier than the concrete around it:
     a cast iron or composite DWS panel weathers differently from a poured
     walk and the difference is how you spot one from across a street. */
  MAT.dws = mat('dws', () => new THREE.MeshStandardMaterial({
    color: 0xf2b800, roughness: 0.58, metalness: 0.0 }));

  return MAT;
}

/* --------------------------------------------------------------- freeze pass
   After the world is built, no material may be mutated. A dev-mode proxy
   reports any attempt. */
export function freezeMaterials(devMode) {
  frozen = true;
  const violations = [];
  if (!devMode) {
    for (const m of MATS.values()) m.userData.frozen = true;
    return violations;
  }
  const guarded = ['side', 'transparent', 'opacity', 'color', 'roughness',
                   'metalness', 'map', 'normalMap', 'wireframe', 'depthWrite'];
  const seen = new Set();
  for (const m of MATS.values()) {
    m.userData.frozen = true;
    for (const k of guarded) {
      /* The renderer itself toggles .side on transparent double-sided
         materials every frame (back-face pass, then front, then restore) —
         that is three.js working as designed, not a mutation of ours. */
      if (k === 'side' && m.transparent && m.side === THREE.DoubleSide &&
          m.forceSinglePass === false) continue;
      let v = m[k];
      try {
        Object.defineProperty(m, k, {
          configurable: true,
          get() { return v; },
          set(nv) {
            const key = `${m.name}.${k}`;
            if (!seen.has(key)) {
              seen.add(key);
              violations.push(`${key} mutated after freeze`);
            }
            v = nv;
          },
        });
      } catch (e) { /* some properties are not reconfigurable */ }
    }
  }
  return violations;
}

export function materialList() { return Array.from(MATS.values()); }

export function disposeMaterials() {
  for (const m of MATS.values()) {
    for (const k of ['map', 'normalMap', 'roughnessMap', 'aoMap', 'emissiveMap',
                     'metalnessMap', 'alphaMap']) {
      if (m[k] && m[k].dispose) m[k].dispose();
    }
    m.dispose();
  }
  MATS.clear();
  rawCache.clear();
  tiledCache.clear();
  frozen = false;
}

/* ======================================================= TERRAIN SPLAT SHADER
   Six biome layers in a DataArrayTexture, blended per vertex. Because the UVs
   come from world position, texel density is uniform by construction — the
   structural fix for v3's 87 m/tile terrain against 0.042 m/tile berm.        */

const BIOME_SURFACES = ['grass', 'meadow', 'sand', 'wetSand', 'gravel', 'soil'];
const BIOME_SCALE   = [0.42, 0.36, 0.55, 0.55, 0.62, 0.48];   /* tiles per metre */

function arrayTexture(getSet, which, size) {
  const layers = BIOME_SURFACES.length;
  const data = new Uint8Array(size * size * 4 * layers);
  for (let l = 0; l < layers; l++) {
    const src = getSet(BIOME_SURFACES[l])[which].image.data;
    data.set(src, l * size * size * 4);
  }
  const t = new THREE.DataArrayTexture(data, size, size, layers);
  t.format = THREE.RGBAFormat;
  t.colorSpace = which === 'albedo' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = MAXANISO;
  t.needsUpdate = true;
  return t;
}

export function buildTerrainMaterial(quality) {
  const size = Math.min(SIZE, 1024);
  const sets = {};
  for (const n of BIOME_SURFACES) sets[n] = surface(n, 1, 1);
  const getSet = (n) => sets[n];

  const tAlb = arrayTexture(getSet, 'albedo', size);
  const tNrm = arrayTexture(getSet, 'normal', size);
  const tOrm = arrayTexture(getSet, 'orm', size);

  const m = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0,
    color: 0xffffff, side: THREE.FrontSide,
  });
  m.name = 'terrain';
  m.defines = { TERRAIN_SPLAT: '' };

  const uni = {
    tAlb: { value: tAlb }, tNrm: { value: tNrm }, tOrm: { value: tOrm },
    uScale: { value: BIOME_SCALE.slice() },
    uDetail: { value: quality.detailNormals ? 1.0 : 0.0 },
    uWetLine: { value: 0.0 },
  };
  m.userData.uniforms = uni;

  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uni);

    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 bw0;
        attribute vec4 bw1;
        varying vec4 vB0;
        varying vec4 vB1;
        varying vec3 vWPos;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vB0 = bw0; vB1 = bw1;
        vWPos = ( modelMatrix * vec4( position, 1.0 ) ).xyz;`);

    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        precision highp sampler2DArray;
        uniform sampler2DArray tAlb;
        uniform sampler2DArray tNrm;
        uniform sampler2DArray tOrm;
        uniform float uScale[6];
        uniform float uDetail;
        varying vec4 vB0;
        varying vec4 vB1;
        varying vec3 vWPos;

        void splat( out vec3 alb, out vec3 nrm, out vec2 ro ) {
          float w[6];
          w[0]=vB0.x; w[1]=vB0.y; w[2]=vB0.z; w[3]=vB0.w; w[4]=vB1.x; w[5]=vB1.y;
          alb = vec3(0.0); nrm = vec3(0.0); ro = vec2(0.0);
          float tot = 0.0;
          for ( int i = 0; i < 6; i ++ ) {
            float wi = w[i];
            if ( wi < 0.004 ) continue;
            vec2 uv = vWPos.xz * uScale[i];
            alb += texture( tAlb, vec3( uv, float(i) ) ).rgb * wi;
            nrm += ( texture( tNrm, vec3( uv, float(i) ) ).rgb * 2.0 - 1.0 ) * wi;
            ro  += texture( tOrm, vec3( uv, float(i) ) ).rg * wi;
            tot += wi;
          }
          if ( tot > 0.0001 ) { alb /= tot; nrm /= tot; ro /= tot; }
          else { alb = vec3(0.3); nrm = vec3(0.0,0.0,1.0); ro = vec2(1.0,0.9); }
          // macro/micro layering: a second high-frequency normal at ~1 m tiling
          // kills the "one texture stretched over 87 m" read
          if ( uDetail > 0.5 ) {
            vec3 d = texture( tNrm, vec3( vWPos.xz * 0.31, 5.0 ) ).rgb * 2.0 - 1.0;
            nrm = normalize( nrm + d * 0.14 );
          }
        }`)
      .replace('#include <map_fragment>', `
        vec3 sAlb; vec3 sNrm; vec2 sRo;
        splat( sAlb, sNrm, sRo );
        diffuseColor.rgb *= sAlb;`)
      .replace('#include <roughnessmap_fragment>', `
        // floor at 0.55: ground is never glossier than damp soil. The old
        // 0.04 floor let the splat data drop the graded corridors to near
        // mirror, which painted a blinding specular band along the gate
        // approach at every grazing camera angle.
        float roughnessFactor = roughness * clamp( sRo.y, 0.55, 1.0 );`)
      .replace('#include <normal_fragment_maps>', `
        // world-space perturbation: the terrain's tangent frame is X/Z with Y up,
        // so the map's x,y go to world x,z. The previous basis put the map's y
        // on world Y, which produced wrong normals and specular sparkle.
        vec3 tn = normalize( sNrm );
        normal = normalize( normal + vec3( tn.x, 0.0, tn.y ) * 0.20 );`)
      .replace('#include <aomap_fragment>', `
        reflectedLight.indirectDiffuse *= clamp( sRo.x, 0.0, 1.0 );`);
  };
  MATS.set('terrain', m);
  return m;
}
