//NOTE(jimmylee)
//Flinch mode (Mode H) — top + bottom stacked planes, one pose with the SEQ 38/39 1px shiver.
//Extracted from createCharacter.js. See character-groups/AGENTS.md for architecture.

import * as THREE from 'three';
import { cubeSize } from '@engine/constants';
import {
  BODY_W,
  STANDARD_CONTAINER_H,
  ASSEMBLY_STEP_MAP,
  BEHIND,
  azimuthToStep,
  applySpriteFrame,
  cloneSpriteTexture,
  createBodyMaterial,
  anchorBodyX,
  anchorBodyY,
  resolveLoopingFrame,
  setVisualDriver,
} from '@engine/meshes/character-utils';
import { HURT_ASSEMBLY, HURT_SHIVER_DELAYS, HURT_SHIVER_MOVES } from '@engine/constants/sprites/assembly';
import { MAX_VISUAL_POOL_SIZE } from '@engine/constants/physics';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';
import { getSharedGeometry } from '@engine/meshes/static-assets';

const _flinchPool = [];

//NOTE(jimmylee)
//Flinch (SEQ 38-39) frame data per rotation step (mode H only).
//Each entry has top/bottom sprite IDs and a reversed flag.
//Rendered as two planes placed from HURT_ASSEMBLY: the top (24px) sits at its SHP anchor and the
//bottom (16px) bottomDy below it, overlapping the top's last 3 rows from behind (SHP F68/F69).
export const FLINCH_FRAMES = [
  { top: 'DF1', bottom: 'DF2', reversed: true }, // Step 0 — Pattern A
  { top: 'DF1', bottom: 'DF2', reversed: false }, // Step 1 — Pattern B (SE default)
  { top: 'DF1', bottom: 'DF2', reversed: false }, // Step 2 — Pattern B
  { top: 'DB1', bottom: 'DB2', reversed: false }, // Step 3 — Pattern C (SW default)
  { top: 'DB1', bottom: 'DB2', reversed: false }, // Step 4 — Pattern C
  { top: 'DB1', bottom: 'DB2', reversed: true }, // Step 5 — Pattern D (NW default)
  { top: 'DB1', bottom: 'DB2', reversed: true }, // Step 6 — Pattern D
  { top: 'DF1', bottom: 'DF2', reversed: true }, // Step 7 — Pattern A (NE default)
];

//NOTE(jimmylee)
//SEQ 38/39 shiver: the unit is redrawn 1px up, then back down, every 2 ticks (looping).
const SHIVER_DELAYS_S = HURT_SHIVER_DELAYS.map((ms) => ms / 1000);
const SHIVER_CYCLE_S = SHIVER_DELAYS_S.reduce((a, b) => a + b, 0);

//NOTE(jimmylee)
//Places the top/bottom planes for a rotation step. The group is billboarded, so x offsets are
//screen-right; reversed patterns mirror them (flipX), same as every other composite mode.
//`du` is the shiver offset in pixels (+ down).
function positionFlinchPlanes(group, idx, spriteWidth, spriteHeight, du = 0) {
  const pattern = HURT_ASSEMBLY[ASSEMBLY_STEP_MAP[idx]];
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / STANDARD_CONTAINER_H;
  const flipX = pattern.reversed ? -1 : 1;
  const topX = anchorBodyX(pattern.anchor, scaleX, flipX);
  const topY = anchorBodyY(pattern.anchor, scaleY) - du * scaleY;
  group.children[0].position.set(topX, topY, 0);
  group.children[1].position.set(topX + pattern.bottomDx * scaleX * flipX, topY - pattern.bottomDy * scaleY, 0);
}

//NOTE(jimmylee)
//Creates a flinch group (Mode H): two planes (top 24px + bottom 16px) from HURT_ASSEMBLY.
//Reuses pooled Group+Mesh pairs when available to avoid per-knockback allocation.
export function createFlinchGroup({ textures, directionOffset, walkStart, worldX, worldY, worldZ, spriteWidth, spriteHeight }) {
  const initialFlinch = FLINCH_FRAMES[directionOffset];

  if (_flinchPool.length > 0) {
    const flinchGroup = _flinchPool.pop();
    const topMesh = flinchGroup.children[0];
    const bottomMesh = flinchGroup.children[1];

    if (topMesh.material.map) topMesh.material.map.dispose();
    if (bottomMesh.material.map) bottomMesh.material.map.dispose();
    const topTexture = cloneSpriteTexture(textures);
    const bottomTexture = cloneSpriteTexture(textures);
    applySpriteFrame(topTexture, initialFlinch.top, initialFlinch.reversed);
    applySpriteFrame(bottomTexture, initialFlinch.bottom, initialFlinch.reversed);
    topMesh.material.map = topTexture;
    bottomMesh.material.map = bottomTexture;

    flinchGroup.userData.character = createCharacterState({
      mode: 'H',
      directionOffset,
      walkStart,
      billboardHeight: spriteHeight,
      extras: { bottomTexture },
    });

    positionFlinchPlanes(flinchGroup, directionOffset, spriteWidth, spriteHeight);
    flinchGroup.position.set(worldX, worldY, worldZ);
    flinchGroup.visible = true;
    topMesh.visible = true;
    bottomMesh.visible = true;
    return flinchGroup;
  }

  const topTexture = cloneSpriteTexture(textures);
  const bottomTexture = cloneSpriteTexture(textures);

  applySpriteFrame(topTexture, initialFlinch.top, initialFlinch.reversed);
  applySpriteFrame(bottomTexture, initialFlinch.bottom, initialFlinch.reversed);

  const topMaterial = createBodyMaterial(topTexture);
  const bottomMaterial = createBodyMaterial(bottomTexture);

  const topHeight = (spriteHeight * 24) / 40;
  const bottomHeight = (spriteHeight * 16) / 40;
  const topGeometry = getSharedGeometry(`flinch-${spriteWidth}x${topHeight}`, () => new THREE.PlaneGeometry(spriteWidth, topHeight));
  const bottomGeometry = getSharedGeometry(`flinch-${spriteWidth}x${bottomHeight}`, () => new THREE.PlaneGeometry(spriteWidth, bottomHeight));

  const topMesh = new THREE.Mesh(topGeometry, topMaterial);
  const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial);

  //NOTE(jimmylee)
  //Bottom renders behind the top where they overlap (SHP back-to-front order).
  topMesh.renderOrder = 0;
  bottomMesh.renderOrder = BEHIND;

  topMesh.frustumCulled = false;
  topMesh.castShadow = false;
  topMesh.receiveShadow = false;

  bottomMesh.frustumCulled = false;
  bottomMesh.castShadow = false;
  bottomMesh.receiveShadow = false;

  const flinchGroup = new THREE.Group();
  flinchGroup.add(topMesh);
  flinchGroup.add(bottomMesh);

  positionFlinchPlanes(flinchGroup, directionOffset, spriteWidth, spriteHeight);
  flinchGroup.position.set(worldX, worldY, worldZ);
  flinchGroup.frustumCulled = false;

  flinchGroup.userData.character = createCharacterState({
    mode: 'H',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: { bottomTexture },
  });

  //Billboard both planes + drive UV updates. See skills/add-sprite-assembly-from-source for billboard invariants.
  setVisualDriver(flinchGroup, topMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;

    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;
    const frame = FLINCH_FRAMES[idx];

    if (step !== ch.lastStep) {
      ch.lastStep = step;
      applySpriteFrame(this.material.map, frame.top, frame.reversed);
      applySpriteFrame(ch.bottomTexture, frame.bottom, frame.reversed);
    }

    const { frameIdx } = resolveLoopingFrame(SHIVER_DELAYS_S, SHIVER_CYCLE_S, (camera.userData.now - ch.walkStart) / 1000);
    positionFlinchPlanes(this.parent, idx, spriteWidth, spriteHeight, HURT_SHIVER_MOVES[frameIdx].du);

    this.parent.updateMatrixWorld(true);
  });

  return flinchGroup;
}

//NOTE(jimmylee)
//Returns a flinch group to the pool for reuse. If the pool is at capacity,
//disposes GPU resources instead to prevent unbounded retention.
export function releaseFlinchGroup(group) {
  group.visible = false;
  if (_flinchPool.length >= MAX_VISUAL_POOL_SIZE) {
    group.traverse((child) => {
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
    return;
  }
  _flinchPool.push(group);
}

//NOTE(jimmylee)
//Mode H (flinch): registry wrapper unpacks spriteWidth/spriteHeight from
//the caller-provided bodyMesh so createFlinchGroup keeps its existing
//signature (called directly by action modules with explicit dimensions).
registerCharacterMode('H', ({ textures, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) => {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;
  return createFlinchGroup({ textures, directionOffset, walkStart, worldX, worldY, worldZ, spriteWidth, spriteHeight });
});

//NOTE(jimmylee)
//Scene teardown: dispose all pooled flinch groups and their GPU resources.
export function destroyFlinchPool() {
  for (const group of _flinchPool) {
    group.traverse((child) => {
      if (child.material) {
        if (child.material.map) child.material.map.dispose();
        child.material.dispose();
      }
    });
  }
  _flinchPool.length = 0;
}
