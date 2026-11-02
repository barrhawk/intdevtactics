//NOTE(@jimmylee)
//Single registration surface for character modes. `registerCharacterMode` plugs a mode factory into
//the dispatch table createCharacter reads, and stamps its 4 arrow symbols. Every group-*.js file calls
//it at module load, so adding a mode is a single-file edit.

import * as Constants from '@engine/constants';

const _meshDataMap = {};
const _characterModeFactories = {};

//NOTE(jimmylee)
//Registers a single symbol's meshData and its directionalMap entry.
export function registerBlockType({ symbol, meshData, direction, directionalType }) {
  if (meshData) {
    _meshDataMap[symbol] = meshData;
  }
  if (direction && directionalType) {
    Constants.directionalMap[symbol] = { direction, type: directionalType };
  }
}

//NOTE(jimmylee)
//Direction arrows for character symbols.
const ARROWS = ['↓', '↑', '→', '←'];
const ARROW_DIRECTIONS = { '↓': 'SE', '↑': 'NW', '→': 'SW', '←': 'NE' };
const CHARACTER_MESH_DATA = { mass: 3, shape: 'CUSTOM_CHARACTER' };

//NOTE(jimmylee)
//Registers a character mode.
//Stores the factory for mode dispatch in createCharacter. By default also adds
//4 directional symbols (↓X, ↑X, →X, ←X) to meshData + directionalMap — pass
//`{ directional: false }` for standalone modes (e.g. 'A1') whose symbol is
//registered through a separate `registerBlockType({ symbol, meshData })` call.
export function registerCharacterMode(mode, factory, { directional = true } = {}) {
  _characterModeFactories[mode] = factory;
  if (!directional) return;
  for (const arrow of ARROWS) {
    const symbol = `${arrow}${mode}`;
    _meshDataMap[symbol] = CHARACTER_MESH_DATA;
    Constants.directionalMap[symbol] = { direction: ARROW_DIRECTIONS[arrow], type: 'character', mode };
  }
}

//NOTE(jimmylee)
//Gets the factory function for a character mode (returns null if not registered).
export function getCharacterModeFactory(mode) {
  return _characterModeFactories[mode] || null;
}

//NOTE(jimmylee)
//Gets meshData for a symbol.
export function getMeshData(symbol) {
  return _meshDataMap[symbol] || null;
}

//NOTE(jimmylee)
//Returns the full registered meshData map.
export function getAllMeshData() {
  return { ..._meshDataMap };
}
