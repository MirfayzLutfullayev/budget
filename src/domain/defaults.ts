import type { Account, Category, CategoryKind, State } from './types';
import { uid } from '../lib/format';

export const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#14b8a6', '#f97316', '#64748b'];

export function defaultSettings(): State['settings'] {
  return {
    currency: 'UZS',
    onboarded: false,
    alertThreshold: 90,
    reminderDays: 2,
    backupEveryDays: 7,
    lastBackupAt: null,
    hideInstallTip: false,
  };
}

type Seed = [name: string, icon: string, kind?: CategoryKind];

const EXPENSE_GROUPS: [group: string, items: Seed[]][] = [
  ['Asosiy', [['Ovqat', '🍚'], ['Ijara', '🏠'], ['Telefon', '📱'], ['Metro', '🚇'], ['Benzin', '⛽'], ['Ingliz tili', '📚'], ['Oila', '👨‍👩‍👧']]],
  ['Ijtimoiy', [['Uchrashuv', '💐'], ['O‘tirishlar', '☕'], ['To‘ylar', '💍'], ['Entertainment', '🎉']]],
  ['Shaxsiy', [['Kiyim', '👕'], ['Sport', '🏋️'], ['Shaxsiy', '🛍️']]],
  ['Moliya', [['Qarz to‘lovi', '💳', 'debt'], ['Jamg‘arma', '🏦', 'savings']]],
];

const INCOME_ITEMS: Seed[] = [['Maosh', '💼'], ['Bonus', '🎁'], ['Qo‘shimcha ish', '🧰'], ['Boshqa kirim', '💵']];

export function defaultCategories(): Category[] {
  const list: Category[] = [];
  let color = 0;
  for (const [group, items] of EXPENSE_GROUPS) {
    for (const [name, icon, kind = 'regular'] of items) {
      list.push({
        id: uid(), name, icon, kind, group, type: 'expense', monthlyLimit: 0,
        color: COLORS[color++ % COLORS.length], isActive: true, sort: list.length,
      });
    }
  }
  for (const [name, icon] of INCOME_ITEMS) {
    list.push({
      id: uid(), name, icon, kind: 'regular', group: 'Kirim', type: 'income', monthlyLimit: 0,
      color: '#10b981', isActive: true, sort: list.length,
    });
  }
  return list;
}

export function emptyState(): State {
  return {
    version: 2,
    updatedAt: 0,
    settings: defaultSettings(),
    accounts: [],
    categories: defaultCategories(),
    transactions: [],
    transfers: [],
    incomeSchedules: [],
    expectedIncomes: [],
    debts: [],
    bills: [],
    planned: [],
    budgets: {},
  };
}

export const ACCOUNT_ICONS: Record<Account['type'], string> = { cash: '💵', card: '💳', other: '🏦' };
export const ACCOUNT_TYPE_NAMES: Record<Account['type'], string> = { cash: 'Naqd', card: 'Karta', other: 'Boshqa' };

/** Bo'sh yoki eski ma'lumotni joriy tuzilmaga keltiradi (yetishmayotgan maydonlarni to'ldiradi). */
export function normalize(input: unknown): State {
  const base = emptyState();
  const obj = (input && typeof input === 'object' ? input : {}) as Partial<State>;
  const s: State = {
    ...base,
    ...obj,
    version: 2,
    settings: { ...base.settings, ...(obj.settings || {}) },
    budgets: obj.budgets && typeof obj.budgets === 'object' ? obj.budgets : {},
  };
  const arrays = ['accounts', 'categories', 'transactions', 'transfers', 'incomeSchedules',
    'expectedIncomes', 'debts', 'bills', 'planned'] as const;
  for (const key of arrays) {
    if (!Array.isArray(s[key])) (s as unknown as Record<string, unknown>)[key] = key === 'categories' ? base.categories : [];
  }
  return s;
}
