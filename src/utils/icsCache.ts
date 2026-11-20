import type { SyncResponse } from '../types/calendar';

const FAST_CACHE_KEY = 'cloudplan_schedule_cache_v1';
const DB_NAME = 'andrewsplan_ics_cache_db';
const DB_VERSION = 1;
const STORE_NAME = 'schedules';

export interface CachedIcsSnapshot extends SyncResponse {
  username?: string;
  cachedAt: string;
  isTrimmed?: boolean;
}

function normalizeUsername(username?: string | null): string {
  return (username ?? '').trim().toLowerCase();
}

function getDbRecordKey(username?: string | null): string {
  const norm = normalizeUsername(username);
  return norm ? `ics:${norm}` : 'ics:default';
}

function isValidSchedulePayload(value: unknown): value is CachedIcsSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<CachedIcsSnapshot>;
  return Array.isArray(candidate.events);
}

function matchesUser(snapshot: CachedIcsSnapshot, username?: string | null): boolean {
  const requested = normalizeUsername(username);
  const stored = normalizeUsername(snapshot.username);
  if (!requested || !stored) return true;
  return requested === stored;
}

function buildTrimmedSnapshot(snapshot: CachedIcsSnapshot): CachedIcsSnapshot {
  const cutoffMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentOrFuture = snapshot.events
    .filter((ev) => {
      const endMs = Date.parse(ev.end || ev.start);
      return Number.isNaN(endMs) || endMs >= cutoffMs;
    })
    .slice(0, 250);

  return {
    ...snapshot,
    events: recentOrFuture,
    isTrimmed: true,
  };
}

/**
 * Synchronous read from localStorage for zero-flash initial render on startup.
 */
export function readFastIcsCache(username?: string | null): CachedIcsSnapshot | null {
  try {
    const raw = localStorage.getItem(FAST_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSchedulePayload(parsed)) return null;
    if (!matchesUser(parsed, username)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeFastIcsCache(snapshot: CachedIcsSnapshot): void {
  try {
    localStorage.setItem(FAST_CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Fallback when full ICS feed exceeds localStorage's ~5MB quota:
    // store a trimmed recent+upcoming window for instant first paint while IndexedDB holds the full dataset.
    try {
      const trimmed = buildTrimmedSnapshot(snapshot);
      localStorage.setItem(FAST_CACHE_KEY, JSON.stringify(trimmed));
    } catch {
      // Ignore storage quota errors
    }
  }
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function readFromIndexedDb(key: string): Promise<CachedIcsSnapshot | null> {
  const db = await openCacheDb();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        const val = req.result as unknown;
        resolve(isValidSchedulePayload(val) ? val : null);
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
      tx.onabort = () => db.close();
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function writeToIndexedDb(key: string, snapshot: CachedIcsSnapshot): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(snapshot, key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

async function clearIndexedDb(): Promise<void> {
  const db = await openCacheDb();
  if (!db) return;

  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Persists the fetched ICS schedule to both synchronous localStorage (instant startup)
 * and durable high-capacity IndexedDB (full dataset resilience).
 */
export async function savePersistedIcsCache(
  schedule: SyncResponse,
  username?: string | null
): Promise<void> {
  const snapshot: CachedIcsSnapshot = {
    ...schedule,
    username: normalizeUsername(username) || undefined,
    cachedAt: new Date().toISOString(),
    isTrimmed: false,
  };

  writeFastIcsCache(snapshot);
  await writeToIndexedDb(getDbRecordKey(username), snapshot);
}

/**
 * Reads the full persisted ICS snapshot from IndexedDB (falling back to localStorage).
 */
export async function readFullPersistedIcsCache(
  username?: string | null
): Promise<CachedIcsSnapshot | null> {
  const dbSnapshot = await readFromIndexedDb(getDbRecordKey(username));
  if (dbSnapshot && matchesUser(dbSnapshot, username)) {
    return dbSnapshot;
  }
  return readFastIcsCache(username);
}

export async function clearPersistedIcsCache(): Promise<void> {
  try {
    localStorage.removeItem(FAST_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
  await clearIndexedDb();
}
