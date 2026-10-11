// Production, storage and population. Rates only change at events, so between
// events income is a straight line and can be settled in one step however
// long the gap is. That is what makes catching up after 12 hours instant.

import {
  FERTILE_POPULATION,
  HOUR,
  JOB_BUILDING,
  TRAIT_YIELD,
  incomeCap,
  populationCap,
  populationForLevel,
  productionPerHour,
  storageCap,
} from './content';
import { BUILDINGS, RESOURCES, zeroResources } from './types';
import type { AdvanceReport, BuildingId, City, GameState, ResourceId, Resources } from './types';

function traitMultiplier(city: City, resource: ResourceId): number {
  let m = 1;
  for (const trait of city.traits) m *= TRAIT_YIELD[trait][resource] ?? 1;
  return m;
}

/** Hourly production of one city before the empire income cap. It follows building levels alone. */
export function rawRates(city: City): Resources {
  const out = zeroResources();
  for (const r of RESOURCES) {
    out[r] = productionPerHour(r, city.levels[JOB_BUILDING[r]]) * traitMultiplier(city, r);
  }
  return out;
}

/** People the city's buildings need, counting orders already in the queue. */
export function populationUsed(city: City): number {
  let used = 0;
  for (const b of BUILDINGS) {
    const queued = city.queue.filter((q) => q.building === b).length;
    for (let level = 1; level <= city.levels[b] + queued; level++) used += populationForLevel(b, level);
  }
  return used;
}

/** People this city can house: the Farm's level, and more on a fertile site. */
export function cityPopulationCap(city: City): number {
  const bonus = city.traits.includes('fertile') ? FERTILE_POPULATION : 1;
  return Math.round(populationCap(city.levels.farm) * bonus);
}

export function populationFree(city: City): number {
  return cityPopulationCap(city) - populationUsed(city);
}

/** Whether the Farm can house the people one more level of this building needs. */
export function hasPopulationFor(city: City, building: BuildingId, targetLevel: number): boolean {
  const needed = populationForLevel(building, targetLevel);
  return needed <= 0 || needed <= populationFree(city);
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
