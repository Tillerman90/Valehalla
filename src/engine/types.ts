// Core data shapes. Everything in GameState must be plain JSON so it can be
// saved, restored and replayed by the simulator.

export const RESOURCES = ['timber', 'stone', 'metal'] as const;
export type ResourceId = (typeof RESOURCES)[number];
export type Resources = Record<ResourceId, number>;

export const BUILDINGS = [
  'keep',
  'farm',
  'lumberCamp',
  'quarry',
  'mine',
  'market',
  'storehouse',
  'barracks',
  'stable',
  'workshop',
  'wall',
  'watchtower',
  'court',
] as const;
export type BuildingId = (typeof BUILDINGS)[number];

export const TRAITS = ['fertile', 'forested', 'rocky', 'oreRich', 'crossroads', 'hilltop'] as const;
export type TraitId = (typeof TRAITS)[number];

export const PLANS = ['economy', 'fortress', 'barracks'] as const;
export type PlanId = (typeof PLANS)[number];

export interface QueueItem {
  id: number;
  building: BuildingId;
  targetLevel: number;
  /** What was paid when the order was placed. Refunded in full on cancel. */
  cost: Resources;
  /** True when the city plan placed this order, false when the player did. */
  byPlan: boolean;
  /** Game time. Null while the order is waiting behind another one. */
  startedAt: number | null;
  completesAt: number | null;
}

export interface City {
  id: number;
  name: string;
  owner: string;
  traits: TraitId[];
  levels: Record<BuildingId, number>;
  resources: Resources;
  /** Sequential build queue. The first item is the one under construction. */
  queue: QueueItem[];
  /** The city plan that refills the queue by itself, or null to build by hand. */
  plan: PlanId | null;
  /** Game time the plan will next look at whether it can afford its next order. */
  planCheckAt: number | null;
}

export type GameEvent =
  | { id: number; at: number; type: 'buildComplete'; cityId: number; queueItemId: number }
  | { id: number; at: number; type: 'planCheck'; cityId: number };

export interface GameClock {
  /** Milliseconds of game time since the world began. All timers use this. */
  gameTime: number;
  /** Wall-clock time (ms since epoch) the world was last advanced to. */
  lastWall: number;
  createdWall: number;
  /** Total wall time the world has spent frozen by the away guardrail. */
  frozenMs: number;
}

export interface GameStats {
  buildsCompleted: number;
}

export interface GameState {
  seed: string;
  /** Unique per world, so a backup is never restored over a different world. */
  worldId: string;
  clock: GameClock;
  nextId: number;
  /** Game time the economy was last settled to. */
  settledAt: number;
  cities: City[];
  /** Pending timed events, sorted by (at, id). */
  events: GameEvent[];
  stats: GameStats;
}

export type ActionResult = { ok: true } | { ok: false; reason: ActionFailure };

export type ActionFailure =
  | 'no-such-city'
  | 'max-level'
  | 'queue-full'
  | 'requirements'
  | 'cannot-afford'
  | 'no-such-order'
  | 'farm-too-small'
  | 'no-market'
  | 'invalid-trade'
  | 'no-room';

export interface CompletedBuild {
  cityId: number;
  building: BuildingId;
  level: number;
  at: number;
  byPlan: boolean;
}

/** What happened during one advance. This is the raw material of the away report. */
export interface AdvanceReport {
  wallElapsedMs: number;
  gameElapsedMs: number;
  /** Wall time that did not count because the world was frozen. */
  frozenMs: number;
  clockWentBackwards: boolean;
  gained: Record<number, Resources>;
  /** Production lost because the Storehouse was full. */
  wasted: Record<number, Resources>;
  builds: CompletedBuild[];
}

export function zeroResources(): Resources {
  return { timber: 0, stone: 0, metal: 0 };
}
