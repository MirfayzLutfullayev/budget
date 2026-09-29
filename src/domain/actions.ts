// Ma'lumotni o'zgartiruvchi amallar. Har biri `draft` (State nusxasi) ustida ishlaydi.
// Xato bo'lsa Error tashlanadi va o'zgarish saqlanmaydi.

import type {
  Account, Bill, Category, Debt, ExpectedIncome, ID, IncomeSchedule, PlannedPurchase, State, Transaction, Transfer,
} from './types';
import { Ledger } from './engine';
import { addMonths, monthDate, monthOf, today, uid, plain } from '../lib/format';
import { COLORS } from './defaults';

const fail = (msg: string): never => { throw new Error(msg); };
const need = (cond: unknown, msg: string) => { if (!cond) fail(msg); };
const requireAmount = (n: number) => need(Number.isFinite(n) && n > 0, 'Summani kiriting (0 dan katta bo‘lishi kerak).');
const requireName = (s: string) => need(String(s || '').trim(), 'Nomini kiriting.');
const byId = <T extends { id: ID }>(list: T[], id: ID | null | undefined) => (id ? list.find(x => x.id === id) : undefined);

function requireAccount(s: State, id: ID | null | undefined) {
  need(id, 'Hisobni tanlang (qaysi karta yoki naqd).');
  need(byId(s.accounts, id), 'Hisob topilmadi.');
}

// ---------- Tranzaksiyalar ----------

export type TxInput = Omit<Transaction, 'id' | 'createdAt'> & { id?: ID };

export function saveTransaction(s: State, input: TxInput): Transaction {
  requireAmount(input.amount);
  requireAccount(s, input.accountId);
  if (input.type === 'expense') need(input.categoryId, 'Kategoriyani tanlang.');
  const data = { ...input, note: (input.note || '').trim(), date: input.date || today() };

  if (input.id) {
    const t = byId(s.transactions, input.id) ?? fail('Tranzaksiya topilmadi.');
    if (t.debtId) {
      const debt = byId(s.debts, t.debtId);
      if (debt) {
        const remainingBefore = new Ledger(s).debtRemaining(debt) + t.amount;
        need(data.amount <= remainingBefore, `To‘lov qolgan qarzdan oshmasligi kerak (qoldiq: ${plain(remainingBefore)}).`);
      }
    }
    Object.assign(t, data);
    return t;
  }
  const t: Transaction = { ...data, id: uid(), createdAt: Date.now() };
  s.transactions.push(t);
  return t;
}

export function deleteTransaction(s: State, id: ID) {
  const t = byId(s.transactions, id);
  if (!t) return;
  s.transactions = s.transactions.filter(x => x.id !== id);
  // Bog'langan yozuvlarni qayta ochamiz
  for (const i of s.expectedIncomes) {
    if (i.transactionId === id) { i.status = 'expected'; i.receivedDate = null; delete i.transactionId; }
  }
  for (const p of s.planned) {
    if (p.transactionId === id) { p.status = 'planned'; delete p.transactionId; }
  }
}

// ---------- O'tkazma ----------

export function saveTransfer(s: State, input: Omit<Transfer, 'id' | 'createdAt'> & { id?: ID }): Transfer {
  requireAmount(input.amount);
  requireAccount(s, input.fromAccountId);
  requireAccount(s, input.toAccountId);
  need(input.fromAccountId !== input.toAccountId, 'Bir hisobdan o‘sha hisobga o‘tkazib bo‘lmaydi.');
  const data = { ...input, note: (input.note || '').trim(), date: input.date || today() };
  if (input.id) {
    const t = byId(s.transfers, input.id) ?? fail('O‘tkazma topilmadi.');
    Object.assign(t, data);
    return t;
  }
  const t: Transfer = { ...data, id: uid(), createdAt: Date.now() };
  s.transfers.push(t);
  return t;
}

export function deleteTransfer(s: State, id: ID) {
  s.transfers = s.transfers.filter(t => t.id !== id);
}

// ---------- Hisoblar ----------

export function saveAccount(s: State, input: Partial<Account> & { name: string; type: Account['type'] }): Account {
  requireName(input.name);
  const last4 = String(input.last4 || '').replace(/\D/g, '');
  need(!last4 || last4.length === 4, 'Faqat kartaning oxirgi 4 raqamini kiriting.');
  const existing = byId(s.accounts, input.id);
  if (existing) {
    Object.assign(existing, { ...input, name: input.name.trim(), last4 });
    return existing;
  }
  const a: Account = {
    icon: input.type === 'cash' ? '💵' : input.type === 'card' ? '💳' : '🏦',
    color: COLORS[s.accounts.length % COLORS.length], initialBalance: 0, isActive: true, sort: s.accounts.length,
    ...input, id: uid(), name: input.name.trim(), last4,
  };
  s.accounts.push(a);
  return a;
}

export function isAccountUsed(s: State, id: ID) {
  return s.transactions.some(t => t.accountId === id)
    || s.transfers.some(t => t.fromAccountId === id || t.toAccountId === id);
}

/** Tranzaksiyasi bor hisobni o'chirib bo'lmaydi — balanslar buzilmasligi uchun faqat yashiriladi. */
export function deleteAccount(s: State, id: ID) {
  need(!isAccountUsed(s, id), 'Bu hisobda tranzaksiyalar bor. O‘chirish o‘rniga «Faol emas» qiling.');
  s.accounts = s.accounts.filter(a => a.id !== id);
  for (const x of [...s.incomeSchedules]) if (x.targetAccountId === id) x.targetAccountId = null;
  for (const x of s.expectedIncomes) if (x.targetAccountId === id) x.targetAccountId = null;
  for (const x of s.bills) if (x.accountId === id) x.accountId = null;
}

// ---------- Kategoriyalar ----------

export function saveCategory(s: State, input: Partial<Category> & { name: string }): Category {
  requireName(input.name);
  const existing = byId(s.categories, input.id);
  if (existing) {
    Object.assign(existing, { ...input, name: input.name.trim(), monthlyLimit: Math.max(0, input.monthlyLimit ?? existing.monthlyLimit) });
    return existing;
  }
  const c: Category = {
    type: 'expense', kind: 'regular', group: 'Boshqa', monthlyLimit: 0, icon: '📁',
    color: COLORS[s.categories.length % COLORS.length], isActive: true,
    sort: Math.max(0, ...s.categories.map(x => x.sort)) + 1,
    ...input, id: uid(), name: input.name.trim(),
  };
  s.categories.push(c);
  return c;
}

export function isCategoryUsed(s: State, id: ID) {
  return s.transactions.some(t => t.categoryId === id) || s.bills.some(b => b.categoryId === id)
    || s.planned.some(p => p.categoryId === id);
}

export function deleteCategory(s: State, id: ID) {
  need(!isCategoryUsed(s, id), 'Bu kategoriyada yozuvlar bor. O‘chirish o‘rniga «Faol emas» qiling.');
  s.categories = s.categories.filter(c => c.id !== id);
  for (const b of Object.values(s.budgets)) delete b.limits[id];
}

// ---------- Budjet ----------

/** "Create October Budget": oldingi oydan nusxa yoki standart limitlardan. */
export function createMonthBudget(s: State, key: string, source: 'previous' | 'defaults') {
  if (s.budgets[key]) return s.budgets[key];
  const prevKey = source === 'previous' ? Object.keys(s.budgets).filter(k => k < key).sort().pop() : undefined;
  const limits: Record<ID, number> = {};
  for (const c of s.categories) {
    if (c.type !== 'expense' || c.kind !== 'regular' || !c.isActive) continue;
    const v = prevKey ? (s.budgets[prevKey].limits[c.id] ?? c.monthlyLimit) : c.monthlyLimit;
    if (v > 0) limits[c.id] = v;
  }
  s.budgets[key] = { limits, createdAt: Date.now() };
  return s.budgets[key];
}

export function setLimit(s: State, key: string, categoryId: ID, amount: number, alsoDefault: boolean) {
  need(amount >= 0, 'Limit manfiy bo‘lmaydi.');
  const b = s.budgets[key] ?? createMonthBudget(s, key, 'defaults');
  if (amount > 0) b.limits[categoryId] = amount;
  else delete b.limits[categoryId];
  if (alsoDefault) {
    const c = byId(s.categories, categoryId);
    if (c) c.monthlyLimit = amount;
  }
}

// ---------- Kutilgan kirim ----------

export function saveIncomeSchedule(s: State, input: Omit<IncomeSchedule, 'id' | 'isActive'> & { id?: ID; isActive?: boolean }) {
  requireName(input.source);
  requireAmount(input.amount);
  const existing = byId(s.incomeSchedules, input.id);
  const data = { ...input, source: input.source.trim(), isActive: input.isActive ?? true };
  if (existing) {
    Object.assign(existing, data);
    // Hali tushmagan kutilgan kirimlarni yangilaymiz
    for (const i of s.expectedIncomes) {
      if (i.scheduleId === existing.id && i.status === 'expected') {
        Object.assign(i, { amount: existing.amount, source: existing.source, targetAccountId: existing.targetAccountId,
          categoryId: existing.categoryId, expectedDate: monthDate(monthOf(i.expectedDate), existing.day) });
      }
    }
    if (!existing.isActive) s.expectedIncomes = s.expectedIncomes.filter(i => !(i.scheduleId === existing.id && i.status === 'expected'));
    return existing;
  }
  const x: IncomeSchedule = { ...data, id: uid(), startDate: data.startDate ?? today() };
  s.incomeSchedules.push(x);
  return x;
}

export function deleteIncomeSchedule(s: State, id: ID) {
  s.incomeSchedules = s.incomeSchedules.filter(x => x.id !== id);
  s.expectedIncomes = s.expectedIncomes.filter(i => !(i.scheduleId === id && i.status === 'expected'));
}

/** Joriy va keyingi oy uchun kutilgan kirimlarni jadvaldan yaratadi (takrorlanmaydi). */
export function ensureExpectedIncomes(s: State, todayStr = today()): number {
  const months = [monthOf(todayStr), addMonths(monthOf(todayStr), 1)];
  let created = 0;
  for (const sch of s.incomeSchedules) {
    if (!sch.isActive) continue;
    for (const key of months) {
      const exists = s.expectedIncomes.some(i => i.scheduleId === sch.id && monthOf(i.expectedDate) === key);
      if (exists) continue;
      // Jadval qo'shilishidan oldingi sana — bu pul allaqachon balansda, kutilmaydi
      if (sch.startDate && monthDate(key, sch.day) < sch.startDate) continue;
      s.expectedIncomes.push({
        id: uid(), amount: sch.amount, source: sch.source, targetAccountId: sch.targetAccountId, categoryId: sch.categoryId,
        expectedDate: monthDate(key, sch.day), receivedDate: null, status: 'expected', note: '', scheduleId: sch.id,
      });
      created++;
    }
  }
  return created;
}

export function saveExpectedIncome(s: State, input: Omit<ExpectedIncome, 'id' | 'status' | 'receivedDate'> & { id?: ID }) {
  requireName(input.source);
  requireAmount(input.amount);
  const existing = byId(s.expectedIncomes, input.id);
  if (existing) { Object.assign(existing, input); return existing; }
  const x: ExpectedIncome = { ...input, id: uid(), status: 'expected', receivedDate: null };
  s.expectedIncomes.push(x);
  return x;
}

/** Expected → Received: kirim tranzaksiyasi yaratiladi, hisob balansi oshadi. */
export function receiveIncome(s: State, id: ID, fields: { amount: number; accountId: ID | null; date: string }) {
  const i = byId(s.expectedIncomes, id) ?? fail('Kutilgan kirim topilmadi.');
  need(i.status === 'expected', 'Bu kirim allaqachon qabul qilingan.');
  const t = saveTransaction(s, {
    type: 'income', amount: fields.amount, categoryId: i.categoryId, accountId: fields.accountId,
    date: fields.date, note: i.source, incomeId: i.id,
  });
  Object.assign(i, { status: 'received', receivedDate: fields.date, transactionId: t.id, amount: fields.amount, targetAccountId: fields.accountId });
  return t;
}

export function skipIncome(s: State, id: ID) {
  const i = byId(s.expectedIncomes, id);
  if (i && i.status === 'expected') i.status = 'skipped';
}

export function deleteExpectedIncome(s: State, id: ID) {
  const i = byId(s.expectedIncomes, id);
  need(!i?.transactionId, 'Qabul qilingan kirimni o‘chirish uchun uning tranzaksiyasini o‘chiring.');
  s.expectedIncomes = s.expectedIncomes.filter(x => x.id !== id);
}

// ---------- Qarzlar ----------

export function saveDebt(s: State, input: Partial<Debt> & { name: string; startingBalance: number }) {
  requireName(input.name);
  requireAmount(input.startingBalance);
  const existing = byId(s.debts, input.id);
  if (existing) {
    const paid = new Ledger(s).debtPaid(existing);
    need(input.startingBalance >= paid, `Qoldiq allaqachon to‘langan summadan (${plain(paid)}) kam bo‘lmasligi kerak.`);
    Object.assign(existing, { ...input, name: input.name.trim() });
    return existing;
  }
  const d: Debt = {
    originalAmount: input.startingBalance, interestRate: 0, dueDay: 0, minimumPayment: 0,
    startDate: today(), isActive: true, note: '', sort: s.debts.length,
    ...input, id: uid(), name: input.name.trim(),
  };
  if (!d.originalAmount) d.originalAmount = d.startingBalance;
  s.debts.push(d);
  return d;
}

export function deleteDebt(s: State, id: ID) {
  need(!s.transactions.some(t => t.debtId === id), 'Bu qarz bo‘yicha to‘lovlar bor. O‘chirish o‘rniga «Yopilgan» qiling.');
  s.debts = s.debts.filter(d => d.id !== id);
}

/** Debt Payment: hisobdan −X va qarzdan −X. Qoldiqdan ko'p to'lab bo'lmaydi. */
export function payDebt(s: State, input: { debtId: ID; amount: number; accountId: ID | null; date: string; note?: string }) {
  const debt = byId(s.debts, input.debtId) ?? fail('Qarzni tanlang.');
  requireAmount(input.amount);
  const remaining = new Ledger(s).debtRemaining(debt);
  need(input.amount <= remaining, `To‘lov qolgan qarzdan oshmasligi kerak (qoldiq: ${plain(remaining)}).`);
  let cat = s.categories.find(c => c.kind === 'debt' && c.type === 'expense');
  if (!cat) cat = saveCategory(s, { name: 'Qarz to‘lovi', icon: '💳', kind: 'debt', group: 'Moliya' });
  return saveTransaction(s, {
    type: 'expense', amount: input.amount, categoryId: cat.id, accountId: input.accountId, date: input.date,
    note: input.note || '', debtId: debt.id,
  });
}

// ---------- Majburiy to'lovlar ----------

export function saveBill(s: State, input: Omit<Bill, 'id' | 'isActive'> & { id?: ID; isActive?: boolean }) {
  requireName(input.name);
  requireAmount(input.amount);
  need(input.categoryId, 'Kategoriyani tanlang.');
  const existing = byId(s.bills, input.id);
  const data = { ...input, name: input.name.trim(), isActive: input.isActive ?? true };
  if (existing) { Object.assign(existing, data); return existing; }
  const b: Bill = { ...data, id: uid() };
  s.bills.push(b);
  return b;
}

export function deleteBill(s: State, id: ID) {
  s.bills = s.bills.filter(b => b.id !== id);
}

export function payBill(s: State, billId: ID, fields: { amount: number; accountId: ID | null; date: string; month: string }) {
  const b = byId(s.bills, billId) ?? fail('To‘lov topilmadi.');
  need(!new Ledger(s).isBillPaid(b.id, fields.month), 'Bu oy uchun allaqachon to‘langan.');
  return saveTransaction(s, {
    type: 'expense', amount: fields.amount, categoryId: b.categoryId, accountId: fields.accountId, date: fields.date,
    note: b.name, billId: b.id, billMonth: fields.month,
  });
}

// ---------- Rejali xaridlar ----------

export function savePlanned(s: State, input: Omit<PlannedPurchase, 'id' | 'status' | 'createdAt'> & { id?: ID }) {
  requireName(input.name);
  requireAmount(input.amount);
  const existing = byId(s.planned, input.id);
  if (existing) { Object.assign(existing, { ...input, name: input.name.trim() }); return existing; }
  const p: PlannedPurchase = { ...input, name: input.name.trim(), id: uid(), status: 'planned', createdAt: Date.now() };
  s.planned.push(p);
  return p;
}

/** Purchased: xarajat yaratiladi, hisob balansi kamayadi, reja yopiladi. */
export function purchasePlanned(s: State, id: ID, fields: { amount: number; accountId: ID | null; date: string; categoryId: ID | null }) {
  const p = byId(s.planned, id) ?? fail('Reja topilmadi.');
  need(p.status === 'planned', 'Bu reja allaqachon yopilgan.');
  const t = saveTransaction(s, {
    type: 'expense', amount: fields.amount, categoryId: fields.categoryId, accountId: fields.accountId,
    date: fields.date, note: p.name, plannedId: p.id,
  });
  Object.assign(p, { status: 'purchased', transactionId: t.id, categoryId: fields.categoryId });
  return t;
}

export function cancelPlanned(s: State, id: ID) {
  const p = byId(s.planned, id);
  if (p && p.status === 'planned') p.status = 'cancelled';
}

export function reopenPlanned(s: State, id: ID) {
  const p = byId(s.planned, id);
  if (p && p.status === 'cancelled') p.status = 'planned';
}

export function deletePlanned(s: State, id: ID) {
  const p = byId(s.planned, id);
  need(!p?.transactionId, 'Sotib olingan rejani o‘chirish uchun uning xarajatini o‘chiring.');
  s.planned = s.planned.filter(x => x.id !== id);
}
