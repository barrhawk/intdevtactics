# Weapons and Held Items

TYPE1 draws no weapon, and bringing weapon pixels in would mean a tile for every frame, pattern and camera. A 3D object turns with the camera instead. Two kinds live here: weapons generated from numbers, where a spec is the only thing to author (the bow and the cloth bag), and the models [Set](https://set.world) lends the sequence cards. Every weapon on the page wears mythril, and an item with a face to show wears a worked outside and a different, darker inside.

| File | Owns | Imports |
|------|------|---------|
| `bow.js` | `BOW_SPEC`, the simulation, closed-form statics, `simulateShot` | Nothing |
| `bow-mesh.js` | The drawn stave, string and arrow, from a spec and a simulated bow | `three`, `weapons/bow` |
| `ballistics.js` | `solveArc`, `collide`, `fallTime`, under the engine's `defaultGravity` | `constants/physics` |
| `cloth-bag.js` | `CLOTH_BAG_SPEC`, the cord and bag simulation, the snap of a swing | Nothing |
| `cloth-bag-mesh.js` | The drawn sack and cord, from a simulated bag | `three`, `weapons/cloth-bag` |
| `set-items.js` | `readSetItems`, the baked file as typed arrays | Nothing |
| `held-items.js` | `HELD_ITEMS` (which card holds what, in which hand, at which tilt, under which tiles), `HELD_MARBLES`, `MARBLE_RADIUS`, `BOW_LAYER`, `SPRITE`, `heldLayers`, `heldEnd`, `heldHand`, `heldMarblePoint`, `heldRest`, `heldTilt`, `heldSlide`, `heldOffset`, `HELD_ITEM_SCALE`, `THROWN_SWORD` | `constants/sprites`, `constants/character` |
| `held-item-mesh.js` | The shared item geometry, the mythril materials and what they reflect, `flattenOntoSprite`, a gun's flash and streak | `three`, `constants/character`, `weapons/item-finish` |
| `item-finish.js` | `ITEM_FACES`, the tiles of an item's two sides baked on the GPU (`createItemFinishBake`) and the shader that lays them on (`applyItemFaces`) | `three` |

`bow.js`, `ballistics.js`, `cloth-bag.js`, `set-items.js` and `held-items.js` do not import three.js, so `debug/sprite-animation-demo-catalog.js` can plan a shot before the 3D stage loads. `held-items.js` also runs under plain Node, with relative imports, because `web/sprite-data.js` bakes its tables into `data.holds` for the kit, and `carry` in `assets/tactics-sprite-three.mjs` places an item from them as `createHeldItem` does. `tests/sprite-kit.test.js` compares the two on every held card, view and frame. A stage's own moves stay out of the kit: a gun's aim and kick, and a thrown item's flight.

## Mythril

`createMythrilMaterial` is one `MeshPhysicalMaterial` shared by the bow, the arrowhead, the cloth bag and every item without a face: a mirror metal with Set's mythril roughness and thin film, reflecting one `RoomEnvironment` prefiltered once per stage (`bake`, again after a lost context). Its colors are vertex colors, Set's mythril tokens: `#d4e0ed` for the plate, `#8fbbe8` for its second tone, `#cfdcea` for the mail and `#2b3a4d` for the mail's dark on a grip. The veins are an `onBeforeCompile` pattern in the item's own space, so they stay on the item as it turns, and they lift the surface a little. The shader is this project's: Set's `finish-shader.ts` is source under CC BY-NC, so only the look's numbers come across.

### Faces

A shield or a book is a flat thing seen from both sides, and one metal on both reads as a sheet of foil. `applyItemFaces` lays `createPlainMythrilMaterial`, the same metal with no veins, under two surfaces, one material per item in `ITEM_FACES`, and `materialOf(name)` picks it. On a face this big the veins would read as a drawing, so these items have none.

- **Outside**: worked plate at 2048 pixels: a raised rim on a beaded line, rivets, a spine, a boss in a lozenge inlaid in the mythril blue, and a hammered field under cut lines that spread from the boss.
- **Inside**: another surface and a darker one. The shield's back is dark boards in `#2b3a4d`, the mail's dark, with two iron straps and a stitched pad where the arm goes, and it is mostly not metal, so it stays dark in a mirror room. A book's inside is its pages, in the paper's own color, with columns of text. Both are 1024 pixels: they are never as near the camera.

The tiles are baked in code, on the GPU, once per stage, as the ledge marble is, so there is no file to load, and `bake` runs again after a lost context. Each holds a normal, a tone and a roughness, with mipmaps, so it stays clean at a card's size and keeps its detail at any larger one. The models have no UVs: `ITEM_FACES` lays a tile across an item in its own frame, by numbers `tests/set-items.test.js` holds to the file, and the side comes from the surface's normal in that frame. The normal goes into view space along the item's axes, so a tile lights as the metal does however the item is flattened onto a sprite. The bake draws the plate at the shield's proportions, so a book's cover wears it a little wider. A material here sets no `map`, because on this stage a mesh with a map is a sprite plane. `item-finish.js` needs only three, so a project can copy it.

## The Bow

The bow's frame is +x along the arrow, +y up the limbs, the grip at the origin, the string behind it. The bow is symmetric about y = 0, so one limb and half the string are simulated.

- **Limb**: an inextensible beam bending in a circular arc, one angle `phi` from base to tip, so its length is exact at every bend. Bending energy is `k(phi - restBend)² / 2`. `k` is fitted to `drawForce` at `drawLength`. A negative `restBend` is a reflexed limb.
- **String**: point masses under XPBD distance constraints with the string's compliance. A chain couples each segment only to its neighbours, so each Newton pass is one direct tridiagonal solve (`solveTridiagonal`); sweeping the segments leaves a stiff string stretched. It carries tension only, so a segment can go slack.
- **Arrow**: rides the nock with no glue and leaves when the nock starts to slow, near the brace line. Air damps the string, not the arrow.
- **Stepping**: `stepBow(bow, pull)` advances `BOW_STEP_S` (1/2400 s). `pull >= 0` is the hand holding the nock that far behind the grip, with an arrow on the string; `pull < 0` is an open hand. Run it from a fixed accumulator so a shot does not depend on the frame rate. It allocates nothing.

`BOW_SPEC` gives 294 u/s at 87% efficiency, the arrow leaving 2 ticks after the hand opens with the nock 3.3 behind the grip (brace 3.5), and the string ringing down over about 30 ticks.

`tests/weapon-bow.test.js` holds a spec to what it promises and to physics, on three differently shaped bows. Limb length, brace height and draw force are exact; the force-draw curve integrates to the stored energy; a held draw matches `bendAt`; a shot gains under 1% to the solver and loses under 12% to the solver with damping off.

## Set Items

`public/static/models/set-items.glb` holds seven of Set's held items: rifle, sword, katana, spear, shield, harp and tome, each a mesh with positions, normals, vertex colors and indices. The shield is Set's pavise and the tome Set's tome, both at 1.5 times their size, and the harp is at 1.75 times its size: the shield is about half a unit's height, and the harp stands past the shoulder it rests on. The component loads the file with the page's textures, and `createHeldItem` in `debug/sprite-animation-demos.js` draws it. Without it a card plays with empty hands.

| Cards | Item | Hand |
|-------|------|------|
| Swing High, Mid, Low, Swing Recoil High, Low | Sword | First tile, the arm behind the body, on both facings |
| Item Throw High Start, Hold, Release | The small black marble (`HELD_MARBLES`), thrown on tick 0 of Release | First tile |
| Item Throw Mid and Low Start, Hold, Release | The big black marble, thrown on tick 0 of Release | First tile, then both hands on F90, F91, F139 and F140 |
| Weapon Throw | Sword, thrown on tick 18 | First tile |
| Poke High, Mid, Low | Spear | Last tile, and through the first tile's hand where the frame draws one |
| Thrust Recoil High, Low | Spear, against a unit in Shield Block | The same, on the line of the thrust |
| Gun High, Mid, Low | Rifle | Last tile |
| Read Book, Read Book 2 | Tome | First tile in front, last tile in back, on top of the hand |
| Play Instrument | Harp | Last tile, and it stays on the hand of the sequence's third frame while the arm plays it |
| Shield Block High, Mid, Low | Shield | By card (`HELD_ITEMS`) |
| Katana Use | Katana | Last tile in front, first in back, the blade across the body and on top of the other hand |

- **Frame**: the hand at the origin, +x along the item, +y its up, +z across it, in Set's units. `HELD_ITEM_SCALE` (4.5) takes them to world units, one number for every item, so a sword comes to 60% of a unit's height.
- **Hand**: `HAND_GRIPS` in `constants/sprites/assembly.js` is one pixel per arm tile, the centroid of its hand, and the angle of the forearm the tile draws. `heldHand` places it from `SHP_FRAMES`, so an item needs no assembly. `tests/set-items.test.js` holds every grip of every held card to a hand color on `a1.png`, except LG17 and LG48, which draw the sleeve the hand is inside, so their grip is the sleeve's tip. A tile that draws other hand colors beside the fist has its centroid between them, on the sleeve, so `HAND_RESTS` names the top of that fist, and `heldRest` reads it for a blade laid across the hand.
- **Tilt**: an item turns in the plane of the unit's facing and world up, read from the front sequence, so it does not depend on the camera. A front frame is drawn 45° off the camera at the game's elevation, so a line on the sprite converts to a tilt (`drawnTilt`): a forearm drawn dipping 20° is level. A frame gets its tilt in this order: a number of its own (`tilt`), the line from the hand to where it rests on the other one (`heldRest`) on a `two`-handed item when the frame draws both, or the forearm of its hand tile. A sword's swing, which the katana shares, a spear's and a rifle's ready poses, the shield's face and the Thrust Recoils' ready frames are the per-frame tilts left, because the art has nothing to read there.
- **Slide**: a spear runs forward through the hand on a thrust (`slide`, `heldSlide`), so it reaches past the arm without leaving the line.
- **Across**: an `across` item turns in the plane across the body and world up instead, for art whose two hands stand either side of the unit. A level line across the body draws rising to the far side on a front frame, as a level line along the facing draws dipping, and `heldTilt` reads it that way. Which way across follows the sprite: a mirrored pattern draws the other hand on the other side. `roll` turns the item about its length.
- **Offset**: `offset` is where the item's origin sits from the hand along its own axes, for an item not gripped at its origin (`heldOffset`). Going to the other side of the body turns an `across` item half over, so its +z shift is multiplied by that side and stays on one side of the hand.
- **Steady**: `steady` names the sequence index whose hand the item stays on, for an item another hand plays.
- **Depth**: the grip sits on the sprite's plane, and the item is drawn among the frame's tiles, or in front of or behind all of them when it points along the view ("What Covers What").
- **Framing**: `heldReach` adds the item's tip on every frame to the envelope, so a card widens only as far as its item needs.

### What Covers What

A sprite is flat and an item is not, so a rigid mesh on a billboard goes through the plane wherever its length turns toward the camera: a handle draws over the fist, a blade comes out through the body. So a card does not ask the depth buffer. It says which tiles of a frame draw over the item (`over` in `HELD_ITEMS`, and in `HELD_MARBLES` and `BOW_LAYER`), counted from the top of the stack, because water frames add a tile below the head and the top stays the same. Nothing but looking at each card on all four patterns settles these numbers.

| Cards | Facing the camera | Facing away |
|-------|-------------------|-------------|
| Sword, Weapon Throw, Swing Recoil: the arm behind the body | All of it (`SPRITE`) | All of it |
| Poke, Thrust Recoil, Gun, Katana Use, Bow | The fist (`HAND`): the item crosses the torso and the fist closes on it | All of it: the item is beyond the body, and the fist still shows on the handle |
| Play Instrument, Read Book | The face and the top hand (`FACE`), so a big item crosses the torso and leaves the face. F129 adds the `WX1` eyes, so it is one tile more | All of it |
| Shield Block | None (`NOTHING`): a hand grips the far side of a shield | All of it, and the hand shows on the grip |
| A marble in one hand | Every tile but the arm that holds it, so it lies in the palm | The same |
| A marble in both hands | The hands and the head, but not the torso (`AROUND_BODY`), so it sits in front of the body with a fist on each side | All of it: the ball is beyond the body |

`ITEM_LAYER_GAP` (0.4, `constants/character.js`) is the whole mechanism. The camera is orthographic, so depth along the view axis changes what covers what and moves nothing on screen, the rule the planes of Dead and Kneel already use. The group that draws the frame stands the tiles over the item that far toward the camera (`firstTileOverItem`, `ch.itemLayer`), and `flattenOntoSprite`, each item material's `onBeforeRender`, squeezes the item's depth into the middle of the gap, by `ITEM_FLATTEN`, in the modelViewMatrix three has just computed. The normal matrix was computed before that, so the metal still lights as 3D, and `position`, `quaternion` and `matrixWorld` keep saying where the item really is. A flattened item meets the rest of the scene where its unit stands: a target nearer the camera covers its tip, and water cuts it on the sprite's row.

`over` answers for an item that lies across the view. The stage orbits smoothly and the item turns with it, so at some angles the item points along the view instead, and then the card's answer is wrong in a way no table could fix: a spear coming straight at the camera does not go under a fist, and a blade pointing away does not cross the torso. So the item says which way it points. `heldEnd` reads the dot product of its +x and the direction to the camera, on every frame at every azimuth. Past `ITEM_END_ON` (0.8) toward the camera it stands in front of every tile, past it away it stands behind them all, and between the two the card's `over` stands (`ch.itemEnd`, `tileOverItem`). The game's views are 45° off the unit, where an item in the plane of its facing comes no closer than 0.76 at any tilt, so no card's answer changes at them. A gun's aim can leave that plane, but only where the card already has every tile over it, and `tests/set-items.test.js` holds both. Steps 3 and 7 look along the facing and steps 1 and 5 across the body, so that is where an item or an `across` item goes end-on. The whole item moves at once and never part of it: squeezing it less so that only the far end passed the tiles put a harp's corner through the hair and left a blade hidden by the skirt that came back out past it.

The kit does the same in `placeCarried`, and reads where a stage left the mesh on a frame the stage aims (`hold.aims`).

- A thrown item clears `userData.spritePlane` as it leaves, and flies at its true depth.
- An arrow on the string lies along the arm that would cover it, so it sits past the gap while the unit faces the camera (`userData.overTiles`).
- The cloth bag is not flattened. It swings through its unit, so it keeps its real depth, and its cord leaves the hand on the side of the sprite that faces the swing: in front of a unit facing the camera, beyond one facing away.
- The Throw Stone stone and the Quick Throw marble are the engine's own and stay in front of the sprite (`THROW_HOLD_DEPTH`). A held Item Throw marble is transparent so it can fade, so it draws before its unit's tiles (`HELD_MARBLE_ORDER`), where an opaque item would, and the tiles over it paint on it.

`tests/set-items.test.js` "which tiles draw over a held item" holds the rule that the gripping hand is over the item on every frame, dry and in water, and that nothing moves on screen, and "an item pointing along the view" holds the end-on rule on every camera step.

### Guns

Gun is Bow's three heights: the target stands `BOW_RANGE` away, `BOW_LEDGE` above the archer, level with it or `BOW_LEDGE` below it. From the first aim frame the stage aims the barrel itself each frame: the bore sits above the grip, so the rifle dips by the angle that puts the line of the barrel, not the grip, through the target's chest (`aimBarrel`). `gunStage` in the catalog keeps a plan angle only for the framing.

`GUN_FLIGHT_TICKS` before the SEQ's PostGenericAttack (tick 24, or 20 for Low) the muzzle flashes, the rifle kicks back along its aim and a light streak with a red tip leaves the opening: its line and start are the barrel's, kept when the shot leaves, and it is as wide as the bore (`bore`, from Set's muzzle), with a soft halo so it reads on a pale floor. The tip lands on the target on the SEQ's tick, where the target flinches, and the tail runs out of the gap as long again.

### Poke

High and Low are heights too (`POKE_STAGES`, half a cube, which keeps a ledge out of the water at every elevation). The High frames draw both arms about 67° up, so the target stands where that line ends: the tip reaches its head on PostGenericAttack, at full reach. The target stands toward the attacker's edge of its ledge (`ledgeBack`), because the tip reaches less far than a sprite and half a cube. The Low one is the attacker's height over a target below it, the tip at its knees. The spear's line is what the arms draw.

### Thrust Recoil

The SEQ draws the attacker sent back from a thrust the game has already stopped, so the card stands what stopped it there: the same stage as Poke, with a unit (`blocker` in the catalog) in Shield Block High or Mid, whichever puts its shield where the spear arrives, and the recoil starts from the contact, where a spark shows. The spear stays on the line it was thrust along and is pushed back through the hand (`spearRecoil`), and the ready frames hold that line instead of standing it up. `tests/set-items.test.js` holds the tilt to no jump over 30° between frames. The sequence plays once and holds, as the reaction cards do.

### Shield Block

The pavise's grip is the middle of its back, which would put a shield half a unit tall past the unit once the hand goes high or low. So it rides lower in the raised hand and higher in the lowered one (`SHIELD_OFFSETS`), standing on the floor on Low, and its face tips toward where the blow comes from (`SHIELD_TILTS`). Facing the camera it covers the hand behind it, and shows its worked face. Facing away it shows its dark back, with the hand on the grip ("Faces").

### Read Book

An open book on top of one hand, spread across the body and nearly upright, its pages to the reader's face and its cover to the camera on a front pattern ("Faces"). Its bottom edge rests on the fingers, `READ_BOOK_RISE` up from the grip, so the hand shows under it on all four patterns. Lying flat it is an edge from the camera.

### Weapon Throw

The SEQ has no event for it, because the game's effect code flies the weapon. `thrownStage` in the catalog plans it: the sword's middle leaves from the last frame that holds it (F89, tick 18), on a `solveArc` low arc that needs no camera, settling onto it from the drawn hand over 6 ticks. It turns about that middle `THROWN_SWORD.turns` times, so its point arrives first along the arc's last direction, and the target two cubes off flinches on that tick, inside the sequence. It stays in the target until the next pass. `THROWN_SWORD` holds the sword's middle and length because the catalog plans before any model has loaded, and `tests/set-items.test.js` holds the length to the file.

### Item Throw

Item Throw is Swing's arm split into a start, a hold and a release. It throws a black marble, the orb of Throw Stone, and what the arms draw picks which one. High is an overhand throw, one arm over the head and on out in front, so it is the small marble (2.4) in that hand. Mid and Low end low with both hands out either side of the body, on F90 and F91 from the front and F139 and F140 from the back, so they are the big one (`MARBLE_RADIUS.big`, 8): on the hand while the arm comes down, then between the hands (`heldMarblePoint`), the same size all the way. Its radius puts the hands on its sides. Throw Heavy Stone's 10 is bigger than the hands reach, so they sit inside its outline and it hides the unit. A marble follows the hand of every frame (`createMarbleRig`).

Start and Hold are reaction cards that keep it there. Release is `createItemThrowStation`: the marble leaves on the SEQ's PlaySound, the sequence's first tick, on a `solveArc` low arc at a target two cubes off, and High, Mid and Low are where the target stands, half a cube above the thrower, level with it, or half a cube below it, as they are for Bow and Gun. One arm throws, so the marble's mass sets its speed (`throwSpeed`), and the same collision as Throw Stone's sends it off and slides the target. A low arc up to a ledge is still rising when it arrives, and the body it hits takes that from it, so it drops (`stoneRise`). It bounces, rests on whatever it lands on (`floorAt`) and fades, and a bounce takes most of its speed along the ground, or the small one would roll back past the thrower. The flight runs past the sequence's ticks, so the strip has a slot for it.

### Katana Use

The art raises both hands either side of the unit, to its head on the last frame. One hand holds the handle and the blade lies across the body on top of the other, on the fist `HAND_RESTS` names, tilted up to the far side on the last frame, so the card needs no table of its own. At the game's front views the blade's line runs through that fist's top row.

## The Cloth Bag

A sack on a cord, generated like the bow, in the plane of the unit's facing and world up. Nodes are point masses under XPBD distance constraints, stepped at `CLOTH_BAG_STEP_S` (1/240 s), with one pass out from the hand on each step to keep every link at its length: a chain this much lighter than its bag converges too slowly otherwise. It carries tension only.

- **Hand**: the swing arm's hand on the front sequence, through a short lag (`handLagS`), so a hand that steps with the sprite reads as a pull on the cord. The mesh is drawn from the hand the frame shows, so the cord always leaves the sprite's pixel.
- **Swing**: the bag hangs through the wind-up and trails the arm behind the head. On `snapTick` the swing snaps it at the target, head, chest or knee by card (`CLOTH_BAG_CARDS`), and it meets the target within two ticks of the SEQ's PostGenericAttack, stops on `wall` and drops. A frame that moves fast stretches the sack, and the ticks after a hit flatten it.
- **Target**: stands `CLOTH_BAG_GAP` off, where the cord reaches on that tick.

### Baking

Set's models are CC BY 4.0, and the code that builds them is CC BY-NC 4.0, so the models come here as a file and the builders stay in `www-set`, which the bake only reads. Keep the credit in `README.md` "Licenses", and say what changed. The file's metadata says it too.

```sh
npm install --no-save meshoptimizer
SET_REPOSITORY=../www-set ./node_modules/.bin/vitest run --config scripts/bake-set-items/vitest.config.mjs
```

`scripts/bake-set-items/bake.test.js` builds each item with Set's `buildWeapon`, paints each connected shell in Set's mythril tones (`ITEMS`, because Set draws an item in one finish), simplifies it toward `MAX_TRIANGLES` as far as `MAX_ERROR` allows (the harp stops at about 2200) and turns it into the item frame. `from` bakes another catalog entry under an item's name and `size` scales it about the hand. The tome's pages are a simulation in Set, so the bake gives it still blocks. To add an item, add it to `ITEMS` and `HELD_ITEMS`, then any arm tile it needs to `HAND_GRIPS`.

## Adding a Generated Weapon

1. Write its spec and its motion as a pure module here, with no three.js.
2. Test the spec against physics or closed forms, on more than one shape. Art cannot check a generated weapon.
3. Build the mesh from the same state in a separate module. Update it without allocating.
4. Anchor it on a sprite pixel, never on a tuned offset: `HAND_GRIPS` in `constants/sprites/assembly.js`, checked by `tests/sprite-shp-parity.test.js` and `tests/set-items.test.js`. See "Hand-held props" in `skills/add-sprite-assembly-from-source`.
5. Keep physics independent of the camera. The drawn hand depends on the camera, so a prop leaves it and settles onto a camera-independent path (`throwStoneFlightPoint`).

## Limits

- The sprite has 8 steps and a bow aimed in 3D has no steps. At full draw the nock is 1-7 art pixels from the drawn hand at the game elevation, 7-11 on the two steps that look along the arrow, and under 15 at any elevation.
- What covers what is settled at the game's view, the even camera steps. Past them, an item that points along the view goes in front of or behind the whole sprite, and it does so as one piece. Between that and the game's views it keeps its card's tiles.
- A held item is a rigid mesh in one plane, and its tilt reads the front frames, so a blade laid on a fist meets it on the front patterns and only comes near it on the back ones. A second hand sits on it only at the game's view, the even camera steps: the sprite's hands do not turn with the camera, and it does. An `across` item points at the camera on steps 1 and 5, as one along the facing does on 3 and 7. A sword does not sweep between frames: it steps with the sprite.
- The cloth bag lands within two ticks of the SEQ, not on it: a simulated cord arrives when it arrives. A position-based chain does not conserve energy, so it is tested for its length and for settling, not for a period.
- The limb uses one bending mode and a constant inertia, and the arrow does not flex. Speed scales with the spec, not with a real bow: these units are the engine's, with its `defaultGravity`.
