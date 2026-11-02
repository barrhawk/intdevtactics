import { SPRITE_MAP } from './index.js';
import { SHP_FRAMES } from './shp-frames.js';

export const TICKS_PER_SECOND = 60;

//NOTE(@jimmylee)
//Every TYPE1.SEQ sequence as it is drawn: `frames` indexes SHP_FRAMES, `ticks` are the SEQ delays at
//60fps (0 holds the frame until the action ends), `fb` / `du` the unit offset of each drawn frame
//accumulated from the move opcodes (omitted for a sequence that does not move), `loop` is
//IncrementLoop 0xFFD5, `events` the PlaySound and PostGenericAttack ticks. `seq` is the filtered index
//these docs use and `raw` the game's animation id. Not played: MoveUnitRL (0xF0, SEQ 36/37) and effect
//opcodes. Weapon graphics are not in TYPE1, so swing, poke, gun and bow draw the unit's empty hands here
//and the ThreeJS cards add the weapon (weapons/AGENTS.md).
//This table is where the names live, each beside its `raw` id (documentation/seq_animation_to_frame/
//AGENTS.md "Names"). tests/sprite-shp-parity.test.js holds this table to the decoded SEQ.
export const SEQ_LIBRARY = [
  { seq: 0, raw: 0, name: 'Null', frames: [0], ticks: [0] },
  { seq: 1, raw: 1, name: 'Idle South', frames: [3], ticks: [0] },
  { seq: 2, raw: 2, name: 'Idle SE', frames: [2], ticks: [0] },
  { seq: 3, raw: 3, name: 'Idle East', frames: [1], ticks: [0] },
  { seq: 4, raw: 4, name: 'Idle West', frames: [8], ticks: [0] },
  { seq: 5, raw: 5, name: 'Idle North', frames: [7], ticks: [0] },
  { seq: 6, raw: 6, name: 'Walk Fwd', loop: true, frames: [11, 10, 9, 10, 11, 12, 13, 12], ticks: [6, 8, 10, 8, 6, 8, 10, 8] },
  { seq: 7, raw: 7, name: 'Walk Bck', loop: true, frames: [16, 15, 14, 15, 16, 17, 18, 17], ticks: [6, 8, 10, 8, 6, 8, 10, 8] },
  { seq: 8, raw: 8, name: 'Walk Fwd Fast', loop: true, frames: [11, 10, 9, 10, 11, 12, 13, 12], ticks: [2, 4, 6, 4, 2, 4, 6, 4] },
  { seq: 9, raw: 9, name: 'Walk Bck Fast', loop: true, frames: [16, 15, 14, 15, 16, 17, 18, 17], ticks: [2, 4, 6, 4, 2, 4, 6, 4] },
  { seq: 10, raw: 10, name: 'Walk Fwd Slow', loop: true, frames: [11, 10, 9, 10, 11, 12, 13, 12], ticks: [10, 12, 14, 12, 10, 12, 14, 12] },
  { seq: 11, raw: 11, name: 'Walk Bck Slow', loop: true, frames: [16, 15, 14, 15, 16, 17, 18, 17], ticks: [10, 12, 14, 12, 10, 12, 14, 12] },
  { seq: 12, raw: 18, name: 'Float Fwd', loop: true, frames: [70, 70, 70, 70, 70, 70, 70, 70], ticks: [6, 8, 10, 8, 6, 8, 10, 8], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, -1, -2, -1, 0, -1, -2, -1] },
  { seq: 13, raw: 19, name: 'Float Bck', loop: true, frames: [71, 71, 71, 71, 71, 71, 71, 71], ticks: [6, 8, 10, 8, 6, 8, 10, 8], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, -1, -2, -1, 0, -1, -2, -1] },
  { seq: 14, raw: 20, name: 'Float Fwd Fast', loop: true, frames: [70, 70, 70, 70, 70, 70, 70, 70], ticks: [2, 4, 6, 4, 2, 4, 6, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, -1, -2, -1, 0, -1, -2, -1] },
  { seq: 15, raw: 21, name: 'Float Bck Fast', loop: true, frames: [71, 71, 71, 71, 71, 71, 71, 71], ticks: [2, 4, 6, 4, 2, 4, 6, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, -1, -2, -1, 0, -1, -2, -1] },
  { seq: 16, raw: 22, name: 'Float Fwd Slow', loop: true, frames: [70, 70, 70, 70, 70, 70, 70, 70], ticks: [10, 12, 14, 12, 10, 12, 14, 12], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, -1, -2, -1, 0, -1, -2, -1] },
  { seq: 17, raw: 23, name: 'Float Bck Slow', loop: true, frames: [71, 71, 71, 71, 71, 71, 71, 71], ticks: [10, 12, 14, 12, 10, 12, 14, 12], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, -1, -2, -1, 0, -1, -2, -1] },
  { seq: 18, raw: 24, name: 'Walk To Fwd', loop: true, frames: [10, 9, 10, 11, 12, 13, 12, 11], ticks: [4, 4, 4, 2, 4, 4, 4, 2] },
  { seq: 19, raw: 25, name: 'Walk To Bck', loop: true, frames: [15, 14, 15, 16, 17, 18, 17, 16], ticks: [4, 4, 4, 2, 4, 4, 4, 2] },
  { seq: 20, raw: 26, name: 'Walk To Fast Fwd', loop: true, frames: [10, 9, 10, 11, 12, 13, 12, 11], ticks: [2, 2, 2, 2, 2, 2, 2, 2] },
  { seq: 21, raw: 27, name: 'Walk To Fast Bck', loop: true, frames: [15, 14, 15, 16, 17, 18, 17, 16], ticks: [2, 2, 2, 2, 2, 2, 2, 2] },
  { seq: 22, raw: 28, name: 'Walk To Slow Fwd', loop: true, frames: [10, 9, 10, 11, 12, 13, 12, 11], ticks: [8, 8, 8, 4, 8, 8, 8, 4] },
  { seq: 23, raw: 29, name: 'Walk To Slow Bck', loop: true, frames: [15, 14, 15, 16, 17, 18, 17, 16], ticks: [8, 8, 8, 4, 8, 8, 8, 4] },
  { seq: 24, raw: 36, name: 'Walk To Alt Fwd', loop: true, frames: [10, 9, 10, 11, 12, 13, 12, 11], ticks: [4, 4, 4, 2, 4, 4, 4, 2] },
  { seq: 25, raw: 37, name: 'Walk To Alt Bck', loop: true, frames: [15, 14, 15, 16, 17, 18, 17, 16], ticks: [4, 4, 4, 2, 4, 4, 4, 2] },
  { seq: 26, raw: 38, name: 'Walk To Alt Fast Fwd', loop: true, frames: [10, 9, 10, 11, 12, 13, 12, 11], ticks: [2, 2, 2, 2, 2, 2, 2, 2] },
  { seq: 27, raw: 39, name: 'Walk To Alt Fast Bck', loop: true, frames: [15, 14, 15, 16, 17, 18, 17, 16], ticks: [2, 2, 2, 2, 2, 2, 2, 2] },
  { seq: 28, raw: 40, name: 'Walk To Alt Slow Fwd', loop: true, frames: [10, 9, 10, 11, 12, 13, 12, 11], ticks: [8, 8, 8, 4, 8, 8, 8, 4] },
  { seq: 29, raw: 41, name: 'Walk To Alt Slow Bck', loop: true, frames: [15, 14, 15, 16, 17, 18, 17, 16], ticks: [8, 8, 8, 4, 8, 8, 8, 4] },
  { seq: 30, raw: 42, name: 'Rotate CW', loop: true, frames: [2, 1, 8, 7, 6, 5, 4, 3], ticks: [4, 4, 4, 4, 4, 4, 4, 4] },
  { seq: 31, raw: 43, name: 'Rotate CCW', loop: true, frames: [8, 7, 6, 5, 4, 3, 2, 1], ticks: [4, 4, 4, 4, 4, 4, 4, 4] },
  { seq: 32, raw: 44, name: 'Critical Fwd', frames: [21], ticks: [0] },
  { seq: 33, raw: 45, name: 'Critical Bck', frames: [22], ticks: [0] },
  { seq: 34, raw: 46, name: 'Defend Fwd', frames: [25], ticks: [0] },
  { seq: 35, raw: 47, name: 'Defend Bck', frames: [26], ticks: [0] },
  { seq: 36, raw: 48, name: 'Dodge Defend Fwd', frames: [12, 12, 25, 25, 25, 25, 25], ticks: [2, 2, 2, 16, 2, 2, 2] },
  { seq: 37, raw: 49, name: 'Dodge Defend Bck', frames: [17, 17, 26, 26, 26, 26, 26], ticks: [2, 2, 2, 16, 2, 2, 2] },
  { seq: 38, raw: 50, name: 'Taking Damage Fwd', loop: true, frames: [68, 68], ticks: [2, 2], fb: [0, 0], du: [-1, 0] },
  { seq: 39, raw: 51, name: 'Taking Damage Bck', loop: true, frames: [69, 69], ticks: [2, 2], fb: [0, 0], du: [-1, 0] },
  { seq: 40, raw: 52, name: 'Dead Fwd', frames: [23], ticks: [0] },
  { seq: 41, raw: 53, name: 'Dead Bck', frames: [24], ticks: [0] },
  { seq: 42, raw: 54, name: 'Mid Jump Fwd', frames: [28], ticks: [0] },
  { seq: 43, raw: 55, name: 'Mid Jump Bck', frames: [30], ticks: [0] },
  { seq: 44, raw: 56, name: 'Jump Up Fwd', loop: true, frames: [11, 27, 31, 31, 31, 31, 31, 31, 31, 27], ticks: [6, 6, 2, 2, 4, 6, 4, 2, 2, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, -2, -6, -12, -14, -12, -6, -2, 0] },
  { seq: 45, raw: 57, name: 'Jump Up Bck', loop: true, frames: [16, 29, 33, 33, 33, 33, 33, 33, 33, 29], ticks: [6, 6, 2, 2, 4, 6, 4, 2, 2, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, -2, -6, -12, -14, -12, -6, -2, 0] },
  { seq: 46, raw: 58, name: 'Jump Down Fwd', loop: true, frames: [11, 27, 28, 28, 28, 28, 28, 27], ticks: [6, 6, 4, 4, 6, 4, 4, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, -1, -2, -1, 0, 0] },
  { seq: 47, raw: 59, name: 'Jump Down Bck', loop: true, frames: [16, 29, 30, 30, 30, 30, 30, 29], ticks: [6, 6, 4, 4, 6, 4, 4, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, -1, -2, -1, 0, 0] },
  { seq: 48, raw: 60, name: 'High Jump Start Fwd', frames: [2, 19, 21, 19, 27, 31], ticks: [4, 4, 8, 2, 4, 0], fb: [0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, -2] },
  { seq: 49, raw: 61, name: 'High Jump Start Bck', frames: [8, 20, 22, 20, 29, 33], ticks: [4, 4, 8, 2, 4, 0], fb: [0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, -2] },
  { seq: 50, raw: 62, name: 'High Jump Hold Fwd', frames: [31], ticks: [0] },
  { seq: 51, raw: 63, name: 'High Jump Hold Bck', frames: [33], ticks: [0] },
  { seq: 52, raw: 64, name: 'High Jump Land Fwd', frames: [27, 21, 19], ticks: [2, 10, 6] },
  { seq: 53, raw: 65, name: 'High Jump Land Bck', frames: [29, 22, 20], ticks: [2, 10, 6] },
  { seq: 54, raw: 66, name: 'Charging Fwd', frames: [19], ticks: [0] },
  { seq: 55, raw: 67, name: 'Charging Bck', frames: [20], ticks: [0] },
  { seq: 56, raw: 68, name: 'Charging Hold Fwd', loop: true, frames: [19], ticks: [2] },
  { seq: 57, raw: 69, name: 'Charging Hold Bck', loop: true, frames: [20], ticks: [2] },
  { seq: 58, raw: 70, name: 'Frozen Fwd', frames: [13], ticks: [0] },
  { seq: 59, raw: 71, name: 'Frozen Bck', frames: [18], ticks: [0] },
  { seq: 60, raw: 72, name: 'Sleeping Fwd', frames: [72], ticks: [0] },
  { seq: 61, raw: 73, name: 'Sleeping Bck', frames: [73], ticks: [0] },
  { seq: 62, raw: 74, name: 'Confused Fwd', loop: true, frames: [11, 40, 39, 40, 11, 41, 42, 41], ticks: [6, 8, 10, 8, 6, 8, 10, 8], fb: [0, 1, 2, 1, 0, -1, -2, -1], du: [0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 63, raw: 75, name: 'Confused Bck', loop: true, frames: [16, 44, 43, 44, 16, 45, 46, 45], ticks: [6, 8, 10, 8, 6, 8, 10, 8], fb: [0, 1, 2, 1, 0, -1, -2, -1], du: [0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 64, raw: 80, name: 'Singing Fwd', loop: true, frames: [35, 36], ticks: [20, 20] },
  { seq: 65, raw: 81, name: 'Singing Bck', loop: true, frames: [37, 38], ticks: [20, 20] },
  { seq: 66, raw: 82, name: 'Dancing Fwd', loop: true, frames: [11, 1, 8, 7, 6, 5, 4, 3, 11, 47, 48, 47, 11, 3, 4, 5, 6, 7, 8, 1, 11, 49, 50, 49], ticks: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 67, raw: 83, name: 'Dancing Bck', loop: true, frames: [16, 7, 6, 5, 4, 3, 2, 1, 16, 51, 52, 51, 16, 1, 2, 3, 4, 5, 6, 7, 16, 53, 54, 53], ticks: [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 6, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 68, raw: 84, name: 'Casting Fwd', frames: [55, 56, 57], ticks: [4, 4, 0] },
  { seq: 69, raw: 85, name: 'Casting Bck', frames: [62, 63, 64], ticks: [4, 4, 0] },
  { seq: 70, raw: 86, name: 'Casting Loop Fwd', loop: true, frames: [58, 57], ticks: [8, 8] },
  { seq: 71, raw: 87, name: 'Casting Loop Bck', loop: true, frames: [64, 64], ticks: [8, 8] },
  { seq: 72, raw: 88, name: 'Cast Execute Fwd', frames: [56, 19, 11, 27, 28, 28, 28, 28, 27], ticks: [2, 8, 4, 4, 4, 6, 4, 4, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, -1, -2, -1, 0, 0] },
  { seq: 73, raw: 89, name: 'Cast Execute Bck', frames: [63, 20, 16, 29, 30, 30, 30, 30, 29], ticks: [2, 8, 4, 4, 4, 6, 4, 4, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, -1, -2, -1, 0, 0] },
  { seq: 74, raw: 96, name: 'Frozen Walk 1 Fwd', frames: [9], ticks: [0] },
  { seq: 75, raw: 97, name: 'Frozen Walk 1 Bck', frames: [14], ticks: [0] },
  { seq: 76, raw: 98, name: 'Frozen Walk 2 Fwd', frames: [13], ticks: [0] },
  { seq: 77, raw: 99, name: 'Frozen Walk 2 Bck', frames: [18], ticks: [0] },
  { seq: 78, raw: 100, name: 'Nulled Walk Fwd', loop: true, frames: [76, 75, 74, 75, 76, 77, 78, 77], ticks: [6, 8, 10, 8, 6, 8, 10, 8] },
  { seq: 79, raw: 101, name: 'Nulled Walk Bck', loop: true, frames: [81, 80, 79, 80, 81, 82, 83, 82], ticks: [6, 8, 10, 8, 6, 8, 10, 8] },
  { seq: 80, raw: 102, name: 'Found Item Fwd', frames: [11, 19, 21, 19, 11, 27, 28, 27, 11], ticks: [2, 4, 8, 4, 4, 2, 8, 2, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, -1, 0, 0] },
  { seq: 81, raw: 103, name: 'Found Item Bck', frames: [16, 20, 22, 20, 16, 29, 30, 29, 16], ticks: [2, 4, 8, 4, 4, 2, 8, 2, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, -1, 0, 0] },
  { seq: 82, raw: 104, name: 'Bounced to Death Fwd', frames: [19, 72, 72, 72, 23, 23, 23, 23, 23, 23, 23, 23, 23], ticks: [4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, -8, -12, -8, -2, 0, -4, 0, -2, 0, -2, 0] },
  { seq: 83, raw: 105, name: 'Bounced to Death Bck', frames: [20, 73, 73, 73, 24, 24, 24, 24, 24, 24, 24, 24, 24], ticks: [4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 0], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, -8, -12, -8, -2, 0, -4, 0, -2, 0, -2, 0] },
  { seq: 84, raw: 106, name: 'Revived Fwd', frames: [72, 19, 11], ticks: [16, 6, 0] },
  { seq: 85, raw: 107, name: 'Revived Bck', frames: [73, 20, 16], ticks: [16, 6, 0] },
  { seq: 86, raw: 108, name: 'Revived Hold Fwd', frames: [72], ticks: [0] },
  { seq: 87, raw: 109, name: 'Revived Hold Bck', frames: [73], ticks: [0] },
  { seq: 88, raw: 112, name: 'Damaged Shaking Fwd', frames: [68, 68], ticks: [2, 2] },
  { seq: 89, raw: 113, name: 'Damaged Shaking Bck', frames: [69, 69], ticks: [2, 2] },
  { seq: 90, raw: 114, name: 'Chest Pickup Fwd', frames: [28], ticks: [0], fb: [0], du: [-1] },
  { seq: 91, raw: 115, name: 'Chest Pickup Bck', frames: [30], ticks: [0], fb: [0], du: [-1] },
  { seq: 92, raw: 118, name: 'Null Fwd', frames: [0], ticks: [0] },
  { seq: 93, raw: 119, name: 'Null Bck', frames: [0], ticks: [0] },
  { seq: 94, raw: 120, name: 'Teleport Fwd', frames: [10, 27, 28, 27, 10], ticks: [4, 6, 2, 4, 6], fb: [0, 0, 0, 0, 0], du: [-1, -2, -2, -1, 0] },
  { seq: 95, raw: 121, name: 'Teleport Bck', frames: [15, 29, 30, 29, 15], ticks: [4, 6, 2, 4, 6], fb: [0, 0, 0, 0, 0], du: [-1, -2, -2, -1, 0] },
  { seq: 96, raw: 122, name: 'Unarmed High Fwd', frames: [92, 93, 92, 94, 95, 96, 96, 95, 94], ticks: [4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, -2, -2, -2, 0, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 97, raw: 123, name: 'Unarmed High Bck', frames: [141, 142, 141, 143, 144, 145, 145, 144, 143], ticks: [4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, -2, -2, -2, 0, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 98, raw: 124, name: 'Unarmed Mid Fwd', frames: [92, 93, 92, 97, 98, 99, 99, 98, 97], ticks: [4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, -2, -2, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 99, raw: 125, name: 'Unarmed Mid Bck', frames: [141, 142, 141, 146, 147, 148, 148, 147, 146], ticks: [4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, -2, -2, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 100, raw: 126, name: 'Unarmed Low Fwd', frames: [92, 93, 97, 100, 101, 102, 102, 101, 97], ticks: [4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 101, raw: 127, name: 'Unarmed Low Bck', frames: [141, 142, 146, 149, 150, 151, 151, 150, 146], ticks: [4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 102, raw: 128, name: 'Swing High Fwd', frames: [86, 84, 85, 86, 87, 88, 88, 88], ticks: [4, 2, 8, 2, 2, 14, 2, 4], fb: [0, -2, -2, 0, 0, 2, 2, 0], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 103, raw: 129, name: 'Swing High Bck', frames: [135, 133, 134, 135, 136, 137, 137, 137], ticks: [4, 2, 8, 2, 2, 14, 2, 4], fb: [0, -2, -2, 0, 0, 2, 2, 0], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 104, raw: 130, name: 'Swing Mid Fwd', frames: [86, 84, 85, 87, 89, 90, 90, 90, 89], ticks: [4, 2, 8, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 105, raw: 131, name: 'Swing Mid Bck', frames: [135, 133, 134, 136, 138, 139, 139, 139, 138], ticks: [4, 2, 8, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 106, raw: 132, name: 'Swing Low Fwd', frames: [86, 84, 85, 87, 89, 90, 91, 91, 90, 89], ticks: [4, 2, 8, 2, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[20, 'PostGenericAttack']] },
  { seq: 107, raw: 133, name: 'Swing Low Bck', frames: [135, 133, 134, 136, 138, 139, 140, 140, 139, 138], ticks: [4, 2, 8, 2, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[20, 'PostGenericAttack']] },
  { seq: 108, raw: 134, name: 'Item Throw High Start Fwd', frames: [86, 84, 85, 86, 87, 88], ticks: [4, 2, 8, 2, 2, 8], fb: [0, -2, -2, 0, 0, 2], du: [0, 0, 0, 0, 0, 0] },
  { seq: 109, raw: 135, name: 'Item Throw High Start Bck', frames: [135, 133, 134, 135, 136, 137], ticks: [4, 2, 8, 2, 2, 8], fb: [0, -2, -2, 0, 0, 2], du: [0, 0, 0, 0, 0, 0] },
  { seq: 110, raw: 136, name: 'Item Throw High Hold Fwd', frames: [88], ticks: [0] },
  { seq: 111, raw: 137, name: 'Item Throw High Hold Bck', frames: [137], ticks: [0] },
  { seq: 112, raw: 138, name: 'Item Throw High Release Fwd', frames: [88, 88], ticks: [4, 4], fb: [2, 0], du: [0, 0], events: [[0, 'PlaySound']] },
  { seq: 113, raw: 139, name: 'Item Throw High Release Bck', frames: [137, 137], ticks: [4, 4], fb: [2, 0], du: [0, 0], events: [[0, 'PlaySound']] },
  { seq: 114, raw: 140, name: 'Item Throw Mid Start Fwd', frames: [86, 84, 85, 87, 89, 90], ticks: [4, 2, 8, 2, 2, 8], fb: [0, -2, -2, -2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 115, raw: 141, name: 'Item Throw Mid Start Bck', frames: [135, 133, 134, 136, 138, 139], ticks: [4, 2, 8, 2, 2, 8], fb: [0, -2, -2, -2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 116, raw: 142, name: 'Item Throw Mid Hold Fwd', frames: [90], ticks: [0] },
  { seq: 117, raw: 143, name: 'Item Throw Mid Hold Bck', frames: [139], ticks: [0] },
  { seq: 118, raw: 144, name: 'Item Throw Mid Release Fwd', frames: [90, 90, 89], ticks: [2, 4, 4], events: [[0, 'PlaySound']] },
  { seq: 119, raw: 145, name: 'Item Throw Mid Release Bck', frames: [139, 139, 138], ticks: [2, 4, 4], events: [[0, 'PlaySound']] },
  { seq: 120, raw: 146, name: 'Item Throw Low Start Fwd', frames: [86, 84, 85, 87, 89, 90, 91], ticks: [4, 2, 8, 2, 2, 2, 8], fb: [0, -2, -2, -2, 0, 1, 1], du: [0, 0, 0, 0, 0, 0, 0] },
  { seq: 121, raw: 147, name: 'Item Throw Low Start Bck', frames: [135, 133, 134, 136, 138, 139, 140], ticks: [4, 2, 8, 2, 2, 2, 8], fb: [0, -2, -2, -2, 0, 1, 1], du: [0, 0, 0, 0, 0, 0, 0] },
  { seq: 122, raw: 148, name: 'Item Throw Low Hold Fwd', frames: [91], ticks: [0] },
  { seq: 123, raw: 149, name: 'Item Throw Low Hold Bck', frames: [140], ticks: [0] },
  { seq: 124, raw: 150, name: 'Item Throw Low Release Fwd', frames: [91, 90, 89], ticks: [2, 4, 4], events: [[0, 'PlaySound']] },
  { seq: 125, raw: 151, name: 'Item Throw Low Release Bck', frames: [140, 139, 138], ticks: [2, 4, 4], events: [[0, 'PlaySound']] },
  { seq: 126, raw: 152, name: 'Weapon Throw Fwd', frames: [86, 84, 85, 87, 89, 90, 90, 89], ticks: [4, 2, 8, 2, 2, 10, 4, 2], fb: [0, -2, -2, -2, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 127, raw: 153, name: 'Weapon Throw Bck', frames: [135, 133, 134, 136, 138, 139, 139, 138], ticks: [4, 2, 8, 2, 2, 10, 4, 2], fb: [0, -2, -2, -2, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 128, raw: 154, name: 'Poke High Fwd', frames: [103, 104, 103, 105, 105, 106, 106, 105], ticks: [4, 8, 2, 2, 2, 14, 2, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 129, raw: 155, name: 'Poke High Bck', frames: [152, 153, 152, 154, 154, 155, 155, 154], ticks: [4, 8, 2, 2, 2, 14, 2, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 130, raw: 156, name: 'Poke Mid Fwd', frames: [103, 104, 103, 107, 107, 108, 108, 107], ticks: [4, 8, 2, 2, 2, 14, 2, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 131, raw: 157, name: 'Poke Mid Bck', frames: [152, 153, 152, 156, 156, 157, 157, 156], ticks: [4, 8, 2, 2, 2, 14, 2, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 132, raw: 158, name: 'Poke Low Fwd', frames: [103, 104, 107, 109, 110, 111, 111, 110, 109], ticks: [4, 8, 2, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 133, raw: 159, name: 'Poke Low Bck', frames: [152, 153, 156, 158, 159, 160, 160, 159, 158], ticks: [4, 8, 2, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 134, raw: 160, name: 'Gun High Fwd', frames: [112, 113, 112, 114, 115, 115, 115, 115, 117], ticks: [4, 10, 2, 2, 2, 4, 14, 2, 4], fb: [0, -2, 0, 0, 2, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[24, 'PostGenericAttack']] },
  { seq: 135, raw: 161, name: 'Gun High Bck', frames: [161, 162, 161, 163, 164, 164, 164, 164, 166], ticks: [4, 10, 2, 2, 2, 4, 14, 2, 4], fb: [0, -2, 0, 0, 2, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[24, 'PostGenericAttack']] },
  { seq: 136, raw: 162, name: 'Gun Mid Fwd', frames: [112, 113, 112, 117, 117, 116, 116, 116, 117], ticks: [4, 10, 2, 2, 2, 4, 14, 2, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[24, 'PostGenericAttack']] },
  { seq: 137, raw: 163, name: 'Gun Mid Bck', frames: [161, 162, 161, 166, 166, 165, 165, 165, 166], ticks: [4, 10, 2, 2, 2, 4, 14, 2, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[24, 'PostGenericAttack']] },
  { seq: 138, raw: 164, name: 'Gun Low Fwd', frames: [112, 113, 114, 117, 116, 118, 118, 116, 114], ticks: [4, 10, 2, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[20, 'PostGenericAttack']] },
  { seq: 139, raw: 165, name: 'Gun Low Bck', frames: [161, 162, 163, 166, 165, 167, 167, 165, 163], ticks: [4, 10, 2, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, 0, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[20, 'PostGenericAttack']] },
  { seq: 140, raw: 166, name: 'Bow High Fwd', frames: [119, 119, 120, 121, 121, 121, 121, 123, 124], ticks: [2, 8, 2, 4, 10, 18, 2, 2, 4], fb: [0, -2, -2, 0, 2, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[26, 'PlaySound']] },
  { seq: 141, raw: 167, name: 'Bow High Bck', frames: [168, 168, 169, 170, 170, 170, 170, 172, 173], ticks: [2, 8, 2, 4, 10, 18, 2, 2, 4], fb: [0, -2, -2, 0, 2, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[26, 'PlaySound']] },
  { seq: 142, raw: 168, name: 'Bow Mid Fwd', frames: [119, 119, 121, 121, 123, 123, 123, 124], ticks: [2, 8, 2, 4, 10, 18, 2, 4], fb: [0, -2, -2, 0, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[26, 'PlaySound']] },
  { seq: 143, raw: 169, name: 'Bow Mid Bck', frames: [168, 168, 170, 170, 172, 172, 172, 173], ticks: [2, 8, 2, 4, 10, 18, 2, 4], fb: [0, -2, -2, 0, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[26, 'PlaySound']] },
  { seq: 144, raw: 170, name: 'Bow Low Fwd', frames: [119, 119, 123, 123, 124, 124, 124, 124], ticks: [2, 8, 2, 4, 10, 18, 2, 4], fb: [0, -2, -2, 0, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[26, 'PlaySound']] },
  { seq: 145, raw: 171, name: 'Bow Low Bck', frames: [168, 168, 172, 172, 173, 173, 173, 173], ticks: [2, 8, 2, 4, 10, 18, 2, 4], fb: [0, -2, -2, 0, 2, 2, 2, 1], du: [0, 0, 0, 0, 0, 0, 0, 0], events: [[26, 'PlaySound']] },
  { seq: 146, raw: 172, name: 'Read Book Fwd', frames: [125, 126, 127, 128, 129, 128, 129, 128, 129, 128, 129, 128, 129, 128, 128], ticks: [6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 14, 2], events: [[0, 'PlaySound'], [98, 'PostGenericAttack']] },
  { seq: 147, raw: 173, name: 'Read Book Bck', frames: [174, 175, 176, 177, 178, 177, 178, 177, 178, 177, 178, 177, 178, 177, 177], ticks: [6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 14, 2], events: [[0, 'PlaySound'], [98, 'PostGenericAttack']] },
  { seq: 148, raw: 174, name: 'Play Instrument Fwd', frames: [104, 124, 122, 105, 122, 124, 104, 124, 122, 105, 122, 124, 124], ticks: [10, 8, 8, 10, 8, 8, 10, 8, 8, 10, 8, 6, 2], events: [[0, 'PlaySound'], [88, 'PostGenericAttack']] },
  { seq: 149, raw: 175, name: 'Play Instrument Bck', frames: [153, 173, 171, 154, 171, 173, 153, 173, 171, 154, 171, 173, 173], ticks: [10, 8, 8, 10, 8, 8, 10, 8, 8, 10, 8, 6, 2], events: [[0, 'PlaySound'], [88, 'PostGenericAttack']] },
  { seq: 150, raw: 176, name: 'Shield Block High Fwd', frames: [130], ticks: [16], fb: [-2], du: [0] },
  { seq: 151, raw: 177, name: 'Shield Block High Bck', frames: [179], ticks: [16], fb: [-2], du: [0] },
  { seq: 152, raw: 178, name: 'Shield Block Mid Fwd', frames: [131], ticks: [16], fb: [-2], du: [0] },
  { seq: 153, raw: 179, name: 'Shield Block Mid Bck', frames: [180], ticks: [16], fb: [-2], du: [0] },
  { seq: 154, raw: 180, name: 'Shield Block Low Fwd', frames: [132], ticks: [16], fb: [-2], du: [0] },
  { seq: 155, raw: 181, name: 'Shield Block Low Bck', frames: [181], ticks: [16], fb: [-2], du: [0] },
  { seq: 156, raw: 182, name: 'Swing Recoil High Fwd', frames: [87, 86, 84, 85, 84, 86], ticks: [2, 4, 4, 8, 10, 6], fb: [0, 0, -3, -4, -3, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 157, raw: 183, name: 'Swing Recoil High Bck', frames: [136, 135, 133, 134, 133, 135], ticks: [2, 4, 4, 8, 10, 6], fb: [0, 0, -3, -4, -3, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 158, raw: 184, name: 'Swing Recoil Mid Fwd', frames: [87, 86, 84, 85, 84, 86], ticks: [2, 4, 4, 8, 10, 6], fb: [0, 0, -3, -4, -3, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 159, raw: 185, name: 'Swing Recoil Mid Bck', frames: [136, 135, 133, 134, 133, 135], ticks: [2, 4, 4, 8, 10, 6], fb: [0, 0, -3, -4, -3, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 160, raw: 186, name: 'Swing Recoil Low Fwd', frames: [90, 89, 87, 86, 84, 85, 84, 86], ticks: [2, 2, 2, 4, 4, 8, 10, 6], fb: [0, 0, 0, 0, -3, -4, -3, 0], du: [0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 161, raw: 187, name: 'Swing Recoil Low Bck', frames: [139, 138, 136, 135, 133, 134, 133, 135], ticks: [2, 2, 2, 4, 4, 8, 10, 6], fb: [0, 0, 0, 0, -3, -4, -3, 0], du: [0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 162, raw: 188, name: 'Punch Recoil High Fwd', frames: [94, 94, 92, 93, 93, 92], ticks: [2, 4, 4, 8, 10, 6], fb: [-2, 0, -2, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 163, raw: 189, name: 'Punch Recoil High Bck', frames: [143, 143, 141, 142, 142, 141], ticks: [2, 4, 4, 8, 10, 6], fb: [-2, 0, -2, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 164, raw: 190, name: 'Punch Recoil Mid Fwd', frames: [94, 94, 92, 93, 93, 92], ticks: [2, 4, 4, 8, 10, 6], fb: [-2, 0, -2, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 165, raw: 191, name: 'Punch Recoil Mid Bck', frames: [143, 143, 141, 142, 142, 141], ticks: [2, 4, 4, 8, 10, 6], fb: [-2, 0, -2, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 166, raw: 192, name: 'Punch Recoil Low Fwd', frames: [100, 94, 94, 92, 93, 93, 92], ticks: [4, 2, 4, 4, 8, 10, 6], fb: [0, -2, 0, -2, -4, -2, 0], du: [0, 0, 0, 0, 0, 0, 0] },
  { seq: 167, raw: 193, name: 'Punch Recoil Low Bck', frames: [149, 143, 143, 141, 142, 142, 141], ticks: [4, 2, 4, 4, 8, 10, 6], fb: [0, -2, 0, -2, -4, -2, 0], du: [0, 0, 0, 0, 0, 0, 0] },
  { seq: 168, raw: 194, name: 'Thrust Recoil High Fwd', frames: [105, 105, 103, 104, 104, 103], ticks: [2, 4, 4, 8, 10, 6], fb: [0, -2, -4, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 169, raw: 195, name: 'Thrust Recoil High Bck', frames: [154, 154, 152, 153, 153, 152], ticks: [2, 4, 4, 8, 10, 6], fb: [0, -2, -4, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 170, raw: 196, name: 'Thrust Recoil Mid Fwd', frames: [105, 105, 103, 104, 104, 103], ticks: [2, 4, 4, 8, 10, 6], fb: [0, -2, -4, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 171, raw: 197, name: 'Thrust Recoil Mid Bck', frames: [154, 154, 152, 153, 153, 152], ticks: [2, 4, 4, 8, 10, 6], fb: [0, -2, -4, -4, -2, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 172, raw: 198, name: 'Thrust Recoil Low Fwd', frames: [110, 109, 109, 103, 104, 104, 103], ticks: [4, 2, 4, 4, 8, 10, 6], fb: [0, 0, -2, -4, -4, -2, 0], du: [0, 0, 0, 0, 0, 0, 0] },
  { seq: 173, raw: 199, name: 'Thrust Recoil Low Bck', frames: [159, 158, 158, 152, 153, 153, 152], ticks: [4, 2, 4, 4, 8, 10, 6], fb: [0, 0, -2, -4, -4, -2, 0], du: [0, 0, 0, 0, 0, 0, 0] },
  { seq: 174, raw: 200, name: 'Flip Ground Switch Fwd', frames: [97, 101, 102, 102, 101, 97], ticks: [8, 8, 12, 2, 8, 8], fb: [0, 0, 2, 2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 175, raw: 201, name: 'Flip Ground Switch Bck', frames: [146, 150, 151, 151, 150, 146], ticks: [8, 8, 12, 2, 8, 8], fb: [0, 0, 2, 2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 176, raw: 202, name: 'Casting Start Fwd', frames: [11, 27, 28], ticks: [6, 6, 0] },
  { seq: 177, raw: 203, name: 'Casting Start Bck', frames: [16, 29, 30], ticks: [6, 6, 0] },
  { seq: 178, raw: 204, name: 'Casting Start 2 Fwd', frames: [11, 19, 55, 56, 58], ticks: [4, 6, 4, 4, 0] },
  { seq: 179, raw: 205, name: 'Casting Start 2 Bck', frames: [16, 20, 65, 66, 67], ticks: [4, 6, 4, 4, 0] },
  { seq: 180, raw: 206, name: 'Pummel Fwd', frames: [92, 93, 92, 97, 98, 99, 99, 99, 99, 99, 98, 97], ticks: [4, 8, 2, 2, 2, 2, 2, 2, 2, 4, 4, 4], fb: [0, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 181, raw: 207, name: 'Pummel Bck', frames: [141, 142, 141, 146, 147, 148, 148, 148, 148, 148, 147, 146], ticks: [4, 8, 2, 2, 2, 2, 2, 2, 2, 4, 4, 4], fb: [0, -2, -2, 0, 0, 0, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 182, raw: 208, name: 'Pummel 2 Fwd', frames: [92, 93, 92, 97, 98, 99, 98, 97, 97], ticks: [4, 6, 2, 2, 2, 2, 4, 2, 8], fb: [0, 0, 0, -1, -1, 0, 1, 1, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 183, raw: 209, name: 'Pummel 2 Bck', frames: [141, 142, 141, 146, 147, 148, 147, 146, 146], ticks: [4, 6, 2, 2, 2, 2, 4, 2, 8], fb: [0, 0, 0, -1, -1, 0, 1, 1, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 184, raw: 210, name: 'Cast Revive Fwd', frames: [19, 55, 56, 28, 56, 55], ticks: [6, 4, 4, 2, 4, 6], fb: [0, 0, 0, -2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 185, raw: 211, name: 'Cast Revive Bck', frames: [20, 65, 66, 30, 66, 65], ticks: [6, 4, 4, 2, 4, 6], fb: [0, 0, 0, -2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 186, raw: 212, name: 'Rush Fwd', frames: [92, 100, 100], ticks: [2, 2, 2] },
  { seq: 187, raw: 213, name: 'Rush Bck', frames: [141, 149, 149], ticks: [2, 2, 2] },
  { seq: 188, raw: 214, name: 'Read Book 2 Fwd', frames: [125, 126, 127, 128, 129, 128, 129, 128, 129, 128, 129, 128, 128], ticks: [6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 22, 2] },
  { seq: 189, raw: 215, name: 'Read Book 2 Bck', frames: [174, 175, 176, 177, 178, 177, 178, 177, 178, 177, 178, 177, 177], ticks: [6, 6, 6, 8, 8, 8, 8, 8, 8, 8, 8, 22, 2] },
  { seq: 190, raw: 216, name: 'Talk Skill Fwd', frames: [128, 129], ticks: [8, 8] },
  { seq: 191, raw: 217, name: 'Talk Skill Bck', frames: [177, 178], ticks: [8, 8] },
  { seq: 192, raw: 218, name: 'Fall Critical Fwd', frames: [2, 19, 21], ticks: [6, 8, 0] },
  { seq: 193, raw: 219, name: 'Fall Critical Bck', frames: [8, 20, 22], ticks: [6, 8, 0] },
  { seq: 194, raw: 220, name: 'Swing Low 2 Fwd', frames: [86, 84, 85, 87, 89, 90, 90, 90, 89], ticks: [4, 2, 8, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 195, raw: 221, name: 'Swing Low 2 Bck', frames: [135, 133, 134, 136, 138, 139, 139, 139, 138], ticks: [4, 2, 8, 2, 2, 14, 2, 4, 2], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 196, raw: 222, name: 'Spin Dance Fwd', frames: [27, 47, 48, 47, 11, 49, 50, 49, 11, 1, 8, 7, 6, 5, 4, 3, 11, 47, 48, 47, 11, 3, 4, 5, 6, 7, 8, 1, 11, 49, 50, 49, 11, 47, 48, 47, 11], ticks: [4, 4, 6, 4, 4, 4, 54, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 6, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 6, 4, 2, 2, 240, 4, 4], fb: [0, -1, -2, -1, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, -1, -1, 0, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -1, -1] },
  { seq: 197, raw: 223, name: 'Spin Dance Bck', frames: [29, 53, 54, 53, 16, 51, 52, 51, 16, 1, 2, 3, 4, 5, 6, 7, 16, 53, 54, 53, 16, 7, 6, 5, 4, 3, 2, 1, 16, 51, 52, 51, 16, 53, 54, 53, 16], ticks: [4, 4, 6, 4, 4, 4, 54, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 6, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2, 4, 6, 4, 2, 2, 240, 4, 4], fb: [0, -1, -2, -1, 0, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, -1, -2, -1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 0, -1, -2, -1, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  { seq: 198, raw: 226, name: 'Steal Fwd', frames: [21, 21, 21, 19, 47], ticks: [6, 6, 16, 6, 6], fb: [0, 0, 0, 0, -2], du: [0, 0, 0, 0, 0] },
  { seq: 199, raw: 227, name: 'Steal Bck', frames: [22, 22, 22, 20, 53], ticks: [6, 6, 16, 6, 6], fb: [0, 0, 0, 0, -2], du: [0, 0, 0, 0, 0] },
  { seq: 200, raw: 228, name: 'Steal Heart Fwd', frames: [21, 90, 88, 125, 35, 36], ticks: [20, 6, 6, 8, 16, 16] },
  { seq: 201, raw: 229, name: 'Steal Heart Bck', frames: [22, 139, 138, 65, 37, 38], ticks: [20, 6, 6, 8, 16, 16] },
  { seq: 202, raw: 230, name: 'Katana Use Fwd', frames: [11, 47, 47, 27, 27, 28], ticks: [4, 6, 6, 4, 4, 0], fb: [0, -2, -4, -2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 203, raw: 231, name: 'Katana Use Bck', frames: [16, 51, 51, 29, 29, 30], ticks: [4, 6, 6, 4, 4, 0], fb: [0, -2, -4, -2, 0, 0], du: [0, 0, 0, 0, 0, 0] },
  { seq: 204, raw: 232, name: 'Jump 2 Fwd', frames: [56, 19, 11, 27, 28, 28], ticks: [2, 8, 4, 4, 4, 0], fb: [0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, -1, -2] },
  { seq: 205, raw: 233, name: 'Jump 2 Bck', frames: [63, 20, 16, 29, 30, 30], ticks: [2, 8, 4, 4, 4, 0], fb: [0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, -1, -2] },
  { seq: 206, raw: 234, name: 'Dragoon Jump 2 Fwd', frames: [2, 19, 21, 19, 27, 31], ticks: [4, 4, 8, 2, 4, 2], events: [[22, 'PlaySound']] },
  { seq: 207, raw: 235, name: 'Dragoon Jump 2 Bck', frames: [8, 20, 22, 20, 29, 33], ticks: [4, 4, 8, 2, 4, 2], events: [[22, 'PlaySound']] },
  { seq: 208, raw: 236, name: 'Dragoon Jump 3 Fwd', frames: [2, 19, 21, 19, 27, 31, 92, 102, 21, 89, 86, 19], ticks: [4, 4, 8, 2, 4, 2, 2, 2, 4, 2, 2, 2], events: [[26, 'PlaySound'], [32, 'PostGenericAttack']] },
  { seq: 209, raw: 237, name: 'Dragoon Jump 3 Bck', frames: [8, 20, 22, 20, 29, 33, 141, 151, 22, 138, 135, 20], ticks: [4, 4, 8, 2, 4, 2, 2, 2, 4, 2, 2, 6], events: [[26, 'PlaySound'], [32, 'PostGenericAttack']] },
  { seq: 210, raw: 238, name: 'Cloth Bag High Fwd', frames: [86, 84, 85, 86, 87, 88, 88, 88, 88], ticks: [4, 2, 8, 2, 2, 6, 2, 4, 4], fb: [0, -2, -2, 0, 0, 2, 2, 4, 2], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 211, raw: 239, name: 'Cloth Bag High Bck', frames: [135, 133, 134, 135, 136, 137, 137, 137, 137], ticks: [4, 2, 8, 2, 2, 6, 2, 4, 4], fb: [0, -2, -2, 0, 0, 2, 2, 4, 2], du: [0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 212, raw: 240, name: 'Cloth Bag Mid Fwd', frames: [86, 84, 85, 87, 89, 90, 90, 90, 90, 89], ticks: [4, 2, 8, 2, 2, 6, 2, 2, 4, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 213, raw: 241, name: 'Cloth Bag Mid Bck', frames: [135, 133, 134, 136, 138, 139, 139, 139, 139, 138], ticks: [4, 2, 8, 2, 2, 6, 2, 2, 4, 4], fb: [0, -2, -2, -2, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[18, 'PostGenericAttack']] },
  { seq: 214, raw: 242, name: 'Cloth Bag Low Fwd', frames: [86, 84, 85, 87, 89, 90, 91, 91, 91, 90, 89], ticks: [4, 2, 8, 2, 2, 2, 6, 2, 2, 4, 4], fb: [0, -2, -2, -2, 0, 1, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[20, 'PostGenericAttack']] },
  { seq: 215, raw: 243, name: 'Cloth Bag Low Bck', frames: [135, 133, 134, 136, 138, 139, 140, 140, 140, 139, 138], ticks: [4, 2, 8, 2, 2, 2, 6, 2, 2, 4, 4], fb: [0, -2, -2, -2, 0, 1, 1, 1, 1, 1, 1], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[20, 'PostGenericAttack']] },
  { seq: 216, raw: 250, name: 'Spin Punch Fwd', frames: [2, 1, 8, 7, 6, 5, 4, 3, 92, 93, 92, 97, 98, 99, 99, 98, 97], ticks: [2, 2, 2, 2, 2, 2, 2, 2, 4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -2, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[34, 'PostGenericAttack']] },
  { seq: 217, raw: 251, name: 'Spin Punch Bck', frames: [8, 7, 6, 5, 4, 3, 2, 1, 141, 142, 141, 146, 147, 148, 148, 147, 146], ticks: [2, 2, 2, 2, 2, 2, 2, 2, 4, 8, 2, 2, 2, 14, 2, 2, 4], fb: [0, 0, 0, 0, 0, 0, 0, 0, 0, -2, -2, 0, 0, 0, 0, 0, 0], du: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], events: [[34, 'PostGenericAttack']] },
];

//NOTE(@jimmylee)
//Delays in seconds and the cycle length, resolved once for the frame resolvers.
for (const entry of SEQ_LIBRARY) {
  entry.delaysS = entry.ticks.map((t) => t / TICKS_PER_SECOND);
  entry.totalS = entry.delaysS.reduce((a, b) => a + b, 0);
}

//NOTE(@jimmylee)
//SEQ 6 onward come in pairs, even = front (patterns A/B), odd = back (C/D). SEQ 0-5 are one facing each.
//`name` is the display name: SEQ_LIBRARY's name without the facing.
export const SEQ_PAIRS = [];
for (let s = 0; s < SEQ_LIBRARY.length; s += s < 6 ? 1 : 2) {
  const back = s < 6 ? s : s + 1;
  SEQ_PAIRS.push({ front: SEQ_LIBRARY[s], back: SEQ_LIBRARY[back], name: SEQ_LIBRARY[s].name.replace(/ Fwd\b/, ''), label: s === back ? `SEQ ${s}` : `SEQ ${s}/${back}` });
}

export const pairOf = (seq) => SEQ_PAIRS.find((pair) => pair.front.seq === seq);

//NOTE(@jimmylee)
//The library default: Swing High, the first weapon attack.
export const DEFAULT_LIBRARY_PAIR = SEQ_PAIRS.findIndex((pair) => pair.front.seq === 102);

//NOTE(@jimmylee)
//Sequences with a mode of their own, by front SEQ, one row per distinct animation. No
//assembly: the mode draws the sequence tile by tile (meshes/character-groups/group-sequence.js), and
//the main route builds its 2D section and ThreeJS card from the row. `name` replaces a display name that
//would read as one facing, `also` lists the pairs that are the same animation, `water` draws the
//F(n + SHP_WATER_OFFSET) frames: Nulled Walk's dry frames F74-F83 are SR1 placeholders.
//Not listed, because a card already plays them: Idle 1-5, Walk 6, Float 12, Critical 32 (Mode K),
//Taking Damage 38 (Mode H), Dead 40, High Jump Start 48 and Dragoon Jump 2 206 (Mode T), Frozen 58 and
//Frozen Walk 2 76 (Mode G), Singing 64 (Mode C), Bounced to Death 82 (Mode FI), Revived 84 (Mode ID),
//Unarmed 96-100 (Modes S1-S3), Bow 140-144 (Modes P1-P3) and Dragoon Jump 3 208 (Mode TS). Also not
//listed, because TYPE1 draws only the SR1 origin marker for them: Null 0 and 92.
const SEQUENCE_MODE_ROWS = [
  { seq: 8, mode: 'WF' },
  { seq: 10, mode: 'WS' },
  { seq: 14, mode: 'FF' },
  { seq: 16, mode: 'FS' },
  { seq: 18, mode: 'WT', also: [24] },
  { seq: 20, mode: 'WTF', also: [26] },
  { seq: 22, mode: 'WTS', also: [28] },
  { seq: 30, mode: 'RT', name: 'Rotate' },
  { seq: 34, mode: 'DF' },
  { seq: 36, mode: 'DD' },
  { seq: 42, mode: 'MJ' },
  { seq: 44, mode: 'JU' },
  { seq: 46, mode: 'JD' },
  { seq: 50, mode: 'HH' },
  { seq: 52, mode: 'HL' },
  { seq: 54, mode: 'CG', also: [56] },
  { seq: 60, mode: 'SL', also: [86] },
  { seq: 62, mode: 'CF' },
  { seq: 66, mode: 'DN' },
  { seq: 68, mode: 'CA' },
  { seq: 70, mode: 'CL' },
  { seq: 72, mode: 'CE' },
  { seq: 74, mode: 'FW' },
  { seq: 78, mode: 'NW', water: true },
  { seq: 80, mode: 'FD' },
  { seq: 88, mode: 'DS' },
  { seq: 90, mode: 'CP' },
  { seq: 94, mode: 'TP' },
  { seq: 102, mode: 'SW1' },
  { seq: 104, mode: 'SW2', also: [194] },
  { seq: 106, mode: 'SW3' },
  { seq: 108, mode: 'IT1' },
  { seq: 110, mode: 'IH1' },
  { seq: 112, mode: 'IR1' },
  { seq: 114, mode: 'IT2' },
  { seq: 116, mode: 'IH2' },
  { seq: 118, mode: 'IR2' },
  { seq: 120, mode: 'IT3' },
  { seq: 122, mode: 'IH3' },
  { seq: 124, mode: 'IR3' },
  { seq: 126, mode: 'WP' },
  { seq: 128, mode: 'PK1' },
  { seq: 130, mode: 'PK2' },
  { seq: 132, mode: 'PK3' },
  { seq: 134, mode: 'GN1' },
  { seq: 136, mode: 'GN2' },
  { seq: 138, mode: 'GN3' },
  { seq: 146, mode: 'RB' },
  { seq: 148, mode: 'PI' },
  { seq: 150, mode: 'SB1' },
  { seq: 152, mode: 'SB2' },
  { seq: 154, mode: 'SB3' },
  { seq: 156, mode: 'SV1', also: [158] },
  { seq: 160, mode: 'SV3' },
  { seq: 162, mode: 'PV1', also: [164] },
  { seq: 166, mode: 'PV3' },
  { seq: 168, mode: 'TV1', also: [170] },
  { seq: 172, mode: 'TV3' },
  { seq: 174, mode: 'FG' },
  { seq: 176, mode: 'CS1' },
  { seq: 178, mode: 'CS2' },
  { seq: 180, mode: 'PM1' },
  { seq: 182, mode: 'PM2' },
  { seq: 184, mode: 'CV' },
  { seq: 186, mode: 'RU' },
  { seq: 188, mode: 'RB2' },
  { seq: 190, mode: 'TK' },
  { seq: 192, mode: 'FC' },
  { seq: 196, mode: 'SD' },
  { seq: 198, mode: 'ST' },
  { seq: 200, mode: 'SH' },
  { seq: 202, mode: 'KT' },
  { seq: 204, mode: 'J2' },
  { seq: 210, mode: 'CB1' },
  { seq: 212, mode: 'CB2' },
  { seq: 214, mode: 'CB3' },
  { seq: 216, mode: 'SP' },
];

//NOTE(@jimmylee)
//`hitTick` is the sequence's PostGenericAttack (null when it has none). A sequence with one is an
//attack, and attacks loop, as Modes P1-P3 and S1-S3 do; any other sequence follows its own IncrementLoop.
export const SEQUENCE_MODES = SEQUENCE_MODE_ROWS.map(({ seq, mode, name, also = [], water = false }) => {
  const pair = pairOf(seq);
  const displayName = name ?? pair.name;
  const hit = pair.front.events?.find(([, label]) => label === 'PostGenericAttack');
  const hitTick = hit ? hit[0] : null;
  const aliases = also.map((s) => `${s}/${s + 1}`);
  return {
    mode,
    pair,
    name: displayName,
    title: `${displayName} (${mode})`,
    section: `${displayName} (${pair.front.seq}, ${pair.back.seq})`,
    seq: [pair.label, ...aliases, ...(water ? ['in water'] : [])].join(' · '),
    loop: hitTick !== null || pair.front.loop === true,
    hitTick,
    water,
  };
});

//NOTE(@jimmylee)
//SEQ ranges by what they animate (documentation/seq_animation_to_frame/AGENTS.md), for the selectors.
export const SEQ_CATEGORIES = [
  ['Idle', 0, 5],
  ['Walk', 6, 11],
  ['Float', 12, 17],
  ['Walk To', 18, 29],
  ['Rotation', 30, 31],
  ['Status Poses', 32, 41],
  ['Jump', 42, 53],
  ['Charging / Status', 54, 63],
  ['Singing / Dancing', 64, 67],
  ['Casting', 68, 73],
  ['Frozen Walk', 74, 79],
  ['Reactions', 80, 95],
  ['Unarmed', 96, 101],
  ['Swing', 102, 107],
  ['Item Throw', 108, 127],
  ['Poke', 128, 133],
  ['Gun', 134, 139],
  ['Bow', 140, 145],
  ['Book / Instrument', 146, 149],
  ['Shield', 150, 173],
  ['Abilities', 174, 205],
  ['Dragoon Jump', 206, 209],
  ['Cloth / Bag', 210, 215],
  ['Spin Punch', 216, 217],
].map(([label, from, to]) => ({ label: String(label), pairs: SEQ_PAIRS.map((pair, index) => ({ pair, index })).filter(({ pair }) => pair.front.seq >= from && pair.front.seq <= to) }));

//NOTE(@jimmylee)
//The game draws F(n + 182) for a unit standing in water.
export const SHP_WATER_OFFSET = 182;

//NOTE(@jimmylee)
//The body tile of a frame's tile list: the tile that writes depth and anchors the draw order. The
//biggest tile, first one on a tie; a body is never smaller than the arm and head tiles around it.
export function shpBodyIndex(tiles) {
  let best = 0;
  let bestArea = -1;
  for (let i = 0; i < tiles.length; i++) {
    const cell = SPRITE_MAP[tiles[i][0]];
    const area = cell.w * cell.h;
    if (area > bestArea) {
      best = i;
      bestArea = area;
    }
  }
  return best;
}

export { SHP_FRAMES };
