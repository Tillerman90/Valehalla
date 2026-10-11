// Runs the game in the browser: keeps the engine ticking, saves after every
// action, and exposes a snapshot for React to draw.

import {
  MINUTE,
  SECOND,
  advance,
  createWorld,
  emptyReport,
  parseSave,
  randomSeed,
  serializeSave,
  zeroResources,
} from '../engine';
import type { ActionResult, AdvanceReport, GameState, SaveFile } from '../engine';
import { RESOURCES } from '../engine';
import { IndexedDbStore, LocalStorageStore } from '../storage/kv';
import type { KeyValueStore } from '../storage/kv';
import { LocalSaves } from '../storage/localSaves';
import { SaveManager } from '../storage/saveManager';
import type { SaveStatus, SaveSummary, Settings } from '../storage/saveManager';

const TICK_MS = SECOND;
const PERIODIC_SAVE_MS = 15 * SECOND;
const CLOUD_BACKUP_MS = 5 * MINUTE;
const ACTION_SAVE_DELAY_MS = 250;
/** A gap this long counts as having been away and earns an away report. */
const AWAY_REPORT_MS = MINUTE;

export interface Snapshot {
  phase: 'loading' | 'ready';
  state: GameState | null;
  now: number;
  awayReport: AdvanceReport | null;
  save: SaveStatus;
  /** Whether the phone agreed to protect this app's storage from being cleared. Null if it cannot say. */
  storageProtected: boolean | null;
  /** Things the player should know about how the game loaded or saved. */
  notices: string[];
  cloudConflict: SaveSummary | null;
  cloudBusy: boolean;
}

function mergeReports(into: AdvanceReport, from: AdvanceReport): AdvanceReport {
  into.wallElapsedMs += from.wallElapsedMs;
  into.gameElapsedMs += from.gameElapsedMs;
  into.frozenMs += from.frozenMs;
  into.clockWentBackwards ||= from.clockWentBackwards;
  into.builds.push(...from.builds);
  for (const key of ['gained', 'wasted'] as const) {
    for (const [cityId, amounts] of Object.entries(from[key])) {
      const target = (into[key][Number(cityId)] ??= zeroResources());
      for (const r of RESOURCES) target[r] += amounts[r];
    }
  }
  for (const [cityId, n] of Object.entries(from.villagersArrived)) {
    into.villagersArrived[Number(cityId)] = (into.villagersArrived[Number(cityId)] ?? 0) + n;
  }
  return into;
}

function browserSettings(): Settings {
  const prefix = 'valehalla.';
  return {
    get: (key) => {
      try {
        return localStorage.getItem(prefix + key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(prefix + key, value);
      } catch {
        // Storage is unavailable (private mode). The token just will not be remembered.
      }
    },
    remove: (key) => {
      try {
        localStorage.removeItem(prefix + key);
      } catch {
        // Nothing to remove.
      }
    },
  };
}

export class GameController {
  private state: GameState | null = null;
  private phase: Snapshot['phase'] = 'loading';
  private awayReport: AdvanceReport | null = null;
  private storageProtected: boolean | null = null;
  private notices: string[] = [];
  private cloudConflict: SaveSummary | null = null;
  private cloudBusy = false;
  private snapshot: Snapshot;
  private readonly listeners = new Set<() => void>();
  private readonly saves: SaveManager;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private started = false;
  private lastSaveStartedAt = 0;

  constructor() {
    const stores: KeyValueStore[] = [];
    // localStorage goes first: its write is synchronous, so it is the copy
    // that still lands when the app is closed mid-save.
    try {
      stores.push(new LocalStorageStore(window.localStorage));
    } catch {
      this.notices.push('This browser is blocking local storage, so one of the save copies is unavailable.');
    }
    if (typeof indexedDB !== 'undefined') stores.push(new IndexedDbStore(indexedDB));
    this.saves = new SaveManager({
      local: new LocalSaves(stores),
      settings: browserSettings(),
      fetchImpl: (url, init) => fetch(url, init),
      now: () => Date.now(),
    });
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private buildSnapshot(): Snapshot {
    return {
      phase: this.phase,
      state: this.state,
      now: Date.now(),
      awayReport: this.awayReport,
      save: this.saves.status(),
      storageProtected: this.storageProtected,
      notices: this.notices,
      cloudConflict: this.cloudConflict,
      cloudBusy: this.cloudBusy,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    void this.requestProtection();
    const best = await this.saves.load();
    for (const copy of best.rejected) {
      this.notices.push(`A damaged save copy was skipped (${copy.store}, ${copy.reason}).`);
    }
    if (best.save) {
      this.state = best.save.state;
      this.catchUp();
    } else {
      if (best.rejected.length > 0) {
        this.notices.push('No usable save was found on this phone. If you have a cloud backup, restore it below.');
      }
      this.state = createWorld({ seed: randomSeed(), wallNow: Date.now() });
    }
    this.phase = 'ready';
    await this.saveNow();
    this.emit();

    setInterval(() => this.tick(), TICK_MS);
    setInterval(() => void this.saveNow(), PERIODIC_SAVE_MS);
    setInterval(() => void this.backup(), CLOUD_BACKUP_MS);
    setTimeout(() => void this.backup(), 10 * SECOND);
    // Save the instant the app is hidden or closed. On iPhone this is the
    // last moment the page is guaranteed to run.
    const onHide = () => {
      if (document.visibilityState === 'hidden') void this.saveNow();
      else this.tick();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', () => void this.saveNow());
  }

  private async requestProtection(): Promise<void> {
    try {
      if (!navigator.storage?.persist) return;
      this.storageProtected = (await navigator.storage.persisted()) || (await navigator.storage.persist());
      this.emit();
    } catch {
      this.storageProtected = null;
    }
  }

  private noteProgress(report: AdvanceReport): void {
    if (report.wallElapsedMs < AWAY_REPORT_MS) return;
    this.awayReport = this.awayReport ? mergeReports(this.awayReport, report) : mergeReports(emptyReport(), report);
  }

  /**
   * Bring the world up to the present. Every path that advances time goes
   * through here, so a long gap always produces an away report no matter
   * which timer happens to notice it first.
   */
  private catchUp(): void {
    if (this.state) this.noteProgress(advance(this.state, Date.now()));
  }

  private tick(): void {
    if (!this.state) return;
    this.catchUp();
    this.emit();
  }

  /** Run a player action at the present moment, then save. */
  act(action: (state: GameState) => ActionResult): ActionResult {
    if (!this.state) return { ok: false, reason: 'no-such-city' };
    this.catchUp();
    const result = action(this.state);
    if (result.ok) this.scheduleSave();
    this.emit();
    return result;
  }

  dismissAwayReport(): void {
    this.awayReport = null;
    this.emit();
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), ACTION_SAVE_DELAY_MS);
  }

  private async saveNow(): Promise<void> {
    if (!this.state) return;
    // Closing the app fires two events back to back. One save is enough, and
    // writing twice would put the same moment in both rotating slots.
    const now = Date.now();
    if (now - this.lastSaveStartedAt < 300 && this.saveTimer === null) return;
    this.lastSaveStartedAt = now;
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.catchUp();
    const outcomes = await this.saves.save(this.state);
    if (outcomes.length > 0 && outcomes.every((o) => !o.ok)) {
      const message = 'Saving to this phone is failing. Export a save file below so nothing is lost.';
      if (!this.notices.includes(message)) this.notices.push(message);
    }
    this.emit();
  }

  // Cloud backup

  setToken(token: string | null): void {
    this.saves.setToken(token);
    this.cloudConflict = null;
    this.emit();
    if (token) void this.backup();
  }

  async backup(replace = false): Promise<void> {
    if (!this.state || this.cloudBusy || !this.saves.token()) return;
    if (this.cloudConflict && !replace) return;
    this.cloudBusy = true;
    this.emit();
    await this.saveNow();
    const outcome = await this.saves.backup(this.state, { replace });
    this.cloudConflict = outcome.kind === 'conflict' ? outcome.remote : null;
    this.cloudBusy = false;
    this.emit();
  }

  /** Replace the world on this phone with the one in the cloud. */
  async restoreFromCloud(): Promise<string | null> {
    if (this.cloudBusy) return null;
    this.cloudBusy = true;
    this.emit();
    const outcome = await this.saves.restore();
    this.cloudBusy = false;
    let problem: string | null = null;
    if (outcome.kind === 'restored') await this.adopt(outcome.save);
    else if (outcome.kind === 'no-backup') problem = 'There is no backup in this GitHub account yet.';
    else if (outcome.kind === 'unreadable') problem = `The backup could not be read (${outcome.reason}).`;
    else if (outcome.kind === 'error') problem = outcome.message;
    else problem = 'Add a token first.';
    this.emit();
    return problem;
  }

  private async adopt(save: SaveFile): Promise<void> {
    this.state = save.state;
    this.awayReport = null;
    this.cloudConflict = null;
    this.catchUp();
    await this.saves.adopt(save);
  }

  // Save files

  /** The current world as save-file text, in the same format the autosave writes. */
  exportText(): string | null {
    if (!this.state) return null;
    this.catchUp();
    return serializeSave(this.state, this.saves.status().revision, Date.now());
  }

  async importText(text: string): Promise<string | null> {
    const parsed = parseSave(text);
    if (!parsed.ok) return `That file is not a usable Valehalla save (${parsed.reason}).`;
    await this.adopt(parsed.save);
    this.emit();
    return null;
  }

  async startNewWorld(): Promise<void> {
    this.state = createWorld({ seed: randomSeed(), wallNow: Date.now() });
    this.awayReport = null;
    this.cloudConflict = null;
    await this.saveNow();
    this.emit();
  }
}
