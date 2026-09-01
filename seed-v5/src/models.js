/* ============================================================================
   models.js — downloaded model intake
   ----------------------------------------------------------------------------
   A downloaded model brings a shape. It does not bring a size: the same bench
   arrives at 0.9 m from one author and 90 m from another, facing whichever way
   their modeller happened to work. Trusting an author's transform is how a
   hydrant ends up taller than the building behind it.

   So this module takes only the geometry and derives everything else. Each
   entry names the real-world dimension the model must match, and that figure
   comes from spec/ — the same number the procedural version was built to. The
   model supplies the form, the standard supplies the scale, and a model
   swapped for a different one lands at exactly the same size.

   Fail-soft, like scanned.js: a name with no file on disk simply reports
   absent, and the caller keeps whatever it was building before. The world
   builds identically with an empty models folder.
   ========================================================================== */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { BIN, BENCH, BIKE_RACK, HYDRANT, FT } from './spec/index.js';

/* fitTo is the dimension the model is scaled to match, in metres, measured on
   the named axis of its own bounding box. Every figure traces to spec/.
   yaw rotates a model whose author faced it the wrong way; models are
   expected to sit with +Y up, which glTF guarantees. */
export const CATALOG = {
  bench:      { file: 'Bench_4.glb',                fit: 'y', size: BENCH.seatHeight * 2.1 },
  bin:        { file: 'triple_recycling_bin.glb',   fit: 'y', size: BIN.litter.bodyHeight + BIN.litter.lidHeight },
  hydrant:    { file: 'fire_hydrant.glb',           fit: 'y', size: HYDRANT.bonnetHeight },
  bikeRack:   { file: 'BicycleStand4.glb',          fit: 'y', size: BIKE_RACK.height },
  bikes:      { file: 'bikes.glb',                  fit: 'y', size: 1.10 },
  fountain:   { file: 'fountain_model.glb',         fit: 'y', size: 2.60 },
  container:  { file: 'Container.glb',              fit: 'z', size: FT(20.0) },   /* ISO 20 ft */
  coolingUnit:{ file: 'CoolingUnits01.glb',         fit: 'y', size: 2.20 },
  fence:      { file: 'Wire Fence.glb',             fit: 'y', size: FT(6.0) },
  tree:       { file: 'Tree+1.glb',                 fit: 'y', size: 12.0 },
  carSedan:   { file: 'Audi+TT+RS+2019.glb',        fit: 'z', size: 4.19 },       /* real length */
  carSuv:     { file: 'Range Rover Sports 2018 (.GLB).glb', fit: 'z', size: 4.88 },
  carPickup:  { file: 'Nissan+Frontier+Pickup+Truck+2004.glb', fit: 'z', size: 5.22 },
  personStand:{ file: 'Businessman.glb',            fit: 'y', size: 1.75 },
  personPosed:{ file: 'rp_posed_00178_29.glb',      fit: 'y', size: 1.70 },
};

const loaded = new Map();
const missing = [];
let basePath = 'assets/models/';

export function hasModel(name) { return loaded.has(name); }
export function getModel(name) { return loaded.get(name) || null; }
export function modelReport() {
  return {
    loaded: [...loaded.keys()], missing, expected: Object.keys(CATALOG),
    triangles: Object.fromEntries([...loaded].map(([k, v]) => [k, v.triangles])),
  };
}

/* How many copies of this model fit in a triangle budget. Returns 0 when the
   model is absent, so a caller can use the answer directly as a count. */
export function instanceBudget(name, triangleBudget) {
  const m = loaded.get(name);
  if (!m || !m.triangles) return 0;
  return Math.max(0, Math.floor(triangleBudget / m.triangles));
}

/* Scale so the named axis measures exactly `size`, then sit the model on y=0.
   Recentres on x/z so a placement coordinate means the model's centre rather
   than wherever the author left the origin. */
function normalize(obj, entry) {
  const box = new THREE.Box3().setFromObject(obj);
  const dim = new THREE.Vector3();
  box.getSize(dim);
  const measured = dim[entry.fit];
  if (!(measured > 1e-6)) return obj;          /* degenerate; leave it alone */

  const s = entry.size / measured;
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);

  const box2 = new THREE.Box3().setFromObject(obj);
  const c = new THREE.Vector3();
  box2.getCenter(c);
  obj.position.x -= c.x;
  obj.position.z -= c.z;
  obj.position.y -= box2.min.y;                /* stand it on the ground */
  obj.updateMatrixWorld(true);
  return obj;
}

/* Collapse a loaded scene to its meshes, in world space, so a caller can
   instance them. glTF files nest arbitrarily deep and carry their own node
   transforms; baking those in once here means placement code never has to
   care how the file happened to be organised. */
function flatten(root) {
  const out = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    /* three needs uv1 for aoMap; most downloads only ship uv */
    if (g.attributes.uv && !g.attributes.uv1) g.setAttribute('uv1', g.attributes.uv);
    out.push({ geometry: g, material: o.material });
  });
  return out;
}

export async function loadModels(opts) {
  opts = opts || {};
  if (opts.basePath) basePath = opts.basePath;
  const loader = new GLTFLoader();

  await Promise.all(Object.entries(CATALOG).map(([name, entry]) => new Promise((resolve) => {
    loader.load(
      basePath + entry.file,
      (gltf) => {
        try {
          const root = normalize(gltf.scene, entry);
          const parts = flatten(root);
          if (!parts.length) { missing.push(name + ' (no meshes)'); resolve(); return; }
          /* Triangle cost per instance. A photoscanned model can be six
             figures of triangles, which is fine once and ruinous a thousand
             times — callers that repeat a model need this to budget. */
          let tris = 0;
          for (const p of parts) {
            const g = p.geometry;
            tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
          }
          loaded.set(name, { parts, entry, triangles: Math.round(tris) });
        } catch (e) {
          missing.push(`${name} (${e.message})`);
        }
        resolve();
      },
      undefined,
      () => { missing.push(name); resolve(); },   /* absent is normal */
    );
  })));

  return modelReport();
}

/* Place one instance. Returns a Group the caller adds and positions; the
   model's own materials come along, which is the point of using it. */
export function placeModel(name, x, y, z, rotY, scale) {
  const m = loaded.get(name);
  if (!m) return null;
  const g = new THREE.Group();
  for (const p of m.parts) {
    const mesh = new THREE.Mesh(p.geometry, p.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.position.set(x, y, z);
  if (rotY) g.rotation.y = rotY;
  if (scale && scale !== 1) g.scale.setScalar(scale);
  g.userData.model = name;
  return g;
}

/* Many copies of one model, one draw call per material. This is the only way
   several thousand trees are affordable: a mesh per tree would cost a draw
   call per tree and the frame budget is roughly 700 for the whole world. */
export function instanceModel(name, transforms) {
  const m = loaded.get(name);
  if (!m || !transforms.length) return [];
  const out = [];
  const mat4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();

  for (const p of m.parts) {
    const inst = new THREE.InstancedMesh(p.geometry, p.material, transforms.length);
    inst.castShadow = true;
    inst.receiveShadow = true;
    transforms.forEach((t, i) => {
      pos.set(t.x, t.y || 0, t.z);
      q.setFromAxisAngle(up, t.rotY || 0);
      sc.setScalar(t.scale || 1);
      inst.setMatrixAt(i, mat4.compose(pos, q, sc));
    });
    inst.instanceMatrix.needsUpdate = true;
    inst.userData.model = name;
    out.push(inst);
  }
  return out;
}
