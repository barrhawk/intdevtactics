//NOTE(@jimmylee)
//High-performance GPU Water Surface for the 10x10 isometric tactical board diorama.
//Features:
//1. Real-time GPU Caustic Mesh projection pass via WebGLRenderTarget(512, 512),
//   dense subdivided PlaneGeometry(2, 2, 128, 128) refracting rays along cubic wave slopes,
//   and area(vFrom)/area(vTo) light convergence via dFdx/dFdy.
//2. Hybrid caustic sampling: razor-sharp procedural caustic baseline seamlessly blended with
//   the live GPU caustic render target pass (tCaustic).
//3. Submerged 3D marble post raymarching (uPostCount, uPostCenters, uPostHalfHeights, postHit)
//   and underwater volumetric post shadows (POST_SHADOW_SAMPLES).
//4. FFT water swell, interactive ripples with dynamic wake/splashes, and procedural drifting lace foam.

import * as THREE from 'three';
import { createWaterSwell, createWaterRipples, sampleWaterField } from '../three-isometric-engine/debug/water-simulation.js';

export const MAX_WATER_POSTS = 4;
export const CAUSTIC_SIZE = 512;
export const CAUSTIC_SEGMENTS = 128;
export const CAUSTIC_FOCUS = 21.0;
export const CAUSTIC_MOST = 3.2;

const CAUSTIC_VERTEX_SHADER = /* glsl */ `
  uniform sampler2D slope;
  varying vec2 vFrom;
  varying vec2 vTo;

  #ifndef SWELL_SIZE
    #define SWELL_SIZE 32.0
  #endif
  #ifndef SWELL_DOMAIN
    #define SWELL_DOMAIN 240.0
  #endif
  #ifndef CAUSTIC_FOCUS
    #define CAUSTIC_FOCUS 21.0
  #endif

  vec2 cubicSlope(vec2 point) {
    vec2 texel = point * SWELL_SIZE - 0.5;
    vec2 cell = floor(texel);
    vec2 f = texel - cell;
    vec2 f2 = f * f;
    vec2 f3 = f2 * f;
    vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
    vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
    vec2 w3 = f3 / 6.0;
    vec2 w2 = 1.0 - w0 - w1 - w3;
    vec2 g0 = w0 + w1;
    vec2 g1 = w2 + w3;
    vec2 h0 = (cell - 0.5 + w1 / g0 + 0.5) / SWELL_SIZE;
    vec2 h1 = (cell + 1.5 + w3 / g1 + 0.5) / SWELL_SIZE;
    return g0.y * (g0.x * texture2D(slope, h0).rg + g1.x * texture2D(slope, vec2(h1.x, h0.y)).rg)
         + g1.y * (g0.x * texture2D(slope, vec2(h0.x, h1.y)).rg + g1.x * texture2D(slope, h1).rg);
  }

  void main() {
    vFrom = uv;
    vTo = uv + cubicSlope(uv) * CAUSTIC_FOCUS / SWELL_DOMAIN;
    gl_Position = vec4(vTo * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const CAUSTIC_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vFrom;
  varying vec2 vTo;

  #ifndef CAUSTIC_MOST
    #define CAUSTIC_MOST 3.2
  #endif

  float area(vec2 point) {
    vec2 dx = dFdx(point);
    vec2 dy = dFdy(point);
    return abs(dx.x * dy.y - dx.y * dy.x);
  }

  void main() {
    float light = area(vFrom) / max(area(vTo), 1e-9);
    gl_FragColor = vec4(vec3(min(light, CAUSTIC_MOST) * 0.25), 1.0);
  }
`;

const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform sampler2D uSwellTex;
  uniform sampler2D uRippleTex;

  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vSwellUv;
  varying vec2 vRippleUv;

  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    // River domain X: [-120, 120] (domain 240), Z: [-24, 24] (domain 48)
    vSwellUv = (world.xz + 120.0) / 240.0;
    vRippleUv = (world.xz + 120.0) / 240.0;

    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D uSwellTex;
  uniform sampler2D uRippleTex;
  uniform sampler2D tCaustic;
  uniform float uTime;
  uniform float uOpacity;

  // Submerged 3D marble post uniforms
  const int MAX_POSTS = 4;
  uniform int uPostCount;
  uniform vec4 uPostCenters[MAX_POSTS]; // xy = world x,z; zw = halfX, halfZ
  uniform float uPostTops[MAX_POSTS];
  uniform float uPostHalfHeights[MAX_POSTS];
  uniform vec3 uPostColor;

  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 seabedColor;
  uniform vec3 skyHorizonColor;
  uniform vec3 skyZenithColor;
  uniform vec3 foamColor;
  uniform vec3 foamShadeColor;

  varying vec3 vWorld;
  varying vec2 vUv;
  varying vec2 vSwellUv;
  varying vec2 vRippleUv;

  const vec2 WIND = normalize(vec2(1.0, 0.55));
  const float CAUSTIC_SPREAD = 0.0011;
  const vec3 ABSORPTION = vec3(0.058, 0.0115, 0.0072);
  const float REFRACTION = 0.75;
  const float FOAM_LACE_SCALE = 0.62;
  const float FOAM_DRIFT = 0.55;

  const float POST_SHADOW = 0.38;
  const float POST_SHADOW_SOFT = 1.6;
  const float POST_CONTACT = 0.18;
  const float POST_CONTACT_REACH = 2.5;
  const float POST_SUN_LEAN = 0.75;
  const float POST_SUBMERGED_LIGHT = 0.86;
  const vec3 POST_LIGHT = normalize(vec3(0.42, 1.0, 0.62));
  const int POST_SHADOW_SAMPLES = 5;

  float hash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  }

  float softNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 f = point - cell;
    vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), s.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), s.x),
      s.y
    );
  }

  // Procedure drifting lace foam: creases of smooth noise warped by more noise
  float lace(vec2 point) {
    vec2 drift = WIND * uTime * FOAM_DRIFT;
    vec2 warp = vec2(softNoise(point * 0.5 + drift * 0.3), softNoise(point * 0.5 - drift * 0.3 + 19.0)) * 2.6;
    float broad = 1.0 - abs(2.0 * softNoise(point + warp + drift) - 1.0);
    float fine = 1.0 - abs(2.0 * softNoise(point * 2.3 - warp - drift * 1.4 + 7.0) - 1.0);
    return broad * broad * (0.62 + 0.38 * fine);
  }

  // Smooth sinusoidal shimmer ripples
  vec2 shimmer(vec2 point) {
    vec2 a = point * 0.5 + WIND * uTime * 1.1;
    vec2 b = vec2(-point.y, point.x) * 0.85 - WIND.yx * uTime * 1.5;
    return vec2(cos(a.x + 0.6 * a.y) + 0.6 * cos(b.x - 0.4 * b.y), cos(a.y - 0.6 * a.x) + 0.6 * cos(b.y + 0.4 * b.x)) * 0.025;
  }

  // Procedural caustic light intensity baseline (always sharp before first GPU pass)
  float sampleCaustic(vec2 p) {
    vec2 p1 = p * 0.35 + vec2(uTime * 0.35, uTime * 0.22);
    vec2 p2 = p * 0.48 - vec2(uTime * 0.28, uTime * 0.32);
    float c1 = sin(p1.x + sin(p1.y * 1.5)) * cos(p1.y + cos(p1.x * 1.5));
    float c2 = sin(p2.x * 1.35 - sin(p2.y * 1.25)) * cos(p2.y * 1.35 - cos(p2.x * 1.25));
    return pow(0.5 + 0.5 * (c1 + c2) * 0.5, 3.2) * 3.5;
  }

  float boxDistance(vec2 point, vec4 box) {
    vec2 outside = abs(point - box.xy) - box.zw;
    return length(max(outside, 0.0)) + min(max(outside.x, outside.y), 0.0);
  }

  float postDistance(vec2 point) {
    float nearest = 1000.0;
    for (int i = 0; i < MAX_POSTS; i++) {
      if (i >= uPostCount) break;
      nearest = min(nearest, boxDistance(point, uPostCenters[i]));
    }
    return nearest;
  }

  // Raymarches refracted ray through water column against submerged marble posts
  float postHit(vec2 from, vec2 along, float drop, out vec3 face) {
    float first = 2.0;
    face = vec3(0.0, 1.0, 0.0);
    vec2 safe = mix(along, vec2(1e-5), step(abs(along), vec2(1e-5)));
    for (int i = 0; i < MAX_POSTS; i++) {
      if (i >= uPostCount) break;
      float start = clamp((vWorld.y - uPostTops[i]) / max(drop, 1e-3), 0.0, 1.0);
      vec2 near = (uPostCenters[i].xy - sign(safe) * uPostCenters[i].zw - from) / safe;
      vec2 far = (uPostCenters[i].xy + sign(safe) * uPostCenters[i].zw - from) / safe;
      float enter = max(near.x, near.y);
      float leave = min(far.x, far.y);
      float reach = max(enter, start);
      if (reach > leave || reach > 1.0 || reach >= first) continue;
      first = reach;
      if (enter > start) face = near.x > near.y ? vec3(-sign(safe.x), 0.0, 0.0) : vec3(0.0, 0.0, -sign(safe.y));
      else face = vec3(0.0, 1.0, 0.0);
    }
    return first;
  }

  // Underwater volumetric shadows cast by submerged posts onto seabed
  float postShadow(vec2 point, float deep) {
    vec2 sweep = sunDirection.xz / sunDirection.y * deep * POST_SUN_LEAN;
    float nearest = 1000.0;
    for (int i = 0; i < MAX_POSTS; i++) {
      if (i >= uPostCount) break;
      for (int k = 0; k < POST_SHADOW_SAMPLES; k++) {
        float s = float(k) / float(POST_SHADOW_SAMPLES - 1);
        nearest = min(nearest, boxDistance(point + sweep * s, uPostCenters[i]));
      }
    }
    return 1.0 - smoothstep(-POST_SHADOW_SOFT, POST_SHADOW_SOFT, nearest);
  }

  void main() {
    vec4 swellData = texture2D(uSwellTex, vSwellUv);
    vec4 rippleData = texture2D(uRippleTex, vRippleUv);

    // Surface slope and normal
    vec2 slope = swellData.gb * 0.55 + rippleData.gb * 1.4 + shimmer(vWorld.xz);
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

    vec3 view = normalize(cameraPosition - vWorld);
    float viewDotNormal = max(dot(normal, view), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - viewDotNormal, 5.0);

    // Refracted ray onto sandy riverbed
    vec3 ray = refract(-view, normal, REFRACTION);
    float depth = 12.0 + 3.0 * (sin(vWorld.x * 0.025 + 1.1) * sin(vWorld.z * 0.035 - 0.4));
    float path = (depth + swellData.r + rippleData.r) / max(-ray.y, 0.2);
    vec2 bed = vWorld.xz + ray.xz * path;

    // Sunlight refraction caustics:
    // Blend real-time GPU Caustic Mesh projection (tCaustic) with procedural baseline
    vec2 bedSwell = vSwellUv + (bed - vWorld.xz) / 240.0;
    vec2 fringe = vec2(CAUSTIC_SPREAD, -CAUSTIC_SPREAD * 0.6) * 150.0;

    vec3 procCaustics = vec3(
      sampleCaustic(bed - fringe),
      sampleCaustic(bed),
      sampleCaustic(bed + fringe)
    );

    vec3 gpuCaustics = vec3(
      texture2D(tCaustic, bedSwell - fringe * 0.005).r,
      texture2D(tCaustic, bedSwell).r,
      texture2D(tCaustic, bedSwell + fringe * 0.005).r
    ) * 4.0;

    // Blend: if GPU pass has written energy into tCaustic, blend it in
    float gpuStrength = clamp(length(gpuCaustics) * 1.2, 0.0, 1.0);
    vec3 blendedCaustics = mix(procCaustics, gpuCaustics * 1.2, gpuStrength * 0.75);

    vec3 seabed = seabedColor * (0.82 + 0.22 * blendedCaustics * sqrt(max(blendedCaustics, vec3(0.0))));

    // Submerged marble posts raymarching & volumetric post shadows
    float through = path;
    if (uPostCount > 0) {
      vec3 face;
      float hit = postHit(vWorld.xz, bed - vWorld.xz, depth + swellData.r + rippleData.r, face);
      if (hit <= 1.0) {
        through = path * hit;
        seabed = uPostColor * POST_SUBMERGED_LIGHT * mix(0.58, 1.0, clamp(dot(face, POST_LIGHT), 0.0, 1.0));
      } else {
        seabed *= 1.0 - POST_SHADOW * postShadow(bed, depth);
        seabed *= 1.0 - POST_CONTACT * exp(-max(postDistance(bed), 0.0) / POST_CONTACT_REACH);
      }
    }

    // Beer-Lambert depth absorption
    vec3 waterColor = seabed * exp(-ABSORPTION * through);

    // Fresnel sky reflection
    vec3 reflected = reflect(-view, normal);
    vec3 sky = mix(skyHorizonColor, skyZenithColor, clamp(reflected.y, 0.0, 1.0));
    vec3 color = mix(waterColor, sky, fresnel);

    // Specular sun glint
    vec3 halfway = normalize(sunDirection + view);
    float toSun = max(dot(normal, halfway), 0.0);
    color += sunColor * (pow(toSun, 1400.0) * 0.85 + pow(toSun, 90.0) * 0.06);

    // Procedural drifting lace() foam:
    // 1. Riverbanks (stream boundary near abs(z) ~ 24)
    float bankCoverage = smoothstep(14.0, 23.5, abs(vWorld.z));
    // 2. Bridge posts (columns around x ~ -12 and +12)
    float bridgeDist = min(abs(vWorld.x - 12.0), abs(vWorld.x + 12.0));
    float bridgeCoverage = (1.0 - smoothstep(0.0, 5.5, bridgeDist)) * (1.0 - smoothstep(18.0, 24.0, abs(vWorld.z)));
    // 3. Submerged marble posts foam contours
    float postCoverage = 0.0;
    if (uPostCount > 0) {
      float pDist = postDistance(vWorld.xz);
      float surge = 0.5 + 0.5 * clamp(swellData.r, -1.0, 1.0);
      float lap = 4.6 * (0.55 + 0.9 * surge);
      postCoverage = max(exp(-max(pDist, 0.0) / 4.8), (1.0 - smoothstep(0.0, 1.6, abs(pDist - lap))) * 0.65);
    }
    // 4. Active water ripples
    float rippleCoverage = smoothstep(0.02, 0.5, rippleData.a) * 1.2 + abs(rippleData.r) * 0.8;

    float coverage = max(max(bankCoverage, bridgeCoverage), max(max(rippleCoverage, postCoverage), smoothstep(0.7, 1.0, swellData.a) * 0.4));

    if (coverage > 0.004) {
      float strands = lace(vWorld.xz * FOAM_LACE_SCALE);
      float edge = max(fwidth(strands), 0.05);
      float threshold = 1.0 - 0.86 * coverage;
      float foam = smoothstep(threshold - edge, threshold + edge, strands) * smoothstep(0.12, 0.35, coverage);
      float thick = smoothstep(0.45, 1.0, coverage);
      color *= 1.0 - 0.1 * coverage;
      color = mix(color, mix(foamShadeColor, foamColor, 0.45 + 0.55 * max(thick, strands)), foam * (0.75 + 0.25 * thick));
    }

    gl_FragColor = vec4(color, uOpacity);
  }
`;

export class WaterSurface {
  /**
   * @param {THREE.Group|THREE.Scene} parentGroup
   * @param {Object} [options]
   */
  constructor(parentGroup, options = {}) {
    this.parentGroup = parentGroup;
    this.options = options;

    this.width = options.width ?? 240;
    this.depth = options.depth ?? 48;
    this.posY = options.y ?? 0.08;
    this.seed = options.seed ?? 42;

    this.swellSize = options.swellSize ?? 32;
    this.swellDomain = options.swellDomain ?? 240;

    // 1. Water Swell & Ripple Solvers
    this.waterSwell = createWaterSwell({
      size: this.swellSize,
      domain: this.swellDomain,
      windX: 1,
      windZ: 0.3,
      windSpeed: 10,
      gravity: 98,
      smallWave: 0.8,
      choppiness: 0.8,
      targetHeight: 1.2,
      repeatPeriod: 20,
      foamThreshold: 0.45,
      foamStrength: 1.2,
      seed: this.seed
    });

    this.waterRipples = createWaterRipples({
      size: 32,
      domain: 240,
      propagation: 0.45,
      damping: 0.985,
      sponge: 3
    });

    this.activeWaterRipples = [];

    // 2. DataTextures for GPU Swell & Ripples
    this.waterSwellTexture = new THREE.DataTexture(
      this.waterSwell.heightDisplacement,
      this.waterSwell.size,
      this.waterSwell.size,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.waterSwellTexture.wrapS = THREE.RepeatWrapping;
    this.waterSwellTexture.wrapT = THREE.RepeatWrapping;
    this.waterSwellTexture.minFilter = THREE.LinearFilter;
    this.waterSwellTexture.magFilter = THREE.LinearFilter;
    this.waterSwellTexture.needsUpdate = true;

    this.slopeTexture = new THREE.DataTexture(
      this.waterSwell.slope,
      this.waterSwell.size,
      this.waterSwell.size,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.slopeTexture.wrapS = THREE.RepeatWrapping;
    this.slopeTexture.wrapT = THREE.RepeatWrapping;
    this.slopeTexture.minFilter = THREE.LinearFilter;
    this.slopeTexture.magFilter = THREE.LinearFilter;
    this.slopeTexture.needsUpdate = true;

    this.waterRippleTexture = new THREE.DataTexture(
      this.waterRipples.field,
      this.waterRipples.size,
      this.waterRipples.size,
      THREE.RGBAFormat,
      THREE.FloatType
    );
    this.waterRippleTexture.wrapS = THREE.ClampToEdgeWrapping;
    this.waterRippleTexture.wrapT = THREE.ClampToEdgeWrapping;
    this.waterRippleTexture.minFilter = THREE.LinearFilter;
    this.waterRippleTexture.magFilter = THREE.LinearFilter;
    this.waterRippleTexture.needsUpdate = true;

    // 3. Real-Time GPU Caustic Mesh Projection Pass
    this.causticTarget = new THREE.WebGLRenderTarget(CAUSTIC_SIZE, CAUSTIC_SIZE, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false
    });

    this.causticGeo = new THREE.PlaneGeometry(2, 2, CAUSTIC_SEGMENTS, CAUSTIC_SEGMENTS);
    this.causticMat = new THREE.ShaderMaterial({
      defines: {
        SWELL_SIZE: this.swellSize.toFixed(1),
        SWELL_DOMAIN: this.swellDomain.toFixed(1),
        CAUSTIC_FOCUS: CAUSTIC_FOCUS.toFixed(1),
        CAUSTIC_MOST: CAUSTIC_MOST.toFixed(1)
      },
      uniforms: {
        slope: { value: this.slopeTexture }
      },
      vertexShader: CAUSTIC_VERTEX_SHADER,
      fragmentShader: CAUSTIC_FRAGMENT_SHADER,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    this.causticMesh = new THREE.Mesh(this.causticGeo, this.causticMat);
    this.causticMesh.frustumCulled = false;
    this.causticScene = new THREE.Scene();
    this.causticScene.add(this.causticMesh);
    this.causticCamera = new THREE.Camera();

    // 4. Submerged marble posts state
    this.postCount = 0;
    this.postCenters = [];
    this.postTops = [];
    this.postHalfHeights = [];
    for (let i = 0; i < MAX_WATER_POSTS; i++) {
      this.postCenters.push(new THREE.Vector4());
      this.postTops.push(0);
      this.postHalfHeights.push(0);
    }

    // 5. Water Surface Shader Mesh
    this.riverGeo = new THREE.PlaneGeometry(this.width, this.depth, 48, 12);
    this.riverGeo.rotateX(-Math.PI / 2);

    this.material = new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uSwellTex: { value: this.waterSwellTexture },
        uRippleTex: { value: this.waterRippleTexture },
        tCaustic: { value: this.causticTarget.texture },
        uOpacity: { value: 0.85 },
        uPostCount: { value: 0 },
        uPostCenters: { value: this.postCenters },
        uPostTops: { value: this.postTops },
        uPostHalfHeights: { value: this.postHalfHeights },
        uPostColor: { value: new THREE.Color(0xffffff) },
        sunDirection: { value: new THREE.Vector3(-0.5, 0.62, 0.42).normalize() },
        sunColor: { value: new THREE.Color(0xfff4dc) },
        seabedColor: { value: new THREE.Color(0xfbf6e8) },
        skyHorizonColor: { value: new THREE.Color(0xe6f6fb) },
        skyZenithColor: { value: new THREE.Color(0x9fd8f2) },
        foamColor: { value: new THREE.Color(0xffffff) },
        foamShadeColor: { value: new THREE.Color(0xc4e4ee) }
      }
    });

    // Provide .opacity getter/setter wired to uOpacity uniform
    Object.defineProperty(this.material, 'opacity', {
      get() {
        return this.uniforms.uOpacity.value;
      },
      set(val) {
        this.uniforms.uOpacity.value = val;
      },
      configurable: true
    });

    this.mesh = new THREE.Mesh(this.riverGeo, this.material);
    this.mesh.position.set(0, this.posY, 0);
    this.mesh.name = 'AnimatedWaterSurface';
    if (this.parentGroup) {
      this.parentGroup.add(this.mesh);
    }

    this.basePositions = this.riverGeo.attributes.position.array.slice();
    this.lastCausticUpdate = -1;
  }

  /**
   * Configures submerged / emergent marble posts for raymarching and shadows.
   * @param {Array<{ x: number, z: number, halfX?: number, halfZ?: number, top?: number, height?: number }>} posts
   */
  setPosts(posts) {
    if (!posts) return;
    this.postCount = Math.min(posts.length, MAX_WATER_POSTS);
    for (let i = 0; i < MAX_WATER_POSTS; i++) {
      if (i < this.postCount) {
        const p = posts[i];
        this.postCenters[i].set(p.x, p.z, p.halfX ?? 2.5, p.halfZ ?? 2.5);
        this.postTops[i] = p.top ?? 0;
        this.postHalfHeights[i] = (p.height ?? 14) * 0.5;
      } else {
        this.postCenters[i].set(0, 0, 0, 0);
        this.postTops[i] = 0;
        this.postHalfHeights[i] = 0;
      }
    }
    if (this.material && this.material.uniforms) {
      this.material.uniforms.uPostCount.value = this.postCount;
      this.material.uniforms.uPostCenters.value = this.postCenters;
      this.material.uniforms.uPostTops.value = this.postTops;
      this.material.uniforms.uPostHalfHeights.value = this.postHalfHeights;
    }
  }

  /**
   * Executes the real-time GPU Caustic Mesh projection pass onto this.causticTarget.
   * @param {THREE.WebGLRenderer} renderer
   */
  updateCaustics(renderer) {
    if (!renderer) return;
    const oldTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.causticTarget);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(this.causticScene, this.causticCamera);
    renderer.setRenderTarget(oldTarget);
  }

  /**
   * Spawns an expanding 3D cyan water ripple ring and displaces the height solver.
   * @param {number} worldX
   * @param {number} worldZ
   * @param {number} [strength=1.0]
   */
  triggerRipple(worldX, worldZ, strength = 1.0) {
    if (this.waterRipples) {
      this.waterRipples.displace(worldX, worldZ, -1.2 * strength);
      this.waterRipples.settle(2.0, 1.5);
      if (this.waterRippleTexture) this.waterRippleTexture.needsUpdate = true;
    }

    const ringGeo = new THREE.RingGeometry(0.8, 2.2, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x22d3ee,
      transparent: true,
      opacity: 0.85 * Math.min(strength, 1.0),
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.set(worldX, 0.15, worldZ);
    if (this.parentGroup) {
      this.parentGroup.add(ringMesh);
    }

    const now = typeof performance !== 'undefined' ? performance.now() / 1000 : 0;
    this.activeWaterRipples.push({
      mesh: ringMesh,
      startTime: now
    });
  }

  /**
   * Per-frame simulation update.
   * @param {number} nowSec
   */
  update(nowSec) {
    const now = nowSec || (typeof performance !== 'undefined' ? performance.now() / 1000 : 0);

    // Step FFT water swell and ripples solver
    if (this.waterSwell) {
      this.waterSwell.update(now);
      if (this.waterSwellTexture) this.waterSwellTexture.needsUpdate = true;
      if (this.slopeTexture) this.slopeTexture.needsUpdate = true;
    }
    if (this.waterRipples) {
      this.waterRipples.settle(1.0, 2.0);
      this.waterRipples.step();
      if (this.waterRippleTexture) this.waterRippleTexture.needsUpdate = true;
    }

    // Update water material shader uniforms
    if (this.material && this.material.uniforms?.uTime) {
      this.material.uniforms.uTime.value = now;
      this.material.opacity = 0.82 + 0.08 * Math.sin(now * 2.5);
    }

    // Deform water surface mesh with live wave heights
    if (this.mesh && this.basePositions && this.waterSwell) {
      const pos = this.mesh.geometry.attributes.position;
      const array = pos.array;
      const base = this.basePositions;
      const swell = this.waterSwell;
      const ripples = this.waterRipples;

      for (let i = 0; i < array.length; i += 3) {
        const wx = base[i];
        const wz = base[i + 2];
        const u = (wx + 120) / 240;
        const v = (wz + 120) / 240;
        let h = sampleWaterField(swell.heightDisplacement, swell.size, u, v, 0);
        if (ripples) {
          h += sampleWaterField(ripples.field, ripples.size, u, v, 0);
        }
        array[i + 1] = base[i + 1] + h * 0.55;
      }
      pos.needsUpdate = true;
      this.mesh.geometry.computeVertexNormals();
    }

    // Animate expanding 3D water ripple rings
    if (this.activeWaterRipples && this.activeWaterRipples.length > 0) {
      const RIPPLE_DURATION = 0.75;
      for (let i = this.activeWaterRipples.length - 1; i >= 0; i--) {
        const r = this.activeWaterRipples[i];
        const elapsed = now - r.startTime;
        const progress = Math.min(1.0, elapsed / RIPPLE_DURATION);
        const scale = 1.0 + progress * 3.5;
        r.mesh.scale.set(scale, scale, 1);
        r.mesh.material.opacity = Math.max(0, (1 - progress) * 0.85);
        if (progress >= 1.0) {
          if (this.parentGroup) this.parentGroup.remove(r.mesh);
          r.mesh.geometry.dispose();
          r.mesh.material.dispose();
          this.activeWaterRipples.splice(i, 1);
        }
      }
    }
  }

  dispose() {
    if (this.parentGroup && this.mesh) {
      this.parentGroup.remove(this.mesh);
    }

    if (this.riverGeo) {
      this.riverGeo.dispose();
      this.riverGeo = null;
    }
    if (this.material) {
      this.material.dispose();
      this.material = null;
    }
    if (this.waterSwellTexture) {
      this.waterSwellTexture.dispose();
      this.waterSwellTexture = null;
    }
    if (this.slopeTexture) {
      this.slopeTexture.dispose();
      this.slopeTexture = null;
    }
    if (this.waterRippleTexture) {
      this.waterRippleTexture.dispose();
      this.waterRippleTexture = null;
    }
    if (this.causticTarget) {
      this.causticTarget.dispose();
      this.causticTarget = null;
    }
    if (this.causticGeo) {
      this.causticGeo.dispose();
      this.causticGeo = null;
    }
    if (this.causticMat) {
      this.causticMat.dispose();
      this.causticMat = null;
    }

    if (this.activeWaterRipples) {
      for (const r of this.activeWaterRipples) {
        if (this.parentGroup && r.mesh) this.parentGroup.remove(r.mesh);
        r.mesh?.geometry?.dispose();
        r.mesh?.material?.dispose();
      }
      this.activeWaterRipples = [];
    }

    this.basePositions = null;
    this.waterSwell = null;
    this.waterRipples = null;
  }
}
