/**
 * combat-rules.js
 * Track 1: Combat Rules Engine, Reachability/Attack Range Calculations,
 * Directional Angles, Animation Resolution, and Combat Forecast & Resolution.
 */

import { deriveSeed, generateFallbackItem } from './setworld-client.js';
import { collide } from '@engine/weapons/ballistics';

// Re-export Stratagem Engine API for backwards compatibility and clean cross-module access
export {
  STRATAGEM_RULE_STAMP,
  STRATAGEM_CONDITIONS,
  STRATAGEM_ACTIONS,
  evaluateLawCompliance,
  createDefaultStratagem,
  exportStratagemJSON,
  importStratagemJSON,
  evaluateUnitStratagem,
} from './stratagem-engine.js';

// Re-export Set.world Client Economy, 9-Stats, Advantages, Disadvantages & Talents
export {
  SETWORLD_NINE_STATS,
  STAT_NAME_TO_ABBR,
  STAT_ABBR_TO_NAME,
  ADVANTAGES_CATALOG,
  DISADVANTAGES_CATALOG,
  TALENTS_CODEX,
  GUARANTEE_CRAFT_COSTS,
  craftGuaranteedTier,
  salvageEquipmentItem,
  getSalvageOrbYield,
  calculateEnemyDropOrbs,
  recordOrbLedgerEntry,
  getOrbLedger,
  clearOrbLedger,
  populateUnitBirthCertificate,
  ensureUnitSetWorldData,
} from './setworld-client.js';

export const DIRECTIONS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/**
 * 11 Signature Class Passives for Set.world Tactical combatants.
 */
export const CLASS_PASSIVES = {
  Dragoon: { id: 'skyborn_valor', name: 'Skyborn Valor', icon: '🐉', desc: '+25% DMG from high ground or Sky Leap' },
  Samurai: { id: 'shirahadori', name: 'Shirahadori', icon: '⚔️', desc: '35% chance to parry & counter melee attacks' },
  Fusilier: { id: 'rifled_overwatch', name: 'Rifled Overwatch', icon: '🔫', desc: '+15% Hit & pierces 30% DEF at range 3+' },
  Archer: { id: 'eagle_eye', name: 'Eagle Eye', icon: '🏹', desc: '+15% Crit & +5% DMG per tile of distance' },
  Mesmer: { id: 'illusory_veil', name: 'Illusory Veil', icon: '🎭', desc: '+15% Evade & drains 15 CT from attackers' },
  Herald: { id: 'tactical_cadence', name: 'Tactical Cadence', icon: '🎺', desc: 'Grants +10 CT & +10 HP to self/adjacent allies on turn' },
  Paladin: { id: 'aegis_ward', name: 'Aegis Ward', icon: '🛡️', desc: '-20% incoming DMG & immune to Cursed/Poison' },
  Berserker: { id: 'blood_frenzy', name: 'Blood Frenzy', icon: '🩸', desc: '+35% ATK & +15% Crit when HP < 60%' },
  'Land Reaver': { id: 'highland_crusher', name: 'Highland Crusher', icon: '⛰️', desc: '+25% DMG & 1-tile knockback from higher elevation' },
  LandReaver: { id: 'highland_crusher', name: 'Highland Crusher', icon: '⛰️', desc: '+25% DMG & 1-tile knockback from higher elevation' },
  Dreadnought: { id: 'juggernaut', name: 'Unstoppable Juggernaut', icon: '🗿', desc: 'Immune to Knockback, Stun & Freeze; +15% DEF' },
  Scholar: { id: 'arcane_leyline', name: 'Arcane Leyline', icon: '📖', desc: '-30% MP costs & +20% Magic skill damage' },
  Knight: { id: 'chivalric_honor', name: 'Chivalric Honor', icon: '🛡️', desc: '+15% DEF when adjacent to allies' },
  'Black Mage': { id: 'elemental_mastery', name: 'Elemental Mastery', icon: '🔥', desc: '+20% Magic skill damage' }
};

/**
 * Tactical Combat Skills catalog including TYPE1 advanced skills
 * (3-Hit Combo, Bard Anthem, Dancer Allure, Orator Talk Persuasion).
 */
export const SKILLS = {
  pummel_combo: {
    id: 'pummel_combo',
    name: 'Trifecta Pummel',
    mpCost: 10,
    costMp: 10,
    range: 1,
    power: 1.15,
    powerMult: 1.15,
    type: 'physical',
    anim: 'Pummel',
    comboAnims: ['Pummel', 'Pummel 2', 'Spin Punch'],
    desc: 'Escalating 3-tier martial combo (Lv1 ➔ Lv2 ➔ Lv3) on consecutive hits.'
  },
  bard_anthem: {
    id: 'bard_anthem',
    name: 'Sovereign Anthem',
    mpCost: 18,
    costMp: 18,
    range: 3,
    aoeRadius: 2,
    power: 0,
    powerMult: 0,
    type: 'support',
    isSupport: true,
    targetTeam: 'ally',
    anim: 'Singing',
    weaponOverride: 'harp',
    isChannel: true,
    desc: 'Perform with 3D harp: grants +25 CT, Haste & 2-turn Song channeling to allies.'
  },
  dancer_allure: {
    id: 'dancer_allure',
    name: 'Mirage Spin Dance',
    mpCost: 16,
    costMp: 16,
    range: 3,
    aoeRadius: 2,
    power: 0.75,
    powerMult: 0.75,
    type: 'magic',
    isMagic: true,
    statusEffect: 'slowed',
    statusChance: 0.85,
    ctStrip: 20,
    anim: 'Spin Dance',
    isChannel: true,
    desc: 'Whirling dance that damages, slows, and strips 20 CT from enemies.'
  },
  talk_recruit: {
    id: 'talk_recruit',
    name: 'Orator Persuasion',
    mpCost: 20,
    costMp: 20,
    range: 3,
    power: 0,
    powerMult: 0,
    type: 'special',
    anim: 'Talk Skill',
    isTalkSkill: true,
    desc: 'Negotiate with an enemy to defect to your Clan (or strip 40 CT from Bosses).'
  },
  pierce_thrust: {
    id: 'pierce_thrust',
    name: 'Pierce Thrust',
    range: { min: 1, max: 2 },
    isLine: true,
    anim: 'Poke Mid',
    animPrefix: 'Poke',
    powerMult: 1.15,
    costMp: 4,
    desc: 'Thrust forward piercing through up to 2 tiles in a straight line.'
  },
  dragoon_jump: {
    id: 'dragoon_jump',
    name: 'Sky Leap',
    range: { min: 1, max: 3 },
    anim: 'High Jump Start',
    animPrefix: 'High Jump Start',
    animationName: 'High Jump Start',
    isDragoonJump: true,
    powerMult: 1.55,
    costMp: 14,
    ignoresElevation: true,
    desc: 'Sky leap into the air and crash down upon a distant foe ignoring elevation.'
  },
  iaido_draw: {
    id: 'iaido_draw',
    name: 'Iaido Draw',
    range: { min: 1, max: 1 },
    anim: 'Katana Use',
    animPrefix: 'Katana Use',
    powerMult: 1.30,
    costMp: 6,
    desc: 'Swift single-stroke slash drawing a lightning-fast edge.'
  },
  steal: {
    id: 'steal',
    name: 'Plunder Gear',
    range: { min: 1, max: 1 },
    anim: 'Steal',
    animPrefix: 'Steal',
    animationName: 'Steal',
    isSteal: true,
    powerMult: 0.65,
    costMp: 6,
    desc: 'Plunder enemy gear and orbs at close range.'
  },
  steal_heart: {
    id: 'steal_heart',
    name: 'Steal Heart',
    range: { min: 1, max: 2 },
    anim: 'Steal Heart',
    animPrefix: 'Steal Heart',
    animationName: 'Steal Heart',
    isCharm: true,
    statusEffect: 'confused',
    powerMult: 0.5,
    costMp: 10,
    desc: 'Charms enemy, inducing confused status.'
  },
  weapon_throw: {
    id: 'weapon_throw',
    name: 'Blade Hurl',
    range: { min: 2, max: 3 },
    anim: 'Weapon Throw',
    animPrefix: 'Weapon Throw',
    animationName: 'Weapon Throw',
    isWeaponThrow: true,
    powerMult: 1.35,
    costMp: 12,
    desc: 'Hurls a concealed throwing blade with deadly precision.'
  },
  arc_shot: {
    id: 'arc_shot',
    name: 'Arc Shot',
    range: { min: 2, max: 5 },
    anim: 'Bow Mid',
    animPrefix: 'Bow',
    powerMult: 1.15,
    costMp: 0,
    desc: 'High-arc arrow shot delivering precise piercing damage.'
  },
  sky_volley: {
    id: 'sky_volley',
    name: 'Sky Volley',
    range: { min: 3, max: 6 },
    anim: 'Bow High',
    animPrefix: 'Bow',
    powerMult: 1.35,
    costMp: 8,
    desc: 'Lofts a deadly rain of arrows descending from high ballistic altitude.'
  },
  weighted_whip: {
    id: 'weighted_whip',
    name: 'Weighted Bag Whip',
    range: { min: 1, max: 2 },
    anim: 'Swing Mid',
    animPrefix: 'Swing',
    powerMult: 1.20,
    costMp: 4,
    desc: 'Whirls a weighted merchant sack in a vicious momentum whip.'
  },
  orb_concussion: {
    id: 'orb_concussion',
    name: 'Orb Concussion',
    range: { min: 1, max: 2 },
    anim: 'Swing High',
    animPrefix: 'Swing',
    powerMult: 1.35,
    statusProc: 'confused',
    costMp: 8,
    desc: 'Cracks an orb-dense pouch against the foe, disorienting their senses.'
  },
  heavy_stone: {
    id: 'heavy_stone',
    name: 'Boulder Lob',
    range: { min: 2, max: 4 },
    anim: 'Dragoon Jump 3',
    animPrefix: 'Dragoon Jump 3',
    animationName: 'Dragoon Jump 3',
    isHeavyStone: true,
    knockback: 1,
    powerMult: 1.25,
    costMp: 10,
    desc: 'Hurls a massive boulder with ballistic knockback.'
  },
  snipe_shot: {
    id: 'snipe_shot',
    name: 'Snipe Shot',
    range: { min: 2, max: 5 },
    anim: 'Gun Mid',
    animPrefix: 'Gun',
    powerMult: 1.25,
    costMp: 5,
    desc: 'Aimed long-range bullet penetrating enemy defenses.'
  },
  suppressing_fire: {
    id: 'suppressing_fire',
    name: 'Suppressing Fire',
    range: { min: 2, max: 4 },
    anim: 'Gun Low',
    animPrefix: 'Gun',
    powerMult: 0.95,
    costMp: 6,
    desc: 'Suppressing volley that rattles the target and slows CT.'
  },
  aether_bolt: {
    id: 'aether_bolt',
    name: 'Aether Bolt',
    range: { min: 1, max: 4 },
    anim: 'Read Book',
    animPrefix: 'Read Book',
    isMagic: true,
    powerMult: 1.25,
    costMp: 6,
    desc: 'Recites an incantation from the open spellbook into an arcane shockwave.'
  },
  codex_invocation: {
    id: 'codex_invocation',
    name: 'Codex Invocation',
    range: { min: 1, max: 3 },
    anim: 'Read Book 2',
    animPrefix: 'Read Book 2',
    isMagic: true,
    aoe: 1,
    powerMult: 1.40,
    costMp: 12,
    desc: 'Recites ancient runic scripture causing an arcane detonation.'
  },
  revitalize: {
    id: 'revitalize',
    name: 'Revitalize',
    range: { min: 1, max: 3 },
    anim: 'Cast Revive',
    animPrefix: 'Cast Revive',
    isSupport: true,
    healPower: 45,
    costMp: 8,
    desc: 'Restores 45 HP to a wounded ally within 3 tiles.'
  },
  cast_revive: {
    id: 'cast_revive',
    name: 'Phoenix Revive',
    range: { min: 1, max: 3 },
    anim: 'Cast Revive',
    animPrefix: 'Cast Revive',
    animationName: 'Cast Revive',
    isSupport: true,
    isRevive: true,
    targetsDead: true,
    healPower: 65,
    costMp: 18,
    desc: 'Resurrects a fallen ally with 65 HP.'
  },
  hymn_of_valor: {
    id: 'hymn_of_valor',
    name: 'Hymn of Valor',
    range: { min: 1, max: 3 },
    anim: 'Play Instrument',
    animPrefix: 'Play Instrument',
    isSupport: true,
    ctBuff: 25,
    healPower: 20,
    costMp: 8,
    desc: 'Plays a stirring melody granting +25 CT and 20 HP to an ally.'
  },
  resonant_chord: {
    id: 'resonant_chord',
    name: 'Resonant Chord',
    range: { min: 1, max: 4 },
    anim: 'Play Instrument',
    animPrefix: 'Play Instrument',
    isMagic: true,
    powerMult: 1.10,
    costMp: 5,
    desc: 'Emits a piercing acoustic note dealing magic damage.'
  },
  shield_bash: {
    id: 'shield_bash',
    name: 'Shield Bash',
    range: { min: 1, max: 1 },
    anim: 'Swing Mid',
    animPrefix: 'Swing',
    powerMult: 1.15,
    costMp: 4,
    desc: 'Martial shield bash staggering the opponent.'
  },
  iron_bulwark: {
    id: 'iron_bulwark',
    name: 'Iron Bulwark',
    range: { min: 1, max: 1 },
    anim: 'Shield Block Mid',
    animPrefix: 'Shield Block',
    isSupport: true,
    ctBuff: 15,
    healPower: 25,
    costMp: 6,
    desc: 'Hunker down behind fortified tower shield, recovering 25 HP and +15 CT.'
  },
  mythril_cleave: {
    id: 'mythril_cleave',
    name: 'Mythril Cleave',
    range: { min: 1, max: 1 },
    anim: 'Swing Mid',
    animPrefix: 'Swing',
    powerMult: 1.15,
    costMp: 4,
    desc: 'Standard martial cleave slicing through guard.'
  },
  crushing_blow: {
    id: 'crushing_blow',
    name: 'Crushing Blow',
    range: { min: 1, max: 1 },
    anim: 'Swing High',
    animPrefix: 'Swing',
    powerMult: 1.35,
    costMp: 7,
    desc: 'Heavy overhead strike dealing +35% damage.'
  },
  sovereign_cataclysm: {
    id: 'sovereign_cataclysm',
    name: 'Sovereign Cataclysm',
    range: { min: 1, max: 3 },
    anim: 'Katana Use',
    animPrefix: 'Katana Use',
    powerMult: 1.65,
    statusProc: 'frozen',
    costMp: 10,
    aoe: 1,
    desc: 'Unleashes devastating sovereign apocalyptic cold, freezing all in its path.'
  }
};

/**
 * Class skill loadouts guaranteeing rich kits across all 11 Set.world classes.
 */
export const CLASS_SKILL_LOADOUTS = {
  Dragoon: ['dragoon_jump', 'pierce_thrust', 'crushing_blow'],
  Samurai: ['pummel_combo', 'iaido_draw', 'steal', 'weapon_throw'],
  Fusilier: ['talk_recruit', 'snipe_shot', 'suppressing_fire'],
  Archer: ['dancer_allure', 'arc_shot', 'sky_volley', 'weapon_throw'],
  Mesmer: ['dancer_allure', 'aether_bolt', 'steal_heart', 'talk_recruit'],
  Herald: ['bard_anthem', 'hymn_of_valor', 'resonant_chord', 'talk_recruit', 'cast_revive'],
  Paladin: ['bard_anthem', 'iron_bulwark', 'shield_bash', 'cast_revive'],
  Berserker: ['pummel_combo', 'crushing_blow', 'heavy_stone'],
  Monk: ['pummel_combo', 'crushing_blow', 'heavy_stone'],
  'Land Reaver': ['pummel_combo', 'crushing_blow', 'heavy_stone'],
  LandReaver: ['pummel_combo', 'crushing_blow', 'heavy_stone'],
  Dreadnought: ['shield_bash', 'iron_bulwark', 'heavy_stone'],
  Scholar: ['talk_recruit', 'aether_bolt', 'codex_invocation', 'revitalize', 'cast_revive'],
  Knight: ['mythril_cleave', 'crushing_blow', 'iron_bulwark'],
  'Black Mage': ['aether_bolt', 'codex_invocation', 'revitalize']
};

/**
 * Coordinate facing vectors aligned strictly to Jimmy Lee's tactics-sprite.mjs:
 * +X (dx > 0, dz === 0) -> 'SE' (index 1)
 * +Z (dx === 0, dz > 0) -> 'SW' (index 3)
 * -X (dx < 0, dz === 0) -> 'NW' (index 5)
 * -Z (dx === 0, dz < 0) -> 'NE' (index 7)
 * Also gracefully supports cardinal directions 'N', 'E', 'S', 'W' if passed by UI buttons.
 */
export const DIRECTION_VECTORS = {
  SE: { dx:  1, dz:  0 },
  SW: { dx:  0, dz:  1 },
  NW: { dx: -1, dz:  0 },
  NE: { dx:  0, dz: -1 },
  E:  { dx:  1, dz: -1 },
  S:  { dx:  1, dz:  1 },
  W:  { dx: -1, dz:  1 },
  N:  { dx: -1, dz: -1 }
};

export const DIRECTION_VECTORS_8 = DIRECTION_VECTORS;

/**
 * Safely resolves a facing string or vector to a normalized { dx, dz } vector.
 * Default fallback facing is ALWAYS 'SE' (never undefined or 'S').
 */
export function facingToVector(facing) {
  if (typeof facing === 'string') {
    const key = facing.toUpperCase();
    if (DIRECTION_VECTORS[key]) return DIRECTION_VECTORS[key];
  } else if (facing && typeof facing.dx === 'number' && typeof facing.dz === 'number') {
    return facing;
  }
  return DIRECTION_VECTORS.SE;
}

/**
 * Seeded PRNG helper (Mulberry32) for deterministic combat rolls.
 */
function createSeededRng(seed) {
  let s = (seed >>> 0) || 123456789;
  return {
    next() {
      s = (s + 0x9e3779b9) | 0;
      let t = Math.imul(s ^ (s >>> 16), 0x21f0aaad);
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
      return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
    },
    nextInt(min, max) {
      return Math.floor(this.next() * (max - min + 1)) + min;
    }
  };
}

/**
 * Normalizes vector offset to one of 8 directions aligned with Jimmy Lee's tactics-sprite grid:
 * +X (dx > 0, dz === 0) -> 'SE' (index 1)
 * +Z (dx === 0, dz > 0) -> 'SW' (index 3)
 * -X (dx < 0, dz === 0) -> 'NW' (index 5)
 * -Z (dx === 0, dz < 0) -> 'NE' (index 7)
 * Default fallback facing is ALWAYS 'SE' (never 'S' or undefined).
 */
export function vectorToFacing(dx, dz) {
  if (dx === 0 && dz === 0) return 'SE';
  if (dx > 0 && dz === 0) return 'SE';
  if (dx === 0 && dz > 0) return 'SW';
  if (dx < 0 && dz === 0) return 'NW';
  if (dx === 0 && dz < 0) return 'NE';

  const angle = Math.atan2(dz, dx); // [-PI, PI]
  const sector = Math.round(angle / (Math.PI / 4));
  switch (sector) {
    case 0: return 'SE';
    case 1: return 'S';
    case 2: return 'SW';
    case 3: return 'W';
    case 4:
    case -4: return 'NW';
    case -3: return 'N';
    case -2: return 'NE';
    case -1: return 'E';
    default: return 'SE';
  }
}

/**
 * Calculates facing from a source tile/unit to a target tile/unit.
 */
export function calculateFacing(fromPos, toPos) {
  const fx = fromPos.x !== undefined ? fromPos.x : (fromPos.gridX ?? 0);
  const fz = fromPos.z !== undefined ? fromPos.z : (fromPos.gridZ ?? 0);
  const tx = toPos.x !== undefined ? toPos.x : (toPos.gridX ?? 0);
  const tz = toPos.z !== undefined ? toPos.z : (toPos.gridZ ?? 0);
  return vectorToFacing(tx - fx, tz - fz);
}

/**
 * Evaluates relative attack angle ('Front', 'Side', 'Back') based on defender facing.
 * Dot product with defender facing vector:
 * cosTheta >= 0.52 -> 'Front'
 * cosTheta <= -0.52 -> 'Back'
 * otherwise -> 'Side'
 */
export function getRelativeDirection(attacker, defender, optFacing = null) {
  const ax = attacker.gridX !== undefined ? attacker.gridX : (attacker.x ?? 0);
  const az = attacker.gridZ !== undefined ? attacker.gridZ : (attacker.z ?? 0);
  const dx = defender.gridX !== undefined ? defender.gridX : (defender.x ?? 0);
  const dz = defender.gridZ !== undefined ? defender.gridZ : (defender.z ?? 0);

  const diffX = ax - dx;
  const diffZ = az - dz;
  const defFacing = optFacing || defender.facing || 'SE';
  const defVec = facingToVector(defFacing);

  const lenAtk = Math.hypot(diffX, diffZ);
  const lenFacing = Math.hypot(defVec.dx, defVec.dz);

  if (lenAtk > 0 && lenFacing > 0) {
    const cosTheta = (diffX * defVec.dx + diffZ * defVec.dz) / (lenAtk * lenFacing);
    if (cosTheta <= -0.52) return 'Back';
    if (cosTheta >= 0.52) return 'Front';
    return 'Side';
  }
  return 'Front';
}

/**
 * Safely inspects a tile from board object, 2D array, or 1D array.
 */
export function getBoardTile(board, x, z) {
  if (!board) return { x, z, elevation: 0, isWater: false };
  if (typeof board.getTile === 'function') {
    return board.getTile(x, z) || { x, z, elevation: 0, isWater: false };
  }
  if (board.tiles) {
    if (Array.isArray(board.tiles[z])) {
      return board.tiles[z][x] || { x, z, elevation: 0, isWater: false };
    }
    if (Array.isArray(board.tiles)) {
      const width = board.width || 10;
      return board.tiles[z * width + x] || { x, z, elevation: 0, isWater: false };
    }
  }
  return { x, z, elevation: 0, isWater: false };
}

/**
 * Checks if a tile is water (crystal river).
 */
export function isWaterTile(tile) {
  if (!tile) return false;
  return !!(tile.isWater || tile.water || tile.type === 'water' || tile.terrain === 'water');
}

/**
 * Computes all reachable tiles using BFS / Dijkstra from unit position.
 * - Max distance: unit.moveRange
 * - Shallow crystal river tiles (tile.terrain === 'water' || tile.isWater) are wadeable (passable !== false).
 * - Moving into a water tile costs 2 movement points (stepCost = 2), UNLESS unit.status === 'floating',
 *   unit.isFloating, unit.prefix === 'Celestial', or unit.elementalPrefix === 'Celestial' (stepCost = 1).
 * - Cannot step onto impassable non-water obstacles or tiles occupied by living enemies.
 * - Step requires |nextTile.elevation - currTile.elevation| <= unit.jumpHeight
 * - Cannot end move on a tile occupied by ANY living unit (except start tile)
 *
 * Returns Array<{ x, z, cost, path: Array<{ x, z, elevation }> }>
 */
export function getReachableTiles(unit, board, allUnits = []) {
  const startX = unit.gridX ?? 0;
  const startZ = unit.gridZ ?? 0;
  const moveRange = unit.moveRange ?? 3;
  const jumpHeight = unit.jumpHeight ?? 2;
  const startTile = getBoardTile(board, startX, startZ);
  const startElev = typeof unit.elevation === 'number' ? unit.elevation : (startTile?.elevation ?? 0);

  const boardWidth = board?.width || 10;
  const boardHeight = board?.height || 10;

  // Build occupancy sets
  const enemyOccupied = new Set();
  const allOccupied = new Set();

  for (const u of allUnits) {
    if (!u || u.alive === false || (u.hp !== undefined && u.hp <= 0)) continue;
    if (u === unit || (u.gridX === startX && u.gridZ === startZ)) continue;

    const key = `${u.gridX},${u.gridZ}`;
    allOccupied.add(key);
    if (u.team !== unit.team) {
      enemyOccupied.add(key);
    }
  }

  // BFS / Dijkstra
  const bestCost = new Map();
  const visitedPaths = new Map();
  const startKey = `${startX},${startZ}`;
  bestCost.set(startKey, 0);

  const startEntry = {
    x: startX,
    z: startZ,
    cost: 0,
    path: [{ x: startX, z: startZ, elevation: startElev }]
  };
  visitedPaths.set(startKey, startEntry);

  const queue = [startEntry];
  const cardinalDirs = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 }
  ];

  const isFloating = unit.status === 'floating' ||
    unit.isFloating ||
    unit.prefix === 'Celestial' ||
    unit.elementalPrefix === 'Celestial' ||
    unit.weapon?.elementalPrefix === 'Celestial';

  const canTeleportOrFloat = !!(unit.canTeleport || unit.status === 'floating' || isFloating);
  const maxJump = canTeleportOrFloat ? 8 : jumpHeight;

  while (queue.length > 0) {
    // Dijkstra priority: lowest cost first
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (current.cost >= moveRange) continue;

    const currElev = current.path[current.path.length - 1].elevation ?? 0;

    for (const dir of cardinalDirs) {
      const nx = current.x + dir.dx;
      const nz = current.z + dir.dz;

      // Check bounds
      if (nx < 0 || nx >= boardWidth || nz < 0 || nz >= boardHeight) continue;

      const nTile = getBoardTile(board, nx, nz);
      if (!nTile) continue;

      // Shallow crystal river tiles (tile.terrain === 'water' || tile.isWater) are wadeable (passable !== false)
      const isWater = isWaterTile(nTile);
      if (!isWater && nTile.passable === false) continue;

      const nKey = `${nx},${nz}`;
      // Cannot step through living enemies
      if (enemyOccupied.has(nKey)) continue;

      const nElev = nTile.elevation ?? 0;
      // Elevation jump check (up to 8 for teleport/floating)
      if (Math.abs(nElev - currElev) > maxJump) continue;

      // Moving into a water tile costs 2 movement points unless floating / Celestial / teleport (costs 1)
      const stepCost = (isWater && !canTeleportOrFloat) ? 2 : 1;
      const nextCost = current.cost + stepCost;
      if (nextCost > moveRange) continue;

      if (!bestCost.has(nKey) || nextCost < bestCost.get(nKey)) {
        bestCost.set(nKey, nextCost);
        const nextEntry = {
          x: nx,
          z: nz,
          cost: nextCost,
          path: [...current.path, { x: nx, z: nz, elevation: nElev }]
        };
        visitedPaths.set(nKey, nextEntry);
        queue.push(nextEntry);
      }
    }
  }

  // Filter ending tiles: unit cannot end move on any other living unit
  const reachable = [];
  // Unit can always stay put (cost 0)
  reachable.push(startEntry);

  for (const [key, entry] of visitedPaths.entries()) {
    if (key === startKey) continue;
    if (allOccupied.has(key)) continue; // Cannot land on another ally
    reachable.push(entry);
  }

  return reachable;
}

/**
 * Returns all board tiles { x, z, elevation } within Manhattan range [min, max]
 * from (originX, originZ) for the given ability/weapon.
 */
export function getAttackableTiles(unit, originX, originZ, ability, board) {
  let min = 1;
  let max = 1;

  if (typeof ability?.range === 'number') {
    min = ability.targetsSelf || ability.isSelf ? 0 : 1;
    max = ability.range;
  } else if (ability?.range) {
    min = ability.range.min !== undefined ? ability.range.min : (ability.targetsSelf || ability.isSelf ? 0 : 1);
    max = ability.range.max !== undefined ? ability.range.max : min;
  } else if (typeof unit?.attackRange === 'number') {
    min = 1;
    max = unit.attackRange;
  } else if (unit?.attackRange) {
    min = unit.attackRange.min !== undefined ? unit.attackRange.min : 1;
    max = unit.attackRange.max !== undefined ? unit.attackRange.max : min;
  } else if (typeof unit?.weapon?.attackRange === 'number') {
    min = 1;
    max = unit.weapon.attackRange;
  } else if (unit?.weapon?.attackRange) {
    min = unit.weapon.attackRange.min !== undefined ? unit.weapon.attackRange.min : 1;
    max = unit.weapon.attackRange.max !== undefined ? unit.weapon.attackRange.max : min;
  }

  const boardWidth = board?.width || 10;
  const boardHeight = board?.height || 10;

  const tiles = [];

  // Line abilities (e.g. Spear Pierce Thrust)
  if (ability?.isLine) {
    const cardinalDirs = [
      { dx: 1, dz: 0 },
      { dx: -1, dz: 0 },
      { dx: 0, dz: 1 },
      { dx: 0, dz: -1 }
    ];
    for (const dir of cardinalDirs) {
      for (let dist = min; dist <= max; dist++) {
        const tx = originX + dir.dx * dist;
        const tz = originZ + dir.dz * dist;
        if (tx >= 0 && tx < boardWidth && tz >= 0 && tz < boardHeight) {
          const t = getBoardTile(board, tx, tz);
          tiles.push({ x: tx, z: tz, elevation: t.elevation ?? 0 });
        }
      }
    }
    return tiles;
  }

  // Standard Manhattan diamond range
  for (let x = 0; x < boardWidth; x++) {
    for (let z = 0; z < boardHeight; z++) {
      const d = Math.abs(x - originX) + Math.abs(z - originZ);
      if (d >= min && d <= max) {
        const t = getBoardTile(board, x, z);
        tiles.push({ x, z, elevation: t.elevation ?? 0 });
      }
    }
  }

  return tiles;
}

/**
 * Elevation stance according to 3d.internet.dev/references/animations.md:
 * "High, Mid and Low are where the target stands: above the attacker, level or below."
 */
export function getElevationStance(attackerElev = 0, defenderElev = 0) {
  if (defenderElev > attackerElev) return 'High';
  if (defenderElev < attackerElev) return 'Low';
  return 'Mid';
}

/**
 * Resolves exact 3d.internet.dev animation name for the attack based on weapon, ability, and stance.
 */
export function resolveAttackAnimation(unit, ability, stance = 'Mid') {
  // If ability has an explicit animationName, use it directly
  if (ability?.animationName) {
    return ability.animationName;
  }

  // If ability has a specific animation name, use it directly
  if (ability?.anim) {
    // If the ability anim already specifies a stance or is a full name
    if (ability.anim.includes('High') || ability.anim.includes('Mid') || ability.anim.includes('Low')) {
      return ability.anim;
    }
    // Fixed animations without stances
    if (['Katana Use', 'Read Book', 'Read Book 2', 'Play Instrument', 'Singing', 'Dancing', 'Casting', 'Dragoon Jump 3', 'Weapon Throw', 'Cast Revive', 'High Jump Start', 'Steal', 'Steal Heart', 'Pummel', 'Pummel 2', 'Spin Punch', 'Spin Dance', 'Talk Skill'].includes(ability.anim)) {
      return ability.anim;
    }
  }

  if (ability?.animPrefix) {
    if (['Cast Revive', 'High Jump Start', 'Steal', 'Steal Heart', 'Weapon Throw', 'Dragoon Jump 3', 'Read Book', 'Read Book 2', 'Play Instrument', 'Katana Use', 'Pummel', 'Pummel 2', 'Spin Punch', 'Spin Dance', 'Talk Skill'].includes(ability.animPrefix)) {
      return ability.animPrefix;
    }
    if (ability.animPrefix === 'Item Throw') {
      return `Item Throw ${stance} Release`;
    }
    return `${ability.animPrefix} ${stance}`;
  }

  const wType = (unit?.weapon?.weaponType || unit?.weaponType || 'sword').toLowerCase();

  switch (wType) {
    case 'spear':
      return `Poke ${stance}`;
    case 'rifle':
      return `Gun ${stance}`;
    case 'bow':
      return `Bow ${stance}`;
    case 'cloth_bag':
      return `Swing ${stance}`;
    case 'katana':
      return `Swing ${stance}`;
    case 'tome':
      return 'Read Book';
    case 'harp':
      return 'Play Instrument';
    case 'unarmed':
      return `Unarmed ${stance}`;
    case 'sword':
    default:
      return `Swing ${stance}`;
  }
}

/**
 * Computes combat forecast:
 * - Directional angle ('Front', 'Side', 'Back') relative to defender's facing
 * - High ground / low ground modifiers
 * - 11 Class Passives & Set.world Resonance interactions
 * - Expected damage, hit chance, crit chance
 * - Support / heal detection
 * - Animation and held model
 * - Orb reward estimate
 */
export function calculateCombatForecast(attacker, defender, ability, board, activeLaw = null) {
  const attackerElev = typeof attacker.elevation === 'number'
    ? attacker.elevation
    : (getBoardTile(board, attacker.gridX, attacker.gridZ)?.elevation ?? 0);

  const defenderElev = typeof defender.elevation === 'number'
    ? defender.elevation
    : (getBoardTile(board, defender.gridX, defender.gridZ)?.elevation ?? 0);

  const stance = getElevationStance(attackerElev, defenderElev);

  // Directional facing calculation using Jimmy Lee grid alignment
  const attackAngle = getRelativeDirection(attacker, defender);

  const animationName = resolveAttackAnimation(attacker, ability, stance);
  const heldModelName = attacker?.weapon?.heldModelName || attacker?.weapon?.weaponType || 'sword';

  const ax = attacker.gridX !== undefined ? attacker.gridX : (attacker.x ?? 0);
  const az = attacker.gridZ !== undefined ? attacker.gridZ : (attacker.z ?? 0);
  const dx = defender.gridX !== undefined ? defender.gridX : (defender.x ?? 0);
  const dz = defender.gridZ !== undefined ? defender.gridZ : (defender.z ?? 0);
  const distance = Math.abs(ax - dx) + Math.abs(az - dz);

  const atkPassiveId = attacker.passive?.id || CLASS_PASSIVES[attacker.className]?.id || '';
  const defPassiveId = defender.passive?.id || CLASS_PASSIVES[defender.className]?.id || '';

  // Orator Talk Skill Recruitment handling
  if (ability?.isTalkSkill || ability?.id === 'talk_recruit') {
    const atkMag = attacker.stats?.magicDamage || attacker.stats?.mag || 20;
    if (defender.isBoss) {
      const shockDamage = Math.round(atkMag * 0.8);
      return {
        expectedDamage: shockDamage,
        expectedHeal: 0,
        hitChance: 100,
        critChance: 0,
        stance,
        attackAngle,
        animationName: 'Talk Skill',
        heldModelName,
        isSupport: false,
        isTalkSkill: true,
        bossResisted: true,
        orbRewardEstimate: 25
      };
    } else {
      const atkLck = attacker.stats?.lck || attacker.stats?.accuracy || 15;
      const defMag = defender.stats?.magicDamage || defender.stats?.mag || 15;
      const recruitChance = Math.min(90, Math.max(30, Math.round(45 + (atkMag + atkLck - defMag) * 0.4 + (1 - (defender.hp || 1) / (defender.maxHp || 100)) * 35)));
      return {
        expectedDamage: 0,
        expectedHeal: Math.round((defender.maxHp || 100) * 0.35),
        hitChance: recruitChance,
        recruitChance,
        critChance: 0,
        stance,
        attackAngle,
        animationName: 'Talk Skill',
        heldModelName,
        isSupport: false,
        isTalkSkill: true,
        orbRewardEstimate: 45
      };
    }
  }

  // Support isRevive / Phoenix Revive handling
  if (ability?.isRevive) {
    return {
      expectedDamage: 0,
      expectedHeal: ability.healPower || 65,
      hitChance: 100,
      critChance: 0,
      stance,
      attackAngle,
      animationName: 'Cast Revive',
      heldModelName,
      isSupport: true,
      isRevive: true,
      orbRewardEstimate: 35
    };
  }

  // Bard Sovereign Anthem / Support / Healing ability handling
  if (ability?.isSupport || ability?.id === 'bard_anthem') {
    const healPower = ability?.id === 'bard_anthem'
      ? Math.round((defender.maxHp || 100) * 0.15)
      : (ability.healPower || 35);
    const targetMaxHp = defender.maxHp || 100;
    const targetHp = defender.hp ?? targetMaxHp;
    const expectedHeal = Math.min(targetMaxHp - targetHp, healPower);

    return {
      expectedDamage: 0,
      expectedHeal,
      hitChance: 100,
      critChance: 0,
      stance,
      attackAngle,
      animationName: ability.anim || (ability?.id === 'bard_anthem' ? 'Singing' : 'Cast Revive'),
      heldModelName: ability?.id === 'bard_anthem' ? 'harp' : heldModelName,
      isSupport: true,
      orbRewardEstimate: 25
    };
  }

  // Offensive Combat Calculations
  let angleHitMod = 0;
  let angleDmgMult = 1.0;
  let angleCritMod = 0;

  if (attackAngle === 'Back') {
    angleHitMod = 25;   // +25% Hit
    angleDmgMult = 1.30; // +30% Damage
    angleCritMod = 10;
  } else if (attackAngle === 'Side') {
    angleHitMod = 10;   // +10% Hit
    angleDmgMult = 1.15; // +15% Damage
    angleCritMod = 5;
  }

  // Elevation Modifiers: High ground gives +15% Damage and +10% Hit
  let elevationDmgMult = 1.0;
  let elevationHitMod = 0;
  let elevationCritMod = 0;

  if (attackerElev > defenderElev) {
    elevationDmgMult = 1.15;
    elevationHitMod = 10;
    elevationCritMod = 5;
  } else if (attackerElev < defenderElev) {
    elevationHitMod = -10;
  }

  // Elemental / Fiery / Burning bonus (+18% bonus fire damage)
  let elementalDmgMult = 1.0;
  if (defender.status === 'burning' || attacker.weapon?.elementalPrefix === 'Fiery' || ability?.elementalPrefix === 'Fiery' || attacker.weapon?.statusProc === 'burning' || ability?.statusProc === 'burning') {
    elementalDmgMult = 1.18;
  }

  const isMagic = !!(ability?.isMagic || ability?.type === 'magic');
  let atkStat = isMagic
    ? (attacker.stats?.magicDamage || attacker.stats?.physicalDamage || 22)
    : (attacker.stats?.physicalDamage || 20);

  let defStat = isMagic
    ? (defender.stats?.magicResistance || Math.round((defender.stats?.armor || 8) * 0.75))
    : (defender.stats?.armor || 8);

  // 11 Class Passives Modifiers
  let passiveDmgMult = 1.0;

  // 1. Dragoon (Skyborn Valor): +25% DMG from high ground or Sky Leap
  if (atkPassiveId === 'skyborn_valor' && (attackerElev > defenderElev || ability?.isDragoonJump || ability?.id === 'dragoon_jump')) {
    passiveDmgMult *= 1.25;
  }

  // 2. Fusilier (Rifled Overwatch): +15% Hit & pierces 30% DEF at range 3+
  if (atkPassiveId === 'rifled_overwatch' && distance >= 3) {
    angleHitMod += 15;
    defStat *= 0.70;
  }

  // 3. Archer (Eagle Eye): +15% Crit & +5% DMG per tile of distance
  if (atkPassiveId === 'eagle_eye') {
    angleCritMod += 15;
    passiveDmgMult *= (1 + distance * 0.05);
  }

  // 4. Mesmer (Illusory Veil): +15% Evade
  if (defPassiveId === 'illusory_veil') {
    angleHitMod -= 15;
  }

  // 5. Paladin (Aegis Ward): -20% incoming DMG
  if (defPassiveId === 'aegis_ward') {
    passiveDmgMult *= 0.80;
  }

  // 6. Berserker (Blood Frenzy): +35% ATK & +15% Crit when HP < 60%
  const currentHp = attacker.hp ?? attacker.maxHp ?? 100;
  const maxHpVal = attacker.maxHp || 100;
  if (atkPassiveId === 'blood_frenzy' && currentHp < maxHpVal * 0.60) {
    atkStat *= 1.35;
    angleCritMod += 15;
  }

  // 7. Land Reaver (Highland Crusher): +25% DMG from higher elevation
  if (atkPassiveId === 'highland_crusher' && attackerElev > defenderElev) {
    passiveDmgMult *= 1.25;
  }

  // 8. Dreadnought (Unstoppable Juggernaut): +15% DEF
  if (defPassiveId === 'juggernaut') {
    defStat *= 1.15;
  }

  // 9. Scholar (Arcane Leyline): +20% Magic skill damage
  if (atkPassiveId === 'arcane_leyline' && isMagic) {
    passiveDmgMult *= 1.20;
  }

  // Set.world Character Advantage / Disadvantage / Talent modifiers
  if (attacker.advantage?.combatMod) {
    const acm = attacker.advantage.combatMod;
    if (isMagic && acm.magicDamage) atkStat += acm.magicDamage;
    else if (!isMagic && acm.physicalDamage) atkStat += acm.physicalDamage;
    if (acm.accuracy) angleHitMod += acm.accuracy;
    if (acm.crit) angleCritMod += acm.crit;
  }
  if (defender.advantage?.combatMod) {
    const dcm = defender.advantage.combatMod;
    if (dcm.defense && !isMagic) defStat += dcm.defense;
    if (dcm.magicResistance && isMagic) defStat += dcm.magicResistance;
    if (dcm.dodge) angleHitMod -= dcm.dodge;
    if (dcm.critResistance) angleCritMod -= Math.round(dcm.critResistance * 100);
  }
  if (defender.talent?.stats?.armor && !isMagic) {
    defStat += defender.talent.stats.armor;
  }

  // Pummel Combo Chain preview (Lv1 -> Lv2 -> Lv3)
  if ((ability?.id === 'pummel_combo' || ability?.comboAnims) && attacker.lastTargetId === defender.id) {
    const nextChain = Math.min(3, (attacker.comboChain || 0) + 1);
    passiveDmgMult *= (1 + (nextChain - 1) * 0.25);
  }

  // FFTA Judge Law Modifiers
  const law = activeLaw || ability?.activeLaw || board?.activeLaw;
  let lawDmgMult = 1.0;
  if (law) {
    if (law.id === 'no_backstab' && attackAngle === 'Front') {
      lawDmgMult *= 1.10; // +10% Front DMG bonus
    } else if (law.id === 'no_magic' && !isMagic) {
      lawDmgMult *= 1.15; // +15% Physical ATK
    } else if (law.id === 'no_blades') {
      const wType = (attacker?.weapon?.weaponType || attacker?.weaponType || attacker?.weapon?.heldModelName || '').toLowerCase();
      if (wType === 'spear' || wType === 'rifle' || isMagic) {
        lawDmgMult *= 1.15; // +15% Spear/Rifle/Magic DMG
      }
    } else if (law.id === 'no_low_blow' && attackerElev > defenderElev) {
      lawDmgMult *= 1.20; // +20% High Strike DMG
    }
  }

  const powerMult = ability?.powerMult !== undefined ? ability.powerMult : (ability?.power || 1.0);
  let baseDamage = Math.max(6, (atkStat * 1.55 - defStat * 0.70)) * powerMult;
  baseDamage = baseDamage * angleDmgMult * elevationDmgMult * lawDmgMult * elementalDmgMult * passiveDmgMult;
  if (attacker.weapon?.boostMult) {
    baseDamage *= attacker.weapon.boostMult;
  }
  const expectedDamage = Math.max(1, Math.round(baseDamage));

  // Hit chance (confused status gives -20% accuracy dizzy penalty)
  const isConfused = attacker.status === 'confused';
  const confusePenalty = isConfused ? 20 : 0;
  const atkAcc = attacker.stats?.accuracy || 80;
  const defDodge = defender.stats?.dodge || 15;
  let hitChance = 75 + (atkAcc - defDodge) * 0.25 + angleHitMod + elevationHitMod - confusePenalty;
  hitChance = Math.min(100, Math.max(15, Math.round(hitChance)));

  // Crit chance
  const baseCrit = attacker.stats?.crit || 5;
  const critBonus = attacker.critBonus || 0;
  let critChance = baseCrit + angleCritMod + elevationCritMod + critBonus;
  critChance = Math.min(100, Math.max(2, Math.round(critChance)));

  // Orb reward estimate: 15-45 base on hit, +75-250 bonus on kill based on target grade
  const grade = (defender.grade || defender.tierGrade || 'C').toUpperCase();
  const killBonusSchedule = { S: 250, A: 200, B: 150, C: 110, D: 85, E: 75, F: 75 };
  const killBonus = killBonusSchedule[grade] || 100;
  const willKill = expectedDamage >= (defender.hp ?? 100);
  let orbRewardEstimate = 25 + (willKill ? killBonus : 0);
  if (attacker.advantage?.combatMod?.orbBonus) {
    orbRewardEstimate = Math.round(orbRewardEstimate * (1 + attacker.advantage.combatMod.orbBonus));
  }

  return {
    expectedDamage,
    hitChance,
    critChance,
    stance,
    attackAngle,
    animationName,
    heldModelName,
    isSupport: false,
    orbRewardEstimate
  };
}

/**
 * Deterministically executes a combat action.
 * Resolves hit, miss, block, crit; updates HP, MP, alive status; determines animations and orbs earned.
 */
export function executeCombatAction(attacker, defender, ability, board, rngSeed, activeLaw = null) {
  const rng = createSeededRng(rngSeed || Math.floor(Math.random() * 0xffffffff));
  const forecast = calculateCombatForecast(attacker, defender, ability, board, activeLaw);

  const atkPassiveId = attacker.passive?.id || CLASS_PASSIVES[attacker.className]?.id || '';
  const defPassiveId = defender.passive?.id || CLASS_PASSIVES[defender.className]?.id || '';

  const ax = attacker.gridX !== undefined ? attacker.gridX : (attacker.x ?? 0);
  const az = attacker.gridZ !== undefined ? attacker.gridZ : (attacker.z ?? 0);
  const dx = defender.gridX !== undefined ? defender.gridX : (defender.x ?? 0);
  const dz = defender.gridZ !== undefined ? defender.gridZ : (defender.z ?? 0);
  const distance = Math.abs(ax - dx) + Math.abs(az - dz);

  const attackerElev = typeof attacker.elevation === 'number'
    ? attacker.elevation
    : (getBoardTile(board, ax, az)?.elevation ?? 0);

  const defenderElev = typeof defender.elevation === 'number'
    ? defender.elevation
    : (getBoardTile(board, dx, dz)?.elevation ?? 0);

  // Spend attacker MP if applicable (Scholar passive: -30% MP costs; advantage: mpCostReduction)
  let mpCost = ability?.mpCost !== undefined ? ability.mpCost : (ability?.costMp || 0);
  if (atkPassiveId === 'arcane_leyline' || attacker.className === 'Scholar') {
    mpCost = Math.round(mpCost * 0.70);
  }
  if (attacker.advantage?.combatMod?.mpCostReduction) {
    mpCost = Math.round(mpCost * (1 - attacker.advantage.combatMod.mpCostReduction));
  }
  attacker.mp = Math.max(0, (attacker.mp ?? 40) - mpCost);

  // Handle Orator Talk Skill Recruitment
  if (ability?.isTalkSkill || ability?.id === 'talk_recruit') {
    const atkMag = attacker.stats?.magicDamage || attacker.stats?.mag || 20;

    if (defender.isBoss) {
      // Boss strips 40 CT, inflicts confused for 1 turn, takes mental shock damage
      defender.ct = Math.max(0, (defender.ct || 0) - 40);
      defender.status = 'confused';
      defender.statusTurns = 1;
      const shockDamage = Math.round(atkMag * 0.8);
      defender.hp = Math.max(0, (defender.hp ?? 100) - shockDamage);
      defender.alive = defender.hp > 0;
      defender.isDead = !defender.alive;
      return {
        hit: true,
        crit: false,
        blocked: false,
        damage: shockDamage,
        heal: 0,
        isTalkSkill: true,
        recruited: false,
        bossResisted: true,
        ctStripped: 40,
        orbsEarned: 25,
        attackerAnim: 'Talk Skill',
        defenderAnim: 'Taking Damage',
        defenderDead: !defender.alive,
        statusApplied: 'confused',
        lootDrop: null,
        forecast
      };
    } else {
      const atkLck = attacker.stats?.lck || attacker.stats?.accuracy || 15;
      const defMag = defender.stats?.magicDamage || defender.stats?.mag || 15;
      const recruitChance = Math.min(90, Math.max(30, Math.round(45 + (atkMag + atkLck - defMag) * 0.4 + (1 - (defender.hp || 1) / (defender.maxHp || 100)) * 35)));
      const rollRecruit = rng.nextInt(1, 100);

      if (rollRecruit <= recruitChance) {
        defender.team = attacker.team;
        defender.clan = attacker.clan || attacker.team;
        defender.clanName = attacker.clanName;
        defender.isRecruited = true;
        defender.statusEffects = [];
        defender.status = null;
        defender.statusTurns = 0;
        const healAmt = Math.round((defender.maxHp || 100) * 0.35);
        defender.hp = Math.min(defender.maxHp || 100, (defender.hp || 0) + healAmt);
        return {
          hit: true,
          crit: false,
          blocked: false,
          damage: 0,
          heal: healAmt,
          isTalkSkill: true,
          recruited: true,
          recruitChance,
          orbsEarned: 50,
          attackerAnim: 'Talk Skill',
          defenderAnim: 'Revived',
          defenderDead: false,
          statusApplied: null,
          lootDrop: null,
          forecast
        };
      } else {
        defender.ct = Math.max(0, (defender.ct || 0) - 30);
        const mentalDmg = Math.max(1, Math.round(atkMag * 0.4));
        defender.hp = Math.max(0, (defender.hp ?? 100) - mentalDmg);
        defender.alive = defender.hp > 0;
        defender.isDead = !defender.alive;
        return {
          hit: true,
          crit: false,
          blocked: false,
          damage: mentalDmg,
          heal: 0,
          isTalkSkill: true,
          recruited: false,
          recruitChance,
          ctStripped: 30,
          orbsEarned: 15,
          attackerAnim: 'Talk Skill',
          defenderAnim: 'Taking Damage',
          defenderDead: !defender.alive,
          statusApplied: null,
          lootDrop: null,
          forecast
        };
      }
    }
  }

  // Handle Phoenix Revive / Revive
  if (ability?.isRevive) {
    defender.alive = true;
    defender.isDead = false;
    defender.inPrison = false;
    const healPower = ability.healPower || 65;
    const currentHp = (defender.hp && defender.hp > 0) ? defender.hp : 0;
    defender.hp = Math.min(
      defender.maxHp || 100,
      Math.max(1, currentHp + healPower)
    );
    const defenderAnim = 'Revived';
    return {
      hit: true,
      crit: false,
      blocked: false,
      damage: 0,
      heal: healPower,
      revived: true,
      orbsEarned: 35,
      attackerAnim: forecast.animationName || 'Cast Revive',
      defenderAnim,
      defenderDead: false,
      statusApplied: null,
      lootDrop: null,
      forecast
    };
  }

  // Handle Bard Sovereign Anthem
  if (ability?.id === 'bard_anthem') {
    const maxHp = defender.maxHp || 100;
    const healPower = Math.round(maxHp * 0.15);
    defender.hp = Math.min(maxHp, (defender.hp ?? maxHp) + healPower);
    defender.ct = Math.min(100, (defender.ct || 0) + 25);
    defender.alive = true;
    defender.isDead = false;

    // Apply to nearby allies within radius 2
    const defX = defender.gridX !== undefined ? defender.gridX : (defender.x ?? 0);
    const defZ = defender.gridZ !== undefined ? defender.gridZ : (defender.z ?? 0);
    const unitsList = board?.units || board?.allUnits || [];
    for (const u of unitsList) {
      if (u && u !== defender && u.team === attacker.team && u.alive !== false && !u.isDead) {
        const ux = u.gridX !== undefined ? u.gridX : (u.x ?? 0);
        const uz = u.gridZ !== undefined ? u.gridZ : (u.z ?? 0);
        if (Math.abs(ux - defX) + Math.abs(uz - defZ) <= (ability.aoeRadius || 2)) {
          u.ct = Math.min(100, (u.ct || 0) + 25);
          u.hp = Math.min(u.maxHp || 100, (u.hp ?? 100) + Math.round((u.maxHp || 100) * 0.15));
        }
      }
    }

    attacker.channeling = {
      type: 'anthem',
      name: 'Sovereign Anthem',
      anim: 'Singing',
      turnsLeft: 2
    };

    return {
      hit: true,
      crit: false,
      blocked: false,
      damage: 0,
      heal: healPower,
      channeled: attacker.channeling,
      orbsEarned: 30,
      attackerAnim: 'Singing',
      defenderAnim: 'Revived',
      defenderDead: false,
      statusApplied: null,
      lootDrop: null,
      forecast
    };
  }

  // Handle Support / Healing
  if (forecast.isSupport) {
    const healPower = ability.healPower || 35;
    const maxHp = defender.maxHp || 100;
    const startHp = defender.hp ?? maxHp;
    defender.hp = Math.min(maxHp, startHp + healPower);
    defender.alive = true;
    defender.isDead = false;
    const healAmount = defender.hp - startHp;

    if (ability.ctBuff) {
      defender.ct = Math.min(100, (defender.ct || 0) + ability.ctBuff);
    }

    return {
      hit: true,
      crit: false,
      blocked: false,
      damage: 0,
      heal: healAmount,
      orbsEarned: 25,
      attackerAnim: forecast.animationName,
      defenderAnim: 'Revived',
      defenderDead: false,
      statusApplied: null,
      lootDrop: null,
      forecast
    };
  }

  // Roll Hit / Miss
  const roll = rng.nextInt(1, 100);
  const isHit = roll <= forecast.hitChance;

  if (!isHit) {
    // Mesmer Illusory Veil drains 15 CT from attackers even on miss
    if (defPassiveId === 'illusory_veil' || defender.className === 'Mesmer') {
      attacker.ct = Math.max(0, (attacker.ct || 0) - 15);
    }

    return {
      hit: false,
      crit: false,
      blocked: false,
      damage: 0,
      heal: 0,
      orbsEarned: 5,
      attackerAnim: forecast.animationName,
      defenderAnim: 'Idle',
      defenderDead: false,
      statusApplied: null,
      lootDrop: null,
      forecast
    };
  }

  let damage = forecast.expectedDamage;
  let defenderAnim = 'Taking Damage';
  let orbsEarned = rng.nextInt(15, 30);

  // Steal Gear & Orbs
  let stolenItem = null;
  let stolenOrbs = 0;
  if (ability?.isSteal) {
    const seed = deriveSeed(defender.seed || 0x1337, Date.now() & 0xffff);
    stolenItem = generateFallbackItem(seed);
    stolenOrbs = 35;
    orbsEarned = (orbsEarned || 0) + stolenOrbs;
  }

  // Steal Heart / Charm Effect
  let statusApplied = null;
  if (ability?.isCharm) {
    defender.status = 'confused';
    defender.statusTurns = 2;
    statusApplied = 'confused';
  }

  // Roll Crit
  const critRoll = rng.nextInt(1, 100);
  const isCrit = critRoll <= forecast.critChance;

  // Roll Shield Block (only from Front against physical attacks if defender has shield or armor)
  const isFront = forecast.attackAngle === 'Front';
  const hasShield = defender.equipment?.offhand || defender.weapon?.heldModelName === 'shield';
  const blockRoll = rng.nextInt(1, 100);
  const isBlocked = !isCrit && isFront && (hasShield || defender.stats?.armor > 12) && blockRoll <= 18;

  if (isBlocked) {
    damage = Math.max(1, Math.floor(damage * 0.35));
    defenderAnim = 'Shield Block Mid';
    orbsEarned = 15;
  } else if (isCrit) {
    damage = Math.round(damage * 1.50);
    defenderAnim = 'Critical';
    orbsEarned = rng.nextInt(30, 45);
  }

  // If a 'sleeping' unit takes damage, wake them up (defender.status = null)
  if (defender.status === 'sleeping' && damage > 0) {
    defender.status = null;
  }

  // 3-Hit Martial Combo (Lv1 -> Lv2 -> Lv3) on consecutive hits
  let comboTier = null;
  let comboAnim = null;
  if (ability?.id === 'pummel_combo' || ability?.comboAnims) {
    attacker.comboChain = (attacker.lastTargetId === defender.id ? Math.min(3, (attacker.comboChain || 0) + 1) : 1);
    attacker.lastTargetId = defender.id;
    damage = Math.round(damage * (1 + (attacker.comboChain - 1) * 0.25));
    comboTier = attacker.comboChain;
    const animList = ability.comboAnims || ['Pummel', 'Pummel 2', 'Spin Punch'];
    comboAnim = animList[attacker.comboChain - 1] || 'Pummel';
  }

  // Dancer Mirage Spin Dance: strips 20 CT from enemy and channels 2-turn dance
  let channeled = null;
  if (ability?.id === 'dancer_allure') {
    defender.ct = Math.max(0, (defender.ct || 0) - (ability.ctStrip || 20));
    attacker.channeling = {
      type: 'dance',
      name: 'Mirage Dance',
      anim: 'Dancing',
      turnsLeft: 2
    };
    channeled = attacker.channeling;
  }

  // Apply damage
  defender.hp = Math.max(0, (defender.hp ?? 100) - damage);
  defender.alive = defender.hp > 0;
  defender.isDead = !defender.alive;

  // Obsidian Resonance: 20% Lifesteal
  let lifestealHeal = 0;
  const lifestealRate = attacker.lifesteal || (attacker.resonances?.find((r) => r.id === 'obsidian')?.lifesteal) || 0;
  if (lifestealRate > 0 && damage > 0) {
    lifestealHeal = Math.round(damage * lifestealRate);
    attacker.hp = Math.min(attacker.maxHp || 100, (attacker.hp ?? 100) + lifestealHeal);
  }

  // Mesmer Illusory Veil: drains 15 CT from attackers
  let mesmerCtDrain = 0;
  if (defPassiveId === 'illusory_veil' || defender.className === 'Mesmer') {
    attacker.ct = Math.max(0, (attacker.ct || 0) - 15);
    mesmerCtDrain = 15;
  }

  // Samurai Shirahadori Parry & Counter: 35% chance to parry & counter melee attacks
  let samuraiCounter = null;
  const isMelee = (distance === 1);
  const isDefenderSamurai = (defender.className === 'Samurai' || defPassiveId === 'shirahadori');
  if (isDefenderSamurai && isMelee && defender.alive) {
    const counterRoll = rng.nextInt(1, 100);
    if (counterRoll <= 35) {
      const defAtk = defender.stats?.physicalDamage || defender.stats?.atk || 20;
      const counterDamage = Math.max(8, Math.round(defAtk * 0.45));
      attacker.hp = Math.max(0, (attacker.hp ?? 100) - counterDamage);
      attacker.alive = attacker.hp > 0;
      attacker.isDead = !attacker.alive;
      samuraiCounter = {
        triggered: true,
        damage: counterDamage
      };
    }
  }

  // Status Proc Check with Immunities:
  // - Dreadnought / Juggernaut immune to Freeze & Stun
  // - Paladin / Aegis Ward / Amulet Ward immune to Poison & Curse
  if (defender.alive && !statusApplied) {
    let statusProc = ability?.statusProc || attacker?.weapon?.statusProc;
    if (ability?.statusEffect && rng.next() < (ability.statusChance || 0.85)) {
      statusProc = ability.statusEffect;
    }

    if (statusProc) {
      const isFreezeOrStun = (statusProc === 'frozen' || statusProc === 'stun');
      const isPoisonOrCurse = (statusProc === 'poisoned' || statusProc === 'poison' || statusProc === 'cursed');
      const isDreadnought = (defender.className === 'Dreadnought' || defPassiveId === 'juggernaut');
      const isPaladinWard = (defender.className === 'Paladin' || defPassiveId === 'aegis_ward' || defender.amuletWard);

      if ((isFreezeOrStun && isDreadnought) || (isPoisonOrCurse && isPaladinWard)) {
        // Status resisted due to passive / ward immunity
      } else {
        const isSpecialSkill = !!(ability && (
          (ability.costMp && ability.costMp > 0) ||
          (ability.mpCost && ability.mpCost > 0) ||
          ability.isMagic ||
          (ability.id && ability.id !== 'basic_attack' && (ability.powerMult || 1.0) > 1.0)
        ));
        const procChance = isSpecialSkill ? 65 : 35;
        const procRoll = rng.nextInt(1, 100);
        if (procRoll <= procChance) {
          defender.status = statusProc;
          defender.statusTurns = (statusProc === 'slowed' ? 2 : 1);
          statusApplied = statusProc;
          if (statusProc === 'frozen') {
            // Frozen: ice-locked for 1 turn, -30 CT
            defender.ct = Math.max(0, (defender.ct || 0) - 30);
          }
        }
      }
    }
  }

  // When defenderDead is true, generate lootDrop object
  let lootDrop = null;
  if (!defender.alive) {
    defenderAnim = 'Bounced to Death';
    const grade = (defender.grade || defender.tierGrade || 'C').toUpperCase();
    const killBonusSchedule = { S: 250, A: 200, B: 150, C: 110, D: 85, E: 75, F: 75 };
    const killBonus = killBonusSchedule[grade] || 100;
    orbsEarned += killBonus;

    const dropX = defender.x !== undefined ? defender.x : (defender.gridX ?? 0);
    const dropZ = defender.z !== undefined ? defender.z : (defender.gridZ ?? 0);
    const defSeed = defender.seed || 42;
    lootDrop = {
      x: dropX,
      z: dropZ,
      orbs: defender.isBoss ? 120 : 35,
      item: generateFallbackItem(deriveSeed(defSeed, 777))
    };
  }

  const outcome = {
    hit: true,
    crit: isCrit,
    blocked: isBlocked,
    damage,
    heal: 0,
    orbsEarned,
    attackerAnim: comboAnim || forecast.animationName,
    defenderAnim,
    defenderDead: !defender.alive,
    statusApplied,
    lootDrop,
    forecast
  };

  if (comboTier) {
    outcome.comboTier = comboTier;
    outcome.comboAnim = comboAnim;
  }
  if (channeled) {
    outcome.channeled = channeled;
  }
  if (lifestealHeal > 0) {
    outcome.lifestealHeal = lifestealHeal;
  }
  if (samuraiCounter) {
    outcome.samuraiCounter = samuraiCounter;
  }
  if (mesmerCtDrain > 0) {
    outcome.mesmerCtDrain = mesmerCtDrain;
  }
  if (ability?.isSteal) {
    outcome.stolenItem = stolenItem;
    outcome.stolenOrbs = stolenOrbs;
  }

  // Ballistic Knockback (collide())
  // Land Reaver Highland Crusher: 1-tile knockback from higher elevation
  const isHigherElev = (attackerElev > defenderElev);
  const isLandReaverKnockback = (atkPassiveId === 'highland_crusher' && isHigherElev);
  const hasKnockback = ability?.knockback || ability?.isHeavyStone || isLandReaverKnockback;
  const isKnockbackImmune = defender.knockbackImmune || defPassiveId === 'juggernaut' || defender.className === 'Dreadnought';

  if (hasKnockback && !isKnockbackImmune && outcome.hit && !outcome.defenderDead && board) {
    const impact = collide(1.0, 120, 3.0, 0.2);
    const defX = defender.gridX !== undefined ? defender.gridX : (defender.x ?? 0);
    const defZ = defender.gridZ !== undefined ? defender.gridZ : (defender.z ?? 0);
    const atkX = attacker.gridX !== undefined ? attacker.gridX : (attacker.x ?? 0);
    const atkZ = attacker.gridZ !== undefined ? attacker.gridZ : (attacker.z ?? 0);

    const diffX = defX - atkX;
    const diffZ = defZ - atkZ;
    let stepX = Math.sign(diffX);
    let stepZ = Math.sign(diffZ);

    if (stepX !== 0 && stepZ !== 0) {
      if (Math.abs(diffX) >= Math.abs(diffZ)) {
        stepZ = 0;
      } else {
        stepX = 0;
      }
    }
    if (stepX === 0 && stepZ === 0) {
      stepX = 1;
    }

    const kbX = defX + stepX;
    const kbZ = defZ + stepZ;
    const inBounds = kbX >= 0 && kbX < (board.width || 10) && kbZ >= 0 && kbZ < (board.height || 10);
    const kbTile = (board && typeof board.getTile === 'function')
      ? board.getTile(kbX, kbZ)
      : (inBounds ? getBoardTile(board, kbX, kbZ) : null);

    let isOccupied = false;
    if (typeof board.getUnitAt === 'function') {
      const u = board.getUnitAt(kbX, kbZ);
      if (u && u !== defender && u.alive !== false && !u.isDead && !u.inPrison && (u.hp === undefined || u.hp > 0)) {
        isOccupied = true;
      }
    }
    if (!isOccupied && board.unitActorManager?.units) {
      for (const actor of board.unitActorManager.units.values()) {
        const u = actor?.unit;
        if (u && u !== defender && u.alive !== false && !u.isDead && !u.inPrison && (u.hp === undefined || u.hp > 0)) {
          const ux = u.gridX !== undefined ? u.gridX : u.x;
          const uz = u.gridZ !== undefined ? u.gridZ : u.z;
          if (ux === kbX && uz === kbZ) {
            isOccupied = true;
            break;
          }
        }
      }
    }
    if (!isOccupied && (Array.isArray(board.units) || Array.isArray(board.allUnits))) {
      const unitsList = board.units || board.allUnits;
      isOccupied = unitsList.some(
        (u) => u && u !== defender && u.alive !== false && !u.isDead && !u.inPrison && (u.hp === undefined || u.hp > 0) &&
          ((u.gridX === kbX || u.x === kbX) && (u.gridZ === kbZ || u.z === kbZ))
      );
    }

    if (inBounds && kbTile && kbTile.passable !== false && !isOccupied) {
      defender.gridX = kbX;
      defender.gridZ = kbZ;
      defender.x = kbX;
      defender.z = kbZ;
      defender.elevation = kbTile.elevation ?? defender.elevation;
      outcome.knockbackTile = {
        x: kbX,
        z: kbZ,
        elevation: defender.elevation,
        targetKick: impact.struck,
        stoneAfter: impact.after
      };
    }
  }

  return outcome;
}

// Re-export Stratagem Engine & Gambit AI
export * from './stratagem-engine.js';

