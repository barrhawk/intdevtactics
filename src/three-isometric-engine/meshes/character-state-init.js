//NOTE(jimmylee)
//Single-point-of-entry for character descriptor construction. Every
//character-group factory routes through this helper so the descriptor
//contract — `lastStep`/`lastFrame` sentinels, the default `state`, and the
//`action: null` field — is owned by one file. When a new universal field is added to the descriptor it lands in
//every mode in a single edit. Mode-specific fields go through `extras`.

import { State } from '@engine/actions/character-state';

export function createCharacterState({
  mode,
  directionOffset,
  walkStart,
  billboardHeight,
  state,
  extras,
}) {
  const ch = {
    directionOffset,
    mode,
    walkStart,
    billboardHeight,
    lastStep: -1,
    lastFrame: -1,
    state: state ?? State.FALLING,
    action: null,
  };
  if (extras) Object.assign(ch, extras);
  return ch;
}
