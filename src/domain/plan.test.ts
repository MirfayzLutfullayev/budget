import { describe, it, expect, beforeEach } from 'vitest';
import type { State } from './types';
import { emptyState } from './defaults';
import { Ledger } from './engine';
import * as A from './actions';
import { applyPlan, defaultPlan, distribute, matchAccounts } from './plan';
import { currentMonth, today, addDays, monthOf } from '../lib/format';

let s: State;
const L = () => new Ledger(s);
const acc = (name: string) => s.accounts.find(a => a.name === name)!;
const cat = (name: string) => s.categories.find(c => c.name === name && c.type === 'expense')!;

describe('Mening rejam: mavjud ma’lumotni buzmaydi', () => {
  beforeEach(() => {
    s = emptyState();
    // Foydalanuvchi oldindan kiritgan ma'lumot
    const basic = A.saveAccount(s, { name: 'Basic', type: 'card', initialBalance: 1_000_000 });
    A.saveAccount(s, { name: 'Main', type: 'card', initialBalance: 5_000_000 });
    A.saveAccount(s, { name: '6418', type: 'card', initialBalance: 300_000 });
    A.saveTransaction(s, { type: 'expense', amount: 50_000, categoryId: cat('Ovqat').id, accountId: basic.id, date: today(), note: 'tushlik' });
    A.saveTransaction(s, { type: 'expense', amount: 700_000, categoryId: cat('Ingliz tili').id, accountId: acc('6418').id, date: today(), note: '' });
  });

  it('hisoblarni nomi bo‘yicha topadi, yangi hisob faqat yo‘qlari uchun', () => {
    const plan = matchAccounts(s, defaultPlan());
    expect(plan.cards.find(c => c.role === 'daily')!.accountId).toBe(acc('Basic').id);
    expect(plan.cards.find(c => c.role === 'main')!.accountId).toBe(acc('Main').id);
    expect(plan.cards.find(c => c.role === 'fixed')!.accountId).toBe(acc('6418').id);
    expect(plan.cards.find(c => c.role === 'cash')!.accountId).toBeNull();

    const before = structuredClone(s.transactions);
    const balancesBefore = s.accounts.map(a => L().balance(a));
    const r = applyPlan(s, plan);

    expect(r.accountsCreated).toBe(1); // faqat naqd pul
    expect(s.accounts.length).toBe(4);
    expect(s.transactions).toEqual(before); // tranzaksiyalarga tegilmadi
    expect(s.accounts.slice(0, 3).map(a => L().balance(a))).toEqual(balancesBefore);
    expect(acc('Basic').name).toBe('Basic'); // foydalanuvchi nomi saqlandi
  });

  it('kategoriyalarni qayta ishlatadi (Ingliz tili → Kurs, Benzin → Gaz, Metro → Yo‘l)', () => {
    const catsBefore = s.categories.length;
    applyPlan(s, matchAccounts(s, defaultPlan()));
    expect(cat('Ingliz tili').accountId).toBe(acc('6418').id);
    expect(cat('Ingliz tili').monthlyLimit).toBe(700_000);
    expect(cat('Benzin').accountId).toBe(acc('Basic').id);
    expect(cat('Metro').monthlyLimit).toBe(150_000);
    expect(cat('Ovqat').dailyLimit).toBe(80_000);
    // Faqat yo'q bo'lganlari yaratildi: Emergency (Oila, Entertainment, Jamg'arma, Kiyim, Ijara standartda bor)
    expect(s.categories.length).toBe(catsBefore + 1);
    // Oldingi xarajat kategoriyasi o'zgarmadi
    expect(s.transactions[1].categoryId).toBe(cat('Ingliz tili').id);
  });

  it('ikki marta qo‘llansa ham takrorlanmaydi', () => {
    applyPlan(s, matchAccounts(s, defaultPlan()));
    const snapshot = { a: s.accounts.length, c: s.categories.length, b: s.bills.length, i: s.incomeSchedules.length };
    applyPlan(s, matchAccounts(s, defaultPlan()));
    expect({ a: s.accounts.length, c: s.categories.length, b: s.bills.length, i: s.incomeSchedules.length }).toEqual(snapshot);
  });

  it('oylik kirim va «Oilaga» majburiy to‘lovi yaratiladi', () => {
    applyPlan(s, matchAccounts(s, defaultPlan()));
    expect(s.incomeSchedules[0].amount).toBe(7_400_000);
    expect(s.incomeSchedules[0].targetAccountId).toBe(acc('Main').id);
    expect(s.bills[0].amount).toBe(1_200_000);
    expect(s.bills[0].accountId).toBe(acc('Main').id);
  });
});

describe('Karta qoidalari va holati', () => {
  beforeEach(() => {
    s = emptyState();
    A.saveAccount(s, { name: 'TBC', type: 'card', initialBalance: 0 });
    A.saveAccount(s, { name: 'Main', type: 'card', initialBalance: 7_400_000 });
    A.saveAccount(s, { name: '6418', type: 'card', initialBalance: 0 });
    applyPlan(s, matchAccounts(s, defaultPlan()));
  });

  it('taqsimlash: Main → TBC 3M, 6418 1.7M (xarajat emas)', () => {
    const plan = L().distributionPlan(currentMonth(), acc('Main').id);
    expect(plan.map(p => [p.account.name, p.due])).toEqual([['TBC', 3_000_000], ['6418', 1_700_000]]);
    distribute(s, acc('Main').id, plan.map(p => ({ toId: p.account.id, amount: p.due })));
    expect(L().balance(acc('TBC'))).toBe(3_000_000);
    expect(L().balance(acc('6418'))).toBe(1_700_000);
    expect(L().balance(acc('Main'))).toBe(2_700_000);
    expect(L().monthTotals(currentMonth()).expenses).toBe(0);
    expect(L().distributionPlan(currentMonth(), acc('Main').id).every(p => p.due === 0)).toBe(true);
  });

  it('TBC’dan kiyim — qoida buzilishi (qizil); Main’dan ovqat — faqat ogohlantirish', () => {
    const bad = A.saveTransaction(s, { type: 'expense', amount: 200_000, categoryId: cat('Kiyim').id, accountId: acc('TBC').id, date: today(), note: '' });
    const foreign = A.saveTransaction(s, { type: 'expense', amount: 30_000, categoryId: cat('Ovqat').id, accountId: acc('Main').id, date: today(), note: '' });
    const ok = A.saveTransaction(s, { type: 'expense', amount: 40_000, categoryId: cat('Ovqat').id, accountId: acc('TBC').id, date: today(), note: '' });
    expect(L().isViolation(bad)).toBe(true);
    expect(L().isViolation(foreign)).toBe(false);
    expect(L().isForeignCard(foreign)).toBe(true);
    expect(L().isViolation(ok)).toBe(false);
    expect(L().violations(currentMonth()).map(t => t.id)).toEqual([bad.id]);
    expect(L().reminders(today()).some(r => r.id === `viol-${bad.id}` && r.level === 'danger')).toBe(true);
    // Main — erkin karta: Entertainment ham, Emergency ham mumkin
    const fun = A.saveTransaction(s, { type: 'expense', amount: 100_000, categoryId: cat('Kiyim').id, accountId: acc('Main').id, date: today(), note: '' });
    expect(L().isViolation(fun)).toBe(false);
  });

  it('TBC konverti: limit 3M, sarflangan, qolgan, kunlik ruxsat', () => {
    A.saveTransaction(s, { type: 'expense', amount: 1_000_000, categoryId: cat('Ovqat').id, accountId: acc('TBC').id, date: today(), note: '' });
    A.saveTransaction(s, { type: 'expense', amount: 77_000, categoryId: cat('Telefon').id, accountId: acc('TBC').id, date: today(), note: '' });
    const st = L().cardStatus(acc('TBC'), currentMonth(), today());
    expect(st.limitTotal).toBe(3_000_000);
    expect(st.spent).toBe(1_077_000);
    expect(st.left).toBe(1_923_000);
    expect(st.perDay).toBe(Math.floor(1_923_000 / st.daysLeft));
    expect(st.rows.find(r => r.category.name === 'Telefon')!.left).toBe(0);
  });

  it('kunlik limit: bugun va oy boshidan beri reja bilan solishtirish', () => {
    A.saveTransaction(s, { type: 'expense', amount: 120_000, categoryId: cat('Ovqat').id, accountId: acc('TBC').id, date: today(), note: '' });
    const d = L().dailyStatus(today()).find(x => x.category.name === 'Ovqat')!;
    expect(d.dailyLimit).toBe(80_000);
    expect(d.today).toBe(120_000);
    // Reja birinchi yozuvdan hisoblanadi: bugun birinchi kun → 80k
    expect(d.expected).toBe(80_000);
    expect(d.diff).toBe(40_000);
    expect(L().reminders(today()).some(r => r.id.startsWith('day-'))).toBe(true);
  });

  it('prognoz: shu tempda oshib ketsa ogohlantiradi', () => {
    const day = Number(today().slice(8, 10));
    const tbc = acc('TBC');
    // Kuniga 150k tempi → 30 kunda 4.5M > 3M
    A.saveTransaction(s, { type: 'expense', amount: 150_000 * day, categoryId: cat('Ovqat').id, accountId: tbc.id, date: today(), note: '' });
    const st = L().cardStatus(tbc, currentMonth(), today());
    if (st.over === 0) expect(st.projectedOver).toBeGreaterThan(0);
    expect(monthOf(addDays(today(), 0))).toBe(currentMonth());
  });
});
