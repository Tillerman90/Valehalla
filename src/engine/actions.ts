// Everything the player (or a bot) can do. Actions take effect at the current
// game time, so the caller advances the world to "now" first.

import { buildBlocker, findCity, placeOrder, startNextBuild } from './build';
import { clampJobs, jobSlots, refreshJobs, settleAll } from './economy';
import { removeEvents } from './events';
import { runPlan } from './plan';
import { RESOURCES } from './types';
import type { ActionFailure, ActionResult, BuildingId, GameState, PlanId, Resources } from './types';

const fail = (reason: ActionFailure): ActionResult => ({ ok: false, reason });
const OK: ActionResult = { ok: true };

export function queueBuild(state: GameState, cityId: number, building: BuildingId): ActionResult {
  const city = findCity(state, cityId);
  if (!city) return fail('no-such-city');
  const now = state.clock.gameTime;
  settleAll(state, now);
  const blocker = buildBlocker(city, building);
  if (blocker) return fail(blocker);
  placeOrder(state, city, building, now, false);
  refreshJobs(city);
  // The player just spent resources the plan may have been counting on.
  runPlan(state, city, now);
  return OK;
}

/**
 * Cancel an order and refund it in full. Later orders for the same building
 * are cancelled with it, because they were priced as the levels above it.
 * Cancelling one of the plan's own orders pauses the plan, otherwise it would
 * simply place the same order again.
 */
export function cancelBuild(state: GameState, cityId: number, queueItemId: number): ActionResult {
  const city = findCity(state, cityId);
  if (!city) return fail('no-such-city');
  const index = city.queue.findIndex((q) => q.id === queueItemId);
  if (index < 0) return fail('no-such-order');
  const now = state.clock.gameTime;
  settleAll(state, now);
  const target = city.queue[index]!;
  const removed = city.queue.filter((q, i) => i >= index && q.building === target.building);
  const removedIds = new Set(removed.map((q) => q.id));
  city.queue = city.queue.filter((q) => !removedIds.has(q.id));
  for (const item of removed) for (const r of RESOURCES) city.resources[r] += item.cost[r];
  removeEvents(state, (e) => e.type === 'buildComplete' && removedIds.has(e.queueItemId));
  if (target.byPlan) city.plan = null;
  startNextBuild(state, city, now);
  refreshJobs(city);
  runPlan(state, city, now);
  return OK;
}

/** Choose the city's plan, or null to build by hand. */
export function setPlan(state: GameState, cityId: number, plan: PlanId | null): ActionResult {
  const city = findCity(state, cityId);
  if (!city) return fail('no-such-city');
  const now = state.clock.gameTime;
  settleAll(state, now);
  city.plan = plan;
  refreshJobs(city);
  runPlan(state, city, now);
  return OK;
}

/** Put villagers on jobs by hand. Turns off automatic assignment for the city. */
export function setJobs(state: GameState, cityId: number, jobs: Resources): ActionResult {
  const city = findCity(state, cityId);
  if (!city) return fail('no-such-city');
  let total = 0;
  for (const r of RESOURCES) {
    const n = jobs[r];
    if (!Number.isInteger(n) || n < 0 || n > jobSlots(city, r)) return fail('invalid-jobs');
    total += n;
  }
  if (total > city.villagers) return fail('invalid-jobs');
  const now = state.clock.gameTime;
  settleAll(state, now);
  city.autoAssign = false;
  city.jobs = { ...jobs };
  clampJobs(city);
  runPlan(state, city, now);
  return OK;
}

export function setAutoAssign(state: GameState, cityId: number, on: boolean): ActionResult {
  const city = findCity(state, cityId);
  if (!city) return fail('no-such-city');
  const now = state.clock.gameTime;
  settleAll(state, now);
  city.autoAssign = on;
  refreshJobs(city);
  runPlan(state, city, now);
  return OK;
}
