//NOTE(@jimmylee)
//tactics-sprite-data.json: the sprite tables in the one form a project outside this repository reads. It
//holds no value of its own: every number comes from constants/sprites/, which the parity suites hold to the
//binaries. assets/tactics-sprite.mjs reads it, and references/data.md is its schema.

import { BODY_W, SHEET_H, SHEET_W, SPRITE_CELLS, SPRITE_SHEET_FILE, STANDARD_CONTAINER_H } from '../constants/sprites/index.js';
import { HAND_GRIPS, IDLE_ASSEMBLY, SHP_ORIGIN_X, STANCE_Y, THROW_STONE_HANDS } from '../constants/sprites/assembly.js';
import { SEQ_CATEGORIES, SEQ_LIBRARY, SEQ_PAIRS, SEQUENCE_MODES, SHP_FRAMES, SHP_WATER_OFFSET, TICKS_PER_SECOND, pairOf } from '../constants/sprites/seq-library.js';
import { THROW_HOLD_DEPTH } from '../constants/character.js';
import { HELD_ITEMS, HELD_ITEM_SCALE, HELD_MARBLES, heldLayers, heldMarblePoint, heldOffset, heldSlide, heldTilt } from '../weapons/held-items.js';

export const SPRITE_DATA_VERSION = 3;
const MAX_TILES = Math.max(...SHP_FRAMES.map((tiles) => tiles.length));

//NOTE(@jimmylee)
//Idle has no sequence pair: the game draws one SHP frame per view. IDLE_ASSEMBLY names them "F3", "F2" and on.
const IDLE_FRAMES = IDLE_ASSEMBLY.map(({ shp }) => Number(shp.slice(1)));

const MODE_BY_FRONT = new Map(SEQUENCE_MODES.map((row) => [row.pair.front.seq, row]));
const CATEGORY_BY_FRONT = new Map(SEQ_CATEGORIES.flatMap(({ label, pairs }) => pairs.map(({ pair }) => [pair.front.seq, label])));

export const sequenceRow = ({ seq, raw, name, loop = false, frames, ticks, fb, du, events }) => ({ seq, raw, name, loop, frames, ticks, ...(fb ? { fb, du } : {}), ...(events ? { events } : {}) });

//NOTE(@jimmylee)
//One row per front/back pair. `loop` is the sequence's own IncrementLoop. The engine loops every attack for
//its demo cards (SEQUENCE_MODES.loop), and a game plays one once, so that choice stays with the caller.
function animationRows() {
  return SEQ_PAIRS.map((pair) => {
    const row = MODE_BY_FRONT.get(pair.front.seq);
    const hit = pair.front.events?.find(([, label]) => label === 'PostGenericAttack');
    return { name: row?.name ?? pair.name, category: CATEGORY_BY_FRONT.get(pair.front.seq), front: pair.front.seq, back: pair.back.seq, loop: pair.front.loop === true, hitTick: hit ? hit[0] : null, water: row?.water ?? false, ...(row ? { mode: row.mode } : {}) };
  });
}

//NOTE(@jimmylee)
//What a held card does with its item, baked per frame of its sequence, so a project reads numbers and needs
//none of weapons/held-items.js. `over` is `heldLayers` by frame, with SPRITE as the tile count that covers every
//frame, because JSON has no Infinity. `aims` marks a gun's frames with no tilt of their own: a stage aims those.
//A marble has no tilt: its row names where it sits per frame, which is between the hands where it takes both,
//and its size.
function holdRow(hold, { front, back }) {
  const layers = heldLayers(hold, front, back);
  const over = (entry) => entry.frames.map((shp) => Math.min(layers[shp], MAX_TILES));
  const row = { item: hold.item ?? 'marble', front: hold.front, back: hold.back, over: { front: over(front), back: over(back) } };
  if (hold.tilt === undefined) {
    const points = (entry, arm) => entry.frames.map((shp) => heldMarblePoint(hold, shp, arm, [0, 0]));
    return { ...row, radius: hold.radius, hands: { front: points(front, hold.front), back: points(back, hold.back) } };
  }
  return {
    ...row,
    tilt: front.frames.map((shp) => heldTilt(hold, shp)),
    slide: front.frames.map((shp) => heldSlide(hold, shp)),
    offset: front.frames.map((shp) => heldOffset(hold, shp, [0, 0, 0])),
    ...(hold.across ? { across: true } : {}),
    ...(hold.roll ? { roll: (hold.roll * Math.PI) / 180 } : {}),
    ...(hold.steady !== undefined ? { steady: hold.steady } : {}),
    ...(hold.thrown ? { thrown: hold.thrown } : {}),
    ...(hold.item === 'rifle' ? { aims: front.frames.map((shp) => hold.tilt[shp] === undefined) } : {}),
  };
}

//NOTE(@jimmylee)
//The stone of Dragoon Jump 3 and the marble High Jump Start catches ride grips of their own, so a row names the
//hand per frame: null where the frame holds nothing. Its frames 2-5 are the same SHP frames. These are a1.png's.
function carriedRow(seq, sheetFile, frames) {
  const hands = THROW_STONE_HANDS[sheetFile];
  const pick = (side) => pairOf(seq).front.frames.map((_, frame) => (frames.includes(frame) ? side[frame] : null));
  return { item: 'stone', depth: THROW_HOLD_DEPTH, hands: { front: pick(hands.fwd), back: pick(hands.bck) } };
}

function holdRows(sheetFile) {
  if (sheetFile !== SPRITE_SHEET_FILE) return null;
  const rows = {};
  for (const { mode, name, pair } of SEQUENCE_MODES) {
    const hold = HELD_ITEMS[mode] ?? HELD_MARBLES[mode];
    if (hold) rows[name] = holdRow(hold, pair);
  }
  rows['Dragoon Jump 3'] = carriedRow(208, sheetFile, [2, 3, 4, 5, 6]);
  rows['High Jump Start'] = carriedRow(48, sheetFile, [2, 3, 4, 5]);
  return rows;
}

export function buildSpriteData({ notice, version, sheetFile = SPRITE_SHEET_FILE }) {
  return {
    format: 'tactics-sprite-data',
    formatVersion: SPRITE_DATA_VERSION,
    version,
    notice,
    sheet: { file: sheetFile, width: SHEET_W, height: SHEET_H },
    stage: { originColumn: SHP_ORIGIN_X, stanceRow: STANCE_Y, stanceWidth: BODY_W, stanceHeight: STANDARD_CONTAINER_H, ticksPerSecond: TICKS_PER_SECOND },
    waterOffset: SHP_WATER_OFFSET,
    idleFrames: IDLE_FRAMES,
    cells: SPRITE_CELLS,
    frames: SHP_FRAMES,
    sequences: SEQ_LIBRARY.map(sequenceRow),
    animations: animationRows(),
    //NOTE(@jimmylee)
    //A grip is a pixel of one sheet's art, so another sheet gets none rather than a wrong one.
    hands: sheetFile === SPRITE_SHEET_FILE ? HAND_GRIPS : null,
    holds: holdRows(sheetFile),
    heldItemScale: HELD_ITEM_SCALE,
  };
}
