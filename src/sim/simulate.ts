// Runs one world from founding for a number of days with a bot at the
// controls, using a simulated wall clock, and records what happened.

import { DAY, HOUR } from '../engine/content';
import { advance } from '../engine/advance';
import { createWorld } from '../engine/world';
import { RESOURCES, zeroResources } from '../engine/types';
import type { GameState, Resources } from '../engine/types';
import { checkIn, isFullyBuilt, totalLevels } from './bots';
import type { Bot } from './bots';

/** A fixed, arbitrary start: midnight, so check-in hours read as hours of the day. */
export const SIM_START_WALL = Date.UTC(2026, 0, 1, 0, 0, 0);

export interface WorldResult {
  seed: string;
  bot: string;
  days: number;
  /** Wall-clock day each milestone was first seen at a check-in. Null if never. */
  keep5Day: number | null;
  keep10Day: number | null;
  courtDay: number | null;
  fullyBuiltDay: number | null;
  /** Total building levels at the end of selected days. */
  levelsAtDay: Record<number, number>;
  checkIns: number;
  /** Check-ins where at least one build had finished since the last one. */
  checkInsWithProgress: number;
  deadEnds: number;
  longestBuildMs: number;
  /** Share of production lost to a full Storehouse, overall and per resource. */
  wastedShare: number;
  wastedByResource: Resources;
  /** Share of wall time the world spent frozen by the 12-hour rule. */
  frozenShare: number;
  buildsCompleted: number;
  finalState: GameState;
}

const SNAPSHOT_DAYS = [1, 3, 7, 14, 21, 28];

export function simulateWorld(seed: string, bot: Bot, days: number): WorldResult {
  const state = createWorld({ seed, wallNow: SIM_START_WALL });
  const city = state.cities[0]!;
  const result: WorldResult = {
    seed,
    bot: bot.name,
    days,
    keep5Day: null,
    keep10Day: null,
    courtDay: null,
    fullyBuiltDay: null,
    levelsAtDay: {},
    checkIns: 0,
    checkInsWithProgress: 0,
    deadEnds: 0,
    longestBuildMs: 0,
    wastedShare: 0,
    wastedByResource: zeroResources(),
    frozenShare: 0,
    buildsCompleted: 0,
    finalState: state,
  };
  const gained = zeroResources();
  const wasted = zeroResources();

  const observe = (wall: number) => {
    const report = advance(state, wall);
    // Stop counting once the city is finished: with nothing left to buy, everything overflows.
    if (result.fullyBuiltDay === null) {
      for (const g of Object.values(report.gained)) for (const r of RESOURCES) gained[r] += g[r];
      for (const w of Object.values(report.wasted)) for (const r of RESOURCES) wasted[r] += w[r];
    }
    return report;
  };

  // The founding session: the player places their first orders straight away.
  checkIn(state, city, bot);

  for (let day = 0; day < days; day++) {
    for (const hour of bot.checkInHours) {
      const wall = SIM_START_WALL + day * DAY + hour * HOUR;
      const report = observe(wall);
      const dayNumber = (wall - SIM_START_WALL) / DAY;
      // Once the city is finished there is nothing left to do, so stop counting sessions.
      if (result.fullyBuiltDay !== null) continue;
      result.checkIns += 1;
      if (report.builds.length > 0) result.checkInsWithProgress += 1;
      if (result.keep5Day === null && city.levels.keep >= 5) result.keep5Day = dayNumber;
      if (result.keep10Day === null && city.levels.keep >= 10) result.keep10Day = dayNumber;
      if (result.courtDay === null && city.levels.court >= 1) result.courtDay = dayNumber;
      if (isFullyBuilt(city)) {
        result.fullyBuiltDay = dayNumber;
        continue;
      }
      const outcome = checkIn(state, city, bot);
      if (outcome.deadEnd) result.deadEnds += 1;
      for (const item of city.queue) {
        if (item.startedAt !== null && item.completesAt !== null) {
          result.longestBuildMs = Math.max(result.longestBuildMs, item.completesAt - item.startedAt);
        }
      }
    }
    const endOfDay = SIM_START_WALL + (day + 1) * DAY;
    if (SNAPSHOT_DAYS.includes(day + 1)) {
      // Read the level count without opening the app: peek at a copy.
      const copy = structuredClone(state);
      advance(copy, endOfDay);
      result.levelsAtDay[day + 1] = totalLevels(copy.cities[0]!);
    }
  }

  result.buildsCompleted = state.stats.buildsCompleted;
  let allGained = 0;
  let allWasted = 0;
  for (const r of RESOURCES) {
    allGained += gained[r];
    allWasted += wasted[r];
    result.wastedByResource[r] = gained[r] + wasted[r] > 0 ? wasted[r] / (gained[r] + wasted[r]) : 0;
  }
  result.wastedShare = allGained + allWasted > 0 ? allWasted / (allGained + allWasted) : 0;
  const wallSpan = state.clock.lastWall - state.clock.createdWall;
  result.frozenShare = wallSpan > 0 ? state.clock.frozenMs / wallSpan : 0;
  return result;
}
