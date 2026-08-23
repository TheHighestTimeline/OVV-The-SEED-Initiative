/* ============================================================================
   water.js — Gerstner-wave ocean, creek, estuary and pond surfaces
   ----------------------------------------------------------------------------
   Depth-based colour ramp, Beer-Lambert absorption, shoreline and crest foam,
   caustics on the seabed, and a real breaking-surf band at the bar.
   ========================================================================== */

import * as THREE from 'three';
import { SITE, lerp, clamp } from './00-config.js';
import { groundH } from './01-terrain.js';

export const WATERS = [];

const VERT = /* glsl */`
uniform float uTime;
uniform vec4  uWave[8];      /* dirx, dirz, amplitude, wavelength */
uniform float uSteep[8];
uniform int   uCount;
uniform float uSwell;
varying vec3 vWPos;
varying vec3 vNrm;
varying float vCrest;
varying vec2  vUv2;

void main() {
  vec3 p = position;
  vec3 wp = ( modelMatrix * vec4( p, 1.0 ) ).xyz;
  vec3 disp = vec3( 0.0 );
  vec3 nrm = vec3( 0.0, 1.0, 0.0 );
  float jac = 0.0;
  for ( int i = 0; i < 8; i ++ ) {
    if ( i >= uCount ) break;
    vec2 d = normalize( uWave[i].xy );
    float amp = uWave[i].z * uSwell;
    float len = uWave[i].w;
    float k = 6.28318530718 / len;
    float c = sqrt( 9.81 / k );
    float f = k * ( dot( d, wp.xz ) - c * uTime );
    float q = uSteep[i] / ( k * amp * float( uCount ) + 1e-4 );
    disp.x += q * amp * d.x * cos( f );
    disp.z += q * amp * d.y * cos( f );
    disp.y += amp * sin( f );
    float wa = k * amp;
    nrm.x -= d.x * wa * cos( f );
    nrm.z -= d.y * wa * cos( f );
    nrm.y -= q * wa * sin( f );
    jac += q * wa * sin( f );
  }
  wp += disp;
  vCrest = clamp( jac, 0.0, 1.0 );
  vWPos = wp;
  vNrm = normalize( vec3( nrm.x, 1.0 + nrm.y, nrm.z ) );
  vUv2 = uv;
  gl_Position = projectionMatrix * viewMatrix * vec4( wp, 1.0 );
}`;

const FRAG = /* glsl */`
uniform vec3  uShallow;
uniform vec3  uDeep;
uniform vec3  uFoam;
uniform float uTime;
uniform float uOpacity;
uniform vec3  uSunDir;
uniform vec3  uSunCol;
uniform vec3  uSkyCol;
uniform float uSeaLevel;
uniform float uSurfZ;
uniform float uKind;         /* 0 ocean, 1 creek/pond, 2 estuary */
uniform sampler2D uBedTex;   /* not used; kept for future SSR hookup */
varying vec3 vWPos;
varying vec3 vNrm;
varying float vCrest;
varying vec2  vUv2;

float h21( vec2 p ){ return fract( sin( dot( p, vec2(127.1,311.7) ) ) * 43758.5453 ); }
float vnoise( vec2 p ){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix( mix( h21(i), h21(i+vec2(1,0)), u.x ),
              mix( h21(i+vec2(0,1)), h21(i+vec2(1,1)), u.x ), u.y );
}
float fbm( vec2 p ){
  float s = 0.0, a = 0.5;
  for ( int i = 0; i < 4; i ++ ) { s += a * vnoise(p); p *= 2.03; a *= 0.5; }
  return s;
}

void main() {
  vec3 V = normalize( cameraPosition - vWPos );
  vec3 N = normalize( vNrm );

  /* depth from the water surface to the bed, passed in through the vertex
     colour channel would cost an extra attribute; approximate from the
     terrain trend instead, which is monotonic offshore */
  float depth = max( 0.0, uSeaLevel - ( vWPos.y - 0.001 ) );
  float shore = clamp( ( vWPos.z - uSurfZ ) / 160.0, 0.0, 1.0 );
  float dfac = uKind < 0.5 ? shore : 0.55;

  /* Beer-Lambert absorption through the water column */
  vec3 absorb = exp( -vec3( 0.28, 0.10, 0.06 ) * ( 2.0 + dfac * 22.0 ) );
  vec3 body = mix( uShallow, uDeep, dfac ) * ( 0.45 + 0.55 * absorb );

  /* fresnel reflection of the sky */
  float fres = pow( 1.0 - max( dot( N, V ), 0.0 ), 5.0 );
  fres = mix( 0.028, 1.0, fres );
  vec3 refl = uSkyCol;

  /* sun specular */
  vec3 H = normalize( uSunDir + V );
  float spec = pow( max( dot( N, H ), 0.0 ), 260.0 ) * 3.4;

  /* subsurface scattering in the wave face at low sun angles */
  float sss = pow( clamp( dot( V, -uSunDir ) * 0.5 + 0.5, 0.0, 1.0 ), 3.0 )
            * clamp( vCrest, 0.0, 1.0 ) * 1.4;
  vec3 sssCol = vec3( 0.16, 0.42, 0.36 ) * sss;

  vec3 col = mix( body, refl, fres ) + uSunCol * spec + sssCol;

  /* foam: shoreline from the depth test, crest foam from the wave Jacobian */
  float sf = 1.0 - smoothstep( 0.0, 42.0, vWPos.z - uSurfZ );
  float band = fbm( vec2( vWPos.x * 0.06, vWPos.z * 0.02 - uTime * 0.35 ) );
  float shoreFoam = uKind < 0.5
    ? smoothstep( 0.35, 0.85, sf * ( 0.55 + band ) ) : 0.0;

  /* the breaking bar: a wave set that actually crosses and breaks */
  float bar = exp( -pow( ( vWPos.z - ( uSurfZ + 118.0 ) ) / 26.0, 2.0 ) );
  float set = smoothstep( 0.42, 0.92,
      fbm( vec2( vWPos.x * 0.008, vWPos.z * 0.004 - uTime * 0.10 ) ) );
  float breaker = bar * set * smoothstep( 0.10, 0.55, vCrest + 0.25 );

  float crestFoam = smoothstep( 0.52, 0.92, vCrest ) * 0.75;
  float foam = clamp( shoreFoam + breaker + crestFoam, 0.0, 1.0 );
  col = mix( col, uFoam * ( 0.75 + 0.4 * fbm( vWPos.xz * 0.4 ) ), foam );

  /* caustic sparkle in the shallows */
  if ( uKind < 0.5 && dfac < 0.35 ) {
    float ca = fbm( vWPos.xz * 0.22 + uTime * 0.12 );
    ca = pow( abs( ca - 0.5 ) * 2.0, 6.0 );
    col += uSunCol * ( 1.0 - ca ) * 0.10 * ( 1.0 - dfac / 0.35 );
  }

  float alpha = uKind < 0.5 ? mix( 0.80, 0.985, dfac ) : uOpacity;
  alpha = max( alpha, foam );
  gl_FragColor = vec4( col, alpha );
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makeWaterMaterial(opts) {
  opts = opts || {};
  const kind = opts.kind || 'ocean';
  const count = opts.components || 6;
  const waves = [];
  const steep = [];
  const dirBase = opts.windDir != null ? opts.windDir : -1.32;
  const A = opts.amplitude != null ? opts.amplitude : 1.0;
  for (let i = 0; i < 8; i++) {
    const spread = (i / 7 - 0.5) * (opts.spread != null ? opts.spread : 1.15);
    const a = dirBase + spread;
    const len = (opts.baseLength || 74) * Math.pow(0.62, i * 0.85);
    const amp = A * Math.pow(0.66, i) * (i === 0 ? 1.0 : 0.85);
    waves.push(new THREE.Vector4(Math.cos(a), Math.sin(a), amp, len));
    steep.push(0.72 * Math.pow(0.8, i));
  }
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uWave: { value: waves },
      uSteep: { value: steep },
      uCount: { value: count },
      uSwell: { value: 1.0 },
      uShallow: { value: new THREE.Color(opts.shallow || 0x2f7d78) },
      uDeep: { value: new THREE.Color(opts.deep || 0x08243c) },
      uFoam: { value: new THREE.Color(0xeef4f4) },
      uOpacity: { value: opts.opacity != null ? opts.opacity : 0.90 },
      uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.5) },
      uSunCol: { value: new THREE.Color(0xffffff) },
      uSkyCol: { value: new THREE.Color(0x9ec4e2) },
      uSeaLevel: { value: opts.level != null ? opts.level : SITE.tideLevel },
      uSurfZ: { value: opts.surfZ != null ? opts.surfZ : SITE.swashZ },
      uKind: { value: kind === 'ocean' ? 0 : kind === 'estuary' ? 2 : 1 },
      uBedTex: { value: null },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    side: THREE.FrontSide,
    depthWrite: false,
  });
  m.name = 'water-' + kind;
  m.userData.libraryName = 'water-' + kind;
  WATERS.push(m);
  return m;
}

export function updateWaters(t, pipeline) {
  const sun = pipeline ? pipeline.csm.lightDirection.clone().negate() : null;
  for (const m of WATERS) {
    m.uniforms.uTime.value = t;
    if (sun) {
      m.uniforms.uSunDir.value.copy(sun);
      m.uniforms.uSunCol.value.copy(pipeline.csm.lights[0].color)
        .multiplyScalar(clamp(pipeline.csm.lightIntensity / 3.2, 0.02, 1));
      if (pipeline.scene.fog) m.uniforms.uSkyCol.value.copy(pipeline.scene.fog.color);
    }
  }
}

/* a water surface plane, tessellated enough for the Gerstner displacement */
export function waterPlane(x0, x1, z0, z1, level, material, cell) {
  const nx = Math.max(1, Math.round((x1 - x0) / (cell || 12)));
  const nz = Math.max(1, Math.round((z1 - z0) / (cell || 12)));
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, level, (z0 + z1) / 2);
  const m = new THREE.Mesh(g, material);
  m.receiveShadow = false;
  m.castShadow = false;
  m.renderOrder = 20;
  m.frustumCulled = false;
  m.userData.noMerge = true;
  return m;
}

/* a water surface clipped to a circular pond bowl */
export function pondSurface(p, material) {
  const g = new THREE.CircleGeometry(p.r, 48, 0, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  g.translate(p.x, p.level, p.z);
  const m = new THREE.Mesh(g, material);
  m.renderOrder = 20;
  m.userData.noMerge = true;
  m.receiveShadow = false;
  return m;
}

/* a ribbon of water following the creek centreline */
export function creekSurface(nodes, material) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    const prev = nodes[Math.max(0, i - 1)], next = nodes[Math.min(nodes.length - 1, i + 1)];
    let tx = next.x - prev.x, tz = next.z - prev.z;
    const L = Math.hypot(tx, tz) || 1; tx /= L; tz /= L;
    const nx = -tz, nz = tx;
    const half = n.w / 2 + 0.4;
    const y = Math.max(n.bed + Math.min(1.1, 0.22 + n.w * 0.035), SITE.tideLevel);
    pos.push(n.x - nx * half, y, n.z - nz * half);
    pos.push(n.x + nx * half, y, n.z + nz * half);
    uv.push(0, i * 0.1, 1, i * 0.1);
    if (i < nodes.length - 1) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, material);
  m.renderOrder = 20;
  m.userData.noMerge = true;
  m.receiveShadow = false;
  return m;
}
