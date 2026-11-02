//NOTE(@jimmylee)
//The documents an agent or crawler asks a site for. Each is built from the repository, so a new reference
//shows up in all of them and none of them keeps its own copy of a fact. llms.txt follows the llms.txt format:
//an H1, a blockquote, then H2 file lists. The skill index follows the Agent Skills discovery draft (0.2.0),
//which `npx skills add https://3d.internet.dev` reads.

import { SEQ_CATEGORIES, SEQ_LIBRARY, SHP_FRAMES } from '../constants/sprites/seq-library.js';
import { SKILL_ARCHIVE, SKILL_NAME, sha256, skillArchiveFiles, skillMarkdown, tarGz } from './kit.js';
import { listSiteFiles, readText, readVersion, skillFrontmatter } from './site-files.js';
import { SITE_URL } from './site-urls.js';

const DISCOVERY_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
const CATEGORY_NAMES = SEQ_CATEGORIES.map(({ label }) => label).join(', ');

const REFERENCE_NOTES = {
  'references/threejs.md': 'From an empty folder to a unit in any Three.js scene: Vite, no bundler, an existing game, React and React Three Fiber, and what each scene setting does to a sprite',
  'references/rebuild-animations.md': 'Every card on the site: mount it exactly, or rebuild it in your own scene from a tested recipe',
  'references/get-started.md': 'The clock and facing every renderer shares, then Canvas, CSS, Phaser, PixiJS, Godot and Unity',
  'references/data.md': 'The schema of tactics-sprite-data.json, the coordinate space and the draw algorithm in any language',
  'references/animations.md': 'Which animation a game event plays, hit ticks, chains, held frames and props',
  'references/own-sheet.md': 'Draw, import and check your own 256x488 sheet',
  'references/web-service.md': 'Every route, with examples',
  'references/troubleshooting.md': 'Symptom, cause and fix for what goes wrong most',
};

const link = (name, target, note) => `- [${name}](${SITE_URL}/${target})${note ? `: ${note}` : ''}`;

export function llmsTxt(root) {
  const references = listSiteFiles(root).filter((file) => file.startsWith('references/'));
  return `# Create Tactics ThreeJS Sprite

> Tactical RPG style sprites for any project: every TYPE1 frame and sequence as data, a sprite sheet, a small runtime for Canvas and Three.js, and a checker for your own art. Start at SKILL.md.

An agent reads SKILL.md, then the one reference its task needs. The skill is self-contained: it builds on the TYPE1 files, and what a real-time engine needs beyond them was engineered here, so no wiki or other site is needed. The kit is one download with no install step. The code, the sheet and the decoded tables are MIT: read the notice in README.md. Final Fantasy Tactics © Square Enix Co., Ltd., which has no connection to this project.

## Start

${link('SKILL.md', 'SKILL.md', 'The skill. Everything starts here')}
${link('Skill', `.well-known/agent-skills/${SKILL_ARCHIVE}`, 'tar.gz of the whole skill: every document, the kit and the engine, so nothing else needs fetching')}
${link('Kit', 'api/v1/kit.tar.gz', 'tar.gz of the runtime, data, a1.png, item models, sheet checker, layout template and notice')}
${link('llms-full.txt', 'llms-full.txt', 'SKILL.md and every reference in one file')}

## References

${references.map((file) => link(file.slice('references/'.length), file, REFERENCE_NOTES[file])).join('\n')}

## Data

${link('API manifest', 'api/v1', 'Every data route, with counts')}
${link('Animations', 'api/v1/animations', 'Every named animation, its front and back SEQ, loop and hit tick')}
${link('Sprite data', 'api/v1/data', 'All of tactics-sprite-data.json')}
${link('Draw', 'api/v1/draw?animation=Walk&view=1&tick=0', 'The exact tiles of one moment, to test a port in any language')}
${link('OpenAPI', 'openapi.json', 'The same routes as OpenAPI 3.1')}

## Runtime

${link('tactics-sprite.mjs', 'assets/tactics-sprite.mjs', 'Which tiles a unit draws now, and a Canvas drawer. No dependencies')}
${link('tactics-sprite-three.mjs', 'assets/tactics-sprite-three.mjs', 'A Three.js billboard unit, with props in its hands')}
${link('check-sheet.mjs', 'assets/check-sheet.mjs', 'Checks a PNG against the tile layout')}

## Optional

${link('Repository guide', 'AGENTS.md', 'For work inside this repository')}
${link('Decode binaries', 'skills/reverse-engineer-type1-binaries/SKILL.md', 'TYPE1.SHP and TYPE1.SEQ, opcodes, a new sheet')}
${link('Add sprite data', 'skills/add-sprite-assembly-from-source/SKILL.md', 'Assemblies and the 2D sections')}
${link('Add a Three.js mode', 'skills/add-sprite-assembly-into-threejs-engine/SKILL.md', 'Rigs in this engine')}
${link('Weapons and held items', 'three-isometric-engine/weapons/AGENTS.md', 'Generated weapons and props in a hand')}
${link('Physics bodies', 'three-isometric-engine/physics/AGENTS.md', 'A body from the sprite pixels')}
${link('Documentation', 'documentation/AGENTS.md', 'The binaries, the data and every difference from the original tactical RPG')}
${link('README', 'README.md', 'Licenses and the copyright notice')}
`;
}

export function llmsFullTxt(root) {
  const files = ['SKILL.md', ...listSiteFiles(root).filter((file) => file.startsWith('references/'))];
  return files.map((file) => `<!-- ${SITE_URL}/${file} -->\n\n${readText(root, file).trim()}\n`).join('\n---\n\n');
}

export const robotsTxt = () => `User-agent: *\nAllow: /\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;

export function sitemapXml(root) {
  const paths = ['', 'llms.txt', 'llms-full.txt', 'openapi.json', ...listSiteFiles(root).filter((file) => file.endsWith('.md'))];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((file) => `  <url><loc>${SITE_URL}/${file}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export const skillArchive = (root) => tarGz(skillArchiveFiles(root));

export function skillIndex(root) {
  const { description } = skillFrontmatter(skillMarkdown(root));
  return { $schema: DISCOVERY_SCHEMA, skills: [{ name: SKILL_NAME, type: 'archive', description, url: SKILL_ARCHIVE, digest: `sha256:${sha256(skillArchive(root))}` }] };
}

const get = (summary, parameters = []) => ({ get: { summary, parameters, responses: { 200: { description: 'OK' }, 400: { description: 'Invalid parameter' }, 404: { description: 'Not found' } } } });
const pathId = (name, description) => ({ name, in: 'path', required: true, schema: { type: 'string' }, description });
const queryText = (name, description, required = false) => ({ name, in: 'query', required, schema: { type: 'string' }, description });

export function openApi(root) {
  return {
    openapi: '3.1.0',
    info: { title: 'Create Tactics ThreeJS Sprite', version: readVersion(root), description: 'Sprite tables and tools for tactical RPG style sprites. Every response is public and read-only. Sheets sent to the check route are not stored. The sheet and the tables are MIT: see the `notice` field of /api/v1.', license: { name: 'MIT', url: `${SITE_URL}/LICENSE.md` } },
    servers: [{ url: SITE_URL }],
    paths: {
      '/api/v1': get('Manifest: version, counts, notice and links'),
      '/api/v1/data': get('All of tactics-sprite-data.json'),
      '/api/v1/cells': get('Every sprite cell'),
      '/api/v1/cells/{id}': get('One cell', [pathId('id', 'Cell id, for example P1')]),
      '/api/v1/frames': get('Every SHP frame'),
      '/api/v1/frames/{index}': get('One SHP frame, tiles back to front', [pathId('index', `0-${SHP_FRAMES.length - 1}`)]),
      '/api/v1/sequences': get('Every SEQ sequence', [queryText('q', 'Filter by name')]),
      '/api/v1/sequences/{seq}': get('One sequence', [pathId('seq', `0-${SEQ_LIBRARY.length - 1}`)]),
      '/api/v1/animations': get('Every named animation', [queryText('q', 'Filter by name'), queryText('category', `One of: ${CATEGORY_NAMES}`)]),
      '/api/v1/animations/{name}': get('One animation with its two sequences', [pathId('name', 'Animation name, for example Swing High')]),
      '/api/v1/draw': get('The tiles one moment draws, for testing a port', [queryText('animation', 'Animation name', true), queryText('view', '0-7, default 1'), queryText('tick', 'Ticks since it started, default 0'), queryText('loop', 'true or false, default the animation’s own'), queryText('water', 'true or false, default the animation’s own')]),
      '/api/v1/kit.tar.gz': get('The kit: runtime, data, a1.png, item models, checker, layout template, notice'),
      '/api/v1/sheet-template.svg': get('The 256x488 layout as labeled boxes', [queryText('scale', '1-8, default 4')]),
      '/api/v1/sheets/check': {
        post: {
          summary: 'Check a sheet PNG against the tile layout. It is read and dropped, never stored',
          requestBody: { required: true, content: { 'image/png': { schema: { type: 'string', format: 'binary' } } } },
          responses: { 200: { description: 'A report with ok, errors, warnings, colors and emptyCells' }, 413: { description: 'Over 1 MiB' } },
        },
      },
    },
  };
}
