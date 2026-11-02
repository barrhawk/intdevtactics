/**
 * INTDEV TACTICS — Tactical HUD
 * 3d.internet.dev × set.world
 * 
 * FFTA / Tactics Ogre Tactical HUD, CT Turn Order Ribbon,
 * Command Menu, Combat Forecast Card, Overhead Unit Bars & Damage Popups.
 */

export class TacticalHUD {
  /**
   * @param {HTMLElement} containerEl - The root HUD container (e.g. #tactics-ui)
   * @param {Object} callbacks - Interaction callback hooks
   * @param {() => void} [callbacks.onSelectMove]
   * @param {(ability: any) => void} [callbacks.onSelectAbility]
   * @param {() => void} [callbacks.onOpenWaitCompass]
   * @param {(facing: string) => void} [callbacks.onConfirmEndTurn]
   * @param {() => void} [callbacks.onCancelMode]
   * @param {() => void} [callbacks.onConfirmCombat]
   * @param {(deltaDegOrDir: number|string) => void} [callbacks.onRotateCamera]
   * @param {(deltaOrDir: number|string) => void} [callbacks.onZoomCamera]
   * @param {() => void} [callbacks.onToggleAutoBattle]
   * @param {() => void} [callbacks.onNewSeed]
   * @param {() => void} [callbacks.onOpenForge]
   */
  constructor(containerEl, callbacks = {}) {
    if (!containerEl) {
      throw new Error('[TacticalHUD] containerEl is required');
    }
    this.container = containerEl;
    this.callbacks = callbacks;

    // Internal State
    this.headerState = {
      seed: '0x1337-TACTICS',
      orbs: 450,
      cameraStep: 0,
      compassLabel: 'SE 135°',
      autoBattle: false,
      turnNumber: 1,
    };
    this.activeUnit = null;
    this.currentMode = 'standby'; // 'standby' | 'menu' | 'move' | 'act' | 'wait' | 'animating'
    this.selectedAbility = null;
    this.targetUnit = null;
    this.hoveredTile = null;
    this.combatForecast = null;
    this.turnQueue = [];

    // Cache of overhead DOM elements keyed by unit ID
    this.overheadMap = new Map();

    // DOM Nodes references
    this.elements = {};

    this._initDOM();
    this._bindEvents();
  }

  /* ========================================================================
     DOM Initialization
     ======================================================================== */

  _initDOM() {
    this.container.innerHTML = '';
    this.container.classList.add('tactics-ui-root');

    // 1. Top Bar
    const topBar = document.createElement('header');
    topBar.className = 'tactics-top-bar';
    topBar.innerHTML = `
      <div class="top-bar-left">
        <div class="top-brand">
          <span class="brand-glyph">✦</span>
          <span>INTDEV TACTICS</span>
          <span class="brand-sub">// 3d.internet.dev × set.world</span>
        </div>
        <div class="seed-badge" id="hud-seed-badge">SEED: 0x1337-TACTICS</div>
      </div>
      <div class="top-bar-center" id="hud-law-slot"></div>
      <div class="top-bar-right">
        <div class="orbs-wallet-badge" id="hud-orbs-wallet" title="Set Orbs Balance">
          <span class="orb-sparkle">✦</span>
          <span id="hud-orbs-count">450</span> ORBS
        </div>
        <button class="hud-btn" id="btn-camera-rot" title="Rotate Camera 45° [Q / E]">
          <span>[Q/E] ↺ 45°</span>
          <span id="hud-compass-label" style="color: var(--azure); font-size: 10px;">SE 135°</span>
        </button>
        <button class="hud-btn gold" id="btn-open-forge" title="Set.world Clan Forge & Barracks [F]">
          <span>✦ [F] Clan Forge</span>
        </button>
        <button class="hud-btn" id="btn-toggle-auto" title="Toggle AI Auto-Battle [A]">
          <span id="hud-auto-label">[A] Auto: OFF</span>
        </button>
        <button class="hud-btn" id="btn-new-seed" title="Generate New Battlefield Seed [R]">
          <span>[R] New Seed</span>
        </button>
      </div>
    `;
    this.container.appendChild(topBar);
    this.elements.topBar = topBar;
    this.elements.lawSlot = topBar.querySelector('#hud-law-slot');

    // 2. CT Turn Order Ribbon (Upcoming 8 turns)
    const turnRibbon = document.createElement('div');
    turnRibbon.className = 'ct-turn-ribbon';
    turnRibbon.id = 'hud-ct-ribbon';
    turnRibbon.innerHTML = `
      <div class="ct-turn-ribbon-label">CT ORDER</div>
      <div class="turn-cards-feed" id="hud-turn-cards-feed" style="display: flex; gap: 6px;"></div>
    `;
    this.container.appendChild(turnRibbon);
    this.elements.turnRibbon = turnRibbon;
    this.elements.turnFeed = turnRibbon.querySelector('#hud-turn-cards-feed');

    // 3. Left Classic FFTA Command Menu
    const commandMenu = document.createElement('div');
    commandMenu.className = 'ffta-command-menu';
    commandMenu.id = 'hud-command-menu';
    commandMenu.style.display = 'none';
    this.container.appendChild(commandMenu);
    this.elements.commandMenu = commandMenu;

    // 4. Status Cards Container (Bottom Attacker Left, Target/Tile Right)
    const statusContainer = document.createElement('div');
    statusContainer.className = 'status-cards-container';
    statusContainer.innerHTML = `
      <div class="unit-status-card active-unit" id="hud-active-card" style="visibility: hidden;"></div>
      <div id="hud-right-card-slot">
        <div class="tile-inspector-card" id="hud-tile-card">
          <div class="tile-inspector-header">
            <span>TERRAIN INSPECTOR</span>
            <span style="color: var(--text-muted);">[STAGE READY]</span>
          </div>
          <div class="tile-inspector-title" id="hud-tile-name">Hover tile or unit</div>
          <div class="tile-inspector-meta" id="hud-tile-meta">
            <span class="tile-inspector-prop">Elev +0</span>
            <span class="tile-inspector-prop">Cost 1.0</span>
          </div>
        </div>
      </div>
    `;
    this.container.appendChild(statusContainer);
    this.elements.statusContainer = statusContainer;
    this.elements.activeCard = statusContainer.querySelector('#hud-active-card');
    this.elements.rightSlot = statusContainer.querySelector('#hud-right-card-slot');

    // 5. Center-Bottom Combat Forecast Panel
    const combatForecast = document.createElement('div');
    combatForecast.className = 'combat-forecast-panel';
    combatForecast.id = 'hud-combat-forecast';
    combatForecast.style.display = 'none';
    this.container.appendChild(combatForecast);
    this.elements.combatForecast = combatForecast;

    // 6. Overhead 3D Bars Container
    const overheadsContainer = document.createElement('div');
    overheadsContainer.className = 'overheads-container';
    this.container.appendChild(overheadsContainer);
    this.elements.overheadsContainer = overheadsContainer;

    // 7. Floating Damage Popups Container
    const popupsContainer = document.createElement('div');
    popupsContainer.className = 'popups-container';
    this.container.appendChild(popupsContainer);
    this.elements.popupsContainer = popupsContainer;

    // 8. Bottom-Right Compact Battle Log
    const battleLog = document.createElement('div');
    battleLog.className = 'battle-log-panel';
    battleLog.innerHTML = `
      <div class="log-header">
        <span>// TACTICAL BATTLE FEED</span>
        <span style="color: var(--text-gold); cursor: pointer;" id="hud-log-clear">CLEAR</span>
      </div>
      <div class="log-feed" id="hud-log-feed"></div>
    `;
    this.container.appendChild(battleLog);
    this.elements.battleLog = battleLog;
    this.elements.logFeed = battleLog.querySelector('#hud-log-feed');

    this.addLog('TACTICS ENGINE INITIALIZED // Ready for combat.', 'system');
  }

  /* ========================================================================
     Event Listeners & Global Keyboard Shortcuts
     ======================================================================== */

  _bindEvents() {
    // Top Bar button clicks
    this.elements.topBar.querySelector('#btn-camera-rot').addEventListener('click', () => {
      this.callbacks.onRotateCamera?.(45);
    });

    this.elements.topBar.querySelector('#btn-open-forge').addEventListener('click', () => {
      this.callbacks.onOpenForge?.();
    });

    this.elements.topBar.querySelector('#btn-toggle-auto').addEventListener('click', () => {
      this.callbacks.onToggleAutoBattle?.();
    });

    this.elements.topBar.querySelector('#btn-new-seed').addEventListener('click', () => {
      this.callbacks.onNewSeed?.();
    });

    this.elements.battleLog.querySelector('#hud-log-clear').addEventListener('click', () => {
      this.elements.logFeed.innerHTML = '';
      this.addLog('Log cleared.', 'system');
    });

    // Global Keydown Handler
    this._onKeyDown = (e) => {
      // Ignore if player is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      switch (e.key.toUpperCase()) {
        case 'Q':
          e.preventDefault();
          this.callbacks.onRotateCamera?.(-45);
          break;
        case 'E':
          e.preventDefault();
          this.callbacks.onRotateCamera?.(45);
          break;
        case 'F':
          e.preventDefault();
          this.callbacks.onOpenForge?.();
          break;
        case 'A':
          e.preventDefault();
          this.callbacks.onToggleAutoBattle?.();
          break;
        case 'R':
          e.preventDefault();
          this.callbacks.onNewSeed?.();
          break;
        case '1':
          if (this.activeUnit && !this.activeUnit.hasMoved && this.currentMode === 'menu') {
            e.preventDefault();
            this.callbacks.onSelectMove?.();
          }
          break;
        case '2':
          if (this.activeUnit && this.currentMode === 'menu') {
            e.preventDefault();
            this.callbacks.onSelectAbility?.();
          }
          break;
        case '3':
          if (this.activeUnit && this.currentMode === 'menu') {
            e.preventDefault();
            this.callbacks.onOpenWaitCompass?.();
          }
          break;
        case '4':
          if (this.activeUnit && this.currentMode === 'menu') {
            e.preventDefault();
            this.callbacks.onOpenForge?.();
          }
          break;
        case 'ENTER':
          if (this.combatForecast) {
            e.preventDefault();
            this.callbacks.onConfirmCombat?.();
          }
          break;
        case 'ESCAPE':
          e.preventDefault();
          this.callbacks.onCancelMode?.();
          break;
      }
    };

    window.addEventListener('keydown', this._onKeyDown);
  }

  /* ========================================================================
     Public API Methods
     ======================================================================== */

  /**
   * Set Top Bar state (seed, orbs, camera, auto-battle, etc.)
   */
  setHeaderState({ seed, orbs, cameraStep, compassLabel, autoBattle, turnNumber } = {}) {
    if (seed !== undefined) {
      this.headerState.seed = seed;
      const seedEl = this.container.querySelector('#hud-seed-badge');
      if (seedEl) seedEl.textContent = `SEED: ${seed}`;
    }
    if (orbs !== undefined) {
      this.headerState.orbs = orbs;
      const orbsEl = this.container.querySelector('#hud-orbs-count');
      if (orbsEl) orbsEl.textContent = Number(orbs).toLocaleString();
    }
    if (compassLabel !== undefined) {
      this.headerState.compassLabel = compassLabel;
      const compEl = this.container.querySelector('#hud-compass-label');
      if (compEl) compEl.textContent = compassLabel;
    }
    if (autoBattle !== undefined) {
      this.headerState.autoBattle = autoBattle;
      const autoBtn = this.container.querySelector('#btn-toggle-auto');
      const autoLbl = this.container.querySelector('#hud-auto-label');
      if (autoBtn && autoLbl) {
        if (autoBattle) {
          autoBtn.classList.add('active');
          autoLbl.textContent = '⚡ [A] Auto: ON';
        } else {
          autoBtn.classList.remove('active');
          autoLbl.textContent = '[A] Auto: OFF';
        }
      }
    }
    if (turnNumber !== undefined) {
      this.headerState.turnNumber = turnNumber;
    }
  }

  /**
   * Updates FFTA Judge Law banner pill in top bar.
   * @param {Object|string|null} law
   */
  updateLawBanner(law) {
    this.activeLaw = law;
    const slot = this.elements.lawSlot || this.container.querySelector('#hud-law-slot');
    if (!slot) return;

    if (!law) {
      slot.innerHTML = '';
      return;
    }

    let title = '';
    let forbidden = '';
    let description = '';

    if (typeof law === 'string') {
      title = law;
      description = 'Infractions incur Judge Yellow Card penalty (-1 Orb, CT penalty)';
    } else {
      title = law.name || 'Law of Chivalry';
      forbidden = law.forbidden || law.forbiddenAction || '';
      description = law.description || (forbidden ? `Forbidden: ${forbidden}` : 'Judge rule active');
    }

    const fullLabel = forbidden && !title.includes(forbidden) ? `${title} — Forbidden: ${forbidden}` : title;

    slot.innerHTML = `
      <div class="judge-law-pill" title="${description} [Infractions incur Judge penalties]">
        <span class="law-scale-glyph">⚖</span>
        <span class="law-title">LAW: ${fullLabel}</span>
      </div>
    `;
  }

  /**
   * Updates horizontal CT Turn Order Ribbon (next 8 upcoming units in chronological order)
   * @param {Array<Object>} queuePreview - array of unit turns
   * @param {Object} [activeUnit] - currently active unit
   */
  updateTurnQueue(queuePreview = [], activeUnit = null) {
    this.turnQueue = queuePreview;
    const feed = this.elements.turnFeed;
    if (!feed) return;

    feed.innerHTML = '';
    const slice = queuePreview.slice(0, 8);

    slice.forEach((entry, idx) => {
      const unit = entry.unit || entry;
      const uId = unit.id || unit.unitId;
      const uClass = unit.className || unit.job || unit.class || 'Warrior';
      const isAzure = (unit.team || 'azure').toLowerCase() === 'azure' || (unit.team || '').toLowerCase() === 'blue';
      const teamClass = isAzure ? 'azure' : 'crimson';
      const teamLabel = isAzure ? 'AZURE' : 'CRIM';
      const activeId = activeUnit ? (activeUnit.id || activeUnit.unitId) : null;
      const isActive = activeId && (uId === activeId || idx === 0);
      const grade = (unit.grade || 'B').toUpperCase();
      const ctVal = Math.min(100, Math.max(0, Math.round(unit.ct ?? 100)));
      const isBoss = !!(unit.isBoss || (unit.team === 'crimson' && (unit.rank === 'COMMANDER' || unit.rank === 'WARLORD')));
      const rawWeapon = unit.heldModelName || unit.weapon?.heldModelName || unit.weaponType || unit.weapon?.weaponType || unit.tool?.name || '';
      const weaponTag = rawWeapon ? rawWeapon.toUpperCase() : '';

      const card = document.createElement('div');
      card.className = `turn-card ${teamClass} ${isActive ? 'active' : ''} ${isBoss ? 'boss-card' : ''}`;
      card.innerHTML = `
        <div class="turn-card-header">
          <span class="turn-team-badge">${isActive ? '✦ TURN' : teamLabel}</span>
          ${isBoss ? '<span class="turn-boss-crown">★ BOSS</span>' : `<span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>`}
        </div>
        <div class="turn-card-body">
          <span class="turn-unit-class" title="${unit.name || 'Unit'}">${uClass}</span>
          ${weaponTag ? `<span class="turn-weapon-tag">[${weaponTag}]</span>` : ''}
        </div>
        <div class="turn-card-ct">
          <span>CT</span>
          <span>${ctVal}%</span>
        </div>
        <div class="turn-ct-bar-track">
          <div class="turn-ct-bar-fill" style="width: ${ctVal}%;"></div>
        </div>
      `;
      feed.appendChild(card);
    });
  }

  /**
   * Sets active unit, command mode, and selected ability.
   * Updates Left Command Menu, ability submenu or wait compass, and Bottom-Left Active Unit Card.
   * @param {Object|null} unit - active unit
   * @param {'standby'|'menu'|'move'|'act'|'wait'|'animating'} mode
   * @param {Object|null} selectedAbility
   */
  setActiveUnit(unit, mode = 'menu', selectedAbility = null) {
    this.activeUnit = unit;
    this.currentMode = mode;
    this.selectedAbility = selectedAbility;

    if (!unit) {
      this.elements.commandMenu.style.display = 'none';
      this.elements.activeCard.style.visibility = 'hidden';
      return;
    }

    const isAzure = (unit.team || 'azure').toLowerCase() === 'azure' || (unit.team || '').toLowerCase() === 'blue';
    this._renderActiveUnitCard(unit);

    // If it's an Azure Clan unit and in interactive mode, display FFTA Command Menu
    if (isAzure && mode !== 'animating' && mode !== 'standby') {
      this._renderCommandMenu(unit, mode, selectedAbility);
      this.elements.commandMenu.style.display = 'flex';
    } else {
      this.elements.commandMenu.style.display = 'none';
    }
  }

  /**
   * Render Bottom-Left Active Unit Card
   */
  _renderActiveUnitCard(unit) {
    const card = this.elements.activeCard;
    card.style.visibility = 'visible';

    const uId = unit.id || unit.unitId;
    const uClass = unit.className || unit.job || unit.class || 'Knight';
    const grade = (unit.grade || 'B').toUpperCase();
    const hp = Math.max(0, unit.hp ?? 100);
    const maxHp = unit.maxHp ?? 100;
    const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));

    const mp = Math.max(0, unit.mp ?? 40);
    const maxMp = unit.maxMp ?? 50;
    const mpPct = Math.min(100, Math.round((mp / maxMp) * 100));

    const ct = Math.min(100, Math.max(0, Math.round(unit.ct ?? 100)));
    const power = unit.powerRating || unit.power || 450;
    const toolName = unit.tool?.name || unit.weapon?.name || unit.heldModelName || unit.weapon || 'Mythril Blade';
    const orbVal = unit.tool?.orbValue || unit.weapon?.orbValue || unit.orbValue || 125;

    // 5 primary stats
    const stats = unit.stats || {};
    const str = stats.str ?? stats.STR ?? stats.physicalDamage ?? 35;
    const dex = stats.dex ?? stats.DEX ?? stats.accuracy ?? 28;
    const int = stats.int ?? stats.INT ?? stats.magicDamage ?? 24;
    const agi = stats.agi ?? stats.AGI ?? (stats.walkSpeed ? Math.round(stats.walkSpeed * 25) : 30);
    const vit = stats.vit ?? stats.VIT ?? 32;

    card.innerHTML = `
      <div class="card-top-row">
        <div>
          <div class="card-unit-name">
            <span>${unit.name || 'Hero'}</span>
            <span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>
          </div>
          <div class="card-unit-class">${uClass} // LV.${unit.level || 1}</div>
        </div>
        <div class="card-power-badge">PWR ${power}</div>
      </div>

      <div class="stat-bars-group">
        <div class="stat-bar-container">
          <div class="stat-bar-label">
            <span style="color: #34d399;">HP</span>
            <span>${hp} / ${maxHp}</span>
          </div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill hp-fill ${hpPct <= 25 ? 'danger' : ''}" style="width: ${hpPct}%;"></div>
          </div>
        </div>

        <div class="stat-bar-container">
          <div class="stat-bar-label">
            <span style="color: #38bdf8;">MP</span>
            <span>${mp} / ${maxMp}</span>
          </div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill mp-fill" style="width: ${mpPct}%;"></div>
          </div>
        </div>

        <div class="stat-bar-container">
          <div class="stat-bar-label">
            <span style="color: #fbbf24;">CT</span>
            <span>${ct}%</span>
          </div>
          <div class="stat-bar-track">
            <div class="stat-bar-fill ct-fill" style="width: ${ct}%;"></div>
          </div>
        </div>
      </div>

      <div class="card-weapon-row">
        <div class="card-weapon-name">
          <span>⚔️</span>
          <span>${toolName}</span>
        </div>
        <div class="card-weapon-orbs">✦ ${orbVal} ORBS</div>
      </div>

      <div class="card-stats-5grid">
        <div class="stat-pill"><span class="stat-pill-label">STR</span><span class="stat-pill-val">${str}</span></div>
        <div class="stat-pill"><span class="stat-pill-label">DEX</span><span class="stat-pill-val">${dex}</span></div>
        <div class="stat-pill"><span class="stat-pill-label">INT</span><span class="stat-pill-val">${int}</span></div>
        <div class="stat-pill"><span class="stat-pill-label">AGI</span><span class="stat-pill-val">${agi}</span></div>
        <div class="stat-pill"><span class="stat-pill-label">VIT</span><span class="stat-pill-val">${vit}</span></div>
      </div>
    `;
  }

  /**
   * Render Left Classic FFTA Command Menu and any active submenu
   */
  _renderCommandMenu(unit, mode, selectedAbility) {
    const menu = this.elements.commandMenu;
    const uClass = unit.className || unit.job || unit.class || 'Knight';
    const hasMoved = !!unit.hasMoved;
    const hasActed = !!unit.hasActed;

    menu.innerHTML = `
      <div class="cmd-header">
        <div class="cmd-header-title">
          <span>⚔️</span>
          <span>${unit.name || 'Hero'} [${uClass}]</span>
        </div>
        <span style="color: var(--text-gold); font-size: 10px;">TURN ACTIVE</span>
      </div>
      <div class="cmd-list">
        <button class="cmd-btn ${mode === 'move' ? 'active' : ''}" id="btn-cmd-move" ${hasMoved ? 'disabled' : ''}>
          <span>1. MOVE</span>
          <span class="cmd-shortcut">${hasMoved ? '[DONE]' : '[1]'}</span>
        </button>
        <button class="cmd-btn ${mode === 'act' ? 'active' : ''}" id="btn-cmd-act" ${hasActed ? 'disabled' : ''}>
          <span>2. ACT / ABILITIES</span>
          <span class="cmd-shortcut">${hasActed ? '[DONE]' : '[2]'}</span>
        </button>
        <button class="cmd-btn ${mode === 'wait' ? 'active' : ''}" id="btn-cmd-wait">
          <span>3. WAIT / END TURN</span>
          <span class="cmd-shortcut">[3]</span>
        </button>
        <button class="cmd-btn" id="btn-cmd-inspect">
          <span>4. INSPECT SHEET</span>
          <span class="cmd-shortcut">[4]</span>
        </button>
        ${mode !== 'menu' ? `
          <button class="cmd-btn" id="btn-cmd-cancel" style="border-color: rgba(244, 63, 94, 0.4); color: #fecdd3;">
            <span>ESC. CANCEL</span>
            <span class="cmd-shortcut">[ESC]</span>
          </button>
        ` : ''}
      </div>
    `;

    // Hook Menu Buttons
    const btnMove = menu.querySelector('#btn-cmd-move');
    if (btnMove && !hasMoved) {
      btnMove.addEventListener('click', () => this.callbacks.onSelectMove?.());
    }

    const btnAct = menu.querySelector('#btn-cmd-act');
    if (btnAct && !hasActed) {
      btnAct.addEventListener('click', () => this.callbacks.onSelectAbility?.());
    }

    const btnWait = menu.querySelector('#btn-cmd-wait');
    if (btnWait) {
      btnWait.addEventListener('click', () => this.callbacks.onOpenWaitCompass?.());
    }

    const btnInspect = menu.querySelector('#btn-cmd-inspect');
    if (btnInspect) {
      btnInspect.addEventListener('click', () => this.callbacks.onOpenForge?.());
    }

    const btnCancel = menu.querySelector('#btn-cmd-cancel');
    if (btnCancel) {
      btnCancel.addEventListener('click', () => this.callbacks.onCancelMode?.());
    }

    // If Mode is ACT: Render Ability Submenu
    if (mode === 'act') {
      this._renderAbilitySubmenu(menu, unit, selectedAbility);
    }

    // If Mode is WAIT: Render 8-Way Directional Compass
    if (mode === 'wait') {
      this._renderWaitCompass(menu, unit);
    }
  }

  /**
   * Render Ability Submenu next to FFTA Command Menu
   */
  _renderAbilitySubmenu(parentMenu, unit, selectedAbility) {
    // Generate default abilities if not present on unit
    const abilities = unit.abilities && unit.abilities.length > 0 ? unit.abilities : [
      { id: 'attack', name: 'Weapon Strike', mp: 0, range: '1', icon: '⚔️', desc: 'Standard physical attack with equipped tool.' },
      { id: 'cleave', name: 'Heavy Cleave', mp: 10, range: '1', icon: '🗡️', desc: 'Devastating strike dealing 140% damage.' },
      { id: 'holy_bolt', name: 'Mythril Burst', mp: 15, range: '1-3', icon: '⚡', desc: 'Ranged mythril shockwave ignoring 20% defense.' },
      { id: 'first_aid', name: 'Tactical Salve', mp: 8, range: '1-2', icon: '💚', desc: 'Restores 35 HP to ally or self.' },
    ];

    const sub = document.createElement('div');
    sub.className = 'ability-submenu';
    sub.innerHTML = `
      <div class="ability-submenu-header">
        <span>// SELECT ABILITY</span>
        <span>MP: ${unit.mp ?? 40}</span>
      </div>
      <div class="ability-list"></div>
    `;

    const list = sub.querySelector('.ability-list');
    abilities.forEach((ab) => {
      const hasMp = (unit.mp ?? 40) >= (ab.mp ?? 0);
      const isSelected = selectedAbility && selectedAbility.id === ab.id;

      const btn = document.createElement('button');
      btn.className = `ability-btn ${isSelected ? 'selected' : ''}`;
      if (!hasMp) btn.disabled = true;

      btn.innerHTML = `
        <div class="ability-btn-row">
          <span class="ability-title">${ab.icon || '⚔️'} ${ab.name}</span>
          <div class="ability-meta">
            <span class="ability-mp-cost" style="${!hasMp ? 'color: #f87171;' : ''}">${ab.mp ? `${ab.mp} MP` : '0 MP'}</span>
            <span class="ability-range">RNG ${ab.range || 1}</span>
          </div>
        </div>
        <div class="ability-desc">${ab.desc || ''}</div>
      `;

      if (hasMp) {
        btn.addEventListener('click', () => {
          this.callbacks.onSelectAbility?.(ab);
        });
      }

      list.appendChild(btn);
    });

    parentMenu.appendChild(sub);
  }

  /**
   * Render 8-Way Directional Wait Facing Compass
   */
  _renderWaitCompass(parentMenu, unit) {
    const currentFacing = unit.facing || 'SE';

    const compass = document.createElement('div');
    compass.className = 'wait-compass';
    compass.innerHTML = `
      <div class="wait-compass-title">FINAL FACING</div>
      <div class="wait-compass-sub">Guard against backstabs (+30% DMG)</div>
      <div class="compass-grid">
        <button class="compass-btn ${currentFacing === 'NW' ? 'active' : ''}" data-dir="NW">↖ NW</button>
        <button class="compass-btn ${currentFacing === 'N' ? 'active' : ''}" data-dir="N">↑ N</button>
        <button class="compass-btn ${currentFacing === 'NE' ? 'active' : ''}" data-dir="NE">↗ NE</button>
        <button class="compass-btn ${currentFacing === 'W' ? 'active' : ''}" data-dir="W">← W</button>
        <div class="compass-btn center-mark">◉</div>
        <button class="compass-btn ${currentFacing === 'E' ? 'active' : ''}" data-dir="E">→ E</button>
        <button class="compass-btn ${currentFacing === 'SW' ? 'active' : ''}" data-dir="SW">↙ SW</button>
        <button class="compass-btn ${currentFacing === 'S' ? 'active' : ''}" data-dir="S">↓ S</button>
        <button class="compass-btn ${currentFacing === 'SE' ? 'active' : ''}" data-dir="SE">↘ SE</button>
      </div>
      <div style="font-size: 9px; color: var(--text-muted); text-align: center;">Click direction to finalize turn</div>
    `;

    compass.querySelectorAll('.compass-btn[data-dir]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const dir = btn.getAttribute('data-dir');
        this.callbacks.onConfirmEndTurn?.(dir);
      });
    });

    parentMenu.appendChild(compass);
  }

  /**
   * Sets inspected target unit, hovered tile, and combat forecast.
   * Updates Bottom-Right Card and Combat Forecast Panel.
   * @param {Object|null} targetUnit
   * @param {Object|null} hoveredTile
   * @param {Object|null} combatForecast
   */
  setInspectedTarget(targetUnit = null, hoveredTile = null, combatForecast = null) {
    this.targetUnit = targetUnit;
    this.hoveredTile = hoveredTile;
    this.combatForecast = combatForecast;

    // 1. Update Combat Forecast Panel
    if (combatForecast) {
      this._renderCombatForecast(combatForecast);
      this.elements.combatForecast.style.display = 'flex';
    } else {
      this.elements.combatForecast.style.display = 'none';
    }

    // 2. Update Bottom-Right Card
    const rightSlot = this.elements.rightSlot;
    if (targetUnit) {
      this._renderDefenderCard(rightSlot, targetUnit);
    } else if (hoveredTile) {
      this._renderTileCard(rightSlot, hoveredTile);
    } else {
      rightSlot.innerHTML = `
        <div class="tile-inspector-card">
          <div class="tile-inspector-header">
            <span>INSPECTION STANDBY</span>
            <span style="color: var(--text-muted);">[STAGE READY]</span>
          </div>
          <div class="tile-inspector-title">Tactical Terrain</div>
          <div class="tile-inspector-meta">
            <span>Hover cursor over tiles or enemy units to inspect</span>
          </div>
        </div>
      `;
    }
  }

  /**
   * Render Bottom-Right Defender Card
   */
  _renderDefenderCard(container, unit) {
    const isAzure = (unit.team || 'azure').toLowerCase() === 'azure' || (unit.team || '').toLowerCase() === 'blue';
    const grade = (unit.grade || 'B').toUpperCase();
    const hp = Math.max(0, unit.hp ?? 100);
    const maxHp = unit.maxHp ?? 100;
    const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));

    const mp = Math.max(0, unit.mp ?? 40);
    const maxMp = unit.maxMp ?? 50;
    const mpPct = Math.min(100, Math.round((mp / maxMp) * 100));

    const ct = Math.min(100, Math.max(0, Math.round(unit.ct ?? 100)));
    const power = unit.powerRating || unit.power || 400;
    const isBoss = !!(unit.isBoss || (unit.team === 'crimson' && (unit.rank === 'COMMANDER' || unit.rank === 'WARLORD')));
    const uClass = unit.className || unit.job || unit.class || 'Warrior';
    const rawWeapon = unit.heldModelName || unit.weapon?.heldModelName || unit.weaponType || unit.weapon?.weaponType || unit.tool?.name || '';
    const weaponModel = rawWeapon ? rawWeapon.toUpperCase() : '';
    const toolName = unit.tool?.name || unit.weapon?.name || (weaponModel ? `${weaponModel} Weapon` : (isAzure ? 'Mythril Blade' : 'Dark Iron Blade'));
    const orbVal = unit.tool?.orbValue || unit.weapon?.orbValue || unit.orbValue || (isAzure ? 125 : 80);

    const stats = unit.stats || {};
    const str = stats.str ?? stats.STR ?? stats.physicalDamage ?? 32;
    const dex = stats.dex ?? stats.DEX ?? stats.accuracy ?? 26;
    const int = stats.int ?? stats.INT ?? stats.magicDamage ?? 20;
    const agi = stats.agi ?? stats.AGI ?? (stats.walkSpeed ? Math.round(stats.walkSpeed * 25) : 28);
    const vit = stats.vit ?? stats.VIT ?? 30;

    container.innerHTML = `
      <div class="unit-status-card target-unit ${isAzure ? 'azure' : 'crimson'} ${isBoss ? 'boss' : ''}">
        <div class="card-top-row">
          <div>
            <div class="card-unit-name">
              <span>${unit.name || 'Defender'}</span>
              ${isBoss ? '<span class="turn-boss-crown">★ BOSS</span>' : `<span class="grade-badge grade-${grade.toLowerCase()}">${grade}</span>`}
            </div>
            <div class="card-unit-class">${uClass} [${isAzure ? 'AZURE CLAN' : 'CRIMSON ORDER'}] ${weaponModel ? `// [${weaponModel}]` : ''}</div>
          </div>
          <div class="card-power-badge">PWR ${power}</div>
        </div>

        <div class="stat-bars-group">
          <div class="stat-bar-container">
            <div class="stat-bar-label">
              <span style="color: ${isAzure ? '#38bdf8' : '#f87171'};">HP</span>
              <span>${hp} / ${maxHp}</span>
            </div>
            <div class="stat-bar-track">
              <div class="stat-bar-fill ${isAzure ? 'azure-fill' : 'crimson-fill'} ${hpPct <= 25 ? 'danger' : ''}" style="width: ${hpPct}%;"></div>
            </div>
          </div>

          <div class="stat-bar-container">
            <div class="stat-bar-label">
              <span style="color: #38bdf8;">MP</span>
              <span>${mp} / ${maxMp}</span>
            </div>
            <div class="stat-bar-track">
              <div class="stat-bar-fill mp-fill" style="width: ${mpPct}%;"></div>
            </div>
          </div>
        </div>

        <div class="card-weapon-row">
          <div class="card-weapon-name">
            <span>${isAzure ? '⚔️' : '☠️'}</span>
            <span>${toolName}</span>
          </div>
          <div class="card-weapon-orbs">✦ ${orbVal} ORBS</div>
        </div>

        <div class="card-stats-5grid">
          <div class="stat-pill"><span class="stat-pill-label">STR</span><span class="stat-pill-val">${str}</span></div>
          <div class="stat-pill"><span class="stat-pill-label">DEX</span><span class="stat-pill-val">${dex}</span></div>
          <div class="stat-pill"><span class="stat-pill-label">INT</span><span class="stat-pill-val">${int}</span></div>
          <div class="stat-pill"><span class="stat-pill-label">AGI</span><span class="stat-pill-val">${agi}</span></div>
          <div class="stat-pill"><span class="stat-pill-label">VIT</span><span class="stat-pill-val">${vit}</span></div>
        </div>
      </div>
    `;
  }

  /**
   * Render Bottom-Right Tile Inspector Card
   */
  _renderTileCard(container, tile) {
    const x = tile.x ?? 0;
    const z = tile.z ?? 0;
    const elev = tile.elevation ?? tile.elev ?? tile.y ?? 0;
    const biome = tile.biome || tile.type || 'Stone Ruins';
    const moveCost = tile.moveCost ?? 1.0;
    const cover = tile.coverBonus ?? (elev > 1 ? '+15%' : '0%');

    container.innerHTML = `
      <div class="tile-inspector-card">
        <div class="tile-inspector-header">
          <span>TERRAIN TILE</span>
          <span style="color: var(--azure);">Coord (${x}, ${z})</span>
        </div>
        <div class="tile-inspector-title">${biome}</div>
        <div class="tile-inspector-meta">
          <span class="tile-inspector-prop">Elev +${elev}</span>
          <span class="tile-inspector-prop">Cost ${moveCost}</span>
          <span class="tile-inspector-prop">Cover ${cover}</span>
        </div>
      </div>
    `;
  }

  /**
   * Render Center-Bottom Combat Forecast Panel
   */
  _renderCombatForecast(forecast) {
    const p = this.elements.combatForecast;
    const atk = forecast.attacker || this.activeUnit || { name: 'Attacker' };
    const def = forecast.defender || this.targetUnit || { name: 'Defender' };
    const abilityName = forecast.abilityName || forecast.ability?.name || 'Weapon Strike';

    const damage = forecast.damage ?? 48;
    const hitRate = forecast.hitRate ?? 92;
    const critRate = forecast.critRate ?? 18;

    const stance = forecast.stance || (forecast.elevDiff > 0 ? 'HIGH (+15%)' : forecast.elevDiff < 0 ? 'LOW (-15%)' : 'MID');
    const angle = forecast.angle || (forecast.isBackstab ? 'BACKSTAB +30%!' : forecast.isFlank ? 'SIDE +15%' : 'FRONT');
    const isBackstab = angle.includes('BACKSTAB');
    const isHigh = stance.includes('HIGH');

    p.innerHTML = `
      <div class="forecast-header">
        <span class="forecast-title">COMBAT FORECAST</span>
        <span class="forecast-ability-tag">⚡ ${abilityName}</span>
      </div>

      <div class="forecast-units-matchup">
        <span class="attacker-name">${atk.name}</span>
        <span class="matchup-arrow">➔</span>
        <span class="defender-name">${def.name}</span>
      </div>

      <div class="forecast-metrics-grid">
        <div class="forecast-metric-cell">
          <span class="forecast-metric-label">Damage</span>
          <span class="forecast-metric-val damage">${damage} DMG</span>
        </div>
        <div class="forecast-metric-cell">
          <span class="forecast-metric-label">Hit Chance</span>
          <span class="forecast-metric-val hit">${hitRate}%</span>
        </div>
        <div class="forecast-metric-cell">
          <span class="forecast-metric-label">Crit Chance</span>
          <span class="forecast-metric-val crit">${critRate}%</span>
        </div>
      </div>

      <div class="forecast-modifiers-row">
        <span>Stance: <span class="forecast-mod-tag ${isHigh ? 'high-ground' : ''}">${stance}</span></span>
        <span>Angle: <span class="forecast-mod-tag ${isBackstab ? 'backstab' : ''}">${angle}</span></span>
      </div>

      <div class="forecast-actions">
        <button class="btn-confirm-strike" id="btn-forecast-confirm">
          ⚔️ CONFIRM STRIKE [ENTER]
        </button>
        <button class="btn-cancel-forecast" id="btn-forecast-cancel">
          CANCEL [ESC]
        </button>
      </div>
    `;

    p.querySelector('#btn-forecast-confirm').addEventListener('click', () => {
      this.callbacks.onConfirmCombat?.();
    });

    p.querySelector('#btn-forecast-cancel').addEventListener('click', () => {
      this.callbacks.onCancelMode?.();
    });
  }

  /**
   * Projects each living unit's 3D head position to 2D screen (x, y) and positions their floating HP bar and active crown.
   * @param {Array<Object>} units - List of units
   * @param {(pos: any) => { x: number, y: number, visible?: boolean }} projectWorldToScreenFn
   */
  updateOverheadBars(units = [], projectWorldToScreenFn) {
    if (!projectWorldToScreenFn) return;

    const seenIds = new Set();
    const container = this.elements.overheadsContainer;

    units.forEach((unit) => {
      const unitId = unit.id || unit.unitId || unit.name;
      seenIds.add(unitId);

      const isDead = unit.isDead || (unit.hp !== undefined && unit.hp <= 0);
      let el = this.overheadMap.get(unitId);

      if (isDead) {
        if (el) {
          el.remove();
          this.overheadMap.delete(unitId);
        }
        return;
      }

      // Project unit position (elevated by standHeight or 1.6 world units above ground)
      const worldPos = unit.group?.position || unit.position || { x: 0, y: 0, z: 0 };
      const headPos = {
        x: worldPos.x,
        y: worldPos.y + (unit.standHeight || 1.6),
        z: worldPos.z,
      };

      const screen = projectWorldToScreenFn(headPos);

      if (!screen || screen.visible === false) {
        if (el) el.style.display = 'none';
        return;
      }

      const isAzure = (unit.team || 'azure').toLowerCase() === 'azure' || (unit.team || '').toLowerCase() === 'blue';
      const isBoss = !!(unit.isBoss || (unit.team === 'crimson' && (unit.rank === 'COMMANDER' || unit.rank === 'WARLORD')));
      const uClass = unit.className || unit.job || unit.class || 'Warrior';
      const rawWeapon = unit.heldModelName || unit.weapon?.heldModelName || unit.weaponType || unit.weapon?.weaponType || unit.tool?.name || '';
      const weaponTag = rawWeapon ? `[${rawWeapon.toUpperCase()}]` : '';

      const activeId = this.activeUnit ? (this.activeUnit.id || this.activeUnit.unitId) : null;
      const isActive = activeId && (unitId === activeId);

      const classNameAttr = `unit-overhead ${isAzure ? 'azure' : 'crimson'} ${isBoss ? 'boss' : ''} ${isActive ? 'active' : ''}`;
      if (!el) {
        el = document.createElement('div');
        el.className = classNameAttr;
        container.appendChild(el);
        this.overheadMap.set(unitId, el);
      } else {
        el.className = classNameAttr;
      }

      el.style.display = 'flex';
      el.style.left = `${Math.round(screen.x)}px`;
      el.style.top = `${Math.round(screen.y)}px`;

      const hp = Math.max(0, unit.hp ?? 100);
      const maxHp = unit.maxHp ?? 100;
      const hpPct = Math.min(100, Math.round((hp / maxHp) * 100));

      if (isAzure) {
        // Azure Clan: Clean royal-blue shield crest (◆), cyan-blue HP fill, crisp white name + class pill
        el.innerHTML = `
          ${isActive ? '<span class="overhead-crown azure-crown">👑</span>' : ''}
          <div class="overhead-pill azure-pill">
            <span class="crest-icon">◆</span>
            <span class="overhead-unit-name">${unit.name || 'Hero'}</span>
            <span class="overhead-class-badge">${uClass}</span>
            ${weaponTag ? `<span class="overhead-weapon-tag">${weaponTag}</span>` : ''}
          </div>
          <div class="overhead-hp-bar azure-bar">
            <div class="overhead-hp-fill azure-fill ${hpPct <= 25 ? 'danger' : ''}" style="width: ${hpPct}%;"></div>
          </div>
        `;
      } else {
        // Crimson Order Enemies: Jagged dark-obsidian & blood-crimson frame with angled/horned corners,
        // crimson-orange HP fill, enemy rank/class badge, and weapon icon
        let roleBadge = `⚔ VANGUARD`;
        if (isBoss) {
          roleBadge = `☠ WARLORD [BOSS]`;
        } else if (/mage|hexer|wizard|arcane/i.test(uClass)) {
          roleBadge = `✦ HEXER`;
        } else if (/sniper|archer|deadeye|hunter|gunner/i.test(uClass)) {
          roleBadge = `⌖ DEADEYE`;
        } else if (/trickster|thief|assassin|shadow/i.test(uClass)) {
          roleBadge = `🗡 SHADOW`;
        } else if (/vanguard|knight|warrior|paladin|guardian/i.test(uClass)) {
          roleBadge = `⚔ VANGUARD`;
        } else {
          roleBadge = `⚔ ${uClass.toUpperCase()}`;
        }

        el.innerHTML = `
          ${isActive ? '<span class="overhead-crown crimson-crown">⚔</span>' : ''}
          <div class="overhead-pill crimson-pill ${isBoss ? 'boss-pill' : ''}">
            <span class="enemy-role-badge">${roleBadge}</span>
            ${weaponTag ? `<span class="enemy-weapon-badge">${weaponTag}</span>` : ''}
          </div>
          <div class="overhead-hp-bar crimson-bar">
            <div class="overhead-hp-fill crimson-fill ${hpPct <= 25 ? 'danger' : ''}" style="width: ${hpPct}%;"></div>
          </div>
        `;
      }
    });

    // Clean up units that are no longer in the list
    for (const [id, el] of this.overheadMap.entries()) {
      if (!seenIds.has(id)) {
        el.remove();
        this.overheadMap.delete(id);
      }
    }
  }

  /**
   * Spawns an animated floating damage, crit, heal, miss, or orb popup.
   * @param {Object} worldPos - 3D or 2D coordinate
   * @param {string|number} text - Display text
   * @param {'damage'|'crit'|'heal'|'miss'|'orbs'} kind
   * @param {(pos: any) => { x: number, y: number }} [projectWorldToScreenFn]
   */
  spawnFloatingText(worldPos, text, kind = 'damage', projectWorldToScreenFn = null) {
    let screenX = 0;
    let screenY = 0;

    if (worldPos && typeof worldPos.x === 'number' && typeof worldPos.y === 'number' && !projectWorldToScreenFn) {
      screenX = worldPos.x;
      screenY = worldPos.y;
    } else if (projectWorldToScreenFn) {
      const pos = {
        x: worldPos.x || 0,
        y: (worldPos.y || 0) + 1.2,
        z: worldPos.z || 0,
      };
      const screen = projectWorldToScreenFn(pos);
      if (screen) {
        screenX = screen.x;
        screenY = screen.y;
      }
    }

    // Add slight random jitter
    screenX += (Math.random() - 0.5) * 20;
    screenY += (Math.random() - 0.5) * 10;

    const popup = document.createElement('div');
    popup.className = `floating-popup popup-${kind}`;
    popup.style.left = `${Math.round(screenX)}px`;
    popup.style.top = `${Math.round(screenY)}px`;

    let content = text;
    if (kind === 'damage') content = `-${text}`;
    else if (kind === 'heal') content = `+${text} HP`;
    else if (kind === 'crit') content = `-${text} CRIT!`;
    else if (kind === 'orbs') content = `+${text} ✦ ORBS`;

    popup.textContent = content;
    this.elements.popupsContainer.appendChild(popup);

    setTimeout(() => {
      popup.remove();
    }, 1200);
  }

  /**
   * Appends an entry to the tactical battle feed.
   * @param {string} message
   * @param {'info'|'combat'|'loot'|'system'} kind
   */
  addLog(message, kind = 'info') {
    const feed = this.elements.logFeed;
    if (!feed) return;

    const entry = document.createElement('div');
    entry.className = `log-entry ${kind}`;

    const tag = `[${kind.toUpperCase()}]`;
    entry.innerHTML = `
      <span class="log-tag">${tag}</span>
      <span>${message}</span>
    `;

    feed.appendChild(entry);
    feed.scrollTop = feed.scrollHeight;
  }

  /**
   * Shows Victory / Defeat Overlay Banner
   * @param {'azure'|'crimson'} winningTeam
   * @param {Object} statsSummary
   * @param {() => void} [onPlayAgain]
   */
  showVictoryBanner(winningTeam, statsSummary = {}, onPlayAgain = null) {
    const isAzure = (winningTeam || 'azure').toLowerCase() === 'azure' || (winningTeam || '').toLowerCase() === 'blue';

    const banner = document.createElement('div');
    banner.className = 'victory-banner-backdrop';
    banner.innerHTML = `
      <div class="victory-banner-card">
        <div class="victory-title" style="color: ${isAzure ? 'var(--text-gold-bright)' : '#f87171'};">
          ${isAzure ? '✦ VICTORY ACHIEVED ✦' : '⚔️ DEFEAT ⚔️'}
        </div>
        <div class="victory-subtitle">
          ${isAzure ? 'AZURE CLAN STANDS TRIUMPHANT // BATTLEFIELD SECURED' : 'CRIMSON FORCES OVERRAN THE STAGE'}
        </div>

        <div class="victory-stats-grid">
          <div class="victory-stat-item">
            <span class="victory-stat-label">Total Turns</span>
            <span class="victory-stat-value">${statsSummary.turns || this.headerState.turnNumber || 1}</span>
          </div>
          <div class="victory-stat-item">
            <span class="victory-stat-label">Damage Dealt</span>
            <span class="victory-stat-value">${statsSummary.damageDealt || 342} DMG</span>
          </div>
          <div class="victory-stat-item">
            <span class="victory-stat-label">Crits Landed</span>
            <span class="victory-stat-value">${statsSummary.crits || 4}</span>
          </div>
          <div class="victory-stat-item">
            <span class="victory-stat-label">Set Orbs Won</span>
            <span class="victory-stat-value" style="color: var(--text-gold);">+${statsSummary.orbsWon || 150} ✦</span>
          </div>
        </div>

        <button class="btn-play-again" id="btn-banner-restart">
          PLAY AGAIN // NEXT BATTLEFIELD [ENTER]
        </button>
      </div>
    `;

    document.body.appendChild(banner);

    const restartBtn = banner.querySelector('#btn-banner-restart');
    const handleRestart = () => {
      banner.remove();
      if (onPlayAgain) onPlayAgain();
      else this.callbacks.onNewSeed?.();
    };

    restartBtn.addEventListener('click', handleRestart);

    const keyListener = (e) => {
      if (e.key === 'Enter') {
        window.removeEventListener('keydown', keyListener);
        handleRestart();
      }
    };
    window.addEventListener('keydown', keyListener);
  }

  /**
   * Destroys the HUD, clears DOM, and unbinds listeners.
   */
  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    this.container.innerHTML = '';
    this.overheadMap.clear();
  }
}
