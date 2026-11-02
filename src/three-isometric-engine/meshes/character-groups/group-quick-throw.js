//NOTE(jimmylee)
//Quick throw mode (Mode T) — billboard composite. See AGENTS.md for shared architecture.
//SEQ 48/49: 6-frame non-looping quick throw action (400ms).
//6 meshes: body + behind hand + front hand + head + over + buffer.
//
//Quick-throw-specific:
//  Variable body heights: 40→16→32→16→40→32. Buffer mesh stabilizes group height.
//  Head sprites (SP3/SP2) are in the `head` field, not `front`.
//  Hand sprites (EF2/EFL5) are in the `front` field.
//  The overhead frame F31/F33 adds the AU1/AU2 robe hem (`over`) and the SEQ's 2px rise (`move`).
//  A caught marble (ch._heldMarble) is drawn on the hand.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { QUICK_THROW_ASSEMBLY, QUICK_THROW_DELAYS } from '@engine/constants/sprites/assembly';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, BEHIND, IN_FRONT, resolveVariableFrame, azimuthToStep, applySpriteFrame, createBillboardOverlay, createBufferMesh, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, seqMoveLocal, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { registerCharacterMode } from '@engine/common/registry';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { quickThrowMarblePoint } from '@engine/actions/action-timelines';

//NOTE(jimmylee)
//Per-frame body heights (pixels) — dynamically derived from SPRITE_MAP.
//All 4 patterns produce identical heights: P2/P4=40, HR1/HR2=16, KO3/KO4=32, BF3/BB3=40, SR19/SR20=32.
const BODY_HEIGHTS = QUICK_THROW_ASSEMBLY[0].frames.map((f) => SPRITE_MAP[f.body].h);

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance; bodies are placed by their SHP anchor
//(HR1/HR2 sit 5px below the stance center, KO3/KO4 4px).
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

//NOTE(@jimmylee)
//Quick throw body frames: 6 frames per rotation step, derived from assembly data.
const [QUICK_THROW_PATTERN_A, QUICK_THROW_PATTERN_B, QUICK_THROW_PATTERN_C, QUICK_THROW_PATTERN_D] = QUICK_THROW_ASSEMBLY.map((pattern) =>
  pattern.frames.map((f) => ({ id: f.body, reversed: pattern.reversed }))
);

export const QUICK_THROW_FRAMES = [
  QUICK_THROW_PATTERN_A, // Step 0 — Pattern A
  QUICK_THROW_PATTERN_B, // Step 1 — Pattern B (SE default)
  QUICK_THROW_PATTERN_B, // Step 2 — Pattern B
  QUICK_THROW_PATTERN_C, // Step 3 — Pattern C (SW default)
  QUICK_THROW_PATTERN_C, // Step 4 — Pattern C
  QUICK_THROW_PATTERN_D, // Step 5 — Pattern D (NW default)
  QUICK_THROW_PATTERN_D, // Step 6 — Pattern D
  QUICK_THROW_PATTERN_A, // Step 7 — Pattern A (NE default)
];

//NOTE(jimmylee)
//Overlay data read directly from QUICK_THROW_ASSEMBLY (SEQ 48/49).
//Each pattern has 6 frames with behind/front overlay data (or null).

//NOTE(jimmylee)
//Behind hand max bounding box: DF2=32x16, DB2=32x16, EF1=24x24, EFR3-5=24x24 → 32x24.
const BEHIND_HAND_MAX_W = 32;
const BEHIND_HAND_MAX_H = 24;

//NOTE(jimmylee)
//Front hand max bounding box: EF2=24x24, EFL3-5=24x24 → 24x24.
const FRONT_HAND_MAX_W = 24;
const FRONT_HAND_MAX_H = 24;

//NOTE(jimmylee)
//Head max bounding box: SP3=24x16, SP2=24x16 → 24x16.
const HEAD_MAX_W = 24;
const HEAD_MAX_H = 16;

//NOTE(@jimmylee)
//Over max bounding box: AU1/AU2 = 32x16.
const OVER_MAX_W = 32;
const OVER_MAX_H = 16;

//NOTE(@jimmylee)
//Quick throw per-frame delays from SEQ 48/49 binary data (ms → seconds).
//[4, 4, 8, 2, 4, 2] ticks = 24 ticks = 400ms total. Non-looping: plays once, returns to idle.
const QUICK_THROW_DELAYS_S = QUICK_THROW_DELAYS.map((ms) => ms / 1000);

//NOTE(@jimmylee)
//Scratch point for the caught marble (reused every frame).
const _marblePoint = { x: 0, y: 0, z: 0 };

//NOTE(jimmylee)
//Creates a quick throw group (Mode T): billboard composite with 6 meshes.
//Scale factors derived from the body plane geometry — same pixel math as the main route.
//The group copies camera.quaternion so all children face the camera as one unit.
export function createQuickThrowGroup({ node, textures, direction, directionOffset, walkStart, now, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;

  //NOTE(jimmylee)
  //Billboard composite scale factors derived from the body plane.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const behindHand = createBillboardOverlay(textures, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, scaleX, scaleY);
  const frontHand = createBillboardOverlay(textures, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, scaleX, scaleY);
  const head = createBillboardOverlay(textures, HEAD_MAX_W, HEAD_MAX_H, scaleX, scaleY);
  const over = createBillboardOverlay(textures, OVER_MAX_W, OVER_MAX_H, scaleX, scaleY);

  //NOTE(jimmylee)
  //Buffer mesh: invisible plane at the top of the billboard composite.
  //Anchors the group height to spriteHeight so all frames occupy the same vertical space.
  //Uses shared material/geometry from character-utils cache.
  const bufferMesh = createBufferMesh(spriteHeight);

  //NOTE(jimmylee)
  //Resolve initial frame state. `now` is the shared per-frame timestamp
  //threaded down from `createCharacter`, so
  //the elapsed-time math observes the same hoisted timer the render loop
  //already paid for. Mode T's wrapper offsets `walkStart` by -1000ms so the
  //400ms animation reads as "already done" on creation; with `now === walkStart
  //+ 1000`, `initialElapsed === 1.0` and `resolveVariableFrame` returns
  //`done: true`, landing the character in idle. Other call sites pass
  //`now === walkStart` for `initialElapsed === 0`.
  const initialIdx = directionOffset;
  const initialElapsed = (now - walkStart) / 1000;
  const { frameIdx: initialFrameIdx, done: initialDone } = resolveVariableFrame(QUICK_THROW_DELAYS_S, initialElapsed);
  //NOTE(jimmylee)
  //If the animation already finished before this group was created, start in idle.
  if (initialDone) {
    const idleFrame = IDLE_FRAMES[initialIdx];
    applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
    placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);
    behindHand.mesh.visible = false;
    frontHand.mesh.visible = false;
    head.mesh.visible = false;
    over.mesh.visible = false;
  } else {
    const initialFrame = QUICK_THROW_FRAMES[initialIdx][initialFrameIdx];
    applySpriteFrame(bodyMesh.material.map, initialFrame.id, initialFrame.reversed);

    //NOTE(jimmylee)
    //Apply initial body scale and position.
    const initialBodyH = BODY_HEIGHTS[initialFrameIdx];
    const initialPattern = QUICK_THROW_ASSEMBLY[ASSEMBLY_STEP_MAP[initialIdx]];
    const initialAssemblyFrame = initialPattern.frames[initialFrameIdx];
    bodyMesh.scale.y = initialBodyH / MAX_CONTAINER_H;
    bodyMesh.position.x = anchorBodyX(initialAssemblyFrame.anchor, scaleX, initialPattern.reversed ? -1 : 1);
    bodyMesh.position.y = anchorBodyY(initialAssemblyFrame.anchor, scaleY);

    //NOTE(jimmylee)
    //Set initial overlay visibility from QUICK_THROW_ASSEMBLY.
    behindHand.mesh.visible = initialAssemblyFrame.behind !== null;
    frontHand.mesh.visible = initialAssemblyFrame.front !== null;
    head.mesh.visible = initialAssemblyFrame.head !== null;
    over.mesh.visible = !!initialAssemblyFrame.over;
  }

  //NOTE(jimmylee)
  //Initial renderOrder.
  bodyMesh.renderOrder = 0;
  behindHand.mesh.renderOrder = BEHIND;
  frontHand.mesh.renderOrder = IN_FRONT;
  head.mesh.renderOrder = IN_FRONT;
  over.mesh.renderOrder = 1;

  const group = new THREE.Group();
  group.add(bodyMesh);          // children[0]
  group.add(behindHand.mesh);   // children[1]
  group.add(frontHand.mesh);    // children[2]
  group.add(head.mesh);         // children[3]
  group.add(over.mesh);         // children[4]
  group.add(bufferMesh);        // children[5]

  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  //NOTE(jimmylee)
  //Character state on group.
  group.userData.character = createCharacterState({
    mode: 'T',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      direction: direction || 'SE',
      _heldMarble: null,
      behindHandTexture: behindHand.texture,
      frontHandTexture: frontHand.texture,
      headTexture: head.texture,
      overTexture: over.texture,
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
    //After the animation finishes, show idle pose for the current rotation step.
    //Reset body to full scale and center, hide all overlays.
    if (ch.action === null) {
      ch._heldMarble = null;
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      this.parent.children[3].visible = false;
      this.parent.children[4].visible = false;

      if (step !== ch.lastStep) {
        ch.lastStep = step;
        const idleFrame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, idleFrame.id, idleFrame.reversed);
      }

      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(jimmylee)
    //Non-looping animation: plays once, then returns to idle.
    const elapsedRaw = (camera.userData.now - ch.walkStart) / 1000;
    const { frameIdx, done } = resolveVariableFrame(QUICK_THROW_DELAYS_S, elapsedRaw);

    if (done) {
      ch.action = null;
      ch._heldMarble = null;
      ch.lastStep = -1;
      ch.lastFrame = -1;
      placeIdleBody(this, idx, scaleX, scaleY);
      this.parent.children[1].visible = false;
      this.parent.children[2].visible = false;
      this.parent.children[3].visible = false;
      this.parent.children[4].visible = false;
      const idleFrame = IDLE_FRAMES[idx];
      applySpriteFrame(this.material.map, idleFrame.id, idleFrame.reversed);
      this.parent.updateMatrixWorld(true);
      return;
    }

    //NOTE(jimmylee)
    //Read overlay data from QUICK_THROW_ASSEMBLY for the current rotation step.
    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const assemblyFrame = QUICK_THROW_ASSEMBLY[patternIdx].frames[frameIdx];
    const frame = QUICK_THROW_FRAMES[idx][frameIdx];

    //NOTE(jimmylee)
    //Reversed patterns flip the entire composite horizontally — same as CSS scaleX(-1)
    //on the compositeContainer in the main route. applySpriteFrame handles the UV flip for visuals,
    //flipX handles the position flip so overlays appear on the correct side of the body.
    const flipX = frame.reversed ? -1 : 1;

    //NOTE(jimmylee)
    //Body scale and position from the SHP anchor.
    const bodyH = BODY_HEIGHTS[frameIdx];
    this.scale.y = bodyH / MAX_CONTAINER_H;
    const move = seqMoveLocal(assemblyFrame.move, ch.directionOffset, camera, scaleY);
    const bodyX = anchorBodyX(assemblyFrame.anchor, scaleX, flipX) + move.x;
    const bodyY = anchorBodyY(assemblyFrame.anchor, scaleY) + move.y;
    this.position.set(bodyX, bodyY, 0);

    const behindHandMesh = this.parent.children[1];
    const frontHandMesh = this.parent.children[2];
    const headMesh = this.parent.children[3];
    const overMesh = this.parent.children[4];

    //NOTE(@jimmylee)
    //Behind hand: DF2/DB2 (recoil frames 1,3), EF1/EFR5 (reach frame 4) or EFR3/EFR4 (overhead frame 5).
    //Position = body center + pixel offset × scale × flipX. Same as PositionedSpriteSlice.
    if (assemblyFrame.behind) {
      behindHandMesh.visible = true;
      positionOverlay(behindHandMesh, assemblyFrame.behind, scaleX, scaleY, flipX, bodyY, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, bodyX);
      behindHandMesh.renderOrder = BEHIND;
    } else {
      behindHandMesh.visible = false;
    }

    //NOTE(jimmylee)
    //Head and front hand are separate fields in QUICK_THROW_ASSEMBLY.
    //Head sprites (SP3/SP2) are in `head`, hand sprites (EF2/EFL5) are in `front`.
    if (assemblyFrame.head) {
      headMesh.visible = true;
      positionOverlay(headMesh, assemblyFrame.head, scaleX, scaleY, flipX, bodyY, HEAD_MAX_W, HEAD_MAX_H, bodyX);
      headMesh.renderOrder = IN_FRONT;
    } else {
      headMesh.visible = false;
    }

    if (assemblyFrame.front) {
      frontHandMesh.visible = true;
      positionOverlay(frontHandMesh, assemblyFrame.front, scaleX, scaleY, flipX, bodyY, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, bodyX);
      frontHandMesh.renderOrder = IN_FRONT;
    } else {
      frontHandMesh.visible = false;
    }

    //NOTE(@jimmylee)
    //over: AU1/AU2 robe hem at the feet (overhead frame only), between body and front hand.
    if (assemblyFrame.over) {
      overMesh.visible = true;
      positionOverlay(overMesh, assemblyFrame.over, scaleX, scaleY, flipX, bodyY, OVER_MAX_W, OVER_MAX_H, bodyX);
    } else {
      overMesh.visible = false;
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
      if (assemblyFrame.head) {
        applySpriteFrame(ch.headTexture, assemblyFrame.head.id, frame.reversed);
      }
      if (assemblyFrame.front) {
        applySpriteFrame(ch.frontHandTexture, assemblyFrame.front.id, frame.reversed);
      }
      if (assemblyFrame.over) {
        applySpriteFrame(ch.overTexture, assemblyFrame.over.id, frame.reversed);
      }
    }

    //NOTE(@jimmylee)
    //The caught marble's body stays on its camera-independent hold point; only what is drawn rides
    //the hand. WebGLRenderer has already composed world matrices when this runs, so this writes the
    //marble's matrixWorld, not its position: gameplay keeps reading the body's position, and the
    //next frame's matrix update puts the mesh back.
    const held = ch._heldMarble;
    if (held) {
      const point = quickThrowMarblePoint(held, this.parent.position, camera.quaternion, frameIdx, elapsedRaw, patternIdx, _marblePoint);
      if (point) held.mesh.matrixWorld.setPosition(point.x, point.y, point.z);
      else ch._heldMarble = null;
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(jimmylee)
//Mode T (quick throw): T characters start idle and animate reactively when a
//marble approaches. walkStart is offset by -1000ms so the 400ms animation is
//already "done" on creation, letting the character land in its idle pose.
//`now` is forwarded unchanged so `createQuickThrowGroup` can compute
//`initialElapsed = (now - walkStart) / 1000 = 1.0` and hit the done branch.
registerCharacterMode('T', ({ node, textures, direction, directionOffset, walkStart, now, worldX, worldY, worldZ, bodyMesh }) => (
  createQuickThrowGroup({ node, textures, direction, directionOffset, walkStart: walkStart - 1000, now, worldX, worldY, worldZ, bodyMesh })
));
