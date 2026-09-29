// Barcha hisob-kitoblar shu yerda. Faqat o'qiydi, hech narsani o'zgartirmaydi.
// Balanslar saqlanmaydi — har safar tranzaksiyalardan hisoblanadi.

import {
  sum, percentOf, monthOf, daysInMonth, monthDate, addMonths, addDays, daysBetween, short, money, dayLabel,
} from './util.js';

export class Ledger {
  constructor(state) {
    this.s = state;
    this.catMap = new Map(state.categories.map(c => [c.id, c]));
    this.fundMap = new Map(state.funds.map(f => [f.id, f]));
    this.debtMap = new Map(state.debts.map(d => [d.id, d]));
    this.cardMap = new Map(state.cards.map(c => [c.id, c]));
    this.incomeMemo = new Map();

    // Karta balanslari
    this.cardBal = new Map(state.cards.map(c => [c.id, c.opening || 0]));
    const addCard = (id, v) => {
      if (id && this.cardBal.has(id)) this.cardBal.set(id, this.cardBal.get(id) + v);
    };
    for (const e of state.expenses) addCard(e.cardId, -e.amount);
    for (const i of state.incomes) addCard(i.cardId, i.amount);
    for (const t of state.transfers) { addCard(t.fromId, -t.amount); addCard(t.toId, t.amount); }
    for (const p of state.debtPayments) if (!p.adjustment) addCard(p.cardId, -p.amount);

    // Fond balanslari
    this.fundBal = new Map(state.funds.map(f => [f.id, f.opening || 0]));
    const addFund = (id, v) => {
      if (id && this.fundBal.has(id)) this.fundBal.set(id, this.fundBal.get(id) + v);
    };
    for (const t of state.fundTx) addFund(t.fundId, t.amount);
    for (const e of state.expenses) addFund(e.fundId, -e.amount);

    // Qarz to'lovlari va tuzatishlar
    this.debtPaidMap = new Map();
    this.debtAdjMap = new Map();
    for (const p of state.debtPayments) {
      const map = p.adjustment ? this.debtAdjMap : this.debtPaidMap;
      map.set(p.debtId, (map.get(p.debtId) || 0) + p.amount);
    }
  }

  // ---------- Kategoriyalar ----------

  sortCats(list) {
    return list.slice().sort((a, b) => (a.sort - b.sort) || a.name.localeCompare(b.name));
  }

  get groups() { return this.sortCats(this.s.categories.filter(c => !c.parentId)); }

  children(group) { return this.sortCats(this.s.categories.filter(c => c.parentId === group.id)); }

  /** Guruh ichida limit qo'yiladigan qatorlar: guruhning o'zi yoki faol subkategoriyalari. */
  unitsIn(group) {
    if (!group.active) return [];
    return group.groupLevel ? [group] : this.children(group).filter(c => c.active);
  }

  /** Budget tuziladigan barcha qatorlar (hech biri ikki marta hisoblanmaydi). */
  get units() { return this.groups.flatMap(g => this.unitsIn(g)); }

  /** Xarajat kiritishda tanlanadigan kategoriyalar. */
  get expenseCategories() {
    return this.groups.filter(g => g.active).flatMap(g => {
      const kids = this.children(g).filter(c => c.active && c.kind === 'expense');
      return kids.length === 0 && g.groupLevel ? [g] : kids;
    });
  }

  category(id) { return this.catMap.get(id); }

  fundCategory(fund) { return this.s.categories.find(c => c.fundId === fund.id); }

  // ---------- Budget oyi ----------

  month(key) { return this.s.months[key]; }

  allocation(cat, key) { return this.s.months[key]?.allocations?.[cat.id]; }

  /** Oylik limit. Oyda qiymat bo'lmasa — kategoriyaning shablon qiymati. */
  limit(cat, key) {
    const a = this.allocation(cat, key)
      || { type: cat.limitType, amount: cat.defaultLimit, percent: cat.defaultPercent };
    return a.type === 'percent' ? percentOf(this.planningIncome(key), a.percent) : (a.amount || 0);
  }

  totalAllocated(key) { return sum(this.units, c => this.limit(c, key)); }

  /** Kategoriyaning shu oydagi haqiqiy qiymati — turiga qarab. */
  actual(cat, key) {
    switch (cat.kind) {
      case 'debt': return this.debtPaidIn(key);
      case 'fund':
      case 'emergency': {
        const fund = this.fundMap.get(cat.fundId);
        return fund ? this.contributions(fund, key) : 0;
      }
      default: return this.budgetSpent(cat, key);
    }
  }

  row(cat, key) {
    const limit = this.limit(cat, key);
    const spent = this.actual(cat, key);
    return {
      category: cat, limit, spent, remaining: limit - spent,
      ratio: limit > 0 ? spent / limit : (spent > 0 ? 1.01 : 0),
    };
  }

  // ---------- Daromad ----------

  incomesIn(key) { return this.s.incomes.filter(i => monthOf(i.date) === key); }

  incomeReceived(key) { return sum(this.incomesIn(key), i => i.amount); }

  get expectedIncome() { return sum(this.s.incomeSources.filter(s => s.active), s => s.amount); }

  /** Budget va foizli limitlar uchun asos: kutilgan yoki tushgan (kattasi). */
  planningIncome(key) {
    if (!this.incomeMemo.has(key)) {
      this.incomeMemo.set(key, Math.max(this.incomeReceived(key), this.expectedIncome));
    }
    return this.incomeMemo.get(key);
  }

  incomeSchedule(key) {
    const incomes = this.incomesIn(key);
    return this.s.incomeSources.filter(s => s.active)
      .slice().sort((a, b) => a.day - b.day)
      .map(source => ({
        source,
        date: monthDate(key, source.day),
        expected: source.amount,
        received: sum(incomes.filter(i => i.sourceId === source.id), i => i.amount),
      }));
  }

  // ---------- Xarajatlar ----------

  expensesIn(key) { return this.s.expenses.filter(e => monthOf(e.date) === key); }

  /** Oylik limitga ta'sir qiluvchi xarajatlar: fonddan to'lanmagan, kategoriya yoki uning subkategoriyasi. */
  budgetSpent(cat, key, filter) {
    let total = 0;
    for (const e of this.s.expenses) {
      if (e.fundId || monthOf(e.date) !== key) continue;
      const ec = this.catMap.get(e.categoryId);
      if (!ec || (ec.id !== cat.id && ec.parentId !== cat.id)) continue;
      if (filter && !filter(e)) continue;
      total += e.amount;
    }
    return total;
  }

  get dailyTracked() { return this.units.filter(c => c.trackDaily && c.kind === 'expense'); }

  /** Kunlik limit: qolgan summa qolgan kunlarga bo'linadi. */
  dailyStatus(cat, todayStr) {
    const key = monthOf(todayStr);
    const monthly = this.limit(cat, key);
    if (monthly <= 0) return null;
    const days = daysInMonth(key);
    const day = Number(todayStr.slice(8, 10));
    const daysLeft = Math.max(1, days - day + 1);
    const before = this.budgetSpent(cat, key, e => e.date < todayStr);
    const todaySpent = this.budgetSpent(cat, key, e => e.date >= todayStr);
    const allowance = Math.floor(Math.max(0, monthly - before) / daysLeft);
    return {
      category: cat,
      monthly,
      baseDaily: Math.floor(monthly / days),
      allowance,
      spentToday: todaySpent,
      saved: allowance - todaySpent,
      remainingMonth: monthly - before - todaySpent,
      daysLeft,
    };
  }

  /** Statistika: barcha xarajatlar (fonddan to'langanlari ham) guruh bo'yicha. */
  spendingByGroup(key) {
    const totals = new Map();
    for (const e of this.expensesIn(key)) {
      const c = this.catMap.get(e.categoryId);
      const g = c && c.parentId ? this.catMap.get(c.parentId) : c;
      const id = g ? g.id : 'none';
      const prev = totals.get(id) || { id, name: g ? `${g.icon} ${g.name}` : 'Kategoriyasiz', amount: 0 };
      prev.amount += e.amount;
      totals.set(id, prev);
    }
    return [...totals.values()].sort((a, b) => b.amount - a.amount);
  }

  upcomingPlanned(todayStr, days = 45) {
    const end = addDays(todayStr, days);
    return this.s.planned.filter(p => !p.done && p.date < end).sort((a, b) => a.date.localeCompare(b.date));
  }

  // ---------- Qarzlar ----------

  get activeDebts() { return this.s.debts.filter(d => d.active); }

  debtPaid(debt) { return this.debtPaidMap.get(debt.id) || 0; }
  debtTotal(debt) { return (debt.starting || 0) + (this.debtAdjMap.get(debt.id) || 0); }
  debtRemaining(debt) { return this.debtTotal(debt) - this.debtPaid(debt); }
  debtProgress(debt) {
    const total = this.debtTotal(debt);
    return total > 0 ? this.debtPaid(debt) / total : 0;
  }

  get totalDebtRemaining() { return sum(this.activeDebts, d => this.debtRemaining(d)); }

  nextDue(debt, todayStr) {
    if (!debt.dueDay) return null;
    const key = monthOf(todayStr);
    const thisMonth = monthDate(key, debt.dueDay);
    return thisMonth >= todayStr ? thisMonth : monthDate(addMonths(key, 1), debt.dueDay);
  }

  daysUntilDue(debt, todayStr) {
    const due = this.nextDue(debt, todayStr);
    return due ? daysBetween(todayStr, due) : null;
  }

  debtPaidIn(key) {
    return sum(this.s.debtPayments.filter(p => !p.adjustment && monthOf(p.date) === key), p => p.amount);
  }

  // ---------- Fondlar ----------

  get activeFunds() { return this.s.funds.filter(f => f.active); }
  get emergencyFunds() { return this.activeFunds.filter(f => f.emergency); }
  get sinkingFunds() { return this.activeFunds.filter(f => !f.emergency); }

  fundBalance(fund) { return this.fundBal.get(fund.id) || 0; }
  fundMonthly(fund) { return this.fundCategory(fund)?.defaultLimit || 0; }
  fundProgress(fund) { return fund.target > 0 ? this.fundBalance(fund) / fund.target : 0; }
  get emergencyBalance() { return sum(this.emergencyFunds, f => this.fundBalance(f)); }

  contributions(fund, key) {
    return sum(this.s.fundTx.filter(t => t.fundId === fund.id && t.amount > 0 && monthOf(t.date) === key), t => t.amount);
  }

  fundContributions(key, emergency) {
    return sum(this.s.fundTx.filter(t => {
      const f = this.fundMap.get(t.fundId);
      return t.amount > 0 && f && !!f.emergency === emergency && monthOf(t.date) === key;
    }), t => t.amount);
  }

  // ---------- Kartalar ----------

  cardBalance(card) { return this.cardBal.get(card.id) || 0; }
  get activeCards() { return this.s.cards.filter(c => c.active); }
  get defaultCard() { return this.activeCards.find(c => c.isDefault) || this.activeCards[0] || null; }
  get incomeCard() { return this.activeCards.find(c => c.isIncome) || this.activeCards[0] || null; }

  // ---------- Oylik xulosa ----------

  summary(key) {
    const expenses = this.expensesIn(key);
    const s = {
      income: this.incomeReceived(key),
      expectedIncome: this.expectedIncome,
      expenses: sum(expenses.filter(e => !e.fundId), e => e.amount),
      fundSpending: sum(expenses.filter(e => e.fundId), e => e.amount),
      debtPayments: this.debtPaidIn(key),
      emergency: this.fundContributions(key, true),
      funds: this.fundContributions(key, false),
    };
    s.savings = s.emergency + s.funds;
    s.outflow = s.expenses + s.debtPayments + s.savings;
    s.remaining = s.income - s.outflow;
    return s;
  }

  // ---------- Ogohlantirishlar ----------

  alerts(todayStr) {
    const list = [];
    const key = monthOf(todayStr);
    const threshold = (this.s.settings.alertThreshold || 90) / 100;
    const reminderDays = this.s.settings.reminderDays ?? 2;

    const income = this.planningIncome(key);
    const allocated = this.totalAllocated(key);
    if (income > 0 && allocated > income) {
      list.push({ icon: '⚠️', level: 'danger',
        text: `Taqsimlangan summa daromaddan oshib ketdi: ${short(allocated)} / ${short(income)}` });
    }

    for (const unit of this.units) {
      if (unit.kind !== 'expense') continue;
      const r = this.row(unit, key);
      if (r.limit <= 0) continue;
      if (r.spent > r.limit) {
        list.push({ icon: '⚠️', level: 'danger',
          text: `${unit.name} limiti oshib ketdi: ${short(r.spent)} / ${short(r.limit)}` });
      } else if (r.ratio >= threshold) {
        list.push({ icon: '⚠️', level: 'warning',
          text: `${unit.name} budgeti ${Math.floor(r.ratio * 100)}% ishlatildi` });
      }
    }

    for (const debt of this.activeDebts) {
      if (this.debtRemaining(debt) <= 0) continue;
      const days = this.daysUntilDue(debt, todayStr);
      if (days === null || days > reminderDays) continue;
      const due = this.nextDue(debt, todayStr);
      const cycleStart = monthDate(addMonths(monthOf(due), -1), debt.dueDay);
      const paid = sum(this.s.debtPayments.filter(p =>
        p.debtId === debt.id && !p.adjustment && p.date > cycleStart && p.date <= todayStr), p => p.amount);
      const covered = debt.minPayment > 0 ? paid >= debt.minPayment : paid > 0;
      if (covered) continue;
      list.push({ icon: '🔔', level: days === 0 ? 'danger' : 'warning',
        text: `${debt.name} to‘lovi ${days === 0 ? 'bugun' : `${days} kundan keyin`} (${dayLabel(due)})` });
    }

    for (const card of this.activeCards) {
      const bal = this.cardBalance(card);
      if (bal < 0) {
        list.push({ icon: '⚠️', level: 'danger', text: `${card.name} kartasi balansi manfiy: ${money(bal)}` });
      } else if (card.lowThreshold > 0 && bal < card.lowThreshold) {
        list.push({ icon: '⚠️', level: 'warning', text: `${card.name} kartasida pul kam qoldi: ${money(bal)}` });
      }
    }

    for (const p of this.upcomingPlanned(todayStr, 7)) {
      list.push({ icon: '📅', level: 'info', text: `${p.title} — ${dayLabel(p.date)}, ~${short(p.amount)}` });
    }

    for (const f of this.sinkingFunds) {
      if (f.target > 0 && this.fundBalance(f) >= f.target) {
        list.push({ icon: f.icon, level: 'info', text: `${f.name} fondi tayyor: ${short(this.fundBalance(f))}` });
      }
    }
    return list;
  }
}
