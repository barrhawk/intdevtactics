//NOTE(@jimmylee)
//The two sides of a held item with a face. A shield or a book is a flat thing seen from both sides, and one
//metal on both reads as a sheet of foil: the outside is worked plate, and the inside is another surface, darker.
//
//Three tiles, baked on the GPU once per stage and again after a lost context, as the ledge marble is, so there
//is no file to load: the face at MAP_SIZE, and the back and a book's pages, which are never as near the camera, at
//half of it. A tile holds a normal in RG, a tone in B and a roughness in A, with mipmaps, so it stays clean at a
//card's size and holds its detail at any larger one. The models have no UVs and need none: ITEM_FACES lays a tile
//across each item in its own frame, so the work stays on the item as it turns. No item's material sets `map`, which
//in the demos and their tests means a sprite plane.
//
//This file needs only three, so a project can copy it as it is (references/rebuild-animations.md "Held Items").

import * as THREE from 'three';

const MAP_SIZE = 2048;
const FINISH_CACHE_KEY = 'item-faces-1';
const PLATE = 0;
const BACK = 1;
const PAGES = 2;

//NOTE(@jimmylee)
//How a tile lies on an item, in its own frame (weapons/set-items.js). `outside` points out of the worked face,
//`across` and `up` run along the tile, `center` is the middle of the face and `half` its half size along those
//two, in Set's units, measured from set-items.glb. `inside` names the tile on the other side, and `insideMetal`
//how much of a metal it is: the shield's back is dark boards and iron, and a book's pages are paper.
export const ITEM_FACES = {
  shield: { outside: [1, 0, 0], across: [0, 0, 1], up: [0, 1, 0], center: [0, 0], half: [1.276, 2.073], inside: BACK, insideMetal: 0.25 },
  tome: { outside: [0, -1, 0], across: [1, 0, 0], up: [0, 0, 1], center: [-0.385, 0], half: [1.069, 0.9], inside: PAGES, insideMetal: 0 },
};

const BAKE_VERTEX_SHADER = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

//NOTE(@jimmylee)
//A tile is a height field, a tone and a roughness, each a function of `q`, the point on the face in Set's units
//from its middle. The normal comes from the height by finite differences, one texel across. Tone reads as a
//color by side: on the plate 0.5 is the bare metal, lower is a darker cut and higher the mythril blue, and on the
//back and the pages it is how bright the surface is.
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

  //NOTE(@jimmylee)
  //A row of rivets along a line, by the distance down it and the distance off it.
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

  //NOTE(@jimmylee)
  //A pavise's face: a raised rim on a beaded line, its rivets, a spine, a boss in a lozenge, and in the field a
  //hammered ground under cut lines that spread from the boss. The book's cover takes the same work at its size.
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

  //NOTE(@jimmylee)
  //The inside of a pavise: dark boards standing side by side, two iron straps across them, and a padded square
  //in the middle where the arm goes, stitched at its edge.
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

  //NOTE(@jimmylee)
  //A book's open pages: each column of text a block of ruled lines, of uneven length, either side of the gutter.
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

//NOTE(@jimmylee)
//One render per tile into a mipmapped target that holds data, not color. `half` is the face the tile is drawn
//for: the shield's, which is the larger of the two faces and the one a card shows most. A restored WebGL context
//comes back with the targets empty, so `bake` runs again then. The stage owns the result.
export function createItemFinishBake(renderer) {
  const makeTarget = (size) => {
    const target = new THREE.WebGLRenderTarget(size, size, { colorSpace: THREE.NoColorSpace, depthBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, anisotropy: 8 });
    target.texture.wrapS = THREE.ClampToEdgeWrapping;
    target.texture.wrapT = THREE.ClampToEdgeWrapping;
    return target;
  };
  const targets = [makeTarget(MAP_SIZE), makeTarget(MAP_SIZE / 2), makeTarget(MAP_SIZE / 2)];
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    uniforms: { tile: { value: PLATE }, half_size: { value: new THREE.Vector2(...ITEM_FACES.shield.half) }, texel: { value: 1 / MAP_SIZE } },
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
    bake() {
      const previous = renderer.getRenderTarget();
      for (const [tile, target] of targets.entries()) {
        material.uniforms.tile.value = tile;
        material.uniforms.texel.value = 1 / target.width;
        material.uniforms.half_size.value.fromArray(tile === PAGES ? ITEM_FACES.tome.half : ITEM_FACES.shield.half);
        renderer.setRenderTarget(target);
        renderer.render(scene, camera);
      }
      renderer.setRenderTarget(previous);
    },
    dispose() {
      for (const target of targets) target.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}

//NOTE(@jimmylee)
//Lays `face` (ITEM_FACES) over a MeshStandardMaterial or MeshPhysicalMaterial with vertex colors, and returns it.
//`plate` and `inside` are uniforms, { value: texture } of the baked tiles, so a bake that runs again reaches
//every material. The side comes from the surface's normal in the item's own frame, so a
//curved face stays one side all the way across and a rim falls to the plate. The tile's normal goes into view space
//along the item's axes, so it lights as the metal does however the item is flattened onto a sprite. Lit by what
//lights the rest of the item, so the back needs no light of its own, and the inside's color is set here: dark for
//the boards, and the paper's own for the pages.
const SHIELD_BACK_COLOR = 0x2b3a4d;
const PAGE_COLOR = 0xefe8d6;
const MYTHRIL_INLAY = 0x8fbbe8;
export function applyItemFaces(material, face, { plate, inside }) {
  const outside = new THREE.Vector3(...face.outside);
  const across = new THREE.Vector3(...face.across);
  const up = new THREE.Vector3(...face.up);
  const scale = new THREE.Vector2(0.5 / face.half[0], 0.5 / face.half[1]);
  const center = new THREE.Vector2(...face.center);
  const insideColor = new THREE.Color(face.inside === PAGES ? PAGE_COLOR : SHIELD_BACK_COLOR);
  const inlay = new THREE.Color(MYTHRIL_INLAY);
  const paper = face.inside === PAGES ? 1 : 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      itemPlate: plate,
      itemInside: inside,
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
      .replace('#include <common>', /* glsl */ `#include <common>
        uniform vec3 itemAcross;
        uniform vec3 itemUp;
        varying vec3 vItemPosition;
        varying vec3 vItemNormal;
        varying vec3 vItemTangent;
        varying vec3 vItemBitangent;
      `)
      .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
        vItemPosition = position;
        vItemNormal = normal;
        vItemTangent = normalMatrix * itemAcross;
        vItemBitangent = normalMatrix * itemUp;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', /* glsl */ `#include <common>
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
      `)
      .replace('#include <metalnessmap_fragment>', /* glsl */ `#include <metalnessmap_fragment>
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
      `)
      .replace('#include <normal_fragment_maps>', /* glsl */ `#include <normal_fragment_maps>
        vec2 itemSlope = itemDetail.rg * 2.0 - 1.0;
        normal = normalize(normal + normalize(vItemTangent) * itemSlope.x + normalize(vItemBitangent) * itemSlope.y);
      `);
  };
  material.customProgramCacheKey = () => FINISH_CACHE_KEY;
  return material;
}
