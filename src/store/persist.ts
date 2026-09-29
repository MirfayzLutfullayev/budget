// Ma'lumotni yo'qotmaslik uchun saqlash qatlami:
//  1) Asosiy nusxa — IndexedDB, zaxira ko'zgu — localStorage (ikkalasiga birga yoziladi).
//  2) Yuklashda ikkalasidan eng yangisi olinadi (biri buzilsa ham ikkinchisi qoladi).
//  3) Avtomatik nusxalar (snapshot): har kuni + har bir xavfli amaldan oldin.
//  4) 1-versiyadan ko'chirilganda asl ma'lumot arxivda umrbod saqlanadi.
//  5) Brauzerdan "persistent storage" so'raladi — tizim ma'lumotni o'zi o'chirmasligi uchun.

import type { State } from '../domain/types';
import { emptyState, normalize } from '../domain/defaults';
import { isV1, migrateV1 } from '../domain/migrate';
import { today } from '../lib/format';

export const LS_KEY = 'budget-manager.v2';
export const LEGACY_KEY = 'budget-manager.v1';
const DB_NAME = 'budget-manager';
const DB_VERSION = 1;

export type SnapshotReason = 'daily' | 'manual' | 'before-import' | 'before-restore' | 'before-reset' | 'before-setup' | 'v1-archive';

export interface Snapshot {
  id: string;
  createdAt: number;
  day: string;
  reason: SnapshotReason;
  transactions: number;
  data: unknown;
}

let dbPromise: Promise<IDBDatabase | null> | null = null;
/** IndexedDB javob bermay qolgan bo'lsa (masalan, boshqa oyna bloklagan). */
let idbTimedOut = false;
const OPEN_TIMEOUT_MS = 5000;

function openDB(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise(res => {
    let settled = false;
    const resolve = (db: IDBDatabase | null) => { if (!settled) { settled = true; clearTimeout(timer); res(db); } };
    // Hech qachon abadiy kutib qolmaslik uchun
    const timer = setTimeout(() => { idbTimedOut = true; dbPromise = null; resolve(null); }, OPEN_TIMEOUT_MS);
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('snapshots')) db.createObjectStore('snapshots', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Yangi versiya boshqa oynada ochilsa — bloklamaslik uchun ulanishni yopamiz
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return openDB().then(db => new Promise<T | undefined>((resolve, reject) => {
    if (!db) return resolve(undefined);
    const t = db.transaction(store, mode);
    const req = run(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  }));
}

function readLocal(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ---------- Yuklash va saqlash ----------

export interface LoadResult {
  state: State;
  migratedFromV1: boolean;
  source: 'indexeddb' | 'localStorage' | 'v1' | 'new';
}

export async function loadState(): Promise<LoadResult> {
  const fromIdb = (await tx<unknown>('kv', 'readonly', s => s.get('state')).catch(() => undefined)) as State | undefined;
  const fromLs = readLocal(LS_KEY) as State | null;

  // IndexedDB javob bermadi va zaxira ko'zgu ham bo'sh — asosiy ma'lumot IndexedDB'da qolgan bo'lishi mumkin.
  // Bo'sh holat bilan ochsak, keyingi saqlash uni ustidan yozib yuboradi. Shuning uchun to'xtaymiz.
  if (!fromIdb && idbTimedOut && !fromLs) {
    throw new Error('Ma’lumotlar bazasi javob bermadi. Boshqa oynada ochiq bo‘lsa, yoping va qayta urinib ko‘ring.');
  }

  const candidates = [
    fromIdb && { state: fromIdb, source: 'indexeddb' as const },
    fromLs && { state: fromLs, source: 'localStorage' as const },
  ].filter(Boolean) as { state: State; source: 'indexeddb' | 'localStorage' }[];

  if (candidates.length) {
    candidates.sort((a, b) => (b.state.updatedAt || 0) - (a.state.updatedAt || 0));
    const best = candidates[0];
    const state = normalize(best.state);
    // Nusxalardan biri yo'q yoki eskirgan bo'lsa — darhol tiklaymiz (ikkala joyda doim bir xil bo'lsin)
    const bestAt = state.updatedAt || 0;
    if (!fromIdb || (fromIdb.updatedAt || 0) < bestAt || !fromLs || (fromLs.updatedAt || 0) < bestAt) {
      await saveState(state);
    }
    return { state, migratedFromV1: false, source: best.source };
  }

  const legacy = readLocal(LEGACY_KEY);
  if (isV1(legacy)) {
    await saveSnapshot(legacy, 'v1-archive');
    const state = migrateV1(legacy);
    await saveState(state);
    return { state, migratedFromV1: true, source: 'v1' };
  }

  return { state: emptyState(), migratedFromV1: false, source: 'new' };
}

export interface SaveError { local?: string; idb?: string }

/** Ikkala joyga yozadi. Ikkalasi ham ishlamasa — xato qaytaradi. */
export async function saveState(state: State): Promise<SaveError | null> {
  const err: SaveError = {};
  try {
    globalThis.localStorage?.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) {
    err.local = (e as Error).message || 'localStorage';
  }
  try {
    await tx('kv', 'readwrite', s => s.put(state, 'state'));
  } catch (e) {
    err.idb = (e as Error).message || 'IndexedDB';
  }
  return err.local && err.idb ? err : null;
}

// ---------- Avtomatik nusxalar ----------

const KEEP_DAILY = 14;
const KEEP_OTHER = 10;

export async function saveSnapshot(data: unknown, reason: SnapshotReason): Promise<void> {
  const snap: Snapshot = {
    id: `${Date.now()}-${reason}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    day: today(),
    reason,
    transactions: countTx(data),
    data,
  };
  try {
    await tx('snapshots', 'readwrite', s => s.put(snap));
    await prune();
  } catch {
    // Nusxa olinmasa ham asosiy ish to'xtamaydi
  }
}

function countTx(data: unknown): number {
  const d = data as Record<string, unknown>;
  if (Array.isArray(d?.transactions)) return d.transactions.length;
  if (Array.isArray(d?.expenses)) return (d.expenses as unknown[]).length + (Array.isArray(d.incomes) ? d.incomes.length : 0);
  return 0;
}

async function prune() {
  const all = await listSnapshots();
  const daily = all.filter(s => s.reason === 'daily');
  const other = all.filter(s => s.reason !== 'daily' && s.reason !== 'v1-archive');
  const remove = [...daily.slice(KEEP_DAILY), ...other.slice(KEEP_OTHER)];
  for (const s of remove) await tx('snapshots', 'readwrite', st => st.delete(s.id));
}

/** Eng yangisi birinchi. */
export async function listSnapshots(): Promise<Snapshot[]> {
  const all = (await tx<Snapshot[]>('snapshots', 'readonly', s => s.getAll()).catch(() => undefined)) || [];
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  return tx<Snapshot>('snapshots', 'readonly', s => s.get(id));
}

/** Kuniga bitta avtomatik nusxa. */
export async function ensureDailySnapshot(state: State) {
  if (!state.transactions.length && !state.accounts.length) return;
  const all = await listSnapshots();
  if (all.some(s => s.reason === 'daily' && s.day === today())) return;
  await saveSnapshot(state, 'daily');
}

/** Nusxadagi ma'lumotni joriy formatga keltiradi (1-versiya nusxasi bo'lsa — ko'chiradi). */
export function snapshotToState(data: unknown): State {
  return isV1(data) ? migrateV1(data) : normalize(data);
}

// ---------- Doimiy saqlash ----------

export async function requestPersistence(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function persistenceStatus(): Promise<{ persisted: boolean | null; usage?: number; quota?: number }> {
  try {
    const persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
    const est = navigator.storage?.estimate ? await navigator.storage.estimate() : undefined;
    return { persisted, usage: est?.usage, quota: est?.quota };
  } catch {
    return { persisted: null };
  }
}

/** Testlar uchun. */
export async function _resetDbForTests() {
  const db = await dbPromise;
  db?.close();
  dbPromise = null;
}
