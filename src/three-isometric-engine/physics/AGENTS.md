# Physics Bodies

A unit's physics body is read from its sprite, one body per SHP frame, so it changes as the unit moves. `sprite-body.js` has no renderer in it: the shape is plain arrays, and a game can hand them to its own physics engine. Paths start from `three-isometric-engine/`.

## The Shape

An SHP frame is the unit seen from its side, and pixels read the way `throwStoneLaunchPoint` and `seqMoveLocal` read them: `u` along the unit's facing, `v` down its height. `readSheetAlpha(image)` reads the sheet's opacity, and `createSheetBodies(sheet)` composes a frame's tiles from `SHP_FRAMES` and inflates its silhouette the first time that frame is asked for. A ball sits on every ridge of the silhouette's distance field, and a pixel's half-width is how far those balls reach above it, so a torso comes out round, a leg thin, and a gap between two legs stays a gap.

`shape(shp)` returns `{ pixels, count, volume }`. `pixels` holds `[u, v, half]` per opaque pixel, bottom row first, in pixels from the stance point. `volume` is in world units. A world point on the body is the stance point plus `-u` × `BODY_PX_ACROSS` along the facing, `half` × `BODY_PX_ACROSS` to either side of it, and `-v` × `BODY_PX_UP` up.

The sheet is read at run time, so another sheet with TYPE1's layout gets its bodies with no data of its own.

## The Pose

Physics never reads a billboard point. `resolveBodyPose(ch, now, out)` resolves the frame from the unit's state and clock with no camera, always on the front sequence, and `placeBody(root, now, bodies, out)` puts it at the stance point with its SEQ unit motion and the unit's facing. So a unit has one body on every pattern, including the back and mirrored ones.

- A body is always the dry frame: F(n + 182) stops at the waterline, and the body has legs under it. Nulled Walk's dry frames are placeholders, so `shape` falls through to its water frames.
- A standing unit uses F2, the 3/4 view every front frame is drawn in.
- Kneel and Dead rest on shorter bodies, so `rise` lifts their stance point back above the root.
- A new mode with its own rig needs a `MODE_ENTRIES` row in `physics/sprite-body.js`, or a case in `resolveBodyPose` if it joins sequences. `tests/physics-body.test.js` compares the pose with what the rig draws on every card. A sequence mode reads `ch.seqFront` and needs nothing.

## What Uses It

The water (`debug/water-surface.js`, described in `pages/AGENTS.md` "In water") and the Physics body control (`debug/physics-body-mesh.js`). A stone's hit, a bow's hit, a thrown item's hit, the cloth bag's wall and the pose pivots still land on the `CHAR_HALF_Z` box in `constants/character.js`, which the card timelines are timed to.

A platform is the other kind of body: it stands still, so it is a box, `{ x, z, halfX, halfZ, top }` in `scene.userData.posts`. The water shader takes the box as it is: its foam comes from the distance to the footprint, a ray under the surface meets its walls or its sunken top, and the sun throws its shadow along the seabed. The ripples treat it as a wall (`ripples.wall`).
