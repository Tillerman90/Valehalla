// City plans. A plan keeps a city's build queue full without the player
// opening the app: whenever a slot is free it orders its next building, and
// when it cannot afford that yet it works out when it will and comes back.
// This is the main thing that stops a large empire turning into chores.

import {
  HOUR,
  JOB_BUILDING,
  PLAN_DEFS,
  PLAN_RECHECK_MAX_MS,
  PLAN_RECHECK_MIN_MS,
  storageCap,
  upgradeCost,
} from './content';
import { canAfford, nextTargetLevel, placeOrder, queueHasRoom, upgradeable } from './build';
import { cityRates } from './economy';
import { removeEvents, scheduleEvent } from './events';
import { BUILDINGS, RESOURCES } from './types';
import type { BuildingId, City, GameState, Resources } from './types';

export interface Wish {
  building: BuildingId;
  score: number;
}

/** Order buildings by how far each is behind where the lead table wants it. Lowest score first. */
export function rankWishes(city: City, lead: Record<BuildingId, number>): Wish[] {
  return upgradeable(city)
    .map((b) => ({ building: b, score: nextTargetLevel(city, b) - lead[b] }))
    .sort((x, y) => x.score - y.score || BUILDINGS.indexOf(x.building) - BUILDINGS.indexOf(y.building));
}

/**
 * If waiting alone will never pay for this building, return the building
 * that has to come first: a bigger Storehouse when the price is more than the
 * city can hold, or the job building for a resource the city has no income of.
 * Returns the building itself when nothing stands in its way, and null when
 * it is stuck for a reason building cannot fix.
 */
export function clearTheWay(state: GameState, city: City, building: BuildingId, depth = 0): BuildingId | null {
  const cost = upgradeCost(building, nextTargetLevel(city, building));
  const available = upgradeable(city);
  if (RESOURCES.some((r) => cost[r] > storageCap(city.levels.storehouse))) {
    if (building === 'storehouse' || depth >= 3 || !available.includes('storehouse')) return null;
    return clearTheWay(state, city, 'storehouse', depth + 1);
  }
  const rates = cityRates(state, city);
  const starved = RESOURCES.find((r) => cost[r] > city.resources[r] && rates[r] <= 0);
  if (starved) {
    const source = JOB_BUILDING[starved];
    // Only a missing building can be fixed here. An existing one with nobody
    // working in it is the player's choice of jobs.
    if (city.levels[source] > 0 || source === building || depth >= 3 || !available.includes(source)) return null;
    return clearTheWay(state, city, source, depth + 1);
  }
  return building;
}

/** What the city's plan wants to order next, or null if it has nothing it can work towards. */
export function planChoice(state: GameState, city: City): BuildingId | null {
  if (!city.plan) return null;
  for (const wish of rankWishes(city, PLAN_DEFS[city.plan].lead)) {
    const choice = clearTheWay(state, city, wish.building);
    if (choice) return choice;
  }
  return null;
}

/** Milliseconds until the city can pay this cost at current income, or null if it never will. */
export function timeToAfford(state: GameState, city: City, cost: Resources): number | null {
  const rates = cityRates(state, city);
  let worst = 0;
  for (const r of RESOURCES) {
    const need = cost[r] - city.resources[r];
    if (need <= 0) continue;
    if (rates[r] <= 0) return null;
    worst = Math.max(worst, (need / rates[r]) * HOUR);
  }
  return worst;
}

function clearPlanCheck(state: GameState, city: City): void {
  if (city.planCheckAt === null) return;
  removeEvents(state, (e) => e.type === 'planCheck' && e.cityId === city.id);
  city.planCheckAt = null;
}

/**
 * Let the plan fill any free queue slots. Call whenever a slot frees up or
 * the city's resources or plan change. The economy must be settled to now.
 */
export function runPlan(state: GameState, city: City, now: number): void {
  clearPlanCheck(state, city);
  if (!city.plan) return;
  while (queueHasRoom(city)) {
    const choice = planChoice(state, city);
    if (!choice) return;
    const cost = upgradeCost(choice, nextTargetLevel(city, choice));
    if (canAfford(city, cost)) {
      placeOrder(state, city, choice, now, true);
      continue;
    }
    const wait = timeToAfford(state, city, cost);
    if (wait === null) return;
    // Income can rise before then (new villagers), so never sleep too long,
    // and never so briefly that rounding makes the plan spin.
    const delay = Math.min(PLAN_RECHECK_MAX_MS, Math.max(PLAN_RECHECK_MIN_MS, Math.ceil(wait)));
    city.planCheckAt = now + delay;
    scheduleEvent(state, { at: city.planCheckAt, type: 'planCheck', cityId: city.id });
    return;
  }
}
