import { describe, it, expect, beforeEach } from 'vitest';
import type { State } from './types';
import { emptyState } from './defaults';
import { Ledger } from './engine';
import * as A from './actions';
import { currentMonth, today, addMonths, monthDate, addDays } from '../lib/format';

let s: State;
const L = () => new Ledger(s);
const cat = (name: string) => s.categories.find(c => c.name === name)!;

function setup() {
  s = emptyState();
  const cash = A.saveAccount(s, { name: 'Cash', type: 'cash', initialBalance: 500_000 });
  const main = A.saveAccount(s, { name: 'Main', type: 'card', initialBalance: 2_100_000 });
  const basic = A.saveAccount(s, { name: 'Basic', type: 'card', initialBalance: 1_200_000 });
  const c6418 = A.saveAccount(s, { name: '6418', type: 'card', initialBalance: 700_000 });
  return { cash, main, basic, c6418 };
}

describe('Hisoblar (4, 23, 35-bo‘lim)', () => {
  beforeEach(() => setup());

  it('Total Money = barcha hisoblar yig‘indisi (4.5M)', () => {
    expect(L().totalMoney).toBe(4_500_000);
  });

  it('Faol emas hisob Total Money’ga kirmaydi', () => {
    s.accounts[0].isActive = false;
    expect(L().totalMoney).toBe(4_000_000);
  });
});

describe('Kirim va chiqim (6, 7, 40, 41-bo‘lim)', () => {
  beforeEach(() => setup());

  it('Kirim hisob balansini oshiradi', () => {
    const basic = s.accounts[2];
    A.saveTransaction(s, { type: 'income', amount: 4_800_000, categoryId: cat('Maosh').id, accountId: basic.id, date: today(), note: '' });
    expect(L().balance(basic)).toBe(6_000_000);
    expect(L().totalMoney).toBe(9_300_000);
    expect(L().monthTotals(currentMonth()).income).toBe(4_800_000);
  });

  it('Chiqim: balans, budjet va statistika yangilanadi', () => {
    const basic = s.accounts[2];
    const food = cat('Ovqat');
    food.monthlyLimit = 2_400_000;
    A.saveTransaction(s, { type: 'expense', amount: 80_000, categoryId: food.id, accountId: basic.id, date: today(), note: '' });
    expect(L().balance(basic)).toBe(1_120_000);
    const row = L().budgetRows(currentMonth()).find(r => r.category.id === food.id)!;
    expect(row.actual).toBe(80_000);
    expect(row.left).toBe(2_320_000);
    expect(L().monthTotals(currentMonth()).expenses).toBe(80_000);
  });

  it('Hisobsiz yoki summasiz chiqim qabul qilinmaydi', () => {
    expect(() => A.saveTransaction(s, { type: 'expense', amount: 0, categoryId: cat('Ovqat').id, accountId: s.accounts[0].id, date: today(), note: '' })).toThrow();
    expect(() => A.saveTransaction(s, { type: 'expense', amount: 10, categoryId: cat('Ovqat').id, accountId: null, date: today(), note: '' })).toThrow();
    expect(() => A.saveTransaction(s, { type: 'expense', amount: 10, categoryId: null, accountId: s.accounts[0].id, date: today(), note: '' })).toThrow();
  });
});

describe('Transfer (24, 37-bo‘lim)', () => {
  beforeEach(() => setup());

  it('Main → Basic 1M: xarajat 0, Total Money o‘zgarmaydi', () => {
    const [, main, basic] = s.accounts;
    A.saveTransfer(s, { fromAccountId: main.id, toAccountId: basic.id, amount: 1_000_000, date: today(), note: '' });
    expect(L().balance(main)).toBe(1_100_000);
    expect(L().balance(basic)).toBe(2_200_000);
    expect(L().totalMoney).toBe(4_500_000);
    expect(L().monthTotals(currentMonth()).expenses).toBe(0);
  });

  it('Bir hisobdan o‘sha hisobga o‘tkazib bo‘lmaydi', () => {
    const main = s.accounts[1];
    expect(() => A.saveTransfer(s, { fromAccountId: main.id, toAccountId: main.id, amount: 1, date: today(), note: '' })).toThrow();
  });
});

describe('Qarz (20–22, 38-bo‘lim)', () => {
  beforeEach(() => setup());

  it('TBC to‘lovi: hisob −1M, qarz −1M, xarajat statistikasiga aralashmaydi', () => {
    const basic = s.accounts[2];
    const tbc = A.saveDebt(s, { name: 'TBC', startingBalance: 10_500_000, interestRate: 48, dueDay: 11 });
    A.saveDebt(s, { name: 'Uzum', startingBalance: 5_500_000, interestRate: 49 });
    A.saveDebt(s, { name: 'Shox', startingBalance: 12_000_000 });
    expect(L().totalDebt).toBe(28_000_000);

    A.payDebt(s, { debtId: tbc.id, amount: 1_000_000, accountId: basic.id, date: today() });
    expect(L().balance(basic)).toBe(200_000);
    expect(L().debtRemaining(tbc)).toBe(9_500_000);
    expect(L().totalDebt).toBe(27_000_000);
    const t = L().monthTotals(currentMonth());
    expect(t.expenses).toBe(0);
    expect(t.debtPaid).toBe(1_000_000);
  });

  it('Qoldiqdan katta to‘lov rad etiladi', () => {
    const d = A.saveDebt(s, { name: 'Uzum', startingBalance: 500_000 });
    expect(() => A.payDebt(s, { debtId: d.id, amount: 500_001, accountId: s.accounts[1].id, date: today() })).toThrow(/qoldiq/);
  });

  it('To‘lovni tahrirlashda ham qoldiq tekshiriladi', () => {
    const d = A.saveDebt(s, { name: 'Uzum', startingBalance: 500_000 });
    const t = A.payDebt(s, { debtId: d.id, amount: 400_000, accountId: s.accounts[1].id, date: today() });
    expect(() => A.saveTransaction(s, { ...t, amount: 600_000 })).toThrow();
    A.saveTransaction(s, { ...t, amount: 500_000 });
    expect(L().debtRemaining(d)).toBe(0);
  });
});

describe('Budget, Saved, Overspent (14–17-bo‘lim)', () => {
  beforeEach(() => setup());

  function spend(name: string, amount: number) {
    A.saveTransaction(s, { type: 'expense', amount, categoryId: cat(name).id, accountId: s.accounts[1].id, date: today(), note: '' });
  }

  it('Budget 6M, Actual 5.3M → Saved 700k', () => {
    cat('Ovqat').monthlyLimit = 3_000_000;
    cat('Ijara').monthlyLimit = 3_000_000;
    spend('Ovqat', 2_800_000);
    spend('Ijara', 2_500_000);
    const b = L().budgetSummary(currentMonth());
    expect(b.limit).toBe(6_000_000);
    expect(b.actual).toBe(5_300_000);
    expect(b.saved).toBe(700_000);
    expect(b.overspent).toBe(0);
  });

  it('Oshib ketsa — Overspent va kategoriyalar ro‘yxati', () => {
    cat('Ovqat').monthlyLimit = 2_400_000;
    cat('Benzin').monthlyLimit = 400_000;
    spend('Ovqat', 2_650_000);
    spend('Benzin', 450_000);
    const b = L().budgetSummary(currentMonth());
    expect(b.overspent).toBe(300_000);
    expect(b.overRows.map(r => [r.category.name, r.over])).toEqual([['Ovqat', 250_000], ['Benzin', 50_000]]);
  });

  it('Create October Budget: oldingi oydan nusxa, limitni kodsiz o‘zgartirish', () => {
    const key = currentMonth();
    cat('Ovqat').monthlyLimit = 2_400_000;
    A.createMonthBudget(s, key, 'defaults');
    A.setLimit(s, key, cat('Ovqat').id, 2_700_000, false);
    expect(L().limit(cat('Ovqat'), key)).toBe(2_700_000);
    expect(cat('Ovqat').monthlyLimit).toBe(2_400_000);

    const next = addMonths(key, 1);
    A.createMonthBudget(s, next, 'previous');
    expect(L().limit(cat('Ovqat'), next)).toBe(2_700_000);
  });

  it('Qarz va jamg‘arma budjet xarajatiga kirmaydi', () => {
    A.saveTransaction(s, { type: 'expense', amount: 1_000_000, categoryId: cat('Jamg‘arma').id, accountId: s.accounts[1].id, date: today(), note: '' });
    const t = L().monthTotals(currentMonth());
    expect(t.expenses).toBe(0);
    expect(t.savings).toBe(1_000_000);
  });
});

describe('Kutilgan kirim va Coming Soon (12, 13, 36-bo‘lim)', () => {
  beforeEach(() => setup());

  it('Expected kirim Total Money’ga qo‘shilmaydi; Received bo‘lganda qo‘shiladi', () => {
    const basic = s.accounts[2];
    const e = A.saveExpectedIncome(s, { amount: 4_800_000, source: 'Maosh', targetAccountId: basic.id, categoryId: cat('Maosh').id,
      expectedDate: addDays(today(), 3), note: '' });
    expect(L().totalMoney).toBe(4_500_000);
    expect(L().comingSoon(today()).total).toBe(4_800_000);

    A.receiveIncome(s, e.id, { amount: 4_800_000, accountId: basic.id, date: today() });
    expect(L().totalMoney).toBe(9_300_000);
    expect(L().comingSoon(today()).total).toBe(0);
    expect(s.expectedIncomes[0].status).toBe('received');
  });

  it('Kirim tranzaksiyasi o‘chirilsa, kutilgan kirim qayta ochiladi', () => {
    const e = A.saveExpectedIncome(s, { amount: 100, source: 'Bonus', targetAccountId: s.accounts[0].id, categoryId: null, expectedDate: today(), note: '' });
    const t = A.receiveIncome(s, e.id, { amount: 100, accountId: s.accounts[0].id, date: today() });
    A.deleteTransaction(s, t.id);
    expect(s.expectedIncomes[0].status).toBe('expected');
  });

  it('Qo‘shilishidan oldingi sana kutilmaydi (pul allaqachon balansda — ikki marta hisoblanmasin)', () => {
    const sch = A.saveIncomeSchedule(s, { source: 'Maosh', amount: 100, day: 1, targetAccountId: null, categoryId: null });
    sch.startDate = `${currentMonth()}-02`;
    A.ensureExpectedIncomes(s, `${currentMonth()}-20`);
    expect(s.expectedIncomes.map(i => i.expectedDate)).toEqual([monthDate(addMonths(currentMonth(), 1), 1)]);
  });

  it('Jadvaldan joriy va keyingi oy uchun bir martadan yaratiladi', () => {
    A.saveIncomeSchedule(s, { source: 'Maosh 1', amount: 7_400_000, day: 1, targetAccountId: s.accounts[1].id, categoryId: cat('Maosh').id });
    A.saveIncomeSchedule(s, { source: 'Maosh 2', amount: 4_800_000, day: 15, targetAccountId: s.accounts[2].id, categoryId: cat('Maosh').id });
    for (const x of s.incomeSchedules) x.startDate = `${currentMonth()}-01`;
    expect(A.ensureExpectedIncomes(s)).toBe(4);
    expect(A.ensureExpectedIncomes(s)).toBe(0);
    expect(s.expectedIncomes.map(i => i.expectedDate)).toContain(monthDate(addMonths(currentMonth(), 1), 15));
  });
});

describe('Safe to Spend (11, 18, 19, 35-bo‘lim)', () => {
  beforeEach(() => setup());

  it('Total − rejali xaridlar − majburiy to‘lovlar', () => {
    A.savePlanned(s, { name: 'Creatine', amount: 300_000, date: null, categoryId: cat('Sport').id, note: '' });
    A.savePlanned(s, { name: 'Charger', amount: 200_000, date: null, categoryId: cat('Shaxsiy').id, note: '' });
    A.saveBill(s, { name: 'Ijara', amount: 600_000, categoryId: cat('Ijara').id, accountId: s.accounts[3].id, day: 28, startDate: `${currentMonth()}-01` });
    const d = A.saveDebt(s, { name: 'TBC', startingBalance: 10_500_000, minimumPayment: 900_000, dueDay: 11 });
    const safe = L().safeToSpend(today());
    expect(safe.total).toBe(4_500_000);
    expect(safe.planned).toBe(500_000);
    expect(safe.required).toBe(1_500_000);
    expect(safe.value).toBe(2_500_000);

    // Ijara to'landi → majburiy ro'yxatdan chiqadi; qarzning minimal to'lovi qisman to'landi
    A.payBill(s, s.bills[0].id, { amount: 600_000, accountId: s.accounts[3].id, date: today(), month: currentMonth() });
    A.payDebt(s, { debtId: d.id, amount: 400_000, accountId: s.accounts[1].id, date: today() });
    const after = L().safeToSpend(today());
    expect(after.required).toBe(500_000);
    expect(after.value).toBe(3_500_000 - 500_000 - 500_000);
    expect(() => A.payBill(s, s.bills[0].id, { amount: 600_000, accountId: s.accounts[3].id, date: today(), month: currentMonth() })).toThrow();
  });

  it('Majburiy to‘lov qo‘shilishidan oldingi sanasi bu oy talab qilinmaydi (soxta «kechikdi» yo‘q)', () => {
    A.saveBill(s, { name: 'Oilaga', amount: 1_200_000, categoryId: cat('Oila').id, accountId: null, day: 1, startDate: `${currentMonth()}-02` });
    expect(L().requiredUpcoming(`${currentMonth()}-20`)).toEqual([]);
    expect(L().reminders(`${currentMonth()}-20`).some(r => r.id.startsWith('bill-'))).toBe(false);
    // Keyingi oydan boshlab talab qilinadi
    const next = addMonths(currentMonth(), 1);
    expect(L().requiredUpcoming(`${next}-05`).map(r => r.amount)).toEqual([1_200_000]);
  });

  it('Rejali xarid: Purchased → xarajat yaratiladi, reja yopiladi; Cancelled → rezervdan chiqadi', () => {
    const p = A.savePlanned(s, { name: 'Birthday gift', amount: 500_000, date: null, categoryId: cat('Shaxsiy').id, note: '' });
    const q = A.savePlanned(s, { name: 'Charger', amount: 200_000, date: null, categoryId: cat('Shaxsiy').id, note: '' });
    A.purchasePlanned(s, p.id, { amount: 450_000, accountId: s.accounts[1].id, date: today(), categoryId: p.categoryId });
    A.cancelPlanned(s, q.id);
    expect(L().plannedReserved).toBe(0);
    expect(L().balance(s.accounts[1])).toBe(1_650_000);
    expect(s.planned.map(x => x.status)).toEqual(['purchased', 'cancelled']);
  });
});

describe('Yangi yozuvlar doim yangi id oladi (formalar id: undefined yuboradi)', () => {
  beforeEach(() => setup());

  it('hisob, kategoriya, qarz, reja, to‘lov, jadval', () => {
    const d1 = A.saveDebt(s, { id: undefined, name: 'Uzum', startingBalance: 1 });
    const d2 = A.saveDebt(s, { id: undefined, name: 'TBC', startingBalance: 2 });
    const a1 = A.saveAccount(s, { id: undefined, name: 'X', type: 'cash' });
    const c1 = A.saveCategory(s, { id: undefined, name: 'Sayohat' });
    const p1 = A.savePlanned(s, { id: undefined, name: 'A', amount: 1, date: null, categoryId: null, note: '' });
    const b1 = A.saveBill(s, { id: undefined, name: 'B', amount: 1, categoryId: cat('Ijara').id, accountId: null, day: 1 });
    const i1 = A.saveIncomeSchedule(s, { id: undefined, source: 'M', amount: 1, day: 1, targetAccountId: null, categoryId: null });
    for (const x of [d1, d2, a1, c1, p1, b1, i1]) expect(typeof x.id === 'string' && x.id.length > 5).toBe(true);
    expect(d1.id).not.toBe(d2.id);
    expect(new Set(s.debts.map(d => d.id)).size).toBe(2);
  });
});

describe('Himoya: ishlatilgan yozuvlarni o‘chirib bo‘lmaydi', () => {
  beforeEach(() => setup());

  it('Tranzaksiyasi bor hisob va kategoriya o‘chirilmaydi', () => {
    A.saveTransaction(s, { type: 'expense', amount: 1, categoryId: cat('Ovqat').id, accountId: s.accounts[0].id, date: today(), note: '' });
    expect(() => A.deleteAccount(s, s.accounts[0].id)).toThrow();
    expect(() => A.deleteCategory(s, cat('Ovqat').id)).toThrow();
    A.deleteAccount(s, s.accounts[3].id);
    expect(s.accounts.length).toBe(3);
  });
});

describe('Eslatmalar', () => {
  beforeEach(() => setup());

  it('Zaxira, kutilgan kirim, majburiy to‘lov va limit eslatmalari', () => {
    A.saveExpectedIncome(s, { amount: 4_800_000, source: 'Maosh', targetAccountId: s.accounts[2].id, categoryId: null, expectedDate: today(), note: '' });
    A.saveBill(s, { name: 'Ijara', amount: 600_000, categoryId: cat('Ijara').id, accountId: null, day: Number(today().slice(8)) });
    cat('Ovqat').monthlyLimit = 100_000;
    A.saveTransaction(s, { type: 'expense', amount: 95_000, categoryId: cat('Ovqat').id, accountId: s.accounts[0].id, date: today(), note: '' });
    const ids = L().reminders(today()).map(r => r.id);
    expect(ids).toContain('backup');
    expect(ids.some(i => i.startsWith('inc-'))).toBe(true);
    expect(ids.some(i => i.startsWith('bill-'))).toBe(true);
    expect(ids.some(i => i.startsWith('near-'))).toBe(true);
  });
});

describe('Oy yakuni (42-bo‘lim)', () => {
  beforeEach(() => setup());

  it('Oylik xulosa: Income, Expenses, Debt Paid alohida', () => {
    const [, main, basic] = s.accounts;
    A.saveTransaction(s, { type: 'income', amount: 7_400_000, categoryId: cat('Maosh').id, accountId: main.id, date: today(), note: '' });
    A.saveTransaction(s, { type: 'income', amount: 4_800_000, categoryId: cat('Maosh').id, accountId: basic.id, date: today(), note: '' });
    A.saveTransaction(s, { type: 'expense', amount: 5_800_000, categoryId: cat('Ovqat').id, accountId: main.id, date: today(), note: '' });
    const d = A.saveDebt(s, { name: 'TBC', startingBalance: 10_500_000 });
    A.payDebt(s, { debtId: d.id, amount: 2_000_000, accountId: basic.id, date: today() });
    const t = L().monthTotals(currentMonth());
    expect(t).toEqual({ income: 12_200_000, expenses: 5_800_000, debtPaid: 2_000_000, savings: 0 });
  });
});
