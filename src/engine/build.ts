// The build queue: what can be ordered, what it costs, and how orders run one
// after another. Shared by player actions and by city plans.

import { BUILDING_DEFS, MAX_LEVEL, buildDurationMs, queueSlots, upgradeCost } from './content';
import { hasPopulationFor } from './economy';
import { scheduleEvent } from './events';
import { BUILDINGS, RESOURCES } from './types';
import type { ActionFailure, BuildingId, City, GameState, QueueItem, Resources } from './types';

export function findCity(state: GameState, cityId: number): City | undefined {
  return state.cities.find((c) => c.id === cityId);
}

export function canAfford(city: City, cost: Resources): boolean {
  return RESOURCES.every((r) => city.resources[r] >= cost[r]);
}

/** The level the next order for this building would produce, counting orders already queued. */
export function nextTargetLevel(city: City, building: BuildingId): number {
  const queued = city.queue.filter((q) => q.building === building).length;
  return city.levels[building] + queued + 1;
}

export function requirementsMet(city: City, building: BuildingId): boolean {
  const requires = BUILDING_DEFS[building].requires;
  return BUILDINGS.every((b) => city.levels[b] >= (requires[b] ?? 0));
}

/** Buildings that could still be ordered at some point: unlocked and below the level cap. */
export function upgradeable(city: City): BuildingId[] {
  return BUILDINGS.filter((b) => nextTargetLevel(city, b) <= MAX_LEVEL && requirementsMet(city, b));
}

export function queueHasRoom(city: City): boolean {
  return city.queue.length < queueSlots(city.levels.keep);
}

/** Why an upgrade cannot be ordered right now, or null if it can. */
export function buildBlocker(city: City, building: BuildingId): ActionFailure | null {
  const target = nextTargetLevel(city, building);
  if (target > MAX_LEVEL) return 'max-level';
  if (!requirementsMet(city, building)) return 'requirements';
  if (!queueHasRoom(city)) return 'queue-full';
  if (!hasPopulationFor(city, building, target)) return 'farm-too-small';
  if (!canAfford(city, upgradeCost(building, target))) return 'cannot-afford';
  return null;
}

/** Start the order at the head of the queue, if it is not already running. */
export function startNextBuild(state: GameState, city: City, now: number): void {
  const head = city.queue[0];
  if (!head || head.startedAt !== null) return;
  head.startedAt = now;
  head.completesAt = now + buildDurationMs(head.building, head.targetLevel, city.levels.keep);
  scheduleEvent(state, { at: head.completesAt, type: 'buildComplete', cityId: city.id, queueItemId: head.id });
}

/** Pay for an order and add it to the queue. The caller has already checked it is allowed. */
export function placeOrder(
  state: GameState,
  city: City,
  building: BuildingId,
  now: number,
  byPlan: boolean,
): QueueItem {
  const targetLevel = nextTargetLevel(city, building);
  const cost = upgradeCost(building, targetLevel);
  for (const r of RESOURCES) city.resources[r] -= cost[r];
  const item: QueueItem = {
    id: state.nextId++,
    building,
    targetLevel,
    cost,
    byPlan,
    startedAt: null,
    completesAt: null,
  };
  city.queue.push(item);
  startNextBuild(state, city, now);
  return item;
}

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
