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

import {
  STRATAGEM_RULE_STAMP,
  STRATAGEM_CONDITIONS,
  STRATAGEM_ACTIONS,
  evaluateLawCompliance,
  getUnitArchetype,
  createDefaultStratagem,
  exportStratagemJSON,
  importStratagemJSON,
  evaluateUnitStratagem
} from '../game/stratagem-engine.js';

export {
  STRATAGEM_RULE_STAMP,
  STRATAGEM_CONDITIONS,
  STRATAGEM_ACTIONS,
  evaluateLawCompliance,
  getUnitArchetype,
  createDefaultStratagem,
  exportStratagemJSON,
  importStratagemJSON,
  evaluateUnitStratagem
};

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
      const { matchedRule, targetUnit, target, moveTile, ability, skill } = simResult;
      const targetEntity = targetUnit || target;
      const activeAbility = ability || skill;
      const condLabel = matchedRule.conditionLabel || matchedRule.label || matchedRule.condition;
      const actLabel = matchedRule.actionLabel || matchedRule.action;
      const ruleIdx = matchedRule.index ?? 0;
      simBox.innerHTML = `
        <div class="sim-match-badge match-found">
          <span>🎯 MATCHED RULE #${ruleIdx + 1}</span>
          <span style="font-size: 10px;">PRIORITY 1st MATCH</span>
        </div>
        <div class="sim-details-grid">
          <div class="sim-cell">
            <span class="sim-cell-lbl">TRIGGERED CONDITION</span>
            <span class="sim-cell-val" style="color: #38bdf8;">${condLabel}</span>
          </div>
          <div class="sim-cell">
            <span class="sim-cell-lbl">EXECUTED ACTION</span>
            <span class="sim-cell-val" style="color: #fbbf24;">${actLabel}</span>
          </div>
          <div class="sim-cell">
            <span class="sim-cell-lbl">TARGET SELECTION</span>
            <span class="sim-cell-val" style="color: #f43f5e;">${targetEntity ? (targetEntity.name || targetEntity.id) : 'Self / Ground'}</span>
          </div>
          <div class="sim-cell">
            <span class="sim-cell-lbl">CHOSEN ABILITY</span>
            <span class="sim-cell-val" style="color: #34d399;">${activeAbility ? (activeAbility.name || activeAbility.id) : 'Basic Attack'}</span>
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
