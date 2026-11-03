// NOTE(@jimmylee, @antigravity)
// GPU-Baked Procedural Item Finishes (PLATE / BACK / PAGES), PMREM Iridescent Mythril,
// and Fusilier Volumetric Light-Streak Cone.
//
// 1. Two-Sided Item Finishes:
// A shield or tome is a flat 3D object viewed from both sides. One metal on both
// reads as thin foil. The front is worked plate (raised rim, rivets, lozenge boss,
// hammered field, mythril inlay lines), while the reverse is dark wooden boards
// with riveted iron straps (shield) or ruled parchment columns across a book gutter (tome).
//
// 2. Iridescent Veined Mythril:
// Procedural 3D warped cosine-frequency mythril veins running through mirror metal,
// producing analytical normal relief through screen-space partial derivatives,
// thin-film physical iridescence, and subtle emissive vein radiance.
//
// 3. Volumetric Rifle Streak:
// 8-sided dual-shell light cone with glowing ruby tip and soft amber halo.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const MAP_SIZE = 2048;
export const PLATE = 0;
export const BACK = 1;
export const PAGES = 2;

export const SHIELD_BACK_COLOR = 0x2b3a4d;
export const PAGE_COLOR = 0xefe8d6;
export const MYTHRIL_INLAY = 0x8fbbe8;
export const CRIMSON_INLAY = 0xef4444;

export const MYTHRIL_ROUGHNESS = 0.16;
export const MYTHRIL_IRIDESCENCE = 0.35;
export const MYTHRIL_VEIN_COLOR = 0x8fbbe8;
export const MYTHRIL_VEIN_STRENGTH = 0.4;
export const MYTHRIL_RELIEF = 0.05;
export const MYTHRIL_VEIN_SCALE = 2.4;
export const MYTHRIL_GLOW = 0.14;
export const ENVIRONMENT_BLUR = 0.03;

export const FLASH_RADIUS = 2.2;
export const FLASH_COLOR = 0xfff0c8;
export const STREAK_SIDES = 8;
export const STREAK_HALO = 3.4;
export const STREAK_LIGHT = [1, 0.97, 0.86];
export const STREAK_GLOW = [1, 0.66, 0.2];
export const STREAK_RED = [1, 0.1, 0.06];

/**
 * Procedural face mapping coordinate frame in Set model units.
 */
export const ITEM_FACES = {
  shield: {
    outside: [1, 0, 0],
    across: [0, 0, 1],
    up: [0, 1, 0],
    center: [0, 0],
    half: [1.276, 2.073],
    inside: BACK,
    insideMetal: 0.25,
  },
  tome: {
    outside: [0, -1, 0],
    across: [1, 0, 0],
    up: [0, 0, 1],
    center: [-0.385, 0],
    half: [1.069, 0.9],
    inside: PAGES,
    insideMetal: 0,
  },
};

const BAKE_VERTEX_SHADER = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const BAKE_FRAGMENT_SHADER = /* glsl */ `
  uniform int tile;
  uniform vec2 half_size;
  uniform float texel;

  float hash(vec2 point) {
    vec3 p = fract(vec3(point.xyx) * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 f = fract(point);
    vec2 fade = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(cell), hash(cell + vec2(1.0, 0.0)), fade.x), mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), fade.x), fade.y);
  }

  float fbm(vec2 point) {
    float total = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i++) {
      total += amplitude * noise(point);
      point = point * 2.03 + 11.7;
      amplitude *= 0.5;
    }
    return total;
  }

  float box(vec2 q, vec2 size, float radius) {
    vec2 d = abs(q) - size + radius;
    return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - radius;
  }

  float dome(vec2 q, float radius) {
    float s = clamp(1.0 - dot(q, q) / (radius * radius), 0.0, 1.0);
    return sqrt(s);
  }

  float rivets(float along, float off, float spacing, float radius) {
    return dome(vec2(mod(along + spacing / 2.0, spacing) - spacing / 2.0, off), radius);
  }

  float hammered(vec2 q, float scale) {
    vec2 point = q * scale;
    vec2 cell = floor(point);
    float nearest = 1.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 other = cell + vec2(float(x), float(y));
        vec2 seed = other + vec2(hash(other), hash(other + 7.0));
        nearest = min(nearest, length(point - seed));
      }
    }
    return nearest;
  }

  float plateRim(vec2 q) {
    return box(q, half_size - 0.02, 0.1);
  }

  float plateLozenge(vec2 q) {
    float size = min(half_size.x * 0.56, half_size.y * 0.5);
    return (abs(q.x) + abs(q.y) * 0.62) - size;
  }

  float plateHeight(vec2 q) {
    float edge = plateRim(q);
    float height = smoothstep(-0.26, -0.2, edge) * 0.8;
    height += (1.0 - smoothstep(0.0, 0.024, abs(edge + 0.32))) * 0.3;
    vec2 inset = half_size - 0.13;
    float rivet = max(rivets(q.y, abs(q.x) - inset.x, 0.46, 0.05), rivets(q.x, abs(q.y) - inset.y, 0.46, 0.05));
    height += rivet * 0.5 * step(edge, -0.02);
    float lozenge = plateLozenge(q);
    float spine = (1.0 - smoothstep(0.0, 0.05, abs(q.x))) * (1.0 - step(-0.28, edge));
    height += spine * 0.45 * step(0.0, lozenge);
    height += (1.0 - smoothstep(-0.05, 0.0, lozenge)) * 0.7;
    height += (1.0 - smoothstep(-0.3, -0.25, lozenge)) * 0.35;
    height += dome(q, 0.2) * 0.75;
    height += (1.0 - smoothstep(0.1, 0.5, hammered(q, 26.0))) * -0.03 * step(0.0, lozenge) * step(edge, -0.34);
    return height;
  }

  float plateLines(vec2 q) {
    float angle = atan(q.x, q.y * 0.7);
    float reach = length(q * vec2(1.0, 0.7));
    float line = abs(sin(angle * 7.0 + sin(reach * 5.0) * 0.9));
    return 1.0 - smoothstep(0.015, 0.05, line);
  }

  vec2 plateSurface(vec2 q) {
    float edge = plateRim(q);
    float lozenge = plateLozenge(q);
    float field = step(0.0, lozenge) * (1.0 - smoothstep(-0.36, -0.33, edge));
    float inlay = (1.0 - smoothstep(-0.34, -0.26, lozenge)) * (1.0 - smoothstep(0.17, 0.2, length(q)));
    float cut = 1.0 - smoothstep(0.0, 0.024, abs(edge + 0.32));
    float tone = 0.5 + inlay * 0.42 + plateLines(q) * field * 0.34 - cut * 0.22;
    tone -= (1.0 - smoothstep(-0.05, 0.0, abs(lozenge))) * 0.26;
    float roughness = mix(0.16, 0.34, field) - inlay * 0.05;
    return vec2(tone, roughness + (fbm(q * 18.0) - 0.45) * 0.1);
  }

  float boardCell(float x) {
    return floor(x / 0.42);
  }

  float backStrap(vec2 q) {
    return min(abs(abs(q.y) - half_size.y * 0.6) - 0.16, 0.0);
  }

  float backPad(vec2 q) {
    return box(q, vec2(half_size.x * 0.46, half_size.y * 0.3), 0.08);
  }

  float backHeight(vec2 q) {
    float gap = abs(fract(q.x / 0.42) - 0.5);
    float height = smoothstep(0.5, 0.45, gap) * 0.4;
    height += fbm(vec2(q.x * 14.0, q.y * 2.2) + boardCell(q.x) * 3.1) * 0.22;
    float strap = 1.0 - smoothstep(0.0, 0.02, abs(abs(q.y) - half_size.y * 0.6) - 0.15);
    height = mix(height, 0.72, strap);
    height += rivets(q.x, abs(q.y) - half_size.y * 0.6, 0.42, 0.055) * 0.32 * strap;
    float pad = backPad(q);
    height = mix(height, 0.82 + dome(q / vec2(half_size.x * 0.5, half_size.y * 0.34), 1.0) * 0.14, 1.0 - smoothstep(-0.03, 0.0, pad));
    return height;
  }

  vec2 backSurface(vec2 q) {
    float gap = abs(fract(q.x / 0.42) - 0.5);
    float grain = fbm(vec2(q.x * 22.0, q.y * 3.0) + boardCell(q.x) * 5.7);
    float tone = mix(0.14, 0.34, grain) * (1.0 - smoothstep(0.455, 0.5, gap) * 0.7) * (0.8 + hash(vec2(boardCell(q.x))) * 0.4);
    float roughness = 0.72;
    float strap = 1.0 - smoothstep(0.0, 0.02, abs(abs(q.y) - half_size.y * 0.6) - 0.15);
    tone = mix(tone, 0.34 + rivets(q.x, abs(q.y) - half_size.y * 0.6, 0.42, 0.055) * 0.34, strap);
    roughness = mix(roughness, 0.42, strap);
    float pad = backPad(q);
    float inPad = 1.0 - smoothstep(-0.03, 0.0, pad);
    tone = mix(tone, 0.2 + (noise(q * 60.0) - 0.5) * 0.05, inPad);
    roughness = mix(roughness, 0.6, inPad);
    float stitch = (1.0 - smoothstep(0.0, 0.012, abs(pad + 0.08))) * step(0.5, fract((q.x + q.y) * 7.0));
    return vec2(tone + stitch * 0.34, roughness);
  }

  float pageLine(vec2 q) {
    float row = floor(q.y * 11.0);
    float word = step(0.24, noise(vec2(q.x * 9.0, row * 3.1)));
    float length_ = 0.62 + 0.2 * hash(vec2(row, sign(q.x) + 3.0));
    float column = step(abs(abs(q.x) - half_size.x * 0.52), half_size.x * 0.38 * length_ / 0.82);
    float inside = step(abs(q.y), half_size.y * 0.8);
    return (1.0 - smoothstep(0.26, 0.36, abs(fract(q.y * 11.0) - 0.5) * 2.0)) * word * column * inside;
  }

  float pagesHeight(vec2 q) {
    return 1.0 - exp(-abs(q.x) * 9.0);
  }

  vec2 pagesSurface(vec2 q) {
    float gutter = 0.72 + 0.28 * (1.0 - exp(-abs(q.x) * 11.0));
    return vec2((0.94 - pageLine(q) * 0.62) * gutter, 0.86);
  }

  float heightAt(vec2 q) {
    if (tile == ${PLATE}) return plateHeight(q);
    if (tile == ${BACK}) return backHeight(q);
    return pagesHeight(q);
  }

  vec2 surfaceAt(vec2 q) {
    if (tile == ${PLATE}) return plateSurface(q);
    if (tile == ${BACK}) return backSurface(q);
    return pagesSurface(q);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy * texel;
    vec2 q = (uv - 0.5) * 2.0 * half_size;
    vec2 step_ = 2.0 * half_size * texel * 1.5;
    float depth = tile == ${PLATE} ? 0.05 : 0.035;
    vec2 slope = vec2(heightAt(q + vec2(step_.x, 0.0)) - heightAt(q - vec2(step_.x, 0.0)), heightAt(q + vec2(0.0, step_.y)) - heightAt(q - vec2(0.0, step_.y))) / (2.0 * step_);
    vec3 surface = normalize(vec3(-slope * depth, 1.0));
    vec2 finish = surfaceAt(q);
    gl_FragColor = vec4(surface.xy * 0.5 + 0.5, clamp(finish.x, 0.0, 1.0), clamp(finish.y, 0.0, 1.0));
  }
`;

/**
 * Creates GPU item finish baker for shield and tome.
 * Bakes PLATE (tile 0), BACK (tile 1), and PAGES (tile 2) to WebGLRenderTargets.
 * Inside bake(), WebGL pipeline state (renderTarget, clearColor, clearAlpha, autoClear)
 * is strictly preserved via try/finally.
 * @param {THREE.WebGLRenderer} renderer
 */
export function createItemFinishBake(renderer) {
  const makeTarget = (size) => {
    const target = new THREE.WebGLRenderTarget(size, size, {
      colorSpace: THREE.NoColorSpace,
      depthBuffer: false,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
      anisotropy: 8,
    });
    target.texture.wrapS = THREE.ClampToEdgeWrapping;
    target.texture.wrapT = THREE.ClampToEdgeWrapping;
    return target;
  };

  const targets = [
    makeTarget(MAP_SIZE),
    makeTarget(MAP_SIZE / 2),
    makeTarget(MAP_SIZE / 2),
  ];

  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tile: { value: PLATE },
      half_size: { value: new THREE.Vector2(...ITEM_FACES.shield.half) },
      texel: { value: 1 / MAP_SIZE },
    },
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
    plate: targets[PLATE].texture,
    back: targets[BACK].texture,
    pages: targets[PAGES].texture,
    targets,
    bake() {
      if (!renderer) return;
      const oldTarget = renderer.getRenderTarget();
      const oldClearColor = new THREE.Color();
      renderer.getClearColor(oldClearColor);
      const oldClearAlpha = renderer.getClearAlpha();
      const oldAutoClear = renderer.autoClear;

      try {
        for (const [tile, target] of targets.entries()) {
          material.uniforms.tile.value = tile;
          material.uniforms.texel.value = 1 / target.width;
          material.uniforms.half_size.value.fromArray(
            tile === PAGES ? ITEM_FACES.tome.half : ITEM_FACES.shield.half
          );
          renderer.setRenderTarget(target);
          renderer.render(scene, camera);
        }
      } finally {
        renderer.setRenderTarget(oldTarget);
        renderer.setClearColor(oldClearColor, oldClearAlpha);
        renderer.autoClear = oldAutoClear;
      }
    },
    dispose() {
      for (const target of targets) target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Universal wrapper applying two-sided ITEM_FACES shader to material.
 * Supports both signatures:
 *   applyItemFaces(material, face, { plate, inside }, tintColor)
 *   applyItemFaces(material, bake, itemName, tintColor)
 *
 * @param {THREE.Material} material
 * @param {Object|string} faceOrBake
 * @param {Object|string} insideOrName
 * @param {number|string|THREE.Color} [tintColor]
 * @returns {THREE.Material}
 */
export function applyItemFaces(material, faceOrBake, insideOrName, tintColor = null) {
  let face;
  let plateUniform;
  let insideUniform;

  if (faceOrBake && (faceOrBake.plate || faceOrBake.targets) && typeof insideOrName === 'string') {
    const name = insideOrName.toLowerCase();
    face = ITEM_FACES[name];
    if (!face) return material;
    plateUniform = { value: faceOrBake.plate };
    insideUniform = { value: name === 'tome' ? faceOrBake.pages : faceOrBake.back };
  } else {
    face = typeof faceOrBake === 'string' ? ITEM_FACES[faceOrBake.toLowerCase()] : faceOrBake;
    if (!face) return material;
    const textures = insideOrName || {};
    plateUniform = textures.plate?.value !== undefined ? textures.plate : { value: textures.plate };
    insideUniform = textures.inside?.value !== undefined ? textures.inside : { value: textures.inside };
  }

  const outside = new THREE.Vector3(...face.outside);
  const across = new THREE.Vector3(...face.across);
  const up = new THREE.Vector3(...face.up);
  const scale = new THREE.Vector2(0.5 / face.half[0], 0.5 / face.half[1]);
  const center = new THREE.Vector2(...face.center);
  const insideColor = new THREE.Color(face.inside === PAGES ? PAGE_COLOR : SHIELD_BACK_COLOR);
  const inlay = tintColor ? new THREE.Color(tintColor) : new THREE.Color(MYTHRIL_INLAY);
  const paper = face.inside === PAGES ? 1.0 : 0.0;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    Object.assign(shader.uniforms, {
      itemPlate: plateUniform,
      itemInside: insideUniform,
      itemOutside: { value: outside },
      itemAcross: { value: across },
      itemUp: { value: up },
      itemScale: { value: scale },
      itemCenter: { value: center },
      itemInsideColor: { value: insideColor },
      itemInsideMetal: { value: face.insideMetal },
      itemInlay: { value: inlay },
      itemPaper: { value: paper },
    });

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec3 itemAcross;
        uniform vec3 itemUp;
        varying vec3 vItemPosition;
        varying vec3 vItemNormal;
        varying vec3 vItemTangent;
        varying vec3 vItemBitangent;
      `
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vItemPosition = position;
        vItemNormal = normal;
        vItemTangent = normalMatrix * itemAcross;
        vItemBitangent = normalMatrix * itemUp;
      `
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform sampler2D itemPlate;
        uniform sampler2D itemInside;
        uniform vec3 itemOutside;
        uniform vec3 itemAcross;
        uniform vec3 itemUp;
        uniform vec2 itemScale;
        uniform vec2 itemCenter;
        uniform vec3 itemInsideColor;
        uniform float itemInsideMetal;
        uniform vec3 itemInlay;
        uniform float itemPaper;
        varying vec3 vItemPosition;
        varying vec3 vItemNormal;
        varying vec3 vItemTangent;
        varying vec3 vItemBitangent;
      `
      )
      .replace(
        '#include <metalnessmap_fragment>',
        /* glsl */ `#include <metalnessmap_fragment>
        vec2 itemUv = (vec2(dot(vItemPosition, itemAcross), dot(vItemPosition, itemUp)) - itemCenter) * itemScale + 0.5;
        float itemOutward = smoothstep(-0.25, 0.1, dot(normalize(vItemNormal), itemOutside));
        vec4 itemFront = texture2D(itemPlate, itemUv);
        vec4 itemRear = texture2D(itemInside, itemUv);
        vec3 itemMetal = diffuseColor.rgb * (0.68 + 0.64 * min(itemFront.b, 0.5));
        itemMetal = mix(itemMetal, itemInlay, smoothstep(0.5, 0.92, itemFront.b));
        diffuseColor.rgb = mix(itemInsideColor * itemRear.b * (itemPaper + (1.0 - itemPaper) * 2.4), itemMetal, itemOutward);
        roughnessFactor = mix(itemRear.a, itemFront.a, itemOutward);
        metalnessFactor = mix(itemInsideMetal, metalnessFactor, itemOutward);
        vec4 itemDetail = mix(itemRear, itemFront, itemOutward);
      `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        vec2 itemSlope = itemDetail.rg * 2.0 - 1.0;
        normal = normalize(normal + normalize(vItemTangent) * itemSlope.x + normalize(vItemBitangent) * itemSlope.y);
      `
      );
  };

  const prevFaceCacheKey = typeof material.customProgramCacheKey === 'function'
    ? material.customProgramCacheKey.bind(material)
    : null;
  material.customProgramCacheKey = () => {
    const key = `item-faces-${face.inside}-${inlay.getHexString()}`;
    return prevFaceCacheKey ? `${prevFaceCacheKey()}_${key}` : key;
  };
  material.needsUpdate = true;
  return material;
}

/**
 * Applies 3D procedural Mythril veins, analytical normal relief,
 * iridescence, and emissive glow to held weapon materials.
 * @param {THREE.Material} material
 * @param {number|string|THREE.Color} [veinColor=0x8fbbe8]
 * @returns {THREE.Material}
 */
export function applyMythrilVeins(material, veinColor = MYTHRIL_VEIN_COLOR) {
  const vein = new THREE.Color(veinColor);

  if (material.isMeshPhysicalMaterial) {
    material.iridescence = MYTHRIL_IRIDESCENCE;
    material.iridescenceIOR = 1.5;
    material.iridescenceThicknessMinimum = 120;
    material.iridescenceThicknessMaximum = 420;
  }

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);
    shader.uniforms.mythrilVein = { value: vein };

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vItemPosition;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvItemPosition = position;');

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        varying vec3 vItemPosition;
        uniform vec3 mythrilVein;
        float mythrilVeins(vec3 point) {
          vec3 p = point * ${MYTHRIL_VEIN_SCALE.toFixed(2)};
          float warp = sin(p.x * 0.9 + 1.7 * sin(p.y * 1.3 + p.z * 1.1)) + 0.5 * sin(p.x * 2.1 - p.y * 1.7 + 1.3 * sin(p.z * 2.3 + p.x * 0.7));
          return pow(0.5 + 0.5 * sin(warp * 4.0 + p.y * 1.5), 6.0);
        }
      `
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        float mythrilVein01 = mythrilVeins(vItemPosition) * smoothstep(0.1, 0.5, diffuseColor.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, mythrilVein, mythrilVein01 * ${MYTHRIL_VEIN_STRENGTH.toFixed(2)});
        roughnessFactor = clamp(roughnessFactor + mythrilVein01 * 0.12, 0.0, 1.0);
      `
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        vec3 mythrilDx = dFdx(-vViewPosition);
        vec3 mythrilDy = dFdy(-vViewPosition);
        vec3 mythrilR1 = cross(mythrilDy, normal);
        vec3 mythrilR2 = cross(normal, mythrilDx);
        float mythrilDet = dot(mythrilDx, mythrilR1);
        vec3 mythrilGrad = sign(mythrilDet) * (dFdx(mythrilVein01) * mythrilR1 + dFdy(mythrilVein01) * mythrilR2);
        normal = normalize(abs(mythrilDet) * normal - ${MYTHRIL_RELIEF.toFixed(2)} * mythrilGrad);
      `
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += mythrilVein * mythrilVein01 * ${MYTHRIL_GLOW.toFixed(2)};
      `
      );
  };

  const prevVeinCacheKey = typeof material.customProgramCacheKey === 'function'
    ? material.customProgramCacheKey.bind(material)
    : null;
  material.customProgramCacheKey = () => {
    const key = `mythril-veins-${vein.getHexString()}`;
    return prevVeinCacheKey ? `${prevVeinCacheKey()}_${key}` : key;
  };
  material.needsUpdate = true;
  return material;
}

let _sharedEnvironment = null;

/**
 * Prefilters RoomEnvironment via PMREMGenerator once and assigns reflection envMap
 * to all passed materials so metallic weapons and shields gleam with reflections.
 * Caches environment so subsequent calls do not discard or thrash active textures.
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Material[]} [materials=[]]
 * @param {boolean} [force=false]
 * @returns {THREE.WebGLRenderTarget|null}
 */
export function bakeRoomEnvironment(renderer, materials = [], force = false) {
  if (!renderer) return null;
  if (!_sharedEnvironment || force) {
    if (_sharedEnvironment) {
      _sharedEnvironment.dispose();
      _sharedEnvironment = null;
    }
    const prefilter = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    _sharedEnvironment = prefilter.fromScene(room, ENVIRONMENT_BLUR);
    room.dispose();
    prefilter.dispose();
  }

  const envTexture = _sharedEnvironment.texture;
  if (Array.isArray(materials)) {
    for (const mat of materials) {
      if (mat) {
        mat.envMap = envTexture;
        mat.needsUpdate = true;
      }
    }
  }
  return _sharedEnvironment;
}

export function getBakedRoomEnvironment() {
  return _sharedEnvironment;
}

/**
 * Creates 8-sided volumetric light-streak cone geometry with glowing red tip and soft amber halo.
 * Length 1 along +x, radius 1 at scale 1; scale y and z to gun bore.
 */
export function createStreakGeometry() {
  const rings = [
    [0, 0.35, STREAK_LIGHT, 0],
    [0.45, 0.7, STREAK_LIGHT, 0.55],
    [0.8, 1, STREAK_LIGHT, 1],
    [0.84, 1, STREAK_RED, 1],
    [1, 0, STREAK_RED, 1],
  ];
  const halo = [
    [0, 0.6, STREAK_GLOW, 0],
    [0.55, STREAK_HALO * 0.8, STREAK_GLOW, 0.5],
    [0.8, STREAK_HALO, STREAK_GLOW, 0.8],
    [0.86, STREAK_HALO, STREAK_RED, 0.85],
    [1, 0, STREAK_RED, 0],
  ];

  const position = [];
  const color = [];
  const index = [];

  for (const shell of [halo, rings]) {
    const base = position.length / 3;
    for (const [along, radius, [r, g, b], opacity] of shell) {
      for (let side = 0; side < STREAK_SIDES; side++) {
        const angle = (side / STREAK_SIDES) * Math.PI * 2;
        position.push(along, Math.cos(angle) * radius, Math.sin(angle) * radius);
        color.push(r, g, b, opacity);
      }
    }
    for (let ring = 0; ring + 1 < shell.length; ring++) {
      for (let side = 0; side < STREAK_SIDES; side++) {
        const a = base + ring * STREAK_SIDES + side;
        const b = base + ring * STREAK_SIDES + ((side + 1) % STREAK_SIDES);
        const c = a + STREAK_SIDES;
        const d = b + STREAK_SIDES;
        index.push(a, c, b, b, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(color, 4));
  geometry.setIndex(index);
  return geometry;
}

/**
 * Creates a spherical muzzle flash mesh for rifle discharge.
 * @param {THREE.Scene} [scene]
 * @returns {THREE.Mesh}
 */
export function createMuzzleFlashMesh(scene = null) {
  const geometry = new THREE.SphereGeometry(FLASH_RADIUS, 8, 8);
  const material = new THREE.MeshBasicMaterial({
    color: FLASH_COLOR,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.generatedWeapon = true;
  if (scene) scene.add(mesh);
  return mesh;
}

/**
 * Creates 8-sided volumetric light streak mesh for Fusilier rifle shots.
 * @param {THREE.Scene} [scene]
 * @returns {THREE.Mesh}
 */
export function createVolumetricStreakMesh(scene = null) {
  const geometry = createStreakGeometry();
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.generatedWeapon = true;
  if (scene) scene.add(mesh);
  return mesh;
}
