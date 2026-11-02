# Character Groups — ThreeJS Rendering

Per-mode ThreeJS implementations that translate 2D sprite data (verified on the main route) into 3D billboard composites. Each group file self-registers its factory via `registerCharacterMode(mode, factory)` (from `common/registry.js`); `createCharacter.js` is a single `getCharacterModeFactory(mode)` lookup with a fallthrough idle renderer. Shared utilities live in `character-utils.js`.

See `skills/add-sprite-assembly-into-threejs-engine` for the billboard composite architecture, pattern rules, and procedure for creating new 3D modes.

## Files

```
character-groups/
├── group-walk.js           # I, W — body + 2 hands, 8-frame loop
├── group-jump.js           # J  — body + 2 hands, JUMP_ASSEMBLY once per jump (take-off, Mid Jump pose, landing)
├── group-flinch.js         # H  — top + bottom stacked, 1px SEQ shiver (pooled)
├── group-dead.js           # D  — single KO mesh, terminal (pooled)
├── group-kneel.js          # K  — single KO3/KO4 mesh, static (pooled)
├── group-magic-charge.js   # C  — body + overlay, 2-frame loop
├── group-quick-throw.js    # T  — body + 4 overlays + buffer, 6-frame
├── group-throw-stone.js    # TS — body + 5 overlays + buffer, 12-frame
├── group-punch.js          # P1 — body + 3 overlays (4-tile), 9-frame loop
├── group-punch-lv2.js      # P2 — body + 3 overlays (4-tile), 8-frame loop
├── group-punch-lv3.js      # P3 — body + 3 overlays (4-tile), 8-frame loop
├── group-guard.js          # G  — body + 2 hands (3-tile), static
├── group-float.js          # FL — body + 2 hands (3-tile), 2px SEQ hover loop
├── group-stab.js           # S1 — body + 3 overlays (4-tile), 9-frame loop
├── group-sequence.js       # S2, S3, FI, ID, SEQUENCE_MODES, SQ — any TYPE1 sequence, tile by tile from seq-library.js
```

**A1 (the player mode)** reuses `group-walk.js`: `registerCharacterMode('A1', wrapper, { directional: false })` calls `createWalkGroup`, then adds a stab head overlay (`ch._stabHeadMesh`) and a cast overlay (`ch._castOverlayMesh`). `walkStopped` controls idle or walk rendering. The idle path applies the idle frame (P1-P5) when `step !== ch.lastStep || ch.lastFrame !== -1`, so the body switches from a walk frame on the walk → idle transition even when the camera step has not changed. The demo card drives it directly; this repository has no keyboard input.

**A1 jump animation**: `group-walk.js` renders `JUMP_ASSEMBLY`, before the idle check so jump visuals take priority over the FALLING idle path. While `ch._jumpAction` is set the frame comes from `playerJumpFrame(elapsed)` (`actions/action-timelines.js`): the last two take-off frames, then the Mid Jump pose F28/F30 until landing clears `_jumpAction`. Touchdown stamps `ch._landedAt`, and `playerLandFrame(elapsed)` plays High Jump Land (F27, F21, F19, 18 ticks) while the unit stands still in IDLE. A1 overlay meshes are created with combined walk+jump+stab max dimensions (`A1_BEHIND_MAX_W`, `A1_FRONT_MAX_W`, etc.) so every tile fits. Body heights come from `JUMP_BODY_HEIGHTS` (standing 40, crouching 16, kneeling 32), bodies sit at their anchors plus the frame's SEQ `move`, mirrored for A/D.

**A1 stab animation**: `group-walk.js` renders a 9-frame non-looping Stab Lv3 animation from `STAB_LV3_ASSEMBLY` when `ch._attackAction` is set, before the jump check. Uses `resolveVariableFrame` with `STAB_LV3_DELAYS_S`. 4-tile composition: farBehind on `children[1]`, front on `children[2]`, head on `ch._stabHeadMesh`. The body follows the frame's SEQ `move` via `seqMoveLocal`. `ch._castOverlayMesh` is hidden during the stab.

**A1 cast animation**: `group-walk.js` renders a 2-frame cast animation from `CAST_ASSEMBLY` when `ch._castAction` is set, between the stab and jump checks. Body tiles CH1-CH4 (32×32), overlay SR17/SR18 (32×16) at renderOrder `BEHIND` (SHP F35-F38 draw it behind the CH body). `CAST_FRAME_S`, 20 ticks per frame. `ch._stabHeadMesh` is hidden during the cast.

## Sequence Modes (group-sequence.js)

One composite plays any TYPE1 sequence from `SHP_FRAMES` / `SEQ_LIBRARY`, with no assembly: S2 and S3 loop, FI and ID play once and hold their last frame, the 77 `SEQUENCE_MODES` rows register in one loop (attacks loop, the others follow their SEQ, Nulled Walk plays its water frames), and SQ has no card: `setSequencePair(root, pair, loop, water, now)` re-points it, which is how the rig parity suite walks every sequence. The demo cards use the same call to chain sequences. A frame's biggest tile goes on the body plane, which writes depth; the others go on 5 overlay planes, with `renderOrder` = tile index − body index, so the draw order is the SHP's. Patterns A/B play the front sequence, C/D the back one, and A/D mirror about the origin. A frame reaching below the stance bottom (KO1/KO2) moves toward the camera along the view axis, as Dead does. A card with an item in its hand sets `ch.itemLayer`, and the tiles over the item move `ITEM_LAYER_GAP` toward the camera the same way (`tileOverItem`). An item pointing along the view sets `ch.itemEnd` each frame, which puts it in front of every tile or behind them all (`weapons/AGENTS.md` "What Covers What"). The driver keeps that move in `ch.spriteLift`, for the item. Idle sprite during FALLING or SPAWNING; the sequence starts from the settle frame's `walkStart`. A new sequence mode is one `SEQUENCE_MODE_ROWS` row in `constants/sprites/seq-library.js`.

## Draw Order and Visual Drivers

Every character has one visual driver mesh that updates the whole composite — group quaternion, frame/pattern/step, child position/scale, UVs and child visibility: the body of each composite, the modeless idle mesh, the flinch top plane, the kneel/dead meshes. Factories register it with `setVisualDriver(root, driver, update)` (`character-utils.js`), never by assigning `onBeforeRender`.

WebGLRenderer (three r187) builds its draw list from `visible` / `material.visible` and sorts transparent objects by `renderOrder` before any object's `onBeforeRender` runs, then calls each object's `onBeforeRender` right before drawing it without re-checking `visible`. A composite updated from its body's own `onBeforeRender` therefore drew its `FAR_BEHIND` / `BEHIND` layers with the previous frame's tile and transform on every frame, pattern or camera change, missed the layers it un-hid (the landing frame drew the torso without hands/head) and still drew the layers it hid (the re-drop frame drew the old hands, at their old offsets under the raised group, over the idle body). `Scene.onBeforeRender` runs before the draw list is built, so `syncCharacterVisuals` is installed there by every demo scene, and runs the driver of every visible scene-root character first; the driver's own `onBeforeRender` then skips the repeat (per-render stamp), and still updates a character that a scene without the hook draws. Characters and their temporary visuals (flinch, kneel, dead) are always added at the scene root. Every update ends with `updateMatrixWorld` because the renderer has already updated world matrices when the hook runs. `tests/sprite-animation-demos.test.js` replays the renderer's sequence for every demo at every camera step through landings and re-drops and requires zero stale, missing or ghost layers (and reproduces all three with the hook removed).

## Mode Details

**Idle** (default) — Single mesh. 32x40 body, P1-P5, 8 rotation steps, placed at the tile's anchor: P3/P5 on the origin column, the 3/4 views 1px left of it, mirrored for steps 5-7 (SHP F4-F6). The canonical "standing" appearance — composite modes show `IDLE_FRAMES` when not actively performing their mode action, positioned by `placeIdleBody`. The modeless idle mesh's position is owned by its caller, so its anchor lives in its own plane geometry (`IDLE_BODY_DX`, shifted on rotation-index change); its driver ends with `updateMatrixWorld()` so the billboard is drawn with this frame's camera rotation.

**Walk (I)** — Body + 2 hands. Constant 32x40 bodies. Ping-pong `[2,1,0,1,2,3,4,3]`. Variable timing via `WALK_DELAYS`. Each base frame's `anchor` carries the SHP walk bob (`WALK_BOB_DY` = `[2,1,0,1,2]` px), so the body sinks 1-2px on stride frames. The hot walk loop reads `WALK_DELAYS_S` / `SEQ_FRAME_MAP` and module-level per-pattern tables (`WALK_PATTERN_FLIP_X`, `WALK_PATTERN_BEHIND`, `WALK_PATTERN_FRONT`) so the per-frame render path does no string ops and no per-frame `bodyH / MAX_CONTAINER_H` divide — walk bodies are uniform height so `WALK_BODY_SCALE_Y` is computed once per group; body Y is two multiplies from the frame anchor.

**Jump (J)** — Body + 2 hands. Draws `JUMP_ASSEMBLY` once per jump from `JUMP_DELAYS_S` (`actions/action-timelines.js`): the five take-off frames of Jump 2 (SEQ 204/205) on the ground, the Mid Jump pose F28/F30 in the air (`JUMP_AIR_FRAME`, `JUMP_AIR_TICKS` = 32) and High Jump Land (SEQ 52/53) on the ground, 72 ticks. Body heights change per frame (standing 40, crouching HR1/HR2 16, kneeling KO3/KO4 32), and a crouching frame draws its legs on the behind plane and its head on the front plane; the kneel has neither. The caller keeps the unit on the ground through the take-off, lifts it on `jumpLift` (peak `JUMP_LIFT_HEIGHT` = 2 cubes halfway through the hold) and puts it back down on the first landing frame, so the drawn pose and the height always agree. Shows idle sprite when `_lastCycle === -1`.

**Taking Damage (H)**, the engine's Flinch — Top (32x24) + bottom (32x16), placed from `HURT_ASSEMBLY`: top at its anchor (on the origin column, 4px above the stance center), bottom `bottomDy` (17px) below it, overlapping the top's last 3 rows from behind (`BEHIND`). The group is billboarded (UVs swapped when the rotation step changes, planes mirrored for A/D). SEQ 38/39 shiver: both planes are re-placed every frame 1px up, then back, every 2 ticks (`HURT_SHIVER_MOVES` / `HURT_SHIVER_DELAYS`, phase from `walkStart`) — on every knockback flinch too. 8 rotation steps mapped to 4 patterns. Pooled: `releaseFlinchGroup()` hides and returns to `_flinchPool`; `createFlinchGroup()` reuses pooled groups (disposes old textures, clones new ones). `destroyFlinchPool()` disposes all pooled materials and textures on scene teardown; its two planes are shared geometry (`getSharedGeometry`) and outlive the pool. Pool capped at `MAX_VISUAL_POOL_SIZE` — excess items are disposed at release time instead of pooling.

**Dead (D)** — Single mesh. KO1/KO2 (40x32). Terminal. Drawn at the shared pixel scale (`createSinglePoseGeometry`: `PX_TO_WORLD` wide, `SPRITE_HEIGHT / STANDARD_CONTAINER_H` tall). The mesh position is the body center (a flat box, resting half-height `CHAR_HALF_Z`); `placeSinglePose` translates the geometry so the plane sits at its SHP anchor (KO1/KO2: on the origin, 12px below the stance center — 8px below the stance bottom) from the stance point `DEAD_PIVOT_RISE` (14) above the body center, expressed in the camera frame. Because that reaches below the floor, the plane is also moved toward the camera along the view axis (orthographic: no screen change) until its bottom edge clears the ground, capped at half a cube of horizontal travel (below ~20° of elevation the lowest rows stay clipped). Geometry is retranslated only when the rotation index or camera elevation changes; the visual driver then calls `updateMatrixWorld()`. Pooled: `releaseDeadMesh()` / `createDeadMesh()` / `destroyDeadPool()` — same pattern as flinch. Pool capped at `MAX_VISUAL_POOL_SIZE`.

**Critical (K)**, the engine's Kneel — Single mesh. KO3/KO4 (32x32). Static. Same single-pose placement as Dead with `KNEEL_PIVOT_RISE` (6); KO3/KO4 sit 1px left of the origin, mirrored for A/D, 4px below the stance center (`KNEEL_BODY_DX` / `KNEEL_BODY_DY`), so the bottom row is the standing bottom row and no lift is needed. Pooled: `releaseKneelMesh()` / `createKneelMesh()` / `destroyKneelPool()` — same pattern as flinch. Pool capped at `MAX_VISUAL_POOL_SIZE`.

**Singing (C)**, the engine's Magic Charge — Body + overlay. CH1-CH4 bodies (32x32) at their anchor (4px above the stance center); SR17/SR18 legs strip renders `BEHIND` the body. 2-frame loop at 20 ticks per frame. The visual driver shows the idle sprite during FALLING or SPAWNING states. 

**Quick Throw (T)**, drawing High Jump Start — Body + behind hand + front hand + head + over + buffer. Variable body heights. Non-looping, 24 ticks: the 5 stance-to-reach frames, then F31/F33, both arms overhead, 2px up (`move`, SEQ's MoveUp2) with the AU1/AU2 hem on `over`, for the 2 ticks SEQ 206/207 give it. The Mode T wrapper offsets `walkStart` by -1000ms so the animation reads as "already done" on creation, landing the character in idle. Both `createQuickThrowGroup` and the wrapper thread the shared per-frame `now` from the parent factory chain — `initialElapsed = (now - walkStart) / 1000` resolves to `1.0` for the offset Mode T path (idle pose) and `0.0` for any non-T call site that constructs the group fresh. Zero `performance.now()` calls anywhere in `group-quick-throw.js`. A caught marble (`ch._heldMarble`) is drawn by this driver through `quickThrowMarblePoint` (`actions/action-timelines.js`): from the catch point to the kneel hand over frames 0-1, on the hand through frames 2-4 (F21/F22, F19/F20, F27/F29), and on frame 5 (F31/F33, the release) from the overhead hand to the body's arc. High Jump Start SEQ 48/49 frames 2-5 are Dragoon Jump 3 SEQ 208/209 frames 2-5, so the hand is `throwStoneHandPoint`. Its `position` rises on a camera-independent hold path (half a cube forward, `quickThrowHoldHeight` from the carry track `CARRY_TRACK`) and leaves from the top of it, so the driver writes the marble's `matrixWorld`, never its `position`: the path does not depend on the camera, and the next frame's matrix update restores the mesh.

**Throw Stone (TS)**, drawing Dragoon Jump 3 — Body + farBehind + behind + head + over + front + buffer. 12-frame cinematic. 5 overlay z-layers. Pattern-dependent delays from `THROW_STONE_DELAY_MAP` (`actions/action-timelines.js`), the same map the demo station resolves, so the held stone and the drawn frame never disagree at a frame boundary. The stone appears in the hand on the kneel (frame 2, F21/F22), follows the throwing hand of each frame (`THROW_STONE_GRIPS[sheet]` → `THROW_STONE_HANDS[sheet]` via `throwStoneHandPoint`, which reads the sheet the thrower is drawn with: billboard-local `(u · scaleX · flip, −v · scaleY)` rotated by the camera quaternion, pushed toward the camera) through frame 6 (F92/F141). It is thrown as frame 7 (F102/F151) starts, the first frame after the SEQ's PlaySound: that frame draws the arm low with an empty hand, so the stone leaves the frame 6 hand on one arc from the camera-independent release point (`throwStoneLaunchPoint`), and settles onto it over the follow-through (`throwStoneFlightPoint`). Same 40px stance scale as every other mode (the F31/F33 aura reaches 1px below the stance bottom, as in SHP).

**Unarmed Mid (S2) / Unarmed Low (S3)**, the engine's Stab Lv2 and Lv3 — Sequence modes on SEQ 98/99 and 100/101, 9-frame loops with their SEQ unit motion. See Sequence Modes.

**Bounced to Death (FI) / Revived (ID)** — Sequence modes on SEQ 82/83 and 84/85. FI plays its 13 draws with the 12px hop and holds KO1/KO2; ID holds the walk neutral frame. OV2 shows on the front kneel only, as in F72/F73.

**Bow High (P1)**, the engine's Punch Lv1 — Body + farBehind + head + front. 9-frame looping (52 ticks). 4-tile full-body. Uniform 32x32 bodies. On a Bow card `liftPunchTiles` stands the tiles over the bow nearer the camera, by pattern (`BOW_LAYER`). The composite follows the SEQ unit motion (frame `move`: 2px wind-up, lunge to +2px, settle +1px) along the unit's world facing via `seqMoveLocal` — P1/P2/P3 alike. The visual driver shows the idle sprite during FALLING or SPAWNING states.

**Bow Mid (P2)**, the engine's Punch Lv2 — Same 4-tile structure as P1. 8-frame looping (50 ticks). Skips windup. The visual driver shows the idle sprite during FALLING or SPAWNING states.

**Bow Low (P3)**, the engine's Punch Lv3 — Same 4-tile structure as P1. 8-frame looping (50 ticks). Instant strike. The visual driver shows the idle sprite during FALLING or SPAWNING states.

**Float (FL)** — Body + 2 hands, Guard's structure with `FLOAT_ASSEMBLY` (F70/F71: BF3/BB3 + RF3/LF3/RB3/LB3). After settling, loops `FLOAT_DELAYS` from `walkStart` and adds `FLOAT_MOVES[frame]` through `seqMoveLocal` (the whole unit hovers 0/1/2/1 px above the ground line, as SEQ 12/13 — animation 0x12/0x13, the floating-unit idle — draws it). Tiles never change during the bob, so UVs are applied only on a step change or settle. Idle sprite during FALLING or SPAWNING.

**Unarmed High (S1)**, the engine's Stab Lv1 — Same 4-tile structure as P1 (`farBehind` `FAR_BEHIND`, AF/AB torso, TF1/TB1 head 1, front `IN_FRONT`) from `STAB_ASSEMBLY`. 9-frame loop (40 ticks, `STAB_DELAYS`) with the SEQ unit motion (2px wind-up, lunge +2, settle +1) through `seqMoveLocal`. Overlay plane sizes are derived from the assembly. Idle sprite during FALLING or SPAWNING.

**Frozen Walk 2 (G)**, the engine's Guard — Body + 2 hands. Static 3-tile composition using walk frame 5 tiles. The visual driver shows the idle sprite during FALLING or SPAWNING states.

## Shared Utilities (character-utils.js)

| Utility | Purpose |
|---------|---------|
| `applySpriteFrame(texture, id, reversed)` | UV offset/repeat from `SPRITE_MAP` |
| `azimuthToStep(camera)` | Camera azimuth to rotation step 0-7 (reads `camera.userData.azimuthStep` cache when available) |
| `computeAzimuthToStep(camera)` | Raw trig computation — called once per frame by the render loop to populate the cache |
| `resolveVariableFrame(delays, elapsed)` | Non-looping variable-timing frame resolver — returns a shared mutable result object; destructure the fields immediately, never retain the reference |
| `resolveLoopingFrame(delays, cycleDuration, elapsed)` | Looping variant with modulo wrapping — returns a shared mutable result object; destructure the fields immediately, never retain the reference |
| `isCharacterOnScreen(positionSource, camera)` | Frustum check using pre-allocated sphere |
| `createBillboardOverlay(textures, w, h, scaleX, scaleY)` | Overlay plane with body-derived scales; same-sized overlays share one geometry, so animate with the mesh transform |
| `cloneSpriteTexture(textures)` | Sprite sheet texture clone (nearest, `RepeatWrapping` across and clamped down, `SRGBColorSpace`, no mipmaps) — every character map; shares the GPU texture and does not re-upload the sheet |
| `createBodyMaterial(texture)` | Body material from cached base clone, `forceSinglePass` (one draw per layer instead of three's back + front pass) |
| `createOverlayMaterial(texture)` | Overlay material (depthWrite:false, `forceSinglePass`) |
| `createBufferMesh(spriteHeight)` | Invisible buffer mesh; each call returns a new Mesh over one shared geometry and material |
| `BEHIND`, `IN_FRONT`, `FAR_BEHIND` | Z-layer renderOrder constants |
| `STANDARD_CONTAINER_H` | 40px — the idle stance height; every mode's `scaleY = spriteHeight / STANDARD_CONTAINER_H` |
| `anchorBodyX(anchor, scaleX, flipX)` / `anchorBodyY(anchor, scaleY)` | Body center from the frame's SHP anchor (`frame.anchor`; the group origin is the unit origin column at the stance center row) |
| `placeIdleBody(mesh, idx, scaleX, scaleY)` / `IDLE_BODY_DX` / `IDLE_BODY_DY` | Idle body plane at the P1-P5 anchor for rotation index `idx` (mirrored for reversed idles) |
| `seqMoveLocal(move, directionOffset, camera, scaleY)` | SEQ unit motion `{ fb, du }` → billboard-local `{ x, y }` to add to the body position: `fb` along `FACING_X/FACING_Z[directionOffset]` projected through the camera, `du` screen-down pixels. Shared result object, lazily allocated scratch math |
| `createSinglePoseGeometry(w, h)` / `placeSinglePose(mesh, idx, bodyDx, bodyDy, pivotRise, camera)` / `resetSinglePose(geometry)` / `KNEEL_BODY_DX/DY` / `DEAD_BODY_DX/DY` / `KNEEL_PIVOT_RISE` / `DEAD_PIVOT_RISE` | Kneel/Dead planes at the shared pixel scale, placed at their SHP anchor from the stance point (body center + pivot rise, world-vertical, in the camera frame) and lifted along the view axis so they never sink into the floor; `resetSinglePose` invalidates the cached placement for pooled meshes |
| `positionOverlay(mesh, layer, scaleX, scaleY, flipX, bodyY, maxW, maxH, bodyX)` | Overlay center = body center + dx/dy |
| `setVisualDriver(root, driver, update)` / `syncCharacterVisuals(renderer, scene, camera)` | Registers a character's visual driver; the scene hook (`scene.onBeforeRender = syncCharacterVisuals`) runs every visible scene-root driver before WebGLRenderer builds its draw list (see "Draw Order and Visual Drivers") |
| `FACE` | renderOrder 3 — face overlays above the front hand |
| `firstTileOverItem(count, layer, end)` / `tileOverItem(index, isBody, count, layer, end)` / `liftPunchTiles(ch, patternIdx, farBehind, body, head, front)` | The first tile of a frame drawn over its held item, from `ch.itemLayer` and `ch.itemEnd`, whether one tile is, and the same for a Bow frame's four tiles |
| `PX_TO_WORLD` | `cubeSize * 0.75 / 32` — for non-composite modes |

## Billboard Height

Every mode stores `billboardHeight` on `userData.character`. `getCharacterHalfY(ch)` reads half of it.

## Descriptor Construction

Every group file builds `mesh.userData.character` by calling `createCharacterState({ ... })` from `meshes/character-state-init.js`. The helper owns the locked defaults — `lastStep: -1`, `lastFrame: -1`, `action: null`, `state: State.FALLING` (override per mode). Mode-specific fields go through `extras`. Raw `mesh.userData.character = { ... }` literals are not allowed in a group file — `tests/character-state-init.test.js` enforces this with a source-analysis check of this folder. The modeless idle in `createCharacter.js` is the one literal outside it.

