//NOTE(@jimmylee)
//What a card draws from Set's models: one geometry per item, built the first time a card asks for it and
//shared by every card, the mythril every weapon on the page wears, and the flash and streak of a gun's shot.
//Vertex colors are the bake's and the veins are the material's, so a thin item needs no texture. An item with
//a face to show has its two sides baked in code (weapons/item-finish.js).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ITEM_FLATTEN, ITEM_LAYER_GAP } from '@engine/constants/character';
import { ITEM_FACES, applyItemFaces, createItemFinishBake } from '@engine/weapons/item-finish';

const FLASH_RADIUS = 2.2;
const FLASH_COLOR = 0xfff0c8;
const STREAK_SIDES = 8;
const STREAK_HALO = 3.4;
const STREAK_LIGHT = [1, 0.97, 0.86];
const STREAK_GLOW = [1, 0.66, 0.2];
const STREAK_RED = [1, 0.1, 0.06];

//NOTE(@jimmylee)
//Set's mythril plate (the bake paints its colors): a mirror metal with a thin film on it, and
//the blue of its second tone running through it in veins. This shader is this project's own: Set's
//finishes are source code, which stays in Set (weapons/AGENTS.md "Baking").
const MYTHRIL_ROUGHNESS = 0.16;
const MYTHRIL_IRIDESCENCE = 0.35;
const MYTHRIL_VEIN_COLOR = 0x8fbbe8;
const MYTHRIL_VEIN_STRENGTH = 0.4;
const MYTHRIL_RELIEF = 0.05;
const MYTHRIL_VEIN_SCALE = 2.4;
const MYTHRIL_GLOW = 0.14;
const ENVIRONMENT_BLUR = 0.03;
const MYTHRIL_CACHE_KEY = 'mythril-veins-2';

//NOTE(@jimmylee)
//A material's onBeforeRender, for anything carried on a sprite: three has just worked out the mesh's
//modelViewMatrix and normal matrix, and this flattens that matrix's depth into the gap between the tiles under
//the item and the tiles over it (ITEM_LAYER_GAP), around the view depth of `object.userData.spritePlane`, the
//unit whose plane it is. Nothing moves on the orthographic screen, the normals stay the mesh's own, so its
//metal still reads as 3D, and the mesh's position, rotation and matrixWorld keep saying where it really is.
//An object with no plane, a thrown one, keeps its depth, and one with `overTiles` sits past the gap, over the
//tiles drawn over the item it goes with.
export function flattenOntoSprite(renderer, scene, camera, geometry, object) {
  const unit = object.userData.spritePlane;
  if (!unit) return;
  const view = camera.matrixWorldInverse.elements;
  const { x, y, z } = unit.position;
  const plane = view[2] * x + view[6] * y + view[10] * z + view[14] + (unit.userData.character.spriteLift ?? 0) + (object.userData.overTiles ? ITEM_LAYER_GAP * 1.5 : ITEM_LAYER_GAP / 2);
  const e = object.modelViewMatrix.elements;
  e[2] *= ITEM_FLATTEN;
  e[6] *= ITEM_FLATTEN;
  e[10] *= ITEM_FLATTEN;
  e[14] = plane + (e[14] - plane) * ITEM_FLATTEN;
}

function applyMythrilVeins(material) {
  const vein = new THREE.Color(MYTHRIL_VEIN_COLOR);
  material.onBeforeCompile = (shader) => {
    shader.uniforms.mythrilVein = { value: vein };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vItemPosition;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvItemPosition = position;');
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
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\ntotalEmissiveRadiance += mythrilVein * mythrilVein01 * ${MYTHRIL_GLOW.toFixed(2)};`);
  };
  material.customProgramCacheKey = () => MYTHRIL_CACHE_KEY;
  return material;
}

//NOTE(@jimmylee)
//The metal with nothing on it, which the veins and an item's faces are laid over.
export function createPlainMythrilMaterial() {
  const material = new THREE.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: MYTHRIL_ROUGHNESS, iridescence: MYTHRIL_IRIDESCENCE, iridescenceIOR: 1.5, iridescenceThicknessMinimum: 120, iridescenceThicknessMaximum: 420 });
  material.onBeforeRender = flattenOntoSprite;
  return material;
}

export function createMythrilMaterial() {
  return applyMythrilVeins(createPlainMythrilMaterial());
}

function createItemGeometry({ position, normal, color, index }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(color, 4, true));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.userData.shared = true;
  return geometry;
}

//NOTE(@jimmylee)
//A light streak with a red tip, one unit long along +x from its tail, so its x scale is its length and its
//radius at scale 1 is 1: a stage scales y and z to the gun's bore. A bright core, and a soft halo around it
//that shows the streak against a pale floor. Rings are [along, radius, color, opacity]; the tip keeps a
//point because the last ring is a closed one.
function createStreakGeometry() {
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

//NOTE(@jimmylee)
//`items` is readSetItems' result, or null. `model(name)` is { geometry, muzzle, bore, length }, or null, and
//`materialOf(name)` is what that item wears: its two faces if it has them, or else the veins.
export function createHeldItemResources(items) {
  const models = new Map();
  const material = createMythrilMaterial();
  const tiles = { plate: { value: null }, boards: { value: null }, pages: { value: null } };
  const faceMaterials = {};
  for (const [name, face] of Object.entries(ITEM_FACES)) {
    faceMaterials[name] = applyItemFaces(createPlainMythrilMaterial(), face, { plate: tiles.plate, inside: name === 'tome' ? tiles.pages : tiles.boards });
    faceMaterials[name].userData.shared = true;
  }
  const flashGeometry = new THREE.SphereGeometry(FLASH_RADIUS, 8, 8);
  const streakGeometry = createStreakGeometry();
  const flashMaterial = new THREE.MeshBasicMaterial({ color: FLASH_COLOR, transparent: true, depthWrite: false });
  const streakMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  for (const shared of [material, flashGeometry, streakGeometry, flashMaterial, streakMaterial]) shared.userData.shared = true;
  let environment = null;
  let finish = null;
  return {
    material,
    faceMaterials,
    materialOf: (name) => faceMaterials[name] ?? material,
    flashMaterial,
    streakMaterial,
    flashGeometry,
    streakGeometry,
    model(name) {
      if (!items?.[name]) return null;
      if (!models.has(name)) {
        const { muzzle, bore, length } = items[name];
        models.set(name, { geometry: createItemGeometry(items[name]), muzzle, bore, length });
      }
      return models.get(name);
    },
    //NOTE(@jimmylee)
    //What the mirror metal reflects: one room, prefiltered on the GPU once per stage, and the tiles of an item's
    //faces, both again when a lost WebGL context comes back.
    bake(renderer) {
      finish ??= createItemFinishBake(renderer);
      finish.bake();
      tiles.plate.value = finish.plate;
      tiles.boards.value = finish.back;
      tiles.pages.value = finish.pages;
      environment?.dispose();
      const prefilter = new THREE.PMREMGenerator(renderer);
      const room = new RoomEnvironment();
      environment = prefilter.fromScene(room, ENVIRONMENT_BLUR);
      room.dispose();
      prefilter.dispose();
      for (const metal of [material, ...Object.values(faceMaterials)]) {
        metal.envMap = environment.texture;
        metal.needsUpdate = true;
      }
    },
    dispose() {
      for (const { geometry } of models.values()) geometry.dispose();
      flashGeometry.dispose();
      streakGeometry.dispose();
      material.dispose();
      for (const face of Object.values(faceMaterials)) face.dispose();
      flashMaterial.dispose();
      streakMaterial.dispose();
      environment?.dispose();
      finish?.dispose();
    },
  };
}

function createShotMesh(geometry, material, scene) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.generatedWeapon = true;
  scene.add(mesh);
  return mesh;
}

export function createMuzzleFlash(resources, scene) {
  return createShotMesh(resources.flashGeometry, resources.flashMaterial, scene);
}

export function createStreak(resources, scene) {
  return createShotMesh(resources.streakGeometry, resources.streakMaterial, scene);
}
