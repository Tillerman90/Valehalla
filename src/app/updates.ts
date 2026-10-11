// Tracks whether a newer version of the game has been downloaded and is
// waiting. The player chooses when to switch to it.

type Listener = () => void;

let apply: (() => void) | null = null;
const listeners = new Set<Listener>();

export const updates = {
  /** Called by the service worker registration when a new version is ready. */
  ready(applyUpdate: () => void): void {
    apply = applyUpdate;
    for (const listener of listeners) listener();
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  isReady: (): boolean => apply !== null,
  apply(): void {
    apply?.();
  },
};
