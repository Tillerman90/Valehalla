// Production, storage and villagers. Rates only change at events, so between
// events income is a straight line and can be settled in one step however
// long the gap is. That is what makes catching up after 12 hours instant.

import {
  GROWTH_PULSE_MS,
  HOUR,
  JOB_BUILDING,
  TRAIT_YIELD,
  YIELD_PER_HOUR,
  incomeCap,
  populationCap,
  storageCap,
  workerSlots,
} from './content';
import { scheduleEvent } from './events';
import { RESOURCES, zeroResources } from './types';
import type { AdvanceReport, City, GameState, ResourceId, Resources } from './types';

export function jobSlots(city: City, resource: ResourceId): number {
  return workerSlots(city.levels[JOB_BUILDING[resource]]);
}

export function assignedVillagers(city: City): number {
  return city.jobs.food + city.jobs.timber + city.jobs.metal + city.jobs.wealth;
}

function traitMultiplier(city: City, resource: ResourceId): number {
  let m = 1;
  for (const trait of city.traits) m *= TRAIT_YIELD[trait][resource] ?? 1;
  return m;
}

/** Hourly production of one city before the empire income cap. */
export function rawRates(city: City): Resources {
  const out = zeroResources();
  for (const r of RESOURCES) out[r] = city.jobs[r] * YIELD_PER_HOUR[r] * traitMultiplier(city, r);
  return out;
}

export interface EmpireIncome {
  /** Ceiling on each resource's hourly income across the owner's cities. */
  cap: number;
  raw: Resources;
  /** 1 when under the cap, below 1 when production is being held back. */
  factor: Resources;
}

export function empireIncome(state: GameState, owner: string): EmpireIncome {
  const raw = zeroResources();
  let markets = 0;
  for (const city of state.cities) {
    if (city.owner !== owner) continue;
    markets += city.levels.market;
    const rates = rawRates(city);
    for (const r of RESOURCES) raw[r] += rates[r];
  }
  const cap = incomeCap(markets);
  const factor = zeroResources();
  for (const r of RESOURCES) factor[r] = raw[r] > cap ? cap / raw[r] : 1;
  return { cap, raw, factor };
}

/** Hourly production of one city after the empire income cap. */
export function cityRates(state: GameState, city: City): Resources {
  const { factor } = empireIncome(state, city.owner);
  const rates = rawRates(city);
  for (const r of RESOURCES) rates[r] *= factor[r];
  return rates;
}

/** Bring every city's stockpile up to date. Call before anything changes a rate. */
export function settleAll(state: GameState, to: number, report?: AdvanceReport): void {
  const dt = to - state.settledAt;
  if (dt <= 0) return;
  const incomes = new Map<string, EmpireIncome>();
  for (const city of state.cities) {
    let income = incomes.get(city.owner);
    if (!income) {
      income = empireIncome(state, city.owner);
      incomes.set(city.owner, income);
    }
    const cap = storageCap(city.levels.storehouse);
    const rates = rawRates(city);
    for (const r of RESOURCES) {
      const produced = (rates[r] * income.factor[r] * dt) / HOUR;
      if (produced <= 0) continue;
      const before = city.resources[r];
      // A refund can leave a stockpile above the cap. It is never taken away,
      // it just stops growing until it is spent down.
      const after = before >= cap ? before : Math.min(cap, before + produced);
      city.resources[r] = after;
      if (report) {
        (report.gained[city.id] ??= zeroResources())[r] += after - before;
        (report.wasted[city.id] ??= zeroResources())[r] += produced - (after - before);
      }
    }
  }
  state.settledAt = to;
}

/**
 * Spread villagers evenly across the four jobs, respecting each building's
 * slots. Anyone left over when every slot is full stays idle.
 */
export function autoAssign(city: City): void {
  const slots = zeroResources();
  for (const r of RESOURCES) slots[r] = jobSlots(city, r);
  const jobs = zeroResources();
  let left = city.villagers;
  let open: ResourceId[] = RESOURCES.filter((r) => slots[r] > 0);
  while (left > 0 && open.length > 0) {
    const share = Math.floor(left / open.length);
    if (share === 0) {
      // Fewer villagers than open jobs: hand them out one each, in a fixed order.
      for (const r of open) {
        if (left === 0) break;
        jobs[r] += 1;
        left -= 1;
      }
      break;
    }
    for (const r of open) {
      const give = Math.min(share, slots[r] - jobs[r]);
      jobs[r] += give;
      left -= give;
    }
    open = open.filter((r) => jobs[r] < slots[r]);
  }
  city.jobs = jobs;
}

/** Pull villagers out of jobs that no longer have room for them. */
export function clampJobs(city: City): void {
  for (const r of RESOURCES) city.jobs[r] = Math.max(0, Math.min(Math.floor(city.jobs[r]), jobSlots(city, r)));
  let over = assignedVillagers(city) - city.villagers;
  while (over > 0) {
    let largest: ResourceId = 'food';
    for (const r of RESOURCES) if (city.jobs[r] > city.jobs[largest]) largest = r;
    city.jobs[largest] -= 1;
    over -= 1;
  }
}

/** Re-apply the city's job policy after villagers or slots change. */
export function refreshJobs(city: City): void {
  if (city.autoAssign) autoAssign(city);
  else clampJobs(city);
}

/** Make sure a growth pulse is pending whenever the city has room to grow. */
export function ensureGrowth(state: GameState, city: City, now: number): void {
  if (city.growthAt !== null) return;
  if (city.villagers >= populationCap(city.levels.farm)) return;
  city.growthAt = now + GROWTH_PULSE_MS;
  scheduleEvent(state, { at: city.growthAt, type: 'villagerGrowth', cityId: city.id });
}
