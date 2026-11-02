//NOTE(@jimmylee)
//Shared GPU geometry for repeated sprite planes. A repeated geometry skips the buffer upload, the VAO
//and the vertex-array bind. Entries are immutable and live as long as the page, flagged
//`userData.shared`, so a removed character does not force the survivors to re-upload. One buffer set
//per shape, so the retained memory is bounded.
const _geometryCache = new Map();

export function getSharedGeometry(key, build) {
  let geometry = _geometryCache.get(key);
  if (!geometry) {
    geometry = build();
    geometry.userData.shared = true;
    _geometryCache.set(key, geometry);
  }
  return geometry;
}
