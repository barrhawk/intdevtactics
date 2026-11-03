// NOTE(@jimmylee, @antigravity)
// 4x4 Bayer Ordered-Dither Spawn & Despawn Effect.
//
// Screen-space 4x4 Bayer matrix ordered-dither thresholding for PS1 / FFTA style
// unit materialization, dissolve teleportation, and defeat fading.
//
// At spawnProgress >= 1.0, zero fragments are discarded during normal play.
// In background tabs where requestAnimationFrame throttles, animateSpawnDither uses
// setTimeout(..., 16) steps so animations never freeze or hang.

import { spawnFadeMs, despawnFadeMs } from '@engine/constants/physics';

export const DEFAULT_SPAWN_DURATION_MS = spawnFadeMs || 420;
export const DEFAULT_DESPAWN_DURATION_MS = despawnFadeMs || 380;

export const BAYER_GLSL = /* glsl */ `
float spawnBayer4(vec2 pos) {
  int x = int(mod(floor(pos.x), 4.0));
  int y = int(mod(floor(pos.y), 4.0));
  int idx = x + y * 4;
  float m[16];
  m[0]=0.0; m[1]=8.0; m[2]=2.0; m[3]=10.0;
  m[4]=12.0; m[5]=4.0; m[6]=14.0; m[7]=6.0;
  m[8]=3.0; m[9]=11.0; m[10]=1.0; m[11]=9.0;
  m[12]=15.0; m[13]=7.0; m[14]=13.0; m[15]=5.0;
  float v = 0.0;
  for (int i = 0; i < 16; i++) { if (i == idx) v = m[i]; }
  return v / 16.0;
}
`;

/**
 * Patches a Three.js material with 4x4 Bayer ordered-dither discard logic.
 * Returns a reference object { value: number } representing current progress.
 * @param {THREE.Material} material
 * @returns {{ value: number }}
 */
export function patchSpawnMaterial(material) {
  if (material.userData?._spawnProgress) {
    return material.userData._spawnProgress;
  }
  const ref = { value: 1.0 };
  if (!material.userData) material.userData = {};
  material.userData._spawnProgress = ref;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.spawnProgress = ref;

    if (!shader.fragmentShader.includes('spawnProgress')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `uniform float spawnProgress;\n${BAYER_GLSL}\nvoid main() {`
      );
    }

    if (shader.fragmentShader.includes('#include <dithering_fragment>')) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
       if (spawnProgress < 1.0) {
         float bayer = spawnBayer4(floor(gl_FragCoord.xy / 2.0));
         if (bayer > spawnProgress) discard;
       }`
      );
    } else {
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        `void main() {
       if (spawnProgress < 1.0) {
         float bayer = spawnBayer4(floor(gl_FragCoord.xy / 2.0));
         if (bayer > spawnProgress) discard;
       }`
      );
    }
  };

  const prevCacheKey = typeof material.customProgramCacheKey === 'function'
    ? material.customProgramCacheKey.bind(material)
    : null;
  material.customProgramCacheKey = () => (prevCacheKey ? `${prevCacheKey()}_spawn_bayer` : 'spawn_bayer');
  material.needsUpdate = true;
  return ref;
}

/**
 * Patches all visible color-writing mesh materials in an Object3D hierarchy.
 * @param {THREE.Object3D} root
 * @returns {Array<{ value: number }>}
 */
export function patchGroupSpawnMaterials(root) {
  const refs = [];
  if (!root || typeof root.traverse !== 'function') return refs;

  root.traverse((child) => {
    if (child.isMesh && child.material && child.material.visible !== false && child.material.colorWrite !== false) {
      if (Array.isArray(child.material)) {
        for (const mat of child.material) {
          if (mat) refs.push(patchSpawnMaterial(mat));
        }
      } else {
        refs.push(patchSpawnMaterial(child.material));
      }
    }
  });
  return refs;
}

/**
 * Updates the dither progress value across one or more refs.
 * Progress is clamped to [0.0, 1.0].
 * @param {Array<{ value: number }>|{ value: number }} refs
 * @param {number} progress
 */
export function updateSpawnProgress(refs, progress) {
  if (!refs) return;
  const p = Math.max(0.0, Math.min(1.0, progress));
  if (Array.isArray(refs)) {
    for (let i = 0; i < refs.length; i++) {
      if (refs[i]) refs[i].value = p;
    }
  } else if (refs.value !== undefined) {
    refs.value = p;
  }
}

/**
 * Smoothly animates spawn/despawn Bayer ordered dither on root from fromProgress to toProgress.
 * Uses 16ms setTimeout steps so background tabs never hang or lock up.
 * When toProgress >= 1.0, explicitly ensures spawnProgress settles at 1.0 so zero fragments discard.
 *
 * @param {THREE.Object3D} root
 * @param {number} [fromProgress=0.0]
 * @param {number} [toProgress=1.0]
 * @param {number} [durationMs=420]
 * @returns {Promise<Array<{ value: number }>>}
 */
export function animateSpawnDither(root, fromProgress = 0.0, toProgress = 1.0, durationMs = 420) {
  return new Promise((resolve) => {
    if (!root) {
      resolve([]);
      return;
    }

    const refs = patchGroupSpawnMaterials(root);
    if (!refs.length) {
      resolve(refs);
      return;
    }

    updateSpawnProgress(refs, fromProgress);

    if (durationMs <= 0) {
      const finalVal = toProgress >= 1.0 ? 1.0 : Math.max(0.0, Math.min(1.0, toProgress));
      updateSpawnProgress(refs, finalVal);
      resolve(refs);
      return;
    }

    const startTime = Date.now();
    const step = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(1.0, elapsed / durationMs);
      const cur = fromProgress + (toProgress - fromProgress) * t;
      updateSpawnProgress(refs, cur);

      if (t < 1.0) {
        setTimeout(step, 16);
      } else {
        const finalVal = toProgress >= 1.0 ? 1.0 : Math.max(0.0, Math.min(1.0, toProgress));
        updateSpawnProgress(refs, finalVal);
        resolve(refs);
      }
    };

    setTimeout(step, 16);
  });
}

export function computeSpawnProgress(spawnStart, now) {
  const duration = spawnFadeMs || 420;
  return Math.min(1.0, (now - spawnStart) / duration);
}

export function computeDespawnProgress(despawnStart, now) {
  const duration = despawnFadeMs || 380;
  return Math.max(0.0, 1.0 - (now - despawnStart) / duration);
}
