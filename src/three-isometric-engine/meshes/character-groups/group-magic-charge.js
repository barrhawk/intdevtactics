//NOTE(jimmylee)
//Magic Charge mode (Mode C) — billboard composite. See AGENTS.md for shared architecture.
//2-frame loop at 333ms/frame. CH bodies are 32×32 (shorter than 32×40).
//Same 40px stance scale as walk; CH bodies sit 4px above the stance center (SHP anchor).
//SR17/SR18 overlay is the waist-to-feet strip, drawn BEHIND the CH body (SHP F35-F38 tile
//order) so the robe hem covers its top rows. 2 meshes: body + overlay.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { CAST_ASSEMBLY } from '@engine/constants/sprites/assembly';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, BEHIND, azimuthToStep, applySpriteFrame, createBillboardOverlay, anchorBodyX, anchorBodyY, isCharacterOnScreen, placeIdleBody, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { computeActionReadyAt } from '@engine/actions/action-timing';
import { State } from '@engine/actions/character-state';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';
//NOTE(jimmylee)
//Per-frame body heights (pixels) — dynamically derived from SPRITE_MAP.
//Cast bodies (CH1-CH4) are 32×32 — shorter than the standard 32×40.
const BODY_HEIGHTS = CAST_ASSEMBLY[0].frames.map((f) => SPRITE_MAP[f.body].h);

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance; CH bodies are placed by their SHP anchor.
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

//NOTE(jimmylee)
//Max overlay dimensions — dynamically derived from all overlay sprites in CAST_ASSEMBLY.
//SR17 and SR18 are both 32×16.
let OVERLAY_MAX_W = 0;
let OVERLAY_MAX_H = 0;
for (const pattern of CAST_ASSEMBLY) {
  for (const frame of pattern.frames) {
    const c = SPRITE_MAP[frame.overlay];
    OVERLAY_MAX_W = Math.max(OVERLAY_MAX_W, c.w);
    OVERLAY_MAX_H = Math.max(OVERLAY_MAX_H, c.h);
  }
}

//NOTE(jimmylee)
//Magic Charge (SEQ 64-65) frame sequences per rotation step.
//Each step has 2 frames that loop at 333ms per frame (667ms total cycle).
const CAST_PATTERN_A = [
  { body: 'CH1', overlay: 'SR17', reversed: true },
  { body: 'CH2', overlay: 'SR17', reversed: true },
];
const CAST_PATTERN_B = [
  { body: 'CH1', overlay: 'SR17', reversed: false },
  { body: 'CH2', overlay: 'SR17', reversed: false },
];
const CAST_PATTERN_C = [
  { body: 'CH3', overlay: 'SR18', reversed: false },
  { body: 'CH4', overlay: 'SR18', reversed: false },
];
const CAST_PATTERN_D = [
  { body: 'CH3', overlay: 'SR18', reversed: true },
  { body: 'CH4', overlay: 'SR18', reversed: true },
];

export const CAST_FRAMES = [
  CAST_PATTERN_A, // Step 0 — Cast Pattern A
  CAST_PATTERN_B, // Step 1 — Cast Pattern B (SE default)
  CAST_PATTERN_B, // Step 2 — Cast Pattern B
  CAST_PATTERN_C, // Step 3 — Cast Pattern C (SW default)
  CAST_PATTERN_C, // Step 4 — Cast Pattern C
  CAST_PATTERN_D, // Step 5 — Cast Pattern D (NW default)
  CAST_PATTERN_D, // Step 6 — Cast Pattern D
  CAST_PATTERN_A, // Step 7 — Cast Pattern A (NE default)
];

//NOTE(jimmylee)
//Overlay data read directly from CAST_ASSEMBLY.

const CAST_FRAME_COUNT = 2;
const CAST_FRAME_DURATION = 1 / 3;

//NOTE(jimmylee)
//Creates a cast group (Mode C): billboard composite with 2 meshes.
//Scale factors derived from the body plane geometry — same pixel math as the main route.
//The group copies camera.quaternion so all children face the camera as one unit.
export function createCastGroup({ node, textures, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;

  //NOTE(jimmylee)
  //Billboard composite scale factors derived from the body plane.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const overlay = createBillboardOverlay(textures, OVERLAY_MAX_W, OVERLAY_MAX_H, scaleX, scaleY);

  //NOTE(jimmylee)
  //Start in idle — cast animation begins after character settles (lands).
  const initialIdx = directionOffset;
  const idleFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);

  bodyMesh.renderOrder = 0;
  bodyMesh.castShadow = false;
  //NOTE(jimmylee)
  //Overlay starts hidden — idle sprite (P1-P5) has no magic circle.
  overlay.mesh.renderOrder = BEHIND;
  overlay.mesh.visible = false;

  const group = new THREE.Group();
  group.add(bodyMesh);       // children[0]
  group.add(overlay.mesh);   // children[1]

  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  //NOTE(jimmylee)
  //actionReadyAt: 0 at creation so the first cast fires immediately on settle.
  //After the first cast completes, cooldown + idle dwell applies — see action-timing.js.
  group.userData.character = createCharacterState({
    mode: 'C',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      overlayTexture: overlay.texture,
      actionReadyAt: 0,
    },
  });

  //NOTE(jimmylee)
  //Body onBeforeRender: billboard the GROUP, resolve frame, position all children
  //using pure pixel offsets × scale factors — same math as the main route PositionedSpriteSlice.
  setVisualDriver(group, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this.parent, camera)) return;

    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;

    //NOTE(jimmylee)
    //Idle state: character has not settled yet (falling from spawn) or is spawning.
    //Show the full idle sprite (P1-P5) with overlay hidden.
    if (ch.state === State.FALLING || ch.state === State.SPAWNING) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;

      if (step !== ch.lastStep) {
        ch.lastStep = step;
        ch.lastFrame = -1;
        const idleFrame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, idleFrame.id, idleFrame.reversed);
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    this.parent.children[1].visible = true;

    //NOTE(jimmylee)
    //Cast frame resolution: 2-frame loop at 333ms per frame.
    const elapsed = (camera.userData.now - ch.walkStart) / 1000;
    const frameIdx = Math.floor(elapsed / CAST_FRAME_DURATION) % CAST_FRAME_COUNT;

    //NOTE(jimmylee)
    //Read overlay data from CAST_ASSEMBLY for the current rotation step.
    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const assemblyFrame = CAST_ASSEMBLY[patternIdx].frames[frameIdx];
    const frame = CAST_FRAMES[idx][frameIdx];

    //NOTE(jimmylee)
    //Reversed patterns flip the entire composite horizontally — same as CSS scaleX(-1).
    const flipX = frame.reversed ? -1 : 1;

    //NOTE(jimmylee)
    //Body scale and position from the SHP anchor. CH bodies are 32px tall.
    const bodyH = BODY_HEIGHTS[frameIdx];
    this.scale.y = bodyH / MAX_CONTAINER_H;
    const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX);
    const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY);
    this.position.set(bodyX, bodyY, 0);

    const overlayMesh = this.parent.children[1];

    //NOTE(jimmylee)
    //Overlay position = body center + pixel offset × scale × flipX.
    //overlayDy:16 places the legs strip 16px below body center, behind the body.
    overlayMesh.position.set(
      bodyX + assemblyFrame.overlayDx * scaleX * flipX,
      bodyY + (-assemblyFrame.overlayDy) * scaleY,
      0
    );
    overlayMesh.renderOrder = BEHIND;

    const oCell = SPRITE_MAP[assemblyFrame.overlay];
    overlayMesh.scale.x = oCell.w / OVERLAY_MAX_W;
    overlayMesh.scale.y = oCell.h / OVERLAY_MAX_H;

    //NOTE(jimmylee)
    //Apply body + overlay sprite UVs when step or frame changes.
    if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
      ch.lastStep = step;
      ch.lastFrame = frameIdx;
      applySpriteFrame(this.material.map, frame.body, frame.reversed);
      applySpriteFrame(ch.overlayTexture, frame.overlay, frame.reversed);
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(jimmylee)
//Mode C (magic charge): factory signature already matches the registry shape.
registerCharacterMode('C', createCastGroup);
