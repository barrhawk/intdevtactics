//NOTE(jimmylee)
//Centralized physics constants. All tuning values in one place.

import { cubeSize } from '@engine/constants';

//NOTE(jimmylee)
//World
export const defaultGravity = -50;

//Scripted jump: cubic ease-out rise, enhanced-gravity fall.
//Height is 1.5 cubes (48 units).
export const playerJumpHeight = cubeSize * 1.5;

//Rise duration — 300ms for quick, responsive ascent.
export const playerJumpRiseMs = 300;

//Additional downward acceleration during fall phase (u/s²).
//Stacks with defaultGravity for an effective 550 u/s² fall.
//Fall from peak takes ~0.42s — snappier than the 1.39s natural fall.
export const playerFallExtraAccel = 500;

export const deflectRange = cubeSize * 3;
export const deflectAngle = Math.PI / 4;

//NOTE(@jimmylee)
//Deflection launch velocity: the projectile arc of deflectRange at deflectAngle, v0 = sqrt(range * g).
const deflectV0 = Math.sqrt(deflectRange * Math.abs(defaultGravity));
export const deflectLaunchVH = deflectV0 * Math.cos(deflectAngle);
export const deflectLaunchVV = deflectV0 * Math.sin(deflectAngle);

//NOTE(jimmylee)
//Spawn fade-in duration (ms). Bayer-dithered dissolve, played by Jump Down and Teleport.
export const spawnFadeMs = 600;

//NOTE(jimmylee)
//Despawn fade-out duration (ms). Reverse Bayer-dithered dissolve, played by Jump Down and Teleport.
export const despawnFadeMs = 600;

export const MARBLE_MASS = 4;

//Caught marble physics hold point — half a block forward in the facing direction, at the height of
//the carry track (quickThrowHoldHeight). The body waits here and leaves from here, independent of the
//camera; the drawn marble rides the hand instead (quickThrowMarblePoint in actions/action-timelines.js).
export const CAUGHT_MARBLE_FORWARD_OFFSET = cubeSize * 0.5;

//NOTE(jimmylee)
//Maximum size for visual mesh pools (flinch, kneel, dead). When a pool is at
//capacity, incoming meshes are disposed instead of pooled. Prevents unbounded
//GPU resource retention in extended sessions with many characters.
export const MAX_VISUAL_POOL_SIZE = 8;

