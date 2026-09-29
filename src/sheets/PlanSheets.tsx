import { useState } from 'react';
import type { ID } from '../domain/types';
import { applyPlan, defaultPlan, distribute, matchAccounts, type Plan } from '../domain/plan';
import { commit, takeSnapshot, useAppState, useLedger } from '../store/store';
import { closeSheet, showToast } from '../store/ui';
import { Sheet } from '../ui/Sheet';
import { Button, cx } from '../ui/kit';
import { AmountField, ErrorBox, Field, FieldGroup, Hint, Select } from '../ui/form';
import { currentMonth, monthTitle, plain, sum, today } from '../lib/format';

/** "Mening rejam": kartalar bo'yicha taqsimot. Mavjud ma'lumot o'chirilmaydi. */
export function PlanSheet() {
  const s = useAppState();
  const [plan, setPlan] = useState<Plan>(() => matchAccounts(s, defaultPlan()));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const setCard = (i: number, patch: Partial<Plan['cards'][number]>) =>
    setPlan(p => ({ ...p, cards: p.cards.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setCat = (i: number, k: number, patch: Partial<Plan['cards'][number]['categories'][number]>) =>
    setPlan(p => ({ ...p, cards: p.cards.map((c, j) => (j !== i ? c : { ...c, categories: c.categories.map((x, m) => (m === k ? { ...x, ...patch } : x)) })) }));

  const accountOptions = (current: ID | null): [string, string][] => [
    ['', '+ Yangi yaratish'],
    ...s.accounts.filter(a => a.id === current || !plan.cards.some(c => c.accountId === a.id)).map(a => [a.id, `${a.icon} ${a.name}`] as [string, string]),
  ];

  const allocated = sum(plan.cards.filter(c => c.plan > 0), c => c.plan);
  const mainCats = sum(plan.cards.find(c => c.role === 'main')?.categories ?? [], c => c.limit);
  const free = plan.income.amount - allocated - mainCats;

  const apply = async () => {
    setBusy(true);
    try {
      await takeSnapshot('before-setup');
      let report = { accountsCreated: 0, accountsUpdated: 0, categoriesCreated: 0, categoriesUpdated: 0 };
      commit(d => { report = applyPlan(d, plan); });
      closeSheet();
      showToast(`Reja qo‘llandi ✓ ${report.categoriesUpdated + report.categoriesCreated} kategoriya, ${report.accountsUpdated + report.accountsCreated} karta. Ma’lumotlaringiz saqlandi.`, 'success', 6000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet title="Mening rejam" footer={<Button onClick={apply} disabled={busy} className="w-full text-[17px]">Rejani qo‘llash</Button>}>
      <div className="rounded-3xl bg-emerald-50 p-4 text-[14px] text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200">
        🛡️ Kiritgan ma’lumotlaringiz <b>o‘chmaydi</b>: mavjud kartalar va kategoriyalar qayta ishlatiladi, tranzaksiyalarga tegilmaydi. Qo‘llashdan oldin avtomatik nusxa olinadi.
      </div>

      <FieldGroup title="Oylik kirim">
        <Field label="Oy boshida"><AmountField value={plan.income.amount} onChange={v => setPlan(p => ({ ...p, income: { ...p.income, amount: v } }))} /></Field>
        <Field label="Oilaga (tegilmaydi)"><AmountField value={plan.family.amount} onChange={v => setPlan(p => ({ ...p, family: { ...p.family, amount: v } }))} /></Field>
      </FieldGroup>

      {plan.cards.map((card, i) => {
        const catTotal = sum(card.categories.filter(c => c.kind !== 'savings'), c => c.limit);
        return (
          <div key={card.role} className="space-y-2">
            <div className="flex items-end justify-between px-1">
              <p className="text-[13px] font-bold uppercase tracking-wider text-slate-500">{card.type === 'cash' ? '💵' : '💳'} {card.name}</p>
              {card.strict && <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:bg-rose-500/15">faqat shu maqsadlar</span>}
            </div>
            <FieldGroup>
              <Field label="Qaysi karta"><Select value={card.accountId ?? ''} onChange={v => setCard(i, { accountId: v || null })} options={accountOptions(card.accountId)} /></Field>
              {card.plan > 0 || card.role === 'daily' || card.role === 'fixed'
                ? <Field label="Oyiga o‘tkaziladi"><AmountField value={card.plan} onChange={v => setCard(i, { plan: v })} /></Field>
                : null}
              {card.categories.map((c, k) => (
                <div key={c.key} className="flex min-h-14 items-center gap-2 px-4 py-2">
                  <span className="text-xl">{c.icon}</span>
                  <span className="flex-1">
                    <span className="block">{c.name}</span>
                    {c.key === 'food' && (
                      <span className="flex items-center gap-1 text-[13px] text-slate-500">kuniga
                        <span className="w-20"><AmountField value={c.dailyLimit} onChange={v => setCat(i, k, { dailyLimit: v })} /></span>
                      </span>
                    )}
                  </span>
                  <span className="w-32">
                    {c.kind === 'savings' ? <span className="block text-right text-[13px] text-slate-500">qolgani</span>
                      : <AmountField value={c.limit} onChange={v => setCat(i, k, { limit: v })} placeholder="limitsiz" />}
                  </span>
                </div>
              ))}
            </FieldGroup>
            {card.plan > 0 && catTotal !== card.plan && (
              <Hint>Kategoriyalar jami {plain(catTotal)} · {catTotal > card.plan ? <span className="text-rose-600">rejadan {plain(catTotal - card.plan)} ko‘p</span> : `${plain(card.plan - catTotal)} ortadi`}</Hint>
            )}
          </div>
        );
      })}

      <div className="rounded-3xl bg-white p-4 shadow-card dark:bg-zinc-900">
        <div className="flex justify-between text-[15px]"><span>Kirim</span><b className="tabular">{plain(plan.income.amount)}</b></div>
        <div className="flex justify-between text-[15px]"><span>Kartalarga o‘tadi</span><b className="tabular">−{plain(allocated)}</b></div>
        <div className="flex justify-between text-[15px]"><span>Asosiy kartada (oila, entertainment)</span><b className="tabular">−{plain(mainCats)}</b></div>
        <div className={cx('mt-1 flex justify-between border-t border-slate-100 pt-1 text-[16px] dark:border-zinc-800', free < 0 ? 'text-rose-600' : 'text-emerald-600')}>
          <span>Emergency / erkin</span><b className="tabular">{plain(free)}</b>
        </div>
      </div>
      <Hint>Qat’iy kartadan (TBC, 6418) boshqa narsaga pul ketsa — qizil ogohlantirish chiqadi. Asosiy karta va naqd pul erkin. Hammasini keyin o‘zgartirish mumkin.</Hint>
      <ErrorBox error={error} />
    </Sheet>
  );
}

/** Oylik taqsimlash: maosh tushgach, kartalarga o'z ulushini o'tkazish. */
export function DistributeSheet() {
  const L = useLedger();
  const key = currentMonth();
  const income = L.activeAccounts.find(a => !a.strict && (a.plan || 0) === 0 && a.type === 'card') ?? L.activeAccounts[0];
  const [fromId, setFromId] = useState<ID>(income?.id ?? '');
  const rows = L.distributionPlan(key, fromId);
  const [amounts, setAmounts] = useState<Record<ID, number>>(() => Object.fromEntries(rows.map(r => [r.account.id, r.due])));
  const [error, setError] = useState('');
  const total = sum(rows, r => amounts[r.account.id] ?? 0);
  const fromBalance = fromId ? L.balance(fromId) : 0;

  const save = () => {
    try {
      let sent = 0;
      commit(d => { sent = distribute(d, fromId, rows.map(r => ({ toId: r.account.id, amount: amounts[r.account.id] ?? 0 })), today()); });
      closeSheet();
      showToast(`${plain(sent)} kartalarga taqsimlandi ✓`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Sheet title={`${monthTitle(key)}: taqsimlash`} footer={<Button onClick={save} className="w-full text-[17px]" disabled={total <= 0}>O‘tkazish · {plain(total)}</Button>}>
      <FieldGroup>
        <Field label="Qayerdan"><Select value={fromId} onChange={setFromId} options={L.activeAccounts.map(a => [a.id, `${a.icon} ${a.name} · ${plain(L.balance(a))}`] as [string, string])} /></Field>
      </FieldGroup>
      {rows.length ? (
        <FieldGroup title="Kartalarga">
          {rows.map(r => (
            <div key={r.account.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
              <span className="flex-1">
                <span className="block font-semibold">{r.account.icon} {r.account.name}</span>
                <span className="block text-[13px] text-slate-500">reja {plain(r.plan)}{r.sent > 0 ? ` · o‘tkazilgan ${plain(r.sent)}` : ''}</span>
              </span>
              <span className="w-32"><AmountField value={amounts[r.account.id] ?? 0} onChange={v => setAmounts(a => ({ ...a, [r.account.id]: v }))} /></span>
            </div>
          ))}
        </FieldGroup>
      ) : <Hint>Oylik reja qo‘yilgan karta yo‘q. «Mening rejam» orqali sozlang.</Hint>}
      {total > fromBalance && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">⚠️ Kartada {plain(fromBalance)} bor — {plain(total - fromBalance)} yetmaydi. Maosh tushganini kiritganmisiz?</p>}
      <Hint>O‘tkazma xarajat emas — pul faqat kartadan kartaga o‘tadi. Har bir karta o‘z vazifasi bo‘yicha alohida hisoblanadi.</Hint>
      <ErrorBox error={error} />
    </Sheet>
  );
}
