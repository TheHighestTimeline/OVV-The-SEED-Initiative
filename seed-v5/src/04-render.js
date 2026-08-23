/* ============================================================================
   04-render.js — renderer, physical sky, IBL, cascaded shadows, post stack
   ----------------------------------------------------------------------------
   Fixes carried over from the v3 audit:
   - the sky went round the tone-mapping chain, so distant terrain faded to cold
     grey against a warm sky: a permanent horizon seam. Here the sky writes
     linear HDR and OutputPass tone-maps everything exactly once.
   - scene.environment was a PMREM of an 8x64 pixel gradient, never rebuilt at
     night. Here it is a real render of the sky, rebuilt on every time change.
   - one 1120-unit shadow frustum over a 5200-unit world, normalBias 0.9. Here:
     cascaded shadow maps, texel-snapped, normalBias 0.02.
   - zero point or spot lights in the entire file. Here: a real pooled spot
     light per luminaire.
   ========================================================================== */

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { TAARenderPass } from 'three/addons/postprocessing/TAARenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { CSM } from 'three/addons/csm/CSM.js';

import {
  CAMERA, TIERS, TIER_ORDER, TONEMAP_EXPOSURE, DEG, clamp, lerp, smoothstep, stream,
} from './00-config.js';

/* ------------------------------------------------------------- tier detection */
export function detectTier() {
  if (typeof navigator === 'undefined') return 'high';
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (coarse && cores <= 6) return 'mobile';
  if (coarse) return 'balanced';
  if (cores <= 4 || mem <= 4) return 'balanced';
  if (cores >= 12 && mem >= 8) return 'ultra';
  return 'high';
}

/* ---------------------------------------------------------------- sun model
   Bennettsville, SC: 34.617 N. A real solar position so golden hour lands where
   it should and the eastern sky stays dark at night (stated feature c5).      */
const LAT = 34.617 * DEG;
export function sunAngles(hour, dayOfYear) {
  const doy = dayOfYear == null ? 135 : dayOfYear;
  const dec = 23.44 * DEG * Math.sin(2 * Math.PI * (284 + doy) / 365);
  const H = (hour - 12) * 15 * DEG;
  const el = Math.asin(
    Math.sin(dec) * Math.sin(LAT) + Math.cos(dec) * Math.cos(LAT) * Math.cos(H));
  let az = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(LAT) - Math.tan(dec) * Math.cos(LAT));
  az += Math.PI;                       /* measured clockwise from north */
  return { el, az };
}

/* world convention: -Z is north, +X is east, +Z is south (seaward) */
export function sunDirection(hour, dayOfYear) {
  const { el, az } = sunAngles(hour, dayOfYear);
  const ce = Math.cos(el);
  return new THREE.Vector3(Math.sin(az) * ce, Math.sin(el), -Math.cos(az) * ce);
}

/* ============================================================== the pipeline */
export class RenderPipeline {
  constructor(canvas, tierName) {
    this.tierName = tierName || detectTier();
    this.tier = TIERS[this.tierName];

    const gl = new THREE.WebGLRenderer({
      canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true,
      stencil: false, alpha: false, logarithmicDepthBuffer: false,
    });
    gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.tier.pixelRatioCap));
    gl.outputColorSpace = THREE.SRGBColorSpace;
    /* ACES rather than AgX: on this palette AgX read washed out and desaturated,
       which is the opposite of what an investor still needs. */
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = TONEMAP_EXPOSURE;
    gl.shadowMap.enabled = true;
    gl.shadowMap.type = THREE.PCFSoftShadowMap;
    gl.shadowMap.autoUpdate = true;
    gl.info.autoReset = false;
    this.gl = gl;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      CAMERA.fov, window.innerWidth / window.innerHeight, CAMERA.near, CAMERA.far);
    this.camera.position.set(-520, 300, -640);

    this.clock = new THREE.Clock();
    this.frames = 0;
    this.frameTimes = [];
    this.hour = 14.2;
    this.day = 135;
    this._lastCamPos = new THREE.Vector3();
    this._staticFrames = 0;

    this._buildSky();
    this._buildLights();
    this._buildComposer();
    this.setTimeOfDay(this.hour, true);
  }

  /* ------------------------------------------------------------------- sky */
  _buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(60000);
    sky.name = 'sky';
    /* Strip the shader's own tone map and colour transform. Everything in the
       scene writes linear HDR and OutputPass applies the transform once, at the
       end. This is the fix for v3's permanent horizon seam. */
    const fs = sky.material.fragmentShader
      .replace('#include <tonemapping_fragment>', '')
      .replace('#include <colorspace_fragment>', '');
    sky.material.fragmentShader = fs;
    sky.material.needsUpdate = true;
    sky.material.depthWrite = false;
    sky.material.toneMapped = false;
    const u = sky.material.uniforms;
    u.turbidity.value = 2.6;
    u.rayleigh.value = 1.6;
    u.mieCoefficient.value = 0.0045;
    u.mieDirectionalG.value = 0.80;
    this.sky = sky;
    this.scene.add(sky);

    /* stars, moon and the Milky Way band — the eastern sky stays unlit */
    this.night = new THREE.Group();
    this.night.name = 'night-sky';
    this.night.renderOrder = -1;
    this._buildStars();
    this.scene.add(this.night);

    this.pmrem = new THREE.PMREMGenerator(this.gl);
    this.pmrem.compileEquirectangularShader();
    this._envRT = null;

    /* small target used to read the true horizon colour for the fog */
    /* FloatType, not HalfFloatType: readRenderTargetPixels into a Float32Array
       from a half-float target returns garbage, which left the fog colour black
       and defeated the whole sky-matching exercise. */
    this._probeRT = new THREE.WebGLRenderTarget(32, 16, { type: THREE.FloatType });
    this._probeCam = new THREE.PerspectiveCamera(60, 2, 1, 100000);
    this._probeBuf = new Float32Array(32 * 16 * 4);

    this.scene.fog = new THREE.FogExp2(0x9db6c8, 0.00016);
  }

  _buildStars() {
    const r = stream('stars');
    const N = this.tier.name === 'Mobile' ? 900 : 3200;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const siz = new Float32Array(N);
    const R = 40000;
    for (let i = 0; i < N; i++) {
      /* concentrate a third of them into a Milky Way band */
      let v, u2;
      if (i % 3 === 0) {
        const band = (r() - 0.5) * 0.34;
        const t = r() * Math.PI * 2;
        const nx = Math.cos(t), nz = Math.sin(t);
        const dir = new THREE.Vector3(nx, band * 2.2, nz).normalize();
        pos[i * 3] = dir.x * R; pos[i * 3 + 1] = Math.abs(dir.y) * R + 900; pos[i * 3 + 2] = dir.z * R;
      } else {
        v = Math.acos(1 - r() * 0.98);
        u2 = r() * Math.PI * 2;
        pos[i * 3] = Math.sin(v) * Math.cos(u2) * R;
        pos[i * 3 + 1] = Math.cos(v) * R;
        pos[i * 3 + 2] = Math.sin(v) * Math.sin(u2) * R;
      }
      const t = r();
      const warm = t > 0.7;
      col[i * 3] = warm ? 1.0 : 0.78 + t * 0.2;
      col[i * 3 + 1] = 0.86 + t * 0.14;
      col[i * 3 + 2] = warm ? 0.80 : 1.0;
      siz[i] = 60 + Math.pow(r(), 6) * 420;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(siz, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 } },
      vertexShader: `
        attribute float size; varying vec3 vC; varying float vS;
        void main(){ vC = color; vS = size;
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mv;
          gl_PointSize = size * 0.02; }`,
      fragmentShader: `
        uniform float uOpacity; varying vec3 vC;
        void main(){
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep( 0.5, 0.06, length( d ) );
          if ( a * uOpacity < 0.002 ) discard;
          gl_FragColor = vec4( vC * a * uOpacity * 2.2, 1.0 ); }`,
      vertexColors: true, transparent: true, depthWrite: false,
      blending: THREE.AdditiveBlending, toneMapped: false,
    });
    this.stars = new THREE.Points(g, m);
    this.stars.frustumCulled = false;
    this.night.add(this.stars);

    /* moon */
    const mg = new THREE.SphereGeometry(1, 24, 16);
    const mm = new THREE.MeshBasicMaterial({ color: 0xf4f0e4, toneMapped: false, transparent: true, opacity: 0 });
    this.moon = new THREE.Mesh(mg, mm);
    this.moon.scale.setScalar(620);
    this.moon.frustumCulled = false;
    this.night.add(this.moon);
    /* terminator: a dark sphere offset behind it gives a real phase */
    const tg = new THREE.SphereGeometry(1.006, 24, 16);
    const tm = new THREE.MeshBasicMaterial({ color: 0x05070c, toneMapped: false, transparent: true, opacity: 0 });
    this.moonDark = new THREE.Mesh(tg, tm);
    this.moonDark.scale.setScalar(620);
    this.moonDark.frustumCulled = false;
    this.night.add(this.moonDark);
  }

  /* ---------------------------------------------------------------- lights */
  _buildLights() {
    this.sun = new THREE.DirectionalLight(0xffffff, 3.0);
    this.sun.name = 'sun';

    this.csm = new CSM({
      maxFar: 2400,
      cascades: this.tier.cascades,
      shadowMapSize: this.tier.shadowMap,
      lightDirection: new THREE.Vector3(-0.4, -0.75, 0.5).normalize(),
      camera: this.camera,
      parent: this.scene,
      lightIntensity: 3.0,
      shadowBias: -0.00012,
      /* v3 used normalBias 0.9, which detached the shadow of every object
         under about two metres. Benches, curbs and bollards now touch. */
      lightNear: 1,
      lightFar: 3000,
      mode: 'practical',
      fade: true,
    });
    for (const l of this.csm.lights) {
      l.shadow.normalBias = 0.018;
      l.shadow.bias = -0.00012;
      l.castShadow = true;
    }

    this.hemi = new THREE.HemisphereLight(0xbcd4ee, 0x4a4636, 0.14);
    this.scene.add(this.hemi);

    /* pooled spot lights: real luminaires, not painted radial-gradient decals */
    this.lampPool = [];
    const N = this.tier.lightCull;
    for (let i = 0; i < N; i++) {
      const s = new THREE.SpotLight(0xffcf9a, 0, 60, 1.02, 0.42, 1.6);
      s.visible = false;
      s.castShadow = i < 3 && this.tier.name !== 'Mobile';
      if (s.castShadow) {
        s.shadow.mapSize.set(512, 512);
        s.shadow.camera.near = 1.5;
        s.shadow.camera.far = 60;
        s.shadow.normalBias = 0.02;
        s.shadow.bias = -0.0004;
      }
      s.target.position.set(0, 0, 0);
      this.scene.add(s, s.target);
      this.lampPool.push(s);
    }
    this.luminaires = [];        /* {pos:Vector3, aim:Vector3, colour, power, group} */
  }

  registerLuminaire(rec) { this.luminaires.push(rec); }

  /**
   * Light-pool decals for every luminaire beyond the real spot-light pool.
   *
   * Only the nearest `lightCull` lamps get a real SpotLight; before this,
   * every street beyond them went black at night — the single biggest
   * cohesion failure of the night state. Each lamp gets a small disc of
   * warm additive glow CONFORMED to the ground (each vertex sampled from
   * the height field, not a flat quad — v3's flat quads washed across
   * curbs and water). All pools merge into one mesh: one draw call for
   * ~800 lamps, visibility and opacity driven by the night factor.
   *
   * Called from main once every luminaire is registered; groundHeight is
   * passed in rather than imported to keep the render layer free of
   * terrain dependencies.
   */
  buildLampPools(groundHeight) {
    if (!this.luminaires.length || this.lampPoolMesh) return;
    const SEG = 12;
    const verts = [], cols = [], uvs = [], idx = [];
    const c = new THREE.Color();
    let base = 0;
    for (const rec of this.luminaires) {
      /* the pool sits under the head, pulled toward the aim point */
      const cx = rec.pos.x * 0.35 + rec.aim.x * 0.65;
      const cz = rec.pos.z * 0.35 + rec.aim.z * 0.65;
      const r = Math.min(13, Math.max(7, (rec.range || 40) * 0.24));
      c.setHex(rec.colour || 0xffcf9a);
      const cy = groundHeight(cx, cz) + 0.22;   /* above the whole pavement stack (paver 0.174) */
      verts.push(cx, cy, cz); cols.push(c.r, c.g, c.b); uvs.push(0.5, 0.5);
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        verts.push(x, groundHeight(x, z) + 0.22, z);
        cols.push(c.r, c.g, c.b);
        uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      }
      /* wound to face +y: in the xz ground plane a fan that is CCW in (x,z)
         reads as CW from above, so the naive order faced the discs DOWNWARD
         and front-face culling removed every pool — the same inverted-winding
         class of bug v4 shipped in its road ribbons */
      for (let i = 0; i < SEG; i++) {
        idx.push(base, base + 1 + ((i + 1) % SEG), base + 1 + i);
      }
      base += SEG + 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();

    /* radial falloff texture, generated once */
    const size = 64;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0.30)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.NoColorSpace;

    const mat = new THREE.MeshBasicMaterial({
      map: tex, vertexColors: true, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    /* skip the tone map and push into HDR so the night bloom picks the pools
       up: from the air a lit street must read as a chain of light the way it
       does from a plane window, not as a 25%-grey smudge AgX crushes away. */
    mat.toneMapped = false;
    mat.color.setScalar(1.9);
    const mesh = new THREE.Mesh(g, mat);
    mesh.name = 'lamp-pools';
    mesh.renderOrder = 40;
    mesh.visible = false;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.userData.noMerge = true;
    this.lampPoolMesh = mesh;
    this.scene.add(mesh);
  }

  /* ------------------------------------------------------------- post stack */
  _buildComposer() {
    const w = window.innerWidth, h = window.innerHeight;
    const t = this.tier;
    const rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: t.post.taa ? 0 : 4,
      colorSpace: THREE.LinearSRGBColorSpace,
    });
    const composer = new EffectComposer(this.gl, rt);
    composer.setPixelRatio(this.gl.getPixelRatio());

    if (t.post.taa) {
      const taa = new TAARenderPass(this.scene, this.camera);
      taa.unbiased = true;
      taa.sampleLevel = 0;
      this.taa = taa;
      composer.addPass(taa);
    } else {
      composer.addPass(new RenderPass(this.scene, this.camera));
    }

    if (t.ao === 'gtao') {
      const ao = new GTAOPass(this.scene, this.camera, w * t.aoScale, h * t.aoScale);
      ao.output = GTAOPass.OUTPUT.Default;
      ao.updateGtaoMaterial({
        radius: 1.6, distanceExponent: 1.0, thickness: 1.2,
        scale: 1.0, samples: t.name === 'Ultra' ? 24 : 16,
        screenSpaceRadius: false,
      });
      ao.blendIntensity = 0.95;
      this.ao = ao;
      composer.addPass(ao);
    } else if (t.ao === 'ssao') {
      const ao = new SSAOPass(this.scene, this.camera, w * t.aoScale, h * t.aoScale);
      ao.kernelRadius = 2.4;
      ao.minDistance = 0.0008;
      ao.maxDistance = 0.06;
      this.ao = ao;
      composer.addPass(ao);
    }

    if (t.post.bloom) {
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.20, 0.55, 0.98);
      this.bloom = bloom;
      composer.addPass(bloom);
    }

    composer.addPass(new OutputPass());

    if (t.post.grain) {
      const grain = new ShaderPass({
        uniforms: {
          tDiffuse: { value: null }, uTime: { value: 0 },
          uAmount: { value: 0.028 }, uVignette: { value: 0.34 }, uAberr: { value: 0.0016 },
        },
        vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform float uTime, uAmount, uVignette, uAberr;
          varying vec2 vUv;
          float h21( vec2 p ){ return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
          void main(){
            vec2 c = vUv - 0.5;
            float r2 = dot( c, c );
            // chromatic aberration grows toward the frame edge, as a lens does
            vec2 off = c * r2 * uAberr;
            vec3 col;
            col.r = texture2D( tDiffuse, vUv + off ).r;
            col.g = texture2D( tDiffuse, vUv ).g;
            col.b = texture2D( tDiffuse, vUv - off ).b;
            // vignette, moved out of the CSS layer so it composites correctly
            col *= 1.0 - uVignette * smoothstep( 0.10, 0.72, r2 );
            float g = h21( vUv * 1024.0 + uTime ) - 0.5;
            col += g * uAmount * ( 0.35 + 0.65 * ( 1.0 - dot( col, vec3( 0.33 ) ) ) );
            gl_FragColor = vec4( col, 1.0 ); }`,
      });
      this.grain = grain;
      composer.addPass(grain);
    }

    this.composer = composer;
  }

  /* every material that should receive cascaded shadows must be registered,
     and the CSM hook must be chained rather than overwrite an existing one */
  setupMaterial(m) {
    if (!m || m.userData.csmReady) return m;
    const prev = m.onBeforeCompile;
    this.csm.setupMaterial(m);
    const hook = m.onBeforeCompile;
    if (prev) {
      m.onBeforeCompile = function (shader, renderer) {
        hook.call(this, shader, renderer);
        prev.call(this, shader, renderer);
      };
    }
    m.userData.csmReady = true;
    return m;
  }

  /* ---------------------------------------------------------- time of day */
  setTimeOfDay(hour, force) {
    this.hour = ((hour % 24) + 24) % 24;
    const dir = sunDirection(this.hour, this.day);
    const el = Math.asin(clamp(dir.y, -1, 1));
    const elDeg = el / DEG;

    /* atmosphere */
    const u = this.sky.material.uniforms;
    const lowSun = clamp(1 - smoothstep(-2, 22, elDeg), 0, 1);
    u.turbidity.value = lerp(2.3, 6.2, lowSun);
    u.rayleigh.value = lerp(1.35, 3.1, lowSun);
    u.mieCoefficient.value = lerp(0.0035, 0.010, lowSun);
    u.mieDirectionalG.value = lerp(0.78, 0.88, lowSun);
    u.sunPosition.value.copy(dir).multiplyScalar(1000);

    /* sun colour and power. Below the horizon the direct light goes out and
       only the sky and the moon remain. */
    const above = smoothstep(-6, 4, elDeg);
    const warm = clamp(1 - smoothstep(0, 26, elDeg), 0, 1);
    const col = new THREE.Color().setRGB(
      lerp(1.0, 1.0, 1), lerp(0.98, 0.62, warm), lerp(0.94, 0.30, warm));
    const power = lerp(0.0, 3.35, above) * lerp(0.55, 1.0, smoothstep(0, 30, elDeg));

    this.csm.lightDirection.copy(dir).negate().normalize();
    this.csm.lightIntensity = power;
    for (const l of this.csm.lights) { l.color.copy(col); l.intensity = power; }
    this.csm.updateFrustums();

    /* ambient: sky above, warm bounce below, both falling off after dark */
    const night = 1 - above;
    this.hemi.intensity = lerp(0.14, 0.04, night);
    this.hemi.color.setHex(night > 0.6 ? 0x2a3550 : 0xbcd4ee);
    this.hemi.groundColor.setHex(night > 0.6 ? 0x0e1016 : 0x4a4636);

    /* exposure — one place, not three */
    this.gl.toneMappingExposure = TONEMAP_EXPOSURE * lerp(1.35, 0.80, above);

    /* night sky */
    const starA = clamp(1 - smoothstep(-12, -1, elDeg), 0, 1);
    this.stars.material.uniforms.uOpacity.value = starA;
    this.moon.material.opacity = starA;
    this.moonDark.material.opacity = starA;
    this.night.visible = starA > 0.001;
    if (this.night.visible) {
      /* the moon trails the sun by roughly 160 degrees at this phase */
      const md = sunDirection(this.hour + 11.2, this.day);
      this.moon.position.copy(md).multiplyScalar(36000);
      this.moonDark.position.copy(md).multiplyScalar(36000)
        .addScaledVector(new THREE.Vector3(1, 0.35, 0.4).normalize(), 430);
      this.stars.rotation.y = this.hour * 0.2618;
    }

    if (this.bloom) this.bloom.strength = lerp(0.20, 0.62, night);

    this._refreshEnvironment();
    this._refreshFog(night);
    this._updateEmissives(night);
  }

  /* full-resolution render of the sky into a cube, PMREM-filtered, rebuilt on
     every time change. v3 never rebuilt it, so after dark every metal and
     glass surface still reflected a daytime blue sky. */
  _refreshEnvironment() {
    /* Both time states keep their baked IBL: the first visit to each state
       renders and PMREM-filters the sky once, after that the toggle is a
       texture swap. Small LRU so a URL-driven arbitrary hour cannot grow it. */
    if (!this._envCache) this._envCache = new Map();
    const key = this.hour.toFixed(2);
    const hit = this._envCache.get(key);
    if (hit) {
      this.scene.environment = hit.texture;
      this.scene.environmentIntensity = 0.30;
      return;
    }
    const wasFog = this.scene.fog;
    const wasNight = this.night.visible;
    this.scene.fog = null;
    this.night.visible = false;
    const others = [];
    for (const c of this.scene.children) {
      if (c !== this.sky && c.visible && c.type !== 'HemisphereLight' && !c.isLight) {
        others.push(c); c.visible = false;
      }
    }
    this._envRT = this.pmrem.fromScene(this.scene, 0.04, 1, 40000);
    this._envCache.set(key, this._envRT);
    if (this._envCache.size > 4) {
      const oldest = this._envCache.keys().next().value;
      this._envCache.get(oldest).dispose();
      this._envCache.delete(oldest);
    }
    this.scene.environment = this._envRT.texture;
    /* The physical sky returns unnormalised radiance, so an intensity of 1.0
       flooded every surface with ambient sky and collapsed the contrast: dark
       asphalt and PV read as mid grey. */
    this.scene.environmentIntensity = 0.30;
    for (const c of others) c.visible = true;
    this.scene.fog = wasFog;
    this.night.visible = wasNight;
  }

  /* read the actual horizon pixel of the sky and drive the fog from it, so the
     sea meets the sky and distant terrain meets the sky without a seam */
  _refreshFog(night) {
    /* cached per time state, like the environment — the probe is a GPU
       read-back and only two states exist */
    if (!this._fogCache) this._fogCache = new Map();
    const key = this.hour.toFixed(2);
    const hit = this._fogCache.get(key);
    if (hit) {
      this.scene.fog.color.copy(hit);
      this.scene.fog.density = lerp(0.000112, 0.000058, clamp(night, 0, 1));
      if (this.gl.getClearColor) this.gl.setClearColor(this.scene.fog.color, 1);
      return;
    }
    const wasFog = this.scene.fog;
    this.scene.fog = null;
    this._probeCam.position.set(0, 60, 0);
    this._probeCam.lookAt(0, 58, 1000);
    this._probeCam.updateMatrixWorld();
    const prevRT = this.gl.getRenderTarget();
    const vis = [];
    for (const c of this.scene.children) {
      if (c !== this.sky && c.visible) { vis.push(c); c.visible = false; }
    }
    this.gl.setRenderTarget(this._probeRT);
    this.gl.render(this.scene, this._probeCam);
    this.gl.readRenderTargetPixels(this._probeRT, 0, 6, 32, 4, this._probeBuf);
    this.gl.setRenderTarget(prevRT);
    for (const c of vis) c.visible = true;
    this.scene.fog = wasFog;

    let r = 0, g = 0, b = 0, n = 32 * 4;
    for (let i = 0; i < n; i++) { r += this._probeBuf[i * 4]; g += this._probeBuf[i * 4 + 1]; b += this._probeBuf[i * 4 + 2]; }
    r /= n; g /= n; b /= n;
    /* the probe is linear HDR; the fog is composited before tone mapping, so
       it must stay linear too */
    if (isFinite(r) && isFinite(g) && isFinite(b) && (r + g + b) > 1e-4) {
      this.scene.fog.color.setRGB(r, g, b);
      this._fogCache.set(key, this.scene.fog.color.clone());
      if (this._fogCache.size > 4) {
        this._fogCache.delete(this._fogCache.keys().next().value);
      }
    }
    this.scene.fog.density = lerp(0.000112, 0.000058, clamp(night, 0, 1));
    if (this.gl.getClearColor) this.gl.setClearColor(this.scene.fog.color, 1);
  }

  _updateEmissives(night) {
    if (this.lampPoolMesh) {
      this.lampPoolMesh.visible = night > 0.12;
      this.lampPoolMesh.material.opacity = 0.85 * clamp(night, 0, 1);
    }
    if (!this.emissiveGroups) return;
    for (const grp of this.emissiveGroups) {
      const on = night > grp.threshold;
      const flick = grp.flicker
        ? 0.86 + 0.14 * Math.sin(this.clock.elapsedTime * grp.flicker + grp.phase)
        : 1;
      grp.material.emissiveIntensity = on ? grp.power * night * flick : 0;
    }
  }

  registerEmissiveGroup(g) {
    if (!this.emissiveGroups) this.emissiveGroups = [];
    this.emissiveGroups.push(g);
  }

  /* --------------------------------------------------------- per-frame work */
  updateLamps() {
    const N = this.lampPool.length;
    if (!this.luminaires.length) return;
    const cp = this.camera.position;
    const night = 1 - smoothstep(-6, 4, Math.asin(clamp(sunDirection(this.hour, this.day).y, -1, 1)) / DEG);
    if (night < 0.05) {
      for (const s of this.lampPool) s.visible = false;
      return;
    }
    /* partial selection of the nearest N, refreshed on a stride so we are not
       sorting the whole list every frame */
    const list = this.luminaires;
    for (const rec of list) {
      rec._d = (rec.group && !rec.group.visible) ? Infinity
        : cp.distanceToSquared(rec.pos);
    }
    list.sort((a, b) => a._d - b._d);
    for (let i = 0; i < N; i++) {
      const s = this.lampPool[i], rec = list[i];
      if (!rec || rec._d === Infinity) { s.visible = false; continue; }
      s.visible = true;
      s.position.copy(rec.pos);
      s.target.position.copy(rec.aim);
      s.target.updateMatrixWorld();
      s.color.setHex(rec.colour);
      s.intensity = rec.power * night;
      s.distance = rec.range;
      s.angle = rec.angle;
      s.penumbra = rec.penumbra;
    }
    for (let i = list.length; i < N; i++) this.lampPool[i].visible = false;
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(w, h);
    this.composer.setSize(w, h);
    if (this.ao && this.ao.setSize) this.ao.setSize(w * this.tier.aoScale, h * this.tier.aoScale);
    this.csm.updateFrustums();
  }

  render(dt) {
    /* static-camera accumulation: when the camera is still, TAA keeps stacking
       jittered samples, which is what makes stills and screen recordings look
       expensive rather than merely clean */
    if (this.taa) {
      const moved = this._lastCamPos.distanceToSquared(this.camera.position) > 1e-6;
      if (moved) { this._staticFrames = 0; this.taa.sampleLevel = 0; this.taa.accumulate = false; }
      else {
        this._staticFrames++;
        if (this._staticFrames > 30) { this.taa.accumulate = true; this.taa.sampleLevel = 3; }
      }
      this._lastCamPos.copy(this.camera.position);
    }
    this.csm.update();
    this.updateLamps();
    if (this.grain) this.grain.uniforms.uTime.value = this.clock.elapsedTime;
    this.gl.info.reset();
    this.composer.render(dt);
    this.frames++;
  }

  stats() {
    const i = this.gl.info;
    return { calls: i.render.calls, tris: i.render.triangles,
             geometries: i.memory.geometries, textures: i.memory.textures };
  }

  /* runtime tier change */
  setTier(name) {
    if (!TIERS[name] || name === this.tierName) return false;
    this.tierName = name; this.tier = TIERS[name];
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.tier.pixelRatioCap));
    this.composer.passes.forEach((p) => p.dispose && p.dispose());
    this.composer.dispose();
    this._buildComposer();
    this.resize();
    return true;
  }

  /* step down a tier if the startup benchmark is slow */
  benchmark(ms) {
    this.frameTimes.push(ms);
    if (this.frameTimes.length !== 60) return null;
    const s = this.frameTimes.slice().sort((a, b) => a - b);
    const med = s[30];
    if (med > 22) {
      const i = TIER_ORDER.indexOf(this.tierName);
      if (i > 0) { this.setTier(TIER_ORDER[i - 1]); return TIER_ORDER[i - 1]; }
    }
    return null;
  }

  dispose() {
    this.csm.dispose();
    this.pmrem.dispose();
    if (this._envCache) { for (const rt of this._envCache.values()) rt.dispose(); }
    this._envCache = null; this._envRT = null;
    this._probeRT.dispose();
    this.composer.passes.forEach((p) => p.dispose && p.dispose());
    this.composer.dispose();
    this.gl.dispose();
  }
}
