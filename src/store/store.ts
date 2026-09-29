import { useMemo, useSyncExternalStore } from 'react';
import type { State } from '../domain/types';
import { emptyState, normalize } from '../domain/defaults';
import { Ledger } from '../domain/engine';
import { ensureExpectedIncomes } from '../domain/actions';
import { setCurrency, today } from '../lib/format';
import {
  ensureDailySnapshot, loadState, requestPersistence, saveSnapshot, saveState, type SnapshotReason,
} from './persist';
import { showToast } from './ui';

let state: State = emptyState();
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());

export const getState = () => state;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

export function useAppState(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function useLedger(): Ledger {
  const s = useAppState();
  return useMemo(() => new Ledger(s), [s]);
}

export const isLoaded = () => loaded;

let saveChain: Promise<unknown> = Promise.resolve();
let lastSaveFailed = false;

function persist(next: State) {
  saveChain = saveChain.then(() => saveState(next)).then(err => {
    if (err && !lastSaveFailed) {
      showToast('⚠️ Saqlab bo‘lmadi! Telefon xotirasini tekshiring va zaxira nusxa oling.', 'danger', 8000);
    }
    lastSaveFailed = !!err;
  });
}

/** Barcha o'zgarishlar shu orqali: nusxa ustida ishlanadi, xato bo'lsa hech narsa o'zgarmaydi. */
export function commit(mutator: (draft: State) => void, opts: { undo?: string } = {}) {
  const prev = state;
  const draft = structuredClone(state);
  mutator(draft);
  draft.updatedAt = Date.now();
  state = draft;
  persist(draft);
  emit();
  if (opts.undo) {
    showToast(opts.undo, 'info', 6000, { label: 'Bekor qilish', run: () => replaceState(prev, false) });
  }
}

/** Butun holatni almashtirish (tiklash, import). Oldin avtomatik nusxa olinadi. */
export async function replaceState(next: State, snapshotReason: SnapshotReason | false = 'before-restore') {
  if (snapshotReason) await saveSnapshot(state, snapshotReason);
  state = normalize(next);
  state.updatedAt = Date.now();
  setCurrency(state.settings.currency);
  persist(state);
  emit();
}

export async function takeSnapshot(reason: SnapshotReason) {
  await saveSnapshot(state, reason);
}

/** Ilova ochilganda va har safar qaytib kelganda. */
export function dailyMaintenance() {
  if (!state.settings.onboarded) return;
  const probe = structuredClone(state);
  if (ensureExpectedIncomes(probe, today()) > 0) commit(s => { ensureExpectedIncomes(s, today()); });
  void ensureDailySnapshot(state);
}

export async function initStore() {
  const result = await loadState();
  state = result.state;
  loaded = true;
  setCurrency(state.settings.currency);
  emit();
  if (result.migratedFromV1) {
    showToast('Ma’lumotlaringiz yangi versiyaga ko‘chirildi ✓ Asl nusxa ham saqlab qo‘yildi.', 'success', 7000);
  }
  dailyMaintenance();
  void requestPersistence();
  return result;
}
