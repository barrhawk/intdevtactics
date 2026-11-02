/**
 * setworld-client.js
 * Track 1: Set.world API Client, Deterministic Generator, and Clan Roster Builder.
 *
 * Connects to https://set.world/api for characters, items, and crafting,
 * with robust in-memory caching, polite rate limiting, and 100% deterministic
 * offline fallbacks.
 */

// Canonical Set.world seed derivation: (seed + i * 0x9E3779B9) >>> 0
export const deriveSeed = (seed, i) => ((seed >>> 0) + Math.imul(i, 0x9E3779B9)) >>> 0;

// In-memory caches by seed
export const charCache = new Map();
export const itemCache = new Map();
export const craftCache = new Map();

// Polite rate-limiting state
let lastNetworkCallTime = 0;
const MIN_CALL_INTERVAL_MS = 300;
let activeCalls = 0;
const MAX_CONCURRENT_CALLS = 2;

/**
 * Polite rate limiter and concurrency guard so set.world is never spammed.
 */
async function throttleNetwork() {
  while (activeCalls >= MAX_CONCURRENT_CALLS) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const now = Date.now();
  const elapsed = now - lastNetworkCallTime;
  if (elapsed < MIN_CALL_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_CALL_INTERVAL_MS - elapsed));
  }
  lastNetworkCallTime = Date.now();
  activeCalls++;
}

function releaseThrottle() {
  activeCalls = Math.max(0, activeCalls - 1);
}

/**
 * Fetch wrapper with timeout and polite retry.
 */
export async function fetchWithTimeout(url, timeoutMs = 2800) {
  if (typeof fetch !== 'function') {
    throw new Error('fetch is not available in this environment');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'intdevtactics/1.0 (Three.js Tactics)'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Seeded pseudo-random generator (Mulberry32) for deterministic fallback synthesis.
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
    },
    choice(arr) {
      return arr[Math.floor(this.next() * arr.length)];
    }
  };
}

/**
 * Deterministically generates a fallback Item matching Set.world's schema.
 */
export function generateFallbackItem(seed) {
  const rng = createSeededRng(seed);
  const prefixes = [
    'ancient', 'hallowed', 'shadow', 'blazing', 'frozen',
    'celestial', 'runic', 'titanium', 'refined', 'void',
    'astral', 'stormforged', 'mythril', 'dread'
  ];
  const materials = [
    'bronze', 'iron', 'steel', 'titanium', 'obsidian',
    'nephrite', 'star-metal', 'mythril', 'adamantite'
  ];
  const slots = ['tool', 'tool', 'head', 'chest', 'legs', 'feet', 'offhand', 'neck', 'finger'];
  const weaponTypes = ['blade', 'katana', 'spear', 'lance', 'rifle', 'musket', 'bow', 'tome', 'harp'];

  const slot = rng.choice(slots);
  const mat = rng.choice(materials);
  const prefix = rng.choice(prefixes);
  const baseName = slot === 'tool' ? rng.choice(weaponTypes) : `${slot} guard`;
  const fullName = `${prefix} ${mat} ${baseName}`;

  const grades = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
  // Skew towards C and B with occasional A/S
  const roll = rng.next();
  let gradeIndex = 3; // C
  if (roll < 0.15) gradeIndex = 1; // E
  else if (roll < 0.35) gradeIndex = 2; // D
  else if (roll < 0.65) gradeIndex = 3; // C
  else if (roll < 0.85) gradeIndex = 4; // B
  else if (roll < 0.96) gradeIndex = 5; // A
  else gradeIndex = 6; // S

  const grade = grades[gradeIndex];
  const score = parseFloat((1.0 + gradeIndex * 2.2 + rng.next() * 1.8).toFixed(2));
  const orbSchedule = { S: 1562, A: 312, B: 62, C: 12, D: 2, E: 1, F: 1 };
  const orbVal = orbSchedule[grade] || 1;

  return {
    name: fullName,
    slot,
    tierGrade: grade,
    score,
    orbValue: orbVal,
    seed: (seed >>> 0),
    material: { name: mat, tierGrade: grade },
    props: [{ name: prefix, tierGrade: grade }]
  };
}

/**
 * Deterministically generates a fallback Character matching Set.world's schema.
 */
export function generateFallbackCharacter(seed) {
  const rng = createSeededRng(seed);
  const classes = [
    'Dragoon', 'Samurai', 'Fusilier', 'Archer', 'Mesmer',
    'Herald', 'Paladin', 'Berserker', 'Land Reaver', 'Dreadnought', 'Scholar'
  ];
  const className = rng.choice(classes);

  const maxHealth = 85 + rng.nextInt(0, 35);
  const walkSpeed = parseFloat((1.0 + rng.next() * 0.35).toFixed(2));
  const physDmg = 16 + rng.nextInt(0, 16);
  const magDmg = 14 + rng.nextInt(0, 18);
  const armor = 6 + rng.nextInt(0, 10);
  const accuracy = 75 + rng.nextInt(0, 15);
  const dodge = 10 + rng.nextInt(0, 15);

  const powerRating = 650 + rng.nextInt(0, 600);

  // Weapons tailored to class for cohesive flavor
  let toolSeed = deriveSeed(seed, 101);
  let toolItem = generateFallbackItem(toolSeed);
  toolItem.slot = 'tool';

  return {
    seed: (seed >>> 0),
    name: `${className} of the ${rng.choice(['Azure', 'Crimson', 'Obsidian', 'Solar', 'Verdant'])}`,
    class: {
      name: className,
      description: `Tactical combatant skilled in ${className.toLowerCase()} combat arts.`
    },
    tierGrade: toolItem.tierGrade || 'C',
    powerRating,
    powerRatingMax: 1808,
    attributes: {
      maxHealth,
      walkSpeed,
      physicalDamage: physDmg,
      magicDamage: magDmg,
      armor,
      magicResistance: Math.round(armor * 0.8),
      accuracy,
      dodge
    },
    equipment: {
      tool: toolItem,
      chest: generateFallbackItem(deriveSeed(seed, 102)),
      head: generateFallbackItem(deriveSeed(seed, 103)),
      legs: generateFallbackItem(deriveSeed(seed, 104)),
      feet: generateFallbackItem(deriveSeed(seed, 105)),
      offhand: generateFallbackItem(deriveSeed(seed, 106))
    },
    contentVersion: 'setworld-anima-v1'
  };
}

/**
 * Deterministically generates a fallback Craft lottery response matching Set.world's schema.
 */
export function generateFallbackCraft(orbs, seed) {
  const safeOrbs = Math.max(1, parseInt(orbs, 10) || 25);
  const rolls = Math.max(1, Math.round(Math.pow(safeOrbs / 25.0, 0.55)));

  let bestItem = null;
  let highestScore = -Infinity;

  for (let i = 0; i < rolls; i++) {
    const candidateSeed = deriveSeed(seed, i + 1);
    const item = generateFallbackItem(candidateSeed);
    if (item.score > highestScore) {
      highestScore = item.score;
      bestItem = item;
    }
  }

  return {
    mode: 'orbs',
    orbs: safeOrbs,
    rolls,
    seed: (seed >>> 0),
    item: bestItem,
    contentVersion: 'setworld-anima-v1'
  };
}

/**
 * Rolls a complete character from Set.world API or falls back deterministically.
 */
export async function rollCharacter(seed) {
  const normalizedSeed = (seed >>> 0);
  if (charCache.has(normalizedSeed)) {
    return charCache.get(normalizedSeed);
  }

  try {
    await throttleNetwork();
    const url = `https://set.world/api/roll/character?seed=${normalizedSeed}&equipmentBonus=1`;
    const data = await fetchWithTimeout(url, 2800);
    if (data && (data.class || data.attributes)) {
      charCache.set(normalizedSeed, data);
      return data;
    }
    throw new Error('Invalid character response payload');
  } catch (err) {
    const fallback = generateFallbackCharacter(normalizedSeed);
    charCache.set(normalizedSeed, fallback);
    return fallback;
  } finally {
    releaseThrottle();
  }
}

/**
 * Rolls an item from Set.world API or falls back deterministically.
 */
export async function rollItem(seed) {
  const normalizedSeed = (seed >>> 0);
  if (itemCache.has(normalizedSeed)) {
    return itemCache.get(normalizedSeed);
  }

  try {
    await throttleNetwork();
    const url = `https://set.world/api/roll/item?seed=${normalizedSeed}`;
    const data = await fetchWithTimeout(url, 2800);
    if (data && (data.name || data.tierGrade)) {
      itemCache.set(normalizedSeed, data);
      return data;
    }
    throw new Error('Invalid item response payload');
  } catch (err) {
    const fallback = generateFallbackItem(normalizedSeed);
    itemCache.set(normalizedSeed, fallback);
    return fallback;
  } finally {
    releaseThrottle();
  }
}

/**
 * Crafts an item by spending orbs via Set.world API or falls back to candidate lottery.
 */
export async function craftItem(orbs, seed) {
  const normalizedSeed = (seed >>> 0);
  const cacheKey = `${orbs}_${normalizedSeed}`;
  if (craftCache.has(cacheKey)) {
    return craftCache.get(cacheKey);
  }

  try {
    await throttleNetwork();
    const url = `https://set.world/api/craft?orbs=${encodeURIComponent(orbs)}&seed=${normalizedSeed}`;
    const data = await fetchWithTimeout(url, 2800);
    if (data && data.item) {
      craftCache.set(cacheKey, data);
      return data;
    }
    throw new Error('Invalid craft response payload');
  } catch (err) {
    const fallback = generateFallbackCraft(orbs, normalizedSeed);
    craftCache.set(cacheKey, fallback);
    return fallback;
  } finally {
    releaseThrottle();
  }
}

/**
 * Implements Set.world's canonical 10% disassembly sink schedule.
 * Accepts EITHER a rawItem OR a wrapper item, falling back to target.tier || target.rarity || 'C'.
 * Schedule: S: 1562, A: 312, B: 62, C: 12, D: 2, E: 1, F: 1.
 */
export function salvageItem(rawItemOrItem) {
  if (!rawItemOrItem) return 0;
  const target = rawItemOrItem?.rawItem || rawItemOrItem;
  const grade = (
    target.tierGrade ||
    target.material?.tierGrade ||
    target.grade ||
    target.tier ||
    target.rarity ||
    'C'
  ).toString().toUpperCase();

  const schedule = {
    S: 1562,
    A: 312,
    B: 62,
    C: 12,
    D: 2,
    E: 1,
    F: 1
  };
  const base = schedule[grade] ?? 12; // 'C' tier fallback is 12 Set Orbs
  const orbValue = target.orbValue ?? rawItemOrItem.orbValue ?? 0;
  const valueSalvage = Math.floor(orbValue * 0.10);
  return Math.max(base, valueSalvage);
}

/**
 * Maps a Set.world tool item and class to one of the 7 held models in set-items.glb
 * ('sword', 'katana', 'spear', 'rifle', 'tome', 'harp', 'shield') plus 'bow'.
 */
export function mapToolToWeaponSpec(toolItem, className) {
  const itemName = ((toolItem && (toolItem.name || toolItem.type)) || '').toLowerCase();
  const cls = (className || '').toLowerCase();
  const combined = `${itemName} ${cls}`;

  // 1. Spear (spear, lance, pike, halberd, trident, dragoon, vanguard)
  if (/(spear|lance|pike|halberd|trident|dragoon|vanguard)/i.test(combined)) {
    return {
      weaponType: 'spear',
      heldModelName: 'spear',
      attackRange: { min: 1, max: 2 },
      baseAnimPrefix: 'Poke',
      abilities: [
        {
          id: 'pierce_thrust',
          name: 'Pierce Thrust',
          range: { min: 1, max: 2 },
          isLine: true,
          anim: 'Poke Mid',
          animPrefix: 'Poke',
          powerMult: 1.15,
          costMp: 4,
          description: 'Thrust forward piercing through up to 2 tiles in a straight line.'
        },
        {
          id: 'dragoon_jump',
          name: 'Dragoon Jump',
          range: { min: 1, max: 4 },
          anim: 'Dragoon Jump 3',
          animPrefix: 'Dragoon Jump 3',
          powerMult: 1.35,
          costMp: 8,
          description: 'Leap high into the air and crash down upon a distant foe.'
        }
      ]
    };
  }

  // 2. Katana (katana, blade, messer, samurai, blademaster, shadowalker, assassin)
  if (/(katana|blade|messer|samurai|blademaster|shadowalker|assassin)/i.test(combined)) {
    return {
      weaponType: 'katana',
      heldModelName: 'katana',
      attackRange: { min: 1, max: 1 },
      baseAnimPrefix: 'Swing',
      abilities: [
        {
          id: 'iaido_slash',
          name: 'Iaido Slash',
          range: { min: 1, max: 1 },
          anim: 'Katana Use',
          animPrefix: 'Katana Use',
          powerMult: 1.30,
          costMp: 6,
          description: 'Swift single-stroke slash drawing a lightning-fast edge.'
        },
        {
          id: 'shadow_throw',
          name: 'Shadow Throw',
          range: { min: 2, max: 4 },
          anim: 'Weapon Throw',
          animPrefix: 'Weapon Throw',
          powerMult: 1.0,
          costMp: 4,
          description: 'Hurls a concealed throwing blade from the shadows.'
        }
      ]
    };
  }

  // 3. Rifle (rifle, gun, musket, pistol, crossbow, gunner, fusilier, machinist)
  if (/(rifle|gun|musket|pistol|crossbow|gunner|fusilier|machinist)/i.test(combined)) {
    return {
      weaponType: 'rifle',
      heldModelName: 'rifle',
      attackRange: { min: 2, max: 5 },
      baseAnimPrefix: 'Gun',
      abilities: [
        {
          id: 'snipe_shot',
          name: 'Snipe Shot',
          range: { min: 2, max: 5 },
          anim: 'Gun Mid',
          animPrefix: 'Gun',
          powerMult: 1.25,
          costMp: 5,
          description: 'Aimed long-range bullet penetrating enemy defenses.'
        },
        {
          id: 'suppressing_fire',
          name: 'Suppressing Fire',
          range: { min: 2, max: 4 },
          anim: 'Gun Low',
          animPrefix: 'Gun',
          powerMult: 0.95,
          costMp: 6,
          description: 'Suppressing volley that rattles the target and slows CT.'
        }
      ]
    };
  }

  // 4. Bow (bow, longbow, shortbow, ranger, archer, hunter)
  if (/(bow|longbow|shortbow|ranger|archer|hunter)/i.test(combined)) {
    return {
      weaponType: 'bow',
      heldModelName: 'sword',
      attackRange: { min: 2, max: 5 },
      baseAnimPrefix: 'Bow',
      abilities: [
        {
          id: 'arc_volley',
          name: 'Arc Volley',
          range: { min: 2, max: 5 },
          anim: 'Bow High',
          animPrefix: 'Bow',
          powerMult: 1.20,
          costMp: 5,
          description: 'High ballistic arrow volley arching cleanly over obstacles.'
        },
        {
          id: 'stone_toss',
          name: 'Stone Toss',
          range: { min: 1, max: 3 },
          anim: 'Item Throw High Release',
          animPrefix: 'Item Throw',
          powerMult: 0.85,
          costMp: 0,
          description: 'Hurls a sling projectile or rough stone at mid range.'
        }
      ]
    };
  }

  // 5. Tome (tome, book, staff, wand, orb, mesmer, oracle, scholar, mage, wizard, warlock)
  if (/(tome|book|staff|wand|orb|mesmer|oracle|scholar|mage|wizard|warlock)/i.test(combined)) {
    return {
      weaponType: 'tome',
      heldModelName: 'tome',
      attackRange: { min: 1, max: 4 },
      baseAnimPrefix: 'Cast',
      abilities: [
        {
          id: 'aether_bolt',
          name: 'Aether Bolt',
          range: { min: 1, max: 4 },
          anim: 'Casting',
          animPrefix: 'Casting',
          isMagic: true,
          powerMult: 1.25,
          costMp: 6,
          description: 'Condenses raw aether into an arcane shockwave.'
        },
        {
          id: 'codex_invocation',
          name: 'Codex Invocation',
          range: { min: 1, max: 3 },
          anim: 'Read Book',
          animPrefix: 'Read Book',
          isMagic: true,
          aoe: 1,
          powerMult: 1.40,
          costMp: 12,
          description: 'Recites ancient runic scripture causing an arcane detonation.'
        },
        {
          id: 'revitalize',
          name: 'Revitalize',
          range: { min: 1, max: 3 },
          anim: 'Cast Revive',
          animPrefix: 'Cast Revive',
          isSupport: true,
          healPower: 45,
          costMp: 8,
          description: 'Restores 45 HP to a wounded ally within 3 tiles.'
        }
      ]
    };
  }

  // 6. Harp (harp, lute, horn, flute, herald, bard, minstrel, cantor)
  if (/(harp|lute|horn|flute|herald|bard|minstrel|cantor)/i.test(combined)) {
    return {
      weaponType: 'harp',
      heldModelName: 'harp',
      attackRange: { min: 1, max: 4 },
      baseAnimPrefix: 'Sing',
      abilities: [
        {
          id: 'hymn_of_valor',
          name: 'Hymn of Valor',
          range: { min: 1, max: 3 },
          anim: 'Play Instrument',
          animPrefix: 'Play Instrument',
          isSupport: true,
          ctBuff: 25,
          healPower: 20,
          costMp: 8,
          description: 'Plays a stirring melody granting +25 CT and 20 HP to an ally.'
        },
        {
          id: 'resonant_chord',
          name: 'Resonant Chord',
          range: { min: 1, max: 4 },
          anim: 'Singing',
          animPrefix: 'Singing',
          isMagic: true,
          powerMult: 1.10,
          costMp: 5,
          description: 'Emits a piercing acoustic note dealing magic damage.'
        }
      ]
    };
  }

  // 7. Shield (shield, buckler, aegis, bulwark, juggernaut, defender)
  if (/(shield|buckler|aegis|bulwark|juggernaut|defender)/i.test(combined)) {
    return {
      weaponType: 'shield',
      heldModelName: 'shield',
      attackRange: { min: 1, max: 1 },
      baseAnimPrefix: 'Swing',
      abilities: [
        {
          id: 'shield_bash',
          name: 'Shield Bash',
          range: { min: 1, max: 1 },
          anim: 'Swing Mid',
          animPrefix: 'Swing',
          powerMult: 1.15,
          costMp: 4,
          description: 'Martial shield bash staggering the opponent.'
        },
        {
          id: 'iron_bulwark',
          name: 'Iron Bulwark',
          range: { min: 1, max: 1 },
          anim: 'Shield Block Mid',
          animPrefix: 'Shield Block',
          isSupport: true,
          ctBuff: 15,
          healPower: 25,
          costMp: 6,
          description: 'Hunker down behind fortified tower shield, recovering 25 HP and +15 CT.'
        }
      ]
    };
  }

  // 8. Default: Sword (sword, greatsword, mace, hammer, knight, etc.)
  return {
    weaponType: 'sword',
    heldModelName: 'sword',
    attackRange: { min: 1, max: 1 },
    baseAnimPrefix: 'Swing',
    abilities: [
      {
        id: 'mythril_cleave',
        name: 'Mythril Cleave',
        range: { min: 1, max: 1 },
        anim: 'Swing Mid',
        animPrefix: 'Swing',
        powerMult: 1.15,
        costMp: 4,
        description: 'Standard martial cleave slicing through guard.'
      },
      {
        id: 'crushing_blow',
        name: 'Crushing Blow',
        range: { min: 1, max: 1 },
        anim: 'Swing High',
        animPrefix: 'Swing',
        powerMult: 1.35,
        costMp: 7,
        description: 'Heavy overhead strike dealing +35% damage.'
      },
      {
        id: 'throw_stone',
        name: 'Throw Stone',
        range: { min: 1, max: 3 },
        anim: 'Dragoon Jump 3',
        animPrefix: 'Dragoon Jump 3',
        powerMult: 0.85,
        costMp: 0,
        description: 'Picks up and hurls a stone at mid range.'
      }
    ]
  };
}

/**
 * Validates whether a tile on the board is passable and non-water.
 */
function isWalkableNonWater(board, x, z) {
  if (!board) return true;
  if (typeof board.isWalkable === 'function') {
    return board.isWalkable(x, z);
  }
  if (typeof board.getTile === 'function') {
    const tile = board.getTile(x, z);
    if (!tile) return false;
    return !tile.isWater && !tile.water && tile.type !== 'water';
  }
  if (board.tiles) {
    if (Array.isArray(board.tiles[z])) {
      const tile = board.tiles[z][x];
      if (!tile) return false;
      return !tile.isWater && !tile.water && tile.type !== 'water';
    }
    if (Array.isArray(board.tiles)) {
      const width = board.width || 10;
      const tile = board.tiles[z * width + x];
      if (!tile) return false;
      return !tile.isWater && !tile.water && tile.type !== 'water';
    }
  }
  return true;
}

/**
 * Retrieves tile elevation safely.
 */
function getTileElevation(board, x, z) {
  if (!board) return 0;
  if (typeof board.getTile === 'function') {
    const t = board.getTile(x, z);
    return (t && typeof t.elevation === 'number') ? t.elevation : 0;
  }
  if (board.tiles) {
    if (Array.isArray(board.tiles[z])) {
      const t = board.tiles[z][x];
      return (t && typeof t.elevation === 'number') ? t.elevation : 0;
    }
    if (Array.isArray(board.tiles)) {
      const width = board.width || 10;
      const t = board.tiles[z * width + x];
      return (t && typeof t.elevation === 'number') ? t.elevation : 0;
    }
  }
  return 0;
}

/**
 * Generates an 8-unit tactical clan roster (4 Blue Azure Clan, 4 Red Crimson Order)
 * placed on valid non-water tiles of a 10x10 board.
 */
export async function generateClanRoster(baseSeed, board) {
  const normalizedBase = (baseSeed >>> 0);
  const units = [];

  // Default candidate spawn coordinates on a 10x10 board:
  // Blue (Azure Clan): SW/W area
  const blueCandidates = [
    { x: 1, z: 2 }, { x: 2, z: 1 }, { x: 2, z: 3 }, { x: 3, z: 2 },
    { x: 0, z: 2 }, { x: 1, z: 1 }, { x: 1, z: 3 }, { x: 2, z: 2 },
    { x: 0, z: 3 }, { x: 3, z: 1 }, { x: 0, z: 1 }, { x: 3, z: 3 }
  ];

  // Red (Crimson Order): NE/E area
  const redCandidates = [
    { x: 8, z: 7 }, { x: 7, z: 8 }, { x: 7, z: 6 }, { x: 6, z: 7 },
    { x: 9, z: 7 }, { x: 8, z: 8 }, { x: 8, z: 6 }, { x: 7, z: 7 },
    { x: 9, z: 6 }, { x: 6, z: 8 }, { x: 9, z: 8 }, { x: 6, z: 6 }
  ];

  const pickedBluePositions = [];
  for (const pos of blueCandidates) {
    if (pickedBluePositions.length >= 4) break;
    if (isWalkableNonWater(board, pos.x, pos.z)) {
      pickedBluePositions.push(pos);
    }
  }
  // Fallbacks if board terrain was crowded
  while (pickedBluePositions.length < 4) {
    pickedBluePositions.push({ x: pickedBluePositions.length, z: 1 });
  }

  const pickedRedPositions = [];
  for (const pos of redCandidates) {
    if (pickedRedPositions.length >= 4) break;
    if (isWalkableNonWater(board, pos.x, pos.z)) {
      pickedRedPositions.push(pos);
    }
  }
  while (pickedRedPositions.length < 4) {
    pickedRedPositions.push({ x: 9 - pickedRedPositions.length, z: 8 });
  }

  for (let i = 0; i < 8; i++) {
    const unitSeed = deriveSeed(normalizedBase, i);
    const charData = await rollCharacter(unitSeed);

    const isBlue = i < 4;
    const team = isBlue ? 'azure' : 'crimson';
    const clanName = isBlue ? 'Azure Clan' : 'Crimson Order';
    const pos = isBlue ? pickedBluePositions[i] : pickedRedPositions[i - 4];
    const elevation = getTileElevation(board, pos.x, pos.z);
    const slot = i % 4;

    // Guaranteed facing: both teams face toward center of battlefield
    // Azure Clan (1..3, 1..3) -> 'SE'; Crimson Order (6..8, 6..8) -> 'NW'
    const facing = isBlue ? 'SE' : 'NW';

    let className = 'Knight';
    let weaponSpec = null;
    let isBoss = false;
    let rank = 'SOLDIER';
    let archetypeTitle = 'Tactical Unit';
    let paletteId = isBlue ? 'azure_knight' : 'crimson_warlord';
    let scale = 1.0;
    let charName = '';
    let maxHp = Math.round(charData.attributes?.maxHealth || 100);

    if (isBlue) {
      // Azure Clan squad with rich weapon variety across 4 distinct archetypes
      if (slot === 0) {
        className = 'Knight';
        weaponSpec = mapToolToWeaponSpec({ name: 'Mythril Broadsword', type: 'sword' }, className);
        paletteId = 'azure_knight';
        rank = 'CHAMPION';
        archetypeTitle = 'Azure Knight';
        scale = 1.0;
      } else if (slot === 1) {
        className = 'Mesmer';
        weaponSpec = mapToolToWeaponSpec({ name: 'Arcane Tome', type: 'tome' }, className);
        paletteId = 'azure_mage';
        rank = 'MYSTIC';
        archetypeTitle = 'Azure Mage';
        scale = 1.0;
      } else if (slot === 2) {
        className = 'Fusilier';
        weaponSpec = mapToolToWeaponSpec({ name: 'Precision Rifle', type: 'rifle' }, className);
        paletteId = 'azure_ranger';
        rank = 'MARKSMAN';
        archetypeTitle = 'Azure Ranger';
        scale = 1.0;
      } else {
        className = 'Dragoon';
        weaponSpec = mapToolToWeaponSpec({ name: 'Holy Lance', type: 'spear' }, className);
        paletteId = 'azure_paladin';
        rank = 'VANGUARD';
        archetypeTitle = 'Azure Paladin';
        scale = 1.0;
      }
      charName = charData.name || `Azure ${className}`;
    } else {
      // Crimson Order enemies with 4 guaranteed distinct Enemy Archetypes
      if (slot === 0) {
        // Slot 0: Boss Commander - Crimson Warlord
        isBoss = true;
        rank = 'COMMANDER';
        archetypeTitle = 'Crimson Warlord';
        paletteId = 'crimson_warlord';
        scale = 1.18;
        const bossChoice = (unitSeed % 2 === 0);
        className = bossChoice ? 'Samurai' : 'Dragoon';
        weaponSpec = mapToolToWeaponSpec(
          bossChoice ? { name: 'Blood Katana', type: 'katana' } : { name: 'Dread Spear', type: 'spear' },
          className
        );
        // +15% ATK bonus, +35% Boss HP bonus
        charData.attributes = { ...charData.attributes };
        charData.attributes.physicalDamage = Math.round((charData.attributes?.physicalDamage || 22) * 1.15);
        maxHp = Math.round((charData.attributes?.maxHealth || 110) * 1.35);
        const namePart = charData.name?.split(' ')?.[0] || 'Malakor';
        charName = `Warlord ${namePart}`;
      } else if (slot === 1) {
        // Slot 1: Vanguard Tank - Blood-Iron Juggernaut
        isBoss = false;
        rank = 'VANGUARD';
        archetypeTitle = 'Blood-Iron Juggernaut';
        paletteId = 'crimson_vanguard';
        scale = 1.08;
        className = (unitSeed % 2 === 0) ? 'Paladin' : 'Knight';
        weaponSpec = mapToolToWeaponSpec({ name: 'Tower Shield', type: 'shield' }, className);
        // High DEF and HP
        charData.attributes = { ...charData.attributes };
        charData.attributes.armor = Math.round((charData.attributes?.armor || 10) * 1.40) + 6;
        maxHp = Math.round((charData.attributes?.maxHealth || 100) * 1.25);
        const namePart = charData.name?.split(' ')?.[0] || 'Krag';
        charName = `Juggernaut ${namePart}`;
      } else if (slot === 2) {
        // Slot 2: Hexer / Support Caster - Void-Pyre Hexer
        isBoss = false;
        rank = 'HEXER';
        archetypeTitle = 'Void-Pyre Hexer';
        paletteId = 'crimson_hexer';
        scale = 1.00;
        className = (unitSeed % 2 === 0) ? 'Black Mage' : 'Mesmer';
        weaponSpec = mapToolToWeaponSpec(
          (unitSeed % 2 === 0) ? { name: 'Shadow Tome', type: 'tome' } : { name: 'Hex Harp', type: 'harp' },
          className
        );
        // High MAG and ranged reach
        charData.attributes = { ...charData.attributes };
        charData.attributes.magicDamage = Math.round((charData.attributes?.magicDamage || 20) * 1.35) + 6;
        maxHp = Math.round(charData.attributes?.maxHealth || 90);
        const namePart = charData.name?.split(' ')?.[0] || 'Moros';
        charName = `Hexer ${namePart}`;
      } else {
        // Slot 3: Agile Sniper - Nightshade Deadeye
        isBoss = false;
        rank = 'DEADEYE';
        archetypeTitle = 'Nightshade Deadeye';
        paletteId = 'crimson_deadeye';
        scale = 0.94;
        className = (unitSeed % 2 === 0) ? 'Fusilier' : 'Archer';
        weaponSpec = mapToolToWeaponSpec({ name: 'Night Sniper', type: 'rifle' }, className);
        // High SPD, accuracy, and dodge
        charData.attributes = { ...charData.attributes };
        charData.attributes.walkSpeed = parseFloat(((charData.attributes?.walkSpeed || 1.1) * 1.20).toFixed(2));
        charData.attributes.accuracy = Math.round((charData.attributes?.accuracy || 80) * 1.15) + 5;
        charData.attributes.dodge = Math.round((charData.attributes?.dodge || 15) * 1.30) + 5;
        maxHp = Math.round(charData.attributes?.maxHealth || 92);
        const namePart = charData.name?.split(' ')?.[0] || 'Vane';
        charName = `Deadeye ${namePart}`;
      }
    }

    const hp = maxHp;
    const speed = Math.round((charData.attributes?.walkSpeed || 1.0) * 10) + (isBoss ? 7 : 6);
    const moveRange = 3 + (charData.attributes?.walkSpeed > 1.25 ? 1 : 0);

    const unit = {
      id: `unit_${team}_${slot}`,
      unitId: `unit_${team}_${slot}`,
      unitIndex: i,
      seed: unitSeed,
      name: charName,
      team,
      clan: team,
      clanName,
      className,
      job: className,
      class: className,
      isBoss,
      rank,
      archetypeTitle,
      paletteId,
      scale,
      grade: charData.tierGrade || 'C',
      hp,
      maxHp,
      mp: 40,
      maxMp: 40,
      speed,
      moveRange,
      jumpHeight: 2,
      gridX: pos.x,
      gridZ: pos.z,
      x: pos.x,
      z: pos.z,
      elevation,
      facing,
      ct: Math.floor((deriveSeed(normalizedBase, i + 99) % 25) + 15),
      alive: true,
      weapon: weaponSpec,
      weaponType: weaponSpec.weaponType,
      weaponModel: weaponSpec.heldModelName,
      abilities: weaponSpec.abilities,
      stats: charData.attributes || {},
      equipment: charData.equipment || {},
      yellowCards: 0,
      redCards: 0,
      rawCharacter: charData
    };

    units.push(unit);
  }

  return {
    baseSeed: normalizedBase,
    units,
    contentVersion: 'setworld-anima-v1'
  };
}
