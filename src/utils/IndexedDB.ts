/**
 * Small key/value persistence wrapper backed by IndexedDB.
 *
 * Reliability note: when IndexedDB is unavailable (SSR, jsdom, some locked-down
 * or private-mode browsers) this falls back to localStorage instead of silently
 * becoming a no-op, so offline persistence keeps working everywhere a Web
 * Storage API exists. On the server (no `window`) it is a safe no-op.
 */
export class IndexedDBStorage {
  private dbName: string;
  private storeName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;
  private useFallback = false;

  constructor(dbName = 'MinderDB', storeName = 'offline_store') {
    this.dbName = dbName;
    this.storeName = storeName;

    if (typeof window === 'undefined') return; // SSR: no persistence layer

    if (typeof indexedDB !== 'undefined') {
      this.init();
    } else if (window.localStorage) {
      this.useFallback = true;
    }
  }

  private fallbackKey(key: string): string {
    return `minder:idb:${this.dbName}:${this.storeName}:${key}`;
  }

  private init(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
    });

    return this.dbPromise;
  }

  async get<T>(key: string): Promise<T | null> {
    if (this.useFallback) {
      try {
        const raw = window.localStorage.getItem(this.fallbackKey(key));
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    }

    if (!this.dbPromise) return null;
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get(key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result !== undefined ? request.result : null);
      });
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    if (this.useFallback) {
      try {
        window.localStorage.setItem(this.fallbackKey(key), JSON.stringify(value));
      } catch {
        // quota exceeded / value not serializable — drop silently
      }
      return;
    }

    if (!this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put(value, key);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch {
      return;
    }
  }

  async clear(): Promise<void> {
    if (this.useFallback) {
      try {
        const prefix = this.fallbackKey('');
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(prefix)) window.localStorage.removeItem(k);
        }
      } catch {
        // ignore
      }
      return;
    }

    if (!this.dbPromise) return;
    try {
      const db = await this.dbPromise;
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.clear();

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve();
      });
    } catch {
      return;
    }
  }
}
