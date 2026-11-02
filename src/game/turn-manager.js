/**
 * turn-manager.js
 * Track 1: FFTA-style Charge Time (CT) Turn Manager, FFTA Judge Law System, and Tactical AI Engine.
 *
 * Implements CT tick advancement (threshold 100), resting CT savings (base 60, +20 moved, +20 acted),
 * turn queue lookahead preview, FFTA Judge Law card enforcement, and deep enemy archetype Tactical AI evaluation.
 */

import {
  getReachableTiles,
  getAttackableTiles,
  calculateCombatForecast,
  calculateFacing,
  getRelativeDirection
} from './combat-rules.js';

export const LAWS = [
  {
    id: 'no_backstab',
    name: 'Law of Chivalry',
    forbidden: 'Back Attacks',
    description: 'Attacking an enemy from behind is forbidden (+10% Front DMG bonus).'
  },
  {
    id: 'no_ranged',
    name: 'Law of Close Quarters',
    forbidden: 'Distance > 2 Attacks',
    description: 'Attacks from 3+ tiles away are forbidden (+1 MOV to all units).'
  },
  {
    id: 'no_magic',
    name: 'Law of Silence',
    forbidden: 'Tome & Harp Skills',
    description: 'Using Tome or Harp actions is forbidden (+15% Physical ATK).'
  },
  {
    id: 'no_blades',
    name: 'Law of Blunt Honor',
    forbidden: 'Katana & Sword Swings',
    description: 'Using Sword or Katana attacks is forbidden (+15% Spear/Rifle/Magic DMG).'
  },
  {
    id: 'no_low_blow',
    name: 'Law of High Ground',
    forbidden: 'Attacking Lower Targets',
    description: 'Striking targets at lower elevation is forbidden (+20% High Strike DMG).'
  }
];

export const TACTICAL_LAWS = LAWS;

export class TurnManager {
  constructor(options = {}) {
    this.ctThreshold = options.ctThreshold || 100;
    this.activeUnit = null;
    this.tickCount = 0;
    this.turnCount = 0;
    this.seed = options.seed !== undefined ? (options.seed >>> 0) : 0x1337;
    this.activeLaw = this._getLawForTurn(this.turnCount);
  }

  /**
   * Resets turn manager for a new match / battlefield seed.
   * @param {number} [seed]
   */
  reset(seed) {
    if (seed !== undefined) {
      this.seed = (seed >>> 0);
    }
    this.activeUnit = null;
    this.tickCount = 0;
    this.turnCount = 0;
    this.activeLaw = this._getLawForTurn(0);
    return this;
  }

  /**
   * Returns deterministic active FFTA Law rotating every 6 turns.
   */
  _getLawForTurn(turnCount) {
    const baseOffset = (this.seed >>> 0) % LAWS.length;
    const cycle = Math.floor(Math.max(0, turnCount) / 6);
    const index = (baseOffset + cycle) % LAWS.length;
    return LAWS[index];
  }

  /**
   * Exposes active FFTA Judge Law.
   */
  getActiveLaw() {
    return this.activeLaw || this._getLawForTurn(this.turnCount);
  }

  /**
   * Evaluates law compliance against the active FFTA Judge Law.
   * Tracks unit.yellowCards and unit.redCards.
   *
   * @param {Object} attacker
   * @param {Object} target
   * @param {Object} actionContext { ability, forecast, attackAngle, preview?: boolean }
   * @returns {{ violated: boolean, law: Object, cardType: 'YELLOW'|'RED'|null, penaltyText: string }}
   */
  evaluateLawCompliance(attacker, target, actionContext = {}) {
    if (!attacker) {
      return { violated: false, law: this.activeLaw, cardType: null, penaltyText: '' };
    }

    if (attacker.yellowCards === undefined) attacker.yellowCards = 0;
    if (attacker.redCards === undefined) attacker.redCards = 0;

    const law = this.activeLaw || this._getLawForTurn(this.turnCount);
    if (!law || !target) {
      return { violated: false, law, cardType: null, penaltyText: '' };
    }

    // Support/healing on allies or actions on same team are never violations
    const isSupport = !!actionContext.ability?.isSupport;
    const sameTeam = attacker.team && target.team && attacker.team === target.team;
    if (isSupport || sameTeam) {
      return { violated: false, law, cardType: null, penaltyText: '' };
    }

    let violated = false;
    const ability = actionContext.ability;
    const wType = (attacker.weapon?.weaponType || attacker.weaponType || attacker.weapon?.heldModelName || '').toLowerCase();

    switch (law.id) {
      case 'no_backstab': {
        const angle = actionContext.attackAngle || actionContext.forecast?.attackAngle || getRelativeDirection(attacker, target);
        if (angle === 'Back') violated = true;
        break;
      }
      case 'no_ranged': {
        const ax = attacker.gridX !== undefined ? attacker.gridX : (attacker.x ?? 0);
        const az = attacker.gridZ !== undefined ? attacker.gridZ : (attacker.z ?? 0);
        const tx = target.gridX !== undefined ? target.gridX : (target.x ?? 0);
        const tz = target.gridZ !== undefined ? target.gridZ : (target.z ?? 0);
        const dist = Math.abs(ax - tx) + Math.abs(az - tz);
        if (dist > 2) violated = true;
        break;
      }
      case 'no_magic': {
        const isMagic = !!(ability?.isMagic || wType === 'tome' || wType === 'harp' ||
          ability?.anim === 'Casting' || ability?.anim === 'Read Book' ||
          ability?.anim === 'Play Instrument' || ability?.anim === 'Singing');
        if (isMagic) violated = true;
        break;
      }
      case 'no_blades': {
        const isBlade = wType === 'sword' || wType === 'katana' ||
          ability?.animPrefix === 'Swing' || ability?.anim === 'Katana Use';
        if (isBlade) violated = true;
        break;
      }
      case 'no_low_blow': {
        const atkElev = typeof attacker.elevation === 'number' ? attacker.elevation : 0;
        const defElev = typeof target.elevation === 'number' ? target.elevation : 0;
        if (defElev < atkElev) violated = true;
        break;
      }
    }

    if (!violated) {
      return { violated: false, law, cardType: null, penaltyText: '' };
    }

    const isSim = !!(actionContext.preview || actionContext.simulate);
    const willBeRed = (attacker.yellowCards || 0) >= 1;
    const cardType = willBeRed ? 'RED' : 'YELLOW';

    if (!isSim) {
      if (willBeRed) {
        attacker.redCards = (attacker.redCards || 0) + 1;
      } else {
        attacker.yellowCards = (attacker.yellowCards || 0) + 1;
      }
    }

    const penaltyText = cardType === 'RED'
      ? `JUDGE PENALTY: ${attacker.name} committed a repeat offense under ${law.name} (${law.forbidden})! RED CARD issued!`
      : `JUDGE WARNING: ${attacker.name} violated ${law.name} (${law.forbidden})! YELLOW CARD issued!`;

    return {
      violated: true,
      law,
      cardType,
      penaltyText
    };
  }

  /**
   * Advances the CT clock of all living units until at least one unit reaches or exceeds ctThreshold (100).
   * Picks the unit with the highest overflow CT (ties broken by speed).
   * Note: Active unit keeps its CT during its turn; CT is deducted when endTurn() is called.
   *
   * Returns { activeUnit, ticksElapsed, overflowCt }
   */
  nextTurn(units = []) {
    const livingUnits = units.filter(
      (u) => u && u.alive !== false && (u.hp === undefined || u.hp > 0)
    );

    if (livingUnits.length === 0) {
      this.activeUnit = null;
      return { activeUnit: null, ticksElapsed: 0, overflowCt: 0 };
    }

    let readyUnits = livingUnits.filter((u) => (u.ct || 0) >= this.ctThreshold);
    let ticksElapsed = 0;

    while (readyUnits.length === 0) {
      // Find minimum ticks required for any unit to reach threshold
      let minTicks = Infinity;
      for (const u of livingUnits) {
        const speed = Math.max(1, u.speed || 15);
        const needed = Math.max(0, this.ctThreshold - (u.ct || 0));
        const ticks = Math.max(1, Math.ceil(needed / speed));
        if (ticks < minTicks) {
          minTicks = ticks;
        }
      }

      if (minTicks === Infinity || minTicks < 1) {
        minTicks = 1;
      }

      for (const u of livingUnits) {
        const speed = Math.max(1, u.speed || 15);
        u.ct = (u.ct || 0) + speed * minTicks;
      }

      ticksElapsed += minTicks;
      this.tickCount += minTicks;
      readyUnits = livingUnits.filter((u) => (u.ct || 0) >= this.ctThreshold);
    }

    // Sort by highest overflow CT, then highest speed
    readyUnits.sort((a, b) => (b.ct || 0) - (a.ct || 0) || (b.speed || 15) - (a.speed || 15));

    const activeUnit = readyUnits[0];
    this.activeUnit = activeUnit;
    this.turnCount++;
    this.activeLaw = this._getLawForTurn(this.turnCount);

    // When a unit reaches 100 CT to start its turn, if frozen or sleeping, decrement statusTurns.
    // If statusTurns <= 0, clear unit.status = null.
    if (activeUnit.status === 'frozen' || activeUnit.status === 'sleeping') {
      activeUnit.statusTurns = (activeUnit.statusTurns || 1) - 1;
      if (activeUnit.statusTurns <= 0) {
        activeUnit.status = null;
      }
    }

    return {
      activeUnit,
      ticksElapsed,
      overflowCt: Math.max(0, (activeUnit.ct || 0) - this.ctThreshold)
    };
  }

  /**
   * Concludes a unit's active turn.
   * Deducts 60 CT base + 20 if moved + 20 if acted.
   * (e.g. Resting [moved=false, acted=false] deducts 60 CT, preserving 40+overflow CT!).
   *
   * Returns { remainingCt, ctCost }
   */
  endTurn(unit, moved = false, acted = false) {
    let ctCost = 60;
    if (moved) ctCost += 20;
    if (acted) ctCost += 20;

    unit.ct = Math.max(0, (unit.ct || this.ctThreshold) - ctCost);

    if (this.activeUnit === unit) {
      this.activeUnit = null;
    }

    return {
      remainingCt: unit.ct,
      ctCost
    };
  }

  /**
   * Clones unit CT/speed state and simulates the next `count` turns.
   * Includes BOTH id and unitId, plus className, job, isBoss, rank, weaponType, paletteId, scale.
   */
  getTurnQueuePreview(units = [], count = 8) {
    const simUnits = units
      .filter((u) => u && u.alive !== false && (u.hp === undefined || u.hp > 0))
      .map((u) => {
        const className = u.className || u.job || u.class || 'Knight';
        const weaponType = u.weapon?.weaponModel || u.weapon?.heldModelName || u.weapon?.weaponType || u.weaponType || 'sword';
        return {
          id: u.id,
          unitId: u.id,
          name: u.name,
          team: u.team,
          className,
          job: className,
          isBoss: !!u.isBoss,
          rank: u.rank || (u.team === 'crimson' ? 'SOLDIER' : 'HERO'),
          weaponType,
          paletteId: u.paletteId,
          scale: u.scale || 1.0,
          grade: u.grade || 'C',
          speed: Math.max(1, u.speed || 15),
          ct: u.ct || 0
        };
      });

    if (simUnits.length === 0) return [];

    const queue = [];
    let accumulatedTicks = 0;

    for (let turn = 0; turn < count; turn++) {
      let ready = simUnits.filter((u) => u.ct >= this.ctThreshold);

      while (ready.length === 0) {
        let minTicks = Infinity;
        for (const u of simUnits) {
          const needed = Math.max(0, this.ctThreshold - u.ct);
          const t = Math.max(1, Math.ceil(needed / u.speed));
          if (t < minTicks) minTicks = t;
        }

        if (minTicks === Infinity || minTicks < 1) minTicks = 1;

        for (const u of simUnits) {
          u.ct += u.speed * minTicks;
        }

        accumulatedTicks += minTicks;
        ready = simUnits.filter((u) => u.ct >= this.ctThreshold);
      }

      ready.sort((a, b) => b.ct - a.ct || b.speed - a.speed);
      const winner = ready[0];

      queue.push({
        id: winner.unitId,
        unitId: winner.unitId,
        name: winner.name,
        team: winner.team,
        className: winner.className,
        job: winner.job,
        isBoss: winner.isBoss,
        rank: winner.rank,
        weaponType: winner.weaponType,
        paletteId: winner.paletteId,
        scale: winner.scale,
        grade: winner.grade,
        ct: winner.ct,
        ticksUntilTurn: accumulatedTicks
      });

      // Preview assumes standard complete turn (100 CT deduction)
      winner.ct = Math.max(0, winner.ct - this.ctThreshold);
    }

    return queue;
  }

  /**
   * Tactical AI:
   * - Evaluates all reachable tiles from current position + all abilities against valid targets.
   * - Considers Judge Law compliance (-220 score if action would violate law).
   * - Implements deep enemy archetype AI roles:
   *   - COMMANDER / Boss: High kill aggression, focuses lowest HP targets, powerhouse skills
   *   - VANGUARD: Tanks front line, body blocks, shield bashes
   *   - HEXER: Prefers ranged spells/tomes, triage heals wounded allies
   *   - DEADEYE: Snipes from range 3+, seeks flank/backstab angles
   * - If no enemy is in attack range, moves toward nearest enemy and faces them (default fallback facing 'SE').
   *
   * Returns { moveTile, movePath, ability, targetUnit, endFacing, forecast }
   */
  computeTacticalAI(aiUnit, allUnits = [], board = null) {
    // If unit is incapacitated by frozen or sleeping status, skip turn actions
    if (aiUnit.status === 'frozen' || aiUnit.status === 'sleeping') {
      return {
        moveTile: { x: aiUnit.gridX, z: aiUnit.gridZ, elevation: aiUnit.elevation ?? 0 },
        movePath: [],
        ability: null,
        targetUnit: null,
        endFacing: aiUnit.facing || 'SE',
        forecast: null
      };
    }

    const livingUnits = allUnits.filter(
      (u) => u && u.alive !== false && (u.hp === undefined || u.hp > 0)
    );

    const enemies = livingUnits.filter((u) => u.team !== aiUnit.team);
    const allies = livingUnits.filter((u) => u.team === aiUnit.team);

    // If no enemies remain on battlefield, stay put and face current direction (or default 'SE')
    if (enemies.length === 0) {
      return {
        moveTile: { x: aiUnit.gridX, z: aiUnit.gridZ, elevation: aiUnit.elevation ?? 0 },
        movePath: [],
        ability: null,
        targetUnit: null,
        endFacing: aiUnit.facing || 'SE',
        forecast: null
      };
    }

    // 1. Compute all reachable tiles
    const reachableTiles = getReachableTiles(aiUnit, board, allUnits);

    // 2. Identify available abilities (filtered by MP)
    const rawAbilities = (aiUnit.abilities && aiUnit.abilities.length > 0)
      ? aiUnit.abilities
      : (aiUnit.weapon?.abilities || []);

    const currentMp = aiUnit.mp ?? 40;
    const availableAbilities = rawAbilities.filter((a) => (a.costMp || 0) <= currentMp);

    // If no abilities or out of MP, provide basic attack fallback
    if (availableAbilities.length === 0) {
      availableAbilities.push({
        id: 'basic_attack',
        name: 'Attack',
        range: aiUnit.weapon?.attackRange || { min: 1, max: 1 },
        animPrefix: aiUnit.weapon?.baseAnimPrefix || 'Swing',
        powerMult: 1.0,
        costMp: 0
      });
    }

    let bestScore = -Infinity;
    let bestAction = null;

    // 3. Evaluate every candidate combination: (moveTile, ability, targetUnit)
    for (const moveTile of reachableTiles) {
      // Attacker simulated at destination tile
      const ghostAttacker = {
        ...aiUnit,
        gridX: moveTile.x,
        gridZ: moveTile.z,
        elevation: moveTile.elevation ?? 0
      };

      for (const ability of availableAbilities) {
        const isSupport = !!ability.isSupport;
        const candidateTargets = isSupport ? allies : enemies;

        const attackableTiles = getAttackableTiles(
          ghostAttacker,
          moveTile.x,
          moveTile.z,
          ability,
          board
        );

        for (const target of candidateTargets) {
          // Check if target tile is in range
          const inRange = attackableTiles.some(
            (t) => t.x === target.gridX && t.z === target.gridZ
          );
          if (!inRange) continue;

          const forecast = calculateCombatForecast(ghostAttacker, target, ability, board, this.activeLaw);
          let score = 0;

          if (isSupport) {
            const maxHp = target.maxHp || 100;
            const currentHp = target.hp ?? maxHp;
            const missingHp = maxHp - currentHp;

            if (missingHp <= 0 && !ability.ctBuff) {
              score = -500; // Do not waste heal on full-health ally
            } else {
              const healAmount = Math.min(missingHp, ability.healPower || 35);
              score = healAmount * 2.5;

              // Emergency triage bonus if ally is critically low
              if (currentHp / maxHp < 0.35) {
                score += 300;
              }
              // Hexer archetype enjoys healing/support triage
              if (aiUnit.rank === 'HEXER') {
                score += 50;
              }
              if (ability.ctBuff) {
                score += ability.ctBuff * 2.0;
              }
              // Small penalty for moving far to heal
              score -= (moveTile.cost || 0) * 1.5;
            }
          } else {
            // Offensive evaluation
            score = forecast.expectedDamage * 2.5;

            // Kill potential bonus
            const targetHp = target.hp ?? 100;
            if (forecast.expectedDamage >= targetHp) {
              score += 500;
              // Commander / Boss bonus for securing kills
              if (aiUnit.isBoss || aiUnit.rank === 'COMMANDER') {
                score += 250;
              }
            }

            // Directional positioning bonus: Back (+40), Side (+15)
            if (forecast.attackAngle === 'Back') {
              score += 40;
            } else if (forecast.attackAngle === 'Side') {
              score += 15;
            }

            // High ground elevation bonus (+15 per level)
            const elevDiff = (moveTile.elevation ?? 0) - (target.elevation ?? 0);
            if (elevDiff > 0) {
              score += elevDiff * 15;
            }

            // Hit chance weighting
            score *= (forecast.hitChance / 100.0);

            // Finish off low-HP targets priority
            score += Math.max(0, 100 - targetHp) * 0.4;

            // Archetype AI Roles:
            // 1. Deadeye: bonus for sniping from distance and flanking
            if (aiUnit.rank === 'DEADEYE') {
              const dist = Math.abs(moveTile.x - target.gridX) + Math.abs(moveTile.z - target.gridZ);
              if (dist >= 3) score += 35;
              if (forecast.attackAngle === 'Back' || forecast.attackAngle === 'Side') score += 25;
            }

            // 2. Hexer: bonus for magic skills
            if (aiUnit.rank === 'HEXER' && ability.isMagic) {
              score += 30;
            }

            // 3. Vanguard: tank bonus for close quarters
            if (aiUnit.rank === 'VANGUARD') {
              const dist = Math.abs(moveTile.x - target.gridX) + Math.abs(moveTile.z - target.gridZ);
              if (dist <= 1) score += 25;
            }

            // 4. Commander / Boss: high skill power multiplier bonus
            if (aiUnit.isBoss || aiUnit.rank === 'COMMANDER') {
              score += (ability.powerMult || 1.0) * 20;
            }

            // Judge Law Compliance check:
            // AI actively avoids breaking laws unless kill is guaranteed and cards are low
            const lawCheck = this.evaluateLawCompliance(ghostAttacker, target, {
              ability,
              forecast,
              preview: true
            });
            if (lawCheck.violated) {
              score -= 220;
            }

            // Small movement penalty to favor conserving CT / resting if in range
            score -= (moveTile.cost || 0) * 1.5;
          }

          if (score > bestScore) {
            bestScore = score;
            bestAction = {
              moveTile,
              movePath: moveTile.path || [],
              ability,
              targetUnit: target,
              forecast
            };
          }
        }
      }
    }

    // 4. If an attack/heal action was found, execute it and face the target
    if (bestAction && bestScore > 0) {
      const endFacing = calculateFacing(bestAction.moveTile, {
        x: bestAction.targetUnit.gridX,
        z: bestAction.targetUnit.gridZ
      });

      return {
        moveTile: bestAction.moveTile,
        movePath: bestAction.movePath,
        ability: bestAction.ability,
        targetUnit: bestAction.targetUnit,
        endFacing,
        forecast: bestAction.forecast
      };
    }

    // 5. No target attackable: advance toward nearest enemy along shortest path
    let nearestEnemy = null;
    let minEnemyDist = Infinity;

    for (const enemy of enemies) {
      const dist = Math.abs(enemy.gridX - aiUnit.gridX) + Math.abs(enemy.gridZ - aiUnit.gridZ);
      if (dist < minEnemyDist) {
        minEnemyDist = dist;
        nearestEnemy = enemy;
      }
    }

    let bestApproachTile = reachableTiles[0];
    let minApproachDist = Infinity;

    for (const tile of reachableTiles) {
      const dist = Math.abs(tile.x - nearestEnemy.gridX) + Math.abs(tile.z - nearestEnemy.gridZ);
      if (dist < minApproachDist) {
        minApproachDist = dist;
        bestApproachTile = tile;
      } else if (dist === minApproachDist) {
        // Tie-breaker: prefer higher elevation or tile with lower movement cost
        if ((tile.elevation ?? 0) > (bestApproachTile.elevation ?? 0)) {
          bestApproachTile = tile;
        }
      }
    }

    const endFacing = calculateFacing(bestApproachTile, {
      x: nearestEnemy.gridX,
      z: nearestEnemy.gridZ
    });

    return {
      moveTile: bestApproachTile,
      movePath: bestApproachTile.path || [],
      ability: null,
      targetUnit: null,
      endFacing: endFacing || 'SE',
      forecast: null
    };
  }
}
