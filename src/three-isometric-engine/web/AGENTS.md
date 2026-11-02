# Web Service

What https://3d.internet.dev serves besides the page: the skill, the sprite tables and the tools, for agents and for projects outside this repository. `references/web-service.md` is the public guide, and this file is how it is built.

Every route is one case of `respond` in `routes.js`, a pure function from a request to `{ status, type, body, headers }`. `pages/api/[...route].ts` is its only caller. `next.config.js` gives the routes their public names, and `tests/web-routes.test.js` calls `respond` with no server.

| File | Owns |
|------|------|
| `routes.js` | Every route, its status and its content type |
| `site-files.js` | The list of files the site may serve, the list of engine files the archive carries, `RUNTIME_FILES`, the notice and the items' credit from `README.md`, the skill's frontmatter |
| `site-urls.js` | `SITE_URL` and `REPOSITORY_URL`, which the page imports too |
| `sprite-data.js` | `tactics-sprite-data.json`, built from `constants/sprites/` and `weapons/held-items.js` (`references/data.md` is its schema) |
| `kit.js` | `kitFiles`, the one list behind the kit download, `scripts/export-sprite-kit.mjs` and the skill archive, `skillArchiveFiles`, which is the whole skill, and the tar writer |
| `agent-documents.js` | `llms.txt`, `llms-full.txt`, `robots.txt`, `sitemap.xml`, the skill index and the OpenAPI document |

This folder, `constants/` and `weapons/` have a `package.json` with `"type": "module"`, because `scripts/export-sprite-kit.mjs` and the check script run them with plain Node. What that script reaches, this folder, `constants/character.js`, `constants/sprites/` and `weapons/held-items.js`, imports with relative paths and extensions, and stays free of `@engine` and of `three`.

## The Rules

- **No second copy.** Numbers come from `constants/sprites/`, wording from `SKILL.md`, `references/` and `README.md`, and a new reference appears in `llms.txt`, `llms-full.txt`, the sitemap and the archive by existing. Give it a line in `REFERENCE_NOTES`.
- **The notice travels with the tables.** Every route that returns a table carries `notice`, read from `README.md` "Copyright", and the kit and the archive carry `NOTICE.md`, which adds the credit for `set-items.glb` from `README.md` "Licenses" and the text of `LICENSE.md`, because CC BY and MIT each ask for theirs in every copy. `tests/web-routes.test.js` checks each one.
- **The archive is the whole skill.** `skillArchiveFiles` carries every document the site serves, the engine, the decoder and the kit under `assets/`, so an install fetches nothing more and `references/rebuild-animations.md` copies the engine from beside it. The page and the tests stay out. `tests/skill-documents.test.js` "the skill stands alone" extracts its names and fails on a path a document needs and it lacks.
- **The map decides.** A path is looked up in `listSiteFiles`, never joined onto the disk. Adding a folder there publishes it, so `NEXT.md`, `package.json`, `.env`, `scripts/` and `public/` stay off the list, and the engine's source is not served file by file. `public/` serves itself.
- **Read-only.** The one POST reads a sheet, reports and drops it. It stops at `MAX_SHEET_BYTES`, and `decodePng` refuses a wrong size before inflating and caps what it inflates, because a small file can inflate to gigabytes.
- **The archive is reproducible.** `tarGz` fixes times and order, so the same files give the same bytes and the digest in `/.well-known/agent-skills/index.json` holds across restarts and instances.
- **A built response lasts the process.** `stateFor` caches what reads files, so a deploy is what changes them, and in `next dev` a changed document needs a restart.
- **Files come from disk.** Documents are read from `process.cwd()`, so the host runs `next start` from a full checkout, as `npm run start` does. A deploy that ships only `.next` has no documents.

## Public Names

`next.config.js` holds them. A path ending in `.md` goes to `/api/site/<same path>`, and so does `/assets/*`, so a relative link in `SKILL.md` is the same path in a checkout and on the site. `/` answers `Accept: text/markdown` with the `index.md` route, from `beforeFiles` because the page would answer first. `/` also sends a `Link` header, and `pages/_document.tsx` has the matching `<link>` tags, which is how the llms.txt format says an agent finds them.

## Adding a Route

1. Add the case to `routes.js`. Validate every parameter there and answer a bad one with `failure`.
2. A table carries `notice`.
3. Add it to `openApi` in `agent-documents.js` and to `references/web-service.md`. `tests/web-routes.test.js` calls every GET in `openApi`.
4. A new root name goes in `SITE_FILES` in `next.config.js`.

The kit's runtime is `assets/`, covered by the same tests. `tests/sprite-kit.test.js` holds it to the engine, so a change to how a group draws or a card holds an item shows up there. Change both, or neither. A new kit file goes in `RUNTIME_FILES`, which the kit, the archive and the site all read.
