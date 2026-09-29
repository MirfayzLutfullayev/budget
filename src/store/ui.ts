// Interfeys holati: navigatsiya, pastdan chiquvchi oynalar (sheet) va xabarlar (toast).
import { useSyncExternalStore } from 'react';
import type { ID } from '../domain/types';

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: T) => { value = next; listeners.forEach(l => l()); },
    subscribe: (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

// ---------- Navigatsiya ----------

export type Tab = 'home' | 'transactions' | 'budget' | 'more';

export type Route =
  | { name: 'debts' } | { name: 'debt'; id: ID } | { name: 'stats' } | { name: 'accounts' } | { name: 'account'; id: ID }
  | { name: 'planned' } | { name: 'income' } | { name: 'bills' } | { name: 'reminders' } | { name: 'reports' }
  | { name: 'categories' } | { name: 'rules' } | { name: 'data' } | { name: 'settings' } | { name: 'category'; id: ID };

interface Nav { tab: Tab; stack: Route[] }
const nav = createStore<Nav>({ tab: 'home', stack: [] });

export const useNav = () => useSyncExternalStore(nav.subscribe, nav.get, nav.get);
export const setTab = (tab: Tab) => { nav.set({ tab, stack: [] }); window.scrollTo(0, 0); };
export const push = (route: Route) => { nav.set({ ...nav.get(), stack: [...nav.get().stack, route] }); window.scrollTo(0, 0); };
export const back = () => { nav.set({ ...nav.get(), stack: nav.get().stack.slice(0, -1) }); };
/** Tabni o'zgartirib, ichidagi sahifani ochadi. */
export const go = (tab: Tab, route?: Route) => { nav.set({ tab, stack: route ? [route] : [] }); window.scrollTo(0, 0); };

// ---------- Sheet (forma oynalari) ----------

export type SheetSpec =
  | { type: 'quick' }
  | { type: 'expense'; id?: ID; categoryId?: ID }
  | { type: 'income'; id?: ID }
  | { type: 'transfer'; id?: ID }
  | { type: 'debtPayment'; debtId?: ID; amount?: number }
  | { type: 'account'; id?: ID }
  | { type: 'category'; id?: ID; incomeType?: boolean }
  | { type: 'limit'; categoryId: ID; month: string }
  | { type: 'debt'; id?: ID }
  | { type: 'planned'; id?: ID }
  | { type: 'purchase'; id: ID }
  | { type: 'schedule'; id?: ID }
  | { type: 'expected'; id?: ID }
  | { type: 'receive'; id: ID }
  | { type: 'bill'; id?: ID }
  | { type: 'payBill'; id: ID }
  | { type: 'safeToSpend' }
  | { type: 'categoryTx'; categoryId: ID; month: string }
  | { type: 'plan' }
  | { type: 'distribute' };

const sheets = createStore<SheetSpec[]>([]);
export const useSheets = () => useSyncExternalStore(sheets.subscribe, sheets.get, sheets.get);
/** Yangi oyna ochadi (oldingisining ustidan). */
export const openSheet = (spec: SheetSpec) => sheets.set([...sheets.get(), spec]);
/** Joriy oynani almashtiradi. */
export const replaceSheet = (spec: SheetSpec) => sheets.set([...sheets.get().slice(0, -1), spec]);
export const closeSheet = () => sheets.set(sheets.get().slice(0, -1));
export const closeAllSheets = () => sheets.set([]);

// ---------- Toast ----------

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'success' | 'danger';
  action?: { label: string; run: () => void };
}

const toasts = createStore<Toast | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
export const useToast = () => useSyncExternalStore(toasts.subscribe, toasts.get, toasts.get);

export function showToast(text: string, tone: Toast['tone'] = 'success', ms = 2400, action?: Toast['action']) {
  clearTimeout(timer);
  toasts.set({ id: Date.now(), text, tone, action });
  timer = setTimeout(() => toasts.set(null), ms);
}

export const hideToast = () => { clearTimeout(timer); toasts.set(null); };
