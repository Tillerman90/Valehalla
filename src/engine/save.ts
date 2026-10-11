// The save format. A save is a small JSON envelope around the game state with
// a version (so old saves can be upgraded), a revision (so the newest copy
// always wins) and a checksum (so a half-written or corrupted copy is
// detected and skipped instead of loaded).

import { fnv1a } from './rng';
import { BUILDINGS, PLANS, RESOURCES } from './types';
import type { GameState } from './types';

export const SAVE_FORMAT = 'valehalla-save';
export const SAVE_VERSION = 1;

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  version: number;
  /** Goes up by one on every save of a world. Higher is newer. */
  revision: number;
  savedAtWall: number;
  checksum: string;
  state: GameState;
}

export type LoadFailure = 'not-json' | 'not-a-save' | 'from-newer-version' | 'checksum-mismatch' | 'invalid-state';

export type LoadResult = { ok: true; save: SaveFile } | { ok: false; reason: LoadFailure };

/**
 * Upgrades from each older version to the next. When the state shape changes,
 * bump SAVE_VERSION and add an entry here so existing empires keep loading.
 */
const MIGRATIONS: Record<number, (state: unknown) => unknown> = {};

export function checksumOf(state: unknown): string {
  return fnv1a(JSON.stringify(state)).toString(16).padStart(8, '0');
}

export function serializeSave(state: GameState, revision: number, savedAtWall: number): string {
  const save: SaveFile = {
    format: SAVE_FORMAT,
    version: SAVE_VERSION,
    revision,
    savedAtWall,
    checksum: checksumOf(state),
    state,
  };
  return JSON.stringify(save);
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function hasFiniteResources(v: unknown): boolean {
  return isObject(v) && RESOURCES.every((r) => isFiniteNumber(v[r]));
}

/** Structural check, so a save that parses but is missing pieces never reaches the engine. */
export function isValidState(state: unknown): state is GameState {
  if (!isObject(state)) return false;
  if (typeof state.seed !== 'string' || typeof state.worldId !== 'string') return false;
  if (!isFiniteNumber(state.nextId) || !isFiniteNumber(state.settledAt)) return false;
  const clock = state.clock;
  if (!isObject(clock)) return false;
  if (!['gameTime', 'lastWall', 'createdWall', 'frozenMs'].every((k) => isFiniteNumber(clock[k]))) return false;
  if (!isObject(state.stats) || !isFiniteNumber(state.stats.buildsCompleted)) return false;
  if (!Array.isArray(state.events) || !Array.isArray(state.cities) || state.cities.length === 0) return false;
  for (const event of state.events) {
    if (!isObject(event) || !isFiniteNumber(event.at) || !isFiniteNumber(event.id)) return false;
    if (typeof event.type !== 'string') return false;
  }
  for (const city of state.cities) {
    if (!isObject(city) || !isFiniteNumber(city.id) || typeof city.name !== 'string') return false;
    if (typeof city.owner !== 'string' || typeof city.autoAssign !== 'boolean') return false;
    if (!isFiniteNumber(city.villagers) || !isFiniteNumber(city.villagerCarry)) return false;
    if (city.growthAt !== null && !isFiniteNumber(city.growthAt)) return false;
    if (city.planCheckAt !== null && !isFiniteNumber(city.planCheckAt)) return false;
    if (city.plan !== null && !(PLANS as readonly unknown[]).includes(city.plan)) return false;
    if (!hasFiniteResources(city.resources) || !hasFiniteResources(city.jobs)) return false;
    const levels = city.levels;
    if (!isObject(levels) || !BUILDINGS.every((b) => isFiniteNumber(levels[b]))) return false;
    if (!Array.isArray(city.traits) || !Array.isArray(city.queue)) return false;
    for (const item of city.queue) {
      if (!isObject(item) || !isFiniteNumber(item.id) || !isFiniteNumber(item.targetLevel)) return false;
      if (typeof item.building !== 'string' || !hasFiniteResources(item.cost)) return false;
      if (typeof item.byPlan !== 'boolean') return false;
    }
  }
  return true;
}

export function parseSave(text: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'not-json' };
  }
  if (!isObject(raw) || raw.format !== SAVE_FORMAT) return { ok: false, reason: 'not-a-save' };
  if (!isFiniteNumber(raw.version) || !isFiniteNumber(raw.revision) || !isFiniteNumber(raw.savedAtWall)) {
    return { ok: false, reason: 'not-a-save' };
  }
  if (raw.version > SAVE_VERSION) return { ok: false, reason: 'from-newer-version' };
  if (typeof raw.checksum !== 'string' || raw.checksum !== checksumOf(raw.state)) {
    return { ok: false, reason: 'checksum-mismatch' };
  }
  let state = raw.state;
  for (let v = raw.version; v < SAVE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) return { ok: false, reason: 'invalid-state' };
    state = migrate(state);
  }
  if (!isValidState(state)) return { ok: false, reason: 'invalid-state' };
  return {
    ok: true,
    save: {
      format: SAVE_FORMAT,
      version: SAVE_VERSION,
      revision: raw.revision,
      savedAtWall: raw.savedAtWall,
      checksum: checksumOf(state),
      state,
    },
  };
}
