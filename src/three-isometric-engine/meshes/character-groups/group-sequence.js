//NOTE(@jimmylee)
//Sequence modes — one billboard composite for every TYPE1.SEQ sequence. See AGENTS.md for shared
//architecture. The mode is data: a front and a back SEQ_LIBRARY entry, drawn from SHP_FRAMES tile by
//tile, so a frame needs no per-layer assembly. S2 and S3 loop (the engine loops attacks), FI and ID
//play once and hold, SEQUENCE_MODES holds every other sequence with a mode of its own, and SQ has no
//card: the rig parity suite swaps its pair with setSequencePair to walk every sequence.
//
//A frame has at most 6 tiles: the body tile goes on the body plane, which writes depth, and the
//others on overlay planes, ordered around it in SHP back-to-front order. A frame reaching below the
//stance bottom (KO1/KO2, the hop back down) is moved toward the camera along the view axis, which
//does not move it on the orthographic screen, so it does not sink into the floor.

import * as THREE from 'three';
import { SPRITE_MAP } from '@engine/constants/sprites';
import { SHP_FRAMES, SEQ_LIBRARY, SEQUENCE_MODES, SHP_WATER_OFFSET, shpBodyIndex } from '@engine/constants/sprites/seq-library';
import { cubeSize } from '@engine/constants';
import { ITEM_LAYER_GAP } from '@engine/constants/character';
import { BODY_W, STANDARD_CONTAINER_H, ASSEMBLY_STEP_MAP, resolveVariableFrame, resolveLoopingFrame, azimuthToStep, applySpriteFrame, createBillboardOverlay, isCharacterOnScreen, placeIdleBody, seqMoveLocal, setVisualDriver, tileOverItem } from '@engine/meshes/character-utils';
import { IDLE_FRAMES } from '@engine/meshes/createCharacter';
import { State } from '@engine/actions/character-state';
import { createCharacterState } from '@engine/meshes/character-state-init';
import { registerCharacterMode } from '@engine/common/registry';

const OVERLAY_PLANES = 5;
const OVERLAY_MAX = 40;
const STANCE_BOTTOM_PX = STANDARD_CONTAINER_H / 2;
const MAX_LIFT_XZ = cubeSize / 2;

//NOTE(@jimmylee)
//Per SHP frame: the body tile index, and how far the frame reaches below the stance bottom in pixels.
const FRAME_BODY = SHP_FRAMES.map(shpBodyIndex);
const FRAME_BELOW = SHP_FRAMES.map((tiles) => {
  let below = 0;
  for (let i = 0; i < tiles.length; i++) below = Math.max(below, tiles[i][2] + SPRITE_MAP[tiles[i][0]].h / 2 - STANCE_BOTTOM_PX);
  return below;
});

const _move = { fb: 0, du: 0 };

export function createSequenceGroup({ textures, direction, directionOffset, walkStart, worldX, worldY, worldZ, bodyMesh, mode, front, back, loop, water = false }) {
  const spriteWidth = bodyMesh.geometry.parameters.width;
  const spriteHeight = bodyMesh.geometry.parameters.height;
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / STANDARD_CONTAINER_H;

  const overlays = [];
  for (let i = 0; i < OVERLAY_PLANES; i++) overlays.push(createBillboardOverlay(textures, OVERLAY_MAX, OVERLAY_MAX, scaleX, scaleY));

  const idleFrame = IDLE_FRAMES[directionOffset];
  applySpriteFrame(bodyMesh.material.map, idleFrame.id, idleFrame.reversed);
  placeIdleBody(bodyMesh, directionOffset, scaleX, scaleY);
  bodyMesh.renderOrder = 0;

  const group = new THREE.Group();
  group.add(bodyMesh);
  for (let i = 0; i < OVERLAY_PLANES; i++) {
    overlays[i].mesh.visible = false;
    group.add(overlays[i].mesh);
  }
  group.position.set(worldX, worldY, worldZ);
  group.frustumCulled = false;

  group.userData.character = createCharacterState({
    mode,
    directionOffset,
    walkStart,
    billboardHeight: spriteHeight,
    extras: {
      direction,
      seqFront: SEQ_LIBRARY[front],
      seqBack: SEQ_LIBRARY[back],
      seqLoop: loop,
      seqWater: water,
      _lastSeq: null,
      _lastShp: -1,
      overlayTextures: overlays.map((o) => o.texture),
    },
  });

  setVisualDriver(group, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this.parent, camera)) return;

    this.parent.quaternion.copy(camera.quaternion);

    const ch = this.parent.userData.character;
    const children = this.parent.children;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;

    if (ch.state === State.FALLING || ch.state === State.SPAWNING) {
      placeIdleBody(this, idx, scaleX, scaleY);
      this.scale.x = 1;
      for (let i = 1; i <= OVERLAY_PLANES; i++) children[i].visible = false;
      if (step !== ch.lastStep || ch.lastFrame !== -1) {
        ch.lastStep = step;
        ch.lastFrame = -1;
        const frame = IDLE_FRAMES[idx];
        applySpriteFrame(this.material.map, frame.id, frame.reversed);
      }
      this.parent.updateMatrixWorld(true);
      return;
    }

    const patternIdx = ASSEMBLY_STEP_MAP[idx];
    const reversed = patternIdx === 0 || patternIdx === 3;
    const entry = patternIdx <= 1 ? ch.seqFront : ch.seqBack;
    const elapsed = Math.max(0, (camera.userData.now - ch.walkStart) / 1000);
    const { frameIdx } = ch.seqLoop && entry.totalS > 0 ? resolveLoopingFrame(entry.delaysS, entry.totalS, elapsed) : resolveVariableFrame(entry.delaysS, elapsed);
    const shpFrame = entry.frames[frameIdx] + (ch.seqWater ? SHP_WATER_OFFSET : 0);
    const tiles = SHP_FRAMES[shpFrame];
    const bodyIndex = FRAME_BODY[shpFrame];

    _move.fb = entry.fb ? entry.fb[frameIdx] : 0;
    _move.du = entry.du ? entry.du[frameIdx] : 0;
    const move = seqMoveLocal(_move, ch.directionOffset, camera, scaleY);
    const moveX = move.x;
    const moveY = move.y;

    //NOTE(@jimmylee)
    //World height of the frame's lowest row above the physics ground, from the stance point.
    const e = camera.matrixWorld.elements;
    const uy = e[5];
    const by = e[9];
    const bottom = spriteHeight / 2 - (FRAME_BELOW[shpFrame] + STANCE_BOTTOM_PX) * scaleY * uy + moveY * uy;
    let lift = 0;
    if (bottom < 0 && by > 1e-6) lift = Math.min(-bottom / by, MAX_LIFT_XZ / Math.max(Math.sqrt(1 - by * by), 1e-6));
    ch.spriteLift = lift;

    //NOTE(@jimmylee)
    //A frame with an item in its hand draws the tiles over the item nearer the camera, which the orthographic
    //screen does not show (weapons/held-items.js `over`). An item pointing along the view sets `ch.itemEnd`.
    const itemLayer = ch.itemLayer ? (ch.itemLayer[entry.frames[frameIdx]] ?? 0) : null;

    const update = step !== ch.lastStep || frameIdx !== ch.lastFrame || entry !== ch._lastSeq || shpFrame !== ch._lastShp;
    const flipX = reversed ? -1 : 1;
    let plane = 0;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      const cell = SPRITE_MAP[tile[0]];
      const isBody = i === bodyIndex;
      const mesh = isBody ? this : children[++plane];
      mesh.visible = true;
      mesh.renderOrder = i - bodyIndex;
      mesh.position.set(tile[1] * scaleX * flipX + moveX, -tile[2] * scaleY + moveY, itemLayer !== null && tileOverItem(i, isBody, tiles.length, itemLayer, ch.itemEnd) ? lift + ITEM_LAYER_GAP : lift);
      mesh.scale.set(cell.w / (isBody ? BODY_W : OVERLAY_MAX), cell.h / (isBody ? STANDARD_CONTAINER_H : OVERLAY_MAX), 1);
      if (update) applySpriteFrame(isBody ? this.material.map : ch.overlayTextures[plane - 1], tile[0], reversed !== (tile[3] === 1));
    }
    for (let i = plane + 1; i <= OVERLAY_PLANES; i++) children[i].visible = false;

    if (update) {
      ch.lastStep = step;
      ch.lastFrame = frameIdx;
      ch._lastSeq = entry;
      ch._lastShp = shpFrame;
    }

    this.parent.updateMatrixWorld(true);
  });

  return group;
}

//NOTE(@jimmylee)
//Puts a sequence group on another front/back pair (library selection), restarted at `now`.
export function setSequencePair(root, pair, loop, water, now) {
  const ch = root.userData.character;
  ch.seqFront = pair.front;
  ch.seqBack = pair.back;
  ch.seqLoop = loop;
  ch.seqWater = water;
  ch.walkStart = now;
  ch.lastFrame = -1;
}

function sequenceMode(mode, front, back, loop, water) {
  return (args) => createSequenceGroup({ ...args, mode, front, back, loop, water });
}

registerCharacterMode('S2', sequenceMode('S2', 98, 99, true));
registerCharacterMode('S3', sequenceMode('S3', 100, 101, true));
registerCharacterMode('FI', sequenceMode('FI', 82, 83, false));
registerCharacterMode('ID', sequenceMode('ID', 84, 85, false));
for (const { mode, pair, loop, water } of SEQUENCE_MODES) registerCharacterMode(mode, sequenceMode(mode, pair.front.seq, pair.back.seq, loop, water));
registerCharacterMode('SQ', sequenceMode('SQ', 6, 7, true), { directional: false });
