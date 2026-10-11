// World creation. Phase 0 makes a single founding city; the map, neutral
// villages and rival factions join in later phases through the same seed.

import { BUILDING_DEFS, STARTING_RESOURCES } from './content';
import { rngFor } from './rng';
import { BUILDINGS } from './types';
import type { BuildingId, City, GameState, TraitId } from './types';

export const PLAYER = 'player';

const CITY_NAMES = [
  'Ashford',
  'Brackenhold',
  'Coldmere',
  'Dunmarrow',
  'Eldwick',
  'Fenwatch',
  'Grimhollow',
  'Harrowgate',
  'Ironvale',
  'Kestrel Rise',
  'Lowmoor',
  'Mournfell',
  'Northbarrow',
  'Oakenshade',
  'Ravenscar',
  'Stonewake',
  'Thornwall',
  'Wolfden',
];

const ECONOMY_TRAITS: TraitId[] = ['fertile', 'forested', 'rocky', 'oreRich', 'crossroads'];

/** Each site has one economic trait, and some are also a hilltop. */
export function rollSiteTraits(seed: string, siteKey: string | number): TraitId[] {
  const rng = rngFor(seed, 'site-traits', siteKey);
  const traits: TraitId[] = [rng.pick(ECONOMY_TRAITS)];
  if (rng.chance(0.3)) traits.push('hilltop');
  return traits;
}

export function createCity(state: GameState, owner: string, name: string, traits: TraitId[]): City {
  const levels = {} as Record<BuildingId, number>;
  for (const b of BUILDINGS) levels[b] = BUILDING_DEFS[b].startLevel;
  const city: City = {
    id: state.nextId++,
    name,
    owner,
    traits,
    levels,
    resources: { ...STARTING_RESOURCES },
    queue: [],
    plan: null,
    planCheckAt: null,
  };
  state.cities.push(city);
  return city;
}

export interface NewWorldOptions {
  seed: string;
  wallNow: number;
}

export function createWorld({ seed, wallNow }: NewWorldOptions): GameState {
  const state: GameState = {
    seed,
    worldId: `${seed}-${wallNow.toString(36)}`,
    clock: { gameTime: 0, lastWall: wallNow, createdWall: wallNow, frozenMs: 0 },
    nextId: 1,
    settledAt: 0,
    cities: [],
    events: [],
    stats: { buildsCompleted: 0 },
  };
  const name = rngFor(seed, 'capital-name').pick(CITY_NAMES);
  createCity(state, PLAYER, name, rollSiteTraits(seed, 'capital'));
  return state;
}

/** A fresh random seed for a new world. Not used for anything inside a world. */
export function randomSeed(random: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 10; i++) out += Math.floor(random() * 36).toString(36);
  return out;
}
