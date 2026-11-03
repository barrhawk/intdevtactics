/**
 * stratagem-engine.js
 * Anima System StratagemDocument Gambit AI Engine (SET_AGENTS.md Step 9, /anima-stratagems)
 * Rule stamp: 'set-world-0-15-8-stratagems-1'
 */

import {
  SKILLS,
  getBoardTile,
  getAttackableTiles,
  getReachableTiles,
  getRelativeDirection,
  calculateCombatForecast
} from './combat-rules.js';

export const STRATAGEM_RULE_STAMP = 'set-world-0-15-8-stratagems-1';

/**
 * 9 Standard Stratagem Conditions
 */
export const STRATAGEM_CONDITIONS = [
  { id: 'ally_dead', label: 'Ally Fallen (KO)', desc: 'At least one allied unit is defeated (HP <= 0)' },
  { id: 'ally_hp_below_50', label: 'Ally HP < 50%', desc: 'An allied unit has below 50% HP' },
  { id: 'self_hp_below_45', label: 'Self HP < 45%', desc: 'This unit has below 45% HP' },
  { id: 'enemy_recruitable', label: 'Enemy Non-Boss & HP < 65%', desc: 'A non-boss enemy is weakened and prime for Orator Persuasion' },
  { id: 'enemy_low_hp', label: 'Enemy HP < 35% (Lethal)', desc: 'An enemy can be finished off quickly' },
  { id: 'high_ground_available', label: 'High Ground Reachable', desc: 'A reachable tile has elevation advantage over enemies' },
  { id: 'self_not_channeling', label: 'Not Channeling Song/Dance', desc: 'This unit is not currently channeling an anthem or dance' },
  { id: 'enemy_in_melee', label: 'Enemy Adjacent (Dist = 1)', desc: 'An enemy is within melee combo reach' },
  { id: 'always', label: 'Always (Default)', desc: 'Unconditional fallback action' }
];

/**
 * 11 Standard Stratagem Actions
 */
export const STRATAGEM_ACTIONS = [
  { id: 'revive_ally', label: 'Cast Phoenix Revive', desc: 'Revive a fallen ally with Phoenix Revive' },
  { id: 'heal_ally', label: 'Heal / Support Ally', desc: 'Cast a healing or support skill on the lowest-HP ally' },
  { id: 'talk_recruit', label: 'Orator Persuasion (Recruit)', desc: 'Use Talk Skill to recruit an enemy or strip Boss CT' },
  { id: 'bard_channel', label: 'Perform Anthem / Mirage Dance', desc: 'Start channeling Sovereign Anthem or Mirage Spin Dance' },
  { id: 'sky_leap', label: 'Dragoon Sky Leap', desc: 'Execute high-elevation Sky Leap onto target' },
  { id: 'combo_strike', label: 'Trifecta Pummel Combo', desc: 'Chain escalating 3-hit martial combo' },
  { id: 'ranged_snipe', label: 'Ranged Volley / Boulder Lob', desc: 'Attack from safe distance with ranged skill or weapon' },
  { id: 'highest_damage_skill', label: 'Best Offensive Skill', desc: 'Use highest expected damage skill that obeys current Law' },
  { id: 'attack_weakest', label: 'Strike Weakest Enemy', desc: 'Focus-fire the enemy with the lowest remaining HP' },
  { id: 'attack_nearest', label: 'Strike Nearest Enemy', desc: 'Engage the closest enemy combatant' },
  { id: 'kite_high_ground', label: 'Advance to High Ground', desc: 'Reposition to the highest elevation tile advancing toward enemies' }
];

/**
 * Standalone evaluator for FFTA-style Judge Laws compliance.
 * @param {Object} attacker
 * @param {Object} target
 * @param {Object} actionContext { ability, forecast, attackAngle, distance, heightDelta }
 * @param {Object|null} activeLaw
 * @returns {{ violated: boolean, law: Object|null, cardType: 'YELLOW'|'RED'|null, penaltyText: string }}
 */
export function evaluateLawCompliance(attacker, target, actionContext = {}, activeLaw = null) {
  const law = activeLaw || actionContext.activeLaw || actionContext.law;
  if (!law || !attacker || !target) {
    return { violated: false, law: null, cardType: null, penaltyText: '' };
  }

  // Support / healing on allies or friendly actions are never violations
  const isSupport = !!(
    actionContext.ability?.isSupport ||
    actionContext.ability?.isRevive ||
    actionContext.forecast?.isSupport ||
    actionContext.forecast?.isRevive
  );
  const sameTeam = attacker.team && target.team && attacker.team === target.team;
  if (isSupport || sameTeam) {
    return { violated: false, law, cardType: null, penaltyText: '' };
  }

  const ability = actionContext.ability || actionContext.forecast?.ability;
  const model = (actionContext.weaponModel || attacker.weapon?.heldModelName || attacker.heldModelName || '').toLowerCase();
  const wType = (attacker.weapon?.weaponType || attacker.weaponType || attacker.weapon?.heldModelName || model || '').toLowerCase();

  let violated = false;
  switch (law.id) {
    case 'no_backstab': {
      let angle = actionContext.attackAngle || actionContext.forecast?.attackAngle;
      if (!angle && typeof getRelativeDirection === 'function') {
        angle = getRelativeDirection(attacker, target);
      }
      if (actionContext.isBackstab || actionContext.forecast?.isBackstab || angle === 'Back') {
        violated = true;
      }
      break;
    }
    case 'no_ranged': {
      let dist = actionContext.distance;
      if (dist === undefined) {
        const ax = attacker.gridX !== undefined ? attacker.gridX : (attacker.x ?? 0);
        const az = attacker.gridZ !== undefined ? attacker.gridZ : (attacker.z ?? 0);
        const tx = target.gridX !== undefined ? target.gridX : (target.x ?? 0);
        const tz = target.gridZ !== undefined ? target.gridZ : (target.z ?? 0);
        dist = Math.abs(ax - tx) + Math.abs(az - tz);
      }
      if (dist > 2) violated = true;
      break;
    }
    case 'no_magic': {
      const isMagic = !!(
        ability?.isMagic ||
        wType === 'tome' ||
        wType === 'harp' ||
        model === 'tome' ||
        model === 'harp' ||
        ability?.anim === 'Casting' ||
        ability?.anim === 'Read Book' ||
        ability?.anim === 'Play Instrument' ||
        ability?.anim === 'Singing'
      );
      if (isMagic) violated = true;
      break;
    }
    case 'no_blades': {
      const isBlade = (
        wType === 'sword' ||
        wType === 'katana' ||
        model === 'sword' ||
        model === 'katana' ||
        ability?.animPrefix === 'Swing' ||
        ability?.anim === 'Katana Use'
      );
      if (isBlade) violated = true;
      break;
    }
    case 'no_low_blow': {
      if (actionContext.heightDelta !== undefined) {
        if (actionContext.heightDelta > 0) violated = true;
      } else {
        const atkElev = typeof attacker.elevation === 'number' ? attacker.elevation : 0;
        const defElev = typeof target.elevation === 'number' ? target.elevation : 0;
        if (defElev < atkElev) violated = true;
      }
      break;
    }
  }

  return {
    violated,
    law,
    cardType: violated ? 'YELLOW' : null,
    penaltyText: violated ? `Violation of Judge Law: ${law.name || law.id}` : ''
  };
}

/**
 * Computes the strategic Anima Archetype for a unit based on its class/job.
 * @param {Object} unit
 * @returns {string} Archetype title
 */
export function getUnitArchetype(unit = {}) {
  const className = unit?.className || unit?.class?.name || unit?.class || unit?.job || 'Knight';
  const normClass = String(className).replace(/\s+/g, '').toLowerCase();

  if (normClass === 'paladin' || normClass === 'scholar') {
    return normClass === 'paladin' ? 'Holy Guardian' : 'Arcane Sage';
  } else if (normClass === 'herald' || normClass === 'mesmer') {
    return normClass === 'herald' ? 'Cadence Chanter' : 'Mirage Disruptor';
  } else if (normClass === 'dragoon' || normClass === 'landreaver') {
    return normClass === 'dragoon' ? 'Sky Lancer' : 'Highland Crusher';
  } else if (normClass === 'samurai' || normClass === 'berserker') {
    return normClass === 'samurai' ? 'Iaido Duelist' : 'Blood Frenzy Marauder';
  } else if (normClass === 'archer' || normClass === 'fusilier') {
    return normClass === 'archer' ? 'Eagle Eye Marksman' : 'Rifled Overwatch';
  }
  return 'Tactical Combatant';
}

/**
 * Creates a deterministic, class-tailored StratagemDocument for a unit.
 * Paladin/Scholar prioritize ally_dead -> revive_ally and ally_hp_below_50 -> heal_ally;
 * Herald/Mesmer prioritize self_not_channeling -> bard_channel and enemy_recruitable -> talk_recruit;
 * Dragoon/Land Reaver prioritize high_ground_available -> sky_leap;
 * Samurai/Berserker prioritize enemy_in_melee -> combo_strike;
 * Archer/Fusilier prioritize ranged_snipe;
 * and all end with enemy_low_hp -> attack_weakest and always -> highest_damage_skill.
 *
 * @param {Object} unit
 * @returns {Object} StratagemDocument
 */
export function createDefaultStratagem(unit = {}) {
  const className = unit?.className || unit?.class?.name || unit?.class || unit?.job || 'Knight';
  const unitId = unit?.id || unit?.unitId || `unit_${className.toLowerCase()}`;
  const unitName = unit?.name || `${className} Tactician`;

  let archetype = 'Tactical Vanguard';
  let rules = [];

  const normClass = String(className).replace(/\s+/g, '').toLowerCase();

  if (normClass === 'paladin' || normClass === 'scholar') {
    archetype = normClass === 'paladin' ? 'Holy Guardian' : 'Arcane Sage';
    rules = [
      { id: 'rule_1', condition: 'ally_dead', action: 'revive_ally', enabled: true, label: 'Phoenix Revive Fallen Ally' },
      { id: 'rule_2', condition: 'ally_hp_below_50', action: 'heal_ally', enabled: true, label: 'Triage Critical Ally' },
      { id: 'rule_3', condition: 'self_hp_below_45', action: 'heal_ally', enabled: true, label: 'Self Preservation' },
      { id: 'rule_4', condition: 'enemy_low_hp', action: 'attack_weakest', enabled: true, label: 'Finish Lethal Enemy' },
      { id: 'rule_5', condition: 'always', action: 'highest_damage_skill', enabled: true, label: 'Best Available Offensive' }
    ];
  } else if (normClass === 'herald' || normClass === 'mesmer') {
    archetype = normClass === 'herald' ? 'Cadence Chanter' : 'Mirage Disruptor';
    rules = [
      { id: 'rule_1', condition: 'self_not_channeling', action: 'bard_channel', enabled: true, label: 'Perform Anthem / Mirage Dance' },
      { id: 'rule_2', condition: 'enemy_recruitable', action: 'talk_recruit', enabled: true, label: 'Orator Persuasion' },
      { id: 'rule_3', condition: 'ally_hp_below_50', action: 'heal_ally', enabled: true, label: 'Support Wounded Ally' },
      { id: 'rule_4', condition: 'enemy_low_hp', action: 'attack_weakest', enabled: true, label: 'Finish Weakened Foe' },
      { id: 'rule_5', condition: 'always', action: 'highest_damage_skill', enabled: true, label: 'Best Offensive Action' }
    ];
  } else if (normClass === 'dragoon' || normClass === 'landreaver') {
    archetype = normClass === 'dragoon' ? 'Sky Lancer' : 'Highland Crusher';
    rules = [
      { id: 'rule_1', condition: 'high_ground_available', action: 'sky_leap', enabled: true, label: 'Dragoon Sky Leap from Vantage' },
      { id: 'rule_2', condition: 'enemy_in_melee', action: 'combo_strike', enabled: true, label: 'Melee Pummel Strike' },
      { id: 'rule_3', condition: 'enemy_low_hp', action: 'attack_weakest', enabled: true, label: 'Execute Low HP Enemy' },
      { id: 'rule_4', condition: 'always', action: 'highest_damage_skill', enabled: true, label: 'Best Expected Damage Skill' }
    ];
  } else if (normClass === 'samurai' || normClass === 'berserker') {
    archetype = normClass === 'samurai' ? 'Iaido Duelist' : 'Blood Frenzy Marauder';
    rules = [
      { id: 'rule_1', condition: 'enemy_in_melee', action: 'combo_strike', enabled: true, label: 'Trifecta Pummel Combo' },
      { id: 'rule_2', condition: 'self_hp_below_45', action: 'highest_damage_skill', enabled: true, label: 'Blood Frenzy Retaliation' },
      { id: 'rule_3', condition: 'enemy_low_hp', action: 'attack_weakest', enabled: true, label: 'Execute Weakened Foe' },
      { id: 'rule_4', condition: 'always', action: 'highest_damage_skill', enabled: true, label: 'Best Damage Attack' }
    ];
  } else if (normClass === 'archer' || normClass === 'fusilier') {
    archetype = normClass === 'archer' ? 'Eagle Eye Marksman' : 'Rifled Overwatch';
    rules = [
      { id: 'rule_1', condition: 'high_ground_available', action: 'kite_high_ground', enabled: true, label: 'Reposition to High Ground' },
      { id: 'rule_2', condition: 'always', action: 'ranged_snipe', enabled: true, label: 'Ranged Volley / Snipe' },
      { id: 'rule_3', condition: 'enemy_low_hp', action: 'attack_weakest', enabled: true, label: 'Snipe Low HP Target' },
      { id: 'rule_4', condition: 'always', action: 'highest_damage_skill', enabled: true, label: 'Best Offensive Skill' }
    ];
  } else {
    // Default fallback for Knight, Dreadnought, Monk, Thief, etc.
    archetype = 'Tactical Combatant';
    rules = [
      { id: 'rule_1', condition: 'enemy_in_melee', action: 'combo_strike', enabled: true, label: 'Melee Combo Pummel' },
      { id: 'rule_2', condition: 'self_hp_below_45', action: 'heal_ally', enabled: true, label: 'Emergency Defense / Support' },
      { id: 'rule_3', condition: 'enemy_low_hp', action: 'attack_weakest', enabled: true, label: 'Finish Off Low HP Enemy' },
      { id: 'rule_4', condition: 'always', action: 'highest_damage_skill', enabled: true, label: 'Best Offensive Action' }
    ];
  }

  return {
    version: STRATAGEM_RULE_STAMP,
    unitId,
    unitName,
    className,
    archetype,
    rules
  };
}

/**
 * Exports unit stratagem as formatted JSON string.
 * @param {Object} unit
 * @returns {string} JSON string
 */
export function exportStratagemJSON(unit) {
  const doc = unit?.stratagem || createDefaultStratagem(unit);
  return JSON.stringify(doc, null, 2);
}

/**
 * Imports and validates a StratagemDocument JSON string into unit.stratagem.
 * @param {Object} unit
 * @param {string|Object} jsonInput
 * @returns {Object} Updated unit.stratagem
 */
export function importStratagemJSON(unit, jsonInput) {
  if (!unit) {
    throw new Error('Unit must be provided to import stratagem');
  }

  let data;
  if (typeof jsonInput === 'string') {
    try {
      data = JSON.parse(jsonInput);
    } catch (err) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }
  } else if (jsonInput && typeof jsonInput === 'object') {
    data = jsonInput;
  } else {
    throw new Error('Invalid stratagem input: expected JSON string or object');
  }

  if (data.version !== STRATAGEM_RULE_STAMP) {
    throw new Error(`Invalid StratagemDocument version: '${data.version}'. Expected '${STRATAGEM_RULE_STAMP}'`);
  }

  if (!Array.isArray(data.rules)) {
    throw new Error('StratagemDocument rules must be an array');
  }

  const validConditions = new Set(STRATAGEM_CONDITIONS.map((c) => c.id));
  const validActions = new Set(STRATAGEM_ACTIONS.map((a) => a.id));

  for (let i = 0; i < data.rules.length; i++) {
    const r = data.rules[i];
    if (!r || typeof r !== 'object') {
      throw new Error(`Stratagem rule at index ${i} is not a valid object`);
    }
    if (!validConditions.has(r.condition)) {
      throw new Error(`Unknown stratagem condition '${r.condition}' at rule ${i}`);
    }
    if (!validActions.has(r.action)) {
      throw new Error(`Unknown stratagem action '${r.action}' at rule ${i}`);
    }
  }

  unit.stratagem = {
    version: STRATAGEM_RULE_STAMP,
    unitId: unit.id || data.unitId || 'unit_custom',
    unitName: unit.name || data.unitName || 'Unit',
    className: unit.className || data.className || 'Knight',
    archetype: data.archetype || 'Custom Stratagem',
    rules: data.rules.map((r, idx) => ({
      id: r.id || `rule_${idx + 1}`,
      condition: r.condition,
      action: r.action,
      enabled: r.enabled !== false,
      label: r.label || `${r.condition} -> ${r.action}`
    }))
  };

  return unit.stratagem;
}

// Helpers for unit identification and team alignment
function isUnitDead(u) {
  if (!u) return true;
  if (u.alive === false || u.isDead === true || u.inPrison === true) return true;
  if (typeof u.hp === 'number' && u.hp <= 0) return true;
  return false;
}

function isUnitAlive(u) {
  return !isUnitDead(u);
}

function areAllies(u1, u2) {
  if (!u1 || !u2) return false;
  if (u1.team && u2.team) return u1.team === u2.team;
  if (u1.clan && u2.clan) return u1.clan === u2.clan;
  if (typeof u1.isPlayer === 'boolean' && typeof u2.isPlayer === 'boolean') {
    return u1.isPlayer === u2.isPlayer;
  }
  return false;
}

function areEnemies(u1, u2) {
  if (!u1 || !u2) return false;
  if (u1.team && u2.team) return u1.team !== u2.team;
  if (u1.clan && u2.clan) return u1.clan !== u2.clan;
  if (typeof u1.isPlayer === 'boolean' && typeof u2.isPlayer === 'boolean') {
    return u1.isPlayer !== u2.isPlayer;
  }
  return true;
}

function getUnitCoords(u) {
  const x = u.gridX !== undefined ? u.gridX : (u.x ?? 0);
  const z = u.gridZ !== undefined ? u.gridZ : (u.z ?? 0);
  return { x, z };
}

function getManhattanDist(posA, posB) {
  return Math.abs(posA.x - posB.x) + Math.abs(posA.z - posB.z);
}

/**
 * Evaluates unit stratagem rules in priority order against current battlefield state.
 * Filters out any candidate action/skill that would violate activeLaw (evaluateLawCompliance),
 * unless no legal action exists.
 *
 * @param {Object} unit
 * @param {Array<Object>} allUnits
 * @param {Array<Object>} reachableTiles
 * @param {Object} board
 * @param {Object|null} activeLaw
 * @returns {{ matchedRule: Object|null, moveTile: Object, actionType: 'attack'|'skill'|'wait', skill: Object|null, targetUnit: Object|null, reasoning: string }}
 */
export function evaluateUnitStratagem(unit, allUnits = [], reachableTiles = null, board = null, activeLaw = null) {
  if (!unit) {
    return {
      matchedRule: null,
      moveTile: { x: 0, z: 0, elevation: 0 },
      actionType: 'wait',
      skill: null,
      targetUnit: null,
      reasoning: 'Invalid unit passed to evaluateUnitStratagem'
    };
  }

  // Ensure unit has a StratagemDocument attached
  if (!unit.stratagem || !Array.isArray(unit.stratagem.rules)) {
    unit.stratagem = createDefaultStratagem(unit);
  }

  const currentCoords = getUnitCoords(unit);
  const currentTile = {
    x: currentCoords.x,
    z: currentCoords.z,
    elevation: typeof unit.elevation === 'number' ? unit.elevation : (getBoardTile(board, currentCoords.x, currentCoords.z)?.elevation ?? 0),
    cost: 0,
    path: [{ x: currentCoords.x, z: currentCoords.z, elevation: unit.elevation ?? 0 }]
  };

  // Compile candidate movement tiles (always including current tile)
  let candidateTiles = [];
  if (Array.isArray(reachableTiles) && reachableTiles.length > 0) {
    candidateTiles = [...reachableTiles];
    const hasCurrent = candidateTiles.some((t) => t.x === currentCoords.x && t.z === currentCoords.z);
    if (!hasCurrent) {
      candidateTiles.unshift(currentTile);
    }
  } else if (board && typeof getReachableTiles === 'function') {
    candidateTiles = getReachableTiles(unit, board, allUnits);
  } else {
    candidateTiles = [currentTile];
  }

  // Segment units
  const fallenAllies = allUnits.filter((u) => u !== unit && areAllies(unit, u) && isUnitDead(u));
  const aliveAllies = allUnits.filter((u) => areAllies(unit, u) && isUnitAlive(u));
  const aliveEnemies = allUnits.filter((u) => areEnemies(unit, u) && isUnitAlive(u));

  const rules = unit.stratagem.rules;

  // Evaluate each rule in order
  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
    const rule = rules[ruleIndex];
    if (rule.enabled === false) continue;

    let conditionMet = false;

    switch (rule.condition) {
      case 'ally_dead':
        conditionMet = fallenAllies.length > 0;
        break;
      case 'ally_hp_below_50':
        conditionMet = aliveAllies.some((a) => {
          const maxHp = a.maxHp || 100;
          return ((a.hp ?? maxHp) / maxHp) < 0.50;
        });
        break;
      case 'self_hp_below_45': {
        const selfMax = unit.maxHp || 100;
        conditionMet = ((unit.hp ?? selfMax) / selfMax) < 0.45;
        break;
      }
      case 'enemy_recruitable':
        conditionMet = aliveEnemies.some((e) => {
          if (e.isBoss) return false;
          const maxHp = e.maxHp || 100;
          return ((e.hp ?? maxHp) / maxHp) < 0.65;
        });
        break;
      case 'enemy_low_hp':
        conditionMet = aliveEnemies.some((e) => {
          const maxHp = e.maxHp || 100;
          return ((e.hp ?? maxHp) / maxHp) < 0.35;
        });
        break;
      case 'high_ground_available':
        conditionMet = candidateTiles.some((t) => {
          const tElev = t.elevation ?? 0;
          return aliveEnemies.some((e) => tElev > (e.elevation ?? 0));
        });
        break;
      case 'self_not_channeling':
        conditionMet = !unit.channeling || (unit.channeling.turnsLeft !== undefined && unit.channeling.turnsLeft <= 0);
        break;
      case 'enemy_in_melee':
        conditionMet = aliveEnemies.some((e) => {
          const ePos = getUnitCoords(e);
          return getManhattanDist(currentCoords, ePos) === 1;
        });
        break;
      case 'always':
        conditionMet = true;
        break;
      default:
        conditionMet = false;
        break;
    }

    if (!conditionMet) continue;

    // Condition matched! Now attempt to construct candidate action
    const resolvedAction = resolveActionCandidates(
      rule.action,
      unit,
      candidateTiles,
      board,
      activeLaw,
      { fallenAllies, aliveAllies, aliveEnemies, currentTile }
    );

    if (resolvedAction) {
      const condObj = STRATAGEM_CONDITIONS.find((c) => c.id === rule.condition);
      const actObj = STRATAGEM_ACTIONS.find((a) => a.id === rule.action);
      const conditionLabel = condObj?.label || rule.condition;
      const actionLabel = actObj?.label || rule.action;

      return {
        matchedRule: {
          id: rule.id,
          index: ruleIndex,
          condition: rule.condition,
          conditionLabel,
          action: rule.action,
          actionLabel,
          label: rule.label || `${conditionLabel} -> ${actionLabel}`
        },
        moveTile: resolvedAction.moveTile,
        actionType: resolvedAction.actionType,
        skill: resolvedAction.skill,
        ability: resolvedAction.skill, // dual-name compatibility
        targetUnit: resolvedAction.targetUnit,
        target: resolvedAction.targetUnit, // dual-name compatibility
        reasoning: `Rule ${rule.id} [${conditionLabel} -> ${actionLabel}]: matched condition '${rule.condition}' -> executed action '${rule.action}' targeting ${resolvedAction.targetUnit?.name || (resolvedAction.actionType === 'wait' ? 'high ground tile' : 'self')}`
      };
    }
    // If resolvedAction is null (e.g. no targets in range), fall through to the next rule!
  }

  // Fallback if no rules produced an action
  return {
    matchedRule: null,
    moveTile: currentTile,
    actionType: 'wait',
    skill: null,
    ability: null,
    targetUnit: null,
    target: null,
    reasoning: 'No Stratagem rules matched or yielded valid in-range actions; waiting.'
  };
}

/**
 * Resolves candidate actions for a specific action ID across reachable tiles,
 * prioritizing actions that strictly comply with activeLaw.
 */
function resolveActionCandidates(actionId, unit, candidateTiles, board, activeLaw, context) {
  const { fallenAllies, aliveAllies, aliveEnemies, currentTile } = context;

  // Helper to extract all skills available to this unit
  const unitSkills = [...(unit.abilities || unit.weapon?.abilities || [])];

  switch (actionId) {
    case 'revive_ally': {
      const reviveSkill = unitSkills.find((s) => s.isRevive || s.id === 'cast_revive') || SKILLS.cast_revive;
      if (!reviveSkill || fallenAllies.length === 0) return null;

      // Find closest fallen ally reachable from any candidate tile
      let bestMove = null;
      let targetAlly = null;
      let minDistance = Infinity;

      for (const ally of fallenAllies) {
        const allyPos = getUnitCoords(ally);
        for (const tile of candidateTiles) {
          const dist = getManhattanDist(tile, allyPos);
          const rangeMax = typeof reviveSkill.range === 'number' ? reviveSkill.range : (reviveSkill.range?.max || 2);
          const rangeMin = typeof reviveSkill.range === 'object' ? (reviveSkill.range?.min ?? 1) : 1;
          if (dist >= rangeMin && dist <= rangeMax && dist < minDistance) {
            minDistance = dist;
            bestMove = tile;
            targetAlly = ally;
          }
        }
      }

      if (bestMove && targetAlly) {
        return {
          moveTile: bestMove,
          actionType: 'skill',
          skill: reviveSkill,
          targetUnit: targetAlly
        };
      }
      return null;
    }

    case 'heal_ally': {
      const healSkill = unitSkills.find((s) => s.isSupport && !s.isRevive) || SKILLS.revitalize;
      if (!healSkill || aliveAllies.length === 0) return null;

      // Sort allies by missing HP ratio
      const sortedAllies = [...aliveAllies].sort((a, b) => {
        const aMax = a.maxHp || 100;
        const bMax = b.maxHp || 100;
        return ((a.hp ?? aMax) / aMax) - ((b.hp ?? bMax) / bMax);
      });

      const rangeMax = typeof healSkill.range === 'number' ? healSkill.range : (healSkill.range?.max || 2);
      const rangeMin = typeof healSkill.range === 'object' ? (healSkill.range?.min ?? 0) : 0;

      for (const ally of sortedAllies) {
        const allyPos = getUnitCoords(ally);
        for (const tile of candidateTiles) {
          const dist = getManhattanDist(tile, allyPos);
          if (dist >= rangeMin && dist <= rangeMax) {
            return {
              moveTile: tile,
              actionType: 'skill',
              skill: healSkill,
              targetUnit: ally
            };
          }
        }
      }
      return null;
    }

    case 'talk_recruit': {
      const talkSkill = unitSkills.find((s) => s.isTalkSkill || s.id === 'talk_recruit') || SKILLS.talk_recruit;
      if (!talkSkill || aliveEnemies.length === 0) return null;

      // Candidate enemies: prioritize low-HP non-boss, then boss
      const targetCandidates = [...aliveEnemies].sort((a, b) => {
        if (!a.isBoss && b.isBoss) return -1;
        if (a.isBoss && !b.isBoss) return 1;
        const aMax = a.maxHp || 100;
        const bMax = b.maxHp || 100;
        return ((a.hp ?? aMax) / aMax) - ((b.hp ?? bMax) / bMax);
      });

      const evaluated = findBestTargetAndTile(unit, talkSkill, targetCandidates, candidateTiles, board, activeLaw);
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: 'skill',
          skill: talkSkill,
          targetUnit: evaluated.targetUnit
        };
      }
      return null;
    }

    case 'bard_channel': {
      let bardSkill = unitSkills.find((s) => s.id === 'dancer_allure' || s.id === 'bard_anthem');
      if (!bardSkill) {
        bardSkill = (unit.className === 'Mesmer' || unit.className === 'Archer') ? SKILLS.dancer_allure : SKILLS.bard_anthem;
      }
      if (!bardSkill) return null;

      if (bardSkill.id === 'dancer_allure' && aliveEnemies.length > 0) {
        const evaluated = findBestTargetAndTile(unit, bardSkill, aliveEnemies, candidateTiles, board, activeLaw);
        if (evaluated) {
          return {
            moveTile: evaluated.moveTile,
            actionType: 'skill',
            skill: bardSkill,
            targetUnit: evaluated.targetUnit
          };
        }
      }

      // Sovereign Anthem channels on self/party
      return {
        moveTile: currentTile,
        actionType: 'skill',
        skill: bardSkill,
        targetUnit: unit
      };
    }

    case 'sky_leap': {
      const leapSkill = unitSkills.find((s) => s.id === 'dragoon_jump') || SKILLS.dragoon_jump;
      if (!leapSkill || aliveEnemies.length === 0) return null;

      // Sky Leap: prioritize leaping from or to high ground
      const candidates = [...aliveEnemies].sort((a, b) => (b.elevation ?? 0) - (a.elevation ?? 0));
      const evaluated = findBestTargetAndTile(unit, leapSkill, candidates, candidateTiles, board, activeLaw, { preferHighGround: true });
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: 'skill',
          skill: leapSkill,
          targetUnit: evaluated.targetUnit
        };
      }
      return null;
    }

    case 'combo_strike': {
      const comboSkill = unitSkills.find((s) => s.id === 'pummel_combo') || SKILLS.pummel_combo;
      if (!comboSkill || aliveEnemies.length === 0) return null;

      // Strictly adjacent targets (dist = 1)
      const evaluated = findBestTargetAndTile(unit, comboSkill, aliveEnemies, candidateTiles, board, activeLaw, { maxDistance: 1 });
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: 'skill',
          skill: comboSkill,
          targetUnit: evaluated.targetUnit
        };
      }
      return null;
    }

    case 'ranged_snipe': {
      let snipeSkill = unitSkills.find((s) => {
        const range = typeof s.range === 'number' ? s.range : (s.range?.max || 1);
        return range >= 3 || s.id === 'snipe_shot' || s.id === 'arc_shot' || s.id === 'sky_volley';
      }) || SKILLS.snipe_shot;

      if (!snipeSkill || aliveEnemies.length === 0) return null;

      const evaluated = findBestTargetAndTile(unit, snipeSkill, aliveEnemies, candidateTiles, board, activeLaw, { preferDistance: true });
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: 'skill',
          skill: snipeSkill,
          targetUnit: evaluated.targetUnit
        };
      }
      return null;
    }

    case 'attack_weakest': {
      if (aliveEnemies.length === 0) return null;
      const sortedEnemies = [...aliveEnemies].sort((a, b) => (a.hp ?? 100) - (b.hp ?? 100));

      const availableSkills = unitSkills.filter((s) => !s.isSupport && !s.isRevive);
      if (availableSkills.length === 0) {
        availableSkills.push(SKILLS.mythril_cleave || { id: 'basic_attack', name: 'Basic Attack', range: 1, powerMult: 1.0 });
      }

      const evaluated = findBestCandidate(unit, availableSkills, sortedEnemies, candidateTiles, board, activeLaw);
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: evaluated.skill?.id === 'basic_attack' ? 'attack' : 'skill',
          skill: evaluated.skill,
          targetUnit: evaluated.targetUnit
        };
      }
      return null;
    }

    case 'attack_nearest': {
      if (aliveEnemies.length === 0) return null;
      const sortedEnemies = [...aliveEnemies].sort((a, b) => {
        const da = getManhattanDist(currentTile, getUnitCoords(a));
        const db = getManhattanDist(currentTile, getUnitCoords(b));
        return da - db;
      });

      const availableSkills = unitSkills.filter((s) => !s.isSupport && !s.isRevive);
      if (availableSkills.length === 0) {
        availableSkills.push({ id: 'basic_attack', name: 'Basic Attack', range: 1, powerMult: 1.0 });
      }

      const evaluated = findBestCandidate(unit, availableSkills, sortedEnemies, candidateTiles, board, activeLaw);
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: evaluated.skill?.id === 'basic_attack' ? 'attack' : 'skill',
          skill: evaluated.skill,
          targetUnit: evaluated.targetUnit
        };
      }
      return null;
    }

    case 'kite_high_ground': {
      // Find candidate tile with maximum elevation
      let highestElev = -Infinity;
      for (const tile of candidateTiles) {
        const elev = tile.elevation ?? 0;
        if (elev > highestElev) highestElev = elev;
      }
      const highTiles = candidateTiles.filter((t) => (t.elevation ?? 0) === highestElev);

      // From high tiles, find one closest to enemies or allowing an attack
      let bestHighTile = highTiles[0] || currentTile;
      let minEnemyDist = Infinity;
      for (const t of highTiles) {
        for (const e of aliveEnemies) {
          const d = getManhattanDist(t, getUnitCoords(e));
          if (d < minEnemyDist) {
            minEnemyDist = d;
            bestHighTile = t;
          }
        }
      }

      // Try attacking from this high ground tile
      const offensiveSkills = unitSkills.filter((s) => !s.isSupport && !s.isRevive);
      if (offensiveSkills.length === 0) {
        offensiveSkills.push({ id: 'basic_attack', name: 'Basic Attack', range: 1, powerMult: 1.0 });
      }

      const evaluated = findBestCandidate(unit, offensiveSkills, aliveEnemies, [bestHighTile], board, activeLaw);
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: evaluated.skill?.id === 'basic_attack' ? 'attack' : 'skill',
          skill: evaluated.skill,
          targetUnit: evaluated.targetUnit
        };
      }

      // If no target in range from high ground, move there and wait
      return {
        moveTile: bestHighTile,
        actionType: 'wait',
        skill: null,
        targetUnit: null
      };
    }

    case 'highest_damage_skill':
    default: {
      if (aliveEnemies.length === 0) return null;

      const offensiveSkills = unitSkills.filter((s) => !s.isSupport && !s.isRevive);
      if (offensiveSkills.length === 0) {
        offensiveSkills.push({ id: 'basic_attack', name: 'Basic Attack', range: 1, powerMult: 1.0 });
      }

      const evaluated = findBestCandidate(unit, offensiveSkills, aliveEnemies, candidateTiles, board, activeLaw);
      if (evaluated) {
        return {
          moveTile: evaluated.moveTile,
          actionType: evaluated.skill?.id === 'basic_attack' ? 'attack' : 'skill',
          skill: evaluated.skill,
          targetUnit: evaluated.targetUnit
        };
      }

      return null;
    }
  }
}

/**
 * Iterates reachable tiles, target candidates, and available skills to find the highest-scoring combination
 * while strictly filtering out Law violations unless no legal option exists.
 */
function findBestCandidate(unit, skills, targets, candidateTiles, board, activeLaw, options = {}) {
  const skillList = Array.isArray(skills) ? skills : [skills];
  const legalCandidates = [];
  const violatedCandidates = [];

  for (const skill of skillList) {
    if (!skill) continue;

    for (const moveTile of candidateTiles) {
      const ghostAttacker = {
        ...unit,
        gridX: moveTile.x,
        gridZ: moveTile.z,
        x: moveTile.x,
        z: moveTile.z,
        elevation: moveTile.elevation ?? unit.elevation ?? 0
      };

      // Calculate attackable tiles from this move tile
      let attackable = [];
      if (board && typeof getAttackableTiles === 'function') {
        attackable = getAttackableTiles(ghostAttacker, moveTile.x, moveTile.z, skill, board);
      }

      for (const target of targets) {
        const targetPos = getUnitCoords(target);
        const distance = getManhattanDist(moveTile, targetPos);

        // Check range bounds
        if (options.maxDistance && distance > options.maxDistance) continue;

        let inRange = false;
        if (attackable.length > 0) {
          inRange = attackable.some((t) => t.x === targetPos.x && t.z === targetPos.z);
        } else {
          const rMin = typeof skill.range === 'object' ? (skill.range?.min ?? 1) : 1;
          const rMax = typeof skill.range === 'number' ? skill.range : (skill.range?.max ?? 1);
          inRange = (distance >= rMin && distance <= rMax);
        }

        if (!inRange) continue;

        // Calculate forecast
        let forecast = null;
        if (board && typeof calculateCombatForecast === 'function') {
          forecast = calculateCombatForecast(ghostAttacker, target, skill, board, activeLaw);
        }

        const expectedDmg = forecast?.expectedDamage ?? Math.max(10, Math.round(15 * (skill.powerMult || 1.0)));
        const hitChance = forecast?.hitChance ?? 80;

        // Law compliance check
        const lawCheck = evaluateLawCompliance(ghostAttacker, target, {
          ability: skill,
          forecast,
          distance,
          heightDelta: (moveTile.elevation ?? 0) - (target.elevation ?? 0)
        }, activeLaw);

        let score = expectedDmg * (hitChance / 100);

        // Elevation bias
        const elevDiff = (moveTile.elevation ?? 0) - (target.elevation ?? 0);
        if (elevDiff > 0) score += elevDiff * 15;
        if (options.preferHighGround && elevDiff > 0) score += 40;

        // Distance bias for snipers
        if (options.preferDistance && distance >= 3) score += 25;

        // Movement cost slight penalty
        score -= (moveTile.cost || 0) * 1.5;

        const candidateObj = {
          moveTile,
          skill,
          targetUnit: target,
          score,
          violated: lawCheck.violated
        };

        if (lawCheck.violated) {
          violatedCandidates.push(candidateObj);
        } else {
          legalCandidates.push(candidateObj);
        }
      }
    }
  }

  // Filter: strict preference for legal candidates across all evaluated skills
  const pool = legalCandidates.length > 0 ? legalCandidates : violatedCandidates;
  if (pool.length === 0) return null;

  pool.sort((a, b) => b.score - a.score);
  return pool[0];
}

const findBestTargetAndTile = findBestCandidate;

