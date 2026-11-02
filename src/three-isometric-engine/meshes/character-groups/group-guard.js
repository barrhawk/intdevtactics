//NOTE(jimmylee)
//Guard mode (Mode G) — billboard composite. See AGENTS.md for shared architecture.
//SEQ 76/77: Static 3-tile composition per pattern using walk frame 5 tiles.
//Same structure as walk but frozen on the guard pose. No animation loop needed.
//3 meshes: body + behind hand + front hand.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { GUARD_ASSEMBLY } from '@engine/constants/sprites/assembly';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, BEHIND, IN_FRONT, azimuthToStep, applySpriteFrame, createBillboardOverlay, anchorBodyX, anchorBodyY, positionOverlay, isCharacterOnScreen, placeIdleBody, setVisualDriver } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { State } from '@engine/actions/character-state';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';

//NOTE(jimmylee)
//Body height (pixels) — all guard bodies are BF5/BB5 (32×40).
const BODY_H = SPRITE_MAP[GUARD_ASSEMBLY[0].body].h;

//NOTE(jimmylee)
//The body plane covers the 32x40 idle stance. Guard holds walk frame 5 (F13/F18), so the
//body sits at its SHP anchor including the +2px walk bob.
const MAX_CONTAINER_H = STANDARD_CONTAINER_H;

//NOTE(jimmylee)
//Guard body frames: one static frame per rotation step, derived from assembly data.
//Pattern A/D reversed, B/C not reversed. Maps 8 rotation steps to 4 patterns.
const GUARD_PATTERNS = GUARD_ASSEMBLY.map((pattern) =>
  ({ id: pattern.body, reversed: pattern.reversed })
);

export const GUARD_FRAMES = [
  GUARD_PATTERNS[0], // Step 0 — Pattern A
  GUARD_PATTERNS[1], // Step 1 — Pattern B (SE default)
  GUARD_PATTERNS[1], // Step 2 — Pattern B
  GUARD_PATTERNS[2], // Step 3 — Pattern C (SW default)
  GUARD_PATTERNS[2], // Step 4 — Pattern C
  GUARD_PATTERNS[3], // Step 5 — Pattern D (NW default)
  GUARD_PATTERNS[3], // Step 6 — Pattern D
  GUARD_PATTERNS[0], // Step 7 — Pattern A (NE default)
];

//NOTE(jimmylee)
//Overlay max dimensions — all guard hands are 24×24 (RF5/LF5/RB5/LB5).
let BEHIND_HAND_MAX_W = 0;
let BEHIND_HAND_MAX_H = 0;
let FRONT_HAND_MAX_W = 0;
let FRONT_HAND_MAX_H = 0;
for (const pattern of GUARD_ASSEMBLY) {
  const bc = SPRITE_MAP[pattern.behind.id];
  BEHIND_HAND_MAX_W = Math.max(BEHIND_HAND_MAX_W, bc.w);
  BEHIND_HAND_MAX_H = Math.max(BEHIND_HAND_MAX_H, bc.h);
  const fc = SPRITE_MAP[pattern.front.id];
  FRONT_HAND_MAX_W = Math.max(FRONT_HAND_MAX_W, fc.w);
  FRONT_HAND_MAX_H = Math.max(FRONT_HAND_MAX_H, fc.h);
}

//NOTE(jimmylee)
//Creates a guard group (Mode G): billboard composite with 3 meshes.
//Scale factors derived from the body plane geometry — same pixel math as the main route.
//The group copies camera.quaternion so all children face the camera as one unit.
//Static pose: no timing or frame cycling. Starts idle until character settles (lands).
export function createGuardGroup({ node, textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;

  //NOTE(jimmylee)
  //Billboard composite scale factors derived from the body plane.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / MAX_CONTAINER_H;

  const behindHand = createBillboardOverlay(textures, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, scaleX, scaleY);
  const frontHand = createBillboardOverlay(textures, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, scaleX, scaleY);

  //NOTE(jimmylee)
  //Start in idle — guard pose begins after character settles (lands).
  const initialIdx = directionOffset;
  const idleFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, initialIdx, scaleX, scaleY);
  behindHand.mesh.visible = false;
  frontHand.mesh.visible = false;

  //NOTE(jimmylee)
  //Initial renderOrder — behind always behind, front always in front.
  bodyMesh.renderOrder = 0;
  behindHand.mesh.renderOrder = BEHIND;
  frontHand.mesh.renderOrder = IN_FRONT;

  const group = new THREE.Group();
  group.add(bodyMesh);          // children[0]
  group.add(behindHand.mesh);   // children[1]
  group.add(frontHand.mesh);    // children[2]

  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  //NOTE(jimmylee)
  //Character state on group — all sprite logic reads from here.
  group.userData.character = createCharacterState({
    mode: 'G',
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      direction,
      behindHandTexture: behindHand.texture,
      frontHandTexture: frontHand.texture,
    },
  });

  //NOTE(jimmylee)
  //Body onBeforeRender: billboard the GROUP, resolve static guard pose,
  //position overlays using pure pixel offsets × scale factors — same math as the main route.
  setVisualDriver(group, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this.parent, camera)) return;

    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;

    //NOTE(jimmylee)
    //Idle guard: show P1-P5 with hands hidden during FALLING/SPAWNING.
    //Matches group-walk.js and group-magic-charge.js idle guard pattern.
    if (ch.state === State.FALLING || ch.state === State.SPAWNING) {
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

    //NOTE(jimmylee)
    //Detect settle transition — hands are hidden during FALLING/SPAWNING idle guard.
    //First render after settling sees them hidden, triggering UV initialization.
    const justSettled = !this.parent.children[1].visible;
    this.parent.children[1].visible = true;
    this.parent.children[2].visible = true;

    //NOTE(jimmylee)
    //Static guard pose — no frame cycling. Read directly from GUARD_ASSEMBLY.
    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const pattern = GUARD_ASSEMBLY[patternIdx];
    const frame = GUARD_FRAMES[idx];

    //NOTE(jimmylee)
    //Reversed patterns flip the entire composite horizontally — same as CSS scaleX(-1).
    const flipX = frame.reversed ? -1 : 1;

    //NOTE(jimmylee)
    //Body scale and position from the SHP anchor. BF5/BB5 are 32×40.
    const bodyH = SPRITE_MAP[pattern.body].h;
    this.scale.y = bodyH / MAX_CONTAINER_H;
    const bodyX = anchorBodyX(pattern.anchor, scaleX, flipX);
    const bodyY = anchorBodyY(pattern.anchor, scaleY);
    this.position.set(bodyX, bodyY, 0);

    const behindHandMesh = this.parent.children[1];
    const frontHandMesh = this.parent.children[2];

    //NOTE(jimmylee)
    //Behind hand position = body center + pixel offset × scale × flipX.
    positionOverlay(behindHandMesh, pattern.behind, scaleX, scaleY, flipX, bodyY, BEHIND_HAND_MAX_W, BEHIND_HAND_MAX_H, bodyX);
    behindHandMesh.renderOrder = BEHIND;

    //NOTE(jimmylee)
    //Front hand position = body center + pixel offset × scale × flipX.
    positionOverlay(frontHandMesh, pattern.front, scaleX, scaleY, flipX, bodyY, FRONT_HAND_MAX_W, FRONT_HAND_MAX_H, bodyX);
    frontHandMesh.renderOrder = IN_FRONT;

    //NOTE(jimmylee)
    //Apply body + overlay sprite UVs when rotation step changes or on settle.
    //justSettled catches the FALLING/SPAWNING→IDLE transition so guard textures get applied.
    if (justSettled || step !== ch.lastStep) {
      ch.lastStep = step;
      applySpriteFrame(this.material.map, frame.id, frame.reversed);
      applySpriteFrame(ch.behindHandTexture, pattern.behind.id, frame.reversed);
      applySpriteFrame(ch.frontHandTexture, pattern.front.id, frame.reversed);
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(jimmylee)
//Mode G (guard): factory signature already matches the registry shape.
registerCharacterMode('G', createGuardGroup);
