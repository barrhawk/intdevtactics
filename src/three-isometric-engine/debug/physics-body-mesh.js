//NOTE(@jimmylee)
//What the Physics body control draws: every body a scene measures against the water, as the surface
//physics/sprite-body.js gives it. A frame's body is one closed mesh built the first time it is drawn: its
//pixels are a height field, the same shape on both sides of the unit, meeting at the silhouette. Those
//meshes only swap as frames change, so nothing is written per frame but one matrix and one uniform.
//
//The body is drawn in world space but the sprite is not: the sprite plane leans with the camera, so a
//pixel's height runs along the camera's up axis. A body's matrix does the same to its height, which leaves
//it on the sprite at every elevation, and nothing else about it depends on the camera. It draws after the
//scene with its own depth, because the sheet would hide everything under the surface.

import * as THREE from 'three';
import { BODY_TINTS } from '@engine/debug/sprite-animation-demo-catalog';
import { BODY_PX_ACROSS, BODY_PX_UP, createSheetBodies, placeBody } from '@engine/physics/sprite-body';

const BODY_RENDER_ORDER = 1;
const SPHERE_SEGMENTS = 24;
const DRY = -Infinity;

const BODY_VERTEX_SHADER = /* glsl */ `
  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vHeight = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

//NOTE(@jimmylee)
//Mostly clear in the middle and solid at the edge, so the sprite still reads through its own body, with
//a line where the surface crosses it.
const BODY_FRAGMENT_SHADER = /* glsl */ `
  uniform float waterline;
  uniform vec3 dryColor;
  uniform vec3 wetColor;

  varying vec3 vNormal;
  varying float vHeight;

  void main() {
    float edge = pow(1.0 - abs(normalize(vNormal).z), 1.5);
    float line = 1.0 - smoothstep(0.0, 0.5, abs(vHeight - waterline));
    vec3 color = mix(vHeight < waterline ? wetColor : dryColor, vec3(1.0), line);
    gl_FragColor = vec4(color, max(mix(0.18, 0.7, edge), line));
    #include <colorspace_fragment>
  }
`;

const BODY_DEPTH_FRAGMENT_SHADER = /* glsl */ `
  void main() {
    gl_FragColor = vec4(0.0);
  }
`;

//NOTE(@jimmylee)
//Body-local x along the facing, y up, z across the unit, all in world units, around the stance point.
//Grid corners take the mean half-width of the four pixels around them, so the outline comes to 0 and
//the two sides close. Returns null for an empty frame.
function createBodyGeometry(shape) {
  if (shape.count === 0) return null;
  const { pixels, count } = shape;
  const half = new Map();
  const key = (u, v) => (v + 512) * 1024 + u + 512;
  for (let i = 0; i < count; i++) half.set(key(pixels[i * 3] - 0.5, pixels[i * 3 + 1] - 0.5), pixels[i * 3 + 2]);
  const at = (u, v) => half.get(key(u, v)) ?? 0;

  const corners = new Map();
  const positions = [];
  const indices = [];
  const corner = (u, v, side) => {
    const reach = (at(u - 1, v - 1) + at(u, v - 1) + at(u - 1, v) + at(u, v)) / 4;
    const inner = at(u - 1, v - 1) > 0 && at(u, v - 1) > 0 && at(u - 1, v) > 0 && at(u, v) > 0;
    const name = inner ? key(u, v) * 2 + (side > 0 ? 1 : 0) : key(u, v) * 2;
    if (!corners.has(name)) {
      corners.set(name, positions.length / 3);
      positions.push(-u * BODY_PX_ACROSS, -v * BODY_PX_UP, inner ? side * reach * BODY_PX_ACROSS : 0);
    }
    return corners.get(name);
  };
  for (const side of [1, -1]) {
    for (let i = 0; i < count; i++) {
      const u = pixels[i * 3] - 0.5;
      const v = pixels[i * 3 + 1] - 0.5;
      const a = corner(u, v, side);
      const b = corner(u + 1, v, side);
      const c = corner(u + 1, v + 1, side);
      const d = corner(u, v + 1, side);
      if (side > 0) indices.push(a, b, c, a, c, d);
      else indices.push(a, c, b, a, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

//NOTE(@jimmylee)
//What every scene's bodies share, for one sheet: `sheet` is readSheetAlpha's. Created the first time a
//stage needs a body.
export function createBodyResources(sheet) {
  const shapes = createSheetBodies(sheet);
  const geometries = new Map();
  //NOTE(@jimmylee)
  //The depth pass shares the color pass's vertex shader, because two shaders that compute one position
  //differently round it differently, and the color pass would lose to its own depth in speckles.
  const depthMaterial = new THREE.ShaderMaterial({ vertexShader: BODY_VERTEX_SHADER, fragmentShader: BODY_DEPTH_FRAGMENT_SHADER, colorWrite: false });
  const spheres = new Map();
  const uniforms = {
    dryColor: { value: new THREE.Color(BODY_TINTS.find((t) => t.role === 'dry').color) },
    wetColor: { value: new THREE.Color(BODY_TINTS.find((t) => t.role === 'wet').color) },
  };
  return {
    shape: shapes.shape,
    depthMaterial,
    sphere(radius) {
      if (!spheres.has(radius)) spheres.set(radius, new THREE.SphereGeometry(radius, SPHERE_SEGMENTS, SPHERE_SEGMENTS));
      return spheres.get(radius);
    },
    createMaterial() {
      return new THREE.ShaderMaterial({ uniforms: { ...uniforms, waterline: { value: DRY } }, vertexShader: BODY_VERTEX_SHADER, fragmentShader: BODY_FRAGMENT_SHADER, transparent: true, depthWrite: false });
    },
    geometry(shp) {
      if (!geometries.has(shp)) geometries.set(shp, createBodyGeometry(shapes.shape(shp)));
      return geometries.get(shp);
    },
    dispose() {
      for (const geometry of geometries.values()) geometry?.dispose();
      for (const sphere of spheres.values()) sphere.dispose();
      depthMaterial.dispose();
    },
  };
}

function createBodyMeshes(resources, scene) {
  const depth = new THREE.Mesh(resources.sphere(1), resources.depthMaterial);
  const color = new THREE.Mesh(resources.sphere(1), resources.createMaterial());
  color.renderOrder = BODY_RENDER_ORDER;
  for (const mesh of [depth, color]) {
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
  }
  return { depth, color };
}

function showMeshes({ depth, color }, geometry, waterline) {
  const visible = geometry !== null;
  depth.visible = visible;
  color.visible = visible;
  if (!visible) return;
  depth.geometry = geometry;
  color.geometry = geometry;
  color.material.uniforms.waterline.value = waterline;
  depth.matrixWorldNeedsUpdate = true;
  color.matrixWorldNeedsUpdate = true;
}

//NOTE(@jimmylee)
//One scene's bodies, in a scene of their own: its roots and its thrown props (`station.props`).
export function createStationBody(resources, roots, props) {
  const scene = new THREE.Scene();
  const units = roots.map((root) => ({ root, place: { shp: 0, shape: null, x: 0, y: 0, z: 0, fx: 0, fz: 0 }, meshes: createBodyMeshes(resources, scene) }));
  const orbs = props.map((prop) => ({ ...prop, meshes: createBodyMeshes(resources, scene) }));
  const materials = [...units, ...orbs].map(({ meshes }) => meshes.color.material);

  //NOTE(@jimmylee)
  //One drawn frame. (upX, upY, upZ) is the camera's up axis. `water` is the scene's water when it is in
  //water, which has already measured its bodies this frame, and `level` the height of the sheet.
  function update(now, upX, upY, upZ, water, level) {
    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      if (!unit.root.visible) {
        showMeshes(unit.meshes, null, DRY);
        continue;
      }
      const { x, y, z, fx, fz, shp } = placeBody(unit.root, now, resources, unit.place);
      const cut = water ? water.tracked[i].cut : Infinity;
      showMeshes(unit.meshes, resources.geometry(shp), Number.isFinite(cut) ? -cut * BODY_PX_UP : DRY);
      unit.meshes.depth.matrix.set(fx, upX, -fz, x, 0, upY, 0, y, fz, upZ, fx, z, 0, 0, 0, 1);
      unit.meshes.color.matrix.copy(unit.meshes.depth.matrix);
    }
    for (let i = 0; i < orbs.length; i++) {
      const orb = orbs[i];
      if (!orb.object.visible) {
        showMeshes(orb.meshes, null, DRY);
        continue;
      }
      const { x, y, z } = orb.object.position;
      showMeshes(orb.meshes, resources.sphere(orb.radius), water ? level - y : DRY);
      orb.meshes.depth.matrix.makeTranslation(x, y, z);
      orb.meshes.color.matrix.makeTranslation(x, y, z);
    }
  }

  //NOTE(@jimmylee)
  //The first unit standing, for the status line: its frame, volume and how much of it is under water.
  function describe(water) {
    const unit = units.find(({ root }) => root.visible);
    if (!unit) return 'no body';
    const volume = `body F${unit.place.shp} · volume ${Math.round(unit.place.shape.volume)}`;
    return water ? `${volume} · ${Math.round(water.tracked[units.indexOf(unit)].under * 100)}% under` : volume;
  }

  return {
    scene,
    update,
    describe,
    dispose() {
      for (const material of materials) material.dispose();
    },
  };
}
