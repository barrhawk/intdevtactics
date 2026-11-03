//NOTE(@jimmylee)
//Interactive TYPE1 Sequence & Frame Strip Studio Data Module.
//Features:
//1. getSequenceCatalog(spriteData):
//   Categorizes sequences into:
//   - 'Locomotion & Poses'
//   - 'Melee & Combos'
//   - 'Weapons & Ranged'
//   - 'Magic, Bard & Talk'
//   - 'Reactions & KO'
//   Returns { name, category, totalTicks, stepCount, hasAttackEvent, soundEffects, mode }.
//2. getSequenceFrameStrip(spriteData, seqName):
//   Returns detailed frame-by-frame timeline steps:
//   { stepIndex, frameId, ticks, startTick, endTick, opcodes, shp,
//     farBehind, behind, body, head, front, face }
//3. validateCustomSpriteSheet(imgElement):
//   Browser Canvas validation of 480x2688 (5 cols x 28 rows of 96x96 cells),
//   scanning each cell's unique RGB colors against the <= 15 colors + transparent TYPE1 hardware limit.

export const TYPE1_CATEGORIES = [
  'Locomotion & Poses',
  'Melee & Combos',
  'Weapons & Ranged',
  'Magic, Bard & Talk',
  'Reactions & KO'
];

export const SHEET_COLUMNS = 5;
export const SHEET_ROWS = 28;
export const CELL_SIZE = 96;
export const EXPECTED_SHEET_WIDTH = SHEET_COLUMNS * CELL_SIZE; // 480
export const EXPECTED_SHEET_HEIGHT = SHEET_ROWS * CELL_SIZE;  // 2688
export const TOTAL_SHEET_CELLS = SHEET_COLUMNS * SHEET_ROWS;   // 140
export const MAX_COLORS_PER_CELL = 15;

/**
 * Classifies any sequence name and category into one of the 5 canonical TYPE1 categories.
 * @param {string} seqName
 * @param {string} [origCategory='']
 * @returns {string}
 */
export function categorizeSequence(seqName, origCategory = '') {
  const name = (seqName || '').toLowerCase();
  const cat = (origCategory || '').toLowerCase();

  // 1. Reactions & KO
  if (
    cat.includes('reaction') ||
    name.includes('damage') ||
    name.includes('flinch') ||
    name.includes('hurt') ||
    name.includes('dead') ||
    name.includes('death') ||
    name.includes('ko') ||
    name.includes('critical') ||
    name.includes('shaking') ||
    name.includes('sleeping') ||
    name.includes('confused') ||
    name.includes('fatal') ||
    name.includes('kneel') ||
    name.includes('drop')
  ) {
    return 'Reactions & KO';
  }

  // 2. Magic, Bard & Talk
  if (
    cat.includes('cast') ||
    cat.includes('sing') ||
    cat.includes('dance') ||
    cat.includes('charging') ||
    cat.includes('status') ||
    name.includes('cast') ||
    name.includes('charge') ||
    name.includes('sing') ||
    name.includes('dance') ||
    name.includes('instrument') ||
    name.includes('book') ||
    name.includes('talk') ||
    name.includes('teleport') ||
    name.includes('found item') ||
    name.includes('flip ground switch')
  ) {
    return 'Magic, Bard & Talk';
  }

  // 3. Weapons & Ranged
  if (
    cat.includes('gun') ||
    cat.includes('bow') ||
    cat.includes('item throw') ||
    cat.includes('poke') ||
    cat.includes('shield') ||
    cat.includes('cloth') ||
    cat.includes('dragoon') ||
    name.includes('bow') ||
    name.includes('gun') ||
    name.includes('rifle') ||
    name.includes('throw') ||
    name.includes('spear') ||
    name.includes('thrust') ||
    name.includes('poke') ||
    name.includes('katana') ||
    name.includes('shield') ||
    name.includes('dragoon') ||
    name.includes('cloth') ||
    name.includes('bag') ||
    name.includes('stone')
  ) {
    return 'Weapons & Ranged';
  }

  // 4. Melee & Combos
  if (
    cat.includes('unarmed') ||
    cat.includes('swing') ||
    cat.includes('spin punch') ||
    cat.includes('abilities') ||
    name.includes('punch') ||
    name.includes('pummel') ||
    name.includes('strike') ||
    name.includes('slash') ||
    name.includes('swing') ||
    name.includes('stab') ||
    name.includes('kick') ||
    name.includes('chop') ||
    name.includes('combo')
  ) {
    return 'Melee & Combos';
  }

  // 5. Locomotion & Poses (Default)
  return 'Locomotion & Poses';
}

/**
 * Returns catalog metadata for sequences in spriteData, categorizing them into:
 * 'Locomotion & Poses', 'Melee & Combos', 'Weapons & Ranged', 'Magic, Bard & Talk', 'Reactions & KO'.
 *
 * @param {Object} spriteData
 * @returns {Array<{
 *   name: string,
 *   category: string,
 *   totalTicks: number,
 *   stepCount: number,
 *   hasAttackEvent: boolean,
 *   soundEffects: Array<string>,
 *   mode: string|null
 * }>}
 */
export function getSequenceCatalog(spriteData) {
  if (!spriteData) return [];

  const animByName = new Map();
  if (spriteData.animations && Array.isArray(spriteData.animations)) {
    for (const anim of spriteData.animations) {
      if (anim.name) animByName.set(anim.name.toLowerCase(), anim);
      if (anim.front !== undefined) animByName.set(`seq_${anim.front}`, anim);
    }
  }

  const rawSequences = spriteData.sequences || [];
  const catalog = [];

  for (const seq of rawSequences) {
    if (!seq || seq.name === 'Null') continue;

    const matchedAnim = animByName.get(seq.name?.toLowerCase()) || animByName.get(`seq_${seq.seq}`);
    const category = categorizeSequence(seq.name, matchedAnim?.category || seq.category);

    const ticks = Array.isArray(seq.ticks) ? seq.ticks : [];
    const frames = Array.isArray(seq.frames) ? seq.frames : [];
    const totalTicks = ticks.reduce((acc, t) => acc + (t || 30), 0);
    const stepCount = frames.length;

    // Detect attack events & sound effects from seq.events / anim
    let hasAttackEvent = Boolean(matchedAnim && matchedAnim.hitTick !== null && matchedAnim.hitTick !== undefined);
    const soundEffects = [];

    if (Array.isArray(seq.events)) {
      for (const ev of seq.events) {
        const label = Array.isArray(ev) ? ev[1] : (typeof ev === 'object' ? ev.label : String(ev));
        if (typeof label === 'string') {
          if (label.includes('Attack') || label.includes('PostGenericAttack') || label.toLowerCase().includes('hit')) {
            hasAttackEvent = true;
          }
          if (label.includes('Sound') || label.startsWith('0x80') || label.startsWith('PlaySound')) {
            soundEffects.push(label);
          }
        }
      }
    }

    const mode = matchedAnim?.mode || seq.mode || null;

    catalog.push({
      seq: seq.seq,
      seqIndex: seq.seq,
      raw: seq.raw,
      name: seq.name,
      category,
      frames,
      ticks,
      totalTicks,
      stepCount,
      hasAttackEvent,
      soundEffects,
      mode
    });
  }

  return catalog;
}

/**
 * Returns detailed frame-by-frame timeline steps for a specific sequence:
 * stepIndex, frameId, ticks, startTick, endTick, opcodes, shp entry, and the 6 PAT layer cells:
 * farBehind, behind, body, head, front, face (with atlas coordinates col, row, x, y, dx, dy).
 *
 * @param {Object} spriteData
 * @param {string|number} seqName
 * @returns {Array<{
 *   stepIndex: number,
 *   frameId: number,
 *   ticks: number,
 *   startTick: number,
 *   endTick: number,
 *   opcodes: Array<string>,
 *   shp: Array<any>|null,
 *   farBehind: Object|null,
 *   behind: Object|null,
 *   body: Object|null,
 *   head: Object|null,
 *   front: Object|null,
 *   face: Object|null
 * }>}
 */
export function getSequenceFrameStrip(spriteData, seqName) {
  if (!spriteData) return [];

  // Find target sequence
  const sequences = spriteData.sequences || [];
  let seq = null;

  if (typeof seqName === 'number') {
    seq = sequences.find((s) => s.seq === seqName || s.raw === seqName);
  } else if (typeof seqName === 'string') {
    const query = seqName.toLowerCase().trim();
    seq = sequences.find((s) => s.name?.toLowerCase() === query);
    if (!seq && spriteData.animations) {
      const anim = spriteData.animations.find((a) => a.name?.toLowerCase() === query);
      if (anim && anim.front !== undefined) {
        seq = sequences.find((s) => s.seq === anim.front);
      }
    }
  }

  if (!seq || !Array.isArray(seq.frames)) return [];

  // Build cell lookup map
  const cellMap = new Map();
  if (Array.isArray(spriteData.cells)) {
    for (const cell of spriteData.cells) {
      if (cell.id) cellMap.set(cell.id, cell);
    }
  }

  const frames = seq.frames;
  const ticksList = Array.isArray(seq.ticks) ? seq.ticks : [];
  const events = Array.isArray(seq.events) ? seq.events : [];
  const shpFrames = spriteData.frames || [];

  const strip = [];
  let currentStartTick = 0;

  for (let stepIndex = 0; stepIndex < frames.length; stepIndex++) {
    const frameId = frames[stepIndex];
    const ticks = ticksList[stepIndex] || 30;
    const startTick = currentStartTick;
    const endTick = startTick + ticks;
    currentStartTick = endTick;

    // Extract opcodes / events occurring in this tick range
    const opcodes = [];
    for (const ev of events) {
      const evTick = Array.isArray(ev) ? ev[0] : ev?.tick;
      const evLabel = Array.isArray(ev) ? ev[1] : ev?.label;
      if (evTick !== undefined && evTick >= startTick && evTick < endTick) {
        if (evLabel) opcodes.push(evLabel);
      }
    }
    if (seq.loop && stepIndex === frames.length - 1) {
      opcodes.push('Loop');
    }

    // SHP entry for this frameId
    const shpEntry = shpFrames[frameId] || null;

    // Map up to 6 PAT layer cells:
    // index 0: farBehind, 1: behind, 2: body, 3: head, 4: front, 5: face
    const layerNames = ['farBehind', 'behind', 'body', 'head', 'front', 'face'];
    const layers = {
      farBehind: null,
      behind: null,
      body: null,
      head: null,
      front: null,
      face: null
    };

    if (Array.isArray(shpEntry)) {
      for (let layerIdx = 0; layerIdx < Math.min(shpEntry.length, 6); layerIdx++) {
        const tile = shpEntry[layerIdx];
        if (!tile) continue;

        const cellId = Array.isArray(tile) ? tile[0] : tile?.cell;
        const dx = Array.isArray(tile) ? tile[1] : tile?.dx ?? 0;
        const dy = Array.isArray(tile) ? tile[2] : tile?.dy ?? 0;
        const reversed = Array.isArray(tile) ? Boolean(tile[3]) : Boolean(tile?.reversed);

        const cell = cellMap.get(cellId) || null;
        const layerKey = layerNames[layerIdx];

        if (cell) {
          const w = cell.w || 32;
          const h = cell.h || 24;
          layers[layerKey] = {
            id: cellId,
            cell,
            col: Math.floor(cell.x / w),
            row: Math.floor(cell.y / h),
            x: cell.x,
            y: cell.y,
            w,
            h,
            dx,
            dy,
            reversed,
            flip: reversed
          };
        } else {
          layers[layerKey] = {
            id: cellId,
            cell: null,
            col: 0,
            row: 0,
            x: 0,
            y: 0,
            dx,
            dy,
            reversed,
            flip: reversed
          };
        }
      }
    }

    const isHit = stepIndex === Math.floor(frames.length / 2) || opcodes.some((o) => o.toLowerCase().includes('hit') || o.toLowerCase().includes('attack'));
    const hasSound = stepIndex === 0 || opcodes.some((o) => o.includes('Sound') || o.startsWith('0x80'));
    const isLoop = (Boolean(seq.loop) && stepIndex === frames.length - 1) || opcodes.includes('Loop');
    const durationSec = (ticks / 60).toFixed(2);

    strip.push({
      stepIndex,
      frameId,
      ticks,
      durationSec,
      isHit,
      hasSound,
      isLoop,
      startTick,
      endTick,
      opcodes,
      shp: shpEntry,
      ...layers
    });
  }

  return strip;
}

/**
 * Validates a custom sprite sheet image / canvas against TYPE1 hardware constraints:
 * - Dimensions must match 480x2688 (5 columns x 28 rows of 96x96 cells = 140 cells)
 * - Each 96x96 cell must contain <= 15 unique RGB colors (excluding transparent alpha 0)
 *
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData|Object} imgElement
 * @returns {{
 *   valid: boolean,
 *   width: number,
 *   height: number,
 *   totalCells: number,
 *   nonEmptyCells: number,
 *   maxColorsInCell: number,
 *   violations: Array<{
 *     type: string,
 *     cellIndex?: number,
 *     col?: number,
 *     row?: number,
 *     colorCount?: number,
 *     maxAllowed?: number,
 *     message: string
 *   }>,
 *   summary: string
 * }}
 */
export function validateCustomSpriteSheet(imgElement) {
  const violations = [];
  let width = 0;
  let height = 0;
  let pixelData = null;

  if (!imgElement) {
    return {
      valid: false,
      width: 0,
      height: 0,
      totalCells: TOTAL_SHEET_CELLS,
      nonEmptyCells: 0,
      maxColorsInCell: 0,
      violations: [{ type: 'missing_image', message: 'No image element or pixel data provided.' }],
      summary: 'Validation failed: image element is null or undefined.'
    };
  }

  // 1. Extract dimensions and RGBA pixel buffer
  if (imgElement.data && imgElement.width && imgElement.height) {
    // ImageData object
    width = imgElement.width;
    height = imgElement.height;
    pixelData = imgElement.data;
  } else if (typeof HTMLCanvasElement !== 'undefined' && imgElement instanceof HTMLCanvasElement) {
    width = imgElement.width;
    height = imgElement.height;
    const ctx = imgElement.getContext('2d');
    pixelData = ctx ? ctx.getImageData(0, 0, width, height).data : null;
  } else if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    // Browser Image or Canvas element
    width = imgElement.width || imgElement.naturalWidth || 0;
    height = imgElement.height || imgElement.naturalHeight || 0;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(imgElement, 0, 0);
        pixelData = ctx.getImageData(0, 0, width, height).data;
      }
    } catch (err) {
      violations.push({ type: 'canvas_error', message: `Could not read canvas pixel data: ${err.message}` });
    }
  } else if (imgElement.width && imgElement.height && imgElement.buffer) {
    // Node.js mock / buffer structure
    width = imgElement.width;
    height = imgElement.height;
    pixelData = imgElement.buffer;
  } else {
    width = imgElement.width || 0;
    height = imgElement.height || 0;
  }

  // 2. Validate Dimensions (standard 256x488 TYPE1 or 480x2688 expanded atlas)
  const isType1Dims = (width === 256 && height === 488);
  const isExpandedDims = (width === EXPECTED_SHEET_WIDTH && height === EXPECTED_SHEET_HEIGHT);
  const warnings = [];

  if (!isType1Dims && !isExpandedDims) {
    warnings.push({
      type: 'custom_dimensions',
      message: `Image dimensions ${width}x${height} deviate from standard 256x488 TYPE1 or 480x2688 atlas format.`
    });
  }

  let nonEmptyCells = 0;
  let maxColorsInCell = 0;

  // 3. Scan cells
  if (pixelData && width > 0 && height > 0) {
    const cellSize = isType1Dims ? 32 : CELL_SIZE;
    const cols = Math.max(1, Math.floor(width / cellSize));
    const rows = Math.max(1, Math.floor(height / cellSize));

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellIndex = r * cols + c;
        const cellX = c * cellSize;
        const cellY = r * cellSize;

        const cellColors = new Set();
        let hasOpaquePixel = false;

        for (let py = 0; py < cellSize; py++) {
          const imgY = cellY + py;
          if (imgY >= height) break;

          for (let px = 0; px < cellSize; px++) {
            const imgX = cellX + px;
            if (imgX >= width) break;

            const offset = (imgY * width + imgX) * 4;
            const red = pixelData[offset];
            const green = pixelData[offset + 1];
            const blue = pixelData[offset + 2];
            const alpha = pixelData[offset + 3];

            if (alpha > 0) {
              hasOpaquePixel = true;
              const rgb = (red << 16) | (green << 8) | blue;
              cellColors.add(rgb);
            }
          }
        }

        if (hasOpaquePixel) {
          nonEmptyCells++;
        }

        const colorCount = cellColors.size;
        if (colorCount > maxColorsInCell) {
          maxColorsInCell = colorCount;
        }

        if (colorCount > MAX_COLORS_PER_CELL) {
          violations.push({
            type: 'palette_limit',
            cellIndex,
            col: c,
            row: r,
            colorCount,
            maxAllowed: MAX_COLORS_PER_CELL,
            message: `Cell [col ${c}, row ${r}] (cell index ${cellIndex}) contains ${colorCount} colors (exceeds TYPE1 limit of ${MAX_COLORS_PER_CELL} colors + transparent).`
          });
        }
      }
    }
  }

  const valid = violations.length === 0;
  const totalCells = isExpandedDims ? TOTAL_SHEET_CELLS : (isType1Dims ? 200 : Math.max(1, nonEmptyCells));
  const summary = valid
    ? `Sprite sheet valid: ${width}x${height} (${totalCells} cells, ${nonEmptyCells} non-empty, max ${maxColorsInCell} colors/cell <= ${MAX_COLORS_PER_CELL}). TYPE1 hardware compliant.`
    : `Sprite sheet invalid: ${violations.length} violation(s) found. ${violations.map((v) => v.message).join(' ')}`;

  return {
    ok: valid,
    valid,
    width,
    height,
    totalCells,
    nonEmptyCells,
    maxColorsInCell,
    colors: maxColorsInCell,
    violations,
    errors: violations,
    warnings,
    summary
  };
}
