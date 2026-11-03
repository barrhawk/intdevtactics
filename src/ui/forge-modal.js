/**
 * INTDEV TACTICS — Clan Forge & Set.world Armory Modal
 * 3d.internet.dev × set.world
 * 
 * Orb Lottery Forge (/api/craft?orbs=N), 8-Slot Clan Armory Inventory,
 * Salvaging (/api/salvage), Item Boosting (★+1..+5),
 * Signature Class Passives, Set Resonance Badges,
 * Per-Unit Seed Customizer & Provenance JSON Inspector Drawer.
 */

import * as SetWorldClient from '../game/setworld-client.js';
import * as CombatRules from '../game/combat-rules.js';

export const EQUIPMENT_SLOTS = SetWorldClient.EQUIPMENT_SLOTS || [
  'tool',
  'offhand',
  'head',
  'chest',
  'legs',
  'feet',
  'neck',
  'finger'
];

export const FALLBACK_CLASS_PASSIVES = {
  Paladin: { name: '⚔️ Shirahadori', desc: 'Blade Catch: 25% chance to deflect melee and counter-attack' },
  Knight: { name: '🛡️ Iron Bulwark', desc: '+20 DEF, 15% physical damage reduction' },
  Warrior: { name: '🛡️ Iron Bulwark', desc: '+20 DEF, 15% physical damage reduction' },
  Sniper: { name: '🎯 Eagle Eye', desc: '+25% Hit, +15% Crit when on elevated ground' },
  Archer: { name: '🎯 Eagle Eye', desc: '+25% Hit, +15% Crit when on elevated ground' },
  Ranger: { name: '🎯 Eagle Eye', desc: '+25% Hit, +15% Crit when on elevated ground' },
  'Arcane Mage': { name: '🔮 Blood Magic', desc: '+25% Magic DMG, 10% MP cost refunded on kill' },
  'Black Mage': { name: '🔮 Blood Magic', desc: '+25% Magic DMG, 10% MP cost refunded on kill' },
  Hexer: { name: '🔮 Blood Magic', desc: '+25% Magic DMG, 10% MP cost refunded on kill' },
  'White Mage': { name: "🕊️ Saint's Grace", desc: '+30% Healing power, Auto-Regen' },
  Cleric: { name: "🕊️ Saint's Grace", desc: '+30% Healing power, Auto-Regen' },
  Trickster: { name: '🩸 Blood Frenzy', desc: '+20% SPD, +30% Crit on backstabs' },
  Thief: { name: '🩸 Blood Frenzy', desc: '+20% SPD, +30% Crit on backstabs' },
  Ninja: { name: '🩸 Blood Frenzy', desc: '+20% SPD, +30% Crit on backstabs' },
  Samurai: { name: '⚔️ Shirahadori', desc: 'Master Counter: Deflects melee strikes and ripostes with 100% ATK' },
  Bard: { name: '🎺 Tactical Cadence', desc: 'Boosts adjacent allies CT by +10 each turn' },
  Dancer: { name: '💃 Alluring Mist', desc: 'Reduces adjacent enemy CT and dodge' },
  Orator: { name: '🗣️ Silver Tongue', desc: '+35% Talk skill recruit and surrender chance' },
  Mediator: { name: '🗣️ Silver Tongue', desc: '+35% Talk skill recruit and surrender chance' },
  Dragoon: { name: '🐉 Dragon Scale', desc: '+20% Jump height, immune to knockback' },
  Monk: { name: '🥊 Brawler Spirit', desc: '+25% Pummel combo trigger rate and unarmed damage' },
  Warlord: { name: '☠️ Blood Tyrant', desc: 'Sovereign Presence: +30% ATK and intimidates adjacent enemies' },
  Vanguard: { name: '🛡️ Juggernaut Plating', desc: '+35 DEF, immune to ballistic knockback' },
  Deadeye: { name: '🎯 Deathmark', desc: '+30% Crit Rate and ignores 25% target defense' }
};

export function getUnitPassive(unit) {
  if (unit?.passive) {
    if (typeof unit.passive === 'string') return { name: unit.passive, desc: 'Signature Class Passive' };
    return unit.passive;
  }
  const job = unit?.job || unit?.className || unit?.class || 'Knight';
  const passives = CombatRules.CLASS_PASSIVES || FALLBACK_CLASS_PASSIVES;
  return passives[job] || FALLBACK_CLASS_PASSIVES[job] || { name: '⚔️ Combat Focus', desc: '+10% All Combat Attributes' };
}

/**
 * Computes active 2pc/4pc/6pc Set.world resonances from unit's equipped gear
 */
export function computeSetWorldResonance(unit) {
  if (typeof SetWorldClient.computeSetWorldResonance === 'function') {
    try {
      return SetWorldClient.computeSetWorldResonance(unit);
    } catch (_) {}
  }

  const eq = unit?.equipment || {};
  const items = Object.values(eq).filter(Boolean);
  if (items.length === 0) return [];

  const matCounts = {};
  const prefixCounts = {};

  for (const item of items) {
    const mat = item.material || (item.name ? item.name.split(' ')[0] : 'Mythril');
    const prefix = item.elementalPrefix || item.prefix;
    if (mat) matCounts[mat] = (matCounts[mat] || 0) + 1;
    if (prefix) prefixCounts[prefix] = (prefixCounts[prefix] || 0) + 1;
  }

  const badges = [];

  // Material set resonance
  for (const [mat, count] of Object.entries(matCounts)) {
    if (count >= 4) {
      badges.push({
        name: `👑 ${mat} Sovereign (4pc)`,
        desc: `+30 DEF, +20 SPD, +25% CT Speed, Auto-Float`,
        count,
        tier: 4
      });
    } else if (count >= 2) {
      badges.push({
        name: `✨ ${mat} Resonance (2pc)`,
        desc: `+15 DEF, +10 SPD, Auto-Float`,
        count,
        tier: 2
      });
    }
  }

  // Prefix elemental alignment
  for (const [prefix, count] of Object.entries(prefixCounts)) {
    if (count >= 2) {
      badges.push({
        name: `🌟 [${prefix.toUpperCase()}] Resonance (2pc)`,
        desc: `+20 ${prefix === 'Astral' ? 'INT' : prefix === 'Boreal' ? 'AGI' : 'STR'}, Elemental Mastery`,
        count,
        tier: 2
      });
    }
  }

  return badges;
}

/**
 * Re-roll unit with custom seed
 */
export function rerollSingleUnitWithSeed(unit, customSeedStr) {
  if (typeof SetWorldClient.rerollSingleUnitWithSeed === 'function') {
    try {
      return SetWorldClient.rerollSingleUnitWithSeed(unit, customSeedStr);
    } catch (_) {}
  }

  // Deterministic local re-roll fallback
  let hash = 0;
  for (let i = 0; i < customSeedStr.length; i++) {
    hash = ((hash << 5) - hash + customSeedStr.charCodeAt(i)) | 0;
  }
  const h = Math.abs(hash);

  const jobs = ['Paladin', 'Knight', 'Sniper', 'Arcane Mage', 'Trickster', 'Samurai', 'Bard', 'Dragoon'];
  const grades = ['S', 'A', 'B', 'A'];
  const newJob = jobs[h % jobs.length];
  const newGrade = grades[h % grades.length];
  const basePwr = newGrade === 'S' ? 880 : newGrade === 'A' ? 790 : 690;

  unit.seed = customSeedStr;
  unit.job = newJob;
  unit.className = newJob;
  unit.grade = newGrade;
  unit.powerRating = basePwr + (h % 50);

  unit.stats = {
    STR: 25 + (h % 30),
    DEX: 25 + ((h >> 2) % 30),
    INT: 25 + ((h >> 4) % 30),
    AGI: 25 + ((h >> 6) % 30),
    VIT: 25 + ((h >> 8) % 30),
    WIS: 20 + ((h >> 10) % 25),
    WIL: 20 + ((h >> 12) % 25),
    LUK: 20 + ((h >> 14) % 25),
    DEF: 20 + ((h >> 16) % 25),
  };

  unit.passive = getUnitPassive(unit);
  unit.equipment = unit.equipment || {};

  return unit;
}

/**
 * Normalize an item to one of the 8 paperdoll slots:
 * 'tool', 'offhand', 'head', 'chest', 'legs', 'feet', 'neck', 'finger'
 */
export function normalizeSlot(item) {
  if (!item) return 'tool';
  if (item.equippedSlot) {
    const s = String(item.equippedSlot).toLowerCase();
    if (EQUIPMENT_SLOTS.includes(s)) return s;
  }
  const raw = String(item.slot || item.rawItem?.slot || item.type || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();

  if (raw === 'tool' || raw === 'weapon') return 'tool';
  if (raw === 'offhand' || raw === 'shield') return 'offhand';
  if (raw === 'head' || raw === 'helm' || raw === 'helmet') return 'head';
  if (raw === 'chest' || raw === 'armor' || raw === 'cuirass') return 'chest';
  if (raw === 'legs' || raw === 'greaves' || raw === 'leggings') return 'legs';
  if (raw === 'feet' || raw === 'boots' || raw === 'shoes' || raw === 'sabatons') return 'feet';
  if (raw === 'neck' || raw === 'amulet' || raw === 'pendant' || raw === 'necklace') return 'neck';
  if (raw === 'finger' || raw === 'ring' || raw === 'band') return 'finger';

  // Keyword detection
  if (name.includes('boot') || name.includes('sabat') || name.includes('shoe') || name.includes('tread') || name.includes('slipper') || name.includes('footwear')) {
    return 'feet';
  }
  if (name.includes('neck') || name.includes('amulet') || name.includes('pendant') || name.includes('collar') || name.includes('choker') || name.includes('locket') || name.includes('necklace') || name.includes('torc')) {
    return 'neck';
  }
  if (name.includes('ring') || name.includes('band') || name.includes('signet') || name.includes('finger') || name.includes('loop')) {
    return 'finger';
  }
  if (name.includes('greave') || name.includes('legging') || name.includes('trousers') || name.includes('pants') || name.includes('legs')) {
    return 'legs';
  }
  if (name.includes('helm') || name.includes('visor') || name.includes('crown') || name.includes('hood') || name.includes('hat') || name.includes('cap') || name.includes('circlet') || name.includes('head')) {
    return 'head';
  }
  if (name.includes('shield') || name.includes('aegis') || name.includes('buckler') || name.includes('parry') || name.includes('pavise') || name.includes('offhand')) {
    return 'offhand';
  }
  if (name.includes('cuirass') || name.includes('mail') || name.includes('armor') || name.includes('robe') || name.includes('vest') || name.includes('tunic') || name.includes('brigandine') || name.includes('garb') || name.includes('plate') || name.includes('chest') || name.includes('hauberk')) {
    return 'chest';
  }
  if (name.includes('sword') || name.includes('bow') || name.includes('rod') || name.includes('dirk') || name.includes('blade') || name.includes('staff') || name.includes('scepter') || name.includes('spear') || name.includes('axe') || name.includes('dagger') || name.includes('katana') || name.includes('gun') || name.includes('rifle') || name.includes('harp') || name.includes('tome')) {
    return 'tool';
  }

  return 'tool';
}

export class ForgeModal {
  /**
   * @param {HTMLElement} containerEl - Parent container or body to mount modal
   * @param {Object} callbacks
   * @param {(orbs: number) => any} [callbacks.onCraftItem]
   * @param {(itemIndex: number, orbsRefunded?: number) => void} [callbacks.onSalvageItem]
   * @param {(itemIndex: number, unitId: string, slot?: string) => void} [callbacks.onEquipItem]
   * @param {(itemIndex: number) => void} [callbacks.onBoostItem]
   * @param {(unit: any, customSeed: string) => void} [callbacks.onRerollUnit]
   * @param {() => void} [callbacks.onClose]
   */
  constructor(containerEl = document.body, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks;

    this.activeTab = 'lottery'; // 'lottery' | 'armory' | 'roster'
    this.modalEl = null;
    this._isOpen = false;

    // Track provenance drawer open states
    this.openProvenanceUnitIds = new Set();
    this.openProvenanceItemIds = new Set();

    // Default Clan & State
    this.state = {
      orbs: 450,
      inventory: [
        {
          id: 'item-init-1',
          name: 'Mythril Broadsword',
          type: 'weapon',
          grade: 'B',
          orbValue: 125,
          material: 'Mythril Steel',
          statsBonus: '+12 STR, +4 VIT',
          equippedTo: 'unit-1',
          equippedSlot: 'tool',
        },
        {
          id: 'item-init-2',
          name: 'Composite Longbow',
          type: 'weapon',
          grade: 'B',
          orbValue: 125,
          material: 'Ironwood & Mythril',
          statsBonus: '+14 DEX, +6 AGI',
          equippedTo: 'unit-2',
          equippedSlot: 'tool',
        },
        {
          id: 'item-init-3',
          name: 'Arcane Focus Rod',
          type: 'weapon',
          grade: 'A',
          orbValue: 625,
          material: 'Starlight Crystal',
          statsBonus: '+22 INT, +10 WIS',
          equippedTo: 'unit-3',
          equippedSlot: 'tool',
        },
        {
          id: 'item-init-4',
          name: 'Obsidian Dirk',
          type: 'weapon',
          grade: 'C',
          orbValue: 25,
          material: 'Obsidian Glass',
          statsBonus: '+6 DEX, +4 LUK',
          equippedTo: 'unit-4',
          equippedSlot: 'tool',
        },
        {
          id: 'item-init-5',
          name: 'Tower Aegis Shield',
          type: 'armor',
          grade: 'B',
          orbValue: 125,
          material: 'Tempered Mythril',
          statsBonus: '+18 DEF, +8 VIT',
          equippedTo: 'unit-1',
          equippedSlot: 'offhand',
        },
        {
          id: 'item-init-6',
          name: 'Starlight Sabatons',
          type: 'armor',
          grade: 'A',
          orbValue: 250,
          material: 'Starlight Silver',
          statsBonus: '+8 DEF, +12 SPD',
          equippedTo: 'unit-1',
          equippedSlot: 'feet',
        },
        {
          id: 'item-init-7',
          name: 'Amulet of Kings',
          type: 'accessory',
          grade: 'S',
          orbValue: 625,
          material: 'Adamantine',
          statsBonus: '+15 WIL, +10 WIS',
          equippedTo: 'unit-1',
          equippedSlot: 'neck',
        },
      ],
      clanUnits: [
        {
          id: 'unit-1',
          name: 'Aveline Stalwart',
          job: 'Paladin',
          grade: 'S',
          powerRating: 880,
          stats: { STR: 46, DEX: 28, INT: 20, AGI: 26, VIT: 48, WIS: 24, WIL: 32, LUK: 18, DEF: 44 },
          passive: FALLBACK_CLASS_PASSIVES.Paladin,
          traits: ['Holy Aegis', 'Heavy Armor Master', 'Unwavering Resolve'],
          equippedTool: 'Mythril Broadsword (✦ 125 Orbs)',
          equippedArmor: "Knight's Mythril Mail",
          seed: 'aveline-stalwart-0x1a',
        },
        {
          id: 'unit-2',
          name: 'Caelen Hawkeye',
          job: 'Sniper',
          grade: 'A',
          powerRating: 790,
          stats: { STR: 28, DEX: 52, INT: 22, AGI: 46, VIT: 26, WIS: 28, WIL: 24, LUK: 38, DEF: 22 },
          passive: FALLBACK_CLASS_PASSIVES.Sniper,
          traits: ['Eagle Eye', 'Critical Precision', 'High-Ground Stance'],
          equippedTool: 'Composite Longbow (✦ 125 Orbs)',
          equippedArmor: 'Leather Brigandine',
          seed: 'caelen-hawkeye-0x2b',
        },
        {
          id: 'unit-3',
          name: 'Lyra Stardancer',
          job: 'Arcane Mage',
          grade: 'A',
          powerRating: 820,
          stats: { STR: 18, DEX: 30, INT: 54, AGI: 36, VIT: 24, WIS: 48, WIL: 40, LUK: 26, DEF: 18 },
          passive: FALLBACK_CLASS_PASSIVES['Arcane Mage'],
          traits: ['Spell Weaving', 'Mana Overflow', 'Mystic Ward'],
          equippedTool: 'Arcane Focus Rod (✦ 625 Orbs)',
          equippedArmor: 'Silk Robes of Focus',
          seed: 'lyra-stardancer-0x3c',
        },
        {
          id: 'unit-4',
          name: 'Garrick Shadowstep',
          job: 'Trickster',
          grade: 'B',
          powerRating: 690,
          stats: { STR: 34, DEX: 42, INT: 24, AGI: 50, VIT: 30, WIS: 20, WIL: 22, LUK: 42, DEF: 24 },
          passive: FALLBACK_CLASS_PASSIVES.Trickster,
          traits: ['Backstab Specialty', 'Fleet Footed', 'Shadow Camouflage'],
          equippedTool: 'Obsidian Dirk (✦ 25 Orbs)',
          equippedArmor: 'Nightshade Garb',
          seed: 'garrick-shadow-0x4d',
        },
      ],
      latestReceipt: null,
    };

    this._onKeyDown = (e) => {
      if (this._isOpen && e.key === 'Escape') {
        this.close();
      }
    };
  }

  open(initialState = {}) {
    this.updateState(initialState);
    this._isOpen = true;

    if (!this.modalEl) {
      this._buildDOM();
    } else {
      this.modalEl.style.display = 'flex';
      this._renderActiveTab();
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

  updateState(partialState = {}) {
    if (partialState.orbs !== undefined) this.state.orbs = partialState.orbs;
    if (partialState.inventory) this.state.inventory = partialState.inventory;
    if (partialState.clanUnits) this.state.clanUnits = partialState.clanUnits;
    if (partialState.latestReceipt) this.state.latestReceipt = partialState.latestReceipt;

    if (this._isOpen && this.modalEl) {
      const orbsEl = this.modalEl.querySelector('#forge-modal-orbs');
      if (orbsEl) orbsEl.textContent = `✦ ${Number(this.state.orbs).toLocaleString()} ORBS`;
      this._renderActiveTab();
    }
  }

  /* ========================================================================
     DOM Construction
     ======================================================================== */

  _buildDOM() {
    const backdrop = document.createElement('div');
    backdrop.className = 'forge-modal-backdrop';

    backdrop.innerHTML = `
      <div class="forge-modal">
        <header class="forge-header">
          <div class="forge-header-brand">
            <span style="color: var(--text-gold); font-size: 16px;">✦</span>
            <span class="forge-header-title">SET.WORLD CLAN FORGE & 8-SLOT ARMORY</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="forge-header-orbs" id="forge-modal-orbs">
              ✦ ${Number(this.state.orbs).toLocaleString()} ORBS
            </div>
            <button class="hud-btn" id="forge-btn-close" style="padding: 4px 8px; font-weight: 800;">✕ ESC</button>
          </div>
        </header>

        <nav class="forge-nav-tabs">
          <button class="forge-tab-btn ${this.activeTab === 'lottery' ? 'active' : ''}" data-tab="lottery">
            ✦ [1] ORB LOTTERY FORGE
          </button>
          <button class="forge-tab-btn ${this.activeTab === 'armory' ? 'active' : ''}" data-tab="armory">
            ⚔️ [2] CLAN ARMORY (${this.state.inventory.length})
          </button>
          <button class="forge-tab-btn ${this.activeTab === 'roster' ? 'active' : ''}" data-tab="roster">
            🛡️ [3] CLAN ROSTER & 8-SLOT PAPERDOLL
          </button>
        </nav>

        <div class="forge-body" id="forge-tab-content"></div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    backdrop.querySelector('#forge-btn-close').addEventListener('click', () => this.close());

    backdrop.querySelectorAll('.forge-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.activeTab = tab;
        backdrop.querySelectorAll('.forge-tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this._renderActiveTab();
      });
    });

    this.container.appendChild(backdrop);
    this.modalEl = backdrop;
    this._renderActiveTab();
  }

  _renderActiveTab() {
    const content = this.modalEl.querySelector('#forge-tab-content');
    if (!content) return;
    content.innerHTML = '';

    if (this.activeTab === 'lottery') {
      this._renderLotteryTab(content);
    } else if (this.activeTab === 'armory') {
      this._renderArmoryTab(content);
    } else if (this.activeTab === 'roster') {
      this._renderRosterTab(content);
    }
  }

  /**
   * Tab 1: Orb Lottery Forge (/api/craft?orbs=N)
   */
  _renderLotteryTab(container) {
    const currentOrbs = this.state.orbs;

    const intro = document.createElement('div');
    intro.className = 'lottery-intro';
    intro.innerHTML = `
      Spend your harvested <strong>Set Orbs</strong> on the Set.world item synthesis lottery (<code>/api/craft?orbs=N</code>).
      Higher orb investments roll more candidate seeds (<code>rolls = ⌊√(orbs/2)⌋</code>) and skew candidate rolls toward mythril, adamantine, and sovereign Grade S gear across all 8 slots.
    `;
    container.appendChild(intro);

    const tiersGrid = document.createElement('div');
    tiersGrid.className = 'tier-buttons-grid';

    const tiers = [
      { id: 'novice', name: 'Novice Tier', cost: 25, grade: 'Tier D/C', icon: '🌱' },
      { id: 'adept', name: 'Adept Tier', cost: 125, grade: 'Tier C/B', icon: '⚔️' },
      { id: 'master', name: 'Master Tier', cost: 625, grade: 'Tier B/A', icon: '💎' },
      { id: 'ascendant', name: 'Ascendant', cost: 3125, grade: 'Tier A/S', icon: '👑' },
      { id: 'sovereign', name: 'Sovereign Cap', cost: 15625, grade: 'Grade S Cap', icon: '✦' },
    ];

    tiers.forEach((t) => {
      const canAfford = currentOrbs >= t.cost;
      const card = document.createElement('div');
      card.className = `forge-tier-card ${!canAfford ? 'disabled' : ''}`;
      card.innerHTML = `
        <span style="font-size: 18px;">${t.icon}</span>
        <span class="tier-cost">✦ ${t.cost.toLocaleString()}</span>
        <span class="tier-name">${t.name}</span>
        <span class="tier-range">${t.grade}</span>
      `;

      if (canAfford) {
        card.addEventListener('click', () => this._handleCraft(t.cost));
      }

      tiersGrid.appendChild(card);
    });

    container.appendChild(tiersGrid);

    const customRow = document.createElement('div');
    customRow.className = 'custom-forge-row';
    customRow.innerHTML = `
      <span style="font-size: 11px; font-weight: 700; color: var(--text-mythril);">CUSTOM ORB CRAFT:</span>
      <input type="number" class="custom-orb-input" id="input-custom-orbs" min="10" max="${currentOrbs}" value="${Math.min(50, currentOrbs)}" />
      <button class="hud-btn gold" id="btn-forge-custom">✦ FORGE ITEM</button>
      <span style="font-size: 10px; color: var(--text-muted); margin-left: auto;">
        Available Balance: <strong>✦ ${currentOrbs.toLocaleString()}</strong>
      </span>
    `;

    customRow.querySelector('#btn-forge-custom').addEventListener('click', () => {
      const input = customRow.querySelector('#input-custom-orbs');
      const val = parseInt(input.value, 10);
      if (val >= 10 && val <= currentOrbs) {
        this._handleCraft(val);
      } else {
        alert(`Please enter an orb amount between 10 and ${currentOrbs}.`);
      }
    });

    container.appendChild(customRow);

    if (this.state.latestReceipt) {
      this._renderReceiptCard(container, this.state.latestReceipt);
    }
  }

  _renderReceiptCard(container, receipt) {
    const card = document.createElement('div');
    card.className = 'craft-receipt-card';

    const grade = (receipt.tierGrade || 'B').toUpperCase();
    const item = receipt.item || {};
    const slot = normalizeSlot(item);

    card.innerHTML = `
      <div class="receipt-header">
        <span class="receipt-title">✦ LATEST SET.WORLD CRAFT RECEIPT</span>
        <span class="grade-badge grade-${grade.toLowerCase()}">GRADE ${grade}</span>
      </div>

      <div class="receipt-grid">
        <div>
          <div class="receipt-cell-label">Item Forged</div>
          <div class="receipt-cell-val" style="color: var(--azure);">${item.name || 'Mythril Artifact'}</div>
        </div>
        <div>
          <div class="receipt-cell-label">Assigned Slot</div>
          <div class="receipt-cell-val" style="color: var(--text-gold); font-weight: 800;">[${slot.toUpperCase()}]</div>
        </div>
        <div>
          <div class="receipt-cell-label">Candidate Rolls</div>
          <div class="receipt-cell-val">${receipt.candidateRolls || 5} drawn</div>
        </div>
        <div>
          <div class="receipt-cell-label">Material</div>
          <div class="receipt-cell-val">${receipt.material || item.material || 'Mythril Alloy'}</div>
        </div>
      </div>

      <div style="font-size: 11px; color: var(--text-mythril); background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 3px;">
        Bonuses: <strong>${item.statsBonus || '+12 STR, +5 VIT'}</strong> // Value: <strong>✦ ${receipt.orbValue || item.orbValue} Orbs</strong>
      </div>

      <div class="receipt-provenance">
        Provenance: <a href="${receipt.provenance || 'https://set.world'}" target="_blank" rel="noopener noreferrer">${receipt.provenance || 'https://set.world/craft'}</a>
      </div>
    `;

    container.appendChild(card);
  }

  async _handleCraft(orbs) {
    if (this.state.orbs < orbs) return;

    let externalResult = null;
    if (this.callbacks.onCraftItem) {
      externalResult = await this.callbacks.onCraftItem(orbs);
    }

    let forgedItem;
    let receipt;

    if (externalResult && externalResult.item) {
      forgedItem = externalResult.item;
      receipt = externalResult.receipt || {
        candidateRolls: Math.max(1, Math.floor(Math.sqrt(orbs / 2))),
        tierGrade: forgedItem.grade || 'C',
        score: forgedItem.rawItem?.score || 500,
        orbValue: orbs,
        material: forgedItem.material || 'Mythril Alloy',
        item: forgedItem,
        provenance: `https://set.world/craft?orbs=${orbs}`
      };

      if (externalResult.remainingOrbs !== undefined) {
        this.state.orbs = externalResult.remainingOrbs;
      } else {
        this.state.orbs = Math.max(0, this.state.orbs - orbs);
      }

      if (!this.state.inventory.some((i) => i.id === forgedItem.id)) {
        this.state.inventory.unshift(forgedItem);
      }
      this.state.latestReceipt = receipt;
    } else {
      const rollsCount = Math.max(1, Math.floor(Math.sqrt(orbs / 2)));
      let grade = 'C';
      let score = Math.round((Math.sqrt(orbs) * 12 + Math.random() * 40) * 10) / 10;

      if (orbs >= 15625 || score >= 900) grade = 'S';
      else if (orbs >= 3125 || score >= 750) grade = 'A';
      else if (orbs >= 625 || score >= 500) grade = 'B';
      else if (orbs >= 125 || score >= 300) grade = 'C';
      else grade = 'D';

      const materials = ['Mythril', 'Obsidian Glass', 'Adamantine', 'Dragon Scale', 'Starlight Silver', 'Dark Steel'];
      const material = materials[Math.floor(Math.random() * materials.length)];

      const slotsPool = ['tool', 'offhand', 'head', 'chest', 'legs', 'feet', 'neck', 'finger'];
      const targetSlot = slotsPool[Math.floor(Math.random() * slotsPool.length)];

      const itemNamesBySlot = {
        tool: [`${material} Broadsword`, `${material} Longbow`, `${material} Arcane Rod`, `${material} Dirk`],
        offhand: [`${material} Aegis Shield`, `${material} Buckler`, `${material} Ward Orb`],
        head: [`${material} Great Helm`, `${material} Circlet`, `${material} Visor`],
        chest: [`${material} Cuirass`, `${material} Robes`, `${material} Battle Plate`],
        legs: [`${material} Greaves`, `${material} Leggings`, `${material} Chausses`],
        feet: [`${material} Sabatons`, `${material} Treads`, `${material} Boots`],
        neck: [`${material} Amulet`, `${material} Talisman`, `${material} Choker`],
        finger: [`${material} Ring of Kings`, `${material} Signet`, `${material} Band`]
      };

      const possibleNames = itemNamesBySlot[targetSlot] || [`${material} Relic`];
      const itemName = possibleNames[Math.floor(Math.random() * possibleNames.length)];

      const bonusTypes = ['STR', 'DEX', 'INT', 'AGI', 'VIT', 'WIS'];
      const b1 = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
      const b2 = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
      const bonusMag = grade === 'S' ? 24 : grade === 'A' ? 16 : grade === 'B' ? 10 : grade === 'C' ? 6 : 3;
      const statsBonus = `+${bonusMag} ${b1}, +${Math.round(bonusMag * 0.6)} ${b2}`;

      const prefixes = ['Boreal', 'Astral', 'Chaotic', 'Celestial', 'Fiery'];
      const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

      forgedItem = {
        id: `item-${Date.now()}`,
        name: itemName,
        type: targetSlot,
        equippedSlot: targetSlot,
        grade: grade,
        orbValue: orbs,
        material: material,
        elementalPrefix: prefix,
        statsBonus: statsBonus,
        equippedTo: null,
      };

      receipt = {
        candidateRolls: rollsCount,
        tierGrade: grade,
        score: score,
        orbValue: orbs,
        material: material,
        item: forgedItem,
        provenance: `https://set.world/craft?orbs=${orbs}&seed=tactics-${Date.now()}`,
      };

      this.state.orbs -= orbs;
      this.state.inventory.unshift(forgedItem);
      this.state.latestReceipt = receipt;
    }

    const orbsEl = this.modalEl?.querySelector('#forge-modal-orbs');
    if (orbsEl) orbsEl.textContent = `✦ ${this.state.orbs.toLocaleString()} ORBS`;
    this._renderActiveTab();
  }

  /**
   * Tab 2: Clan Armory (Inventory & Salvage with all 8 slots)
   */
  _renderArmoryTab(container) {
    if (this.state.inventory.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          The Clan Armory is currently empty. Visit the <strong>Orb Lottery Forge</strong> to synthesize mythril and 8-slot set equipment!
        </div>
      `;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'armory-inventory-grid';

    this.state.inventory.forEach((item, index) => {
      const grade = (item.grade || 'B').toUpperCase();
      const targetSlot = normalizeSlot(item);
      const salvageYield = Math.max(1, Math.round((item.orbValue || 25) * 0.1));
      const stars = item.boostStars || item.stars || 0;
      const starsLabel = stars > 0 ? `★ +${stars}` : '★ Base';
      const prefixes = ['BOREAL', 'ASTRAL', 'CHAOTIC', 'CELESTIAL', 'FIERY'];
      const prefix = (item.elementalPrefix || item.prefix || prefixes[index % prefixes.length]).toUpperCase();
      const finishTier = item.finishTier || (stars >= 5 ? 'Adamantite' : stars >= 4 ? 'Gold' : stars >= 3 ? 'Mythril' : stars >= 2 ? 'Iron' : 'Mythril');

      const isProvOpen = this.openProvenanceItemIds.has(item.id || `item-${index}`);

      const slotIcons = {
        tool: '⚔️',
        offhand: '🛡️',
        head: '🪖',
        chest: '🥋',
        legs: '👖',
        feet: '👢',
        neck: '📿',
        finger: '💍'
      };
      const icon = slotIcons[targetSlot] || '⚔️';

      const card = document.createElement('div');
      card.className = 'inventory-item-card';

      card.innerHTML = `
        <div class="item-card-top">
          <div class="item-card-name">
            <span>${icon}</span>
            <span>${item.name}</span>
            <span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>
            <span class="item-stars-badge">${starsLabel}</span>
          </div>
          <span style="color: var(--text-gold); font-size: 11px; font-weight: 700;">✦ ${item.orbValue}</span>
        </div>

        <div class="item-card-meta-row">
          <span class="slot-badge slot-${targetSlot}">[SLOT: ${targetSlot.toUpperCase()}]</span>
          <span class="elemental-prefix-badge prefix-${prefix.toLowerCase()}">[${prefix}]</span>
          <span class="finish-tier-badge finish-${finishTier.toLowerCase()}">${finishTier} Finish</span>
        </div>

        <div class="item-card-stats">
          <span>Bonuses: <strong>${item.statsBonus || '+0 Stats'}</strong> // Material: ${item.material || 'Alloy'}</span>
        </div>

        <div class="item-card-actions">
          <select class="equip-select" data-item-idx="${index}">
            <option value="">-- Equip [${targetSlot.toUpperCase()}] --</option>
            ${this.state.clanUnits
              .map(
                (u) =>
                  `<option value="${u.id}" ${item.equippedTo === u.id ? 'selected' : ''}>
                    ${u.name} [${u.job}] ${item.equippedTo === u.id ? '(EQUIPPED)' : ''}
                  </option>`
              )
              .join('')}
          </select>
          <button class="btn-boost-item" data-item-idx="${index}" ${stars >= 5 ? 'disabled' : ''}>
            ${stars >= 5 ? '★ MAX (5★)' : '✦ BOOST (75 ORBS)'}
          </button>
          <button class="btn-salvage" data-item-idx="${index}">
            ✦ Salvage (+${salvageYield})
          </button>
          <button class="btn-provenance-json" data-item-id="${item.id || `item-${index}`}">
            🧬 PROVENANCE
          </button>
        </div>

        ${isProvOpen ? `
          <div class="provenance-json-content">
            ${JSON.stringify({
              seed: item.seed || `craft-seed-0x${index}`,
              id: item.id,
              name: item.name,
              slot: targetSlot,
              grade: grade,
              stars: stars,
              material: item.material || 'Mythril Alloy',
              prefix: prefix,
              finishTier: finishTier,
              statsBonus: item.statsBonus,
              orbValue: item.orbValue,
              provenanceUrl: `https://set.world/craft?orbs=${item.orbValue}&id=${item.id}`
            }, null, 2)}
          </div>
        ` : ''}
      `;

      // Boost listener
      const btnBoost = card.querySelector('.btn-boost-item');
      if (btnBoost && stars < 5) {
        btnBoost.addEventListener('click', () => {
          this.callbacks.onBoostItem?.(index);
          this._renderActiveTab();
        });
      }

      // Equip listener
      const select = card.querySelector('.equip-select');
      select.addEventListener('change', (e) => {
        const unitId = e.target.value;
        this._handleEquip(index, unitId);
      });

      // Salvage listener
      const btnSalvage = card.querySelector('.btn-salvage');
      btnSalvage.addEventListener('click', () => {
        this._handleSalvage(index, salvageYield);
      });

      // Provenance toggle listener
      const btnProv = card.querySelector('.btn-provenance-json');
      btnProv?.addEventListener('click', () => {
        const iId = item.id || `item-${index}`;
        if (this.openProvenanceItemIds.has(iId)) {
          this.openProvenanceItemIds.delete(iId);
        } else {
          this.openProvenanceItemIds.add(iId);
        }
        this._renderActiveTab();
      });

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  _handleEquip(itemIndex, unitId) {
    const item = this.state.inventory[itemIndex];
    if (!item) return;

    const targetSlot = normalizeSlot(item);

    // If equipping to a unit, clear previously equipped item of same slot on that unit
    if (unitId) {
      for (let i = 0; i < this.state.inventory.length; i++) {
        if (i !== itemIndex && this.state.inventory[i].equippedTo === unitId) {
          const otherSlot = this.state.inventory[i].equippedSlot || normalizeSlot(this.state.inventory[i]);
          if (otherSlot === targetSlot) {
            this.state.inventory[i].equippedTo = null;
            this.state.inventory[i].equippedSlot = null;
          }
        }
      }
    }

    item.equippedTo = unitId || null;
    item.equippedSlot = targetSlot;

    if (unitId) {
      const unit = this.state.clanUnits.find((u) => u.id === unitId);
      if (unit) {
        unit.equipment = unit.equipment || {};
        unit.equipment[targetSlot] = item;
        if (targetSlot === 'tool') {
          unit.equippedTool = `${item.name} (✦ ${item.orbValue} Orbs)`;
        } else if (targetSlot === 'chest') {
          unit.equippedArmor = item.name;
        }
        unit.resonances = computeSetWorldResonance(unit);
      }
    }

    this.callbacks.onEquipItem?.(itemIndex, unitId, targetSlot);
    this._renderActiveTab();
  }

  _handleSalvage(itemIndex, yieldOrbs) {
    const item = this.state.inventory[itemIndex];
    if (!item) return;

    if (this.callbacks.onSalvageItem) {
      this.callbacks.onSalvageItem(itemIndex, yieldOrbs);
    } else {
      this.state.inventory.splice(itemIndex, 1);
      this.state.orbs += yieldOrbs;
      const orbsEl = this.modalEl?.querySelector('#forge-modal-orbs');
      if (orbsEl) orbsEl.textContent = `✦ ${this.state.orbs.toLocaleString()} ORBS`;
      this._renderActiveTab();
    }
  }

  /**
   * Tab 3: Clan Roster (All 8 Set.world Slots, Passives, Resonances, Seed Customizer & Provenance)
   */
  _renderRosterTab(container) {
    const grid = document.createElement('div');
    grid.className = 'roster-grid';

    this.state.clanUnits.forEach((unit) => {
      const grade = (unit.grade || 'B').toUpperCase();
      const stats = unit.stats || {};
      const seedUrl = `https://set.world/roll/character?seed=${unit.seed || unit.id}`;
      const eq = unit.equipment || {};

      const passive = getUnitPassive(unit);
      const resonances = computeSetWorldResonance(unit);
      const isProvOpen = this.openProvenanceUnitIds.has(unit.id);

      const formatSlot = (slotKey, defaultIcon, defaultName) => {
        let name = defaultName;
        let slotGrade = grade;
        let meta = '';

        const customItem = this.state.inventory.find(
          (inv) => inv.equippedTo === unit.id && (inv.equippedSlot === slotKey || normalizeSlot(inv) === slotKey)
        );

        const actualItem = customItem || eq[slotKey];
        const isCustom = !!customItem || (actualItem && (actualItem.id?.startsWith('item-') || actualItem._custom || actualItem.equippedTo === unit.id));

        if (actualItem) {
          name = actualItem.name || defaultName;
          slotGrade = (actualItem.tierGrade || actualItem.tier || actualItem.grade || slotGrade).toUpperCase();
          meta = actualItem.statsBonus || (actualItem.score ? `Score ${Math.round(actualItem.score)}` : '') || actualItem.material || '';
        }

        const stars = actualItem?.stars || actualItem?.boostStars || 0;
        const starBadge = stars > 0 ? `<span class="slot-star-badge">★ +${stars}</span>` : '';
        const tooltip = meta ? `${name} [${meta}]` : name;

        return `
          <div class="paperdoll-slot ${isCustom ? 'custom-equipped' : ''}" title="${tooltip}">
            <div class="paperdoll-slot-header">
              <span class="slot-label">${defaultIcon} ${slotKey.toUpperCase()}</span>
              <div style="display: flex; align-items: center; gap: 4px;">
                ${starBadge}
                <span class="grade-badge grade-${slotGrade.toLowerCase()}">${slotGrade}</span>
              </div>
            </div>
            <div class="paperdoll-slot-name">${name}</div>
            ${meta ? `<div class="paperdoll-slot-meta" title="${meta}">${meta}</div>` : ''}
          </div>
        `;
      };

      const card = document.createElement('div');
      card.className = 'roster-unit-card';

      card.innerHTML = `
        <div class="roster-unit-header">
          <div>
            <div class="roster-unit-name">${unit.name}</div>
            <div class="roster-unit-class">${unit.job} // PWR ${unit.powerRating || 750}</div>
          </div>
          <span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>
        </div>

        <!-- Signature Class Passive -->
        <div class="unit-passive-row">
          <span class="passive-title">${passive.name}</span>
          <span class="passive-desc">// ${passive.desc}</span>
        </div>

        <!-- Set.world Resonances -->
        ${resonances.length > 0 ? `
          <div class="resonances-container">
            ${resonances.map((r) => `<span class="resonance-chip" title="${r.desc}">${r.name}</span>`).join('')}
          </div>
        ` : ''}

        <!-- 9 Stats Grid -->
        <div class="roster-9stats-grid">
          <div class="roster-stat-cell"><span class="stat-lbl">STR</span><span class="stat-num">${stats.STR || 30}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">DEX</span><span class="stat-num">${stats.DEX || 30}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">INT</span><span class="stat-num">${stats.INT || 30}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">AGI</span><span class="stat-num">${stats.AGI || 30}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">VIT</span><span class="stat-num">${stats.VIT || 30}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">WIS</span><span class="stat-num">${stats.WIS || 25}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">WIL</span><span class="stat-num">${stats.WIL || 25}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">LUK</span><span class="stat-num">${stats.LUK || 25}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">DEF</span><span class="stat-num">${stats.DEF || 25}</span></div>
        </div>

        <!-- 8-Slot Paperdoll Section -->
        <div class="roster-paperdoll-section">
          <div class="paperdoll-section-title">
            <span>✦ 8-SLOT SET.WORLD EQUIPMENT PAPERDOLL</span>
            <span class="paperdoll-sub">PROVENANCE INSPECTOR</span>
          </div>
          <div class="paperdoll-8grid">
            ${formatSlot('tool', '⚔️', unit.equippedTool || `${unit.job} Weapon`)}
            ${formatSlot('offhand', '🛡️', `${unit.job === 'Knight' ? 'Kite Shield' : unit.job === 'Paladin' ? 'Aegis Shield' : 'Ward Focus'}`)}
            ${formatSlot('head', '🪖', `${unit.job} Helm`)}
            ${formatSlot('chest', '🥋', unit.equippedArmor || 'Azure Clan Mail')}
            ${formatSlot('legs', '👖', `${unit.job} Greaves`)}
            ${formatSlot('feet', '👢', `${unit.job} Sabatons`)}
            ${formatSlot('neck', '📿', 'Amulet of Set')}
            ${formatSlot('finger', '💍', 'Band of Heritage')}
          </div>
        </div>

        <!-- Traits Row -->
        <div class="roster-traits-row">
          ${(unit.traits || []).map((t) => `<span class="trait-chip">✦ ${t}</span>`).join('')}
        </div>

        <!-- Per-Unit Seed Customizer -->
        <div class="seed-customizer-row">
          <span style="font-size: 10px; font-weight: 800; color: var(--text-gold);">🎲 SEED:</span>
          <input type="text" class="seed-customizer-input" id="input-seed-${unit.id}" value="${unit.seed || unit.id}" />
          <button class="btn-reroll-seed" data-unit-id="${unit.id}">RE-ROLL UNIT</button>
        </div>

        <!-- Provenance Drawer Toggle -->
        <div class="provenance-drawer-toggle">
          <div class="roster-seed-link">
            Birth: <a href="${seedUrl}" target="_blank" rel="noopener noreferrer">${seedUrl}</a>
          </div>
          <button class="btn-provenance-json" data-unit-id="${unit.id}">
            🧬 ${isProvOpen ? 'HIDE JSON' : 'PROVENANCE JSON'}
          </button>
        </div>

        ${isProvOpen ? `
          <div class="provenance-json-content">
            ${JSON.stringify({
              seed: unit.seed || unit.id,
              name: unit.name,
              class: unit.job,
              grade: grade,
              powerRating: unit.powerRating || 750,
              stats: unit.stats,
              passive: passive,
              resonances: resonances.map(r => r.name),
              equipment: {
                tool: eq.tool || unit.equippedTool,
                offhand: eq.offhand || 'Shield/Focus',
                head: eq.head || `${unit.job} Helm`,
                chest: eq.chest || unit.equippedArmor,
                legs: eq.legs || `${unit.job} Greaves`,
                feet: eq.feet || `${unit.job} Sabatons`,
                neck: eq.neck || 'Amulet of Set',
                finger: eq.finger || 'Band of Heritage'
              },
              provenanceUrl: seedUrl
            }, null, 2)}
          </div>
        ` : ''}
      `;

      // Seed re-roll listener
      const btnReroll = card.querySelector(`.btn-reroll-seed[data-unit-id="${unit.id}"]`);
      btnReroll?.addEventListener('click', () => {
        const input = card.querySelector(`#input-seed-${unit.id}`);
        const newSeed = input ? input.value.trim() : `seed-0x${Date.now()}`;
        if (newSeed) {
          rerollSingleUnitWithSeed(unit, newSeed);
          this.callbacks.onRerollUnit?.(unit, newSeed);
          this._renderActiveTab();
        }
      });

      // Provenance toggle listener
      const btnProv = card.querySelector(`.btn-provenance-json[data-unit-id="${unit.id}"]`);
      btnProv?.addEventListener('click', () => {
        if (this.openProvenanceUnitIds.has(unit.id)) {
          this.openProvenanceUnitIds.delete(unit.id);
        } else {
          this.openProvenanceUnitIds.add(unit.id);
        }
        this._renderActiveTab();
      });

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }
}
