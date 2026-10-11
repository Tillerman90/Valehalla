// Small key-value stores the save system writes through. Having one interface
// lets the same save logic run over IndexedDB, localStorage, or memory (tests).

export interface KeyValueStore {
  readonly name: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export class MemoryStore implements KeyValueStore {
  readonly name: string;
  readonly data = new Map<string, string>();
  constructor(name = 'memory') {
    this.name = name;
  }
  async get(key: string) {
    return this.data.get(key) ?? null;
  }
  async set(key: string, value: string) {
    this.data.set(key, value);
  }
  async remove(key: string) {
    this.data.delete(key);
  }
}

/** localStorage is synchronous, which makes it the one write that still lands as the app is closed. */
export class LocalStorageStore implements KeyValueStore {
  readonly name = 'localStorage';
  private readonly storage: Storage;
  private readonly prefix: string;
  constructor(storage: Storage, prefix = 'valehalla.') {
    this.storage = storage;
    this.prefix = prefix;
  }
  getSync(key: string): string | null {
    return this.storage.getItem(this.prefix + key);
  }
  setSync(key: string, value: string): void {
    this.storage.setItem(this.prefix + key, value);
  }
  async get(key: string) {
    return this.getSync(key);
  }
  async set(key: string, value: string) {
    this.setSync(key, value);
  }
  async remove(key: string) {
    this.storage.removeItem(this.prefix + key);
  }
}

export class IndexedDbStore implements KeyValueStore {
  readonly name = 'indexedDB';
  private db: Promise<IDBDatabase> | null = null;
  private readonly factory: IDBFactory;
  private readonly dbName: string;
  constructor(factory: IDBFactory, dbName = 'valehalla') {
    this.factory = factory;
    this.dbName = dbName;
  }

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('IndexedDB failed to open'));
      request.onblocked = () => reject(new Error('IndexedDB is blocked'));
    });
    // If opening failed, let the next call try again instead of caching the failure.
    this.db.catch(() => (this.db = null));
    return this.db;
  }

  private async run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction('kv', mode);
      const request = work(tx.objectStore('kv'));
      // Resolve on transaction completion, so a "saved" write is really on disk.
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  }

  async get(key: string) {
    const value = await this.run<unknown>('readonly', (s) => s.get(key));
    return typeof value === 'string' ? value : null;
  }
  async set(key: string, value: string) {
    await this.run('readwrite', (s) => s.put(value, key));
  }
  async remove(key: string) {
    await this.run('readwrite', (s) => s.delete(key));
  }
}
