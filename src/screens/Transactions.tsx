import { useState } from 'react';
import { useLedger } from '../store/store';
import { openSheet } from '../store/ui';
import { Screen, MonthSwitcher, Segmented, Empty, cx } from '../ui/kit';
import { currentMonth, dayTitle, monthOf, plain, sum } from '../lib/format';
import type { Ledger } from '../domain/engine';
import type { ID } from '../domain/types';

type Filter = 'all' | 'income' | 'expense' | 'transfer';

interface Item { key: string; date: string; created: number; icon: string; title: string; subtitle: string; amount: number; tone: 'green' | 'red' | 'slate'; open: () => void }

export function buildItems(L: Ledger, month: string, filter: Filter, accountId?: ID): Item[] {
  const items: Item[] = [];
  const byAcc = (id: ID | null | undefined) => !accountId || id === accountId;
  if (filter !== 'transfer') {
    for (const t of L.s.transactions) {
      if ((month && monthOf(t.date) !== month) || !byAcc(t.accountId)) continue;
      if (filter === 'income' && t.type !== 'income') continue;
      if (filter === 'expense' && t.type !== 'expense') continue;
      const c = L.category(t.categoryId);
      const debt = t.debtId ? L.debt(t.debtId) : undefined;
      items.push({
        key: t.id, date: t.date, created: t.createdAt,
        icon: debt ? '💳' : c?.icon ?? (t.type === 'income' ? '💵' : '💸'),
        title: debt ? `${debt.name} to‘lovi` : c?.name ?? (t.type === 'income' ? 'Kirim' : 'Kategoriyasiz'),
        subtitle: [L.account(t.accountId)?.name, t.note].filter(Boolean).join(' · '),
        amount: t.type === 'income' ? t.amount : -t.amount,
        tone: t.type === 'income' ? 'green' : 'red',
        open: () => openSheet(t.type === 'income' ? { type: 'income', id: t.id } : { type: 'expense', id: t.id }),
      });
    }
  }
  if (filter === 'all' || filter === 'transfer') {
    for (const t of L.s.transfers) {
      if ((month && monthOf(t.date) !== month) || (accountId && t.fromAccountId !== accountId && t.toAccountId !== accountId)) continue;
      const signed = accountId ? (t.toAccountId === accountId ? t.amount : -t.amount) : t.amount;
      items.push({
        key: t.id, date: t.date, created: t.createdAt, icon: '↔️',
        title: `${L.account(t.fromAccountId)?.name ?? '?'} → ${L.account(t.toAccountId)?.name ?? '?'}`,
        subtitle: ['O‘tkazma', t.note].filter(Boolean).join(' · '), amount: signed, tone: 'slate',
        open: () => openSheet({ type: 'transfer', id: t.id }),
      });
    }
  }
  return items.sort((a, b) => b.date.localeCompare(a.date) || b.created - a.created);
}

export function ItemList({ items }: { items: Item[] }) {
  const days = new Map<string, Item[]>();
  for (const i of items) {
    if (!days.has(i.date)) days.set(i.date, []);
    days.get(i.date)!.push(i);
  }
  return (
    <>
      {[...days.entries()].map(([date, list]) => {
        const net = sum(list.filter(i => i.tone !== 'slate'), i => i.amount);
        return (
          <section key={date}>
            <div className="mb-2 flex justify-between px-4 text-[13px] font-bold uppercase tracking-wider text-slate-500">
              <span>{dayTitle(date)}</span>
              <span className="tabular normal-case">{net > 0 ? '+' : ''}{plain(net)}</span>
            </div>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-card dark:divide-zinc-800 dark:bg-zinc-900">
              {list.map(i => (
                <button key={i.key} onClick={i.open} className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-slate-50 dark:active:bg-zinc-800">
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-zinc-800">{i.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{i.title}</span>
                    {i.subtitle && <span className="block truncate text-[13px] text-slate-500">{i.subtitle}</span>}
                  </span>
                  <span className={cx('tabular flex-none text-[17px] font-bold',
                    i.tone === 'green' ? 'text-emerald-600' : i.tone === 'red' ? 'text-rose-600' : 'text-slate-500')}>
                    {i.amount > 0 && i.tone !== 'slate' ? '+' : ''}{plain(i.amount)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

export function Transactions() {
  const L = useLedger();
  const [month, setMonth] = useState(currentMonth());
  const [filter, setFilter] = useState<Filter>('all');
  const items = buildItems(L, month, filter);
  const totals = L.monthTotals(month);

  return (
    <Screen title="Tarix">
      <MonthSwitcher value={month} onChange={setMonth} />
      <Segmented value={filter} onChange={setFilter} options={[['all', 'Hammasi'], ['income', 'Kirim'], ['expense', 'Chiqim'], ['transfer', 'O‘tkazma']]} />
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10">
          <p className="text-[12px] font-semibold text-emerald-700 dark:text-emerald-400">Kirim</p>
          <p className="tabular text-xl font-extrabold text-emerald-600">+{plain(totals.income)}</p>
        </div>
        <div className="rounded-2xl bg-rose-50 px-4 py-3 dark:bg-rose-500/10">
          <p className="text-[12px] font-semibold text-rose-700 dark:text-rose-400">Chiqim + qarz</p>
          <p className="tabular text-xl font-extrabold text-rose-600">−{plain(totals.expenses + totals.debtPaid + totals.savings)}</p>
        </div>
      </div>
      {items.length ? <ItemList items={items} /> : <Empty icon="🧾" title="Bu oyda yozuv yo‘q" text="Pastdagi + tugmasi orqali kirim yoki chiqim qo‘shing." />}
    </Screen>
  );
}
