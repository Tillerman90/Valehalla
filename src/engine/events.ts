// The event queue. Every timed thing in the game is an event with a game-time
// stamp, kept sorted so catch-up can replay them strictly in order.

import type { GameEvent, GameState } from './types';

type NewEvent = GameEvent extends infer E ? (E extends GameEvent ? Omit<E, 'id'> : never) : never;

export function scheduleEvent(state: GameState, event: NewEvent): GameEvent {
  const full = { ...event, id: state.nextId++ } as GameEvent;
  // Binary search for the first event that sorts after this one. New ids are
  // always the largest, so ties on time keep the order they were scheduled in.
  let lo = 0;
  let hi = state.events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (state.events[mid]!.at <= full.at) lo = mid + 1;
    else hi = mid;
  }
  state.events.splice(lo, 0, full);
  return full;
}

export function removeEvents(state: GameState, match: (event: GameEvent) => boolean): number {
  const before = state.events.length;
  state.events = state.events.filter((e) => !match(e));
  return before - state.events.length;
}

export function nextEventAt(state: GameState): number | null {
  return state.events.length > 0 ? state.events[0]!.at : null;
}
