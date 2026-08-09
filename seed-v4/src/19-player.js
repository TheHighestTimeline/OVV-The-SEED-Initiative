/* ============================================================================
   19-player.js — first-person walking controller at human scale
   ----------------------------------------------------------------------------
   The camera is an eye at 1.591 m, which is 0.936 x a 1.70 m stature. It
   moves at 1.4 m/s walking and 3.5 m/s at a jog, takes 0.762 m steps at
   1.84 Hz, steps up anything under a 7 in riser without slowing, and stops
   at anything taller.

   This is the honest test of the whole dimensional spec. An overview camera
   forgives everything; standing on the sidewalk at eye height does not. If
   a curb is the wrong height or a sign is mounted too low, this is where it
   becomes obvious.
   ========================================================================== */

import * as THREE from 'three';
import { groundH } from './01-terrain.js';
import { HUMAN, vFovFor, CURB, WALK, ftin, metres } from './spec/index.js';
import { clamp } from './00-config.js';

/* Gravity, so a step off a curb falls at the rate a body falls. */
const G = 9.80665;

export class Player {
  constructor(camera, dom, world) {
    this.cam = camera;
    this.dom = dom;
    this.world = world;
    this.enabled = false;

    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = true;
    this.crouch = false;

    /* head bob phase, driven by the real step frequency rather than a
       decorative sine — at 1.4 m/s and 0.762 m steps the cadence is 1.84 Hz
       and matching it is what stops the walk feeling like a hover */
    this.bobPhase = 0;
    this.speed = 0;

    this.keys = new Set();
    this._locked = false;
    this.collide = null;          /* set by attachColliders()               */

    this._onKeyDown = (e) => {
      if (!this.enabled) return;
      this.keys.add(e.code);
      if (e.code === 'Space' && this.onGround) { this.vel.y = 3.4; this.onGround = false; }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMove = (e) => {
      if (!this._locked || !this.enabled) return;
      /* 0.0022 rad per pixel is roughly a 40 cm mouse sweep for 180 degrees,
         which is the common first-person default */
      this.yaw -= e.movementX * 0.0022;
      this.pitch = clamp(this.pitch - e.movementY * 0.0022, -1.45, 1.45);
    };
    this._onLockChange = () => {
      this._locked = document.pointerLockElement === this.dom;
      if (this.onLockChange) this.onLockChange(this._locked);
    };
    this._onClick = () => {
      if (this.enabled && !this._locked) this.dom.requestPointerLock();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('pointerlockchange', this._onLockChange);
    this.dom.addEventListener('click', this._onClick);
  }

  /* --------------------------------------------------------------- enter */
  /**
   * Drop the player in at a plan position, facing a heading.
   * Y comes from the terrain, so entering anywhere lands on the ground
   * rather than in it.
   */
  enter(x, z, heading = 0) {
    this.enabled = true;
    this.pos.set(x, groundH(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = heading;
    this.pitch = 0;
    this.onGround = true;
    this.cam.fov = vFovFor(this.dom.clientWidth / this.dom.clientHeight);
    this.cam.updateProjectionMatrix();
    this.dom.requestPointerLock();
  }

  exit(restoreFov) {
    this.enabled = false;
    if (this._locked) document.exitPointerLock();
    if (restoreFov != null) {
      this.cam.fov = restoreFov;
      this.cam.updateProjectionMatrix();
    }
  }

  /* ---------------------------------------------------------- colliders
     A list of {minX, maxX, minZ, maxZ, top} boxes in world space. Kept as a
     flat array with a uniform grid index, because the naive loop over every
     structure in the world is 800 tests per frame. */
  attachColliders(boxes, cell = 24) {
    const grid = new Map();
    const key = (i, j) => i * 100000 + j;
    for (const b of boxes) {
      const i0 = Math.floor(b.minX / cell), i1 = Math.floor(b.maxX / cell);
      const j0 = Math.floor(b.minZ / cell), j1 = Math.floor(b.maxZ / cell);
      for (let i = i0; i <= i1; i++) {
        for (let j = j0; j <= j1; j++) {
          const k = key(i, j);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(b);
        }
      }
    }
    this.collide = { grid, cell, key, count: boxes.length };
  }

  _near(x, z) {
    if (!this.collide) return null;
    const { grid, cell, key } = this.collide;
    return grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || null;
  }

  /**
   * Push the player out of any collider they are inside, on the axis of
   * least penetration. Handles the case of standing on top of something:
   * if the box top is within a step height, it is a step, not a wall.
   */
  _resolve(x, z, feetY) {
    const list = this._near(x, z);
    if (!list) return { x, z, ground: null };
    const r = HUMAN.capsuleRadius;
    let ground = null;
    for (const b of list) {
      const withinX = x + r > b.minX && x - r < b.maxX;
      const withinZ = z + r > b.minZ && z - r < b.maxZ;
      if (!withinX || !withinZ) continue;
      /* below the top by less than a step? it is a surface to stand on */
      if (b.top - feetY <= HUMAN.stepUpMax && b.top - feetY > -0.05) {
        ground = Math.max(ground == null ? -Infinity : ground, b.top);
        continue;
      }
      if (feetY >= b.top - 0.02) { ground = Math.max(ground || -Infinity, b.top); continue; }
      /* otherwise it is a wall: push out on the shallower axis */
      const penL = x + r - b.minX, penR = b.maxX - (x - r);
      const penN = z + r - b.minZ, penF = b.maxZ - (z - r);
      const minX = Math.min(penL, penR), minZ = Math.min(penN, penF);
      if (minX < minZ) x += penL < penR ? -penL : penR;
      else z += penN < penF ? -penN : penF;
    }
    return { x, z, ground };
  }

  /* ---------------------------------------------------------------- step */
  update(dt) {
    if (!this.enabled) return;
    dt = Math.min(dt, 0.05);

    /* --- intent --- */
    let fx = 0, fz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) fz += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) fz -= 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) fx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) fx += 1;
    this.crouch = this.keys.has('KeyC') || this.keys.has('ControlLeft');
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');

    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }

    let target = running ? HUMAN.runSpeed : HUMAN.walkSpeed;
    if (this.crouch) target *= 0.45;

    /* forward is where the eye looks, flattened to the ground plane */
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wantX = (-sy * fz + cy * fx) * target;
    const wantZ = (-cy * fz - sy * fx) * target;

    /* Accelerate rather than snap. 9 m/s^2 reaches walking speed in about a
       sixth of a second, which is roughly how fast a person actually starts. */
    const accel = this.onGround ? 9.0 : 2.2;
    this.vel.x += clamp(wantX - this.vel.x, -accel * dt, accel * dt);
    this.vel.z += clamp(wantZ - this.vel.z, -accel * dt, accel * dt);

    /* --- integrate, resolving each axis separately so sliding along a wall
           works rather than stopping dead in a corner --- */
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;

    const r1 = this._resolve(nx, this.pos.z, this.pos.y);
    nx = r1.x;
    const r2 = this._resolve(nx, nz, this.pos.y);
    nz = r2.z;

    /* --- vertical --- */
    const terrain = groundH(nx, nz);
    const standOn = Math.max(terrain, r2.ground == null ? -Infinity : r2.ground);

    this.vel.y -= G * dt;
    let ny = this.pos.y + this.vel.y * dt;

    if (ny <= standOn) {
      /* Landing, or walking up a curb. A rise under the 7 in step maximum is
         absorbed without leaving the ground — which is exactly what a person
         does at a curb and is why a 6 in curb should not feel like a jump. */
      ny = standOn;
      this.vel.y = 0;
      this.onGround = true;
    } else if (ny - standOn < 0.02) {
      ny = standOn; this.vel.y = 0; this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.pos.set(nx, ny, nz);

    /* --- head bob at the real cadence --- */
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && this.speed > 0.15) {
      const cadence = HUMAN.stepFrequency * (this.speed / HUMAN.walkSpeed);
      this.bobPhase += cadence * Math.PI * 2 * dt;
    } else {
      /* settle back to neutral rather than freezing mid-bob */
      this.bobPhase += (0 - Math.sin(this.bobPhase)) * dt * 4;
    }
    const bobAmt = Math.min(0.035, this.speed * 0.022);
    const bobY = Math.sin(this.bobPhase) * bobAmt;
    const bobX = Math.cos(this.bobPhase * 0.5) * bobAmt * 0.6;

    /* --- eye --- */
    const eye = this.crouch ? HUMAN.eyeHeightCrouch : HUMAN.eyeHeight;
    this.cam.position.set(
      this.pos.x + Math.cos(this.yaw) * bobX,
      this.pos.y + eye + bobY,
      this.pos.z - Math.sin(this.yaw) * bobX);
    this.cam.rotation.order = 'YXZ';
    this.cam.rotation.y = this.yaw;
    this.cam.rotation.x = this.pitch;
    /* a touch of roll into the stride, tiny — more than half a degree and it
       reads as seasickness */
    this.cam.rotation.z = Math.sin(this.bobPhase * 0.5) * 0.004 * (this.speed / HUMAN.walkSpeed);
  }

  /** What the player is standing on and how tall they are, for the HUD. */
  readout() {
    return {
      x: +this.pos.x.toFixed(1), z: +this.pos.z.toFixed(1),
      groundY: +this.pos.y.toFixed(2),
      eyeHeight: `${metres(HUMAN.eyeHeight)} (${ftin(HUMAN.eyeHeight)})`,
      speed: `${this.speed.toFixed(2)} m/s`,
      gait: this.speed > HUMAN.walkSpeed * 1.4 ? 'running'
        : this.speed > 0.2 ? 'walking' : 'standing',
    };
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('pointerlockchange', this._onLockChange);
    this.dom.removeEventListener('click', this._onClick);
  }
}

/* ============================================================== colliders
   Harvested from the placement registry, not from the scene graph.

   The scene graph is the wrong source: the optimisation pass merges every
   zone's meshes by material, which is what keeps the draw calls sane but
   also dissolves the per-building objects and the `userData.layer` that
   identified them. Walking the graph after that pass found ten structures in
   a campus of eighty-eight houses and four compute halls.

   The registry is the right source. It holds a footprint and an elevation
   range for every placed object, it is the same data the placement audit
   trusts, and merging cannot touch it.

   Curbs are deliberately NOT colliders. They are handled by the step logic,
   and turning a 6 in reveal into a wall is what makes a walkable street feel
   like a maze.                                                            */
const SOLID_LAYERS = ['STRUCTURE', 'PROP', 'UTILITY'];

export function harvestColliders(registry, opts = {}) {
  const boxes = [];
  const layers = opts.layers || SOLID_LAYERS;
  for (const e of registry.entries) {
    if (layers.indexOf(e.layer) < 0) continue;
    /* container entries park themselves far below the world as a bookkeeping
       trick; they are not real volumes and must not become walls */
    if (e.y1 < -100) continue;
    if (e.tags && e.tags.indexOf('no-collide') >= 0) continue;
    const h = e.y1 - e.y0;
    /* anything a person steps over is not a collider */
    if (h < HUMAN.stepUpMax) continue;
    const s = e.shape;
    /* a footprint spanning most of the world is a zone marker, not an object */
    if (s.maxX - s.minX > 900 || s.maxZ - s.minZ > 900) continue;
    boxes.push({
      minX: s.minX, maxX: s.maxX,
      minZ: s.minZ, maxZ: s.maxZ,
      top: e.y1,
      id: e.id,
    });
  }
  return boxes;
}
