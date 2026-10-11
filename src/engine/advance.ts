// The game clock and catch-up. The world runs on game time, which follows the
// wall clock while you play and for up to 12 hours after you leave, then
// stops. Opening the app replays every event that came due, strictly in order.

import { AWAY_CAP_MS, GROWTH_PULSE_MS, HOUR, populationCap, villagersPerHour } from './content';
import { findCity, startNextBuild } from './build';
import { ensureGrowth, refreshJobs, settleAll } from './economy';
import { runPlan } from './plan';
import type { AdvanceReport, GameEvent, GameState } from './types';

export function emptyReport(): AdvanceReport {
  return {
    wallElapsedMs: 0,
    gameElapsedMs: 0,
    frozenMs: 0,
    clockWentBackwards: false,
    gained: {},
    wasted: {},
    villagersArrived: {},
    builds: [],
  };
}

function applyEvent(state: GameState, event: GameEvent, report: AdvanceReport): void {
  const city = findCity(state, event.cityId);
  if (!city) return;
  switch (event.type) {
    case 'buildComplete': {
      const head = city.queue[0];
      if (!head || head.id !== event.queueItemId) return; // order was cancelled
      city.queue.shift();
      city.levels[head.building] = head.targetLevel;
      state.stats.buildsCompleted += 1;
      report.builds.push({
        cityId: city.id,
        building: head.building,
        level: head.targetLevel,
        at: event.at,
        byPlan: head.byPlan,
      });
      refreshJobs(city);
      ensureGrowth(state, city, event.at);
      // The next order starts the instant this one finished, not when you open the app.
      startNextBuild(state, city, event.at);
      runPlan(state, city, event.at);
      return;
    }
    case 'villagerGrowth': {
      city.growthAt = null;
      const cap = populationCap(city.levels.farm);
      const arriving = (villagersPerHour(city.levels.farm) * GROWTH_PULSE_MS) / HOUR + city.villagerCarry;
      const whole = Math.min(Math.floor(arriving), Math.max(0, cap - city.villagers));
      city.villagers += whole;
      city.villagerCarry = city.villagers >= cap ? 0 : arriving - Math.floor(arriving);
      if (whole > 0) {
        report.villagersArrived[city.id] = (report.villagersArrived[city.id] ?? 0) + whole;
        refreshJobs(city);
      }
      ensureGrowth(state, city, event.at);
      return;
    }
    case 'planCheck': {
      city.planCheckAt = null;
      runPlan(state, city, event.at);
      return;
    }
  }
}

/** Run the world forward to an exact game time, replaying events in order. */
export function runUntil(state: GameState, target: number, report: AdvanceReport = emptyReport()): AdvanceReport {
  while (state.events.length > 0 && state.events[0]!.at <= target) {
    const event = state.events.shift()!;
    settleAll(state, event.at, report);
    state.clock.gameTime = event.at;
    applyEvent(state, event, report);
  }
  settleAll(state, target, report);
  state.clock.gameTime = target;
  return report;
}

/**
 * Bring the world up to the present wall-clock time.
 *
 * Game time advances by the wall time that passed, capped at 12 hours per
 * call. While the app is open this is called every second so the cap never
 * bites. After a long absence the extra time simply does not happen: rivals,
 * builds, marches and scheduled sends all wait, and pick up where they left
 * off.
 */
export function advance(state: GameState, wallNow: number): AdvanceReport {
  const report = emptyReport();
  let wallElapsed = wallNow - state.clock.lastWall;
  if (wallElapsed < 0) {
    // The phone's clock moved backwards (time zone, manual change). Never
    // rewind the world; just re-anchor to the new time.
    report.clockWentBackwards = true;
    wallElapsed = 0;
  }
  const gameElapsed = Math.min(wallElapsed, AWAY_CAP_MS);
  report.wallElapsedMs = wallElapsed;
  report.gameElapsedMs = gameElapsed;
  report.frozenMs = wallElapsed - gameElapsed;
  runUntil(state, state.clock.gameTime + gameElapsed, report);
  state.clock.lastWall = wallNow;
  state.clock.frozenMs += report.frozenMs;
  return report;
}

/** The wall-clock moment a game-time stamp will arrive, if you check in before the freeze. */
export function wallTimeOf(state: GameState, gameTime: number): number {
  return state.clock.lastWall + (gameTime - state.clock.gameTime);
}
