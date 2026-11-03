/**
 * INTDEV TACTICS — Clan Forge & Set.world Armory Modal
 * 3d.internet.dev × set.world
 * 
 * Orb Lottery Forge (/api/craft?orbs=N) & Guarantee Craft (/api/craft?tier=T),
 * 8-Slot Clan Armory Inventory, Equipment Salvaging (/api/salvage),
 * Chronological Orb Ledger (/api/drop, /api/salvage, /api/craft),
 * Full 9-Stat Set.world Birth Certificate, Advantages, Disadvantages & Talents Codex.
 */

import * as SetWorldClient from '../game/setworld-client.js';
import * as CombatRules from '../game/combat-rules.js';

export const {
  EQUIPMENT_SLOTS,
  GUARANTEE_CRAFT_COSTS,
  SETWORLD_NINE_STATS,
  ADVANTAGES_CATALOG,
  DISADVANTAGES_CATALOG,
  TALENTS_CODEX,
  recordOrbLedgerEntry,
  getOrbLedger,
  clearOrbLedger,
  craftGuaranteedTier,
  getSalvageOrbYield,
  salvageEquipmentItem,
  calculateEnemyDropOrbs,
  populateUnitBirthCertificate,
  ensureUnitSetWorldData
} = SetWorldClient;

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

  for (const [pfx, count] of Object.entries(prefixCounts)) {
    if (count >= 3) {
      badges.push({
        name: `⚡ ${pfx} Attunement (3pc)`,
        desc: `+25% Elemental Affinity DMG, +15% Status Resistance`,
        count,
        tier: 3
      });
    }
  }

  return badges;
}

export function rerollSingleUnitWithSeed(unit, customSeed) {
  if (!unit) return;
  const s = String(customSeed).trim();
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(31, h) + s.charCodeAt(i) | 0;
  }
  h = Math.abs(h);

  const jobs = ['Paladin', 'Knight', 'Warrior', 'Sniper', 'Arcane Mage', 'White Mage', 'Trickster', 'Dragoon'];
  unit.seed = s;
  unit.job = jobs[h % jobs.length];
  unit.className = unit.job;

  const names = ['Ramza', 'Agrias', 'Delita', 'Mustadio', 'Orlandeau', 'Meliadoul', 'Beowulf', 'Reis', 'Alma', 'Ovelia'];
  unit.name = names[(h >> 3) % names.length];

  const grades = ['C', 'B', 'A', 'S'];
  unit.grade = grades[(h >> 6) % grades.length];
  unit.powerRating = 500 + (h % 500);

  unit.finalStats = {
    STR: 25 + (h % 30),
    DEX: 25 + ((h >> 2) % 30),
    INT: 25 + ((h >> 4) % 30),
    WIS: 20 + ((h >> 6) % 25),
    AGI: 25 + ((h >> 8) % 30),
    VIT: 25 + ((h >> 10) % 30),
    PER: 20 + ((h >> 12) % 25),
    RES: 20 + ((h >> 14) % 25),
    LCK: 20 + ((h >> 16) % 25)
  };
  unit.stats = { ...unit.finalStats };

  const advIdx = (h >> 5) % ADVANTAGES_CATALOG.length;
  const disIdx = (h >> 7) % DISADVANTAGES_CATALOG.length;
  const talIdx = (h >> 9) % TALENTS_CODEX.length;
  unit.advantage = ADVANTAGES_CATALOG[advIdx];
  unit.disadvantage = DISADVANTAGES_CATALOG[disIdx];
  unit.talent = TALENTS_CODEX[talIdx];
  unit.birthCertificate = {
    contentVersion: '8.1bmmTgz1B0Y9UKhiu84STg',
    ruleStamp: 'set-world-0-15-8-character-1',
    seed: s
  };

  unit.passive = getUnitPassive(unit);
  unit.equipment = unit.equipment || {};

  return unit;
}

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

  if (name.includes('boot') || name.includes('sabat') || name.includes('shoe') || name.includes('tread')) return 'feet';
  if (name.includes('neck') || name.includes('amulet') || name.includes('pendant') || name.includes('torc')) return 'neck';
  if (name.includes('ring') || name.includes('band') || name.includes('signet') || name.includes('loop')) return 'finger';
  if (name.includes('greave') || name.includes('legging') || name.includes('trousers') || name.includes('pants')) return 'legs';
  if (name.includes('helm') || name.includes('visor') || name.includes('crown') || name.includes('circlet')) return 'head';
  if (name.includes('shield') || name.includes('aegis') || name.includes('buckler') || name.includes('offhand')) return 'offhand';
  if (name.includes('cuirass') || name.includes('mail') || name.includes('armor') || name.includes('robe') || name.includes('plate')) return 'chest';

  return 'tool';
}

export class ForgeModal {
  /**
   * @param {HTMLElement} containerEl
   * @param {Object} callbacks
   * @param {(orbs: number) => any} [callbacks.onCraftItem]
   * @param {(tier: string, slot: string) => any} [callbacks.onGuaranteeCraft]
   * @param {(itemIndex: number, orbsRefunded?: number) => void} [callbacks.onSalvageItem]
   * @param {(itemIndex: number, unitId: string, slot?: string) => void} [callbacks.onEquipItem]
   * @param {(itemIndex: number) => void} [callbacks.onBoostItem]
   * @param {(unit: any, customSeed: string) => void} [callbacks.onRerollUnit]
   * @param {() => void} [callbacks.onClose]
   */
  constructor(containerEl = document.body, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks;

    this.activeTab = 'lottery'; // 'lottery' | 'armory' | 'roster' | 'ledger'
    this.craftMode = 'lottery'; // 'lottery' | 'guarantee'
    this.guaranteeSelectedTier = 'C';
    this.guaranteeSelectedSlot = 'all';

    this.modalEl = null;
    this._isOpen = false;

    this.openProvenanceUnitIds = new Set();
    this.openProvenanceItemIds = new Set();

    this.state = {
      orbs: 450,
      inventory: [
        {
          id: 'item-init-1',
          name: 'Mythril Broadsword',
          type: 'weapon',
          equippedSlot: 'tool',
          grade: 'B',
          orbValue: 125,
          material: 'Mythril Alloy',
          elementalPrefix: 'BOREAL',
          finishTier: 'Mythril',
          statsBonus: '+14 STR, +6 VIT',
          boostStars: 1,
          equippedTo: null
        },
        {
          id: 'item-init-2',
          name: 'Aegis Kite Shield',
          type: 'shield',
          equippedSlot: 'offhand',
          grade: 'B',
          orbValue: 125,
          material: 'Adamantite',
          elementalPrefix: 'ASTRAL',
          finishTier: 'Mythril',
          statsBonus: '+20 DEF, +100 HP',
          boostStars: 0,
          equippedTo: null
        }
      ],
      clanUnits: [],
      latestReceipt: null
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
    if (partialState.clanUnits) {
      this.state.clanUnits = partialState.clanUnits.map(ensureUnitSetWorldData);
    }
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
            ✦ [1] ORB FORGE
          </button>
          <button class="forge-tab-btn ${this.activeTab === 'armory' ? 'active' : ''}" data-tab="armory">
            ⚔️ [2] CLAN ARMORY (${this.state.inventory.length})
          </button>
          <button class="forge-tab-btn ${this.activeTab === 'roster' ? 'active' : ''}" data-tab="roster">
            🛡️ [3] CLAN ROSTER & 9 STATS
          </button>
          <button class="forge-tab-btn ${this.activeTab === 'ledger' ? 'active' : ''}" data-tab="ledger">
            📜 [4] ORB LEDGER
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
    if (!this.modalEl) return;
    const content = this.modalEl.querySelector('#forge-tab-content');
    if (!content) return;
    content.innerHTML = '';

    if (this.activeTab === 'lottery') {
      this._renderLotteryTab(content);
    } else if (this.activeTab === 'armory') {
      this._renderArmoryTab(content);
    } else if (this.activeTab === 'roster') {
      this._renderRosterTab(content);
    } else if (this.activeTab === 'ledger') {
      this._renderLedgerTab(content);
    }
  }

  /* ========================================================================
     Tab 1: Orb Forge (Lottery Craft vs Guarantee Craft Mode Toggle)
     ======================================================================== */

  _renderLotteryTab(container) {
    const currentOrbs = this.state.orbs;

    // Craft Mode Switcher Bar
    const modeBar = document.createElement('div');
    modeBar.className = 'forge-mode-toggle-bar';
    modeBar.innerHTML = `
      <button class="mode-toggle-btn ${this.craftMode === 'lottery' ? 'active' : ''}" id="btn-mode-lottery">
        🎲 LOTTERY CRAFT (/api/craft?orbs=)
      </button>
      <button class="mode-toggle-btn ${this.craftMode === 'guarantee' ? 'active' : ''}" id="btn-mode-guarantee">
        👑 GUARANTEE CRAFT (/api/craft?tier=)
      </button>
    `;

    modeBar.querySelector('#btn-mode-lottery')?.addEventListener('click', () => {
      this.craftMode = 'lottery';
      this._renderActiveTab();
    });

    modeBar.querySelector('#btn-mode-guarantee')?.addEventListener('click', () => {
      this.craftMode = 'guarantee';
      this._renderActiveTab();
    });

    container.appendChild(modeBar);

    if (this.craftMode === 'lottery') {
      this._renderLotterySubView(container, currentOrbs);
    } else {
      this._renderGuaranteeSubView(container, currentOrbs);
    }

    if (this.state.latestReceipt) {
      this._renderReceiptCard(container, this.state.latestReceipt);
    }
  }

  _renderLotterySubView(container, currentOrbs) {
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

    customRow.querySelector('#btn-forge-custom')?.addEventListener('click', () => {
      const input = customRow.querySelector('#input-custom-orbs');
      const val = parseInt(input.value, 10);
      if (val >= 10 && val <= currentOrbs) {
        this._handleCraft(val);
      } else {
        alert(`Please enter an orb amount between 10 and ${currentOrbs}.`);
      }
    });

    container.appendChild(customRow);
  }

  _renderGuaranteeSubView(container, currentOrbs) {
    const intro = document.createElement('div');
    intro.className = 'lottery-intro';
    intro.innerHTML = `
      Lock in an authentic <strong>Set.world Guaranteed Craft</strong> (<code>/api/craft?tier=T</code>).
      Select your target Grade and equipment slot. No random lottery variance — guarantees exact tier grade and target slot.
    `;
    container.appendChild(intro);

    // Guaranteed Grade Grid
    const grades = [
      { tier: 'S', cost: GUARANTEE_CRAFT_COSTS.S, label: 'Grade S Sovereign', desc: 'Max stat multipliers & sovereign finishing' },
      { tier: 'A', cost: GUARANTEE_CRAFT_COSTS.A, label: 'Grade A Relic', desc: 'Superior mythril/adamantite forging' },
      { tier: 'B', cost: GUARANTEE_CRAFT_COSTS.B, label: 'Grade B Elite', desc: 'Refined alloy with high resonance' },
      { tier: 'C', cost: GUARANTEE_CRAFT_COSTS.C, label: 'Grade C Standard', desc: 'Solid battlefield gear' },
      { tier: 'D', cost: GUARANTEE_CRAFT_COSTS.D, label: 'Grade D Novice', desc: 'Basic ironwork and training tools' },
      { tier: 'E', cost: GUARANTEE_CRAFT_COSTS.E, label: 'Grade E Crude', desc: 'Raw ore crafting' },
      { tier: 'F', cost: GUARANTEE_CRAFT_COSTS.F, label: 'Grade F Scraps', desc: 'Makeshift battlefield scrap' }
    ];

    const guaranteeGrid = document.createElement('div');
    guaranteeGrid.className = 'guarantee-tiers-grid';

    grades.forEach((g) => {
      const isSelected = this.guaranteeSelectedTier === g.tier;
      const canAfford = currentOrbs >= g.cost;
      const card = document.createElement('div');
      card.className = `guarantee-tier-card ${isSelected ? 'selected' : ''} ${!canAfford ? 'disabled' : ''}`;
      card.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span class="grade-badge grade-${g.tier.toLowerCase()}">GRADE ${g.tier}</span>
          <span class="tier-cost">✦ ${g.cost} ORBS</span>
        </div>
        <div style="font-weight: 800; font-size: 12px; margin-top: 4px; color: ${isSelected ? 'var(--text-gold)' : '#fff'};">${g.label}</div>
        <div style="font-size: 9.5px; color: var(--text-muted); margin-top: 2px;">${g.desc}</div>
      `;

      card.addEventListener('click', () => {
        this.guaranteeSelectedTier = g.tier;
        this._renderActiveTab();
      });

      guaranteeGrid.appendChild(card);
    });

    container.appendChild(guaranteeGrid);

    // Slot Target Selection Row & Craft Trigger
    const selectedCost = GUARANTEE_CRAFT_COSTS[this.guaranteeSelectedTier] || 120;
    const canAffordSelected = currentOrbs >= selectedCost;

    const slotControlRow = document.createElement('div');
    slotControlRow.className = 'guarantee-slot-control-row';
    slotControlRow.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 11px; font-weight: 700; color: var(--text-gold);">TARGET SLOT:</span>
        <select class="guarantee-slot-select" id="select-guarantee-slot">
          <option value="all" ${this.guaranteeSelectedSlot === 'all' ? 'selected' : ''}>✦ All Slots (Random Roll)</option>
          <option value="tool" ${this.guaranteeSelectedSlot === 'tool' ? 'selected' : ''}>⚔️ TOOL / WEAPON</option>
          <option value="offhand" ${this.guaranteeSelectedSlot === 'offhand' ? 'selected' : ''}>🛡️ OFFHAND / SHIELD</option>
          <option value="head" ${this.guaranteeSelectedSlot === 'head' ? 'selected' : ''}>🪖 HEAD / HELM</option>
          <option value="chest" ${this.guaranteeSelectedSlot === 'chest' ? 'selected' : ''}>🥋 CHEST / ARMOR</option>
          <option value="legs" ${this.guaranteeSelectedSlot === 'legs' ? 'selected' : ''}>👖 LEGS / GREAVES</option>
          <option value="feet" ${this.guaranteeSelectedSlot === 'feet' ? 'selected' : ''}>👢 FEET / SABATONS</option>
          <option value="neck" ${this.guaranteeSelectedSlot === 'neck' ? 'selected' : ''}>📿 NECK / AMULET</option>
          <option value="finger" ${this.guaranteeSelectedSlot === 'finger' ? 'selected' : ''}>💍 FINGER / RING</option>
        </select>
      </div>

      <button class="hud-btn gold" id="btn-forge-guaranteed" ${!canAffordSelected ? 'disabled' : ''}>
        👑 FORGE GUARANTEED TIER ${this.guaranteeSelectedTier} (✦ ${selectedCost} ORBS)
      </button>
    `;

    slotControlRow.querySelector('#select-guarantee-slot')?.addEventListener('change', (e) => {
      this.guaranteeSelectedSlot = e.target.value;
    });

    slotControlRow.querySelector('#btn-forge-guaranteed')?.addEventListener('click', () => {
      this._handleGuaranteeCraft(this.guaranteeSelectedTier, this.guaranteeSelectedSlot);
    });

    container.appendChild(slotControlRow);
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
          <div class="receipt-cell-label">Endpoint Mode</div>
          <div class="receipt-cell-val">${receipt.endpoint || (receipt.candidateRolls ? `/api/craft?orbs=` : `/api/craft?tier=${grade}`)}</div>
        </div>
        <div>
          <div class="receipt-cell-label">Material</div>
          <div class="receipt-cell-val">${receipt.material || item.material || 'Mythril Alloy'}</div>
        </div>
      </div>

      <div style="font-size: 11px; color: var(--text-mythril); background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 3px;">
        Bonuses: <strong>${item.statsBonus || '+12 STR, +5 VIT'}</strong> // Cost: <strong>✦ ${receipt.cost || receipt.orbValue || item.orbValue} Orbs</strong>
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

      const targetSlot = EQUIPMENT_SLOTS[Math.floor(Math.random() * EQUIPMENT_SLOTS.length)];

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
        tierGrade: grade,
        orbValue: orbs,
        material: material,
        elementalPrefix: prefix,
        statsBonus: statsBonus,
        equippedTo: null
      };

      receipt = {
        candidateRolls: rollsCount,
        tierGrade: grade,
        score: score,
        orbValue: orbs,
        material: material,
        item: forgedItem,
        provenance: `https://set.world/craft?orbs=${orbs}&seed=tactics-${Date.now()}`
      };

      recordOrbLedgerEntry({
        type: 'craft_lottery',
        endpoint: `/api/craft?orbs=${orbs}`,
        timestamp: Date.now(),
        orbsDelta: -orbs,
        candidateRolls: rollsCount,
        itemName: forgedItem.name,
        tier: grade,
        seed: Date.now()
      });

      this.state.orbs -= orbs;
      this.state.inventory.unshift(forgedItem);
      this.state.latestReceipt = receipt;
    }

    const orbsEl = this.modalEl?.querySelector('#forge-modal-orbs');
    if (orbsEl) orbsEl.textContent = `✦ ${this.state.orbs.toLocaleString()} ORBS`;
    this._renderActiveTab();
  }

  async _handleGuaranteeCraft(tier, slot) {
    const cost = GUARANTEE_CRAFT_COSTS[tier] || 120;
    if (this.state.orbs < cost) {
      alert(`Insufficient Orbs: Need ${cost} Orbs for Guaranteed Tier ${tier}.`);
      return;
    }

    if (this.callbacks.onGuaranteeCraft) {
      const craftResult = await this.callbacks.onGuaranteeCraft(tier, slot);
      if (craftResult && craftResult.receipt) {
        this.state.latestReceipt = craftResult.receipt;
      }
      this._renderActiveTab();
      return;
    }

    const craftResult = await craftGuaranteedTier(tier, slot, Date.now());

    if (craftResult && craftResult.item) {
      const item = craftResult.item;
      const receipt = craftResult.receipt || {
        endpoint: `/api/craft?tier=${tier}`,
        tierGrade: tier,
        cost: cost,
        item,
        provenance: `https://set.world/craft?tier=${tier}&slot=${slot}`
      };

      this.state.orbs = Math.max(0, this.state.orbs - cost);
      this.state.inventory.unshift(item);
      this.state.latestReceipt = receipt;

      const orbsEl = this.modalEl?.querySelector('#forge-modal-orbs');
      if (orbsEl) orbsEl.textContent = `✦ ${this.state.orbs.toLocaleString()} ORBS`;
      this._renderActiveTab();
    }
  }

  /* ========================================================================
     Tab 2: Clan Armory (Inventory & Salvage with [♻️ SALVAGE] button)
     ======================================================================== */

  _renderArmoryTab(container) {
    if (this.state.inventory.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          The Clan Armory is currently empty. Visit the <strong>Orb Forge</strong> to synthesize mythril and 8-slot set equipment!
        </div>
      `;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'armory-inventory-grid';

    this.state.inventory.forEach((item, index) => {
      const grade = (item.grade || item.tierGrade || 'B').toUpperCase();
      const targetSlot = normalizeSlot(item);
      const isEquipped = !!item.equippedTo;

      // Authentic Set.world salvage computation
      const salvageYield = getSalvageOrbYield(item);

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
      card.className = `inventory-item-card ${isEquipped ? 'is-equipped' : ''}`;

      card.innerHTML = `
        <div class="item-card-top">
          <div class="item-card-name">
            <span>${icon}</span>
            <span>${item.name}</span>
            <span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>
            <span class="item-stars-badge">${starsLabel}</span>
          </div>
          <span style="color: var(--text-gold); font-size: 11px; font-weight: 700;">✦ ${item.orbValue || 50}</span>
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
                    ${u.name} [${u.job || u.className}] ${item.equippedTo === u.id ? '(EQUIPPED)' : ''}
                  </option>`
              )
              .join('')}
          </select>
          <button class="btn-boost-item" data-item-idx="${index}" ${stars >= 5 ? 'disabled' : ''}>
            ${stars >= 5 ? '★ MAX (5★)' : '✦ BOOST (75 ORBS)'}
          </button>
          ${!isEquipped ? `
            <button class="btn-salvage hud-btn" data-item-idx="${index}" style="border-color: #10b981; color: #6ee7b7;">
              ♻️ SALVAGE (+${salvageYield} ORBS)
            </button>
          ` : `
            <button class="btn-salvage hud-btn" disabled style="opacity: 0.5;">
              🔒 EQUIPPED
            </button>
          `}
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
      select?.addEventListener('change', (e) => {
        const unitId = e.target.value;
        this._handleEquip(index, unitId);
      });

      // Salvage listener
      const btnSalvage = card.querySelector('.btn-salvage:not([disabled])');
      btnSalvage?.addEventListener('click', () => {
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
      return;
    }

    salvageEquipmentItem(item, Date.now());

    this.state.inventory.splice(itemIndex, 1);
    this.state.orbs += yieldOrbs;

    const orbsEl = this.modalEl?.querySelector('#forge-modal-orbs');
    if (orbsEl) orbsEl.textContent = `✦ ${this.state.orbs.toLocaleString()} ORBS`;

    this._renderActiveTab();
  }

  /* ========================================================================
     Tab 3: Clan Roster (All 9 Stats, Advantage, Disadvantage, Talent, Birth Cert)
     ======================================================================== */

  _renderRosterTab(container) {
    const grid = document.createElement('div');
    grid.className = 'roster-grid';

    this.state.clanUnits.forEach((unit) => {
      ensureUnitSetWorldData(unit);

      const grade = (unit.grade || 'B').toUpperCase();
      const s = unit.finalStats || unit.stats || {};
      const adv = unit.advantage || { name: 'Keen Eye', desc: '+15% Crit rate' };
      const disadv = unit.disadvantage || { name: 'Honor Bound', desc: 'Lower flank damage' };
      const tal = unit.talent || { name: 'Aether Conduit', desc: 'Boost MP on crystals', flavor: 'Stars whisper.' };
      const cert = unit.birthCertificate || { ruleStamp: 'set-world-0-15-8-character-1', contentVersion: '8.1bmmTgz1B0Y9UKhiu84STg' };
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
            <div class="roster-unit-class">${unit.job || unit.className} // PWR ${unit.powerRating || 750}</div>
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

        <!-- Full 9-Stat Base Grid -->
        <div class="roster-9stats-grid">
          <div class="roster-stat-cell"><span class="stat-lbl">STR</span><span class="stat-num">${s.STR ?? 30}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">DEX</span><span class="stat-num">${s.DEX ?? 28}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">INT</span><span class="stat-num">${s.INT ?? 24}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">WIS</span><span class="stat-num">${s.WIS ?? 22}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">AGI</span><span class="stat-num">${s.AGI ?? 26}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">VIT</span><span class="stat-num">${s.VIT ?? 30}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">PER</span><span class="stat-num">${s.PER ?? 25}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">RES</span><span class="stat-num">${s.RES ?? 20}</span></div>
          <div class="roster-stat-cell"><span class="stat-lbl">LCK</span><span class="stat-num">${s.LCK ?? 20}</span></div>
        </div>

        <!-- Rolled Advantages, Disadvantages & Talents Codex -->
        <div class="roster-traits-codex">
          <div class="trait-codex-row adv">🟢 <strong>${adv.name}:</strong> ${adv.desc}</div>
          <div class="trait-codex-row dis">🟠 <strong>${disadv.name}:</strong> ${disadv.desc}</div>
          <div class="trait-codex-row tal">📖 <strong>${tal.name}</strong> — "${tal.flavor || tal.desc}"</div>
        </div>

        <!-- 8-Slot Paperdoll Section -->
        <div class="roster-paperdoll-section">
          <div class="paperdoll-section-title">
            <span>✦ 8-SLOT SET.WORLD EQUIPMENT PAPERDOLL</span>
            <span class="paperdoll-sub">PROVENANCE INSPECTOR</span>
          </div>
          <div class="paperdoll-8grid">
            ${formatSlot('tool', '⚔️', unit.equippedTool || `${unit.job || unit.className} Weapon`)}
            ${formatSlot('offhand', '🛡️', `${(unit.job || unit.className) === 'Knight' ? 'Kite Shield' : (unit.job || unit.className) === 'Paladin' ? 'Aegis Shield' : 'Ward Focus'}`)}
            ${formatSlot('head', '🪖', `${unit.job || unit.className} Helm`)}
            ${formatSlot('chest', '🥋', unit.equippedArmor || 'Azure Clan Mail')}
            ${formatSlot('legs', '👖', `${unit.job || unit.className} Greaves`)}
            ${formatSlot('feet', '👢', `${unit.job || unit.className} Sabatons`)}
            ${formatSlot('neck', '📿', 'Amulet of Set')}
            ${formatSlot('finger', '💍', 'Band of Heritage')}
          </div>
        </div>

        <!-- Set.world Birth Certificate Stamp & Provenance Drawer -->
        <div class="roster-birth-cert-box">
          <div class="birth-cert-header">
            <span>📜 STAMP: <strong>${cert.ruleStamp || 'set-world-0-15-8-character-1'}</strong></span>
            <span>v: ${cert.contentVersion || '8.1bmmTgz1B0Y9UKhiu84STg'}</span>
          </div>
          <div class="birth-cert-actions">
            <a href="${seedUrl}" target="_blank" rel="noopener noreferrer" class="btn-cert-link">🔗 SET.WORLD BIRTH</a>
            <button class="hud-btn btn-copy-seed-url" data-url="${seedUrl}">📋 COPY LINK</button>
            <button class="btn-provenance-json" data-unit-id="${unit.id}">
              🧬 ${isProvOpen ? 'HIDE JSON' : 'PROVENANCE JSON'}
            </button>
          </div>
        </div>

        <!-- Per-Unit Seed Customizer -->
        <div class="seed-customizer-row">
          <span style="font-size: 10px; font-weight: 800; color: var(--text-gold);">🎲 SEED:</span>
          <input type="text" class="seed-customizer-input" id="input-seed-${unit.id}" value="${unit.seed || unit.id}" />
          <button class="btn-reroll-seed" data-unit-id="${unit.id}">RE-ROLL UNIT</button>
        </div>

        ${isProvOpen ? `
          <div class="provenance-json-content">
            ${JSON.stringify({
              seed: unit.seed || unit.id,
              name: unit.name,
              class: unit.job || unit.className,
              grade: grade,
              powerRating: unit.powerRating || 750,
              finalStats: unit.finalStats,
              advantage: unit.advantage,
              disadvantage: unit.disadvantage,
              talent: unit.talent,
              birthCertificate: unit.birthCertificate,
              passive: passive,
              resonances: resonances.map(r => r.name),
              equipment: {
                tool: eq.tool || unit.equippedTool,
                offhand: eq.offhand || 'Shield/Focus',
                head: eq.head || `${unit.job || unit.className} Helm`,
                chest: eq.chest || unit.equippedArmor,
                legs: eq.legs || `${unit.job || unit.className} Greaves`,
                feet: eq.feet || `${unit.job || unit.className} Sabatons`,
                neck: eq.neck || 'Amulet of Set',
                finger: eq.finger || 'Band of Heritage'
              },
              provenanceUrl: seedUrl
            }, null, 2)}
          </div>
        ` : ''}
      `;

      // Copy link listener
      card.querySelector('.btn-copy-seed-url')?.addEventListener('click', async (e) => {
        const url = e.target.getAttribute('data-url');
        try {
          await navigator.clipboard.writeText(url);
          const orig = e.target.textContent;
          e.target.textContent = 'COPIED!';
          setTimeout(() => { e.target.textContent = orig; }, 1500);
        } catch (_) {}
      });

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

  /* ========================================================================
     Tab 4: Chronological Orb Ledger (/api/drop, /api/salvage, /api/craft)
     ======================================================================== */

  _renderLedgerTab(container) {
    const ledger = getOrbLedger();

    const header = document.createElement('div');
    header.className = 'ledger-summary-header';

    const dropsCount = ledger.filter((e) => e.type === 'drop').length;
    const salvageCount = ledger.filter((e) => e.type === 'salvage').length;
    const craftsCount = ledger.filter((e) => e.type && e.type.startsWith('craft')).length;

    header.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <span>✦ TRANSACTIONS: <strong>${ledger.length}</strong></span>
          <span style="color: #34d399;">DROPS: <strong>${dropsCount}</strong></span>
          <span style="color: #38bdf8;">SALVAGED: <strong>${salvageCount}</strong></span>
          <span style="color: #fbbf24;">CRAFTS: <strong>${craftsCount}</strong></span>
        </div>
        <button class="hud-btn" id="btn-clear-ledger" style="padding: 2px 8px; font-size: 10px;">
          🗑️ CLEAR LEDGER
        </button>
      </div>
    `;

    header.querySelector('#btn-clear-ledger')?.addEventListener('click', () => {
      clearOrbLedger();
      this._renderActiveTab();
    });

    container.appendChild(header);

    if (ledger.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ledger-empty-msg';
      empty.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted); line-height: 1.6;">
          📜 The Set.world Orb Ledger is empty.<br />
          Defeat Crimson enemies (<code>/api/drop</code>), recycle weapons in Armory (<code>/api/salvage</code>),
          or forge equipment (<code>/api/craft</code>) to log live receipts.
        </div>
      `;
      container.appendChild(empty);
      return;
    }

    const list = document.createElement('div');
    list.className = 'ledger-entries-list';

    ledger.forEach((entry) => {
      const row = document.createElement('div');
      row.className = `ledger-entry-row ${entry.type || 'generic'}`;

      const timeStr = new Date(entry.timestamp).toLocaleTimeString();
      const isPositive = (entry.orbsDelta || 0) >= 0;
      const deltaClass = isPositive ? 'orbs-plus' : 'orbs-minus';
      const deltaStr = isPositive ? `+${entry.orbsDelta}` : `${entry.orbsDelta}`;

      let detailsHtml = '';

      if (entry.type === 'drop') {
        const sv = entry.statsVector || {};
        detailsHtml = `
          <div class="ledger-details-main">
            <span class="ledger-endpoint-tag drop">/api/drop</span>
            <span style="font-weight: 800; color: #f8fafc;">Defeated ${entry.unitName} [${entry.unitClass}]</span>
          </div>
          <div class="ledger-stats-vector">
            <span>STR:${sv.STR ?? '-'}</span>
            <span>DEX:${sv.DEX ?? '-'}</span>
            <span>INT:${sv.INT ?? '-'}</span>
            <span>WIS:${sv.WIS ?? '-'}</span>
            <span>AGI:${sv.AGI ?? '-'}</span>
            <span>VIT:${sv.VIT ?? '-'}</span>
            <span>PER:${sv.PER ?? '-'}</span>
            <span>RES:${sv.RES ?? '-'}</span>
            <span>LCK:${sv.LCK ?? '-'}</span>
          </div>
        `;
      } else if (entry.type === 'salvage') {
        detailsHtml = `
          <div class="ledger-details-main">
            <span class="ledger-endpoint-tag salvage">/api/salvage</span>
            <span style="font-weight: 800; color: #f8fafc;">Recycled ${entry.itemName} [${(entry.slot || 'tool').toUpperCase()}] (${entry.tier || 'C'})</span>
          </div>
        `;
      } else if (entry.type === 'craft_guarantee') {
        detailsHtml = `
          <div class="ledger-details-main">
            <span class="ledger-endpoint-tag craft-guarantee">/api/craft?tier=${entry.tier}</span>
            <span style="font-weight: 800; color: #f8fafc;">Forged ${entry.itemName} [${(entry.slot || 'tool').toUpperCase()}] (Grade ${entry.tier})</span>
          </div>
        `;
      } else {
        detailsHtml = `
          <div class="ledger-details-main">
            <span class="ledger-endpoint-tag craft-lottery">/api/craft?orbs=</span>
            <span style="font-weight: 800; color: #f8fafc;">Lottery Forged ${entry.itemName || 'Item'} (${entry.candidateRolls || 1} candidates)</span>
          </div>
        `;
      }

      row.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
          <span class="ledger-time-stamp">${timeStr}</span>
          <div style="display: flex; flex-direction: column; gap: 2px;">
            ${detailsHtml}
          </div>
        </div>
        <div class="ledger-delta-badge ${deltaClass}">
          ✦ ${deltaStr} ORBS
        </div>
      `;

      list.appendChild(row);
    });

    container.appendChild(list);
  }
}
