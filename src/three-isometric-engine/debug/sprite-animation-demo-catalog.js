//NOTE(jimmylee)
//Catalog for the main route ThreeJS demos: one entry per demo (mode, SEQ, timing). No three.js import,
//so the page can render the cards before the 3D stage (debug/sprite-animation-demos.js) is loaded on
//demand.

import { cubeSize, sphereRadius } from '@engine/constants';
import { MARBLE_DEFAULTS } from '@engine/constants/meshData';
import { CHAR_HALF_Z, GAME_ELEVATION, SPRITE_HEIGHT, SPRITE_WIDTH } from '@engine/constants/character';
import { MARBLE_MASS, defaultGravity, despawnFadeMs, playerFallExtraAccel, playerJumpHeight, playerJumpRiseMs, spawnFadeMs } from '@engine/constants/physics';
import { JUMP_AIR_FRAME, JUMP_LAND_FRAME, JUMP_LIFT_HEIGHT, JUMP_TAKEOFF_S, JUMP_TOUCHDOWN_S, PUNCH_HIT_TICKS, QT_PICKUP_TICKS, QT_RELEASE_TICKS, STAB_HIT_FRAME, THROW_LAUNCH_FORWARD, THROW_LAUNCH_UP, THROW_LAUNCH_VH, THROW_LAUNCH_VV, THROW_RANGE, THROW_STONE_RELEASE_S, THROW_STONE_SPAWN_FRAME, THROW_STONE_RELEASE_FRAME } from '@engine/actions/action-timelines';
import { GUARD_ASSEMBLY, FLOAT_ASSEMBLY, FLOAT_DELAYS, JUMP_ASSEMBLY, JUMP_DELAYS, JUMP_TICKS, THROW_STONE_ASSEMBLY, THROW_STONE_TICKS_FWD, WALK_ASSEMBLY, WALK_DELAYS, CAST_ASSEMBLY, QUICK_THROW_ASSEMBLY, QUICK_THROW_DELAYS, HURT_ASSEMBLY, HURT_SHIVER_DELAYS, KNEEL_ASSEMBLY, DEATH_ASSEMBLY, PUNCH_ASSEMBLY, PUNCH_DELAYS, PUNCH_LV2_ASSEMBLY, PUNCH_LV2_DELAYS, PUNCH_LV3_ASSEMBLY, PUNCH_LV3_DELAYS, STAB_ASSEMBLY, STAB_DELAYS, STAB_LV2_ASSEMBLY, STAB_LV2_DELAYS, STAB_LV3_ASSEMBLY, STAB_LV3_DELAYS, FATAL_ITEM_IMPACT_ASSEMBLY, FATAL_ITEM_IMPACT_TIMELINE, ITEM_DROP_ASSEMBLY, ITEM_DROP_DELAYS } from '@engine/constants/sprites/assembly';
import { SEQ_LIBRARY, SEQUENCE_MODES, pairOf } from '@engine/constants/sprites/seq-library';
import { BOW_SPEC, simulateShot } from '@engine/weapons/bow';
import { collide, solveArc } from '@engine/weapons/ballistics';
import { HELD_ITEMS, HELD_ITEM_SCALE, HELD_MARBLES, MARBLE_RADIUS, heldHand, heldMarblePoint, heldTilt } from '@engine/weapons/held-items';

const sum = (values) => values.reduce((a, b) => a + b, 0);
const msToTicks = (delays) => delays.map((ms) => (ms * 60) / 1000);
const ticksToMs = (ticks) => (ticks * 1000) / 60;
const STONE_STRIP_TAIL_TICKS = 4;
const seqEvent = (tick, label) => ({ tick, label, source: 'seq' });
const engineEvent = (tick, label) => ({ tick, label, source: 'engine' });

//NOTE(@jimmylee)
//One SEQ_LIBRARY sequence as a card timeline. A held frame (delay 0) still gets a slot on the strip.
const HELD_FRAME_TICKS = 30;
function sequenceTimeline(entry) {
  return { ticks: entry.ticks.map((t) => t || HELD_FRAME_TICKS), events: (entry.events ?? []).map(([tick, label]) => seqEvent(tick, label)) };
}

//NOTE(@jimmylee)
//The damage counter a hit shows (debug/damage-counter.js). The main route has no stats, so every hit is
//DAMAGE_COUNTER. The anchor is the number's center above the stance, in art pixels, low enough that its
//hop stays inside the sprite extent the view is fitted to. Each digit starts COUNTER_STAGGER_TICKS after
//the one before it, makes the COUNTER_HOPS and rests until COUNTER_TICKS.
export const DAMAGE_COUNTER = 10;
export const COUNTER_TICKS = 48;
export const COUNTER_ANCHOR_PX = 9;
export const COUNTER_HOPS = [
  { ticks: 12, px: 6 },
  { ticks: 8, px: 2 },
];
const COUNTER_STAGGER_TICKS = 4;

//NOTE(@jimmylee)
//Art pixels digit `digit` stands above its rest `ticks` after the hit, whole, or -1 before it appears.
export function counterHop(ticks, digit) {
  let t = ticks - digit * COUNTER_STAGGER_TICKS;
  if (t < 0) return -1;
  for (const hop of COUNTER_HOPS) {
    if (t < hop.ticks) {
      const s = t / hop.ticks;
      return Math.floor(4 * hop.px * s * (1 - s));
    }
    t -= hop.ticks;
  }
  return 0;
}

//NOTE(@jimmylee)
//Leap cards: the game chains these sequences while the unit is in the air, so no one of them shows the
//jump. `takeoff` plays on the ground, `air` holds its pose over `riseTicks` + `holdTicks` + `fallTicks`
//and `land` plays from the touchdown: Jump 2, Mid Jump, High Jump Land, as Mode J joins them, and
//High Jump Start, High Jump Hold, High Jump Land, the Jump ability's chain. A 16 + 0 + 16 arc is
//jumpLift over JUMP_AIR_TICKS. The game's High Jump leaves the screen; here it stays in the view, at the
//same 2 cubes as Mode J.
const LAND_PAIR = pairOf(52);
function leap(takeoff, air, riseTicks, holdTicks, fallTicks) {
  const def = { takeoff: pairOf(takeoff), air: pairOf(air), land: LAND_PAIR, riseTicks, holdTicks, fallTicks };
  def.takeoffTicks = sum(def.takeoff.front.ticks);
  def.airTicks = riseTicks + holdTicks + fallTicks;
  def.landTicks = sum(LAND_PAIR.front.ticks);
  return def;
}

//NOTE(@jimmylee)
//Height of a leap `ticks` into its air phase: constant deceleration to the top, the hold, constant
//acceleration back down.
export function leapHeight({ riseTicks, holdTicks, fallTicks }, ticks) {
  if (ticks <= 0) return 0;
  if (ticks < riseTicks) {
    const left = 1 - ticks / riseTicks;
    return JUMP_LIFT_HEIGHT * (1 - left * left);
  }
  if (ticks < riseTicks + holdTicks) return JUMP_LIFT_HEIGHT;
  const fallen = (ticks - riseTicks - holdTicks) / fallTicks;
  return fallen >= 1 ? 0 : JUMP_LIFT_HEIGHT * (1 - fallen * fallen);
}

function leapStage(def) {
  const touchdown = def.takeoffTicks + def.airTicks;
  return { kind: 'leap', leap: def, timeline: { ticks: [...def.takeoff.front.ticks.filter(Boolean), def.airTicks, ...def.land.front.ticks], events: [engineEvent(def.takeoffTicks, 'leaves the ground'), engineEvent(touchdown, 'touchdown')] } };
}

//NOTE(@jimmylee)
//Jump Down: the unit steps off a ledge. SEQ 46/47 draw F11/F16 and the crouch on the ledge, the Mid
//Jump pose for the 22 ticks in the air and the crouch again on the floor. JUMP_DOWN_HOP is the bow of
//the arc above the straight line down: enough that the unit clears the ledge's edge halfway across.
//The SEQ has no travel, which the game's movement code supplies, so the unit crosses one cube.
export const JUMP_DOWN_LEDGE = cubeSize * 2;
export const JUMP_DOWN_TRAVEL = cubeSize;
const JUMP_DOWN_HOP = JUMP_DOWN_LEDGE * 0.56;
const JUMP_DOWN_AIR_FRAME = 2;
const JUMP_DOWN_LAND_FRAME = 7;

function jumpDownStage() {
  const ticks = pairOf(46).front.ticks;
  const leaveTicks = sum(ticks.slice(0, JUMP_DOWN_AIR_FRAME));
  const landTicks = sum(ticks.slice(0, JUMP_DOWN_LAND_FRAME));
  return { kind: 'jump-down', leaveTicks, landTicks, timeline: { ticks, events: [engineEvent(leaveTicks, 'leaves the ledge'), engineEvent(landTicks, 'touchdown')] } };
}

//NOTE(@jimmylee)
//Height above the floor `s` (0..1) through the jump down: one constant-gravity arc.
export function jumpDownHeight(s) {
  return JUMP_DOWN_LEDGE * (1 - s) + 4 * JUMP_DOWN_HOP * s * (1 - s);
}

//NOTE(@jimmylee)
//Teleport: SEQ 94/95 play once at each end of the hop, while the engine's Bayer dither (the spawn and
//despawn fades) takes the unit away and brings it back on another tile.
//The strip is one hop: fade out, TELEPORT_GAP_TICKS with nothing drawn, fade in.
export const TELEPORT_GAP_TICKS = 6;
export const TELEPORT_OFFSET = cubeSize * 0.75;

function teleportStage() {
  const ticks = pairOf(94).front.ticks;
  const outTicks = (despawnFadeMs * 60) / 1000;
  const inTicks = (spawnFadeMs * 60) / 1000;
  const held = (fadeTicks) => [...ticks, fadeTicks - sum(ticks)];
  return { kind: 'teleport', outTicks, inTicks, timeline: { ticks: [...held(outTicks), TELEPORT_GAP_TICKS, ...held(inTicks)], events: [engineEvent(0, 'Bayer fade out'), engineEvent(outTicks + TELEPORT_GAP_TICKS, 'Bayer fade in, on the next tile')] } };
}

//NOTE(@jimmylee)
//The Cloth Bag cards: how high the bag lands on its target above the stance point, head, chest or knee,
//and the tick the swing snaps it there, where the arm starts down after the wind-up. The target stands where
//the cord reaches on the SEQ's PostGenericAttack, with the arm still on its way down.
const CLOTH_BAG_GAP = cubeSize * 0.625;
const CLOTH_BAG_CARDS = { CB1: { strikeUp: 12, snapTick: 14 }, CB2: { strikeUp: 4, snapTick: 14 }, CB3: { strikeUp: -8, snapTick: 14 } };

//NOTE(@jimmylee)
//Poke: High and Low are how far above or below the attacker the target stands, as they are for Bow and Gun.
//Both arms of the High thrust point steeply up, so the target stands where that line ends: half a cube up,
//with the tip reaching its face at full reach, on the SEQ's PostGenericAttack. The Low one is the attacker's
//own height over a target below it, the tip at its knees. Half a cube keeps a ledge above the water at every
//elevation. The target stands `ledgeBack` from the middle of its ledge, toward the attacker, because the tip
//reaches less far than a sprite and half a cube: the ledge would stand in the attacker's feet otherwise. A
//Thrust Recoil is the same stage with the thrust stopped: its `blocker` holds that Shield Block up to the
//spear, and the attacker starts from the contact.
const POKE_LEDGE = cubeSize / 2;
const POKE_HIGH = { targetFloor: POKE_LEDGE, gap: cubeSize * 0.6875, ledgeBack: cubeSize * 0.25 };
const POKE_LOW = { archerFloor: POKE_LEDGE, gap: cubeSize * 0.9 };
const POKE_STAGES = { PK1: POKE_HIGH, PK3: POKE_LOW, TV1: POKE_HIGH, TV3: POKE_LOW };
const recoilStage = (blocker) => ({ kind: 'recoil', blocker });

//NOTE(@jimmylee)
//The card of a SEQUENCE_MODES row. An attack is a strike station whose target flinches on the SEQ's
//PostGenericAttack (no engine behavior acts on these modes, so the strip has no engine event); any
//other sequence loops or plays once, as its SEQ does, unless SEQUENCE_STAGES stages it. `pair` is read
//for the live frame readout.
function sequenceDemo({ mode, name, title, seq, pair, loop, hitTick, water }) {
  const card = { id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), kind: loop ? 'loop' : 'reaction', mode, title, seq, pair, water, held: HELD_ITEMS[mode], marble: HELD_MARBLES[mode], bag: CLOTH_BAG_CARDS[mode], gap: CLOTH_BAG_CARDS[mode] ? CLOTH_BAG_GAP : undefined, ...POKE_STAGES[mode], waterRows: FLOATING_SEQUENCES.includes(mode) ? FLOAT_WATER_ROWS : undefined, delays: pair.front.ticks.map(ticksToMs), timeline: sequenceTimeline(pair.front) };
  if (SEQUENCE_STAGES[mode]) return { ...card, ...SEQUENCE_STAGES[mode] };
  return hitTick === null ? card : { ...card, kind: 'strike', hitMs: ticksToMs(hitTick) };
}

//NOTE(@jimmylee)
//Bow: High, Mid and Low are how far above or below the archer the target stands, so the target stands
//BOW_RANGE away and BOW_LEDGE above the archer, level with it, or BOW_LEDGE below it. Bow has no
//PostGenericAttack because the arrow lands the hit: the hand opens on the SEQ's PlaySound (tick 26),
//the first tick of the held aim frame. The bow is a simulated weapon (weapons/bow.js), so everything
//after that tick is the shot's own: BOW_SHOT is the string driving the arrow off the nock, and
//bowPlan the low arc that speed needs to reach the target, from a release point that does not depend
//on the camera. The arrow nocks on BOW_NOCK_TICKS, the first aim frame's start, and is at full draw
//by BOW_ANCHOR_TICKS.
export const BOW_RANGE = cubeSize * 2.5;
export const BOW_LEDGE = cubeSize * 1.5;
export const BOW_NOCK_TICKS = 12;
export const BOW_ANCHOR_TICKS = 20;
export const BOW_SHOT_TICKS = 26;
export const BOW_SHOT = simulateShot(BOW_SPEC, { nockTick: BOW_NOCK_TICKS, anchorTick: BOW_ANCHOR_TICKS, shotTick: BOW_SHOT_TICKS });
const PX_X = SPRITE_WIDTH / 32;
const PX_Y = SPRITE_HEIGHT / 40;
const LAUNCH_PASSES = 4;

//NOTE(@jimmylee)
//One Bow card's shot, along the unit's facing and up from its stance: where the grip is on the shot
//tick (`gripForward`, `gripUp`, read from the unmirrored front pattern the way THROW_LAUNCH_FORWARD
//reads the throwing hand), where the arrow's tip is when it leaves the string (`launchForward`,
//`launchUp`), the launch (`vh`, `vv`), the point it hits (`hitForward`, `hitUp`) and when. The launch
//tilts the arrow, which moves the tip, so a few passes settle it.
function bowPlan(assembly, delays, archerFloor, targetFloor) {
  const ticks = msToTicks(delays).map(Math.round);
  let frameIdx = 0;
  for (let end = ticks[0]; end <= BOW_SHOT_TICKS; end += ticks[frameIdx]) frameIdx++;
  const frame = assembly[1].frames[frameIdx];
  const gripForward = (Math.abs(frame.bowHand[0]) + frame.move.fb) * PX_X;
  const gripUp = -frame.bowHand[1] * PX_Y;
  const hitForward = BOW_RANGE - CHAR_HALF_Z;
  const hitUp = targetFloor - archerFloor;
  const ahead = BOW_SHOT.leavesAt + BOW_SPEC.arrowLength;
  const plan = { gripForward, gripUp, hitForward, hitUp };
  let angle = Math.atan2(hitUp - gripUp, hitForward - gripForward);
  for (let pass = 0; pass < LAUNCH_PASSES; pass++) {
    plan.launchForward = gripForward + Math.cos(angle) * ahead;
    plan.launchUp = gripUp + Math.sin(angle) * ahead;
    Object.assign(plan, solveArc(hitForward - plan.launchForward, hitUp - plan.launchUp, BOW_SHOT.speed));
    angle = Math.atan2(plan.vv, plan.vh);
  }
  plan.angle = angle;
  plan.leavesTick = BOW_SHOT_TICKS + BOW_SHOT.strokeS * 60;
  plan.hitTick = plan.leavesTick + plan.flightS * 60;
  return plan;
}

function bowCard(assembly, delays, aim) {
  const archerFloor = aim === 'low' ? BOW_LEDGE : 0;
  const targetFloor = aim === 'high' ? BOW_LEDGE : 0;
  const plan = bowPlan(assembly, delays, archerFloor, targetFloor);
  return { kind: 'bow', aim, assembly, delays, archerFloor, targetFloor, plan, timeline: { ticks: msToTicks(delays), events: [seqEvent(BOW_SHOT_TICKS, 'PlaySound'), engineEvent(PUNCH_HIT_TICKS, 'game punch hit check'), engineEvent(BOW_NOCK_TICKS, 'arrow nocked'), engineEvent(BOW_ANCHOR_TICKS, 'full draw'), engineEvent(plan.leavesTick, 'arrow leaves the string'), engineEvent(plan.hitTick, 'arrow lands')] } };
}

//NOTE(@jimmylee)
//Gun: High, Mid and Low are the same three heights as Bow, with the rifle Set lends. A light streak leaves
//the muzzle and lands on the SEQ's PostGenericAttack, where the target is hit. `plan.angle` is the aim from
//the hand on the shot frame to the target, for the framing: the stage aims the barrel itself each frame.
const GUN_AIMS = { GN1: ['high', 0, BOW_LEDGE], GN2: ['mid', 0, 0], GN3: ['low', BOW_LEDGE, 0] };

function gunStage(seq, mode) {
  const { front } = pairOf(seq);
  const hitTick = front.events.find(([, label]) => label === 'PostGenericAttack')[0];
  let frameIdx = 0;
  for (let end = front.ticks[0]; end <= hitTick; end += front.ticks[frameIdx]) frameIdx++;
  const [aim, archerFloor, targetFloor] = GUN_AIMS[mode];
  const [u, v] = heldHand(front.frames[frameIdx], HELD_ITEMS[mode].front, [0, 0]);
  const gripForward = (-u + (front.fb?.[frameIdx] ?? 0)) * PX_X;
  const gripUp = -v * PX_Y;
  const angle = Math.atan2(targetFloor - archerFloor - gripUp, BOW_RANGE - CHAR_HALF_Z - gripForward);
  return { kind: 'gun', aim, archerFloor, targetFloor, hitMs: ticksToMs(hitTick), plan: { angle, hitTick }, timeline: { ticks: front.ticks, events: [seqEvent(hitTick, 'PostGenericAttack'), engineEvent(hitTick, 'shot hits the target')] } };
}

//NOTE(@jimmylee)
//Weapon Throw: the SEQ draws the arm and says nothing of where the sword goes, because the game's effect code
//flies it. It leaves the hand of `frame`, on `tick`, on a low arc to a target two cubes off: its middle is what
//flies, on a line that needs no camera, and it turns about that middle, over and over, so its point meets the
//target first, inside the sequence. The point arrives along the flight, which moves it, so a few passes settle
//the arc.
const WEAPON_THROW_GAP = cubeSize * 2;
const WEAPON_THROW_SPEED = 150;
const WEAPON_THROW_HELD_FRAME = 4;
const WEAPON_THROW_TARGET_UP = 4;
const THROWN_STRIP_TAIL_TICKS = 4;

function thrownStage(seq, mode, frame, tick) {
  const { front } = pairOf(seq);
  const held = HELD_ITEMS[mode];
  const shp = front.frames[frame];
  const [u, v] = heldHand(shp, held.front, [0, 0]);
  const tilt = heldTilt(held, shp);
  const middle = held.thrown.middle * HELD_ITEM_SCALE;
  const point = (held.thrown.length - held.thrown.middle) * HELD_ITEM_SCALE;
  const launchForward = (-u + (front.fb?.[frame] ?? 0)) * PX_X + Math.cos(tilt) * middle;
  const launchUp = -v * PX_Y + Math.sin(tilt) * middle;
  const plan = { releaseS: tick / 60, releaseTick: tick, tilt, launchForward, launchUp, arrive: 0 };
  for (let pass = 0; pass < LAUNCH_PASSES; pass++) {
    Object.assign(plan, solveArc(WEAPON_THROW_GAP - CHAR_HALF_Z - Math.cos(plan.arrive) * point - launchForward, WEAPON_THROW_TARGET_UP - Math.sin(plan.arrive) * point - launchUp, WEAPON_THROW_SPEED));
    plan.arrive = Math.atan2(plan.vv + defaultGravity * plan.flightS, plan.vh);
  }
  const hitTick = tick + plan.flightS * 60;
  plan.hitTick = hitTick;
  const seqTicks = sum(front.ticks);
  const events = [...(front.events ?? []).map(([at, label]) => seqEvent(at, label)), engineEvent(tick, `${held.item} leaves the hand`), engineEvent(hitTick, `${held.item} hits the target`)];
  return { kind: 'weapon-throw', gap: WEAPON_THROW_GAP, hitMs: ticksToMs(hitTick), plan, timeline: { ticks: hitTick < seqTicks ? front.ticks : [...front.ticks, hitTick - seqTicks + THROWN_STRIP_TAIL_TICKS], events } };
}

function weaponThrowStage() {
  return thrownStage(126, 'WP', WEAPON_THROW_HELD_FRAME, sum(pairOf(126).front.ticks.slice(0, WEAPON_THROW_HELD_FRAME + 1)));
}

//NOTE(@jimmylee)
//The two Throw Stone cards are one throw with two stones. A throw is an arm of THROW_ARM_MASS
//swinging with one energy, so what leaves the hand is set by what the hand holds, `throwSpeed`:
//calibrated so the engine's marble leaves at the engine's speed, and a stone the size of the hand,
//of the same rock, leaves about two and a half times faster on a flat, accurate arc. The heavy stone
//keeps the engine's 45° lob and radius; the target stands where that lob comes back to the height it
//left from. `targetMass` is every character's meshData mass, so the same collision (`collide`) barely
//moves the target for one and knocks it back for the other. All of it is read from these numbers.
export const THROW_ARM_MASS = 0.65;
const THROW_ENGINE_SPEED = Math.hypot(THROW_LAUNCH_VH, THROW_LAUNCH_VV);
const THROW_ARM_ENERGY = ((THROW_ARM_MASS + MARBLE_MASS) * THROW_ENGINE_SPEED * THROW_ENGINE_SPEED) / 2;
export const STONE_TARGET_MASS = 3;
export const STONE_RESTITUTION = MARBLE_DEFAULTS.restitution;
export const STONE_ROLL_DECEL = 45;
export const STONE_BOUNCE_MIN = 18;
export const TARGET_SLIDE_DECEL = 45;
export const STONE_RADIUS_SMALL = MARBLE_RADIUS.small;
export const STONE_RADIUS_HEAVY = sphereRadius;

function stoneMass(radius) {
  return (MARBLE_MASS * radius * radius * radius) / (STONE_RADIUS_HEAVY * STONE_RADIUS_HEAVY * STONE_RADIUS_HEAVY);
}

export function throwSpeed(mass) {
  return Math.sqrt((2 * THROW_ARM_ENERGY) / (THROW_ARM_MASS + mass));
}

//NOTE(@jimmylee)
//Item Throw Release: the marble leaves the hand or hands of the sequence's first frame on the SEQ's PlaySound,
//tick 0, so the strip runs on to the hit. The target stands two cubes off, and High, Mid and Low are where it
//stands, as they are for Bow and Gun: half a cube above the thrower, level with it, or half a cube below it.
//One arm throws, so the marble's mass sets its speed and its low arc (`throwSpeed`), and the same collision as
//Throw Stone's sends the marble off and slides the target. A low arc up to a ledge is still rising when it gets
//there, and the body it hits takes that from it, so it drops (`stoneRise`). A marble is a sphere, so it needs no
//passes.
function marbleThrowStage(seq, mode, { targetFloor = 0, archerFloor = 0 } = {}) {
  const { front } = pairOf(seq);
  const hold = HELD_MARBLES[mode];
  const [u, v] = heldMarblePoint(hold, front.frames[0], hold.front, [0, 0]);
  const launchForward = (-u + (front.fb?.[0] ?? 0)) * PX_X;
  const launchUp = -v * PX_Y;
  const contact = WEAPON_THROW_GAP - CHAR_HALF_Z - hold.radius;
  const mass = stoneMass(hold.radius);
  const { vh, vv, flightS } = solveArc(contact - launchForward, targetFloor - archerFloor + WEAPON_THROW_TARGET_UP - launchUp, throwSpeed(mass));
  const { after, struck } = collide(mass, vh, STONE_TARGET_MASS, STONE_RESTITUTION);
  const hitTick = flightS * 60;
  const plan = { releaseS: 0, releaseTick: 0, launchForward, launchUp, vh, vv, flightS, hitTick, stoneAfter: after, stoneRise: Math.min(0, vv + defaultGravity * flightS), targetKick: struck };
  const events = [...front.events.map(([at, label]) => seqEvent(at, label)), engineEvent(0, 'marble leaves the hand'), engineEvent(hitTick, 'marble hits the target')];
  return { kind: 'item-throw', gap: WEAPON_THROW_GAP, targetFloor, archerFloor, hitMs: ticksToMs(hitTick), plan, timeline: { ticks: [...front.ticks, Math.max(0, hitTick - sum(front.ticks)) + THROWN_STRIP_TAIL_TICKS], events } };
}

//NOTE(@jimmylee)
//The rows whose sequence only reads in a scene: the game plays them while something else moves the unit, so
//their card stages that instead of holding a pose on the spot.
const SEQUENCE_STAGES = {
  MJ: leapStage(leap(204, 42, 16, 0, 16)),
  HH: leapStage(leap(48, 50, 14, 60, 14)),
  HL: leapStage(leap(48, 50, 16, 6, 10)),
  JD: jumpDownStage(),
  TP: teleportStage(),
  GN1: gunStage(134, 'GN1'),
  GN2: gunStage(136, 'GN2'),
  GN3: gunStage(138, 'GN3'),
  IR1: marbleThrowStage(112, 'IR1', { targetFloor: POKE_LEDGE }),
  IR2: marbleThrowStage(118, 'IR2'),
  IR3: marbleThrowStage(124, 'IR3', { archerFloor: POKE_LEDGE }),
  WP: weaponThrowStage(),
  TV1: recoilStage('SB1'),
  TV3: recoilStage('SB2'),
};

function stoneVariant(name, radius, launchOf) {
  const mass = stoneMass(radius);
  const targetForward = launchOf.targetForward(radius);
  const contact = targetForward - CHAR_HALF_Z - radius;
  const { vh, vv, hitS } = launchOf.arc(contact - THROW_LAUNCH_FORWARD, mass);
  const impact = collide(mass, vh, STONE_TARGET_MASS, STONE_RESTITUTION);
  const hitTick = THROW_STONE_RELEASE_S * 60 + hitS * 60;
  return { name, radius, mass, targetForward, vh, vv, hitS, hitTick, stoneAfter: impact.after, targetKick: impact.struck };
}

export const STONE_VARIANTS = {
  small: stoneVariant('small', STONE_RADIUS_SMALL, {
    targetForward: () => cubeSize * 2.5,
    arc(dx, mass) {
      const { vh, vv, flightS } = solveArc(dx, -THROW_LAUNCH_UP, throwSpeed(mass));
      return { vh, vv, hitS: flightS };
    },
  }),
  heavy: stoneVariant('heavy', STONE_RADIUS_HEAVY, {
    targetForward: (radius) => THROW_LAUNCH_FORWARD + THROW_RANGE + CHAR_HALF_Z + radius,
    arc: (dx) => ({ vh: THROW_LAUNCH_VH, vv: THROW_LAUNCH_VV, hitS: dx / THROW_LAUNCH_VH }),
  }),
};

function stoneCard(id, title, stone) {
  const seqTicks = sum(THROW_STONE_TICKS_FWD);
  const release = sum(THROW_STONE_TICKS_FWD.slice(0, THROW_STONE_RELEASE_FRAME));
  const label = stone.name === 'heavy' ? 'stone hits the target and knocks it back' : 'stone hits the target';
  return {
    id,
    kind: 'throw',
    mode: 'TS',
    title,
    seq: 'SEQ 208/209 · Dragoon Jump 3',
    assembly: THROW_STONE_ASSEMBLY,
    stone,
    timeline: {
      ticks: [...THROW_STONE_TICKS_FWD, stone.hitTick - seqTicks + STONE_STRIP_TAIL_TICKS],
      events: [seqEvent(release, 'PlaySound'), seqEvent(sum(THROW_STONE_TICKS_FWD.slice(0, THROW_STONE_RELEASE_FRAME + 2)), 'PostGenericAttack'), engineEvent(sum(THROW_STONE_TICKS_FWD.slice(0, THROW_STONE_SPAWN_FRAME)), 'stone picked up'), engineEvent(release, 'stone released'), engineEvent(stone.hitTick, label)],
    },
  };
}

//NOTE(@jimmylee)
//A1 jump, without the apex hang: scripted rise over playerJumpRiseMs, then gravity +
//playerFallExtraAccel back to the take-off height. Ticks from the jump's start.
export const PLAYER_RISE_TICKS = (playerJumpRiseMs * 60) / 1000;
export const PLAYER_FALL_ACCEL = Math.abs(defaultGravity) + playerFallExtraAccel;
export const PLAYER_AIR_TICKS = PLAYER_RISE_TICKS + Math.sqrt((2 * playerJumpHeight) / PLAYER_FALL_ACCEL) * 60;
const PLAYER_JUMP_TICKS = [JUMP_TICKS[JUMP_AIR_FRAME - 2], JUMP_TICKS[JUMP_AIR_FRAME - 1], PLAYER_AIR_TICKS - JUMP_TICKS[JUMP_AIR_FRAME - 2] - JUMP_TICKS[JUMP_AIR_FRAME - 1], ...JUMP_TICKS.slice(JUMP_LAND_FRAME)];

//NOTE(jimmylee)
//Camera elevations: the game's lowest and highest orbit (OrbitControls polar 0.5 .. PI / 2.25) and
//its initial view (CAMERA_INITIAL_* = 0.5, 0.3, -0.5 → ~23°).
export const ELEVATIONS = {
  low: Math.PI / 2 - Math.PI / 2.25,
  game: GAME_ELEVATION,
  high: Math.PI / 2 - 0.5,
};

//NOTE(@jimmylee)
//Cards that do not stand in the water (`waterRows`, art pixels below the stance point, against the
//idle water line). A floating unit hovers over the surface, which passes 1px under its stance bottom,
//so a crest only reaches its soles, and it keeps its dry frames: F252/F253 stop at the waist. A dead
//unit lies in the shallows: F23/F24 reach row 28, and the surface takes the last rows of them, as their
//water frames do.
export const FLOAT_WATER_ROWS = 21;
const FLOATING_SEQUENCES = ['FF', 'FS'];
const DEAD_WATER_ROWS = 18;

//NOTE(jimmylee)
//Layer tints for the SHP back-to-front slots (renderOrder FAR_BEHIND < BEHIND < body < head/over <
//IN_FRONT < FACE).
export const LAYER_TINTS = [
  { role: 'farBehind', label: 'far behind', color: 0x5aa0ff },
  { role: 'behind', label: 'behind', color: 0x3fe0d0 },
  { role: 'body', label: 'body', color: 0xcccccc },
  { role: 'head', label: 'head / over', color: 0xffd84d },
  { role: 'front', label: 'front', color: 0xff6ad5 },
  { role: 'face', label: 'face', color: 0x7dff7a },
];

//NOTE(@jimmylee)
//How the Physics body control colors a body (debug/physics-body-mesh.js). Neither is a LAYER_TINTS color,
//because the two controls can be on together.
export const BODY_TINTS = [
  { role: 'dry', label: 'body above water', color: 0xff9f45 },
  { role: 'wet', label: 'body under water', color: 0xa78bfa },
];

//NOTE(@jimmylee)
//Demo catalog. `kind` selects the stage station; `assembly` is read for the live frame readout.
//`timeline` is what the card's strip draws: `ticks` per frame of the action and `events` on that tick
//axis — `seq` events are read from the SEQ opcodes (tests/sprite-animation-demos.test.js checks them
//against TYPE1.SEQ), `engine` events are the moments the behavior acts. Where they differ the
//engine keeps its own moment (actions/action-timelines.js, "Engine differences from the original tactical RPG").
export const SPRITE_DEMOS = [
  {
    id: 'idle',
    kind: 'hold',
    title: 'Idle',
    seq: 'SEQ 1-5 · F1-F8',
    pose: 'idle',
    timeline: { ticks: [60], events: [] },
  },
  {
    id: 'guard',
    kind: 'hold',
    mode: 'G',
    title: 'Frozen Walk 2 (G)',
    seq: 'SEQ 76/77 · F13/F18',
    pose: 'guard',
    assembly: GUARD_ASSEMBLY,
    timeline: { ticks: [60], events: [] },
  },
  {
    id: 'float',
    kind: 'hold',
    mode: 'FL',
    title: 'Float (FL)',
    seq: 'SEQ 12/13 · F70/F71',
    assembly: FLOAT_ASSEMBLY,
    delays: FLOAT_DELAYS,
    waterRows: FLOAT_WATER_ROWS,
    timeline: { ticks: msToTicks(FLOAT_DELAYS), events: [] },
  },
  {
    id: 'walk',
    kind: 'player',
    mode: 'A1',
    action: 'walk',
    title: 'Walk (A1 / W / I)',
    seq: 'SEQ 6/7 · F9-F18',
    assembly: WALK_ASSEMBLY,
    delays: WALK_DELAYS,
    timeline: { ticks: msToTicks(WALK_DELAYS), events: [] },
  },
  {
    id: 'a1-jump',
    kind: 'player',
    mode: 'A1',
    action: 'jump',
    title: 'Player Jump (A1)',
    seq: 'SEQ 204 · 42 · 52',
    assembly: JUMP_ASSEMBLY,
    timeline: { ticks: PLAYER_JUMP_TICKS, events: [engineEvent(PLAYER_RISE_TICKS, 'rise ends'), engineEvent(PLAYER_AIR_TICKS, 'touchdown, control returns')] },
  },
  {
    id: 'a1-stab',
    kind: 'player',
    mode: 'A1',
    action: 'stab',
    title: 'Player Stab (A1)',
    seq: 'SEQ 100/101 · Unarmed Low',
    assembly: STAB_LV3_ASSEMBLY,
    delays: STAB_LV3_DELAYS,
    timeline: { ticks: msToTicks(STAB_LV3_DELAYS), events: [seqEvent(18, 'PostGenericAttack'), engineEvent(sum(msToTicks(STAB_LV3_DELAYS).slice(0, STAB_HIT_FRAME)), 'hit check')] },
  },
  {
    id: 'a1-cast',
    kind: 'player',
    mode: 'A1',
    action: 'cast',
    title: 'Player Cast (A1)',
    seq: 'SEQ 64/65 · Singing',
    assembly: CAST_ASSEMBLY,
    timeline: { ticks: [20, 20], events: [] },
  },
  {
    id: 'magic-charge',
    kind: 'loop',
    mode: 'C',
    title: 'Singing (C)',
    seq: 'SEQ 64/65 · Magic Charge',
    assembly: CAST_ASSEMBLY,
    delays: [20, 20].map((t) => (t * 1000) / 60),
    timeline: { ticks: [20, 20], events: [] },
  },
  {
    id: 'quick-throw',
    kind: 'quick-throw',
    mode: 'T',
    title: 'Quick Throw (T)',
    seq: 'SEQ 48/49 · High Jump Start',
    assembly: QUICK_THROW_ASSEMBLY,
    delays: QUICK_THROW_DELAYS,
    timeline: { ticks: msToTicks(QUICK_THROW_DELAYS), events: [seqEvent(QT_RELEASE_TICKS, 'PlaySound'), engineEvent(QT_PICKUP_TICKS, 'marble picked up'), engineEvent(QT_RELEASE_TICKS, 'marble released')] },
  },
  {
    id: 'flinch',
    kind: 'pose',
    mode: 'H',
    title: 'Taking Damage (H)',
    seq: 'SEQ 38/39 · Flinch',
    assembly: HURT_ASSEMBLY,
    delays: HURT_SHIVER_DELAYS,
    repeatsDamage: true,
    timeline: { ticks: msToTicks(HURT_SHIVER_DELAYS), events: [] },
  },
  {
    id: 'kneel',
    kind: 'pose',
    mode: 'K',
    title: 'Critical (K)',
    seq: 'SEQ 32/33 · Kneel',
    assembly: KNEEL_ASSEMBLY,
    timeline: { ticks: [60], events: [] },
  },
  {
    id: 'dead',
    kind: 'pose',
    mode: 'D',
    title: 'Dead (D)',
    seq: 'SEQ 40/41 · F23/F24',
    assembly: DEATH_ASSEMBLY,
    waterRows: DEAD_WATER_ROWS,
    timeline: { ticks: [60], events: [] },
  },
  {
    id: 'jump',
    kind: 'jump',
    mode: 'J',
    title: 'Jump (J)',
    seq: 'SEQ 204 · 42 · 52',
    assembly: JUMP_ASSEMBLY,
    delays: JUMP_DELAYS,
    timeline: { ticks: JUMP_TICKS, events: [engineEvent(JUMP_TAKEOFF_S * 60, 'take-off'), engineEvent(JUMP_TOUCHDOWN_S * 60, 'touchdown')] },
  },
  stoneCard('throw-stone', 'Throw Stone (TS)', STONE_VARIANTS.small),
  stoneCard('throw-heavy', 'Throw Heavy Stone (TS)', STONE_VARIANTS.heavy),
  {
    id: 'punch-1',
    mode: 'P1',
    title: 'Bow High (P1)',
    seq: 'SEQ 140/141 · engine Punch',
    ...bowCard(PUNCH_ASSEMBLY, PUNCH_DELAYS, 'high'),
  },
  {
    id: 'punch-2',
    mode: 'P2',
    title: 'Bow Mid (P2)',
    seq: 'SEQ 142/143 · engine Punch',
    ...bowCard(PUNCH_LV2_ASSEMBLY, PUNCH_LV2_DELAYS, 'mid'),
  },
  {
    id: 'punch-3',
    mode: 'P3',
    title: 'Bow Low (P3)',
    seq: 'SEQ 144/145 · engine Punch',
    ...bowCard(PUNCH_LV3_ASSEMBLY, PUNCH_LV3_DELAYS, 'low'),
  },
  {
    id: 'stab-1',
    kind: 'strike',
    mode: 'S1',
    title: 'Unarmed High (S1)',
    seq: 'SEQ 96/97 · Stab',
    assembly: STAB_ASSEMBLY,
    delays: STAB_DELAYS,
    hitMs: sum(STAB_DELAYS.slice(0, STAB_HIT_FRAME)),
    timeline: { ticks: msToTicks(STAB_DELAYS), events: [seqEvent(18, 'PostGenericAttack'), engineEvent(sum(msToTicks(STAB_DELAYS).slice(0, STAB_HIT_FRAME)), 'hit check')] },
  },
  {
    id: 'stab-2',
    kind: 'strike',
    mode: 'S2',
    title: 'Unarmed Mid (S2)',
    seq: 'SEQ 98/99 · Stab',
    assembly: STAB_LV2_ASSEMBLY,
    delays: STAB_LV2_DELAYS,
    hitMs: sum(STAB_LV2_DELAYS.slice(0, STAB_HIT_FRAME)),
    timeline: { ticks: msToTicks(STAB_LV2_DELAYS), events: [seqEvent(18, 'PostGenericAttack'), engineEvent(sum(msToTicks(STAB_LV2_DELAYS).slice(0, STAB_HIT_FRAME)), 'hit check')] },
  },
  {
    id: 'stab-3',
    kind: 'strike',
    mode: 'S3',
    title: 'Unarmed Low (S3)',
    seq: 'SEQ 100/101 · Stab',
    assembly: STAB_LV3_ASSEMBLY,
    delays: STAB_LV3_DELAYS,
    hitMs: sum(STAB_LV3_DELAYS.slice(0, STAB_HIT_FRAME)),
    timeline: { ticks: msToTicks(STAB_LV3_DELAYS), events: [seqEvent(18, 'PostGenericAttack'), engineEvent(sum(msToTicks(STAB_LV3_DELAYS).slice(0, STAB_HIT_FRAME)), 'hit check')] },
  },
  {
    id: 'fatal-item-impact',
    kind: 'reaction',
    mode: 'FI',
    title: 'Bounced to Death (FI)',
    seq: 'SEQ 82/83',
    assembly: FATAL_ITEM_IMPACT_ASSEMBLY,
    delays: FATAL_ITEM_IMPACT_TIMELINE.map((e) => e.delay),
    timeline: sequenceTimeline(SEQ_LIBRARY[82]),
  },
  {
    id: 'item-drop',
    kind: 'reaction',
    mode: 'ID',
    title: 'Revived (ID)',
    seq: 'SEQ 84/85',
    assembly: ITEM_DROP_ASSEMBLY,
    delays: [...ITEM_DROP_DELAYS, 0],
    timeline: sequenceTimeline(SEQ_LIBRARY[84]),
  },
  ...SEQUENCE_MODES.map(sequenceDemo),
];

//NOTE(@jimmylee)
//Where the stage canvas sits in the grid (`top`, CSS px): it covers `windowHeight`, about two screens,
//so its drawing buffer stays bounded however many cards there are. It moves only when the visible part
//of the grid leaves it, or the grid no longer holds it, which recenters it; it scrolls with the page in
//between.
export function placeCanvasWindow({ top, windowHeight, gridHeight, gridTop, viewHeight }) {
  const from = Math.max(0, -gridTop);
  const to = Math.min(gridHeight, from + viewHeight);
  const lastTop = gridHeight - windowHeight;
  if (from >= top && to <= top + windowHeight && top <= lastTop) return top;
  return Math.round(Math.max(0, Math.min(lastTop, from - (windowHeight - (to - from)) / 2)));
}
