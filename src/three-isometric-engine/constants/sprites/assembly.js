import { SPRITE_MAP } from './index.js';

//NOTE(@jimmylee)
//SEQ delays are ticks at 60fps. Every ms delay below is the exact tick time, unrounded: the sums are
//the SEQ's durations, so a frame boundary and an action timed in ticks fall on the same instant.
const ticksToMs = (t) => (t * 1000) / 60;

//NOTE(jimmylee)
//Torso→Head lookup table. Each headless torso sprite (AF/AB, 32x32) has exactly one
//associated head sprite (TF/TB, 24x24) at a fixed dx/dy offset. This relationship is
//stable across all 98 full-body frames (F84-F181) in the SHP data.
//The head position is a property of the torso pose, not the animation frame.
export const TORSO_HEAD_MAP = {
  AF1: { id: 'TF1', dx: 5, dy: -10 },
  AF2: { id: 'TF1', dx: 2, dy: -9 },
  AF3: { id: 'TF1', dx: -1, dy: -4 },
  AF4: { id: 'TF2', dx: -2, dy: -3 },
  AF5: { id: 'TF1', dx: 4, dy: -12 },
  AB1: { id: 'TB1', dx: 2, dy: -12 },
  AB2: { id: 'TB1', dx: -2, dy: -11 },
  AB3: { id: 'TB1', dx: -6, dy: -9 },
  AB4: { id: 'TB2', dx: -10, dy: -7 },
  AB5: { id: 'TB1', dx: 0, dy: -12 },
};

//NOTE(jimmylee)
//Unit origin and stance reference on the TYPE1.SHP canvas. Tile.cs places every tile at
//(x + 53, y + 118): canvas column 53 is the unit's origin — the SR1 ground marker of F0 is
//centered on it and the game mirrors a unit about it (the mirrored idle frames F4-F6 are F2/F1/F8
//reflected about x = 53). Row 103 is the idle stance center (P2 on F2, 40px tall from row 83);
//the engine's body plane is centered on (SHP_ORIGIN_X, STANCE_Y).
export const SHP_ORIGIN_X = 53;
export const STANCE_Y = 103;

//NOTE(jimmylee)
//Body→anchor lookup table. TYPE1.SHP places every tile on a fixed canvas, so a body tile sits
//at a specific spot relative to the unit origin. The anchor is that body tile's center offset
//(pixels, SHP convention: +dx right, +dy down) from (SHP_ORIGIN_X, STANCE_Y). Renderers place
//the body at its anchor and every overlay relative to the body, so each frame lands where the
//Shishi sprite editor composites it. Like TORSO_HEAD_MAP, the anchor is a property of the body
//tile and holds in every first-half SHP frame, with one exception: the walk cycle (WALK_BOB_DY).
//Offsets are for unmirrored patterns; reversed patterns mirror them about the origin (dx × -1),
//which is exactly how the game draws its mirrored directions.
export const BODY_ANCHOR_MAP = {
  P1: { dx: -1, dy: 0 },
  P2: { dx: -1, dy: 0 },
  P3: { dx: 0, dy: 0 },
  P4: { dx: -1, dy: 0 },
  P5: { dx: 0, dy: 0 },
  BF1: { dx: -1, dy: 0 },
  BF2: { dx: -1, dy: 0 },
  BF3: { dx: -1, dy: 0 },
  BF4: { dx: -1, dy: 0 },
  BF5: { dx: -1, dy: 0 },
  BB1: { dx: -1, dy: 0 },
  BB2: { dx: -1, dy: 0 },
  BB3: { dx: -1, dy: 0 },
  BB4: { dx: -1, dy: 0 },
  BB5: { dx: -1, dy: 0 },
  HR1: { dx: -1, dy: 5 },
  HR2: { dx: -1, dy: 5 },
  KO1: { dx: 0, dy: 12 },
  KO2: { dx: 0, dy: 12 },
  KO3: { dx: -1, dy: 4 },
  KO4: { dx: -1, dy: 4 },
  CH1: { dx: -1, dy: -4 },
  CH2: { dx: -1, dy: -4 },
  CH3: { dx: -1, dy: -4 },
  CH4: { dx: -1, dy: -4 },
  SR19: { dx: -1, dy: -4 },
  SR20: { dx: -1, dy: -4 },
  DF1: { dx: 0, dy: -4 },
  DB1: { dx: 0, dy: -4 },
  AF1: { dx: 0, dy: 3 },
  AF2: { dx: 0, dy: 4 },
  AF3: { dx: 0, dy: 4 },
  AF4: { dx: 0, dy: 4 },
  AF5: { dx: -1, dy: 4 },
  AB1: { dx: -1, dy: 5 },
  AB2: { dx: -1, dy: 4 },
  AB3: { dx: -1, dy: 4 },
  AB4: { dx: -1, dy: 4 },
  AB5: { dx: -1, dy: 4 },
};

//NOTE(jimmylee)
//Walk-cycle bob (SEQ 6/7). In the walk frames F9-F13 / F14-F18 the body sinks on the
//stride poses: base frames BF1-BF5 / BB1-BB5 sit this many pixels below their
//BODY_ANCHOR_MAP position. Played in SEQ order [2,1,0,1,2,3,4,3] this is a 0→1→2px
//bob per step. Guard (SEQ 76/77) holds walk frame 5 (F13/F18), so it keeps the +2.
export const WALK_BOB_DY = [2, 1, 0, 1, 2];

//NOTE(jimmylee)
//Float (SEQ 12/13 = animation 0x12/0x13) assembly — the hover idle of a floating unit.
//One 3-tile composition per pattern using walk frame 3 tiles (BF3/BB3 body + RF3/LF3/RB3/LB3 hands);
//the unit bobs on FLOAT_DELAYS / FLOAT_MOVES. Same structure as Guard.
//F70 = RF3 → BF3 → LF3 (same as walk neutral F11). F71 = RB3 → BB3 → LB3 (same as walk neutral F16).
export const FLOAT_ASSEMBLY = [
  { name: 'Pattern A (0, 7) ←', body: 'BF3', behind: { id: 'RF3', dx: -1, dy: 0 }, front: { id: 'LF3', dx: 4, dy: 4 }, reversed: true, seq: 'SEQ 12', shp: 'F70' },
  { name: 'Pattern B (1, 2) ↓', body: 'BF3', behind: { id: 'RF3', dx: -1, dy: 0 }, front: { id: 'LF3', dx: 4, dy: 4 }, reversed: false, seq: 'SEQ 12', shp: 'F70' },
  { name: 'Pattern C (3, 4) →', body: 'BB3', behind: { id: 'RB3', dx: 4, dy: 0 }, front: { id: 'LB3', dx: -4, dy: 3 }, reversed: false, seq: 'SEQ 13', shp: 'F71' },
  { name: 'Pattern D (5, 6) ↑', body: 'BB3', behind: { id: 'RB3', dx: 4, dy: 0 }, front: { id: 'LB3', dx: -4, dy: 3 }, reversed: true, seq: 'SEQ 13', shp: 'F71' },
];

//NOTE(jimmylee)
//Guard Hold (SEQ 76/77) assembly — defensive blocking stance.
//Static 3-tile composition per pattern using walk frame 5 tiles (BF5/BB5 body + RF5/LF5/RB5/LB5 hands).
//Same structure as walk but frozen on the guard pose. No timing array needed (static).
export const GUARD_ASSEMBLY = [
  { name: 'Pattern A (0, 7) ←', body: 'BF5', behind: { id: 'RF5', dx: -4, dy: 0 }, front: { id: 'LF5', dx: 4, dy: 4 }, reversed: true, seq: 'SEQ 76', shp: 'F13' },
  { name: 'Pattern B (1, 2) ↓', body: 'BF5', behind: { id: 'RF5', dx: -4, dy: 0 }, front: { id: 'LF5', dx: 4, dy: 4 }, reversed: false, seq: 'SEQ 76', shp: 'F13' },
  { name: 'Pattern C (3, 4) →', body: 'BB5', behind: { id: 'RB5', dx: 4, dy: 0 }, front: { id: 'LB5', dx: -4, dy: 3 }, reversed: false, seq: 'SEQ 77', shp: 'F18' },
  { name: 'Pattern D (5, 6) ↑', body: 'BB5', behind: { id: 'RB5', dx: 4, dy: 0 }, front: { id: 'LB5', dx: -4, dy: 3 }, reversed: true, seq: 'SEQ 77', shp: 'F18' },
];

//NOTE(jimmylee)
//Walk cycle per-frame delays from SEQ 6/7 binary data (ticks at 60fps → ms).
//Variable emphasis: neutral frames (100ms) are fast, extreme frames (167ms) linger.
//Total cycle: 64 ticks = 1066.67ms.
export const WALK_DELAYS = [6, 8, 10, 8, 6, 8, 10, 8].map(ticksToMs);

//NOTE(jimmylee)
//Idle mode assembly — maps from createCharacter.js IDLE_FRAMES.
//8 rotation steps, each using one of P1-P5 with optional reverse.
export const IDLE_ASSEMBLY = [
  { step: 0, id: 'P3', reversed: false, label: 'Step 0', seq: 'SEQ 1', shp: 'F3' },
  { step: 1, id: 'P2', reversed: false, label: 'Step 1 (SE) ↓', seq: 'SEQ 2', shp: 'F2' },
  { step: 2, id: 'P1', reversed: false, label: 'Step 2', seq: 'SEQ 3', shp: 'F1' },
  { step: 3, id: 'P4', reversed: false, label: 'Step 3 (SW) →', seq: 'SEQ 4', shp: 'F8' },
  { step: 4, id: 'P5', reversed: false, label: 'Step 4', seq: 'SEQ 5', shp: 'F7' },
  { step: 5, id: 'P4', reversed: true, label: 'Step 5 (NW) ↑', seq: '-', shp: 'F6' },
  { step: 6, id: 'P1', reversed: true, label: 'Step 6', seq: '-', shp: 'F5' },
  { step: 7, id: 'P2', reversed: true, label: 'Step 7 (NE) ←', seq: '-', shp: 'F4' },
];

//NOTE(jimmylee)
//Walk (SEQ 6-7) assembly — mirrors createCharacter.js WALK_FRAMES + WALK_HAND_FRAMES.
//4 distinct patterns, each with 5 body frames and 5 hand frame pairs.
//Hand pair order is visual display order (left-to-right on screen), not engine children[] order.
//Patterns A and D swap hand order from engine for correct visual layout when reversed.
export const WALK_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 6',
    shp: 'F9-F13',
    body: [
      { id: 'BF1', reversed: true },
      { id: 'BF2', reversed: true },
      { id: 'BF3', reversed: true },
      { id: 'BF4', reversed: true },
      { id: 'BF5', reversed: true },
    ],
    hands: [
      [
        { id: 'LF1', reversed: true, dx: 4, dy: 4 },
        { id: 'RF1', reversed: true, dx: 0, dy: 0 },
      ],
      [
        { id: 'LF2', reversed: true, dx: 4, dy: 4 },
        { id: 'RF2', reversed: true, dx: -1, dy: 0 },
      ],
      [
        { id: 'LF3', reversed: true, dx: 4, dy: 4 },
        { id: 'RF3', reversed: true, dx: -1, dy: 0 },
      ],
      [
        { id: 'LF4', reversed: true, dx: 4, dy: 4 },
        { id: 'RF4', reversed: true, dx: -4, dy: 0 },
      ],
      [
        { id: 'LF5', reversed: true, dx: 4, dy: 4 },
        { id: 'RF5', reversed: true, dx: -4, dy: 0 },
      ],
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 6',
    shp: 'F9-F13',
    body: [
      { id: 'BF1', reversed: false },
      { id: 'BF2', reversed: false },
      { id: 'BF3', reversed: false },
      { id: 'BF4', reversed: false },
      { id: 'BF5', reversed: false },
    ],
    hands: [
      [
        { id: 'RF1', reversed: false, dx: 0, dy: 0 },
        { id: 'LF1', reversed: false, dx: 4, dy: 4 },
      ],
      [
        { id: 'RF2', reversed: false, dx: -1, dy: 0 },
        { id: 'LF2', reversed: false, dx: 4, dy: 4 },
      ],
      [
        { id: 'RF3', reversed: false, dx: -1, dy: 0 },
        { id: 'LF3', reversed: false, dx: 4, dy: 4 },
      ],
      [
        { id: 'RF4', reversed: false, dx: -4, dy: 0 },
        { id: 'LF4', reversed: false, dx: 4, dy: 4 },
      ],
      [
        { id: 'RF5', reversed: false, dx: -4, dy: 0 },
        { id: 'LF5', reversed: false, dx: 4, dy: 4 },
      ],
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 7',
    shp: 'F14-F18',
    body: [
      { id: 'BB1', reversed: false },
      { id: 'BB2', reversed: false },
      { id: 'BB3', reversed: false },
      { id: 'BB4', reversed: false },
      { id: 'BB5', reversed: false },
    ],
    hands: [
      [
        { id: 'LB1', reversed: false, dx: -4, dy: 3 },
        { id: 'RB1', reversed: false, dx: 4, dy: 0 },
      ],
      [
        { id: 'LB2', reversed: false, dx: -4, dy: 3 },
        { id: 'RB2', reversed: false, dx: 4, dy: 0 },
      ],
      [
        { id: 'LB3', reversed: false, dx: -4, dy: 3 },
        { id: 'RB3', reversed: false, dx: 4, dy: 0 },
      ],
      [
        { id: 'LB4', reversed: false, dx: -4, dy: 3 },
        { id: 'RB4', reversed: false, dx: 4, dy: 0 },
      ],
      [
        { id: 'LB5', reversed: false, dx: -4, dy: 3 },
        { id: 'RB5', reversed: false, dx: 4, dy: 0 },
      ],
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 7',
    shp: 'F14-F18',
    body: [
      { id: 'BB1', reversed: true },
      { id: 'BB2', reversed: true },
      { id: 'BB3', reversed: true },
      { id: 'BB4', reversed: true },
      { id: 'BB5', reversed: true },
    ],
    hands: [
      [
        { id: 'RB1', reversed: true, dx: 4, dy: 0 },
        { id: 'LB1', reversed: true, dx: -4, dy: 3 },
      ],
      [
        { id: 'RB2', reversed: true, dx: 4, dy: 0 },
        { id: 'LB2', reversed: true, dx: -4, dy: 3 },
      ],
      [
        { id: 'RB3', reversed: true, dx: 4, dy: 0 },
        { id: 'LB3', reversed: true, dx: -4, dy: 3 },
      ],
      [
        { id: 'RB4', reversed: true, dx: 4, dy: 0 },
        { id: 'LB4', reversed: true, dx: -4, dy: 3 },
      ],
      [
        { id: 'RB5', reversed: true, dx: 4, dy: 0 },
        { id: 'LB5', reversed: true, dx: -4, dy: 3 },
      ],
    ],
  },
];

//NOTE(@jimmylee)
//Jump per-frame delays in ticks, the one owner: the five take-off frames of Jump 2 (SEQ 204/205), the
//Mid Jump pose (SEQ 42/43, held by the SEQ; JUMP_AIR_TICKS here carry the arc) and High Jump Land
//(SEQ 52/53). 72 ticks = 1200ms.
export const JUMP_TAKEOFF_FRAMES = 5;
export const JUMP_AIR_TICKS = 32;
export const JUMP_TICKS = [2, 8, 4, 4, 4, JUMP_AIR_TICKS, 2, 10, 6];
export const JUMP_DELAYS = JUMP_TICKS.map(ticksToMs);

//NOTE(@jimmylee)
//Jump assembly: F56, F19, F11, F27, F28 on the ground, F28 in the air, F27, F21, F19 back on the
//ground (back: F63, F20, F16, F29, F30, F30, F29, F22, F20). Bodies are 32x40 standing, 32x16 HR1/HR2
//crouching (legs behind, head in front) and 32x32 KO3/KO4 kneeling, which draw no hands.
const JUMP_CROUCH_FRONT = { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, front: { id: 'SP3', dx: 0, dy: -12 } };
const JUMP_FRAMES_FRONT = [
  { body: 'BF4', behind: { id: 'EF1', dx: -7, dy: -1 }, front: { id: 'LF2', dx: 4, dy: 4 } },
  JUMP_CROUCH_FRONT,
  { body: 'BF3', behind: { id: 'RF3', dx: -1, dy: 0 }, front: { id: 'LF3', dx: 4, dy: 4 } },
  { body: 'BF3', behind: { id: 'EF1', dx: -7, dy: -1 }, front: { id: 'EF2', dx: 0, dy: 3 } },
  { body: 'BF3', behind: { id: 'EFR3', dx: -5, dy: -7 }, front: { id: 'EFL3', dx: 3, dy: -5 } },
  { body: 'BF3', behind: { id: 'EFR3', dx: -5, dy: -7 }, front: { id: 'EFL3', dx: 3, dy: -5 } },
  { body: 'BF3', behind: { id: 'EF1', dx: -7, dy: -1 }, front: { id: 'EF2', dx: 0, dy: 3 } },
  { body: 'KO3', behind: null, front: null },
  JUMP_CROUCH_FRONT,
];
const JUMP_CROUCH_BACK = { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, front: { id: 'SP2', dx: 0, dy: -12 } };
const JUMP_FRAMES_BACK = [
  { body: 'BB4', behind: { id: 'RB4', dx: 4, dy: 0 }, front: { id: 'EFL5', dx: -8, dy: -2 } },
  JUMP_CROUCH_BACK,
  { body: 'BB3', behind: { id: 'RB3', dx: 4, dy: 0 }, front: { id: 'LB3', dx: -4, dy: 3 } },
  { body: 'BB3', behind: { id: 'EFR5', dx: 2, dy: -6 }, front: { id: 'EFL5', dx: -8, dy: -2 } },
  { body: 'BB3', behind: { id: 'EFR4', dx: 2, dy: -8 }, front: { id: 'EFL4', dx: -7, dy: -4 } },
  { body: 'BB3', behind: { id: 'EFR4', dx: 2, dy: -8 }, front: { id: 'EFL4', dx: -7, dy: -4 } },
  { body: 'BB3', behind: { id: 'EFR5', dx: 2, dy: -6 }, front: { id: 'EFL5', dx: -8, dy: -2 } },
  { body: 'KO4', behind: null, front: null },
  JUMP_CROUCH_BACK,
];
const jumpPattern = (name, reversed, frames, seq, shp) => ({ name, reversed, seq, shp, frames: frames.map((f) => ({ ...f })) });
const JUMP_SEQ_FRONT = 'SEQ 204, 42, 52';
const JUMP_SEQ_BACK = 'SEQ 205, 43, 53';
const JUMP_SHP_FRONT = 'F56, F19, F11, F27, F28, F21';
const JUMP_SHP_BACK = 'F63, F20, F16, F29, F30, F22';
export const JUMP_ASSEMBLY = [
  jumpPattern('Pattern A (0, 7) ←', true, JUMP_FRAMES_FRONT, JUMP_SEQ_FRONT, JUMP_SHP_FRONT),
  jumpPattern('Pattern B (1, 2) ↓', false, JUMP_FRAMES_FRONT, JUMP_SEQ_FRONT, JUMP_SHP_FRONT),
  jumpPattern('Pattern C (3, 4) →', false, JUMP_FRAMES_BACK, JUMP_SEQ_BACK, JUMP_SHP_BACK),
  jumpPattern('Pattern D (5, 6) ↑', true, JUMP_FRAMES_BACK, JUMP_SEQ_BACK, JUMP_SHP_BACK),
];

//NOTE(jimmylee)
//Quick throw per-frame delays from SEQ 48/49 binary data (ticks at 60fps → ms).
//Stance(4) → Crouch(4) → Kneel(8) → Rise(2) → Reach(4) → Overhead(2) = 24 ticks = 400ms.
//SEQ 48/49 hold the overhead frame F31/F33 (delay 0) until the game ends the action; SEQ 206/207
//draw the same six frames with PlaySound before F31/F33 and give it the 2 ticks used here.
export const QUICK_THROW_DELAYS = [4, 4, 8, 2, 4, 2].map(ticksToMs);

//NOTE(jimmylee)
//Quick throw (SEQ 48/49) assembly — 6-frame non-looping sequence.
//Variable tile compositions per frame: single tile (F2/F21), 3-tile (F19/F27), 4-tile (F31/F33).
//Uses behind/body/front structure like JUMP_ASSEMBLY, with null for frames lacking overlays.
//F19/F20 hit-recoil frames have HR1/HR2 (32x16) body, not standard 32x40.
//F21/F22 KO frames have KO3/KO4 (32x32) body.
//
//Body height varies across frames: P2/BF3=40px, KO3/KO4=32px, HR1/HR2=16px.
//Each body is placed at its BODY_ANCHOR_MAP offset, so shorter bodies land where
//TYPE1.SHP puts them (HR1 sits 5px below the idle center, KO3 4px).
//The last frame F31/F33 lifts both arms overhead and rises 2px (MoveUp2): the throw itself.
export const QUICK_THROW_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 48',
    shp: 'F2, F19, F21, F19, F27, F31',
    frames: [
      { body: 'P2', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'KO3', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'BF3', behind: { id: 'EF1', dx: -7, dy: -1 }, head: null, front: { id: 'EF2', dx: 0, dy: 3 } },
      { body: 'SR19', behind: { id: 'EFR3', dx: -5, dy: -3 }, head: null, over: { id: 'AU1', dx: 0, dy: 17 }, front: { id: 'EFL3', dx: 3, dy: -1 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 48',
    shp: 'F2, F19, F21, F19, F27, F31',
    frames: [
      { body: 'P2', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'KO3', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'BF3', behind: { id: 'EF1', dx: -7, dy: -1 }, head: null, front: { id: 'EF2', dx: 0, dy: 3 } },
      { body: 'SR19', behind: { id: 'EFR3', dx: -5, dy: -3 }, head: null, over: { id: 'AU1', dx: 0, dy: 17 }, front: { id: 'EFL3', dx: 3, dy: -1 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 49',
    shp: 'F8, F20, F22, F20, F29, F33',
    frames: [
      { body: 'P4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'BB3', behind: { id: 'EFR5', dx: 2, dy: -6 }, head: null, front: { id: 'EFL5', dx: -8, dy: -2 } },
      { body: 'SR20', behind: { id: 'EFR4', dx: 2, dy: -4 }, head: null, over: { id: 'AU2', dx: 0, dy: 17 }, front: { id: 'EFL4', dx: -7, dy: 0 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 49',
    shp: 'F8, F20, F22, F20, F29, F33',
    frames: [
      { body: 'P4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'BB3', behind: { id: 'EFR5', dx: 2, dy: -6 }, head: null, front: { id: 'EFL5', dx: -8, dy: -2 } },
      { body: 'SR20', behind: { id: 'EFR4', dx: 2, dy: -4 }, head: null, over: { id: 'AU2', dx: 0, dy: 17 }, front: { id: 'EFL4', dx: -7, dy: 0 } },
    ],
  },
];

//NOTE(@jimmylee)
//Cinematic throw stone per-frame delays from SEQ 208/209 (ticks at 60fps). The tick arrays are the
//one owner: the ms arrays below feed the 2D sections of the main route, and action-timelines.js derives the
//exact-second timeline the engine updater, the TS visual driver and the main route demos all resolve.
//12-frame throw-attack combo: throw wind-up (6 frames) → full-body melee follow-through (6 frames).
//SEQ 208 (front): 38 ticks = 633ms. SEQ 209 (back): last frame 2→6 ticks, 42 ticks = 700ms.
//Non-looping: plays once then holds on final frame.
export const THROW_STONE_TICKS_FWD = [4, 4, 8, 2, 4, 2, 2, 2, 4, 2, 2, 2];
export const THROW_STONE_TICKS_BCK = [4, 4, 8, 2, 4, 2, 2, 2, 4, 2, 2, 6];
export const THROW_STONE_DELAYS_FWD = THROW_STONE_TICKS_FWD.map(ticksToMs);
export const THROW_STONE_DELAYS_BCK = THROW_STONE_TICKS_BCK.map(ticksToMs);

//NOTE(@jimmylee)
//Throwing-hand grip per frame, per sheet. Every sheet shares the tile rects of TYPE1.SHP but draws
//its own art in them, so where the hand sits inside a tile is a property of the sheet: a grip read
//on one sheet lands on empty pixels of another. A grip names the tile that draws the throwing hand
//(`layer` of the THROW_STONE_ASSEMBLY frame, `id` that layer's tile) and the hand's center pixel
//(`x`, `y`, tile-local, unflipped — no TS tile carries an SHP reverseX): the pixel holding the
//centroid of the hand's visible pixels. `null` while the hand holds nothing: the kneel (frame 2)
//picks the stone up, the throw (frame 7) releases it. Frame 7 is the arm thrown forward, the hand
//on the facing side of the body. THROW_STONE_HANDS is derived from these grips below.
//SEQ 208 (front): F21 kneel, F19 rise, F27 reach, F31 overhead, F92 wind-up, F102 release.
//SEQ 209 (back): F22, F20, F29, F33, F141, F151.
const grip = (layer, id, x, y) => ({ layer, id, x, y });
const gripFrames = (held) => [null, null, ...held, null, null, null, null, null];
export const THROW_STONE_GRIPS = {
  'a1.png': {
    fwd: gripFrames([grip('body', 'KO3', 10, 24), grip('body', 'HR1', 8, 7), grip('behind', 'EF1', 10, 10), grip('behind', 'EFR3', 11, 6), grip('front', 'LG12', 8, 12)]),
    bck: gripFrames([grip('body', 'KO4', 10, 26), grip('body', 'HR2', 8, 6), grip('front', 'EFL5', 13, 9), grip('front', 'EFL4', 14, 3), grip('front', 'LG42', 8, 6)]),
  },
};

//NOTE(jimmylee)
//Cinematic throw stone (SEQ 208/209) assembly — 12-frame non-looping sequence.
//Throw-Attack Combo: throw wind-up chaining into a full-body melee follow-through.
//
//Head sprites: SP3/SP2 (24x16) and TF1/TF2/TB1/TB2 (24x24). These are always in the
//`head` field — never in `front`, `over`, or `behind`. The engine routes head sprites
//to a dedicated head mesh. See also QUICK_THROW_ASSEMBLY for the same convention.
//
//Frames 0-5: standard 1-4 tile compositions (P2/HR1/KO3/BF3/SR19 bodies, like Quick Throw).
//Frames 6-7, 9-10: 4-tile full-body compositions using AF/AB torso (32x32, headless) +
//  head (TF/TB 24x24) + LG hand pairs (24x24). These use:
//    farBehind — back hand (z:0)
//    body — torso tile (z:1, reference point for dx/dy)
//    head — head tile (z:2, renders in front of torso)
//    front — front hand (z:3)
//Frame 5 (F31/F33): 4-tile aura composition — behind arm + SR19/SR20 body + AU1/AU2 aura + front arm.
//
//Body height varies: BF3/BB3/P2/P4=40px, AF/AB=32px, SR19/SR20=32px, KO3/KO4=32px, HR1/HR2=16px.
//Bodies are placed at their BODY_ANCHOR_MAP offsets; F31/F33 AU1/AU2 (dy:+17) reach 1px
//below the idle stance bottom, exactly as in TYPE1.SHP.
export const THROW_STONE_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 208',
    shp: 'F2, F19, F21, F27, F31, F92, F102, F89, F86',
    frames: [
      { body: 'P2', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'KO3', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'BF3', behind: { id: 'EF1', dx: -7, dy: -1 }, head: null, front: { id: 'EF2', dx: 0, dy: 3 } },
      { body: 'SR19', behind: { id: 'EFR3', dx: -5, dy: -3 }, head: null, over: { id: 'AU1', dx: 0, dy: 17 }, front: { id: 'EFL3', dx: 3, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF4', farBehind: { id: 'LG11', dx: -9, dy: 4 }, head: { id: 'TF2', dx: -2, dy: -3 }, front: { id: 'LG30', dx: 1, dy: 6 } },
      { body: 'KO3', behind: null, head: null, front: null },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -6, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF1', farBehind: { id: 'LG2', dx: 1, dy: -8 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG5', dx: -1, dy: 0 } },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 208',
    shp: 'F2, F19, F21, F27, F31, F92, F102, F89, F86',
    frames: [
      { body: 'P2', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'KO3', behind: null, head: null, front: null },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'BF3', behind: { id: 'EF1', dx: -7, dy: -1 }, head: null, front: { id: 'EF2', dx: 0, dy: 3 } },
      { body: 'SR19', behind: { id: 'EFR3', dx: -5, dy: -3 }, head: null, over: { id: 'AU1', dx: 0, dy: 17 }, front: { id: 'EFL3', dx: 3, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF4', farBehind: { id: 'LG11', dx: -9, dy: 4 }, head: { id: 'TF2', dx: -2, dy: -3 }, front: { id: 'LG30', dx: 1, dy: 6 } },
      { body: 'KO3', behind: null, head: null, front: null },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -6, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF1', farBehind: { id: 'LG2', dx: 1, dy: -8 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG5', dx: -1, dy: 0 } },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 209',
    shp: 'F8, F20, F22, F29, F33, F141, F151, F138, F135',
    frames: [
      { body: 'P4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'BB3', behind: { id: 'EFR5', dx: 2, dy: -6 }, head: null, front: { id: 'EFL5', dx: -8, dy: -2 } },
      { body: 'SR20', behind: { id: 'EFR4', dx: 2, dy: -4 }, head: null, over: { id: 'AU2', dx: 0, dy: 17 }, front: { id: 'EFL4', dx: -7, dy: 0 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB4', farBehind: { id: 'LG47', dx: -7, dy: -3 }, head: { id: 'TB2', dx: -10, dy: -7 }, front: { id: 'LG27', dx: -7, dy: -3 } },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'AB2', farBehind: { id: 'LG39', dx: -7, dy: -8 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG36', dx: -2, dy: -4 } },
      { body: 'AB1', farBehind: { id: 'LG38', dx: 1, dy: -9 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG34', dx: -3, dy: -4 } },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 209',
    shp: 'F8, F20, F22, F29, F33, F141, F151, F138, F135',
    frames: [
      { body: 'P4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'BB3', behind: { id: 'EFR5', dx: 2, dy: -6 }, head: null, front: { id: 'EFL5', dx: -8, dy: -2 } },
      { body: 'SR20', behind: { id: 'EFR4', dx: 2, dy: -4 }, head: null, over: { id: 'AU2', dx: 0, dy: 17 }, front: { id: 'EFL4', dx: -7, dy: 0 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB4', farBehind: { id: 'LG47', dx: -7, dy: -3 }, head: { id: 'TB2', dx: -10, dy: -7 }, front: { id: 'LG27', dx: -7, dy: -3 } },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'AB2', farBehind: { id: 'LG39', dx: -7, dy: -8 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG36', dx: -2, dy: -4 } },
      { body: 'AB1', farBehind: { id: 'LG38', dx: 1, dy: -9 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG34', dx: -3, dy: -4 } },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
    ],
  },
];

//NOTE(jimmylee)
//Kneel (SEQ 32-33) assembly — wounded/kneeling pose.
//Single 32x32 sprite per pattern. Static pose using KO3/KO4 (shorter than idle 32x40).
//Same structure as DEATH_ASSEMBLY but with smaller tiles.
export const KNEEL_ASSEMBLY = [
  { name: 'Pattern A (0, 7) ←', id: 'KO3', reversed: true, seq: 'SEQ 32', shp: 'F21' },
  { name: 'Pattern B (1, 2) ↓', id: 'KO3', reversed: false, seq: 'SEQ 32', shp: 'F21' },
  { name: 'Pattern C (3, 4) →', id: 'KO4', reversed: false, seq: 'SEQ 33', shp: 'F22' },
  { name: 'Pattern D (5, 6) ↑', id: 'KO4', reversed: true, seq: 'SEQ 33', shp: 'F22' },
];

//NOTE(jimmylee)
//Flinch (SEQ 38-39) assembly — maps from createCharacter.js FLINCH_FRAMES.
//Top (24px) + bottom (16px) stacked to form the flinch pose, overlapping 3 rows.
export const HURT_ASSEMBLY = [
  { name: 'Pattern A (0, 7) ←', top: 'DF1', bottom: 'DF2', bottomDx: 0, bottomDy: 17, reversed: true, seq: 'SEQ 38', shp: 'F68' },
  { name: 'Pattern B (1, 2) ↓', top: 'DF1', bottom: 'DF2', bottomDx: 0, bottomDy: 17, reversed: false, seq: 'SEQ 38', shp: 'F68' },
  { name: 'Pattern C (3, 4) →', top: 'DB1', bottom: 'DB2', bottomDx: 0, bottomDy: 17, reversed: false, seq: 'SEQ 39', shp: 'F69' },
  { name: 'Pattern D (5, 6) ↑', top: 'DB1', bottom: 'DB2', bottomDx: 0, bottomDy: 17, reversed: true, seq: 'SEQ 39', shp: 'F69' },
];

//NOTE(jimmylee)
//Dead (SEQ 40-41) assembly — maps from createCharacter.js DEATH_FRAMES.
//Single 40x32 sprite per pattern. Static terminal pose, no loop.
export const DEATH_ASSEMBLY = [
  { name: 'Pattern A (0, 7) ←', id: 'KO1', reversed: true, seq: 'SEQ 40', shp: 'F23' },
  { name: 'Pattern B (1, 2) ↓', id: 'KO1', reversed: false, seq: 'SEQ 40', shp: 'F23' },
  { name: 'Pattern C (3, 4) →', id: 'KO2', reversed: false, seq: 'SEQ 41', shp: 'F24' },
  { name: 'Pattern D (5, 6) ↑', id: 'KO2', reversed: true, seq: 'SEQ 41', shp: 'F24' },
];

//NOTE(jimmylee)
//Magic Charge (SEQ 64-65) assembly — maps from createCharacter.js CAST_FRAMES.
//2-frame loop per pattern using CH1-CH4 + SR17/SR18 sprites.
//Each frame is a 2-tile composition: CH body (32x32) + SR overlay (32x16, waist-to-feet).
//The SR overlay renders BEHIND the CH body (SHP F35-F38 tile order) — the robe hem of
//the body covers the top rows of the legs strip.
export const CAST_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 64',
    shp: 'F35, F36',
    frames: [
      { body: 'CH1', overlay: 'SR17', overlayDx: 0, overlayDy: 16, reversed: true },
      { body: 'CH2', overlay: 'SR17', overlayDx: 0, overlayDy: 16, reversed: true },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 64',
    shp: 'F35, F36',
    frames: [
      { body: 'CH1', overlay: 'SR17', overlayDx: 0, overlayDy: 16, reversed: false },
      { body: 'CH2', overlay: 'SR17', overlayDx: 0, overlayDy: 16, reversed: false },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 65',
    shp: 'F37, F38',
    frames: [
      { body: 'CH3', overlay: 'SR18', overlayDx: 0, overlayDy: 16, reversed: false },
      { body: 'CH4', overlay: 'SR18', overlayDx: 0, overlayDy: 16, reversed: false },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 65',
    shp: 'F37, F38',
    frames: [
      { body: 'CH3', overlay: 'SR18', overlayDx: 0, overlayDy: 16, reversed: true },
      { body: 'CH4', overlay: 'SR18', overlayDx: 0, overlayDy: 16, reversed: true },
    ],
  },
];

//NOTE(jimmylee)
//Punch Lv1 per-frame delays from SEQ 140/141 binary data (ticks at 60fps → ms).
//Ready(2+8) → Windup(2) → Extend(4+10+18+2) → Retract(2) → Follow-through(4) = 52 ticks = 867ms.
//Looping: plays continuously for infinite punching animation.
export const PUNCH_DELAYS = [2, 8, 2, 4, 10, 18, 2, 2, 4].map(ticksToMs);

//NOTE(jimmylee)
//Punch Lv2 per-frame delays from SEQ 142/143 binary data (ticks at 60fps → ms).
//Ready(2+8) → Extend(2+4) → Retract(10+18+2) → Follow-through(4) = 50 ticks = 833ms.
//Skips F120/F169 windup transition — faster startup than Lv1.
export const PUNCH_LV2_DELAYS = [2, 8, 2, 4, 10, 18, 2, 4].map(ticksToMs);

//NOTE(jimmylee)
//Punch Lv3 per-frame delays from SEQ 144/145 binary data (ticks at 60fps → ms).
//Ready(2+8) → Retract(2+4) → Follow-through(10+18+2+4) = 50 ticks = 833ms.
//Skips F120+F121 / F169+F170 — instant strike, lingers on follow-through.
export const PUNCH_LV3_DELAYS = [2, 8, 2, 4, 10, 18, 2, 4].map(ticksToMs);

//NOTE(@jimmylee)
//The hand on a1.png, the sheet the main route draws, by the arm tile that draws it, for the bow and the
//Set items: [x, y, degrees]. (x, y) is its center pixel, tile-local, the pixel holding the centroid of the
//hand's visible pixels, and `degrees` the way the forearm points, from the centroid of the tile's other
//pixels to the hand, 0 along the facing and 90 straight up. LG17 (the ready pose) draws no hand, so its
//grip is the tip of the sleeve the hand is inside and its angle that sleeve's. TYPE1 draws no weapon:
//these are demo props, which is why only that sheet has grips.
export const HAND_GRIPS = {
  LG1: [15, 7, 176],
  LG2: [8, 12, 0],
  LG3: [9, 14, -57],
  LG4: [7, 15, -68],
  LG7: [15, 13, 180],
  LG8: [11, 15, -130],
  LG9: [8, 5, 37],
  LG17: [6, 8, -60],
  LG18: [7, 12, -20],
  LG19: [8, 5, 21],
  LG20: [7, 14, -30],
  LG21: [9, 15, -44],
  LG22: [11, 6, 62],
  LG23: [8, 10, 8],
  LG24: [8, 6, 29],
  LG25: [7, 5, 79],
  LG26: [8, 7, 49],
  LG29: [10, 9, 26],
  LG31: [12, 10, 166],
  LG32: [8, 15, -39],
  LG33: [13, 6, 55],
  LG35: [8, 13, -12],
  LG37: [16, 8, 173],
  LG38: [10, 8, 22],
  LG39: [12, 15, -35],
  LG40: [9, 15, -62],
  LG41: [14, 12, -141],
  LG43: [9, 9, 30],
  LG45: [9, 5, 44],
  LG46: [8, 6, 23],
  LG48: [17, 7, 144],
  LG49: [16, 5, 134],
  LG50: [8, 7, 49],
  LG51: [6, 7, 31],
  LG52: [6, 13, -30],
  LG53: [10, 7, 38],
  LG54: [9, 7, 14],
  LG57: [11, 6, 64],
  RF3: [11, 10, 95],
  LF3: [16, 14, -101],
  LF2: [11, 7, 7],
  EF1: [13, 9, 47],
  EF2: [11, 9, 33],
  EFR3: [12, 8, 83],
  EFL3: [15, 9, 94],
  RB3: [15, 15, -123],
  LB3: [10, 15, -66],
  LB4: [15, 7, 91],
  EFR5: [6, 10, 29],
  EFL5: [15, 9, 78],
  EFR4: [15, 3, 94],
  EFL4: [15, 5, 89],
};

//NOTE(@jimmylee)
//The top of the fist on a1.png, tile-local, for a tile that draws other hand colors beside it, so HAND_GRIPS'
//centroid falls between them on a sleeve: a blade laid across the fist rests here, on its top row.
export const HAND_RESTS = {
  RF3: [6, 15],
  EF1: [9, 8],
  EFR3: [11, 3],
};

//NOTE(@jimmylee)
//The draw hand of the aim frames on a1.png, by torso tile: the pixel, tile-local, where the hand held
//at the chest stays hand-colored on every aim frame that uses the tile (the back view's bow arm tiles
//redraw it, the front view's torso draws it). AF1 and AB1, the ready pose, hold no string. The bow's
//nock is pulled toward it.
export const BOW_DRAW_GRIPS = {
  AF2: [18, 13],
  AB2: [15, 11],
};

//NOTE(jimmylee)
//Punch Lv1 (SEQ 140/141) assembly — 9-frame looping sequence.
//All frames are 4-tile full-body compositions (farBehind + body + head + front).
//Uses AF1/AF2 torso (front) and AB1/AB2 torso (back) — all 32x32.
//Head sprites (TF1/TB1) positioned via TORSO_HEAD_MAP offsets.
//Selected Lv1 for maximum visual diversity (5 unique frames per facing).
export const PUNCH_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 140',
    shp: 'F119, F120, F121, F123, F124',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG22', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 140',
    shp: 'F119, F120, F121, F123, F124',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG22', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 141',
    shp: 'F168, F169, F170, F172, F173',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 141',
    shp: 'F168, F169, F170, F172, F173',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
];

//NOTE(jimmylee)
//Punch Lv2 (SEQ 142/143) assembly — 8-frame looping sequence.
//Skips F120/F169 windup transition from Lv1 — goes directly from ready (F119/F168)
//to extend (F121/F170). Lingers on retract (F123/F172) instead of extend.
//Same 4-tile full-body structure as Lv1 (farBehind + body + head + front).
//4 unique SHP frames per facing (vs 5 in Lv1).
export const PUNCH_LV2_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 142',
    shp: 'F119, F121, F123, F124',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 142',
    shp: 'F119, F121, F123, F124',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG15', dx: 3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG24', dx: -5, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 143',
    shp: 'F168, F170, F172, F173',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 143',
    shp: 'F168, F170, F172, F173',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG50', dx: -7, dy: -8 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
];

//NOTE(jimmylee)
//Punch Lv3 (SEQ 144/145) assembly — 8-frame looping sequence.
//Skips F120+F121 / F169+F170 — instant strike from ready (F119/F168) directly
//to retract (F123/F172), then lingers on follow-through (F124/F173).
//Same 4-tile full-body structure as Lv1 (farBehind + body + head + front).
//3 unique SHP frames per facing (vs 5 in Lv1, 4 in Lv2).
export const PUNCH_LV3_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 144',
    shp: 'F119, F123, F124',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 144',
    shp: 'F119, F123, F124',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF1', farBehind: { id: 'LG15', dx: 5, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG17', dx: 1, dy: -2 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: 0 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG18', dx: -1, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG16', dx: 0, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG32', dx: -1, dy: 0 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 145',
    shp: 'F168, F172, F173',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 145',
    shp: 'F168, F172, F173',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG55', dx: 7, dy: -6 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG48', dx: -3, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG53', dx: -8, dy: -5 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG55', dx: 4, dy: -6 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
];

//NOTE(jimmylee)
//Stab Lv1 (SEQ 96/97) per-frame delays — 9-frame looping sequence.
//Wind-up (4→8 ticks), brief neutral (2), thrust progression (2→2), impact hold (14 ticks),
//recoil (2→2→4). Total: 40 ticks = 666.67ms.
export const STAB_DELAYS = [4, 8, 2, 2, 2, 14, 2, 2, 4].map(ticksToMs);

//NOTE(jimmylee)
//Stab Lv2 (SEQ 98/99) per-frame delays — 9-frame looping, same timing as Lv1.
//Uses deeper thrust frames (F97-F99/F146-F148) for extended reach.
export const STAB_LV2_DELAYS = [4, 8, 2, 2, 2, 14, 2, 2, 4].map(ticksToMs);

//NOTE(jimmylee)
//Stab Lv3 (SEQ 100/101) per-frame delays — 9-frame looping, same timing as Lv1.
//Skips neutral return — goes from windup lean directly to extended stance.
export const STAB_LV3_DELAYS = [4, 8, 2, 2, 2, 14, 2, 2, 4].map(ticksToMs);

//NOTE(jimmylee)
//Stab Lv1 (SEQ 96/97) assembly — 9-frame looping sequence.
//All frames are 4-tile full-body compositions (farBehind + body + head + front).
//Same structure as Punch: AF1/AF2 torso (front) and AB1/AB2 torso (back) — all 32x32.
//Head sprites (TF1/TB1) positioned via TORSO_HEAD_MAP offsets.
//Wind-up → neutral return → light thrust (F94-F96/F143-F145) → impact hold (14 ticks) → recoil.
//5 unique SHP frames per facing. Selected Lv1 for maximum visual diversity.
export const STAB_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 96',
    shp: 'F92, F93, F94, F95, F96',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: 1, dy: -3 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG2', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -5, dy: -4 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -7, dy: -5 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG13', dx: 3, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -7, dy: -5 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG13', dx: 3, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -5, dy: -4 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG2', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 96',
    shp: 'F92, F93, F94, F95, F96',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: 1, dy: -3 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG2', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -5, dy: -4 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -7, dy: -5 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG13', dx: 3, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -7, dy: -5 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG13', dx: 3, dy: 0 } },
      { body: 'AF2', farBehind: { id: 'LG9', dx: -5, dy: -4 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG2', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 97',
    shp: 'F141, F142, F143, F144, F145',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG38', dx: -3, dy: -7 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -3, dy: -11 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -5, dy: -13 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -5, dy: -13 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -3, dy: -11 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG38', dx: -3, dy: -7 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 97',
    shp: 'F141, F142, F143, F144, F145',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG38', dx: -3, dy: -7 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -3, dy: -11 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -5, dy: -13 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -5, dy: -13 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG45', dx: -3, dy: -11 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG38', dx: -3, dy: -7 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG35', dx: -5, dy: -3 } },
    ],
  },
];

//NOTE(jimmylee)
//Stab Lv2 (SEQ 98/99) assembly — 9-frame looping sequence.
//Same windup (F92→F93→F92 / F141→F142→F141) as Lv1 but uses deeper thrust frames
//(F97-F99/F146-F148) for extended reach. Same 4-tile full-body structure.
//5 unique SHP frames per facing (vs 5 in Lv1, different thrust set).
//Frame data is written in SEQ playback order
//(palindromic sequence), unlike Lv1 which was extracted in reverse.
export const STAB_LV2_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 98',
    shp: 'F92, F93, F97, F98, F99',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: 1, dy: -3 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -7, dy: 2 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -9, dy: 3 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -9, dy: 3 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -7, dy: 2 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 98',
    shp: 'F92, F93, F97, F98, F99',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: 1, dy: -3 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -7, dy: 2 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -9, dy: 3 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -9, dy: 3 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF3', farBehind: { id: 'LG10', dx: -7, dy: 2 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 99',
    shp: 'F141, F142, F146, F147, F148',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -6, dy: -6 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -8, dy: -7 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -8, dy: -7 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -6, dy: -6 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 99',
    shp: 'F141, F142, F146, F147, F148',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -6, dy: -6 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -8, dy: -7 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -8, dy: -7 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG46', dx: -6, dy: -6 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
    ],
  },
];

//NOTE(jimmylee)
//Stab Lv3 (SEQ 100/101) assembly — 9-frame looping sequence.
//Skips neutral return (F92/F141) — goes from windup lean (F93/F142) directly to
//extended stance (F97/F146). Uses deepest thrust frames (F100-F102/F149-F151).
//Same 4-tile full-body structure as Lv1 (farBehind + body + head + front).
//6 unique SHP frames per facing (vs 5 in Lv1/Lv2).
//Frame data is written in SEQ playback order
//(palindromic sequence), unlike Lv1 which was extracted in reverse.
export const STAB_LV3_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 100',
    shp: 'F92, F93, F97, F100, F101, F102',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: 1, dy: -3 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF3', farBehind: { id: 'LG11', dx: -6, dy: 0 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF4', farBehind: { id: 'LG11', dx: -9, dy: 4 }, head: { id: 'TF2', dx: -2, dy: -3 }, front: { id: 'LG30', dx: 1, dy: 6 } },
      { body: 'AF4', farBehind: { id: 'LG11', dx: -9, dy: 4 }, head: { id: 'TF2', dx: -2, dy: -3 }, front: { id: 'LG30', dx: 1, dy: 6 } },
      { body: 'AF3', farBehind: { id: 'LG11', dx: -6, dy: 0 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 100',
    shp: 'F92, F93, F97, F100, F101, F102',
    frames: [
      { body: 'AF1', farBehind: { id: 'LG16', dx: -1, dy: -1 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF1', farBehind: { id: 'LG16', dx: 1, dy: -3 }, head: { id: 'TF1', dx: 5, dy: -10 }, front: { id: 'LG12', dx: 1, dy: -1 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -3, dy: -1 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
      { body: 'AF3', farBehind: { id: 'LG11', dx: -6, dy: 0 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF4', farBehind: { id: 'LG11', dx: -9, dy: 4 }, head: { id: 'TF2', dx: -2, dy: -3 }, front: { id: 'LG30', dx: 1, dy: 6 } },
      { body: 'AF4', farBehind: { id: 'LG11', dx: -9, dy: 4 }, head: { id: 'TF2', dx: -2, dy: -3 }, front: { id: 'LG30', dx: 1, dy: 6 } },
      { body: 'AF3', farBehind: { id: 'LG11', dx: -6, dy: 0 }, head: { id: 'TF1', dx: -1, dy: -4 }, front: { id: 'LG14', dx: 2, dy: 5 } },
      { body: 'AF2', farBehind: { id: 'LG3', dx: -4, dy: -2 }, head: { id: 'TF1', dx: 2, dy: -9 }, front: { id: 'LG6', dx: 2, dy: 1 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 101',
    shp: 'F141, F142, F146, F149, F150, F151',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG47', dx: -4, dy: -4 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB4', farBehind: { id: 'LG47', dx: -7, dy: -3 }, head: { id: 'TB2', dx: -10, dy: -7 }, front: { id: 'LG27', dx: -7, dy: -3 } },
      { body: 'AB4', farBehind: { id: 'LG47', dx: -7, dy: -3 }, head: { id: 'TB2', dx: -10, dy: -7 }, front: { id: 'LG27', dx: -7, dy: -3 } },
      { body: 'AB3', farBehind: { id: 'LG47', dx: -4, dy: -4 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 101',
    shp: 'F141, F142, F146, F149, F150, F151',
    frames: [
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB1', farBehind: { id: 'LG56', dx: 6, dy: -4 }, head: { id: 'TB1', dx: 2, dy: -12 }, front: { id: 'LG42', dx: -1, dy: -3 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
      { body: 'AB3', farBehind: { id: 'LG47', dx: -4, dy: -4 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB4', farBehind: { id: 'LG47', dx: -7, dy: -3 }, head: { id: 'TB2', dx: -10, dy: -7 }, front: { id: 'LG27', dx: -7, dy: -3 } },
      { body: 'AB4', farBehind: { id: 'LG47', dx: -7, dy: -3 }, head: { id: 'TB2', dx: -10, dy: -7 }, front: { id: 'LG27', dx: -7, dy: -3 } },
      { body: 'AB3', farBehind: { id: 'LG47', dx: -4, dy: -4 }, head: { id: 'TB1', dx: -6, dy: -9 }, front: { id: 'LG44', dx: -4, dy: -2 } },
      { body: 'AB2', farBehind: { id: 'LG56', dx: 2, dy: -4 }, head: { id: 'TB1', dx: -2, dy: -11 }, front: { id: 'LG43', dx: -5, dy: -2 } },
    ],
  },
];

//NOTE(jimmylee)
//Fatal item impact per-frame delays from SEQ 82/83 binary data (ticks at 60fps → ms).
//Standing reach (4) → Kneeling hold (6) → KO hold (16) = 26 ticks = 433.33ms.
//F72(2)x3 means frame 72 repeated 3 times at 2 ticks each = 6 ticks merged.
//F23(2)x9 → F23(0) means 8 display frames at 2 ticks + 1 terminal = 16 ticks merged.
//Non-looping: plays once then holds on final frame (KO1/KO2 death pose).
export const FATAL_ITEM_IMPACT_DELAYS = [4, 6, 16].map(ticksToMs);

//NOTE(jimmylee)
//Item drop per-frame delays from SEQ 84/85 binary data (ticks at 60fps → ms).
//Kneeling hold (16) → Standing reach (6) = 22 ticks = 367ms.
//Non-looping: plays once then holds on final frame (walk neutral F11/F16).
export const ITEM_DROP_DELAYS = [16, 6].map(ticksToMs);

//NOTE(jimmylee)
//Fatal Item Impact (SEQ 82/83) assembly — 3-frame non-looping sequence.
//Reaction animation: character is struck by an incoming item/projectile and collapses.
//Standing reach → kneeling with overlay → death/KO pose.
//
//Frame structure varies per frame:
//  Frame 0 (F19/F20): 3-tile hit-recoil (SP3/SP2 head + HR1/HR2 body + DF2/DB2 feet)
//  Frame 1 (F72/F73): 2-tile kneeling front (KO3 + OV2 overlay) or 1-tile back (KO4 only)
//  Frame 2 (F23/F24): 1-tile death pose (KO1/KO2)
//
//Body height varies across frames: HR1/HR2=16px, KO3/KO4=32px, KO1/KO2=32px (40x32 tile).
//F72 front has OV2 (8x8 question mark overlay) at dx=+1, dy=-3 from KO3 center.
//F73 back has NO overlay — KO4 body only. This front/back asymmetry is intentional
//in the source SHP data (the overlay effect is only visible from the front).
export const FATAL_ITEM_IMPACT_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 82',
    shp: 'F19, F72, F23',
    frames: [
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'KO3', behind: null, head: null, front: { id: 'OV2', dx: 1, dy: -3 } },
      { body: 'KO1', behind: null, head: null, front: null },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 82',
    shp: 'F19, F72, F23',
    frames: [
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'KO3', behind: null, head: null, front: { id: 'OV2', dx: 1, dy: -3 } },
      { body: 'KO1', behind: null, head: null, front: null },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 83',
    shp: 'F20, F73, F24',
    frames: [
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'KO2', behind: null, head: null, front: null },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 83',
    shp: 'F20, F73, F24',
    frames: [
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'KO2', behind: null, head: null, front: null },
    ],
  },
];

//NOTE(jimmylee)
//Item Drop (SEQ 84/85) assembly — 3-frame non-looping sequence.
//Reverse of Fatal Item Impact: character rises from kneeling to standing then walk neutral.
//Kneeling with overlay → standing reach → walk neutral pose.
//
//Frame structure varies per frame:
//  Frame 0 (F72/F73): 2-tile kneeling front (KO3 + OV2) or 1-tile back (KO4 only)
//  Frame 1 (F19/F20): 3-tile hit-recoil (SP3/SP2 head + HR1/HR2 body + DF2/DB2 feet)
//  Frame 2 (F11/F16): 3-tile walk neutral (RF3/RB3 behind + BF3/BB3 body + LF3/LB3 front)
//
//Body height varies across frames: KO3/KO4=32px, HR1/HR2=16px, BF3/BB3=40px.
//F11/F16 reuse the walk-neutral frame tiles — same as Float and Walk frame 3.
export const ITEM_DROP_ASSEMBLY = [
  {
    name: 'Pattern A (0, 7) ←',
    reversed: true,
    seq: 'SEQ 84',
    shp: 'F72, F19, F11',
    frames: [
      { body: 'KO3', behind: null, head: null, front: { id: 'OV2', dx: 1, dy: -3 } },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'BF3', behind: { id: 'RF3', dx: -1, dy: 0 }, head: null, front: { id: 'LF3', dx: 4, dy: 4 } },
    ],
  },
  {
    name: 'Pattern B (1, 2) ↓',
    reversed: false,
    seq: 'SEQ 84',
    shp: 'F72, F19, F11',
    frames: [
      { body: 'KO3', behind: null, head: null, front: { id: 'OV2', dx: 1, dy: -3 } },
      { body: 'HR1', behind: { id: 'DF2', dx: 0, dy: 8 }, head: { id: 'SP3', dx: 0, dy: -12 }, front: null },
      { body: 'BF3', behind: { id: 'RF3', dx: -1, dy: 0 }, head: null, front: { id: 'LF3', dx: 4, dy: 4 } },
    ],
  },
  {
    name: 'Pattern C (3, 4) →',
    reversed: false,
    seq: 'SEQ 85',
    shp: 'F73, F20, F16',
    frames: [
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'BB3', behind: { id: 'RB3', dx: 4, dy: 0 }, head: null, front: { id: 'LB3', dx: -4, dy: 3 } },
    ],
  },
  {
    name: 'Pattern D (5, 6) ↑',
    reversed: true,
    seq: 'SEQ 85',
    shp: 'F73, F20, F16',
    frames: [
      { body: 'KO4', behind: null, head: null, front: null },
      { body: 'HR2', behind: { id: 'DB2', dx: 0, dy: 8 }, head: { id: 'SP2', dx: 0, dy: -12 }, front: null },
      { body: 'BB3', behind: { id: 'RB3', dx: 4, dy: 0 }, head: null, front: { id: 'LB3', dx: -4, dy: 3 } },
    ],
  },
];

//NOTE(jimmylee)
//SEQ unit motion. Besides [frame, delay] pairs, TYPE1.SEQ carries 0xFFxx opcodes that the game
//executes and the Shishi editor skips (documentation/seq_animation_to_frame/AGENTS.md "Opcodes"):
//MoveUp1/2 (ffcc/ffcb), MoveDown1/2 (ffd0/ffcf), MoveForward1/2 (ffd2/ffd1),
//MoveBackward1/2 (ffce/ffcd), MoveUnitFB (ffee, signed) and MoveUnitDU (ffef, signed). They move
//the whole unit, so every frame drawn after one is offset. `fb` is pixels forward (+) / back (-)
//along the unit's facing; `du` is pixels down (+) / up (-). Values are the offset accumulated from
//the start of the sequence for each displayed frame; tests/sprite-shp-parity.test.js decodes the
//opcodes and asserts every table below.
const seqMove = (fb, du = 0) => ({ fb, du });

//NOTE(jimmylee)
//Punch (SEQ 140-145): wind back 2px (MoveBackward2), strike forward (MoveForward2 ×2), settle back
//1px (MoveBackward1) on the follow-through.
const PUNCH_LV1_MOVES = [0, -2, -2, 0, 2, 2, 2, 2, 1].map((fb) => seqMove(fb));
const PUNCH_LV23_MOVES = [0, -2, -2, 0, 2, 2, 2, 1].map((fb) => seqMove(fb));

//NOTE(jimmylee)
//Stab (SEQ 96-101): same 2px wind-up; Lv1 lunges +2 and settles to +1, Lv2 returns to the
//origin, Lv3 lunges +1 (MoveForward2 then MoveForward1 against the 2px wind-up).
const STAB_LV1_MOVES = [0, -2, -2, -2, 0, 2, 2, 2, 1].map((fb) => seqMove(fb));
const STAB_LV2_MOVES = [0, -2, -2, 0, 0, 0, 0, 0, 0].map((fb) => seqMove(fb));
const STAB_LV3_MOVES = [0, -2, -2, 0, 1, 1, 1, 1, 1].map((fb) => seqMove(fb));

//NOTE(@jimmylee)
//Quick Throw (SEQ 48/49): MoveUp2 lifts the unit 2px for the overhead frame.
const QUICK_THROW_MOVES = [0, 0, 0, 0, 0, -2].map((du) => seqMove(0, du));

//NOTE(@jimmylee)
//SEQ 204/205 raise the unit 1px on its last take-off frame and 2px on the frame it leaves the ground on.
const JUMP_MOVES = [0, 0, 0, 0, -1, -2, 0, 0, 0].map((du) => seqMove(0, du));

//NOTE(@jimmylee)
//Where the game carries an object. SEQ 80/81 lift one from the ground to overhead and give its position
//for every drawn frame with opcode 0xC4: [forward px, height px], height measured from the SHP
//origin row (STANCE_Y + 15), negative up. The track needs no sheet and no camera, so it is what a
//physics body held by a unit follows. F31/F33 are F28/F30 with a shorter torso: same raised arms.
export const CARRY_ORIGIN_V = 15;
export const CARRY_TRACK = {
  fwd: { 21: [2, 0], 19: [2, -6], 11: [3, -10], 27: [8, -16], 28: [2, -32], 31: [2, -32] },
  bck: { 22: [2, 0], 20: [6, -8], 16: [7, -12], 29: [8, -20], 30: [4, -36], 33: [4, -36] },
};

//NOTE(jimmylee)
//Float (SEQ 12/13) is not static: F70/F71 is redrawn 8 times on the walk timing with
//MoveUp1, MoveUp1, MoveDown1, MoveDown1 between draws — the whole unit hovers up 2px and back,
//looping. The game stores this loop at animation 0x12/0x13 with Haste / Slow copies at 0x14-0x17
//(SEQ 14-17), the same three speed tiers as Walk; it is the idle of a floating unit.
export const FLOAT_DELAYS = WALK_DELAYS;
export const FLOAT_MOVES = [0, -1, -2, -1, 0, -1, -2, -1].map((du) => seqMove(0, du));

//NOTE(jimmylee)
//Flinch (SEQ 38/39) is not static: MoveUp1 → F68 2 ticks → MoveDown1 → F68 2 ticks, looping —
//the 1px damage shiver the game plays while a unit is hit.
export const HURT_SHIVER_DELAYS = [2, 2].map(ticksToMs);
export const HURT_SHIVER_MOVES = [seqMove(0, -1), seqMove(0, 0)];

//NOTE(jimmylee)
//Fatal Item Impact (SEQ 82/83) playback. FATAL_ITEM_IMPACT_ASSEMBLY holds the 3 unique
//compositions; the SEQ redraws them 13 times while MoveUnitDU / MoveUp2 / MoveDown2 hop the unit
//12px up and bounce it on the ground as it falls into the KO pose. `frame` indexes the assembly
//frames; the last entry has delay 0 (the game holds it until the animation is ended).
export const FATAL_ITEM_IMPACT_TIMELINE = [
  [0, 4, 0], [1, 2, 0], [1, 2, -8], [1, 2, -12], [2, 2, -8], [2, 2, -2], [2, 2, 0],
  [2, 2, -4], [2, 2, 0], [2, 2, -2], [2, 2, 0], [2, 2, -2], [2, 0, 0],
].map(([frame, ticks, du]) => ({ frame, delay: ticksToMs(ticks), move: seqMove(0, du) }));

//NOTE(jimmylee)
//Attach the SHP body anchor (`anchor: { dx, dy }`) to every composite frame so the main route
//page and the ThreeJS groups place bodies from one field. Walk base frames add WALK_BOB_DY.
//Guard holds walk frame 5 (F13/F18) and keeps its +2 bob; Float uses F70/F71 (no bob).
//Idle, Kneel and Dead single tiles carry the anchor of their tile (P3/P5 sit on the origin column,
//the 3/4-view idles one pixel left of it).
function bodyAnchor(bodyId, bobDy = 0) {
  const a = BODY_ANCHOR_MAP[bodyId];
  return { dx: a.dx, dy: a.dy + bobDy };
}

for (const pattern of WALK_ASSEMBLY) {
  for (let i = 0; i < pattern.body.length; i++) {
    pattern.body[i].anchor = bodyAnchor(pattern.body[i].id, WALK_BOB_DY[i]);
  }
}

for (const assembly of [JUMP_ASSEMBLY, QUICK_THROW_ASSEMBLY, THROW_STONE_ASSEMBLY, CAST_ASSEMBLY, PUNCH_ASSEMBLY, PUNCH_LV2_ASSEMBLY, PUNCH_LV3_ASSEMBLY, STAB_ASSEMBLY, STAB_LV2_ASSEMBLY, STAB_LV3_ASSEMBLY, FATAL_ITEM_IMPACT_ASSEMBLY, ITEM_DROP_ASSEMBLY]) {
  for (const pattern of assembly) {
    for (const frame of pattern.frames) {
      frame.anchor = bodyAnchor(frame.body);
    }
  }
}

//NOTE(@jimmylee)
//Throwing hand per frame, in unit pixels from the origin column and the stance row (u = canvas
//x − SHP_ORIGIN_X, v = canvas y − STANCE_Y; mirrored about the origin for A/D): the center of the
//grip pixel, placed exactly as the renderers place its tile — body at the frame's anchor, overlay
//tiles at their body-relative center offset. `null` while the hand holds nothing.
function gripPoint(frame, g) {
  if (!g) return null;
  const tile = g.layer === 'body' ? { id: frame.body, dx: 0, dy: 0 } : frame[g.layer];
  const cell = SPRITE_MAP[tile.id];
  return [frame.anchor.dx + tile.dx - cell.w / 2 + g.x + 0.5, frame.anchor.dy + tile.dy - cell.h / 2 + g.y + 0.5];
}
export const THROW_STONE_HANDS = {};
for (const sheet of Object.keys(THROW_STONE_GRIPS)) {
  const { fwd, bck } = THROW_STONE_GRIPS[sheet];
  THROW_STONE_HANDS[sheet] = {
    fwd: fwd.map((g, k) => gripPoint(THROW_STONE_ASSEMBLY[1].frames[k], g)),
    bck: bck.map((g, k) => gripPoint(THROW_STONE_ASSEMBLY[2].frames[k], g)),
  };
}

for (const [assembly, moves] of [[JUMP_ASSEMBLY, JUMP_MOVES], [QUICK_THROW_ASSEMBLY, QUICK_THROW_MOVES], [PUNCH_ASSEMBLY, PUNCH_LV1_MOVES], [PUNCH_LV2_ASSEMBLY, PUNCH_LV23_MOVES], [PUNCH_LV3_ASSEMBLY, PUNCH_LV23_MOVES], [STAB_ASSEMBLY, STAB_LV1_MOVES], [STAB_LV2_ASSEMBLY, STAB_LV2_MOVES], [STAB_LV3_ASSEMBLY, STAB_LV3_MOVES]]) {
  for (const pattern of assembly) {
    for (let i = 0; i < pattern.frames.length; i++) pattern.frames[i].move = moves[i];
  }
}

//NOTE(@jimmylee)
//Each Bow frame's bow hand and draw hand, in unit pixels from SHP_ORIGIN_X / STANCE_Y, placed as
//gripPoint places a throwing hand. Stays frame data so the main route arrow and bow read the same frame
//as the sprite. `drawHand` is null on the ready pose.
for (const assembly of [PUNCH_ASSEMBLY, PUNCH_LV2_ASSEMBLY, PUNCH_LV3_ASSEMBLY]) {
  for (const pattern of assembly) {
    for (const frame of pattern.frames) {
      const [x, y] = HAND_GRIPS[frame.front.id];
      const cell = SPRITE_MAP[frame.front.id];
      frame.bowHand = [frame.anchor.dx + frame.front.dx - cell.w / 2 + x + 0.5, frame.anchor.dy + frame.front.dy - cell.h / 2 + y + 0.5];
      const draw = BOW_DRAW_GRIPS[frame.body];
      const body = SPRITE_MAP[frame.body];
      frame.drawHand = draw ? [frame.anchor.dx - body.w / 2 + draw[0] + 0.5, frame.anchor.dy - body.h / 2 + draw[1] + 0.5] : null;
    }
  }
}

for (const pattern of GUARD_ASSEMBLY) pattern.anchor = bodyAnchor(pattern.body, WALK_BOB_DY[4]);
for (const pattern of FLOAT_ASSEMBLY) pattern.anchor = bodyAnchor(pattern.body);
for (const pattern of HURT_ASSEMBLY) pattern.anchor = bodyAnchor(pattern.top);
for (const entry of [...IDLE_ASSEMBLY, ...KNEEL_ASSEMBLY, ...DEATH_ASSEMBLY]) entry.anchor = bodyAnchor(entry.id);
