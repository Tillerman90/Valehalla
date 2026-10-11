// Bot players. A bot only does what a person could do: it opens the app at
// set hours, looks at the city, and gives orders. It drives the same engine
// through the same actions as the real game.

import { MAX_LEVEL, PLAN_DEFS, storageCap, upgradeCost } from '../engine/content';
import { queueBuild, setPlan } from '../engine/actions';
import { buildBlocker, canAfford, nextTargetLevel, rankWishes, upgradeable } from '../engine/build';
import { cityRates } from '../engine/economy';
import { clearTheWay } from '../engine/plan';
import { BUILDINGS, RESOURCES } from '../engine/types';
import type { BuildingId, City, GameState, PlanId } from '../engine/types';

export interface Bot {
  name: string;
  description: string;
  /** Hours of the day (0 to 24) at which this bot opens the app. */
  checkInHours: number[];
  /** The city plan the bot runs, or null to place every order by hand. */
  plan: PlanId | null;
}

export const BOTS: Bot[] = [
  {
    name: 'balanced',
    description: 'Six check-ins a day (7am to 10pm), Economy plan',
    checkInHours: [7, 10, 13, 16, 19, 22],
    plan: 'economy',
  },
  {
    name: 'twice-a-day',
    description: 'Opens the app at 8am and 8pm only, Economy plan',
    checkInHours: [8, 20],
    plan: 'economy',
  },
  {
    name: 'once-a-day',
    description: 'Opens the app at 8pm only, Economy plan. The world is frozen half of every day',
    checkInHours: [20],
    plan: 'economy',
  },
  {
    name: 'by-hand',
    description: 'Six check-ins a day, no plan: every order placed by hand',
    checkInHours: [7, 10, 13, 16, 19, 22],
    plan: null,
  },
];

export interface CheckInResult {
  ordersPlaced: number;
  /** True when the city can make no progress at all: a dead end. */
  deadEnd: boolean;
}

/** How far below its top wish (in levels) a hand-building bot will still spend, instead of saving up. */
const PATIENCE = 3;

/** Place orders by hand in the Economy plan's order, the way a careful player would. */
function orderByHand(state: GameState, city: City): number {
  let placed = 0;
  for (;;) {
    const wishes = rankWishes(city, PLAN_DEFS.economy.lead);
    const top = wishes[0];
    if (!top) break;
    let choice: BuildingId | null = null;
    for (const wish of wishes) {
      if (wish.score > top.score + PATIENCE) break;
      if (buildBlocker(city, wish.building) === null) {
        choice = wish.building;
        break;
      }
    }
    if (!choice) {
      const enabler = clearTheWay(state, city, top.building);
      if (enabler && buildBlocker(city, enabler) === null) choice = enabler;
    }
    if (!choice || !queueBuild(state, city.id, choice).ok) break;
    placed += 1;
  }
  return placed;
}

/** True while the Keep allows a Court and none has been built or ordered yet. */
function courtIsNext(city: City): boolean {
  return city.levels.keep >= 10 && nextTargetLevel(city, 'court') === 1;
}

/**
 * The Court unlocks conquest, so every bot wants it the moment the Keep
 * allows. A plan would spend the money first, so the bot does what a player
 * would: pause the plan, save up, order the Court, resume.
 */
function pursueCourt(state: GameState, city: City, bot: Bot): number {
  if (!courtIsNext(city)) {
    if (city.plan !== bot.plan) setPlan(state, city.id, bot.plan);
    return 0;
  }
  if (canAfford(city, upgradeCost('court', 1)) && queueBuild(state, city.id, 'court').ok) {
    if (city.plan !== bot.plan) setPlan(state, city.id, bot.plan);
    return 1;
  }
  if (city.plan !== null) setPlan(state, city.id, null);
  // While saving, still fix anything that makes the Court impossible to afford.
  const enabler = clearTheWay(state, city, 'court');
  if (enabler && enabler !== 'court' && queueBuild(state, city.id, enabler).ok) return 1;
  return 0;
}

export function checkIn(state: GameState, city: City, bot: Bot): CheckInResult {
  let ordersPlaced = pursueCourt(state, city, bot);
  const savingForCourt = courtIsNext(city);
  if (bot.plan === null && !savingForCourt) ordersPlaced += orderByHand(state, city);
  return { ordersPlaced, deadEnd: city.queue.length === 0 && isDeadEnd(state, city) };
}

/**
 * A dead end is a city with nothing building and nothing it can ever afford
 * by waiting: every remaining upgrade costs more than the Storehouse can hold,
 * or needs a resource the city has no income of.
 */
export function isDeadEnd(state: GameState, city: City): boolean {
  const candidates = upgradeable(city);
  if (candidates.length === 0) return false; // fully built is finished, not stuck
  const cap = storageCap(city.levels.storehouse);
  const rates = cityRates(state, city);
  return candidates.every((b) => {
    const cost = upgradeCost(b, nextTargetLevel(city, b));
    return RESOURCES.some((r) => cost[r] > city.resources[r] && (cost[r] > cap || rates[r] <= 0));
  });
}

export function isFullyBuilt(city: City): boolean {
  return BUILDINGS.every((b) => city.levels[b] >= MAX_LEVEL);
}

export function totalLevels(city: City): number {
  return BUILDINGS.reduce((sum, b) => sum + city.levels[b], 0);
}
