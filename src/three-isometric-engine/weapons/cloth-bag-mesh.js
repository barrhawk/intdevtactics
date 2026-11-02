//NOTE(@jimmylee)
//The drawn cloth bag: one sack turned on a lathe, with a cinched neck and a ruffle above it, and one thin
//tube per link of the cord. A sync moves and scales those meshes, so it allocates nothing. The sack lies
//along the last link and takes a bag's two looks: long while it is moving and flat for the ticks after it
//hits. It wears the page's mythril, in the colors of Set's mythril mail, and the cord the mail's dark.

import * as THREE from 'three';
import { CLOTH_BAG_SPEC } from '@engine/weapons/cloth-bag';

const SACK_SIDES = 14;
const SACK_COLOR = 0xcfdcea;
const CORD_COLOR = 0x2b3a4d;
const CORD_RADIUS = 0.3;
const CORD_SIDES = 5;
const STRETCH_SPEED = 900;
const STRETCH_MOST = 0.45;
const SQUASH_MOST = 0.4;
//NOTE(@jimmylee)
//The sack's outline as [along the cord, radius], in bag radii, the neck at the origin: ruffle, neck, then
//the belly, which sags low and closes at the bottom.
const SACK_PROFILE = [
  [-0.62, 0.001],
  [-0.62, 0.34],
  [-0.46, 0.42],
  [-0.3, 0.24],
  [-0.12, 0.2],
  [0.06, 0.26],
  [0.3, 0.7],
  [0.7, 0.98],
  [1.15, 1.08],
  [1.55, 0.98],
  [1.85, 0.68],
  [2.02, 0.3],
  [2.06, 0.001],
];
const FOLDS = 5;
const FOLD_DEPTH = 0.07;

function paint(geometry, hex) {
  const color = new THREE.Color(hex);
  const colors = new Float32Array(geometry.attributes.position.count * 3);
  for (let i = 0; i < colors.length; i += 3) color.toArray(colors, i);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.userData.shared = true;
  return geometry;
}

//NOTE(@jimmylee)
//Lathed about +x, its folds running down from the neck and dying out on the way to the bottom.
function createSackGeometry(radius) {
  const geometry = new THREE.LatheGeometry(SACK_PROFILE.map(([along, r]) => new THREE.Vector2(r * radius, along * radius)), SACK_SIDES);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const along = position.getY(i);
    const z = position.getZ(i);
    const fold = 1 + FOLD_DEPTH * Math.cos(Math.atan2(z, x) * FOLDS) * Math.max(0, 1 - along / (radius * 1.6));
    position.setXYZ(i, along, -x * fold, z * fold);
  }
  geometry.computeVertexNormals();
  return paint(geometry, SACK_COLOR);
}

//NOTE(@jimmylee)
//What every Cloth Bag card shares.
export function createClothBagResources(spec = CLOTH_BAG_SPEC) {
  const sack = createSackGeometry(spec.bagRadius);
  const cord = paint(new THREE.CylinderGeometry(CORD_RADIUS, CORD_RADIUS, 1, CORD_SIDES).rotateZ(-Math.PI / 2).translate(0.5, 0, 0), CORD_COLOR);
  return {
    sack,
    cord,
    dispose() {
      sack.dispose();
      cord.dispose();
    },
  };
}

//NOTE(@jimmylee)
//One card's bag: { sack, links } meshes in `scene`, on `material`, a material taking vertex colors.
export function createClothBagMesh(bag, resources, material, scene) {
  const add = (geometry) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    mesh.userData.generatedWeapon = true;
    scene.add(mesh);
    return mesh;
  };
  const links = [];
  for (let i = 0; i + 1 < bag.nodes; i++) links.push(add(resources.cord));
  return { sack: add(resources.sack), links };
}

const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _along = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);
const _turn = new THREE.Quaternion();

//NOTE(@jimmylee)
//Draws `bag` from the world point `hand`, which is the sprite's hand, so the cord always leaves the pixel
//the sprite draws: a node's offset from the cord's first node runs along the unit's (dirX, dirZ) and up.
export function syncClothBagMesh(mesh, bag, hand, dirX, dirZ) {
  const place = (out, i) => {
    const forward = bag.x[i] - bag.x[0];
    out.set(hand.x + dirX * forward, hand.y + bag.y[i] - bag.y[0], hand.z + dirZ * forward);
  };
  for (let i = 0; i < mesh.links.length; i++) {
    const link = mesh.links[i];
    place(_from, i);
    place(_to, i + 1);
    _along.subVectors(_to, _from);
    const length = _along.length();
    link.position.copy(_from);
    link.scale.set(Math.max(length, 1e-3), 1, 1);
    link.quaternion.setFromUnitVectors(_x, _along.divideScalar(Math.max(length, 1e-3)));
  }
  const stretch = 1 + Math.min(bag.speed / STRETCH_SPEED, 1) * STRETCH_MOST;
  const squash = 1 - bag.impact * SQUASH_MOST;
  const length = stretch * squash;
  const across = 1 / Math.sqrt(length);
  mesh.sack.position.copy(_to);
  mesh.sack.scale.set(length, across, across);
  _turn.setFromUnitVectors(_x, _along);
  mesh.sack.quaternion.copy(_turn);
}
