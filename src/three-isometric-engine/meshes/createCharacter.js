//NOTE(jimmylee)
//Creates a billboard sprite character mesh with camera-rotation-aware sprite selection.
//Characters without a mode show static idle. Mode characters delegate to the
//`registerCharacterMode` registry — every built-in mode is registered from its
//own `character-groups/group-*.js` file at module load time. Adding a new mode
//is a `group-<mode>.js` factory that calls `registerCharacterMode('<mode>', factory)`
//at the bottom of its module body, plus one side-effect import below so the file
//is evaluated (no dispatch edits).

import * as THREE from 'three';
import { cubeSize, DIRECTION_OFFSETS } from '@engine/constants';
import { SPRITE_WIDTH, SPRITE_HEIGHT } from '@engine/constants/character';

//NOTE(jimmylee)
//Side-effect imports: evaluating each group-*.js module runs its
//`registerCharacterMode(...)` call, populating the registry. The re-exports
//below double as side-effect imports for the group files that expose frame
//constants, so these bare imports only cover the group files that do not
//re-export frame data through this module.
import '@engine/meshes/character-groups/group-dead';
import '@engine/meshes/character-groups/group-kneel';
import '@engine/meshes/character-groups/group-float';
import '@engine/meshes/character-groups/group-stab';
import '@engine/meshes/character-groups/group-sequence';

import { applySpriteFrame, azimuthToStep, cloneSpriteTexture, createBodyMaterial, getStandardBodyGeometry, isCharacterOnScreen, BODY_W, STANDARD_CONTAINER_H, IDLE_BODY_DX, IDLE_BODY_DY, setVisualDriver } from '@engine/meshes/character-utils';
import { getCharacterModeFactory, registerBlockType } from '@engine/common/registry';
import { State } from '@engine/actions/character-state';

//NOTE(jimmylee)
//Re-exports from character-utils.js for backward compatibility.
export {
  PX_TO_WORLD,
  FAR_BEHIND,
  BEHIND,
  IN_FRONT,
  FACE,
  DEFAULT_AZIMUTH,
  STEP_SIZE,
  BODY_W,
  STANDARD_CONTAINER_H,
  ASSEMBLY_STEP_MAP,
  resolveVariableFrame,
  resolveLoopingFrame,
  azimuthToStep,
  applySpriteFrame,
  createBillboardOverlay,
  cloneSpriteTexture,
  createOverlayMaterial,
  createBodyMaterial,
  createBufferMesh,
  anchorBodyX,
  anchorBodyY,
  positionOverlay,
} from '@engine/meshes/character-utils';

//NOTE(jimmylee)
//Re-exports frame constants for backward compatibility. These `export ... from`
//statements also evaluate the target modules, triggering their
//`registerCharacterMode` side effects.
export { WALK_FRAMES, WALK_HAND_FRAMES } from '@engine/meshes/character-groups/group-walk';
export { FLINCH_FRAMES } from '@engine/meshes/character-groups/group-flinch';
export { DEATH_FRAMES } from '@engine/meshes/character-groups/group-dead';
export { CAST_FRAMES } from '@engine/meshes/character-groups/group-magic-charge';
export { JUMP_FRAMES, JUMP_HAND_FRAMES } from '@engine/meshes/character-groups/group-jump';
export { QUICK_THROW_FRAMES } from '@engine/meshes/character-groups/group-quick-throw';
export { THROW_STONE_FRAMES } from '@engine/meshes/character-groups/group-throw-stone';
export { PUNCH_FRAMES } from '@engine/meshes/character-groups/group-punch';
export { PUNCH_LV2_FRAMES } from '@engine/meshes/character-groups/group-punch-lv2';
export { PUNCH_LV3_FRAMES } from '@engine/meshes/character-groups/group-punch-lv3';
export { KNEEL_FRAMES } from '@engine/meshes/character-groups/group-kneel';
export { GUARD_FRAMES } from '@engine/meshes/character-groups/group-guard';

//NOTE(jimmylee)
//Camera rotation maps to 8 steps (0-7), one per 45° sector.
export const IDLE_FRAMES = [
  { id: 'P3', reversed: false },
  { id: 'P2', reversed: false },
  { id: 'P1', reversed: false },
  { id: 'P4', reversed: false },
  { id: 'P5', reversed: false },
  { id: 'P4', reversed: true },
  { id: 'P1', reversed: true },
  { id: 'P2', reversed: true },
];

const createCharacter = ({ node, textures, direction = 'SE', mode, now }) => {
  const directionOffset = DIRECTION_OFFSETS[direction] ?? DIRECTION_OFFSETS.SE;
  //NOTE(jimmylee)
  //`now` is the shared per-frame timestamp from the caller. The `?? performance.now()` fallback
  //only fires for a caller that constructs a character without one.
  const walkStart = now ?? performance.now();

  //NOTE(jimmylee)
  //Clone texture so each character instance has independent UV state.
  const texture = cloneSpriteTexture(textures);

  //NOTE(jimmylee)
  //Unlit material — pixel art with transparent background. Uses cached base clone.
  const material = createBodyMaterial(texture);

  //NOTE(jimmylee)
  //Plane sized to match sprite aspect ratio within the cube grid.
  const spriteWidth = SPRITE_WIDTH;
  const spriteHeight = SPRITE_HEIGHT;
  const registeredFactory = mode ? getCharacterModeFactory(mode) : null;

  //NOTE(@jimmylee)
  //Composites place their body plane with the mesh transform, so they share one geometry. The idle
  //path below carries its anchor in the geometry, which needs a private copy.
  const geometry = registeredFactory ? getStandardBodyGeometry() : new THREE.PlaneGeometry(spriteWidth, spriteHeight);
  const bodyMesh = new THREE.Mesh(geometry, material);

  //NOTE(jimmylee)
  //Bottom padding compensates for transparent padding below feet in the sprite sheet.
  const bottomPadding = 3;
  const worldX = node.x * cubeSize;
  const worldY = node.y * cubeSize + (spriteHeight - cubeSize) * 0.5 - bottomPadding;
  const worldZ = node.z * cubeSize;

  //NOTE(jimmylee)
  //Registry-based mode dispatch. Every built-in mode self-registers from its
  //own `group-*.js` file at module load time; new modes drop in without a
  //second edit to this file.
  if (registeredFactory) {
    return registeredFactory({ node, textures, direction, directionOffset, walkStart, now: walkStart, worldX, worldY, worldZ, bodyMesh });
  }

  //NOTE(jimmylee)
  //Set initial idle frame.
  const initialIdx = directionOffset;
  const initialFrame = IDLE_FRAMES[initialIdx];
  applySpriteFrame(texture, initialFrame.id, initialFrame.reversed);

  //NOTE(jimmylee)
  //Physics sync owns bodyMesh.position, so the idle anchor (1px beside the origin for the 3/4
  //views, mirrored for reversed idles) lives in this character's own plane geometry and is
  //shifted whenever the rotation index changes.
  const scaleX = spriteWidth / BODY_W;
  const scaleY = spriteHeight / STANDARD_CONTAINER_H;
  geometry.translate(IDLE_BODY_DX[initialIdx] * scaleX, -IDLE_BODY_DY[initialIdx] * scaleY, 0);
  let idleIdx = initialIdx;

  //NOTE(jimmylee)
  //Non-mode path: single mesh (unchanged behavior for static idle characters).
  bodyMesh.position.set(worldX, worldY, worldZ);
  bodyMesh.frustumCulled = false;
  bodyMesh.castShadow = false;
  bodyMesh.receiveShadow = false;

  bodyMesh.userData.character = {
    directionOffset,
    mode,
    walkStart,
    billboardHeight: spriteHeight,
    lastStep: -1,
    lastFrame: -1,
    state: State.FALLING,
    action: null,
  };

  //NOTE(jimmylee)
  //Billboard + sprite update for static idle characters.
  setVisualDriver(bodyMesh, bodyMesh, function (renderer, _scene, camera) {
    if (!camera.userData.isMainCamera) return;
    if (!isCharacterOnScreen(this, camera)) return;

    this.quaternion.copy(camera.quaternion);

    const ch = this.userData.character;
    const step = azimuthToStep(camera);
    const idx = (ch.directionOffset + step) % 8;
    const frame = IDLE_FRAMES[idx];

    if (step !== ch.lastStep) {
      ch.lastStep = step;
      applySpriteFrame(this.material.map, frame.id, frame.reversed);
      if (idx !== idleIdx) {
        geometry.translate((IDLE_BODY_DX[idx] - IDLE_BODY_DX[idleIdx]) * scaleX, -(IDLE_BODY_DY[idx] - IDLE_BODY_DY[idleIdx]) * scaleY, 0);
        idleIdx = idx;
      }
    }

    //NOTE(@jimmylee)
    //WebGLRenderer updated the scene's world matrices before this runs; without this the billboard
    //would be drawn with the previous frame's camera rotation.
    this.updateMatrixWorld();
  });

  return bodyMesh;
};

//NOTE(jimmylee)
//Register the bare ↓↑→← idle character symbols (no mode). Mode-prefixed symbols (↓W, ↑I, …) self-register from each
//`character-groups/group-*.js` file via `registerCharacterMode`.
const CHARACTER_BARE_SYMBOLS = {
  '↓': 'SE',
  '↑': 'NW',
  '→': 'SW',
  '←': 'NE',
};
const CHARACTER_MESH_DATA = { mass: 3, shape: 'CUSTOM_CHARACTER' };

for (const [symbol, direction] of Object.entries(CHARACTER_BARE_SYMBOLS)) {
  registerBlockType({ symbol, meshData: CHARACTER_MESH_DATA, direction, directionalType: 'character' });
}

export default createCharacter;
