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
  buildDurationMs,
  cancelBuild,
  cityRates,
  createWorld,
  empireIncome,
  incomeCap,
  populationCap,
  populationForLevel,
  populationFree,
  populationUsed,
  productionPerHour,
  rawRates,
  queueBuild,
  queueSlots,
  rngFor,
  rollSiteTraits,
  runUntil,
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
    capital(state).levels.farm = 15;
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
  it('produces from building levels, with nobody to assign', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    city.resources = { food: 0, timber: 0, metal: 0, wealth: 0 };
    city.levels.lumberCamp = 3;
    advance(state, T0 + HOUR);
    expect(city.resources.food).toBeCloseTo(productionPerHour('food', 1), 6);
    expect(city.resources.timber).toBeCloseTo(productionPerHour('timber', 3), 6);
    // No Market, no Wealth.
    expect(city.resources.wealth).toBe(0);
  });

  it('produces more with every level', () => {
    for (const r of RESOURCES) {
      expect(productionPerHour(r, 0)).toBe(0);
      for (let level = 2; level <= MAX_LEVEL; level++) {
        expect(productionPerHour(r, level)).toBeGreaterThan(productionPerHour(r, level - 1));
      }
    }
  });

  it('stops at the Storehouse cap and reports what was lost', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    const cap = storageCap(city.levels.storehouse);
    city.resources.timber = cap - 10;
    const report = advance(state, T0 + HOUR);
    expect(city.resources.timber).toBe(cap);
    expect(report.gained[city.id]!.timber).toBeCloseTo(10, 6);
    expect(report.wasted[city.id]!.timber).toBeCloseTo(productionPerHour('timber', 1) - 10, 6);
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
    const rates = cityRates(state, city);
    expect(rates.food).toBeCloseTo(productionPerHour('food', 1) * 1.25, 6);
    expect(rates.timber).toBeCloseTo(productionPerHour('timber', 1), 6);
  });

  it('holds the whole empire to the income cap', () => {
    const state = newWorld('plain');
    const city = capital(state);
    city.traits = [];
    city.levels.lumberCamp = MAX_LEVEL;
    const income = empireIncome(state, city.owner);
    expect(income.cap).toBe(incomeCap(0));
    expect(income.raw.timber).toBeGreaterThan(income.cap);
    expect(cityRates(state, city).timber).toBeCloseTo(income.cap, 6);
    expect(rawRates(city).timber).toBeGreaterThan(income.cap);
    // Markets raise the cap.
    city.levels.market = 10;
    expect(empireIncome(state, city.owner).cap).toBe(incomeCap(10));
  });

  it('founds a city with a small stockpile and room to grow', () => {
    const city = capital(newWorld('start'));
    // Enough for its first orders straight away.
    for (const b of ['farm', 'lumberCamp', 'storehouse'] as const) {
      const cost = upgradeCost(b, 2);
      for (const r of RESOURCES) expect(city.resources[r]).toBeGreaterThanOrEqual(cost[r]);
    }
    // But not so much that the Storehouse is full or the Court is in reach.
    for (const r of RESOURCES) expect(city.resources[r]).toBeLessThan(storageCap(1));
    expect(populationFree(city)).toBeGreaterThan(0);
  });
});

describe('population', () => {
  it('counts the people every building level needs, including queued orders', () => {
    const state = newWorld('people');
    const city = capital(state);
    const before = populationUsed(city);
    expect(before).toBe(populationForLevel('keep', 1) + populationForLevel('lumberCamp', 1) + populationForLevel('mine', 1));
    stock(state);
    queueBuild(state, city.id, 'mine');
    expect(populationUsed(city)).toBe(before + populationForLevel('mine', 2));
  });

  it('refuses a building the Farm cannot staff, and a bigger Farm fixes it', () => {
    const state = newWorld('people');
    const city = capital(state);
    enrich(state);
    for (const b of BUILDINGS) city.levels[b] = 10;
    city.levels.farm = 1;
    expect(populationFree(city)).toBeLessThan(0);
    expect(queueBuild(state, city.id, 'keep')).toEqual({ ok: false, reason: 'farm-too-small' });
    // The Farm itself needs nobody, so it can always be raised.
    expect(queueBuild(state, city.id, 'farm')).toEqual({ ok: true });
    city.queue = [];
    state.events = [];
    city.levels.farm = 12;
    expect(queueBuild(state, city.id, 'keep')).toEqual({ ok: true });
  });

  it('gives a fully built city room left over for an army', () => {
    const city = capital(newWorld('people'));
    for (const b of BUILDINGS) city.levels[b] = MAX_LEVEL;
    expect(populationFree(city)).toBeGreaterThan(populationCap(MAX_LEVEL) * 0.4);
  });

  it('never needs more people than the Farm at the same level provides', () => {
    const city = capital(newWorld('people'));
    for (let level = 1; level <= MAX_LEVEL; level++) {
      for (const b of BUILDINGS) city.levels[b] = level;
      expect(populationFree(city), `level ${level}`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('city plans', () => {
  it('builds an economy from an empty Storehouse while you are away', () => {
    const state = newWorld('scratch');
    const city = capital(state);
    city.resources = { food: 0, timber: 0, metal: 0, wealth: 0 };
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
    for (const r of RESOURCES) city.resources[r] = storageCap(1);
    setPlan(state, city.id, 'economy');
    advance(state, T0 + 12 * HOUR);
    expect(city.levels.storehouse).toBeGreaterThan(1);
  });

  it('builds a bigger Farm first when the next order has nobody to staff it', () => {
    const state = newWorld('plan');
    const city = capital(state);
    for (const b of BUILDINGS) city.levels[b] = 9;
    city.levels.farm = 2;
    enrich(state);
    setPlan(state, city.id, 'economy');
    expect(city.queue.length).toBeGreaterThan(0);
    expect(city.queue.every((q) => q.building === 'farm')).toBe(true);
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
