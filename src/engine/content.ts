// Every balance number lives here. Changing how the game feels should mean
// editing this file and re-running the simulator, never touching engine code.
// All of these are starting values: the simulator decides the final ones.

import type { BuildingId, PlanId, ResourceId, Resources, TraitId } from './types';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** The world keeps running this long after you close the app, then freezes. */
export const AWAY_CAP_MS = 12 * HOUR;
export const MAX_LEVEL = 15;
/** No single build may take longer than this. */
export const MAX_BUILD_MS = 8 * HOUR;
/** Villagers arrive in small batches this often. */
export const GROWTH_PULSE_MS = 10 * MINUTE;

export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** Cost of level 1. Each later level costs costGrowth times the one before. */
  baseCost: Partial<Resources>;
  costGrowth: number;
  /** Seconds to build level 1, before the Keep's speed bonus. */
  baseBuildSec: number;
  timeGrowth: number;
  requires: Partial<Record<BuildingId, number>>;
  startLevel: number;
  /** The resource villagers produce when they work here. */
  job?: ResourceId;
}

const COST_GROWTH = 1.42;
const TIME_GROWTH = 1.55;

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  keep: {
    id: 'keep',
    name: 'Keep',
    baseCost: { food: 40, timber: 90, metal: 70 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 60,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    baseCost: { timber: 60, metal: 40 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 45,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    job: 'food',
  },
  lumberCamp: {
    id: 'lumberCamp',
    name: 'Lumber Camp',
    baseCost: { food: 20, timber: 50, metal: 50 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 45,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    job: 'timber',
  },
  mine: {
    id: 'mine',
    name: 'Mine',
    baseCost: { food: 20, timber: 70, metal: 30 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 45,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    job: 'metal',
  },
  market: {
    id: 'market',
    name: 'Market',
    baseCost: { food: 60, timber: 100, metal: 80 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 60,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 3 },
    startLevel: 0,
    job: 'wealth',
  },
  storehouse: {
    id: 'storehouse',
    name: 'Storehouse',
    baseCost: { timber: 70, metal: 50 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 40,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    baseCost: { food: 70, timber: 110, metal: 90 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 60,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 2 },
    startLevel: 0,
  },
  stable: {
    id: 'stable',
    name: 'Stable',
    baseCost: { food: 110, timber: 140, metal: 120, wealth: 40 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 75,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 5, barracks: 3 },
    startLevel: 0,
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    baseCost: { food: 60, timber: 170, metal: 150, wealth: 60 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 90,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 7, barracks: 5 },
    startLevel: 0,
  },
  wall: {
    id: 'wall',
    name: 'Wall',
    baseCost: { timber: 60, metal: 100 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 50,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 3 },
    startLevel: 0,
  },
  watchtower: {
    id: 'watchtower',
    name: 'Watchtower',
    baseCost: { timber: 90, metal: 60, wealth: 20 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 50,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 4 },
    startLevel: 0,
  },
  court: {
    id: 'court',
    name: 'Court',
    baseCost: { food: 600, timber: 800, metal: 800, wealth: 500 },
    costGrowth: 1.3,
    baseBuildSec: 900,
    timeGrowth: 1.35,
    requires: { keep: 10 },
    startLevel: 0,
  },
};

/** Which building's level sets the worker slots for each resource. */
export const JOB_BUILDING: Record<ResourceId, BuildingId> = {
  food: 'farm',
  timber: 'lumberCamp',
  metal: 'mine',
  wealth: 'market',
};

/** What one villager produces per hour in each job. */
export const YIELD_PER_HOUR: Resources = { food: 30, timber: 30, metal: 30, wealth: 20 };

export const TRAIT_NAMES: Record<TraitId, string> = {
  fertile: 'Fertile',
  forested: 'Forested',
  oreRich: 'Ore-rich',
  crossroads: 'Crossroads',
  hilltop: 'Hilltop',
};

/** Production bonus a site trait gives. Hilltop is defensive and arrives with combat. */
export const TRAIT_YIELD: Record<TraitId, Partial<Resources>> = {
  fertile: { food: 1.25 },
  forested: { timber: 1.25 },
  oreRich: { metal: 1.25 },
  crossroads: { wealth: 1.25 },
  hilltop: {},
};

/** A founding city starts with nothing in store. Its first villagers have to gather it. */
export const STARTING_RESOURCES: Resources = { food: 0, timber: 0, metal: 0, wealth: 0 };
export const STARTING_VILLAGERS = 12;

export function upgradeCost(building: BuildingId, targetLevel: number): Resources {
  const def = BUILDING_DEFS[building];
  const scale = Math.pow(def.costGrowth, targetLevel - 1);
  return {
    food: Math.round((def.baseCost.food ?? 0) * scale),
    timber: Math.round((def.baseCost.timber ?? 0) * scale),
    metal: Math.round((def.baseCost.metal ?? 0) * scale),
    wealth: Math.round((def.baseCost.wealth ?? 0) * scale),
  };
}

/** How much faster a Keep of this level makes every build in its city. */
export function keepSpeed(keepLevel: number): number {
  return Math.pow(1.04, Math.max(0, keepLevel - 1));
}

export function buildDurationMs(building: BuildingId, targetLevel: number, keepLevel: number): number {
  const def = BUILDING_DEFS[building];
  const seconds = (def.baseBuildSec * Math.pow(def.timeGrowth, targetLevel - 1)) / keepSpeed(keepLevel);
  return Math.min(MAX_BUILD_MS, Math.max(SECOND, Math.round(seconds) * SECOND));
}

/** Orders a city can hold at once: two at first, up to five from Keep levels. */
export function queueSlots(keepLevel: number): number {
  return Math.min(5, 2 + Math.floor(keepLevel / 5));
}

/** Villagers who can work in a job building of this level. */
export function workerSlots(level: number): number {
  return level <= 0 ? 0 : Math.round(6 * Math.pow(1.25, level - 1));
}

/** Most people a city can hold. Troops will share this cap when armies arrive. */
export function populationCap(farmLevel: number): number {
  return Math.round(24 * Math.pow(1.28, Math.max(0, farmLevel - 1)));
}

export function villagersPerHour(farmLevel: number): number {
  return 20 * Math.pow(1.22, Math.max(0, farmLevel - 1));
}

export function storageCap(storehouseLevel: number): number {
  return storehouseLevel <= 0 ? 400 : Math.round(800 * Math.pow(1.3, storehouseLevel - 1));
}

/** Empire-wide ceiling on hourly income of each resource. */
export function incomeCap(combinedMarketLevels: number): number {
  return 500 + 260 * combinedMarketLevels;
}

export interface PlanDef {
  id: PlanId;
  name: string;
  summary: string;
  /**
   * How many levels ahead of the pack the plan keeps each building. The plan
   * always orders whichever building has the lowest (next level minus lead).
   */
  lead: Record<BuildingId, number>;
}

export const PLAN_DEFS: Record<PlanId, PlanDef> = {
  economy: {
    id: 'economy',
    name: 'Economy',
    summary: 'Grows income and storage first. Military buildings trail far behind.',
    lead: {
      keep: 1.5,
      farm: 1,
      lumberCamp: 1,
      mine: 1,
      storehouse: 1,
      market: 0.5,
      wall: -3,
      barracks: -4,
      watchtower: -5,
      stable: -6,
      workshop: -7,
      court: -8,
    },
  },
  fortress: {
    id: 'fortress',
    name: 'Fortress',
    summary: 'Wall and Watchtower first, with enough economy to pay for a garrison.',
    lead: {
      wall: 2,
      watchtower: 1,
      keep: 1,
      storehouse: 1,
      farm: 0.5,
      lumberCamp: 0.5,
      mine: 0.5,
      barracks: 0,
      market: 0,
      stable: -3,
      workshop: -5,
      court: -8,
    },
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks town',
    summary: 'Barracks, Stable and Workshop first, with a large Farm to house troops.',
    lead: {
      barracks: 2,
      stable: 1.5,
      farm: 1.5,
      keep: 1,
      workshop: 0.5,
      lumberCamp: 0.5,
      mine: 0.5,
      storehouse: 0.5,
      market: 0,
      wall: -1,
      watchtower: -3,
      court: -8,
    },
  },
};

/** The plan looks again at least this often while it is saving up. */
export const PLAN_RECHECK_MAX_MS = 30 * MINUTE;
export const PLAN_RECHECK_MIN_MS = MINUTE;

/** How many upcoming orders the villagers look ahead to when sharing themselves out. */
export const JOBS_LOOK_AHEAD = 3;
/** The part of the workforce always spread evenly, so no resource dries up completely. */
export const JOBS_EVEN_SHARE = 0.15;
