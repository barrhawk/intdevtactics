//NOTE(@jimmylee)
//Timing and trajectory constants for the scripted action timelines, with no physics engine. The
//demo stage replays them, and a scene with physics bodies drives its own actions from the same
//values, so they live here with one owner.
//
//Engine differences from the original tactical RPG. The SEQ data decides what is drawn and when. What an action does in
//the world belongs to the ThreeJS scene, which has no game-side ability effects,
//so these moments are kept where the scene needs them and do not follow the SEQ opcodes:
//  Punch: the hit check runs at tick 12 (PUNCH_HIT_TICKS); SEQ 140-145 play the impact sound at 26.
//  Throw Stone: the stone is an engine object. It leaves the hand on PlaySound at tick 26 and damages
//  on contact, whenever that is; SEQ 208/209 run PostGenericAttack at tick 32.
//  Jump: no TYPE1 sequence is one whole jump, so Mode J joins three of them (JUMP_TICKS) and holds
//  the Mid Jump pose over the JUMP_AIR_TICKS the arc takes.
//documentation/AGENTS.md "Engine Differences From the Original Tactical RPG" is the full list; demo card
//timelines show the SEQ event and the engine event side by side.

import { cubeSize, sphereRadius } from '@engine/constants';
import { defaultGravity } from '@engine/constants/physics';
import { SPRITE_WIDTH, SPRITE_HEIGHT, THROW_HOLD_DEPTH } from '@engine/constants/character';
import { SPRITE_SHEET_FILE } from '@engine/constants/sprites';
import { CARRY_ORIGIN_V, CARRY_TRACK, JUMP_TAKEOFF_FRAMES, JUMP_TICKS, QUICK_THROW_ASSEMBLY, THROW_STONE_ASSEMBLY, THROW_STONE_HANDS, THROW_STONE_TICKS_FWD, THROW_STONE_TICKS_BCK } from '@engine/constants/sprites/assembly';

//NOTE(@jimmylee)
//Mode J. JUMP_ASSEMBLY's frames play once, in order: the unit stays on the ground through the
//take-off frames of Jump 2 (SEQ 204/205), flies the JUMP_LIFT_HEIGHT arc on the Mid Jump pose and
//touches down on the first frame of High Jump Land (SEQ 52/53).
export const JUMP_DELAYS_S = JUMP_TICKS.map((t) => t / 60);
export const JUMP_AIR_FRAME = JUMP_TAKEOFF_FRAMES;
export const JUMP_LAND_FRAME = JUMP_AIR_FRAME + 1;
export const JUMP_CYCLE_DURATION = JUMP_DELAYS_S.reduce((a, b) => a + b, 0);
export const JUMP_TAKEOFF_S = JUMP_DELAYS_S.slice(0, JUMP_AIR_FRAME).reduce((a, b) => a + b, 0);
export const JUMP_TOUCHDOWN_S = JUMP_TAKEOFF_S + JUMP_DELAYS_S[JUMP_AIR_FRAME];

//NOTE(@jimmylee)
//A1 jump. The body leaves the ground as the action starts, and its arc is scripted, so the frames
//follow the action: the last two
//take-off frames over the first ticks of the rise, then the Mid Jump pose until landing clears
//_jumpAction. Returns the JUMP_ASSEMBLY frame for `elapsed` seconds since the jump started.
export function playerJumpFrame(elapsed) {
  if (elapsed < JUMP_DELAYS_S[JUMP_AIR_FRAME - 2]) return JUMP_AIR_FRAME - 2;
  if (elapsed < JUMP_DELAYS_S[JUMP_AIR_FRAME - 2] + JUMP_DELAYS_S[JUMP_AIR_FRAME - 1]) return JUMP_AIR_FRAME - 1;
  return JUMP_AIR_FRAME;
}

//NOTE(@jimmylee)
//A1 landing, drawn from ch._landedAt and purely visual: landing hands control back at
//once, so a unit that moves, jumps or acts on landing never shows it. Returns the JUMP_ASSEMBLY frame
//for `elapsed` seconds since touchdown, or -1 once High Jump Land has played.
export function playerLandFrame(elapsed) {
  let left = elapsed;
  for (let i = JUMP_LAND_FRAME; i < JUMP_DELAYS_S.length; i++) {
    left -= JUMP_DELAYS_S[i];
    if (left < 0) return i;
  }
  return -1;
}

//NOTE(@jimmylee)
//A1 scripted rise: height fraction `t` (0..1) through playerJumpRiseMs, cubic ease-out.
export function jumpRiseCurve(t) {
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

//NOTE(jimmylee)
//Jump height — two full cubes so the character clears a marble at the peak.
export const JUMP_LIFT_HEIGHT = cubeSize * 2;

//NOTE(@jimmylee)
//Height above the take-off point `elapsed` seconds into the cycle: zero on the take-off and landing
//frames, and between take-off and touchdown the constant-acceleration arc 4·h·s·(1 − s), s ∈ [0, 1]
//— the peak falls halfway through the Mid Jump hold. Equivalent gravity: 8·h / T² (~1800 u/s² for
//2 cubes in 533ms); defaultGravity (-50) would only reach ~2 units in that time.
export function jumpLift(elapsed) {
  if (elapsed <= JUMP_TAKEOFF_S || elapsed >= JUMP_TOUCHDOWN_S) return 0;
  const s = (elapsed - JUMP_TAKEOFF_S) / (JUMP_TOUCHDOWN_S - JUMP_TAKEOFF_S);
  return 4 * JUMP_LIFT_HEIGHT * s * (1 - s);
}

//NOTE(@jimmylee)
//Mode TS — throw-stone trigger frames (0-based SEQ 208/209 frame index), read from the SEQ:
//frame 2 (F21/F22, the kneel) is where the hand reaches the ground and picks the stone up, and
//frame 7 (F102/F151) is the first frame drawn after PlaySound (0xFFF6). That frame draws the arm's
//low follow-through with an empty hand, so the stone leaves as it starts, from where the hand was on
//frame 6 (F92/F141, THROW_STONE_LAST_HELD_FRAME). Until then it rides the hand (throwStoneHandPoint).
export const THROW_STONE_SPAWN_FRAME = 2;
export const THROW_STONE_RELEASE_FRAME = 7;
export const THROW_STONE_LAST_HELD_FRAME = THROW_STONE_RELEASE_FRAME - 1;

//NOTE(@jimmylee)
//Mode TS — per-frame delays (seconds, exact ticks / 60) indexed by the assembly pattern: A/B play
//SEQ 208 (front), C/D SEQ 209 (back). The TS visual driver and the main route demo both resolve
//frames from this one map, so in any render frame they agree on the frame index.
export const THROW_STONE_DELAYS_S_FWD = THROW_STONE_TICKS_FWD.map((t) => t / 60);
export const THROW_STONE_DELAYS_S_BCK = THROW_STONE_TICKS_BCK.map((t) => t / 60);
export const THROW_STONE_DELAY_MAP = [THROW_STONE_DELAYS_S_FWD, THROW_STONE_DELAYS_S_FWD, THROW_STONE_DELAYS_S_BCK, THROW_STONE_DELAYS_S_BCK];

//NOTE(@jimmylee)
//Release timing. SEQ 208 and 209 differ only in their last delay, so the throw frame starts at the
//same time in every pattern. The drawn stone settles onto the arc over the follow-through: the throw
//frame and the kneel after it, which ends on the SEQ's PostGenericAttack.
export const THROW_STONE_RELEASE_S = THROW_STONE_DELAYS_S_FWD.slice(0, THROW_STONE_RELEASE_FRAME).reduce((a, b) => a + b, 0);
export const THROW_STONE_FOLLOW_THROUGH_S = THROW_STONE_DELAYS_S_FWD[THROW_STONE_RELEASE_FRAME] + THROW_STONE_DELAYS_S_FWD[THROW_STONE_RELEASE_FRAME + 1];

//NOTE(jimmylee)
//Cooldown between throws per character (ms).
export const THROW_COOLDOWN_MS = 2000;

//NOTE(@jimmylee)
//Held stone: on the throwing hand of the current frame (THROW_STONE_HANDS for the sheet the thrower
//is drawn with — SPRITE_SHEET_FILE unless `sheet` says otherwise), placed in the
//billboard plane through the stance point exactly like a sprite pixel — billboard-local
//(u · scaleX · flip, −v · scaleY), rotated by the camera quaternion — then moved toward the camera
//along the view axis (no screen change under the orthographic camera) so the sphere draws in
//front of the sprite planes. Writes `out` ({ x, y, z }) and returns it, or null when the frame
//has no hand point. `du` is the frame's SEQ unit motion, in pixels down.
export { THROW_HOLD_DEPTH };
const HAND_SCALE_X = SPRITE_WIDTH / 32;
const HAND_SCALE_Y = SPRITE_HEIGHT / 40;

function rotateByQuaternion(q, x, y, z, out) {
  const tx = 2 * (q.y * z - q.z * y);
  const ty = 2 * (q.z * x - q.x * z);
  const tz = 2 * (q.x * y - q.y * x);
  out.x = x + q.w * tx + (q.y * tz - q.z * ty);
  out.y = y + q.w * ty + (q.z * tx - q.x * tz);
  out.z = z + q.w * tz + (q.x * ty - q.y * tx);
  return out;
}

//NOTE(@jimmylee)
//Where a sprite pixel (u, v), in unit pixels from the stance point, draws: billboard-local
//(u · scaleX, −v · scaleY), rotated by the camera quaternion, pushed THROW_HOLD_DEPTH toward the camera
//so a prop draws in front of the sprite planes, or `depth` toward it. `flip` is -1 on the mirrored
//patterns. Writes `out` ({ x, y, z }) and returns it.
const _local = { x: 0, y: 0, z: 0 };
export function billboardPoint(origin, quaternion, u, v, flip, out, depth = THROW_HOLD_DEPTH) {
  rotateByQuaternion(quaternion, u * HAND_SCALE_X * flip, -v * HAND_SCALE_Y, depth, _local);
  out.x = origin.x + _local.x;
  out.y = origin.y + _local.y;
  out.z = origin.z + _local.z;
  return out;
}

export function throwStoneHandPoint(origin, quaternion, frameIdx, patternIdx, out, sheet = SPRITE_SHEET_FILE, du = 0) {
  const hands = THROW_STONE_HANDS[sheet];
  const hand = (patternIdx < 2 ? hands.fwd : hands.bck)[frameIdx];
  if (!hand) return null;
  return billboardPoint(origin, quaternion, hand[0], hand[1] + du, THROW_STONE_ASSEMBLY[patternIdx].reversed ? -1 : 1, out);
}

//NOTE(jimmylee)
//Parabolic arc: Range = v0^2 * sin(2*theta) / g. At 45°: v0 = sqrt(Range * g), vh = vv = v0 / sqrt(2).
//The range runs from the hand, so the stone comes down where it did from a launch point 0.8 blocks
//ahead of the thrower with a range of 2 blocks.
export const THROW_RANGE = cubeSize * 2.5;
export const THROW_LAUNCH_ANGLE = Math.PI / 4;
const THROW_LAUNCH_V0 = Math.sqrt(THROW_RANGE * Math.abs(defaultGravity));
export const THROW_LAUNCH_VH = THROW_LAUNCH_V0 * Math.cos(THROW_LAUNCH_ANGLE);
export const THROW_LAUNCH_VV = THROW_LAUNCH_V0 * Math.sin(THROW_LAUNCH_ANGLE);

//NOTE(@jimmylee)
//The camera-independent release point: the sheet's front hand on the last held frame, its
//pixels read as forward along the unit's facing and height above its stance, the way seqMoveLocal
//reads SEQ forward motion. The billboard hand changes with the camera, so physics never reads it.
const RELEASE_HAND = THROW_STONE_HANDS[SPRITE_SHEET_FILE].fwd[THROW_STONE_LAST_HELD_FRAME];
export const THROW_LAUNCH_FORWARD = Math.abs(RELEASE_HAND[0]) * HAND_SCALE_X;
export const THROW_LAUNCH_UP = -RELEASE_HAND[1] * HAND_SCALE_Y;

//NOTE(@jimmylee)
//Writes the release point for a thrower at `origin` facing (dirX, dirZ) into `out` and returns it.
export function throwStoneLaunchPoint(origin, dirX, dirZ, out) {
  out.x = origin.x + dirX * THROW_LAUNCH_FORWARD;
  out.y = origin.y + THROW_LAUNCH_UP;
  out.z = origin.z + dirZ * THROW_LAUNCH_FORWARD;
  return out;
}

//NOTE(@jimmylee)
//Thrown stone, `t` seconds after the throw frame starts: one arc from `launch` with THROW_LAUNCH_VH
//along (dirX, dirZ) and THROW_LAUNCH_VV up. The drawn stone starts on `hand`, the billboard hand it
//was held in, and the hand → launch offset shrinks to zero over the follow-through, so it leaves the
//hand with no jump on screen and the arc never reads the camera. `vh`, `vv` and `settleS` are the
//launch and that settling time of anything else that leaves a drawn hand this way. Writes `out`
//({ x, y, z }) and returns it.
export function throwStoneFlightPoint(launch, hand, dirX, dirZ, t, out, vh = THROW_LAUNCH_VH, vv = THROW_LAUNCH_VV, settleS = THROW_STONE_FOLLOW_THROUGH_S) {
  const w = t < settleS ? 1 - t / settleS : 0;
  out.x = launch.x + dirX * vh * t + (hand.x - launch.x) * w;
  out.y = launch.y + vv * t + 0.5 * defaultGravity * t * t + (hand.y - launch.y) * w;
  out.z = launch.z + dirZ * vh * t + (hand.z - launch.z) * w;
  return out;
}

//NOTE(jimmylee)
//Punch Lv2 timing from assembly delays [2, 8, 2, 4, 10, 18, 2, 4] = 50 ticks.
//Extend frames start at tick 12 (after Ready frames 0-1 and Extend-start frame 2).
//Engine difference: SEQ 140-145 play the impact sound at tick 26. The hit stays on tick 12, the
//first extend frame, and the Bow cards show the two side by side.
export const PUNCH_HIT_TICKS = 12;
export const PUNCH_HIT_MS = (PUNCH_HIT_TICKS / 60) * 1000;
export const PUNCH_CYCLE_TICKS = 50;
export const PUNCH_CYCLE_MS = (PUNCH_CYCLE_TICKS / 60) * 1000;

//NOTE(@jimmylee)
//Magic charge / A1 cast: SEQ 64/65 draws each of its 2 frames for 20 ticks.
export const CAST_FRAME_S = 20 / 60;
export const CAST_CYCLE_MS = 2 * CAST_FRAME_S * 1000;

//NOTE(@jimmylee)
//Quick throw timing from T assembly delays [4, 4, 8, 2, 4, 2] = 24 ticks: the hand reaches the marble
//on the kneel (frame 2, tick 8), the marble rises with the hands through F19/F20 and F27/F29, and it
//leaves on the overhead frame F31/F33 (frame 5, tick 22), where SEQ 206/207 run PlaySound on these
//same frames. SEQ 48/49 carry no event; they hold that frame until the game ends the action.
export const QT_PICKUP_FRAME = 2;
export const QT_PICKUP_TICKS = 8;
export const QT_PICKUP_MS = (QT_PICKUP_TICKS / 60) * 1000;
export const QT_RELEASE_FRAME = 5;
export const QT_RELEASE_TICKS = 22;
export const QT_RELEASE_MS = (QT_RELEASE_TICKS / 60) * 1000;
export const QT_CYCLE_TICKS = 24;
export const QT_CYCLE_MS = (QT_CYCLE_TICKS / 60) * 1000;
const QT_PICKUP_S = QT_PICKUP_TICKS / 60;
const QT_RELEASE_S = QT_RELEASE_TICKS / 60;
const QT_RELEASE_FRAME_S = QT_CYCLE_MS / 1000 - QT_RELEASE_S;
const QT_RISE_MS = QT_PICKUP_MS + ((8 / 60) * 1000);
const QT_REACH_MS = QT_RISE_MS + ((2 / 60) * 1000);
const QT_RELEASE_DU = QUICK_THROW_ASSEMBLY[1].frames[QT_RELEASE_FRAME].move.du;

//NOTE(@jimmylee)
//Height above the stance point of a caught marble's body, `elapsedMs` into the action: the carry
//track of the drawn frame (CARRY_TRACK), so the body rises with the hands from the kneel to overhead
//from the data alone, the same at every camera. Before the kneel it waits at the kneel height. The
//track starts on the ground, so the height stops at a marble resting on the floor: a marble dropped by
//an interrupted throw must not start inside it.
const QT_HOLD_FRAMES = [21, 19, 27, 31];
const QT_HOLD_FLOOR = sphereRadius - SPRITE_HEIGHT / 2;
const QT_HOLD_HEIGHT = QT_HOLD_FRAMES.map((f) => Math.max(-(CARRY_TRACK.fwd[f][1] + CARRY_ORIGIN_V) * HAND_SCALE_Y, QT_HOLD_FLOOR));
export function quickThrowHoldHeight(elapsedMs) {
  if (elapsedMs < QT_RISE_MS) return QT_HOLD_HEIGHT[0];
  if (elapsedMs < QT_REACH_MS) return QT_HOLD_HEIGHT[1];
  if (elapsedMs < QT_RELEASE_MS) return QT_HOLD_HEIGHT[2];
  return QT_HOLD_HEIGHT[3];
}

//NOTE(@jimmylee)
//A caught marble as the Mode T visual driver draws it (ch._heldMarble): the mesh, where it was
//caught, and the sheet the thrower is drawn with — the engine's SPRITE_SHEET_FILE unless `sheet`
//says otherwise. Call it before the mesh moves to the physics hold point.
export function createHeldMarble(mesh, sheet = SPRITE_SHEET_FILE) {
  return { mesh, catchPoint: { x: mesh.position.x, y: mesh.position.y, z: mesh.position.z }, sheet };
}

//NOTE(@jimmylee)
//Where a caught marble is drawn on quick throw frame `frameIdx`, `elapsed` seconds into the action.
//SEQ 48/49 frames 2-5 are the SHP frames of SEQ 208/209 frames 2-5 (F21/F22, F19/F20, F27/F29,
//F31/F33), so the throw-stone grips and throwStoneHandPoint give the hand. The physics body never
//reads this point: it stays on the camera-independent hold point and leaves from there
//(held.mesh.position).
//Frames 0-1: moves from the catch point to the kneel hand, arriving as the kneel is drawn.
//Frames 2-4: on the hand. Frame 5: on the overhead hand when the frame starts, and the hand → body
//offset shrinks to zero by its end, so the marble joins its deflection arc with no jump on screen.
//Writes `out` ({ x, y, z }) and returns it, or null once the marble is simply its body.
const _handPoint = { x: 0, y: 0, z: 0 };
export function quickThrowMarblePoint(held, origin, quaternion, frameIdx, elapsed, patternIdx, out) {
  const releasing = elapsed >= QT_RELEASE_S;
  if (elapsed >= QT_RELEASE_S + QT_RELEASE_FRAME_S) return null;
  throwStoneHandPoint(origin, quaternion, Math.max(frameIdx, QT_PICKUP_FRAME), patternIdx, _handPoint, held.sheet, releasing ? QT_RELEASE_DU : 0);
  const from = frameIdx < QT_PICKUP_FRAME ? held.catchPoint : held.mesh.position;
  let w = 1;
  if (frameIdx < QT_PICKUP_FRAME) w = elapsed / QT_PICKUP_S;
  else if (releasing) w = 1 - (elapsed - QT_RELEASE_S) / QT_RELEASE_FRAME_S;
  out.x = from.x + (_handPoint.x - from.x) * w;
  out.y = from.y + (_handPoint.y - from.y) * w;
  out.z = from.z + (_handPoint.z - from.z) * w;
  return out;
}

//NOTE(jimmylee)
//Stab hit check: once, at the start of frame 5 (the extend frame held for 14 ticks) — tick 18, where
//SEQ 96-101 run PostGenericAttack (0xFFDE).
export const STAB_HIT_FRAME = 5;
