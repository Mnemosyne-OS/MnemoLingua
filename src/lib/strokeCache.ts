/**
 * strokeCache.ts — where the downloaded strokes are kept on this computer.
 *
 * IndexedDB of the cartridge frame, and NOT the host's durable state: that
 * blob is capped at 256 KB and already holds the progress (store.ts), and
 * strokes are data anyone can download again. Losing them costs a download,
 * never a learner's history, and the screen then says the strokes are gone
 * and offers the download again (doc 138 §13).
 *
 * 🎭 Three outcomes for a read, never two: what was found, what is missing,
 * and « the cache could not be opened » — which is not « nothing downloaded ».
 */
import { KANJIVG_SOURCE, type StrokeSource } from './strokes';
import { log } from './log';

const DB = 'mnemo-lingua';
const STORE = 'strokes';
/** Source and release are in the key: a new tag is a new download, never a
 *  mix of two releases' strokes. (`kanjivg@r20260714:あ` is the key the
 *  first release wrote; it is unchanged.) */
const keyOf = (char: string, src: StrokeSource): string => `${src.id}@${src.tag}:${char}`;

/** How long IndexedDB may take to answer before it counts as unavailable. */
const OPEN_TIMEOUT_MS = 5_000;

export interface StrokeCache {
  read(chars: readonly string[], source?: StrokeSource): Promise<{ found: Record<string, string[]>; missing: string[] }>;
  write(strokes: Record<string, string[]>, source?: StrokeSource): Promise<void>;
  /** A downloaded dataset (the kanji of a level), or null when absent. */
  readPack(key: string): Promise<unknown>;
  writePack(key: string, value: unknown): Promise<void>;
}

function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: TIMEOUT`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IDB_ERROR'));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('NO_INDEXEDDB'));
  if (!dbPromise) {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { r.result.createObjectStore(STORE); };
    dbPromise = withTimeout(req(r), OPEN_TIMEOUT_MS, 'indexedDB.open').catch((err: unknown) => {
      dbPromise = null; // a failed open may be asked again
      throw err;
    });
  }
  return dbPromise;
}

/** The real cache: survives closing the cartridge, as long as the frame's origin does. */
export const idbStrokeCache: StrokeCache = {
  async read(chars, source = KANJIVG_SOURCE) {
    const db = await open();
    const store = db.transaction(STORE, 'readonly').objectStore(STORE);
    const found: Record<string, string[]> = {};
    const missing: string[] = [];
    const values = await withTimeout(Promise.all(chars.map((c) => req(store.get(keyOf(c, source))))), OPEN_TIMEOUT_MS, 'strokes read');
    chars.forEach((c, k) => {
      const v: unknown = values[k];
      if (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string')) found[c] = v;
      else missing.push(c);
    });
    return { found, missing };
  },
  async write(strokes, source = KANJIVG_SOURCE) {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    for (const [c, s] of Object.entries(strokes)) store.put(s, keyOf(c, source));
    await withTimeout(new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB_WRITE'));
      tx.onabort = () => reject(tx.error ?? new Error('IDB_ABORT'));
    }), OPEN_TIMEOUT_MS, 'strokes write');
    log.info('strokes', 'kept on this computer', { chars: Object.keys(strokes).length });
  },
  async readPack(key) {
    const db = await open();
    const v: unknown = await withTimeout(req(db.transaction(STORE, 'readonly').objectStore(STORE).get(`pack:${key}`)), OPEN_TIMEOUT_MS, 'pack read');
    return v ?? null;
  },
  async writePack(key, value) {
    const db = await open();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, `pack:${key}`);
    await withTimeout(new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IDB_WRITE'));
      tx.onabort = () => reject(tx.error ?? new Error('IDB_ABORT'));
    }), OPEN_TIMEOUT_MS, 'pack write');
    log.info('pack', 'kept on this computer', { key });
  },
};

/** A cache that forgets at the end of the session: tests, and frames that
 *  have no IndexedDB at all. An IndexedDB that exists but fails to open does
 *  NOT fall back here: the failure is shown (« cannot keep the strokes »). */
export function memoryStrokeCache(): StrokeCache {
  const map = new Map<string, string[]>();
  const packs = new Map<string, unknown>();
  return {
    readPack(key) { return Promise.resolve(packs.get(key) ?? null); },
    writePack(key, value) { packs.set(key, value); return Promise.resolve(); },
    read(chars, source = KANJIVG_SOURCE) {
      const found: Record<string, string[]> = {};
      const missing: string[] = [];
      for (const c of chars) { const v = map.get(keyOf(c, source)); if (v) found[c] = v; else missing.push(c); }
      return Promise.resolve({ found, missing });
    },
    write(strokes, source = KANJIVG_SOURCE) {
      for (const [c, s] of Object.entries(strokes)) map.set(keyOf(c, source), s);
      return Promise.resolve();
    },
  };
}

let current: StrokeCache | null = null;

/** The cache this frame uses: IndexedDB when it exists, else one session.
 *  Chosen once, lazily, so tests can reset it. */
export function strokeCache(): StrokeCache {
  current ??= typeof indexedDB !== 'undefined' ? idbStrokeCache : memoryStrokeCache();
  return current;
}

/** Test seam: forget the session cache between tests. */
export function __resetStrokeCacheForTests(): void {
  current = null;
}
