//NOTE(jimmylee)
//Shared character utilities extracted to break circular dependency between
//createCharacter.js and character-groups/*.js.

import * as THREE from 'three';
import { BODY_W, SPRITE_MAP, SHEET_W, SHEET_H, STANDARD_CONTAINER_H } from '@engine/constants/sprites';
import { IDLE_ASSEMBLY, KNEEL_ASSEMBLY, DEATH_ASSEMBLY } from '@engine/constants/sprites/assembly';

//NOTE(jimmylee)
//Character dimension constants — canonical definitions live in constants/character.js.
//Re-exported here for backward compatibility with existing consumers.
export { PX_TO_WORLD, SPRITE_WIDTH, SPRITE_HEIGHT } from '@engine/constants/character';
import { AROUND_BODY, SPRITE_WIDTH, SPRITE_HEIGHT, CHAR_HALF_Y_DEFAULT, CHAR_HALF_Z, ITEM_LAYER_GAP, KNEEL_BILLBOARD_H, PX_TO_WORLD } from '@engine/constants/character';
import { cubeSize } from '@engine/constants';
import { getSharedGeometry } from '@engine/meshes/static-assets';

//NOTE(jimmylee)
//Returns the Y half-extent for a character's collision box from its billboard height.
//Centralizes the `billboardHeight / 2` derivation used by collision detection,
//kneel physics, and body creation.
export function getCharacterHalfY(ch) {
  return ch?.billboardHeight ? ch.billboardHeight / 2 : CHAR_HALF_Y_DEFAULT;
}

//NOTE(jimmylee)
//Z-layer constants for renderOrder. Derived from SHP back-to-front tile order.
//Body is always 0. These position overlays relative to the body plane.
export const FAR_BEHIND = -2;
export const BEHIND = -1;
export const IN_FRONT = 2;
//NOTE(jimmylee)
//Face overlays are the last SHP tile — above the front hand.
export const FACE = 3;

export { BODY_W, STANDARD_CONTAINER_H };

//NOTE(jimmylee)
//Maps 8 rotation steps to 4 assembly patterns: [A, B, B, C, C, D, D, A].
export const ASSEMBLY_STEP_MAP = [0, 1, 1, 2, 2, 3, 3, 0];

//NOTE(@jimmylee)
//Billboard body center from the SHP body anchor (assembly `anchor: { dx, dy }`).
//The body plane is the 32x40 idle stance (STANDARD_CONTAINER_H tall) centered on the group
//origin, so the unit origin (canvas SHP_ORIGIN_X 53, STANCE_Y 103) is (0, 0) and a body sits anchor.dx pixels
//beside it (mirrored by flipX) and anchor.dy pixels below it — where TYPE1.SHP draws it.
export function anchorBodyX(anchor, scaleX, flipX) {
  return anchor.dx * scaleX * flipX;
}

export function anchorBodyY(anchor, scaleY) {
  return -anchor.dy * scaleY;
}

//NOTE(jimmylee)
//Idle body offset (pixels) per rotation index: the P1-P5 anchor, mirrored about the unit origin
//for the reversed idles (SHP F4-F6). P3/P5 sit on the origin column, the 3/4 views 1px beside it.
export const IDLE_BODY_DX = IDLE_ASSEMBLY.map((e) => (e.reversed ? -e.anchor.dx : e.anchor.dx));
export const IDLE_BODY_DY = IDLE_ASSEMBLY.map((e) => e.anchor.dy);

//NOTE(jimmylee)
//Places a composite's body plane for the idle pose of rotation index `idx` (full 40px stance).
export function placeIdleBody(mesh, idx, scaleX, scaleY) {
  mesh.scale.y = 1;
  mesh.position.set(IDLE_BODY_DX[idx] * scaleX, -IDLE_BODY_DY[idx] * scaleY, 0);
}

//NOTE(jimmylee)
//Single-plane poses (Kneel KO3/KO4, Dead KO1/KO2) are standalone meshes synced to their own physics
//body center, which sits lower than a standing body's. The game draws every pose of a unit relative to one
//origin, so these planes use the same pivot and pixel map as the composites: the stance point S,
//STANCE_HALF_Y above the bottom of the physics shape (a standing body's center), with canvas pixel
//(x, y) at billboard-local ((x - SHP_ORIGIN_X) * PX_TO_WORLD, -(y - STANCE_Y) * SINGLE_POSE_SCALE_Y).
//The pivot rise from the body center to S is world-vertical; the plane is camera-oriented, so the rise
//is expressed in the camera frame each time the camera's elevation changes.
export const SINGLE_POSE_SCALE_Y = SPRITE_HEIGHT / STANDARD_CONTAINER_H;
const STANCE_HALF_Y = SPRITE_HEIGHT / 2;
export const KNEEL_PIVOT_RISE = STANCE_HALF_Y - KNEEL_BILLBOARD_H / 2;
//NOTE(jimmylee)
//A dead body lies on its back, so its vertical half-extent is CHAR_HALF_Z.
export const DEAD_PIVOT_RISE = STANCE_HALF_Y - CHAR_HALF_Z;

const ASSEMBLY_STEP_MAP_LOCAL = [0, 1, 1, 2, 2, 3, 3, 0];
const singlePoseDx = (assembly) => ASSEMBLY_STEP_MAP_LOCAL.map((p) => (assembly[p].reversed ? -assembly[p].anchor.dx : assembly[p].anchor.dx));
const singlePoseDy = (assembly) => ASSEMBLY_STEP_MAP_LOCAL.map((p) => assembly[p].anchor.dy);
export const KNEEL_BODY_DX = singlePoseDx(KNEEL_ASSEMBLY);
export const KNEEL_BODY_DY = singlePoseDy(KNEEL_ASSEMBLY);
export const DEAD_BODY_DX = singlePoseDx(DEATH_ASSEMBLY);
export const DEAD_BODY_DY = singlePoseDy(DEATH_ASSEMBLY);

//NOTE(jimmylee)
//The camera is orthographic, so moving a plane along the view axis changes its depth but not its
//screen position. A pose drawn below the game's stance bottom (Dead: 8px below it) would sink into the
//floor, so the plane is moved toward the camera until its bottom edge clears the physics ground —
//at most half a cube of horizontal travel, so blocks in the next cell toward the camera still
//occlude it (below ~20 degrees of elevation the lowest rows of a Dead plane stay clipped).
const SINGLE_POSE_MAX_LIFT_XZ = cubeSize / 2;

export function createSinglePoseGeometry(widthPx, heightPx) {
  const geometry = new THREE.PlaneGeometry(widthPx * PX_TO_WORLD, heightPx * SINGLE_POSE_SCALE_Y);
  geometry.userData.singlePose = { x: 0, y: 0, z: 0, idx: -1, ry: NaN, uy: NaN, by: NaN };
  return geometry;
}

//NOTE(jimmylee)
//Forces the next placeSinglePose call to recompute (pooled meshes change direction on reuse).
export function resetSinglePose(geometry) {
  geometry.userData.singlePose.idx = -1;
}

//NOTE(jimmylee)
//Places a single-pose plane for rotation index `idx` and the current camera. The mesh must carry
//the camera quaternion. Translates the geometry only when the direction or the camera elevation
//changed — no allocation, and orbiting around the Y axis alone leaves it untouched.
export function placeSinglePose(mesh, idx, bodyDx, bodyDy, pivotRise, camera) {
  const geometry = mesh.geometry;
  const state = geometry.userData.singlePose;
  const e = camera.matrixWorld.elements;
  //NOTE(jimmylee)
  //World-Y components of the camera's right, up and back (toward the camera) axes.
  const ry = e[1];
  const uy = e[5];
  const by = e[9];
  if (idx === state.idx && ry === state.ry && uy === state.uy && by === state.by) return;

  const ax = bodyDx[idx] * PX_TO_WORLD;
  const ay = -bodyDy[idx] * SINGLE_POSE_SCALE_Y;
  const { width, height } = geometry.parameters;

  //NOTE(jimmylee)
  //Height of the plane's lowest corner above the physics ground, measured from S.
  const bottom = STANCE_HALF_Y + ax * ry - Math.abs((width / 2) * ry) + (ay - height / 2) * uy;
  let lift = 0;
  if (bottom < 0 && by > 1e-6) {
    const horizontal = Math.max(Math.sqrt(1 - by * by), 1e-6);
    lift = Math.min(-bottom / by, SINGLE_POSE_MAX_LIFT_XZ / horizontal);
  }

  const x = pivotRise * ry + ax;
  const y = pivotRise * uy + ay;
  const z = pivotRise * by + lift;
  geometry.translate(x - state.x, y - state.y, z - state.z);
  state.x = x;
  state.y = y;
  state.z = z;
  state.idx = idx;
  state.ry = ry;
  state.uy = uy;
  state.by = by;
}

//NOTE(jimmylee)
//Unit world facing per directionOffset:
//0=E, 1=SE, 2=S, 3=SW, 4=W, 5=NW, 6=N, 7=NE.
const INV_SQRT2 = Math.SQRT1_2;
export const FACING_X = [INV_SQRT2, 1, INV_SQRT2, 0, -INV_SQRT2, -1, -INV_SQRT2, 0];
export const FACING_Z = [-INV_SQRT2, 0, INV_SQRT2, 1, INV_SQRT2, 0, -INV_SQRT2, -1];

//NOTE(jimmylee)
//Scratch math objects are created on first use (zero per-frame allocation afterwards).
let _seqMoveVec = null;
let _seqMoveQuat = null;
const _seqMoveResult = { x: 0, y: 0 };

//NOTE(jimmylee)
//SEQ unit motion (assembly `move: { fb, du }`, pixels) → billboard-local offset to add to the body
//position. The game moves the unit, so forward/back travels along the unit's world facing (PX_TO_WORLD
//per pixel) and is projected into the camera-facing group; down/up is screen-vertical at the
//composite's pixel scale. Returns a shared object — read it immediately.
export function seqMoveLocal(move, directionOffset, camera, scaleY) {
  _seqMoveResult.x = 0;
  _seqMoveResult.y = -move.du * scaleY;
  if (move.fb !== 0) {
    if (!_seqMoveVec) {
      _seqMoveVec = new THREE.Vector3();
      _seqMoveQuat = new THREE.Quaternion();
    }
    const d = move.fb * PX_TO_WORLD;
    _seqMoveVec.set(FACING_X[directionOffset] * d, 0, FACING_Z[directionOffset] * d);
    _seqMoveVec.applyQuaternion(_seqMoveQuat.copy(camera.quaternion).invert());
    _seqMoveResult.x = _seqMoveVec.x;
    _seqMoveResult.y += _seqMoveVec.y;
  }
  return _seqMoveResult;
}

//NOTE(jimmylee)
//Positions and scales an overlay mesh for the current frame.
//Pure pixel math from assembly data: bodyX + dx × scaleX × flipX, bodyY + (-dy) × scaleY.
export function positionOverlay(mesh, layer, scaleX, scaleY, flipX, bodyY, maxW, maxH, bodyX = 0) {
  mesh.position.set(
    bodyX + layer.dx * scaleX * flipX,
    bodyY + (-layer.dy) * scaleY,
    0
  );
  const c = SPRITE_MAP[layer.id];
  mesh.scale.x = c.w / maxW;
  mesh.scale.y = c.h / maxH;
}

//NOTE(@jimmylee)
//Which tile of a frame's `count`, back to front, is the first drawn over its held item, from the frame's
//entry in `ch.itemLayer` (weapons/held-items.js): tiles counted from the top, all of them at Infinity, or a
//negative number for every tile but that many at the bottom. The top of the stack is the count that holds in
//water, where F(n + 182) splits the torso under the head. `end` is the item's heldEnd: an item pointing at the
//camera is over every tile and one pointing away is under them all, whatever the frame's entry says.
export function firstTileOverItem(count, layer, end = 0) {
  if (end > 0) return count;
  if (end < 0) return 0;
  return layer < 0 ? -layer : Math.max(0, count - layer);
}

//NOTE(@jimmylee)
//Whether tile `index` of a frame stands over its held item. The tiles keep their SHP order, because only the body
//writes depth: a tile drawn after it has to stand as near as it does. So a ball between two hands has the head
//and the top hand over it, and the bottom hand too unless that is the body, as it is in water, where the biggest
//tile is that arm and F(n + 182) splits the torso.
export function tileOverItem(index, isBody, count, layer, end = 0) {
  if (layer === AROUND_BODY && end === 0) return index >= count - 2 || (index === 0 && !isBody);
  return index >= firstTileOverItem(count, layer, end);
}

//NOTE(@jimmylee)
//The same for a Bow frame's four tiles, read by pattern: `ch.itemLayer` is { front, back }.
export function liftPunchTiles(ch, patternIdx, farBehind, body, head, front) {
  if (!ch.itemLayer) return;
  const first = firstTileOverItem(4, ch.itemLayer[patternIdx <= 1 ? 'front' : 'back']);
  farBehind.position.z = first <= 0 ? ITEM_LAYER_GAP : 0;
  body.position.z = first <= 1 ? ITEM_LAYER_GAP : 0;
  head.position.z = first <= 2 ? ITEM_LAYER_GAP : 0;
  front.position.z = first <= 3 ? ITEM_LAYER_GAP : 0;
}

//NOTE(jimmylee)
//Azimuth conversion constants.
export const DEFAULT_AZIMUTH = Math.atan2(0.5, -0.5);
export const STEP_SIZE = Math.PI / 4;
const LEAD = Math.PI / 36;

//NOTE(jimmylee)
//Pre-allocated result objects. Every onBeforeRender in the character-groups
//pipeline resolves a frame index each frame (walk cycle, punch cycle, jump,
//stab, cast, quick-throw, throw-stone). At 60fps × every animated character,
//returning a fresh literal per call showed up as periodic GC stutter during
//long walks. Callers immediately destructure the primitive fields, so reusing
//one mutable object per function is safe — the shared object is overwritten
//on the next call before any consumer could observe stale values.
//One object per function keeps the two independent so a mixed-call path
//(e.g. tests calling both back-to-back) can still reason about either result.
const _variableResult = { frameIdx: 0, done: false };
const _loopingResult = { frameIdx: 0, elapsed: 0 };

//NOTE(jimmylee)
//Variable-timing frame resolver (non-looping). Holds last frame when done.
export function resolveVariableFrame(delays, elapsed) {
  let t = 0;
  for (let i = 0; i < delays.length; i++) {
    t += delays[i];
    if (elapsed < t) {
      _variableResult.frameIdx = i;
      _variableResult.done = false;
      return _variableResult;
    }
  }
  _variableResult.frameIdx = delays.length - 1;
  _variableResult.done = true;
  return _variableResult;
}

//NOTE(jimmylee)
//Looping variant of resolveVariableFrame. Wraps elapsed via modulo before resolving.
//Replaces the repeated `elapsed % cycleDuration` + `resolveVariableFrame()` pattern.
export function resolveLoopingFrame(delays, cycleDuration, elapsedRaw) {
  const elapsed = elapsedRaw % cycleDuration;
  let t = 0;
  for (let i = 0; i < delays.length; i++) {
    t += delays[i];
    if (elapsed < t) {
      _loopingResult.frameIdx = i;
      _loopingResult.elapsed = elapsed;
      return _loopingResult;
    }
  }
  _loopingResult.frameIdx = delays.length - 1;
  _loopingResult.elapsed = elapsed;
  return _loopingResult;
}

//NOTE(jimmylee)
//Converts camera world position to a rotation step (0-7).
//The render loop caches the result on camera.userData.azimuthStep each frame
//so onBeforeRender callbacks skip the redundant trig — one atan2 per frame
//instead of one per character.
export function azimuthToStep(camera) {
  if (camera.userData && camera.userData.azimuthStep !== undefined) {
    return camera.userData.azimuthStep;
  }
  return computeAzimuthToStep(camera);
}

//NOTE(jimmylee)
//Raw computation — called once per frame by the render loop to populate the cache.
export function computeAzimuthToStep(camera) {
  const azimuth = Math.atan2(camera.position.x, camera.position.z);
  const delta = azimuth - DEFAULT_AZIMUTH + LEAD;
  const raw = Math.round(delta / STEP_SIZE);
  return ((raw % 8) + 8) % 8;
}

//NOTE(jimmylee)
//Sets texture UV offset/repeat for a sprite by ID from SPRITE_MAP (constants/sprites/).
export function applySpriteFrame(texture, id, reversed) {
  const s = SPRITE_MAP[id];
  if (reversed) {
    texture.offset.x = (s.x + s.w) / SHEET_W;
    texture.repeat.x = -s.w / SHEET_W;
  } else {
    texture.offset.x = s.x / SHEET_W;
    texture.repeat.x = s.w / SHEET_W;
  }

  texture.offset.y = 1 - (s.y + s.h) / SHEET_H;
  texture.repeat.y = s.h / SHEET_H;
}

//NOTE(@jimmylee)
//Clones the character sprite sheet texture with standard settings.
//Every character mesh and overlay needs independent UV state.
//The sheet holds sRGB palette colors. Untagged (NoColorSpace), three samples them as linear and
//sRGB-encodes the output, lifting every dark palette entry — the outline (40,40,32) drew as
//(87,87,78), so arm and hand tiles lost their edge against the body. Tagged sRGB, the output is
//the palette scaled by the material tint, SPRITE_TINT, which is white: a sprite draws the sheet's own
//colors, the ones the 2D sections show.
//Clones share one GPU texture through their TextureSource, and Texture.clone() bumps source.version, which
//re-uploads the whole sheet on the next draw. The sheet's pixels never change, so every clone after
//the first would stall on a redundant upload: the version is put back after cloning.
//NearestFilter never samples a mip level, so the sheet uploads none.
export function cloneSpriteTexture(textures) {
  const sheet = textures.skins.characterSpriteSheet;
  const sourceVersion = sheet.source?.version;
  const texture = sheet.clone();
  if (sheet.source) sheet.source.version = sourceVersion;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

//NOTE(jimmylee)
//Cached base materials used as clone sources. Cloning a pre-configured material
//avoids re-parsing config objects and guarantees identical GPU programs.
//NOTE(@jimmylee)
//forceSinglePass: three otherwise draws a transparent DoubleSide material twice, back faces then
//front faces, and sets needsUpdate around both draws, so every sprite layer would pay two draw calls
//and two full program lookups per frame. Sprite planes are flat billboards facing the camera; one
//pass draws them identically.
export const SPRITE_TINT = 0xffffff;
let _overlayMaterialBase = null;
let _bodyMaterialBase = null;

//NOTE(jimmylee)
//Creates an overlay material (depthWrite:false, depthTest:true) from a cloned base.
export function createOverlayMaterial(texture) {
  if (!_overlayMaterialBase) {
    _overlayMaterialBase = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      depthWrite: false,
      depthTest: true,
      color: SPRITE_TINT,
    });
  }
  const material = _overlayMaterialBase.clone();
  material.map = texture;
  material.spriteLayer = true;
  return material;
}

//NOTE(jimmylee)
//Creates a body material (standard, with depth writes) from a cloned base.
export function createBodyMaterial(texture) {
  if (!_bodyMaterialBase) {
    _bodyMaterialBase = new THREE.MeshBasicMaterial({
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      forceSinglePass: true,
      color: SPRITE_TINT,
    });
  }
  const material = _bodyMaterialBase.clone();
  material.map = texture;
  material.spriteLayer = true;
  return material;
}

//NOTE(@jimmylee)
//Character visual sync. A composite is updated by one driver mesh (its body, an idle mesh, the
//flinch top plane): billboard, frame/pattern/step, child placement, UVs and child visibility.
//WebGLRenderer.render builds its draw list from `visible` and sorts it by renderOrder BEFORE any
//object's onBeforeRender runs, then calls each object's onBeforeRender right before drawing it. A
//driver that updates its children from its own onBeforeRender therefore lets FAR_BEHIND/BEHIND
//children draw with the previous frame's tile and transform, a child un-hidden this frame miss the
//draw (landing: torso without hands) and a child hidden this frame still draw (re-drop: stale hands
//over the idle body). Scene.onBeforeRender runs before the draw list is built, so
//syncCharacterVisuals — installed as the scene's onBeforeRender — updates every character first.
//The driver's own onBeforeRender then skips the repeat; a driver not reached by the pass (a scene
//without the hook, a direct call in a test) still updates itself there.
let _visualPass = 0;

//NOTE(@jimmylee)
//Makes `driver` the visual driver of `root` (a scene-root character object): `update` runs once per
//rendered frame — from syncCharacterVisuals when the scene has it installed, else from the driver's
//onBeforeRender. `update` has the onBeforeRender signature and `this` is the driver.
export function setVisualDriver(root, driver, update) {
  driver.userData.visualPass = 0;
  driver.onBeforeRender = function (renderer, scene, camera) {
    if (scene && scene.userData && scene.userData.characterVisualPass === this.userData.visualPass) return;
    update.call(this, renderer, scene, camera);
  };
  root.userData.visualDriver = driver;
}

//NOTE(@jimmylee)
//Scene.onBeforeRender hook (`scene.onBeforeRender = syncCharacterVisuals`): runs the visual driver
//of every visible scene-root character before WebGLRenderer projects the scene, so every layer of a
//composite is drawn from the same frame, pattern, step and camera state. Characters and their
//temporary visuals are always added at the scene root. No allocation.
export function syncCharacterVisuals(renderer, scene, camera) {
  const pass = ++_visualPass;
  scene.userData.characterVisualPass = pass;
  const roots = scene.children;
  for (let i = 0; i < roots.length; i++) {
    const driver = roots[i].userData.visualDriver;
    if (driver === undefined) continue;
    let visible = true;
    for (let o = driver; o !== null && o !== scene; o = o.parent) {
      if (!o.visible) {
        visible = false;
        break;
      }
    }
    if (!visible) continue;
    driver.onBeforeRender(renderer, scene, camera);
    driver.userData.visualPass = pass;
  }
  const batcher = scene.userData.spriteBatcher;
  if (batcher !== undefined) batcher.update(camera);
}

//NOTE(jimmylee)
//Shared invisible material and geometry for buffer meshes.
//Buffer meshes are never rendered (visible:false) — all instances can share one material/geometry.
let _bufferMaterial = null;
let _bufferGeometry = null;

export function createBufferMesh(spriteHeight) {
  if (!_bufferMaterial) {
    _bufferMaterial = new THREE.MeshBasicMaterial({ visible: false });
  }
  if (!_bufferGeometry) {
    _bufferGeometry = new THREE.PlaneGeometry(1, 1);
  }
  const mesh = new THREE.Mesh(_bufferGeometry, _bufferMaterial);
  mesh.frustumCulled = false;
  mesh.position.y = spriteHeight / 2;
  return mesh;
}

//NOTE(jimmylee)
//Shared PlaneGeometry for standard-size character body meshes.
//All temporary combat visuals use the same geometry to avoid per-use allocation.
export function getStandardBodyGeometry() {
  return getSharedGeometry('character-body', () => new THREE.PlaneGeometry(SPRITE_WIDTH, SPRITE_HEIGHT));
}

//NOTE(jimmylee)
//Frustum check for off-screen character billboard skip. Returns true if the
//character is on screen (or frustum data unavailable). Returns false if
//definitely off-screen. For group modes, pass the group; for idle, the mesh.
//Uses the pre-allocated sphere on camera.userData set by the render loop.
export function isCharacterOnScreen(positionSource, camera) {
  const frustum = camera.userData.frustum;
  if (!frustum) return true;
  const sphere = camera.userData.cullingSphere;
  sphere.center.copy(positionSource.position);
  return frustum.intersectsSphere(sphere);
}

//NOTE(jimmylee)
//Creates a textured overlay plane for billboard composites.
//Scale factors (scaleX, scaleY) are derived from the body plane geometry:
//  scaleX = spriteWidth / BODY_W, scaleY = spriteHeight / MAX_CONTAINER_H.
//depthWrite:false so overlays don't z-fight with each other or the coplanar body.
//depthTest:true so environment meshes (walls, blocks) correctly occlude overlays.
//renderOrder still controls draw order among character parts (LessEqualDepth passes at equal depth).
export function createBillboardOverlay(textures, widthPx, heightPx, scaleX, scaleY) {
  const texture = cloneSpriteTexture(textures);
  const material = createOverlayMaterial(texture);

  const planeW = widthPx * scaleX;
  const planeH = heightPx * scaleY;
  const geometry = getSharedGeometry(`overlay-${planeW}x${planeH}`, () => new THREE.PlaneGeometry(planeW, planeH));
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;

  return { mesh, texture };
}
