import type { Ledger } from '../domain/engine';
import { openSheet, push } from '../store/ui';
import { Card, CardTitle, Progress, budgetTone, Button, cx } from '../ui/kit';
import { currentMonth, dayShort, plain, short, today } from '../lib/format';

type Status = ReturnType<Ledger['cardStatus']>;

/** Bitta karta "konverti": limit, sarflangan, qolgan, kunlik ruxsat, prognoz, qoida buzilishlari. */
export function CardEnvelope({ st, L, compact = false }: { st: Status; L: Ledger; compact?: boolean }) {
  const a = st.account;
  const bad = st.over > 0 || st.violations.length > 0;
  const warn = !bad && st.projectedOver > 0;
  return (
    <Card onClick={compact ? () => push({ name: 'account', id: a.id }) : undefined}
      className={cx(bad && 'ring-2 ring-rose-500', warn && 'ring-2 ring-amber-400')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[17px] font-extrabold">{a.icon} {a.name}{a.strict && <span className="ml-2 align-middle text-[11px] font-bold text-rose-500">🔒 qat’iy</span>}</p>
          {a.purpose && <p className="truncate text-[13px] text-slate-500">{a.purpose}</p>}
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase text-slate-400">balans</p>
          <p className={cx('tabular font-bold', st.balance < 0 && 'text-rose-600')}>{short(st.balance)}</p>
        </div>
      </div>

      {st.limitTotal > 0 ? (
        <>
          <div className="mt-3 flex items-end justify-between">
            <p className="tabular text-[15px]"><b className="text-[22px]">{plain(st.spent)}</b> <span className="text-slate-400">/ {plain(st.limitTotal)}</span></p>
            <p className={cx('tabular text-[15px] font-bold', st.over > 0 ? 'text-rose-600' : 'text-emerald-600')}>
              {st.over > 0 ? `+${plain(st.over)} OSHDI` : `${plain(st.left)} qoldi`}
            </p>
          </div>
          <Progress value={st.ratio} tone={budgetTone(st.ratio)} className="mt-2 h-2.5" />
          {st.daysLeft > 0 && st.over === 0 && (
            <p className={cx('mt-2 text-[13px]', warn ? 'font-semibold text-amber-600' : 'text-slate-500')}>
              Kuniga <b>{plain(st.perDay)}</b> ishlatsa bo‘ladi · {st.daysLeft} kun qoldi
              {warn && <> · shu tempda <b>{short(st.projected)}</b> ketadi (+{short(st.projectedOver)})</>}
            </p>
          )}
        </>
      ) : st.rows.length === 0 && (
        <p className="mt-2 text-[13px] text-slate-500">Kategoriya biriktirilmagan — istalgan xarajat uchun.</p>
      )}

      {!compact && st.rows.length > 0 && (
        <div className="mt-3 space-y-2.5 border-t border-slate-100 pt-3 dark:border-zinc-800">
          {st.rows.map(r => (
            <button key={r.category.id} className="block w-full text-left" onClick={() => openSheet({ type: 'expense', categoryId: r.category.id })}>
              <div className="flex justify-between gap-2 text-[14px]">
                <span>{r.category.icon} {r.category.name}{r.dailyLimit > 0 && <span className="text-slate-400"> · bugun {short(r.today)}/{short(r.dailyLimit)}</span>}</span>
                <span className="tabular">
                  <b className={cx(r.over > 0 && 'text-rose-600')}>{short(r.actual)}</b>
                  <span className="text-slate-400">{r.limit > 0 ? ` / ${short(r.limit)}` : r.category.kind === 'savings' ? ' jamg‘arildi' : ''}</span>
                </span>
              </div>
              {r.limit > 0 && <Progress value={r.ratio} tone={budgetTone(r.ratio)} className="mt-1 h-1.5" />}
            </button>
          ))}
        </div>
      )}
      {compact && st.rows.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[13px]">
          {st.rows.filter(r => r.limit > 0 || r.actual > 0).map(r => (
            <span key={r.category.id} className={cx('tabular', r.over > 0 ? 'font-semibold text-rose-600' : 'text-slate-500')}>
              {r.category.icon} {short(r.actual)}{r.limit > 0 ? `/${short(r.limit)}` : ''}
            </span>
          ))}
        </div>
      )}

      {st.violations.length > 0 && (
        <div className="mt-3 rounded-2xl bg-rose-600 p-3 text-[13px] text-white">
          <p className="font-bold">🚫 Qoida buzildi — {plain(st.violations.reduce((x, t) => x + t.amount, 0))}</p>
          {st.violations.slice(0, 3).map(t => (
            <p key={t.id}>{dayShort(t.date)} · {L.category(t.categoryId)?.name ?? 'kategoriyasiz'} {plain(t.amount)}</p>
          ))}
          <p className="mt-1 opacity-90">Bu karta faqat: {L.cardCategories(a.id).map(c => c.name).join(', ') || '—'}</p>
        </div>
      )}
      {st.foreign.length > 0 && (
        <p className="mt-2 text-[13px] text-amber-600">⚠️ Bu kartaning {st.foreign.length} ta xarajati boshqa kartadan to‘langan ({short(st.foreign.reduce((x, t) => x + t.amount, 0))})</p>
      )}
    </Card>
  );
}

/** Kunlik limitlar: bugun va oy boshidan beri — "kunlikda qancha, umumiy qancha". */
export function DailyCard({ L }: { L: Ledger }) {
  const list = L.dailyStatus(today());
  if (!list.length) return null;
  return (
    <Card>
      <CardTitle>☀️ Bugun</CardTitle>
      <div className="space-y-3">
        {list.map(d => {
          const ratio = d.dailyLimit ? d.today / d.dailyLimit : 0;
          return (
            <div key={d.category.id}>
              <div className="flex items-end justify-between">
                <span className="font-semibold">{d.category.icon} {d.category.name}</span>
                <span className="tabular"><b className={cx('text-[20px]', d.today > d.dailyLimit && 'text-rose-600')}>{plain(d.today)}</b><span className="text-slate-400"> / {plain(d.dailyLimit)}</span></span>
              </div>
              <Progress value={ratio} tone={budgetTone(ratio)} className="mt-1.5" />
              <p className={cx('tabular mt-1 text-[13px] font-medium', d.diff > 0 ? 'text-rose-600' : 'text-emerald-600')}>
                {d.day} kunda {plain(d.mtd)} / reja {plain(d.expected)} → {d.diff > 0 ? `${plain(d.diff)} ortiqcha sarflandi` : `${plain(-d.diff)} tejaldi`}
              </p>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

/** Maosh tushdi, lekin hali kartalarga taqsimlanmagan. */
export function DistributeCTA({ L }: { L: Ledger }) {
  const from = L.activeAccounts.find(a => !a.strict && !(a.plan || 0) && a.type === 'card');
  const rows = L.distributionPlan(currentMonth(), from?.id ?? null);
  const due = rows.reduce((x, r) => x + r.due, 0);
  if (!rows.length || due <= 0) return null;
  return (
    <Card className="border-2 border-dashed border-indigo-300 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10">
      <p className="font-bold">💸 Pulni kartalarga taqsimlang</p>
      <p className="mt-1 text-[14px] text-slate-600 dark:text-slate-300">{rows.filter(r => r.due > 0).map(r => `${r.account.name} ${short(r.due)}`).join(' · ')}</p>
      <Button className="mt-3 w-full" onClick={() => openSheet({ type: 'distribute' })}>Taqsimlash · {plain(due)}</Button>
    </Card>
  );
}

/** Reja hali sozlanmagan bo'lsa. */
export function PlanCTA() {
  return (
    <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 !text-white">
      <p className="text-[17px] font-bold">🗂️ Kartalar bo‘yicha rejani sozlang</p>
      <p className="mt-1 text-[14px] text-white/90">TBC — ovqat, yo‘l, telefon · 6418 — kurs, ijara, kiyim · Main — oila, entertainment, emergency. Kiritganlaringiz o‘chmaydi.</p>
      <button onClick={() => openSheet({ type: 'plan' })} className="mt-3 w-full rounded-2xl bg-white py-3 font-bold text-emerald-700">Mening rejam</button>
    </Card>
  );
}
