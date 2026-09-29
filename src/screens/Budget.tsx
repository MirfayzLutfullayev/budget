import { useState } from 'react';
import { commit, useLedger } from '../store/store';
import { openSheet, push, showToast } from '../store/ui';
import { Screen, MonthSwitcher, Card, Progress, budgetTone, Button, List, Row, cx, IconButton } from '../ui/kit';
import { addMonths, currentMonth, monthTitle, plain, short } from '../lib/format';
import { createMonthBudget } from '../domain/actions';

export function Budget() {
  const L = useLedger();
  const [month, setMonth] = useState(currentMonth());
  const b = L.budgetSummary(month);
  const exists = L.hasBudget(month);
  const unbudgeted = L.regularCategories.filter(c => !b.rows.some(r => r.category.id === c.id));

  const create = (source: 'previous' | 'defaults') => {
    commit(s => { createMonthBudget(s, month, source); });
    showToast(`${monthTitle(month)} budjeti yaratildi ✓`);
  };

  return (
    <Screen title="Budjet" action={<IconButton label="Kategoriyalar" onClick={() => push({ name: 'categories' })}>⚙︎</IconButton>}>
      <MonthSwitcher value={month} onChange={setMonth} />

      {!exists && (
        <Card className="border-2 border-dashed border-indigo-200 bg-indigo-50/50 dark:border-indigo-500/30 dark:bg-indigo-500/5">
          <p className="font-bold">{monthTitle(month)} budjetini yarating</p>
          <p className="mt-1 text-[14px] text-slate-500">Hozir standart limitlar ko‘rsatilmoqda. Yaratsangiz, shu oy limitlarini alohida o‘zgartira olasiz.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button onClick={() => create('previous')} className="text-[15px]">{monthTitle(addMonths(month, -1)).split(' ')[0]}dan nusxa</Button>
            <Button tone="soft" onClick={() => create('defaults')} className="text-[15px]">Standartdan</Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[13px] font-semibold text-slate-500">Sarflandi</p>
            <p className="tabular text-[30px] font-extrabold leading-tight">{plain(b.actual)}</p>
            <p className="tabular text-[14px] text-slate-500">limit {plain(b.limit)}</p>
          </div>
          <div className={cx('rounded-2xl px-3 py-2 text-right', b.overspent > 0 ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-emerald-50 dark:bg-emerald-500/10')}>
            <p className={cx('text-[12px] font-bold uppercase', b.overspent > 0 ? 'text-rose-600' : 'text-emerald-700 dark:text-emerald-400')}>
              {b.overspent > 0 ? '⚠️ Oshdi' : month < currentMonth() ? '🎉 Tejaldi' : 'Qoldi'}
            </p>
            <p className={cx('tabular text-xl font-extrabold', b.overspent > 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {b.overspent > 0 ? `−${short(b.overspent)}` : `+${short(b.saved)}`}
            </p>
          </div>
        </div>
        {b.limit > 0 && <Progress value={b.ratio} tone={budgetTone(b.ratio)} className="mt-3 h-3" />}
      </Card>

      {b.rows.length > 0 && (
        <div className="space-y-2">
          {b.rows.map(r => (
            <button key={r.category.id} onClick={() => openSheet({ type: 'limit', categoryId: r.category.id, month })}
              className="block w-full rounded-3xl bg-white p-4 text-left shadow-card active:scale-[.99] dark:bg-zinc-900">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{r.category.icon} {r.category.name}</span>
                <span className="tabular text-[15px]"><b>{plain(r.actual)}</b><span className="text-slate-400"> / {r.limit ? plain(r.limit) : '—'}</span></span>
              </div>
              <Progress value={r.limit ? r.ratio : 1} tone={r.limit ? budgetTone(r.ratio) : 'amber'} className="mt-2" />
              <p className={cx('tabular mt-1.5 text-[13px] font-semibold', r.over > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                {r.limit === 0 ? 'Limit qo‘yilmagan — bosib qo‘ying' : r.over > 0 ? `+${plain(r.over)} OSHDI` : `${plain(r.left)} qoldi`}
              </p>
            </button>
          ))}
        </div>
      )}

      {unbudgeted.length > 0 && (
        <List title="Limitsiz kategoriyalar" footer="Bosib oylik limit qo‘ying.">
          {unbudgeted.map(c => (
            <Row key={c.id} icon={c.icon} title={c.name} right={<span className="text-[14px] text-indigo-600">+ limit</span>}
              onClick={() => openSheet({ type: 'limit', categoryId: c.id, month })} />
          ))}
        </List>
      )}
    </Screen>
  );
}
