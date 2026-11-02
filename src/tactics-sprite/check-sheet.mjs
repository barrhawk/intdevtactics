#!/usr/bin/env node
//NOTE(@jimmylee)
//Holds a PNG to what TYPE1's tiles can read, with nothing but Node: a 256x488 non-interlaced PNG, alpha 0 or
//255, pixels only inside the sprite cells. The same check runs from the command line, behind POST
///api/v1/sheets/check, and in tests/helpers/fft-type1.js, which reads sheets through decodePng.
//
//  node check-sheet.mjs my-sheet.png [tactics-sprite-data.json]

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const SHEET_WIDTH = 256;
export const SHEET_HEIGHT = 488;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const REPORTED_POINTS = 8;

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const [pl, pu, pc] = [Math.abs(p - left), Math.abs(p - up), Math.abs(p - upLeft)];
  return pl <= pu && pl <= pc ? left : pu <= pc ? up : upLeft;
}

//NOTE(@jimmylee)
//A PNG as RGBA: 8-bit RGB or RGBA, or indexed at any bit depth, which is the form an image optimizer leaves
//a sheet of few colors in. `at(x, y)` reads one pixel as [r, g, b, a]. `limits` refuses an image before it
//is inflated: a web route reads other people's files, and a small file can inflate to gigabytes.
export function decodePng(bytes, limits = {}) {
  const b = Buffer.from(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength ?? bytes.length);
  if (b.length < 33 || PNG_SIGNATURE.some((value, i) => b[i] !== value)) throw new Error('not a PNG file');
  const chunks = [];
  let width = 0;
  let height = 0;
  let channels = 0;
  let depth = 8;
  let palette = null;
  let paletteAlpha = null;
  for (let o = 8; o + 12 <= b.length; ) {
    const size = b.readUInt32BE(o);
    const type = b.toString('latin1', o + 4, o + 8);
    if (o + 12 + size > b.length) throw new Error(`truncated PNG: ${type} runs past the end of the file`);
    if (type === 'IHDR') {
      width = b.readUInt32BE(o + 8);
      height = b.readUInt32BE(o + 12);
      depth = b[o + 16];
      const colorType = b[o + 17];
      channels = { 2: 3, 3: 1, 6: 4 }[colorType] ?? 0;
      const supportedDepth = colorType === 3 ? [1, 2, 4, 8].includes(depth) : depth === 8;
      if (!supportedDepth || !channels) throw new Error('unsupported PNG format: export 8-bit RGBA, or indexed with a transparent entry');
      if (b[o + 20] !== 0) throw new Error('interlaced PNG: export it non-interlaced');
      if ((limits.width && width !== limits.width) || (limits.height && height !== limits.height)) throw new Error(`${width}x${height} PNG: a sheet is ${limits.width}x${limits.height}`);
    }
    if (type === 'PLTE' && channels === 1) palette = b.subarray(o + 8, o + 8 + size);
    if (type === 'tRNS' && channels === 1) paletteAlpha = b.subarray(o + 8, o + 8 + size);
    if (type === 'IDAT') chunks.push(b.subarray(o + 8, o + 8 + size));
    o += 12 + size;
  }
  if (!width || !chunks.length) throw new Error('truncated PNG: no image data');
  const stride = Math.ceil((width * channels * depth) / 8);
  const raw = zlib.inflateSync(Buffer.concat(chunks), { maxOutputLength: (stride + 1) * height });
  if (raw.length < (stride + 1) * height) throw new Error('truncated PNG: not enough image data');
  const out = Buffer.alloc(stride * height);
  const pixelBytes = Math.max(1, Math.floor((channels * depth) / 8));
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= pixelBytes ? out[y * stride + x - pixelBytes] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = x >= pixelBytes && y > 0 ? out[(y - 1) * stride + x - pixelBytes] : 0;
      const predictor = [0, left, up, (left + up) >> 1, paeth(left, up, upLeft)][filter];
      out[y * stride + x] = (value + predictor) & 0xff;
    }
  }
  return {
    width,
    height,
    at(x, y) {
      if (palette) {
        const bit = x * depth;
        const index = (out[y * stride + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        return [palette[index * 3], palette[index * 3 + 1], palette[index * 3 + 2], paletteAlpha?.[index] ?? 255];
      }
      const o = y * stride + x * channels;
      return [out[o], out[o + 1], out[o + 2], channels === 4 ? out[o + 3] : 255];
    },
  };
}

//NOTE(@jimmylee)
//`errors` stop a sheet from drawing right. `warnings` are worth a look and may be intended: a sheet can
//leave a tile empty if no animation the project plays draws it. Coordinates report the first few of each.
export function checkSheet(bytes, cells) {
  const errors = [];
  const warnings = [];
  let image;
  try {
    image = decodePng(bytes, { width: SHEET_WIDTH, height: SHEET_HEIGHT });
  } catch (error) {
    return { ok: false, errors: [{ code: 'unreadable', message: error.message }], warnings, colors: 0, emptyCells: [] };
  }

  const inside = new Uint8Array(SHEET_WIDTH * SHEET_HEIGHT);
  for (const { x, y, w, h } of cells) for (let row = y; row < y + h; row++) inside.fill(1, row * SHEET_WIDTH + x, row * SHEET_WIDTH + x + w);

  const colors = new Set();
  const stray = [];
  const partial = [];
  const keyed = [];
  let strayCount = 0;
  let partialCount = 0;
  let keyedCount = 0;
  for (let y = 0; y < SHEET_HEIGHT; y++) {
    for (let x = 0; x < SHEET_WIDTH; x++) {
      const [r, g, b, a] = image.at(x, y);
      if (a !== 0) colors.add((r << 16) | (g << 8) | b);
      if (!inside[y * SHEET_WIDTH + x] && (r || g || b || a)) {
        if (strayCount++ < REPORTED_POINTS) stray.push([x, y]);
      }
      if (a !== 0 && a !== 255 && partialCount++ < REPORTED_POINTS) partial.push([x, y]);
      if (a === 0 && (r || g || b) && keyedCount++ < REPORTED_POINTS) keyed.push([x, y]);
    }
  }

  const emptyCells = [];
  for (const { id, x, y, w, h } of cells) {
    let empty = true;
    for (let row = y; empty && row < y + h; row++) for (let column = x; column < x + w; column++) if (image.at(column, row)[3] !== 0) empty = false;
    if (empty) emptyCells.push(id);
  }

  if (strayCount) errors.push({ code: 'pixels-outside-cells', message: `${strayCount} pixels outside the sprite cells. Copy each cell onto an empty image, so only what TYPE1 can draw is left.`, count: strayCount, points: stray });
  if (partialCount) errors.push({ code: 'partial-alpha', message: `${partialCount} pixels with partial alpha. The sprites are alpha-tested: alpha is 0 or 255.`, count: partialCount, points: partial });
  if (keyedCount) errors.push({ code: 'colored-transparent-pixels', message: `${keyedCount} transparent pixels hold a color. An empty pixel is (0, 0, 0, 0).`, count: keyedCount, points: keyed });
  if (emptyCells.length === cells.length) errors.push({ code: 'empty-sheet', message: 'Every cell is empty: this is not a TYPE1 layout, or its background was keyed to nothing.' });
  else if (emptyCells.length) warnings.push({ code: 'empty-cells', message: `${emptyCells.length} cells have no pixels, so the frames that draw them lose those tiles.`, count: emptyCells.length });
  if (colors.size > 16) warnings.push({ code: 'many-colors', message: `${colors.size} colors. A TYPE1 sheet has at most 15 and a transparent entry; more is fine in a browser and off-model for TYPE1.`, count: colors.size });

  return { ok: errors.length === 0, errors, warnings, colors: colors.size, emptyCells };
}

async function loadCells(dataPath) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const file = dataPath ?? [path.join(here, 'tactics-sprite-data.json')].find((candidate) => fs.existsSync(candidate));
  if (file) return JSON.parse(fs.readFileSync(file, 'utf8')).cells;
  return (await import('../three-isometric-engine/constants/sprites/index.js')).SPRITE_CELLS;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, dataPath] = process.argv.slice(2);
  if (!file) {
    console.error('Usage: node check-sheet.mjs my-sheet.png [tactics-sprite-data.json]');
    process.exit(2);
  }
  const report = checkSheet(fs.readFileSync(file), await loadCells(dataPath));
  for (const { message, points } of report.errors) console.error(`error: ${message}${points ? ` First at ${points.map((p) => p.join(',')).join(' ')}.` : ''}`);
  for (const { message } of report.warnings) console.warn(`warning: ${message}`);
  console.log(report.ok ? `${path.basename(file)} fits the TYPE1 layout: ${report.colors} colors, ${report.emptyCells.length} empty cells.` : `${path.basename(file)} does not fit the TYPE1 layout.`);
  process.exit(report.ok ? 0 : 1);
}
