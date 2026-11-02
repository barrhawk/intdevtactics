//NOTE(@jimmylee)
//Where a sequence card's item sits, with no three.js, so the catalog can plan with it and tests can check
//it. The hand comes from the sprite: HAND_GRIPS names a pixel of the tile that draws it. The tilt is the
//item's angle in the plane of the unit's facing and world up, 0 along the facing and 90° straight up, or
//in the plane across the body for an `across` item, and it never reads the camera. TYPE1 draws no weapon, so
//what a frame does not draw is this project's own (HELD_ITEMS).
//
//An item is 1 Set unit to HELD_ITEM_SCALE world units: a Set sword comes to 60% of a unit's height.
//web/sprite-data.js bakes these tables into the kit under plain Node, so this file's imports are relative.

import { AROUND_BODY, GAME_ELEVATION, ITEM_END_ON, SPRITE_HEIGHT, SPRITE_WIDTH } from '../constants/character.js';
import { SPRITE_MAP } from '../constants/sprites/index.js';
import { HAND_GRIPS, HAND_RESTS } from '../constants/sprites/assembly.js';
import { SHP_FRAMES } from '../constants/sprites/seq-library.js';

export const HELD_ITEM_SCALE = 4.5;
const RADIANS = Math.PI / 180;

//NOTE(@jimmylee)
//`front` and `back` say which arm holds it on those patterns: the hand on the frame's first tile (the arm
//behind the body) or its last. `tilt` is degrees, one number for an item that does not turn, or per front
//SHP frame. A frame that has none lies along what the sprite draws: the line from the hand to where it rests
//on the other one (heldRest) on an item held `two`-handed, when the frame draws both, or else the forearm of
//its hand tile (a gun's aim takes over there). A spear stands upright in the ready pose, where the arm is down and holds nothing out, and
//then lies along the arms through the thrust. `slide` is how far the item runs forward through the hand on
//a frame, in Set's units: a thrust drives the shaft through the grip, out to the end of its reach.
//
//`across` turns the item in the plane across the body and world up instead of the plane of the facing,
//from the hand that grips it toward the far side of the unit. `roll` then turns it about its own length, in
//degrees. `offset` is [x, y, z] in Set's units, one for every frame or per front SHP frame: where the item's
//own origin sits from the hand, for an item that is not gripped at its origin, with +z kept on one side of the
//hand as an `across` item changes sides. `steady` names the sequence
//index whose hand the item stays on, for an item another hand plays while the sprite's arm moves.
//
//`over` says what covers what, which only a look at each scene settles: the item is drawn among the frame's
//tiles, and this is how many tiles, from the top of the stack, draw over it. It has `front` and `back`, the
//front and back SHP frames, and any SHP frame that differs by its own number. Facing the camera an item held
//out goes over the torso and under the fist that closes on it (HAND), or under the head too (FACE), so a big
//item does not cover the face. A shield goes over everything (NOTHING), because a hand grips its far side.
//Facing away, or in the arm behind the body, it goes under all of them (SPRITE), fist included, so the body
//stands between it and the camera and the hand still shows on the handle.
//
//AROUND_BODY puts the two hands and the head over a ball held in both hands, so it sits in front of the torso
//with a fist on each side of it and the head above it.
//
//`over` answers for an item that lies across the view. One pointing along the view is end-on (heldEnd), whatever
//the card says, so `over` is the same at every camera step only for the game's views.
export const SPRITE = Infinity;
const NOTHING = 0;
const HAND = 1;
const FACE = 2;
const OVER_HAND_BEHIND_BODY = { front: SPRITE, back: SPRITE };
const OVER_HELD_OUT = { front: HAND, back: SPRITE };
const SWORD_TILTS = { 84: 135, 85: 135, 86: 95, 87: 60, 88: 20, 89: -5, 90: -30, 91: -50 };
const SPEAR_TILTS = { 103: 72, 104: 72 };
const SPEAR_SLIDES = { 105: 1, 106: 2, 107: 0.5, 108: 2, 109: 0.5, 110: 1.5, 111: 2 };
const GUN_READY_TILTS = { 112: -50, 113: -50 };
const sword = { item: 'sword', front: 'first', back: 'first', tilt: SWORD_TILTS, over: OVER_HAND_BEHIND_BODY };
const spear = { item: 'spear', front: 'last', back: 'last', two: true, tilt: SPEAR_TILTS, slide: SPEAR_SLIDES, over: OVER_HELD_OUT };
const rifle = { item: 'rifle', front: 'last', back: 'last', tilt: GUN_READY_TILTS, over: OVER_HELD_OUT };
//NOTE(@jimmylee)
//An open book on top of one hand, upright, spread across the body with its pages to the reader's face and
//its cover to the camera on a front pattern. The book's middle is READ_BOOK_MIDDLE from its origin along its
//spread, so that is what sits over the hand. READ_BOOK_RISE lifts it from the hand toward its top edge, half
//its height and the rows of hand above the grip, so the bottom edge rests on the fingers and the hand shows
//under it.
const READ_BOOK_MIDDLE = 0.385;
const READ_BOOK_RISE = 1.35;
const tome = { item: 'tome', front: 'first', back: 'last', across: true, roll: 80, tilt: 0, offset: [READ_BOOK_MIDDLE, 0, -READ_BOOK_RISE], over: { front: FACE, back: SPRITE, 129: FACE + 1 } };
//NOTE(@jimmylee)
//The pavise's grip is the middle of its back, which puts a shield as tall as this past the unit once the
//hand goes high or low. So it rides lower in a raised hand and higher in a lowered one, staying in front of
//the body as a small shield does, and its face tips toward where the blow comes from.
const SHIELD_TILTS = { 130: 24, 131: 0, 132: -12 };
const SHIELD_OFFSETS = { 130: [0, -1.2, 0], 131: [0, 0, 0], 132: [0, 0.8, 0] };
const shield = (front, back) => ({ item: 'shield', front, back, tilt: SHIELD_TILTS, offset: SHIELD_OFFSETS, over: { front: NOTHING, back: SPRITE } });
//NOTE(@jimmylee)
//A recoil is a thrust stopped by a shield. The spear stays on the line it was thrust along while the shield
//pushes it back through the hand, and the ready frames hold that line instead of standing it up. `slide`
//here is what puts the tip on the shield of the card's blocker, on the stage POKE_STAGES gives each.
const spearRecoil = (tilt, slide) => ({ ...spear, tilt, slide });
//NOTE(@jimmylee)
//A thrown blade turns about its middle, in Set's units from the grip, and `turns` is how many times it goes
//over on the way, so it arrives point first. `length` is the tip's reach from the grip: the catalog plans the
//throw before any model has loaded.
export const THROWN_SWORD = { middle: 1.86, length: 4.3, turns: 2 };
export const HELD_ITEMS = {
  SW1: sword,
  SW2: sword,
  SW3: sword,
  SV1: sword,
  SV3: sword,
  WP: { ...sword, thrown: THROWN_SWORD },
  PK1: spear,
  PK2: spear,
  PK3: spear,
  TV1: spearRecoil({ 103: 67, 104: 67 }, { 105: 2, 103: 1, 104: 0.5 }),
  TV3: spearRecoil({ 103: 26, 104: 26 }, { 110: -1.1, 109: -1.5, 103: -0.5, 104: -0.5 }),
  GN1: rifle,
  GN2: rifle,
  GN3: rifle,
  RB: tome,
  RB2: tome,
  PI: { item: 'harp', front: 'last', back: 'last', tilt: 80, steady: 2, over: { front: FACE, back: SPRITE } },
  SB1: shield('first', 'first'),
  SB2: shield('first', 'last'),
  SB3: shield('last', 'last'),
  KT: { item: 'katana', front: 'last', back: 'first', two: true, across: true, tilt: {}, over: OVER_HELD_OUT },
};

//NOTE(@jimmylee)
//Item Throw holds a black marble, the orb of Throw Stone. What the arms draw picks which one. High is an
//overhand throw, one arm over the head and on out in front, so it is the small marble in that hand. Mid and Low
//end low with both hands out either side of the body, F90 and F91 from the front, F139 and F140 from the back,
//so they are the big one: on the hand while the arm comes down, then between the hands on `bothHands`.
//The ball is the same size all the way through, because a thing in the hand does not change size. Its radius
//puts the hands on its sides: any bigger and the fists sit inside its outline and the ball hides the unit.
//
//A stone that small under its own fist would not show, so a marble in one hand lies in the palm: over the arm
//behind the body and under the rest. Between two hands it sits in front of the torso with a fist on each side of
//it, facing the camera, and beyond the body facing away. `radius` is in world units.
export const MARBLE_RADIUS = { small: 2.4, big: 8 };
const OVER_PALM = { front: -1, back: -1 };
const TWO_HANDED_FRAMES = [90, 91, 139, 140];
const OVER_TWO_HANDS = { ...OVER_PALM, 90: AROUND_BODY, 91: AROUND_BODY, 139: SPRITE, 140: SPRITE };
const smallMarble = { front: 'first', back: 'first', radius: MARBLE_RADIUS.small, over: OVER_PALM };
const bigMarble = { front: 'first', back: 'first', radius: MARBLE_RADIUS.big, bothHands: TWO_HANDED_FRAMES, over: OVER_TWO_HANDS };
export const HELD_MARBLES = {
  IT1: smallMarble,
  IH1: smallMarble,
  IR1: smallMarble,
  IT2: bigMarble,
  IH2: bigMarble,
  IR2: bigMarble,
  IT3: bigMarble,
  IH3: bigMarble,
  IR3: bigMarble,
};

//NOTE(@jimmylee)
//The generated bow, on the Bow cards' two faces: a fist on its grip, and the stave held out.
export const BOW_LAYER = OVER_HELD_OUT;

//NOTE(@jimmylee)
//Which way an item is end-on, from `toward`, the dot product of its +x and the direction to the camera. 1 points
//at the camera, so every tile is under the item. -1 points away, so every tile is over it. 0 lies across the
//view, so the card's `over` says.
export const heldEnd = (toward) => (toward > ITEM_END_ON ? 1 : toward < -ITEM_END_ON ? -1 : 0);

//NOTE(@jimmylee)
//`ch.itemLayer` for a card's front and back sequence: `over` by SHP frame, for the group that draws the tiles.
export function heldLayers({ over }, front, back) {
  const layers = {};
  for (const shp of front.frames) layers[shp] = over[shp] ?? over.front;
  for (const shp of back.frames) layers[shp] = over[shp] ?? over.back;
  return layers;
}

function handTile(shp, arm) {
  const tiles = SHP_FRAMES[shp];
  return tiles[arm === 'first' ? 0 : tiles.length - 1];
}

//NOTE(@jimmylee)
//The hand on SHP frame `shp`, [u, v] in unit pixels from the stance point, written to `out`.
export function heldHand(shp, arm, out) {
  const [id, u, v, reverseX] = handTile(shp, arm);
  const [x, y] = HAND_GRIPS[id];
  const cell = SPRITE_MAP[id];
  out[0] = u - cell.w / 2 + (reverseX ? cell.w - 1 - x : x) + 0.5;
  out[1] = v - cell.h / 2 + y + 0.5;
  return out;
}

//NOTE(@jimmylee)
//Where a marble sits on SHP frame `shp`, written to `out` as heldHand does: the hand of `arm`, or halfway between
//the hands on a frame that holds it in both.
const _otherHand = [0, 0];
export function heldMarblePoint({ bothHands }, shp, arm, out) {
  heldHand(shp, arm, out);
  if (!bothHands?.includes(shp)) return out;
  heldHand(shp, arm === 'first' ? 'last' : 'first', _otherHand);
  out[0] = (out[0] + _otherHand[0]) / 2;
  out[1] = (out[1] + _otherHand[1]) / 2;
  return out;
}

//NOTE(@jimmylee)
//Where a blade rests on the frame's other hand, written to `out` as heldHand does: the top of the fist where
//HAND_RESTS has it, or else its grip.
export function heldRest(shp, arm, out) {
  const [id, u, v, reverseX] = handTile(shp, arm);
  const [x, y] = HAND_RESTS[id] ?? HAND_GRIPS[id];
  const cell = SPRITE_MAP[id];
  out[0] = u - cell.w / 2 + (reverseX ? cell.w - 1 - x : x) + 0.5;
  out[1] = v - cell.h / 2 + y + 0.5;
  return out;
}

//NOTE(@jimmylee)
//How far the item has run through the hand on front SHP frame `shp`, in world units.
export const heldSlide = ({ slide }, shp) => (slide?.[shp] ?? 0) * HELD_ITEM_SCALE;

//NOTE(@jimmylee)
//Where the item's origin sits from the hand on front SHP frame `shp`, [x, y, z] along its own axes in world
//units, written to `out`.
const NO_OFFSET = [0, 0, 0];
export function heldOffset({ offset }, shp, out) {
  const from = (Array.isArray(offset) ? offset : offset?.[shp]) ?? NO_OFFSET;
  out[0] = from[0] * HELD_ITEM_SCALE;
  out[1] = from[1] * HELD_ITEM_SCALE;
  out[2] = from[2] * HELD_ITEM_SCALE;
  return out;
}

//NOTE(@jimmylee)
//A front frame is drawn for a unit 45° off the camera at the game's elevation, so a level line along the
//facing draws below level. This is the tilt whose line draws `along` forward and `up` upward on that
//view, read off the art: a forearm the sprite draws dipping 20° is a level arm.
const FACING_ACROSS_SCREEN = Math.SQRT1_2;
function drawnTilt(along, up) {
  const forward = along / FACING_ACROSS_SCREEN;
  return Math.atan2((up + along * Math.sin(GAME_ELEVATION)) / Math.cos(GAME_ELEVATION), forward);
}

//NOTE(@jimmylee)
//The same for a line across the body: that axis draws just as far across the screen, with the far side going
//up it. A level line across the body draws rising to the far side.
const PX_ACROSS = SPRITE_WIDTH / 32;
const PX_UP = SPRITE_HEIGHT / 40;
function drawnTiltAcross(along, up) {
  const screenAlong = along * PX_ACROSS;
  return Math.atan2((up * PX_UP - screenAlong * Math.sin(GAME_ELEVATION)) / Math.cos(GAME_ELEVATION), screenAlong / FACING_ACROSS_SCREEN);
}

const _hand = [0, 0];
const _other = [0, 0];

//NOTE(@jimmylee)
//The item's tilt in radians on front SHP frame `shp`.
export function heldTilt(hold, shp) {
  const { front, tilt, two, across } = hold;
  if (typeof tilt === 'number') return tilt * RADIANS;
  if (tilt[shp] !== undefined) return tilt[shp] * RADIANS;
  const other = front === 'first' ? 'last' : 'first';
  if (two && HAND_GRIPS[handTile(shp, other)[0]]) {
    heldHand(shp, front, _hand);
    heldRest(shp, other, _other);
    return (across ? drawnTiltAcross : drawnTilt)(_hand[0] - _other[0], _hand[1] - _other[1]);
  }
  const degrees = HAND_GRIPS[handTile(shp, front)[0]][2] * RADIANS;
  return drawnTilt(Math.cos(degrees), Math.sin(degrees));
}
