//NOTE(@jimmylee)
//The physics body of a unit, read from the sprite itself. One SHP frame is the unit's side profile: its
//opaque pixels are the body, with u along the unit's facing and v down its height, the way
//throwStoneLaunchPoint and seqMoveLocal read pixels. The sheet says nothing about depth, so each pixel
//is inflated across the unit: a ball fills every thick part of the silhouette, so the torso comes out
//round, the legs thin, and a gap between two legs stays a gap.
//
//Physics never reads a billboard point, so a body never reads the camera. It always comes from the
//front frame (patterns A/B), whichever pattern is drawn, at the unit's stance point and facing. The
//water frames F(n + 182) stop at the waterline, so a body is always the dry frame, legs included.
//
//physics/AGENTS.md is the whole contract. No three.js math here, so a game can hand these pixels to its
//own physics engine.

import { SPRITE_MAP } from '@engine/constants/sprites';
import { SPRITE_HEIGHT, SPRITE_WIDTH } from '@engine/constants/character';
import { JUMP_TICKS, QUICK_THROW_DELAYS } from '@engine/constants/sprites/assembly';
import { SEQ_LIBRARY, SHP_FRAMES, SHP_WATER_OFFSET } from '@engine/constants/sprites/seq-library';
import { DEAD_PIVOT_RISE, FACING_X, FACING_Z, KNEEL_PIVOT_RISE, resolveLoopingFrame, resolveVariableFrame } from '@engine/meshes/character-utils';
import { playerJumpFrame, playerLandFrame } from '@engine/actions/action-timelines';
import { State } from '@engine/actions/character-state';

//NOTE(@jimmylee)
//World units per art pixel: along the facing and across the unit, and up the unit.
export const BODY_PX_ACROSS = SPRITE_WIDTH / 32;
export const BODY_PX_UP = SPRITE_HEIGHT / 40;

//NOTE(@jimmylee)
//Big enough for every tile of every frame: SHP_FRAMES reach 40px from the unit origin.
const GRID = 128;
const GRID_ORIGIN = GRID / 2;

//NOTE(@jimmylee)
//SR1 is the origin marker of F0, not part of a unit.
const MARKER_TILE = 'SR1';

//NOTE(@jimmylee)
//SEQ 2, Idle SE: the 3/4 view every front frame is drawn in, arms and all (IDLE_FRAMES[1]).
const IDLE_BODY_FRAME = SEQ_LIBRARY[2].frames[0];

//NOTE(@jimmylee)
//The sheet's opacity as { width, height, opaque }, one byte per pixel. A loaded image goes through a
//canvas once; an image with `data` (a DataTexture's) is read directly.
export function readSheetAlpha(image) {
  let { data, width, height } = image;
  if (!data) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    data = context.getImageData(0, 0, width, height).data;
  }
  const opaque = new Uint8Array(width * height);
  for (let i = 0; i < opaque.length; i++) opaque[i] = data[i * 4 + 3] > 0 ? 1 : 0;
  return { width, height, opaque };
}

//NOTE(@jimmylee)
//Distance from every opaque pixel to the nearest empty one, in place: a two-pass chamfer over the
//silhouette's bounds, which sit at least 1 cell inside the grid.
function distanceToEdge(distance, minX, maxX, minY, maxY) {
  const relax = (cell, neighbor, cost) => {
    if (distance[neighbor] + cost < distance[cell]) distance[cell] = distance[neighbor] + cost;
  };
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cell = y * GRID + x;
      if (distance[cell] === 0) continue;
      relax(cell, cell - 1, 1);
      relax(cell, cell - GRID, 1);
      relax(cell, cell - GRID - 1, Math.SQRT2);
      relax(cell, cell - GRID + 1, Math.SQRT2);
    }
  }
  for (let y = maxY; y >= minY; y--) {
    for (let x = maxX; x >= minX; x--) {
      const cell = y * GRID + x;
      if (distance[cell] === 0) continue;
      relax(cell, cell + 1, 1);
      relax(cell, cell + GRID, 1);
      relax(cell, cell + GRID + 1, Math.SQRT2);
      relax(cell, cell + GRID - 1, Math.SQRT2);
    }
  }
}

//NOTE(@jimmylee)
//One SHP frame's body: `pixels` is [u, v, half] per opaque pixel, bottom row first, with (u, v) the
//pixel's center in unit pixels from the stance point and `half` how far the body reaches to either side
//of the facing there. `volume` is in world units. An empty frame has count 0.
function buildShape(sheet, shp) {
  const distance = new Float32Array(GRID * GRID);
  let minX = GRID;
  let maxX = -1;
  let minY = GRID;
  let maxY = -1;
  for (const [id, u, v, reverseX] of SHP_FRAMES[shp]) {
    if (id === MARKER_TILE) continue;
    const cell = SPRITE_MAP[id];
    const left = u - cell.w / 2 + GRID_ORIGIN;
    const top = v - cell.h / 2 + GRID_ORIGIN;
    for (let j = 0; j < cell.h; j++) {
      for (let i = 0; i < cell.w; i++) {
        if (!sheet.opaque[(cell.y + j) * sheet.width + cell.x + i]) continue;
        const x = left + (reverseX ? cell.w - 1 - i : i);
        const y = top + j;
        distance[y * GRID + x] = Infinity;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return { pixels: new Float32Array(0), count: 0, volume: 0 };
  distanceToEdge(distance, minX, maxX, minY, maxY);

  //NOTE(@jimmylee)
  //A ball on every ridge of the distance field, so a pixel's half-width is how far above it the balls
  //reach. A 1px line has radius 0.5, the distance from a pixel's center to its edge.
  const half = new Float32Array(GRID * GRID);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const cell = y * GRID + x;
      if (distance[cell] === 0) continue;
      const radius = distance[cell] - 0.5;
      if (radius > half[cell]) half[cell] = radius;
      if (distance[cell - 1] > distance[cell] || distance[cell + 1] > distance[cell] || distance[cell - GRID] > distance[cell] || distance[cell + GRID] > distance[cell]) continue;
      const reach = Math.ceil(radius);
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          const other = cell + dy * GRID + dx;
          if (distance[other] === 0) continue;
          const left = radius * radius - dx * dx - dy * dy;
          if (left > half[other] * half[other]) half[other] = Math.sqrt(left);
        }
      }
    }
  }

  const values = [];
  let volume = 0;
  for (let y = maxY; y >= minY; y--) {
    for (let x = minX; x <= maxX; x++) {
      const cell = y * GRID + x;
      if (distance[cell] === 0) continue;
      values.push(x - GRID_ORIGIN + 0.5, y - GRID_ORIGIN + 0.5, half[cell]);
      volume += 2 * half[cell] * BODY_PX_ACROSS * BODY_PX_ACROSS * BODY_PX_UP;
    }
  }
  return { pixels: Float32Array.from(values), count: values.length / 3, volume };
}

//NOTE(@jimmylee)
//Every frame's body for one sheet, built the first time it is asked for. `shape(shp)` falls through to
//F(shp + 182) for the frames that draw only in water: Nulled Walk's dry frames are placeholders.
export function createSheetBodies(sheet) {
  const shapes = new Array(SHP_WATER_OFFSET).fill(null);
  function shape(shp) {
    if (shapes[shp] !== null) return shapes[shp];
    const dry = buildShape(sheet, shp);
    shapes[shp] = dry.count > 0 ? dry : buildShape(sheet, shp + SHP_WATER_OFFSET);
    return shapes[shp];
  }
  return { shape };
}

//NOTE(@jimmylee)
//The sequence each assembly mode draws on its front patterns, the same SEQ the rig parity suite checks
//it against. `loop` as the mode's visual driver plays it. A mode with no entry and no sequence of its
//own stands on its idle frame.
const entryOf = (seq, loop) => ({ entry: SEQ_LIBRARY[seq], loop });
const WALK = entryOf(6, true);
const FLINCH = entryOf(38, true);
const STAB_LV3 = SEQ_LIBRARY[100];
const CAST = entryOf(64, true);
const MODE_ENTRIES = { I: WALK, W: WALK, A1: WALK, G: entryOf(76, false), FL: entryOf(12, true), C: CAST, P1: entryOf(140, true), P2: entryOf(142, true), P3: entryOf(144, true), S1: entryOf(96, true) };

//NOTE(@jimmylee)
//Modes that join sequences or redraw their last frame for another delay, as their assemblies do.
const delaysOf = (ticks) => ticks.map((t) => t / 60);
const JUMP_TAKEOFF = SEQ_LIBRARY[204];
const JUMP_LAND = SEQ_LIBRARY[52];
const JUMP = { frames: [...JUMP_TAKEOFF.frames, ...JUMP_LAND.frames], delaysS: delaysOf(JUMP_TICKS), fb: [...JUMP_TAKEOFF.fb, ...JUMP_LAND.frames.map(() => 0)], du: [...JUMP_TAKEOFF.du, ...JUMP_LAND.frames.map(() => 0)] };
const QUICK_THROW = { ...SEQ_LIBRARY[48], delaysS: QUICK_THROW_DELAYS.map((ms) => ms / 1000) };
const THROW_STONE = SEQ_LIBRARY[208];

const POSE_RISE = { K: KNEEL_PIVOT_RISE, D: DEAD_PIVOT_RISE };

function playFrame(entry, frameIdx, out) {
  out.shp = entry.frames[frameIdx];
  out.fb = entry.fb ? entry.fb[frameIdx] : 0;
  out.du = entry.du ? entry.du[frameIdx] : 0;
}

function play(entry, loop, seconds, out) {
  const elapsed = Math.max(0, seconds);
  const { frameIdx } = loop && entry.totalS > 0 ? resolveLoopingFrame(entry.delaysS, entry.totalS, elapsed) : resolveVariableFrame(entry.delaysS, elapsed);
  playFrame(entry, frameIdx, out);
}

function standIdle(out) {
  out.shp = IDLE_BODY_FRAME;
  out.fb = 0;
  out.du = 0;
}

//NOTE(@jimmylee)
//The frame `ch` draws on its front patterns at `now`, resolved from the same state and clock as its
//visual driver but with no camera, written to `out` as { shp, fb, du, rise }: the SHP frame, the unit
//motion in pixels, and how far the stance point sits above the root (Kneel and Dead rest on their
//shorter bodies).
export function resolveBodyPose(ch, now, out) {
  out.rise = POSE_RISE[ch.mode] ?? 0;
  const seconds = (now - ch.walkStart) / 1000;
  const falling = ch.state === State.FALLING || ch.state === State.SPAWNING;

  if (ch.seqFront) {
    if (falling) standIdle(out);
    else play(ch.seqFront, ch.seqLoop, seconds, out);
    return out;
  }

  switch (ch.mode) {
    case 'H':
      play(FLINCH.entry, FLINCH.loop, seconds, out);
      return out;
    case 'K':
      playFrame(SEQ_LIBRARY[32], 0, out);
      return out;
    case 'D':
      playFrame(SEQ_LIBRARY[40], 0, out);
      return out;
    case 'J':
      if (ch._lastCycle === -1) standIdle(out);
      else play(JUMP, false, seconds, out);
      return out;
    case 'TS':
      if (ch.action === null) standIdle(out);
      else play(THROW_STONE, false, seconds, out);
      return out;
    case 'T':
      if (ch.action === null) standIdle(out);
      else play(QUICK_THROW, false, seconds, out);
      return out;
    case 'A1':
      if (ch._attackAction) {
        play(STAB_LV3, false, (now - ch._attackAction.startTime) / 1000, out);
        return out;
      }
      if (ch._castAction) {
        play(CAST.entry, CAST.loop, (now - ch._castAction.startTime) / 1000, out);
        return out;
      }
      if (ch._jumpAction) {
        playFrame(JUMP, playerJumpFrame((now - ch._jumpAction.startTime) / 1000), out);
        return out;
      }
      if (ch._landedAt !== undefined && ch.walkStopped && ch.state === State.IDLE) {
        const frame = playerLandFrame((now - ch._landedAt) / 1000);
        if (frame >= 0) {
          playFrame(JUMP, frame, out);
          return out;
        }
      }
      break;
  }

  const mode = MODE_ENTRIES[ch.mode];
  if (!mode || falling || ch.walkStopped) standIdle(out);
  else play(mode.entry, mode.loop, seconds, out);
  return out;
}

//NOTE(@jimmylee)
//Where a unit's body is at `now`, written to `out` as { shp, shape, x, y, z, fx, fz }: its frame and
//shape, the stance point with the frame's SEQ unit motion, and the facing. World height of pixel
//(u, v) is y - v · BODY_PX_UP, and its place along the facing is -u · BODY_PX_ACROSS: the front
//patterns draw a unit facing screen left.
const _pose = { shp: 0, fb: 0, du: 0, rise: 0 };
export function placeBody(root, now, bodies, out) {
  const ch = root.userData.character;
  resolveBodyPose(ch, now, _pose);
  const fx = FACING_X[ch.directionOffset];
  const fz = FACING_Z[ch.directionOffset];
  const forward = _pose.fb * BODY_PX_ACROSS;
  out.shp = _pose.shp;
  out.shape = bodies.shape(_pose.shp);
  out.x = root.position.x + fx * forward;
  out.y = root.position.y + _pose.rise - _pose.du * BODY_PX_UP;
  out.z = root.position.z + fz * forward;
  out.fx = fx;
  out.fz = fz;
  return out;
}
