//NOTE(jimmylee)
//Throw stone mode (Mode TS) — billboard composite. See AGENTS.md for shared architecture.
//SEQ 208/209: 12-frame non-looping cinematic throw-attack combo.
//7 meshes: body + farBehind + behind + head + over + front + buffer.
//
//The caller carries and releases the stone. This file only handles visuals,
//enabling frustum culling to skip billboard updates for off-screen characters.
//
//Throw-stone-specific:
//  Variable body heights: P2/P4=40, HR1/HR2=16, KO3/KO4=32, SR19/SR20=32, AF/AB=32, BF3/BB3=40.
//  5 overlay types: farBehind (back hand, z:-2), behind (z:-1), head (z:1), over (aura, z:1), front (z:2).
//  Pattern-dependent delays: FWD for patterns A/B (SEQ 208), BCK for C/D (SEQ 209).
//  Same 40px stance scale as walk; each body sits at its SHP anchor (BODY_ANCHOR_MAP).

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { THROW_STONE_ASSEMBLY } from '@engine/constants/sprites/assembly';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, FAR_BEHIND, BEHIND, IN_FRONT, resolveVariableFrame, azimuthToStep, applySpriteFrame, createBillboardOverlay, createBufferMesh, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { registerCharacterMode } from '@engine/common/registry';
import { THROW_STONE_DELAY_MAP } from '@engine/actions/action-timelines';
import { createCharacterState } from '@engine/meshes/character-state-init';

//NOTE(jimmylee)
//Per-pattern, per-frame body heights (pixels) — dynamically derived from SPRITE_MAP.
//All patterns produce identical heights at each frame index (front/back sprites are same size).
const BODY_HEIGHTS = THROW_STONE_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => SPRITE_MAP[f.body].h)
);

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance — the same pixel scale as walk and idle.
//Bodies are placed by their SHP anchor; the F31/F33 aura (AU1/AU2) reaches 1px below the
//stance bottom exactly as TYPE1.SHP draws it.
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

//NOTE(jimmylee)
//Throw stone body frames: 12 frames per rotation step, derived from assembly data.
//Each pattern maps body IDs + reversed flag from THROW_STONE_ASSEMBLY.
const THROW_STONE_PATTERNS = THROW_STONE_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => ({ id: f.body, reversed: pattern.reversed }))
);

export const THROW_STONE_FRAMES = [
  THROW_STONE_PATTERNS[0], // Step 0 — Pattern A
  THROW_STONE_PATTERNS[1], // Step 1 — Pattern B (SE default)
  THROW_STONE_PATTERNS[1], // Step 2 — Pattern B
  THROW_STONE_PATTERNS[2], // Step 3 — Pattern C (SW default)
  THROW_STONE_PATTERNS[2], // Step 4 — Pattern C
  THROW_STONE_PATTERNS[3], // Step 5 — Pattern D (NW default)
  THROW_STONE_PATTERNS[3], // Step 6 — Pattern D
  THROW_STONE_PATTERNS[0], // Step 7 — Pattern A (NE default)
];


//NOTE(jimmylee)
//Overlay max bounding boxes — used for mesh creation at max size, per-frame scaling adjusts.
//farBehind: LG series (all 24x24) -> 24x24.
const FAR_BEHIND_MAX_W = 24;
const FAR_BEHIND_MAX_H = 24;

//NOTE(jimmylee)
//behind: DF2/DB2 (32x16), EF1/EFR3-5 (24x24) -> 32x24.
const BEHIND_MAX_W = 32;
const BEHIND_MAX_H = 24;

//NOTE(jimmylee)
//head: SP3/SP2 (24x16), TF1/TF2/TB1/TB2 (24x24) -> 24x24.
const HEAD_MAX_W = 24;
const HEAD_MAX_H = 24;

//NOTE(jimmylee)
//over: AU1/AU2 (32x16) -> 32x16.
const OVER_MAX_W = 32;
const OVER_MAX_H = 16;

//NOTE(jimmylee)
//front: EF2/EFL3-5 (24x24), LG series (24x24) -> 24x24.
const FRONT_MAX_W = 24;
const FRONT_MAX_H = 24;

//NOTE(jimmylee)
//Creates a throw stone group (Mode TS): billboard composite with 7 meshes.
//Scale factors derived from the body plane geometry — same pixel math as the main route.
//The group copies camera.quaternion so all children face the camera as one unit.
//The visual driver is visual-only and uses frustum culling to skip off-screen characters.
export function createThrowStoneGroup({ node, textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;

  //NOTE(jimmylee)
  //Billboard composite scale factors derived from the body plane.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const farBehindMesh = createBillboardOverlay(textures, FAR_BEHIND_MAX_W, FAR_BEHIND_MAX_H, scaleX, scaleY);
  const behindMesh = createBillboardOverlay(textures, BEHIND_MAX_W, BEHIND_MAX_H, scaleX, scaleY);
  const headMesh = createBillboardOverlay(textures, HEAD_MAX_W, HEAD_MAX_H, scaleX, scaleY);
  const overMesh = createBillboardOverlay(textures, OVER_MAX_W, OVER_MAX_H, scaleX, scaleY);
  const frontMesh = createBillboardOverlay(textures, FRONT_MAX_W, FRONT_MAX_H, scaleX, scaleY);

  //NOTE(jimmylee)
  //Buffer mesh: invisible plane at the top of the billboard composite.
  //Anchors the group height to spriteHeight so all frames occupy the same vertical space.
  //Uses shared material/geometry from character-utils cache.
  const bufferObj = createBufferMesh(spriteHeight);

  //NOTE(jimmylee)
  //Start in idle — animation only plays on cooldown-driven trigger, not at creation.
  const initialIdx = directionOffset;
  const idleFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);
  farBehindMesh.mesh.visible = false;
  behindMesh.mesh.visible = false;
  headMesh.mesh.visible = false;
  overMesh.mesh.visible = false;
  frontMesh.mesh.visible = false;

  //NOTE(jimmylee)
  //Initial renderOrder.
  bodyMesh.renderOrder = 0;
  farBehindMesh.mesh.renderOrder = FAR_BEHIND;
  behindMesh.mesh.renderOrder = BEHIND;
  headMesh.mesh.renderOrder = 1;
  overMesh.mesh.renderOrder = 1;
  frontMesh.mesh.renderOrder = IN_FRONT;

  const group = new THREE.Group();
  group.add(bodyMesh);              // children[0]
  group.add(farBehindMesh.mesh);    // children[1]
  group.add(behindMesh.mesh);       // children[2]
  group.add(headMesh.mesh);         // children[3]
  group.add(overMesh.mesh);         // children[4]
  group.add(frontMesh.mesh);        // children[5]
  group.add(bufferObj);             // children[6]

  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  //NOTE(jimmylee)
  //Character state on group.
  //_actionLastFrame tracks the updater's frame progress independently from
  //the visual lastFrame, so frustum culling does not affect action firing.
  //actionReadyAt: 0 at creation so the first throw fires immediately on settle.
  //After the first throw completes, cooldown + idle dwell applies — see action-timing.js.
  group.userData.character = createCharacterState({
    mode: 'TS',
    directionOffset,
    walkStart: 0,
    billboardHeight: spriteHeight,
    extras: {
      direction,
      doneAt: 0,
      actionReadyAt: 0,
      _actionLastFrame: -1,
      farBehindTexture: farBehindMesh.texture,
      behindTexture: behindMesh.texture,
      headTexture: headMesh.texture,
      overTexture: overMesh.texture,
      frontTexture: frontMesh.texture,
    },
  });

  //NOTE(jimmylee)
  //Body onBeforeRender: visual-only billboard composite update.
  //This callback only does:
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
    //Idle state: show idle pose. The updater handles cooldown restart.
    if (ch.action === null) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      this.parent.children[3].visible = false;
      this.parent.children[4].visible = false;
      this.parent.children[5].visible = false;

      if (step !== ch.lastStep) {
        ch.lastStep = step;
        const idleFrame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, idleFrame.id, idleFrame.reversed);
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(@jimmylee)
    //Non-looping animation with pattern-dependent delays (THROW_STONE_DELAY_MAP, shared with the
    //action updater). Patterns A/B (front-facing) use SEQ 208, C/D (back-facing) SEQ 209.
    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const delays = THROW_STONE_DELAY_MAP[patternIdx];
    const elapsedRaw = (camera.userData.now - ch.walkStart) / 1000;
    const { frameIdx, done } = resolveVariableFrame(delays, elapsedRaw);

    if (done) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      this.parent.children[3].visible = false;
      this.parent.children[4].visible = false;
      this.parent.children[5].visible = false;
      const idleFrame = IDLE_FRAMES[idx];
      applySpriteFrame(this.material.map, idleFrame.id, idleFrame.reversed);
      this.parent.updateMatrixWorld(true);
      return;
    }

    const assemblyFrame = THROW_STONE_ASSEMBLY[patternIdx].frames[frameIdx];
    const frame = THROW_STONE_FRAMES[idx][frameIdx];

    //NOTE(jimmylee)
    //Reversed patterns flip the entire composite horizontally — same as CSS scaleX(-1).
    const flipX = frame.reversed ? -1 : 1;

    //NOTE(jimmylee)
    //Body scale and position from the SHP anchor.
    const bodyH = BODY_HEIGHTS[patternIdx][frameIdx];
    this.scale.y = bodyH / MAX_CONTAINER_H;
    const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX);
    const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY);
    this.position.set(bodyX, bodyY, 0);

    const farBehindChild = this.parent.children[1];
    const behindChild = this.parent.children[2];
    const headChild = this.parent.children[3];
    const overChild = this.parent.children[4];
    const frontChild = this.parent.children[5];

    //NOTE(jimmylee)
    //farBehind: back hand in 4-tile full-body compositions (frames 6-7, 9-10).
    //LG series hands, renderOrder FAR_BEHIND (-2).
    if (assemblyFrame.farBehind) {
      farBehindChild.visible = true;
      positionOverlay(farBehindChild, assemblyFrame.farBehind, scaleX, scaleY, flipX, bodyY, FAR_BEHIND_MAX_W, FAR_BEHIND_MAX_H, bodyX);
    } else {
      farBehindChild.visible = false;
    }

    //NOTE(jimmylee)
    //behind: DF2/DB2 (recoil frames), EF/EFR arms (recovery/aura frames).
    if (assemblyFrame.behind) {
      behindChild.visible = true;
      positionOverlay(behindChild, assemblyFrame.behind, scaleX, scaleY, flipX, bodyY, BEHIND_MAX_W, BEHIND_MAX_H, bodyX);
    } else {
      behindChild.visible = false;
    }

    //NOTE(jimmylee)
    //head: SP3/SP2 (small heads on HR1/HR2 frames) or TF/TB (full heads on AF/AB torsos).
    //renderOrder 1 — in front of body (0) but behind front hand (2).
    if (assemblyFrame.head) {
      headChild.visible = true;
      positionOverlay(headChild, assemblyFrame.head, scaleX, scaleY, flipX, bodyY, HEAD_MAX_W, HEAD_MAX_H, bodyX);
    } else {
      headChild.visible = false;
    }

    //NOTE(jimmylee)
    //over: AU1/AU2 aura at character's feet (frame 5 only).
    //renderOrder 1 — between body and front hand. Never appears with head simultaneously.
    if (assemblyFrame.over) {
      overChild.visible = true;
      positionOverlay(overChild, assemblyFrame.over, scaleX, scaleY, flipX, bodyY, OVER_MAX_W, OVER_MAX_H, bodyX);
    } else {
      overChild.visible = false;
    }

    //NOTE(jimmylee)
    //front: EF/EFL arms (standard frames) or LG hands (full-body frames).
    if (assemblyFrame.front) {
      frontChild.visible = true;
      positionOverlay(frontChild, assemblyFrame.front, scaleX, scaleY, flipX, bodyY, FRONT_MAX_W, FRONT_MAX_H, bodyX);
    } else {
      frontChild.visible = false;
    }

    //NOTE(jimmylee)
    //Apply body + overlay sprite UVs when step or frame changes.
    if (step !== ch.lastStep || frameIdx !== ch.lastFrame) {
      ch.lastStep = step;
      ch.lastFrame = frameIdx;

      applySpriteFrame(this.material.map, frame.id, frame.reversed);

      if (assemblyFrame.farBehind) {
        applySpriteFrame(ch.farBehindTexture, assemblyFrame.farBehind.id, frame.reversed);
      }
      if (assemblyFrame.behind) {
        applySpriteFrame(ch.behindTexture, assemblyFrame.behind.id, frame.reversed);
      }
      if (assemblyFrame.head) {
        applySpriteFrame(ch.headTexture, assemblyFrame.head.id, frame.reversed);
      }
      if (assemblyFrame.over) {
        applySpriteFrame(ch.overTexture, assemblyFrame.over.id, frame.reversed);
      }
      if (assemblyFrame.front) {
        applySpriteFrame(ch.frontTexture, assemblyFrame.front.id, frame.reversed);
      }
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(jimmylee)
//Mode TS (throw stone): factory signature already matches the registry shape.
registerCharacterMode('TS', createThrowStoneGroup);
