import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  HOUR,
  SAVE_VERSION,
  advance,
  cancelBuild,
  checksumOf,
  createWorld,
  parseSave,
  populationUsed,
  queueBuild,
  serializeSave,
  setPlan,
} from '../engine';
import type { GameState } from '../engine';
import { GIST_FILENAME, GistBackup, GistError } from './gist';
import type { FetchLike } from './gist';
import { IndexedDbStore, MemoryStore } from './kv';
import type { KeyValueStore } from './kv';
import { LocalSaves, SLOT_KEYS, slotFor } from './localSaves';
import { MemorySettings, SaveManager } from './saveManager';

const T0 = Date.UTC(2026, 0, 1);

function playedWorld(seed = 'save'): GameState {
  const state = createWorld({ seed, wallNow: T0 });
  setPlan(state, state.cities[0]!.id, 'economy');
  advance(state, T0 + 5 * HOUR);
  queueBuild(state, state.cities[0]!.id, 'storehouse');
  return state;
}

describe('the save format', () => {
  it('round-trips a world exactly', () => {
    const state = playedWorld();
    const result = parseSave(serializeSave(state, 7, T0 + 5 * HOUR));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.revision).toBe(7);
    expect(result.save.state).toEqual(state);
  });

  it('plays on identically after a save and load', () => {
    const original = playedWorld();
    const result = parseSave(serializeSave(original, 1, T0 + 5 * HOUR));
    if (!result.ok) throw new Error('save did not load');
    const loaded = result.save.state;
    advance(original, T0 + 40 * HOUR);
    advance(loaded, T0 + 40 * HOUR);
    expect(loaded).toEqual(original);
  });

  it('rejects a save that was cut short', () => {
    const text = serializeSave(playedWorld(), 1, T0);
    expect(parseSave(text.slice(0, text.length - 40))).toEqual({ ok: false, reason: 'not-json' });
  });

  it('rejects a save whose contents were changed', () => {
    const text = serializeSave(playedWorld(), 1, T0);
    const tampered = text.replace('"timber":', '"timber":9');
    expect(tampered).not.toBe(text);
    expect(parseSave(tampered)).toEqual({ ok: false, reason: 'checksum-mismatch' });
  });

  it('rejects things that are not saves', () => {
    expect(parseSave('hello')).toEqual({ ok: false, reason: 'not-json' });
    expect(parseSave('{"a":1}')).toEqual({ ok: false, reason: 'not-a-save' });
    expect(parseSave('[]')).toEqual({ ok: false, reason: 'not-a-save' });
  });

  it('refuses a save from a newer version of the game instead of mangling it', () => {
    const save = JSON.parse(serializeSave(playedWorld(), 1, T0));
    save.version = 999;
    expect(parseSave(JSON.stringify(save))).toEqual({ ok: false, reason: 'from-newer-version' });
  });

  it('rejects a save with a valid checksum but a broken shape', () => {
    const save = JSON.parse(serializeSave(playedWorld(), 1, T0));
    delete save.state.cities[0].resources;
    // Recompute the checksum the way a buggy writer would have.
    const good = JSON.parse(serializeSave(save.state, 1, T0));
    expect(parseSave(JSON.stringify(good))).toEqual({ ok: false, reason: 'invalid-state' });
  });
});

describe('saves from older versions', () => {
  // A real save written by the version 1 rules, when cities had villagers and jobs.
  const v1Text = readFileSync(new URL('../engine/fixtures/save-v1.json', import.meta.url), 'utf8');
  const v1 = JSON.parse(v1Text);

  it('loads a version 1 save and keeps the city', () => {
    expect(v1.version).toBe(1);
    const result = parseSave(v1Text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = v1.state.cities[0];
    const after = result.save.state.cities[0]!;
    expect(result.save.version).toBe(SAVE_VERSION);
    expect(result.save.revision).toBe(v1.revision);
    expect(result.save.state.worldId).toBe(v1.state.worldId);
    expect(after.name).toBe(before.name);
    expect(after.levels).toMatchObject(before.levels);
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(total(after.resources)).toBeCloseTo(total(before.resources), 6);
    expect(after.plan).toBe(before.plan);
    expect(after.traits).toEqual(before.traits);
    expect(result.save.state.clock).toEqual(v1.state.clock);
    // The parts the new rules dropped are gone.
    for (const gone of ['villagers', 'villagerCarry', 'jobs', 'autoAssign', 'growthAt']) {
      expect(before).toHaveProperty(gone);
      expect(after).not.toHaveProperty(gone);
    }
  });

  it('plays on under the new rules after loading', () => {
    const result = parseSave(v1Text);
    if (!result.ok) throw new Error('version 1 save did not load');
    const state = result.save.state;
    const city = state.cities[0]!;
    const levelsBefore = Object.values(city.levels).reduce((a, b) => a + b, 0);
    advance(state, v1.savedAtWall + 10 * HOUR);
    expect(Object.values(city.levels).reduce((a, b) => a + b, 0)).toBeGreaterThan(levelsBefore);
    expect(populationUsed(city)).toBeGreaterThan(0);
    // And saves and loads cleanly as a current save.
    expect(parseSave(serializeSave(state, result.save.revision + 1, 0)).ok).toBe(true);
  });

  it('drops villager events an old save still had pending', () => {
    const old = structuredClone(v1);
    old.state.events.push({ id: 99999, at: old.state.clock.gameTime + 1000, type: 'villagerGrowth', cityId: old.state.cities[0].id });
    old.checksum = checksumOf(old.state);
    const result = parseSave(JSON.stringify(old));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.save.state.events.some((e) => (e.type as string) === 'villagerGrowth')).toBe(false);
    advance(result.save.state, old.savedAtWall + HOUR);
  });

  // A real save written by the version 2 rules: four resources, no Quarry, orders in the queue.
  const v2Text = readFileSync(new URL('../engine/fixtures/save-v2.json', import.meta.url), 'utf8');
  const v2 = JSON.parse(v2Text);

  it('loads a version 2 save into three resources without throwing anything away', () => {
    expect(v2.version).toBe(2);
    const result = parseSave(v2Text);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const before = v2.state.cities[0];
    const after = result.save.state.cities[0]!;
    expect(result.save.state.worldId).toBe(v2.state.worldId);
    expect(after.name).toBe(before.name);
    expect(Object.keys(after.resources).sort()).toEqual(['metal', 'stone', 'timber']);
    // Everything the city owned is still there, just counted in three resources.
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    expect(total(after.resources)).toBeCloseTo(total(before.resources), 6);
    expect(after.resources.timber).toBeGreaterThanOrEqual(before.resources.timber);
    expect(after.resources.metal).toBeGreaterThanOrEqual(before.resources.metal);
    // Every old building keeps its level, and the new Quarry matches the others.
    for (const [building, level] of Object.entries(before.levels)) {
      expect(after.levels[building as keyof typeof after.levels], building).toBe(level);
    }
    expect(after.levels.quarry).toBe(Math.min(before.levels.lumberCamp, before.levels.mine));
  });

  it('keeps queued orders and refunds them at full value', () => {
    const result = parseSave(v2Text);
    if (!result.ok) throw new Error('version 2 save did not load');
    const state = result.save.state;
    const city = state.cities[0]!;
    const before = v2.state.cities[0];
    expect(city.queue.map((q) => q.building)).toEqual(before.queue.map((q: { building: string }) => q.building));
    const total = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    const paid = total(before.queue[1].cost);
    const stock = total(city.resources);
    advance(state, state.clock.lastWall);
    expect(cancelBuild(state, city.id, city.queue[1]!.id).ok).toBe(true);
    expect(total(city.resources)).toBeCloseTo(stock + paid, 6);
  });

  it('plays on after loading a version 2 save', () => {
    const result = parseSave(v2Text);
    if (!result.ok) throw new Error('version 2 save did not load');
    const state = result.save.state;
    const city = state.cities[0]!;
    setPlan(state, city.id, 'economy');
    const levelsBefore = Object.values(city.levels).reduce((a, b) => a + b, 0);
    advance(state, v2.savedAtWall + 12 * HOUR);
    expect(Object.values(city.levels).reduce((a, b) => a + b, 0)).toBeGreaterThan(levelsBefore);
    for (const r of Object.values(city.resources)) expect(Number.isFinite(r)).toBe(true);
    expect(parseSave(serializeSave(state, result.save.revision + 1, 0)).ok).toBe(true);
  });

  it('still catches a damaged version 1 save', () => {
    expect(parseSave(v1Text.replace('"timber":', '"timber":9'))).toEqual({ ok: false, reason: 'checksum-mismatch' });
  });
});

function stores(): { memory: MemoryStore; idb: IndexedDbStore; all: KeyValueStore[] } {
  const memory = new MemoryStore('localStorage');
  const idb = new IndexedDbStore(new IDBFactory(), 'test');
  return { memory, idb, all: [idb, memory] };
}

describe('local save copies', () => {
  it('alternates between two slots', () => {
    expect(slotFor(1)).not.toBe(slotFor(2));
    expect(slotFor(1)).toBe(slotFor(3));
  });

  it('writes to every store and loads the newest copy', async () => {
    const { memory, idb, all } = stores();
    const saves = new LocalSaves(all);
    const state = playedWorld();
    await saves.write(serializeSave(state, 1, T0), 1);
    advance(state, T0 + 9 * HOUR);
    const outcomes = await saves.write(serializeSave(state, 2, T0 + 9 * HOUR), 2);
    expect(outcomes.every((o) => o.ok)).toBe(true);
    expect(await idb.get(slotFor(1))).not.toBeNull();
    expect(await memory.get(slotFor(2))).not.toBeNull();
    const best = await saves.readBest();
    expect(best.save?.revision).toBe(2);
    expect(best.save?.state).toEqual(state);
    expect(best.rejected).toEqual([]);
  });

  it('falls back to the older slot when the newest copy is damaged', async () => {
    const { memory, idb, all } = stores();
    const saves = new LocalSaves(all);
    const state = playedWorld();
    await saves.write(serializeSave(state, 1, T0), 1);
    await saves.write(serializeSave(state, 2, T0), 2);
    // The app was killed mid-write: revision 2 is cut short everywhere.
    await idb.set(slotFor(2), '{"format":"valehalla-save","vers');
    await memory.set(slotFor(2), '');
    const best = await saves.readBest();
    expect(best.save?.revision).toBe(1);
    expect(best.rejected.map((r) => r.reason)).toEqual(['not-json', 'not-json']);
  });

  it('survives one store failing completely', async () => {
    const memory = new MemoryStore('localStorage');
    const broken: KeyValueStore = {
      name: 'indexedDB',
      get: async () => {
        throw new Error('database gone');
      },
      set: async () => {
        throw new Error('database gone');
      },
      remove: async () => {},
    };
    const saves = new LocalSaves([broken, memory]);
    const outcomes = await saves.write(serializeSave(playedWorld(), 1, T0), 1);
    expect(outcomes.map((o) => o.ok)).toEqual([false, true]);
    const best = await saves.readBest();
    expect(best.save?.revision).toBe(1);
    expect(best.source?.store).toBe('localStorage');
    expect(best.rejected.every((r) => r.reason === 'read-error')).toBe(true);
  });

  it('reports no save on a fresh phone', async () => {
    const best = await new LocalSaves(stores().all).readBest();
    expect(best.save).toBeNull();
    expect(best.rejected).toEqual([]);
  });

  it('keeps IndexedDB data between connections', async () => {
    const factory = new IDBFactory();
    await new IndexedDbStore(factory, 'persist').set(SLOT_KEYS[0], 'hello');
    expect(await new IndexedDbStore(factory, 'persist').get(SLOT_KEYS[0])).toBe('hello');
    expect(await new IndexedDbStore(factory, 'persist').get('missing')).toBeNull();
  });
});

/** A pretend GitHub that stores gists in memory and speaks the same API shapes. */
function fakeGitHub(options: { token?: string } = {}) {
  const token = options.token ?? 'good-token';
  const gists = new Map<string, { id: string; files: Record<string, { content: string }> }>();
  const calls: string[] = [];
  let nextId = 1;
  let offline = false;
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const fetchImpl: FetchLike = async (url, init) => {
    const method = init?.method ?? 'GET';
    calls.push(`${method} ${url.replace('https://api.github.com', '')}`);
    if (offline) throw new TypeError('Failed to fetch');
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== `Bearer ${token}`) return json(401, { message: 'Bad credentials' });
    const path = url.replace('https://api.github.com', '');
    if (method === 'GET' && path.startsWith('/gists?')) {
      // The list endpoint returns file names but not their contents.
      return json(
        200,
        [...gists.values()].map((g) => ({
          id: g.id,
          files: Object.fromEntries(Object.keys(g.files).map((name) => [name, { filename: name }])),
        })),
      );
    }
    if (method === 'POST' && path === '/gists') {
      const body = JSON.parse(String(init?.body));
      if (body.public !== false) throw new Error('the backup must be a secret gist');
      const id = `gist${nextId++}`;
      gists.set(id, { id, files: body.files });
      return json(201, gists.get(id));
    }
    const match = /^\/gists\/([^/?]+)$/.exec(path);
    if (match) {
      const gist = gists.get(match[1]!);
      if (!gist) return json(404, { message: 'Not Found' });
      if (method === 'GET') return json(200, gist);
      if (method === 'PATCH') {
        Object.assign(gist.files, JSON.parse(String(init?.body)).files);
        return json(200, gist);
      }
    }
    return json(500, { message: 'unhandled' });
  };

  return {
    fetchImpl,
    gists,
    calls,
    setOffline: (value: boolean) => (offline = value),
    saved: (id: string) => gists.get(id)?.files[GIST_FILENAME]?.content ?? null,
  };
}

describe('the Gist backup client', () => {
  it('creates a secret gist on first upload and updates it after', async () => {
    const hub = fakeGitHub();
    const backup = new GistBackup('good-token', hub.fetchImpl);
    const id = await backup.upload('first', null);
    expect(hub.saved(id)).toBe('first');
    expect(await backup.upload('second', id)).toBe(id);
    expect(hub.saved(id)).toBe('second');
    expect(hub.gists.size).toBe(1);
  });

  it('finds the existing backup instead of making a second one', async () => {
    const hub = fakeGitHub();
    const id = await new GistBackup('good-token', hub.fetchImpl).upload('first', null);
    // A new phone: the token is known but not which gist.
    const again = await new GistBackup('good-token', hub.fetchImpl).upload('second', null);
    expect(again).toBe(id);
    expect(hub.gists.size).toBe(1);
  });

  it('recovers when the remembered gist was deleted', async () => {
    const hub = fakeGitHub();
    const backup = new GistBackup('good-token', hub.fetchImpl);
    const id = await backup.upload('first', null);
    hub.gists.delete(id);
    const fresh = await backup.upload('second', id);
    expect(fresh).not.toBe(id);
    expect(hub.saved(fresh)).toBe('second');
  });

  it('downloads the backup, and reports when there is none', async () => {
    const hub = fakeGitHub();
    const backup = new GistBackup('good-token', hub.fetchImpl);
    expect(await backup.download(null)).toBeNull();
    const id = await backup.upload('the save', null);
    expect(await backup.download(null)).toEqual({ gistId: id, text: 'the save' });
    expect(await backup.download(id)).toEqual({ gistId: id, text: 'the save' });
  });

  it('names the problem when the token is wrong or the phone is offline', async () => {
    const hub = fakeGitHub();
    await expect(new GistBackup('wrong', hub.fetchImpl).upload('x', null)).rejects.toMatchObject({
      failure: 'bad-token',
    });
    hub.setOffline(true);
    const error = await new GistBackup('good-token', hub.fetchImpl).upload('x', null).catch((e) => e);
    expect(error).toBeInstanceOf(GistError);
    expect(error.failure).toBe('offline');
  });
});

function manager(hub = fakeGitHub(), settings = new MemorySettings(), kv = stores().all) {
  let clock = T0;
  const saveManager = new SaveManager({
    local: new LocalSaves(kv),
    settings,
    fetchImpl: hub.fetchImpl,
    now: () => (clock += 1000),
  });
  return { saveManager, hub, settings, kv };
}

describe('autosave and cloud backup together', () => {
  it('counts revisions up and loads the latest one after a restart', async () => {
    const { saveManager, kv } = manager();
    const state = playedWorld();
    await saveManager.save(state);
    advance(state, T0 + 8 * HOUR);
    await saveManager.save(state);
    expect(saveManager.status().revision).toBe(2);
    expect(saveManager.status().localFailures).toEqual([]);

    const restarted = manager(fakeGitHub(), new MemorySettings(), kv).saveManager;
    const best = await restarted.load();
    expect(best.save?.state).toEqual(state);
    await restarted.save(state);
    expect(restarted.status().revision).toBe(3);
  });

  it('does nothing in the cloud without a token', async () => {
    const { saveManager, hub } = manager();
    expect(await saveManager.backup(playedWorld())).toEqual({ kind: 'no-token' });
    expect(await saveManager.restore()).toEqual({ kind: 'no-token' });
    expect(hub.calls).toEqual([]);
  });

  it('backs up, then skips the upload when nothing changed', async () => {
    const { saveManager, hub } = manager();
    const state = playedWorld();
    saveManager.setToken('good-token');
    await saveManager.save(state);
    expect((await saveManager.backup(state)).kind).toBe('uploaded');
    const callsAfterFirst = hub.calls.length;
    expect((await saveManager.backup(state)).kind).toBe('up-to-date');
    expect(hub.calls.length).toBe(callsAfterFirst);
    await saveManager.save(state);
    expect((await saveManager.backup(state)).kind).toBe('uploaded');
    expect(saveManager.status().cloudRevision).toBe(2);
  });

  it('restores an empire onto a wiped phone', async () => {
    const hub = fakeGitHub();
    const first = manager(hub);
    const state = playedWorld();
    first.saveManager.setToken('good-token');
    await first.saveManager.save(state);
    await first.saveManager.backup(state);

    // New phone: empty storage, empty settings, only the token pasted in.
    const second = manager(hub);
    expect((await second.saveManager.load()).save).toBeNull();
    second.saveManager.setToken('good-token');
    const outcome = await second.saveManager.restore();
    expect(outcome.kind).toBe('restored');
    if (outcome.kind !== 'restored') return;
    expect(outcome.save.state).toEqual(state);
    await second.saveManager.adopt(outcome.save);
    expect((await second.saveManager.load()).save?.state).toEqual(state);
    expect(second.saveManager.status().revision).toBeGreaterThan(outcome.save.revision);
  });

  it('refuses to overwrite a backed-up empire with a brand new world', async () => {
    const hub = fakeGitHub();
    const first = manager(hub);
    const empire = playedWorld('old-empire');
    first.saveManager.setToken('good-token');
    await first.saveManager.save(empire);
    await first.saveManager.backup(empire);
    const gistId = [...hub.gists.keys()][0]!;
    const backedUp = hub.saved(gistId);

    // The phone was wiped, the game started a fresh world, then the token was pasted.
    const second = manager(hub);
    const fresh = createWorld({ seed: 'fresh', wallNow: T0 });
    await second.saveManager.save(fresh);
    second.saveManager.setToken('good-token');
    const outcome = await second.saveManager.backup(fresh);
    expect(outcome.kind).toBe('conflict');
    if (outcome.kind !== 'conflict') return;
    expect(outcome.remote.worldId).toBe(empire.worldId);
    expect(hub.saved(gistId)).toBe(backedUp);

    // Only an explicit choice replaces it.
    expect((await second.saveManager.backup(fresh, { replace: true })).kind).toBe('uploaded');
    expect(parseSave(hub.saved(gistId)!)).toMatchObject({ ok: true, save: { state: { worldId: fresh.worldId } } });
  });

  it('refuses to overwrite a newer backup of the same empire with an older copy', async () => {
    const hub = fakeGitHub();
    const kv = stores().all;
    const first = manager(hub, new MemorySettings(), kv);
    const state = playedWorld();
    first.saveManager.setToken('good-token');
    await first.saveManager.save(state);
    const older = structuredClone(state);
    for (let i = 0; i < 5; i++) await first.saveManager.save(state);
    await first.saveManager.backup(state);

    // A second device holding an older copy of the same world.
    const second = manager(hub);
    await second.saveManager.save(older);
    second.saveManager.setToken('good-token');
    expect((await second.saveManager.backup(older)).kind).toBe('conflict');
  });

  it('reports a cloud failure without touching the local save', async () => {
    const { saveManager, hub } = manager();
    const state = playedWorld();
    saveManager.setToken('good-token');
    await saveManager.save(state);
    hub.setOffline(true);
    const outcome = await saveManager.backup(state);
    expect(outcome.kind).toBe('error');
    expect(saveManager.status().cloudMessage).toMatch(/No connection/);
    expect((await saveManager.load()).save?.state).toEqual(state);
    hub.setOffline(false);
    expect((await saveManager.backup(state)).kind).toBe('uploaded');
    expect(saveManager.status().cloudMessage).toBeNull();
  });

  it('writes the localStorage copy before it first yields, so closing the app still saves', () => {
    const memory = new MemoryStore('localStorage');
    // A store that behaves like localStorage: the write happens during the call.
    const syncStore: KeyValueStore = {
      name: 'localStorage',
      get: (key) => memory.get(key),
      set: (key, value) => {
        memory.data.set(key, value);
        return Promise.resolve();
      },
      remove: (key) => memory.remove(key),
    };
    const { saveManager } = manager(fakeGitHub(), new MemorySettings(), [syncStore]);
    void saveManager.save(playedWorld());
    // No await: this is the state of things when a pagehide handler returns.
    expect(memory.data.size).toBe(1);
  });
});
