// Local save copies. Each store keeps two rotating slots, so a write that is
// cut off (app killed mid-save) can only damage one copy and the other still
// loads. Loading reads every copy from every store and takes the newest one
// that passes its checksum.

import { parseSave } from '../engine/save';
import type { LoadFailure, SaveFile } from '../engine/save';
import type { KeyValueStore } from './kv';

export const SLOT_KEYS = ['save.slot0', 'save.slot1'] as const;

export function slotFor(revision: number): string {
  return SLOT_KEYS[revision % SLOT_KEYS.length]!;
}

export interface WriteOutcome {
  store: string;
  ok: boolean;
  error?: string;
}

export interface RejectedCopy {
  store: string;
  slot: string;
  reason: LoadFailure | 'read-error';
}

export interface BestSave {
  save: SaveFile | null;
  source: { store: string; slot: string } | null;
  /** Copies that existed but could not be used. Shown to the player, never silently dropped. */
  rejected: RejectedCopy[];
}

export class LocalSaves {
  private readonly stores: KeyValueStore[];
  constructor(stores: KeyValueStore[]) {
    this.stores = stores;
  }

  /** Write to every store. One store failing never stops the others. */
  async write(text: string, revision: number): Promise<WriteOutcome[]> {
    const slot = slotFor(revision);
    return Promise.all(
      this.stores.map(async (store): Promise<WriteOutcome> => {
        try {
          await store.set(slot, text);
          return { store: store.name, ok: true };
        } catch (error) {
          return { store: store.name, ok: false, error: String(error) };
        }
      }),
    );
  }

  async readBest(): Promise<BestSave> {
    const best: BestSave = { save: null, source: null, rejected: [] };
    for (const store of this.stores) {
      for (const slot of SLOT_KEYS) {
        let text: string | null;
        try {
          text = await store.get(slot);
        } catch {
          best.rejected.push({ store: store.name, slot, reason: 'read-error' });
          continue;
        }
        if (text === null) continue;
        const result = parseSave(text);
        if (!result.ok) {
          best.rejected.push({ store: store.name, slot, reason: result.reason });
          continue;
        }
        if (!best.save || result.save.revision > best.save.revision) {
          best.save = result.save;
          best.source = { store: store.name, slot };
        }
      }
    }
    return best;
  }

  async clear(): Promise<void> {
    for (const store of this.stores) {
      for (const slot of SLOT_KEYS) {
        try {
          await store.remove(slot);
        } catch {
          // Nothing useful to do: the next write overwrites it anyway.
        }
      }
    }
  }
}
