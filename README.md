# INTDEV TACTICS — 3d.internet.dev × set.world

> A browser-native, isometric tactical RPG engine fusing the golden-era tactical depth of **Final Fantasy Tactics Advance (FFTA)** and **Tactics Ogre** with the decentralized character, item, and crafting synthesis protocols of **[set.world](https://set.world)** and the 3D sprite + weapon assembly pipeline of **[3d.internet.dev](https://3d.internet.dev)**.

---

## Table of Contents
1. [Overview & Architectural Paradigm](#overview--architectural-paradigm)
2. [Engine Architecture & Subsystems](#engine-architecture--subsystems)
   - [Game Core Engine (`src/game/`)](#1-game-core-engine-srcgame)
   - [3D Isometric Stage (`src/stage/`)](#2-3d-isometric-stage-srcstage)
   - [Tactical HUD & Clan Forge (`src/ui/`)](#3-tactical-hud--clan-forge-srcui)
   - [Sprite & 3D Mythril Weapon Pipeline (`src/tactics-sprite/`)](#4-sprite--3d-mythril-weapon-pipeline)
3. [Combat Mathematics & Rulebook](#combat-mathematics--rulebook)
   - [Deterministic Seed Derivation](#deterministic-seed-derivation)
   - [FFTA Charge Time (CT) Mechanics](#ffta-charge-time-ct-mechanics)
   - [Elevation High/Mid/Low Stance System](#elevation-highmidlow-stance-system)
   - [Directional Angles & Backstab Multipliers](#directional-angles--backstab-multipliers)
   - [Set.world 10% Disassembly Sink Schedule](#setworld-10-disassembly-sink-schedule)
4. [Controls & Keybindings](#controls--keybindings)
5. [Getting Started & Development](#getting-started--development)

---

## Overview & Architectural Paradigm

**INTDEV TACTICS** is built upon the **Microkernel + Markdown + Model Context Protocol (MKMDMCP)** and **3d.internet.dev** local-first architecture. The client runs entirely client-side using **Three.js** with zero server runtime dependencies, consuming `set.world` deterministic entity schemas and APIs with graceful offline Mulberry32 pseudo-random synthesis.

```
+-----------------------------------------------------------------------------------+
|                                  INTDEV TACTICS                                   |
|                             3d.internet.dev × set.world                           |
+-----------------------------------------------------------------------------------+
|                                                                                   |
|  [ Tactical HUD ] <-------------> [ Master Controller ] <---------> [ 3D Stage ]  |
|  - CT Order Ribbon (8 Turns)       (src/main.js)                     - Three.js   |
|  - FFTA Command Menu                                                 - Board 10x10|
|  - Combat Forecast Card           [ Turn Manager ]                   - Actors (8) |
|  - Screen-Space Overhead Bars     - FFTA CT System (100)             - Camera     |
|  - Set.world Clan Forge           - Tactical AI Engine                            |
|                                                                                   |
|                                   [ Combat Rules ]                                |
|                                   - High/Mid/Low Stances                          |
|                                   - 8-Way Backstabs                               |
|                                   - BFS Reachability                              |
|                                                                                   |
|                                   [ Set.world API ]                               |
|                                   - Character Seeds                               |
|                                   - Item Craft Lottery                            |
|                                   - 10% Salvage Sink                              |
+-----------------------------------------------------------------------------------+
```

---

## Engine Architecture & Subsystems

### 1. Game Core Engine (`src/game/`)

- **`setworld-client.js`**:
  - Implements the canonical Set.world seed derivation algorithm: `(seed + i * 0x9E3779B9) >>> 0`.
  - Connects to `https://set.world/api` for characters, items, and lottery crafting with in-memory caching (`charCache`, `itemCache`, `craftCache`) and polite network concurrency guards (max 2 active calls, 300ms throttle).
  - Deterministic Mulberry32 offline fallback generator that generates full Set.world character cards, equipment slots (`head`, `chest`, `tool`, `offhand`), and attribute budgets.
  - Maps Set tools to 3D weapon meshes (`sword`, `katana`, `spear`, `rifle`, `bow`, `tome`, `harp`, `shield`) and assigns signature abilities.
  - Generates the seeded 4v4 clan roster (**Azure Clan** vs **Crimson Order**) dynamically positioned on valid non-water terrain tiles.

- **`combat-rules.js`**:
  - **BFS Reachability**: Computes reachable tiles based on unit `moveRange`, `jumpHeight` (maximum allowed elevation change per step), impassable water, and occupancy boundaries (cannot pass through living enemies).
  - **Attack Range Diamond & Line Geometry**: Computes valid target tiles based on weapon min/max Manhattan range and straight-line pierce geometries (e.g. Spear Pierce Thrust).
  - **Elevation Stance & Directional Vectoring**: Resolves High/Mid/Low elevation stance and 8-direction facing angles (`N`, `NE`, `E`, `SE`, `S`, `SW`, `W`, `NW`).
  - **Combat Forecast & Resolution**: Calculates expected damage, hit rate (15%–100%), critical hit rate, and shield block probability. Determines exact animation name for attacker and reaction for defender.

- **`turn-manager.js`**:
  - Implements FFTA CT clock tick advancement.
  - Deducts CT upon turn completion with resting bonuses.
  - Lookahead queue preview for upcoming turns (`getTurnQueuePreview`).
  - **Tactical AI**: Evaluates candidate move and attack positions, prioritizing lethal strikes, backstabs, high-ground vantage points, and ally healing triage.

---

### 2. 3D Isometric Stage (`src/stage/`)

- **`tactical-camera.js`**:
  - Implements Jimmy Lee's exact tactical RPG camera geometry from `3d.internet.dev/references/threejs.md`:
    - **Elevation**: $\arctan(0.3 / \frac{\sqrt{2}}{2}) \approx 23^\circ$ above the ground plane.
    - **Azimuth**: $\arctan(0.5 / -0.5) + \frac{\text{step} \cdot \pi}{4}$ (8 discrete 45° viewing steps around the stage).
    - **Distance**: 400 units in orthographic space.
  - Smooth exponential focus panning (`targetFocus.lerp`), non-wrapping azimuth rotation, and mouse wheel zoom (half-extent between 70 and 240).

- **`isometric-board.js`**:
  - Builds a 10×10 stepped diorama board with `TILE_SIZE = 24` and `ELEVATION_STEP = 7`.
  - Realistic tactical terrain:
    - **Shallow Crystal Stream** ($z = 4, 5$) with transparent water material.
    - **Cobblestone Bridge** ($x = 4, 5$ across the stream) providing traversable passage.
    - **Stone Citadel Ruins** on northern ledges ($z \le 2$) with elevation up to 4.
    - **Southern Plateau & Watchtower** ($x \ge 6, z \ge 7$).
  - Raycaster tile picking (`pickTile`), azure blue move highlight mesh pool (`0x38bdf8`), crimson/emerald attack range mesh pool (`0xf43f5e` / `0x10b981`), pulsing gold active unit tile (`0xfbbf24`), and corner-bracket hover cursor.

- **`unit-actor.js`**:
  - Bridges 2D billboard sprite rendering with 3D model attachments.
  - Spawns units with under-foot team plinth rings (Azure blue / Crimson gold).
  - Animates multi-step path travel with parabolic `Jump Up` and `Jump Down` arcs for elevation transitions.
  - Animates combat strikes with 3D projectile flight (bullets, arrows, spell orbs, thrown stones), expanding hit burst shockwaves, and reaction flinches.

---

### 3. Tactical HUD & Clan Forge (`src/ui/`)

- **`tactical-hud.js`**:
  - **Top Bar**: Displays seed badge, Set Orbs balance wallet, camera angle/compass badge, AI Auto-Battle toggle, and new seed generator button.
  - **Horizontal CT Turn Order Ribbon**: Displays the upcoming 8 units in chronological turn order with team color coding, grade badges, and real-time CT percentage fill meters.
  - **FFTA Command Menu**: Classic 4-option menu (`1. MOVE`, `2. ACT / ABILITIES`, `3. WAIT / END TURN`, `4. INSPECT SHEET`) with contextual submenus for ability selection and 8-way directional facing compass.
  - **Status Cards**: Bottom-left card for the active unit (HP/MP/CT bars, weapon, 5 primary stats) and bottom-right card for inspected targets or terrain tiles.
  - **Combat Forecast Card**: Center-bottom tactical breakdown showing damage, hit rate, crit rate, elevation stance, and attack angle.
  - **Screen-Space Overhead Bars**: Projects 3D head positions to screen coordinates to render unit nameplates, grade badges, HP bars, and active crowns (`👑`).
  - **Floating Popups & Battle Log**: Floating animated damage, crit, heal, miss, and Set Orb popups, alongside a scrollable monospace tactical feed.

- **`forge-modal.js`**:
  - **Tab 1: Orb Lottery Forge**: Implements Set.world's `/api/craft?orbs=N` synthesis with 5 preset tiers (Novice, Adept, Master, Ascendant, Sovereign Cap) or custom orb amounts, generating verifiable provenance receipts.
  - **Tab 2: Clan Armory**: Displays harvested weapons and armor with instant 10% Set Orb salvage disassembly and dynamic equip menus.
  - **Tab 3: Clan Roster**: Full 4-unit Azure Clan cards displaying 9 Set.world attributes (STR, DEX, INT, AGI, VIT, WIS, WIL, LUK, DEF), traits, gear, and birth certificate seeds.

---

### 4. Sprite & 3D Mythril Weapon Pipeline

The engine utilizes the **3d.internet.dev** `TYPE1` sprite specification combined with real-time 3D weapon meshes:

```
[ tactics-sprite-data.json ] ---> [ Atlas & Hold Coordinates ]
                                            |
[ a1.png (Sprite Sheet) ] ------> [ createTacticsSprite ] ---> [ Sprite Group ]
                                                                     |
[ set-items.glb (Models) ] -----> [ THREE.BufferGeometry ] ----> [ carry() ]
  - sword, katana, spear,           (vertexColors, mythril           |
    rifle, shield, harp, tome        MeshStandardMaterial)   [ Held 3D Weapon ]
```

- Each animation cycle in `tactics-sprite-data.json` specifies hand hold anchors (`item`, `x`, `y`, `z`, `rotX`, `rotY`, `rotZ`).
- When a unit executes an action (e.g. `Gun Mid`, `Poke High`, `Swing Mid`, `Shield Block Mid`), `stageUnitManager.animateCombatAction` instantiates the corresponding 3D weapon mesh from `set-items.glb`, invokes `sprite.carry(weaponMesh, animName)`, and positions the weapon in world space synced to the sprite's hand anchor.

---

## Combat Mathematics & Rulebook

### Deterministic Seed Derivation

All battlefield entities and roll variations derive deterministically from the canonical Set.world 32-bit golden-ratio integer hash:

$$\text{deriveSeed}(\text{seed}, i) = ((\text{seed} \ggg 0) + (i \cdot \text{0x9E3779B9})) \ggg 0$$

Given the same base seed, character classes, starting attributes, equipment stats, and board terrain are 100% reproducible.

---

### FFTA Charge Time (CT) Mechanics

Turn order is governed by the classic FFTA Charge Time accumulator:

1. **Threshold**: Every unit acts when their $\text{CT} \ge 100$.
2. **Tick Advancement**: When no unit has $\text{CT} \ge 100$, the engine calculates the minimum ticks required for the fastest unit to reach 100:
   $$\Delta\text{ticks} = \min_{u} \left\lceil \frac{100 - \text{CT}_u}{\text{Speed}_u} \right\rceil$$
   Every living unit's CT increases by $\text{Speed}_u \cdot \Delta\text{ticks}$.
3. **Turn Conclusion & Resting CT Preservation**:
   $$\text{CT}_{\text{cost}} = 60 + (20 \text{ if moved}) + (20 \text{ if acted})$$
   $$\text{CT}_{\text{remaining}} = \max(0, \text{CT}_{\text{current}} - \text{CT}_{\text{cost}})$$
   *Strategic Implication*: A unit that rests (neither moving nor acting) spends only 60 CT, preserving 40+ overflow CT and taking their next turn nearly twice as fast.

---

### Elevation High/Mid/Low Stance System

Stance is determined by comparing the attacker's elevation with the defender's elevation:

$$\text{Stance} = \begin{cases} \text{High}, & \text{Elevation}_{\text{defender}} > \text{Elevation}_{\text{attacker}} \\ \text{Low}, & \text{Elevation}_{\text{defender}} < \text{Elevation}_{\text{attacker}} \\ \text{Mid}, & \text{Elevation}_{\text{defender}} = \text{Elevation}_{\text{attacker}} \end{cases}$$

- **High Ground Advantage** (Attacker above defender):
  - **Damage**: $+15\%$ multiplier
  - **Hit Chance**: $+10\%$ bonus
  - **Critical Chance**: $+5\%$ bonus
- **Low Ground Disadvantage** (Attacker below defender):
  - **Hit Chance**: $-10\%$ penalty

---

### Directional Angles & Backstab Multipliers

The angle of attack is computed by taking the dot product between the defender's 8-way facing unit vector $\vec{F}$ and the attack direction vector $\vec{D} = \text{Attacker} - \text{Defender}$:

$$\cos\theta = \frac{\vec{D} \cdot \vec{F}}{\|\vec{D}\| \|\vec{F}\|}$$

| Attack Angle | Threshold | Hit Rate Bonus | Damage Multiplier | Crit Bonus |
|:---|:---:|:---:|:---:|:---:|
| **Front** | $\cos\theta \ge 0.52$ | $+0\%$ | $\times 1.00$ | $+0\%$ |
| **Side (Flank)** | $-0.52 < \cos\theta < 0.52$ | $+10\%$ | $\times 1.15$ | $+5\%$ |
| **Back (Backstab)** | $\cos\theta \le -0.52$ | $+25\%$ | $\times 1.30$ | $+10\%$ |

*Note*: Frontal physical attacks against units with high armor or shields trigger an 18% shield block check, mitigating damage by 65%.

---

### Set.world 10% Disassembly Sink Schedule

Disassembling items in the Clan Armory refunds 10% of their base orb value according to the canonical Set.world sink schedule:

$$\text{Yield} = \max\left(\text{BaseSchedule}[\text{Grade}], \lfloor \text{OrbValue} \times 0.10 \rfloor\right)$$

| Grade | Base Salvage Yield | Standard Orb Schedule |
|:---:|:---:|:---:|
| **Grade S** | 1,562 Orbs | 15,625 Orbs |
| **Grade A** | 312 Orbs | 3,125 Orbs |
| **Grade B** | 62 Orbs | 625 Orbs |
| **Grade C** | 12 Orbs | 125 Orbs |
| **Grade D** | 2 Orbs | 25 Orbs |
| **Grade E / F** | 1 Orb | 10 Orbs |

---

## Controls & Keybindings

### Keyboard Shortcuts

| Key | Action |
|:---:|:---|
| **`Q`** | Rotate Camera $45^\circ$ Counter-Clockwise |
| **`E`** | Rotate Camera $45^\circ$ Clockwise |
| **`1`** | Select `1. MOVE` in Command Menu |
| **`2`** | Select `2. ACT / ABILITIES` in Command Menu |
| **`3`** | Select `3. WAIT / END TURN` in Command Menu (Open Compass) |
| **`4`** | Select `4. INSPECT SHEET` / Open Clan Forge |
| **`F`** | Open / Close Set.world Clan Forge & Armory |
| **`A`** | Toggle AI Auto-Battle (`ON` / `OFF`) |
| **`R`** | Roll New Seeded Battlefield |
| **`Enter`** | Confirm Combat Strike in Forecast Panel |
| **`Escape`** | Cancel Current Action Mode / Close Modals |

### Mouse Controls

- **Left Click**:
  - Click tile in Move mode: Animate move path.
  - Click enemy in Act mode: Display combat forecast / Confirm strike.
  - Click compass button in Wait mode: Set unit facing and end turn.
- **Right Click**: Cancel current targeting/move mode and return to command menu.
- **Mouse Hover**: Raycast tile inspection and overhead status inspection.
- **Mouse Wheel**: Smoothly zoom camera in/out (half-extent $70$ to $240$).

---

## Getting Started & Development

### Prerequisites
- Node.js $\ge 18.0.0$
- npm $\ge 9.0.0$

### Installation
```bash
# Clone and enter directory
cd /home/raptor/intdevtactics

# Install dependencies
npm install
```

### Development Server
```bash
npm run dev
# Vite dev server running at http://localhost:5173
```

### Production Build
```bash
npm run build
# Compiles optimized bundle to dist/ with 0 errors
```

### Preview Production Build
```bash
npm run preview
# Serves dist/ at http://localhost:4173
```

---

## License & Credits

- **Engine & Architecture**: Jimmy Lee × Set.world Architecture
- **Sprites & Weapons**: `3d.internet.dev` & `set-items.glb`
- **Design Inspiration**: Final Fantasy Tactics Advance (Square Enix) & Tactics Ogre (Quest / Square Enix)
