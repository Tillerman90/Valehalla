import { describe, expect, it } from 'vitest';
import {
  AWAY_CAP_MS,
  BUILDINGS,
  BUILDING_DEFS,
  HOUR,
  MAX_BUILD_MS,
  MAX_LEVEL,
  MINUTE,
  PLAN_DEFS,
  PLANS,
  RESOURCES,
  SECOND,
  advance,
  autoAssign,
  buildDurationMs,
  cancelBuild,
  cityRates,
  createWorld,
  empireIncome,
  incomeCap,
  jobSlots,
  populationCap,
  queueBuild,
  queueSlots,
  rngFor,
  rollSiteTraits,
  runUntil,
  setAutoAssign,
  setJobs,
  setPlan,
  storageCap,
  upgradeCost,
  wallTimeOf,
} from './index';
import type { GameState } from './index';

const T0 = Date.UTC(2026, 0, 1);
const newWorld = (seed = 'test') => createWorld({ seed, wallNow: T0 });
const capital = (state: GameState) => state.cities[0]!;

/** A modest stockpile, for tests about orders rather than about gathering. */
function stock(state: GameState, amount = 400) {
  const city = capital(state);
  city.resources = { food: amount, timber: amount, metal: amount, wealth: 0 };
}

/** Give the city plenty of everything, for tests that are not about affording things. */
function enrich(state: GameState, amount = 1e9) {
  for (const r of RESOURCES) capital(state).resources[r] = amount;
}

describe('seeded randomness', () => {
  it('gives the same rolls for the same seed and keys', () => {
    const a = rngFor('seed', 'battle', 7);
    const b = rngFor('seed', 'battle', 7);
    expect([a.next(), a.next(), a.int(1, 6)]).toEqual([b.next(), b.next(), b.int(1, 6)]);
  });

  it('gives different rolls for different keys', () => {
    expect(rngFor('seed', 'battle', 7).next()).not.toBe(rngFor('seed', 'battle', 8).next());
    expect(rngFor('seed', 'battle', 7).next()).not.toBe(rngFor('other', 'battle', 7).next());
  });

  it('is roughly uniform and stays inside its bounds', () => {
    const rng = rngFor('uniform');
    let sum = 0;
    for (let i = 0; i < 20000; i++) {
      const roll = rng.int(1, 6);
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(6);
      sum += roll;
    }
    expect(sum / 20000).toBeGreaterThan(3.4);
    expect(sum / 20000).toBeLessThan(3.6);
  });

  it('rolls the same site traits for the same world', () => {
    expect(rollSiteTraits('abc', 'capital')).toEqual(rollSiteTraits('abc', 'capital'));
    expect(newWorld('abc').cities[0]!.traits).toEqual(newWorld('abc').cities[0]!.traits);
  });
});

describe('content rules', () => {
  it('never lets a build take longer than 8 hours', () => {
    for (const b of BUILDINGS) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        expect(buildDurationMs(b, level, 1)).toBeLessThanOrEqual(MAX_BUILD_MS);
      }
    }
  });

  it('makes every level cost more than the one before', () => {
    for (const b of BUILDINGS) {
      for (let level = 2; level <= MAX_LEVEL; level++) {
        const prev = upgradeCost(b, level - 1);
        const next = upgradeCost(b, level);
        for (const r of RESOURCES) expect(next[r]).toBeGreaterThanOrEqual(prev[r]);
      }
    }
  });

  it('never prices anything above what a full Storehouse can hold', () => {
    const most = storageCap(MAX_LEVEL);
    for (const b of BUILDINGS) {
      for (const r of RESOURCES) expect(upgradeCost(b, MAX_LEVEL)[r]).toBeLessThanOrEqual(most);
    }
  });

  it('only requires buildings that can themselves be built', () => {
    for (const b of BUILDINGS) {
      for (const [needed, level] of Object.entries(BUILDING_DEFS[b].requires)) {
        expect(BUILDINGS).toContain(needed);
        expect(level).toBeLessThanOrEqual(MAX_LEVEL);
      }
    }
  });

  it('gives two queue slots at the start and five at most', () => {
    expect(queueSlots(1)).toBe(2);
    expect(queueSlots(5)).toBe(3);
    expect(queueSlots(MAX_LEVEL)).toBe(5);
  });

  it('has a lead for every building in every plan', () => {
    for (const plan of PLANS) for (const b of BUILDINGS) expect(typeof PLAN_DEFS[plan].lead[b]).toBe('number');
  });
});

describe('the game clock', () => {
  it('follows the wall clock while you are playing', () => {
    const state = newWorld();
    const report = advance(state, T0 + 90 * MINUTE);
    expect(state.clock.gameTime).toBe(90 * MINUTE);
    expect(report.frozenMs).toBe(0);
  });

  it('freezes the world after 12 hours away', () => {
    const state = newWorld();
    const report = advance(state, T0 + 30 * HOUR);
    expect(state.clock.gameTime).toBe(AWAY_CAP_MS);
    expect(report.gameElapsedMs).toBe(AWAY_CAP_MS);
    expect(report.frozenMs).toBe(18 * HOUR);
    expect(state.clock.frozenMs).toBe(18 * HOUR);
  });

  it('resumes from where it froze, with timers intact', () => {
    const state = newWorld();
    enrich(state);
    capital(state).levels.keep = 15;
    // A long build ordered now, then a week away.
    queueBuild(state, capital(state).id, 'court');
    const order = capital(state).queue[0]!;
    const remainingBefore = order.completesAt! - state.clock.gameTime;
    advance(state, T0 + 6 * MINUTE);
    advance(state, T0 + 7 * 24 * HOUR);
    // Only 12 hours of that week counted.
    expect(state.clock.gameTime).toBe(6 * MINUTE + AWAY_CAP_MS);
    expect(remainingBefore).toBeLessThan(AWAY_CAP_MS);
    expect(capital(state).levels.court).toBe(1);
  });

  it('never rewinds when the phone clock moves backwards', () => {
    const state = newWorld();
    advance(state, T0 + HOUR);
    const report = advance(state, T0 + 10 * MINUTE);
    expect(report.clockWentBackwards).toBe(true);
    expect(state.clock.gameTime).toBe(HOUR);
    // Time continues normally from the new anchor.
    advance(state, T0 + 20 * MINUTE);
    expect(state.clock.gameTime).toBe(HOUR + 10 * MINUTE);
  });

  it('reports the wall time a timer will finish', () => {
    const state = newWorld();
    advance(state, T0 + HOUR);
    expect(wallTimeOf(state, state.clock.gameTime + 5 * MINUTE)).toBe(T0 + HOUR + 5 * MINUTE);
  });
});

describe('catch-up', () => {
  it('gives the same world whether you watch every second or open it once', () => {
    const watched = newWorld('same');
    const away = newWorld('same');
    for (const state of [watched, away]) {
      setPlan(state, capital(state).id, 'economy');
    }
    for (let t = SECOND; t <= 3 * HOUR; t += SECOND) advance(watched, T0 + t);
    advance(away, T0 + 3 * HOUR);

    expect(capital(watched).levels).toEqual(capital(away).levels);
    expect(capital(watched).villagers).toBe(capital(away).villagers);
    expect(capital(watched).queue.map((q) => [q.building, q.targetLevel, q.completesAt])).toEqual(
      capital(away).queue.map((q) => [q.building, q.targetLevel, q.completesAt]),
    );
    for (const r of RESOURCES) {
      expect(capital(watched).resources[r]).toBeCloseTo(capital(away).resources[r], 3);
    }
  });

  it('replays events in time order', () => {
    const state = newWorld();
    enrich(state);
    setPlan(state, capital(state).id, 'economy');
    const report = advance(state, T0 + 6 * HOUR);
    const times = report.builds.map((b) => b.at);
    expect(times.length).toBeGreaterThan(5);
    expect(times).toEqual(times.slice().sort((a, b) => a - b));
    expect(state.events.every((e, i) => i === 0 || state.events[i - 1]!.at <= e.at)).toBe(true);
  });
});

describe('the build queue', () => {
  it('charges for an order and builds it on time', () => {
    const state = newWorld();
    const city = capital(state);
    stock(state);
    const cost = upgradeCost('farm', 2);
    const before = { ...city.resources };
    expect(queueBuild(state, city.id, 'farm')).toEqual({ ok: true });
    for (const r of RESOURCES) expect(city.resources[r]).toBe(before[r] - cost[r]);
    const duration = buildDurationMs('farm', 2, city.levels.keep);
    runUntil(state, duration - 1);
    expect(city.levels.farm).toBe(1);
    runUntil(state, duration);
    expect(city.levels.farm).toBe(2);
    expect(city.queue).toHaveLength(0);
  });

  it('starts the next order the instant the one before it finishes', () => {
    const state = newWorld();
    const city = capital(state);
    enrich(state);
    queueBuild(state, city.id, 'farm');
    queueBuild(state, city.id, 'mine');
    const first = buildDurationMs('farm', 2, 1);
    const second = buildDurationMs('mine', 2, 1);
    expect(city.queue[1]!.startedAt).toBeNull();
    // Away for much longer than both builds: the second must still have
    // started when the first ended, not when the app was reopened.
    const report = advance(state, T0 + 5 * HOUR);
    expect(report.builds.map((b) => [b.building, b.at])).toEqual([
      ['farm', first],
      ['mine', first + second],
    ]);
  });

  it('prices repeat orders as the levels above', () => {
    const state = newWorld();
    const city = capital(state);
    enrich(state);
    queueBuild(state, city.id, 'farm');
    queueBuild(state, city.id, 'farm');
    expect(city.queue.map((q) => q.targetLevel)).toEqual([2, 3]);
    expect(city.queue[1]!.cost).toEqual(upgradeCost('farm', 3));
  });

  it('refuses orders that are not allowed', () => {
    const state = newWorld();
    const city = capital(state);
    expect(queueBuild(state, 999, 'farm')).toEqual({ ok: false, reason: 'no-such-city' });
    expect(queueBuild(state, city.id, 'court')).toEqual({ ok: false, reason: 'requirements' });
    for (const r of RESOURCES) city.resources[r] = 0;
    expect(queueBuild(state, city.id, 'farm')).toEqual({ ok: false, reason: 'cannot-afford' });
    enrich(state);
    queueBuild(state, city.id, 'farm');
    queueBuild(state, city.id, 'mine');
    expect(queueBuild(state, city.id, 'keep')).toEqual({ ok: false, reason: 'queue-full' });
    city.queue = [];
    city.levels.farm = MAX_LEVEL;
    expect(queueBuild(state, city.id, 'farm')).toEqual({ ok: false, reason: 'max-level' });
  });

  it('refunds a cancelled order in full and starts the next one', () => {
    const state = newWorld();
    const city = capital(state);
    stock(state);
    const before = { ...city.resources };
    queueBuild(state, city.id, 'farm');
    queueBuild(state, city.id, 'mine');
    const [farm, mine] = city.queue;
    expect(cancelBuild(state, city.id, farm!.id)).toEqual({ ok: true });
    const mineCost = upgradeCost('mine', 2);
    for (const r of RESOURCES) expect(city.resources[r]).toBe(before[r] - mineCost[r]);
    expect(city.queue.map((q) => q.id)).toEqual([mine!.id]);
    expect(city.queue[0]!.startedAt).toBe(0);
    // The cancelled build must never complete.
    advance(state, T0 + HOUR);
    expect(city.levels.farm).toBe(1);
    expect(city.levels.mine).toBe(2);
  });

  it('cancels later orders for the same building along with the earlier one', () => {
    const state = newWorld();
    const city = capital(state);
    enrich(state);
    queueBuild(state, city.id, 'farm');
    queueBuild(state, city.id, 'farm');
    cancelBuild(state, city.id, city.queue[0]!.id);
    expect(city.queue).toHaveLength(0);
    expect(city.resources.timber).toBe(1e9);
  });

  it('uses the Keep level at the moment a build starts', () => {
    expect(buildDurationMs('farm', 10, 10)).toBeLessThan(buildDurationMs('farm', 10, 1));
  });
});

describe('the economy', () => {
  it('produces from villagers on jobs', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    city.growthAt = null;
    state.events = [];
    for (const r of RESOURCES) city.resources[r] = 0;
    setJobs(state, city.id, { food: 2, timber: 4, metal: 0, wealth: 0 });
    advance(state, T0 + HOUR);
    expect(city.resources.food).toBeCloseTo(60, 6);
    expect(city.resources.timber).toBeCloseTo(120, 6);
    expect(city.resources.metal).toBe(0);
  });

  it('stops at the Storehouse cap and reports what was lost', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    city.growthAt = null;
    state.events = [];
    const cap = storageCap(city.levels.storehouse);
    city.resources.timber = cap - 10;
    setJobs(state, city.id, { food: 0, timber: 6, metal: 0, wealth: 0 });
    const report = advance(state, T0 + HOUR);
    expect(city.resources.timber).toBe(cap);
    expect(report.gained[city.id]!.timber).toBeCloseTo(10, 6);
    expect(report.wasted[city.id]!.timber).toBeCloseTo(170, 6);
  });

  it('never takes away a stockpile that is already over the cap', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.resources.timber = 5000;
    advance(state, T0 + HOUR);
    expect(city.resources.timber).toBe(5000);
  });

  it('applies site traits to production', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = ['fertile'];
    city.jobs = { food: 4, timber: 4, metal: 0, wealth: 0 };
    const rates = cityRates(state, city);
    expect(rates.food).toBeCloseTo(4 * 30 * 1.25, 6);
    expect(rates.timber).toBeCloseTo(4 * 30, 6);
  });

  it('holds the whole empire to the income cap', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    city.levels.lumberCamp = MAX_LEVEL;
    city.villagers = 1000;
    city.jobs = { food: 0, timber: jobSlots(city, 'timber'), metal: 0, wealth: 0 };
    const income = empireIncome(state, city.owner);
    expect(income.cap).toBe(incomeCap(0));
    expect(income.raw.timber).toBeGreaterThan(income.cap);
    expect(cityRates(state, city).timber).toBeCloseTo(income.cap, 6);
    // Markets raise the cap.
    city.levels.market = 10;
    expect(empireIncome(state, city.owner).cap).toBe(incomeCap(10));
  });

  it('fills every job slot when there are villagers to spare', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.villagers = 40;
    autoAssign(city);
    // No Market yet, so three jobs with 6 slots each.
    expect(city.jobs).toEqual({ food: 6, timber: 6, metal: 6, wealth: 0 });
  });

  it('sends villagers where the next orders are short', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    city.levels.farm = city.levels.lumberCamp = city.levels.mine = 8;
    city.villagers = 20;
    // Plenty of food and metal in store, no timber at all.
    city.resources = { food: 5000, timber: 0, metal: 5000, wealth: 0 };
    autoAssign(city);
    expect(city.jobs.timber).toBeGreaterThan(city.jobs.food * 3);
    expect(city.jobs.timber).toBeGreaterThan(city.jobs.metal * 3);
    expect(city.jobs.food + city.jobs.timber + city.jobs.metal).toBe(20);
    // The other jobs keep a trickle going.
    expect(city.jobs.food).toBeGreaterThan(0);
    expect(city.jobs.metal).toBeGreaterThan(0);
    // When timber is in store and metal runs out, they move.
    city.resources = { food: 5000, timber: 5000, metal: 0, wealth: 0 };
    autoAssign(city);
    expect(city.jobs.metal).toBeGreaterThan(city.jobs.timber * 3);
  });

  it('never gives a job more villagers than it has slots, and spills the rest to other jobs', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.levels.lumberCamp = 1; // 6 slots
    city.levels.farm = city.levels.mine = 8;
    city.villagers = 30;
    city.resources = { food: 5000, timber: 0, metal: 5000, wealth: 0 };
    autoAssign(city);
    expect(city.jobs.timber).toBe(6);
    expect(city.jobs.food + city.jobs.timber + city.jobs.metal).toBe(30);
  });

  it('follows the city plan when sharing villagers out', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    for (const b of BUILDINGS) city.levels[b] = 8;
    city.villagers = 60;
    city.resources = { food: 0, timber: 0, metal: 0, wealth: 0 };
    city.plan = 'economy';
    autoAssign(city);
    const economy = { ...city.jobs };
    city.plan = 'barracks';
    autoAssign(city);
    // A Barracks town's next orders cost far more food than an Economy city's.
    expect(city.jobs.food).toBeGreaterThan(economy.food);
  });

  it('rejects job choices the city cannot staff', () => {
    const state = newWorld('plain');
    const city = capital(state);
    expect(setJobs(state, city.id, { food: 99, timber: 0, metal: 0, wealth: 0 }).ok).toBe(false);
    expect(setJobs(state, city.id, { food: 6, timber: 6, metal: 6, wealth: 0 }).ok).toBe(false);
    expect(setJobs(state, city.id, { food: 1.5, timber: 0, metal: 0, wealth: 0 }).ok).toBe(false);
    expect(setAutoAssign(state, city.id, true).ok).toBe(true);
    expect(city.autoAssign).toBe(true);
  });

  it('grows villagers up to the Farm cap and no further', () => {
    const state = newWorld('plain');
    const city = capital(state);
    const cap = populationCap(city.levels.farm);
    const report = advance(state, T0 + 6 * HOUR);
    expect(city.villagers).toBe(cap);
    expect(report.villagersArrived[city.id]).toBe(cap - 12);
    expect(city.growthAt).toBeNull();
    expect(state.events.filter((e) => e.type === 'villagerGrowth')).toHaveLength(0);
  });

  it('starts growing again when the Farm is upgraded', () => {
    const state = newWorld('plain');
    const city = capital(state);
    advance(state, T0 + 6 * HOUR);
    queueBuild(state, city.id, 'farm');
    advance(state, T0 + 12 * HOUR);
    expect(city.levels.farm).toBe(2);
    expect(city.villagers).toBe(populationCap(2));
  });
});

describe('city plans', () => {
  it('founds a city with nothing in store', () => {
    const city = capital(newWorld('scratch'));
    expect(city.resources).toEqual({ food: 0, timber: 0, metal: 0, wealth: 0 });
    // It can still get going: its first villagers are already at work.
    expect(city.jobs.food + city.jobs.timber + city.jobs.metal).toBe(city.villagers);
  });

  it('builds an economy from nothing while you are away', () => {
    const state = newWorld('scratch');
    const city = capital(state);
    setPlan(state, city.id, 'economy');
    expect(city.queue).toHaveLength(0);
    const report = advance(state, T0 + 12 * HOUR);
    expect(report.builds.length).toBeGreaterThan(10);
    expect(city.levels.keep).toBeGreaterThan(1);
  });

  it('keeps the queue full while you are away', () => {
    const state = newWorld('plan');
    const city = capital(state);
    stock(state);
    setPlan(state, city.id, 'economy');
    expect(city.queue).toHaveLength(2);
    expect(city.queue.every((q) => q.byPlan)).toBe(true);
    const report = advance(state, T0 + 12 * HOUR);
    expect(report.builds.length).toBeGreaterThan(15);
    expect(report.builds.every((b) => b.byPlan)).toBe(true);
  });

  it('waits and comes back when it cannot afford the next order', () => {
    const state = newWorld('plan');
    const city = capital(state);
    for (const r of RESOURCES) city.resources[r] = 0;
    setPlan(state, city.id, 'economy');
    expect(city.queue).toHaveLength(0);
    expect(city.planCheckAt).not.toBeNull();
    expect(state.events.filter((e) => e.type === 'planCheck')).toHaveLength(1);
    advance(state, T0 + 3 * HOUR);
    expect(state.stats.buildsCompleted).toBeGreaterThan(0);
  });

  it('never leaves two plan checks pending for one city', () => {
    const state = newWorld('plan');
    const city = capital(state);
    for (const r of RESOURCES) city.resources[r] = 0;
    setPlan(state, city.id, 'economy');
    setPlan(state, city.id, 'fortress');
    setPlan(state, city.id, 'economy');
    expect(state.events.filter((e) => e.type === 'planCheck')).toHaveLength(1);
    setPlan(state, city.id, null);
    expect(state.events.filter((e) => e.type === 'planCheck')).toHaveLength(0);
    expect(city.planCheckAt).toBeNull();
  });

  it('builds a bigger Storehouse first when the next order costs more than the city can hold', () => {
    const state = newWorld('plan');
    const city = capital(state);
    for (const b of BUILDINGS) city.levels[b] = 12;
    city.levels.storehouse = 1;
    city.villagers = 400;
    autoAssign(city);
    for (const r of RESOURCES) city.resources[r] = storageCap(1);
    setPlan(state, city.id, 'economy');
    advance(state, T0 + 12 * HOUR);
    expect(city.levels.storehouse).toBeGreaterThan(1);
  });

  it('pauses when the player cancels one of its orders', () => {
    const state = newWorld('plan');
    const city = capital(state);
    stock(state);
    setPlan(state, city.id, 'economy');
    cancelBuild(state, city.id, city.queue[0]!.id);
    expect(city.plan).toBeNull();
  });

  it('leaves room for the player and works around their orders', () => {
    const state = newWorld('plan');
    const city = capital(state);
    stock(state);
    queueBuild(state, city.id, 'storehouse');
    setPlan(state, city.id, 'economy');
    expect(city.queue[0]!.byPlan).toBe(false);
    expect(city.queue[1]!.byPlan).toBe(true);
    expect(city.plan).toBe('economy');
  });
});
