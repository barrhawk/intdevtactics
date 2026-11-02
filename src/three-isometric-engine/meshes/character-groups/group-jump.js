//NOTE(jimmylee)
//Jump mode (Mode J) — billboard composite. See AGENTS.md for shared architecture.
//JUMP_ASSEMBLY plays once per jump: take-off (SEQ 204/205) → Mid Jump pose → High Jump Land (SEQ
//52/53). The Y arc (jumpLift in actions/action-timelines.js) spans exactly the Mid Jump frame.
//Body heights vary per frame (standing 40, crouching 16, kneeling 32). 3 meshes: body + 2 hands.
//
//The caller lifts the unit. This file only handles visuals, enabling frustum culling to skip
//billboard updates for off-screen characters.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { JUMP_ASSEMBLY } from '@engine/constants/sprites/assembly';

import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, BEHIND, IN_FRONT, resolveVariableFrame, azimuthToStep, applySpriteFrame, createBillboardOverlay, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, seqMoveLocal, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { JUMP_DELAYS_S } from '@engine/actions/action-timelines';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';

//NOTE(jimmylee)
//Per-frame body heights (pixels) — dynamically derived from SPRITE_MAP.
const BODY_HEIGHTS = JUMP_ASSEMBLY[0].frames.map((f) => SPRITE_MAP[f.body].h);

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance; bodies are placed by their SHP anchor.
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

//NOTE(jimmylee)
//Max overlay dimensions — dynamically derived from all sprites used across JUMP_ASSEMBLY.
let BEHIND_HAND_MAX_W = 0;
let BEHIND_HAND_MAX_H = 0;
let FRONT_HAND_MAX_W = 0;
let FRONT_HAND_MAX_H = 0;
for (const pattern of JUMP_ASSEMBLY) {
  for (const frame of pattern.frames) {
    if (frame.behind) {
      const c = SPRITE_MAP[frame.behind.id];
      BEHIND_HAND_MAX_W = Math.max(BEHIND_HAND_MAX_W, c.w);
      BEHIND_HAND_MAX_H = Math.max(BEHIND_HAND_MAX_H, c.h);
    }
    if (frame.front) {
      const c = SPRITE_MAP[frame.front.id];
      FRONT_HAND_MAX_W = Math.max(FRONT_HAND_MAX_W, c.w);
      FRONT_HAND_MAX_H = Math.max(FRONT_HAND_MAX_H, c.h);
    }
  }
}

//NOTE(@jimmylee)
//Jump body and overlay frames per rotation step, read from JUMP_ASSEMBLY. Each hand entry is
//[behind_hand, front_hand]. Retained as exports for tests; runtime reads JUMP_ASSEMBLY directly.
const STEP_PATTERNS = [0, 1, 1, 2, 2, 3, 3, 0];
export const JUMP_FRAMES = STEP_PATTERNS.map((p) => JUMP_ASSEMBLY[p].frames.map((f) => ({ id: f.body, reversed: JUMP_ASSEMBLY[p].reversed })));
export const JUMP_HAND_FRAMES = STEP_PATTERNS.map((p) => JUMP_ASSEMBLY[p].frames.map((f) => [f.behind, f.front].map((tile) => tile && { id: tile.id, reversed: JUMP_ASSEMBLY[p].reversed })));

//NOTE(jimmylee)
//Overlay data read directly from JUMP_ASSEMBLY.
//Each pattern has 9 frames with behind/front overlay data.
//dx/dy are in SHP/CSS convention (positive dy = downward from body center).

//NOTE(jimmylee)
//Creates a jump group (Mode J): billboard composite with 3 meshes.
//Scale factors derived from the body plane geometry — same pixel math as the main route.
//The group copies camera.quaternion so all children face the camera as one unit.
//The caller lifts the unit; the visual driver uses frustum culling to skip off-screen characters.
export function createJumpGroup({ node, textures, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;

  //NOTE(jimmylee)
  //Billboard composite scale factors derived from the body plane.
  //The body plane is spriteWidth x spriteHeight world units, covering BODY_W x MAX_CONTAINER_H pixels.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const behindHand = createBillboardOverlay(textures, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, scaleX, scaleY);
  const frontHand = createBillboardOverlay(textures, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, scaleX, scaleY);

  //NOTE(jimmylee)
  //Start in idle — jump animation begins after character settles + dwell.
  const initialIdx = directionOffset;
  const idleFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);

  //NOTE(jimmylee)
  //Initial renderOrder — behind always behind, front always in front.
  //Hands start hidden — idle sprite (P1-P5) is a full body with arms.
  bodyMesh.renderOrder = 0;
  behindHand.mesh.renderOrder = BEHIND;
  behindHand.mesh.visible = false;
  frontHand.mesh.renderOrder = IN_FRONT;
  frontHand.mesh.visible = false;

  const group = new THREE.Group();
  group.add(bodyMesh);          // children[0]
  group.add(behindHand.mesh);   // children[1]
  group.add(frontHand.mesh);    // children[2]

  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  //NOTE(jimmylee)
  //Character state on group.
  //baseY preserves the original world Y for computing lift offsets.
  //actionReadyAt: 0 at creation so the initial jump starts on settle without dwell.
  group.userData.character = createCharacterState({
    mode: 'J',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      baseY: worldY,
      _lastCycle: -1,
      behindHandTexture: behindHand.texture,
      frontHandTexture: frontHand.texture,
      actionReadyAt: 0,
    },
  });

  //NOTE(jimmylee)
  //Body onBeforeRender: visual-only billboard composite update.
  //The caller lifts the unit. This callback only does:
  //billboard quaternion copy, overlay positioning, UV updates, updateMatrixWorld.
  //Frustum culling safely skips all of this when the character is off-screen.
  setVisualDriver(group, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this.parent, camera)) return;

    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;

    //NOTE(jimmylee)
    //Idle state: no active jump cycle (_lastCycle === -1). Covers spawn (falling from
    //sky), idle dwell between jumps, and recovery from kneel/knockback.
    //Show the full idle sprite (P1-P5) with hands hidden — idle is a single tile.
    if (ch._lastCycle === -1) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;

      if (step !== ch.lastStep) {
        ch.lastStep = step;
        ch.lastFrame = -1;
        const idleFrame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, idleFrame.id, idleFrame.reversed);
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(@jimmylee)
    //Non-looping: one pass per jump; a ceiling-abort fall that outlasts it holds the last landing frame.
    const elapsedRaw = (camera.userData.now - ch.walkStart) / 1000;
    const frameIdx = resolveVariableFrame(JUMP_DELAYS_S, elapsedRaw).frameIdx;

    //NOTE(jimmylee)
    //Read overlay data from JUMP_ASSEMBLY for the current rotation step.
    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const assemblyFrame = JUMP_ASSEMBLY[patternIdx].frames[frameIdx];
    const frame = JUMP_FRAMES[idx][frameIdx];

    //NOTE(jimmylee)
    //Reversed patterns flip the entire composite horizontally — same as CSS scaleX(-1).
    const flipX = frame.reversed ? -1 : 1;

    //NOTE(jimmylee)
    //Body position from the SHP anchor plus the frame's SEQ unit motion.
    const bodyH = BODY_HEIGHTS[frameIdx];
    this.scale.y = bodyH / MAX_CONTAINER_H;
    const move = seqMoveLocal(assemblyFrame.move, ch.directionOffset, camera, scaleY);
    const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX) + move.x;
    const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY) + move.y;
    this.position.set(bodyX, bodyY, 0);

    const behindHandMesh = this.parent.children[1];
    const frontHandMesh = this.parent.children[2];

    //NOTE(jimmylee)
    //Behind hand position = body center + pixel offset x scale x flipX.
    if (assemblyFrame.behind) {
      behindHandMesh.visible = true;
      positionOverlay(behindHandMesh, assemblyFrame.behind, scaleX, scaleY, flipX, bodyY, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, bodyX);
      behindHandMesh.renderOrder = BEHIND;
    } else {
      behindHandMesh.visible = false;
    }

    //NOTE(jimmylee)
    //Front hand position = body center + pixel offset x scale x flipX.
    if (assemblyFrame.front) {
      frontHandMesh.visible = true;
      positionOverlay(frontHandMesh, assemblyFrame.front, scaleX, scaleY, flipX, bodyY, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, bodyX);
      frontHandMesh.renderOrder = IN_FRONT;
    } else {
      frontHandMesh.visible = false;
    }

    //NOTE(jimmylee)
    //Apply body + overlay sprite UVs when step or frame changes.
    if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
      ch.lastStep = step;
      ch.lastFrame = frameIdx;
      applySpriteFrame(this.material.map, frame.id, frame.reversed);

      if (assemblyFrame.behind) {
        applySpriteFrame(ch.behindHandTexture, assemblyFrame.behind.id, frame.reversed);
      }
      if (assemblyFrame.front) {
        applySpriteFrame(ch.frontHandTexture, assemblyFrame.front.id, frame.reversed);
      }
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(jimmylee)
//Mode J (jump): factory signature already matches the registry shape.
registerCharacterMode('J', createJumpGroup);
