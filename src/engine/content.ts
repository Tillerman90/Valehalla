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

export interface BuildingDef {
  id: BuildingId;
  name: string;
  /** Cost of level 1. Each later level costs costGrowth times the one before. */
  baseCost: Resources;
  costGrowth: number;
  /** Seconds to build level 1, before the Keep's speed bonus. */
  baseBuildSec: number;
  timeGrowth: number;
  requires: Partial<Record<BuildingId, number>>;
  startLevel: number;
  /** The resource this building produces. */
  produces?: ResourceId;
  /** People the first level needs. Each later level needs POPULATION_GROWTH times more. */
  population: number;
}

const COST_GROWTH = 1.42;
const TIME_GROWTH = 1.55;

export const BUILDING_DEFS: Record<BuildingId, BuildingDef> = {
  keep: {
    id: 'keep',
    name: 'Keep',
    baseCost: { timber: 90, stone: 80, metal: 90 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 60,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    population: 5,
  },
  farm: {
    id: 'farm',
    name: 'Farm',
    baseCost: { timber: 45, stone: 40, metal: 40 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 45,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    population: 0,
  },
  lumberCamp: {
    id: 'lumberCamp',
    name: 'Lumber Camp',
    baseCost: { timber: 50, stone: 60, metal: 55 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 45,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    population: 5,
    produces: 'timber',
  },
  quarry: {
    id: 'quarry',
    name: 'Quarry',
    baseCost: { timber: 65, stone: 50, metal: 55 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 45,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    population: 5,
    produces: 'stone',
  },
  mine: {
    id: 'mine',
    name: 'Mine',
    baseCost: { timber: 75, stone: 65, metal: 70 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 45,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    population: 5,
    produces: 'metal',
  },
  market: {
    id: 'market',
    name: 'Market',
    baseCost: { timber: 100, stone: 100, metal: 110 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 60,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 3 },
    startLevel: 0,
    population: 10,
  },
  storehouse: {
    id: 'storehouse',
    name: 'Storehouse',
    baseCost: { timber: 60, stone: 50, metal: 60 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 40,
    timeGrowth: TIME_GROWTH,
    requires: {},
    startLevel: 1,
    population: 0,
  },
  barracks: {
    id: 'barracks',
    name: 'Barracks',
    baseCost: { timber: 110, stone: 90, metal: 90 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 60,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 2 },
    startLevel: 0,
    population: 7,
  },
  stable: {
    id: 'stable',
    name: 'Stable',
    baseCost: { timber: 140, stone: 110, metal: 130 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 75,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 5, barracks: 3 },
    startLevel: 0,
    population: 8,
  },
  workshop: {
    id: 'workshop',
    name: 'Workshop',
    baseCost: { timber: 170, stone: 150, metal: 110 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 90,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 7, barracks: 5 },
    startLevel: 0,
    population: 8,
  },
  wall: {
    id: 'wall',
    name: 'Wall',
    baseCost: { timber: 50, stone: 100, metal: 50 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 50,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 3 },
    startLevel: 0,
    population: 5,
  },
  watchtower: {
    id: 'watchtower',
    name: 'Watchtower',
    baseCost: { timber: 80, stone: 70, metal: 70 },
    costGrowth: COST_GROWTH,
    baseBuildSec: 50,
    timeGrowth: TIME_GROWTH,
    requires: { keep: 4 },
    startLevel: 0,
    population: 5,
  },
  court: {
    id: 'court',
    name: 'Court',
    baseCost: { timber: 750, stone: 800, metal: 650 },
    costGrowth: 1.3,
    baseBuildSec: 900,
    timeGrowth: 1.35,
    requires: { keep: 10 },
    startLevel: 0,
    population: 40,
  },
};

/** The building that produces each resource. */
export const JOB_BUILDING: Record<ResourceId, BuildingId> = {
  timber: 'lumberCamp',
  stone: 'quarry',
  metal: 'mine',
};

/** Hourly output of a level 1 production building. Each level multiplies it by PRODUCTION_GROWTH. */
export const BASE_PRODUCTION: Resources = { timber: 180, stone: 180, metal: 180 };
export const PRODUCTION_GROWTH = 1.25;

export const TRAIT_NAMES: Record<TraitId, string> = {
  fertile: 'Fertile',
  forested: 'Forested',
  rocky: 'Rocky',
  oreRich: 'Ore-rich',
  crossroads: 'Crossroads',
  hilltop: 'Hilltop',
};

export const TRAIT_SUMMARY: Record<TraitId, string> = {
  fertile: 'The Farm houses a fifth more people',
  forested: 'A quarter more timber',
  rocky: 'A quarter more stone',
  oreRich: 'A quarter more metal',
  crossroads: 'Better rates at the Market',
  hilltop: 'Easier to defend, once there is something to defend against',
};

/** Production bonus a site trait gives. */
export const TRAIT_YIELD: Record<TraitId, Partial<Resources>> = {
  fertile: {},
  forested: { timber: 1.25 },
  rocky: { stone: 1.25 },
  oreRich: { metal: 1.25 },
  crossroads: {},
  hilltop: {},
};

/** A fertile site's Farm houses this many times more people. */
export const FERTILE_POPULATION = 1.2;

/** A founding city's stockpile: enough for its first three or four orders, and no more. */
export const STARTING_RESOURCES: Resources = { timber: 400, stone: 350, metal: 300 };

export function upgradeCost(building: BuildingId, targetLevel: number): Resources {
  const def = BUILDING_DEFS[building];
  const scale = Math.pow(def.costGrowth, targetLevel - 1);
  return {
    timber: Math.round(def.baseCost.timber * scale),
    stone: Math.round(def.baseCost.stone * scale),
    metal: Math.round(def.baseCost.metal * scale),
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

/** What a production building of this level makes per hour, before site traits. */
export function productionPerHour(resource: ResourceId, level: number): number {
  return level <= 0 ? 0 : Math.round(BASE_PRODUCTION[resource] * Math.pow(PRODUCTION_GROWTH, level - 1));
}

export const POPULATION_GROWTH = 1.17;

/** People a Farm of this level can house, before site traits. Buildings use some; troops will use the rest. */
export function populationCap(farmLevel: number): number {
  return Math.round(240 * Math.pow(1.33, Math.max(0, farmLevel - 1)));
}

/** People one level of a building needs, on top of the levels below it. */
export function populationForLevel(building: BuildingId, level: number): number {
  return level <= 0 ? 0 : Math.round(BUILDING_DEFS[building].population * Math.pow(POPULATION_GROWTH, level - 1));
}

export function storageCap(storehouseLevel: number): number {
  return storehouseLevel <= 0 ? 400 : Math.round(800 * Math.pow(1.3, storehouseLevel - 1));
}

/**
 * The share of what you give that comes back in a Market trade. A bigger
 * Market trades on better terms, and a crossroads site better still.
 */
export function tradeRate(marketLevel: number, atCrossroads: boolean): number {
  if (marketLevel <= 0) return 0;
  return Math.min(0.95, 0.5 + 0.03 * marketLevel + (atCrossroads ? 0.1 : 0));
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
      quarry: 1,
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
      quarry: 0.5,
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
      quarry: 0.5,
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
