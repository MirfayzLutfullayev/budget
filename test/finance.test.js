// Texnik hujjatning 44-bo'limidagi testlar va qo'shimcha holatlar.
// Ishga tushirish: node --test test/

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../js/store.js';
import { Ledger } from '../js/engine.js';
import { today, currentMonth, addMonths, addDays, daysInMonth, short, plain, parseAmount } from '../js/util.js';

const L = () => new Ledger(store.state);
const cat = name => store.state.categories.find(c => c.name === name);

beforeEach(() => {
  store.setState({});
});

test('Test 1: daromad 7.4m + 4.8m = 12.2m', () => {
  const key = '2026-09';
  store.saveIncome({ amount: 7_400_000, source: 'Maosh', date: '2026-09-01' });
  store.saveIncome({ amount: 4_800_000, source: 'Maosh', date: '2026-09-15' });
  assert.equal(L().incomeReceived(key), 12_200_000);
});

test('Test 2: Ovqat -35k → limit qoldig‘i va karta balansi kamayadi', () => {
  const key = currentMonth();
  const food = cat('Ovqat');
  food.defaultLimit = 2_400_000;
  const card = store.saveCard({ name: 'Basic', opening: 3_000_000 });

  const warnings = store.saveExpense({ amount: 35_000, categoryId: food.id, cardId: card.id, date: today() });

  assert.deepEqual(warnings, []);
  assert.equal(L().row(food, key).remaining, 2_365_000);
  assert.equal(L().cardBalance(card), 2_965_000);
});

test('Test 3: TBC 10.5m - 1.5m = 9m, qoldiqdan katta to‘lov rad etiladi', () => {
  const debt = store.saveDebt({ name: 'TBC', starting: 10_500_000, rate: 48, dueDay: 11 });
  store.payDebt({ debtId: debt.id, amount: 1_500_000, date: today() });
  assert.equal(L().debtRemaining(debt), 9_000_000);

  assert.throws(() => store.payDebt({ debtId: debt.id, amount: 9_000_001, date: today() }));
  assert.equal(L().debtRemaining(debt), 9_000_000);
});

test('Test 4: To‘y fondi 1.4m - 600k = 800k, oylik limitga ta’sir qilmaydi', () => {
  const wedding = cat('To‘y');
  wedding.defaultLimit = 500_000;
  const fund = store.saveFund({ name: 'To‘ylar', icon: '💍', opening: 1_400_000, monthly: 700_000 });

  store.saveExpense({ amount: 600_000, categoryId: wedding.id, fundId: fund.id, date: today() });

  assert.equal(L().fundBalance(fund), 800_000);
  assert.equal(L().row(wedding, currentMonth()).spent, 0);
  assert.equal(L().fundMonthly(fund), 700_000);
});

test('Test 5: Ovqat 2.4m → 2.7m — kod o‘zgarmasdan', () => {
  const key = currentMonth();
  const food = cat('Ovqat');
  food.defaultLimit = 2_400_000;
  store.createMonth(key, 'template');
  assert.equal(L().limit(food, key), 2_400_000);

  store.setAllocation(food.id, key, { type: 'fixed', amount: 2_700_000 });
  assert.equal(L().limit(food, key), 2_700_000);
  assert.equal(food.defaultLimit, 2_400_000, 'shablon o‘zgarmasligi kerak');
});

test('Oldingi oydan nusxa', () => {
  const key = currentMonth();
  const food = cat('Ovqat');
  store.setAllocation(food.id, addMonths(key, -1), { type: 'fixed', amount: 3_000_000 });
  store.createMonth(key, 'previous');
  assert.equal(L().limit(food, key), 3_000_000);
});

test('Foizli limit daromaddan hisoblanadi', () => {
  const key = currentMonth();
  const food = cat('Ovqat');
  store.saveIncomeSource({ name: 'Maosh', amount: 12_200_000, day: 1 });
  store.setAllocation(food.id, key, { type: 'percent', percent: 20 });
  assert.equal(L().limit(food, key), 2_440_000);
});

test('Guruh darajasidagi limit (Entertainment) subkategoriyalar xarajatini yig‘adi', () => {
  const key = currentMonth();
  const ent = cat('Entertainment');
  ent.defaultLimit = 300_000;
  const girls = cat('Qizlar');
  store.saveExpense({ amount: 120_000, categoryId: girls.id, date: today() });
  store.saveExpense({ amount: 100_000, categoryId: cat('O‘zim uchun').id, date: today() });

  const row = L().row(ent, key);
  assert.equal(row.spent, 220_000);
  assert.equal(row.remaining, 80_000);
  assert.ok(L().units.includes(ent));
  assert.ok(!L().units.includes(girls), 'subkategoriya alohida budget qatori bo‘lmaydi');
});

test('Budget > daromad ogohlantirishi', () => {
  store.saveIncomeSource({ name: 'Maosh', amount: 1_000_000, day: 1 });
  cat('Ovqat').defaultLimit = 2_000_000;
  assert.ok(L().alerts(today()).some(a => a.text.includes('daromaddan oshib')));
});

test('Takroriy to‘lov ikki marta yaratilmaydi, o‘tkazib yuborilgan oylar qo‘shiladi', () => {
  const rent = store.saveRecurring({ name: 'Ijara', amount: 600_000, categoryId: cat('Ijara').id, day: 1,
    startMonth: addMonths(currentMonth(), -2) });

  assert.equal(store.generateRecurring(), 3);
  assert.equal(store.generateRecurring(), 0);
  rent.lastGenerated = null;
  assert.equal(store.generateRecurring(), 0);
  assert.equal(store.state.expenses.length, 3);
});

test('Takroriy to‘lov kuni kelmagan bo‘lsa yozilmaydi', () => {
  const day = Number(today().slice(8, 10));
  if (day === daysInMonth(currentMonth())) return; // oyning oxirgi kuni — ertangi kun keyingi oyda
  store.saveRecurring({ name: 'Telefon', amount: 77_000, categoryId: cat('Telefon').id, day: day + 1,
    startMonth: currentMonth() });
  assert.equal(store.generateRecurring(), 0);
});

test('Kunlik limit qolgan kunlarga qayta hisoblanadi', () => {
  const food = cat('Ovqat');
  food.defaultLimit = 3_000_000;
  const before = L().dailyStatus(food, today());
  assert.equal(before.baseDaily, Math.floor(3_000_000 / daysInMonth(currentMonth())));

  store.saveExpense({ amount: 50_000, categoryId: food.id, date: today() });
  const after = L().dailyStatus(food, today());
  assert.equal(after.spentToday, 50_000);
  assert.equal(after.allowance, before.allowance);
  assert.equal(after.saved, before.allowance - 50_000);
});

test('Fondlarga oylik hissa bir marta o‘tkaziladi', () => {
  const key = currentMonth();
  const fund = store.saveFund({ name: 'Emergency', icon: '🛟', emergency: true, target: 3_000_000, monthly: 1_000_000 });
  store.createMonth(key, 'template');

  assert.equal(store.contributeMonthly(key), 1_000_000);
  assert.equal(store.contributeMonthly(key), 0);
  assert.equal(L().fundBalance(fund), 1_000_000);
  assert.equal(L().emergencyBalance, 1_000_000);
  assert.equal(L().summary(key).emergency, 1_000_000);
});

test('Qarz tuzatish (foiz) va to‘lov sanasi', () => {
  const debt = store.saveDebt({ name: 'Uzum', starting: 5_500_000, rate: 49, dueDay: 11 });
  store.adjustDebt({ debtId: debt.id, delta: 200_000, date: today() });
  assert.equal(L().debtRemaining(debt), 5_700_000);
  assert.throws(() => store.adjustDebt({ debtId: debt.id, delta: -6_000_000, date: today() }));
  const days = L().daysUntilDue(debt, today());
  assert.ok(days >= 0 && days <= 31);
});

test('Kartalararo o‘tkazma va manfiy balans ogohlantirishi', () => {
  const main = store.saveCard({ name: 'Main', opening: 1_000_000, isIncome: true });
  const basic = store.saveCard({ name: 'Basic', opening: 0, isDefault: true });
  store.transfer({ amount: 300_000, fromId: main.id, toId: basic.id, date: today() });
  assert.equal(L().cardBalance(main), 700_000);
  assert.equal(L().cardBalance(basic), 300_000);
  assert.throws(() => store.transfer({ amount: 1, fromId: main.id, toId: main.id, date: today() }));

  const warnings = store.saveExpense({ amount: 400_000, categoryId: cat('Ovqat').id, cardId: basic.id, date: today() });
  assert.equal(warnings.length, 1);
});

test('Kategoriyani o‘chirish subkategoriyalarni ham o‘chiradi', () => {
  const group = cat('Kundalik');
  const count = store.state.categories.length;
  store.deleteCategory(group.id);
  assert.equal(store.state.categories.length, count - 4);
});

test('Tahrirlash boshqa maydonlarni buzmaydi', () => {
  const fund = store.saveFund({ name: 'Uyga borish', icon: '🚌', opening: 600_000, target: 900_000, monthly: 600_000 });
  store.saveFund({ id: fund.id, name: 'Uyga borish', icon: '🚌', target: 1_000_000, monthly: 500_000, active: true });
  assert.equal(L().fundBalance(fund), 600_000);
  assert.equal(L().fundMonthly(fund), 500_000);

  const rent = store.saveRecurring({ name: 'Ijara', amount: 600_000, categoryId: cat('Ijara').id, day: 1,
    startMonth: currentMonth() });
  store.generateRecurring();
  const generated = store.state.expenses.find(e => e.recurringId === rent.id);
  store.saveExpense({ id: generated.id, amount: 650_000, categoryId: cat('Ijara').id, date: generated.date });
  assert.equal(store.state.expenses.find(e => e.id === generated.id).recurringId, rent.id);
});

test('Formatlash', () => {
  assert.equal(plain(7_400_000), '7 400 000');
  assert.equal(short(12_200_000), '12.2m');
  assert.equal(short(850_000), '850k');
  assert.equal(short(77_000), '77k');
  assert.equal(parseAmount('7 400 000 so‘m'), 7_400_000);
  assert.equal(addMonths('2026-01', -1), '2025-12');
  assert.equal(addDays('2026-02-28', 1), '2026-03-01');
});
