//NOTE(@jimmylee)
//The number the game bounces over a unit that takes a hit. There are no stats on the main route, so it is
//always DAMAGE_COUNTER (debug/sprite-animation-demo-catalog.js). The digits are data here, not an image,
//and they are drawn in art pixels at the sprites' own scale: each hops once and settles, a few ticks
//after the digit before it. The hop runs on the demo clock, so it pauses and steps with the sprites.
//
//The material has no `map`: in the demos and their tests a mesh with a map is a sprite plane.

import * as THREE from 'three';
import { SPRITE_HEIGHT, SPRITE_WIDTH } from '@engine/constants/character';
import { COUNTER_ANCHOR_PX, COUNTER_TICKS, DAMAGE_COUNTER, counterHop } from '@engine/debug/sprite-animation-demo-catalog';

const PX_X = SPRITE_WIDTH / 32;
const PX_Y = SPRITE_HEIGHT / 40;
const GLYPH_W = 5;
const GLYPH_H = 7;
const CELL_W = GLYPH_W + 2;
const CELL_H = GLYPH_H + 2;
const ADVANCE = CELL_W - 1;
const DIGIT_ORDER = [...String(DAMAGE_COUNTER)].map(Number);

//NOTE(@jimmylee)
//5x7 digits, one row mask per line from the top, bit 4 on the left.
const GLYPHS = [
  [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  [0x0e, 0x11, 0x01, 0x06, 0x01, 0x11, 0x0e],
  [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
];

function glyphAt(digit, x, y) {
  return x >= 0 && x < GLYPH_W && y >= 0 && y < GLYPH_H && ((GLYPHS[digit][y] >> (GLYPH_W - 1 - x)) & 1) === 1;
}

//NOTE(@jimmylee)
//Ten cells side by side, white digits with a 1px black outline, so a number reads on the white floor and
//on the water alike. Row 0 is the texture's bottom.
export function createDamageDigits() {
  const data = new Uint8Array(CELL_W * 10 * CELL_H * 4);
  for (let digit = 0; digit < 10; digit++) {
    for (let y = 0; y < CELL_H; y++) {
      for (let x = 0; x < CELL_W; x++) {
        const gx = x - 1;
        const gy = y - 1;
        let edge = false;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) edge ||= glyphAt(digit, gx + dx, gy + dy);
        const target = ((CELL_H - 1 - y) * CELL_W * 10 + digit * CELL_W + x) * 4;
        const fill = glyphAt(digit, gx, gy) ? 255 : 0;
        data[target] = fill;
        data[target + 1] = fill;
        data[target + 2] = fill;
        data[target + 3] = edge ? 255 : 0;
      }
    }
  }
  const texture = new THREE.DataTexture(data, CELL_W * 10, CELL_H, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

//NOTE(@jimmylee)
//One quad per digit of DAMAGE_COUNTER, in art pixels around the number's center.
export function createDamageGeometry() {
  const count = DIGIT_ORDER.length;
  const left = -(count * ADVANCE + 1) / 2;
  const positions = [];
  const uvs = [];
  const orders = [];
  const indices = [];
  DIGIT_ORDER.forEach((digit, order) => {
    const x0 = left + order * ADVANCE;
    const y0 = -CELL_H / 2;
    const base = order * 4;
    positions.push(x0, y0, 0, x0 + CELL_W, y0, 0, x0, y0 + CELL_H, 0, x0 + CELL_W, y0 + CELL_H, 0);
    uvs.push(digit / 10, 0, (digit + 1) / 10, 0, digit / 10, 1, (digit + 1) / 10, 1);
    orders.push(order, order, order, order);
    indices.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('order', new THREE.Float32BufferAttribute(orders, 1));
  geometry.setIndex(indices);
  return geometry;
}

const COUNTER_VERTEX_SHADER = /* glsl */ `
  uniform float hops[DIGITS];
  attribute float order;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    float hop = hops[int(order)];
    vec4 view = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    view.xy += vec2(position.x, position.y + ANCHOR + hop) * vec2(PX_X, PX_Y);
    gl_Position = hop < 0.0 ? vec4(2.0, 2.0, 2.0, 1.0) : projectionMatrix * view;
  }
`;

const COUNTER_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D digits;
  varying vec2 vUv;

  void main() {
    vec4 texel = texture2D(digits, vUv);
    if (texel.a < 0.5) discard;
    gl_FragColor = vec4(texel.rgb, 1.0);
  }
`;

//NOTE(@jimmylee)
//Drawn after every sprite layer, over anything in front of the unit. `resources` holds the shared
//digits and geometry.
const COUNTER_RENDER_ORDER = 10;

export function createDamageCounter(resources, scene) {
  const hops = new Float32Array(DIGIT_ORDER.length);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    defines: { DIGITS: DIGIT_ORDER.length, ANCHOR: COUNTER_ANCHOR_PX.toFixed(1), PX_X: PX_X.toFixed(4), PX_Y: PX_Y.toFixed(4) },
    uniforms: { digits: { value: resources.damageDigits }, hops: { value: hops } },
    vertexShader: COUNTER_VERTEX_SHADER,
    fragmentShader: COUNTER_FRAGMENT_SHADER,
  });
  const mesh = new THREE.Mesh(resources.damageGeometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = COUNTER_RENDER_ORDER;
  mesh.visible = false;
  scene.add(mesh);
  let shownAt = 0;

  return {
    mesh,
    show(now, position) {
      shownAt = now;
      mesh.position.copy(position);
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
    update(now, position) {
      if (!mesh.visible) return;
      const ticks = ((now - shownAt) * 60) / 1000;
      if (ticks >= COUNTER_TICKS) {
        mesh.visible = false;
        return;
      }
      mesh.position.copy(position);
      for (let i = 0; i < hops.length; i++) hops[i] = counterHop(ticks, i);
    },
  };
}
