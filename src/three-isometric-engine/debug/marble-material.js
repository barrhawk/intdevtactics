//NOTE(@jimmylee)
//The two marbles of the ThreeJS demos. No marble is a `map`: in the demos and their tests a mesh with a
//map is a sprite plane.
//
//White marble, for the ledges: one tileable texture baked on the GPU from seeded noise, once per stage.
//The noise is too much work for the main thread at this size. The veins are sheets running through the
//stone: each block reads the texture from its world position along one slanted axis (vertex shader), so
//a vein that leaves the top of a block carries on down its side, with no seam at any edge and no UV work
//per block.
//
//Black marble, for the thrown orbs: public/static/textures/marble-black.gif. The stage's caller loads
//it, like the sprite sheet.

import * as THREE from 'three';
import { cubeSize, sphereRadius } from '@engine/constants';

const MARBLE_SIZE = 2048;
const MARBLE_TILE_WORLD = 5 * cubeSize;
const MARBLE_SEED = 20261101;
const ORB_TILE_WORLD = 3 * sphereRadius;

//NOTE(@jimmylee)
//Lattice cells across one tile. Every octave doubles this, so each stays periodic. The octaves past the
//fourth only add detail: the veins keep their course.
const TURBULENCE_CELLS = 4;
const TURBULENCE_OCTAVES = 6;

function createHashTexture(seed) {
  const table = new Uint8Array(512);
  for (let i = 0; i < 256; i++) table[i] = i;
  let state = seed >>> 0;
  for (let i = 255; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const k = Math.floor((state / 0x100000000) * (i + 1));
    const swap = table[i];
    table[i] = table[k];
    table[k] = swap;
  }
  for (let i = 0; i < 256; i++) table[i + 256] = table[i];
  const texture = new THREE.DataTexture(table, 512, 1, THREE.RedFormat, THREE.UnsignedByteType);
  texture.needsUpdate = true;
  return texture;
}

const BAKE_VERTEX_SHADER = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

//NOTE(@jimmylee)
//RGBA of one tile. Gradient noise, periodic in `period` lattice cells, roughly in -0.7..0.7. A vein is a
//zero of a sine band across the tile: |sin| repeats every half wave, so a whole number of half waves per
//tile keeps it periodic. Turbulence bends it into a long drifting line, and the mask lets it swell, thin
//out and disappear as veins do in real stone. Fine threads cross the bands at another angle.
//
//The colors are mixed in sRGB and written as linear, which the sRGB target encodes back.
const BAKE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D hashTable;

  const vec2 GRADIENTS[8] = vec2[8](vec2(1.0, 0.0), vec2(-1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, -1.0), vec2(0.7071, 0.7071), vec2(-0.7071, 0.7071), vec2(0.7071, -0.7071), vec2(-0.7071, -0.7071));
  const vec3 STONE = vec3(245.0, 242.0, 237.0) / 255.0;
  const vec3 CLOUD = vec3(221.0, 220.0, 219.0) / 255.0;
  const vec3 VEIN = vec3(86.0, 92.0, 102.0) / 255.0;
  const vec3 VEIN_HALO = vec3(176.0, 170.0, 160.0) / 255.0;
  const float TAU = 6.283185307179586;

  int hash(int index) {
    return int(texelFetch(hashTable, ivec2(index, 0), 0).r * 255.0 + 0.5);
  }

  vec2 gradient(int x, int y) {
    return GRADIENTS[hash(hash(x) + y) & 7];
  }

  float noise(vec2 point, int period) {
    vec2 cell = floor(point);
    vec2 f = point - cell;
    vec2 fade = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
    ivec2 low = ivec2(cell) % period;
    ivec2 high = (low + 1) % period;
    float bottom = mix(dot(gradient(low.x, low.y), f), dot(gradient(high.x, low.y), f - vec2(1.0, 0.0)), fade.x);
    float top = mix(dot(gradient(low.x, high.y), f - vec2(0.0, 1.0)), dot(gradient(high.x, high.y), f - vec2(1.0, 1.0)), fade.x);
    return mix(bottom, top, fade.y);
  }

  float fbm(vec2 point, int octaves) {
    float total = 0.0;
    float amplitude = 1.0;
    int scale = 1;
    for (int i = 0; i < octaves; i++) {
      total += amplitude * noise(point * float(scale), TURBULENCE_CELLS * scale);
      amplitude *= 0.5;
      scale *= 2;
    }
    return total;
  }

  vec3 toLinear(vec3 encoded) {
    return mix(encoded / 12.92, pow((encoded + 0.055) / 1.055, vec3(2.4)), step(0.04045, encoded));
  }

  void main() {
    vec2 uv = floor(gl_FragCoord.xy) / MARBLE_SIZE;
    vec2 point = (uv + 1.0) * float(TURBULENCE_CELLS);
    float turbulence = fbm(point, TURBULENCE_OCTAVES);
    float drift = fbm(point + vec2(1.5, 2.5), 2);
    float mask = smoothstep(-0.3, 0.25, drift);

    float band = abs(sin(TAU * (uv.x + 2.0 * uv.y) * 0.5 + turbulence * 1.5 + drift * 1.1));
    float crossing = abs(sin(TAU * (2.0 * uv.x + 3.0 * uv.y) + turbulence * 2.6 - drift * 1.8));
    float vein = (1.0 - smoothstep(0.004, 0.012 + 0.09 * mask * mask, band)) * (0.15 + 0.85 * mask);
    float thread = (1.0 - smoothstep(0.0, 0.02, crossing)) * 0.34 * (0.3 + 0.7 * mask);
    float halo = exp(-band * 4.5) * (0.15 + 0.75 * mask);
    float cloud = smoothstep(-0.35, 0.35, drift - turbulence * 0.4);

    vec3 color = mix(STONE, CLOUD, cloud * 0.6);
    color = mix(color, VEIN_HALO, halo * 0.6);
    gl_FragColor = vec4(toLinear(mix(color, VEIN, max(vein, thread))), 1.0);
  }
`;

//NOTE(@jimmylee)
//One render of the tile into a mipmapped sRGB target. A restored WebGL context comes back with the
//target empty, so `bake` runs again then. The stage owns the result.
export function createMarbleBake(renderer) {
  const target = new THREE.WebGLRenderTarget(MARBLE_SIZE, MARBLE_SIZE, { colorSpace: THREE.SRGBColorSpace, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, anisotropy: 8 });
  target.texture.wrapS = THREE.RepeatWrapping;
  target.texture.wrapT = THREE.RepeatWrapping;

  const hashTexture = createHashTexture(MARBLE_SEED);
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    defines: { MARBLE_SIZE: `${MARBLE_SIZE}.0`, TURBULENCE_CELLS, TURBULENCE_OCTAVES },
    uniforms: { hashTable: { value: hashTexture } },
    vertexShader: BAKE_VERTEX_SHADER,
    fragmentShader: BAKE_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(geometry, material);
  quad.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(quad);
  const camera = new THREE.Camera();

  return {
    texture: target.texture,
    bake() {
      const previous = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
      renderer.setRenderTarget(previous);
    },
    dispose() {
      target.dispose();
      hashTexture.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

const VERTEX_SHADER = /* glsl */ `
  uniform float tileWorld;
  varying vec2 vStone;
  varying float vLight;

  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 faceNormal = normalize(mat3(modelMatrix) * normal);
    vStone = (world.xz - world.y) / tileWorld;
    vLight = mix(0.58, 1.0, clamp(dot(faceNormal, vec3(0.42, 1.0, 0.62)), 0.0, 1.0));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D stone;
  varying vec2 vStone;
  varying float vLight;

  void main() {
    gl_FragColor = vec4(texture2D(stone, vStone).rgb * vLight, 1.0);
    #include <colorspace_fragment>
  }
`;

//NOTE(@jimmylee)
//`parameters` are ordinary material settings, and the stage sets `stone` from its bake. Lit from one
//fixed direction, so a block shows a bright top and two different sides at every camera step, whatever
//lights its scene has.
export function createMarbleMaterial(parameters = {}) {
  return new THREE.ShaderMaterial({
    ...parameters,
    uniforms: { stone: { value: null }, tileWorld: { value: MARBLE_TILE_WORLD } },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
  });
}

const ORB_VERTEX_SHADER = /* glsl */ `
  uniform float tileWorld;
  varying vec3 vStone;
  varying vec3 vFacing;
  varying vec3 vNormal;

  void main() {
    vStone = position / tileWorld;
    vFacing = normal;
    vNormal = mat3(modelMatrix) * normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ORB_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D stone;
  uniform float opacity;
  varying vec3 vStone;
  varying vec3 vFacing;
  varying vec3 vNormal;

  void main() {
    vec3 facing = abs(normalize(vFacing));
    vec3 weight = facing * facing * facing * facing;
    weight /= weight.x + weight.y + weight.z;
    vec3 rock = texture2D(stone, vStone.zy).rgb * weight.x + texture2D(stone, vStone.xz).rgb * weight.y + texture2D(stone, vStone.xy).rgb * weight.z;

    vec3 surface = normalize(vNormal);
    vec3 toLight = normalize(vec3(0.42, 1.0, 0.62));
    vec3 toCamera = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
    float light = mix(0.58, 1.0, clamp(dot(surface, toLight), 0.0, 1.0));
    float gloss = pow(max(dot(surface, normalize(toLight + toCamera)), 0.0), 40.0) * 0.35;

    gl_FragColor = vec4(rock * light + gloss, opacity);
    #include <colorspace_fragment>
  }
`;

//NOTE(@jimmylee)
//Settings of the loaded black marble image, once per stage.
export function prepareBlackMarbleTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
}

//NOTE(@jimmylee)
//One per orb, because each fades on its own (uniforms.opacity). The texture is read from the orb's own
//position along its three axes, so the polish has no pole or seam, a roll turns the veins with the orb,
//and the small stone shows the same grain as the big one. Lit like the blocks, with a polished highlight.
export function createBlackMarbleMaterial(texture) {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { stone: { value: texture }, tileWorld: { value: ORB_TILE_WORLD }, opacity: { value: 1 } },
    vertexShader: ORB_VERTEX_SHADER,
    fragmentShader: ORB_FRAGMENT_SHADER,
  });
}
