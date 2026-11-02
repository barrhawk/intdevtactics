//NOTE(jimmylee)
//Behavior tier definitions and gating predicates.
//
//Every character behavior belongs to exactly one of three tiers that determine
//interrupt precedence, timing semantics, and recovery rules. The demo stage uses
//ACTION; the other two tiers are the contract for a game built on this engine:
//
//  PRIORITY_EVENT (Tier 1) — Involuntary state changes that supersede everything.
//    The character has no choice. Examples: knockback, death, landing kneel.
//    A Priority Event interrupts any in-progress Action or Reaction immediately.
//    A Priority Event can only be superseded by another Priority Event.
//
//  REACTION (Tier 2) — Immediate responses to external stimuli.
//    Fire as soon as the character is able — no idle dwell, no cooldown.
//    Example: a unit that catches a thrown marble.
//    A Reaction can be interrupted by a Priority Event but not by an Action.
//
//  ACTION (Tier 3) — Proactive behaviors the character chooses to perform.
//    Require mechanical cooldown + idle dwell (ACTION_IDLE_DWELL_MS) so the
//    character visibly "decides" before acting. Examples: TS throw stone,
//    C magic cast, J jump. Actions can be interrupted by Priority Events
//    and preempted by Reactions.

import { State } from '@engine/actions/character-state';

export const PRIORITY_EVENT = 1;
export const REACTION = 2;
export const ACTION = 3;

//NOTE(jimmylee)
//Centralized gating predicate. Returns true if a character can accept a
//behavior at the given tier. Each tier inherits the constraints of higher
//tiers — an Action must pass all Reaction gates plus its own.
//
//Priority Events always fire (they ARE the interrupts). The only gate is
//that dead characters cannot experience further Priority Events (they're
//already in a terminal state).
//
//Reactions require the character to be in IDLE or FALLING state with no
//active action.
//
//Actions require IDLE state (grounded) with no active action.
//
//Mode-specific checks (ch.action type, capacity limits, etc.) are
//NOT included here — those belong in the per-mode module.
export function canAct(ch, tier) {
  if (ch.state === State.DEAD) return false;

  switch (tier) {
    case PRIORITY_EVENT:
      return true;
    case REACTION:
      return (ch.state === State.IDLE || ch.state === State.FALLING) && ch.action === null;
    case ACTION:
      return ch.state === State.IDLE && ch.action === null;
    default:
      return false;
  }
}

//NOTE(jimmylee)
//Returns true if the character's action cooldown + idle dwell has elapsed.
//Only meaningful for Action-tier behaviors. Reactions and Priority Events
//do not use actionReadyAt.
export function isActionReady(ch, now) {
  return now >= ch.actionReadyAt;
}
