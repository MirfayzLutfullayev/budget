import { useLedger, useAppState, commit } from '../store/store';
import { go, openSheet, push } from '../store/ui';
import { Screen, Card, CardTitle, Progress, budgetTone, Button, cx, IconButton } from '../ui/kit';
import { currencySymbol, currentMonth, dayTitle, monthTitle, plain, short, today } from '../lib/format';
import type { Reminder } from '../domain/engine';
import { runReminderAction } from './reminderActions';

export function Home() {
  const L = useLedger();
  const s = useAppState();
  const key = currentMonth();
  const t = today();
  const totals = L.monthTotals(key);
  const safe = L.safeToSpend(t);
  const budget = L.budgetSummary(key);
  const coming = L.comingSoon(t);
  const reminders = L.reminders(t);
  const isStandalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;

  return (
    <Screen title={monthTitle(key)} action={<IconButton label="Eslatmalar" onClick={() => push({ name: 'reminders' })}>🔔{reminders.length > 0 && <span className="ml-1 text-sm">{reminders.length}</span>}</IconButton>}>
      {!isStandalone && !s.settings.hideInstallTip && (
        <div className="rounded-3xl bg-indigo-50 p-4 text-[14px] text-indigo-900 dark:bg-indigo-500/15 dark:text-indigo-100">
          <b>Ilovani ekranga qo‘shing:</b> Safari’da <b>Ulashish</b> (⬆︎) → <b>«На экран Домой / Add to Home Screen»</b>.
          <br /><span className="text-[13px] opacity-80">Muhim: Safari va ekrandagi ilova ma’lumotlari alohida saqlanadi. Doim ekrandagi ikonkadan oching.</span>
          <button className="mt-2 block font-semibold text-indigo-600 dark:text-indigo-300" onClick={() => commit(d => { d.settings.hideInstallTip = true; })}>Tushunarli</button>
        </div>
      )}

      {/* TOTAL MONEY */}
      <Card className="bg-gradient-to-br from-sky-500 to-blue-700 !text-white shadow-lg shadow-blue-500/20 dark:bg-gradient-to-br" onClick={() => push({ name: 'accounts' })}>
        <p className="text-[13px] font-bold uppercase tracking-wider text-white/80">💰 Total Money</p>
        <p className="tabular mt-1 text-[38px] font-extrabold leading-tight">{plain(L.totalMoney)} <span className="text-lg font-bold opacity-80">{currencySymbol()}</span></p>
        {L.activeAccounts.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[14px]">
            {L.activeAccounts.map(a => (
              <div key={a.id} className="flex justify-between gap-2">
                <span className="truncate text-white/85">{a.icon} {a.name}</span>
                <span className="tabular font-semibold">{short(L.balance(a))}</span>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-white/85">Hisob qo‘shing: naqd pul va kartalar →</p>}
      </Card>

      {/* SAFE TO SPEND */}
      <Card className="bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 !text-white shadow-lg shadow-violet-500/25" onClick={() => openSheet({ type: 'safeToSpend' })}>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold uppercase tracking-wider text-white/85">🟢 Safe to Spend</p>
          <span className="rounded-full bg-white/20 px-2 py-0.5 text-[12px] font-semibold">Qanday? ›</span>
        </div>
        <p className={cx('tabular mt-1 text-[42px] font-extrabold leading-tight', safe.value < 0 && 'text-rose-100')}>{plain(safe.value)} <span className="text-lg font-bold opacity-80">{currencySymbol()}</span></p>
        {(safe.planned > 0 || safe.required > 0) && (
          <p className="text-[13px] text-white/85">Ajratilgan: rejalar {short(safe.planned)} · majburiy {short(safe.required)}</p>
        )}
      </Card>

      {/* INCOME / EXPENSES */}
      <div className="grid grid-cols-2 gap-3">
        <Card onClick={() => go('transactions')}>
          <p className="text-[13px] font-semibold text-slate-500">Kirim</p>
          <p className="tabular text-[26px] font-extrabold text-emerald-600">+{short(totals.income)}</p>
        </Card>
        <Card onClick={() => go('transactions')}>
          <p className="text-[13px] font-semibold text-slate-500">Chiqim</p>
          <p className="tabular text-[26px] font-extrabold text-rose-600">−{short(totals.expenses)}</p>
          {totals.debtPaid > 0 && <p className="text-[12px] text-slate-500">+ qarz to‘lovi {short(totals.debtPaid)}</p>}
        </Card>
      </div>

      {/* SAVED / OVERSPENT */}
      {budget.limit > 0 && (budget.overspent > 0 ? (
        <Card className="bg-rose-50 dark:bg-rose-500/10" onClick={() => go('budget')}>
          <p className="text-[13px] font-bold uppercase tracking-wider text-rose-600">⚠️ Oshib ketdi</p>
          <p className="tabular text-[32px] font-extrabold text-rose-600">−{plain(budget.overspent)} <span className="text-base">{currencySymbol()}</span></p>
          <div className="mt-2 space-y-1 text-[14px]">
            {budget.overRows.slice(0, 4).map(r => (
              <div key={r.category.id} className="flex justify-between"><span>{r.category.icon} {r.category.name}</span><span className="tabular font-semibold text-rose-600">+{short(r.over)}</span></div>
            ))}
          </div>
        </Card>
      ) : (
        <Card className="bg-emerald-50 dark:bg-emerald-500/10" onClick={() => go('budget')}>
          <p className="text-[13px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">🎉 {budget.actual === 0 ? 'Budjetda hammasi bor' : 'Budjetdan qoldi'}</p>
          <p className="tabular text-[32px] font-extrabold text-emerald-600">+{plain(budget.saved)} <span className="text-base">{currencySymbol()}</span></p>
          {budget.overRows.length > 0 && (
            <p className="text-[13px] text-amber-700 dark:text-amber-400">Lekin oshgan: {budget.overRows.map(r => `${r.category.name} +${short(r.over)}`).join(', ')}</p>
          )}
        </Card>
      ))}

      {/* BUDGET */}
      <Card onClick={() => go('budget')}>
        <CardTitle right={<span className="tabular text-[15px] font-bold">{budget.limit > 0 ? `${Math.round(budget.ratio * 100)}%` : ''}</span>}>📊 Budjet</CardTitle>
        {budget.limit > 0 ? (
          <>
            <Progress value={budget.ratio} tone={budgetTone(budget.ratio)} className="h-3" />
            <p className="tabular mt-2 text-[15px]"><b>{short(budget.actual)}</b> <span className="text-slate-500">/ {short(budget.limit)}</span></p>
          </>
        ) : <p className="text-[15px] text-slate-500">Oylik limitlar qo‘yilmagan. Budjet sahifasida qo‘ying →</p>}
      </Card>

      {/* DEBT */}
      {L.activeDebts.length > 0 && (
        <Card onClick={() => push({ name: 'debts' })}>
          <CardTitle right={<span className="text-[13px] text-slate-500">To‘landi {short(L.totalDebtPaid)}</span>}>💳 Qarz</CardTitle>
          <p className="tabular text-[28px] font-extrabold text-orange-600">{plain(L.totalDebt)} <span className="text-base font-bold">qoldi</span></p>
          <Progress value={L.totalDebtStart ? L.totalDebtPaid / L.totalDebtStart : 0} tone="orange" className="mt-2" />
        </Card>
      )}

      {/* COMING SOON */}
      {coming.items.length > 0 && (
        <Card>
          <CardTitle right={<span className="tabular font-bold text-emerald-600">+{short(coming.total)}</span>}>📥 Coming Soon</CardTitle>
          <div className="divide-y divide-slate-100 dark:divide-zinc-800">
            {coming.items.map(i => (
              <div key={i.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="tabular font-bold text-emerald-600">+{plain(i.amount)}</p>
                  <p className="truncate text-[13px] text-slate-500">{i.source} · {dayTitle(i.expectedDate)} → {L.account(i.targetAccountId)?.name ?? '—'}</p>
                </div>
                <Button tone="success" className="min-h-9 rounded-xl px-3 text-sm" onClick={() => openSheet({ type: 'receive', id: i.id })}>Tushdi</Button>
              </div>
            ))}
          </div>
          <p className="mt-1 text-[12px] text-slate-400">Tushmaguncha Total Money’ga qo‘shilmaydi.</p>
        </Card>
      )}

      {/* ESLATMALAR */}
      {reminders.length > 0 && <RemindersCard items={reminders.slice(0, 4)} more={reminders.length - 4} />}

      {s.accounts.length === 0 && (
        <Button className="w-full" onClick={() => openSheet({ type: 'account' })}>+ Birinchi hisobni qo‘shish</Button>
      )}
    </Screen>
  );
}

function RemindersCard({ items, more }: { items: Reminder[]; more: number }) {
  const tone = { danger: 'text-rose-600', warn: 'text-amber-600', info: 'text-slate-700 dark:text-slate-200' };
  return (
    <Card>
      <CardTitle right={more > 0 ? <button className="text-[13px] font-semibold text-indigo-600" onClick={() => push({ name: 'reminders' })}>yana {more} ›</button> : undefined}>🔔 Eslatmalar</CardTitle>
      <div className="divide-y divide-slate-100 dark:divide-zinc-800">
        {items.map(r => (
          <button key={r.id} onClick={() => runReminderAction(r)} className="flex w-full items-center gap-3 py-2.5 text-left">
            <span className="text-xl">{r.icon}</span>
            <span className="min-w-0 flex-1">
              <span className={cx('block truncate font-semibold', tone[r.level])}>{r.title}</span>
              {r.detail && <span className="block truncate text-[13px] text-slate-500">{r.detail}</span>}
            </span>
            {r.action && <span className="text-slate-300">›</span>}
          </button>
        ))}
      </div>
    </Card>
  );
}
