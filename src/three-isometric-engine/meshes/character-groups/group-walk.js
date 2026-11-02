//NOTE(jimmylee)
//Walk mode (Mode I) — billboard composite. See AGENTS.md for shared architecture.
//8-frame looping cycle (SEQ walk order): base frames [2,1,0,1,2,3,4,3].
//Constant body heights (BF1-5/BB1-5 are 32×40). 3 meshes: body + 2 hands.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { WALK_ASSEMBLY, JUMP_ASSEMBLY, STAB_LV3_ASSEMBLY, STAB_LV3_DELAYS, CAST_ASSEMBLY } from '@engine/constants/sprites/assembly';
import { CAST_FRAME_S, playerJumpFrame, playerLandFrame } from '@engine/actions/action-timelines';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, FAR_BEHIND, BEHIND, IN_FRONT, resolveLoopingFrame, resolveVariableFrame, azimuthToStep, applySpriteFrame, cloneSpriteTexture, createBillboardOverlay, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, seqMoveLocal, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { State } from '@engine/actions/character-state';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode, registerBlockType } from '@engine/common/registry';

//NOTE(jimmylee)
//SEQ walk order: 5 base frames → 8 animation frames.
//Maps SEQ frameIdx (0-7) to base frame index (0-4).
const SEQ_FRAME_MAP = [2, 1, 0, 1, 2, 3, 4, 3];

//NOTE(jimmylee)
//Per-base-frame body heights (pixels) — dynamically derived from SPRITE_MAP.
//All walk bodies (BF1-5/BB1-5) are 40px tall — no variable heights.
const BASE_BODY_HEIGHTS = WALK_ASSEMBLY[0].body.map((b) => SPRITE_MAP[b.id].h);

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance; every mode shares this pixel scale and
//places bodies by their SHP anchor (see BODY_ANCHOR_MAP in assembly.js).
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

//NOTE(jimmylee)
//Max overlay dimensions — dynamically derived from all sprites used across WALK_ASSEMBLY.
//R* sprites (RF/RB) are always behind, L* sprites (LF/LB) are always in front.
let BEHIND_HAND_MAX_W = 0;
let BEHIND_HAND_MAX_H = 0;
let FRONT_HAND_MAX_W = 0;
let FRONT_HAND_MAX_H = 0;
for (const pattern of WALK_ASSEMBLY) {
  for (const pair of pattern.hands) {
    for (const hand of pair) {
      const c = SPRITE_MAP[hand.id];
      if (hand.id.startsWith('R')) {
        BEHIND_HAND_MAX_W = Math.max(BEHIND_HAND_MAX_W, c.w);
        BEHIND_HAND_MAX_H = Math.max(BEHIND_HAND_MAX_H, c.h);
      } else {
        FRONT_HAND_MAX_W = Math.max(FRONT_HAND_MAX_W, c.w);
        FRONT_HAND_MAX_H = Math.max(FRONT_HAND_MAX_H, c.h);
      }
    }
  }
}

//NOTE(jimmylee)
//Jump overlay max dimensions — used for A1 combined walk+jump overlay bounds.
let JUMP_BEHIND_MAX_W = 0;
let JUMP_BEHIND_MAX_H = 0;
let JUMP_FRONT_MAX_W = 0;
let JUMP_FRONT_MAX_H = 0;
for (const pattern of JUMP_ASSEMBLY) {
  for (const frame of pattern.frames) {
    if (frame.behind) {
      const c = SPRITE_MAP[frame.behind.id];
      JUMP_BEHIND_MAX_W = Math.max(JUMP_BEHIND_MAX_W, c.w);
      JUMP_BEHIND_MAX_H = Math.max(JUMP_BEHIND_MAX_H, c.h);
    }
    if (frame.front) {
      const c = SPRITE_MAP[frame.front.id];
      JUMP_FRONT_MAX_W = Math.max(JUMP_FRONT_MAX_W, c.w);
      JUMP_FRONT_MAX_H = Math.max(JUMP_FRONT_MAX_H, c.h);
    }
  }
}

//NOTE(jimmylee)
//Stab Lv3 overlay max dimensions — all stab overlays are LG/TF/TB sprites (24×24).
let STAB_FAR_BEHIND_MAX_W = 0, STAB_FAR_BEHIND_MAX_H = 0;
let STAB_HEAD_MAX_W = 0, STAB_HEAD_MAX_H = 0;
let STAB_FRONT_MAX_W = 0, STAB_FRONT_MAX_H = 0;
for (const pattern of STAB_LV3_ASSEMBLY) {
  for (const frame of pattern.frames) {
    const fb = SPRITE_MAP[frame.farBehind.id];
    STAB_FAR_BEHIND_MAX_W = Math.max(STAB_FAR_BEHIND_MAX_W, fb.w);
    STAB_FAR_BEHIND_MAX_H = Math.max(STAB_FAR_BEHIND_MAX_H, fb.h);
    const hd = SPRITE_MAP[frame.head.id];
    STAB_HEAD_MAX_W = Math.max(STAB_HEAD_MAX_W, hd.w);
    STAB_HEAD_MAX_H = Math.max(STAB_HEAD_MAX_H, hd.h);
    const ft = SPRITE_MAP[frame.front.id];
    STAB_FRONT_MAX_W = Math.max(STAB_FRONT_MAX_W, ft.w);
    STAB_FRONT_MAX_H = Math.max(STAB_FRONT_MAX_H, ft.h);
  }
}

//NOTE(@jimmylee)
//Stab Lv3 animation timing (SEQ 100/101, non-looping).
const STAB_LV3_DELAYS_S = STAB_LV3_DELAYS.map((ms) => ms / 1000);

//NOTE(jimmylee)
//Stab Lv3 per-pattern, per-frame body heights.
const STAB_LV3_BODY_HEIGHTS = STAB_LV3_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => SPRITE_MAP[f.body].h)
);

//NOTE(jimmylee)
//Cast overlay max dimensions — SR17/SR18 are 32×16.
let CAST_OVERLAY_MAX_W = 0, CAST_OVERLAY_MAX_H = 0;
for (const pattern of CAST_ASSEMBLY) {
  for (const frame of pattern.frames) {
    const c = SPRITE_MAP[frame.overlay];
    CAST_OVERLAY_MAX_W = Math.max(CAST_OVERLAY_MAX_W, c.w);
    CAST_OVERLAY_MAX_H = Math.max(CAST_OVERLAY_MAX_H, c.h);
  }
}

//NOTE(jimmylee)
//Cast body heights per-pattern, per-frame — CH1-CH4 are 32×32.
const CAST_BODY_HEIGHTS = CAST_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => SPRITE_MAP[f.body].h)
);
const CAST_FRAME_COUNT = 2;

//NOTE(@jimmylee)
//Jump body heights per pattern and frame: the jump draws standing, crouching and kneeling bodies.
const JUMP_BODY_HEIGHTS = JUMP_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => SPRITE_MAP[f.body].h)
);

//NOTE(jimmylee)
//Combined walk+jump+stab overlay max dimensions for A1.
//A1 overlays must be large enough for walk, jump, and stab hand sprites.
const A1_BEHIND_MAX_W = Math.max(BEHIND_HAND_MAX_W, JUMP_BEHIND_MAX_W, STAB_FAR_BEHIND_MAX_W);
const A1_BEHIND_MAX_H = Math.max(BEHIND_HAND_MAX_H, JUMP_BEHIND_MAX_H, STAB_FAR_BEHIND_MAX_H);
const A1_FRONT_MAX_W = Math.max(FRONT_HAND_MAX_W, JUMP_FRONT_MAX_W, STAB_FRONT_MAX_W);
const A1_FRONT_MAX_H = Math.max(FRONT_HAND_MAX_H, JUMP_FRONT_MAX_H, STAB_FRONT_MAX_H);

//NOTE(jimmylee)
//Walk-in-place frame sequences per rotation step.
//Each step has 5 base frames reordered to 8 per SEQ 6/7 binary data.
const WALK_PATTERN_A = [
  { id: 'BF1', reversed: true },
  { id: 'BF2', reversed: true },
  { id: 'BF3', reversed: true },
  { id: 'BF4', reversed: true },
  { id: 'BF5', reversed: true },
];
const WALK_PATTERN_B = [
  { id: 'BF1', reversed: false },
  { id: 'BF2', reversed: false },
  { id: 'BF3', reversed: false },
  { id: 'BF4', reversed: false },
  { id: 'BF5', reversed: false },
];
const WALK_PATTERN_C = [
  { id: 'BB1', reversed: false },
  { id: 'BB2', reversed: false },
  { id: 'BB3', reversed: false },
  { id: 'BB4', reversed: false },
  { id: 'BB5', reversed: false },
];
const WALK_PATTERN_D = [
  { id: 'BB1', reversed: true },
  { id: 'BB2', reversed: true },
  { id: 'BB3', reversed: true },
  { id: 'BB4', reversed: true },
  { id: 'BB5', reversed: true },
];

//NOTE(jimmylee)
//SEQ walk order: [0,1,2,3,4] → [2,1,0,1,2,3,4,3] (8 frames).
function seqWalkOrder(frames) {
  return [frames[2], frames[1], frames[0], frames[1], frames[2], frames[3], frames[4], frames[3]];
}

export const WALK_FRAMES = [
  seqWalkOrder(WALK_PATTERN_A), // Step 0: idle A3 — Pattern A
  seqWalkOrder(WALK_PATTERN_B), // Step 1: idle A2 — SE (↓) default — Pattern B
  seqWalkOrder(WALK_PATTERN_B), // Step 2: idle A1 — Pattern B
  seqWalkOrder(WALK_PATTERN_C), // Step 3: idle A4 — SW (→) default — Pattern C
  seqWalkOrder(WALK_PATTERN_C), // Step 4: idle A5 — Pattern C
  seqWalkOrder(WALK_PATTERN_D), // Step 5: idle A4 F — NW (↑) default — Pattern D
  seqWalkOrder(WALK_PATTERN_D), // Step 6: idle A1 F — Pattern D
  seqWalkOrder(WALK_PATTERN_A), // Step 7: idle A2 F — NE (←) default — Pattern A
];

//NOTE(jimmylee)
//Walk-in-place hand frame sequences per rotation step.
//Retained as an export for tests — runtime reads from WALK_ASSEMBLY directly.
const WALK_HAND_PATTERN_A = [
  [
    { id: 'RF1', reversed: true },
    { id: 'LF1', reversed: true },
  ],
  [
    { id: 'RF2', reversed: true },
    { id: 'LF2', reversed: true },
  ],
  [
    { id: 'RF3', reversed: true },
    { id: 'LF3', reversed: true },
  ],
  [
    { id: 'RF4', reversed: true },
    { id: 'LF4', reversed: true },
  ],
  [
    { id: 'RF5', reversed: true },
    { id: 'LF5', reversed: true },
  ],
];
const WALK_HAND_PATTERN_B = [
  [
    { id: 'RF1', reversed: false },
    { id: 'LF1', reversed: false },
  ],
  [
    { id: 'RF2', reversed: false },
    { id: 'LF2', reversed: false },
  ],
  [
    { id: 'RF3', reversed: false },
    { id: 'LF3', reversed: false },
  ],
  [
    { id: 'RF4', reversed: false },
    { id: 'LF4', reversed: false },
  ],
  [
    { id: 'RF5', reversed: false },
    { id: 'LF5', reversed: false },
  ],
];
const WALK_HAND_PATTERN_C = [
  [
    { id: 'LB1', reversed: false },
    { id: 'RB1', reversed: false },
  ],
  [
    { id: 'LB2', reversed: false },
    { id: 'RB2', reversed: false },
  ],
  [
    { id: 'LB3', reversed: false },
    { id: 'RB3', reversed: false },
  ],
  [
    { id: 'LB4', reversed: false },
    { id: 'RB4', reversed: false },
  ],
  [
    { id: 'LB5', reversed: false },
    { id: 'RB5', reversed: false },
  ],
];
const WALK_HAND_PATTERN_D = [
  [
    { id: 'LB1', reversed: true },
    { id: 'RB1', reversed: true },
  ],
  [
    { id: 'LB2', reversed: true },
    { id: 'RB2', reversed: true },
  ],
  [
    { id: 'LB3', reversed: true },
    { id: 'RB3', reversed: true },
  ],
  [
    { id: 'LB4', reversed: true },
    { id: 'RB4', reversed: true },
  ],
  [
    { id: 'LB5', reversed: true },
    { id: 'RB5', reversed: true },
  ],
];

export const WALK_HAND_FRAMES = [
  seqWalkOrder(WALK_HAND_PATTERN_A), // Step 0 — Pattern A
  seqWalkOrder(WALK_HAND_PATTERN_B), // Step 1 — Pattern B (SE default)
  seqWalkOrder(WALK_HAND_PATTERN_B), // Step 2 — Pattern B
  seqWalkOrder(WALK_HAND_PATTERN_C), // Step 3 — Pattern C (SW default)
  seqWalkOrder(WALK_HAND_PATTERN_C), // Step 4 — Pattern C
  seqWalkOrder(WALK_HAND_PATTERN_D), // Step 5 — Pattern D (NW default)
  seqWalkOrder(WALK_HAND_PATTERN_D), // Step 6 — Pattern D
  seqWalkOrder(WALK_HAND_PATTERN_A), // Step 7 — Pattern A (NE default)
];

//NOTE(jimmylee)
//Overlay data read directly from WALK_ASSEMBLY.
//WALK_ASSEMBLY hands are in visual display order (varies per pattern).
//R* sprites (RF/RB) are always behind, L* sprites (LF/LB) are always in front.

//NOTE(jimmylee)
//Walk cycle per-frame delays from SEQ 6/7 binary data (ticks at 60fps → seconds).
const WALK_DELAYS_S = [6, 8, 10, 8, 6, 8, 10, 8].map((t) => t / 60);
const WALK_CYCLE_DURATION = WALK_DELAYS_S.reduce((a, b) => a + b, 0);

//NOTE(jimmylee)
//Per-pattern pre-resolved walk lookups. All walk patterns are static, so these resolve
//identically for the lifetime of the program — the hot path indexes tables instead of
//branching or doing string ops per frame.
//
//WALK_PATTERN_FLIP_X[patternIdx]      — composite horizontal flip factor (-1/+1)
//WALK_PATTERN_BEHIND[patternIdx][baseIdx] — R* hand (renders behind body)
//WALK_PATTERN_FRONT[patternIdx][baseIdx]  — L* hand (renders in front of body)
const WALK_PATTERN_FLIP_X = WALK_ASSEMBLY.map((p) => (p.body[0].reversed ? -1 : 1));
const WALK_PATTERN_BEHIND = WALK_ASSEMBLY.map((pattern) =>
  pattern.hands.map((pair) => (pair[0].id.startsWith('R') ? pair[0] : pair[1]))
);
const WALK_PATTERN_FRONT = WALK_ASSEMBLY.map((pattern) =>
  pattern.hands.map((pair) => (pair[0].id.startsWith('R') ? pair[1] : pair[0]))
);

//NOTE(jimmylee)
//Creates a walk group (Mode I): billboard composite with 3 meshes.
//Scale factors derived from the body plane geometry — same pixel math as the main route.
//The group copies camera.quaternion so all children face the camera as one unit.
export function createWalkGroup({ node, textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh, mode }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;

  //NOTE(jimmylee)
  //Billboard composite scale factors derived from the body plane.
  //The body plane is spriteWidth × spriteHeight world units, covering BODY_W × MAX_CONTAINER_H pixels.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  //NOTE(jimmylee)
  //Walk body heights are constant (BF/BB bodies are 40px, equal to MAX_CONTAINER_H),
  //so scale.y collapses to 1 for all walk frames. Pre-compute it once per group so the
  //per-frame walk path avoids a division. Body Y follows the walk bob (WALK_BOB_DY,
  //folded into each base frame's `anchor`).
  const WALK_BODY_SCALE_Y = BASE_BODY_HEIGHTS[0] / MAX_CONTAINER_H;

  //NOTE(jimmylee)
  //A1 overlays use combined walk+jump max bounds so jump animation sprites fit.
  const behindMaxW = mode === 'A1' ? A1_BEHIND_MAX_W : BEHIND_HAND_MAX_W;
  const behindMaxH = mode === 'A1' ? A1_BEHIND_MAX_H : BEHIND_HAND_MAX_H;
  const frontMaxW = mode === 'A1' ? A1_FRONT_MAX_W : FRONT_HAND_MAX_W;
  const frontMaxH = mode === 'A1' ? A1_FRONT_MAX_H : FRONT_HAND_MAX_H;

  const behindHand = createBillboardOverlay(textures, behindMaxW, behindMaxH, scaleX, scaleY);
  const frontHand = createBillboardOverlay(textures, frontMaxW, frontMaxH, scaleX, scaleY);

  //NOTE(jimmylee)
  //Start in idle — walk animation begins after character settles (lands).
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
  //Character state on group — all sprite logic reads from here.
  group.userData.character = createCharacterState({
    mode: mode || 'I',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      behindHandTexture: behindHand.texture,
      frontHandTexture: frontHand.texture,
      walkDirection: direction || null,
      walkStopped: false,
    },
  });

  setVisualDriver(group, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this.parent, camera)) return;

    //NOTE(jimmylee)
    //Billboard the group — see AGENTS.md "Billboard Composite Pattern" step 9.
    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;

    //NOTE(jimmylee)
    //Stab Lv3 animation for A1 — non-looping 9-frame sequence from STAB_LV3_ASSEMBLY.
    //4-tile full-body composition: farBehind + body + head + front.
    //Reuses behind/front overlays from walk group; head overlay created at A1 registration.
    if (ch._attackAction && ch.mode === 'A1') {
      const stabElapsed = (camera.userData.now - ch._attackAction.startTime) / 1000;
      const { frameIdx } = resolveVariableFrame(STAB_LV3_DELAYS_S, stabElapsed);

      const patternIdx = ASSEMBLY_STEP_MAP[idx];
      const stabPattern = STAB_LV3_ASSEMBLY[patternIdx];
      const assemblyFrame = stabPattern.frames[frameIdx];
      const reversed = stabPattern.reversed;
      const flipX = reversed ? -1 : 1;

      const bodyH = STAB_LV3_BODY_HEIGHTS[patternIdx][frameIdx];
      this.scale.y = bodyH / MAX_CONTAINER_H;
      //NOTE(jimmylee)
      //SEQ 100/101 unit motion: 2px wind-up, then the thrust carries A1 1px forward.
      const move = seqMoveLocal(assemblyFrame.move, ch.directionOffset, camera, scaleY);
      const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX) + move.x;
      const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY) + move.y;
      this.position.set(bodyX, bodyY, 0);

      const behindChild = this.parent.children[1];
      const frontChild = this.parent.children[2];

      behindChild.visible = true;
      behindChild.renderOrder = FAR_BEHIND;
      positionOverlay(behindChild, assemblyFrame.farBehind, scaleX, scaleY, flipX, bodyY, behindMaxW, behindMaxH, bodyX);

      frontChild.visible = true;
      frontChild.renderOrder = IN_FRONT;
      positionOverlay(frontChild, assemblyFrame.front, scaleX, scaleY, flipX, bodyY, frontMaxW, frontMaxH, bodyX);

      if (ch._stabHeadMesh) {
        ch._stabHeadMesh.visible = true;
        ch._stabHeadMesh.renderOrder = 1;
        positionOverlay(ch._stabHeadMesh, assemblyFrame.head, scaleX, scaleY, flipX, bodyY, STAB_HEAD_MAX_W, STAB_HEAD_MAX_H, bodyX);
      }

      if (ch._castOverlayMesh) ch._castOverlayMesh.visible = false;

      if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
        ch.lastStep = step;
        ch.lastFrame = frameIdx;
        applySpriteFrame(this.material.map, assemblyFrame.body, reversed);
        applySpriteFrame(ch.behindHandTexture, assemblyFrame.farBehind.id, reversed);
        applySpriteFrame(ch.frontHandTexture, assemblyFrame.front.id, reversed);
        if (ch._stabHeadTexture) {
          applySpriteFrame(ch._stabHeadTexture, assemblyFrame.head.id, reversed);
        }
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(jimmylee)
    //Cast animation for A1 — 2-frame looping from CAST_ASSEMBLY.
    //Body shows CH1-CH4 with the SR17/SR18 legs strip behind it (SHP F35-F38 order).
    if (ch._castAction && ch.mode === 'A1') {
      const castElapsed = (camera.userData.now - ch._castAction.startTime) / 1000;
      const frameIdx = Math.floor(castElapsed / CAST_FRAME_S) % CAST_FRAME_COUNT;

      const patternIdx = ASSEMBLY_STEP_MAP[idx];
      const castPattern = CAST_ASSEMBLY[patternIdx];
      const castFrame = castPattern.frames[frameIdx];
      const reversed = castPattern.reversed;
      const flipX = reversed ? -1 : 1;

      const bodyH = CAST_BODY_HEIGHTS[patternIdx][frameIdx];
      this.scale.y = bodyH / MAX_CONTAINER_H;
      const bodyX = anchorBodyX(castFrame.anchor, scaleX, flipX);
      const bodyY = anchorBodyY(castFrame.anchor, scaleY);
      this.position.set(bodyX, bodyY, 0);

      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      if (ch._stabHeadMesh) ch._stabHeadMesh.visible = false;

      if (ch._castOverlayMesh) {
        ch._castOverlayMesh.visible = true;
        ch._castOverlayMesh.renderOrder = BEHIND;
        const overlaySprite = SPRITE_MAP[castFrame.overlay];
        ch._castOverlayMesh.position.set(
          bodyX + castFrame.overlayDx * scaleX * flipX,
          bodyY + (-castFrame.overlayDy) * scaleY,
          0
        );
        ch._castOverlayMesh.scale.x = overlaySprite.w / CAST_OVERLAY_MAX_W;
        ch._castOverlayMesh.scale.y = overlaySprite.h / CAST_OVERLAY_MAX_H;
      }

      if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
        ch.lastStep = step;
        ch.lastFrame = frameIdx;
        applySpriteFrame(this.material.map, castFrame.body, reversed);
        if (ch._castOverlayTexture) {
          applySpriteFrame(ch._castOverlayTexture, castFrame.overlay, reversed);
        }
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(@jimmylee)
    //Jump animation — take-off, then the Mid Jump pose until landing (playerJumpFrame), then
    //High Jump Land while the unit stands still (playerLandFrame).
    //Plays during a scripted jump. Gated on `_jumpAction` and `_landedAt` alone — no other mode sets
    //those fields, so a mode check would be redundant.
    const landFrame = !ch._jumpAction && ch._landedAt !== undefined && ch.walkStopped && ch.state === State.IDLE ? playerLandFrame((camera.userData.now - ch._landedAt) / 1000) : -1;
    if (ch._jumpAction || landFrame >= 0) {
      this.parent.children[1].visible = true;
      this.parent.children[2].visible = true;
      if (ch._castOverlayMesh) ch._castOverlayMesh.visible = false;
      if (ch._stabHeadMesh) ch._stabHeadMesh.visible = false;

      const frameIdx = ch._jumpAction ? playerJumpFrame((camera.userData.now - ch._jumpAction.startTime) / 1000) : landFrame;

      const patternIdx = ASSEMBLY_STEP_MAP[idx];
      const jumpPattern = JUMP_ASSEMBLY[patternIdx];
      const assemblyFrame = jumpPattern.frames[frameIdx];
      const bodyId = assemblyFrame.body;
      const reversed = jumpPattern.reversed;
      const flipX = reversed ? -1 : 1;

      this.scale.y = JUMP_BODY_HEIGHTS[patternIdx][frameIdx] / MAX_CONTAINER_H;
      const move = seqMoveLocal(assemblyFrame.move, ch.directionOffset, camera, scaleY);
      const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX) + move.x;
      const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY) + move.y;
      this.position.set(bodyX, bodyY, 0);

      const behindHandMesh = this.parent.children[1];
      const frontHandMesh = this.parent.children[2];

      if (assemblyFrame.behind) {
        behindHandMesh.visible = true;
        positionOverlay(behindHandMesh, assemblyFrame.behind, scaleX, scaleY, flipX, bodyY, behindMaxW, behindMaxH, bodyX);
        behindHandMesh.renderOrder = BEHIND;
      } else {
        behindHandMesh.visible = false;
      }

      if (assemblyFrame.front) {
        frontHandMesh.visible = true;
        positionOverlay(frontHandMesh, assemblyFrame.front, scaleX, scaleY, flipX, bodyY, frontMaxW, frontMaxH, bodyX);
        frontHandMesh.renderOrder = IN_FRONT;
      } else {
        frontHandMesh.visible = false;
      }

      if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
        ch.lastStep = step;
        ch.lastFrame = frameIdx;
        applySpriteFrame(this.material.map, bodyId, reversed);
        if (assemblyFrame.behind) {
          applySpriteFrame(ch.behindHandTexture, assemblyFrame.behind.id, reversed);
        }
        if (assemblyFrame.front) {
          applySpriteFrame(ch.frontHandTexture, assemblyFrame.front.id, reversed);
        }
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(jimmylee)
    //Idle state: character has not settled yet (falling from spawn),
    //or player character is standing still (walkStopped).
    //Show the full idle sprite (P1-P5) with hands hidden.
    if (ch.state === State.FALLING || ch.state === State.SPAWNING || ch.walkStopped) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      if (ch._stabHeadMesh) ch._stabHeadMesh.visible = false;
      if (ch._castOverlayMesh) ch._castOverlayMesh.visible = false;

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
    //Walk pose — hands visible, body at identity scale. Walk bodies (BF/BB) are
    //40px = MAX_CONTAINER_H, so WALK_BODY_SCALE_Y = 1 resolves once per group.
    this.parent.children[1].visible = true;
    this.parent.children[2].visible = true;
    if (ch._stabHeadMesh) ch._stabHeadMesh.visible = false;
    if (ch._castOverlayMesh) ch._castOverlayMesh.visible = false;
    this.scale.y = WALK_BODY_SCALE_Y;

    //NOTE(jimmylee)
    //Walk frame resolution via pre-resolved per-pattern lookups keyed by patternIdx.
    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const walkPattern = WALK_ASSEMBLY[patternIdx];
    const elapsedRaw = (camera.userData.now - ch.walkStart) / 1000;
    const { frameIdx } = resolveLoopingFrame(WALK_DELAYS_S, WALK_CYCLE_DURATION, elapsedRaw);

    const baseIdx = SEQ_FRAME_MAP[frameIdx];
    const behind = WALK_PATTERN_BEHIND[patternIdx][baseIdx];
    const front = WALK_PATTERN_FRONT[patternIdx][baseIdx];

    //NOTE(jimmylee)
    //Body frame from assembly base frames (SEQ ping-pong order via SEQ_FRAME_MAP).
    const frame = walkPattern.body[baseIdx];

    //NOTE(jimmylee)
    //flipX is constant per pattern (all frames in a pattern share `reversed`),
    //so the per-frame ternary collapses to a table lookup.
    const flipX = WALK_PATTERN_FLIP_X[patternIdx];

    //NOTE(jimmylee)
    //Body position from the SHP anchor — the stride frames sink 1-2px (walk bob).
    const bodyX = anchorBodyX(frame.anchor, scaleX, flipX);
    const bodyY = anchorBodyY(frame.anchor, scaleY);
    this.position.set(bodyX, bodyY, 0);

    const behindHandMesh = this.parent.children[1];
    const frontHandMesh = this.parent.children[2];

    //NOTE(jimmylee)
    //Behind hand position = body center + pixel offset × scale × flipX.
    positionOverlay(behindHandMesh, behind, scaleX, scaleY, flipX, bodyY, behindMaxW, behindMaxH, bodyX);
    behindHandMesh.renderOrder = BEHIND;

    //NOTE(jimmylee)
    //Front hand position = body center + pixel offset × scale × flipX.
    positionOverlay(frontHandMesh, front, scaleX, scaleY, flipX, bodyY, frontMaxW, frontMaxH, bodyX);
    frontHandMesh.renderOrder = IN_FRONT;

    //NOTE(jimmylee)
    //Apply body + overlay sprite UVs when step or frame changes.
    if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
      ch.lastStep = step;
      ch.lastFrame = frameIdx;
      applySpriteFrame(this.material.map, frame.id, frame.reversed);
      applySpriteFrame(ch.behindHandTexture, behind.id, frame.reversed);
      applySpriteFrame(ch.frontHandTexture, front.id, frame.reversed);
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(jimmylee)
//Mode I (walk in place): default walk-group factory signature is already
//registry-compatible.
registerCharacterMode('I', createWalkGroup);

//NOTE(jimmylee)
//Mode W (walking NPC): reuses createWalkGroup with a `mode: 'W'` flag that
//enables NPC-specific rendering paths in the shared group.
registerCharacterMode('W', (opts) => createWalkGroup({ ...opts, mode: 'W' }));

//NOTE(jimmylee)
//Mode A1 (player): reuses createWalkGroup and adds the stab and cast overlays.
registerCharacterMode('A1', ({ node, textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) => {
  const group = createWalkGroup({ node, textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh, mode: 'A1' });

  //NOTE(jimmylee)
  //Extra overlay meshes for A1's stab and cast animations. Both are hidden during walk/idle and shown
  //only by their actions.
  const a1ScaleX = bodyMesh.geometry.parameters.width / BODY_W;
  const a1ScaleY = bodyMesh.geometry.parameters.height / MAX_CONTAINER_H;

  const stabHeadOverlay = createBillboardOverlay(textures, STAB_HEAD_MAX_W, STAB_HEAD_MAX_H, a1ScaleX, a1ScaleY);
  stabHeadOverlay.mesh.visible = false;
  stabHeadOverlay.mesh.renderOrder = 1;
  group.add(stabHeadOverlay.mesh);
  group.userData.character._stabHeadMesh = stabHeadOverlay.mesh;
  group.userData.character._stabHeadTexture = stabHeadOverlay.texture;

  const castOverlay = createBillboardOverlay(textures, CAST_OVERLAY_MAX_W, CAST_OVERLAY_MAX_H, a1ScaleX, a1ScaleY);
  castOverlay.mesh.visible = false;
  castOverlay.mesh.renderOrder = BEHIND;
  group.add(castOverlay.mesh);
  group.userData.character._castOverlayMesh = castOverlay.mesh;
  group.userData.character._castOverlayTexture = castOverlay.texture;

  return group;
}, { directional: false });

//NOTE(jimmylee)
//A1 has a non-directional symbol — `A1` resolves directly via the existing
//`directionalMap['A1']` entry that points at the character factory. Register
//its meshData here so the registry stays the single source of truth.
registerBlockType({
  symbol: 'A1',
  meshData: { mass: 3, shape: 'CUSTOM_CHARACTER' },
});
