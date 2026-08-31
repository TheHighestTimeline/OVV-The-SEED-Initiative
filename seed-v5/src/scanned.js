/* ============================================================================
   scanned.js — photographed material intake
   ----------------------------------------------------------------------------
   Every surface in this world is generated from fbm noise. Noise gives a
   plausible value range and no structure: real asphalt has graded aggregate,
   real concrete has trowel direction and aggregate exposed where feet wear it.
   That difference is why a dimensionally correct street still reads as fake,
   and it is a data problem — no amount of shader tuning substitutes for a
   photograph.

   This module lets a scanned PBR set stand in for any procedural surface. It
   is deliberately fail-soft: a surface with no scanned set on disk keeps its
   procedural texture, so the world builds identically whether or not any
   assets are present. Drop sets in, they take over; remove them, nothing
   breaks.

   Expected layout, one directory per set, under public/assets/materials/:

     <name>/color.jpg      albedo, sRGB
     <name>/normal.jpg     tangent-space normal, OpenGL convention (+Y up)
     <name>/roughness.jpg  linear, greyscale
     <name>/ao.jpg         linear, greyscale (optional — white if absent)

   Those are exactly the four maps ambientCG ships as Color / NormalGL /
   Roughness / AmbientOcclusion, so a downloaded set needs renaming and
   nothing else.

   Roughness and AO are packed into one ORM texture here because that is what
   the material factory already expects: three samples roughness from .g and
   AO from .r of a single map. Packing costs one canvas pass at load and saves
   a texture unit and a fetch per material.
   ========================================================================== */

import * as THREE from 'three';

/* Which procedural surface each scanned set replaces. The key is the surface
   name used across 03-materials.js; the value is the directory to look in.
   A name absent from disk simply never overrides. */
export const SCANNED = {
  asphaltNew:    'asphalt',
  asphaltWorn:   'asphalt-worn',
  asphaltRubber: 'asphalt-rubber',
  concreteWalk:  'concrete-walk',
  concreteCurb:  'concrete-curb',
  paver:         'paving-stones',
  gravel:        'gravel',
  panelWall:     'metal-panel',
  roofSeam:      'roof-seam',
  deckTimber:    'timber-deck',
};

const loaded = new Map();
let basePath = 'assets/materials/';
let attempted = false;
let skipReason = null;

export function hasScanned(name) { return loaded.has(name); }
export function getScanned(name) { return loaded.get(name) || null; }
export function scannedReport() {
  return {
    attempted, skipReason,
    loaded: [...loaded.keys()], expected: Object.keys(SCANNED),
  };
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    /* No crossOrigin. These are same-origin relative paths, and setting it
       turns a plain 404 into a CORS failure the console reports as an error —
       which is how this first shipped, at 40 console errors on a build with
       no textures at all. */
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/* pack roughness into .g and AO into .r of one RGB texture */
function packORM(rough, ao, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });

  ctx.drawImage(rough, 0, 0, size, size);
  const rd = ctx.getImageData(0, 0, size, size);

  let ad = null;
  if (ao) {
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(ao, 0, 0, size, size);
    ad = ctx.getImageData(0, 0, size, size);
  }

  const out = ctx.createImageData(size, size);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i]     = ad ? ad.data[i] : 255;  /* r: ambient occlusion */
    out.data[i + 1] = rd.data[i];             /* g: roughness */
    out.data[i + 2] = 0;                      /* b: unused (metalness is scalar) */
    out.data[i + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);

  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

function texFrom(img, srgb, aniso) {
  const t = new THREE.Texture(img);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/* Called once, before buildMaterialLibrary. Resolves even when nothing is
   found — the caller reports the count and the world builds either way. */
export async function loadScanned(opts) {
  opts = opts || {};
  if (opts.basePath) basePath = opts.basePath;
  const aniso = opts.anisotropy || 8;
  attempted = true;

  /* The standalone single-file build is opened over file://, where there is
     no server to fetch a texture from and every request is a CORS error
     rather than a 404. Skip the whole thing there: that build is generated
     surfaces by definition. */
  if (typeof location !== 'undefined' && location.protocol === 'file:') {
    skipReason = 'file:// build — external textures cannot be fetched';
    return scannedReport();
  }

  /* One manifest probe decides whether any sets exist, so a world with no
     textures costs a single 404 instead of forty. fetch-assets.js writes
     this file; a hand-assembled directory needs one too. */
  let index = null;
  try {
    const res = await fetch(basePath + 'index.json', { cache: 'no-cache' });
    if (res.ok) index = await res.json();
  } catch (e) { /* absent is the normal case */ }
  if (!index || !Array.isArray(index.sets) || !index.sets.length) {
    skipReason = 'no assets/materials/index.json';
    return scannedReport();
  }
  const present = new Set(index.sets);

  await Promise.all(Object.entries(SCANNED)
    .filter(([, dir]) => present.has(dir))
    .map(async ([surf, dir]) => {
    const at = (f) => `${basePath}${dir}/${f}`;
    const [color, normal, rough, ao] = await Promise.all([
      loadImage(at('color.jpg')), loadImage(at('normal.jpg')),
      loadImage(at('roughness.jpg')), loadImage(at('ao.jpg')),
    ]);
    /* colour and roughness are the minimum: without them the set cannot
       stand in for a procedural surface that supplies both. */
    if (!color || !rough) return;
    const size = Math.min(color.width, 2048);
    loaded.set(surf, {
      albedo: texFrom(color, true, aniso),
      normal: normal ? texFrom(normal, false, aniso) : null,
      orm: packORM(rough, ao, size),
      size,
    });
  }));

  return scannedReport();
}
