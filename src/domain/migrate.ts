// 1-versiya (vanilla JS) ma'lumotlarini 2-versiya modeliga ko'chirish.
// Hech narsa yo'qolmasligi uchun asl 1-versiya ma'lumoti alohida arxivda ham saqlanadi (persist.ts).

import type { Category, State, Transaction } from './types';
import { emptyState, COLORS } from './defaults';
import { monthDate, monthOf, percentOf, today, uid } from '../lib/format';

/* eslint-disable @typescript-eslint/no-explicit-any */
type V1 = Record<string, any>;

const arr = (x: unknown): any[] => (Array.isArray(x) ? x : []);

export function isV1(obj: unknown): obj is V1 {
  return !!obj && typeof obj === 'object' && Array.isArray((obj as V1).expenses) && Array.isArray((obj as V1).cards);
}

export function migrateV1(old: V1): State {
  const s = emptyState();
  const defaults = s.categories;
  const settings = old.settings || {};
  s.settings = {
    ...s.settings,
    currency: settings.currency || 'UZS',
    onboarded: !!settings.onboarded,
    alertThreshold: settings.alertThreshold || 90,
    reminderDays: settings.reminderDays ?? 2,
    lastBackupAt: settings.lastBackup || null,
    hideInstallTip: !!settings.hideInstallTip,
  };

  // --- Hisoblar (kartalar)
  s.accounts = arr(old.cards).map((c, i) => ({
    id: c.id, name: c.name || 'Karta', type: 'card' as const, initialBalance: c.opening || 0, icon: '💳',
    color: COLORS[i % COLORS.length], last4: c.last4 || '', isActive: c.active !== false, sort: c.sort ?? i,
  }));

  // --- Kategoriyalar
  const oldCats = arr(old.categories);
  const expectedIncome = arr(old.incomeSources).filter(x => x.active !== false).reduce((a, x) => a + (x.amount || 0), 0);
  const limitOf = (c: any) => (c.limitType === 'percent' ? percentOf(expectedIncome, c.defaultPercent || 0) : c.defaultLimit || 0);

  const cats: Category[] = [];
  /** eski kategoriya id → yangi kategoriya id */
  const map = new Map<string, string>();
  let sort = 0;
  for (const g of oldCats.filter(c => !c.parentId).sort((a, b) => (a.sort || 0) - (b.sort || 0))) {
    const kids = oldCats.filter(c => c.parentId === g.id).sort((a, b) => (a.sort || 0) - (b.sort || 0));
    if (g.groupLevel) {
      // Guruh darajasidagi limit (Entertainment) — bitta kategoriya bo'ladi
      cats.push({ id: g.id, name: g.name, icon: g.icon || '📁', type: 'expense', kind: 'regular', group: g.name,
        monthlyLimit: limitOf(g), color: COLORS[sort % COLORS.length], isActive: g.active !== false, sort: sort++ });
      map.set(g.id, g.id);
      for (const k of kids) map.set(k.id, g.id);
      continue;
    }
    for (const k of kids) {
      if (k.kind === 'fund' || k.kind === 'emergency') continue;
      cats.push({ id: k.id, name: k.name, icon: k.icon || '📁', type: 'expense', kind: k.kind === 'debt' ? 'debt' : 'regular',
        group: g.name, monthlyLimit: k.kind === 'debt' ? 0 : limitOf(k), color: COLORS[sort % COLORS.length],
        isActive: k.active !== false && g.active !== false, sort: sort++ });
      map.set(k.id, k.id);
    }
  }
  // Majburiy tizim kategoriyalari va kirim kategoriyalari
  const needKinds = ['debt', 'savings'] as const;
  for (const kind of needKinds) {
    if (!cats.some(c => c.kind === kind)) {
      const d = defaults.find(c => c.kind === kind)!;
      cats.push({ ...d, sort: sort++ });
    }
  }
  for (const d of defaults.filter(c => c.type === 'income')) cats.push({ ...d, sort: sort++ });
  s.categories = cats;

  const debtCat = cats.find(c => c.kind === 'debt')!;
  const salaryCat = cats.find(c => c.type === 'income' && c.name === 'Maosh')!;
  const otherIncomeCat = cats.find(c => c.type === 'income' && c.name === 'Boshqa kirim')!;
  const target = (id: string | null | undefined) => (id ? map.get(id) ?? null : null);

  // --- Xarajatlar
  const funds = new Map(arr(old.funds).map(f => [f.id, f]));
  const txs: Transaction[] = [];
  for (const e of arr(old.expenses)) {
    const fund = e.fundId ? funds.get(e.fundId) : null;
    txs.push({
      id: e.id, type: 'expense', amount: e.amount, categoryId: target(e.categoryId),
      accountId: e.cardId || null, date: e.date, note: [fund ? `Fond: ${fund.name}` : '', e.note || ''].filter(Boolean).join(' · '),
      ...(e.recurringId ? { billId: e.recurringId, billMonth: monthOf(e.date) } : {}),
      createdAt: Date.now(),
    });
  }

  // --- Kirimlar va kutilgan kirim jadvali
  const sources = arr(old.incomeSources);
  s.incomeSchedules = sources.map(x => ({
    id: x.id, source: x.name, amount: x.amount, day: x.day || 1, targetAccountId: x.cardId || null,
    categoryId: salaryCat.id, isActive: x.active !== false, startDate: today(),
  }));
  for (const i of arr(old.incomes)) {
    const src = sources.find(x => x.id === i.sourceId);
    txs.push({
      id: i.id, type: 'income', amount: i.amount, categoryId: src ? salaryCat.id : otherIncomeCat.id,
      accountId: i.cardId || null, date: i.date, note: [i.source, i.note].filter(Boolean).join(' · '),
      incomeId: src ? `mig-${i.id}` : undefined, createdAt: Date.now(),
    });
    if (src) {
      s.expectedIncomes.push({
        id: `mig-${i.id}`, amount: i.amount, source: src.name, targetAccountId: i.cardId || null, categoryId: salaryCat.id,
        expectedDate: monthDate(monthOf(i.date), src.day || 1), receivedDate: i.date, status: 'received', note: '',
        scheduleId: src.id, transactionId: i.id,
      });
    }
  }

  // --- Qarzlar (tuzatishlar boshlang'ich qoldiqqa qo'shiladi)
  const payments = arr(old.debtPayments);
  s.debts = arr(old.debts).map((d, i) => {
    const own = payments.filter(p => p.debtId === d.id);
    const adj = own.filter(p => p.adjustment).reduce((a, p) => a + p.amount, 0);
    const first = own.map(p => p.date).sort()[0];
    return {
      id: d.id, name: d.name, originalAmount: d.original || d.starting, startingBalance: (d.starting || 0) + adj,
      interestRate: d.rate || 0, dueDay: d.dueDay || 0, minimumPayment: d.minPayment || 0,
      startDate: first && first < today() ? first : today(), isActive: d.active !== false, note: d.note || '', sort: d.sort ?? i,
    };
  });
  for (const p of payments) {
    if (p.adjustment) continue;
    txs.push({ id: p.id, type: 'expense', amount: p.amount, categoryId: debtCat.id, accountId: p.cardId || null,
      date: p.date, note: p.note || '', debtId: p.debtId, createdAt: Date.now() });
  }
  s.transactions = txs;

  // --- O'tkazmalar
  s.transfers = arr(old.transfers)
    .filter(t => t.fromId && t.toId)
    .map(t => ({ id: t.id, fromAccountId: t.fromId, toAccountId: t.toId, amount: t.amount, date: t.date, note: t.note || '', createdAt: Date.now() }));

  // --- Takroriy to'lovlar → majburiy to'lovlar
  s.bills = arr(old.recurring).map(r => ({
    id: r.id, name: r.name, amount: r.amount, categoryId: target(r.categoryId), accountId: r.cardId || null,
    day: r.day || 1, isActive: r.active !== false,
  }));

  // --- Rejali xarajatlar → rejali xaridlar
  s.planned = arr(old.planned).map(p => ({
    id: p.id, name: p.title, amount: p.amount, date: p.date || null, categoryId: target(p.categoryId),
    status: p.done ? 'purchased' as const : 'planned' as const, note: p.note || '', createdAt: Date.now(),
  }));

  // --- Oylik budjetlar
  for (const [key, month] of Object.entries<any>(old.months || {})) {
    const limits: Record<string, number> = {};
    for (const [catId, a] of Object.entries<any>(month?.allocations || {})) {
      const newId = target(catId);
      const cat = newId ? cats.find(c => c.id === newId) : undefined;
      if (!cat || cat.kind !== 'regular') continue;
      const v = a.type === 'percent' ? percentOf(expectedIncome, a.percent || 0) : a.amount || 0;
      if (v > 0) limits[cat.id] = v;
    }
    s.budgets[key] = { limits, createdAt: Date.now() };
  }

  s.updatedAt = Date.now();
  // Takrorlanmas id kafolati (eski ma'lumotda id yo'q bo'lsa)
  for (const t of s.transactions) if (!t.id) t.id = uid();
  return s;
}
