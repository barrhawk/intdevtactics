//NOTE(jimmylee)
//Punch Lv2 mode (Mode P2) — billboard composite. See AGENTS.md for shared architecture.
//SEQ 142/143: 8-frame looping punch sequence (833ms cycle).
//4 meshes: body + farBehind + head + front.
//
//Punch Lv2-specific:
//  Skips F120/F169 windup transition from Lv1 — goes directly from ready to extend.
//  Lingers on retract (F123/F172) instead of extend.
//  Same 4-tile full-body structure as Lv1 (farBehind + body + head + front).
//  4 unique SHP frames per facing (vs 5 in Lv1).

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { PUNCH_LV2_ASSEMBLY } from '@engine/constants/sprites/assembly';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, FAR_BEHIND, IN_FRONT, resolveLoopingFrame, azimuthToStep, applySpriteFrame, createBillboardOverlay, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, seqMoveLocal, setVisualDriver, liftPunchTiles } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { registerCharacterMode } from '@engine/common/registry';
import { State } from '@engine/actions/character-state';
import { createCharacterState } from '@engine/meshes/character-state-init';

//NOTE(jimmylee)
//Per-pattern, per-frame body heights (pixels) — dynamically derived from SPRITE_MAP.
//All punch bodies (AF1/AF2/AB1/AB2) are 32×32 — uniform across all frames and patterns.
const BODY_HEIGHTS = PUNCH_LV2_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => SPRITE_MAP[f.body].h)
);

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance; AF/AB torsos are placed by their SHP anchor
//(AF sits 1px right of the stance center, 3-4px low; AB 4-5px low).
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

//NOTE(jimmylee)
//Punch Lv2 body frames: 8 frames per rotation step, derived from assembly data.
const PUNCH_LV2_PATTERNS = PUNCH_LV2_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => ({ id: f.body, reversed: pattern.reversed }))
);

export const PUNCH_LV2_FRAMES = [
  PUNCH_LV2_PATTERNS[0], // Step 0 — Pattern A
  PUNCH_LV2_PATTERNS[1], // Step 1 — Pattern B (SE default)
  PUNCH_LV2_PATTERNS[1], // Step 2 — Pattern B
  PUNCH_LV2_PATTERNS[2], // Step 3 — Pattern C (SW default)
  PUNCH_LV2_PATTERNS[2], // Step 4 — Pattern C
  PUNCH_LV2_PATTERNS[3], // Step 5 — Pattern D (NW default)
  PUNCH_LV2_PATTERNS[3], // Step 6 — Pattern D
  PUNCH_LV2_PATTERNS[0], // Step 7 — Pattern A (NE default)
];

//NOTE(jimmylee)
//Punch Lv2 delays in seconds (ticks at 60fps → seconds).
//Ready(2+8) → Extend(2+4) → Retract(10+18+2) → Follow-through(4) = 50 ticks = 833ms.
const PUNCH_LV2_DELAYS_S = [2, 8, 2, 4, 10, 18, 2, 4].map((t) => t / 60);
const PUNCH_LV2_CYCLE_DURATION = PUNCH_LV2_DELAYS_S.reduce((a, b) => a + b, 0);

//NOTE(jimmylee)
//Overlay max dimensions — all punch overlays are 24×24.
const FAR_BEHIND_MAX_W = 24;
const FAR_BEHIND_MAX_H = 24;
const HEAD_MAX_W = 24;
const HEAD_MAX_H = 24;
const FRONT_MAX_W = 24;
const FRONT_MAX_H = 24;

//NOTE(jimmylee)
//Creates a punch Lv2 group (Mode P2): billboard composite with 4 meshes.
export function createPunchLv2Group({ node, textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;

  //NOTE(jimmylee)
  //Billboard composite scale factors derived from the body plane.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const farBehindMesh = createBillboardOverlay(textures, FAR_BEHIND_MAX_W, FAR_BEHIND_MAX_H, scaleX, scaleY);
  const headMesh = createBillboardOverlay(textures, HEAD_MAX_W, HEAD_MAX_H, scaleX, scaleY);
  const frontMesh = createBillboardOverlay(textures, FRONT_MAX_W, FRONT_MAX_H, scaleX, scaleY);

  //NOTE(jimmylee)
  //Start in idle — animation begins after character settles (lands).
  const initialIdx = directionOffset;
  const idleFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);
  farBehindMesh.mesh.visible = false;
  headMesh.mesh.visible = false;
  frontMesh.mesh.visible = false;

  //NOTE(jimmylee)
  //Initial renderOrder.
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

  //NOTE(jimmylee)
  //Character state on group.
  group.userData.character = createCharacterState({
    mode: 'P2',
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

  //NOTE(jimmylee)
  //Body onBeforeRender: billboard the GROUP, resolve frame, position all children.
  setVisualDriver(group, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this.parent, camera)) return;

    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;

    //NOTE(jimmylee)
    //Idle state: character has not settled yet (falling from spawn) or is spawning.
    //Show the full idle sprite (P1-P5) with overlays hidden.
    if (ch.state === State.FALLING || ch.state === State.SPAWNING) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      this.parent.children[3].visible = false;

      if (step !== ch.lastStep || ch.lastFrame !== -1) {
        ch.lastStep = step;
        ch.lastFrame = -1;
        const idleFrame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, idleFrame.id, idleFrame.reversed);
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(jimmylee)
    //Looping animation with variable per-frame delays (SEQ ticks).
    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const delays = PUNCH_LV2_DELAYS_S;
    const elapsedRaw = (camera.userData.now - ch.walkStart) / 1000;
    const { frameIdx } = resolveLoopingFrame(delays, PUNCH_LV2_CYCLE_DURATION, elapsedRaw);

    const assemblyFrame = PUNCH_LV2_ASSEMBLY[patternIdx].frames[frameIdx];
    const frame = PUNCH_LV2_FRAMES[idx][frameIdx];

    //NOTE(jimmylee)
    //Reversed patterns flip the entire composite horizontally.
    const flipX = frame.reversed ? -1 : 1;

    //NOTE(jimmylee)
    //Body scale and position. Uniform 32×32 torsos placed at their SHP anchor.
    const bodyH = BODY_HEIGHTS[patternIdx][frameIdx];
    this.scale.y = bodyH / MAX_CONTAINER_H;
    //NOTE(jimmylee)
    //SEQ unit motion: the punch winds back and lunges along the facing (assembly `move`).
    const move = seqMoveLocal(assemblyFrame.move, ch.directionOffset, camera, scaleY);
    const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX) + move.x;
    const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY) + move.y;
    this.position.set(bodyX, bodyY, 0);

    const farBehindChild = this.parent.children[1];
    const headChild = this.parent.children[2];
    const frontChild = this.parent.children[3];

    //NOTE(jimmylee)
    //farBehind: back hand in 4-tile full-body compositions.
    farBehindChild.visible = true;
    positionOverlay(farBehindChild, assemblyFrame.farBehind, scaleX, scaleY, flipX, bodyY, FAR_BEHIND_MAX_W, FAR_BEHIND_MAX_H, bodyX);

    //NOTE(jimmylee)
    //head: TF1 (front-facing) or TB1 (back-facing).
    headChild.visible = true;
    positionOverlay(headChild, assemblyFrame.head, scaleX, scaleY, flipX, bodyY, HEAD_MAX_W, HEAD_MAX_H, bodyX);

    //NOTE(jimmylee)
    //front: front hand (LG series).
    frontChild.visible = true;
    positionOverlay(frontChild, assemblyFrame.front, scaleX, scaleY, flipX, bodyY, FRONT_MAX_W, FRONT_MAX_H, bodyX);
    liftPunchTiles(ch, patternIdx, farBehindChild, this, headChild, frontChild);

    //NOTE(jimmylee)
    //Apply body + overlay sprite UVs when step or frame changes.
    if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
      ch.lastStep = step;
      ch.lastFrame = frameIdx;

      applySpriteFrame(this.material.map, frame.id, frame.reversed);
      applySpriteFrame(ch.farBehindTexture, assemblyFrame.farBehind.id, frame.reversed);
      applySpriteFrame(ch.headTexture, assemblyFrame.head.id, frame.reversed);
      applySpriteFrame(ch.frontTexture, assemblyFrame.front.id, frame.reversed);
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(jimmylee)
//Mode P2 (punch level 2): factory signature already matches the registry shape.
registerCharacterMode('P2', createPunchLv2Group);
