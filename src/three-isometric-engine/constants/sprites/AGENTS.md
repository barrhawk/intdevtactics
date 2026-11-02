# constants/sprites/

Sprite data for the character sprite sheet, `a1.png`. Any sheet with TYPE1's tile layout fits it.

See `skills/add-sprite-assembly-from-source` for assembly data contracts, offset conventions, and the full 2D pipeline procedure.

These tables also feed the kit (`web/sprite-data.js`), which `scripts/export-sprite-kit.mjs` builds with plain Node. So `constants/package.json` sets `"type": "module"`, imports here are relative with extensions, and nothing here imports `@engine` or `three`. A new `SEQUENCE_MODE_ROWS` row reaches the kit by itself. A new grip does too, through `HAND_GRIPS`.

## The Sheet

`public/static/textures/a1.png`: 256x488, stored as a 4-bit indexed PNG of 15 colors and one transparent entry. Decoded, alpha is 0 or 255 and an empty pixel is `(0, 0, 0, 0)`. `SPRITE_CELLS` is everything TYPE1 can draw, so the sheet holds pixels only inside it, and `tests/character.test.js` fails on anything outside. LG58-LG60 are the three cells no frame draws. `skills/reverse-engineer-type1-binaries` "A New Sheet" has the procedure for another sheet.

## index.js — Cell Definitions

Source of truth for every sprite cell on the 256x488 sheet.

**Exports:**
- `SPRITE_SHEET_FILE` — the sheet (`a1.png`)
- `SHEET_W` (256), `SHEET_H` (488) — sheet dimensions in pixels
- `BODY_W` (32), `STANDARD_CONTAINER_H` (40) — the idle stance, re-exported by `character-utils.js`
- `SPRITE_CELLS` — 200 entries `{ id, x, y, w, h }` (170 primary + 30 SR sub-regions)
- `SPRITE_MAP` — O(1) lookup by ID, built from `SPRITE_CELLS`

**ID prefixes:**

| Prefix | Content |
|--------|---------|
| P | Idle body (P1-P5) |
| BF/BB | Walk body front/back |
| RF/LF/RB/LB | Walk hands (R=behind, L=in-front) |
| DF/DB | Flinch. DF1/DB1 (32x24): head + torso. DF2/DB2 (32x16): waist-to-feet |
| KO | Preassembled. KO1-KO2: dead (40x32). KO3-KO4: kneeling (32x32) |
| CH | Magic charge body (32x32) |
| AF/AB | Torso, headless 32x32 |
| TF/TB | Head tiles front/back |
| LG | Hands (`LG` is a misnomer) |
| EF/EFL/EFR | Extended hand variants |
| SP | Head sprites |
| SR | Sub-regions (SR1-SR30) |
| HR | Torso, headless 16px |
| ST | Dead body in water (24x24 partial) |
| HD, HF/HB, FF/FB | Mid-body strips of the water frames F182+, neither heads nor feet whatever the names say: HD under the idle heads, HF/HB under the walk heads, FF/FB under the torso top strips |
| OV/AU/WX | Misc overlays (aura, effects) |

**Categorization sets** (O(1) membership). The main route highlights the first three in its composites, and only tests read the fourth:
- `HEAD_SPRITE_IDS` — SP1-4, TF1-2, TB1-2, SR2-16
- `HAND_SPRITE_IDS` — LF/RF/LB/RB 1-5, EF1-2, EFL/EFR 3-5, LG1-61
- `WAIST_TO_FEET_IDS` — AU1-2, DF2, DB2, HB1-5, SR17-20
- `TORSO_SPRITE_IDS` — AF/AB 1-5, HD/HF/HB/HR/FF/FB series

`PREASSEMBLED_SPRITE_IDS`, `FULL_BODY_WITHOUT_HANDS_SPRITE_IDS` and `EXTENDED_HAND_SPRITE_IDS` are the other sets.

## assembly.js — Animation Assemblies

Maps sprite cells into animation sequences with rotation patterns, reversal flags, and SHP position offsets. 4 patterns (A/B/C/D), pattern index resolved via `ASSEMBLY_STEP_MAP` in `character-utils.js`.

**Assembly exports:**

| Assembly | Structure |
|----------|-----------|
| `IDLE_ASSEMBLY` | 8 rotation steps, P1-P5 |
| `WALK_ASSEMBLY` | 4 patterns x 5 body + 5 hand pairs with dx/dy |
| `JUMP_ASSEMBLY` | 4 patterns x 9 frames with behind/body/front, each frame's `move` from SEQ 204/205: five take-off frames (SEQ 204/205), the Mid Jump pose (SEQ 42/43), High Jump Land (SEQ 52/53) |
| `JUMP_TICKS` / `JUMP_AIR_TICKS` / `JUMP_TAKEOFF_FRAMES` | Jump delays in ticks, the one owner: `JUMP_DELAYS` (ms, 2D page) and `JUMP_DELAYS_S` (`actions/action-timelines.js`) derive from them |
| `CAST_ASSEMBLY` | 4 patterns x 2 frames with overlayDx/overlayDy (overlay renders behind the body) |
| `QUICK_THROW_ASSEMBLY` | 4 patterns x 6 frames, behind/head/over/front; frame `move` carries the overhead frame's 2px rise |
| `THROW_STONE_ASSEMBLY` | 4 patterns x 12 frames, farBehind/behind/head/over/front |
| `THROW_STONE_TICKS_FWD` / `THROW_STONE_TICKS_BCK` | SEQ 208 / 209 delays in ticks — the one owner: `THROW_STONE_DELAYS_FWD/BCK` (ms, 2D page) and `THROW_STONE_DELAY_MAP` (exact seconds, `actions/action-timelines.js`) derive from them |
| `THROW_STONE_GRIPS[sheet].fwd` / `.bck` | Throwing-hand grip per SEQ 208 / 209 frame, keyed by sheet (`a1.png`): `{ layer, id, x, y }` — the assembly layer whose tile draws the throwing hand and the hand's center pixel on that tile (tile-local, the pixel holding the centroid of its visible hand pixels). Tile rects are shared and art is not, so a grip belongs to one sheet. Non-null from the kneel pick-up (frame 2) to the last held frame (frame 6, F92/F141). Frame 7 draws the arm's follow-through with an empty hand |
| `THROW_STONE_HANDS[sheet].fwd` / `.bck` | Derived from the grips: the grip pixel's center `[u, v]` in unit pixels from `SHP_ORIGIN_X` / `STANCE_Y` (mirrored for A/D), placed from the frame's body anchor and the layer's offset exactly as the renderers place the tile; the held stone follows it (`throwStoneHandPoint` in `actions/action-timelines.js`). Quick Throw reuses frames 2-5 for a caught marble: SEQ 48/49 draw the same frames there. |
| `CARRY_TRACK.fwd` / `.bck`, `CARRY_ORIGIN_V` | Where the game carries an object, per SHP frame: `[forward px, height px]` from SEQ 80/81's `0xC4` opcodes, height from the SHP origin row (`STANCE_Y + CARRY_ORIGIN_V`). Needs no sheet and no camera, so a caught marble's hold height follows it (`quickThrowHoldHeight`) |
| `PUNCH_ASSEMBLY` | 4 patterns x 9 frames, farBehind/head/front (4-tile, P1, Bow High) |
| `PUNCH_LV2_ASSEMBLY` | 4 patterns x 8 frames, farBehind/head/front (4-tile, P2, Bow Mid) |
| `PUNCH_LV3_ASSEMBLY` | 4 patterns x 8 frames, farBehind/head/front (4-tile, P3, Bow Low) |
| `HAND_GRIPS` / `BOW_DRAW_GRIPS` | The hand on `a1.png` by arm tile, `[x, y, degrees]`: tile-local center pixel and the forearm's angle, 0 along the facing and 90 up. The draw hand by torso tile, tile-local. Each Bow frame derives `bowHand` and `drawHand` (`[u, v]` in unit pixels from `SHP_ORIGIN_X` / `STANCE_Y`, `drawHand` null on the ready pose) from them, for the generated bow, and `heldHand` and `heldMarblePoint` (`weapons/held-items.js`) read them for Set's items and the marbles on any SHP frame. TYPE1 draws no weapon |
| `HAND_RESTS` | The top of the fist on `a1.png`, tile-local, for a tile whose other hand colors pull `HAND_GRIPS`' centroid onto the sleeve: where a blade laid across the hand rests (`heldRest`, `weapons/held-items.js`) |
| `STAB_ASSEMBLY` | 4 patterns x 9 frames, farBehind/head/front (4-tile, S1, Unarmed High) — 3D mode S1 |
| `STAB_LV2_ASSEMBLY` | 4 patterns x 9 frames, farBehind/head/front (4-tile, S2, Unarmed Mid) — 2D page and demo status; the 3D mode S2 plays `seq-library.js` |
| `STAB_LV3_ASSEMBLY` | 4 patterns x 9 frames, farBehind/head/front (4-tile, S3, Unarmed Low) — 3D on A1; the 3D mode S3 plays `seq-library.js` |
| `FLOAT_ASSEMBLY` | 4 patterns, one 3-tile pose (body + 2 hands); the whole unit hovers by `FLOAT_MOVES` on `FLOAT_DELAYS` (SEQ 12/13 = animation 0x12/0x13, the floating-unit idle) — 3D mode FL |
| `GUARD_ASSEMBLY` | 4 patterns, static 3-tile (body + 2 hands) |
| `HURT_ASSEMBLY` | 4 patterns, top + bottom stacked; shivered by `HURT_SHIVER_MOVES` on `HURT_SHIVER_DELAYS` |
| `DEATH_ASSEMBLY` | 4 patterns, single KO tile |
| `KNEEL_ASSEMBLY` | 4 patterns, single KO3/KO4 tile |
| `FATAL_ITEM_IMPACT_ASSEMBLY` | 4 patterns x 3 unique compositions, variable tile counts; played by `FATAL_ITEM_IMPACT_TIMELINE` on the 2D page; the 3D mode FI plays `seq-library.js` |
| `ITEM_DROP_ASSEMBLY` | 4 patterns x 3 frames, variable tile counts — 2D page; the 3D mode ID plays `seq-library.js` |
| `TORSO_HEAD_MAP` | Deterministic AF/AB to TF/TB mapping with fixed dx/dy |
| `SHP_ORIGIN_X` / `STANCE_Y` | Unit origin column (canvas 53 — the game's mirror axis) and idle stance center row (canvas 103) |
| `BODY_ANCHOR_MAP` | Body tile → center offset from (`SHP_ORIGIN_X`, `STANCE_Y`) in TYPE1.SHP; reversed patterns mirror dx |
| `WALK_BOB_DY` | Extra sink of walk base frames in F9-F18: `[2, 1, 0, 1, 2]` |

## shp-frames.js and seq-library.js — Every Frame and Sequence

The whole of TYPE1 as data, from `TYPE1.SHP` and `TYPE1.SEQ`. `tests/sprite-shp-parity.test.js` holds both to `tests/fixtures/type1.json`; never edit a value by hand.

- `SHP_FRAMES[fi]`: all 364 frames, tiles back to front, `[id, u, v]` center in unit pixels from (`SHP_ORIGIN_X`, `STANCE_Y`), fourth element 1 on SHP reverseX.
- `SEQ_LIBRARY[seq]`: all 218 sequences: `seq`, `raw` (animation id), `name`, `loop`, `frames`, `ticks` (0 = held), `fb` / `du` (accumulated unit motion, omitted when still), `events` (PlaySound, PostGenericAttack ticks), `delaysS`, `totalS`.
- `SEQ_PAIRS`: front/back pairs (even/odd from SEQ 6, SEQ 0-5 stand alone), with a display `name` that drops the facing. `documentation/seq_animation_to_frame/AGENTS.md` "Names" is the reference for animation names. `SEQ_CATEGORIES` by what they animate, `DEFAULT_LIBRARY_PAIR`.
- `SEQUENCE_MODES`: every distinct animation with no assembly and a mode of its own, one entry per `SEQUENCE_MODE_ROWS` row: `mode`, `name`, `title` ("Swing High (SW1)"), `section` ("Swing High (102, 103)"), `seq` (the SEQ pairs), `pair`, `loop`, `hitTick` (PostGenericAttack, null for a non-attack), `water` (draws F(n + 182); Nulled Walk only). `documentation/seq_animation_to_frame/AGENTS.md` "Sequence Modes" lists them.
- `SHP_WATER_OFFSET` (182), `shpBodyIndex(tiles)`: the tile that goes on the depth-writing body plane. `TICKS_PER_SECOND` (60).

Not in the tables: MoveUnitRL (`0xF0`, SEQ 36/37), effect opcodes, and weapons, which TYPE1 does not draw.

## Assembly Conventions

**Body anchors.** At module load every composite frame (walk `body[i]`, `frames[i]`, and the Guard / Float / Hurt patterns) gets `anchor: { dx, dy }` from `BODY_ANCHOR_MAP` (+ `WALK_BOB_DY` for walk and Guard); Idle, Kneel and Dead entries get their tile's anchor. Renderers place the body at its anchor and overlays relative to the body, mirroring about the origin for reversed patterns, which reproduces the game's per-frame placement including its mirrored directions.

**SEQ unit motion.** TYPE1.SEQ move opcodes (MoveUp/Down/Forward/Backward 1/2, MoveUnitFB/DU) translate the whole unit. Punch, stab, jump and quick throw frames get `move: { fb, du }` at module load (per-frame offset accumulated from the sequence start: `fb` px forward along the facing, `du` px down); `FLOAT_MOVES` / `FLOAT_DELAYS`, `HURT_SHIVER_MOVES` / `HURT_SHIVER_DELAYS` and `FATAL_ITEM_IMPACT_TIMELINE` (`{ frame, delay, move }` per SEQ draw) hold the playback of sequences that redraw one composition.

**Depth.** Back-to-front: `farBehind` < `behind` < body < `head` < `over` < `front`; Cast `overlay` and Hurt `bottom` render behind their body. No tile carries a per-tile flip — TYPE1.SHP has none on ported overlays.

**Parity.** `tests/sprite-shp-parity.test.js` reads the decoded `TYPE1.SHP` and `TYPE1.SEQ` (via `tests/helpers/fft-type1.js`, see `documentation/AGENTS.md` "Parity Tests") and checks every assembly frame (tiles, offsets, flips, depth, anchor), SEQ order, delays, unit motion, `BODY_ANCHOR_MAP`, `WALK_BOB_DY` and `TORSO_HEAD_MAP`; `tests/sprite-rig-parity.test.js` checks the ThreeJS groups render the same frames. Documented, intentional differences: Jump joins SEQ 204, 42 and 52 (205, 43, 53) and holds the middle one for `JUMP_AIR_TICKS`; Quick Throw draws the held F31/F33 of SEQ 48/49 for the 2 ticks SEQ 206/207 give it.

**Timing arrays:** every ms array is the exact SEQ time (`ticks × 1000 / 60`, unrounded), so sums are the SEQ's durations and an action timed in ticks falls on a frame boundary.

| Array | Ticks | Total |
|-------|-------|-------|
| `WALK_DELAYS` | [6,8,10,8,6,8,10,8] | 64 |
| `JUMP_DELAYS` | [2,8,4,4,4,32,2,10,6] | 72 |
| `QUICK_THROW_DELAYS` | [4,4,8,2,4,2] | 24 |
| `THROW_STONE_DELAYS_FWD/BCK` | pattern-dependent | 38/42 |
| `PUNCH_DELAYS` | [2,8,2,4,10,18,2,2,4] | 52 |
| `PUNCH_LV2_DELAYS` | [2,8,2,4,10,18,2,4] | 50 |
| `PUNCH_LV3_DELAYS` | [2,8,2,4,10,18,2,4] | 50 |
| `STAB_DELAYS` | [4,8,2,2,2,14,2,2,4] | 40 |
| `STAB_LV2_DELAYS` | [4,8,2,2,2,14,2,2,4] | 40 (2D) |
| `STAB_LV3_DELAYS` | [4,8,2,2,2,14,2,2,4] | 40 |
| `FATAL_ITEM_IMPACT_DELAYS` | [4,6,16] | 26 (2D) |
| `ITEM_DROP_DELAYS` | [16,6] | 22 (2D) |
