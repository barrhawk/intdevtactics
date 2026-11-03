/**
 * INTDEV TACTICS — Anima System StratagemDocument Gambit AI Editor Modal
 * 3d.internet.dev × set.world
 *
 * Full-featured Gambit AI editor:
 * - Left Roster Panel: Clan units (editable Gambits) + Enemy units (read-only inspection).
 * - Center Gambit Rules Pipeline: Ordered Condition ➔ Action rules with priority badges,
 *   rule stamp (set-world-0-15-8-stratagems-1), archetype tag, enable/disable, reordering,
 *   add/delete/reset/import/export.
 * - Right Live Simulation & JSON Preview Panel: Battlefield preview of matching rule and raw JSON.
 */

import * as CombatRules from '../game/combat-rules.js';

export const STRATAGEM_RULE_STAMP = 'set-world-0-15-8-stratagems-1';

export const STRATAGEM_CONDITIONS = CombatRules['STRATAGEM_CONDITIONS'] || [
  { id: 'always', label: 'Always (Default True)', desc: 'Unconditionally matches when evaluated' },
  { id: 'hp_under_25', label: 'Self: HP < 25%', desc: 'Current unit HP is at or below 25%' },
  { id: 'hp_under_50', label: 'Self: HP < 50%', desc: 'Current unit HP is at or below 50%' },
  { id: 'mp_under_20', label: 'Self: MP < 20', desc: 'Current unit MP is below 20' },
  { id: 'ally_hp_under_30', label: 'Ally: HP < 30%', desc: 'Any teammate is in critical health (< 30% HP)' },
  { id: 'ally_hp_under_50', label: 'Ally: HP < 50%', desc: 'Any teammate is below 50% HP' },
  { id: 'ally_down', label: 'Ally: Fallen / Dead', desc: 'Any teammate has fallen in battle' },
  { id: 'enemy_in_attack_range', label: 'Enemy: In Attack Range', desc: 'At least one enemy is within direct weapon attack range' },
  { id: 'enemy_cluster', label: 'Enemy: Cluster (2+ Foes)', desc: 'Two or more foes within 2 tiles of each other' },
  { id: 'enemy_weakest', label: 'Enemy: Lowest HP', desc: 'Target the living enemy with lowest current HP' },
  { id: 'enemy_caster', label: 'Enemy: Mage / Caster', desc: 'An enemy mage, hexer, or spellcaster is alive' },
  { id: 'enemy_leader', label: 'Enemy: Boss / Commander', desc: 'A Crimson boss or commander is alive on the field' },
  { id: 'enemy_buffed', label: 'Enemy: Has Buff / Status', desc: 'An enemy possesses an active buff or stance' },
  { id: 'standing_on_crystal', label: 'Tile: On Crystal Stream', desc: 'Unit is currently standing on a water or crystal tile' },
  { id: 'law_risk', label: 'Law: Active Law in Effect', desc: 'An active Judge Law is currently enforced' }
];

export const STRATAGEM_ACTIONS = CombatRules?.STRATAGEM_ACTIONS || [
  { id: 'attack_nearest', label: 'Attack: Nearest Foe', desc: 'Advance and strike the closest enemy' },
  { id: 'attack_weakest', label: 'Attack: Lowest HP Foe', desc: 'Target the enemy with lowest current HP' },
  { id: 'attack_caster', label: 'Attack: Spellcaster / Ranged', desc: 'Focus fire on enemy spellcasters or ranged units' },
  { id: 'skill_heal_ally', label: 'Skill: Heal Lowest Ally', desc: 'Use healing magic or first aid on most wounded ally' },
  { id: 'skill_burst_damage', label: 'Skill: Highest DMG Skill', desc: 'Cast strongest available offensive ability or spell' },
  { id: 'skill_buff_self', label: 'Skill: Defend / Buff Self', desc: 'Apply defensive stance, shield wall, or self buff' },
  { id: 'retreat_to_allies', label: 'Move: Fall Back to Allies', desc: 'Retreat towards friendly cluster and defend' },
  { id: 'advance_flank', label: 'Move: Flank Enemy Position', desc: 'Maneuver to side or rear of nearest enemy' },
  { id: 'focus_boss', label: 'Attack: Focus Boss / Leader', desc: 'Coordinate all attacks against the enemy commander' },
  { id: 'hold_ground', label: 'Wait: Hold Ground & Defend', desc: 'Conserve CT, hold current tile, and prepare defense' }
];

export function getUnitArchetype(unit) {
  if (!unit) return 'Striker';
  const job = (unit.job || unit.className || unit.class || '').toLowerCase();
  if (job.includes('cleric') || job.includes('white') || job.includes('healer') || job.includes('medic')) {
    return 'Healer';
  }
  if (job.includes('paladin') || job.includes('knight') || job.includes('vanguard') || job.includes('guardian') || job.includes('shield')) {
    return 'Guardian';
  }
  if (job.includes('mage') || job.includes('hexer') || job.includes('wizard') || job.includes('arcan')) {
    return 'Arcanist';
  }
  if (job.includes('thief') || job.includes('ninja') || job.includes('trickster') || job.includes('rogue')) {
    return 'Skirmisher';
  }
  if (job.includes('sniper') || job.includes('archer') || job.includes('ranger') || job.includes('deadeye')) {
    return 'Sharpshooter';
  }
  if (job.includes('warlord') || job.includes('commander') || job.includes('boss')) {
    return 'Commander';
  }
  return 'Striker';
}

export function createDefaultStratagem(unit) {
  if (typeof CombatRules.createDefaultStratagem === 'function') {
    try {
      const s = CombatRules.createDefaultStratagem(unit);
      if (s) return s;
    } catch (_) {}
  }

  const archetype = getUnitArchetype(unit);
  let defaultRules = [];

  switch (archetype) {
    case 'Healer':
      defaultRules = [
        { id: 'rule-1', enabled: true, condition: 'ally_hp_under_30', action: 'skill_heal_ally', priority: 1 },
        { id: 'rule-2', enabled: true, condition: 'ally_hp_under_50', action: 'skill_heal_ally', priority: 2 },
        { id: 'rule-3', enabled: true, condition: 'hp_under_25', action: 'retreat_to_allies', priority: 3 },
        { id: 'rule-4', enabled: true, condition: 'always', action: 'attack_weakest', priority: 4 }
      ];
      break;
    case 'Guardian':
      defaultRules = [
        { id: 'rule-1', enabled: true, condition: 'hp_under_25', action: 'skill_buff_self', priority: 1 },
        { id: 'rule-2', enabled: true, condition: 'enemy_leader', action: 'focus_boss', priority: 2 },
        { id: 'rule-3', enabled: true, condition: 'enemy_in_attack_range', action: 'attack_nearest', priority: 3 },
        { id: 'rule-4', enabled: true, condition: 'always', action: 'advance_flank', priority: 4 }
      ];
      break;
    case 'Arcanist':
      defaultRules = [
        { id: 'rule-1', enabled: true, condition: 'hp_under_25', action: 'retreat_to_allies', priority: 1 },
        { id: 'rule-2', enabled: true, condition: 'enemy_cluster', action: 'skill_burst_damage', priority: 2 },
        { id: 'rule-3', enabled: true, condition: 'enemy_weakest', action: 'skill_burst_damage', priority: 3 },
        { id: 'rule-4', enabled: true, condition: 'always', action: 'attack_nearest', priority: 4 }
      ];
      break;
    case 'Sharpshooter':
    case 'Skirmisher':
      defaultRules = [
        { id: 'rule-1', enabled: true, condition: 'hp_under_25', action: 'retreat_to_allies', priority: 1 },
        { id: 'rule-2', enabled: true, condition: 'enemy_caster', action: 'attack_caster', priority: 2 },
        { id: 'rule-3', enabled: true, condition: 'enemy_weakest', action: 'attack_weakest', priority: 3 },
        { id: 'rule-4', enabled: true, condition: 'always', action: 'advance_flank', priority: 4 }
      ];
      break;
    default:
      defaultRules = [
        { id: 'rule-1', enabled: true, condition: 'hp_under_25', action: 'retreat_to_allies', priority: 1 },
        { id: 'rule-2', enabled: true, condition: 'enemy_in_attack_range', action: 'attack_nearest', priority: 2 },
        { id: 'rule-3', enabled: true, condition: 'enemy_weakest', action: 'attack_weakest', priority: 3 },
        { id: 'rule-4', enabled: true, condition: 'always', action: 'attack_nearest', priority: 4 }
      ];
      break;
  }

  return {
    version: '1.0.0',
    ruleStamp: STRATAGEM_RULE_STAMP,
    archetype,
    unitId: unit?.id || 'unit-0',
    unitName: unit?.name || 'Unit',
    rules: defaultRules
  };
}

export function exportStratagemJSON(unit) {
  if (typeof CombatRules.exportStratagemJSON === 'function') {
    try {
      return CombatRules.exportStratagemJSON(unit);
    } catch (_) {}
  }
  const strat = unit?.stratagem || createDefaultStratagem(unit);
  return JSON.stringify(strat, null, 2);
}

export function importStratagemJSON(unit, jsonStr) {
  if (typeof CombatRules.importStratagemJSON === 'function') {
    try {
      return CombatRules.importStratagemJSON(unit, jsonStr);
    } catch (_) {}
  }
  const parsed = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr;
  if (!parsed || !Array.isArray(parsed.rules)) {
    throw new Error('Invalid StratagemDocument: rules array required');
  }

  unit.stratagem = {
    version: parsed.version || '1.0.0',
    ruleStamp: parsed.ruleStamp || STRATAGEM_RULE_STAMP,
    archetype: parsed.archetype || getUnitArchetype(unit),
    unitId: unit.id,
    unitName: unit.name,
    rules: parsed.rules.map((r, i) => ({
      id: r.id || `rule-${i + 1}`,
      enabled: r.enabled !== false,
      condition: r.condition || 'always',
      action: r.action || 'attack_nearest',
      priority: i + 1
    }))
  };
  return unit.stratagem;
}

/**
 * Evaluates the active unit's StratagemDocument against the live battlefield state.
 */
export function evaluateUnitStratagem(unit, allUnits = [], reachableTiles = [], board = null, activeLaw = null) {
  if (typeof CombatRules.evaluateUnitStratagem === 'function') {
    try {
      const res = CombatRules.evaluateUnitStratagem(unit, allUnits, reachableTiles, board, activeLaw);
      if (res) return res;
    } catch (_) {}
  }

  if (!unit) return null;
  const strat = unit.stratagem || createDefaultStratagem(unit);
  if (!strat || !Array.isArray(strat.rules)) return null;

  const isAzure = (unit.team || 'azure').toLowerCase() === 'azure' || (unit.team || '').toLowerCase() === 'blue';
  const allies = allUnits.filter(
    (u) =>
      u.id !== unit.id &&
      ((u.team || 'azure').toLowerCase() === (isAzure ? 'azure' : 'crimson') ||
       (u.team || '').toLowerCase() === (isAzure ? 'blue' : 'red')) &&
      u.alive !== false &&
      !u.isDead &&
      !u.inPrison
  );
  const enemies = allUnits.filter(
    (u) =>
      u.id !== unit.id &&
      ((u.team || 'azure').toLowerCase() !== (isAzure ? 'azure' : 'crimson') &&
       (u.team || '').toLowerCase() !== (isAzure ? 'blue' : 'red')) &&
      u.alive !== false &&
      !u.isDead &&
      !u.inPrison &&
      (u.hp === undefined || u.hp > 0)
  );

  const unitX = unit.x ?? unit.gridX ?? 0;
  const unitZ = unit.z ?? unit.gridZ ?? 0;
  const unitHp = Math.max(0, unit.hp ?? 100);
  const unitMaxHp = unit.maxHp ?? 100;
  const unitHpPct = unitHp / unitMaxHp;
  const unitMp = Math.max(0, unit.mp ?? 40);
  const attackRange = unit.attackRange || unit.weapon?.attackRange || 1;

  for (let i = 0; i < strat.rules.length; i++) {
    const rule = strat.rules[i];
    if (rule.enabled === false) continue;

    let conditionPassed = false;

    switch (rule.condition) {
      case 'always':
        conditionPassed = true;
        break;
      case 'hp_under_25':
        conditionPassed = unitHpPct <= 0.25;
        break;
      case 'hp_under_50':
        conditionPassed = unitHpPct <= 0.5;
        break;
      case 'mp_under_20':
        conditionPassed = unitMp < 20;
        break;
      case 'ally_hp_under_30':
        conditionPassed = allies.some((a) => (Math.max(0, a.hp ?? 100) / (a.maxHp ?? 100)) <= 0.3);
        break;
      case 'ally_hp_under_50':
        conditionPassed = allies.some((a) => (Math.max(0, a.hp ?? 100) / (a.maxHp ?? 100)) <= 0.5);
        break;
      case 'ally_down':
        conditionPassed = allUnits.some(
          (u) =>
            u.id !== unit.id &&
            ((u.team || 'azure').toLowerCase() === (isAzure ? 'azure' : 'crimson') ||
             (u.team || '').toLowerCase() === (isAzure ? 'blue' : 'red')) &&
            (u.alive === false || u.isDead || (u.hp !== undefined && u.hp <= 0))
        );
        break;
      case 'enemy_in_attack_range':
        conditionPassed = enemies.some((e) => {
          const ex = e.x ?? e.gridX ?? 0;
          const ez = e.z ?? e.gridZ ?? 0;
          return (Math.abs(ex - unitX) + Math.abs(ez - unitZ)) <= attackRange;
        });
        break;
      case 'enemy_cluster':
        if (enemies.length >= 2) {
          for (let a = 0; a < enemies.length; a++) {
            for (let b = a + 1; b < enemies.length; b++) {
              const ax = enemies[a].x ?? enemies[a].gridX ?? 0;
              const az = enemies[a].z ?? enemies[a].gridZ ?? 0;
              const bx = enemies[b].x ?? enemies[b].gridX ?? 0;
              const bz = enemies[b].z ?? enemies[b].gridZ ?? 0;
              if (Math.abs(ax - bx) + Math.abs(az - bz) <= 2) {
                conditionPassed = true;
                break;
              }
            }
            if (conditionPassed) break;
          }
        }
        break;
      case 'enemy_weakest':
        conditionPassed = enemies.length > 0;
        break;
      case 'enemy_caster':
        conditionPassed = enemies.some((e) => {
          const c = (e.job || e.className || e.class || '').toLowerCase();
          return c.includes('mage') || c.includes('hexer') || c.includes('cleric') || c.includes('wizard');
        });
        break;
      case 'enemy_leader':
        conditionPassed = enemies.some((e) => e.isBoss || e.rank === 'COMMANDER' || e.rank === 'WARLORD');
        break;
      case 'enemy_buffed':
        conditionPassed = enemies.some((e) => e.buffs?.length > 0 || e.statuses?.length > 0);
        break;
      case 'standing_on_crystal': {
        const tile = board?.getTile?.(unitX, unitZ);
        conditionPassed = tile?.type === 'water' || tile?.isWater || tile?.crystal || tile?.type === 'crystal';
        break;
      }
      case 'law_risk':
        conditionPassed = !!activeLaw;
        break;
      default:
        conditionPassed = true;
        break;
    }

    if (!conditionPassed) continue;

    // Condition met! Resolve Action:
    const condMeta = STRATAGEM_CONDITIONS.find((c) => c.id === rule.condition) || { label: rule.condition };
    const actMeta = STRATAGEM_ACTIONS.find((a) => a.id === rule.action) || { label: rule.action };

    let targetUnit = null;
    let chosenAbility = (unit.abilities && unit.abilities[0]) || { id: 'basic-attack', name: 'Attack', power: 1.0, range: attackRange };
    let actionType = 'attack';
    let moveTile = { x: unitX, z: unitZ };

    switch (rule.action) {
      case 'skill_heal_ally': {
        const woundedAllies = [...allies].sort(
          (a, b) => (Math.max(0, a.hp ?? 100) / (a.maxHp ?? 100)) - (Math.max(0, b.hp ?? 100) / (b.maxHp ?? 100))
        );
        targetUnit = woundedAllies[0] || unit;
        actionType = 'ability';
        chosenAbility = unit.abilities?.find((ab) => ab.isHealing || ab.category === 'heal' || ab.name.includes('Cure') || ab.name.includes('Heal')) || {
          id: 'first-aid',
          name: 'First Aid',
          power: 1.5,
          isHealing: true,
          range: 2
        };
        break;
      }

      case 'skill_buff_self': {
        targetUnit = unit;
        actionType = 'ability';
        chosenAbility = unit.abilities?.find((ab) => ab.category === 'buff' || ab.name.includes('Shield') || ab.name.includes('Fortify') || ab.name.includes('Focus')) || {
          id: 'defend-stance',
          name: 'Iron Guard',
          power: 1.0,
          range: 0
        };
        break;
      }

      case 'skill_burst_damage': {
        targetUnit = [...enemies].sort((a, b) => (a.hp ?? 100) - (b.hp ?? 100))[0] || null;
        actionType = 'ability';
        chosenAbility = unit.abilities?.find((ab) => (ab.power || 1.0) > 1.2) || unit.abilities?.[0] || chosenAbility;
        break;
      }

      case 'attack_caster': {
        const casters = enemies.filter((e) => {
          const c = (e.job || e.className || e.class || '').toLowerCase();
          return c.includes('mage') || c.includes('hexer') || c.includes('cleric') || c.includes('wizard');
        });
        targetUnit = casters[0] || enemies[0] || null;
        actionType = 'attack';
        break;
      }

      case 'focus_boss': {
        targetUnit = enemies.find((e) => e.isBoss || e.rank === 'COMMANDER' || e.rank === 'WARLORD') || enemies[0] || null;
        actionType = 'attack';
        break;
      }

      case 'attack_weakest': {
        targetUnit = [...enemies].sort((a, b) => (a.hp ?? 100) - (b.hp ?? 100))[0] || null;
        actionType = 'attack';
        break;
      }

      case 'retreat_to_allies': {
        actionType = 'wait';
        targetUnit = null;
        // Find reachable tile furthest from enemies or closest to allies
        if (reachableTiles && reachableTiles.length > 0 && allies.length > 0) {
          const allyCenter = {
            x: allies.reduce((s, a) => s + (a.x ?? 0), 0) / allies.length,
            z: allies.reduce((s, a) => s + (a.z ?? 0), 0) / allies.length
          };
          let bestDist = Infinity;
          for (const t of reachableTiles) {
            const d = Math.abs(t.x - allyCenter.x) + Math.abs(t.z - allyCenter.z);
            if (d < bestDist) {
              bestDist = d;
              moveTile = t;
            }
          }
        }
        break;
      }

      case 'hold_ground': {
        actionType = 'wait';
        targetUnit = null;
        moveTile = { x: unitX, z: unitZ };
        break;
      }

      case 'advance_flank':
      case 'attack_nearest':
      default: {
        let bestDist = Infinity;
        for (const e of enemies) {
          const ex = e.x ?? e.gridX ?? 0;
          const ez = e.z ?? e.gridZ ?? 0;
          const d = Math.abs(ex - unitX) + Math.abs(ez - unitZ);
          if (d < bestDist) {
            bestDist = d;
            targetUnit = e;
          }
        }
        actionType = 'attack';
        break;
      }
    }

    // Determine moveTile to reach target if targetUnit exists and not already in range
    if (targetUnit && reachableTiles && reachableTiles.length > 0) {
      const tgtX = targetUnit.x ?? targetUnit.gridX ?? 0;
      const tgtZ = targetUnit.z ?? targetUnit.gridZ ?? 0;
      let minDistanceToTarget = Infinity;
      let candidateTile = moveTile;

      for (const t of reachableTiles) {
        const d = Math.abs(t.x - tgtX) + Math.abs(t.z - tgtZ);
        if (d >= 1 && d < minDistanceToTarget) {
          minDistanceToTarget = d;
          candidateTile = t;
        }
      }
      if (candidateTile) {
        moveTile = candidateTile;
      }
    }

    return {
      matchedRule: {
        index: i,
        id: rule.id,
        condition: rule.condition,
        conditionLabel: condMeta.label,
        action: rule.action,
        actionLabel: actMeta.label
      },
      moveTile,
      targetUnit,
      ability: chosenAbility,
      actionType
    };
  }

  return null;
}

/**
 * StratagemModal Class
 */
export class StratagemModal {
  /**
   * @param {HTMLElement} containerEl
   * @param {Object} callbacks
   * @param {(unit: any, stratagem: any) => void} [callbacks.onSaveStratagem]
   * @param {() => void} [callbacks.onClose]
   */
  constructor(containerEl = document.body, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks;

    this.units = [];
    this.selectedUnitId = null;
    this.board = null;
    this.activeLaw = null;
    this.modalEl = null;
    this._isOpen = false;

    this._onKeyDown = (e) => {
      if (this._isOpen && e.key === 'Escape') {
        this.close();
      }
    };
  }

  open(options = {}) {
    this.units = options.units || [];
    this.board = options.board || null;
    this.activeLaw = options.activeLaw || null;

    if (options.selectedUnitId) {
      this.selectedUnitId = options.selectedUnitId;
    } else if (!this.selectedUnitId && this.units.length > 0) {
      const firstClan = this.units.find(
        (u) => (u.team || 'azure').toLowerCase() === 'azure' || (u.team || '').toLowerCase() === 'blue'
      );
      this.selectedUnitId = firstClan ? firstClan.id : this.units[0].id;
    }

    this._isOpen = true;

    if (!this.modalEl) {
      this._buildDOM();
    } else {
      this.modalEl.style.display = 'flex';
      this._renderAll();
    }

    window.addEventListener('keydown', this._onKeyDown);
  }

  close() {
    this._isOpen = false;
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
    window.removeEventListener('keydown', this._onKeyDown);
    this.callbacks.onClose?.();
  }

  isOpen() {
    return this._isOpen;
  }

  update(options = {}) {
    if (options.units) this.units = options.units;
    if (options.selectedUnitId) this.selectedUnitId = options.selectedUnitId;
    if (options.board) this.board = options.board;
    if (options.activeLaw) this.activeLaw = options.activeLaw;

    if (this._isOpen && this.modalEl) {
      this._renderAll();
    }
  }

  /* ========================================================================
     DOM Construction & Layout
     ======================================================================== */

  _buildDOM() {
    const backdrop = document.createElement('div');
    backdrop.className = 'stratagem-modal-backdrop';

    backdrop.innerHTML = `
      <div class="stratagem-modal">
        <header class="stratagem-header">
          <div class="stratagem-header-brand">
            <span style="color: var(--azure, #38bdf8); font-size: 18px;">🧠</span>
            <div>
              <div class="stratagem-header-title">ANIMA STRATAGEM GAMBIT AI EDITOR</div>
              <div class="stratagem-header-stamp">STAMP: ${STRATAGEM_RULE_STAMP} // FFTA & FFXII STRATAGEM PIPELINE</div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="hud-btn" id="stratagem-btn-close" style="padding: 4px 10px; font-weight: 800;">✕ ESC</button>
          </div>
        </header>

        <div class="stratagem-layout">
          <!-- 1. Left Roster Panel -->
          <aside class="stratagem-roster-panel" id="stratagem-roster-slot"></aside>

          <!-- 2. Center Rules Pipeline -->
          <main class="stratagem-pipeline-panel" id="stratagem-pipeline-slot"></main>

          <!-- 3. Right Live Simulation & JSON Preview -->
          <aside class="stratagem-sim-panel" id="stratagem-sim-slot"></aside>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    backdrop.querySelector('#stratagem-btn-close').addEventListener('click', () => this.close());

    this.container.appendChild(backdrop);
    this.modalEl = backdrop;

    this._renderAll();
  }

  _renderAll() {
    this._renderRoster();
    this._renderPipeline();
    this._renderSimAndJSON();
  }

  _getSelectedUnit() {
    return this.units.find((u) => u.id === this.selectedUnitId) || this.units[0] || null;
  }

  /* ========================================================================
     1. Left Roster Panel
     ======================================================================== */

  _renderRoster() {
    const slot = this.modalEl.querySelector('#stratagem-roster-slot');
    if (!slot) return;
    slot.innerHTML = '';

    const selectedUnit = this._getSelectedUnit();

    const title = document.createElement('div');
    title.className = 'stratagem-panel-title';
    title.innerHTML = `<span>👥 BATTLEFIELD ROSTER</span><span style="font-size: 10px; color: var(--text-muted);">${this.units.length} Units</span>`;
    slot.appendChild(title);

    // Group units into Azure Clan and Crimson Order
    const clanUnits = this.units.filter(
      (u) => (u.team || 'azure').toLowerCase() === 'azure' || (u.team || '').toLowerCase() === 'blue'
    );
    const enemyUnits = this.units.filter(
      (u) => (u.team || 'azure').toLowerCase() !== 'azure' && (u.team || '').toLowerCase() !== 'blue'
    );

    const renderUnitItem = (unit, isEnemy = false) => {
      const isSelected = selectedUnit && selectedUnit.id === unit.id;
      const archetype = getUnitArchetype(unit);
      const grade = (unit.grade || 'B').toUpperCase();
      const hp = Math.max(0, unit.hp ?? 100);
      const maxHp = unit.maxHp ?? 100;
      const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));

      const item = document.createElement('div');
      item.className = `stratagem-unit-card ${isEnemy ? 'enemy-card' : 'clan-card'} ${isSelected ? 'selected' : ''}`;
      item.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div style="font-weight: 800; font-size: 12px; color: ${isSelected ? '#fff' : isEnemy ? '#fca5a5' : '#bae6fd'};">
            ${isEnemy ? '☠️' : '🛡️'} ${unit.name}
          </div>
          <span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 3px;">
          <span>${unit.job || unit.className || 'Knight'}</span>
          <span class="archetype-badge">${archetype}</span>
        </div>
        <div class="stratagem-mini-hp">
          <div class="stratagem-mini-hp-fill ${isEnemy ? 'enemy' : 'clan'}" style="width: ${hpPct}%;"></div>
        </div>
      `;

      item.addEventListener('click', () => {
        this.selectedUnitId = unit.id;
        this._renderAll();
      });

      return item;
    };

    // Clan Section
    const clanHeader = document.createElement('div');
    clanHeader.className = 'roster-section-header';
    clanHeader.innerHTML = `<span>🛡️ AZURE CLAN</span> <span class="badge-editable">EDITABLE</span>`;
    slot.appendChild(clanHeader);

    clanUnits.forEach((u) => slot.appendChild(renderUnitItem(u, false)));

    // Enemy Section
    const enemyHeader = document.createElement('div');
    enemyHeader.className = 'roster-section-header enemy-header';
    enemyHeader.innerHTML = `<span>☠️ CRIMSON ORDER</span> <span class="badge-readonly">READ-ONLY RECON</span>`;
    slot.appendChild(enemyHeader);

    enemyUnits.forEach((u) => slot.appendChild(renderUnitItem(u, true)));
  }

  /* ========================================================================
     2. Center Gambit Rules Pipeline
     ======================================================================== */

  _renderPipeline() {
    const slot = this.modalEl.querySelector('#stratagem-pipeline-slot');
    if (!slot) return;
    slot.innerHTML = '';

    const unit = this._getSelectedUnit();
    if (!unit) {
      slot.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">No unit selected.</div>';
      return;
    }

    if (!unit.stratagem) {
      unit.stratagem = createDefaultStratagem(unit);
    }
    const strat = unit.stratagem;
    const isEnemy = (unit.team || 'azure').toLowerCase() !== 'azure' && (unit.team || '').toLowerCase() !== 'blue';

    // Banner
    const banner = document.createElement('div');
    banner.className = `stratagem-pipeline-banner ${isEnemy ? 'enemy' : 'clan'}`;
    banner.innerHTML = isEnemy
      ? `<span>👁️ READ-ONLY ENEMY AI RECON // Anticipate Crimson behavior in battle</span>`
      : `<span>⚡ ACTIVE CLAN GAMBIT PIPELINE // Priority order evaluates top-down (#1 ➔ #N)</span>`;
    slot.appendChild(banner);

    // Header info row
    const infoRow = document.createElement('div');
    infoRow.className = 'stratagem-unit-banner';
    infoRow.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px;">${isEnemy ? '☠️' : '⚔️'}</span>
        <div>
          <span class="unit-title-name">${unit.name} [${unit.job || unit.className || 'Knight'}]</span>
          <span class="rule-stamp-tag">${strat.ruleStamp || STRATAGEM_RULE_STAMP}</span>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="archetype-badge large">${strat.archetype || getUnitArchetype(unit)}</span>
        <span class="rules-count-badge">${strat.rules.length} Rules</span>
      </div>
    `;
    slot.appendChild(infoRow);

    // Rules List
    const rulesList = document.createElement('div');
    rulesList.className = 'stratagem-rules-list';

    strat.rules.forEach((rule, idx) => {
      const ruleRow = document.createElement('div');
      ruleRow.className = `stratagem-rule-row ${!rule.enabled ? 'disabled' : ''}`;

      const conditionOptions = STRATAGEM_CONDITIONS.map(
        (c) => `<option value="${c.id}" ${rule.condition === c.id ? 'selected' : ''}>${c.label}</option>`
      ).join('');

      const actionOptions = STRATAGEM_ACTIONS.map(
        (a) => `<option value="${a.id}" ${rule.action === a.id ? 'selected' : ''}>${a.label}</option>`
      ).join('');

      ruleRow.innerHTML = `
        <div class="rule-priority-badge">#${idx + 1}</div>

        <label class="rule-toggle-label" title="Enable / Disable Rule">
          <input type="checkbox" class="rule-checkbox" data-idx="${idx}" ${rule.enabled !== false ? 'checked' : ''} ${isEnemy ? 'disabled' : ''} />
          <span class="checkbox-visual"></span>
        </label>

        <div class="rule-condition-col">
          <span class="rule-label-micro">IF CONDITION</span>
          <select class="stratagem-select rule-cond-select" data-idx="${idx}" ${isEnemy ? 'disabled' : ''}>
            ${conditionOptions}
          </select>
        </div>

        <div class="rule-arrow-col">➔</div>

        <div class="rule-action-col">
          <span class="rule-label-micro">THEN ACTION</span>
          <select class="stratagem-select rule-act-select" data-idx="${idx}" ${isEnemy ? 'disabled' : ''}>
            ${actionOptions}
          </select>
        </div>

        ${!isEnemy ? `
          <div class="rule-actions-col">
            <button class="rule-btn btn-rule-up" data-idx="${idx}" title="Move Up" ${idx === 0 ? 'disabled' : ''}>⬆️</button>
            <button class="rule-btn btn-rule-down" data-idx="${idx}" title="Move Down" ${idx === strat.rules.length - 1 ? 'disabled' : ''}>⬇️</button>
            <button class="rule-btn btn-rule-del" data-idx="${idx}" title="Delete Rule">🗑️</button>
          </div>
        ` : `
          <span style="font-size: 10px; color: var(--text-muted); padding: 0 8px;">[FIXED]</span>
        `}
      `;

      if (!isEnemy) {
        // Checkbox listener
        const chk = ruleRow.querySelector('.rule-checkbox');
        chk?.addEventListener('change', (e) => {
          rule.enabled = e.target.checked;
          this._saveAndRefresh();
        });

        // Condition select
        const condSel = ruleRow.querySelector('.rule-cond-select');
        condSel?.addEventListener('change', (e) => {
          rule.condition = e.target.value;
          this._saveAndRefresh();
        });

        // Action select
        const actSel = ruleRow.querySelector('.rule-act-select');
        actSel?.addEventListener('change', (e) => {
          rule.action = e.target.value;
          this._saveAndRefresh();
        });

        // Move Up
        ruleRow.querySelector('.btn-rule-up')?.addEventListener('click', () => {
          if (idx > 0) {
            const temp = strat.rules[idx];
            strat.rules[idx] = strat.rules[idx - 1];
            strat.rules[idx - 1] = temp;
            this._reassignPriorities(strat);
            this._saveAndRefresh();
          }
        });

        // Move Down
        ruleRow.querySelector('.btn-rule-down')?.addEventListener('click', () => {
          if (idx < strat.rules.length - 1) {
            const temp = strat.rules[idx];
            strat.rules[idx] = strat.rules[idx + 1];
            strat.rules[idx + 1] = temp;
            this._reassignPriorities(strat);
            this._saveAndRefresh();
          }
        });

        // Delete
        ruleRow.querySelector('.btn-rule-del')?.addEventListener('click', () => {
          if (strat.rules.length <= 1) {
            alert('A unit must retain at least 1 gambit rule.');
            return;
          }
          strat.rules.splice(idx, 1);
          this._reassignPriorities(strat);
          this._saveAndRefresh();
        });
      }

      rulesList.appendChild(ruleRow);
    });

    slot.appendChild(rulesList);

    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'stratagem-pipeline-toolbar';
    toolbar.innerHTML = `
      <div style="display: flex; gap: 6px;">
        ${!isEnemy ? `
          <button class="hud-btn gold" id="btn-add-rule">+ ADD GAMBIT RULE</button>
          <button class="hud-btn" id="btn-reset-default">🔄 RESET DEFAULT</button>
        ` : ''}
      </div>
      <div style="display: flex; gap: 6px;">
        <button class="hud-btn" id="btn-copy-json">📋 COPY JSON</button>
        ${!isEnemy ? `<button class="hud-btn" id="btn-import-json">📥 IMPORT JSON</button>` : ''}
      </div>
    `;

    if (!isEnemy) {
      toolbar.querySelector('#btn-add-rule')?.addEventListener('click', () => {
        strat.rules.push({
          id: `rule-${strat.rules.length + 1}`,
          enabled: true,
          condition: 'always',
          action: 'attack_nearest',
          priority: strat.rules.length + 1
        });
        this._saveAndRefresh();
      });

      toolbar.querySelector('#btn-reset-default')?.addEventListener('click', () => {
        unit.stratagem = createDefaultStratagem(unit);
        this._saveAndRefresh();
      });

      toolbar.querySelector('#btn-import-json')?.addEventListener('click', () => {
        const raw = prompt('Paste StratagemDocument JSON payload:');
        if (raw) {
          try {
            importStratagemJSON(unit, raw);
            this._saveAndRefresh();
          } catch (err) {
            alert(`JSON import failed: ${err.message}`);
          }
        }
      });
    }

    toolbar.querySelector('#btn-copy-json')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(exportStratagemJSON(unit));
        const btn = toolbar.querySelector('#btn-copy-json');
        if (btn) {
          const orig = btn.textContent;
          btn.textContent = 'COPIED!';
          setTimeout(() => { btn.textContent = orig; }, 1500);
        }
      } catch (err) {
        console.warn('Clipboard error:', err);
      }
    });

    slot.appendChild(toolbar);
  }

  _reassignPriorities(strat) {
    strat.rules.forEach((r, i) => {
      r.priority = i + 1;
    });
  }

  _saveAndRefresh() {
    const unit = this._getSelectedUnit();
    if (unit) {
      this.callbacks.onSaveStratagem?.(unit, unit.stratagem);
    }
    this._renderPipeline();
    this._renderSimAndJSON();
  }

  /* ========================================================================
     3. Right Live Simulation & JSON Preview Panel
     ======================================================================== */

  _renderSimAndJSON() {
    const slot = this.modalEl.querySelector('#stratagem-sim-slot');
    if (!slot) return;
    slot.innerHTML = '';

    const unit = this._getSelectedUnit();
    if (!unit) return;

    // Simulation Header
    const simHeader = document.createElement('div');
    simHeader.className = 'stratagem-panel-title';
    simHeader.innerHTML = `<span>⚡ LIVE BATTLEFIELD SIMULATION</span>`;
    slot.appendChild(simHeader);

    // Evaluate against battlefield
    const simResult = evaluateUnitStratagem(
      unit,
      this.units,
      [{ x: unit.x ?? unit.gridX ?? 0, z: unit.z ?? unit.gridZ ?? 0 }],
      this.board,
      this.activeLaw
    );

    const simBox = document.createElement('div');
    simBox.className = 'stratagem-sim-box';

    if (simResult && simResult.matchedRule) {
      const { matchedRule, targetUnit, moveTile, ability } = simResult;
      simBox.innerHTML = `
        <div class="sim-match-badge match-found">
          <span>🎯 MATCHED RULE #${matchedRule.index + 1}</span>
          <span style="font-size: 10px;">PRIORITY 1st MATCH</span>
        </div>
        <div class="sim-details-grid">
          <div class="sim-cell">
            <span class="sim-cell-lbl">TRIGGERED CONDITION</span>
            <span class="sim-cell-val" style="color: #38bdf8;">${matchedRule.conditionLabel}</span>
          </div>
          <div class="sim-cell">
            <span class="sim-cell-lbl">EXECUTED ACTION</span>
            <span class="sim-cell-val" style="color: #fbbf24;">${matchedRule.actionLabel}</span>
          </div>
          <div class="sim-cell">
            <span class="sim-cell-lbl">TARGET SELECTION</span>
            <span class="sim-cell-val" style="color: #f43f5e;">${targetUnit ? targetUnit.name : 'Self / Ground'}</span>
          </div>
          <div class="sim-cell">
            <span class="sim-cell-lbl">CHOSEN ABILITY</span>
            <span class="sim-cell-val" style="color: #34d399;">${ability ? ability.name : 'Basic Attack'}</span>
          </div>
        </div>
        <div class="sim-tile-coord">
          <span>Target Position:</span> <strong>(${moveTile?.x ?? 0}, ${moveTile?.z ?? 0})</strong>
        </div>
      `;
    } else {
      simBox.innerHTML = `
        <div class="sim-match-badge no-match">
          <span>⚠️ NO GAMBIT RULE MATCHED</span>
        </div>
        <div style="font-size: 11px; color: var(--text-muted); line-height: 1.4; padding: 6px;">
          All enabled conditions evaluated to false under current combat conditions.
          The Tactical AI will fall back to default combat heuristics.
        </div>
      `;
    }

    slot.appendChild(simBox);

    // JSON Preview Section
    const jsonHeader = document.createElement('div');
    jsonHeader.className = 'stratagem-panel-title';
    jsonHeader.style.marginTop = '12px';
    jsonHeader.innerHTML = `<span>📋 STRATAGEMDOCUMENT JSON</span>`;
    slot.appendChild(jsonHeader);

    const pre = document.createElement('pre');
    pre.className = 'stratagem-json-content';
    pre.textContent = exportStratagemJSON(unit);
    slot.appendChild(pre);
  }
}
