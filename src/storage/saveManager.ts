// Ties the save layers together: autosave to the phone, backup to the cloud,
// and restore. The rule that shapes everything here is that progress must
// never be lost or silently replaced.

import { parseSave, serializeSave } from '../engine/save';
import type { SaveFile } from '../engine/save';
import type { GameState } from '../engine/types';
import { GistBackup, describeGistFailure } from './gist';
import type { FetchLike } from './gist';
import type { BestSave, LocalSaves, WriteOutcome } from './localSaves';

/** Small synchronous settings (token, Gist id). Backed by localStorage in the app. */
export interface Settings {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export class MemorySettings implements Settings {
  readonly data = new Map<string, string>();
  get(key: string) {
    return this.data.get(key) ?? null;
  }
  set(key: string, value: string) {
    this.data.set(key, value);
  }
  remove(key: string) {
    this.data.delete(key);
  }
}

const TOKEN_KEY = 'cloud.token';
const GIST_ID_KEY = 'cloud.gistId';
const CLOUD_WORLD_KEY = 'cloud.worldId';

export interface SaveSummary {
  worldId: string;
  revision: number;
  savedAtWall: number;
  cities: number;
  gameTime: number;
}

export function summarize(save: SaveFile): SaveSummary {
  return {
    worldId: save.state.worldId,
    revision: save.revision,
    savedAtWall: save.savedAtWall,
    cities: save.state.cities.length,
    gameTime: save.state.clock.gameTime,
  };
}

export type BackupOutcome =
  | { kind: 'uploaded'; revision: number; at: number }
  | { kind: 'up-to-date' }
  | { kind: 'no-token' }
  /** The cloud holds a different or newer empire. Nothing was overwritten. */
  | { kind: 'conflict'; remote: SaveSummary }
  | { kind: 'error'; message: string };

export type RestoreOutcome =
  | { kind: 'restored'; save: SaveFile }
  | { kind: 'no-token' }
  | { kind: 'no-backup' }
  | { kind: 'unreadable'; reason: string }
  | { kind: 'error'; message: string };

export interface SaveStatus {
  revision: number;
  lastLocalSaveAt: number | null;
  /** Stores that failed on the most recent save. Empty means every copy landed. */
  localFailures: WriteOutcome[];
  lastCloudAt: number | null;
  cloudRevision: number | null;
  cloudMessage: string | null;
  hasToken: boolean;
}

export interface SaveManagerDeps {
  local: LocalSaves;
  settings: Settings;
  fetchImpl: FetchLike;
  now: () => number;
}

export class SaveManager {
  private readonly deps: SaveManagerDeps;
  private revision = 0;
  private lastLocalSaveAt: number | null = null;
  private localFailures: WriteOutcome[] = [];
  private lastCloudAt: number | null = null;
  private cloudRevision: number | null = null;
  private cloudMessage: string | null = null;
  private backupInFlight: Promise<BackupOutcome> | null = null;

  constructor(deps: SaveManagerDeps) {
    this.deps = deps;
  }

  status(): SaveStatus {
    return {
      revision: this.revision,
      lastLocalSaveAt: this.lastLocalSaveAt,
      localFailures: this.localFailures,
      lastCloudAt: this.lastCloudAt,
      cloudRevision: this.cloudRevision,
      cloudMessage: this.cloudMessage,
      hasToken: this.token() !== null,
    };
  }

  token(): string | null {
    const token = this.deps.settings.get(TOKEN_KEY);
    return token && token.trim() ? token.trim() : null;
  }

  setToken(token: string | null): void {
    const { settings } = this.deps;
    if (token && token.trim()) settings.set(TOKEN_KEY, token.trim());
    else settings.remove(TOKEN_KEY);
    // A different token may belong to a different account, so forget which
    // Gist and which world we believed the cloud was holding.
    settings.remove(GIST_ID_KEY);
    settings.remove(CLOUD_WORLD_KEY);
    this.cloudRevision = null;
    this.cloudMessage = null;
  }

  /** Read the newest valid local copy and continue its revision count. */
  async load(): Promise<BestSave> {
    const best = await this.deps.local.readBest();
    if (best.save) this.revision = best.save.revision;
    return best;
  }

  /**
   * Save now. The localStorage copy is written before this function first
   * yields, so calling it as the app is being closed still lands one copy.
   */
  async save(state: GameState): Promise<WriteOutcome[]> {
    const at = this.deps.now();
    const revision = ++this.revision;
    const text = serializeSave(state, revision, at);
    const outcomes = await this.deps.local.write(text, revision);
    // A slower, older save must not overwrite the status of a newer one.
    if (revision === this.revision) {
      this.localFailures = outcomes.filter((o) => !o.ok);
      if (outcomes.some((o) => o.ok)) this.lastLocalSaveAt = at;
    }
    return outcomes;
  }

  /** Continue from a save that came from elsewhere (cloud or file), never going back in revision. */
  async adopt(save: SaveFile): Promise<void> {
    this.revision = Math.max(this.revision, save.revision);
    await this.save(save.state);
  }

  private gist(): GistBackup | null {
    const token = this.token();
    return token ? new GistBackup(token, this.deps.fetchImpl) : null;
  }

  /**
   * Copy the current world to the cloud.
   *
   * Before the first upload for a world, the cloud is checked. If it already
   * holds a different empire, or a newer copy of this one, nothing is written
   * and a conflict is returned so the player decides. Pass replace to overwrite.
   */
  backup(state: GameState, options: { replace?: boolean } = {}): Promise<BackupOutcome> {
    if (this.backupInFlight) return this.backupInFlight;
    this.backupInFlight = this.runBackup(state, options.replace ?? false).finally(() => {
      this.backupInFlight = null;
    });
    return this.backupInFlight;
  }

  private async runBackup(state: GameState, replace: boolean): Promise<BackupOutcome> {
    const gist = this.gist();
    if (!gist) return { kind: 'no-token' };
    const { settings, now } = this.deps;
    try {
      let gistId = settings.get(GIST_ID_KEY);
      const cloudKnowsThisWorld = settings.get(CLOUD_WORLD_KEY) === state.worldId;
      if (!replace && !cloudKnowsThisWorld) {
        const remote = await gist.download(gistId);
        if (remote) {
          gistId = remote.gistId;
          settings.set(GIST_ID_KEY, gistId);
          const parsed = parseSave(remote.text);
          if (parsed.ok) {
            const differentWorld = parsed.save.state.worldId !== state.worldId;
            if (differentWorld || parsed.save.revision > this.revision) {
              this.cloudMessage = 'The cloud holds a different or newer empire. Nothing was overwritten.';
              return { kind: 'conflict', remote: summarize(parsed.save) };
            }
          }
        }
      }
      if (cloudKnowsThisWorld && this.cloudRevision === this.revision) return { kind: 'up-to-date' };
      const at = now();
      const revision = this.revision;
      const text = serializeSave(state, revision, at);
      gistId = await gist.upload(text, gistId);
      settings.set(GIST_ID_KEY, gistId);
      settings.set(CLOUD_WORLD_KEY, state.worldId);
      this.lastCloudAt = at;
      this.cloudRevision = revision;
      this.cloudMessage = null;
      return { kind: 'uploaded', revision, at };
    } catch (error) {
      this.cloudMessage = describeGistFailure(error);
      return { kind: 'error', message: this.cloudMessage };
    }
  }

  /** Fetch the cloud copy. The caller decides whether to play from it. */
  async restore(): Promise<RestoreOutcome> {
    const gist = this.gist();
    if (!gist) return { kind: 'no-token' };
    const { settings } = this.deps;
    try {
      const remote = await gist.download(settings.get(GIST_ID_KEY));
      if (!remote) return { kind: 'no-backup' };
      settings.set(GIST_ID_KEY, remote.gistId);
      const parsed = parseSave(remote.text);
      if (!parsed.ok) return { kind: 'unreadable', reason: parsed.reason };
      settings.set(CLOUD_WORLD_KEY, parsed.save.state.worldId);
      this.cloudRevision = parsed.save.revision;
      this.lastCloudAt = parsed.save.savedAtWall;
      this.cloudMessage = null;
      return { kind: 'restored', save: parsed.save };
    } catch (error) {
      this.cloudMessage = describeGistFailure(error);
      return { kind: 'error', message: this.cloudMessage };
    }
  }
}
