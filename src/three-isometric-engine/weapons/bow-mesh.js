//NOTE(@jimmylee)
//The drawn bow and arrow, generated from a bow spec with no texture. The stave is one tube along the
//limbs and the grip and the string one tube through the simulated nodes, both rewritten from the bow's
//state on each draw (syncBowMesh) in the bow's frame: +x along the arrow, +y up the limbs, the grip at
//the origin. Rings of a tube are analytic, so a sync allocates nothing and needs no normal pass.

import * as THREE from 'three';
import { limbPoint } from '@engine/weapons/bow';

const LIMB_STATIONS = 10;
const GRIP_STATIONS = 2;
const STAVE_STATIONS = 2 * LIMB_STATIONS + GRIP_STATIONS;
const STAVE_SIDES = 6;
const STRING_SIDES = 3;
const GRIP_FLARE = 1.5;
//NOTE(@jimmylee)
//Set's mythril tones, as the baked items wear them: the plate, its blue at the tips and the mail's dark on
//the grip.
const GRIP_COLOR = new THREE.Color(0x2b3a4d);
const LIMB_COLOR = new THREE.Color(0xd4e0ed);
const TIP_COLOR = new THREE.Color(0x8fbbe8);

const SHAFT_RADIUS = 0.28;
const HEAD_LENGTH = 3.2;
const HEAD_RADIUS = 1;
const VANE_LENGTH = 4;
const VANE_HEIGHT = 1.2;
const VANE_INSET = 1;
const VANE_COUNT = 3;

const _point = { x: 0, y: 0 };

//NOTE(@jimmylee)
//A tube of `stations` rings of `sides` vertices. Its (normal, z, tangent) frame is right handed, so
//(a, b, c) below winds outward.
function createTube(stations, sides, material) {
  const count = stations * sides;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const normal = new THREE.BufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', position);
  geometry.setAttribute('normal', normal);
  const index = [];
  for (let i = 0; i + 1 < stations; i++) {
    for (let j = 0; j < sides; j++) {
      const a = i * sides + j;
      const b = i * sides + ((j + 1) % sides);
      const c = a + sides;
      const d = b + sides;
      index.push(a, b, c, b, d, c);
    }
  }
  geometry.setIndex(index);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.userData.generatedWeapon = true;
  const cos = new Float64Array(sides);
  const sin = new Float64Array(sides);
  for (let j = 0; j < sides; j++) {
    cos[j] = Math.cos((j / sides) * Math.PI * 2);
    sin[j] = Math.sin((j / sides) * Math.PI * 2);
  }
  return { mesh, position, normal, stations, sides, cos, sin };
}

//NOTE(@jimmylee)
//Writes the rings along the centerline (`xs`, `ys`), `thick` the half thickness in the bow's plane and
//`wide` the half width across it.
function writeTube(tube, xs, ys, thick, wide) {
  const { position, normal, stations, sides, cos, sin } = tube;
  const p = position.array;
  const n = normal.array;
  let o = 0;
  for (let i = 0; i < stations; i++) {
    const before = i > 0 ? i - 1 : i;
    const after = i + 1 < stations ? i + 1 : i;
    const tx = xs[after] - xs[before];
    const ty = ys[after] - ys[before];
    const length = Math.hypot(tx, ty) || 1;
    const nx = -ty / length;
    const ny = tx / length;
    for (let j = 0; j < sides; j++) {
      p[o] = xs[i] + nx * thick[i] * cos[j];
      p[o + 1] = ys[i] + ny * thick[i] * cos[j];
      p[o + 2] = wide[i] * sin[j];
      const along = cos[j] * wide[i];
      const across = sin[j] * thick[i];
      const scale = Math.hypot(along, across) || 1;
      n[o] = (nx * along) / scale;
      n[o + 1] = (ny * along) / scale;
      n[o + 2] = across / scale;
      o += 3;
    }
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
}

//NOTE(@jimmylee)
//Distance along the limb of a stave station, 0 at the grip and limbLength at the tip.
function limbStation(spec, k) {
  return (spec.limbLength * k) / (LIMB_STATIONS - 1);
}

//NOTE(@jimmylee)
//Half thickness and half width down the stave: tapering from the grip to `tipScale` at the tip, with a
//flare at the grip, the way a limb is tillered.
function staveProfile(spec) {
  const thick = new Float64Array(STAVE_STATIONS);
  const wide = new Float64Array(STAVE_STATIONS);
  const colors = new Float32Array(STAVE_STATIONS * STAVE_SIDES * 3);
  const color = new THREE.Color();
  for (let i = 0; i < STAVE_STATIONS; i++) {
    const fromTop = Math.min(i, STAVE_STATIONS - 1 - i);
    const onGrip = fromTop >= LIMB_STATIONS;
    const taper = onGrip ? 1 : spec.tipScale + (1 - spec.tipScale) * (fromTop / (LIMB_STATIONS - 1));
    const flare = onGrip ? GRIP_FLARE : 1;
    thick[i] = spec.limbThickness * taper * flare;
    wide[i] = spec.limbWidth * taper * flare;
    color.copy(onGrip ? GRIP_COLOR : fromTop === 0 ? TIP_COLOR : LIMB_COLOR);
    for (let j = 0; j < STAVE_SIDES; j++) color.toArray(colors, (i * STAVE_SIDES + j) * 3);
  }
  return { thick, wide, colors };
}

//NOTE(@jimmylee)
//The bow as a Group (stave + string). Call syncBowMesh after every step. `materials`:
//{ stave, string }; the stave material takes vertex colors.
export function createBowMesh(bow, materials) {
  const { spec, nodes } = bow;
  const group = new THREE.Group();
  const stave = createTube(STAVE_STATIONS, STAVE_SIDES, materials.stave);
  const profile = staveProfile(spec);
  stave.mesh.geometry.setAttribute('color', new THREE.BufferAttribute(profile.colors, 3));
  const stationsOnString = 2 * nodes + 1;
  const string = createTube(stationsOnString, STRING_SIDES, materials.string);
  const stringRadius = new Float64Array(stationsOnString).fill(spec.stringRadius);
  group.add(stave.mesh, string.mesh);
  group.userData.bowMesh = {
    stave,
    string,
    profile,
    stringRadius,
    staveX: new Float64Array(STAVE_STATIONS),
    staveY: new Float64Array(STAVE_STATIONS),
    stringX: new Float64Array(stationsOnString),
    stringY: new Float64Array(stationsOnString),
  };
  syncBowMesh(group, bow);
  return group;
}

export function syncBowMesh(group, bow) {
  const { stave, string, profile, stringRadius, staveX, staveY, stringX, stringY } = group.userData.bowMesh;
  const { spec, nodes, x, y, phi } = bow;
  for (let k = 0; k < LIMB_STATIONS; k++) {
    limbPoint(spec, phi, limbStation(spec, k), _point);
    const top = LIMB_STATIONS - 1 - k;
    const bottom = STAVE_STATIONS - LIMB_STATIONS + k;
    staveX[top] = _point.x;
    staveY[top] = _point.y;
    staveX[bottom] = _point.x;
    staveY[bottom] = -_point.y;
  }
  for (let g = 0; g < GRIP_STATIONS; g++) {
    staveX[LIMB_STATIONS + g] = 0;
    staveY[LIMB_STATIONS + g] = spec.gripHalf * (1 - (2 * g) / (GRIP_STATIONS - 1));
  }
  writeTube(stave, staveX, staveY, profile.thick, profile.wide);
  for (let i = 0; i <= nodes; i++) {
    stringX[i] = x[i];
    stringY[i] = y[i];
    stringX[2 * nodes - i] = x[i];
    stringY[2 * nodes - i] = -y[i];
  }
  writeTube(string, stringX, stringY, stringRadius, stringRadius);
}

//NOTE(@jimmylee)
//The arrow's parts in its own frame: the nock at the origin, the tip at +x `length`. Geometries are
//immutable and shared by every arrow of that length.
export function createArrowGeometries(length) {
  const shaft = new THREE.CylinderGeometry(SHAFT_RADIUS, SHAFT_RADIUS, length - HEAD_LENGTH, 6).rotateZ(-Math.PI / 2).translate((length - HEAD_LENGTH) / 2, 0, 0);
  const head = new THREE.ConeGeometry(HEAD_RADIUS, HEAD_LENGTH, 6).rotateZ(-Math.PI / 2).translate(length - HEAD_LENGTH / 2, 0, 0);
  head.setAttribute('color', new THREE.BufferAttribute(new Float32Array(head.attributes.position.count * 3).fill(LIMB_COLOR.r), 3));
  const vanes = new THREE.BufferGeometry();
  const position = [];
  for (let k = 0; k < VANE_COUNT; k++) {
    const angle = (k / VANE_COUNT) * Math.PI * 2 + Math.PI / 2;
    const y = Math.cos(angle);
    const z = Math.sin(angle);
    const inner = SHAFT_RADIUS * 0.8;
    const outer = inner + VANE_HEIGHT;
    position.push(VANE_INSET, y * inner, z * inner, VANE_INSET + VANE_LENGTH, y * inner, z * inner, VANE_INSET, y * outer, z * outer);
  }
  vanes.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  return { shaft, head, vanes };
}

//NOTE(@jimmylee)
//One arrow from those geometries. `materials`: { shaft, head, vanes }.
export function createArrowMesh(geometries, materials) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geometries.shaft, materials.shaft), new THREE.Mesh(geometries.head, materials.head), new THREE.Mesh(geometries.vanes, materials.vanes));
  for (const part of group.children) part.userData.generatedWeapon = true;
  return group;
}
