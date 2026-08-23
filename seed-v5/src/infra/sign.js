/* ============================================================================
   infra/sign.js — MUTCD signs with real panel shapes and real legends
   ----------------------------------------------------------------------------
   A stop sign is an octagon, not a red box, and the difference is legible
   from two hundred metres because the silhouette is the first thing read.
   MUTCD deliberately assigns a unique shape to each message class for
   exactly that reason, so the shapes are built as shapes.

   Legends are drawn to a canvas at the letter height the standard specifies,
   using the proportions of the FHWA Series fonts. The real typeface is not
   redistributable, so this uses a condensed sans at the correct cap height
   and stroke weight — the size and spacing are right even though the
   letterforms are an approximation, and that is stated rather than implied.
   ========================================================================== */

import * as THREE from 'three';
import { mesh, box, cyl } from '../geom.js';
import { MAT } from '../03-materials.js';
import { groundH } from '../01-terrain.js';
import { MOUNT, POST, SIGNS, SIGN_COLOUR, signSize, IN, FT } from '../spec/index.js';

const texCache = new Map();

/* ------------------------------------------------------------ panel shapes */
/** Regular octagon inscribed in a circle of the given width. MUTCD R1-1. */
function octagonShape(w) {
  const s = new THREE.Shape();
  /* A 30 in stop sign is 30 in across the flats, so the circumradius is
     w / (2 cos(22.5 deg)), not w/2 — getting this wrong makes the sign
     noticeably small, which is the usual mistake. */
  const R = w / (2 * Math.cos(Math.PI / 8));
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + (i * Math.PI) / 4;
    const px = Math.cos(a) * R, py = Math.sin(a) * R;
    if (i === 0) s.moveTo(px, py); else s.lineTo(px, py);
  }
  s.closePath();
  return s;
}

/** Diamond — a square on its point. Warning series. */
function diamondShape(w, h) {
  const s = new THREE.Shape();
  s.moveTo(0, h / 2); s.lineTo(w / 2, 0); s.lineTo(0, -h / 2); s.lineTo(-w / 2, 0);
  s.closePath();
  return s;
}

/** Equilateral triangle, point down. MUTCD R1-2 YIELD. */
function triangleDownShape(w) {
  const s = new THREE.Shape();
  const h = (w * Math.sqrt(3)) / 2;
  s.moveTo(-w / 2, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(0, -h / 2);
  s.closePath();
  return s;
}

/** Rectangle with the small corner radius every real sign blank has. */
function rectShape(w, h, r) {
  r = r == null ? Math.min(w, h) * 0.06 : r;
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  s.closePath();
  return s;
}

function panelShape(shape, w, h) {
  switch (shape) {
    case 'octagon':       return octagonShape(w);
    case 'diamond':       return diamondShape(w, h);
    case 'triangleDown':  return triangleDownShape(w);
    default:              return rectShape(w, h);
  }
}

/* ------------------------------------------------------------ sign face
   The legend is painted into a texture rather than modelled, because a sign
   face is flat and a texture at the right resolution is both cheaper and
   sharper than extruded letterforms. Resolution is set from the panel size
   so a 12 in parking sign and a 4 ft guide sign both get the same pixels
   per inch.                                                                */
function faceTexture(spec, text) {
  const key = `${spec.key}|${text || ''}`;
  if (texCache.has(key)) return texCache.get(key);

  const PPI = 24;                                  /* pixels per inch of panel */
  const wPx = Math.max(64, Math.round((spec.w / 0.0254) * PPI));
  const hPx = Math.max(64, Math.round((spec.h / 0.0254) * PPI));
  const c = document.createElement('canvas');
  c.width = Math.min(1024, wPx); c.height = Math.min(1024, hPx);
  const g = c.getContext('2d');
  const sx = c.width / spec.w, sy = c.height / spec.h;   /* px per metre */

  const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex(spec.face);
  g.fillRect(0, 0, c.width, c.height);

  /* border, inset from the edge by its own width as MUTCD draws it */
  if (spec.border && spec.borderWidth) {
    g.strokeStyle = hex(spec.border);
    g.lineWidth = spec.borderWidth * sx;
    const inset = spec.borderWidth * sx * 1.5;
    g.strokeRect(inset, inset, c.width - inset * 2, c.height - inset * 2);
  }

  const legend = text != null ? text : spec.legendText;
  if (legend) {
    const lines = String(legend).split('\n');
    const capH = (spec.legendHeight || spec.h * 0.28) * sy;
    /* FHWA Series D is a condensed grotesque; this approximates its cap
       height and stroke weight, not its letterforms. */
    g.font = `600 ${capH}px "Arial Narrow", "Inter", system-ui, sans-serif`;
    g.fillStyle = hex(spec.legend);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const lead = capH * 1.18;
    const y0 = c.height / 2 - ((lines.length - 1) * lead) / 2;
    for (let i = 0; i < lines.length; i++) {
      g.fillText(lines[i], c.width / 2, y0 + i * lead);
    }
  }

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  texCache.set(key, t);
  return t;
}

/* -------------------------------------------------------------- the panel */
export function signPanel(key, roadClass, text) {
  const spec = signSize(key, roadClass);
  const shape = panelShape(spec.shape, spec.w, spec.h);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: MOUNT.panelThickness, bevelEnabled: false,
  });
  geo.translate(0, 0, -MOUNT.panelThickness / 2);
  /* UVs from ExtrudeGeometry are in shape space; remap to 0..1 over the
     panel bounds so the face texture lands square on the blank */
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const uv = geo.attributes.uv, pos = geo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i,
      (pos.getX(i) - bb.min.x) / (bb.max.x - bb.min.x),
      (pos.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
  }
  uv.needsUpdate = true;

  const m = new THREE.MeshStandardMaterial({
    map: faceTexture(spec, text),
    roughness: 0.34, metalness: 0,
    emissiveMap: faceTexture(spec, text),
    emissive: 0xffffff, emissiveIntensity: 0.05,
    side: THREE.DoubleSide,
  });
  m.userData.signKey = key;
  const panel = new THREE.Mesh(geo, m);
  panel.castShadow = true; panel.receiveShadow = true;
  panel.userData.spec = spec;
  return panel;
}

/**
 * A sign on its post(s), planted at (x, z) and facing `facing` radians.
 *
 * `facing` is the direction the sign FACE looks — i.e. back down the
 * approach toward the driver who reads it, not the direction of travel.
 */
export function postedSign(x, z, key, facing, opts = {}) {
  const spec = signSize(key, opts.roadClass);
  const g = new THREE.Group();
  g.name = `sign-${key}`;
  const y0 = groundH(x, z);

  const mountH = opts.mount != null ? opts.mount : spec.mount;
  /* Panel centre. The spec height is to the BOTTOM of the panel, which is
     how MUTCD measures it — using it as a centre height puts every sign in
     the world half a panel too low. */
  const centreY = y0 + mountH + spec.h / 2;
  const postTop = centreY + spec.h / 2;

  const twoPost = spec.w > MOUNT.twoPostAbove;
  const offs = twoPost
    ? [-spec.w * MOUNT.twoPostSpacing / 2, spec.w * MOUNT.twoPostSpacing / 2]
    : [0];

  const px = Math.cos(facing + Math.PI / 2), pz = Math.sin(facing + Math.PI / 2);
  for (const o of offs) {
    const sx = x + px * o, sz = z + pz * o;
    const len = postTop - y0 + POST.stubHeight;
    g.add(mesh(box(POST.squareTubeSide, len, POST.squareTubeSide), MAT.galv,
      sx, y0 - POST.stubHeight + len / 2, sz, { rotY: -facing }));
    /* the anchor sleeve, a slightly fatter tube for the first few inches */
    g.add(mesh(box(POST.sleeveSide, POST.stubHeight * 2, POST.sleeveSide), MAT.steelDark,
      sx, y0 + POST.stubHeight * 0.4, sz, { rotY: -facing }));
  }

  const panel = signPanel(key, opts.roadClass, opts.text);
  panel.position.set(x, centreY, z);
  panel.rotation.y = -facing;
  g.add(panel);

  /* a plaque below the primary panel, e.g. ALL WAY under a STOP */
  if (opts.plaque) {
    const ps = signSize(opts.plaque, opts.roadClass);
    const pp = signPanel(opts.plaque, opts.roadClass, opts.plaqueText);
    pp.position.set(x, y0 + mountH - ps.h / 2 - IN(2), z);
    pp.rotation.y = -facing;
    g.add(pp);
  }

  g.userData.spec = {
    key, code: spec.code, w: spec.w, h: spec.h,
    mountToBottom: mountH, facing,
  };
  return g;
}

/**
 * Street name blade, mounted above another sign on a shared post or on a
 * signal mast. Two blades at right angles, as at a real corner.
 */
export function streetNameBlade(x, z, y, names, facing) {
  const spec = SIGNS.streetName;
  const g = new THREE.Group();
  g.name = 'street-blade';
  const list = Array.isArray(names) ? names : [names];

  for (let i = 0; i < list.length; i++) {
    const nm = list[i];
    /* Blade length follows the legend, as a real blade does: cap height
       times the average advance width of the FHWA series, plus margins. */
    const w = Math.max(FT(2), nm.length * spec.letterHeightLocal * 0.62 + IN(6));
    const blade = signPanel('wayfinding', null, nm);
    blade.geometry.dispose();
    const sh = rectShape(w, spec.bladeHeight, IN(0.5));
    blade.geometry = new THREE.ExtrudeGeometry(sh, {
      depth: spec.bladeThickness, bevelEnabled: false });
    blade.geometry.computeBoundingBox();
    const bb = blade.geometry.boundingBox;
    const uv = blade.geometry.attributes.uv, pos = blade.geometry.attributes.position;
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, (pos.getX(k) - bb.min.x) / (bb.max.x - bb.min.x),
                  (pos.getY(k) - bb.min.y) / (bb.max.y - bb.min.y));
    }
    uv.needsUpdate = true;
    blade.material = new THREE.MeshStandardMaterial({
      map: faceTexture({ ...SIGNS.wayfinding, key: `blade-${nm}`,
                         w, h: spec.bladeHeight,
                         legendHeight: spec.letterHeightLocal }, nm),
      roughness: 0.34, metalness: 0, side: THREE.DoubleSide,
    });
    blade.position.set(x, y + i * (spec.bladeHeight + IN(1)), z);
    blade.rotation.y = -(facing + (i * Math.PI) / 2);
    g.add(blade);
  }
  return g;
}

/** Clear the texture cache — called on teardown so a hot reload does not leak. */
export function disposeSignTextures() {
  for (const t of texCache.values()) t.dispose();
  texCache.clear();
}
