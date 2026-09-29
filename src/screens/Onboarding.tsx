import { useRef, useState } from 'react';
import { commit, replaceState, useAppState, useLedger } from '../store/store';
import { openSheet, showToast } from '../store/ui';
import { Button, List, Row, cx } from '../ui/kit';
import { AmountField, Hint } from '../ui/form';
import { money, plain, setCurrency, CURRENCIES } from '../lib/format';
import { createMonthBudget, ensureExpectedIncomes, saveAccount } from '../domain/actions';
import { snapshotToState } from '../store/persist';
import { isV1 } from '../domain/migrate';
import { currentMonth } from '../lib/format';

const STEPS = [
  ['💰', 'Pulingiz qayerda?', 'Naqd pul va kartalaringizni hozirgi balansi bilan qo‘shing.'],
  ['📥', 'Qachon pul keladi?', 'Har oy tushadigan kirimlar: qaysi kuni, qancha va qaysi kartaga.'],
  ['📊', 'Oylik budjet', 'Har bir kategoriyaga oyiga qancha sarflamoqchisiz? Bo‘sh qoldirsangiz — limitsiz.'],
  ['💳', 'Qarzlar', 'Kredit va qarzlaringiz. Yo‘q bo‘lsa — o‘tkazib yuboring.'],
] as const;

export function Onboarding() {
  const s = useAppState();
  const L = useLedger();
  const [step, setStep] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const [icon, title, text] = STEPS[step];

  const quickAccount = (name: string, type: 'cash' | 'card') => {
    if (s.accounts.some(a => a.name.toLowerCase() === name.toLowerCase())) return;
    commit(d => { saveAccount(d, { name, type }); });
  };

  const finish = () => {
    commit(d => {
      d.settings.onboarded = true;
      createMonthBudget(d, currentMonth(), 'defaults');
      ensureExpectedIncomes(d);
    });
    showToast('Tayyor! Endi + tugmasi orqali kirim-chiqim kiriting ✓', 'success', 4000);
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      if (!isV1(data) && !(Array.isArray(data?.transactions) && Array.isArray(data?.accounts))) throw new Error('Bu fayl Budget zaxirasi emas.');
      const next = snapshotToState(data);
      next.settings.onboarded = true;
      await replaceState(next, 'before-import');
      showToast('Zaxiradan tiklandi ✓');
    } catch (e) {
      showToast(`⚠️ ${(e as Error).message}`, 'danger', 5000);
    }
  };

  const limits = L.regularCategories;
  const totalLimit = limits.reduce((a, c) => a + c.monthlyLimit, 0);
  const expected = s.incomeSchedules.filter(x => x.isActive).reduce((a, x) => a + x.amount, 0);

  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-32">
      <div className="pt-safe px-4">
        <div className="mt-3 flex gap-1.5">
          {STEPS.map((_, i) => <div key={i} className={cx('h-1.5 flex-1 rounded-full', i <= step ? 'bg-indigo-500' : 'bg-slate-200 dark:bg-zinc-800')} />)}
        </div>
        <div className="mt-6 text-5xl">{icon}</div>
        <h1 className="mt-2 text-[28px] font-extrabold leading-tight">{title}</h1>
        <p className="mt-1 text-[15px] text-slate-500">{text}</p>
      </div>

      <div className="mt-5 space-y-4 px-4">
        {step === 0 && (
          <>
            <List>
              {s.accounts.map(a => (
                <Row key={a.id} icon={a.icon} title={a.name} right={<span className="tabular font-semibold">{plain(L.balance(a))}</span>} chevron onClick={() => openSheet({ type: 'account', id: a.id })} />
              ))}
              <Row icon="＋" title={<span className="text-indigo-600">Hisob qo‘shish</span>} onClick={() => openSheet({ type: 'account' })} />
            </List>
            <div className="flex flex-wrap gap-2">
              {([['Naqd pul', 'cash'], ['Main', 'card'], ['Basic', 'card'], ['6418', 'card']] as const)
                .filter(([n]) => !s.accounts.some(a => a.name === n))
                .map(([n, t]) => (
                  <button key={n} onClick={() => quickAccount(n, t)} className="rounded-full bg-white px-4 py-2 text-[15px] font-semibold shadow-card dark:bg-zinc-900">
                    + {n}
                  </button>
                ))}
            </div>
            <Hint>Tez qo‘shilgan hisobni bosib, hozirgi balansini kiriting.</Hint>
            {s.accounts.length > 0 && <p className="tabular text-center text-lg font-bold">Jami: {money(L.totalMoney)}</p>}
            <div className="flex items-center justify-between rounded-3xl bg-white px-4 py-3 shadow-card dark:bg-zinc-900">
              <span>Valyuta</span>
              <select value={s.settings.currency} onChange={e => { setCurrency(e.target.value); commit(d => { d.settings.currency = e.target.value; }); }}
                className="bg-transparent text-right text-indigo-600">
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
              </select>
            </div>
            <button onClick={() => fileRef.current?.click()} className="w-full py-2 text-[15px] font-semibold text-indigo-600">📥 Oldin ishlatganmisiz? Zaxiradan tiklash</button>
            <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} />
          </>
        )}

        {step === 1 && (
          <List footer={expected ? `Oyiga jami: ${money(expected)}` : 'Masalan: Maosh (1-qism) 7 400 000 — 1-kuni → Main; Maosh (2-qism) 4 800 000 — 15-kuni → Basic.'}>
            {s.incomeSchedules.map(x => (
              <Row key={x.id} icon="🔁" title={x.source} subtitle={`Har oy ${x.day}-kuni → ${L.account(x.targetAccountId)?.name ?? '—'}`}
                right={<span className="tabular font-bold text-emerald-600">+{plain(x.amount)}</span>} chevron onClick={() => openSheet({ type: 'schedule', id: x.id })} />
            ))}
            <Row icon="＋" title={<span className="text-indigo-600">Oylik kirim qo‘shish</span>} onClick={() => openSheet({ type: 'schedule' })} />
          </List>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-2xl bg-white p-3 shadow-card dark:bg-zinc-900"><p className="text-[12px] text-slate-500">Kirim / oy</p><p className="tabular font-bold text-emerald-600">{plain(expected)}</p></div>
              <div className="rounded-2xl bg-white p-3 shadow-card dark:bg-zinc-900"><p className="text-[12px] text-slate-500">Budjet</p><p className={cx('tabular font-bold', expected > 0 && totalLimit > expected && 'text-rose-600')}>{plain(totalLimit)}</p></div>
            </div>
            {[...new Set(limits.map(c => c.group))].map(g => (
              <List key={g} title={g}>
                {limits.filter(c => c.group === g).map(c => (
                  <div key={c.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                    <span className="text-xl">{c.icon}</span>
                    <span className="flex-1">{c.name}</span>
                    <span className="w-36">
                      <AmountField value={c.monthlyLimit} placeholder="limitsiz"
                        onChange={v => commit(d => { const x = d.categories.find(y => y.id === c.id); if (x) x.monthlyLimit = v; })} />
                    </span>
                  </div>
                ))}
              </List>
            ))}
            <Hint>Kategoriyalarni keyin Ko‘proq → Kategoriyalar orqali qo‘shasiz yoki o‘zgartirasiz.</Hint>
          </>
        )}

        {step === 3 && (
          <List footer={L.activeDebts.length ? `Jami qarz: ${money(L.totalDebt)}` : 'Masalan: Uzum 5.5M 49%, TBC 10.5M 48% (11-kuni), Shox 12M.'}>
            {L.activeDebts.map(d => (
              <Row key={d.id} icon="💳" title={d.name} subtitle={[d.interestRate ? `${d.interestRate}%` : '', d.dueDay ? `${d.dueDay}-kuni` : ''].filter(Boolean).join(' · ')}
                right={<span className="tabular font-bold text-orange-600">{plain(d.startingBalance)}</span>} chevron onClick={() => openSheet({ type: 'debt', id: d.id })} />
            ))}
            <Row icon="＋" title={<span className="text-indigo-600">Qarz qo‘shish</span>} onClick={() => openSheet({ type: 'debt' })} />
          </List>
        )}
      </div>

      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90">
        <div className="mx-auto flex max-w-xl gap-3 px-4 py-3">
          {step > 0 && <Button tone="soft" onClick={() => setStep(step - 1)} className="flex-1">Orqaga</Button>}
          {step < STEPS.length - 1
            ? <Button onClick={() => setStep(step + 1)} className="flex-[2]" disabled={step === 0 && s.accounts.length === 0}>Keyingi</Button>
            : <Button onClick={finish} className="flex-[2]">Boshlash 🚀</Button>}
        </div>
      </div>
    </div>
  );
}
