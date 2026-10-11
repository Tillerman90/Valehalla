// Production, storage and villagers. Rates only change at events, so between
// events income is a straight line and can be settled in one step however
// long the gap is. That is what makes catching up after 12 hours instant.

import {
  GROWTH_PULSE_MS,
  HOUR,
  JOBS_EVEN_SHARE,
  JOBS_LOOK_AHEAD,
  JOB_BUILDING,
  PLAN_DEFS,
  TRAIT_YIELD,
  YIELD_PER_HOUR,
  incomeCap,
  populationCap,
  storageCap,
  upgradeCost,
  workerSlots,
} from './content';
import { nextTargetLevel, rankWishes } from './build';
import { scheduleEvent } from './events';
import { BUILDINGS, RESOURCES, zeroResources } from './types';
import type { AdvanceReport, BuildingId, City, GameState, ResourceId, Resources } from './types';

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

const NO_LEAD = Object.fromEntries(BUILDINGS.map((b) => [b, 0])) as Record<BuildingId, number>;

/**
 * What the city is short of for the orders it is likely to place next: the
 * next few buildings its plan wants (or, with no plan, its least developed
 * ones), less what is already in the Storehouse.
 */
export function upcomingNeeds(city: City): Resources {
  const lead = city.plan ? PLAN_DEFS[city.plan].lead : NO_LEAD;
  const cost = zeroResources();
  for (const wish of rankWishes(city, lead).slice(0, JOBS_LOOK_AHEAD)) {
    const price = upgradeCost(wish.building, nextTargetLevel(city, wish.building));
    for (const r of RESOURCES) cost[r] += price[r];
  }
  const short = zeroResources();
  let anyShort = false;
  for (const r of RESOURCES) {
    short[r] = Math.max(0, cost[r] - city.resources[r]);
    if (short[r] > 0) anyShort = true;
  }
  // With everything already in stock, keep the mix those orders will use up.
  return anyShort ? short : cost;
}

/**
 * Put villagers where the next orders need them. Each job's share follows
 * how much of its resource the city is short of, so everything an order
 * needs arrives at about the same time. A small even share keeps a trickle
 * of every resource coming, and nobody is given a job with no free slot.
 */
export function autoAssign(city: City): void {
  const slots = zeroResources();
  for (const r of RESOURCES) slots[r] = jobSlots(city, r);
  const open: ResourceId[] = RESOURCES.filter((r) => slots[r] > 0);
  const jobs = zeroResources();
  city.jobs = jobs;
  if (open.length === 0 || city.villagers <= 0) return;

  const needs = upcomingNeeds(city);
  const share = zeroResources();
  let totalWork = 0;
  for (const r of open) {
    // Villager-hours of work this resource needs.
    share[r] = needs[r] / (YIELD_PER_HOUR[r] * traitMultiplier(city, r));
    totalWork += share[r];
  }
  for (const r of open) {
    const byNeed = totalWork > 0 ? share[r] / totalWork : 1 / open.length;
    share[r] = (1 - JOBS_EVEN_SHARE) * byNeed + JOBS_EVEN_SHARE / open.length;
  }

  // Hand villagers out by share. When a job fills up, the rest are shared
  // again among the jobs that still have room.
  let left = Math.min(city.villagers, open.reduce((sum, r) => sum + slots[r], 0));
  let free = open;
  while (left > 0 && free.length > 0) {
    const weight = free.reduce((sum, r) => sum + share[r], 0);
    const wanted = free.map((r) => ({ r, exact: (left * share[r]) / weight }));
    let given = 0;
    for (const w of wanted) {
      const n = Math.min(Math.floor(w.exact), slots[w.r] - jobs[w.r]);
      jobs[w.r] += n;
      given += n;
    }
    // Rounding leaves a few over: they go to the largest remainders first.
    const byRemainder = wanted
      .filter((w) => jobs[w.r] < slots[w.r])
      .sort((a, b) => b.exact - Math.floor(b.exact) - (a.exact - Math.floor(a.exact)) || RESOURCES.indexOf(a.r) - RESOURCES.indexOf(b.r));
    for (const w of byRemainder) {
      if (given >= left) break;
      if (jobs[w.r] < slots[w.r]) {
        jobs[w.r] += 1;
        given += 1;
      }
    }
    if (given === 0) break;
    left -= given;
    free = free.filter((r) => jobs[r] < slots[r]);
  }
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
