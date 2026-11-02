import { spawnFadeMs, despawnFadeMs } from '@engine/constants/physics';

const BAYER_GLSL = `
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

export function patchSpawnMaterial(material) {
  const ref = { value: 0.0 };
  material.userData._spawnProgress = ref;

  const prevCompile = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (prevCompile) prevCompile(shader, renderer);

    shader.uniforms.spawnProgress = ref;

    shader.fragmentShader = shader.fragmentShader.replace(
      'void main() {',
      `uniform float spawnProgress;\n${BAYER_GLSL}\nvoid main() {`
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       if (spawnProgress < 1.0) {
         float bayer = spawnBayer4(floor(gl_FragCoord.xy / 2.0));
         if (bayer > spawnProgress) discard;
       }`
    );
  };

  material.customProgramCacheKey = () => 'spawn_bayer';
  material.needsUpdate = true;
  return ref;
}

//NOTE(@jimmylee)
//Materials that write no color have nothing to fade: they would only add a program variant that links
//in the middle of play, and the buffer meshes share one invisible material.
export function patchGroupSpawnMaterials(root) {
  const refs = [];
  root.traverse((child) => {
    if (child.isMesh && child.material && child.material.visible && child.material.colorWrite) {
      refs.push(patchSpawnMaterial(child.material));
    }
  });
  return refs;
}

export function updateSpawnProgress(refs, progress) {
  for (let i = 0; i < refs.length; i++) {
    refs[i].value = progress;
  }
}

export function computeSpawnProgress(spawnStart, now) {
  return Math.min(1.0, (now - spawnStart) / spawnFadeMs);
}

export function computeDespawnProgress(despawnStart, now) {
  return Math.max(0.0, 1.0 - (now - despawnStart) / despawnFadeMs);
}
