import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useLedger } from '../store/store';
import { openSheet } from '../store/ui';
import { Screen, MonthSwitcher, Card, CardTitle, Empty } from '../ui/kit';
import { currentMonth, plain, short } from '../lib/format';

const tip = (v: unknown) => plain(Number(v));

export function Stats() {
  const L = useLedger();
  const [month, setMonth] = useState(currentMonth());
  const t = L.monthTotals(month);
  const b = L.budgetSummary(month);
  const series = L.series(month, 6);
  const cats = L.categorySpending(L.txInMonth(month));
  const bva = b.rows.filter(r => r.limit > 0).map(r => ({ name: r.category.name, Budjet: r.limit, Haqiqiy: r.actual }));

  return (
    <Screen title="Statistika">
      <MonthSwitcher value={month} onChange={setMonth} />

      <div className="grid grid-cols-2 gap-3">
        <Card><p className="text-[13px] font-semibold text-slate-500">Kirim</p><p className="tabular text-2xl font-extrabold text-emerald-600">{short(t.income)}</p></Card>
        <Card><p className="text-[13px] font-semibold text-slate-500">Chiqim</p><p className="tabular text-2xl font-extrabold text-rose-600">{short(t.expenses)}</p></Card>
        <Card>
          <p className="text-[13px] font-semibold text-slate-500">{b.overspent > 0 ? 'Oshib ketdi' : 'Tejaldi'}</p>
          <p className={`tabular text-2xl font-extrabold ${b.overspent > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{b.overspent > 0 ? `−${short(b.overspent)}` : `+${short(b.saved)}`}</p>
        </Card>
        <Card><p className="text-[13px] font-semibold text-slate-500">Qarz to‘landi</p><p className="tabular text-2xl font-extrabold text-orange-600">{short(t.debtPaid)}</p></Card>
      </div>

      <Card>
        <CardTitle>Kirim va chiqim</CardTitle>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={v => short(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
              <Tooltip formatter={tip} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="income" name="Kirim" fill="#10b981" radius={[6, 6, 0, 0]} />
              <Bar dataKey="expenses" name="Chiqim" fill="#f43f5e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardTitle>Kategoriyalar bo‘yicha</CardTitle>
        {cats.length ? (
          <>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={cats} dataKey="amount" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2}
                    onClick={(_, index) => { const c = cats[index]; if (c) openSheet({ type: 'categoryTx', categoryId: c.id, month }); }}>
                    {cats.map(c => <Cell key={c.id} fill={c.color} stroke="none" />)}
                  </Pie>
                  <Tooltip formatter={tip} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 divide-y divide-slate-100 dark:divide-zinc-800">
              {cats.map(c => (
                <button key={c.id} onClick={() => openSheet({ type: 'categoryTx', categoryId: c.id, month })} className="flex w-full items-center gap-3 py-2 text-left">
                  <span className="h-3 w-3 flex-none rounded-full" style={{ background: c.color }} />
                  <span className="flex-1 truncate">{c.icon} {c.name}</span>
                  <span className="tabular font-semibold">{short(c.amount)}</span>
                  <span className="tabular w-11 text-right text-[13px] text-slate-500">{Math.round(c.pct * 100)}%</span>
                </button>
              ))}
            </div>
            <p className="mt-1 text-[12px] text-slate-400">Kategoriyani bosing — shu kategoriyadagi xarajatlar ochiladi.</p>
          </>
        ) : <Empty icon="📊" title="Bu oyda xarajat yo‘q" />}
      </Card>

      {bva.length > 0 && (
        <Card>
          <CardTitle>Budjet va haqiqat</CardTitle>
          <div style={{ height: Math.max(160, bva.length * 44) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bva} layout="vertical" margin={{ top: 0, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#94a3b833" />
                <XAxis type="number" tickFormatter={v => short(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={84} tickLine={false} axisLine={false} />
                <Tooltip formatter={tip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Budjet" fill="#c7d2fe" radius={[0, 6, 6, 0]} />
                <Bar dataKey="Haqiqiy" radius={[0, 6, 6, 0]}>
                  {bva.map(r => <Cell key={r.name} fill={r.Haqiqiy > r.Budjet ? '#f43f5e' : '#6366f1'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {L.s.debts.length > 0 && (
        <Card>
          <CardTitle right={<span className="tabular text-[13px] font-semibold text-emerald-600">to‘landi {short(L.totalDebtPaid)}</span>}>Qarz dinamikasi</CardTitle>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b833" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tickFormatter={v => short(v)} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip formatter={tip} />
                <Line type="monotone" dataKey="debt" name="Qarz qoldig‘i" stroke="#f97316" strokeWidth={3} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="tabular mt-1 text-[14px]">{short(L.totalDebtStart)} → <b>{short(L.totalDebt)}</b></p>
        </Card>
      )}
    </Screen>
  );
}
