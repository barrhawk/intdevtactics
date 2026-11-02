//NOTE(jimmylee)
//Action timing — idle dwell between proactive character actions.
//Canonical timing module for Action-tier (Tier 3) behaviors.
//
//Three-tier character behavior model:
//  Tier 1 — Priority Events: involuntary, interrupt everything (knockback, death).
//  Tier 2 — Reactions: immediate response to stimulus, no idle dwell (a catch).
//  Tier 3 — Actions: proactive, require cooldown + idle dwell (TS throw, C cast, J jump).
//
//computeActionReadyAt(doneAt, cooldownMs) returns the timestamp at which a Tier 3
//character becomes ready to act: cooldown + ACTION_IDLE_DWELL_MS.
//The idle dwell creates a visible pause between action cycles where the character
//is clearly doing nothing before choosing to act again.

//NOTE(jimmylee)
//Idle dwell (ms) added after the mechanical cooldown expires.
const ACTION_IDLE_DWELL_MS = 400;

//NOTE(jimmylee)
//Returns the timestamp at which a character becomes ready to take its next action.
//doneAt: when the previous action completed (ctx.now shared frame timestamp).
//cooldownMs: mechanical minimum between actions (mode-specific constant).
//Result includes cooldown + ACTION_IDLE_DWELL_MS.
export function computeActionReadyAt(doneAt, cooldownMs) {
  return doneAt + cooldownMs + ACTION_IDLE_DWELL_MS;
}
