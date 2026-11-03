/**
 * INTDEV TACTICS — Interactive Sprite Animation & SEQ/SHP/PAT Studio Modal
 * 3d.internet.dev × set.world
 *
 * 3-Column Studio:
 * 1. Sequence Catalog & Unit Class Palette Tint Selector
 * 2. 4× Pixel-Art Preview Canvas, Transport Scrubber & Interactive Frame Timeline Strip
 * 3. SHP Metadata, 6-Layer PAT Table & Custom a1.png Hot-Drop Sheet Validator
 */

import * as UnitActorModule from '../stage/unit-actor.js';
const PALETTE_MAPPINGS = UnitActorModule.PALETTE_MAPPINGS || {};
const UnitActor = UnitActorModule.UnitActor || null;

import * as stageSpriteData from '../stage/sprite-studio-data.js';

/**
 * Fallback / Core helper to catalog sequences with categories and opcodes
 */
export function getSequenceCatalog(spriteData) {
  if (stageSpriteData?.getSequenceCatalog) {
    try {
      return stageSpriteData.getSequenceCatalog(spriteData);
    } catch (_) {}
  }

  if (!spriteData?.sequences) return [];

  // Map category by sequence name keywords
  const animMap = new Map();
  if (spriteData.animations) {
    for (const anim of spriteData.animations) {
      if (anim.name) animMap.set(anim.name.toLowerCase(), anim);
    }
  }

  return spriteData.sequences
    .filter((s) => s && s.name && s.name !== 'Null')
    .map((s, idx) => {
      const anim = animMap.get(s.name.toLowerCase());
      const totalTicks = (s.ticks || []).reduce((a, b) => a + b, 0);

      let category = anim?.category || 'Locomotion & Poses';
      const n = s.name.toLowerCase();

      if (n.includes('attack') || n.includes('swing') || n.includes('punch') || n.includes('combo') || n.includes('strike') || n.includes('stab') || n.includes('cleave') || n.includes('slash')) {
        category = 'Melee & Combos';
      } else if (n.includes('bow') || n.includes('gun') || n.includes('shoot') || n.includes('throw') || n.includes('rifle') || n.includes('arrow') || n.includes('shield')) {
        category = 'Weapons & Ranged';
      } else if (n.includes('cast') || n.includes('magic') || n.includes('spell') || n.includes('chant') || n.includes('sing') || n.includes('dance') || n.includes('talk') || n.includes('song') || n.includes('cadence')) {
        category = 'Magic, Bard & Talk';
      } else if (n.includes('hit') || n.includes('hurt') || n.includes('dead') || n.includes('ko') || n.includes('crit') || n.includes('flinch') || n.includes('fall') || n.includes('counter')) {
        category = 'Reactions & KO';
      } else if (n.includes('walk') || n.includes('idle') || n.includes('run') || n.includes('jump') || n.includes('pose') || n.includes('rotate') || n.includes('float')) {
        category = 'Locomotion & Poses';
      }

      return {
        seqIndex: idx,
        name: s.name,
        category: category,
        frames: s.frames || [],
        ticks: s.ticks || [],
        totalTicks: totalTicks,
        loop: !!s.loop || !!anim?.loop,
        hitTick: anim?.hitTick ?? null,
      };
    });
}

/**
 * Fallback / Core helper to extract frame cards for the Timeline Strip
 */
export function getSequenceFrameStrip(spriteData, seqName) {
  if (stageSpriteData?.getSequenceFrameStrip) {
    try {
      return stageSpriteData.getSequenceFrameStrip(spriteData, seqName);
    } catch (_) {}
  }

  if (!spriteData?.sequences) return [];
  const seq = spriteData.sequences.find((s) => s && s.name && s.name.toLowerCase() === seqName.toLowerCase());
  if (!seq) return [];

  let accumulatedTick = 0;
  return seq.frames.map((frameId, stepIdx) => {
    const ticks = seq.ticks[stepIdx] || 6;
    const isHit = ticks > 0 && stepIdx === Math.floor(seq.frames.length / 2);
    const hasSound = stepIdx === 0 || isHit;
    const isLoop = stepIdx === seq.frames.length - 1 && !!seq.loop;
    accumulatedTick += ticks;

    return {
      stepIndex: stepIdx,
      frameId: frameId,
      ticks: ticks,
      durationSec: (ticks / 60).toFixed(2),
      isHit,
      hasSound,
      isLoop,
      totalTickAtStep: accumulatedTick,
    };
  });
}

/**
 * Diagnostic sheet validator for custom a1.png uploads
 */
export function validateCustomSpriteSheet(imgElement) {
  if (stageSpriteData?.validateCustomSpriteSheet) {
    try {
      return stageSpriteData.validateCustomSpriteSheet(imgElement);
    } catch (_) {}
  }

  const w = imgElement.naturalWidth || imgElement.width || 0;
  const h = imgElement.naturalHeight || imgElement.height || 0;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(imgElement, 0, 0);

  let imgData = null;
  try {
    imgData = ctx.getImageData(0, 0, w, h);
  } catch (err) {
    return {
      ok: false,
      errors: [{ message: 'Canvas security error reading pixel data: ' + err.message }],
      warnings: [],
      colors: 0,
      width: w,
      height: h,
    };
  }

  const data = imgData.data;
  const colorSet = new Set();
  let partialAlphaCount = 0;
  let nonZeroPixels = 0;

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a !== 0) {
      nonZeroPixels++;
      const rgb = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
      colorSet.add(rgb);
      if (a !== 255) partialAlphaCount++;
    }
  }

  const errors = [];
  const warnings = [];

  // Check dimensions: 256x488 (standard TYPE1) or 480x2688 (expanded atlas)
  const isType1Dims = (w === 256 && h === 488);
  const isExpandedDims = (w === 480 && h === 2688);

  if (!isType1Dims && !isExpandedDims) {
    warnings.push({
      code: 'custom-dims',
      message: `Image dimensions ${w}×${h} deviate from standard 256×488 TYPE1 or 480×2688 atlas format.`,
    });
  }

  if (partialAlphaCount > 0) {
    warnings.push({
      code: 'partial-alpha',
      message: `${partialAlphaCount} pixels with partial alpha detected. Sprites are alpha-tested (0 or 255).`,
    });
  }

  if (colorSet.size > 16) {
    warnings.push({
      code: 'many-colors',
      message: `${colorSet.size} distinct colors found. TYPE1 uses 15 colors + 1 transparent index per cell.`,
    });
  }

  if (nonZeroPixels === 0) {
    errors.push({
      code: 'empty-sheet',
      message: 'The uploaded sprite sheet contains no visible pixels.',
    });
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    colors: colorSet.size,
    width: w,
    height: h,
    nonZeroPixels,
  };
}

export class SpriteStudioModal {
  /**
   * @param {HTMLElement} containerEl
   * @param {Object} callbacks
   * @param {(seqName: string) => void} [callbacks.onSyncToActor]
   * @param {(dataUrl: string) => void} [callbacks.onApplyCustomSheet]
   * @param {() => void} [callbacks.onClose]
   */
  constructor(containerEl = document.body, callbacks = {}) {
    this.container = containerEl;
    this.callbacks = callbacks;

    this.isOpen = false;
    this.modalEl = null;

    // Sprite Data & Atlas
    this.spriteData = null;
    this.cellsById = new Map();
    this.baseImage = null;
    this.customDataUrl = null;

    // Active state
    this.units = [
      { id: 'unit-1', name: 'Aveline Stalwart', job: 'Paladin', team: 'azure', paletteId: 'azure_paladin' },
      { id: 'unit-2', name: 'Caelen Hawkeye', job: 'Sniper', team: 'azure', paletteId: 'azure_ranger' },
      { id: 'unit-3', name: 'Lyra Stardancer', job: 'Arcane Mage', team: 'azure', paletteId: 'azure_mage' },
      { id: 'unit-4', name: 'Garrick Shadowstep', job: 'Trickster', team: 'azure', paletteId: 'azure_knight' },
      { id: 'enemy-1', name: 'Blood Sovereign', job: 'Warlord Boss', team: 'crimson', paletteId: 'crimson_warlord' },
      { id: 'enemy-2', name: 'Iron Juggernaut', job: 'Vanguard', team: 'crimson', paletteId: 'crimson_vanguard' },
      { id: 'enemy-3', name: 'Void Hexer', job: 'Caster', team: 'crimson', paletteId: 'crimson_hexer' },
      { id: 'enemy-4', name: 'Night Deadeye', job: 'Sniper', team: 'crimson', paletteId: 'crimson_deadeye' },
    ];
    this.selectedUnitId = 'unit-1';

    // Sequence Catalog State
    this.allSequences = [];
    this.activeCategory = 'All';
    this.searchQuery = '';
    this.activeSeqName = 'Walk';

    // Playback & Scrubber State
    this.currentStep = 0;
    this.isPlaying = true;
    this.playbackSpeed = 1.0;
    this.showGrid = true;
    this.showFootAnchor = true;
    this.syncToBoard = false;
    this.animTimer = null;
    this.tickAcc = 0;

    // Tinted Canvases Cache: paletteId -> HTMLCanvasElement
    this.tintedAtlasCache = new Map();

    this._onKeyDown = (e) => {
      if (!this.isOpen) return;
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === ' ' || e.code === 'Space') {
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
        e.preventDefault();
        this.togglePlayPause();
      } else if (e.key === 'ArrowLeft') {
        this.step(-1);
      } else if (e.key === 'ArrowRight') {
        this.step(1);
      }
    };
  }

  /**
   * Initialize or update with game data
   * @param {Object} spriteData - from tactics-sprite-data.json
   * @param {Array} [gameUnits] - active Clan & Enemy units
   */
  async loadSpriteData(spriteData, gameUnits = null) {
    this.spriteData = spriteData;
    if (spriteData?.cells) {
      this.cellsById.clear();
      for (const c of spriteData.cells) {
        this.cellsById.set(c.id, c);
      }
    }

    if (gameUnits && Array.isArray(gameUnits) && gameUnits.length > 0) {
      this.units = gameUnits.map((u, i) => {
        const isAzure = (u.team || 'azure') === 'azure' || u.team === 'blue';
        const defaultPalette = isAzure
          ? (i === 0 ? 'azure_knight' : i === 1 ? 'azure_mage' : i === 2 ? 'azure_ranger' : 'azure_paladin')
          : (i === 0 ? 'crimson_warlord' : i === 1 ? 'crimson_vanguard' : i === 2 ? 'crimson_hexer' : 'crimson_deadeye');
        return {
          id: u.id || `u-${i}`,
          name: u.name || `Unit ${i + 1}`,
          job: u.job || u.className || 'Tactician',
          team: isAzure ? 'azure' : 'crimson',
          paletteId: u.paletteId || defaultPalette,
        };
      });
      this.selectedUnitId = this.units[0].id;
    }

    this.allSequences = getSequenceCatalog(this.spriteData);
    if (!this.allSequences.some((s) => s.name === this.activeSeqName) && this.allSequences.length > 0) {
      this.activeSeqName = this.allSequences[0].name;
    }

    // Load base a1.png
    await this._loadBaseImage();
  }

  async _loadBaseImage() {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        this.baseImage = img;
        this.tintedAtlasCache.clear();
        resolve(img);
      };
      img.onerror = () => {
        console.warn('[SpriteStudio] Could not load /a1.png, falling back to empty canvas');
        this.baseImage = document.createElement('canvas');
        this.baseImage.width = 256;
        this.baseImage.height = 488;
        resolve(this.baseImage);
      };
      img.src = this.customDataUrl || '/a1.png';
    });
  }

  /**
   * Get or generate the pixel-level palette tinted atlas for a specific unit
   */
  _getTintedAtlas(paletteId) {
    if (!paletteId) paletteId = 'azure_knight';
    if (this.tintedAtlasCache.has(paletteId)) {
      return this.tintedAtlasCache.get(paletteId);
    }

    if (!this.baseImage) return null;

    const w = this.baseImage.naturalWidth || this.baseImage.width || 256;
    const h = this.baseImage.naturalHeight || this.baseImage.height || 488;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(this.baseImage, 0, 0);

    const mapping = PALETTE_MAPPINGS?.[paletteId];
    if (mapping) {
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const a = data[i + 3];
        if (a === 0) continue;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const hex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
        const target = mapping[hex];
        if (target !== undefined) {
          data[i] = (target >> 16) & 0xff;
          data[i + 1] = (target >> 8) & 0xff;
          data[i + 2] = target & 0xff;
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }

    this.tintedAtlasCache.set(paletteId, canvas);
    return canvas;
  }

  open() {
    this.isOpen = true;
    if (!this.modalEl) {
      this._buildDOM();
    } else {
      this.modalEl.style.display = 'flex';
      this._updateUnitSelector();
      this._renderSequenceList();
      this._updateTimelineStrip();
      this._updateMetadataAndPAT();
    }
    window.addEventListener('keydown', this._onKeyDown);
    this._startLoop();
  }

  close() {
    this.isOpen = false;
    this._stopLoop();
    if (this.modalEl) {
      this.modalEl.style.display = 'none';
    }
    window.removeEventListener('keydown', this._onKeyDown);
    this.callbacks.onClose?.();
  }

  _startLoop() {
    this._stopLoop();
    let lastTime = performance.now();

    const loop = (time) => {
      if (!this.isOpen) return;
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      if (this.isPlaying) {
        this.tickAcc += dt * 60 * this.playbackSpeed;
        const strip = getSequenceFrameStrip(this.spriteData, this.activeSeqName);
        if (strip.length > 0) {
          const currentDuration = strip[this.currentStep]?.ticks || 6;
          if (this.tickAcc >= currentDuration) {
            this.tickAcc = 0;
            this.currentStep = (this.currentStep + 1) % strip.length;
            this._renderPreviewFrame();
            this._updateTimelineActiveCard();
            this._updateMetadataAndPAT();
            if (this.syncToBoard) {
              this._syncCurrentFrameToBoard();
            }
          }
        }
      }

      this._renderPreviewFrame();
      this.animTimer = requestAnimationFrame(loop);
    };

    this.animTimer = requestAnimationFrame(loop);
  }

  _stopLoop() {
    if (this.animTimer) {
      cancelAnimationFrame(this.animTimer);
      this.animTimer = null;
    }
  }

  togglePlayPause() {
    this.isPlaying = !this.isPlaying;
    const btn = this.modalEl?.querySelector('#studio-btn-play');
    if (btn) btn.textContent = this.isPlaying ? '⏸ PAUSE' : '▶ PLAY';
  }

  step(dir) {
    this.isPlaying = false;
    const btn = this.modalEl?.querySelector('#studio-btn-play');
    if (btn) btn.textContent = '▶ PLAY';

    const strip = getSequenceFrameStrip(this.spriteData, this.activeSeqName);
    if (strip.length === 0) return;

    this.currentStep = (this.currentStep + dir + strip.length) % strip.length;
    this._renderPreviewFrame();
    this._updateTimelineActiveCard();
    this._updateMetadataAndPAT();
    if (this.syncToBoard) {
      this._syncCurrentFrameToBoard();
    }
  }

  /* ========================================================================
     DOM Construction
     ======================================================================== */

  _buildDOM() {
    const backdrop = document.createElement('div');
    backdrop.className = 'sprite-studio-backdrop';

    backdrop.innerHTML = `
      <div class="sprite-studio-modal">
        <!-- Top Bar -->
        <header class="studio-header">
          <div class="studio-header-title">
            <span style="color: var(--text-gold); font-size: 16px;">🎞️</span>
            <span>3D.INTERNET.DEV // TYPE1 SPRITE & SEQ STUDIO</span>
            <span style="color: var(--text-muted); font-size: 10px;">[58+ SEQUENCES / 6-LAYER PAT / 4× CANVAS]</span>
          </div>
          <div class="studio-header-meta">
            <button class="hud-btn" id="studio-btn-close" style="padding: 4px 10px; font-weight: 800;">✕ ESC</button>
          </div>
        </header>

        <!-- 3-Column Body -->
        <div class="studio-body">
          <!-- Col 1: Left Sequence Catalog -->
          <aside class="studio-col-left">
            <div class="studio-unit-selector-bar">
              <label style="font-size: 9px; font-weight: 800; color: var(--text-muted); text-transform: uppercase;">Palette Tint Preview:</label>
              <select class="studio-unit-select" id="studio-unit-select"></select>
            </div>
            <div class="studio-search-row">
              <input type="text" class="studio-search-input" id="studio-search-input" placeholder="🔍 Search sequences (e.g. Walk, Attack)..." />
            </div>
            <div class="studio-cat-tabs" id="studio-cat-tabs">
              <button class="studio-cat-btn active" data-cat="All">All</button>
              <button class="studio-cat-btn" data-cat="Locomotion & Poses">Locomotion</button>
              <button class="studio-cat-btn" data-cat="Melee & Combos">Melee/Combos</button>
              <button class="studio-cat-btn" data-cat="Weapons & Ranged">Weapons</button>
              <button class="studio-cat-btn" data-cat="Magic, Bard & Talk">Magic/Bard</button>
              <button class="studio-cat-btn" data-cat="Reactions & KO">Reactions</button>
            </div>
            <div class="studio-seq-list" id="studio-seq-list"></div>
          </aside>

          <!-- Col 2: Center 4x Pixel Art Canvas & Timeline -->
          <main class="studio-col-center">
            <div class="studio-canvas-stage">
              <div class="studio-canvas-overlays">
                <button class="studio-overlay-btn ${this.showGrid ? 'active' : ''}" id="btn-toggle-grid"># 96×96 Grid</button>
                <button class="studio-overlay-btn ${this.showFootAnchor ? 'active' : ''}" id="btn-toggle-crosshair">✛ Foot Anchor</button>
              </div>

              <div class="studio-canvas-container">
                <!-- 96x96 viewport scaled 3x/4x crisp pixel art -->
                <canvas class="studio-pixel-canvas" id="studio-canvas" width="288" height="288"></canvas>
              </div>

              <div class="studio-canvas-info-tag" id="studio-canvas-tag">
                Seq: ${this.activeSeqName} // Step: 1/1 // Frame: F0
              </div>
            </div>

            <!-- Transport Scrubber Bar -->
            <div class="studio-transport-bar">
              <div class="transport-buttons-group">
                <button class="transport-btn" id="studio-btn-prev" title="Step -1 [←]">⏮ -1</button>
                <button class="transport-btn primary" id="studio-btn-play" title="Play/Pause [Space]">⏸ PAUSE</button>
                <button class="transport-btn" id="studio-btn-next" title="Step +1 [→]">⏭ +1</button>
                <select class="transport-speed-select" id="studio-speed-select">
                  <option value="0.25">0.25×</option>
                  <option value="0.5">0.5×</option>
                  <option value="1.0" selected>1.0×</option>
                  <option value="2.0">2.0×</option>
                </select>
              </div>

              <button class="transport-btn transport-btn-sync ${this.syncToBoard ? 'syncing' : ''}" id="studio-btn-sync" title="Sync sequence live to active 3D Unit on board">
                🎯 SYNC TO 3D UNIT
              </button>
            </div>

            <!-- Frame Timeline Strip -->
            <div class="studio-timeline-container">
              <div class="timeline-header">
                <span>// INTERACTIVE FRAME TIMELINE STRIP</span>
                <span id="studio-timeline-counter" style="color: var(--text-gold);">1 of 1 STEPS</span>
              </div>
              <div class="timeline-strip" id="studio-timeline-strip"></div>
            </div>
          </main>

          <!-- Col 3: Right SHP & 6-Layer PAT Table, Custom Sheet Hot-Drop -->
          <aside class="studio-col-right">
            <!-- SHP Info & PAT Table -->
            <div>
              <div class="studio-section-title">
                <span>✦ SHP FRAME & 6-LAYER PAT</span>
                <span id="pat-frame-badge" style="color: var(--azure); font-size: 10px;">F0</span>
              </div>
              <div class="pat-table-container">
                <table class="pat-table">
                  <thead>
                    <tr>
                      <th>Layer</th>
                      <th>Tile</th>
                      <th>Pos</th>
                      <th>Dim</th>
                      <th>Δx/Δy</th>
                      <th>Flip</th>
                    </tr>
                  </thead>
                  <tbody id="studio-pat-tbody"></tbody>
                </table>
              </div>
            </div>

            <!-- Hot-Drop Custom a1.png -->
            <div>
              <div class="studio-section-title">
                <span>📁 CUSTOM A1.PNG HOT-DROP</span>
                <button class="hud-btn" id="btn-reset-sheet" style="padding: 2px 6px; font-size: 8px;">🔄 RESET</button>
              </div>
              <div class="hotdrop-zone" id="hotdrop-zone">
                <input type="file" id="hotdrop-file-input" accept="image/png" style="display: none;" />
                <div class="hotdrop-title">📂 Drag & Drop custom a1.png</div>
                <div class="hotdrop-sub">Click to browse // Evaluates check-sheet.mjs rules</div>
              </div>
              <div class="hotdrop-report" id="hotdrop-report" style="display: none;"></div>
            </div>
          </aside>
        </div>
      </div>
    `;

    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this.close();
    });

    backdrop.querySelector('#studio-btn-close').addEventListener('click', () => this.close());

    // Unit selector
    const unitSelect = backdrop.querySelector('#studio-unit-select');
    unitSelect.addEventListener('change', (e) => {
      this.selectedUnitId = e.target.value;
      this._renderPreviewFrame();
      this._updateMetadataAndPAT();
    });

    // Search input
    const searchInput = backdrop.querySelector('#studio-search-input');
    searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase().trim();
      this._renderSequenceList();
    });

    // Category tabs
    backdrop.querySelectorAll('.studio-cat-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        backdrop.querySelectorAll('.studio-cat-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.activeCategory = btn.getAttribute('data-cat');
        this._renderSequenceList();
      });
    });

    // Transport buttons
    backdrop.querySelector('#studio-btn-play').addEventListener('click', () => this.togglePlayPause());
    backdrop.querySelector('#studio-btn-prev').addEventListener('click', () => this.step(-1));
    backdrop.querySelector('#studio-btn-next').addEventListener('click', () => this.step(1));

    const speedSelect = backdrop.querySelector('#studio-speed-select');
    speedSelect.addEventListener('change', (e) => {
      this.playbackSpeed = parseFloat(e.target.value) || 1.0;
    });

    const syncBtn = backdrop.querySelector('#studio-btn-sync');
    syncBtn.addEventListener('click', () => {
      this.syncToBoard = !this.syncToBoard;
      syncBtn.classList.toggle('syncing', this.syncToBoard);
      syncBtn.textContent = this.syncToBoard ? '🎯 SYNCING LIVE' : '🎯 SYNC TO 3D UNIT';
      if (this.syncToBoard) {
        this.callbacks.onSyncToActor?.(this.activeSeqName);
      }
    });

    // Overlays
    const gridBtn = backdrop.querySelector('#btn-toggle-grid');
    gridBtn.addEventListener('click', () => {
      this.showGrid = !this.showGrid;
      gridBtn.classList.toggle('active', this.showGrid);
      this._renderPreviewFrame();
    });

    const crossBtn = backdrop.querySelector('#btn-toggle-crosshair');
    crossBtn.addEventListener('click', () => {
      this.showFootAnchor = !this.showFootAnchor;
      crossBtn.classList.toggle('active', this.showFootAnchor);
      this._renderPreviewFrame();
    });

    // Hot-Drop file upload
    const dropZone = backdrop.querySelector('#hotdrop-zone');
    const fileInput = backdrop.querySelector('#hotdrop-file-input');
    const btnReset = backdrop.querySelector('#btn-reset-sheet');

    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        this._handleUploadedSheet(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        this._handleUploadedSheet(e.target.files[0]);
      }
    });

    btnReset.addEventListener('click', () => {
      this.customDataUrl = null;
      this._loadBaseImage().then(() => {
        this._renderPreviewFrame();
        this._updateMetadataAndPAT();
        const report = backdrop.querySelector('#hotdrop-report');
        if (report) {
          report.style.display = 'block';
          report.className = 'hotdrop-report valid';
          report.innerHTML = '<span>🔄 Reset to default <strong>/a1.png</strong>.</span>';
        }
        if (typeof UnitActor?.applyCustomSpriteSheet === 'function') {
          UnitActor.applyCustomSpriteSheet('/a1.png');
        }
        this.callbacks.onApplyCustomSheet?.('/a1.png');
      });
    });

    this.container.appendChild(backdrop);
    this.modalEl = backdrop;

    this._updateUnitSelector();
    this._renderSequenceList();
    this._updateTimelineStrip();
    this._updateMetadataAndPAT();
  }

  _updateUnitSelector() {
    const sel = this.modalEl?.querySelector('#studio-unit-select');
    if (!sel) return;
    sel.innerHTML = this.units
      .map(
        (u) =>
          `<option value="${u.id}" ${u.id === this.selectedUnitId ? 'selected' : ''}>
            [${u.team.toUpperCase()}] ${u.name} — ${u.job} (${u.paletteId})
          </option>`
      )
      .join('');
  }

  _renderSequenceList() {
    const list = this.modalEl?.querySelector('#studio-seq-list');
    if (!list) return;
    list.innerHTML = '';

    const filtered = this.allSequences.filter((s) => {
      const matchCat = this.activeCategory === 'All' || s.category === this.activeCategory;
      const matchSearch = !this.searchQuery || s.name.toLowerCase().includes(this.searchQuery);
      return matchCat && matchSearch;
    });

    filtered.forEach((seq) => {
      const item = document.createElement('div');
      item.className = `studio-seq-item ${seq.name === this.activeSeqName ? 'active' : ''}`;
      item.innerHTML = `
        <span style="font-weight: 600;">${seq.name}</span>
        <div style="display: flex; gap: 4px; align-items: center;">
          <span class="studio-seq-badge">${(seq.frames?.length ?? seq.stepCount ?? 0)}F</span>
          <span class="studio-seq-badge" style="color: var(--text-gold);">${seq.totalTicks}t</span>
        </div>
      `;

      item.addEventListener('click', () => {
        this.activeSeqName = seq.name;
        this.currentStep = 0;
        this.tickAcc = 0;
        this.modalEl.querySelectorAll('.studio-seq-item').forEach((el) => el.classList.remove('active'));
        item.classList.add('active');
        this._updateTimelineStrip();
        this._renderPreviewFrame();
        this._updateMetadataAndPAT();
        if (this.syncToBoard) {
          this.callbacks.onSyncToActor?.(this.activeSeqName);
        }
      });

      list.appendChild(item);
    });
  }

  _updateTimelineStrip() {
    const container = this.modalEl?.querySelector('#studio-timeline-strip');
    const counter = this.modalEl?.querySelector('#studio-timeline-counter');
    if (!container) return;
    container.innerHTML = '';

    const strip = getSequenceFrameStrip(this.spriteData, this.activeSeqName);
    if (counter) counter.textContent = `${this.currentStep + 1} of ${strip.length} STEPS`;

    strip.forEach((frame) => {
      const card = document.createElement('div');
      card.className = `timeline-frame-card ${frame.stepIndex === this.currentStep ? 'active' : ''}`;
      card.setAttribute('data-step', frame.stepIndex);

      card.innerHTML = `
        <div class="timeline-card-step">#${frame.stepIndex + 1}</div>
        <div class="timeline-card-fnum">F${frame.frameId}</div>
        <div class="timeline-card-meta">
          <span>${frame.ticks}t</span>
          <span>${frame.durationSec}s</span>
        </div>
        <div class="opcode-badges-row">
          ${frame.hasSound ? '<span class="opcode-badge sound">🔊 SND</span>' : ''}
          ${frame.isHit ? '<span class="opcode-badge hit">⚔️ HIT</span>' : ''}
          ${frame.isLoop ? '<span class="opcode-badge loop">🔁 LOOP</span>' : ''}
        </div>
      `;

      card.addEventListener('click', () => {
        this.currentStep = frame.stepIndex;
        this.tickAcc = 0;
        this._updateTimelineActiveCard();
        this._renderPreviewFrame();
        this._updateMetadataAndPAT();
        if (this.syncToBoard) {
          this._syncCurrentFrameToBoard();
        }
      });

      container.appendChild(card);
    });

    this._scrollActiveTimelineCard();
  }

  _updateTimelineActiveCard() {
    const cards = this.modalEl?.querySelectorAll('.timeline-frame-card');
    if (!cards) return;
    cards.forEach((c) => {
      const s = parseInt(c.getAttribute('data-step'), 10);
      c.classList.toggle('active', s === this.currentStep);
    });
    const counter = this.modalEl?.querySelector('#studio-timeline-counter');
    const strip = getSequenceFrameStrip(this.spriteData, this.activeSeqName);
    if (counter) counter.textContent = `${this.currentStep + 1} of ${strip.length} STEPS`;
    this._scrollActiveTimelineCard();
  }

  _scrollActiveTimelineCard() {
    const active = this.modalEl?.querySelector('.timeline-frame-card.active');
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }

  /* ========================================================================
     Center Preview Rendering
     ======================================================================== */

  _renderPreviewFrame() {
    const canvas = this.modalEl?.querySelector('#studio-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // Clear background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#06090e';
    ctx.fillRect(0, 0, w, h);

    // Active unit palette
    const selectedUnit = this.units.find((u) => u.id === this.selectedUnitId) || this.units[0];
    const atlasCanvas = this._getTintedAtlas(selectedUnit?.paletteId);

    // Lookup current frame
    const strip = getSequenceFrameStrip(this.spriteData, this.activeSeqName);
    const stepData = strip[this.currentStep] || strip[0];
    const frameId = stepData ? stepData.frameId : 0;
    const frameTiles = this.spriteData?.frames?.[frameId] || [];

    // Scale 96x96 to 288x288 (3x)
    const scale = 3;
    const stanceCenterX = Math.floor(w / 2);
    // Foot anchor at 20px above soles, baseline near bottom: 68px * 3 = 204px
    const stanceCenterY = Math.floor(h * 0.72);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // Draw frame tiles
    if (atlasCanvas && frameTiles.length > 0) {
      for (const tileItem of frameTiles) {
        const [cellId, dx, dy, reversed] = tileItem;
        const cell = this.cellsById.get(cellId);
        if (!cell) continue;

        const tileW = cell.w * scale;
        const tileH = cell.h * scale;
        const destX = stanceCenterX + (dx * scale) - Math.floor(tileW / 2);
        const destY = stanceCenterY + (dy * scale) - Math.floor(tileH / 2);

        if (reversed) {
          ctx.save();
          ctx.translate(destX + tileW, destY);
          ctx.scale(-1, 1);
          ctx.drawImage(atlasCanvas, cell.x, cell.y, cell.w, cell.h, 0, 0, tileW, tileH);
          ctx.restore();
        } else {
          ctx.drawImage(atlasCanvas, cell.x, cell.y, cell.w, cell.h, destX, destY, tileW, tileH);
        }
      }
    } else {
      // Fallback placeholder text
      ctx.fillStyle = '#64748b';
      ctx.font = '12px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`[F${frameId}] Rendering Pose`, w / 2, h / 2);
    }

    // Grid Overlay (96x96 scaled to 288x288 with 8x8 cell subdivisions)
    if (this.showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      const step = 8 * scale;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Outer 96x96 boundary border
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.35)';
      ctx.strokeRect(0, 0, w, h);
    }

    // Foot Anchor Crosshair
    if (this.showFootAnchor) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      const chLen = 12;

      ctx.beginPath();
      ctx.moveTo(stanceCenterX - chLen, stanceCenterY);
      ctx.lineTo(stanceCenterX + chLen, stanceCenterY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(stanceCenterX, stanceCenterY - chLen);
      ctx.lineTo(stanceCenterX, stanceCenterY + chLen);
      ctx.stroke();

      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(stanceCenterX, stanceCenterY, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // Update bottom tag
    const tag = this.modalEl?.querySelector('#studio-canvas-tag');
    if (tag) {
      tag.textContent = `Seq: ${this.activeSeqName} // Step: ${this.currentStep + 1}/${strip.length} // Frame: F${frameId}`;
    }
  }

  /* ========================================================================
     Right Column: SHP Metadata & 6-Layer PAT Table
     ======================================================================== */

  _updateMetadataAndPAT() {
    const strip = getSequenceFrameStrip(this.spriteData, this.activeSeqName);
    const stepData = strip[this.currentStep] || strip[0];
    const frameId = stepData ? stepData.frameId : 0;
    const frameTiles = this.spriteData?.frames?.[frameId] || [];

    const badge = this.modalEl?.querySelector('#pat-frame-badge');
    if (badge) badge.textContent = `F${frameId} (${frameTiles.length}/6 Tiles)`;

    const tbody = this.modalEl?.querySelector('#studio-pat-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const layerNames = ['0: farBehind', '1: behind', '2: body', '3: head', '4: front', '5: face'];

    for (let layerIdx = 0; layerIdx < 6; layerIdx++) {
      const tile = frameTiles[layerIdx];
      const row = document.createElement('tr');

      if (tile) {
        const [cellId, dx, dy, reversed] = tile;
        const cell = this.cellsById.get(cellId);
        const col = cell ? Math.floor(cell.x / 8) : 0;
        const rowNum = cell ? Math.floor(cell.y / 8) : 0;
        const dimStr = cell ? `${cell.w}×${cell.h}` : '-';

        row.innerHTML = `
          <td class="pat-layer-name">${layerNames[layerIdx]}</td>
          <td style="color: var(--azure); font-weight: 700;">${cellId}</td>
          <td>(${col}, ${rowNum})</td>
          <td>${dimStr}</td>
          <td>${dx}, ${dy}</td>
          <td>${reversed ? '⇋ Flip' : '—'}</td>
        `;
      } else {
        row.innerHTML = `
          <td style="color: var(--text-muted);">${layerNames[layerIdx]}</td>
          <td style="color: var(--text-muted);">—</td>
          <td style="color: var(--text-muted);">-</td>
          <td style="color: var(--text-muted);">-</td>
          <td style="color: var(--text-muted);">-</td>
          <td style="color: var(--text-muted);">-</td>
        `;
      }

      tbody.appendChild(row);
    }
  }

  _syncCurrentFrameToBoard() {
    this.callbacks.onSyncToActor?.(this.activeSeqName);
  }

  /* ========================================================================
     Custom Sprite Sheet Upload & Diagnostics
     ======================================================================== */

  _handleUploadedSheet(file) {
    if (!file || !file.type.includes('png')) {
      alert('Please upload a valid PNG sprite sheet file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const img = new Image();
      img.onload = () => {
        const report = validateCustomSpriteSheet(img);
        this._displayDiagnosticReport(report);

        if (report.ok) {
          this.customDataUrl = dataUrl;
          this.baseImage = img;
          this.tintedAtlasCache.clear();
          this._renderPreviewFrame();
          this._updateMetadataAndPAT();

          // Apply to 3D Board live
          if (typeof UnitActor?.applyCustomSpriteSheet === 'function') {
            UnitActor.applyCustomSpriteSheet(dataUrl);
          }
          this.callbacks.onApplyCustomSheet?.(dataUrl);
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  _displayDiagnosticReport(report) {
    const reportEl = this.modalEl?.querySelector('#hotdrop-report');
    if (!reportEl) return;
    reportEl.style.display = 'flex';
    reportEl.className = `hotdrop-report ${report.ok ? 'valid' : 'invalid'}`;

    const dimLabel = `${report.width}×${report.height}`;
    const dimCheck = (report.width === 256 && report.height === 488) || (report.width === 480 && report.height === 2688)
      ? '✅ Valid TYPE1 / Atlas Layout'
      : '⚠️ Custom Non-Standard Dimensions';

    const colorCheck = report.colors <= 16
      ? `✅ ${report.colors} colors (within 15-color TYPE1 limit)`
      : `⚠️ ${report.colors} colors (exceeds 15 colors TYPE1 standard)`;

    reportEl.innerHTML = `
      <div style="font-weight: 800; color: ${report.ok ? '#86efac' : '#fca5a5'};">
        ${report.ok ? '✓ DIAGNOSTIC PASSED: APPLIED LIVE TO 3D BOARD' : '✕ DIAGNOSTIC FAILED'}
      </div>
      <div>📐 Dimensions: <strong>${dimLabel}</strong> [${dimCheck}]</div>
      <div>🎨 Colors: <strong>${report.colors} colors</strong> [${colorCheck}]</div>
      <div>✨ Non-zero Pixels: <strong>${report.nonZeroPixels?.toLocaleString()}</strong></div>
      ${report.warnings.map((w) => `<div style="color: #fde047;">• ${w.message}</div>`).join('')}
      ${report.errors.map((e) => `<div style="color: #f87171;">• ${e.message}</div>`).join('')}
    `;
  }
}
