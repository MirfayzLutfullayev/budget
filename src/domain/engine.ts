// Barcha hisob-kitoblar (spetsifikatsiya, 35–38-bo'limlar). Faqat o'qiydi.
// Balanslar saqlanmaydi — har safar tranzaksiyalardan hisoblanadi.

import type { Account, Category, Debt, ExpectedIncome, ID, PlannedPurchase, State, Transaction } from './types';
import { addDays, daysBetween, monthDate, monthOf, sum, addMonths, monthShort, daysInMonth, plain } from '../lib/format';

export type TxKind = 'income' | 'regular' | 'debt' | 'savings';

export interface BudgetRow {
  category: Category;
  limit: number;
  actual: number;
  left: number;
  over: number;
  ratio: number;
}

export interface RequiredItem {
  kind: 'bill' | 'debt';
  id: ID;
  name: string;
  amount: number;
  date: string;
}

export interface Reminder {
  id: string;
  level: 'info' | 'warn' | 'danger';
  icon: string;
  title: string;
  detail?: string;
  action?: { type: 'receive' | 'pay-bill' | 'pay-debt' | 'purchase' | 'backup' | 'budget'; id?: ID };
}

export class Ledger {
  readonly s: State;
  private catMap: Map<ID, Category>;
  private accountMap: Map<ID, Account>;
  private balances = new Map<ID, number>();
  private debtPaidMap = new Map<ID, number>();

  constructor(state: State) {
    this.s = state;
    this.catMap = new Map(state.categories.map(c => [c.id, c]));
    this.accountMap = new Map(state.accounts.map(a => [a.id, a]));

    // Hisob balansi = boshlang'ich + kirim + kelgan o'tkazma − chiqim − qarz to'lovi − ketgan o'tkazma
    for (const a of state.accounts) this.balances.set(a.id, a.initialBalance || 0);
    const add = (id: ID | null | undefined, v: number) => {
      if (id && this.balances.has(id)) this.balances.set(id, this.balances.get(id)! + v);
    };
    for (const t of state.transactions) add(t.accountId, t.type === 'income' ? t.amount : -t.amount);
    for (const t of state.transfers) { add(t.fromAccountId, -t.amount); add(t.toAccountId, t.amount); }

    for (const t of state.transactions) {
      if (t.type === 'expense' && t.debtId) this.debtPaidMap.set(t.debtId, (this.debtPaidMap.get(t.debtId) || 0) + t.amount);
    }
  }

  // ---------- Qidiruv ----------

  category(id: ID | null | undefined) { return id ? this.catMap.get(id) : undefined; }
  account(id: ID | null | undefined) { return id ? this.accountMap.get(id) : undefined; }
  debt(id: ID | null | undefined) { return id ? this.s.debts.find(d => d.id === id) : undefined; }

  private sorted<T extends { sort: number }>(list: T[]) { return list.slice().sort((a, b) => a.sort - b.sort); }

  get expenseCategories() { return this.sorted(this.s.categories.filter(c => c.type === 'expense' && c.isActive)); }
  get regularCategories() { return this.expenseCategories.filter(c => c.kind === 'regular'); }
  get incomeCategories() { return this.sorted(this.s.categories.filter(c => c.type === 'income' && c.isActive)); }
  get debtCategory() { return this.s.categories.find(c => c.kind === 'debt' && c.type === 'expense'); }

  /** Tranzaksiya turi: kirim, oddiy xarajat, qarz to'lovi yoki jamg'arma. */
  kindOf(t: Transaction): TxKind {
    if (t.type === 'income') return 'income';
    if (t.debtId) return 'debt';
    const kind = this.category(t.categoryId)?.kind;
    return kind === 'debt' || kind === 'savings' ? kind : 'regular';
  }

  // ---------- Hisoblar ----------

  get activeAccounts() { return this.sorted(this.s.accounts.filter(a => a.isActive)); }
  balance(a: Account | ID) { return this.balances.get(typeof a === 'string' ? a : a.id) || 0; }

  /** Total Money = barcha faol hisoblar balansi. Kutilgan kirim qo'shilmaydi. */
  get totalMoney() { return sum(this.activeAccounts, a => this.balance(a)); }

  // ---------- Davr bo'yicha ----------

  txInMonth(key: string) { return this.s.transactions.filter(t => monthOf(t.date) === key); }
  txInRange(from: string, to: string) { return this.s.transactions.filter(t => t.date >= from && t.date <= to); }

  totals(list: Transaction[]) {
    const r = { income: 0, expenses: 0, debtPaid: 0, savings: 0 };
    for (const t of list) {
      const k = this.kindOf(t);
      if (k === 'income') r.income += t.amount;
      else if (k === 'regular') r.expenses += t.amount;
      else if (k === 'debt') r.debtPaid += t.amount;
      else r.savings += t.amount;
    }
    return r;
  }

  monthTotals(key: string) { return this.totals(this.txInMonth(key)); }

  // ---------- Budjet ----------

  hasBudget(key: string) { return !!this.s.budgets[key]; }

  /** Oy limiti: oy budjeti bo'lsa — undan, bo'lmasa — kategoriyadagi standart limit. */
  limit(cat: Category, key: string) {
    const b = this.s.budgets[key];
    return b ? (b.limits[cat.id] ?? 0) : (cat.monthlyLimit || 0);
  }

  categoryActual(catId: ID, key: string) {
    return sum(this.txInMonth(key).filter(t => t.categoryId === catId && this.kindOf(t) === 'regular'), t => t.amount);
  }

  budgetRows(key: string): BudgetRow[] {
    const month = this.txInMonth(key).filter(t => this.kindOf(t) === 'regular');
    const actualBy = new Map<ID, number>();
    for (const t of month) if (t.categoryId) actualBy.set(t.categoryId, (actualBy.get(t.categoryId) || 0) + t.amount);
    const cats = this.sorted(this.s.categories.filter(c => c.type === 'expense' && c.kind === 'regular'
      && (c.isActive || actualBy.has(c.id))));
    return cats
      .map(category => {
        const limit = this.limit(category, key);
        const actual = actualBy.get(category.id) || 0;
        return { category, limit, actual, left: Math.max(0, limit - actual), over: Math.max(0, actual - limit),
          ratio: limit > 0 ? actual / limit : (actual > 0 ? 1.01 : 0) };
      })
      .filter(r => r.limit > 0 || r.actual > 0);
  }

  /** Saved = Budget − Actual, Overspent = Actual − Budget (faqat oddiy xarajatlar). */
  budgetSummary(key: string) {
    const rows = this.budgetRows(key);
    const limit = sum(rows, r => r.limit);
    const actual = this.monthTotals(key).expenses;
    return {
      rows,
      limit,
      actual,
      saved: Math.max(0, limit - actual),
      overspent: Math.max(0, actual - limit),
      ratio: limit > 0 ? actual / limit : 0,
      overRows: rows.filter(r => r.over > 0).sort((a, b) => b.over - a.over),
    };
  }

  // ---------- Qarzlar ----------

  get activeDebts() { return this.sorted(this.s.debts.filter(d => d.isActive)); }
  debtPaid(d: Debt) { return this.debtPaidMap.get(d.id) || 0; }
  debtRemaining(d: Debt) { return Math.max(0, d.startingBalance - this.debtPaid(d)); }
  debtProgress(d: Debt) { return d.startingBalance > 0 ? this.debtPaid(d) / d.startingBalance : 0; }
  get totalDebt() { return sum(this.activeDebts, d => this.debtRemaining(d)); }
  get totalDebtStart() { return sum(this.activeDebts, d => d.startingBalance); }
  get totalDebtPaid() { return sum(this.activeDebts, d => this.debtPaid(d)); }

  debtPaidInMonth(d: Debt, key: string) {
    return sum(this.s.transactions.filter(t => t.debtId === d.id && monthOf(t.date) === key), t => t.amount);
  }

  /** Berilgan sanadagi umumiy qarz qoldig'i (grafik uchun). */
  debtAt(date: string) {
    return sum(this.s.debts.filter(d => d.startDate <= date), d =>
      Math.max(0, d.startingBalance - sum(this.s.transactions.filter(t => t.debtId === d.id && t.date <= date), t => t.amount)));
  }

  nextDue(d: Debt, todayStr: string): string | null {
    if (!d.dueDay) return null;
    const key = monthOf(todayStr);
    const thisMonth = monthDate(key, d.dueDay);
    return thisMonth >= todayStr ? thisMonth : monthDate(addMonths(key, 1), d.dueDay);
  }

  // ---------- Kutilgan kirim ----------

  get expectedIncomes(): ExpectedIncome[] {
    return this.s.expectedIncomes.filter(i => i.status === 'expected').sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
  }

  /** Coming Soon: hali tushmagan pullar. Total Money'ga qo'shilmaydi. */
  comingSoon(todayStr: string, days = 40) {
    const end = addDays(todayStr, days);
    const items = this.expectedIncomes.filter(i => i.expectedDate <= end);
    return { items, total: sum(items, i => i.amount) };
  }

  // ---------- Safe to Spend ----------

  get plannedOpen(): PlannedPurchase[] {
    return this.s.planned.filter(p => p.status === 'planned').sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  }

  get plannedReserved() { return sum(this.plannedOpen, p => p.amount); }

  isBillPaid(billId: ID, key: string) {
    return this.s.transactions.some(t => t.billId === billId && t.billMonth === key);
  }

  /** Shu oyda hali to'lanmagan majburiy to'lovlar va qarzlarning minimal to'lovlari. */
  requiredUpcoming(todayStr: string): RequiredItem[] {
    const key = monthOf(todayStr);
    const items: RequiredItem[] = [];
    for (const b of this.s.bills) {
      if (!b.isActive || b.amount <= 0 || this.isBillPaid(b.id, key)) continue;
      items.push({ kind: 'bill', id: b.id, name: b.name, amount: b.amount, date: monthDate(key, b.day) });
    }
    for (const d of this.activeDebts) {
      if (d.minimumPayment <= 0) continue;
      const due = Math.min(d.minimumPayment - this.debtPaidInMonth(d, key), this.debtRemaining(d));
      if (due <= 0) continue;
      items.push({ kind: 'debt', id: d.id, name: d.name, amount: due,
        date: d.dueDay ? monthDate(key, d.dueDay) : monthDate(key, daysInMonth(key)) });
    }
    return items.sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Safe to Spend = Total Money − rejali xaridlar − majburiy to'lovlar. */
  safeToSpend(todayStr: string) {
    const required = this.requiredUpcoming(todayStr);
    const requiredTotal = sum(required, r => r.amount);
    return {
      total: this.totalMoney,
      planned: this.plannedReserved,
      required: requiredTotal,
      requiredItems: required,
      value: this.totalMoney - this.plannedReserved - requiredTotal,
    };
  }

  // ---------- Statistika ----------

  series(key: string, months = 6) {
    return Array.from({ length: months }, (_, i) => {
      const m = addMonths(key, i - months + 1);
      const t = this.monthTotals(m);
      return { key: m, label: monthShort(m), income: t.income, expenses: t.expenses, debtPaid: t.debtPaid,
        debt: this.debtAt(monthDate(m, daysInMonth(m))) };
    });
  }

  categorySpending(list: Transaction[]) {
    const by = new Map<ID, number>();
    for (const t of list) {
      if (this.kindOf(t) !== 'regular') continue;
      const id = t.categoryId || 'none';
      by.set(id, (by.get(id) || 0) + t.amount);
    }
    const total = sum([...by.values()], v => v);
    return [...by.entries()]
      .map(([id, amount]) => {
        const c = this.category(id);
        return { id, name: c ? c.name : 'Kategoriyasiz', icon: c?.icon ?? '❔', color: c?.color ?? '#94a3b8',
          amount, pct: total ? amount / total : 0 };
      })
      .sort((a, b) => b.amount - a.amount);
  }

  // ---------- Eslatmalar ----------

  reminders(todayStr: string): Reminder[] {
    const list: Reminder[] = [];
    const st = this.s.settings;
    const soon = addDays(todayStr, st.reminderDays);

    const hasData = this.s.transactions.length > 0 || this.s.accounts.length > 0;
    const backupAge = st.lastBackupAt ? daysBetween(st.lastBackupAt, todayStr) : Infinity;
    if (hasData && backupAge >= st.backupEveryDays) {
      list.push({ id: 'backup', level: 'warn', icon: '💾', title: 'Zaxira nusxa oling',
        detail: st.lastBackupAt ? `Oxirgi zaxira ${backupAge} kun oldin` : 'Hali zaxira olinmagan',
        action: { type: 'backup' } });
    }

    for (const i of this.expectedIncomes) {
      if (i.expectedDate > addDays(todayStr, 1)) continue;
      list.push({ id: `inc-${i.id}`, level: i.expectedDate < todayStr ? 'warn' : 'info', icon: '📥',
        title: `${i.source} kutilmoqda`, detail: `${plain(i.amount)} · ${i.expectedDate < todayStr ? 'muddati o‘tdi' : i.expectedDate === todayStr ? 'bugun' : 'ertaga'}`,
        action: { type: 'receive', id: i.id } });
    }

    for (const r of this.requiredUpcoming(todayStr)) {
      if (r.date > soon) continue;
      const overdue = r.date < todayStr;
      list.push({ id: `${r.kind}-${r.id}`, level: overdue || r.date === todayStr ? 'danger' : 'warn', icon: r.kind === 'debt' ? '💳' : '📌',
        title: r.kind === 'debt' ? `${r.name}: qarz to‘lovi` : `${r.name} to‘lovi`,
        detail: `${plain(r.amount)} · ${overdue ? `${-daysBetween(todayStr, r.date)} kun kechikdi` : r.date === todayStr ? 'bugun' : `${daysBetween(todayStr, r.date)} kundan keyin`}`,
        action: { type: r.kind === 'debt' ? 'pay-debt' : 'pay-bill', id: r.id } });
    }

    for (const p of this.plannedOpen) {
      if (!p.date || p.date > addDays(todayStr, 3)) continue;
      list.push({ id: `pl-${p.id}`, level: 'info', icon: '🛒', title: `Rejali xarid: ${p.name}`,
        detail: `${plain(p.amount)} · ${p.date < todayStr ? 'muddati o‘tdi' : p.date === todayStr ? 'bugun' : `${daysBetween(todayStr, p.date)} kundan keyin`}`,
        action: { type: 'purchase', id: p.id } });
    }

    const key = monthOf(todayStr);
    for (const r of this.budgetRows(key)) {
      if (r.limit <= 0) continue;
      if (r.actual > r.limit) {
        list.push({ id: `over-${r.category.id}`, level: 'danger', icon: '⚠️', title: `${r.category.name}: limitdan oshdi`,
          detail: `+${plain(r.over)} ortiqcha`, action: { type: 'budget' } });
      } else if (r.ratio * 100 >= st.alertThreshold) {
        list.push({ id: `near-${r.category.id}`, level: 'warn', icon: '⚠️', title: `${r.category.name}: ${Math.floor(r.ratio * 100)}% ishlatildi`,
          detail: `${plain(r.left)} qoldi`, action: { type: 'budget' } });
      }
    }

    for (const a of this.activeAccounts) {
      const b = this.balance(a);
      if (b < 0) list.push({ id: `neg-${a.id}`, level: 'danger', icon: '⚠️', title: `${a.name}: balans manfiy`, detail: plain(b) });
    }

    const order = { danger: 0, warn: 1, info: 2 };
    return list.sort((a, b) => order[a.level] - order[b.level]);
  }
}

