//NOTE(jimmylee)
//Character state machine — pure data and validation. Zero rendering or physics imports.
//Two enums: State (lifecycle) and ActionType (behavior identity).
//transition() validates against the transition graph and clears ch.action for Priority States.

export const State = {
  SPAWNING: 'SPAWNING',
  FALLING: 'FALLING',
  IDLE: 'IDLE',
  KNOCKBACK: 'KNOCKBACK',
  KNEELING: 'KNEELING',
  CRITICALLY_HURT: 'CRITICALLY_HURT',
  DEAD: 'DEAD',
};

export const ActionType = {
  CATCH: 'CATCH',
  JUMP: 'JUMP',
  THROW: 'THROW',
  PUNCH: 'PUNCH',
  QUICK_THROW: 'QUICK_THROW',
  CAST: 'CAST',
};

export const VALID_TRANSITIONS = {
  [State.SPAWNING]: [State.FALLING],
  [State.FALLING]: [State.SPAWNING, State.IDLE, State.KNOCKBACK, State.KNEELING, State.DEAD],
  [State.IDLE]: [State.FALLING, State.KNOCKBACK, State.KNEELING, State.DEAD],
  [State.KNOCKBACK]: [State.FALLING, State.CRITICALLY_HURT, State.DEAD],
  [State.KNEELING]: [State.IDLE, State.CRITICALLY_HURT, State.KNOCKBACK, State.DEAD],
  [State.CRITICALLY_HURT]: [State.KNOCKBACK, State.DEAD],
  [State.DEAD]: [],
};

const PRIORITY_STATES = new Set([State.KNOCKBACK, State.KNEELING, State.CRITICALLY_HURT, State.DEAD]);

export function canTransition(ch, target) {
  return VALID_TRANSITIONS[ch.state]?.includes(target) ?? false;
}

export function transition(ch, target) {
  if (!canTransition(ch, target)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[character-state] Invalid transition: ${ch.state} → ${target}`);
    }
    return false;
  }
  if (PRIORITY_STATES.has(target) && ch.action !== null) ch.action = null;
  ch.state = target;
  return true;
}
