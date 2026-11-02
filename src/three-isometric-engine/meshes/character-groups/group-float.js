//NOTE(jimmylee)
//Float mode (Mode FL) — billboard composite. See AGENTS.md for shared architecture.
//SEQ 12/13 (animation 0x12/0x13, the hover idle of a floating unit): F70/F71 (walk-neutral
//tiles BF3/BB3 + RF3/LF3/RB3/LB3) redrawn 8 times on the walk timing while MoveUp1/MoveDown1 bob
//the unit 0 / -1 / -2 / -1 px (FLOAT_MOVES), looping.
//3 meshes: body + behind hand + front hand — same structure as Guard.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { FLOAT_ASSEMBLY, FLOAT_DELAYS, FLOAT_MOVES } from '@engine/constants/sprites/assembly';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, BEHIND, IN_FRONT, resolveLoopingFrame, azimuthToStep, applySpriteFrame, createBillboardOverlay, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, seqMoveLocal, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { State } from '@engine/actions/character-state';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance; BF3/BB3 sit at their SHP anchor (no walk bob —
//the bob comes from the SEQ move opcodes, not from the frame).
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

const FLOAT_DELAYS_S = FLOAT_DELAYS.map((ms) => ms / 1000);
const FLOAT_CYCLE_DURATION = FLOAT_DELAYS_S.reduce((a, b) => a + b, 0);

let BEHIND_HAND_MAX_W = 0;
let BEHIND_HAND_MAX_H = 0;
let FRONT_HAND_MAX_W = 0;
let FRONT_HAND_MAX_H = 0;
for (const pattern of FLOAT_ASSEMBLY) {
  const bc = SPRITE_MAP[pattern.behind.id];
  BEHIND_HAND_MAX_W = Math.max(BEHIND_HAND_MAX_W, bc.w);
  BEHIND_HAND_MAX_H = Math.max(BEHIND_HAND_MAX_H, bc.h);
  const fc = SPRITE_MAP[pattern.front.id];
  FRONT_HAND_MAX_W = Math.max(FRONT_HAND_MAX_W, fc.w);
  FRONT_HAND_MAX_H = Math.max(FRONT_HAND_MAX_H, fc.h);
}

//NOTE(jimmylee)
//Creates a float group (Mode FL). Starts idle until the character settles, then loops the
//SEQ 12/13 bob from walkStart (read from camera.userData.now — no timer syscalls here).
export function createFloatGroup({ textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const behindHand = createBillboardOverlay(textures, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, scaleX, scaleY);
  const frontHand = createBillboardOverlay(textures, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, scaleX, scaleY);

  const initialIdx = directionOffset;
  const idleFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);
  behindHand.mesh.visible = false;
  frontHand.mesh.visible = false;

  bodyMesh.renderOrder = 0;
  behindHand.mesh.renderOrder = BEHIND;
  frontHand.mesh.renderOrder = IN_FRONT;

  const group = new THREE.Group();
  group.add(bodyMesh);          // children[0]
  group.add(behindHand.mesh);   // children[1]
  group.add(frontHand.mesh);    // children[2]

  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  group.userData.character = createCharacterState({
    mode: 'FL',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      direction,
      behindHandTexture: behindHand.texture,
      frontHandTexture: frontHand.texture,
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

      if (step !== ch.lastStep || ch.lastFrame !== -1) {
        ch.lastStep = step;
        ch.lastFrame = -1;
        const frame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, frame.id, frame.reversed);
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    this.parent.children[1].visible = true;
    this.parent.children[2].visible = true;

    const pattern = FLOAT_ASSEMBLY[ASSEMBLY_STEP_MAP[idx]];
    const flipX = pattern.reversed ? -1 : 1;

    //NOTE(jimmylee)
    //SEQ unit motion: the whole composite bobs up 2px and back (du is screen-vertical).
    const elapsedRaw = (camera.userData.now - ch.walkStart) / 1000;
    const { frameIdx } = resolveLoopingFrame(FLOAT_DELAYS_S, FLOAT_CYCLE_DURATION, Math.max(0, elapsedRaw));
    const move = seqMoveLocal(FLOAT_MOVES[frameIdx], ch.directionOffset, camera, scaleY);

    this.scale.y = SPRITE_MAP[pattern.body].h / MAX_CONTAINER_H;
    const bodyX = anchorBodyX(pattern.anchor, scaleX, flipX) + move.x;
    const bodyY = anchorBodyY(pattern.anchor, scaleY) + move.y;
    this.position.set(bodyX, bodyY, 0);

    positionOverlay(this.parent.children[1], pattern.behind, scaleX, scaleY, flipX, bodyY, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, bodyX);
    positionOverlay(this.parent.children[2], pattern.front, scaleX, scaleY, flipX, bodyY, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, bodyX);

    //NOTE(jimmylee)
    //The tiles never change during the bob, so UVs are only applied on a step change or settle.
    if (step !== ch.lastStep || ch.lastFrame === -1) {
      ch.lastStep = step;
      ch.lastFrame = 0;
      applySpriteFrame(this.material.map, pattern.body, pattern.reversed);
      applySpriteFrame(ch.behindHandTexture, pattern.behind.id, pattern.reversed);
      applySpriteFrame(ch.frontHandTexture, pattern.front.id, pattern.reversed);
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

registerCharacterMode('FL', createFloatGroup);
