/* ============================================================================
   main.js — boot, world assembly, loop
   ========================================================================== */

import * as THREE from 'three';
import {
  SITE, WORLD, VERSION, WORLD_SEED, TIER_ORDER, TIME_STATES,
  clamp, lerp, smoothstep,
} from './00-config.js';
import { buildTerrain, groundH, siteH } from './01-terrain.js';
import { registry, setRoot } from './02-registry.js';
import { buildMaterialLibrary, buildTerrainMaterial, freezeMaterials, MAT, materialList } from './03-materials.js';
import { RenderPipeline, detectTier } from './04-render.js';
import { buildRoadNetwork, buildWalkNetwork, wireDestinations, PLOTS } from './08-siteplan.js';
import { slopeAudit } from './06-walks.js';
import { collapse, collapseInstanced } from './geom.js';
import { buildCampus } from './09-campus.js';
import { buildCommunity } from './10-community.js';
import { buildPerimeter } from './11-perimeter.js';
import { buildBeyond } from './12-beyond.js';
import { buildCoast } from './13-coast.js';
import { buildVegetation } from './14-vegetation.js';
import { buildProps } from './15-props.js';
import { buildIntersections } from './18-intersections.js';
import { initUI, VIEWS } from './16-ui.js';
import { Player, harvestColliders } from './19-player.js';
import { auditSpec, specSummary, HUMAN } from './spec/index.js';

const qs = new URLSearchParams(location.search);
const DEBUG = qs.get('debug') === '1';

const boot = document.getElementById('boot');
const bootBar = document.querySelector('#bar i');
const bootMsg = document.getElementById('bootmsg');
let step = 0;
const STEPS = 14;
const TIMINGS = [];
window.__seedTimings = () => TIMINGS;
let lastMark = 0;
function progress(msg) {
  const now = performance.now();
  if (step > 0) TIMINGS.push([bootMsg ? bootMsg.textContent : String(step), Math.round(now - lastMark)]);
  lastMark = now;
  step++;
  if (bootBar) bootBar.style.width = Math.round((step / STEPS) * 100) + '%';
  if (bootMsg) bootMsg.textContent = msg;
  /* setTimeout, not requestAnimationFrame: rAF never fires in a background tab
     and the whole boot sequence would stall there */
  return new Promise((r) => setTimeout(r, 0));
}

const state = {
  world: null, pipeline: null, zones: {}, report: null,
  paused: false, tour: null,
};
window.SEED = state;

/* ------------------------------------------------------------ orbit camera */
class Orbit {
  constructor(cam, dom) {
    this.cam = cam; this.dom = dom;
    this.target = new THREE.Vector3(0, SITE.padY + 20, 0);
    this.dist = 900; this.theta = -0.72; this.phi = 0.92;
    this.minDist = 22; this.maxDist = 3600;
    this.minPhi = 0.10; this.maxPhi = 1.50;
    this.damp = 0.11;
    this._t = this.target.clone(); this._d = this.dist;
    this._th = this.theta; this._ph = this.phi;
    this.enabled = true;
    this._drag = null;
    const el = dom;
    el.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      el.setPointerCapture(e.pointerId);
      this._drag = { x: e.clientX, y: e.clientY, b: e.button, shift: e.shiftKey };
    });
    el.addEventListener('pointermove', (e) => {
      if (!this._drag) return;
      const dx = e.clientX - this._drag.x, dy = e.clientY - this._drag.y;
      this._drag.x = e.clientX; this._drag.y = e.clientY;
      if (this._drag.b === 2 || this._drag.shift) {
        const s = this.dist * 0.0016;
        const fwd = new THREE.Vector3(Math.sin(this.theta), 0, Math.cos(this.theta));
        const rgt = new THREE.Vector3(fwd.z, 0, -fwd.x);
        this.target.addScaledVector(rgt, -dx * s).addScaledVector(fwd, -dy * s);
      } else {
        this.theta -= dx * 0.0042;
        this.phi = clamp(this.phi - dy * 0.0034, this.minPhi, this.maxPhi);
      }
      this.clampTarget();
    });
    const up = (e) => { if (this._drag) { try { el.releasePointerCapture(e.pointerId); } catch (q) {} } this._drag = null; };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const k = Math.exp(clamp(e.deltaY, -110, 110) * 0.0013);
      /* zoom toward the cursor, raycast against the real terrain rather than
         a flat plane at y=0 as v3 did (wrong by up to 21 m over the hills) */
      const nd = clamp(this.dist * k, this.minDist, this.maxDist);
      const hit = this.groundAt(e.clientX, e.clientY);
      if (hit) {
        const t = 1 - nd / this.dist;
        this.target.lerp(hit, clamp(t * 0.85, -0.6, 0.6));
      }
      this.dist = nd;
      this.clampTarget();
    }, { passive: false });
  }
  clampTarget() {
    this.target.x = clamp(this.target.x, -1250, 1250);
    this.target.z = clamp(this.target.z, -1250, SITE.oceanEndZ - 400);
    const g = groundH(this.target.x, this.target.z);
    this.target.y = clamp(this.target.y, g - 4, g + 260);
  }
  groundAt(cx, cy) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1,
                                  -((cy - r.top) / r.height) * 2 + 1);
    const rc = new THREE.Raycaster();
    rc.setFromCamera(ndc, this.cam);
    /* march the ray against the height field: robust and cheap */
    const o = rc.ray.origin, d = rc.ray.direction;
    let t = 1, prev = o.y - groundH(o.x, o.z);
    for (let i = 0; i < 260; i++) {
      const nt = t * 1.06 + 6;
      const p = o.clone().addScaledVector(d, nt);
      if (nt > 8000) break;
      const h = p.y - groundH(p.x, p.z);
      if (prev > 0 && h <= 0) {
        const f = prev / (prev - h);
        return o.clone().addScaledVector(d, lerp(t, nt, f));
      }
      prev = h; t = nt;
    }
    return null;
  }
  goTo(v, immediate) {
    if (v.target) this.target.set(v.target[0], v.target[1], v.target[2]);
    if (v.dist != null) this.dist = v.dist;
    if (v.theta != null) this.theta = v.theta;
    if (v.phi != null) this.phi = v.phi;
    if (immediate) { this._t.copy(this.target); this._d = this.dist; this._th = this.theta; this._ph = this.phi; }
  }
  update() {
    const k = this.damp;
    this._t.lerp(this.target, k);
    this._d += (this.dist - this._d) * k;
    let dth = this.theta - this._th;
    while (dth > Math.PI) dth -= Math.PI * 2;
    while (dth < -Math.PI) dth += Math.PI * 2;
    this._th += dth * k;
    this._ph += (this.phi - this._ph) * k;
    const sp = Math.sin(this._ph), cp = Math.cos(this._ph);
    this.cam.position.set(
      this._t.x + this._d * sp * Math.sin(this._th),
      this._t.y + this._d * cp,
      this._t.z + this._d * sp * Math.cos(this._th));
    /* never let the camera go under the ground */
    const g = groundH(this.cam.position.x, this.cam.position.z) + 3.5;
    if (this.cam.position.y < g) this.cam.position.y = g;
    this.cam.lookAt(this._t);
  }
}

/* ------------------------------------------------------------------- boot */
async function main() {
  const canvas = document.getElementById('c');
  await progress('detecting hardware');
  const tier = qs.get('tier') || detectTier();
  const pipe = new RenderPipeline(canvas, tier);
  state.pipeline = pipe;

  /* ?audit=1 collects every placement conflict instead of throwing on the
     first one. The shipped default still throws: a build with an unresolved
     intersection must fail. */
  registry.strict = qs.get('audit') !== '1';

  const world = new THREE.Group();
  world.name = 'world';
  pipe.scene.add(world);
  setRoot(world);
  registry.root = world;
  state.world = world;

  await progress('generating materials');
  buildMaterialLibrary(pipe.gl, pipe.tier);
  const terrainMat = buildTerrainMaterial(pipe.tier);

  await progress('shaping terrain');
  const terrain = buildTerrain(terrainMat, qs.get('fast') === '1' ? { name: 'Mobile' } : pipe.tier);
  world.add(terrain);
  state.zones.terrain = terrain;

  await progress('laying roads');
  const roadResult = buildRoadNetwork();
  const roads = roadResult.graph;
  world.add(roads.group);
  state.zones.roads = roads;

  await progress('laying sidewalks and trails');
  const walks = buildWalkNetwork(roads);
  wireDestinations(walks, roads);
  walks.build();
  world.add(walks.group);
  state.zones.walks = walks;

  await progress('building the compute core');
  state.zones.campus = buildCampus(world, roads, walks);

  await progress('building the community');
  state.zones.community = buildCommunity(world, roads, walks);

  await progress('raising the berm and the wall');
  state.zones.perimeter = buildPerimeter(world, roads, pipe);

  await progress('building beyond the fence');
  state.zones.beyond = buildBeyond(world, roads, pipe);

  await progress('cutting the watershed corridor');
  state.zones.coast = buildCoast(world, roads, walks, pipe);

  await progress('planting');
  state.zones.vegetation = buildVegetation(world);

  await progress('placing details');
  state.zones.props = buildProps(world, roads, walks, pipe);

  await progress('setting traffic control');
  state.zones.intersections = buildIntersections(world, roads, pipe);

  /* every luminaire is registered by now — bake the night light pools */
  pipe.buildLampPools(groundH);

  await progress('optimising');
  /* CSM has to patch every material that receives cascaded shadows */
  for (const m of materialList()) pipe.setupMaterial(m);
  pipe.setupMaterial(terrainMat);

  let collapsed = 0;
  for (const key of ['roads', 'walks']) {
    const grp = state.zones[key] && state.zones[key].group;
    if (grp) collapsed += collapse(grp, { maxVerts: 40000 });
  }
  /* `intersections` belongs in this list: signal masts and curb ramps are
     several thousand small static meshes and leaving the zone out of the
     merge pass left 4,082 of them drawing individually. mergeStatic skips
     InstancedMesh and anything flagged noMerge, so the detectable-warning
     dome instances and the street-light fields survive it intact. */
  for (const key of ['campus', 'community', 'perimeter', 'beyond', 'coast', 'props',
                     'intersections']) {
    const z = state.zones[key];
    if (z && z.group) collapsed += collapse(z.group, { maxVerts: 40000 });
  }
  /* Second pass: the same call-site fragmentation exists in the instanced
     batches (124 dome pads, 111 cobble runs, 109 PV racks, each its own
     draw). Merged across the whole world in one sweep — instances stay
     instances, so wind shaders and instance colours survive. */
  collapsed += collapseInstanced(world);

  await progress('auditing');
  /* The reachability and road-graph checks are cheap and run inline. The two
     O(n) sweeps over 7,600 footprints are deferred until after the world is
     interactive: a verification pass should not sit in the user's load time. */
  const walkFail = walks.pathfindTest();
  const walkSlope = slopeAudit(walks);
  /* The dimensional spec audits itself before anything is judged on how it
     looks: a solar array too small for its luminaire, a control above the
     seated reach range or a ramp that will not fit behind its curb is a
     failure of the numbers, and it is cheaper to catch here than in a
     screenshot. */
  const specProblems = auditSpec();
  if (specProblems.length) {
    console.warn(`[spec] ${specProblems.length} problems`, specProblems);
  } else {
    console.info('[spec] dimensional audit clean', specSummary());
  }
  let fpAudit = [], geoAudit = [];
  state.report = {
    specProblems,
    intersections: state.zones.intersections && {
      signalised: state.zones.intersections.signalised,
      allWayStop: state.zones.intersections.allway,
      twoWayStop: state.zones.intersections.twoway,
      curbRamps: state.zones.intersections.ramps,
    },
    solar: state.zones.props && state.zones.props.solar,
    version: VERSION, seed: WORLD_SEED, tier: pipe.tierName,
    registered: registry.entries.length,
    roadProblems: roadResult.problems,
    footprintConflicts: fpAudit,
    geometryConflicts: geoAudit,
    rejected: registry.violations.map((v) => ({
      id: v.id, hits: v.hits.slice(0, 3),
    })),
    walkFailures: walkFail,
    walkSlope: walkSlope.length,
    destinations: walks.destinations.size,
    sources: walks.sources.length,
    collapsed,
    timings: TIMINGS.slice(),
    terrain: terrain.userData.stats,
  };
  const frozen = freezeMaterials(DEBUG);
  state.report.materialViolations = frozen;

  if (roadResult.problems.length) console.warn('[roads]', roadResult.problems);
  if (fpAudit.length) console.warn(`[audit] ${fpAudit.length} footprint conflicts`, fpAudit.slice(0, 12));
  if (geoAudit.length) console.warn(`[audit] ${geoAudit.length} geometry intersections`, geoAudit.slice(0, 12));
  if (walkFail.length) console.warn(`[walks] ${walkFail.length} unreachable destinations`, walkFail.slice(0, 12));

  await progress('lighting');
  const orbit = new Orbit(pipe.camera, canvas);
  state.orbit = orbit;
  orbit.goTo(VIEWS[0], true);
  state.timeState = 'afternoon';
  pipe.setTimeOfDay(TIME_STATES.afternoon, true);

  /* ------------------------------------------------------ walking mode
     The eye goes to 1.591 m and the orbit camera stands down. This is the
     view the dimensional spec exists for: at eye height a curb that is the
     wrong reveal or a sign mounted at the wrong height is immediately
     obvious, where from the overview camera everything looks fine. */
  const player = new Player(pipe.camera, canvas, world);
  player.attachColliders(harvestColliders(registry));
  state.player = player;
  const orbitFov = pipe.camera.fov;

  state.enterWalk = (x, z, heading) => {
    if (x == null) {
      /* default drop point: the plaza, facing the community centre */
      x = 0; z = 150; heading = Math.PI;
    }
    orbit.enabled = false;
    player.enter(x, z, heading);
    state.mode = 'walk';
    document.body.classList.add('walking');
  };
  state.exitWalk = () => {
    player.exit(orbitFov);
    orbit.enabled = true;
    state.mode = 'orbit';
    document.body.classList.remove('walking');
  };
  state.mode = 'orbit';

  const walkBtn = document.getElementById('walkBtn');
  const walkHud = document.getElementById('walkhud');
  if (walkBtn) {
    walkBtn.addEventListener('click', () => {
      if (state.mode === 'walk') state.exitWalk();
      else state.enterWalk(orbit.target.x, orbit.target.z, orbit.theta);
      walkBtn.classList.toggle('on', state.mode === 'walk');
    });
  }
  player.onLockChange = (locked) => {
    if (walkHud) {
      walkHud.innerHTML = locked
        ? `eye <b>${HUMAN.eyeHeight.toFixed(3)} m</b> · WASD move · shift run · ` +
          `C crouch · space step up · <b>Esc</b> to exit`
        : 'click to look around';
    }
  };
  /* Pointer lock is refused in an embedded frame and without a user gesture.
     Walking still works; only mouse-look is lost, so say so rather than
     leaving the user in a mode that appears broken. */
  player.onLockError = () => {
    if (walkHud) {
      walkHud.innerHTML = 'mouse look unavailable here — <b>WASD</b> still ' +
        'walks, <b>Esc</b> to exit. Open in a browser tab for full control.';
    }
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.mode === 'walk') state.exitWalk();
    /* F drops you in where the orbit camera is looking, and takes you back */
    if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) {
      if (state.mode === 'walk') state.exitWalk();
      else state.enterWalk(orbit.target.x, orbit.target.z, orbit.theta);
      if (walkBtn) walkBtn.classList.toggle('on', state.mode === 'walk');
    }
  });

  initUI(state);

  await progress('ready');
  setTimeout(() => boot && boot.classList.add('gone'), 260);
  setTimeout(() => { const h = document.getElementById('hint'); if (h) h.classList.add('gone'); }, 8000);

  /* ---------------------------------------------------------------- loop */
  let last = performance.now();
  let benchDone = false;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!state.paused) {
      if (state.tour) state.tour.update(dt);
      if (state.mode === 'walk') player.update(dt);
      else orbit.update();
      if (state.zones.intersections) state.zones.intersections.update(dt);
      if (state.zones.props && state.zones.props.update) {
        state.zones.props.update(now / 1000, dt);
      }
      if (state.onFrame) state.onFrame(dt, now);
      pipe.render(dt);
      if (!benchDone) {
        const r = pipe.benchmark(dt * 1000);
        if (r) { console.info('[quality] stepped down to', r); }
        if (pipe.frameTimes.length >= 60) benchDone = true;
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.addEventListener('resize', () => pipe.resize());

  /* ------------------------------------------- headless verification hooks */
  window.__seedReport = () => state.report;
  window.__seedScene = pipe.scene;
  window.__seedTimings = () => TIMINGS;
  window.__seedStats = () => pipe.stats();
  window.__seedHash = () => {
    let h = 2166136261 >>> 0, n = 0;
    world.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      n++;
      const p = o.position;
      const s = `${o.name}|${p.x.toFixed(3)}|${p.y.toFixed(3)}|${p.z.toFixed(3)}|` +
                `${o.geometry.attributes.position.count}`;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    });
    return { hash: h.toString(16), meshes: n };
  };
  window.__seedTest = () => {
    const r = state.report;
    return {
      pass: r.footprintConflicts.length === 0 && r.geometryConflicts.length === 0 &&
            r.walkFailures.length === 0 && r.roadProblems.length === 0,
      ...r,
    };
  };
  /* accepts a state name ('afternoon' | 'night') or a raw hour for tooling */
  window.__seedTime = (h) => {
    if (typeof h === 'string' && state.setTimeState) state.setTimeState(h);
    else pipe.setTimeOfDay(typeof h === 'string' ? TIME_STATES[h] : h, true);
  };
  window.__seedSpec = () => ({ problems: auditSpec(), summary: specSummary() });
  window.__seedWalk = (x, z, h) => { state.enterWalk(x, z, h); return player.readout(); };
  window.__seedPlayer = () => player.readout();
  window.__seedView = (i) => { orbit.goTo(VIEWS[clamp(i, 0, VIEWS.length - 1)], true); orbit.update(); };
  /* deferred verification */
  state.auditPending = true;
  setTimeout(() => {
    const t0 = performance.now();
    fpAudit = registry.auditFootprints();
    geoAudit = registry.auditGeometry(world);
    state.report.footprintConflicts = fpAudit;
    state.report.geometryConflicts = geoAudit;
    state.report.auditMs = Math.round(performance.now() - t0);
    state.auditPending = false;
    if (fpAudit.length) console.warn('[audit] ' + fpAudit.length + ' footprint conflicts', fpAudit.slice(0, 12));
    if (geoAudit.length) console.warn('[audit] ' + geoAudit.length + ' geometry intersections', geoAudit.slice(0, 12));
    if (!fpAudit.length && !geoAudit.length) console.info('[audit] clean in ' + state.report.auditMs + ' ms');
  }, 60);

  window.__seedReady = true;

  if (DEBUG) startDebug(state);
}

/* --------------------------------------------------------------- debug HUD */
function startDebug(st) {
  const el = document.getElementById('dbg');
  el.classList.add('on');
  let on = true;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') { on = !on; el.classList.toggle('on', on); }
  });
  setInterval(() => {
    if (!on) return;
    const s = st.pipeline.stats();
    const r = st.report;
    el.textContent =
      `SEED ${VERSION}  seed ${r.seed}  tier ${st.pipeline.tierName}\n` +
      `draws ${s.calls}  tris ${(s.tris / 1000).toFixed(0)}k  geo ${s.geometries}  tex ${s.textures}\n` +
      `registered ${r.registered}  merged ${r.collapsed}\n` +
      `terrain ${r.terrain.tris.toFixed(0)} tris / ${r.terrain.draws} chunks\n` +
      `footprint conflicts ${r.footprintConflicts.length}\n` +
      `geometry conflicts  ${r.geometryConflicts.length}\n` +
      `road problems       ${r.roadProblems.length}\n` +
      `walk failures       ${r.walkFailures.length}\n` +
      `walk slope warnings ${r.walkSlope}\n` +
      `destinations ${r.destinations} from ${r.sources} sources\n` +
      `time ${st.pipeline.hour.toFixed(2)}h  cam ${st.pipeline.camera.position.x.toFixed(0)},` +
      `${st.pipeline.camera.position.y.toFixed(0)},${st.pipeline.camera.position.z.toFixed(0)}`;
  }, 400);
}

main().catch((e) => {
  console.error(e);
  if (bootMsg) {
    bootMsg.textContent = 'build failed: ' + e.message;
    bootMsg.style.color = '#ff6b5c';
  }
  window.__seedError = String(e && e.stack || e);
});
