/**
 * combat-rules.js
 * Track 1: Combat Rules Engine, Reachability/Attack Range Calculations,
 * Directional Angles, Animation Resolution, and Combat Forecast & Resolution.
 */

export const DIRECTIONS_8 = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export const DIRECTION_VECTORS_8 = {
  N:  { dx:  0, dz: -1 },
  NE: { dx:  1, dz: -1 },
  E:  { dx:  1, dz:  0 },
  SE: { dx:  1, dz:  1 },
  S:  { dx:  0, dz:  1 },
  SW: { dx: -1, dz:  1 },
  W:  { dx: -1, dz:  0 },
  NW: { dx: -1, dz: -1 }
};

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
 * Normalizes vector offset to one of 8 cardinal / ordinal directions.
 */
export function vectorToFacing(dx, dz) {
  if (dx === 0 && dz === 0) return 'S';
  const angle = Math.atan2(dz, dx); // [-PI, PI]
  const sector = Math.round(angle / (Math.PI / 4));
  switch (sector) {
    case 0: return 'E';
    case 1: return 'SE';
    case 2: return 'S';
    case 3: return 'SW';
    case 4:
    case -4: return 'W';
    case -3: return 'NW';
    case -2: return 'N';
    case -1: return 'NE';
    default: return 'S';
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
 * Checks if a tile is water/impassable.
 */
function isWaterTile(tile) {
  if (!tile) return false;
  return !!(tile.isWater || tile.water || tile.type === 'water' || tile.terrain === 'water' || tile.passable === false);
}

/**
 * Computes all reachable tiles using BFS / Dijkstra from unit position.
 * - Max distance: unit.moveRange
 * - Cannot step onto impassable water or tiles occupied by living enemies
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

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.cost >= moveRange) continue;

    const currElev = current.path[current.path.length - 1].elevation ?? 0;

    for (const dir of cardinalDirs) {
      const nx = current.x + dir.dx;
      const nz = current.z + dir.dz;

      // Check bounds
      if (nx < 0 || nx >= boardWidth || nz < 0 || nz >= boardHeight) continue;

      const nTile = getBoardTile(board, nx, nz);
      if (!nTile || isWaterTile(nTile)) continue;

      const nKey = `${nx},${nz}`;
      // Cannot step through living enemies
      if (enemyOccupied.has(nKey)) continue;

      const nElev = nTile.elevation ?? 0;
      // Elevation jump check
      if (Math.abs(nElev - currElev) > jumpHeight) continue;

      const nextCost = current.cost + 1;
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
  const range = ability?.range || unit?.attackRange || unit?.weapon?.attackRange || { min: 1, max: 1 };
  const min = range.min ?? 1;
  const max = range.max ?? 1;
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
  // If ability has a specific animation name, use it directly
  if (ability?.anim) {
    // If the ability anim already specifies a stance or is a full name
    if (ability.anim.includes('High') || ability.anim.includes('Mid') || ability.anim.includes('Low')) {
      return ability.anim;
    }
    // Fixed animations without stances
    if (['Katana Use', 'Read Book', 'Play Instrument', 'Singing', 'Casting', 'Dragoon Jump 3', 'Weapon Throw', 'Cast Revive'].includes(ability.anim)) {
      return ability.anim;
    }
  }

  if (ability?.animPrefix) {
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
    case 'katana':
      return `Swing ${stance}`;
    case 'tome':
      return 'Casting';
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
 * - Expected damage, hit chance, crit chance
 * - Support / heal detection
 * - Animation and held model
 * - Orb reward estimate
 */
export function calculateCombatForecast(attacker, defender, ability, board) {
  const attackerElev = typeof attacker.elevation === 'number'
    ? attacker.elevation
    : (getBoardTile(board, attacker.gridX, attacker.gridZ)?.elevation ?? 0);

  const defenderElev = typeof defender.elevation === 'number'
    ? defender.elevation
    : (getBoardTile(board, defender.gridX, defender.gridZ)?.elevation ?? 0);

  const stance = getElevationStance(attackerElev, defenderElev);

  // Directional facing calculation
  const dx = attacker.gridX - defender.gridX;
  const dz = attacker.gridZ - defender.gridZ;
  const defFacing = defender.facing || 'S';
  const defVec = DIRECTION_VECTORS_8[defFacing] || { dx: 0, dz: 1 };

  let attackAngle = 'Front';
  const lenAtk = Math.hypot(dx, dz);
  const lenFacing = Math.hypot(defVec.dx, defVec.dz);

  if (lenAtk > 0 && lenFacing > 0) {
    // Dot product between defender's facing vector and vector pointing toward attacker
    const cosTheta = (dx * defVec.dx + dz * defVec.dz) / (lenAtk * lenFacing);
    if (cosTheta <= -0.52) {
      attackAngle = 'Back';
    } else if (cosTheta >= 0.52) {
      attackAngle = 'Front';
    } else {
      attackAngle = 'Side';
    }
  }

  const animationName = resolveAttackAnimation(attacker, ability, stance);
  const heldModelName = attacker?.weapon?.heldModelName || 'sword';

  // Support / Healing ability handling
  if (ability?.isSupport) {
    const healPower = ability.healPower || 35;
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
      animationName: ability.anim || 'Cast Revive',
      heldModelName,
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

  const isMagic = !!ability?.isMagic;
  const atkStat = isMagic
    ? (attacker.stats?.magicDamage || attacker.stats?.physicalDamage || 22)
    : (attacker.stats?.physicalDamage || 20);

  const defStat = isMagic
    ? (defender.stats?.magicResistance || Math.round((defender.stats?.armor || 8) * 0.75))
    : (defender.stats?.armor || 8);

  const powerMult = ability?.powerMult || 1.0;
  let baseDamage = Math.max(6, (atkStat * 1.55 - defStat * 0.70)) * powerMult;
  baseDamage = baseDamage * angleDmgMult * elevationDmgMult;
  const expectedDamage = Math.max(1, Math.round(baseDamage));

  // Hit chance
  const atkAcc = attacker.stats?.accuracy || 80;
  const defDodge = defender.stats?.dodge || 15;
  let hitChance = 75 + (atkAcc - defDodge) * 0.25 + angleHitMod + elevationHitMod;
  hitChance = Math.min(100, Math.max(15, Math.round(hitChance)));

  // Crit chance
  const baseCrit = attacker.stats?.crit || 5;
  let critChance = baseCrit + angleCritMod + elevationCritMod;
  critChance = Math.min(100, Math.max(2, Math.round(critChance)));

  // Orb reward estimate: 15-45 base on hit, +75-250 bonus on kill based on target grade
  const grade = (defender.grade || defender.tierGrade || 'C').toUpperCase();
  const killBonusSchedule = { S: 250, A: 200, B: 150, C: 110, D: 85, E: 75, F: 75 };
  const killBonus = killBonusSchedule[grade] || 100;
  const willKill = expectedDamage >= (defender.hp ?? 100);
  const orbRewardEstimate = 25 + (willKill ? killBonus : 0);

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
export function executeCombatAction(attacker, defender, ability, board, rngSeed) {
  const rng = createSeededRng(rngSeed || Math.floor(Math.random() * 0xffffffff));
  const forecast = calculateCombatForecast(attacker, defender, ability, board);

  // Spend attacker MP if applicable
  const mpCost = ability?.costMp || 0;
  attacker.mp = Math.max(0, (attacker.mp ?? 40) - mpCost);

  // Handle Support / Healing
  if (forecast.isSupport) {
    const healPower = ability.healPower || 35;
    const maxHp = defender.maxHp || 100;
    const startHp = defender.hp ?? maxHp;
    defender.hp = Math.min(maxHp, startHp + healPower);
    defender.alive = true;
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
      forecast
    };
  }

  // Roll Hit / Miss
  const roll = rng.nextInt(1, 100);
  const isHit = roll <= forecast.hitChance;

  if (!isHit) {
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
      forecast
    };
  }

  // Roll Crit
  const critRoll = rng.nextInt(1, 100);
  const isCrit = critRoll <= forecast.critChance;

  // Roll Shield Block (only from Front against physical attacks if defender has shield or armor)
  const isFront = forecast.attackAngle === 'Front';
  const hasShield = defender.equipment?.offhand || defender.weapon?.heldModelName === 'shield';
  const blockRoll = rng.nextInt(1, 100);
  const isBlocked = !isCrit && isFront && (hasShield || defender.stats?.armor > 12) && blockRoll <= 18;

  let damage = forecast.expectedDamage;
  let defenderAnim = 'Taking Damage';
  let orbsEarned = rng.nextInt(15, 30);

  if (isBlocked) {
    damage = Math.max(1, Math.floor(damage * 0.35));
    defenderAnim = 'Shield Block Mid';
    orbsEarned = 15;
  } else if (isCrit) {
    damage = Math.round(damage * 1.50);
    defenderAnim = 'Critical';
    orbsEarned = rng.nextInt(30, 45);
  }

  // Apply damage
  defender.hp = Math.max(0, (defender.hp ?? 100) - damage);
  defender.alive = defender.hp > 0;

  if (!defender.alive) {
    defenderAnim = 'Bounced to Death';
    const grade = (defender.grade || defender.tierGrade || 'C').toUpperCase();
    const killBonusSchedule = { S: 250, A: 200, B: 150, C: 110, D: 85, E: 75, F: 75 };
    const killBonus = killBonusSchedule[grade] || 100;
    orbsEarned += killBonus;
  }

  return {
    hit: true,
    crit: isCrit,
    blocked: isBlocked,
    damage,
    heal: 0,
    orbsEarned,
    attackerAnim: forecast.animationName,
    defenderAnim,
    defenderDead: !defender.alive,
    forecast
  };
}
