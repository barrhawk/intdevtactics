//NOTE(jimmylee)
//Centralized character dimension constants. All character sprite sizes,
//billboard heights, and collision box half-extents in one place.

import { cubeSize, sphereRadius } from './index.js';

//NOTE(jimmylee)
//Pixel-to-world conversion using square pixel scaling.
//Used by SEQ unit motion along the facing and by the single poses (Kneel, Dead).
//Billboard composites derive their own non-square scale factors from the body plane instead.
export const PX_TO_WORLD = (cubeSize * 0.75) / 32;

//NOTE(jimmylee)
//Standard character sprite dimensions in world units.
//SPRITE_WIDTH = BODY_W * PX_TO_WORLD. SPRITE_HEIGHT matches billboard height from createCharacter.
export const SPRITE_WIDTH = cubeSize * 0.75;
export const SPRITE_HEIGHT = cubeSize * 1.125;

//NOTE(jimmylee)
//Standard billboard height for physics shape derivation.
//Same value as SPRITE_HEIGHT — the standard character billboard IS the sprite height.
export const STANDARD_BILLBOARD_H = SPRITE_HEIGHT;

//NOTE(jimmylee)
//Kneel/dead billboard height (32px sprite × PX_TO_WORLD = 24 world units).
export const KNEEL_BILLBOARD_H = 32 * PX_TO_WORLD;

//NOTE(@jimmylee)
//The game's initial camera elevation (CAMERA_INITIAL_* = 0.5, 0.3, -0.5, about 23°), the view the sprites
//are drawn for.
export const GAME_ELEVATION = Math.atan2(0.3, Math.SQRT1_2);

//NOTE(@jimmylee)
//A held item is drawn among a frame's tiles, not in front of or behind the whole sprite. The camera is
//orthographic, so depth along the view axis changes what covers what and moves nothing on screen: the tiles
//drawn over the item stand ITEM_LAYER_GAP toward the camera, and the item's depth is flattened into the gap
//(weapons/held-item-mesh.js), halfway up it, ITEM_FLATTEN thick per world unit it reaches.
export const ITEM_LAYER_GAP = 0.4;
export const ITEM_FLATTEN = 0.005;
//NOTE(@jimmylee)
//How squarely an item has to point along the view, as the cosine of the angle between them, to be end-on: it
//then stands in front of every tile, or behind every tile, whatever its card says. An item in the plane of the
//unit's facing cannot reach this at the game's views, which are 45 degrees off the unit, so the cards keep every
//answer that was settled by looking at them (`tests/set-items.test.js`).
export const ITEM_END_ON = 0.8;
//NOTE(@jimmylee)
//A frame's entry in `ch.itemLayer` for a ball held in both hands: the head, the top hand and the bottom hand
//stand over it, and the torso between them does not. A number, because the kit's tables are JSON.
export const AROUND_BODY = -99;

//NOTE(@jimmylee)
//How far a stone or a marble in a hand stands toward the camera, so it draws in front of the sprite planes:
//these two stay in front of the sprite, where every other held item goes among its tiles.
export const THROW_HOLD_DEPTH = sphereRadius + 2;

//NOTE(jimmylee)
//Character collision box half-extents: 24 wide, 8 deep, height varies. The demo stage has no physics
//engine, but a stone's hit, a bow's hit and the pose pivots are placed on this box. What meets the water
//is the body read from the sprite (physics/sprite-body.js).
export const CHAR_HALF_X = 12;
export const CHAR_HALF_Y_DEFAULT = 18;
export const CHAR_HALF_Z = 4;
