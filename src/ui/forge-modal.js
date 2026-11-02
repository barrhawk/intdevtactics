/**
 * INTDEV TACTICS — Clan Forge & Set.world Armory Modal
 * 3d.internet.dev × set.world
 * 
 * Orb Lottery Forge (/api/craft?orbs=N), Clan Armory Inventory,
 * Salvaging (/api/salvage), and Clan Roster Inspector with Set.world Character Sheets.
 */

export class ForgeModal {
  /**
   * @param {HTMLElement} containerEl - Parent container or body to mount modal
   * @param {Object} callbacks
   * @param {(orbs: number) => any} [callbacks.onCraftItem]
   * @param {(itemIndex: number, orbsRefunded?: number) => void} [callbacks.onSalvageItem]
   * @param {(itemIndex: number, unitId: string) => void} [callbacks.onEquipItem]
   * @param {() => void} [callbacks.onClose]
   */
  constructor(containerEl = document.body, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks;

    this.activeTab = 'lottery'; // 'lottery' | 'armory' | 'roster'
    this.modalEl = null;
    this._isOpen = false;

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
        },
        {
          id: 'item-init-5',
          name: 'Tower Aegis Shield',
          type: 'armor',
          grade: 'B',
          orbValue: 125,
          material: 'Tempered Mythril',
          statsBonus: '+18 DEF, +8 VIT',
          equippedTo: null,
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

  /**
   * Open the Forge Modal with state
   * @param {Object} [initialState]
   */
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

  /**
   * Close modal
   */
  close() {
    this._isOpen = false;
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
    window.removeEventListener('keydown', this._onKeyDown);
    this.callbacks.onClose?.();
  }

  /**
   * Is modal open
   */
  isOpen() {
    return this._isOpen;
  }

  /**
   * Update modal state & re-render
   * @param {Object} partialState
   */
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
            <span class="forge-header-title">SET.WORLD CLAN FORGE & ARMORY</span>
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
            🛡️ [3] CLAN ROSTER (4 UNITS)
          </button>
        </nav>

        <div class="forge-body" id="forge-tab-content"></div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.close();
      }
    });

    backdrop.querySelector('#forge-btn-close').addEventListener('click', () => {
      this.close();
    });

    // Tab buttons
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

  /* ========================================================================
     Tab Renderers
     ======================================================================== */

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
      Higher orb investments roll more candidate seeds (<code>rolls = ⌊√(orbs/2)⌋</code>) and skew candidate rolls toward mythril, adamantine, and sovereign Grade S gear.
    `;
    container.appendChild(intro);

    // 5 Tier Buttons
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
        card.addEventListener('click', () => {
          this._handleCraft(t.cost);
        });
      }

      tiersGrid.appendChild(card);
    });

    container.appendChild(tiersGrid);

    // Custom Orbs Input
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

    // Display Latest Craft Receipt if present
    if (this.state.latestReceipt) {
      this._renderReceiptCard(container, this.state.latestReceipt);
    }
  }

  /**
   * Render latest craft receipt card
   */
  _renderReceiptCard(container, receipt) {
    const card = document.createElement('div');
    card.className = 'craft-receipt-card';

    const grade = (receipt.tierGrade || 'B').toUpperCase();
    const item = receipt.item || {};

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
          <div class="receipt-cell-label">Candidate Rolls</div>
          <div class="receipt-cell-val">${receipt.candidateRolls || 5} drawn</div>
        </div>
        <div>
          <div class="receipt-cell-label">Quality Score</div>
          <div class="receipt-cell-val" style="color: var(--text-gold);">${receipt.score || '785.4'}</div>
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

  /**
   * Perform craft action
   */
  async _handleCraft(orbs) {
    if (this.state.orbs < orbs) return;

    // Trigger external callback if supplied
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

      // Synchronize internal state with main.js without double-deduction or duplication
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
      // Fallback synthesis if no external result
      const rollsCount = Math.max(1, Math.floor(Math.sqrt(orbs / 2)));
      let grade = 'C';
      let score = Math.round((Math.sqrt(orbs) * 12 + Math.random() * 40) * 10) / 10;

      if (orbs >= 15625 || score >= 900) grade = 'S';
      else if (orbs >= 3125 || score >= 750) grade = 'A';
      else if (orbs >= 625 || score >= 500) grade = 'B';
      else if (orbs >= 125 || score >= 300) grade = 'C';
      else grade = 'D';

      const materials = ['Mythril', 'Obsidian Glass', 'Adamantine', 'Dragon Scale', 'Starlight Silver', 'Dark Steel', 'Eldritch Bone'];
      const material = materials[Math.floor(Math.random() * materials.length)];

      const itemNames = [
        `${material} Broadsword`,
        `${material} Longbow`,
        `${material} Arcane Scepter`,
        `${material} War Spear`,
        `${material} Heavy Aegis`,
        `${material} Battle Cuirass`,
      ];
      const itemName = itemNames[Math.floor(Math.random() * itemNames.length)];

      const bonusTypes = ['STR', 'DEX', 'INT', 'AGI', 'VIT'];
      const b1 = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
      const b2 = bonusTypes[Math.floor(Math.random() * bonusTypes.length)];
      const bonusMag = grade === 'S' ? 24 : grade === 'A' ? 16 : grade === 'B' ? 10 : grade === 'C' ? 6 : 3;
      const statsBonus = `+${bonusMag} ${b1}, +${Math.round(bonusMag * 0.6)} ${b2}`;

      forgedItem = {
        id: `item-${Date.now()}`,
        name: itemName,
        type: itemName.includes('Cuirass') || itemName.includes('Aegis') ? 'armor' : 'weapon',
        grade: grade,
        orbValue: orbs,
        material: material,
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

      // Update internal state
      this.state.orbs -= orbs;
      this.state.inventory.unshift(forgedItem);
      this.state.latestReceipt = receipt;
    }

    // Update modal display
    const orbsEl = this.modalEl?.querySelector('#forge-modal-orbs');
    if (orbsEl) orbsEl.textContent = `✦ ${this.state.orbs.toLocaleString()} ORBS`;

    this._renderActiveTab();
  }

  /**
   * Tab 2: Clan Armory (Inventory & Salvage)
   */
  _renderArmoryTab(container) {
    if (this.state.inventory.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--text-muted);">
          The Clan Armory is currently empty. Visit the <strong>Orb Lottery Forge</strong> to synthesize mythril and set equipment!
        </div>
      `;
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'armory-inventory-grid';

    this.state.inventory.forEach((item, index) => {
      const grade = (item.grade || 'B').toUpperCase();
      const salvageYield = Math.max(1, Math.round((item.orbValue || 25) * 0.1));

      const card = document.createElement('div');
      card.className = 'inventory-item-card';

      card.innerHTML = `
        <div class="item-card-top">
          <div class="item-card-name">
            <span>${item.type === 'armor' ? '🛡️' : '⚔️'}</span>
            <span>${item.name}</span>
            <span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>
          </div>
          <span style="color: var(--text-gold); font-size: 11px; font-weight: 700;">✦ ${item.orbValue}</span>
        </div>

        <div class="item-card-stats">
          <span>Bonuses: <strong>${item.statsBonus || '+0 Stats'}</strong> // Material: ${item.material || 'Alloy'}</span>
        </div>

        <div class="item-card-actions">
          <select class="equip-select" data-item-idx="${index}">
            <option value="">-- Equip to Unit --</option>
            ${this.state.clanUnits
              .map(
                (u) =>
                  `<option value="${u.id}" ${item.equippedTo === u.id ? 'selected' : ''}>
                    ${u.name} [${u.job}] ${item.equippedTo === u.id ? '(EQUIPPED)' : ''}
                  </option>`
              )
              .join('')}
          </select>
          <button class="btn-salvage" data-item-idx="${index}">
            ✦ Salvage (+${salvageYield})
          </button>
        </div>
      `;

      // Equip change listener
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

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  /**
   * Handle Equip
   */
  _handleEquip(itemIndex, unitId) {
    const item = this.state.inventory[itemIndex];
    if (!item) return;

    // If equipping to a unit, clear previously equipped item of same type on that unit
    if (unitId) {
      for (let i = 0; i < this.state.inventory.length; i++) {
        if (i !== itemIndex && this.state.inventory[i].equippedTo === unitId) {
          if ((item.type === 'weapon' || item.slot === 'tool') &&
              (this.state.inventory[i].type === 'weapon' || this.state.inventory[i].slot === 'tool')) {
            this.state.inventory[i].equippedTo = null;
          } else if (item.type === 'armor' && this.state.inventory[i].type === 'armor') {
            this.state.inventory[i].equippedTo = null;
          }
        }
      }
    }

    item.equippedTo = unitId || null;

    if (unitId) {
      const unit = this.state.clanUnits.find((u) => u.id === unitId);
      if (unit) {
        if (item.type === 'armor') {
          unit.equippedArmor = item.name;
        } else {
          unit.equippedTool = `${item.name} (✦ ${item.orbValue} Orbs)`;
        }
      }
    }

    this.callbacks.onEquipItem?.(itemIndex, unitId);
    this._renderActiveTab();
  }

  /**
   * Handle Salvage (Returns 10% Orbs)
   */
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
   * Tab 3: Clan Roster (All 4 Azure Clan Units)
   */
  _renderRosterTab(container) {
    const grid = document.createElement('div');
    grid.className = 'roster-grid';

    this.state.clanUnits.forEach((unit) => {
      const grade = (unit.grade || 'B').toUpperCase();
      const stats = unit.stats || {};
      const seedUrl = `https://set.world/roll/character?seed=${unit.seed || unit.id}`;

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

        <div class="roster-gear-list">
          <div>⚔️ Tool: <strong>${unit.equippedTool || 'Standard Weapon'}</strong></div>
          <div>🛡️ Armor: <strong>${unit.equippedArmor || 'Standard Tunic'}</strong></div>
        </div>

        <div class="roster-traits-row">
          ${(unit.traits || []).map((t) => `<span class="trait-chip">✦ ${t}</span>`).join('')}
        </div>

        <div class="roster-seed-link">
          Birth Certificate: <a href="${seedUrl}" target="_blank" rel="noopener noreferrer">${seedUrl}</a>
        </div>
      `;

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }
}
