//NOTE(@jimmylee)
//ThreeJS demos for the main route. Every character is built by the real engine factory
//(createCharacter → the registered group-*.js mode, createFlinchGroup for hit targets) and drawn by
//its own visual driver, so the demos show exactly what the engine renders: billboarding, the
//8-step pattern selection, SHP layer order, anchors, SEQ unit motion and frame timing.
//
//Every unit starts settled on the floor. The scripted parts of each action (Mode J jump arc, the A1
//jump, Mode TS stone and Mode T marble pick-up / hand tracking / release, punch/stab contact tick)
//replay the engine timelines from actions/action-timelines.js. There is no physics engine: stones,
//arrows and marbles fly on kinematic arcs, a stone's hit is a one-dimensional collision with its target, and
//the Bow cards shoot a bow generated and simulated by weapons/bow.js, which needs no sprite. The Swing,
//Poke, Gun, Read Book, Play Instrument, Shield Block, Katana Use and recoil cards hold models Set lends
//(weapons/set-items.js, weapons/held-items.js), Weapon Throw throws one, Item Throw holds and throws a black
//marble, the small one in one hand and the big one in two, the Cloth Bag cards swing a bag simulated by
//weapons/cloth-bag.js, and every weapon wears the one mythril, with a baked face and back on a shield or a book
//(weapons/item-finish.js). Every hit shows a damage counter
//(debug/damage-counter.js). In water, every scene stands in its own low polygon sheet of clear shallows
//(debug/water-surface.js), and each unit is measured against it by
//the physics body its sprite gives it (physics/sprite-body.js, drawn by debug/physics-body-mesh.js).
//
//One WebGLRenderer draws every demo in the canvas window into its own viewport (scissor) with one
//shared orthographic camera; each demo has its own scene centered on the world origin so the engine's
//azimuth → step math applies unchanged. Each scene runs the engine's syncCharacterVisuals before its
//draw list is built.

import * as THREE from 'three';
import createCharacter from '@engine/meshes/createCharacter';
import { createFlinchGroup } from '@engine/meshes/character-groups/group-flinch';
import { cubeSize, sphereRadius, directionCoordinates, DIRECTION_OFFSETS } from '@engine/constants';
import { createDamageCounter, createDamageDigits, createDamageGeometry } from '@engine/debug/damage-counter';
import { createBlackMarbleMaterial, createMarbleBake, createMarbleMaterial, prepareBlackMarbleTexture } from '@engine/debug/marble-material';
import { createBodyResources, createStationBody } from '@engine/debug/physics-body-mesh';
import { createStationWater, createWaterResources } from '@engine/debug/water-surface';
import { readSheetAlpha } from '@engine/physics/sprite-body';
import { BOW_SPEC, BOW_STEP_S, bowPull, createBow, resetBow, stepBow } from '@engine/weapons/bow';
import { createArrowGeometries, createArrowMesh, createBowMesh, syncBowMesh } from '@engine/weapons/bow-mesh';
import { CLOTH_BAG_SPEC, CLOTH_BAG_STEP_S, clothBagLength, createClothBag, resetClothBag, stepClothBag, whipClothBag } from '@engine/weapons/cloth-bag';
import { createClothBagMesh, createClothBagResources, syncClothBagMesh } from '@engine/weapons/cloth-bag-mesh';
import { createHeldItemResources, createMuzzleFlash, createStreak, flattenOntoSprite } from '@engine/weapons/held-item-mesh';
import { BOW_LAYER, HELD_ITEMS, HELD_ITEM_SCALE, MARBLE_RADIUS, heldEnd, heldHand, heldLayers, heldMarblePoint, heldOffset, heldSlide, heldTilt } from '@engine/weapons/held-items';
import { fallTime } from '@engine/weapons/ballistics';
import { defaultGravity, deflectLaunchVH, deflectLaunchVV, playerJumpHeight, playerJumpRiseMs, CAUGHT_MARBLE_FORWARD_OFFSET } from '@engine/constants/physics';
import { CHAR_HALF_Z, SPRITE_WIDTH, SPRITE_HEIGHT } from '@engine/constants/character';
import { SPRITE_SHEET_FILE, SPRITE_MAP } from '@engine/constants/sprites';
import { patchGroupSpawnMaterials, updateSpawnProgress, computeSpawnProgress, computeDespawnProgress } from '@engine/meshes/spawn-effect';
import { DEFAULT_AZIMUTH, STEP_SIZE, ASSEMBLY_STEP_MAP, SPRITE_TINT, FAR_BEHIND, BEHIND, IN_FRONT, FACE, KNEEL_PIVOT_RISE, DEAD_PIVOT_RISE, computeAzimuthToStep, resolveLoopingFrame, resolveVariableFrame, syncCharacterVisuals } from '@engine/meshes/character-utils';
import { State, ActionType, transition } from '@engine/actions/character-state';
import { computeActionReadyAt } from '@engine/actions/action-timing';
import { canAct, isActionReady, ACTION } from '@engine/actions/behavior-tiers';
import { JUMP_DELAYS_S, JUMP_CYCLE_DURATION, JUMP_TAKEOFF_S, JUMP_TOUCHDOWN_S, JUMP_LIFT_HEIGHT, jumpLift, THROW_HOLD_DEPTH, THROW_STONE_SPAWN_FRAME, THROW_STONE_RELEASE_FRAME, THROW_STONE_LAST_HELD_FRAME, THROW_STONE_RELEASE_S, THROW_STONE_DELAY_MAP, THROW_COOLDOWN_MS, THROW_LAUNCH_FORWARD, THROW_LAUNCH_UP, CAST_CYCLE_MS, QT_PICKUP_FRAME, QT_RELEASE_FRAME, QT_RELEASE_MS, QT_CYCLE_MS, billboardPoint, createHeldMarble, jumpRiseCurve, playerJumpFrame, playerLandFrame, quickThrowHoldHeight, throwStoneHandPoint, throwStoneFlightPoint, throwStoneLaunchPoint } from '@engine/actions/action-timelines';
import { FLOAT_MOVES, STAB_LV3_DELAYS, THROW_STONE_GRIPS, THROW_STONE_HANDS } from '@engine/constants/sprites/assembly';
import { SHP_FRAMES, SHP_WATER_OFFSET } from '@engine/constants/sprites/seq-library';
import { setSequencePair } from '@engine/meshes/character-groups/group-sequence';
import { SPRITE_DEMOS, LAYER_TINTS, BODY_TINTS, ELEVATIONS, PLAYER_FALL_ACCEL, BOW_RANGE, BOW_NOCK_TICKS, BOW_ANCHOR_TICKS, BOW_SHOT_TICKS, BOW_SHOT, COUNTER_TICKS, DAMAGE_COUNTER, FLOAT_WATER_ROWS, JUMP_DOWN_LEDGE, JUMP_DOWN_TRAVEL, STONE_BOUNCE_MIN, STONE_RADIUS_SMALL, STONE_RESTITUTION, STONE_ROLL_DECEL, TARGET_SLIDE_DECEL, TELEPORT_GAP_TICKS, TELEPORT_OFFSET, jumpDownHeight, leapHeight } from '@engine/debug/sprite-animation-demo-catalog';

export { SPRITE_DEMOS, LAYER_TINTS, BODY_TINTS, ELEVATIONS };

//NOTE(jimmylee)
//World layout. The floor is y = 0; a settled character's group origin (the stance point, its
//physics body center) sits SPRITE_HEIGHT / 2 above it.
export const REST_Y = SPRITE_HEIGHT / 2;
const FLOOR_CELLS = 10;

//NOTE(jimmylee)
//Hit targets stand two collision half-widths in front of the attacker (boxes touching), inside the
//engine's 1-cube punch reach.
export const STRIKE_GAP = cubeSize * 0.75;
const FLINCH_SHOW_MS = 500;
const STONE_FADE_MS = 1200;

//NOTE(@jimmylee)
//Smallest half of the visible world height of a demo viewport (orthographic camera), per demo kind.
//Each view widens past it only as far as its action envelope needs at the current elevation
//(fitStationView).
export const MIN_VIEW_HALF_HEIGHT = { hold: 30 / 1.5, strike: 34 / 1.5, bow: 34 / 1.5, gun: 34 / 1.5, 'item-throw': 34 / 1.5, jump: 58 / 1.5, leap: 58 / 1.5, 'jump-down': 58 / 1.5, teleport: 34 / 1.5, throw: 58 / 1.5, loop: 34 / 1.5, 'quick-throw': 34 / 1.5, pose: 34 / 1.5, player: 34 / 1.5, reaction: 34 / 1.5, recoil: 34 / 1.5, 'weapon-throw': 34 / 1.5 };

//NOTE(@jimmylee)
//Screen-space extent of a character composite around its group origin (world units): the 24x36
//stance plane plus what overlays, anchors and SEQ motion reach beyond it — punch/throw-stone hands
//17.25 to the side, a lunging punch torso 20.2 below (High elevation), the float bob 19.8
//above.
export const SPRITE_EXTENT = { halfWidth: 17.5, bottom: 20.5, top: 20 };
//NOTE(@jimmylee)
//Guard / Float never lunge: hands 12.75 to the side, 19.8 below (guard) and 19.8 above (bob).
const HOLD_EXTENT = { halfWidth: 13, bottom: 20, top: 20 };
//NOTE(@jimmylee)
//Flinch, Kneel and Dead: the 40x32 KO1/KO2 plane reaches 15 to the side and sits 12px below the
//stance center, 25.2 below it.
const POSE_EXTENT = { halfWidth: 18, bottom: 26, top: 20 };
//NOTE(@jimmylee)
//Bounced to Death and Revived: the kneel and the KO plane, and the 12px hop (10.8 world units).
const REACTION_EXTENT = { halfWidth: 18, bottom: 26, top: 31 };
//NOTE(@jimmylee)
//Idle dwell between the repeats of a scripted one-shot action (the engine's ACTION_IDLE_DWELL_MS).
const REPLAY_DWELL_MS = 400;
const REACTION_HOLD_MS = 800;
const FIT_AZIMUTH_SAMPLES = 16;
const STONE_PATH_SAMPLES = 12;
const CAMERA_DISTANCE = 400;
const STAGE_BACKGROUND = 0xffffff;
const FLOOR_COLOR = 0xf4f4f4;
const ORB_SEGMENTS = 32;
const ORBIT_RADIANS_PER_SECOND = (Math.PI * 2) / 24;

//NOTE(jimmylee)
//Layer tint by renderOrder — the SHP back-to-front slots of the composites (legend in the catalog).
const LAYER_ORDER = { farBehind: FAR_BEHIND, behind: BEHIND, body: 0, head: 1, front: IN_FRONT, face: FACE };
const TINT_BY_ORDER = new Map(LAYER_TINTS.map((t) => [LAYER_ORDER[t.role], t.color]));

//NOTE(@jimmylee)
//The bow's reach around the grip for the framing envelope: limb tip height, and what the arrow has
//ahead of the grip at brace. TYPE1 draws no weapon; these are the generated bow's own numbers.
const BOW_REACH = Math.max(BOW_SPEC.gripHalf + BOW_SPEC.limbLength, BOW_SPEC.arrowLength - BOW_SPEC.braceHeight);
//NOTE(@jimmylee)
//The arrow leaves the drawn bow and settles onto the camera-independent arc over this long.
const ARROW_SETTLE_S = 8 / 60;
const STONE_STEP_S = 1 / 240;
const SHADOW_RADIUS = SPRITE_WIDTH * 0.42;
const SHADOW_OPACITY = 0.16;
//NOTE(@jimmylee)
//How deep a unit stands: the water line of the idle water frame, which is where F(n + 182) cuts a
//standing unit, in art pixels below the stance point. A posed card can stand at another depth
//(`def.waterRows`). The sprite plane leans with the camera, so a surface at one height would cut it at a
//different row at each elevation: waterHeight is the height that cuts it on this row at every one.
const WATER_ROWS = Math.max(...SHP_FRAMES[1 + SHP_WATER_OFFSET].map(([id, , v]) => v + SPRITE_MAP[id].h / 2));
const waterDraft = (station) => (station.def.waterRows ?? WATER_ROWS) * (SPRITE_HEIGHT / 40);
export const waterHeight = (station, elevation) => REST_Y - waterDraft(station) * Math.cos(elevation);
const RIPPLE_MIN_DOMAIN = 192;
const RIPPLE_EDGE_ROOM = 48;
const msToS = (delays) => delays.map((ms) => ms / 1000);
const sum = (values) => values.reduce((a, b) => a + b, 0);
const ticksToMs = (ticks) => (ticks * 1000) / 60;

//NOTE(jimmylee)
//Shared floor/shadow resources (created per stage, disposed with it). `items` is readSetItems' models:
//without them a card shows no item, and everything else on it runs the same.
function createSharedResources(items) {
  const arrow = createArrowGeometries(BOW_SPEC.arrowLength);
  const heldItems = createHeldItemResources(items);
  const stringMaterial = new THREE.MeshBasicMaterial({ color: 0x393939 });
  const arrowShaftMaterial = new THREE.MeshLambertMaterial({ color: 0xd8c39a });
  const arrowVanesMaterial = new THREE.MeshBasicMaterial({ color: 0xc8483c, side: THREE.DoubleSide });
  for (const material of [stringMaterial, arrowShaftMaterial, arrowVanesMaterial]) material.onBeforeRender = flattenOntoSprite;
  return {
    floorGeometry: new THREE.PlaneGeometry(FLOOR_CELLS * cubeSize, FLOOR_CELLS * cubeSize),
    floorMaterial: new THREE.MeshBasicMaterial({ color: FLOOR_COLOR }),
    shadowGeometry: new THREE.CircleGeometry(SHADOW_RADIUS, 24),
    shadowMaterial: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false }),
    stoneGeometry: new THREE.SphereGeometry(sphereRadius, ORB_SEGMENTS, ORB_SEGMENTS),
    referenceMaterial: new THREE.LineBasicMaterial({ color: 0xa8a8a8, depthWrite: false }),
    blockMaterial: createMarbleMaterial({ polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }),
    smallStoneGeometry: new THREE.SphereGeometry(STONE_RADIUS_SMALL, ORB_SEGMENTS, ORB_SEGMENTS),
    bigMarbleGeometry: new THREE.SphereGeometry(MARBLE_RADIUS.big, ORB_SEGMENTS, ORB_SEGMENTS),
    stringMaterial,
    arrowShaftGeometry: arrow.shaft,
    arrowHeadGeometry: arrow.head,
    arrowVanesGeometry: arrow.vanes,
    arrowShaftMaterial,
    arrowVanesMaterial,
    heldItems,
    clothBag: createClothBagResources(),
    damageDigits: createDamageDigits(),
    damageGeometry: createDamageGeometry(),
  };
}

function createStationScene(resources) {
  const scene = new THREE.Scene();
  const floor = new THREE.Mesh(resources.floorGeometry, resources.floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  const grid = new THREE.GridHelper(FLOOR_CELLS * cubeSize, FLOOR_CELLS, 0xa8a8a8, 0xc6c6c6);
  grid.position.y = 0.05;
  scene.add(grid);
  scene.userData.ground = [floor, grid];
  scene.userData.posts = [];
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 2));
  scene.onBeforeRender = syncCharacterVisuals;
  return scene;
}

//NOTE(jimmylee)
//Contact shadow (a demo aid, not an engine mesh): shrinks and fades with height above the floor so
//lifts — the jump arc, the float bob — read against the ground.
function createShadow(resources, scene) {
  const material = resources.shadowMaterial.clone();
  const shadow = new THREE.Mesh(resources.shadowGeometry, material);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -10;
  scene.add(shadow);
  return shadow;
}

function placeShadow(shadow, x, z, heightAboveFloor, visible = true, floorY = 0, size = 1) {
  shadow.visible = visible;
  const s = 1 / (1 + Math.max(0, heightAboveFloor) / cubeSize);
  shadow.position.set(x, floorY + 0.1, z);
  shadow.scale.setScalar(s * size);
  shadow.material.opacity = SHADOW_OPACITY * s;
}

function buildCharacter(mode, direction, textures, now) {
  const root = createCharacter({ node: { x: 0, y: 0, z: 0 }, textures, direction, mode, now });
  root.position.set(0, REST_Y, 0);
  return root;
}

//NOTE(@jimmylee)
//Puts a unit on the floor, settled as a character is after it lands: IDLE, no
//action, walkStart = now (every mode loop starts from it), baseY at the stance height.
function settleOnGround(root, now, y = REST_Y) {
  const ch = root.userData.character;
  root.position.y = y;
  if (ch.state === State.SPAWNING) transition(ch, State.FALLING);
  if (ch.state !== State.IDLE) transition(ch, State.IDLE);
  ch.action = null;
  ch.walkStart = now;
  ch.lastStep = -1;
  ch.lastFrame = -1;
  if (ch.baseY !== undefined) ch.baseY = y;
}

//NOTE(@jimmylee)
//Ticks into a looping cycle of `cycleMs`, for the card timeline.
function loopPlayhead(now, walkStart, cycleMs) {
  return (((now - walkStart) % cycleMs) * 60) / 1000;
}

function patternLabel(idx) {
  return ['A', 'B', 'C', 'D'][ASSEMBLY_STEP_MAP[idx]];
}

//NOTE(@jimmylee)
//Guard / Float: the unit stands in the mode pose from the start. Float bobs its whole unit (SEQ
//move opcodes) above a shadow that stays on the floor, as a floating unit does in the game.
function createHoldStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(env.resources, scene);
  placeShadow(shadow, 0, 0, 0);
  const delaysS = def.delays ? msToS(def.delays) : null;

  return {
    def,
    scene,
    roots: [unit],
    envelope: { extent: HOLD_EXTENT, sprites: [[0, REST_Y, 0]], spheres: [], points: [] },
    reset(now) {
      settleOnGround(unit, now);
    },
    update() {},
    playhead(now) {
      return delaysS ? loopPlayhead(now, unit.userData.character.walkStart, sum(def.delays)) : -1;
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      if (!delaysS) return `IDLE · ${def.pose} pose · pattern ${patternLabel(idx)} · step ${step}`;
      const { frameIdx } = resolveLoopingFrame(delaysS, sum(delaysS), (now - ch.walkStart) / 1000);
      return `IDLE · hover ${frameIdx + 1}/${delaysS.length} · ${-FLOAT_MOVES[frameIdx].du}px above the ground · pattern ${patternLabel(idx)} · step ${step}`;
    },
  };
}

//NOTE(@jimmylee)
//Jump reference: a wireframe column of 2 cubes (the Mode J lift) on the unit's own cell — its feet
//reach the top face at the peak. Centered on the unit so it never leaves the frame at any azimuth,
//and drawn without depth writes so the character always draws over it.
const REFERENCE_X = 0;
const REFERENCE_Z = 0;

function boxCorners(cx, cy, cz, size, height) {
  const out = [];
  for (const dx of [-size / 2, size / 2]) for (const dy of [-height / 2, height / 2]) for (const dz of [-size / 2, size / 2]) out.push([cx + dx, cy + dy, cz + dz]);
  return out;
}

//NOTE(@jimmylee)
//A demo aid like the jump column: one cell of ground `height` tall, its top edge outlined. Returns
//its corners for the action envelope.
function createBlock(resources, scene, x, z, height) {
  const geometry = new THREE.BoxGeometry(cubeSize, height, cubeSize);
  const block = new THREE.Mesh(geometry, resources.blockMaterial);
  block.position.set(x, height / 2, z);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), resources.referenceMaterial);
  edges.position.copy(block.position);
  scene.add(block, edges);
  scene.userData.posts.push({ x, z, halfX: cubeSize / 2, halfZ: cubeSize / 2, top: height });
  return boxCorners(x, height / 2, z, cubeSize, height);
}

//NOTE(@jimmylee)
//The 2-cube wireframe column of the jump cards (see REFERENCE_X), for scale.
function createJumpReference(resources, scene) {
  const reference = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(cubeSize, JUMP_LIFT_HEIGHT, cubeSize)), resources.referenceMaterial);
  reference.position.set(REFERENCE_X, JUMP_LIFT_HEIGHT / 2, REFERENCE_Z);
  scene.add(reference);
  return boxCorners(REFERENCE_X, JUMP_LIFT_HEIGHT / 2, REFERENCE_Z, cubeSize, JUMP_LIFT_HEIGHT);
}

//NOTE(@jimmylee)
//The engine's Bayer dither on a unit (meshes/spawn-effect.js), and its contact shadow fading with it. set(1) draws the unit whole.
function createBayerFade(unit, shadow) {
  const refs = patchGroupSpawnMaterials(unit);
  return {
    set(progress) {
      updateSpawnProgress(refs, progress);
      shadow.material.opacity *= progress;
    },
  };
}

//NOTE(@jimmylee)
//The held prop's hand points as screen-space offsets from the stance point, for the action envelope
//([x, y, z, du, dv, r] `hands` entries — the view-axis push of THROW_HOLD_DEPTH does not move them on
//screen; du is applied both ways for the mirrored patterns). `from` and `to` bound the frames.
const HAND_PX_X = SPRITE_WIDTH / 32;
const HAND_PX_Y = SPRITE_HEIGHT / 40;
const STONE_HANDS = THROW_STONE_HANDS[SPRITE_SHEET_FILE];
const STONE_GRIPS = THROW_STONE_GRIPS[SPRITE_SHEET_FILE];
function heldHands(from, to, du = 0, radius = sphereRadius) {
  const out = [];
  for (const hands of [STONE_HANDS.fwd, STONE_HANDS.bck]) {
    for (let k = from; k <= to; k++) out.push([0, REST_Y, 0, Math.abs(hands[k][0]) * HAND_PX_X, -(hands[k][1] + du) * HAND_PX_Y, radius]);
  }
  return out;
}

//NOTE(@jimmylee)
//A launched prop's path for the action envelope, as [x, y, z, radius] spheres: `forward` in front of
//the unit along (dirX, dirZ) at height y0, launched at vh, vv, over `seconds`. By default that is
//until it rests on the floor.
function launchPath(dirX, dirZ, forward, y0, vh, vv, radius = sphereRadius, seconds = fallTime(y0 - radius, vv)) {
  const out = [];
  for (let i = 0; i <= STONE_PATH_SAMPLES; i++) {
    const t = (i / STONE_PATH_SAMPLES) * seconds;
    const d = forward + vh * t;
    out.push([dirX * d, y0 + vv * t + 0.5 * defaultGravity * t * t, dirZ * d, radius]);
  }
  return out;
}

//NOTE(@jimmylee)
//Mode J phase at `elapsed` seconds into the cycle (for the status line).
function jumpPhase(elapsed) {
  if (elapsed < JUMP_TAKEOFF_S) return 'take-off';
  if (elapsed < JUMP_TOUCHDOWN_S) return 'airborne';
  return 'landing';
}

//NOTE(@jimmylee)
//Mode J: the jump cycle with its lift applied to the group — on the ground
//for the take-off frames, the jumpLift arc on the Mid Jump pose, the landing frames on the ground,
//then the idle dwell.
function createJumpStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter('J', 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(env.resources, scene);

  return {
    def,
    scene,
    roots: [unit],
    envelope: { sprites: [[0, REST_Y, 0], [0, REST_Y + JUMP_LIFT_HEIGHT, 0]], spheres: [], points: createJumpReference(env.resources, scene) },
    reset(now) {
      const ch = unit.userData.character;
      settleOnGround(unit, now);
      ch._lastCycle = -1;
      ch.actionReadyAt = 0;
    },
    update(now) {
      const ch = unit.userData.character;
      if (ch.action?.type !== ActionType.JUMP) {
        if (!canAct(ch, ACTION) || !isActionReady(ch, now)) return;
        ch.baseY = unit.position.y;
        ch.walkStart = now;
        ch.action = { type: ActionType.JUMP, phase: 'air' };
        ch._lastCycle = 0;
      }
      const elapsed = (now - ch.walkStart) / 1000;
      if (elapsed >= JUMP_CYCLE_DURATION) {
        unit.position.y = ch.baseY;
        ch.action = null;
        ch.actionReadyAt = computeActionReadyAt(now, 0);
        ch._lastCycle = -1;
        ch.lastFrame = -1;
        ch.lastStep = -1;
      } else {
        unit.position.y = ch.baseY + jumpLift(elapsed);
      }
      placeShadow(shadow, 0, 0, unit.position.y - REST_Y);
    },
    playhead(now) {
      const ch = unit.userData.character;
      return ch._lastCycle === -1 ? -1 : ((now - ch.walkStart) * 60) / 1000;
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      const height = ((unit.position.y - REST_Y) / cubeSize).toFixed(2);
      const air = `airborne ${Math.round((JUMP_TOUCHDOWN_S - JUMP_TAKEOFF_S) * 1000)} of ${Math.round(JUMP_CYCLE_DURATION * 1000)}ms`;
      if (ch._lastCycle === -1) return `IDLE · idle sprite · height ${height} cubes · ${air}`;
      const elapsed = (now - ch.walkStart) / 1000;
      const frame = resolveVariableFrame(JUMP_DELAYS_S, elapsed).frameIdx;
      return `${jumpPhase(elapsed)} · frame ${frame + 1}/${JUMP_DELAYS_S.length} · height ${height} cubes · pattern ${patternLabel(idx)} · ${air}`;
    },
  };
}

const groundFloor = () => 0;

//NOTE(@jimmylee)
//What a stone does after it hits, stepped at STONE_STEP_S along the throw (d, y, vd, vy): gravity, a
//low bounce off the floor, then rolling to a stop. `settled` is true once it rests. Everything else
//about the stone's flight is the arc. `floorAt(d)` is the height of what it lands on, where a ledge stands, and
//`bounceKeeps` how much of its speed along the ground a bounce leaves it.
function stepLooseStone(body, radius, floorAt = groundFloor, bounceKeeps = 1) {
  const h = STONE_STEP_S;
  if (body.rolling) {
    const speed = Math.abs(body.vd) - STONE_ROLL_DECEL * h;
    body.vd = speed > 0 ? Math.sign(body.vd) * speed : 0;
    body.d += body.vd * h;
    if (body.y > floorAt(body.d) + radius) {
      body.rolling = false;
      return;
    }
    body.settled = body.vd === 0;
    return;
  }
  body.vy += defaultGravity * h;
  body.y += body.vy * h;
  body.d += body.vd * h;
  const rest = floorAt(body.d) + radius;
  if (body.y > rest) return;
  body.y = rest;
  if (Math.abs(body.vy) * STONE_RESTITUTION < STONE_BOUNCE_MIN) {
    body.vy = 0;
    body.rolling = true;
  } else {
    body.vy = -body.vy * STONE_RESTITUTION;
  }
  body.vd *= bounceKeeps;
}

//NOTE(@jimmylee)
//Where a stone and its target come to rest, for the framing envelope: { stoneD, targetD }.
function restingPlaces(stone, launchForward, launchUp, floorAt = groundFloor, bounceKeeps = 1) {
  const t = stone.hitS;
  const body = { d: launchForward + stone.vh * t, y: REST_Y + launchUp + stone.vv * t + 0.5 * defaultGravity * t * t, vd: stone.stoneAfter, vy: stone.stoneRise ?? stone.vv + defaultGravity * t, rolling: false, settled: false };
  while (!body.settled) stepLooseStone(body, stone.radius, floorAt, bounceKeeps);
  return { stoneD: body.d, stoneY: body.y, targetD: stone.targetForward + (stone.targetKick * stone.targetKick) / (2 * TARGET_SLIDE_DECEL) };
}

//NOTE(@jimmylee)
//Mode TS: the throw cycle (same THROW_STONE_DELAY_MAP as the TS visual driver) with a kinematic
//stone: picked up at the kneel
//(frame 2), carried on the throwing hand (throwStoneHandPoint) and released on the throw frame
//(frame 7). From there it follows throwStoneFlightPoint, the path the engine draws: one arc from the
//camera-independent release point, leaving the hand of the last held frame over the follow-through,
//here with the stone's own launch (def.stone, from the catalog). The arc ends on the target's
//collision box at the planned moment; the collision's two speeds send the stone off and slide the
//target, then the stone drops, rolls out and fades. The next throw waits for that.
const _handPoint = { x: 0, y: 0, z: 0 };
function createThrowStation(def, env) {
  const { resources } = env;
  const { stone: variant } = def;
  const scene = createStationScene(resources);
  const unit = buildCharacter('TS', 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(resources, scene);
  placeShadow(shadow, 0, 0, 0);
  const ch0 = unit.userData.character;
  const dirX = directionCoordinates.x[ch0.direction] || 0;
  const dirZ = directionCoordinates.z[ch0.direction] || 0;

  const target = buildCharacter(undefined, 'NW', env.textures, env.now);
  target.userData.character.state = State.IDLE;
  scene.add(target);
  const flinch = createFlinchGroup({ textures: env.textures, directionOffset: DIRECTION_OFFSETS.NW, walkStart: env.now, worldX: dirX * variant.targetForward, worldY: REST_Y, worldZ: dirZ * variant.targetForward, spriteWidth: SPRITE_WIDTH, spriteHeight: SPRITE_HEIGHT });
  flinch.visible = false;
  scene.add(flinch);
  const targetShadow = createShadow(resources, scene);

  const stone = new THREE.Mesh(variant.name === 'small' ? resources.smallStoneGeometry : resources.stoneGeometry, createBlackMarbleMaterial(env.textures.skins.blackMarble));
  stone.visible = false;
  scene.add(stone);
  const stoneShadow = createShadow(resources, scene);
  const counter = createDamageCounter(resources, scene);

  const flight = { state: 'none', releaseAt: 0, launch: { x: 0, y: 0, z: 0 }, hand: { x: 0, y: 0, z: 0 }, landedAt: 0 };
  const body = { d: 0, y: 0, vd: 0, vy: 0, rolling: false, settled: false };
  const slide = { d: variant.targetForward, v: 0 };
  const rest = restingPlaces(variant, THROW_LAUNCH_FORWARD, THROW_LAUNCH_UP);
  let simAt = 0;
  let flinchUntil = 0;

  function placeTarget() {
    target.position.set(dirX * slide.d, REST_Y, dirZ * slide.d);
    flinch.position.copy(target.position);
    placeShadow(targetShadow, target.position.x, target.position.z, 0);
  }

  function fire(frame, ch, patternIdx, quaternion) {
    const p = unit.position;
    if (frame === THROW_STONE_SPAWN_FRAME) {
      const hand = throwStoneHandPoint(p, quaternion, frame, patternIdx, _handPoint, SPRITE_SHEET_FILE);
      stone.position.set(hand.x, hand.y, hand.z);
      stone.material.uniforms.opacity.value = 1;
      stone.visible = true;
      flight.state = 'held';
    } else if (frame === THROW_STONE_RELEASE_FRAME && flight.state === 'held') {
      //NOTE(@jimmylee)
      //Timed from the throw frame's start, leaving the hand of
      //the last held frame, on the arc from the camera-independent release point.
      const hand = throwStoneHandPoint(p, quaternion, THROW_STONE_LAST_HELD_FRAME, patternIdx, _handPoint, SPRITE_SHEET_FILE);
      flight.releaseAt = ch.walkStart + THROW_STONE_RELEASE_S * 1000;
      flight.hand.x = hand.x;
      flight.hand.y = hand.y;
      flight.hand.z = hand.z;
      throwStoneLaunchPoint(p, dirX, dirZ, flight.launch);
      flight.state = 'flying';
    }
  }

  function strike(now) {
    const t = variant.hitS;
    throwStoneFlightPoint(flight.launch, flight.hand, dirX, dirZ, t, stone.position, variant.vh, variant.vv);
    body.d = dirX * stone.position.x + dirZ * stone.position.z;
    body.y = stone.position.y;
    body.vd = variant.stoneAfter;
    body.vy = variant.vv + defaultGravity * t;
    body.rolling = false;
    body.settled = false;
    slide.v = variant.targetKick;
    simAt = flight.releaseAt + t * 1000;
    flinch.userData.character.walkStart = now;
    flinch.visible = true;
    target.visible = false;
    flinchUntil = now + Math.max(FLINCH_SHOW_MS, (slide.v / TARGET_SLIDE_DECEL) * 1000);
    counter.show(now, target.position);
    flight.state = 'hit';
  }

  return {
    def,
    scene,
    roots: [unit, target, flinch],
    props: [{ object: stone, radius: variant.radius }],
    envelope: {
      sprites: [[0, REST_Y, 0], [dirX * variant.targetForward, REST_Y, dirZ * variant.targetForward], [dirX * rest.targetD, REST_Y, dirZ * rest.targetD]],
      hands: heldHands(THROW_STONE_SPAWN_FRAME, THROW_STONE_LAST_HELD_FRAME, 0, variant.radius),
      spheres: [...launchPath(dirX, dirZ, THROW_LAUNCH_FORWARD, REST_Y + THROW_LAUNCH_UP, variant.vh, variant.vv, variant.radius, variant.hitS), [dirX * rest.stoneD, variant.radius, dirZ * rest.stoneD, variant.radius]],
      points: [],
    },
    reset(now) {
      const ch = unit.userData.character;
      settleOnGround(unit, now);
      ch.actionReadyAt = 0;
      ch._actionLastFrame = -1;
      flight.state = 'none';
      stone.visible = false;
      flinch.visible = false;
      target.visible = true;
      counter.hide();
      slide.d = variant.targetForward;
      slide.v = 0;
      placeTarget();
    },
    update(now, dt, step, quaternion) {
      const ch = unit.userData.character;

      if (flinch.visible && now >= flinchUntil) {
        flinch.visible = false;
        target.visible = true;
      }

      if (ch.action === null) {
        if (flight.state === 'none' && canAct(ch, ACTION) && isActionReady(ch, now)) {
          ch.action = { type: ActionType.THROW, startedAt: now };
          ch.walkStart = now;
          ch.lastStep = -1;
          ch.lastFrame = -1;
          ch._actionLastFrame = -1;
          slide.d = variant.targetForward;
          slide.v = 0;
          placeTarget();
        }
      } else {
        const patternIdx = ASSEMBLY_STEP_MAP[(ch.directionOffset + step) % 8];
        const delays = THROW_STONE_DELAY_MAP[patternIdx];
        const { frameIdx, done } = resolveVariableFrame(delays, (now - ch.walkStart) / 1000);
        const effectiveFrame = done ? delays.length - 1 : frameIdx;
        for (let k = 0; k < THROW_TRIGGER_FRAMES.length; k++) {
          const frame = THROW_TRIGGER_FRAMES[k];
          if (frame > ch._actionLastFrame && frame <= effectiveFrame) fire(frame, ch, patternIdx, quaternion);
        }
        ch._actionLastFrame = effectiveFrame;
        if (!done && flight.state === 'held') {
          const hand = throwStoneHandPoint(unit.position, quaternion, frameIdx, patternIdx, _handPoint, SPRITE_SHEET_FILE);
          if (hand) stone.position.set(hand.x, hand.y, hand.z);
        }
        if (done) {
          ch.action = null;
          ch.doneAt = now;
          ch.actionReadyAt = computeActionReadyAt(now, THROW_COOLDOWN_MS);
          ch.lastStep = -1;
          ch.lastFrame = -1;
          ch._actionLastFrame = -1;
        }
      }

      if (flight.state === 'flying') {
        const t = Math.max(0, (now - flight.releaseAt) / 1000);
        if (t >= variant.hitS) strike(now);
        else throwStoneFlightPoint(flight.launch, flight.hand, dirX, dirZ, t, stone.position, variant.vh, variant.vv);
      }
      if (flight.state === 'hit') {
        while (simAt + STONE_STEP_S * 1000 <= now && !body.settled) {
          simAt += STONE_STEP_S * 1000;
          stepLooseStone(body, variant.radius);
          stone.rotation.z -= (body.vd * STONE_STEP_S) / variant.radius;
          if (slide.v > 0) {
            slide.v = Math.max(0, slide.v - TARGET_SLIDE_DECEL * STONE_STEP_S);
            slide.d += slide.v * STONE_STEP_S;
          }
        }
        stone.position.set(dirX * body.d, body.y, dirZ * body.d);
        placeTarget();
        if (body.settled) {
          flight.state = 'landed';
          flight.landedAt = now;
        }
      } else if (flight.state === 'landed') {
        const fade = 1 - (now - flight.landedAt) / STONE_FADE_MS;
        stone.material.uniforms.opacity.value = Math.max(0, fade);
        if (fade <= 0) {
          flight.state = 'none';
          stone.visible = false;
        }
      }
      placeShadow(stoneShadow, stone.position.x, stone.position.z, stone.position.y - variant.radius, stone.visible, 0, variant.radius / SHADOW_RADIUS);
      counter.update(now, target.position);
    },
    playhead(now) {
      const ch = unit.userData.character;
      return ch.action === null && flight.state !== 'flying' ? -1 : ((now - ch.walkStart) * 60) / 1000;
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      const stoneText = flight.state === 'none' ? '' : ` · stone ${flight.state}`;
      if (ch.action === null) return `IDLE · cooldown ${Math.max(0, Math.ceil((ch.actionReadyAt - now) / 100) / 10)}s${stoneText}`;
      const delays = THROW_STONE_DELAY_MAP[ASSEMBLY_STEP_MAP[idx]];
      const { frameIdx } = resolveVariableFrame(delays, (now - ch.walkStart) / 1000);
      const patternIdx = ASSEMBLY_STEP_MAP[idx];
      const grip = (patternIdx < 2 ? STONE_GRIPS.fwd : STONE_GRIPS.bck)[frameIdx];
      const gripText = grip ? ` · hand ${grip.id} (${grip.x}, ${grip.y})` : '';
      return `THROW · frame ${frameIdx + 1}/${delays.length} · pattern ${patternLabel(idx)}${gripText}${stoneText}`;
    },
  };
}

//NOTE(@jimmylee)
//The unit's SEQ lunge on a strike frame, for the status line.
function strikeLunge(def, patternIdx, frameIdx) {
  if (def.pair) return (patternIdx <= 1 ? def.pair.front : def.pair.back).fb?.[frameIdx] ?? 0;
  return def.assembly[patternIdx].frames[frameIdx].move?.fb ?? 0;
}

//NOTE(@jimmylee)
//Punch / stab / every sequence attack: the attacker loops its mode from the settle frame (as the
//engine does); a target standing in reach swaps to the engine flinch group (Mode H) at the contact
//tick of every cycle.
function createStrikeStation(def, env) {
  const gap = def.gap ?? STRIKE_GAP;
  const { archerFloor = 0, targetFloor = 0 } = def;
  const scene = createStationScene(env.resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  unit.position.y = REST_Y + archerFloor;
  scene.add(unit);
  const target = buildCharacter(undefined, 'NW', env.textures, env.now);
  target.position.set(gap, REST_Y + targetFloor, 0);
  target.userData.character.state = State.IDLE;
  scene.add(target);
  const flinch = createFlinchGroup({ textures: env.textures, directionOffset: DIRECTION_OFFSETS.NW, walkStart: env.now, worldX: gap, worldY: target.position.y, worldZ: 0, spriteWidth: SPRITE_WIDTH, spriteHeight: SPRITE_HEIGHT });
  flinch.visible = false;
  scene.add(flinch);
  const corners = [];
  if (archerFloor > 0) corners.push(...createBlock(env.resources, scene, 0, 0, archerFloor));
  if (targetFloor > 0) corners.push(...createBlock(env.resources, scene, gap + (def.ledgeBack ?? 0), 0, targetFloor));
  placeShadow(createShadow(env.resources, scene), 0, 0, 0, true, archerFloor);
  placeShadow(createShadow(env.resources, scene), gap, 0, 0, true, targetFloor);
  const counter = createDamageCounter(env.resources, scene);
  const heldItem = createHeldItem(def, env.resources, scene, unit);
  const bag = def.bag ? createBagRig(def, env.resources, scene, unit, gap) : null;
  const delaysS = msToS(def.delays);
  const cycleMs = sum(def.delays);
  let lastHitCycle = -1;
  let flinchUntil = 0;

  return {
    def,
    scene,
    roots: [unit, target, flinch],
    envelope: { extent: def.pair ? sequenceExtent(def) : SPRITE_EXTENT, sprites: [[0, unit.position.y, 0], [gap, target.position.y, 0]], hands: heldReach(def, env.resources, unit.position.y), spheres: bag ? bagReach(def) : [], points: corners },
    bag: bag?.bag,
    reset(now) {
      settleOnGround(unit, now, REST_Y + archerFloor);
      bag?.reset();
      lastHitCycle = -1;
      flinch.visible = false;
      target.visible = true;
      counter.hide();
    },
    update(now, dt, step, quaternion) {
      const ch = unit.userData.character;
      heldItem?.update(now, step, quaternion);
      bag?.update(now, step, quaternion);
      if (flinch.visible && now >= flinchUntil) {
        flinch.visible = false;
        target.visible = true;
      }
      const elapsed = now - ch.walkStart;
      const cycle = Math.floor(elapsed / cycleMs);
      if (elapsed - cycle * cycleMs >= def.hitMs && lastHitCycle !== cycle) {
        lastHitCycle = cycle;
        flinch.userData.character.walkStart = now;
        flinch.visible = true;
        target.visible = false;
        flinchUntil = now + FLINCH_SHOW_MS;
        counter.show(now, target.position);
      }
      counter.update(now, target.position);
    },
    playhead(now) {
      return loopPlayhead(now, unit.userData.character.walkStart, cycleMs);
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      const { frameIdx } = resolveLoopingFrame(delaysS, cycleMs / 1000, (now - ch.walkStart) / 1000);
      return `IDLE · frame ${frameIdx + 1}/${delaysS.length} · lunge ${strikeLunge(def, ASSEMBLY_STEP_MAP[idx], frameIdx)}px · pattern ${patternLabel(idx)}${flinch.visible ? ` · target hit ${DAMAGE_COUNTER}` : ''}`;
    },
  };
}

//NOTE(@jimmylee)
//A model Set lends in a sequence card's hand (def.held, weapons/held-items.js). Its grip rides the hand the
//drawn frame shows, on the sprite's plane, and it is drawn among the frame's tiles (`held.over`,
//flattenOntoSprite), so a fist closes on a handle and a body stands in front of what is held beyond it. Its
//tilt comes from the front sequence, so it turns in the plane of the unit's facing and world up and
//not with the camera. An `across` item turns in the plane across the body instead. Which way across is the
//sprite's: a mirrored pattern draws the far hand on the unit's other side, so the item goes to the side the
//frame's other hand is drawn on. A `thrown` item leaves the hand as def.plan says (throwItem), and the next
//pass starts with it back in the hand. `aim` is a world point that takes over from the frames that have no
//tilt of their own: the item's barrel, not its grip, lies on the line to it, which `muzzle` is the height of
//above the grip (weapons/set-items.js). The item's own direction says when `over` no longer applies: pointing
//along the view it is end-on (`ch.itemEnd`, heldEnd), in front of every tile or behind them. Null when the stage
//has no models.
const _heldHand = [0, 0];
const _heldShift = [0, 0, 0];
const _heldPoint = { x: 0, y: 0, z: 0 };
const _heldForward = new THREE.Vector3();
const _heldAcross = new THREE.Vector3();
const _heldUp = new THREE.Vector3();
const _heldTurned = new THREE.Vector3();
const _heldBasis = new THREE.Matrix4();
const _aimLine = new THREE.Vector3();
const _toCamera = new THREE.Vector3();
const _thrownLaunch = { x: 0, y: 0, z: 0 };
const THROWN_SETTLE_S = 6 / 60;
const RADIANS = Math.PI / 180;
function createHeldItem(def, resources, scene, unit, aim = null) {
  const { held, plan } = def;
  const thrownFrom = { x: 0, y: 0, z: 0 };
  const model = held ? resources.heldItems.model(held.item) : null;
  if (!model) return null;
  const mesh = new THREE.Mesh(model.geometry, resources.heldItems.materialOf(held.item));
  mesh.scale.setScalar(HELD_ITEM_SCALE);
  mesh.frustumCulled = false;
  mesh.userData.generatedWeapon = true;
  mesh.userData.spritePlane = unit;
  scene.add(mesh);
  const ch = unit.userData.character;
  ch.itemLayer = heldLayers(held, ch.seqFront, ch.seqBack);
  const dirX = directionCoordinates.x[ch.direction] || 0;
  const dirZ = directionCoordinates.z[ch.direction] || 0;
  _heldAcross.set(-dirZ, 0, dirX);
  const acrossX = _heldAcross.x;
  const acrossZ = _heldAcross.z;
  const barrelHeight = (model.muzzle?.[1] ?? 0) * HELD_ITEM_SCALE;
  const roll = (held?.roll ?? 0) * RADIANS;
  const middle = (held.thrown?.middle ?? 0) * HELD_ITEM_SCALE;
  let heldFor = Infinity;

  //NOTE(@jimmylee)
  //The barrel's direction when its line, `barrelHeight` above the grip at `_heldPoint`, runs through `aim`.
  function aimBarrel() {
    _aimLine.set(aim.x - _heldPoint.x, aim.y - _heldPoint.y, aim.z - _heldPoint.z);
    const reach = _aimLine.length();
    _aimLine.divideScalar(reach);
    _heldAcross.set(-_aimLine.z, 0, _aimLine.x).normalize();
    _heldUp.crossVectors(_heldAcross, _aimLine);
    const dip = Math.asin(Math.min(1, barrelHeight / reach));
    _heldForward.copy(_aimLine).multiplyScalar(Math.cos(dip)).addScaledVector(_heldUp, -Math.sin(dip));
  }

  //NOTE(@jimmylee)
  //Writes the item's axes and turns the mesh to them. `side` is which way across the body it goes.
  function faceTilt(tilt, side) {
    const cos = Math.cos(tilt);
    if (held.across) {
      _heldForward.set(acrossX * side * cos, Math.sin(tilt), acrossZ * side * cos);
      _heldAcross.set(-dirX * side, 0, -dirZ * side);
    } else {
      _heldForward.set(dirX * cos, Math.sin(tilt), dirZ * cos);
      _heldAcross.set(acrossX, 0, acrossZ);
    }
  }

  function turnMesh(side) {
    _heldUp.crossVectors(_heldAcross, _heldForward);
    if (roll !== 0) {
      const sin = Math.sin(roll) * side;
      _heldTurned.copy(_heldUp).multiplyScalar(Math.cos(roll)).addScaledVector(_heldAcross, sin);
      _heldAcross.multiplyScalar(Math.cos(roll)).addScaledVector(_heldUp, -sin);
      _heldUp.copy(_heldTurned);
    }
    mesh.quaternion.setFromRotationMatrix(_heldBasis.makeBasis(_heldForward, _heldUp, _heldAcross));
  }

  function update(now, step, quaternion) {
    const patternIdx = ASSEMBLY_STEP_MAP[(ch.directionOffset + step) % 8];
    const front = patternIdx <= 1;
    const entry = front ? ch.seqFront : ch.seqBack;
    const elapsed = Math.max(0, (now - ch.walkStart) / 1000);
    const { frameIdx } = ch.seqLoop && entry.totalS > 0 ? resolveLoopingFrame(entry.delaysS, entry.totalS, elapsed) : resolveVariableFrame(entry.delaysS, elapsed);
    const arm = front ? held.front : held.back;
    heldHand(entry.frames[held.steady ?? frameIdx], arm, _heldHand);
    const lunge = (entry.fb?.[frameIdx] ?? 0) * HAND_PX_X;
    _shooter.x = unit.position.x + dirX * lunge;
    _shooter.y = unit.position.y;
    _shooter.z = unit.position.z + dirZ * lunge;
    const flip = patternIdx === 0 || patternIdx === 3 ? -1 : 1;
    billboardPoint(_shooter, quaternion, _heldHand[0], _heldHand[1] + (entry.du?.[frameIdx] ?? 0), flip, _heldPoint, 0);
    mesh.position.set(_heldPoint.x, _heldPoint.y, _heldPoint.z);

    const frontShp = ch.seqFront.frames[frameIdx];
    const side = arm === 'last' ? flip : -flip;
    if (aim !== null && held.tilt[frontShp] === undefined) {
      aimBarrel();
      _heldUp.crossVectors(_heldAcross, _heldForward);
      mesh.quaternion.setFromRotationMatrix(_heldBasis.makeBasis(_heldForward, _heldUp, _heldAcross));
    } else {
      faceTilt(heldTilt(held, frontShp), side);
      turnMesh(side);
    }
    ch.itemEnd = heldEnd(_heldForward.dot(_toCamera.set(0, 0, 1).applyQuaternion(quaternion)));
    //NOTE(@jimmylee)
    //The other side of the body turns an `across` item half over, which takes its +z with it, so `side`
    //keeps a shift along +z on the same side of the hand.
    heldOffset(held, frontShp, _heldShift);
    mesh.position.addScaledVector(_heldForward, _heldShift[0] + heldSlide(held, frontShp)).addScaledVector(_heldUp, _heldShift[1]).addScaledVector(_heldAcross, _heldShift[2] * side);
    if (held.thrown) throwItem(elapsed);
  }

  //NOTE(@jimmylee)
  //The item's middle flies the planned arc, settling onto it from where the drawn hand let it go, and the
  //item goes over about that middle to arrive along its flight, point first. It stays in the target until
  //the next pass. An item that leaves on the first tick has no frame before its release, so the first frame
  //of a pass, seen as the clock going back, also marks the hand.
  function throwItem(elapsed) {
    const t = Math.min(elapsed - plan.releaseS, plan.flightS);
    if (t < 0 || elapsed < heldFor) {
      thrownFrom.x = mesh.position.x + _heldForward.x * middle;
      thrownFrom.y = mesh.position.y + _heldForward.y * middle;
      thrownFrom.z = mesh.position.z + _heldForward.z * middle;
    }
    heldFor = elapsed;
    mesh.userData.spritePlane = t < 0 ? unit : null;
    if (t < 0) return;
    _thrownLaunch.x = unit.position.x + dirX * plan.launchForward;
    _thrownLaunch.y = unit.position.y + plan.launchUp;
    _thrownLaunch.z = unit.position.z + dirZ * plan.launchForward;
    const point = throwStoneFlightPoint(_thrownLaunch, thrownFrom, dirX, dirZ, t, _heldPoint, plan.vh, plan.vv, THROWN_SETTLE_S);
    faceTilt(plan.tilt + ((plan.arrive - plan.tilt - Math.PI * 2 * held.thrown.turns) * t) / plan.flightS, 1);
    turnMesh(1);
    mesh.position.set(point.x, point.y, point.z).addScaledVector(_heldForward, -middle);
  }

  return { mesh, model, update };
}

//NOTE(@jimmylee)
//Where a held item's tip goes on every frame of its sequence, for the action envelope, in the `hands`
//form: a screen-space offset from the stance point, both ways, because the item turns with the unit. An
//item across the body points anywhere the camera turns it, so its whole length is a radius around the hand.
//`aim` is the tilt in radians of the frames that have none of their own (a gun held on its target).
function heldReach(def, resources, y, aim = null) {
  const { held, pair } = def;
  const model = held ? resources.heldItems.model(held.item) : null;
  if (!model) return [];
  return pair.front.frames.map((shp) => {
    const tilt = aim !== null && held.tilt[shp] === undefined ? aim : heldTilt(held, shp);
    const [u, v] = heldHand(shp, held.front, [0, 0]);
    const length = model.length * HELD_ITEM_SCALE + heldSlide(held, shp);
    if (held.across) return [0, y, 0, Math.abs(u) * HAND_PX_X, -v * HAND_PX_Y, length];
    return [0, y, 0, Math.abs(u) * HAND_PX_X + Math.abs(Math.cos(tilt)) * length, -v * HAND_PX_Y + Math.sin(tilt) * length, 0];
  });
}

//NOTE(@jimmylee)
//A black marble on the hand of each frame, or between the hands on a frame that holds it in both (def.marble,
//weapons/held-items.js), the orb of Throw Stone, among the frame's tiles as a held item is. It draws before
//every tile of its unit, as an item does, so the tiles over it can paint on it: a marble is transparent so it can
//fade, which would sort it among them. `release` lets go of it where it is, and `hold` takes it back. Null on a
//card that holds none.
const HELD_MARBLE_ORDER = -100;
const _marbleHand = [0, 0];
function createMarbleRig(def, env, scene, unit) {
  const { marble } = def;
  if (!marble) return null;
  const { resources } = env;
  const mesh = new THREE.Mesh(marble.radius === MARBLE_RADIUS.big ? resources.bigMarbleGeometry : resources.smallStoneGeometry, createBlackMarbleMaterial(env.textures.skins.blackMarble));
  mesh.material.onBeforeRender = flattenOntoSprite;
  scene.add(mesh);
  const ch = unit.userData.character;
  ch.itemLayer = heldLayers(marble, ch.seqFront, ch.seqBack);
  const dirX = directionCoordinates.x[ch.direction] || 0;
  const dirZ = directionCoordinates.z[ch.direction] || 0;

  function hold() {
    mesh.userData.spritePlane = unit;
    mesh.renderOrder = HELD_MARBLE_ORDER;
    mesh.rotation.set(0, 0, 0);
    mesh.material.uniforms.opacity.value = 1;
    mesh.visible = true;
  }

  function release() {
    mesh.userData.spritePlane = null;
    mesh.renderOrder = 0;
  }

  function update(now, step, quaternion) {
    const patternIdx = ASSEMBLY_STEP_MAP[(ch.directionOffset + step) % 8];
    const front = patternIdx <= 1;
    const entry = front ? ch.seqFront : ch.seqBack;
    const { frameIdx } = resolveVariableFrame(entry.delaysS, Math.max(0, (now - ch.walkStart) / 1000));
    heldMarblePoint(marble, entry.frames[frameIdx], front ? marble.front : marble.back, _marbleHand);
    const lunge = (entry.fb?.[frameIdx] ?? 0) * HAND_PX_X;
    _shooter.x = unit.position.x + dirX * lunge;
    _shooter.y = unit.position.y;
    _shooter.z = unit.position.z + dirZ * lunge;
    billboardPoint(_shooter, quaternion, _marbleHand[0], _marbleHand[1] + (entry.du?.[frameIdx] ?? 0), patternIdx === 0 || patternIdx === 3 ? -1 : 1, _heldPoint, 0);
    mesh.position.set(_heldPoint.x, _heldPoint.y, _heldPoint.z);
  }

  hold();
  return { mesh, radius: marble.radius, hold, release, update };
}

//NOTE(@jimmylee)
//Where a held marble goes on every frame of its sequence, for the action envelope, in the `hands` form.
function marbleReach({ marble, pair }, y) {
  if (!marble) return [];
  return [pair.front, pair.back].flatMap((entry, side) => entry.frames.map((shp) => {
    const [u, v] = heldMarblePoint(marble, shp, side === 0 ? marble.front : marble.back, [0, 0]);
    return [0, y, 0, Math.abs(u) * HAND_PX_X, -v * HAND_PX_Y, marble.radius];
  }));
}

//NOTE(@jimmylee)
//The Cloth Bag cards' bag (weapons/cloth-bag.js): the swing arm's hand on the front sequence, in the plane
//of the unit's facing and world up, drives the simulation in fixed steps, so it never reads the camera, and
//the cord is drawn from the hand the frame shows, on the side of the sprite the swing is on: out in front
//of a unit that faces the camera and beyond one that faces away, so the bag keeps its real depth and passes
//behind the body on the wind-up. The bag hangs from the hand through the wind-up. On the frame the arm comes down, the swing snaps it at a point BAG_DRIVE past the target's front, height by card,
//so it is still moving when it meets the target, on the SEQ's PostGenericAttack (def.bag.snapTick, hitMs).
const BAG_DRIVE = 2;
const _bagHand = [0, 0];
const _bagPoint = { x: 0, y: 0, z: 0 };
function createBagRig(def, resources, scene, unit, targetForward) {
  const { front } = def.pair;
  const ch = unit.userData.character;
  const dirX = directionCoordinates.x[ch.direction] || 0;
  const dirZ = directionCoordinates.z[ch.direction] || 0;
  const bag = createClothBag();
  const mesh = createClothBagMesh(bag, resources.clothBag, resources.heldItems.material, scene);
  const stepMs = CLOTH_BAG_STEP_S * 1000;
  const cycleMs = sum(front.ticks) * (1000 / 60);
  const hitS = def.hitMs / 1000;
  const snapS = def.bag.snapTick / 60;
  const wall = targetForward - CHAR_HALF_Z;
  let simMs = 0;
  let snapped = -1;

  function handAt(entry, frameIdx, out) {
    heldHand(entry.frames[frameIdx], 'first', _bagHand);
    out.x = (-_bagHand[0] + (entry.fb?.[frameIdx] ?? 0)) * HAND_PX_X;
    out.y = -(_bagHand[1] + (entry.du?.[frameIdx] ?? 0)) * HAND_PX_Y;
    return out;
  }

  function frameAt(entry, seconds) {
    return resolveLoopingFrame(entry.delaysS, entry.totalS, seconds).frameIdx;
  }

  function reset() {
    const { x, y } = handAt(front, 0, _bagPoint);
    resetClothBag(bag, x, y);
    bag.wall = wall;
    bag.floor = -REST_Y;
    simMs = 0;
    snapped = -1;
  }

  function update(now, step, quaternion) {
    const elapsed = now - ch.walkStart;
    while (simMs + stepMs <= elapsed) {
      simMs += stepMs;
      const cycle = Math.floor(simMs / cycleMs);
      const seconds = (simMs - cycle * cycleMs) / 1000;
      if (seconds < stepMs / 1000) bag.struck = false;
      if (snapped !== cycle && seconds >= snapS) {
        snapped = cycle;
        whipClothBag(bag, wall - clothBagLength(CLOTH_BAG_SPEC) + BAG_DRIVE, def.bag.strikeUp, hitS - snapS);
      }
      const { x, y } = handAt(ch.seqFront, frameAt(ch.seqFront, seconds), _bagPoint);
      stepClothBag(bag, x, y);
    }
    const patternIdx = ASSEMBLY_STEP_MAP[(ch.directionOffset + step) % 8];
    const entry = patternIdx <= 1 ? ch.seqFront : ch.seqBack;
    const frameIdx = frameAt(entry, elapsed / 1000);
    heldHand(entry.frames[frameIdx], 'first', _heldHand);
    const lunge = (entry.fb?.[frameIdx] ?? 0) * HAND_PX_X;
    _shooter.x = unit.position.x + dirX * lunge;
    _shooter.y = unit.position.y;
    _shooter.z = unit.position.z + dirZ * lunge;
    const flip = patternIdx === 0 || patternIdx === 3 ? -1 : 1;
    billboardPoint(_shooter, quaternion, _heldHand[0], _heldHand[1] + (entry.du?.[frameIdx] ?? 0), flip, _bowHand, patternIdx <= 1 ? THROW_HOLD_DEPTH : -THROW_HOLD_DEPTH);
    syncClothBagMesh(mesh, bag, _bowHand, dirX, dirZ);
  }

  return { bag, reset, update };
}

//NOTE(@jimmylee)
//How far a Cloth Bag card's bag swings, for the action envelope: out to its target, and overhead.
function bagReach({ bag }) {
  const radius = CLOTH_BAG_SPEC.cordLength + clothBagLength(CLOTH_BAG_SPEC);
  return [[0, REST_Y + bag.strikeUp, 0, 1.6 * radius], [-radius, REST_Y + radius, 0, radius]];
}

//NOTE(@jimmylee)
//Bow: the shot the SEQ draws, with a bow generated from BOW_SPEC instead of a sprite. The unit keeps
//the engine's looping group. The bow is a 3D object aimed along the launch (def.plan), so it turns
//with the camera as a sprite cannot; its grip rides the frame's bow hand (frame.bowHand, moved by the
//frame's SEQ lunge along the facing, as the sprite is). weapons/bow.js does the rest in fixed steps,
//so it plays the same at any frame rate: the arrow nocks on the first aim frame, the archer draws the
//string to the draw hand, the hand opens on PlaySound and the string drives the arrow until the nock
//slows. From there the arrow is on the camera-independent arc, settling onto it from the bow it left,
//and the string rings down. The target flinches when the arrow lands, with the arrow stuck in it until
//the next nock. The engine punch keeps its adjacent target and its tick 12 hit in a scene
//(PUNCH_HIT_TICKS): this card is what the sequence itself is.
const _aimX = new THREE.Vector3();
const _aimY = new THREE.Vector3();
const _aimZ = new THREE.Vector3();
const _aimMatrix = new THREE.Matrix4();
const _worldUp = new THREE.Vector3(0, 1, 0);
const _shooter = { x: 0, y: 0, z: 0 };
const _bowHand = { x: 0, y: 0, z: 0 };
const _drawHand = { x: 0, y: 0, z: 0 };
const _arrowTip = { x: 0, y: 0, z: 0 };
const _viewRight = new THREE.Vector3();
const _viewUp = new THREE.Vector3();

function aimProp(prop, x, y, z) {
  _aimX.set(x, y, z).normalize();
  _aimZ.crossVectors(_aimX, _worldUp).normalize();
  _aimY.crossVectors(_aimZ, _aimX);
  prop.quaternion.setFromRotationMatrix(_aimMatrix.makeBasis(_aimX, _aimY, _aimZ));
}

function createBowStation(def, env) {
  const { resources } = env;
  const { plan, archerFloor, targetFloor } = def;
  const scene = createStationScene(resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  unit.position.y = REST_Y + archerFloor;
  scene.add(unit);
  const target = buildCharacter(undefined, 'NW', env.textures, env.now);
  target.position.set(BOW_RANGE, REST_Y + targetFloor, 0);
  target.userData.character.state = State.IDLE;
  scene.add(target);
  const flinch = createFlinchGroup({ textures: env.textures, directionOffset: DIRECTION_OFFSETS.NW, walkStart: env.now, worldX: BOW_RANGE, worldY: target.position.y, worldZ: 0, spriteWidth: SPRITE_WIDTH, spriteHeight: SPRITE_HEIGHT });
  flinch.visible = false;
  scene.add(flinch);
  const corners = [];
  if (archerFloor > 0) corners.push(...createBlock(resources, scene, 0, 0, archerFloor));
  if (targetFloor > 0) corners.push(...createBlock(resources, scene, BOW_RANGE, 0, targetFloor));
  placeShadow(createShadow(resources, scene), 0, 0, 0, true, archerFloor);
  placeShadow(createShadow(resources, scene), BOW_RANGE, 0, 0, true, targetFloor);

  const simulated = createBow(BOW_SPEC);
  const bow = createBowMesh(simulated, { stave: resources.heldItems.material, string: resources.stringMaterial });
  bow.traverse((part) => {
    part.userData.spritePlane = unit;
  });
  scene.add(bow);
  const arrow = createArrowMesh({ shaft: resources.arrowShaftGeometry, head: resources.arrowHeadGeometry, vanes: resources.arrowVanesGeometry }, { shaft: resources.arrowShaftMaterial, head: resources.heldItems.material, vanes: resources.arrowVanesMaterial });
  arrow.visible = false;
  scene.add(arrow);
  const counter = createDamageCounter(resources, scene);

  const ch0 = unit.userData.character;
  ch0.itemLayer = BOW_LAYER;
  const flattenArrow = (plane) => {
    arrow.traverse((part) => {
      part.userData.spritePlane = plane;
    });
  };
  const dirX = directionCoordinates.x[ch0.direction] || 0;
  const dirZ = directionCoordinates.z[ch0.direction] || 0;
  const cosAim = Math.cos(plan.angle);
  const aimX = dirX * cosAim;
  const aimY = Math.sin(plan.angle);
  const aimZ = dirZ * cosAim;
  aimProp(bow, aimX, aimY, aimZ);
  const delaysS = msToS(def.delays);
  const cycleMs = sum(def.delays);
  const stepMs = BOW_STEP_S * 1000;
  const launch = { x: 0, y: 0, z: 0 };
  const leftBow = { x: 0, y: 0, z: 0 };
  let simMs = 0;
  let arrowState = 'none';
  let leftAt = 0;
  let flinchUntil = 0;
  let handGapPx = -1;

  return {
    def,
    scene,
    roots: [unit, target, flinch],
    simulated,
    envelope: {
      extent: SPRITE_EXTENT,
      sprites: [[0, unit.position.y, 0], [BOW_RANGE, target.position.y, 0]],
      hands: [[0, unit.position.y, 0, 13 * HAND_PX_X, 0, BOW_REACH + 8.5 * HAND_PX_Y]],
      spheres: launchPath(dirX, dirZ, plan.launchForward, unit.position.y + plan.launchUp, plan.vh, plan.vv, 1, plan.flightS),
      points: corners,
    },
    reset(now) {
      settleOnGround(unit, now, REST_Y + archerFloor);
      simMs = 0;
      resetBow(simulated);
      syncBowMesh(bow, simulated);
      arrowState = 'none';
      flattenArrow(unit);
      handGapPx = -1;
      arrow.visible = false;
      flinch.visible = false;
      target.visible = true;
      counter.hide();
    },
    update(now, dt, step, quaternion) {
      const ch = unit.userData.character;
      if (flinch.visible && now >= flinchUntil) {
        flinch.visible = false;
        target.visible = true;
      }
      const elapsed = now - ch.walkStart;
      const pattern = def.assembly[ASSEMBLY_STEP_MAP[(ch.directionOffset + step) % 8]];
      const { frameIdx } = resolveLoopingFrame(delaysS, cycleMs / 1000, elapsed / 1000);
      const frame = pattern.frames[frameIdx];
      const flip = pattern.reversed ? -1 : 1;

      //NOTE(@jimmylee)
      //Every step reads its own tick, so the shot does not depend on how a frame falls.
      while (simMs + stepMs <= elapsed) {
        simMs += stepMs;
        const tick = ((simMs % cycleMs) * 60) / 1000;
        stepBow(simulated, bowPull(BOW_SPEC, tick, BOW_NOCK_TICKS, BOW_ANCHOR_TICKS, BOW_SHOT_TICKS));
        if (arrowState === 'nocked' && !simulated.arrowOn) leftAt = simMs + ch.walkStart;
      }
      syncBowMesh(bow, simulated);

      const lunge = frame.move.fb * HAND_PX_X;
      _shooter.x = unit.position.x + dirX * lunge;
      _shooter.y = unit.position.y;
      _shooter.z = unit.position.z + dirZ * lunge;
      const hand = billboardPoint(_shooter, quaternion, frame.bowHand[0], frame.bowHand[1], flip, _bowHand, 0);
      bow.position.set(hand.x, hand.y, hand.z);
      //NOTE(@jimmylee)
      //An arrow on the string lies along the arm, and it is the line a shot reads by, so a unit facing the
      //camera draws it over that arm.
      for (let i = 0; i < arrow.children.length; i++) arrow.children[i].userData.overTiles = ASSEMBLY_STEP_MAP[(ch.directionOffset + step) % 8] <= 1;

      if (simulated.arrowOn) {
        const nock = simulated.x[simulated.nodes];
        if (arrowState !== 'nocked') flattenArrow(unit);
        arrowState = 'nocked';
        arrow.position.set(hand.x + aimX * nock, hand.y + aimY * nock, hand.z + aimZ * nock);
        arrow.quaternion.copy(bow.quaternion);
        if (frame.drawHand) {
          const drawn = billboardPoint(_shooter, quaternion, frame.drawHand[0], frame.drawHand[1], flip, _drawHand);
          _viewRight.set(1, 0, 0).applyQuaternion(quaternion);
          _viewUp.set(0, 1, 0).applyQuaternion(quaternion);
          const gapX = arrow.position.x - drawn.x;
          const gapY = arrow.position.y - drawn.y;
          const gapZ = arrow.position.z - drawn.z;
          handGapPx = Math.hypot((gapX * _viewRight.x + gapY * _viewRight.y + gapZ * _viewRight.z) / HAND_PX_X, (gapX * _viewUp.x + gapY * _viewUp.y + gapZ * _viewUp.z) / HAND_PX_Y);
        }
      } else if (arrowState === 'nocked') {
        arrowState = 'flying';
        flattenArrow(null);
        handGapPx = -1;
        launch.x = dirX * plan.launchForward;
        launch.y = unit.position.y + plan.launchUp;
        launch.z = dirZ * plan.launchForward;
        const ahead = simulated.arrowX + BOW_SPEC.arrowLength;
        leftBow.x = hand.x + aimX * ahead;
        leftBow.y = hand.y + aimY * ahead;
        leftBow.z = hand.z + aimZ * ahead;
      }

      if (arrowState === 'flying') {
        const t = Math.min((now - leftAt) / 1000, plan.flightS);
        const tip = throwStoneFlightPoint(launch, leftBow, dirX, dirZ, t, _arrowTip, plan.vh, plan.vv, ARROW_SETTLE_S);
        const settling = t < ARROW_SETTLE_S ? 1 / ARROW_SETTLE_S : 0;
        const vx = dirX * plan.vh - (leftBow.x - launch.x) * settling;
        const vy = plan.vv + defaultGravity * t - (leftBow.y - launch.y) * settling;
        const vz = dirZ * plan.vh - (leftBow.z - launch.z) * settling;
        aimProp(arrow, vx, vy, vz);
        arrow.position.set(tip.x - _aimX.x * BOW_SPEC.arrowLength, tip.y - _aimX.y * BOW_SPEC.arrowLength, tip.z - _aimX.z * BOW_SPEC.arrowLength);
        if (t === plan.flightS) {
          arrowState = 'stuck';
          flinch.userData.character.walkStart = now;
          flinch.visible = true;
          target.visible = false;
          flinchUntil = now + FLINCH_SHOW_MS;
          counter.show(now, target.position);
        }
      }
      arrow.visible = arrowState !== 'none';
      counter.update(now, target.position);
    },
    playhead(now) {
      return loopPlayhead(now, unit.userData.character.walkStart, cycleMs);
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      const { frameIdx } = resolveLoopingFrame(delaysS, cycleMs / 1000, (now - ch.walkStart) / 1000);
      const pattern = `pattern ${patternLabel(idx)} · frame ${frameIdx + 1}/${delaysS.length}`;
      const nock = (-simulated.x[simulated.nodes]).toFixed(1);
      if (arrowState === 'nocked') return `AIM ${def.aim} · draw ${nock} · force ${Math.round(simulated.nockForce)} · hand ${handGapPx < 0 ? '-' : handGapPx.toFixed(1)}px · ${pattern}`;
      const arrowText = arrowState === 'none' ? '' : ` · arrow ${arrowState} ${Math.round(BOW_SHOT.speed)} u/s`;
      return `AIM ${def.aim}${flinch.visible ? ` · target hit ${DAMAGE_COUNTER}` : ''}${arrowText} · string ${nock} · ${pattern}`;
    },
  };
}

//NOTE(@jimmylee)
//Gun: Bow's three heights. The unit loops its sequence with Set's rifle in its hand, its barrel on the target
//from the first aim frame. The shot crosses the gap in GUN_FLIGHT_TICKS and lands on the SEQ's
//PostGenericAttack: the muzzle flashes, the rifle kicks back along its aim, and a light streak with a red
//tip leaves the opening of the barrel along the barrel's own line. That line is fixed when the shot leaves,
//and the streak's tail runs out of it GUN_FLIGHT_TICKS after the tip lands. The target flinches on the
//SEQ's tick. All of it runs on the demo clock.
const GUN_FLIGHT_TICKS = 2;
const GUN_FLASH_TICKS = 4;
const GUN_STREAK_LENGTH = 30;
const GUN_KICK = 1.6;
const GUN_TARGET_UP = 4;
const _muzzle = new THREE.Vector3();
const _barrel = new THREE.Vector3();
const _kick = new THREE.Vector3();

function createGunStation(def, env) {
  const { resources } = env;
  const { plan, archerFloor, targetFloor } = def;
  const scene = createStationScene(resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  unit.position.y = REST_Y + archerFloor;
  scene.add(unit);
  const target = buildCharacter(undefined, 'NW', env.textures, env.now);
  target.position.set(BOW_RANGE, REST_Y + targetFloor, 0);
  target.userData.character.state = State.IDLE;
  scene.add(target);
  const flinch = createFlinchGroup({ textures: env.textures, directionOffset: DIRECTION_OFFSETS.NW, walkStart: env.now, worldX: BOW_RANGE, worldY: target.position.y, worldZ: 0, spriteWidth: SPRITE_WIDTH, spriteHeight: SPRITE_HEIGHT });
  flinch.visible = false;
  scene.add(flinch);
  const corners = [];
  if (archerFloor > 0) corners.push(...createBlock(resources, scene, 0, 0, archerFloor));
  if (targetFloor > 0) corners.push(...createBlock(resources, scene, BOW_RANGE, 0, targetFloor));
  placeShadow(createShadow(resources, scene), 0, 0, 0, true, archerFloor);
  placeShadow(createShadow(resources, scene), BOW_RANGE, 0, 0, true, targetFloor);
  const counter = createDamageCounter(resources, scene);
  const aimPoint = new THREE.Vector3(BOW_RANGE, target.position.y + GUN_TARGET_UP, 0);
  const heldItem = createHeldItem(def, resources, scene, unit, aimPoint);
  const flash = createMuzzleFlash(resources.heldItems, scene);
  const streak = createStreak(resources.heldItems, scene);
  const bore = heldItem ? heldItem.model.bore * HELD_ITEM_SCALE : 0;
  const delaysS = msToS(def.delays);
  const cycleMs = sum(def.delays);
  const flashMs = ticksToMs(GUN_FLASH_TICKS);
  const flightMs = ticksToMs(GUN_FLIGHT_TICKS);
  const fireMs = def.hitMs - flightMs;
  const shot = { from: new THREE.Vector3(), along: new THREE.Vector3(), reach: 0 };
  let lastShot = -1;
  let lastHit = -1;
  let shotAt = -Infinity;
  let flinchUntil = 0;

  function barrelMuzzle() {
    _barrel.set(1, 0, 0).applyQuaternion(heldItem.mesh.quaternion);
    _muzzle.fromArray(heldItem.model.muzzle).multiplyScalar(HELD_ITEM_SCALE).applyQuaternion(heldItem.mesh.quaternion).add(heldItem.mesh.position);
  }

  return {
    def,
    scene,
    roots: [unit, target, flinch],
    shot,
    envelope: { extent: sequenceExtent(def), sprites: [[0, unit.position.y, 0], [BOW_RANGE, target.position.y, 0]], hands: heldReach(def, resources, unit.position.y, plan.angle), spheres: [], points: corners },
    reset(now) {
      settleOnGround(unit, now, REST_Y + archerFloor);
      lastShot = -1;
      lastHit = -1;
      shotAt = -Infinity;
      flinch.visible = false;
      target.visible = true;
      counter.hide();
    },
    update(now, dt, step, quaternion) {
      const ch = unit.userData.character;
      heldItem?.update(now, step, quaternion);
      if (flinch.visible && now >= flinchUntil) {
        flinch.visible = false;
        target.visible = true;
      }
      const elapsed = now - ch.walkStart;
      const cycle = Math.floor(elapsed / cycleMs);
      const inCycle = elapsed - cycle * cycleMs;
      if (heldItem && inCycle >= fireMs && lastShot !== cycle) {
        lastShot = cycle;
        shotAt = ch.walkStart + cycle * cycleMs + fireMs;
        barrelMuzzle();
        shot.from.copy(_muzzle);
        shot.along.copy(_barrel);
        shot.reach = _aimX.subVectors(aimPoint, _muzzle).dot(_barrel);
      }
      if (inCycle >= def.hitMs && lastHit !== cycle) {
        lastHit = cycle;
        flinch.userData.character.walkStart = now;
        flinch.visible = true;
        target.visible = false;
        flinchUntil = now + FLINCH_SHOW_MS;
        counter.show(now, target.position);
      }
      counter.update(now, target.position);

      const since = now - shotAt;
      const flashing = heldItem !== null && since < flashMs;
      const flying = heldItem !== null && since < flightMs * 2;
      flash.visible = flashing;
      streak.visible = flying;
      if (flashing) {
        const left = 1 - since / flashMs;
        _kick.set(1, 0, 0).applyQuaternion(heldItem.mesh.quaternion).multiplyScalar(-GUN_KICK * left);
        heldItem.mesh.position.add(_kick);
        barrelMuzzle();
        flash.position.copy(_muzzle);
        flash.scale.setScalar(left);
      }
      if (!flying) return;
      const tip = Math.min(1, since / flightMs) * shot.reach;
      const tail = Math.max(0, Math.max(0, since - flightMs) / flightMs * shot.reach, tip - GUN_STREAK_LENGTH);
      streak.position.copy(shot.from).addScaledVector(shot.along, tail);
      streak.scale.set(Math.max(tip - tail, 1e-3), bore, bore);
      aimProp(streak, shot.along.x, shot.along.y, shot.along.z);
    },
    playhead(now) {
      return loopPlayhead(now, unit.userData.character.walkStart, cycleMs);
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      const { frameIdx } = resolveLoopingFrame(delaysS, cycleMs / 1000, (now - ch.walkStart) / 1000);
      return `AIM ${def.aim} · frame ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)}${flinch.visible ? ` · target hit ${DAMAGE_COUNTER}` : ''}`;
    },
  };
}

//NOTE(@jimmylee)
//Mid Jump, High Jump Hold and High Jump Land: the chain each one belongs to (def.leap, a take-off, the
//held air pose, the landing), on the mode's own sequence group. The driver draws the idle sprite while
//the unit is FALLING, which is how the unit rests between jumps.
function createLeapStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(env.resources, scene);
  const ch = unit.userData.character;
  const { leap } = def;
  const touchdownTicks = leap.takeoffTicks + leap.airTicks;
  const endTicks = touchdownTicks + leap.landTicks;
  let phase = 'take-off';
  let startedAt = 0;
  let readyAt = 0;

  function start(now) {
    if (ch.state !== State.IDLE) transition(ch, State.IDLE);
    setSequencePair(unit, leap.takeoff, false, ch.seqWater, now);
    phase = 'take-off';
    startedAt = now;
  }

  return {
    def,
    scene,
    roots: [unit],
    envelope: { extent: sequenceExtent({ pair: leap.takeoff, also: [leap.air, leap.land] }), sprites: [[0, REST_Y, 0], [0, REST_Y + JUMP_LIFT_HEIGHT, 0]], spheres: [], points: createJumpReference(env.resources, scene) },
    reset(now) {
      settleOnGround(unit, now);
      placeShadow(shadow, 0, 0, 0);
      start(now);
    },
    update(now) {
      if (phase === 'rest') {
        if (now >= readyAt) start(now);
        return;
      }
      const ticks = ((now - startedAt) * 60) / 1000;
      if (phase === 'take-off' && ticks >= leap.takeoffTicks) {
        setSequencePair(unit, leap.air, false, ch.seqWater, startedAt + ticksToMs(leap.takeoffTicks));
        phase = 'air';
      }
      if (phase === 'air') {
        unit.position.y = REST_Y + leapHeight(leap, ticks - leap.takeoffTicks);
        if (ticks >= touchdownTicks) {
          unit.position.y = REST_Y;
          setSequencePair(unit, leap.land, false, ch.seqWater, startedAt + ticksToMs(touchdownTicks));
          phase = 'landing';
        }
        placeShadow(shadow, 0, 0, unit.position.y - REST_Y);
      }
      if (phase === 'landing' && ticks >= endTicks) {
        transition(ch, State.FALLING);
        phase = 'rest';
        readyAt = now + REPLAY_DWELL_MS;
      }
    },
    playhead(now) {
      return phase === 'rest' ? -1 : ((now - startedAt) * 60) / 1000;
    },
    status(now, step) {
      const idx = (ch.directionOffset + step) % 8;
      if (phase === 'rest') return `IDLE · pattern ${patternLabel(idx)} · step ${step}`;
      const entry = ASSEMBLY_STEP_MAP[idx] <= 1 ? ch.seqFront : ch.seqBack;
      const { frameIdx } = resolveVariableFrame(entry.delaysS, (now - ch.walkStart) / 1000);
      return `${phase} · F${entry.frames[frameIdx] + (ch.seqWater ? SHP_WATER_OFFSET : 0)} · height ${((unit.position.y - REST_Y) / cubeSize).toFixed(2)} cubes · pattern ${patternLabel(idx)}`;
    },
  };
}

//NOTE(@jimmylee)
//Jump Down: the unit stands on a ledge, its sequence plays once and the unit crosses to the floor over
//the air frames (def.leaveTicks to def.landTicks). It rests, dithers away with the engine's despawn
//fade and comes back on the ledge with the spawn fade, because nothing walks it back up.
function jumpDownPath() {
  const path = [];
  for (let i = 0; i <= STONE_PATH_SAMPLES; i++) {
    const s = i / STONE_PATH_SAMPLES;
    path.push([-JUMP_DOWN_TRAVEL * (1 - s), REST_Y + jumpDownHeight(s), 0]);
  }
  return path;
}

function createJumpDownStation(def, env) {
  const { resources } = env;
  const scene = createStationScene(resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(resources, scene);
  const corners = createBlock(resources, scene, -JUMP_DOWN_TRAVEL, 0, JUMP_DOWN_LEDGE);
  const fade = createBayerFade(unit, shadow);
  const ch = unit.userData.character;
  const ledgeY = REST_Y + JUMP_DOWN_LEDGE;
  const delaysS = msToS(def.delays);
  const endTicks = sum(def.timeline.ticks);
  let phase = 'jump';
  let startedAt = 0;

  function dropShadow() {
    const onLedge = unit.position.x < -JUMP_DOWN_TRAVEL + cubeSize / 2;
    const floorY = onLedge ? JUMP_DOWN_LEDGE : 0;
    placeShadow(shadow, unit.position.x, 0, unit.position.y - REST_Y - floorY, true, floorY);
  }

  function toLedge() {
    unit.position.x = -JUMP_DOWN_TRAVEL;
    unit.position.y = ledgeY;
  }

  function start(now) {
    if (ch.state !== State.IDLE) transition(ch, State.IDLE);
    setSequencePair(unit, def.pair, false, ch.seqWater, now);
    phase = 'jump';
    startedAt = now;
  }

  return {
    def,
    scene,
    roots: [unit],
    envelope: { extent: sequenceExtent(def), sprites: jumpDownPath(), spheres: [], points: corners },
    reset(now) {
      settleOnGround(unit, now, ledgeY);
      toLedge();
      dropShadow();
      fade.set(1);
      start(now);
    },
    update(now) {
      const ticks = ((now - startedAt) * 60) / 1000;
      if (phase === 'jump') {
        const s = Math.max(0, Math.min(1, (ticks - def.leaveTicks) / (def.landTicks - def.leaveTicks)));
        unit.position.x = JUMP_DOWN_TRAVEL * (s - 1);
        unit.position.y = REST_Y + jumpDownHeight(s);
        if (ticks >= endTicks) {
          transition(ch, State.FALLING);
          phase = 'rest';
          startedAt = now;
        }
      } else if (phase === 'rest') {
        if (now - startedAt >= REPLAY_DWELL_MS) {
          phase = 'fade out';
          startedAt = now;
        }
      } else if (phase === 'fade out') {
        if (computeDespawnProgress(startedAt, now) === 0) {
          toLedge();
          phase = 'fade in';
          startedAt = now;
        }
      } else if (phase === 'fade in') {
        if (computeSpawnProgress(startedAt, now) === 1) {
          phase = 'ready';
          startedAt = now;
        }
      } else if (now - startedAt >= REPLAY_DWELL_MS) {
        start(now);
      }
      dropShadow();
      if (phase === 'fade out') fade.set(computeDespawnProgress(startedAt, now));
      else if (phase === 'fade in') fade.set(computeSpawnProgress(startedAt, now));
      else fade.set(1);
    },
    playhead(now) {
      return phase === 'jump' ? ((now - startedAt) * 60) / 1000 : -1;
    },
    status(now, step) {
      const idx = (ch.directionOffset + step) % 8;
      if (phase !== 'jump') return `${phase === 'rest' || phase === 'ready' ? 'IDLE' : phase} · pattern ${patternLabel(idx)} · step ${step}`;
      const { frameIdx } = resolveVariableFrame(delaysS, (now - ch.walkStart) / 1000);
      return `JUMP DOWN · draw ${frameIdx + 1}/${delaysS.length} · height ${((unit.position.y - REST_Y) / cubeSize).toFixed(2)} cubes · pattern ${patternLabel(idx)}`;
    },
  };
}

//NOTE(@jimmylee)
//Teleport: the sequence plays while the engine's despawn fade dithers the unit away. Nothing is drawn
//for TELEPORT_GAP_TICKS, then it plays again on the next tile while the spawn fade brings the unit
//back. Bayer dither leaves its zero-threshold cells at progress 0, so the gap hides the group.
function createTeleportStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(env.resources, scene);
  const fade = createBayerFade(unit, shadow);
  const ch = unit.userData.character;
  const delaysS = msToS(def.delays);
  const gapEnd = def.outTicks + TELEPORT_GAP_TICKS;
  const endTicks = gapEnd + def.inTicks;
  let phase = 'fade out';
  let side = -1;
  let startedAt = 0;

  function start(now) {
    if (ch.state !== State.IDLE) transition(ch, State.IDLE);
    setSequencePair(unit, def.pair, false, ch.seqWater, now);
    phase = 'fade out';
    startedAt = now;
  }

  function progressAt(now) {
    if (phase === 'fade out') return computeDespawnProgress(startedAt, now);
    if (phase === 'fade in') return computeSpawnProgress(startedAt + ticksToMs(gapEnd), now);
    return 1;
  }

  return {
    def,
    scene,
    roots: [unit],
    envelope: { extent: sequenceExtent(def), sprites: [[-TELEPORT_OFFSET, REST_Y, 0], [TELEPORT_OFFSET, REST_Y, 0]], spheres: [], points: [] },
    reset(now) {
      settleOnGround(unit, now);
      side = -1;
      unit.position.x = side * TELEPORT_OFFSET;
      unit.visible = true;
      start(now);
      placeShadow(shadow, unit.position.x, 0, 0);
      fade.set(1);
    },
    update(now) {
      const ticks = ((now - startedAt) * 60) / 1000;
      if (phase === 'fade out' && ticks >= def.outTicks) {
        side = -side;
        unit.position.x = side * TELEPORT_OFFSET;
        unit.visible = false;
        phase = 'gap';
      } else if (phase === 'gap' && ticks >= gapEnd) {
        setSequencePair(unit, def.pair, false, ch.seqWater, startedAt + ticksToMs(gapEnd));
        unit.visible = true;
        phase = 'fade in';
      } else if (phase === 'fade in' && ticks >= endTicks) {
        transition(ch, State.FALLING);
        phase = 'rest';
        startedAt = now;
      } else if (phase === 'rest' && now - startedAt >= REPLAY_DWELL_MS * 2) {
        start(now);
      }
      placeShadow(shadow, unit.position.x, 0, 0, phase !== 'gap');
      fade.set(progressAt(now));
    },
    playhead(now) {
      return phase === 'rest' ? -1 : ((now - startedAt) * 60) / 1000;
    },
    status(now, step) {
      const idx = (ch.directionOffset + step) % 8;
      if (phase === 'rest') return `IDLE · pattern ${patternLabel(idx)} · step ${step}`;
      if (phase === 'gap') return `gap · nothing drawn · pattern ${patternLabel(idx)}`;
      const { frameIdx } = resolveVariableFrame(delaysS, (now - ch.walkStart) / 1000);
      return `${phase} ${Math.round(progressAt(now) * 100)}% · draw ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)}`;
    },
  };
}

//NOTE(@jimmylee)
//Magic Charge and the looping sequence modes: the mode loops from the settle frame, as the engine
//draws it while it charges.
function createLoopStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  scene.add(unit);
  placeShadow(createShadow(env.resources, scene), 0, 0, 0);
  const delaysS = msToS(def.delays);
  const cycleMs = sum(def.delays);

  return {
    def,
    scene,
    roots: [unit],
    envelope: { extent: def.pair ? sequenceExtent(def) : SPRITE_EXTENT, sprites: [[0, REST_Y, 0]], spheres: [], points: [] },
    reset(now) {
      settleOnGround(unit, now);
    },
    update() {},
    playhead(now) {
      return loopPlayhead(now, unit.userData.character.walkStart, cycleMs);
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      const { frameIdx } = resolveLoopingFrame(delaysS, cycleMs / 1000, (now - ch.walkStart) / 1000);
      return `IDLE · frame ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)} · step ${step}`;
    },
  };
}

//NOTE(@jimmylee)
//Mode T: a catch-and-throw with a kinematic marble. The marble rests on the floor in
//front of the unit. When the action starts it is caught: its body rises on the hold point
//(CAUGHT_MARBLE_FORWARD_OFFSET, quickThrowHoldHeight), and the T visual driver draws it on the hand
//(ch._heldMarble, quickThrowMarblePoint). At QT_RELEASE_MS the body leaves overhead
//on the deflectLaunchVH / deflectLaunchVV arc and stops on the floor; the next pass waits for a new marble.
function createQuickThrowStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter('T', 'SE', env.textures, env.now);
  scene.add(unit);
  placeShadow(createShadow(env.resources, scene), 0, 0, 0);
  const marble = new THREE.Mesh(env.resources.stoneGeometry, createBlackMarbleMaterial(env.textures.skins.blackMarble));
  scene.add(marble);
  const marbleShadow = createShadow(env.resources, scene);
  const delaysS = msToS(def.delays);
  const ch0 = unit.userData.character;
  const dirX = directionCoordinates.x[ch0.direction] || 0;
  const dirZ = directionCoordinates.z[ch0.direction] || 0;
  const hold = { x: dirX * CAUGHT_MARBLE_FORWARD_OFFSET, y: REST_Y + quickThrowHoldHeight(QT_RELEASE_MS), z: dirZ * CAUGHT_MARBLE_FORWARD_OFFSET };
  const flight = { state: 'resting', releaseAt: 0, landedAt: 0 };
  const landT = fallTime(hold.y - sphereRadius, deflectLaunchVV);
  let readyAt = 0;

  function putDown() {
    marble.position.set(hold.x, sphereRadius, hold.z);
    marble.material.uniforms.opacity.value = 1;
    marble.visible = true;
    flight.state = 'resting';
  }

  return {
    def,
    scene,
    roots: [unit],
    props: [{ object: marble, radius: sphereRadius }],
    envelope: { sprites: [[0, REST_Y, 0]], hands: heldHands(QT_PICKUP_FRAME, QT_RELEASE_FRAME, -2), spheres: [[hold.x, sphereRadius, hold.z, sphereRadius], ...launchPath(dirX, dirZ, CAUGHT_MARBLE_FORWARD_OFFSET, hold.y, deflectLaunchVH, deflectLaunchVV)], points: [] },
    reset(now) {
      settleOnGround(unit, now);
      ch0._heldMarble = null;
      putDown();
      readyAt = now;
    },
    update(now) {
      const ch = unit.userData.character;
      if (ch.action !== null && now - ch.walkStart >= QT_CYCLE_MS) {
        ch.action = null;
        ch.lastStep = -1;
        ch.lastFrame = -1;
      }
      if (ch.action === null && flight.state === 'resting' && now >= readyAt) {
        ch.action = { type: ActionType.QUICK_THROW, startedAt: now };
        ch.walkStart = now;
        ch.lastStep = -1;
        ch.lastFrame = -1;
        ch._heldMarble = createHeldMarble(marble, SPRITE_SHEET_FILE);
        flight.state = 'held';
      }
      if (flight.state === 'held') marble.position.set(hold.x, REST_Y + quickThrowHoldHeight(now - ch.walkStart), hold.z);
      if (flight.state === 'held' && now - ch.walkStart >= QT_RELEASE_MS) {
        flight.releaseAt = ch.walkStart + QT_RELEASE_MS;
        flight.state = 'flying';
      }
      if (flight.state === 'flying') {
        const t = Math.min((now - flight.releaseAt) / 1000, landT);
        marble.position.set(hold.x + dirX * deflectLaunchVH * t, hold.y + deflectLaunchVV * t + 0.5 * defaultGravity * t * t, hold.z + dirZ * deflectLaunchVH * t);
        if (t === landT) {
          marble.position.y = sphereRadius;
          flight.state = 'landed';
          flight.landedAt = now;
        }
      } else if (flight.state === 'landed') {
        const fade = 1 - (now - flight.landedAt) / STONE_FADE_MS;
        marble.material.uniforms.opacity.value = Math.max(0, fade);
        if (fade <= 0) {
          putDown();
          readyAt = now + REPLAY_DWELL_MS;
        }
      }
      placeShadow(marbleShadow, marble.position.x, marble.position.z, marble.position.y - sphereRadius, marble.visible);
    },
    playhead(now) {
      const ch = unit.userData.character;
      return ch.action === null ? -1 : ((now - ch.walkStart) * 60) / 1000;
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      if (ch.action === null) return `IDLE · pattern ${patternLabel(idx)} · marble ${flight.state}`;
      const { frameIdx } = resolveVariableFrame(delaysS, (now - ch.walkStart) / 1000);
      const patternIdx = ASSEMBLY_STEP_MAP[idx];
      const grip = (patternIdx < 2 ? STONE_GRIPS.fwd : STONE_GRIPS.bck)[frameIdx];
      const gripText = grip && frameIdx <= QT_RELEASE_FRAME ? ` · hand ${grip.id} (${grip.x}, ${grip.y})` : '';
      return `THROW · frame ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)}${gripText} · marble ${flight.state}`;
    },
  };
}

//NOTE(@jimmylee)
//Flinch / Kneel / Dead: the single-pose modes. Kneel and Dead rest on their shorter bodies, the pivot
//rise below the stance height.
const POSE_BODY_Y = { H: REST_Y, K: REST_Y - KNEEL_PIVOT_RISE, D: REST_Y - DEAD_PIVOT_RISE };
function createPoseStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  unit.position.y = POSE_BODY_Y[def.mode];
  scene.add(unit);
  placeShadow(createShadow(env.resources, scene), 0, 0, 0);
  const counter = def.repeatsDamage ? createDamageCounter(env.resources, scene) : null;
  const delaysS = def.delays ? msToS(def.delays) : null;
  let nextDamage = 0;

  return {
    def,
    scene,
    roots: [unit],
    envelope: { extent: POSE_EXTENT, sprites: [[0, REST_Y, 0]], spheres: [], points: [] },
    reset(now) {
      unit.userData.character.walkStart = now;
      nextDamage = now;
    },
    update(now) {
      if (!counter) return;
      if (now >= nextDamage) {
        counter.show(now, unit.position);
        nextDamage = now + ticksToMs(COUNTER_TICKS) + REPLAY_DWELL_MS;
      }
      counter.update(now, unit.position);
    },
    playhead(now) {
      return delaysS ? loopPlayhead(now, unit.userData.character.walkStart, sum(def.delays)) : -1;
    },
    status(now, step) {
      const ch = unit.userData.character;
      const idx = (ch.directionOffset + step) % 8;
      if (!delaysS) return `${ch.state} · pose · pattern ${patternLabel(idx)} · step ${step}`;
      const { frameIdx } = resolveLoopingFrame(delaysS, sum(delaysS), (now - ch.walkStart) / 1000);
      return `KNOCKBACK · shiver ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)} · step ${step}`;
    },
  };
}

//NOTE(@jimmylee)
//Bounced to Death / Revived / the one-shot sequence modes: the sequence, its held last frame, then
//the next pass. A single held frame is the same cycle with nothing to play.
function createReactionStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(env.resources, scene);
  placeShadow(shadow, 0, 0, 0);
  const ch0 = unit.userData.character;
  const heldItem = createHeldItem(def, env.resources, scene, unit);
  const marble = createMarbleRig(def, env, scene, unit);
  const delaysS = msToS(def.delays);
  const cycleMs = sum(def.delays) + REACTION_HOLD_MS;

  return {
    def,
    scene,
    roots: [unit],
    props: marble ? [{ object: marble.mesh, radius: marble.radius }] : undefined,
    envelope: { extent: def.pair ? sequenceExtent(def) : REACTION_EXTENT, sprites: [[0, REST_Y, 0]], hands: [...heldReach(def, env.resources, REST_Y), ...marbleReach(def, REST_Y)], spheres: [], points: [] },
    reset(now) {
      settleOnGround(unit, now);
    },
    update(now, dt, step, quaternion) {
      heldItem?.update(now, step, quaternion);
      marble?.update(now, step, quaternion);
      if (now - ch0.walkStart < cycleMs) return;
      ch0.walkStart = now;
      ch0.lastFrame = -1;
    },
    playhead(now) {
      return (Math.min(now - ch0.walkStart, sum(def.delays)) * 60) / 1000;
    },
    status(now, step) {
      const idx = (ch0.directionOffset + step) % 8;
      const { frameIdx } = resolveVariableFrame(delaysS, (now - ch0.walkStart) / 1000);
      return `IDLE · draw ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)} · step ${step}`;
    },
  };
}

//NOTE(@jimmylee)
//Thrust Recoil: what stopped the thrust is on the card. The blocker holds its Shield Block up on the stage
//Poke gives that height, and the attacker plays the recoil from the moment the tip meets the shield, where
//it sparks. The sequence plays once and holds, as the reaction cards do.
const RECOIL_SPARK_TICKS = 5;
const _sparkTip = new THREE.Vector3();
function createRecoilStation(def, env) {
  const { resources } = env;
  const { gap, archerFloor = 0, targetFloor = 0 } = def;
  const scene = createStationScene(resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  unit.position.y = REST_Y + archerFloor;
  scene.add(unit);
  const guard = buildCharacter(def.blocker, 'NW', env.textures, env.now);
  guard.position.set(gap, REST_Y + targetFloor, 0);
  scene.add(guard);
  const corners = [];
  if (archerFloor > 0) corners.push(...createBlock(resources, scene, 0, 0, archerFloor));
  if (targetFloor > 0) corners.push(...createBlock(resources, scene, gap + (def.ledgeBack ?? 0), 0, targetFloor));
  placeShadow(createShadow(resources, scene), 0, 0, 0, true, archerFloor);
  placeShadow(createShadow(resources, scene), gap, 0, 0, true, targetFloor);
  const heldItem = createHeldItem(def, resources, scene, unit);
  const shield = createHeldItem({ held: HELD_ITEMS[def.blocker] }, resources, scene, guard);
  const spark = createMuzzleFlash(resources.heldItems, scene);
  const ch0 = unit.userData.character;
  const guardCh = guard.userData.character;
  const delaysS = msToS(def.delays);
  const cycleMs = sum(def.delays) + REACTION_HOLD_MS;
  const sparkMs = ticksToMs(RECOIL_SPARK_TICKS);

  return {
    def,
    scene,
    roots: [unit, guard],
    envelope: { extent: sequenceExtent(def), sprites: [[0, unit.position.y, 0], [gap, guard.position.y, 0]], hands: heldReach(def, resources, unit.position.y), spheres: [], points: corners },
    reset(now) {
      settleOnGround(unit, now, REST_Y + archerFloor);
      settleOnGround(guard, now, REST_Y + targetFloor);
      spark.visible = false;
    },
    update(now, dt, step, quaternion) {
      heldItem?.update(now, step, quaternion);
      shield?.update(now, step, quaternion);
      const since = now - ch0.walkStart;
      spark.visible = heldItem !== null && since < sparkMs;
      if (spark.visible) {
        _sparkTip.set(heldItem.model.length, 0, 0).applyQuaternion(heldItem.mesh.quaternion).multiplyScalar(HELD_ITEM_SCALE).add(heldItem.mesh.position);
        spark.position.copy(_sparkTip);
        spark.scale.setScalar(1 - since / sparkMs);
      }
      if (since < cycleMs) return;
      ch0.walkStart = now;
      ch0.lastFrame = -1;
      guardCh.walkStart = now;
      guardCh.lastFrame = -1;
    },
    playhead(now) {
      return (Math.min(now - ch0.walkStart, sum(def.delays)) * 60) / 1000;
    },
    status(now, step) {
      const idx = (ch0.directionOffset + step) % 8;
      const { frameIdx } = resolveVariableFrame(delaysS, (now - ch0.walkStart) / 1000);
      return `RECOIL · draw ${frameIdx + 1}/${delaysS.length} · lunge ${strikeLunge(def, ASSEMBLY_STEP_MAP[idx], frameIdx)}px · pattern ${patternLabel(idx)} · step ${step}`;
    },
  };
}

//NOTE(@jimmylee)
//Weapon Throw: the sequence plays once while the sword flies (createHeldItem, def.plan), and the target flinches
//where its point arrives. The sword stays in the target until the next pass.
function createWeaponThrowStation(def, env) {
  const { resources } = env;
  const { gap } = def;
  const scene = createStationScene(resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  scene.add(unit);
  const target = buildCharacter(undefined, 'NW', env.textures, env.now);
  target.position.set(gap, REST_Y, 0);
  target.userData.character.state = State.IDLE;
  scene.add(target);
  const flinch = createFlinchGroup({ textures: env.textures, directionOffset: DIRECTION_OFFSETS.NW, walkStart: env.now, worldX: gap, worldY: REST_Y, worldZ: 0, spriteWidth: SPRITE_WIDTH, spriteHeight: SPRITE_HEIGHT });
  flinch.visible = false;
  scene.add(flinch);
  placeShadow(createShadow(resources, scene), 0, 0, 0);
  placeShadow(createShadow(resources, scene), gap, 0, 0);
  const counter = createDamageCounter(resources, scene);
  const heldItem = createHeldItem(def, resources, scene, unit);
  const ch0 = unit.userData.character;
  const delaysS = msToS(def.delays);
  const cycleMs = Math.max(sum(def.delays), def.hitMs) + REACTION_HOLD_MS;
  let struck = false;
  let flinchUntil = 0;

  function ready() {
    struck = false;
    flinch.visible = false;
    target.visible = true;
    counter.hide();
  }

  return {
    def,
    scene,
    roots: [unit, target, flinch],
    envelope: { extent: sequenceExtent(def), sprites: [[0, REST_Y, 0], [gap, REST_Y, 0]], hands: heldReach(def, resources, REST_Y), spheres: [], points: [] },
    reset(now) {
      settleOnGround(unit, now);
      ready();
    },
    update(now, dt, step, quaternion) {
      heldItem?.update(now, step, quaternion);
      if (flinch.visible && now >= flinchUntil) {
        flinch.visible = false;
        target.visible = true;
      }
      const elapsed = now - ch0.walkStart;
      if (!struck && elapsed >= def.hitMs) {
        struck = true;
        flinch.userData.character.walkStart = now;
        flinch.visible = true;
        target.visible = false;
        flinchUntil = now + FLINCH_SHOW_MS;
        counter.show(now, target.position);
      }
      counter.update(now, target.position);
      if (elapsed < cycleMs) return;
      ch0.walkStart = now;
      ch0.lastFrame = -1;
      ready();
    },
    playhead(now) {
      return Math.min(((now - ch0.walkStart) * 60) / 1000, sum(def.timeline.ticks));
    },
    status(now, step) {
      const idx = (ch0.directionOffset + step) % 8;
      const { frameIdx } = resolveVariableFrame(delaysS, (now - ch0.walkStart) / 1000);
      return `THROW · draw ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)}${flinch.visible ? ` · target hit ${DAMAGE_COUNTER}` : ''}`;
    },
  };
}

//NOTE(@jimmylee)
//Item Throw Release: the marble in the hand leaves on the SEQ's PlaySound, on the first tick, and flies the arc
//the catalog planned (def.plan), settling onto it from where the frame drew it, so its line needs no camera. It
//meets the target's collision box, and what Throw Stone's collision says happens from there: the marble goes off
//and drops, rolls out and fades, the target slides and the next pass waits for all of it. A marble that lands
//on a ledge rests on that ledge, and it loses speed along the ground each time it bounces, or the small one comes
//off its target fast enough to roll back past the thrower.
const MARBLE_BOUNCE_KEEPS = 0.35;
const _marbleFlight = { x: 0, y: 0, z: 0 };
function createItemThrowStation(def, env) {
  const { resources } = env;
  const { gap, targetFloor, archerFloor, plan } = def;
  const scene = createStationScene(resources);
  const unit = buildCharacter(def.mode, 'SE', env.textures, env.now);
  unit.position.y = REST_Y + archerFloor;
  scene.add(unit);
  const ch0 = unit.userData.character;
  const dirX = directionCoordinates.x[ch0.direction] || 0;
  const dirZ = directionCoordinates.z[ch0.direction] || 0;
  const targetY = REST_Y + targetFloor;
  const target = buildCharacter(undefined, 'NW', env.textures, env.now);
  target.userData.character.state = State.IDLE;
  scene.add(target);
  const flinch = createFlinchGroup({ textures: env.textures, directionOffset: DIRECTION_OFFSETS.NW, walkStart: env.now, worldX: gap * dirX, worldY: targetY, worldZ: gap * dirZ, spriteWidth: SPRITE_WIDTH, spriteHeight: SPRITE_HEIGHT });
  flinch.visible = false;
  scene.add(flinch);
  const corners = [];
  if (archerFloor > 0) corners.push(...createBlock(resources, scene, 0, 0, archerFloor));
  if (targetFloor > 0) corners.push(...createBlock(resources, scene, gap * dirX, gap * dirZ, targetFloor));
  placeShadow(createShadow(resources, scene), 0, 0, 0, true, archerFloor);
  const targetShadow = createShadow(resources, scene);
  const marble = createMarbleRig(def, env, scene, unit);
  const stoneShadow = createShadow(resources, scene);
  const counter = createDamageCounter(resources, scene);
  const { radius } = marble;
  const floorAt = targetFloor > 0 ? (d) => (Math.abs(d - gap) <= cubeSize / 2 ? targetFloor : 0) : archerFloor > 0 ? (d) => (Math.abs(d) <= cubeSize / 2 ? archerFloor : 0) : groundFloor;
  const launch = { x: dirX * plan.launchForward, y: unit.position.y + plan.launchUp, z: dirZ * plan.launchForward };
  const hand = { x: 0, y: 0, z: 0 };
  const body = { d: 0, y: 0, vd: 0, vy: 0, rolling: false, settled: false };
  const slide = { d: gap, v: 0 };
  const delaysS = msToS(def.delays);
  const rest = restingPlaces({ ...plan, hitS: plan.flightS, radius, targetForward: gap }, plan.launchForward, plan.launchUp + archerFloor, floorAt, MARBLE_BOUNCE_KEEPS);
  let state = 'held';
  let simAt = 0;
  let landedAt = 0;
  let flinchUntil = 0;

  function placeTarget() {
    target.position.set(dirX * slide.d, targetY, dirZ * slide.d);
    flinch.position.copy(target.position);
    placeShadow(targetShadow, target.position.x, target.position.z, 0, true, targetFloor);
  }

  function strike(now) {
    throwStoneFlightPoint(launch, hand, dirX, dirZ, plan.flightS, _marbleFlight, plan.vh, plan.vv, THROWN_SETTLE_S);
    marble.mesh.position.set(_marbleFlight.x, _marbleFlight.y, _marbleFlight.z);
    body.d = dirX * _marbleFlight.x + dirZ * _marbleFlight.z;
    body.y = _marbleFlight.y;
    body.vd = plan.stoneAfter;
    body.vy = plan.stoneRise;
    body.rolling = false;
    body.settled = false;
    slide.v = plan.targetKick;
    simAt = ch0.walkStart + plan.flightS * 1000;
    flinch.userData.character.walkStart = now;
    flinch.visible = true;
    target.visible = false;
    flinchUntil = now + Math.max(FLINCH_SHOW_MS, (slide.v / TARGET_SLIDE_DECEL) * 1000);
    counter.show(now, target.position);
    state = 'hit';
  }

  function restart(now) {
    state = 'held';
    ch0.walkStart = now;
    ch0.lastFrame = -1;
    flinch.visible = false;
    target.visible = true;
    counter.hide();
    slide.d = gap;
    slide.v = 0;
    placeTarget();
    marble.hold();
  }

  return {
    def,
    scene,
    roots: [unit, target, flinch],
    props: [{ object: marble.mesh, radius }],
    envelope: { extent: sequenceExtent(def), sprites: [[0, unit.position.y, 0], [dirX * gap, targetY, dirZ * gap], [dirX * rest.targetD, targetY, dirZ * rest.targetD]], hands: marbleReach(def, unit.position.y), spheres: [...launchPath(dirX, dirZ, plan.launchForward, launch.y, plan.vh, plan.vv, radius, plan.flightS), [dirX * rest.stoneD, rest.stoneY, dirZ * rest.stoneD, radius]], points: corners },
    reset(now) {
      settleOnGround(unit, now, REST_Y + archerFloor);
      restart(now);
    },
    update(now, dt, step, quaternion) {
      if (flinch.visible && now >= flinchUntil) {
        flinch.visible = false;
        target.visible = true;
      }
      if (state === 'held') {
        marble.update(now, step, quaternion);
        hand.x = marble.mesh.position.x;
        hand.y = marble.mesh.position.y;
        hand.z = marble.mesh.position.z;
        if (now - ch0.walkStart >= plan.releaseS * 1000) {
          marble.release();
          state = 'flying';
        }
      }
      if (state === 'flying') {
        const t = (now - ch0.walkStart) / 1000 - plan.releaseS;
        if (t >= plan.flightS) strike(now);
        else marble.mesh.position.copy(throwStoneFlightPoint(launch, hand, dirX, dirZ, t, _marbleFlight, plan.vh, plan.vv, THROWN_SETTLE_S));
      }
      if (state === 'hit') {
        while (simAt + STONE_STEP_S * 1000 <= now && !body.settled) {
          simAt += STONE_STEP_S * 1000;
          stepLooseStone(body, radius, floorAt, MARBLE_BOUNCE_KEEPS);
          marble.mesh.rotation.z -= (body.vd * STONE_STEP_S) / radius;
          if (slide.v > 0) {
            slide.v = Math.max(0, slide.v - TARGET_SLIDE_DECEL * STONE_STEP_S);
            slide.d += slide.v * STONE_STEP_S;
          }
        }
        marble.mesh.position.set(dirX * body.d, body.y, dirZ * body.d);
        placeTarget();
        if (body.settled) {
          state = 'landed';
          landedAt = now;
        }
      } else if (state === 'landed') {
        const fade = 1 - (now - landedAt) / STONE_FADE_MS;
        marble.mesh.material.uniforms.opacity.value = Math.max(0, fade);
        if (fade <= 0) {
          marble.mesh.visible = false;
          if (fade <= -REPLAY_DWELL_MS / STONE_FADE_MS) restart(now);
        }
      }
      placeShadow(stoneShadow, marble.mesh.position.x, marble.mesh.position.z, marble.mesh.position.y - radius - floorAt(dirX * marble.mesh.position.x + dirZ * marble.mesh.position.z), state !== 'held' && marble.mesh.visible, floorAt(dirX * marble.mesh.position.x + dirZ * marble.mesh.position.z), radius / SHADOW_RADIUS);
      counter.update(now, target.position);
    },
    playhead(now) {
      return Math.min(((now - ch0.walkStart) * 60) / 1000, sum(def.timeline.ticks));
    },
    status(now, step) {
      const idx = (ch0.directionOffset + step) % 8;
      const { frameIdx } = resolveVariableFrame(delaysS, (now - ch0.walkStart) / 1000);
      return `THROW · draw ${frameIdx + 1}/${delaysS.length} · pattern ${patternLabel(idx)} · marble ${state}${flinch.visible ? ` · target hit ${DAMAGE_COUNTER}` : ''}`;
    },
  };
}

//NOTE(@jimmylee)
//Screen-space reach of a SEQUENCE_MODES pair around the unit origin (world units): every drawn frame's
//tiles at that frame's unit motion, never less than SPRITE_EXTENT so these cards share one scale.
//`also` lists more pairs the same unit plays.
function sequenceExtent({ pair, water, also = [] }) {
  const extent = { ...SPRITE_EXTENT };
  const offset = water ? SHP_WATER_OFFSET : 0;
  for (const entry of [pair, ...also].flatMap(({ front, back }) => [front, back])) {
    for (let k = 0; k < entry.frames.length; k++) {
      const travel = Math.abs(entry.fb?.[k] ?? 0) * HAND_PX_X;
      const du = (entry.du?.[k] ?? 0) * HAND_PX_Y;
      for (const [id, u, v] of SHP_FRAMES[entry.frames[k] + offset]) {
        const cell = SPRITE_MAP[id];
        extent.halfWidth = Math.max(extent.halfWidth, (Math.abs(u) + cell.w / 2) * HAND_PX_X + travel);
        extent.top = Math.max(extent.top, (cell.h / 2 - v) * HAND_PX_Y - du + travel);
        extent.bottom = Math.max(extent.bottom, (v + cell.h / 2) * HAND_PX_Y + du + travel);
      }
    }
  }
  return extent;
}

//NOTE(@jimmylee)
//The player mode A1. `def.action` picks what repeats: the walk loop, or a one-shot a game's input would
//start, Stab Lv3, Cast or the jump. The jump is a scripted arc: the rise, then gravity +
//playerFallExtraAccel (no apex hang). Landing clears _jumpAction and stamps _landedAt, and the unit
//stands through the landing frames.
const PLAYER_ACTION_MS = { stab: sum(STAB_LV3_DELAYS), cast: CAST_CYCLE_MS };
function createPlayerStation(def, env) {
  const scene = createStationScene(env.resources);
  const unit = buildCharacter('A1', 'SE', env.textures, env.now);
  scene.add(unit);
  const shadow = createShadow(env.resources, scene);
  placeShadow(shadow, 0, 0, 0);
  const ch0 = unit.userData.character;
  const delaysS = def.delays ? msToS(def.delays) : null;
  const sprites = def.action === 'jump' ? [[0, REST_Y, 0], [0, REST_Y + playerJumpHeight, 0]] : [[0, REST_Y, 0]];
  let startedAt = -1;
  let readyAt = 0;

  function stop(ch, now) {
    ch._attackAction = null;
    ch._castAction = null;
    ch._jumpAction = null;
    ch._landedAt = undefined;
    startedAt = -1;
    readyAt = now + REPLAY_DWELL_MS;
    ch.lastStep = -1;
    ch.lastFrame = -1;
    unit.position.y = REST_Y;
    placeShadow(shadow, 0, 0, 0);
  }

  function start(ch, now) {
    startedAt = now;
    if (def.action === 'stab') ch._attackAction = { startTime: now };
    else if (def.action === 'cast') ch._castAction = { startTime: now };
    else ch._jumpAction = { startTime: now };
  }

  function heightAt(t) {
    const rise = playerJumpRiseMs / 1000;
    if (t < rise) return jumpRiseCurve(t / rise) * playerJumpHeight;
    return playerJumpHeight - 0.5 * PLAYER_FALL_ACCEL * (t - rise) * (t - rise);
  }

  return {
    def,
    scene,
    roots: [unit],
    envelope: { sprites, spheres: [], points: [] },
    reset(now) {
      settleOnGround(unit, now);
      ch0.walkStopped = def.action !== 'walk';
      stop(ch0, now);
      readyAt = now;
    },
    update(now) {
      if (def.action === 'walk') return;
      if (startedAt < 0) {
        if (now >= readyAt) start(ch0, now);
        return;
      }
      if (def.action === 'jump') {
        if (!ch0._jumpAction) {
          if (playerLandFrame((now - ch0._landedAt) / 1000) < 0) stop(ch0, now);
          return;
        }
        const height = Math.max(0, heightAt((now - startedAt) / 1000));
        unit.position.y = REST_Y + height;
        placeShadow(shadow, 0, 0, height);
        if (height === 0) {
          ch0._jumpAction = null;
          ch0._landedAt = now;
        }
      } else if (now - startedAt >= PLAYER_ACTION_MS[def.action]) {
        stop(ch0, now);
      }
    },
    playhead(now) {
      if (def.action === 'walk') return loopPlayhead(now, ch0.walkStart, sum(def.delays));
      return startedAt < 0 ? -1 : ((now - startedAt) * 60) / 1000;
    },
    status(now, step) {
      const idx = (ch0.directionOffset + step) % 8;
      const pattern = `pattern ${patternLabel(idx)} · step ${step}`;
      if (def.action === 'walk') {
        const { frameIdx } = resolveLoopingFrame(delaysS, sum(delaysS), (now - ch0.walkStart) / 1000);
        return `IDLE · frame ${frameIdx + 1}/8 · ${pattern}`;
      }
      if (startedAt < 0) return `IDLE · ${pattern}`;
      const elapsed = (now - startedAt) / 1000;
      if (def.action === 'jump' && !ch0._jumpAction) return `LANDING · frame ${playerLandFrame((now - ch0._landedAt) / 1000) + 1}/${JUMP_DELAYS_S.length} · ${pattern}`;
      if (def.action === 'jump') return `AIRBORNE · frame ${playerJumpFrame(elapsed) + 1}/${JUMP_DELAYS_S.length} · height ${((unit.position.y - REST_Y) / cubeSize).toFixed(2)} cubes · ${pattern}`;
      if (def.action === 'cast') return `CAST · frame ${(Math.floor((elapsed * 1000) / (CAST_CYCLE_MS / 2)) % 2) + 1}/2 · ${pattern}`;
      return `STAB · frame ${resolveVariableFrame(delaysS, elapsed).frameIdx + 1}/${delaysS.length} · ${pattern}`;
    },
  };
}

const THROW_TRIGGER_FRAMES = [THROW_STONE_SPAWN_FRAME, THROW_STONE_RELEASE_FRAME];

const STATION_FACTORIES = { hold: createHoldStation, jump: createJumpStation, leap: createLeapStation, 'jump-down': createJumpDownStation, teleport: createTeleportStation, throw: createThrowStation, strike: createStrikeStation, bow: createBowStation, gun: createGunStation, loop: createLoopStation, 'quick-throw': createQuickThrowStation, pose: createPoseStation, player: createPlayerStation, reaction: createReactionStation, recoil: createRecoilStation, 'weapon-throw': createWeaponThrowStation, 'item-throw': createItemThrowStation };

//NOTE(jimmylee)
//Builds every demo station for a sprite-sheet texture set ({ skins: { characterSpriteSheet } }).
//`now` is the demo clock origin (ms). Exported separately from the renderer for tests.
export function createSpriteDemoStations({ textures, now, demos = SPRITE_DEMOS, items = null }) {
  const resources = createSharedResources(items);
  const env = { textures, now, resources };
  const stations = demos.map((def) => STATION_FACTORIES[def.kind](def, env));
  for (const [index, station] of stations.entries()) {
    station.index = index;
    station.focus = new THREE.Vector3(0, REST_Y, 0);
    station.halfHeight = MIN_VIEW_HALF_HEIGHT[station.def.kind];
    station.fitElevation = NaN;
    station.fitAspect = NaN;
    station.inWater = false;
    station.water = null;
    station.body = null;
    station.spriteMeshes = [];
    for (const root of station.roots) {
      root.traverse((o) => {
        if (o.isMesh && o.material.map) station.spriteMeshes.push(o);
      });
    }
    station.reset(now);
  }
  return { stations, resources };
}

//NOTE(jimmylee)
//Orients the shared camera for rotation azimuth `azimuth` and `elevation` around a station focus,
//and primes the per-frame camera.userData fields the character groups read. Returns the rotation
//step.
const _orbitProbe = { position: new THREE.Vector3() };
export function aimCamera(camera, focus, azimuth, elevation, now) {
  const horizontal = Math.cos(elevation) * CAMERA_DISTANCE;
  _orbitProbe.position.set(Math.sin(azimuth) * horizontal, Math.sin(elevation) * CAMERA_DISTANCE, Math.cos(azimuth) * horizontal);
  const step = computeAzimuthToStep(_orbitProbe);
  camera.position.copy(focus).add(_orbitProbe.position);
  camera.lookAt(focus);
  camera.updateMatrixWorld(true);
  camera.userData.isMainCamera = true;
  camera.userData.azimuthStep = step;
  camera.userData.now = now;
  return step;
}

export function azimuthForStep(step) {
  return DEFAULT_AZIMUTH + step * STEP_SIZE;
}

//NOTE(@jimmylee)
//Camera right / up axes for an orbit azimuth and elevation (the basis aimCamera's lookAt produces).
function viewAxes(azimuth, elevation, right, up) {
  right.set(Math.cos(azimuth), 0, -Math.sin(azimuth));
  up.set(-Math.sin(elevation) * Math.sin(azimuth), Math.cos(elevation), -Math.sin(elevation) * Math.cos(azimuth));
}

const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _bounds = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

//NOTE(@jimmylee)
//Grows _bounds by world point p projected on the view axes, padded in screen space.
function includeInBounds(p, left, right, bottom, top) {
  const x = p[0] * _right.x + p[1] * _right.y + p[2] * _right.z;
  const y = p[0] * _up.x + p[1] * _up.y + p[2] * _up.z;
  if (x - left < _bounds.minX) _bounds.minX = x - left;
  if (x + right > _bounds.maxX) _bounds.maxX = x + right;
  if (y - bottom < _bounds.minY) _bounds.minY = y - bottom;
  if (y + top > _bounds.maxY) _bounds.maxY = y + top;
}

//NOTE(@jimmylee)
//Screen-space bounds (camera right/up, world units) of a station's action envelope: billboard
//sprites (group origins, envelope.extent or SPRITE_EXTENT around them in screen space), spheres (the
//stone path), hands (screen-space offsets from a world point: the held stone) and world points
//(the jump reference column). Returns the shared _bounds — read it immediately.
export function envelopeBounds(envelope, azimuth, elevation) {
  viewAxes(azimuth, elevation, _right, _up);
  _bounds.minX = Infinity;
  _bounds.maxX = -Infinity;
  _bounds.minY = Infinity;
  _bounds.maxY = -Infinity;
  const { halfWidth, bottom, top } = envelope.extent ?? SPRITE_EXTENT;
  for (let i = 0; i < envelope.sprites.length; i++) includeInBounds(envelope.sprites[i], halfWidth, halfWidth, bottom, top);
  for (let i = 0; i < envelope.spheres.length; i++) {
    const p = envelope.spheres[i];
    includeInBounds(p, p[3], p[3], p[3], p[3]);
  }
  for (let i = 0; i < envelope.points.length; i++) includeInBounds(envelope.points[i], 0, 0, 0, 0);
  const hands = envelope.hands ?? [];
  for (let i = 0; i < hands.length; i++) {
    const [x, y, z, du, dv, r] = hands[i];
    includeInBounds([x, y, z], du + r, du + r, r - dv, r + dv);
  }
  return _bounds;
}

//NOTE(@jimmylee)
//Frames a station for the current view: the half-height is the kind's MIN_VIEW_HALF_HEIGHT, widened
//only as far as the envelope needs at this elevation and aspect over a full orbit (so the scale
//never changes with the camera step or while orbiting); the focus centers the envelope for this
//azimuth. Writes station.focus and station.halfHeight.
export function fitStationView(station, azimuth, elevation, aspect) {
  if (station.fitElevation !== elevation || station.fitAspect !== aspect) {
    let half = MIN_VIEW_HALF_HEIGHT[station.def.kind];
    for (let i = 0; i < FIT_AZIMUTH_SAMPLES; i++) {
      const b = envelopeBounds(station.envelope, (i / FIT_AZIMUTH_SAMPLES) * Math.PI * 2, elevation);
      half = Math.max(half, (b.maxY - b.minY) / 2, (b.maxX - b.minX) / 2 / aspect);
    }
    station.halfHeight = half;
    station.fitElevation = elevation;
    station.fitAspect = aspect;
  }
  const b = envelopeBounds(station.envelope, azimuth, elevation);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  station.focus.set(_right.x * cx + _up.x * cy, _right.y * cx + _up.y * cy, _right.z * cx + _up.z * cy);
  return station;
}

function applyTint(station, enabled) {
  const meshes = station.spriteMeshes;
  for (let i = 0; i < meshes.length; i++) {
    const o = meshes[i];
    const color = enabled ? (TINT_BY_ORDER.get(o.renderOrder) ?? SPRITE_TINT) : SPRITE_TINT;
    if (o.material.color.getHex() !== color) o.material.color.setHex(color);
  }
}

//NOTE(@jimmylee)
//Puts a station in or out of the water, once per frame after its update. The sequence groups draw their
//F(n + 182) frames, as the game does for a unit in water, while every unit is cut by the surface itself,
//because the assemblies have no water frames. F(n + 182) are cut for a unit standing in the water, so a
//unit above its standing height, on a ledge or in the air, keeps its dry frames and the sheet takes it
//row by row as it comes down. Nulled Walk has only water frames, so it keeps them, and a floating unit
//hovers over the surface on its dry ones. The floor goes, because the sheet covers it and runs past its
//edges.
export function applyWater(station, enabled) {
  if (station.inWater !== enabled) {
    station.inWater = enabled;
    for (const object of station.scene.userData.ground) object.visible = !enabled;
    if (station.water) station.water.mesh.visible = enabled;
  }
  const floats = station.def.waterRows === FLOAT_WATER_ROWS;
  for (let i = 0; i < station.roots.length; i++) {
    const root = station.roots[i];
    const ch = root.userData.character;
    if (ch.seqWater === undefined) continue;
    const wading = station.def.water === true || (enabled && !floats && root.position.y <= REST_Y);
    if (ch.seqWater === wading) continue;
    ch.seqWater = wading;
    ch.lastFrame = -1;
  }
}

//NOTE(@jimmylee)
//What can touch the water in a station: its characters and its thrown props. Target and flinch stand on
//one spot and only one of them is ever visible. Roots come first, in order, as createStationBody's do.
function waterBodies(station) {
  return [...station.roots.map((root) => ({ root })), ...(station.props ?? [])];
}

//NOTE(@jimmylee)
//The part of a scene its ripples cover: around everything in its action envelope, with room for a wave
//to die before the edge.
function rippleWindow({ sprites, spheres, points }) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, , z] of [...sprites, ...spheres, ...points]) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  const span = Math.max(maxX - minX, maxZ - minZ);
  return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, domain: Math.max(RIPPLE_MIN_DOMAIN, span + RIPPLE_EDGE_ROOM * 2) };
}

//NOTE(@jimmylee)
//Readies a drawn station's water for this frame, creating it the first time the station is drawn in
//water. The ripples ring the sprite where the leaning plane crosses the sheet, toward the camera. The
//surface a body meets is the same height at every elevation, and only the sheet moves to meet the plane.
export function updateStationWater(station, resources, now, azimuth, elevation) {
  station.water ??= createStationWater(resources.water, resources.bodies, station.scene, station.index, waterBodies(station), station.scene.userData.posts, rippleWindow(station.envelope));
  const reach = waterDraft(station) * Math.sin(elevation);
  station.water.update(now, waterHeight(station, elevation), REST_Y - waterDraft(station), Math.sin(azimuth) * reach, Math.cos(azimuth) * reach);
}

//NOTE(@jimmylee)
//Readies a drawn station's bodies for this frame, creating them the first time the control shows them.
export function updateStationBody(station, resources, now, azimuth, elevation) {
  station.body ??= createStationBody(resources.bodies, station.roots, station.props ?? []);
  viewAxes(azimuth, elevation, _right, _up);
  station.body.update(now, _up.x, _up.y, _up.z, station.inWater ? station.water : null, waterHeight(station, elevation));
}

//NOTE(jimmylee)
//Disposes everything a station owns. Shared stage resources are skipped, and so are the invisible
//buffer-mesh singletons from character-utils (material.visible === false).
export function disposeStation(station, resources) {
  const shared = new Set(Object.values(resources));
  station.water?.dispose();
  station.body?.dispose();
  station.scene.traverse((o) => {
    const material = o.material;
    if (material && material.visible === false) return;
    if (o.geometry && !shared.has(o.geometry) && !o.geometry.userData.shared) o.geometry.dispose();
    if (material && !shared.has(material) && !material.userData.shared) {
      if (material.map) material.map.dispose();
      material.dispose();
    }
  });
}

//NOTE(@jimmylee)
//Creates the demo stage on `canvas`. The caller supplies the loaded sprite-sheet and black marble
//textures, Set's models (readSetItems), the viewport rectangle of every demo (CSS pixels relative to the card grid) via setViewports, where the
//canvas sits in the grid via setWindowTop, and drives frame(wallMs) from its own
//requestAnimationFrame loop. Every station updates every frame; only those in the window draw.
export function createSpriteDemoStage({ canvas, spriteSheet, blackMarble, setItems, pixelRatio = 1, demos = SPRITE_DEMOS }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setScissorTest(true);
  renderer.autoClear = false;

  prepareBlackMarbleTexture(blackMarble);
  const textures = { skins: { characterSpriteSheet: spriteSheet, playerSpriteSheet: spriteSheet, blackMarble } };
  const CLOCK_ORIGIN = 1_000_000;
  let clock = 0;
  let lastWall = -1;
  const { stations, resources } = createSpriteDemoStations({ textures, now: CLOCK_ORIGIN, demos, items: setItems });
  const marble = createMarbleBake(renderer);
  const bakeTextures = () => {
    marble.bake();
    resources.heldItems.bake(renderer);
    resources.water?.restore();
  };
  bakeTextures();
  resources.blockMaterial.uniforms.stone.value = marble.texture;
  canvas.addEventListener('webglcontextrestored', bakeTextures);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 2000);
  let aspect = 1;
  let viewports = [];
  let windowTop = 0;
  let azimuth = azimuthForStep(0);
  let elevation = ELEVATIONS.game;
  let playing = true;
  let orbiting = false;
  let speed = 1;
  let tint = false;
  let water = false;
  let physics = false;
  let step = 0;
  let pendingMs = 0;

  function setViewports(rects, width, height) {
    viewports = rects;
    renderer.setSize(width, height, false);
    const first = rects[0];
    if (first && first.w > 0 && first.h > 0) aspect = first.w / first.h;
  }

  function frame(wallMs) {
    const wallDelta = lastWall < 0 ? 0 : Math.min(100, wallMs - lastWall);
    lastWall = wallMs;
    if (orbiting) azimuth += ORBIT_RADIANS_PER_SECOND * (wallDelta / 1000);
    const delta = playing ? wallDelta * speed : pendingMs;
    pendingMs = 0;
    clock += delta;
    const now = CLOCK_ORIGIN + clock;
    const dt = delta / 1000;

    if (water) {
      resources.water ??= createWaterResources();
      resources.water.update(clock / 1000);
      resources.water.drawCaustics(renderer);
    }
    if (water || physics) resources.bodies ??= createBodyResources(readSheetAlpha(spriteSheet.image));

    renderer.setScissorTest(false);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.setScissorTest(true);
    renderer.setClearColor(STAGE_BACKGROUND, 1);
    const canvasHeight = renderer.domElement.height / renderer.getPixelRatio();
    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];
      fitStationView(station, azimuth, elevation, aspect);
      const halfHeight = station.halfHeight;
      if (camera.top !== halfHeight || camera.right !== halfHeight * aspect) {
        camera.top = halfHeight;
        camera.bottom = -halfHeight;
        camera.right = halfHeight * aspect;
        camera.left = -halfHeight * aspect;
        camera.updateProjectionMatrix();
      }
      step = aimCamera(camera, station.focus, azimuth, elevation, now);
      station.update(now, dt, step, camera.quaternion);
      applyTint(station, tint);
      applyWater(station, water);
      const rect = viewports[i];
      if (!rect || rect.w <= 0 || rect.h <= 0) continue;
      const top = rect.y - windowTop;
      if (top + rect.h <= 0 || top >= canvasHeight) continue;
      const y = canvasHeight - top - rect.h;
      renderer.setViewport(rect.x, y, rect.w, rect.h);
      renderer.setScissor(rect.x, y, rect.w, rect.h);
      renderer.clear();
      if (water) updateStationWater(station, resources, now, azimuth, elevation);
      renderer.render(station.scene, camera);
      if (physics) {
        updateStationBody(station, resources, now, azimuth, elevation);
        renderer.clearDepth();
        renderer.render(station.body.scene, camera);
      }
    }
  }

  return {
    stations,
    setViewports,
    setWindowTop(value) {
      windowTop = value;
    },
    frame,
    setPlaying(value) {
      playing = value;
    },
    setSpeed(value) {
      speed = value;
    },
    setStep(value) {
      orbiting = false;
      azimuth = azimuthForStep(value);
    },
    setOrbiting(value) {
      orbiting = value;
    },
    setElevation(value) {
      elevation = value;
    },
    setTint(value) {
      tint = value;
    },
    setWater(value) {
      water = value;
    },
    setPhysics(value) {
      physics = value;
    },
    stepTick() {
      playing = false;
      pendingMs = 1000 / 60;
    },
    repeat() {
      const now = CLOCK_ORIGIN + clock;
      for (const station of stations) {
        station.reset(now);
        station.water?.clear();
      }
    },
    getStep() {
      return step;
    },
    getStatus(i) {
      const station = stations[i];
      const status = station.status(CLOCK_ORIGIN + clock, step);
      return physics && station.body ? `${station.body.describe(station.inWater ? station.water : null)} · ${status}` : status;
    },
    getPlayhead(i) {
      return stations[i].playhead(CLOCK_ORIGIN + clock);
    },
    dispose() {
      for (const station of stations) disposeStation(station, resources);
      for (const r of Object.values(resources)) r.dispose();
      canvas.removeEventListener('webglcontextrestored', bakeTextures);
      marble.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
