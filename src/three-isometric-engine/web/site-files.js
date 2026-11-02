//NOTE(@jimmylee)
//What the site serves from the repository, and only that: a map of URL paths built by walking first-party
//folders. A request is looked up in the map and never joined onto a path, so `..` has nothing to reach.
//NEXT.md stays out, because it is the owner's work list, and so does everything not named here. The host
//runs from a full checkout and reads these at run time, so Turbopack need not trace the project for them.
//The engine's source is not on that list: it travels in the skill archive, through `listEngineFiles`.

import fs from 'node:fs';
import path from 'node:path';

const ROOT_DOCUMENTS = ['SKILL.md', 'AGENTS.md', 'README.md', 'LICENSE.md'];
const DOCUMENT_FOLDERS = ['references', 'skills', 'documentation', 'pages', 'three-isometric-engine'];
const ENGINE_FOLDER = 'three-isometric-engine';
const ENGINE_FILE = /\.(css|js|json|jsx|md|ts|tsx)$/;
export const RUNTIME_FILES = ['tactics-sprite.mjs', 'tactics-sprite-three.mjs', 'check-sheet.mjs'];

function walkFiles(root, folder, keep, found) {
  for (const entry of fs.readdirSync(/*turbopackIgnore: true*/ path.join(root, folder), { withFileTypes: true })) {
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory()) walkFiles(root, relative, keep, found);
    else if (entry.isFile() && keep.test(entry.name)) found.push(relative);
  }
}

export function listSiteFiles(root) {
  const present = new Set(fs.readdirSync(/*turbopackIgnore: true*/ root));
  const found = ROOT_DOCUMENTS.filter((file) => present.has(file));
  for (const folder of DOCUMENT_FOLDERS) if (present.has(folder)) walkFiles(root, folder, /\.md$/, found);
  for (const file of RUNTIME_FILES) found.push(`assets/${file}`);
  return found.sort();
}

export function listEngineFiles(root) {
  const found = [];
  walkFiles(root, ENGINE_FOLDER, ENGINE_FILE, found);
  return found.sort();
}

export const readRepositoryFile = (root, file) => fs.readFileSync(/*turbopackIgnore: true*/ path.join(root, file));
export const readText = (root, file) => readRepositoryFile(root, file).toString('utf8');

//NOTE(@jimmylee)
//The README's "Copyright" section is the notice the contract says to keep with the sheet and the tables, so
//this reads it rather than keeping a second wording.
export function readNotice(root) {
  const readme = readText(root, 'README.md');
  const start = readme.indexOf('## Copyright');
  const end = readme.indexOf('\n## ', start + 1);
  if (start === -1) throw new Error('README.md has no "Copyright" section');
  return readme.slice(start + '## Copyright'.length, end === -1 ? undefined : end).trim();
}

//NOTE(@jimmylee)
//The kit carries Set's models, so it carries their credit, in the words of README.md "Licenses".
export function readItemModelCredit(root) {
  const credit = /^- (\*\*Item models\*\*.*)$/m.exec(readText(root, 'README.md'));
  if (!credit) throw new Error('README.md "Licenses" has no "Item models" credit');
  return credit[1];
}

export const readVersion = (root) => JSON.parse(readText(root, 'package.json')).version;

export function skillFrontmatter(markdown) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(markdown);
  const fields = {};
  for (const line of match ? match[1].split('\n') : []) {
    const field = /^([a-z-]+):\s*(.*)$/.exec(line);
    if (field) fields[field[1]] = field[2];
  }
  return fields;
}
