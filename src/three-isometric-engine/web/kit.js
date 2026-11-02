//NOTE(@jimmylee)
//The kit: everything a project outside this repository needs to play a sheet and hold an item. `kitFiles` is
//the one list, so GET /api/v1/kit.tar.gz, scripts/export-sprite-kit.mjs and the skill archive cannot disagree
//about it. The archive writer is small and pure: fixed times and order, so the same files give the same bytes
//and the digest in /.well-known/agent-skills/index.json holds across restarts.

import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { BLACK_MARBLE_FILE, SHEET_H, SHEET_W, SPRITE_CELLS, SPRITE_SHEET_FILE } from '../constants/sprites/index.js';
import { SET_ITEMS_FILE } from '../weapons/set-items.js';
import { buildSpriteData } from './sprite-data.js';
import { RUNTIME_FILES, listEngineFiles, listSiteFiles, readItemModelCredit, readNotice, readRepositoryFile, readText, readVersion } from './site-files.js';

export const SKILL_NAME = 'create-tactics-threejs-sprite';
export const SKILL_ARCHIVE = `${SKILL_NAME}.tar.gz`;
const DECODER_FILE = 'tests/helpers/fft-type1.js';
const TEXT = (value) => Buffer.from(value, 'utf8');

//NOTE(@jimmylee)
//The cells as boxes at `scale` screen pixels per sprite pixel, for drawing on or checking a layout by eye.
//Labels run along each box as on the main route's SpriteSheet section.
export function sheetTemplateSvg(scale = 4) {
  const boxes = SPRITE_CELLS.map(({ id, x, y, w, h }) => {
    const color = id.startsWith('SR') ? '#2563eb' : '#000';
    return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${color}" stroke-width="0.25"/><text x="${x + 0.5}" y="${y + 3}" font-size="2.5" font-family="monospace" fill="${color}">${id}</text>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SHEET_W * scale}" height="${SHEET_H * scale}" viewBox="0 0 ${SHEET_W} ${SHEET_H}">${boxes.join('')}</svg>\n`;
}

const noticeFile = (notice, credit, license) => `# Notice\n\nThe sheet and the data in this kit come from https://3d.internet.dev. Keep this notice with them.\n\n${notice}\n\n## Credit\n\n${SET_ITEMS_FILE} in this kit is not under the MIT license. Keep this credit with it.\n\n${credit}\n\n## MIT License\n\n${license}`;

//NOTE(@jimmylee)
//`sheet` is { name, bytes } for a project's own art. The kit then carries that file, with no hand grips,
//because grips belong to a1.png. The tables stay as they are, so the notice does too, and it carries the
//MIT text because the license asks for it in every copy.
export function kitFiles(root, sheet = null) {
  const notice = readNotice(root);
  const data = buildSpriteData({ notice, version: readVersion(root), sheetFile: sheet?.name });
  return [
    ...RUNTIME_FILES.map((file) => ({ path: file, bytes: readRepositoryFile(root, `assets/${file}`) })),
    { path: 'tactics-sprite-data.json', bytes: TEXT(JSON.stringify(data)) },
    { path: sheet?.name ?? SPRITE_SHEET_FILE, bytes: sheet?.bytes ?? readRepositoryFile(root, `public/static/textures/${SPRITE_SHEET_FILE}`) },
    { path: SET_ITEMS_FILE, bytes: readRepositoryFile(root, `public/static/models/${SET_ITEMS_FILE}`) },
    { path: BLACK_MARBLE_FILE, bytes: readRepositoryFile(root, `public/static/textures/${BLACK_MARBLE_FILE}`) },
    { path: 'sheet-template.svg', bytes: TEXT(sheetTemplateSvg()) },
    { path: 'NOTICE.md', bytes: TEXT(noticeFile(notice, readItemModelCredit(root), readText(root, 'LICENSE.md'))) },
  ];
}

//NOTE(@jimmylee)
//The installable skill, whole, so an install needs nothing else: every document, the engine, the decoder for
//any other SHP, and the kit under assets/, which is where SKILL.md says to look for it. The page and the
//tests stay out, and with them tests/fixtures/type1.json, because that game data is not ours to hand out.
export function skillArchiveFiles(root) {
  const documents = listSiteFiles(root).filter((file) => !file.startsWith('assets/'));
  const sources = new Set([...documents, ...listEngineFiles(root), DECODER_FILE]);
  const kit = kitFiles(root);
  return [...[...sources].map((file) => ({ path: file, bytes: readRepositoryFile(root, file) })), ...kit.filter((file) => file.path === 'NOTICE.md'), ...kit.filter((file) => file.path !== 'NOTICE.md').map((file) => ({ ...file, path: `assets/${file.path}` }))];
}

function tarHeader(name, size) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000644\0', 100, 'latin1');
  header.write('0000000\0', 108, 'latin1');
  header.write('0000000\0', 116, 'latin1');
  header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 'latin1');
  header.write('00000000000\0', 136, 'latin1');
  header.write('        ', 148, 'latin1');
  header.write('0', 156, 'latin1');
  header.write('ustar\0' + '00', 257, 'latin1');
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 'latin1');
  return header;
}

export function tarGz(files) {
  const blocks = [];
  for (const { path, bytes } of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    if (Buffer.byteLength(path) > 100) throw new Error(`tar name too long: ${path}`);
    blocks.push(tarHeader(path, bytes.length), bytes, Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  blocks.push(Buffer.alloc(1024));
  return zlib.gzipSync(Buffer.concat(blocks), { level: 9 });
}

export const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
export const skillMarkdown = (root) => readText(root, 'SKILL.md');
