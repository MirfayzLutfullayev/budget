import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { loadState, saveState, listSnapshots, ensureDailySnapshot, saveSnapshot, snapshotToState, LS_KEY, LEGACY_KEY, _resetDbForTests } from './persist';
import { emptyState } from '../domain/defaults';
import { Ledger } from '../domain/engine';
import { migrateV1 } from '../domain/migrate';

// Node'da localStorage yo'q — oddiy xotira versiyasi
class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}

beforeEach(async () => {
  (globalThis as Record<string, unknown>).localStorage = new MemoryStorage();
  await _resetDbForTests();
  await new Promise<void>(r => { const req = indexedDB.deleteDatabase('budget-manager'); req.onsuccess = () => r(); req.onerror = () => r(); });
});

const V1_SAMPLE = {
  version: 1,
  settings: { currency: 'UZS', onboarded: true, alertThreshold: 90, reminderDays: 2, lastBackup: null },
  categories: [
    { id: 'g1', name: 'Kundalik', icon: '📅', parentId: null, kind: 'expense', active: true, sort: 0 },
    { id: 'c1', name: 'Ovqat', icon: '🍚', parentId: 'g1', kind: 'expense', limitType: 'fixed', defaultLimit: 2_400_000, active: true, sort: 0 },
    { id: 'g2', name: 'Entertainment', icon: '🎉', parentId: null, kind: 'expense', groupLevel: true, limitType: 'fixed', defaultLimit: 300_000, active: true, sort: 1 },
    { id: 'c2', name: 'Qizlar', icon: '💐', parentId: 'g2', kind: 'expense', active: true, sort: 0 },
    { id: 'g3', name: 'Moliya', icon: '🏦', parentId: null, kind: 'expense', finance: true, active: true, sort: 2 },
    { id: 'c3', name: 'Qarz', icon: '💳', parentId: 'g3', kind: 'debt', active: true, sort: 0 },
    { id: 'c4', name: 'To‘ylar', icon: '💍', parentId: 'g3', kind: 'fund', fundId: 'f1', defaultLimit: 700_000, active: true, sort: 1 },
  ],
  months: { '2026-09': { allocations: { c1: { type: 'fixed', amount: 2_700_000 }, g2: { type: 'fixed', amount: 300_000 }, c4: { type: 'fixed', amount: 700_000 } } } },
  incomes: [{ id: 'i1', amount: 7_400_000, source: 'Maosh (1-qism)', sourceId: 's1', cardId: 'main', date: '2026-09-01', note: '' }],
  incomeSources: [{ id: 's1', name: 'Maosh (1-qism)', amount: 7_400_000, day: 1, cardId: 'main', active: true }],
  expenses: [
    { id: 'e1', amount: 35_000, categoryId: 'c1', cardId: 'basic', fundId: null, date: '2026-09-29', note: '' },
    { id: 'e2', amount: 220_000, categoryId: 'c2', cardId: 'basic', fundId: null, date: '2026-09-29', note: '' },
    { id: 'e3', amount: 600_000, categoryId: 'c1', cardId: 'basic', fundId: 'f1', date: '2026-09-29', note: 'To‘y' },
  ],
  cards: [
    { id: 'main', name: 'Main', opening: 0, active: true, sort: 0 },
    { id: 'basic', name: 'Basic', opening: 2_000_000, active: true, sort: 1 },
  ],
  transfers: [{ id: 't1', amount: 1_000_000, fromId: 'main', toId: 'basic', date: '2026-09-02', note: '' }],
  debts: [{ id: 'd1', name: 'TBC', original: 10_500_000, starting: 10_500_000, rate: 48, dueDay: 11, minPayment: 0, active: true }],
  debtPayments: [
    { id: 'p1', debtId: 'd1', amount: 1_500_000, cardId: 'main', date: '2026-09-11', note: '', adjustment: false },
    { id: 'p2', debtId: 'd1', amount: 200_000, cardId: null, date: '2026-09-12', note: 'foiz', adjustment: true },
  ],
  funds: [{ id: 'f1', name: 'To‘ylar', icon: '💍', opening: 1_400_000, active: true }],
  fundTx: [],
  recurring: [{ id: 'r1', name: 'Ijara', amount: 600_000, categoryId: 'c1', cardId: 'basic', day: 1, active: true }],
  planned: [{ id: 'pl1', title: 'To‘y', date: '2026-10-12', amount: 600_000, categoryId: 'c1', fundId: 'f1', note: '', done: false }],
};

describe('1-versiyadan ko‘chirish', () => {
  it('balanslar, qarz, budjet va rejalar to‘g‘ri ko‘chadi', () => {
    const s = migrateV1(structuredClone(V1_SAMPLE));
    const L = new Ledger(s);
    // Main: 0 + 7.4M − 1M o'tkazma − 1.5M qarz = 4.9M; Basic: 2M + 1M − 35k − 220k − 600k = 2.145M
    expect(L.balance('main')).toBe(4_900_000);
    expect(L.balance('basic')).toBe(2_145_000);
    // Qarz: 10.5M + 200k tuzatish − 1.5M to'lov
    expect(L.debtRemaining(s.debts[0])).toBe(9_200_000);
    expect(L.monthTotals('2026-09').debtPaid).toBe(1_500_000);
    // Guruh darajasidagi Entertainment — bitta kategoriya; Qizlar xarajati unga o'tadi
    const ent = s.categories.find(c => c.name === 'Entertainment')!;
    expect(s.transactions.find(t => t.id === 'e2')!.categoryId).toBe(ent.id);
    expect(L.limit(s.categories.find(c => c.name === 'Ovqat')!, '2026-09')).toBe(2_700_000);
    // Fond kategoriyasi budjetga o'tmaydi, fonddan qilingan xarajat izohda saqlanadi
    expect(s.budgets['2026-09'].limits.c4).toBeUndefined();
    expect(s.transactions.find(t => t.id === 'e3')!.note).toContain('Fond: To‘ylar');
    // Takroriy → majburiy to'lov, reja → rejali xarid, daromad manbai → jadval
    expect(s.bills[0].name).toBe('Ijara');
    expect(s.planned[0].status).toBe('planned');
    expect(s.incomeSchedules[0].amount).toBe(7_400_000);
    expect(s.expectedIncomes[0].status).toBe('received');
    expect(s.settings.onboarded).toBe(true);
  });
});

describe('Saqlash qatlami', () => {
  it('1-versiya ma’lumotini topib ko‘chiradi va asl nusxani arxivlaydi', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(V1_SAMPLE));
    const r = await loadState();
    expect(r.migratedFromV1).toBe(true);
    expect(r.state.transactions.length).toBe(5);
    const snaps = await listSnapshots();
    expect(snaps.some(x => x.reason === 'v1-archive')).toBe(true);
    // Asl v1 kaliti o'chirilmaydi
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
    // Ikkinchi ochilishda qayta ko'chirilmaydi
    const again = await loadState();
    expect(again.migratedFromV1).toBe(false);
  });

  it('IndexedDB va localStorage’ga birga yozadi, eng yangisini oladi', async () => {
    const a = emptyState(); a.updatedAt = 100; a.settings.currency = 'USD';
    await saveState(a);
    expect(JSON.parse(localStorage.getItem(LS_KEY)!).settings.currency).toBe('USD');
    // localStorage eskirgan bo'lsa ham IndexedDB'dagi yangisi olinadi
    const b = emptyState(); b.updatedAt = 200; b.settings.currency = 'EUR';
    await saveState(b);
    localStorage.setItem(LS_KEY, JSON.stringify(a));
    expect((await loadState()).state.settings.currency).toBe('EUR');
  });

  it('localStorage tozalansa ham IndexedDB’dan tiklanadi', async () => {
    const a = emptyState(); a.updatedAt = 5; a.accounts.push({ id: 'x', name: 'Cash', type: 'cash', initialBalance: 1, icon: '', color: '', last4: '', isActive: true, sort: 0 });
    await saveState(a);
    localStorage.clear();
    const r = await loadState();
    expect(r.source).toBe('indexeddb');
    expect(r.state.accounts.length).toBe(1);
    // localStorage nusxasi darhol tiklanadi
    expect(JSON.parse(localStorage.getItem(LS_KEY)!).accounts.length).toBe(1);
  });

  it('Kuniga bitta avtomatik nusxa; nusxani tiklash mumkin', async () => {
    const a = emptyState(); a.accounts.push({ id: 'x', name: 'Cash', type: 'cash', initialBalance: 1, icon: '', color: '', last4: '', isActive: true, sort: 0 });
    await ensureDailySnapshot(a);
    await ensureDailySnapshot(a);
    const snaps = await listSnapshots();
    expect(snaps.filter(x => x.reason === 'daily').length).toBe(1);
    expect(snapshotToState(snaps[0].data).accounts[0].name).toBe('Cash');
  });

  it('Eski nusxalar tozalanadi, lekin v1 arxivi saqlanadi', async () => {
    await saveSnapshot(V1_SAMPLE, 'v1-archive');
    for (let i = 0; i < 15; i++) await saveSnapshot(emptyState(), 'before-import');
    const snaps = await listSnapshots();
    expect(snaps.filter(x => x.reason === 'before-import').length).toBe(10);
    expect(snaps.some(x => x.reason === 'v1-archive')).toBe(true);
  });
});
