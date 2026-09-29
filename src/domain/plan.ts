// Kartalar bo'yicha taqsimot ("konvert") rejasi va uni qo'llash.
// Qo'llash hech narsani o'chirmaydi: mavjud karta va kategoriyalar nomi bo'yicha topilib yangilanadi,
// yo'qlari yaratiladi. Tranzaksiyalarga tegilmaydi.

import type { Account, Category, ID, State } from './types';
import { saveAccount, saveBill, saveCategory, saveIncomeSchedule, saveTransfer, setLimit } from './actions';
import { currentMonth, today } from '../lib/format';

export interface PlanCategory {
  key: string;
  name: string;
  icon: string;
  /** Mavjud kategoriyani topish uchun muqobil nomlar. */
  aliases: string[];
  limit: number;
  dailyLimit: number;
  kind?: Category['kind'];
}

export interface PlanCard {
  role: string;
  name: string;
  type: Account['type'];
  aliases: string[];
  purpose: string;
  plan: number;
  strict: boolean;
  isIncome?: boolean;
  /** Mavjud hisob id'si (foydalanuvchi tanlaydi) yoki null — yangi yaratiladi. */
  accountId: ID | null;
  categories: PlanCategory[];
}

export interface Plan {
  income: { source: string; amount: number; day: number };
  family: { name: string; amount: number; day: number };
  cards: PlanCard[];
}

/** Foydalanuvchi taqsimoti (o'zgartirish mumkin — qo'llashdan oldin formada tahrirlanadi). */
export function defaultPlan(): Plan {
  return {
    income: { source: 'Maosh', amount: 7_400_000, day: 1 },
    family: { name: 'Oilaga', amount: 1_200_000, day: 1 },
    cards: [
      {
        role: 'daily', name: 'TBC', type: 'card', aliases: ['tbc', 'tbc card', 'basic'], strict: true, plan: 3_000_000,
        purpose: 'Oziq-ovqat, yo‘l, telefon', accountId: null,
        categories: [
          { key: 'food', name: 'Ovqat', icon: '🍚', aliases: ['ovqat', 'oziq-ovqat', 'oziq ovqat', 'food'], limit: 2_400_000, dailyLimit: 80_000 },
          { key: 'phone', name: 'Telefon', icon: '📱', aliases: ['telefon', 'phone'], limit: 77_000, dailyLimit: 0 },
          { key: 'transport', name: 'Yo‘l', icon: '🚇', aliases: ['yo‘l', "yo'l", 'yol', 'metro', 'yo‘l puli', 'transport'], limit: 150_000, dailyLimit: 0 },
          { key: 'fuel', name: 'Gaz', icon: '⛽', aliases: ['gaz', 'benzin', 'fuel'], limit: 373_000, dailyLimit: 0 },
        ],
      },
      {
        role: 'fixed', name: '6418', type: 'card', aliases: ['6418'], strict: true, plan: 1_700_000,
        purpose: 'Kurs, ijara, kiyim + jamg‘arma', accountId: null,
        categories: [
          { key: 'course', name: 'Kurs', icon: '📚', aliases: ['kurs', 'ingliz tili', 'english', 'ta’lim', "ta'lim"], limit: 700_000, dailyLimit: 0 },
          { key: 'rent', name: 'Ijara', icon: '🏠', aliases: ['ijara', 'uy ijara', 'rent'], limit: 600_000, dailyLimit: 0 },
          { key: 'clothes', name: 'Kiyim', icon: '👕', aliases: ['kiyim', 'clothes'], limit: 400_000, dailyLimit: 0 },
          { key: 'savings', name: 'Jamg‘arma', icon: '🏦', aliases: ['jamg‘arma', "jamg'arma", 'savings'], limit: 0, dailyLimit: 0, kind: 'savings' },
        ],
      },
      {
        role: 'main', name: 'Main', type: 'card', aliases: ['main', 'asosiy', 'humo', 'uzcard'], strict: false, plan: 0, isIncome: true,
        purpose: 'Maosh tushadi · oila, entertainment, emergency', accountId: null,
        categories: [
          { key: 'family', name: 'Oila', icon: '👨‍👩‍👧', aliases: ['oila', 'uyga', 'oilaga', 'family'], limit: 1_200_000, dailyLimit: 0 },
          { key: 'fun', name: 'Entertainment', icon: '🎉', aliases: ['entertainment', 'ko‘ngilochar'], limit: 700_000, dailyLimit: 0 },
          { key: 'emergency', name: 'Emergency', icon: '🛟', aliases: ['emergency', 'favqulodda'], limit: 0, dailyLimit: 0 },
        ],
      },
      {
        role: 'cash', name: 'Naqd pul', type: 'cash', aliases: ['naqd', 'naqd pul', 'cash'], strict: false, plan: 0,
        purpose: 'Naqd pul', accountId: null, categories: [],
      },
    ],
  };
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’ʻʼ`]/g, "'").trim();

/** Mavjud hisoblarni rolga moslab topadi (nomi bo'yicha, naqd — turi bo'yicha). */
export function matchAccounts(s: State, plan: Plan): Plan {
  const used = new Set<ID>();
  const cards = plan.cards.map(card => {
    if (card.accountId) { used.add(card.accountId); return card; }
    const found = s.accounts.find(a => !used.has(a.id) && card.aliases.some(al => norm(a.name) === norm(al)))
      ?? (card.type === 'cash' ? s.accounts.find(a => !used.has(a.id) && a.type === 'cash') : undefined)
      ?? (card.isIncome ? s.accounts.find(a => !used.has(a.id) && a.type === 'card' && !plan.cards.some(c => c.aliases.some(al => norm(a.name) === norm(al)))) : undefined);
    if (found) used.add(found.id);
    return { ...card, accountId: found?.id ?? null };
  });
  return { ...plan, cards };
}

/** Rejani qo'llaydi. Qaytaradi: nechta hisob/kategoriya yaratildi va yangilandi. */
export function applyPlan(s: State, plan: Plan) {
  const report = { accountsCreated: 0, accountsUpdated: 0, categoriesCreated: 0, categoriesUpdated: 0 };
  const key = currentMonth();
  const roleAccount = new Map<string, ID>();

  for (const card of plan.cards) {
    const existing = card.accountId ? s.accounts.find(a => a.id === card.accountId) : undefined;
    const acc = saveAccount(s, {
      ...(existing ?? {}),
      id: existing?.id,
      name: existing?.name ?? card.name,
      type: existing?.type ?? card.type,
      purpose: card.purpose,
      plan: card.plan,
      strict: card.strict,
      isActive: true,
    });
    if (existing) report.accountsUpdated++; else report.accountsCreated++;
    roleAccount.set(card.role, acc.id);

    for (const pc of card.categories) {
      const cat = s.categories.find(c => c.type === 'expense' && pc.aliases.some(al => norm(c.name) === norm(al)));
      const saved = saveCategory(s, {
        ...(cat ?? {}),
        id: cat?.id,
        name: cat?.name ?? pc.name,
        icon: cat?.icon ?? pc.icon,
        group: acc.name,
        type: 'expense',
        kind: pc.kind ?? (cat?.kind === 'debt' ? 'regular' : cat?.kind ?? 'regular'),
        monthlyLimit: pc.limit,
        dailyLimit: pc.dailyLimit,
        accountId: acc.id,
        isActive: true,
      });
      if (cat) report.categoriesUpdated++; else report.categoriesCreated++;
      if (saved.kind === 'regular') setLimit(s, key, saved.id, pc.limit, true);
    }
  }

  // Oylik kirim: 7.4M → asosiy karta (shunday jadval bo'lmasa)
  const mainId = roleAccount.get('main') ?? null;
  if (plan.income.amount > 0 && !s.incomeSchedules.some(x => x.isActive && x.amount === plan.income.amount)) {
    const salary = s.categories.find(c => c.type === 'income' && norm(c.name) === 'maosh');
    saveIncomeSchedule(s, { source: plan.income.source, amount: plan.income.amount, day: plan.income.day,
      targetAccountId: mainId, categoryId: salary?.id ?? null });
  }

  // Oilaga — majburiy to'lov: to'lanmaguncha "Safe to Spend"dan ayriladi ("don't touch")
  const familyCat = s.categories.find(c => c.type === 'expense' && c.accountId === mainId && ['oila', 'uyga', 'oilaga'].includes(norm(c.name)));
  if (plan.family.amount > 0 && familyCat) {
    const bill = s.bills.find(b => ['oilaga', 'oila', 'uyga'].includes(norm(b.name)));
    saveBill(s, { id: bill?.id, name: bill?.name ?? plan.family.name, amount: plan.family.amount, categoryId: familyCat.id,
      accountId: mainId, day: plan.family.day, isActive: true });
  }

  return report;
}

/** Oylik taqsimlash: bir hisobdan bir nechta kartaga o'tkazma. */
export function distribute(s: State, fromId: ID, items: { toId: ID; amount: number }[], date = today()) {
  const valid = items.filter(i => i.amount > 0);
  if (!valid.length) throw new Error('O‘tkaziladigan summa yo‘q.');
  for (const i of valid) saveTransfer(s, { fromAccountId: fromId, toAccountId: i.toId, amount: i.amount, date, note: 'Oylik taqsimot' });
  return valid.reduce((a, i) => a + i.amount, 0);
}
