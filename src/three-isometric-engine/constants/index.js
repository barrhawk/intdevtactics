//NOTE(jimmylee)
//Core constants: sizes, directions, and symbol-to-direction mappings.

export const cubeSize = 32;
export const sphereRadius = 10;

//NOTE(jimmylee)
//Visual facing maps — symbol → direction for mesh Y-rotation.
//Every map below answers "which way does this block face?" for rendering.
//Behavioral effects (e.g. walking direction) live in their action files, not here.

//NOTE(jimmylee)
//Direction → rotation step offset for character sprites. Maps the 4 cardinal
//directions to one of the 8 camera rotation steps, determining which sprite
//pattern (A/B/C/D) to display. Used by createCharacter.js for initial facing.
export const DIRECTION_OFFSETS = { NE: 7, SE: 1, SW: 3, NW: 5 };

//NOTE(jimmylee)
//Consolidated directional map: symbol → { direction, type }.
//registerCharacterMode adds the 4 arrow symbols of every mode at module load.
export const directionalMap = {
  A1: { direction: 'SE', type: 'character', mode: 'A1' },
};

//NOTE(jimmylee)
//Coordinate offsets for each direction.
export const directionCoordinates = {
  x: {
    SE: 1,
    SW: 0,
    NW: -1,
    NE: 0,
  },
  z: {
    SE: 0,
    SW: 1,
    NW: 0,
    NE: -1,
  },
};
