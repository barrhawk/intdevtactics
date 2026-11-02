//NOTE(@jimmylee)
//The water of the ThreeJS demos on the GPU, on a low polygon sheet that fills a demo view: the swell and
//sun of the ocean under the offshore platform in www-prototypes (world-meshes/create-ocean-material.ts),
//shaded as clear shallows. Each pixel looks down through the surface along its refracted ray to a pale
//seabed, lit by caustics refracted through that same swell and tinted by how far the ray went through the
//water, with Fresnel sky and a clean sun glint on top. Foam is one sheet of lace, shown as far as the
//water holds foam: the waterline a body stamps into the ripples, the wake a fast wave leaves, whitecaps and
//the contour of a fixed post, which is a box in the shader.
//
//One swell (debug/water-simulation.js) runs per stage, and every scene reads it from its own offset, so
//no two scenes show the same waves. Each scene has its own ripples, stepped only while it is drawn, and
//the only thing that makes them is a body in the water (physics/sprite-body.js): where the surface
//crosses it, what it displaces and how that changes. The surface stays still everywhere else.
//
//A sprite is submerged by depth, not by touching its material: the sheet is opaque, so it draws before
//every sprite layer and writes depth, and whatever sits below the surface fails the depth test, overlay
//planes included. The waterline therefore follows the waves across a sprite to the pixel. Nothing here is a
//`map`: in the demos and their tests a mesh with a map is a sprite plane.

import * as THREE from 'three';
import { createWaterRipples, createWaterSwell, sampleWaterField } from '@engine/debug/water-simulation';
import { BODY_PX_ACROSS, BODY_PX_UP, placeBody } from '@engine/physics/sprite-body';

const SWELL_SIZE = 64;
const SWELL_DOMAIN = 128;
const SHEET_SPAN = 1600;
const SHEET_SEGMENTS = 48;
const SHEET_CENTER_DENSITY = 0.09;
const RIPPLE_SIZE = 96;
const RIPPLE_SPONGE_CELLS = 12;
const RIPPLE_STEP_MS = 1000 / 60;
const RIPPLE_MAX_STEPS = 2;
const RIPPLE_PROPAGATION = 0.3;
const RIPPLE_DAMPING = 0.985;
//NOTE(@jimmylee)
//How much of a displaced column lifts the surface around it, and the most one frame can lift it.
const RIPPLE_LIFT = 0.8;
const RIPPLE_MAX_LIFT = 0.35;
//NOTE(@jimmylee)
//Longer than this between drawn frames and the bodies have moved unseen: the ripples pick them up where
//they are, with no waves for the jump. A demo frame is capped at 100ms.
const RIPPLE_RESYNC_MS = 250;
export const MAX_WATER_POSTS = 2;

const WIND_X = 1;
const WIND_Z = 0.55;
const SWELL_SPEC = { size: SWELL_SIZE, domain: SWELL_DOMAIN, windX: WIND_X, windZ: WIND_Z, windSpeed: 24, gravity: 9.81, smallWave: 1.2, choppiness: 0.8, targetHeight: 0.7, repeatPeriod: 200, foamThreshold: 0.9, foamStrength: 5, seed: 1337 };

const SUN_DIRECTION = new THREE.Vector3(-0.5, 0.62, 0.42).normalize();
const SUN_COLOR = 0xfff4dc;
const SEABED_COLOR = 0xfbf6e8;
const SKY_HORIZON_COLOR = 0xe6f6fb;
const SKY_ZENITH_COLOR = 0x9fd8f2;
const FOAM_COLOR = 0xffffff;
const FOAM_SHADE_COLOR = 0xc4e4ee;
//NOTE(@jimmylee)
//What the marble of a post looks like under the water.
const POST_COLOR = 0xffffff;

//NOTE(@jimmylee)
//Caustics are sunlight, not a pattern. A grid over one swell tile is refracted through the surface onto
//the seabed: each vertex moves along the swell's slope, and each triangle is lit by how much the move
//squeezed it, so light gathers under the crests into the bright filaments of a clear shallow, and it moves
//because the swell does. The slopes are read through a cubic filter, or the 64x64 field would show its
//cells as facets. The tile is one channel: the sheet samples it three times, spread by CAUSTIC_SPREAD, for the
//color fringe of real ones. It is 8 bits, so light is stored at a quarter of its strength.
const CAUSTIC_SIZE = 1024;
const CAUSTIC_SEGMENTS = 180;
const CAUSTIC_OVERSCAN = 0.25;
const CAUSTIC_FOCUS = 21;
const CAUSTIC_MOST = 3.2;

const CAUSTIC_VERTEX_SHADER = /* glsl */ `
  uniform sampler2D slope;
  varying vec2 vFrom;
  varying vec2 vTo;

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
    return g0.y * (g0.x * texture2D(slope, h0).rg + g1.x * texture2D(slope, vec2(h1.x, h0.y)).rg) + g1.y * (g0.x * texture2D(slope, vec2(h0.x, h1.y)).rg + g1.x * texture2D(slope, h1).rg);
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
  uniform sampler2D swell;
  uniform sampler2D ripples;
  uniform vec2 swellOffset;
  uniform vec3 rippleWindow;

  varying vec3 vWorld;
  varying vec2 vSwellUv;
  varying vec2 vRippleUv;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vSwellUv = world.xz / SWELL_DOMAIN + swellOffset;
    vRippleUv = (world.xz - rippleWindow.xy) / rippleWindow.z + 0.5;
    vec4 sampled = texture2D(swell, vSwellUv);
    world.xyz += vec3(sampled.g, sampled.r + texture2D(ripples, vRippleUv).r, sampled.b);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform sampler2D swell;
  uniform sampler2D slope;
  uniform sampler2D ripples;
  uniform sampler2D caustics;
  uniform float time;
  uniform int postCount;
  uniform vec4 posts[MAX_WATER_POSTS];
  uniform float postTops[MAX_WATER_POSTS];
  uniform vec3 rippleWindow;
  uniform vec3 sunDirection;
  uniform vec3 sunColor;
  uniform vec3 seabedColor;
  uniform vec3 skyHorizonColor;
  uniform vec3 skyZenithColor;
  uniform vec3 foamColor;
  uniform vec3 foamShadeColor;
  uniform vec3 postColor;

  varying vec3 vWorld;
  varying vec2 vSwellUv;
  varying vec2 vRippleUv;

  const vec2 WIND = normalize(vec2(1.0, 0.55));
  const float SWELL_STRENGTH = 0.55;
  const float RIPPLE_STRENGTH = 1.4;
  const float SHIMMER_STRENGTH = 0.025;
  const float SHIMMER_SCALE = 0.5;
  const float SHIMMER_SPEED = 1.1;
  const float SEABED_DEPTH = 14.0;
  const float DUNE_DEPTH = 5.0;
  const float DUNE_SCALE = 0.021;
  const float REFRACTION = 0.75;
  const vec3 ABSORPTION = vec3(0.058, 0.0115, 0.0072);
  const float CAUSTIC_AMBIENT = 0.82;
  const float CAUSTIC_LIGHT = 0.2;
  const float CAUSTIC_SPREAD = 0.0011;
  const float BODY_SHADE = 0.26;
  const float BODY_SHADE_REACH = 6.0;
  const float SHININESS = 1400.0;
  const float SHEEN_SHININESS = 90.0;
  const float POST_SHADOW = 0.34;
  const float POST_SHADOW_SOFT = 1.6;
  const float POST_CONTACT = 0.16;
  const float POST_CONTACT_REACH = 2.5;
  const float POST_SUN_LEAN = 0.75;
  const float POST_SUBMERGED_LIGHT = 0.86;
  const vec3 POST_LIGHT = normalize(vec3(0.42, 1.0, 0.62));
  const int POST_SHADOW_SAMPLES = 5;
  const float FOAM_LACE_SCALE = 0.62;
  const float FOAM_DRIFT = 0.55;
  const float FOAM_POST_REACH = 5.0;
  const float FOAM_LAP = 4.6;

  float hash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  }

  float softNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 f = point - cell;
    vec2 s = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), s.x), mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), s.x), s.y);
  }

  //NOTE(@jimmylee)
  //The strands of a sheet of foam, 1 on a strand: the creases of smooth noise, warped by more of it, so they
  //run and join like froth and never close into cells.
  float lace(vec2 point) {
    vec2 drift = WIND * time * FOAM_DRIFT;
    vec2 warp = vec2(softNoise(point * 0.5 + drift * 0.3), softNoise(point * 0.5 - drift * 0.3 + 19.0)) * 2.6;
    float broad = 1.0 - abs(2.0 * softNoise(point + warp + drift) - 1.0);
    float fine = 1.0 - abs(2.0 * softNoise(point * 2.3 - warp - drift * 1.4 + 7.0) - 1.0);
    return broad * broad * (0.62 + 0.38 * fine);
  }

  //NOTE(@jimmylee)
  //Fine sine ripples on the surface, as a slope. Sines stay smooth where noise would speckle clear water.
  vec2 shimmer(vec2 point) {
    vec2 a = point * SHIMMER_SCALE + WIND * time * SHIMMER_SPEED;
    vec2 b = vec2(-point.y, point.x) * SHIMMER_SCALE * 1.7 - WIND.yx * time * SHIMMER_SPEED * 1.4;
    return vec2(cos(a.x + 0.6 * a.y) + 0.6 * cos(b.x - 0.4 * b.y), cos(a.y - 0.6 * a.x) + 0.6 * cos(b.y + 0.4 * b.x)) * SHIMMER_STRENGTH;
  }

  float boxDistance(vec2 point, vec4 box) {
    vec2 outside = abs(point - box.xy) - box.zw;
    return length(max(outside, 0.0)) + min(max(outside.x, outside.y), 0.0);
  }

  //NOTE(@jimmylee)
  //Signed distance from a point to the nearest post's footprint, in world units: a box, negative inside
  //it. Foam around a post is a contour of this, so it takes the post's corners.
  float postDistance(vec2 point) {
    float nearest = 1000.0;
    for (int i = 0; i < postCount; i++) nearest = min(nearest, boxDistance(point, posts[i]));
    return nearest;
  }

  //NOTE(@jimmylee)
  //A post goes down to the seabed, so the ray through a pixel can meet it before the bed does. How far
  //along the ray it first reaches a post, 0 to 1, or 2 for none: the ray crosses the ground from a point
  //along a line, falling a height, and a post whose top is under the surface starts that far below it.
  //The last argument is the outward normal of what it reached.
  float postHit(vec2 from, vec2 along, float drop, out vec3 face) {
    float first = 2.0;
    face = vec3(0.0, 1.0, 0.0);
    vec2 safe = mix(along, vec2(1e-5), step(abs(along), vec2(1e-5)));
    for (int i = 0; i < postCount; i++) {
      float start = clamp((vWorld.y - postTops[i]) / max(drop, 1e-3), 0.0, 1.0);
      vec2 near = (posts[i].xy - sign(safe) * posts[i].zw - from) / safe;
      vec2 far = (posts[i].xy + sign(safe) * posts[i].zw - from) / safe;
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

  //NOTE(@jimmylee)
  //How much of the sun a post takes from a point on the seabed: the post stands from the bed up through the
  //surface, so its shadow is its footprint swept along the sun, as far as the sun's ray runs under water.
  //Sampled, because a post is much wider than the sweep.
  float postShadow(vec2 point, float deep) {
    vec2 sweep = sunDirection.xz / sunDirection.y * deep * POST_SUN_LEAN;
    float nearest = 1000.0;
    for (int i = 0; i < postCount; i++) {
      for (int k = 0; k < POST_SHADOW_SAMPLES; k++) {
        float s = float(k) / float(POST_SHADOW_SAMPLES - 1);
        nearest = min(nearest, boxDistance(point + sweep * s, posts[i]));
      }
    }
    return 1.0 - smoothstep(-POST_SHADOW_SOFT, POST_SHADOW_SOFT, nearest);
  }

  vec3 toSRGB(vec3 color) {
    vec3 clamped = max(color, vec3(0.0));
    return mix(1.055 * pow(clamped, vec3(1.0 / 2.4)) - 0.055, clamped * 12.92, step(clamped, vec3(0.0031308)));
  }

  void main() {
    vec4 swellData = texture2D(swell, vSwellUv);
    vec4 rippleData = texture2D(ripples, vRippleUv);
    vec2 surfaceSlope = texture2D(slope, vSwellUv).rg * SWELL_STRENGTH + rippleData.gb * RIPPLE_STRENGTH + shimmer(vWorld.xz);
    vec3 normal = normalize(vec3(-surfaceSlope.x, 1.0, -surfaceSlope.y));

    vec3 view = normalize(cameraPosition - vWorld);
    float viewDotNormal = max(dot(normal, view), 0.0);
    float fresnel = 0.02 + 0.98 * pow(1.0 - viewDotNormal, 5.0);

    //NOTE(@jimmylee)
    //The seabed rolls in long low dunes, so the water deepens and shallows across a view. The refracted ray
    //meets it, and light there is the caustic tile, read in the swell's own frame with a fringe of color.
    float height = swellData.r + rippleData.r;
    vec3 ray = refract(-view, normal, REFRACTION);
    float depth = SEABED_DEPTH + DUNE_DEPTH * (sin(vWorld.x * DUNE_SCALE + 1.1) * sin(vWorld.z * DUNE_SCALE * 1.3 - 0.4) + 0.4 * sin((vWorld.x + vWorld.z) * DUNE_SCALE * 2.1));
    float path = (depth + height) / max(-ray.y, 0.2);
    vec2 bed = vWorld.xz + ray.xz * path;

    vec2 bedSwell = vSwellUv + (bed - vWorld.xz) / SWELL_DOMAIN;
    vec2 fringe = vec2(CAUSTIC_SPREAD, -CAUSTIC_SPREAD * 0.6);
    vec3 focused = vec3(texture2D(caustics, bedSwell - fringe).r, texture2D(caustics, bedSwell).r, texture2D(caustics, bedSwell + fringe).r) * 4.0;
    vec3 seabed = seabedColor * (CAUSTIC_AMBIENT + CAUSTIC_LIGHT * focused * sqrt(focused));

    //NOTE(@jimmylee)
    //What stands in the water shades the bed under it, thrown along the sun.
    vec2 bedRipple = vRippleUv + (bed - vWorld.xz + sunDirection.xz * BODY_SHADE_REACH) / rippleWindow.z;
    seabed *= 1.0 - BODY_SHADE * texture2D(ripples, bedRipple).a;

    //NOTE(@jimmylee)
    //A post stands in the water like any other wall: the ray meets its side or its sunken top on the way down,
    //lit as the blocks are, and the bed behind it lies in its shadow, thrown along the sun.
    float through = path;
    if (postCount > 0) {
      vec3 face;
      float hit = postHit(vWorld.xz, bed - vWorld.xz, depth + height, face);
      if (hit <= 1.0) {
        through = path * hit;
        seabed = postColor * POST_SUBMERGED_LIGHT * mix(0.58, 1.0, clamp(dot(face, POST_LIGHT), 0.0, 1.0));
      } else {
        seabed *= 1.0 - POST_SHADOW * postShadow(bed, depth);
        seabed *= 1.0 - POST_CONTACT * exp(-max(postDistance(bed), 0.0) / POST_CONTACT_REACH);
      }
    }

    vec3 color = seabed * exp(-ABSORPTION * through);

    vec3 reflected = reflect(-view, normal);
    color = mix(color, mix(skyHorizonColor, skyZenithColor, clamp(reflected.y, 0.0, 1.0)), fresnel);
    vec3 halfway = normalize(sunDirection + view);
    float toSun = max(dot(normal, halfway), 0.0);
    color += sunColor * (pow(toSun, SHININESS) * 0.8 + pow(toSun, SHEEN_SHININESS) * 0.05);

    //NOTE(@jimmylee)
    //All foam is one material, a sheet of lace, and how much of the sheet shows is how much foam a pixel has.
    //The waterline and a wake come from the ripples, whitecaps from the swell's own, and around a post it
    //is a contour of the distance to its wall that laps out and back with the swell.
    float surge = 0.5 + 0.5 * clamp(height, -1.0, 1.0);
    float coverage = max(smoothstep(0.02, 0.6, rippleData.a), smoothstep(0.7, 1.0, swellData.a) * 0.3);
    if (postCount > 0) {
      float post = postDistance(vWorld.xz);
      float lap = FOAM_LAP * (0.55 + 0.9 * surge);
      coverage = max(coverage, exp(-max(post, 0.0) / FOAM_POST_REACH));
      coverage = max(coverage, (1.0 - smoothstep(0.0, 1.6, abs(post - lap))) * 0.62);
    }
    if (coverage > 0.004) {
      float strands = lace(vWorld.xz * FOAM_LACE_SCALE);
      float edge = max(fwidth(strands), 0.05);
      float threshold = 1.0 - 0.86 * coverage;
      float foam = smoothstep(threshold - edge, threshold + edge, strands) * smoothstep(0.14, 0.32, coverage);
      float thick = smoothstep(0.45, 1.0, coverage);
      color *= 1.0 - 0.1 * coverage;
      color = mix(color, mix(foamShadeColor, foamColor, 0.45 + 0.55 * max(thick, strands)), foam * (0.72 + 0.28 * thick));
    }
    gl_FragColor = vec4(toSRGB(color), 1.0);
  }
`;

function fieldTexture(data, size, wrap) {
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  texture.wrapS = wrap;
  texture.wrapT = wrap;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

//NOTE(@jimmylee)
//One flat grid, reused by every scene: its lines crowd the origin, where the units stand and the waves
//have to reach the waterline, and spread out to an edge no view reaches at any elevation.
function createSheetGeometry() {
  const geometry = new THREE.PlaneGeometry(SHEET_SPAN, SHEET_SPAN, SHEET_SEGMENTS, SHEET_SEGMENTS);
  geometry.rotateX(-Math.PI / 2);
  const half = SHEET_SPAN / 2;
  const spread = (value) => {
    const s = value / half;
    return value * (SHEET_CENTER_DENSITY + (1 - SHEET_CENTER_DENSITY) * s * s * s * s);
  };
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setXYZ(i, spread(positions.getX(i)), 0, spread(positions.getZ(i)));
  geometry.userData.shared = true;
  return geometry;
}

//NOTE(@jimmylee)
//The refracted grid and its tile. The grid runs past the tile on every side, because a slope can carry a
//vertex in over the edge, and the slopes wrap, so the tile wraps too.
function createCausticPass(slopeTexture) {
  const target = new THREE.WebGLRenderTarget(CAUSTIC_SIZE, CAUSTIC_SIZE, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true, depthBuffer: false });
  const span = 1 + 2 * CAUSTIC_OVERSCAN;
  const geometry = new THREE.PlaneGeometry(span, span, CAUSTIC_SEGMENTS, CAUSTIC_SEGMENTS);
  const uv = geometry.attributes.uv;
  const position = geometry.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, position.getX(i) + 0.5, position.getY(i) + 0.5);
  const material = new THREE.ShaderMaterial({
    defines: { SWELL_SIZE: SWELL_SIZE.toFixed(1), SWELL_DOMAIN: SWELL_DOMAIN.toFixed(1), CAUSTIC_FOCUS: CAUSTIC_FOCUS.toFixed(1), CAUSTIC_MOST: CAUSTIC_MOST.toFixed(1) },
    uniforms: { slope: { value: slopeTexture } },
    vertexShader: CAUSTIC_VERTEX_SHADER,
    fragmentShader: CAUSTIC_FRAGMENT_SHADER,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  const camera = new THREE.Camera();
  const pass = {
    target,
    stale: true,
    draw(renderer) {
      if (!pass.stale) return;
      pass.stale = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(scene, camera);
      renderer.setRenderTarget(null);
    },
    dispose() {
      target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
  return pass;
}

//NOTE(@jimmylee)
//What every scene's water shares: the swell, its two textures and the low polygon sheet. Created the
//first time a stage turns the water on.
export function createWaterResources() {
  const swell = createWaterSwell(SWELL_SPEC);
  swell.update(0);
  const swellTexture = fieldTexture(swell.heightDisplacement, SWELL_SIZE, THREE.RepeatWrapping);
  const slopeTexture = fieldTexture(swell.slope, SWELL_SIZE, THREE.RepeatWrapping);
  const geometry = createSheetGeometry();
  const caustics = createCausticPass(slopeTexture);
  const uniforms = {
    swell: { value: swellTexture },
    slope: { value: slopeTexture },
    caustics: { value: caustics.target.texture },
    time: { value: 0 },
    sunDirection: { value: SUN_DIRECTION },
    sunColor: { value: new THREE.Color(SUN_COLOR) },
    seabedColor: { value: new THREE.Color(SEABED_COLOR) },
    skyHorizonColor: { value: new THREE.Color(SKY_HORIZON_COLOR) },
    skyZenithColor: { value: new THREE.Color(SKY_ZENITH_COLOR) },
    foamColor: { value: new THREE.Color(FOAM_COLOR) },
    foamShadeColor: { value: new THREE.Color(FOAM_SHADE_COLOR) },
    postColor: { value: new THREE.Color(POST_COLOR) },
  };
  return {
    swell,
    geometry,
    uniforms,
    //NOTE(@jimmylee)
    //Seconds of demo clock: the water pauses, steps and slows with the sprites.
    update(seconds) {
      if (uniforms.time.value === seconds) return;
      swell.update(seconds);
      swellTexture.needsUpdate = true;
      slopeTexture.needsUpdate = true;
      uniforms.time.value = seconds;
      caustics.stale = true;
    },
    //NOTE(@jimmylee)
    //Once per frame, before any scene draws. Renders only when the swell has moved.
    drawCaustics(renderer) {
      caustics.draw(renderer);
    },
    //NOTE(@jimmylee)
    //A lost WebGL context took the tile with it.
    restore() {
      caustics.stale = true;
    },
    dispose() {
      swellTexture.dispose();
      slopeTexture.dispose();
      geometry.dispose();
      caustics.dispose();
    },
  };
}

//NOTE(@jimmylee)
//One scene's water. `index` picks where the scene reads the swell. `bodies` are what can touch the
//surface: each { root } is a unit and each { object, radius } a thrown prop. `posts` are the fixed bodies,
//{ x, z, halfX, halfZ, top } boxes, a footprint and the height of its top. `window` is the part of the scene the ripples cover, { x, z, domain }:
//the sheet shows none outside it. `shapes` is the sheet's bodies (createSheetBodies).
export function createStationWater(water, shapes, scene, index, bodies, posts, window) {
  const ripples = createWaterRipples({ size: RIPPLE_SIZE, domain: window.domain, propagation: RIPPLE_PROPAGATION, damping: RIPPLE_DAMPING, sponge: RIPPLE_SPONGE_CELLS });
  const rippleTexture = fieldTexture(ripples.field, RIPPLE_SIZE, THREE.ClampToEdgeWrapping);
  const swellOffset = new THREE.Vector2((index * 0.6180339887) % 1, (index * 0.7548776662) % 1);
  const rippleWindow = new THREE.Vector3(window.x, window.z, window.domain);
  const postBoxes = [];
  const postTops = [];
  for (let i = 0; i < MAX_WATER_POSTS; i++) {
    const post = posts[i];
    postBoxes.push(post ? new THREE.Vector4(post.x, post.z, post.halfX, post.halfZ) : new THREE.Vector4());
    postTops.push(post ? post.top : 0);
  }
  const material = new THREE.ShaderMaterial({
    defines: { SWELL_DOMAIN: SWELL_DOMAIN.toFixed(1), MAX_WATER_POSTS },
    uniforms: { ...water.uniforms, ripples: { value: rippleTexture }, swellOffset: { value: swellOffset }, rippleWindow: { value: rippleWindow }, postCount: { value: Math.min(posts.length, MAX_WATER_POSTS) }, posts: { value: postBoxes }, postTops: { value: postTops } },
    vertexShader: WATER_VERTEX_SHADER,
    fragmentShader: WATER_FRAGMENT_SHADER,
  });
  const mesh = new THREE.Mesh(water.geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  const tracked = bodies.map((body) => ({ ...body, place: { shp: 0, shape: null, x: 0, y: 0, z: 0, fx: 0, fz: 0 }, cut: Infinity, under: 0 }));
  const swellField = water.swell.heightDisplacement;
  const swellU = (x) => x / SWELL_DOMAIN + swellOffset.x;
  const swellV = (z) => z / SWELL_DOMAIN + swellOffset.y;
  const pitch = ripples.cellSize;
  let lastNow = -1;
  let pendingMs = 0;
  let recording = true;

  //NOTE(@jimmylee)
  //A unit against the surface at this height: `cut` is the sprite row the surface crosses at its stance
  //point, and `under` how much of its volume is below it. With `stamp` set, every pixel below the surface
  //goes into the ripples as a bar across the unit, and the row at the surface is the waterline.
  function measureUnit(body, surface, stamp) {
    const { shape, x, y, z, fx, fz } = body.place;
    body.cut = (y - surface) / BODY_PX_UP;
    let under = 0;
    const { pixels, count } = shape;
    for (let i = 0; i < count; i++) {
      const v = pixels[i * 3 + 1];
      const wet = v + 0.5 - body.cut;
      if (wet <= 0) break;
      const half = pixels[i * 3 + 2] * BODY_PX_ACROSS;
      const depth = Math.min(1, wet) * BODY_PX_UP;
      under += 2 * half * BODY_PX_ACROSS * depth;
      if (!stamp) continue;
      const forward = -pixels[i * 3] * BODY_PX_ACROSS;
      const centerX = x + fx * forward - window.x;
      const centerZ = z + fz * forward - window.z;
      const bars = Math.max(1, Math.ceil((2 * half) / pitch));
      const area = (2 * half * BODY_PX_ACROSS) / bars;
      for (let k = 0; k < bars; k++) {
        const across = half * (((k + 0.5) * 2) / bars - 1);
        ripples.displace(centerX - fz * across, centerZ + fx * across, area * depth);
        if (wet <= 1) ripples.cover(centerX - fz * across, centerZ + fx * across, area);
      }
    }
    body.under = shape.volume > 0 ? under / shape.volume : 0;
  }

  //NOTE(@jimmylee)
  //A thrown prop is a real object in the drawn world, not a leaning plane, so it meets the sheet where
  //the sheet is drawn. The ripples sit on the plane's waterline, `shiftX` and `shiftZ` from the ground
  //point under it, so a prop stamps that far back to splash under itself.
  function stampProp({ object, radius }, level, shiftX, shiftZ) {
    const { x, y, z } = object.position;
    if (y - radius >= level) return;
    const reach = Math.ceil(radius / pitch);
    for (let row = -reach; row <= reach; row++) {
      for (let col = -reach; col <= reach; col++) {
        const dx = col * pitch;
        const dz = row * pitch;
        const left = radius * radius - dx * dx - dz * dz;
        if (left <= 0) continue;
        const half = Math.sqrt(left);
        const top = Math.min(y + half, level);
        if (top <= y - half) continue;
        ripples.displace(x + dx - shiftX - window.x, z + dz - shiftZ - window.z, (top - (y - half)) * pitch * pitch);
        if (y + half > level) ripples.cover(x + dx - shiftX - window.x, z + dz - shiftZ - window.z, pitch * pitch);
      }
    }
  }

  //NOTE(@jimmylee)
  //A fixed post is a real object too, so it also stamps back by the slide. Its cells hold no waves, and it
  //moves nothing, so it makes none.
  function stampPost({ x, z, halfX, halfZ }, shiftX, shiftZ) {
    const area = pitch * pitch;
    for (let px = x - halfX + pitch / 2; px < x + halfX; px += pitch) {
      for (let pz = z - halfZ + pitch / 2; pz < z + halfZ; pz += pitch) ripples.wall(px - shiftX - window.x, pz - shiftZ - window.z, area);
    }
  }

  //NOTE(@jimmylee)
  //One drawn frame. `level` is the height the sheet is drawn at, and `bodyLevel` the surface a body is
  //measured against, which no camera moves (a stance point sits as far above it at every elevation).
  //`shiftX` and `shiftZ` are the ground offset of the point a billboard crosses the sheet, which is
  //where the ripples have to sit to ring the sprite.
  function update(now, level, bodyLevel, shiftX, shiftZ) {
    mesh.position.y = level;
    rippleWindow.set(window.x + shiftX, window.z + shiftZ, window.domain);
    if (lastNow >= 0 && now - lastNow > RIPPLE_RESYNC_MS) recording = true;
    pendingMs = lastNow < 0 ? 0 : Math.min(pendingMs + now - lastNow, RIPPLE_MAX_STEPS * RIPPLE_STEP_MS);
    lastNow = now;

    const steps = Math.floor(pendingMs / RIPPLE_STEP_MS);
    for (let i = 0; i < tracked.length; i++) {
      const body = tracked[i];
      if (body.root) {
        placeBody(body.root, now, shapes, body.place);
        const present = body.root.visible;
        body.under = 0;
        body.cut = Infinity;
        if (present) measureUnit(body, bodyLevel + sampleWaterField(swellField, water.swell.size, swellU(body.place.x), swellV(body.place.z), 0), steps > 0);
      } else if (steps > 0 && body.object.visible) {
        stampProp(body, level, shiftX, shiftZ);
      }
    }
    if (steps === 0) return;

    for (let i = 0; i < posts.length; i++) stampPost(posts[i], shiftX, shiftZ);
    ripples.settle(recording ? 0 : RIPPLE_LIFT, RIPPLE_MAX_LIFT);
    recording = false;
    if (ripples.isAwake()) {
      for (let i = 0; i < steps; i++) ripples.step();
      rippleTexture.needsUpdate = true;
    }
    pendingMs -= steps * RIPPLE_STEP_MS;
  }

  return {
    mesh,
    ripples,
    tracked,
    window,
    update,
    //NOTE(@jimmylee)
    //A still surface, for Repeat, which starts every card's action over.
    clear() {
      ripples.clear();
      rippleTexture.needsUpdate = true;
      recording = true;
    },
    dispose() {
      rippleTexture.dispose();
    },
  };
}
