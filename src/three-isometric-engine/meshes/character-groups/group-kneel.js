//NOTE(jimmylee)
//Kneel mode (Mode K) — single KO3/KO4 mesh, static kneeling pose.
//Structurally identical to Dead mode but uses 32x32 tiles instead of 40x32.
//See character-groups/AGENTS.md for architecture.

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
  KNEEL_BODY_DX,
  KNEEL_BODY_DY,
  KNEEL_PIVOT_RISE,
  setVisualDriver,
} from '@engine/meshes/character-utils';
import { State } from '@engine/actions/character-state';
import { MAX_VISUAL_POOL_SIZE } from '@engine/constants/physics';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';

const _kneelPool = [];

//NOTE(jimmylee)
//Kneel (SEQ 32-33) frame data per rotation step (mode K only).
//Single-plane static pose using KO3/KO4 sprites (32x32px — same width as idle, shorter).
export const KNEEL_FRAMES = [
  { id: 'KO3', reversed: true }, // Step 0 — Pattern A
  { id: 'KO3', reversed: false }, // Step 1 — Pattern B (SE default)
  { id: 'KO3', reversed: false }, // Step 2 — Pattern B
  { id: 'KO4', reversed: false }, // Step 3 — Pattern C (SW default)
  { id: 'KO4', reversed: false }, // Step 4 — Pattern C
  { id: 'KO4', reversed: true }, // Step 5 — Pattern D (NW default)
  { id: 'KO4', reversed: true }, // Step 6 — Pattern D
  { id: 'KO3', reversed: true }, // Step 7 — Pattern A (NE default)
];

//NOTE(jimmylee)
//Creates a kneel mesh (Mode K): single plane for kneeling pose (32x32px).
//Reuses pooled Mesh instances when available to avoid per-kneel allocation.
export function createKneelMesh({ node, textures, directionOffset, walkStart }) {
  const initialKneel = KNEEL_FRAMES[directionOffset];

  if (_kneelPool.length > 0) {
    const kneelMesh = _kneelPool.pop();

    if (kneelMesh.material.map) kneelMesh.material.map.dispose();
    const kneelTexture = cloneSpriteTexture(textures);
    applySpriteFrame(kneelTexture, initialKneel.id, initialKneel.reversed);
    kneelMesh.material.map = kneelTexture;
    resetSinglePose(kneelMesh.geometry);

    const kneelHeight = 32 * PX_TO_WORLD;
    const kneelWorldX = node.x * cubeSize;
    const kneelWorldY = node.y * cubeSize + (kneelHeight - cubeSize) * 0.5 - 4 * PX_TO_WORLD;
    const kneelWorldZ = node.z * cubeSize;
    kneelMesh.position.set(kneelWorldX, kneelWorldY, kneelWorldZ);

    kneelMesh.userData.character = createCharacterState({
      mode: 'K',
      directionOffset,
      walkStart,
      billboardHeight: kneelHeight,
      state: State.KNEELING,
    });

    kneelMesh.visible = true;
    return kneelMesh;
  }

  const kneelTexture = cloneSpriteTexture(textures);

  applySpriteFrame(kneelTexture, initialKneel.id, initialKneel.reversed);

  const kneelMaterial = createBodyMaterial(kneelTexture);

  const kneelHeight = 32 * PX_TO_WORLD;
  const kneelGeometry = createSinglePoseGeometry(32, 32);
  const kneelMesh = new THREE.Mesh(kneelGeometry, kneelMaterial);

  const kneelWorldX = node.x * cubeSize;
  const kneelWorldY = node.y * cubeSize + (kneelHeight - cubeSize) * 0.5 - 4 * PX_TO_WORLD;
  const kneelWorldZ = node.z * cubeSize;

  kneelMesh.position.set(kneelWorldX, kneelWorldY, kneelWorldZ);
  kneelMesh.frustumCulled = false;
  kneelMesh.castShadow = false;
  kneelMesh.receiveShadow = false;

  kneelMesh.userData.character = createCharacterState({
    mode: 'K',
    directionOffset,
    walkStart,
    billboardHeight: kneelHeight,
    state: State.KNEELING,
  });

  setVisualDriver(kneelMesh, kneelMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;

    this.quaternion.copy(camera.quaternion);

    const ch = this.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;
    const frame = KNEEL_FRAMES[idx];

    if (step !== ch.lastStep) {
      ch.lastStep = step;
      applySpriteFrame(this.material.map, frame.id, frame.reversed);
    }
    placeSinglePose(this, idx, KNEEL_BODY_DX, KNEEL_BODY_DY, KNEEL_PIVOT_RISE, camera);
    this.updateMatrixWorld();
  });

  return kneelMesh;
}

//NOTE(jimmylee)
//Returns a kneel mesh to the pool for reuse. If the pool is at capacity,
//disposes GPU resources instead to prevent unbounded retention.
export function releaseKneelMesh(mesh) {
  mesh.visible = false;
  if (_kneelPool.length >= MAX_VISUAL_POOL_SIZE) {
    if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
    if (mesh.geometry) mesh.geometry.dispose();
    return;
  }
  _kneelPool.push(mesh);
}

//NOTE(jimmylee)
//Mode K (kneel): registry wrapper — createKneelMesh only needs node/textures/
//directionOffset/walkStart and ignores the other registry fields.
registerCharacterMode('K', ({ node, textures, directionOffset, walkStart }) => (
  createKneelMesh({ node, textures, directionOffset, walkStart })
));

//NOTE(jimmylee)
//Scene teardown: dispose all pooled kneel meshes and their GPU resources.
export function destroyKneelPool() {
  for (const mesh of _kneelPool) {
    if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
    if (mesh.geometry) mesh.geometry.dispose();
  }
  _kneelPool.length = 0;
}
