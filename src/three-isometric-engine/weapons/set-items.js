//NOTE(@jimmylee)
//Reads the models Set lends the main route (public/static/models/set-items.glb, baked from Set by
//scripts/bake-set-items). Nothing here imports three.js, and the file holds nothing a GLB reader has to
//interpret: one mesh per item with positions, normals, vertex colors and indices, in its node's name.
//
//An item's frame: the hand at the origin, +x along the item, +y its up, +z across it, in Set's units.

export const SET_ITEMS_FILE = 'set-items.glb';

const GLB_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;

function accessorArray(gltf, binary, accessor, Type, size) {
  const view = gltf.bufferViews[accessor.bufferView];
  return new Type(binary.buffer.slice(binary.byteOffset + view.byteOffset, binary.byteOffset + view.byteOffset + accessor.count * size * Type.BYTES_PER_ELEMENT));
}

//NOTE(@jimmylee)
//`buffer` is the file's ArrayBuffer. Returns { [name]: { position, normal, color, index, muzzle, bore, length } },
//`muzzle` the [x, y, z] a gun fires from, on the axis of its barrel, which runs along +x, `bore` the radius
//of that opening and `length` how far the item reaches along +x from the hand.
export function readSetItems(buffer) {
  const header = new DataView(buffer);
  const jsonBytes = header.getUint32(GLB_HEADER_BYTES, true);
  const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, GLB_HEADER_BYTES + CHUNK_HEADER_BYTES, jsonBytes)));
  const binary = new Uint8Array(buffer, GLB_HEADER_BYTES + CHUNK_HEADER_BYTES + jsonBytes + CHUNK_HEADER_BYTES);
  const items = {};
  for (const node of gltf.nodes) {
    const { attributes, indices } = gltf.meshes[node.mesh].primitives[0];
    const place = gltf.accessors[attributes.POSITION];
    items[node.name] = {
      position: accessorArray(gltf, binary, place, Float32Array, 3),
      normal: accessorArray(gltf, binary, gltf.accessors[attributes.NORMAL], Float32Array, 3),
      color: accessorArray(gltf, binary, gltf.accessors[attributes.COLOR_0], Uint8Array, 4),
      index: accessorArray(gltf, binary, gltf.accessors[indices], Uint16Array, 1),
      muzzle: node.extras?.muzzle ?? null,
      bore: node.extras?.bore ?? 0,
      length: place.max[0],
    };
  }
  return items;
}
