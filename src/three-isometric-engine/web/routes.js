//NOTE(@jimmylee)
//Every web service route as one pure function: a request in, { status, type, body, headers } out, with nothing
//from Next.js, so a test can call any route without a server. pages/api/[...route].ts is its only caller, and
//next.config.js gives the public names (/llms.txt, /SKILL.md). Responses that read files are built once per
//process: what they read does not change under a running server.

import { SPRITE_CELLS, SPRITE_MAP } from '../constants/sprites/index.js';
import { SEQ_LIBRARY, SHP_FRAMES } from '../constants/sprites/seq-library.js';
import { checkSheet } from '../../assets/check-sheet.mjs';
import { createAtlas, findAnimation, poseAt } from '../../assets/tactics-sprite.mjs';
import { llmsFullTxt, llmsTxt, openApi, robotsTxt, sitemapXml, skillArchive, skillIndex } from './agent-documents.js';
import { SKILL_ARCHIVE, SKILL_NAME, kitFiles, sheetTemplateSvg, tarGz } from './kit.js';
import { buildSpriteData, sequenceRow } from './sprite-data.js';
import { listSiteFiles, readNotice, readRepositoryFile, readVersion } from './site-files.js';
import { SITE_URL } from './site-urls.js';

export const MAX_SHEET_BYTES = 1024 * 1024;
const MARKDOWN = 'text/markdown; charset=utf-8';
const TEXT = 'text/plain; charset=utf-8';
const JAVASCRIPT = 'text/javascript; charset=utf-8';
const JSON_TYPE = 'application/json; charset=utf-8';
const GZIP = 'application/gzip';
const FRESH = 'public, max-age=300, s-maxage=3600';

const ok = (body, type) => ({ status: 200, type, body, headers: { 'Cache-Control': FRESH } });
const json = (value) => ok(JSON.stringify(value), JSON_TYPE);
const failure = (status, code, message, headers = {}) => ({ status, type: JSON_TYPE, body: JSON.stringify({ error: { code, message } }), headers: { 'Cache-Control': 'no-store', ...headers } });
const notFound = (message = 'No such route. GET /api/v1 lists them.') => failure(404, 'not_found', message);

//NOTE(@jimmylee)
//A built value per repository root, because a test and the server pass different roots.
const STATES = new Map();
function stateFor(root) {
  if (!STATES.has(root)) {
    const memo = new Map();
    const once = (key, build) => {
      if (!memo.has(key)) memo.set(key, build());
      return memo.get(key);
    };
    const notice = () => once('notice', () => readNotice(root));
    const data = () => once('data', () => buildSpriteData({ notice: notice(), version: readVersion(root) }));
    STATES.set(root, { once, notice, data, atlas: () => once('atlas', () => createAtlas(data())), files: () => once('files', () => new Set(listSiteFiles(root))) });
  }
  return STATES.get(root);
}

const INTEGER = /^\d{1,4}$/;
const parseBoolean = (value) => (value === 'true' ? true : value === 'false' ? false : undefined);
const matches = (value, query) => !query || value.toLowerCase().includes(String(query).toLowerCase());

function manifest(root, state) {
  const route = (path) => `${SITE_URL}${path}`;
  const data = state.data();
  return {
    name: SKILL_NAME,
    version: data.version,
    notice: data.notice,
    counts: { cells: data.cells.length, frames: data.frames.length, sequences: data.sequences.length, animations: data.animations.length },
    links: {
      skill: route('/SKILL.md'),
      llms: route('/llms.txt'),
      openapi: route('/openapi.json'),
      skillArchive: route(`/.well-known/agent-skills/${SKILL_ARCHIVE}`),
      kit: route('/api/v1/kit.tar.gz'),
      data: route('/api/v1/data'),
      cells: route('/api/v1/cells'),
      frames: route('/api/v1/frames'),
      sequences: route('/api/v1/sequences'),
      animations: route('/api/v1/animations'),
      draw: route('/api/v1/draw?animation=Walk&view=1&tick=0'),
      sheetTemplate: route('/api/v1/sheet-template.svg'),
      sheetCheck: route('/api/v1/sheets/check'),
      sheet: route('/static/textures/a1.png'),
    },
  };
}

function draw(state, query) {
  const { animation: name, view: viewText = '1', tick: tickText = '0', loop, water } = query;
  if (!name) return failure(400, 'missing_animation', 'Pass animation, for example animation=Walk.');
  if (!INTEGER.test(viewText) || Number(viewText) > 7) return failure(400, 'invalid_view', 'view is 0-7.');
  if (!/^\d{1,6}(\.\d+)?$/.test(tickText)) return failure(400, 'invalid_tick', 'tick is a number of ticks, 60 to the second.');
  const atlas = state.atlas();
  let animation;
  try {
    animation = findAnimation(atlas, String(name));
  } catch {
    return notFound(`No animation named "${name}". GET /api/v1/animations lists them.`);
  }
  const view = Number(viewText);
  const tick = Number(tickText);
  const pose = poseAt(atlas, animation, view, tick, undefined, parseBoolean(loop) ?? animation.loop, parseBoolean(water) ?? animation.water);
  const { tiles, count, ...rest } = pose;
  return json({ animation: animation.name, view, tick, ...rest, tiles: tiles.slice(0, count) });
}

function apiRoute(root, state, parts, query) {
  const [resource, id] = parts;
  const data = state.data();
  if (parts.length === 0) return json(manifest(root, state));
  if (parts.length > 2) return notFound();
  switch (resource) {
    case 'data':
      return parts.length === 1 ? json(data) : notFound();
    case 'cells':
      if (parts.length === 1) return json({ notice: data.notice, cells: SPRITE_CELLS });
      return SPRITE_MAP[id] ? json(SPRITE_MAP[id]) : notFound(`No cell named "${id}".`);
    case 'frames': {
      if (parts.length === 1) return json({ notice: data.notice, frames: SHP_FRAMES });
      if (!INTEGER.test(id) || !SHP_FRAMES[Number(id)]) return notFound(`A frame is 0-${SHP_FRAMES.length - 1}.`);
      return json({ frame: Number(id), notice: data.notice, tiles: SHP_FRAMES[Number(id)] });
    }
    case 'sequences': {
      if (parts.length === 1) return json({ notice: data.notice, sequences: data.sequences.filter((row) => matches(row.name, query.q)) });
      if (!INTEGER.test(id) || !SEQ_LIBRARY[Number(id)]) return notFound(`A sequence is 0-${SEQ_LIBRARY.length - 1}.`);
      return json({ notice: data.notice, ...sequenceRow(SEQ_LIBRARY[Number(id)]) });
    }
    case 'animations': {
      if (parts.length === 1) return json({ notice: data.notice, animations: data.animations.filter((row) => matches(row.name, query.q) && (!query.category || row.category === query.category)) });
      const row = data.animations.find(({ name }) => name.toLowerCase() === id.toLowerCase());
      return row ? json({ notice: data.notice, ...row, frontSequence: data.sequences[row.front], backSequence: data.sequences[row.back] }) : notFound(`No animation named "${id}".`);
    }
    case 'draw':
      return parts.length === 1 ? draw(state, query) : notFound();
    case 'kit.tar.gz':
      return parts.length === 1 ? ok(state.once('kit', () => tarGz(kitFiles(root))), GZIP) : notFound();
    case 'sheet-template.svg': {
      const scale = query.scale === undefined ? 4 : Number(query.scale);
      if (!Number.isInteger(scale) || scale < 1 || scale > 8) return failure(400, 'invalid_scale', 'scale is 1-8.');
      return ok(sheetTemplateSvg(scale), 'image/svg+xml');
    }
    default:
      return notFound();
  }
}

function siteRoute(root, state, parts) {
  const file = parts.join('/');
  switch (file) {
    case 'llms.txt':
    case 'index.md':
    case 'index.html.md':
      return ok(state.once('llms', () => llmsTxt(root)), file === 'llms.txt' ? TEXT : MARKDOWN);
    case 'llms-full.txt':
      return ok(state.once('llms-full', () => llmsFullTxt(root)), TEXT);
    case 'robots.txt':
      return ok(robotsTxt(), TEXT);
    case 'sitemap.xml':
      return ok(state.once('sitemap', () => sitemapXml(root)), 'application/xml; charset=utf-8');
    case 'openapi.json':
      return json(state.once('openapi', () => openApi(root)));
    case '.well-known/agent-skills/index.json':
      return json(state.once('skill-index', () => skillIndex(root)));
    case `.well-known/agent-skills/${SKILL_ARCHIVE}`:
      return ok(state.once('skill-archive', () => skillArchive(root)), GZIP);
    default:
      if (!state.files().has(file)) return notFound('No such file.');
      return ok(state.once(file, () => readRepositoryFile(root, file)), file.endsWith('.mjs') ? JAVASCRIPT : MARKDOWN);
  }
}

//NOTE(@jimmylee)
//`parts` is the path after /api. POST reaches only the sheet check, and its report is the answer whether the
//sheet passes or not: a sheet that does not fit is a result, not a failed request.
/** @param {string} root @param {{ method: string, parts: string[], query?: Record<string, any>, body?: Uint8Array | null }} request */
export function respond(root, { method, parts, query = {}, body = null }) {
  const state = stateFor(root);
  const [area, ...rest] = parts;
  const isCheck = area === 'v1' && rest.length === 2 && rest[0] === 'sheets' && rest[1] === 'check';
  if (method === 'OPTIONS') return { status: 204, type: TEXT, body: '', headers: { 'Access-Control-Allow-Methods': isCheck ? 'POST, OPTIONS' : 'GET, HEAD, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } };
  if (isCheck) {
    if (method !== 'POST') return failure(405, 'method_not_allowed', 'POST a PNG to this route.', { Allow: 'POST, OPTIONS' });
    if (!body?.length) return failure(400, 'missing_body', 'Send the PNG as the request body.');
    return { status: 200, type: JSON_TYPE, body: JSON.stringify(checkSheet(body, SPRITE_CELLS)), headers: { 'Cache-Control': 'no-store' } };
  }
  if (method !== 'GET' && method !== 'HEAD') return failure(405, 'method_not_allowed', 'These routes are read-only.', { Allow: 'GET, HEAD, OPTIONS' });
  if (area === 'v1') return apiRoute(root, state, rest, query);
  if (area === 'site') return siteRoute(root, state, rest);
  return notFound();
}
