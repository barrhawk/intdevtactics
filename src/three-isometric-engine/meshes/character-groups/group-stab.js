//NOTE(jimmylee)
//Stab Lv1 mode (Mode S1) — billboard composite. See AGENTS.md for shared architecture.
//SEQ 96/97: 9-frame looping stab (665ms). Same 4-tile full-body structure as Punch:
//farBehind (back arm, FAR_BEHIND) + AF/AB torso (0) + TF1/TB1 head (1) + front arm (IN_FRONT).
//The composite follows the SEQ unit motion (2px wind-up, lunge +2, settle +1) along the facing.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { STAB_ASSEMBLY, STAB_DELAYS } from '@engine/constants/sprites/assembly';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, FAR_BEHIND, IN_FRONT, resolveLoopingFrame, azimuthToStep, applySpriteFrame, createBillboardOverlay, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, seqMoveLocal, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { State } from '@engine/actions/character-state';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';

const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

const STAB_DELAYS_S = STAB_DELAYS.map((ms) => ms / 1000);
const STAB_CYCLE_DURATION = STAB_DELAYS_S.reduce((a, b) => a + b, 0);

//NOTE(jimmylee)
//Overlay max dimensions per layer, derived from every frame of every pattern.
function layerMax(key) {
  let w = 0;
  let h = 0;
  for (const pattern of STAB_ASSEMBLY) {
    for (const frame of pattern.frames) {
      const c = SPRITE_MAP[frame[key].id];
      w = Math.max(w, c.w);
      h = Math.max(h, c.h);
    }
  }
  return { w, h };
}
const FAR_BEHIND_MAX = layerMax('farBehind');
const HEAD_MAX = layerMax('head');
const FRONT_MAX = layerMax('front');

export function createStabGroup({ textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const farBehindMesh = createBillboardOverlay(textures, FAR_BEHIND_MAX.w, FAR_BEHIND_MAX.h, scaleX, scaleY);
  const headMesh = createBillboardOverlay(textures, HEAD_MAX.w, HEAD_MAX.h, scaleX, scaleY);
  const frontMesh = createBillboardOverlay(textures, FRONT_MAX.w, FRONT_MAX.h, scaleX, scaleY);

  const initialIdx = directionOffset;
  const idleFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);
  farBehindMesh.mesh.visible = false;
  headMesh.mesh.visible = false;
  frontMesh.mesh.visible = false;

  bodyMesh.renderOrder = 0;
  farBehindMesh.mesh.renderOrder = FAR_BEHIND;
  headMesh.mesh.renderOrder = 1;
  frontMesh.mesh.renderOrder = IN_FRONT;

  const group = new THREE.Group();
  group.add(bodyMesh);              // children[0]
  group.add(farBehindMesh.mesh);    // children[1]
  group.add(headMesh.mesh);         // children[2]
  group.add(frontMesh.mesh);        // children[3]

  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  group.userData.character = createCharacterState({
    mode: 'S1',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      direction,
      farBehindTexture: farBehindMesh.texture,
      headTexture: headMesh.texture,
      frontTexture: frontMesh.texture,
    },
  });

  setVisualDriver(group, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this.parent, camera)) return;

    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;

    if (ch.state === State.FALLING || ch.state === State.SPAWNING) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      this.parent.children[3].visible = false;

      if (step !== ch.lastStep || ch.lastFrame !== -1) {
        ch.lastStep = step;
        ch.lastFrame = -1;
        const frame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, frame.id, frame.reversed);
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    const pattern = STAB_ASSEMBLY[ASSEMBLY_STEP_MAP[idx]];
    const elapsedRaw = (camera.userData.now - ch.walkStart) / 1000;
    const { frameIdx } = resolveLoopingFrame(STAB_DELAYS_S, STAB_CYCLE_DURATION, Math.max(0, elapsedRaw));
    const assemblyFrame = pattern.frames[frameIdx];
    const flipX = pattern.reversed ? -1 : 1;

    this.scale.y = SPRITE_MAP[assemblyFrame.body].h / MAX_CONTAINER_H;
    const move = seqMoveLocal(assemblyFrame.move, ch.directionOffset, camera, scaleY);
    const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX) + move.x;
    const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY) + move.y;
    this.position.set(bodyX, bodyY, 0);

    const farBehindChild = this.parent.children[1];
    const headChild = this.parent.children[2];
    const frontChild = this.parent.children[3];
    farBehindChild.visible = true;
    headChild.visible = true;
    frontChild.visible = true;
    positionOverlay(farBehindChild, assemblyFrame.farBehind, scaleX, scaleY, flipX, bodyY, FAR_BEHIND_MAX.w, FAR_BEHIND_MAX.h, bodyX);
    positionOverlay(headChild, assemblyFrame.head, scaleX, scaleY, flipX, bodyY, HEAD_MAX.w, HEAD_MAX.h, bodyX);
    positionOverlay(frontChild, assemblyFrame.front, scaleX, scaleY, flipX, bodyY, FRONT_MAX.w, FRONT_MAX.h, bodyX);

    if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
      ch.lastStep = step;
      ch.lastFrame = frameIdx;
      applySpriteFrame(this.material.map, assemblyFrame.body, pattern.reversed);
      applySpriteFrame(ch.farBehindTexture, assemblyFrame.farBehind.id, pattern.reversed);
      applySpriteFrame(ch.headTexture, assemblyFrame.head.id, pattern.reversed);
      applySpriteFrame(ch.frontTexture, assemblyFrame.front.id, pattern.reversed);
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

registerCharacterMode('S1', createStabGroup);
