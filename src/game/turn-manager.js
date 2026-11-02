/**
 * turn-manager.js
 * Track 1: FFTA-style Charge Time (CT) Turn Manager and Tactical AI Engine.
 *
 * Implements CT tick advancement (threshold 100), resting CT savings (base 60, +20 moved, +20 acted),
 * turn queue lookahead preview, and high-level Tactical AI evaluation.
 */

import {
  getReachableTiles,
  getAttackableTiles,
  calculateCombatForecast,
  calculateFacing
} from './combat-rules.js';

export class TurnManager {
  constructor(options = {}) {
    this.ctThreshold = options.ctThreshold || 100;
    this.activeUnit = null;
    this.tickCount = 0;
    this.turnCount = 0;
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
   * Returns Array<{ unitId, name, team, className, grade, ct, ticksUntilTurn }>.
   */
  getTurnQueuePreview(units = [], count = 8) {
    const simUnits = units
      .filter((u) => u && u.alive !== false && (u.hp === undefined || u.hp > 0))
      .map((u) => ({
        unitId: u.id,
        name: u.name,
        team: u.team,
        className: u.className,
        grade: u.grade || 'C',
        speed: Math.max(1, u.speed || 15),
        ct: u.ct || 0
      }));

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
        unitId: winner.unitId,
        name: winner.name,
        team: winner.team,
        className: winner.className,
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
   * - Scores (moveTile, ability, targetUnit) by:
   *   - Expected damage (weighted by hit chance)
   *   - Kill potential (+500)
   *   - Backstab bonus (+40) / Side bonus (+15)
   *   - High ground elevation (+15 per level)
   *   - Ally triage / healing for support abilities
   * - If no enemy is in attack range from any reachable tile, moves along shortest path toward nearest enemy and faces them.
   *
   * Returns { moveTile, movePath, ability, targetUnit, endFacing, forecast }
   */
  computeTacticalAI(aiUnit, allUnits = [], board = null) {
    const livingUnits = allUnits.filter(
      (u) => u && u.alive !== false && (u.hp === undefined || u.hp > 0)
    );

    const enemies = livingUnits.filter((u) => u.team !== aiUnit.team);
    const allies = livingUnits.filter((u) => u.team === aiUnit.team);

    // If no enemies remain on battlefield, stay put and face current direction
    if (enemies.length === 0) {
      return {
        moveTile: { x: aiUnit.gridX, z: aiUnit.gridZ, elevation: aiUnit.elevation ?? 0 },
        movePath: [],
        ability: null,
        targetUnit: null,
        endFacing: aiUnit.facing || 'S',
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

          const forecast = calculateCombatForecast(ghostAttacker, target, ability, board);
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
              if (ability.ctBuff) {
                score += ability.ctBuff * 2.0;
              }
              // Small penalty for moving far to heal
              score -= (moveTile.cost || 0) * 1.5;
            }
          } else {
            // Offensive evaluation
            score = forecast.expectedDamage * 2.5;

            // Kill potential bonus (+500)
            const targetHp = target.hp ?? 100;
            if (forecast.expectedDamage >= targetHp) {
              score += 500;
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
      endFacing,
      forecast: null
    };
  }
}
