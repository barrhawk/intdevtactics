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

export const EQUIPMENT_SLOTS = ['tool', 'offhand', 'head', 'chest', 'legs', 'feet', 'neck', 'finger'];

export const SLOT_CATEGORIES = {
  tool: ['Blade', 'Katana', 'Spear', 'Lance', 'Rifle', 'Musket', 'Bow', 'Tome', 'Harp', 'Broadsword'],
  offhand: ['Aegis Buckler', 'Parrying Rondel', 'Arcane Crest', 'Tactical Quiver', 'Tower Shield'],
  head: ['Knight Barbute', 'Circlet of Wisdom', 'Marksman Hood', 'Dragoon Visor', 'Iron Helm'],
  chest: ['Dragon-Scale Cuirass', 'Robes of the Archmage', 'Padded Brigandine', 'Steel Breastplate', 'Tunic of the Wind'],
  legs: ['Plate Leggings', 'Ranger Chausses', 'Silken Breeches', 'Iron Greaves', 'Trousers'],
  feet: ['Boots of Celerity', 'Adamant Greaves', 'Iron Sabatons', 'Wind Striders'],
  neck: ['Amulet of Warding', 'Talisman of Purity', 'Astral Pendant', 'Mythril Gorget', 'Periapt of Vitality'],
  finger: ['Band of Might', 'Ring of Astral Celerity', 'Seal of the Azure King', 'Signet of Warding', 'Ring of Fortune']
};

export const SETWORLD_MATERIALS = ['mythril', 'adamantite', 'star-metal', 'nephrite', 'obsidian', 'titanium'];
export const SETWORLD_PREFIXES = ['celestial', 'stormforged', 'void', 'ancient', 'runic', 'astral'];

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

// In-memory caches by seed
export const charCache = new Map();
export const itemCache = new Map();
export const craftCache = new Map();

// Polite rate-limiting state & CORS circuit breaker
let lastNetworkCallTime = 0;
const MIN_CALL_INTERVAL_MS = 60;
let activeCalls = 0;
const MAX_CONCURRENT_CALLS = 4;
let apiReachable = true;

/**
 * Polite rate limiter and concurrency guard so set.world is never spammed.
 */
async function throttleNetwork() {
  while (activeCalls >= MAX_CONCURRENT_CALLS) {
    await new Promise((resolve) => setTimeout(resolve, 25));
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
export async function fetchWithTimeout(url, timeoutMs = 800) {
  if (!apiReachable || typeof fetch !== 'function') {
    throw new Error('fetch is offline or CORS-blocked');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    return await res.json();
  } catch (err) {
    apiReachable = false;
    throw err;
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
export function generateFallbackItem(seed, explicitSlot = null) {
  const rng = createSeededRng(seed);
  const slot = explicitSlot || rng.choice(EQUIPMENT_SLOTS);
  const mat = rng.choice(SETWORLD_MATERIALS);
  const prefix = rng.choice(SETWORLD_PREFIXES);

  const slotOptions = SLOT_CATEGORIES[slot] || [`${slot} relic`];
  const baseName = rng.choice(slotOptions);
  const capPrefix = prefix.charAt(0).toUpperCase() + prefix.slice(1);
  const capMat = mat.charAt(0).toUpperCase() + mat.slice(1);
  const fullName = `${capPrefix} ${capMat} ${baseName}`;

  const grades = ['F', 'E', 'D', 'C', 'B', 'A', 'S'];
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

  const item = {
    name: fullName,
    slot,
    tier: grade,
    grade,
    tierGrade: grade,
    score,
    orbValue: orbVal,
    seed: (seed >>> 0),
    material: mat,
    materialName: mat,
    prefix,
    props: [{ name: prefix, tierGrade: grade }],
    provenance: {
      endpoint: '/api/roll/character',
      seed: (seed >>> 0),
      rollScore: score,
      candidateRank: 1,
      totalCandidates: 1,
      material: mat,
      prefix
    }
  };

  if (slot === 'feet') {
    item.moveBonus = (gradeIndex >= 2) ? 1 : 0;
    item.jumpBonus = (gradeIndex >= 4) ? 1 : 0;
    item.stats = { speed: 4, dodge: 3 };
  } else if (slot === 'neck') {
    item.amuletWard = (grade === 'S' || grade === 'A');
    item.stats = { magicDamage: 8, armor: 4, lck: 6, def: 4, mag: 8 };
  }

  return item;
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
  let toolItem = generateFallbackItem(toolSeed, 'tool');

  return {
    seed: (seed >>> 0),
    name: `${className} of the ${rng.choice(['Azure', 'Crimson', 'Obsidian', 'Solar', 'Verdant'])}`,
    className,
    class: {
      name: className,
      description: `Tactical combatant skilled in ${className.toLowerCase()} combat arts.`
    },
    passive: CLASS_PASSIVES[className] || CLASS_PASSIVES['Knight'],
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
      offhand: generateFallbackItem(deriveSeed(seed, 102), 'offhand'),
      head: generateFallbackItem(deriveSeed(seed, 103), 'head'),
      chest: generateFallbackItem(deriveSeed(seed, 104), 'chest'),
      legs: generateFallbackItem(deriveSeed(seed, 105), 'legs'),
      feet: generateFallbackItem(deriveSeed(seed, 106), 'feet'),
      neck: generateFallbackItem(deriveSeed(seed, 107), 'neck'),
      finger: generateFallbackItem(deriveSeed(seed, 108), 'finger')
    },
    provenance: {
      endpoint: '/api/roll/character',
      seed: (seed >>> 0),
      className,
      rolledAt: Date.now(),
      slotCount: 8
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

  bestItem.provenance = {
    endpoint: '/api/craft',
    seed: (seed >>> 0),
    rollScore: highestScore,
    candidateRank: 1,
    totalCandidates: rolls,
    material: typeof bestItem.material === 'string' ? bestItem.material : bestItem.material?.name,
    prefix: bestItem.prefix
  };

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
 * High-level craftWithOrb generator matching Set.world API and candidate lottery.
 */
export async function craftWithOrb(orbs, seed) {
  return craftItem(orbs, seed);
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
    const data = await fetchWithTimeout(url, 600);
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
    const data = await fetchWithTimeout(url, 600);
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
    const data = await fetchWithTimeout(url, 600);
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
 * Upgrades an item's tier, grade, finishTier, and power using Set Orbs.
 * - Increments item.boostStars = Math.min(5, (item.boostStars || 0) + 1).
 * - Upgrades item.tier & item.grade along ['D', 'C', 'B', 'A', 'S'].
 * - Sets item.finishTier along ['bronze', 'iron', 'mythril', 'gold', 'adamantite'].
 * - Increases item.orbValue = (item.orbValue || 100) + orbsSpent and boosts weapon damage multiplier item.boostMult = 1 + item.boostStars * 0.18.
 * - Returns { item, stars: item.boostStars, finishTier: item.finishTier, tier: item.tier }.
 */
export function boostItemWithOrbs(item, orbsSpent = 50) {
  if (!item) return null;
  item.boostStars = Math.min(5, (item.boostStars || 0) + 1);

  const TIERS = ['D', 'C', 'B', 'A', 'S'];
  const FINISH_TIERS = ['bronze', 'iron', 'mythril', 'gold', 'adamantite'];

  const currentGrade = (item.grade || item.tier || item.tierGrade || 'D').toUpperCase();
  let idx = TIERS.indexOf(currentGrade);
  let nextIdx = idx >= 0 ? Math.min(TIERS.length - 1, idx + 1) : Math.min(TIERS.length - 1, item.boostStars - 1);
  const upgradedTier = TIERS[nextIdx];

  item.tier = upgradedTier;
  item.grade = upgradedTier;
  item.tierGrade = upgradedTier;

  const finishIdx = Math.max(0, Math.min(FINISH_TIERS.length - 1, item.boostStars - 1));
  item.finishTier = FINISH_TIERS[finishIdx];

  item.orbValue = (item.orbValue || 100) + orbsSpent;
  item.boostMult = 1 + item.boostStars * 0.18;

  return {
    item,
    stars: item.boostStars,
    finishTier: item.finishTier,
    tier: item.tier
  };
}

/**
 * Maps a Set.world tool item and class to one of the held models in set-items.glb
 * ('sword', 'katana', 'spear', 'rifle', 'tome', 'harp', 'shield', 'bow', 'cloth_bag').
 */
export function mapToolToWeaponSpec(toolItem, className) {
  const itemName = ((toolItem && (toolItem.name || toolItem.type)) || '').toLowerCase();
  const cls = (className || '').toLowerCase();
  const combined = `${itemName} ${cls}`;

  let spec = null;

  // 1. Spear (spear, lance, pike, halberd, trident, dragoon, vanguard)
  if (/(spear|lance|pike|halberd|trident|dragoon|vanguard)/i.test(combined)) {
    spec = {
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
          name: 'Sky Leap',
          range: { min: 1, max: 3 },
          anim: 'High Jump Start',
          animPrefix: 'High Jump Start',
          animationName: 'High Jump Start',
          isDragoonJump: true,
          powerMult: 1.55,
          costMp: 14,
          ignoresElevation: true,
          description: 'Sky leap into the air and crash down upon a distant foe ignoring elevation.'
        }
      ]
    };
  } else if (/(katana|blade|messer|samurai|blademaster|shadowalker|assassin)/i.test(combined)) {
    // 2. Katana (katana, blade, messer, samurai, blademaster, shadowalker, assassin)
    spec = {
      weaponType: 'katana',
      heldModelName: 'katana',
      attackRange: { min: 1, max: 1 },
      baseAnimPrefix: 'Swing',
      abilities: [
        {
          id: 'iaido_draw',
          name: 'Iaido Draw',
          range: { min: 1, max: 1 },
          anim: 'Katana Use',
          animPrefix: 'Katana Use',
          powerMult: 1.30,
          costMp: 6,
          description: 'Swift single-stroke slash drawing a lightning-fast edge.'
        },
        {
          id: 'steal',
          name: 'Plunder Gear',
          range: { min: 1, max: 1 },
          anim: 'Steal',
          animPrefix: 'Steal',
          animationName: 'Steal',
          isSteal: true,
          powerMult: 0.65,
          costMp: 6,
          description: 'Plunder enemy gear and orbs at close range.'
        },
        {
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
          description: 'Charms enemy, inducing confused status.'
        },
        {
          id: 'weapon_throw',
          name: 'Blade Hurl',
          range: { min: 2, max: 3 },
          anim: 'Weapon Throw',
          animPrefix: 'Weapon Throw',
          animationName: 'Weapon Throw',
          isWeaponThrow: true,
          powerMult: 1.35,
          costMp: 12,
          description: 'Hurls a concealed throwing blade with deadly precision.'
        }
      ]
    };
  } else if (/(bow|longbow|shortbow|crossbow|archer|hunter)/i.test(combined)) {
    // 3. Bow (bow, longbow, shortbow, crossbow, archer, hunter)
    spec = {
      weaponType: 'bow',
      heldModelName: 'bow',
      attackRange: { min: 2, max: 5 },
      baseAnimPrefix: 'Bow',
      abilities: [
        {
          id: 'arc_shot',
          name: 'Arc Shot',
          range: { min: 2, max: 5 },
          anim: 'Bow Mid',
          animPrefix: 'Bow',
          powerMult: 1.15,
          costMp: 0,
          description: 'High-arc arrow shot delivering precise piercing damage.'
        },
        {
          id: 'sky_volley',
          name: 'Sky Volley',
          range: { min: 3, max: 6 },
          anim: 'Bow High',
          animPrefix: 'Bow',
          powerMult: 1.35,
          costMp: 8,
          description: 'Lofts a deadly rain of arrows descending from high ballistic altitude.'
        }
      ]
    };
  } else if (/(bag|pouch|flail|sachel|alchemist|merchant)/i.test(combined)) {
    // 4. Cloth Bag Flail (bag, pouch, flail, sachel, alchemist, merchant)
    spec = {
      weaponType: 'cloth_bag',
      heldModelName: 'cloth_bag',
      attackRange: { min: 1, max: 2 },
      baseAnimPrefix: 'Swing',
      abilities: [
        {
          id: 'weighted_whip',
          name: 'Weighted Bag Whip',
          range: { min: 1, max: 2 },
          anim: 'Swing Mid',
          animPrefix: 'Swing',
          powerMult: 1.20,
          costMp: 4,
          description: 'Whirls a weighted merchant sack in a vicious momentum whip.'
        },
        {
          id: 'orb_concussion',
          name: 'Orb Concussion',
          range: { min: 1, max: 2 },
          anim: 'Swing High',
          animPrefix: 'Swing',
          powerMult: 1.35,
          statusProc: 'confused',
          costMp: 8,
          description: 'Cracks an orb-dense pouch against the foe, disorienting their senses.'
        },
        {
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
          description: 'Hurls a massive boulder with ballistic knockback.'
        }
      ]
    };
  } else if (/(rifle|gun|musket|pistol|gunner|fusilier|machinist)/i.test(combined)) {
    // 5. Rifle (rifle, gun, musket, pistol, gunner, fusilier, machinist)
    spec = {
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
  } else if (/(tome|book|staff|wand|orb|mesmer|oracle|scholar|mage|wizard|warlock)/i.test(combined)) {
    // 6. Tome (tome, book, staff, wand, orb, mesmer, oracle, scholar, mage, wizard, warlock)
    spec = {
      weaponType: 'tome',
      heldModelName: 'tome',
      attackRange: { min: 1, max: 4 },
      baseAnimPrefix: 'Cast',
      abilities: [
        {
          id: 'aether_bolt',
          name: 'Aether Bolt',
          range: { min: 1, max: 4 },
          anim: 'Read Book',
          animPrefix: 'Read Book',
          isMagic: true,
          powerMult: 1.25,
          costMp: 6,
          description: 'Recites an incantation from the open spellbook into an arcane shockwave.'
        },
        {
          id: 'codex_invocation',
          name: 'Codex Invocation',
          range: { min: 1, max: 3 },
          anim: 'Read Book 2',
          animPrefix: 'Read Book 2',
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
        },
        {
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
          description: 'Resurrects a fallen ally with 65 HP.'
        }
      ]
    };
  } else if (/(harp|lute|horn|flute|herald|bard|minstrel|cantor)/i.test(combined)) {
    // 7. Harp (harp, lute, horn, flute, herald, bard, minstrel, cantor)
    spec = {
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
          anim: 'Play Instrument',
          animPrefix: 'Play Instrument',
          isMagic: true,
          powerMult: 1.10,
          costMp: 5,
          description: 'Emits a piercing acoustic note dealing magic damage.'
        },
        {
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
          description: 'Resurrects a fallen ally with 65 HP.'
        }
      ]
    };
  } else if (/(shield|buckler|aegis|bulwark|juggernaut|defender)/i.test(combined)) {
    // 8. Shield (shield, buckler, aegis, bulwark, juggernaut, defender)
    spec = {
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
        },
        {
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
          description: 'Hurls a massive boulder with ballistic knockback.'
        }
      ]
    };
  } else {
    // 9. Default: Sword (sword, greatsword, mace, hammer, knight, etc.)
    spec = {
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
          description: 'Hurls a massive boulder with ballistic knockback.'
        },
        {
          id: 'steal',
          name: 'Plunder Gear',
          range: { min: 1, max: 1 },
          anim: 'Steal',
          animPrefix: 'Steal',
          animationName: 'Steal',
          isSteal: true,
          powerMult: 0.65,
          costMp: 6,
          description: 'Plunder enemy gear and orbs at close range.'
        },
        {
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
          description: 'Charms enemy, inducing confused status.'
        },
        {
          id: 'weapon_throw',
          name: 'Blade Hurl',
          range: { min: 2, max: 3 },
          anim: 'Weapon Throw',
          animPrefix: 'Weapon Throw',
          animationName: 'Weapon Throw',
          isWeaponThrow: true,
          powerMult: 1.35,
          costMp: 12,
          description: 'Hurls a concealed throwing blade with deadly precision.'
        }
      ]
    };
  }

  // Cross-archetype guarantee checks:
  // Phoenix Revive: tome, shield (Paladin), harp (Herald), and Scholar
  if (/(tome|harp|scholar|herald|paladin)/i.test(combined) || spec.weaponType === 'tome' || spec.weaponType === 'harp') {
    if (!spec.abilities.some((a) => a.id === 'cast_revive')) {
      spec.abilities.push({
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
        description: 'Resurrects a fallen ally with 65 HP.'
      });
    }
  }

  // Thief / Rogue & Katana Skills: katana, sword, Samurai, Ninja, Ranger, Deadeye
  if (/(katana|sword|samurai|ninja|ranger|deadeye|thief|rogue)/i.test(combined) || spec.weaponType === 'katana' || spec.weaponType === 'sword') {
    if (!spec.abilities.some((a) => a.id === 'steal')) {
      spec.abilities.push({
        id: 'steal',
        name: 'Plunder Gear',
        range: { min: 1, max: 1 },
        anim: 'Steal',
        animPrefix: 'Steal',
        animationName: 'Steal',
        isSteal: true,
        powerMult: 0.65,
        costMp: 6,
        description: 'Plunder enemy gear and orbs at close range.'
      });
    }
    if (!spec.abilities.some((a) => a.id === 'steal_heart')) {
      spec.abilities.push({
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
        description: 'Charms enemy, inducing confused status.'
      });
    }
    if (!spec.abilities.some((a) => a.id === 'weapon_throw')) {
      spec.abilities.push({
        id: 'weapon_throw',
        name: 'Blade Hurl',
        range: { min: 2, max: 3 },
        anim: 'Weapon Throw',
        animPrefix: 'Weapon Throw',
        animationName: 'Weapon Throw',
        isWeaponThrow: true,
        powerMult: 1.35,
        costMp: 12,
        description: 'Hurls a concealed throwing blade with deadly precision.'
      });
    }
  }

  // Heavy Stone Ballistic Knockback: cloth_bag, Juggernaut, Vanguard, Berserker, Knight
  if (/(cloth_bag|juggernaut|vanguard|berserker|knight)/i.test(combined) || spec.weaponType === 'cloth_bag') {
    if (!spec.abilities.some((a) => a.id === 'heavy_stone')) {
      spec.abilities.push({
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
        description: 'Hurls a massive boulder with ballistic knockback.'
      });
    }
  }

  // Dragoon Sky Leap: spear, Dragoon, Lance
  if (/(spear|lance|dragoon)/i.test(combined) || spec.weaponType === 'spear') {
    if (!spec.abilities.some((a) => a.id === 'dragoon_jump')) {
      spec.abilities.push({
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
        description: 'Sky leap into the air and crash down upon a distant foe ignoring elevation.'
      });
    }
  }

  return spec;
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
    return tile.passable !== false && !tile.isWater && !tile.water && tile.type !== 'water' && tile.terrain !== 'water';
  }
  if (board.tiles) {
    if (Array.isArray(board.tiles[z])) {
      const tile = board.tiles[z][x];
      if (!tile) return false;
      return tile.passable !== false && !tile.isWater && !tile.water && tile.type !== 'water' && tile.terrain !== 'water';
    }
    if (Array.isArray(board.tiles)) {
      const width = board.width || 10;
      const tile = board.tiles[z * width + x];
      if (!tile) return false;
      return tile.passable !== false && !tile.isWater && !tile.water && tile.type !== 'water' && tile.terrain !== 'water';
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
 * Generates a full 8-slot Set.world equipment paperdoll
 * (tool, offhand, head, chest, legs, feet, neck, finger) with readable names and stats.
 */
export function generateFullEquipment(unitSeed, charClass, weaponSpec = null, grade = 'C') {
  const rng = createSeededRng(unitSeed);
  const wSpec = weaponSpec || { weaponType: 'sword' };

  const wepPrefix = wSpec.elementalPrefix || 'Mythril';
  const wepName = wSpec.name || ((wSpec.weaponType || 'sword').charAt(0).toUpperCase() + (wSpec.weaponType || 'sword').slice(1));
  const toolMat = rng.choice(SETWORLD_MATERIALS);
  const toolPref = rng.choice(SETWORLD_PREFIXES);

  const toolItem = {
    name: `${wepPrefix} ${wepName}`,
    slot: 'tool',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    boostStars: 0,
    boostMult: 1.0,
    orbValue: 125,
    material: toolMat,
    materialName: toolMat,
    prefix: toolPref,
    props: [{ name: toolPref, tierGrade: grade }],
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 101),
      rollScore: 85.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: toolMat,
      prefix: toolPref
    },
    stats: { physicalDamage: 22, magicDamage: 18 }
  };

  const offhandMat = rng.choice(SETWORLD_MATERIALS);
  const offhandPref = rng.choice(SETWORLD_PREFIXES);
  const offhand = {
    name: rng.choice(SLOT_CATEGORIES.offhand),
    slot: 'offhand',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    orbValue: 65,
    material: offhandMat,
    materialName: offhandMat,
    prefix: offhandPref,
    props: [{ name: offhandPref, tierGrade: grade }],
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 102),
      rollScore: 75.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: offhandMat,
      prefix: offhandPref
    },
    stats: { armor: 6, dodge: 4 }
  };

  const headMat = rng.choice(SETWORLD_MATERIALS);
  const headPref = rng.choice(SETWORLD_PREFIXES);
  const head = {
    name: rng.choice(SLOT_CATEGORIES.head),
    slot: 'head',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    orbValue: 50,
    material: headMat,
    materialName: headMat,
    prefix: headPref,
    props: [{ name: headPref, tierGrade: grade }],
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 103),
      rollScore: 70.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: headMat,
      prefix: headPref
    },
    stats: { armor: 4, accuracy: 5 }
  };

  const chestMat = rng.choice(SETWORLD_MATERIALS);
  const chestPref = rng.choice(SETWORLD_PREFIXES);
  const chest = {
    name: rng.choice(SLOT_CATEGORIES.chest),
    slot: 'chest',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    orbValue: 90,
    material: chestMat,
    materialName: chestMat,
    prefix: chestPref,
    props: [{ name: chestPref, tierGrade: grade }],
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 104),
      rollScore: 88.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: chestMat,
      prefix: chestPref
    },
    stats: { armor: 10, maxHpBonus: 25 }
  };

  const legsMat = rng.choice(SETWORLD_MATERIALS);
  const legsPref = rng.choice(SETWORLD_PREFIXES);
  const legs = {
    name: rng.choice(SLOT_CATEGORIES.legs),
    slot: 'legs',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    orbValue: 55,
    material: legsMat,
    materialName: legsMat,
    prefix: legsPref,
    props: [{ name: legsPref, tierGrade: grade }],
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 105),
      rollScore: 72.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: legsMat,
      prefix: legsPref
    },
    stats: { armor: 5, walkSpeedBonus: 0.1 }
  };

  const feetMat = rng.choice(SETWORLD_MATERIALS);
  const feetPref = rng.choice(SETWORLD_PREFIXES);
  const gradeUpper = (grade || 'C').toUpperCase();
  const feet = {
    name: rng.choice(SLOT_CATEGORIES.feet),
    slot: 'feet',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    orbValue: 60,
    material: feetMat,
    materialName: feetMat,
    prefix: feetPref,
    props: [{ name: feetPref, tierGrade: grade }],
    moveBonus: ['D', 'C', 'B', 'A', 'S'].includes(gradeUpper) ? 1 : 0,
    jumpBonus: ['B', 'A', 'S'].includes(gradeUpper) ? 1 : 0,
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 106),
      rollScore: 74.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: feetMat,
      prefix: feetPref
    },
    stats: { speed: 4, dodge: 3 }
  };

  const neckMat = rng.choice(SETWORLD_MATERIALS);
  const neckPref = rng.choice(SETWORLD_PREFIXES);
  const neck = {
    name: rng.choice(SLOT_CATEGORIES.neck),
    slot: 'neck',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    orbValue: 85,
    material: neckMat,
    materialName: neckMat,
    prefix: neckPref,
    props: [{ name: neckPref, tierGrade: grade }],
    amuletWard: (gradeUpper === 'S' || gradeUpper === 'A'),
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 107),
      rollScore: 82.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: neckMat,
      prefix: neckPref
    },
    stats: { magicDamage: 8, armor: 4, lck: 6, def: 4, mag: 8 }
  };

  const fingerMat = rng.choice(SETWORLD_MATERIALS);
  const fingerPref = rng.choice(SETWORLD_PREFIXES);
  const finger = {
    name: rng.choice(SLOT_CATEGORIES.finger),
    slot: 'finger',
    tier: grade,
    grade: grade,
    tierGrade: grade,
    finishTier: 'bronze',
    orbValue: 75,
    material: fingerMat,
    materialName: fingerMat,
    prefix: fingerPref,
    props: [{ name: fingerPref, tierGrade: grade }],
    provenance: {
      endpoint: '/api/roll/character',
      seed: deriveSeed(unitSeed, 108),
      rollScore: 80.0,
      candidateRank: 1,
      totalCandidates: 1,
      material: fingerMat,
      prefix: fingerPref
    },
    stats: { critBonus: 5, magicDamage: 6 }
  };

  return {
    tool: toolItem,
    offhand,
    head,
    chest,
    legs,
    feet,
    neck,
    finger
  };
}

/**
 * Normalizes an equipment object ensuring all 8 slots are populated.
 * Synthesizes starter feet & neck items deterministically if absent.
 */
export function normalizeEquipment(equipment = {}, unitSeed = 1337, charClass = 'Knight', weaponSpec = null, grade = 'C') {
  let targetEq = equipment;
  let unit = null;
  if (equipment && equipment.equipment && typeof equipment.equipment === 'object') {
    unit = equipment;
    targetEq = equipment.equipment;
  }

  const norm = { ...(targetEq || {}) };
  const fullDefaults = generateFullEquipment(unitSeed, charClass, weaponSpec, grade);

  for (let idx = 0; idx < EQUIPMENT_SLOTS.length; idx++) {
    const slot = EQUIPMENT_SLOTS[idx];
    if (!norm[slot]) {
      norm[slot] = fullDefaults[slot] || generateFallbackItem(deriveSeed(unitSeed, idx + 200), slot);
    } else {
      const item = { ...norm[slot] };
      item.slot = slot;
      if (!item.material) {
        const matRng = createSeededRng(deriveSeed(unitSeed, idx + 300));
        item.material = matRng.choice(SETWORLD_MATERIALS);
      }
      if (!item.prefix) {
        const prefRng = createSeededRng(deriveSeed(unitSeed, idx + 400));
        item.prefix = prefRng.choice(SETWORLD_PREFIXES);
      }
      if (!item.provenance) {
        item.provenance = {
          endpoint: '/api/roll/character',
          seed: deriveSeed(unitSeed, idx + 500),
          rollScore: item.score || 80.0,
          candidateRank: 1,
          totalCandidates: 1,
          material: typeof item.material === 'string' ? item.material : item.material?.name,
          prefix: item.prefix
        };
      }
      norm[slot] = item;
    }
  }

  if (unit) {
    unit.equipment = norm;
    recalculateEquipmentStats(unit);
    return norm;
  }
  return norm;
}

/**
 * Computes active Set.world Material & Prefix Resonances (Item Set Bonuses).
 */
export function computeSetWorldResonance(unit) {
  if (!unit || !unit.equipment) {
    if (unit) unit.resonances = [];
    return [];
  }

  const materialCounts = {};
  const prefixCounts = {};

  for (const slot of EQUIPMENT_SLOTS) {
    const item = unit.equipment[slot];
    if (!item) continue;

    let mat = '';
    if (typeof item.material === 'string') {
      mat = item.material;
    } else if (item.material && typeof item.material === 'object') {
      mat = item.material.name || item.material.id || '';
    } else if (item.provenance?.material) {
      mat = item.provenance.material;
    }
    mat = mat.toLowerCase().trim();
    if (mat) {
      materialCounts[mat] = (materialCounts[mat] || 0) + 1;
    }

    let pref = '';
    if (typeof item.prefix === 'string') {
      pref = item.prefix;
    } else if (item.prefix && typeof item.prefix === 'object') {
      pref = item.prefix.name || item.prefix.id || '';
    } else if (Array.isArray(item.props) && item.props[0]?.name) {
      pref = item.props[0].name;
    } else if (item.provenance?.prefix) {
      pref = item.provenance.prefix;
    }
    pref = pref.toLowerCase().trim();
    if (pref) {
      prefixCounts[pref] = (prefixCounts[pref] || 0) + 1;
    }
  }

  const resonances = [];

  const MATERIAL_RESONANCE_DEFS = {
    mythril: {
      id: 'mythril',
      name: 'Mythril Resonance',
      desc: '+15 DEF, +10 SPD, Auto-Float',
      stats: { def: 15, spd: 10 },
      autoFloat: true
    },
    'star-metal': {
      id: 'star-metal',
      name: 'Star-Metal Resonance',
      desc: '+18 ATK, +18 MAG, +15% Crit',
      stats: { atk: 18, mag: 18 },
      critBonus: 15
    },
    adamantite: {
      id: 'adamantite',
      name: 'Adamantite Resonance',
      desc: '+60 Max HP, +25 DEF, Unmovable',
      stats: { def: 25 },
      hpBonus: 60,
      knockbackImmune: true
    },
    obsidian: {
      id: 'obsidian',
      name: 'Obsidian Resonance',
      desc: '+22 ATK, 20% Lifesteal',
      stats: { atk: 22 },
      lifesteal: 0.20
    },
    nephrite: {
      id: 'nephrite',
      name: 'Nephrite Resonance',
      desc: '+20 MAG, +12 HP Regen/Turn',
      stats: { mag: 20 },
      regenPerTurn: 12
    },
    titanium: {
      id: 'titanium',
      name: 'Titanium Resonance',
      desc: '+15 ATK, +15 DEF, +1 MOVE',
      stats: { atk: 15, def: 15 },
      moveBonus: 1
    }
  };

  for (const [mat, count] of Object.entries(materialCounts)) {
    if (count >= 2 && MATERIAL_RESONANCE_DEFS[mat]) {
      const def = MATERIAL_RESONANCE_DEFS[mat];
      resonances.push({
        ...def,
        count
      });
    }
  }

  for (const [pref, count] of Object.entries(prefixCounts)) {
    if (count >= 2) {
      const capName = pref.charAt(0).toUpperCase() + pref.slice(1);
      resonances.push({
        id: pref,
        name: `${capName} Prefix Synergy`,
        count,
        desc: '+10 All Stats',
        stats: { atk: 10, def: 10, mag: 10, spd: 10, lck: 10 }
      });
    }
  }

  unit.resonances = resonances;
  return resonances;
}

/**
 * Recalculates all equipment bonuses on a unit starting from its base stats,
 * preventing stat stacking when items are swapped or re-equipped.
 * @param {Object} unit
 */
export function recalculateEquipmentStats(unit) {
  if (!unit) return;
  const prevMaxHp = unit.maxHp || 100;
  const prevMaxMp = unit.maxMp || 40;
  const wasFullHp = unit.hp === undefined || unit.hp >= prevMaxHp;
  const wasFullMp = unit.mp === undefined || unit.mp >= prevMaxMp;

  if (unit._baseMaxHp === undefined) unit._baseMaxHp = unit.maxHp || 100;
  if (unit._baseMaxMp === undefined) unit._baseMaxMp = unit.maxMp || 40;
  if (unit._baseMove === undefined) unit._baseMove = unit.move ?? 4;
  if (unit._baseJump === undefined) unit._baseJump = unit.jump ?? 2;
  if (unit._baseMoveRange === undefined) unit._baseMoveRange = unit.moveRange ?? unit._baseMove;
  if (unit._baseSpeed === undefined) unit._baseSpeed = unit.speed || 15;
  if (!unit._baseStats) unit._baseStats = { ...(unit.stats || {}) };

  // Reset to base stats
  unit.maxHp = unit._baseMaxHp;
  unit.maxMp = unit._baseMaxMp;
  unit.move = unit._baseMove;
  unit.moveRange = unit._baseMoveRange;
  unit.jump = unit._baseJump;
  unit.jumpHeight = unit._baseJump;
  unit.speed = unit._baseSpeed;
  unit.stats = { ...unit._baseStats };
  unit.armor = unit._baseStats.armor || 0;
  unit.magicResistance = unit._baseStats.magicResistance || 0;
  unit.blockChance = unit._baseStats.blockChance || 0;
  unit.magicDamage = unit._baseStats.magicDamage || 0;
  unit.dodge = unit._baseStats.dodge || 0;

  unit.amuletWard = false;
  unit.knockbackImmune = false;
  unit.lifesteal = 0;
  unit.regenPerTurn = 0;
  unit.critBonus = 0;

  if (unit.equipment) {
    for (const s of EQUIPMENT_SLOTS) {
      const eqItem = unit.equipment[s];
      if (!eqItem) continue;

      if (s === 'tool') {
        const raw = eqItem.rawItem || eqItem;
        const spec = mapToolToWeaponSpec(raw, unit.className || unit.class || unit.job);
        if (unit.isRaidBoss || (unit.weapon?.abilities?.some((a) => a.id === 'sovereign_cataclysm')) || eqItem.abilities?.some((a) => a.id === 'sovereign_cataclysm')) {
          if (!spec.abilities.some((a) => a.id === 'sovereign_cataclysm')) {
            spec.abilities.unshift({
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
            });
          }
        }
        unit.weapon = spec;
        unit.weaponType = spec.weaponType;
        unit.heldModelName = spec.heldModelName;
        unit.abilities = spec.abilities;
        unit.attackRange = spec.attackRange;
        unit.finishTier = eqItem.finishTier || unit.finishTier;
        unit.stars = (eqItem.stars !== undefined ? eqItem.stars : eqItem.boostStars) ?? unit.stars;
        unit.elementalPrefix = eqItem.elementalPrefix || unit.elementalPrefix;
      } else {
        const gradeKey = (eqItem.grade || eqItem.tier || eqItem.tierGrade || 'B').toUpperCase();
        const tierMult = { F: 1, E: 2, D: 3, C: 4, B: 6, A: 9, S: 14 }[gradeKey] || 5;
        const starBonus = ((eqItem.stars !== undefined ? eqItem.stars : eqItem.boostStars) || 0) * 3;
        const bonus = tierMult + starBonus;
        const rarity = String(eqItem.rarity || eqItem.tier || eqItem.grade || '').toLowerCase();

        if (s === 'head') {
          unit.maxHp += bonus * 3;
          if (unit.stats.maxHealth !== undefined) unit.stats.maxHealth += bonus * 3;
          unit.magicResistance += bonus;
          unit.stats.magicResistance = (unit.stats.magicResistance || 0) + bonus;
        } else if (s === 'chest') {
          unit.maxHp += bonus * 5;
          if (unit.stats.maxHealth !== undefined) unit.stats.maxHealth += bonus * 5;
          unit.armor += bonus * 2;
          unit.stats.armor = (unit.stats.armor || 0) + bonus * 2;
        } else if (s === 'legs') {
          const moveBonus = Math.min(2, Math.ceil(bonus / 5));
          unit.moveRange += moveBonus;
          unit.move += moveBonus;
          unit.speed += bonus;
          unit.dodge += bonus;
          unit.stats.moveRange = unit.moveRange;
          unit.stats.speed = (unit.stats.speed || 15) + bonus;
          unit.stats.dodge = (unit.stats.dodge || 0) + bonus;
        } else if (s === 'offhand') {
          unit.armor += bonus * 2;
          unit.stats.armor = (unit.stats.armor || 0) + bonus * 2;
          unit.blockChance += bonus;
          unit.stats.blockChance = (unit.stats.blockChance || 0) + bonus;
        } else if (s === 'finger') {
          unit.magicDamage += bonus * 2;
          unit.stats.magicDamage = (unit.stats.magicDamage || 0) + bonus * 2;
          unit.speed += bonus;
          unit.stats.speed = (unit.stats.speed || 15) + bonus;
        } else if (s === 'feet') {
          unit.speed += bonus;
          unit.stats.speed = (unit.stats.speed || 15) + bonus;
          unit.dodge += Math.round(bonus / 2);
          unit.stats.dodge = (unit.stats.dodge || 0) + Math.round(bonus / 2);

          const isUncommonPlus = ['uncommon', 'rare', 'epic', 'legendary', 'mythic'].includes(rarity) || ['E', 'D', 'C', 'B', 'A', 'S'].includes(gradeKey);
          if (isUncommonPlus || eqItem.moveBonus) {
            unit.move += 1;
            unit.moveRange += 1;
          }
          const isEpicPlus = ['epic', 'legendary', 'mythic'].includes(rarity) || ['B', 'A', 'S'].includes(gradeKey);
          if (isEpicPlus || eqItem.jumpBonus) {
            unit.jump += 1;
            unit.jumpHeight += 1;
          }
        } else if (s === 'neck') {
          unit.magicDamage += bonus * 2;
          unit.stats.magicDamage = (unit.stats.magicDamage || 0) + bonus * 2;
          unit.armor += bonus;
          unit.stats.armor = (unit.stats.armor || 0) + bonus;
          unit.stats.lck = (unit.stats.lck || 10) + bonus;

          const isWardRarity = ['legendary', 'mythic'].includes(rarity) || ['A', 'S'].includes(gradeKey) || eqItem.amuletWard;
          if (isWardRarity) {
            unit.amuletWard = true;
          }
        }
      }
    }
  }

  // Set.world Material & Prefix Resonance Bonuses
  computeSetWorldResonance(unit);

  if (unit.resonances && unit.resonances.length > 0) {
    for (const res of unit.resonances) {
      if (res.stats) {
        if (res.stats.def) {
          unit.armor += res.stats.def;
          unit.stats.armor = (unit.stats.armor || 0) + res.stats.def;
        }
        if (res.stats.spd) {
          unit.speed += res.stats.spd;
          unit.stats.speed = (unit.stats.speed || 15) + res.stats.spd;
        }
        if (res.stats.atk) {
          unit.stats.physicalDamage = (unit.stats.physicalDamage || 0) + res.stats.atk;
        }
        if (res.stats.mag) {
          unit.magicDamage += res.stats.mag;
          unit.stats.magicDamage = (unit.stats.magicDamage || 0) + res.stats.mag;
        }
        if (res.stats.lck) {
          unit.stats.lck = (unit.stats.lck || 10) + res.stats.lck;
          unit.dodge = (unit.dodge || 0) + 5;
          unit.stats.dodge = (unit.stats.dodge || 0) + 5;
        }
      }
      if (res.autoFloat) {
        unit.isFloating = true;
        unit.status = unit.status || 'floating';
      }
      if (res.critBonus) {
        unit.critBonus = (unit.critBonus || 0) + res.critBonus;
      }
      if (res.hpBonus) {
        unit.maxHp += res.hpBonus;
        if (unit.stats.maxHealth !== undefined) unit.stats.maxHealth += res.hpBonus;
      }
      if (res.knockbackImmune) {
        unit.knockbackImmune = true;
      }
      if (res.lifesteal) {
        unit.lifesteal = (unit.lifesteal || 0) + res.lifesteal;
      }
      if (res.regenPerTurn) {
        unit.regenPerTurn = (unit.regenPerTurn || 0) + res.regenPerTurn;
      }
      if (res.moveBonus) {
        unit.move += res.moveBonus;
        unit.moveRange += res.moveBonus;
      }
    }
  }

  // Class Passive traits
  const passive = unit.passive || CLASS_PASSIVES[unit.className];
  if (passive) {
    if (passive.id === 'juggernaut' || unit.className === 'Dreadnought') {
      unit.knockbackImmune = true;
    }
    if (passive.id === 'aegis_ward' || unit.className === 'Paladin') {
      unit.amuletWard = true;
    }
  }

  unit.hp = wasFullHp ? unit.maxHp : Math.min(unit.hp ?? unit.maxHp, unit.maxHp);
  unit.mp = wasFullMp ? unit.maxMp : Math.min(unit.mp ?? unit.maxMp, unit.maxMp);
}

/**
 * Applies a Set.world equipment item to a unit's 8-slot paperdoll
 * (tool, offhand, head, chest, legs, feet, neck, finger) and applies stat bonuses.
 * Supports both applyEquipmentToUnit(unit, item, slot) and applyEquipmentToUnit(unit, slot, item).
 */
export function applyEquipmentToUnit(unit, arg2, arg3 = null) {
  if (!unit) return { slot: null, unit };

  let item = null;
  let targetSlot = null;

  if (typeof arg2 === 'string') {
    targetSlot = arg2;
    item = arg3;
  } else {
    item = arg2;
    targetSlot = arg3;
  }

  if (!item) return { slot: targetSlot || null, unit };

  let slot = targetSlot || item.slot || (item.type === 'armor' ? 'chest' : 'tool');
  let sLower = String(slot).toLowerCase();
  if (sLower === 'weapon') sLower = 'tool';
  else if (sLower === 'shield') sLower = 'offhand';
  else if (sLower === 'armor') sLower = 'chest';
  else if (sLower === 'boots') sLower = 'feet';
  else if (sLower === 'ring') sLower = 'finger';
  else if (sLower === 'amulet' || sLower === 'pendant' || sLower === 'talisman' || sLower === 'periapt' || sLower === 'gorget') sLower = 'neck';
  else if (sLower === 'helm' || sLower === 'circlet' || sLower === 'visor') sLower = 'head';

  if (!EQUIPMENT_SLOTS.includes(sLower)) {
    sLower = 'tool';
  }

  unit.equipment = unit.equipment || {};
  unit.equipment[sLower] = item;
  recalculateEquipmentStats(unit);

  return { slot: sLower, unit };
}

/**
 * Deterministically re-rolls a single Clan unit from a seed string,
 * preserving id, team, grid coordinates, and facing while normalizing 8-slot gear and resonances.
 */
function stringToSeed(str) {
  if (typeof str === 'number') return str >>> 0;
  if (!str) return 0x1337;
  let hash = 5381;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return hash >>> 0;
}

export function rerollSingleUnitWithSeed(unit, customSeedStr) {
  if (!unit) return null;
  const seed = stringToSeed(customSeedStr);
  const charData = generateFallbackCharacter(seed);
  const className = charData.class?.name || 'Knight';

  unit.seed = seed;
  unit.name = charData.name;
  unit.className = className;
  unit.class = className;
  unit.job = className;
  unit.grade = charData.tierGrade || 'C';
  unit.tier = unit.grade;
  unit.tierGrade = unit.grade;
  unit.finishTier = 'bronze';
  unit.boostStars = 0;

  const weaponSpec = mapToolToWeaponSpec(charData.equipment?.tool, className);
  unit.weapon = weaponSpec;
  unit.weaponType = weaponSpec.weaponType;
  unit.weaponModel = weaponSpec.heldModelName;
  unit.heldModelName = weaponSpec.heldModelName;
  unit.abilities = weaponSpec.abilities;
  unit.attackRange = weaponSpec.attackRange;

  unit.passive = CLASS_PASSIVES[className] || CLASS_PASSIVES['Knight'];

  const baseHp = Math.round(charData.attributes?.maxHealth || 100);
  const speed = Math.round((charData.attributes?.walkSpeed || 1.0) * 10) + (unit.isBoss ? 7 : 6);
  const moveRange = 3 + ((charData.attributes?.walkSpeed || 1.0) > 1.25 ? 1 : 0);
  unit._baseMaxHp = baseHp;
  unit._baseMaxMp = 40;
  unit._baseMoveRange = moveRange;
  unit._baseMove = 4;
  unit._baseJump = 2;
  unit._baseSpeed = speed;
  unit._baseStats = { ...(charData.attributes || {}) };
  unit.stats = { ...unit._baseStats };
  unit.maxHp = baseHp;
  unit.hp = baseHp;
  unit.maxMp = 40;
  unit.mp = 40;

  const fullEquipment = generateFullEquipment(seed, className, weaponSpec, unit.grade);
  unit.equipment = normalizeEquipment(fullEquipment, seed, className, weaponSpec, unit.grade);

  unit.provenance = {
    endpoint: '/api/roll/character',
    seed,
    className,
    rolledAt: Date.now(),
    slotCount: 8
  };

  recalculateEquipmentStats(unit);
  return unit;
}

/**
 * Generates an 8-unit tactical clan roster (4 Blue Azure Clan, 4 Red Crimson Order)
 * placed on valid non-water tiles of a 10x10 board.
 */
export async function generateClanRoster(baseSeed, board, options = {}) {
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

  const seeds = Array.from({ length: 8 }, (_, i) => deriveSeed(normalizedBase, i));
  const charList = seeds.map((s) => {
    const norm = s >>> 0;
    if (!charCache.has(norm)) {
      charCache.set(norm, generateFallbackCharacter(norm));
    }
    return charCache.get(norm);
  });

  for (let i = 0; i < 8; i++) {
    const unitSeed = seeds[i];
    const charData = charList[i];

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
      const heroNames0 = ['Sir Vance', 'Lord Roland', 'Sir Gareth', 'Captain Alistair'];
      const heroNames1 = ['Archmage Lyra', 'Mystic Selene', 'Oracle Isolde', 'Sage Aurelia'];
      const heroNames3 = ['Lady Seraphina', 'Valeria Dawn', 'Freya Starlight', 'Helena Sky'];
      const pickIdx = (unitSeed >>> 3) % 4;

      if (slot === 0) {
        className = 'Knight';
        weaponSpec = mapToolToWeaponSpec({ name: 'Mythril Broadsword', type: 'sword' }, className);
        paletteId = 'azure_knight';
        rank = 'CHAMPION';
        archetypeTitle = 'Azure Knight';
        scale = 1.0;
        charName = heroNames0[pickIdx];
      } else if (slot === 1) {
        className = 'Mesmer';
        weaponSpec = mapToolToWeaponSpec({ name: 'Arcane Tome', type: 'tome' }, className);
        paletteId = 'azure_mage';
        rank = 'MYSTIC';
        archetypeTitle = 'Azure Mage';
        scale = 1.0;
        charName = heroNames1[pickIdx];
      } else if (slot === 2) {
        // Azure Slot 2: Ranger Orion with choice between bow and rifle (showcasing both bow and rifle on the board)
        const isAzureBow = (normalizedBase % 2 !== 0);
        className = isAzureBow ? 'Archer' : 'Fusilier';
        weaponSpec = mapToolToWeaponSpec(
          isAzureBow ? { name: 'Mythril Longbow', type: 'bow' } : { name: 'Precision Rifle', type: 'rifle' },
          className
        );
        paletteId = 'azure_ranger';
        rank = 'MARKSMAN';
        archetypeTitle = isAzureBow ? 'Azure Ranger' : 'Azure Marksman';
        scale = 1.0;
        charName = 'Ranger Orion';
      } else {
        className = 'Dragoon';
        weaponSpec = mapToolToWeaponSpec({ name: 'Holy Lance', type: 'spear' }, className);
        paletteId = 'azure_paladin';
        rank = 'VANGUARD';
        archetypeTitle = 'Azure Paladin';
        scale = 1.0;
        charName = heroNames3[pickIdx];
      }
    } else {
      // Crimson Order enemies with 4 guaranteed distinct Enemy Archetypes
      const bossNames = ['Malakor', 'Vorgath', 'Zarkon', 'Draven'];
      const tankNames = ['Krag', 'Baelor', 'Grom', 'Thorn'];
      const hexerNames = ['Moros', 'Xylar', 'Nyx', 'Vesper'];
      const pickIdx = (unitSeed >>> 3) % 4;

      if (slot === 0) {
        if (options && options.raidBossMode) {
          // Overlord Malakor [250x RAID BOSS]
          isBoss = true;
          rank = 'COMMANDER';
          archetypeTitle = '250x Raid Overlord';
          paletteId = 'crimson_warlord';
          scale = 1.42;
          className = 'Samurai';
          charName = 'Overlord Malakor [250x RAID BOSS]';
          const baseHp = charData.attributes?.maxHealth || 110;
          maxHp = Math.round(baseHp * 2.4);

          weaponSpec = mapToolToWeaponSpec({ name: 'Adamantite Blood Katana', type: 'katana' }, className);
          const sovereignCataclysm = {
            id: 'sovereign_cataclysm',
            name: 'Sovereign Cataclysm',
            range: { min: 1, max: 3 },
            anim: 'Katana Use',
            animPrefix: 'Katana Use',
            powerMult: 1.65,
            statusProc: 'frozen',
            costMp: 10,
            aoe: 1,
            description: 'Unleashes devastating sovereign apocalyptic cold, freezing all in its path.'
          };
          weaponSpec.abilities.unshift(sovereignCataclysm);
          weaponSpec.elementalPrefix = 'Boreal';
          weaponSpec.statusProc = 'frozen';
          weaponSpec.finishTier = 'adamantite';
          weaponSpec.boostStars = 5;
          weaponSpec.boostMult = 1.90;
        } else {
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
          charData.attributes = { ...charData.attributes };
          charData.attributes.physicalDamage = Math.round((charData.attributes?.physicalDamage || 22) * 1.15);
          maxHp = Math.round((charData.attributes?.maxHealth || 110) * 1.35);
          charName = `Warlord ${bossNames[pickIdx]}`;
        }
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
        charName = `Juggernaut ${tankNames[pickIdx]}`;
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
        charName = `Hexer ${hexerNames[pickIdx]}`;
      } else {
        // Slot 3: Agile Sniper - Nightshade Deadeye
        // 50/50 seeded choice between 'bow' ('Nightshade Longbow') and 'rifle' ('Night Sniper'), defaulting on even seeds to 'bow'
        isBoss = false;
        rank = 'DEADEYE';
        archetypeTitle = 'Nightshade Deadeye';
        paletteId = 'crimson_deadeye';
        scale = 0.94;
        const isEnemyBow = (normalizedBase % 2 === 0) || (unitSeed % 2 === 0);
        className = isEnemyBow ? 'Archer' : 'Fusilier';
        weaponSpec = mapToolToWeaponSpec(
          isEnemyBow ? { name: 'Nightshade Longbow', type: 'bow' } : { name: 'Night Sniper', type: 'rifle' },
          className
        );
        // High SPD, accuracy, and dodge
        charData.attributes = { ...charData.attributes };
        charData.attributes.walkSpeed = parseFloat(((charData.attributes?.walkSpeed || 1.1) * 1.20).toFixed(2));
        charData.attributes.accuracy = Math.round((charData.attributes?.accuracy || 80) * 1.15) + 5;
        charData.attributes.dodge = Math.round((charData.attributes?.dodge || 15) * 1.30) + 5;
        maxHp = Math.round(charData.attributes?.maxHealth || 92);
        charName = 'Deadeye Vane';
      }
    }

    // Assign every unit's weapon an Elemental Prefix (elementalPrefix & statusProc)
    const ELEMENTAL_PROCS = [
      { prefix: 'Boreal', statusProc: 'frozen' },
      { prefix: 'Astral', statusProc: 'sleeping' },
      { prefix: 'Chaotic', statusProc: 'confused' },
      { prefix: 'Celestial', statusProc: 'floating' },
      { prefix: 'Fiery', statusProc: 'burning' }
    ];

    if (!weaponSpec.elementalPrefix) {
      const elem = ELEMENTAL_PROCS[(unitSeed + i) % ELEMENTAL_PROCS.length];
      weaponSpec.elementalPrefix = elem.prefix;
      weaponSpec.statusProc = elem.statusProc;
    }

    const elementalPrefix = weaponSpec.elementalPrefix;
    const statusProc = weaponSpec.statusProc;
    let initialStatus = null;
    let isFloating = false;

    if (elementalPrefix === 'Celestial' || statusProc === 'floating') {
      initialStatus = 'floating';
      isFloating = true;
    }

    const isRaidBoss = !!(slot === 0 && !isBlue && options && options.raidBossMode);
    const unitGrade = isRaidBoss ? 'S' : (charData.tierGrade || 'C');
    const fullEquipment = generateFullEquipment(unitSeed, className, weaponSpec, unitGrade);
    normalizeEquipment(fullEquipment, unitSeed, className, weaponSpec, unitGrade);
    if (isRaidBoss) {
      fullEquipment.tool.finishTier = 'adamantite';
      fullEquipment.tool.boostStars = 5;
      fullEquipment.tool.tier = 'S';
      fullEquipment.tool.grade = 'S';
      fullEquipment.tool.tierGrade = 'S';
      fullEquipment.tool.boostMult = 1.90;
      fullEquipment.tool.material = 'adamantite';
      fullEquipment.chest.material = 'adamantite';
    }

    const hp = maxHp;
    const speed = Math.round((charData.attributes?.walkSpeed || 1.0) * 10) + (isBoss ? 7 : 6);
    const moveRange = 3 + (charData.attributes?.walkSpeed > 1.25 ? 1 : 0);

    const canTeleport = !!(
      /mesmer|scholar/i.test(className) ||
      rank === 'HEXER' ||
      paletteId === 'azure_mage' ||
      paletteId === 'crimson_hexer' ||
      (isBlue && slot === 1) ||
      (!isBlue && slot === 2)
    );

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
      passive: CLASS_PASSIVES[className] || CLASS_PASSIVES['Knight'],
      isBoss,
      isRaidBoss,
      rank,
      archetypeTitle,
      paletteId,
      scale,
      grade: unitGrade,
      tier: unitGrade,
      tierGrade: unitGrade,
      finishTier: isRaidBoss ? 'adamantite' : 'bronze',
      boostStars: isRaidBoss ? 5 : 0,
      hp,
      maxHp,
      mp: 40,
      maxMp: 40,
      speed,
      moveRange,
      move: 4,
      jump: 2,
      jumpHeight: 2,
      canTeleport,
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
      elementalPrefix,
      statusProc,
      prefix: elementalPrefix,
      status: initialStatus,
      isFloating,
      stats: charData.attributes || {},
      _baseMaxHp: maxHp,
      _baseMaxMp: 40,
      _baseMoveRange: moveRange,
      _baseMove: 4,
      _baseJump: 2,
      _baseSpeed: speed,
      _baseStats: { ...(charData.attributes || {}) },
      equipment: fullEquipment,
      yellowCards: 0,
      redCards: 0,
      provenance: {
        endpoint: '/api/roll/character',
        seed: unitSeed,
        className,
        rolledAt: Date.now(),
        slotCount: 8
      },
      rawCharacter: charData
    };

    recalculateEquipmentStats(unit);
    units.push(unit);
  }

  return {
    baseSeed: normalizedBase,
    units,
    contentVersion: 'setworld-anima-v1'
  };
}

/**
 * Multi-Floor Set.world Tower Gauntlet metadata (Floors 1..5).
 */
export const GAUNTLET_FLOORS = [
  { floor: 1, name: 'Floor 1: Outer Causeway Skirmish', enemyCount: 4, statMult: 1.0, desc: '4 enemies, 1.0x stats' },
  { floor: 2, name: 'Floor 2: Floodgate Garrison', enemyCount: 4, statMult: 1.15, desc: '4 enemies, 1.15x stats' },
  { floor: 3, name: 'Floor 3: Mythril Forge Sentinels', enemyCount: 5, statMult: 1.3, desc: '5 enemies with guaranteed Mythril/Star-Metal Resonance, 1.3x stats' },
  { floor: 4, name: 'Floor 4: Imperial High Guard', enemyCount: 5, statMult: 1.45, desc: '5 elite enemies, 1.45x stats' },
  { floor: 5, name: 'Floor 5: Sovereign Sanctum (Raid Boss)', enemyCount: 3, statMult: 1.6, desc: 'Spawns the 250× Set.world Raid Boss Sovereign via rollRaidBoss(seed) + 2 Royal Guard escorts!' }
];

/**
 * Rolls the 250× Set.world Raid Boss Sovereign unit with Adamantite Katana,
 * Grade S gear, 5 boost stars, and Sovereign Cataclysm skill.
 */
export function rollRaidBoss(seed, board = null, pos = { x: 8, z: 7 }) {
  const normalizedSeed = (seed >>> 0);
  const charData = generateFallbackCharacter(normalizedSeed);
  const className = 'Samurai';
  const weaponSpec = mapToolToWeaponSpec({ name: 'Adamantite Blood Katana', type: 'katana' }, className);
  const sovereignCataclysm = {
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
  };
  weaponSpec.abilities.unshift(sovereignCataclysm);
  weaponSpec.elementalPrefix = 'Boreal';
  weaponSpec.statusProc = 'frozen';
  weaponSpec.finishTier = 'adamantite';
  weaponSpec.boostStars = 5;
  weaponSpec.boostMult = 1.90;

  const fullEquipment = generateFullEquipment(normalizedSeed, className, weaponSpec, 'S');
  fullEquipment.tool.finishTier = 'adamantite';
  fullEquipment.tool.boostStars = 5;
  fullEquipment.tool.tier = 'S';
  fullEquipment.tool.grade = 'S';
  fullEquipment.tool.tierGrade = 'S';
  fullEquipment.tool.boostMult = 1.90;
  fullEquipment.tool.material = 'adamantite';
  fullEquipment.chest.material = 'adamantite';

  const baseHp = charData.attributes?.maxHealth || 110;
  const maxHp = Math.round(baseHp * 2.5);
  const elevation = getTileElevation(board, pos.x, pos.z);

  const boss = {
    id: 'boss_sovereign',
    unitId: 'boss_sovereign',
    seed: normalizedSeed,
    name: 'Sovereign Malakor [250x RAID BOSS]',
    team: 'crimson',
    clan: 'crimson',
    clanName: 'Crimson Order',
    className,
    job: className,
    class: className,
    isBoss: true,
    isRaidBoss: true,
    rank: 'COMMANDER',
    archetypeTitle: '250x Raid Overlord',
    paletteId: 'crimson_warlord',
    scale: 1.45,
    grade: 'S',
    tier: 'S',
    tierGrade: 'S',
    finishTier: 'adamantite',
    boostStars: 5,
    hp: maxHp,
    maxHp,
    mp: 100,
    maxMp: 100,
    speed: 22,
    moveRange: 4,
    move: 4,
    jump: 2,
    jumpHeight: 2,
    gridX: pos.x,
    gridZ: pos.z,
    x: pos.x,
    z: pos.z,
    elevation,
    facing: 'NW',
    ct: 30,
    alive: true,
    weapon: weaponSpec,
    weaponType: weaponSpec.weaponType,
    weaponModel: weaponSpec.heldModelName,
    abilities: weaponSpec.abilities,
    equipment: fullEquipment,
    passive: CLASS_PASSIVES['Samurai'],
    stats: {
      physicalDamage: Math.round((charData.attributes?.physicalDamage || 25) * 1.5),
      magicDamage: Math.round((charData.attributes?.magicDamage || 20) * 1.3),
      armor: Math.round((charData.attributes?.armor || 12) * 1.6),
      accuracy: 95,
      dodge: 25
    },
    provenance: {
      endpoint: '/api/roll/character',
      seed: normalizedSeed,
      className,
      rolledAt: Date.now(),
      slotCount: 8
    }
  };

  normalizeEquipment(boss.equipment, normalizedSeed, className, weaponSpec, 'S');
  recalculateEquipmentStats(boss);
  return boss;
}

/**
 * Rolls enemies for a specific floor in the Multi-Floor Set.world Tower Gauntlet.
 */
export function rollGauntletFloorEnemies(seed, floor = 1, board = null) {
  const normalizedSeed = (seed >>> 0);
  const floorMeta = GAUNTLET_FLOORS.find((f) => f.floor === floor) || GAUNTLET_FLOORS[0];
  const statMult = floorMeta.statMult || 1.0;

  const candidatePositions = [
    { x: 8, z: 7 }, { x: 7, z: 8 }, { x: 7, z: 6 },
    { x: 6, z: 7 }, { x: 8, z: 8 }, { x: 9, z: 7 }, { x: 9, z: 8 }
  ];

  const pickedPositions = [];
  for (const pos of candidatePositions) {
    if (pickedPositions.length >= (floorMeta.enemyCount || 4)) break;
    if (isWalkableNonWater(board, pos.x, pos.z)) {
      pickedPositions.push(pos);
    }
  }
  while (pickedPositions.length < (floorMeta.enemyCount || 4)) {
    pickedPositions.push({ x: 9 - pickedPositions.length, z: 8 });
  }

  const enemies = [];

  if (floor === 5) {
    // Floor 5: Sovereign Sanctum (Raid Boss) + 2 Royal Guards
    const boss = rollRaidBoss(deriveSeed(normalizedSeed, 501), board, pickedPositions[0]);
    enemies.push(boss);

    const guardClasses = ['Dreadnought', 'Paladin'];
    for (let i = 0; i < 2; i++) {
      const gSeed = deriveSeed(normalizedSeed, 502 + i);
      const gClass = guardClasses[i];
      const gPos = pickedPositions[i + 1] || { x: 7 + i, z: 8 };
      const gChar = generateFallbackCharacter(gSeed);
      const gWeapon = mapToolToWeaponSpec(
        gClass === 'Dreadnought' ? { name: 'Titanium Bulwark', type: 'shield' } : { name: 'Adamantite Holy Sword', type: 'sword' },
        gClass
      );
      const gElev = getTileElevation(board, gPos.x, gPos.z);
      const gGrade = 'A';
      const gEq = generateFullEquipment(gSeed, gClass, gWeapon, gGrade);
      normalizeEquipment(gEq, gSeed, gClass, gWeapon, gGrade);

      const guard = {
        id: `royal_guard_${i + 1}`,
        unitId: `royal_guard_${i + 1}`,
        seed: gSeed,
        name: `Royal Guard ${gClass} ${i + 1}`,
        team: 'crimson',
        clan: 'crimson',
        clanName: 'Crimson Order',
        className: gClass,
        job: gClass,
        class: gClass,
        isBoss: false,
        rank: 'VANGUARD',
        archetypeTitle: 'Royal Guard',
        paletteId: 'crimson_vanguard',
        scale: 1.12,
        grade: gGrade,
        tier: gGrade,
        tierGrade: gGrade,
        finishTier: 'mythril',
        boostStars: 3,
        hp: Math.round((gChar.attributes?.maxHealth || 100) * statMult),
        maxHp: Math.round((gChar.attributes?.maxHealth || 100) * statMult),
        mp: 40,
        maxMp: 40,
        speed: 18,
        moveRange: 3,
        move: 4,
        jump: 2,
        jumpHeight: 2,
        gridX: gPos.x,
        gridZ: gPos.z,
        x: gPos.x,
        z: gPos.z,
        elevation: gElev,
        facing: 'NW',
        ct: 20 + i * 5,
        alive: true,
        weapon: gWeapon,
        weaponType: gWeapon.weaponType,
        weaponModel: gWeapon.heldModelName,
        abilities: gWeapon.abilities,
        equipment: gEq,
        passive: CLASS_PASSIVES[gClass],
        stats: {
          physicalDamage: Math.round((gChar.attributes?.physicalDamage || 20) * statMult),
          magicDamage: Math.round((gChar.attributes?.magicDamage || 16) * statMult),
          armor: Math.round((gChar.attributes?.armor || 12) * statMult),
          accuracy: 85,
          dodge: 15
        },
        provenance: {
          endpoint: '/api/roll/character',
          seed: gSeed,
          className: gClass,
          rolledAt: Date.now(),
          slotCount: 8
        }
      };
      recalculateEquipmentStats(guard);
      enemies.push(guard);
    }
  } else {
    const classPool = [
      'Dragoon', 'Samurai', 'Fusilier', 'Archer', 'Mesmer',
      'Herald', 'Paladin', 'Berserker', 'Land Reaver', 'Dreadnought', 'Scholar'
    ];

    for (let i = 0; i < floorMeta.enemyCount; i++) {
      const eSeed = deriveSeed(normalizedSeed, (floor * 100) + i);
      const eClass = classPool[(eSeed + i) % classPool.length];
      const ePos = pickedPositions[i] || { x: 8, z: 7 };
      const eChar = generateFallbackCharacter(eSeed);
      const eElev = getTileElevation(board, ePos.x, ePos.z);
      const eGrade = floor >= 4 ? 'A' : (floor >= 3 ? 'B' : (eChar.tierGrade || 'C'));
      const eWeapon = mapToolToWeaponSpec(eChar.equipment?.tool, eClass);
      const eEq = generateFullEquipment(eSeed, eClass, eWeapon, eGrade);

      if (floor === 3) {
        // Floor 3: Mythril Forge Sentinels guaranteed Mythril/Star-Metal Resonance
        eEq.tool.material = 'mythril';
        eEq.head.material = 'mythril';
        eEq.chest.material = 'star-metal';
        eEq.legs.material = 'star-metal';
      }

      normalizeEquipment(eEq, eSeed, eClass, eWeapon, eGrade);

      const baseHp = Math.round((eChar.attributes?.maxHealth || 95) * statMult);
      const enemy = {
        id: `gauntlet_f${floor}_e${i + 1}`,
        unitId: `gauntlet_f${floor}_e${i + 1}`,
        seed: eSeed,
        name: `${eClass} Sentinel ${i + 1}`,
        team: 'crimson',
        clan: 'crimson',
        clanName: 'Crimson Order',
        className: eClass,
        job: eClass,
        class: eClass,
        isBoss: (i === 0 && floor >= 4),
        rank: (i === 0 && floor >= 4) ? 'COMMANDER' : 'SOLDIER',
        archetypeTitle: `${floorMeta.name} Combatant`,
        paletteId: 'crimson_warlord',
        scale: (i === 0 && floor >= 4) ? 1.15 : 1.0,
        grade: eGrade,
        tier: eGrade,
        tierGrade: eGrade,
        finishTier: floor >= 3 ? 'iron' : 'bronze',
        boostStars: floor >= 4 ? 2 : (floor >= 3 ? 1 : 0),
        hp: baseHp,
        maxHp: baseHp,
        mp: 40,
        maxMp: 40,
        speed: Math.round((eChar.attributes?.walkSpeed || 1.0) * 10) + 6,
        moveRange: 3 + ((eChar.attributes?.walkSpeed || 1.0) > 1.25 ? 1 : 0),
        move: 4,
        jump: 2,
        jumpHeight: 2,
        gridX: ePos.x,
        gridZ: ePos.z,
        x: ePos.x,
        z: ePos.z,
        elevation: eElev,
        facing: 'NW',
        ct: 15 + i * 5,
        alive: true,
        weapon: eWeapon,
        weaponType: eWeapon.weaponType,
        weaponModel: eWeapon.heldModelName,
        abilities: eWeapon.abilities,
        equipment: eEq,
        passive: CLASS_PASSIVES[eClass] || CLASS_PASSIVES['Knight'],
        stats: {
          physicalDamage: Math.round((eChar.attributes?.physicalDamage || 18) * statMult),
          magicDamage: Math.round((eChar.attributes?.magicDamage || 16) * statMult),
          armor: Math.round((eChar.attributes?.armor || 8) * statMult),
          accuracy: Math.round((eChar.attributes?.accuracy || 75) * (1 + (statMult - 1) * 0.2)),
          dodge: Math.round((eChar.attributes?.dodge || 10) * (1 + (statMult - 1) * 0.2))
        },
        provenance: {
          endpoint: '/api/roll/character',
          seed: eSeed,
          className: eClass,
          rolledAt: Date.now(),
          slotCount: 8
        }
      };
      recalculateEquipmentStats(enemy);
      enemies.push(enemy);
    }
  }

  // Support both array usage and object destructuring { floor, name, enemies, statMult }
  enemies.enemies = enemies;
  enemies.floor = floor;
  enemies.name = floorMeta.name;
  enemies.statMult = statMult;
  enemies.meta = floorMeta;
  return enemies;
}
