//NOTE(jimmylee)
//Dead mode (Mode D) — single KO mesh, terminal static pose.
//Extracted from createCharacter.js. See character-groups/AGENTS.md for architecture.

import * as THREE from 'three';
import { cubeSize } from '@engine/constants';
import {
  PX_TO_WORLD,
  azimuthToStep,
  applySpriteFrame,
  cloneSpriteTexture,
  createBodyMaterial,
  createSinglePoseGeometry,
  resetSinglePose,
  placeSinglePose,
  DEAD_BODY_DX,
  DEAD_BODY_DY,
  DEAD_PIVOT_RISE,
  setVisualDriver,
} from '@engine/meshes/character-utils';
import { State } from '@engine/actions/character-state';
import { MAX_VISUAL_POOL_SIZE } from '@engine/constants/physics';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';

const _deadPool = [];

//NOTE(jimmylee)
//Dead (SEQ 40-41) frame data per rotation step (mode D only).
//Single-plane static terminal pose using KO1/KO2 sprites (40x32px — wider but shorter than idle).
export const DEATH_FRAMES = [
  { id: 'KO1', reversed: true }, // Step 0 — Dead Pattern A
  { id: 'KO1', reversed: false }, // Step 1 — Dead Pattern B (SE default)
  { id: 'KO1', reversed: false }, // Step 2 — Dead Pattern B
  { id: 'KO2', reversed: false }, // Step 3 — Dead Pattern C (SW default)
  { id: 'KO2', reversed: false }, // Step 4 — Dead Pattern C
  { id: 'KO2', reversed: true }, // Step 5 — Dead Pattern D (NW default)
  { id: 'KO2', reversed: true }, // Step 6 — Dead Pattern D
  { id: 'KO1', reversed: true }, // Step 7 — Dead Pattern A (NE default)
];

//NOTE(jimmylee)
//Creates a dead mesh (Mode D): single plane for KO pose (40x32px).
//Reuses pooled Mesh instances when available to avoid per-death allocation.
export function createDeadMesh({ node, textures, directionOffset, walkStart }) {
  const initialDeath = DEATH_FRAMES[directionOffset];

  if (_deadPool.length > 0) {
    const deathMesh = _deadPool.pop();

    if (deathMesh.material.map) deathMesh.material.map.dispose();
    const deathTexture = cloneSpriteTexture(textures);
    applySpriteFrame(deathTexture, initialDeath.id, initialDeath.reversed);
    deathMesh.material.map = deathTexture;
    resetSinglePose(deathMesh.geometry);

    const deathHeight = 32 * PX_TO_WORLD;
    const deathWorldX = node.x * cubeSize;
    const deathWorldY = node.y * cubeSize + (deathHeight - cubeSize) * 0.5 - 10 * PX_TO_WORLD;
    const deathWorldZ = node.z * cubeSize;
    deathMesh.position.set(deathWorldX, deathWorldY, deathWorldZ);

    deathMesh.userData.character = createCharacterState({
      mode: 'D',
      directionOffset,
      walkStart,
      billboardHeight: deathHeight,
      state: State.DEAD,
      extras: { hp: 0, dead: true },
    });

    deathMesh.visible = true;
    return deathMesh;
  }

  const deathTexture = cloneSpriteTexture(textures);

  applySpriteFrame(deathTexture, initialDeath.id, initialDeath.reversed);

  const deathMaterial = createBodyMaterial(deathTexture);

  const deathHeight = 32 * PX_TO_WORLD;
  const deathGeometry = createSinglePoseGeometry(40, 32);
  const deathMesh = new THREE.Mesh(deathGeometry, deathMaterial);

  const deathWorldX = node.x * cubeSize;
  const deathWorldY = node.y * cubeSize + (deathHeight - cubeSize) * 0.5 - 10 * PX_TO_WORLD;
  const deathWorldZ = node.z * cubeSize;

  deathMesh.position.set(deathWorldX, deathWorldY, deathWorldZ);
  deathMesh.frustumCulled = false;
  deathMesh.castShadow = false;
  deathMesh.receiveShadow = false;

  deathMesh.userData.character = createCharacterState({
    mode: 'D',
    directionOffset,
    walkStart,
    billboardHeight: deathHeight,
    state: State.DEAD,
    extras: { hp: 0, dead: true },
  });

  setVisualDriver(deathMesh, deathMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;

    this.quaternion.copy(camera.quaternion);

    const ch = this.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;
    const frame = DEATH_FRAMES[idx];

    if (step !== ch.lastStep) {
      ch.lastStep = step;
      applySpriteFrame(this.material.map, frame.id, frame.reversed);
    }
    placeSinglePose(this, idx, DEAD_BODY_DX, DEAD_BODY_DY, DEAD_PIVOT_RISE, camera);
    this.updateMatrixWorld();
  });

  return deathMesh;
}

//NOTE(jimmylee)
//Returns a dead mesh to the pool for reuse. If the pool is at capacity,
//disposes GPU resources instead to prevent unbounded retention.
export function releaseDeadMesh(mesh) {
  mesh.visible = false;
  if (_deadPool.length >= MAX_VISUAL_POOL_SIZE) {
    if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
    if (mesh.geometry) mesh.geometry.dispose();
    return;
  }
  _deadPool.push(mesh);
}

//NOTE(jimmylee)
//Mode D (dead): registry wrapper — createDeadMesh only needs node/textures/
//directionOffset/walkStart and ignores the other registry fields.
registerCharacterMode('D', ({ node, textures, directionOffset, walkStart }) => (
  createDeadMesh({ node, textures, directionOffset, walkStart })
));

//NOTE(jimmylee)
//Scene teardown: dispose all pooled dead meshes and their GPU resources.
export function destroyDeadPool() {
  for (const mesh of _deadPool) {
    if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
    if (mesh.geometry) mesh.geometry.dispose();
  }
  _deadPool.length = 0;
}
