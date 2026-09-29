import { useState } from 'react';
import type { Account, Category, ID, State } from '../domain/types';
import { Ledger } from '../domain/engine';
import * as A from '../domain/actions';
import { commit, getState, useLedger } from '../store/store';
import { closeSheet, openSheet, replaceSheet, showToast, useSheets, type SheetSpec } from '../store/ui';
import { Sheet } from '../ui/Sheet';
import { DistributeSheet, PlanSheet } from './PlanSheets';
import { Button, Pill, Row, cx } from '../ui/kit';
import {
  AccountChips, AmountField, AmountInput, CategoryChips, DateInput, ErrorBox, Field, FieldGroup, Hint, Select, TextInput, Toggle,
} from '../ui/form';
import { currentMonth, dayTitle, fullDate, money, monthOf, monthTitle, plain, relativeDay, sum, today } from '../lib/format';

// ---------- Umumiy ----------

function useSubmit() {
  const [error, setError] = useState('');
  const submit = (fn: (s: State) => void, message = 'Saqlandi ✓', tone: 'success' | 'danger' = 'success') => {
    try {
      commit(fn);
      closeSheet();
      if (message) showToast(message, tone, tone === 'danger' ? 5000 : 2400);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = (fn: (s: State) => void, label = 'O‘chirildi') => {
    try {
      commit(fn, { undo: label });
      closeSheet();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return { error, submit, remove };
}

function SaveButton({ onClick, children = 'Saqlash', tone = 'primary' }: { onClick: () => void; children?: string; tone?: 'primary' | 'success' }) {
  return <Button onClick={onClick} tone={tone} className="w-full text-[17px]">{children}</Button>;
}

/** Oxirgi ishlatilgan hisob — keyingi kiritishda avtomatik tanlanadi. */
function lastAccount(L: Ledger, type: 'income' | 'expense'): ID | null {
  const active = new Set(L.activeAccounts.map(a => a.id));
  const last = [...L.s.transactions].reverse().find(t => t.type === type && t.accountId && active.has(t.accountId));
  return last?.accountId ?? L.activeAccounts[0]?.id ?? null;
}

const accountOptions = (L: Ledger, emptyLabel = 'Tanlanmagan'): [string, string][] =>
  [['', emptyLabel], ...L.activeAccounts.map(a => [a.id, `${a.icon} ${a.name}`] as [string, string])];

const categoryOptions = (cats: Category[], emptyLabel = 'Tanlanmagan'): [string, string][] =>
  [['', emptyLabel], ...cats.map(c => [c.id, `${c.icon} ${c.name}`] as [string, string])];

const dayOptions = (withNone: boolean): [number, string][] =>
  [...(withNone ? [[0, 'Belgilanmagan'] as [number, string]] : []), ...Array.from({ length: 31 }, (_, i) => [i + 1, `${i + 1}-kun`] as [number, string])];

function MoreFields({ date, setDate, note, setNote, open: initialOpen = false }: {
  date: string; setDate: (v: string) => void; note: string; setNote: (v: string) => void; open?: boolean;
}) {
  const [open, setOpen] = useState(initialOpen || date !== today() || !!note);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-2xl py-2 text-[15px] font-medium text-indigo-600 dark:text-indigo-400">
        + Sana va izoh ({date === today() ? 'bugun' : fullDate(date)})
      </button>
    );
  }
  return (
    <FieldGroup>
      <Field label="Sana"><DateInput value={date} onChange={setDate} /></Field>
      <Field label="Izoh"><TextInput value={note} onChange={setNote} placeholder="ixtiyoriy" /></Field>
    </FieldGroup>
  );
}

function NoAccounts() {
  return (
    <div className="rounded-3xl bg-amber-50 p-4 text-[15px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
      Avval hisob qo‘shing (naqd pul yoki karta).
      <Button tone="soft" className="mt-3 w-full" onClick={() => replaceSheet({ type: 'account' })}>+ Hisob qo‘shish</Button>
    </div>
  );
}

// ---------- Quick Add ----------

function QuickAdd() {
  const big = (label: string, icon: string, cls: string, spec: SheetSpec) => (
    <button onClick={() => replaceSheet(spec)} className={cx('flex min-h-[104px] flex-col items-start justify-between rounded-3xl p-4 text-left text-white shadow-card active:scale-[.98] transition', cls)}>
      <span className="text-3xl">{icon}</span>
      <span className="text-[18px] font-bold">{label}</span>
    </button>
  );
  return (
    <Sheet title="Nima qo‘shamiz?">
      <div className="grid grid-cols-2 gap-3">
        {big('Chiqim', '−', 'bg-gradient-to-br from-rose-500 to-pink-600', { type: 'expense' })}
        {big('Kirim', '+', 'bg-gradient-to-br from-emerald-500 to-teal-600', { type: 'income' })}
        {big('O‘tkazma', '↔', 'bg-gradient-to-br from-sky-500 to-blue-600', { type: 'transfer' })}
        {big('Qarz to‘lovi', '💳', 'bg-gradient-to-br from-orange-500 to-amber-600', { type: 'debtPayment' })}
      </div>
      <FieldGroup>
        <Row icon="🛒" title="Rejali xarid" subtitle="Keyin olmoqchi bo‘lgan narsa" chevron onClick={() => replaceSheet({ type: 'planned' })} />
        <Row icon="📥" title="Kutilgan kirim" subtitle="Hali tushmagan pul" chevron onClick={() => replaceSheet({ type: 'expected' })} />
      </FieldGroup>
    </Sheet>
  );
}

// ---------- Chiqim ----------

function ExpenseForm({ id, categoryId: initialCat }: { id?: ID; categoryId?: ID }) {
  const L = useLedger();
  const tx = id ? L.s.transactions.find(t => t.id === id) : undefined;
  const [amount, setAmount] = useState(tx?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<ID | null>(tx?.categoryId ?? initialCat ?? null);
  const homeOf = (cid: ID | null | undefined) => { const h = L.category(cid)?.accountId; return h && L.account(h)?.isActive ? h : null; };
  const [accountId, setAccountId] = useState<ID | null>(tx?.accountId ?? homeOf(initialCat) ?? lastAccount(L, 'expense'));
  // Kategoriya tanlanganda — uning kartasi avtomatik tanlanadi
  const pickCategory = (cid: ID) => { setCategoryId(cid); const h = homeOf(cid); if (h) setAccountId(h); };
  const [date, setDate] = useState(tx?.date ?? today());
  const [note, setNote] = useState(tx?.note ?? '');
  const { error, submit, remove } = useSubmit();

  const debt = tx?.debtId ? L.debt(tx.debtId) : undefined;
  const cats = L.expenseCategories.filter(c => c.kind !== 'debt');
  const current = L.category(categoryId);
  if (current && !cats.includes(current) && current.kind !== 'debt') cats.unshift(current);

  const acc = L.account(accountId);
  const violation = !!acc?.strict && !!current && current.accountId !== acc.id;
  const home = L.account(current?.accountId);
  const foreign = !violation && !!home && home.isActive && !!accountId && home.id !== accountId;
  const allowed = acc ? L.cardCategories(acc.id).map(c => c.name).join(', ') : '';
  const key = monthOf(date);
  const catLimit = current && current.kind === 'regular' ? L.limit(current, key) : 0;
  const catSpent = current ? L.categoryActual(current.id, key) - (tx && tx.categoryId === current.id && monthOf(tx.date) === key ? tx.amount : 0) : 0;
  const catToday = current ? sum(L.s.transactions.filter(t => t.categoryId === current.id && t.date === today() && t.id !== id), t => t.amount) : 0;
  const after = catSpent + amount;

  const save = () => submit(s => {
    A.saveTransaction(s, { ...(tx ?? {}), id, type: 'expense', amount, categoryId, accountId, date, note });
  }, violation ? `🚫 Qoida buzildi: ${acc?.name} kartasidan ${current?.name}` : id ? 'Saqlandi ✓' : `−${plain(amount)} ${current ? current.name : ''} ✓`, violation ? 'danger' : 'success');

  return (
    <Sheet title={debt ? `Qarz to‘lovi: ${debt.name}` : id ? 'Chiqimni tahrirlash' : 'Chiqim'} footer={<SaveButton onClick={save} />}>
      <AmountInput value={amount} onChange={setAmount} autoFocus={!id} />
      {!debt && <CategoryChips categories={cats} value={categoryId} onChange={pickCategory} />}
      {current && !debt && (catLimit > 0 || (current.dailyLimit ?? 0) > 0) && (
        <div className="rounded-2xl bg-white px-4 py-3 text-[14px] shadow-card dark:bg-zinc-900">
          {catLimit > 0 && (
            <div className="flex justify-between"><span className="text-slate-500">{current.name}: oyga</span>
              <span className={cx('tabular font-semibold', after > catLimit ? 'text-rose-600' : 'text-emerald-600')}>
                {after > catLimit ? `+${plain(after - catLimit)} oshadi` : `qoladi ${plain(catLimit - after)}`}</span></div>
          )}
          {(current.dailyLimit ?? 0) > 0 && date === today() && (
            <div className="flex justify-between"><span className="text-slate-500">Bugun</span>
              <span className={cx('tabular font-semibold', catToday + amount > (current.dailyLimit ?? 0) ? 'text-rose-600' : '')}>{plain(catToday + amount)} / {plain(current.dailyLimit ?? 0)}</span></div>
          )}
        </div>
      )}
      {L.activeAccounts.length ? (
        <div>
          <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Qaysi hisobdan</p>
          <AccountChips accounts={L.activeAccounts} value={accountId} onChange={setAccountId} balances={a => L.balance(a)} />
        </div>
      ) : <NoAccounts />}
      {violation && (
        <p className="rounded-2xl bg-rose-600 px-4 py-3 text-[15px] font-semibold text-white">
          🚫 {acc?.name} kartasi faqat: {allowed || 'hech narsa biriktirilmagan'}. {current?.name} uchun bu kartadan ishlatish — qoida buzilishi.
        </p>
      )}
      {foreign && <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[14px] text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">⚠️ {current?.name} odatda <b>{home?.name}</b> kartasidan to‘lanadi.</p>}
      <MoreFields date={date} setDate={setDate} note={note} setNote={setNote} />
      <ErrorBox error={error} />
      {id && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteTransaction(s, id), 'Chiqim o‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

// ---------- Kirim ----------

function IncomeForm({ id }: { id?: ID }) {
  const L = useLedger();
  const tx = id ? L.s.transactions.find(t => t.id === id) : undefined;
  const [amount, setAmount] = useState(tx?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<ID | null>(tx?.categoryId ?? L.incomeCategories[0]?.id ?? null);
  const [accountId, setAccountId] = useState<ID | null>(tx?.accountId ?? lastAccount(L, 'income'));
  const [date, setDate] = useState(tx?.date ?? today());
  const [note, setNote] = useState(tx?.note ?? '');
  const { error, submit, remove } = useSubmit();
  const pending = id ? [] : L.comingSoon(today(), 5).items;

  const save = () => submit(s => {
    A.saveTransaction(s, { ...(tx ?? {}), id, type: 'income', amount, categoryId, accountId, date, note });
  }, id ? 'Saqlandi ✓' : `+${plain(amount)} kirim ✓`);

  return (
    <Sheet title={id ? 'Kirimni tahrirlash' : 'Kirim'} footer={<SaveButton onClick={save} tone="success" />}>
      {pending.length > 0 && (
        <FieldGroup title="Kutilayotgan pul tushdimi?">
          {pending.map(i => (
            <Row key={i.id} icon="📥" title={i.source} subtitle={`${dayTitle(i.expectedDate)} · ${L.account(i.targetAccountId)?.name ?? ''}`}
              right={<span className="tabular font-bold text-emerald-600">+{plain(i.amount)}</span>} chevron
              onClick={() => replaceSheet({ type: 'receive', id: i.id })} />
          ))}
        </FieldGroup>
      )}
      <AmountInput value={amount} onChange={setAmount} autoFocus={!id && !pending.length} />
      <div>
        <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Manba</p>
        <CategoryChips categories={L.incomeCategories} value={categoryId} onChange={setCategoryId} />
      </div>
      {L.activeAccounts.length ? (
        <div>
          <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Qayerga</p>
          <AccountChips accounts={L.activeAccounts} value={accountId} onChange={setAccountId} balances={a => L.balance(a)} />
        </div>
      ) : <NoAccounts />}
      <MoreFields date={date} setDate={setDate} note={note} setNote={setNote} />
      <ErrorBox error={error} />
      {id && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteTransaction(s, id), 'Kirim o‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

// ---------- O'tkazma ----------

function TransferForm({ id }: { id?: ID }) {
  const L = useLedger();
  const tr = id ? L.s.transfers.find(t => t.id === id) : undefined;
  const accs = L.activeAccounts;
  const [amount, setAmount] = useState(tr?.amount ?? 0);
  const [from, setFrom] = useState<ID | null>(tr?.fromAccountId ?? accs[0]?.id ?? null);
  const [to, setTo] = useState<ID | null>(tr?.toAccountId ?? accs[1]?.id ?? null);
  const [date, setDate] = useState(tr?.date ?? today());
  const [note, setNote] = useState(tr?.note ?? '');
  const { error, submit, remove } = useSubmit();

  const save = () => submit(s => {
    A.saveTransfer(s, { id, fromAccountId: from ?? '', toAccountId: to ?? '', amount, date, note });
  }, 'O‘tkazma saqlandi ✓');

  return (
    <Sheet title="O‘tkazma" footer={<SaveButton onClick={save} />}>
      <AmountInput value={amount} onChange={setAmount} autoFocus={!id} />
      {accs.length < 2 ? <NoAccounts /> : (
        <>
          <div>
            <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500">Qayerdan</p>
            <AccountChips accounts={accs} value={from} onChange={setFrom} balances={a => L.balance(a)} />
          </div>
          <div className="text-center text-2xl text-slate-400">↓</div>
          <div>
            <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500">Qayerga</p>
            <AccountChips accounts={accs} value={to} onChange={setTo} balances={a => L.balance(a)} />
          </div>
        </>
      )}
      <Hint>O‘tkazma xarajat hisoblanmaydi va budjetni kamaytirmaydi — pul faqat bir hisobdan boshqasiga o‘tadi.</Hint>
      <MoreFields date={date} setDate={setDate} note={note} setNote={setNote} />
      <ErrorBox error={error} />
      {id && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteTransfer(s, id), 'O‘tkazma o‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

// ---------- Qarz to'lovi ----------

function DebtPaymentForm({ debtId, amount: initialAmount }: { debtId?: ID; amount?: number }) {
  const L = useLedger();
  const debts = L.activeDebts.filter(d => L.debtRemaining(d) > 0);
  const [id, setId] = useState<ID | null>(debtId ?? debts[0]?.id ?? null);
  const debt = L.debt(id);
  const [amount, setAmount] = useState(initialAmount ?? 0);
  const [accountId, setAccountId] = useState<ID | null>(lastAccount(L, 'expense'));
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const { error, submit } = useSubmit();

  if (!debts.length) {
    return (
      <Sheet title="Qarz to‘lovi">
        <p className="text-center text-slate-500">Faol qarz yo‘q.</p>
        <Button tone="soft" className="w-full" onClick={() => replaceSheet({ type: 'debt' })}>+ Qarz qo‘shish</Button>
      </Sheet>
    );
  }

  const remaining = debt ? L.debtRemaining(debt) : 0;
  const save = () => submit(s => { A.payDebt(s, { debtId: id ?? '', amount, accountId, date, note }); },
    debt ? `${debt.name}: −${plain(amount)} ✓ Qoldiq: ${plain(remaining - amount)}` : 'Saqlandi ✓');

  return (
    <Sheet title="Qarz to‘lovi" footer={<SaveButton onClick={save} />}>
      <div className="grid grid-cols-2 gap-2">
        {debts.map(d => (
          <button key={d.id} onClick={() => setId(d.id)}
            className={cx('rounded-2xl border-2 p-3 text-left transition', d.id === id ? 'border-orange-500 bg-orange-50 dark:bg-orange-500/15' : 'border-transparent bg-white shadow-card dark:bg-zinc-900')}>
            <p className="font-bold">{d.name}</p>
            <p className="tabular text-[13px] text-slate-500">{plain(L.debtRemaining(d))}</p>
          </button>
        ))}
      </div>
      <AmountInput value={amount} onChange={setAmount} autoFocus />
      {debt && amount > 0 && (
        <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 text-[15px] shadow-card dark:bg-zinc-900">
          <span className="text-slate-500">Yangi qoldiq</span>
          <span className={cx('tabular font-bold', amount > remaining && 'text-rose-600')}>{plain(remaining)} → {plain(Math.max(0, remaining - amount))}</span>
        </div>
      )}
      <div>
        <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500">Qaysi hisobdan</p>
        <AccountChips accounts={L.activeAccounts} value={accountId} onChange={setAccountId} balances={a => L.balance(a)} />
      </div>
      <MoreFields date={date} setDate={setDate} note={note} setNote={setNote} />
      <Hint>Qarz to‘lovi hisobdan ham, qarzdan ham ayriladi. Oddiy xarajatlar statistikasiga aralashmaydi.</Hint>
      <ErrorBox error={error} />
    </Sheet>
  );
}

// ---------- Hisob ----------

function AccountForm({ id }: { id?: ID }) {
  const L = useLedger();
  const a = id ? L.account(id) : undefined;
  const [name, setName] = useState(a?.name ?? '');
  const [type, setType] = useState<Account['type']>(a?.type ?? 'card');
  const [balance, setBalance] = useState(a?.initialBalance ?? 0);
  const [last4, setLast4] = useState(a?.last4 ?? '');
  const [active, setActive] = useState(a?.isActive ?? true);
  const [purpose, setPurpose] = useState(a?.purpose ?? '');
  const [plan, setPlan] = useState(a?.plan ?? 0);
  const [strict, setStrict] = useState(a?.strict ?? false);
  const cardCats = id ? L.cardCategories(id) : [];
  const { error, submit, remove } = useSubmit();
  const used = id ? A.isAccountUsed(L.s, id) : false;

  const save = () => submit(s => {
    A.saveAccount(s, { id, name, type, initialBalance: balance, last4, isActive: active, purpose: purpose.trim(), plan, strict,
      icon: type === 'cash' ? '💵' : type === 'card' ? '💳' : '🏦' });
  });

  return (
    <Sheet title={a ? 'Hisob' : 'Yangi hisob'} footer={<SaveButton onClick={save} />}>
      <div className="grid grid-cols-3 gap-2">
        {([['cash', '💵', 'Naqd'], ['card', '💳', 'Karta'], ['other', '🏦', 'Boshqa']] as const).map(([v, icon, label]) => (
          <button key={v} onClick={() => setType(v)}
            className={cx('rounded-2xl border-2 py-3 text-center font-semibold', type === v ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15' : 'border-transparent bg-white shadow-card dark:bg-zinc-900')}>
            <span className="block text-2xl">{icon}</span>{label}
          </button>
        ))}
      </div>
      <FieldGroup>
        <Field label="Nomi"><TextInput value={name} onChange={setName} placeholder={type === 'cash' ? 'Naqd pul' : 'Main, Basic, 6418...'} /></Field>
        {type === 'card' && <Field label="Oxirgi 4 raqam"><TextInput value={last4} onChange={v => setLast4(v.replace(/\D/g, '').slice(0, 4))} placeholder="ixtiyoriy" inputMode="numeric" /></Field>}
        <Field label={used ? 'Boshlang‘ich balans' : 'Hozirgi balans'}><AmountField value={balance} onChange={setBalance} /></Field>
        {a && <Toggle label="Faol" hint="Faol emas hisob Total Money’ga kirmaydi" checked={active} onChange={setActive} />}
      </FieldGroup>
      <FieldGroup title="Karta vazifasi">
        <Field label="Nima uchun"><TextInput value={purpose} onChange={setPurpose} placeholder="Oziq-ovqat, yo‘l, telefon" /></Field>
        <Field label="Oyiga o‘tkaziladi"><AmountField value={plan} onChange={setPlan} placeholder="reja yo‘q" /></Field>
        <Toggle label="Faqat o‘z kategoriyalari uchun" hint="Boshqa narsaga ishlatilsa — qizil ogohlantirish" checked={strict} onChange={setStrict} />
      </FieldGroup>
      {a && <Hint>Biriktirilgan kategoriyalar: {cardCats.length ? cardCats.map(x => `${x.icon} ${x.name}`).join(', ') : 'yo‘q'}. Kategoriyani kartaga biriktirish: Ko‘proq → Kategoriyalar.</Hint>}
      <Hint>
        {a ? `Joriy balans: ${money(L.balance(a))}. ` : ''}Keyingi balans kirim, chiqim, o‘tkazma va qarz to‘lovlaridan avtomatik hisoblanadi. To‘liq karta raqami saqlanmaydi.
      </Hint>
      <ErrorBox error={error} />
      {a && (used
        ? <Hint>Bu hisobda tranzaksiyalar bor — o‘chirib bo‘lmaydi (tarix buzilmasligi uchun). Yashirish uchun «Faol»ni o‘chiring.</Hint>
        : <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteAccount(s, a.id), 'Hisob o‘chirildi')}>O‘chirish</Button>)}
    </Sheet>
  );
}

// ---------- Kategoriya ----------

function CategoryForm({ id, incomeType }: { id?: ID; incomeType?: boolean }) {
  const L = useLedger();
  const c = id ? L.category(id) : undefined;
  const type = c?.type ?? (incomeType ? 'income' : 'expense');
  const groups = [...new Set(L.s.categories.filter(x => x.type === type).map(x => x.group))];
  const [name, setName] = useState(c?.name ?? '');
  const [icon, setIcon] = useState(c?.icon ?? '📁');
  const [group, setGroup] = useState(c?.group ?? groups[0] ?? 'Boshqa');
  const [newGroup, setNewGroup] = useState('');
  const [kind, setKind] = useState(c?.kind ?? 'regular');
  const [limit, setLimit] = useState(c?.monthlyLimit ?? 0);
  const [cardId, setCardId] = useState<string>(c?.accountId ?? '');
  const [daily, setDaily] = useState(c?.dailyLimit ?? 0);
  const [active, setActive] = useState(c?.isActive ?? true);
  const { error, submit, remove } = useSubmit();
  const used = id ? A.isCategoryUsed(L.s, id) : false;

  const save = () => submit(s => {
    A.saveCategory(s, { id, name, icon: [...icon.trim()][0] ?? '📁', group: group === '__new' ? (newGroup.trim() || 'Boshqa') : group,
      type, kind, monthlyLimit: kind === 'regular' && type === 'expense' ? limit : 0, isActive: active,
      accountId: type === 'expense' ? cardId || null : null, dailyLimit: type === 'expense' && kind === 'regular' ? daily : 0 });
  });

  return (
    <Sheet title={c ? 'Kategoriya' : type === 'income' ? 'Yangi kirim manbai' : 'Yangi kategoriya'} footer={<SaveButton onClick={save} />}>
      <FieldGroup>
        <Field label="Nomi"><TextInput value={name} onChange={setName} placeholder="Masalan, Sayohat" /></Field>
        <Field label="Ikonka"><TextInput value={icon} onChange={setIcon} placeholder="emoji" /></Field>
        <Field label="Guruh"><Select value={group} onChange={setGroup} options={[...groups.map(g => [g, g] as [string, string]), ['__new', '+ Yangi guruh']]} /></Field>
        {group === '__new' && <Field label="Guruh nomi"><TextInput value={newGroup} onChange={setNewGroup} placeholder="Masalan, Sayohat" /></Field>}
        {type === 'expense' && kind !== 'debt' && (
          <Field label="Turi"><Select value={kind} onChange={setKind} options={[['regular', 'Oddiy xarajat'], ['savings', 'Jamg‘arma']]} /></Field>
        )}
        {type === 'expense' && kind === 'regular' && <Field label="Oylik limit"><AmountField value={limit} onChange={setLimit} placeholder="limitsiz" /></Field>}
        {type === 'expense' && kind === 'regular' && <Field label="Kunlik limit"><AmountField value={daily} onChange={setDaily} placeholder="yo‘q" /></Field>}
        {type === 'expense' && <Field label="Qaysi kartadan"><Select value={cardId} onChange={setCardId} options={[['', 'Istalgan'], ...L.activeAccounts.map(a => [a.id, `${a.icon} ${a.name}`] as [string, string])]} /></Field>}
        <Toggle label="Faol" checked={active} onChange={setActive} />
      </FieldGroup>
      {kind === 'debt' && <Hint>Bu tizim kategoriyasi — qarz to‘lovlari shu yerga yoziladi.</Hint>}
      {type === 'expense' && kind === 'regular' && <Hint>Oylik limit — standart qiymat. Aniq oy limitini Budjet sahifasida o‘zgartirasiz.</Hint>}
      <ErrorBox error={error} />
      {c && c.kind !== 'debt' && (used
        ? <Hint>Bu kategoriyada yozuvlar bor — o‘chirib bo‘lmaydi. Yashirish uchun «Faol»ni o‘chiring.</Hint>
        : <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteCategory(s, c.id), 'Kategoriya o‘chirildi')}>O‘chirish</Button>)}
    </Sheet>
  );
}

// ---------- Limit ----------

function LimitForm({ categoryId, month }: { categoryId: ID; month: string }) {
  const L = useLedger();
  const c = L.category(categoryId)!;
  const [amount, setAmount] = useState(L.limit(c, month));
  const [alsoDefault, setAlsoDefault] = useState(!L.hasBudget(month));
  const { error, submit } = useSubmit();
  const actual = L.categoryActual(c.id, month);

  const save = () => submit(s => A.setLimit(s, month, c.id, amount, alsoDefault), 'Limit yangilandi ✓');

  return (
    <Sheet title={`${c.icon} ${c.name}`} footer={<SaveButton onClick={save} />}>
      <AmountInput value={amount} onChange={setAmount} label={`${monthTitle(month)} limiti`} autoFocus />
      <FieldGroup>
        <Row title="Shu oy sarflandi" right={<span className="tabular font-semibold">{money(actual)}</span>} />
        <Row title={actual > amount ? 'Oshib ketdi' : 'Qoldi'}
          right={<span className={cx('tabular font-semibold', actual > amount ? 'text-rose-600' : 'text-emerald-600')}>{money(Math.abs(amount - actual))}</span>} />
        <Toggle label="Standart limit sifatida ham saqlash" hint="Keyingi oylar shu qiymat bilan yaratiladi" checked={alsoDefault} onChange={setAlsoDefault} />
      </FieldGroup>
      <Hint>0 kiritsangiz — bu kategoriyaga limit qo‘yilmaydi.</Hint>
      <ErrorBox error={error} />
    </Sheet>
  );
}

// ---------- Qarz ----------

function DebtForm({ id }: { id?: ID }) {
  const L = useLedger();
  const d = id ? L.debt(id) : undefined;
  const [name, setName] = useState(d?.name ?? '');
  const [starting, setStarting] = useState(d?.startingBalance ?? 0);
  const [original, setOriginal] = useState(d?.originalAmount ?? 0);
  const [rate, setRate] = useState(d?.interestRate ? String(d.interestRate) : '');
  const [dueDay, setDueDay] = useState(d?.dueDay ?? 0);
  const [minPay, setMinPay] = useState(d?.minimumPayment ?? 0);
  const [note, setNote] = useState(d?.note ?? '');
  const [active, setActive] = useState(d?.isActive ?? true);
  const { error, submit, remove } = useSubmit();
  const hasPayments = id ? L.s.transactions.some(t => t.debtId === id) : false;

  const save = () => submit(s => {
    A.saveDebt(s, { id, name, startingBalance: starting, originalAmount: original || starting,
      interestRate: parseFloat(rate.replace(',', '.')) || 0, dueDay, minimumPayment: minPay, note, isActive: active });
  });

  return (
    <Sheet title={d ? d.name : 'Yangi qarz'} footer={<SaveButton onClick={save} />}>
      <FieldGroup>
        <Field label="Nomi"><TextInput value={name} onChange={setName} placeholder="Uzum, TBC, Shox..." /></Field>
        <Field label={d ? 'Boshlang‘ich qoldiq' : 'Hozirgi qoldiq'}><AmountField value={starting} onChange={setStarting} /></Field>
        <Field label="Dastlabki summa"><AmountField value={original} onChange={setOriginal} placeholder="ixtiyoriy" /></Field>
        <Field label="Foiz, %"><TextInput value={rate} onChange={setRate} placeholder="0" inputMode="decimal" /></Field>
      </FieldGroup>
      <FieldGroup title="To‘lov">
        <Field label="To‘lov kuni"><Select value={dueDay} onChange={setDueDay} options={dayOptions(true)} /></Field>
        <Field label="Oylik minimal to‘lov"><AmountField value={minPay} onChange={setMinPay} placeholder="ixtiyoriy" /></Field>
      </FieldGroup>
      <Hint>Minimal to‘lov kiritilsa, u har oy «Safe to Spend»dan oldindan ayriladi va sanasi yaqinlashganda eslatiladi.</Hint>
      <FieldGroup>
        <Field label="Izoh"><TextInput value={note} onChange={setNote} placeholder="ixtiyoriy" /></Field>
        {d && <Toggle label="Faol" hint="O‘chirilsa — qarz yopilgan hisoblanadi" checked={active} onChange={setActive} />}
      </FieldGroup>
      {d && <Hint>To‘langan: {money(L.debtPaid(d))}. Joriy qoldiq to‘lovlardan avtomatik hisoblanadi.</Hint>}
      <ErrorBox error={error} />
      {d && !hasPayments && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteDebt(s, d.id), 'Qarz o‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

// ---------- Rejali xarid ----------

function PlannedForm({ id }: { id?: ID }) {
  const L = useLedger();
  const p = id ? L.s.planned.find(x => x.id === id) : undefined;
  const [name, setName] = useState(p?.name ?? '');
  const [amount, setAmount] = useState(p?.amount ?? 0);
  const [hasDate, setHasDate] = useState(!!p?.date);
  const [date, setDate] = useState(p?.date ?? today());
  const [categoryId, setCategoryId] = useState<string>(p?.categoryId ?? '');
  const [note, setNote] = useState(p?.note ?? '');
  const { error, submit, remove } = useSubmit();
  const closed = p && p.status !== 'planned';

  const save = () => submit(s => {
    A.savePlanned(s, { id, name, amount, date: hasDate ? date : null, categoryId: categoryId || null, note });
  });

  return (
    <Sheet title={p ? p.name : 'Rejali xarid'} footer={!closed ? <SaveButton onClick={save} /> : undefined}>
      {p && <div className="flex justify-center"><Pill tone={p.status === 'planned' ? 'indigo' : p.status === 'purchased' ? 'green' : 'slate'}>
        {p.status === 'planned' ? 'Rejada' : p.status === 'purchased' ? 'Sotib olindi' : 'Bekor qilindi'}</Pill></div>}
      <FieldGroup>
        <Field label="Nima"><TextInput value={name} onChange={setName} placeholder="Creatine, zaryadlovchi..." /></Field>
        <Field label="Summa"><AmountField value={amount} onChange={setAmount} /></Field>
        <Field label="Kategoriya"><Select value={categoryId} onChange={setCategoryId} options={categoryOptions(L.regularCategories)} /></Field>
        <Toggle label="Sana belgilash" checked={hasDate} onChange={setHasDate} />
        {hasDate && <Field label="Sana"><DateInput value={date} onChange={setDate} /></Field>}
        <Field label="Izoh"><TextInput value={note} onChange={setNote} placeholder="ixtiyoriy" /></Field>
      </FieldGroup>
      <Hint>Rejadagi summa «Safe to Spend»dan oldindan ayriladi — bu pulni boshqa narsaga ishlatib yubormaysiz.</Hint>
      <ErrorBox error={error} />
      {p?.status === 'planned' && (
        <div className="grid grid-cols-2 gap-2">
          <Button tone="success" onClick={() => replaceSheet({ type: 'purchase', id: p.id })}>✓ Sotib oldim</Button>
          <Button tone="soft" onClick={() => submit(s => A.cancelPlanned(s, p.id), 'Reja bekor qilindi')}>Bekor qilish</Button>
        </div>
      )}
      {p?.status === 'cancelled' && <Button tone="soft" className="w-full" onClick={() => submit(s => A.reopenPlanned(s, p.id), 'Reja qayta ochildi')}>Qayta rejaga qo‘shish</Button>}
      {p && !p.transactionId && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deletePlanned(s, p.id), 'Reja o‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

function PurchaseForm({ id }: { id: ID }) {
  const L = useLedger();
  const p = L.s.planned.find(x => x.id === id)!;
  const [amount, setAmount] = useState(p.amount);
  const [accountId, setAccountId] = useState<ID | null>(lastAccount(L, 'expense'));
  const [categoryId, setCategoryId] = useState<ID | null>(p.categoryId);
  const [date, setDate] = useState(today());
  const { error, submit } = useSubmit();

  const save = () => submit(s => A.purchasePlanned(s, id, { amount, accountId, date, categoryId }), `${p.name}: sotib olindi ✓`);

  return (
    <Sheet title={`Sotib oldim: ${p.name}`} footer={<SaveButton onClick={save} tone="success">Tasdiqlash</SaveButton>}>
      <AmountInput value={amount} onChange={setAmount} label="Haqiqiy summa" />
      <CategoryChips categories={L.regularCategories} value={categoryId} onChange={setCategoryId} />
      <div>
        <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500">Qaysi hisobdan</p>
        <AccountChips accounts={L.activeAccounts} value={accountId} onChange={setAccountId} balances={a => L.balance(a)} />
      </div>
      <FieldGroup><Field label="Sana"><DateInput value={date} onChange={setDate} /></Field></FieldGroup>
      <Hint>Xarajat yaratiladi, hisob balansi kamayadi va reja yopiladi.</Hint>
      <ErrorBox error={error} />
    </Sheet>
  );
}

// ---------- Kutilgan kirim ----------

function ScheduleForm({ id }: { id?: ID }) {
  const L = useLedger();
  const x = id ? L.s.incomeSchedules.find(i => i.id === id) : undefined;
  const [source, setSource] = useState(x?.source ?? '');
  const [amount, setAmount] = useState(x?.amount ?? 0);
  const [day, setDay] = useState(x?.day ?? 1);
  const [accountId, setAccountId] = useState<string>(x?.targetAccountId ?? L.activeAccounts[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState<string>(x?.categoryId ?? L.incomeCategories[0]?.id ?? '');
  const [active, setActive] = useState(x?.isActive ?? true);
  const { error, submit, remove } = useSubmit();

  const save = () => submit(s => {
    A.saveIncomeSchedule(s, { id, source, amount, day, targetAccountId: accountId || null, categoryId: categoryId || null, isActive: active });
    A.ensureExpectedIncomes(s);
  });

  return (
    <Sheet title={x ? 'Oylik kirim' : 'Yangi oylik kirim'} footer={<SaveButton onClick={save} />}>
      <FieldGroup>
        <Field label="Nomi"><TextInput value={source} onChange={setSource} placeholder="Maosh (2-qism)" /></Field>
        <Field label="Summa"><AmountField value={amount} onChange={setAmount} /></Field>
        <Field label="Har oy"><Select value={day} onChange={setDay} options={dayOptions(false)} /></Field>
        <Field label="Qaysi hisobga"><Select value={accountId} onChange={setAccountId} options={accountOptions(L)} /></Field>
        <Field label="Manba turi"><Select value={categoryId} onChange={setCategoryId} options={categoryOptions(L.incomeCategories)} /></Field>
        {x && <Toggle label="Faol" checked={active} onChange={setActive} />}
      </FieldGroup>
      <Hint>Har oy shu kuni «Coming Soon»da ko‘rinadi. Pul tushganda «Tushdi» ni bosasiz — shunda u hisobga qo‘shiladi. Tushmaguncha Total Money’ga kirmaydi.</Hint>
      <ErrorBox error={error} />
      {x && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteIncomeSchedule(s, x.id), 'O‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

function ExpectedForm({ id }: { id?: ID }) {
  const L = useLedger();
  const x = id ? L.s.expectedIncomes.find(i => i.id === id) : undefined;
  const [source, setSource] = useState(x?.source ?? '');
  const [amount, setAmount] = useState(x?.amount ?? 0);
  const [date, setDate] = useState(x?.expectedDate ?? today());
  const [accountId, setAccountId] = useState<string>(x?.targetAccountId ?? L.activeAccounts[0]?.id ?? '');
  const [note, setNote] = useState(x?.note ?? '');
  const { error, submit, remove } = useSubmit();

  const save = () => submit(s => {
    A.saveExpectedIncome(s, { id, source, amount, expectedDate: date, targetAccountId: accountId || null,
      categoryId: x?.categoryId ?? L.incomeCategories[0]?.id ?? null, note, scheduleId: x?.scheduleId });
  });

  return (
    <Sheet title={x ? x.source : 'Kutilgan kirim'} footer={x?.status === 'expected' || !x ? <SaveButton onClick={save} /> : undefined}>
      <FieldGroup>
        <Field label="Nomi"><TextInput value={source} onChange={setSource} placeholder="Bonus, qarz qaytishi..." /></Field>
        <Field label="Summa"><AmountField value={amount} onChange={setAmount} /></Field>
        <Field label="Qachon"><DateInput value={date} onChange={setDate} /></Field>
        <Field label="Qaysi hisobga"><Select value={accountId} onChange={setAccountId} options={accountOptions(L)} /></Field>
        <Field label="Izoh"><TextInput value={note} onChange={setNote} placeholder="ixtiyoriy" /></Field>
      </FieldGroup>
      <Hint>Kutilgan pul Total Money’ga qo‘shilmaydi — faqat «Coming Soon»da ko‘rinadi.</Hint>
      <ErrorBox error={error} />
      {x?.status === 'expected' && (
        <div className="grid grid-cols-2 gap-2">
          <Button tone="success" onClick={() => replaceSheet({ type: 'receive', id: x.id })}>✓ Tushdi</Button>
          <Button tone="soft" onClick={() => submit(s => A.skipIncome(s, x.id), 'O‘tkazib yuborildi')}>Tushmaydi</Button>
        </div>
      )}
      {x && !x.transactionId && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteExpectedIncome(s, x.id), 'O‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

function ReceiveForm({ id }: { id: ID }) {
  const L = useLedger();
  const x = L.s.expectedIncomes.find(i => i.id === id)!;
  const [amount, setAmount] = useState(x.amount);
  const [accountId, setAccountId] = useState<ID | null>(x.targetAccountId ?? lastAccount(L, 'income'));
  const [date, setDate] = useState(today());
  const [error, setReceiveError] = useState('');

  const save = () => {
    try {
      commit(s => { A.receiveIncome(s, id, { amount, accountId, date }); });
      showToast(`+${plain(amount)} tushdi ✓`);
      // Maosh tushdi — kartalarga taqsimlash kerak bo'lsa, darhol taklif qilamiz
      const due = new Ledger(getState()).distributionPlan(monthOf(date), accountId).some(r => r.due > 0);
      if (due) replaceSheet({ type: 'distribute' }); else closeSheet();
    } catch (e) {
      setReceiveError((e as Error).message);
    }
  };

  return (
    <Sheet title={`Tushdi: ${x.source}`} footer={<SaveButton onClick={save} tone="success">Tasdiqlash</SaveButton>}>
      <AmountInput value={amount} onChange={setAmount} label="Tushgan summa" />
      <div>
        <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500">Qaysi hisobga</p>
        <AccountChips accounts={L.activeAccounts} value={accountId} onChange={setAccountId} balances={a => L.balance(a)} />
      </div>
      <FieldGroup><Field label="Sana"><DateInput value={date} onChange={setDate} /></Field></FieldGroup>
      <Hint>Expected → Received: hisob balansi va Total Money avtomatik oshadi.</Hint>
      <ErrorBox error={error} />
    </Sheet>
  );
}

// ---------- Majburiy to'lov ----------

function BillForm({ id }: { id?: ID }) {
  const L = useLedger();
  const b = id ? L.s.bills.find(x => x.id === id) : undefined;
  const [name, setName] = useState(b?.name ?? '');
  const [amount, setAmount] = useState(b?.amount ?? 0);
  const [categoryId, setCategoryId] = useState<string>(b?.categoryId ?? '');
  const [accountId, setAccountId] = useState<string>(b?.accountId ?? '');
  const [day, setDay] = useState(b?.day ?? 1);
  const [active, setActive] = useState(b?.isActive ?? true);
  const { error, submit, remove } = useSubmit();

  const save = () => submit(s => {
    A.saveBill(s, { id, name, amount, categoryId: categoryId || null, accountId: accountId || null, day, isActive: active });
  });

  return (
    <Sheet title={b ? b.name : 'Majburiy to‘lov'} footer={<SaveButton onClick={save} />}>
      <FieldGroup>
        <Field label="Nomi"><TextInput value={name} onChange={setName} placeholder="Ijara, Ingliz tili..." /></Field>
        <Field label="Summa"><AmountField value={amount} onChange={setAmount} /></Field>
        <Field label="Kategoriya"><Select value={categoryId} onChange={setCategoryId} options={categoryOptions(L.regularCategories)} /></Field>
        <Field label="Qaysi hisobdan"><Select value={accountId} onChange={setAccountId} options={accountOptions(L)} /></Field>
        <Field label="Har oy"><Select value={day} onChange={setDay} options={dayOptions(false)} /></Field>
        {b && <Toggle label="Faol" checked={active} onChange={setActive} />}
      </FieldGroup>
      <Hint>To‘lanmaguncha summa «Safe to Spend»dan oldindan ayriladi va sanasi yaqinlashganda eslatiladi. Avtomatik yozilmaydi — to‘laganingizda «To‘landi» ni bosasiz.</Hint>
      <ErrorBox error={error} />
      {b && <Button tone="danger" className="w-full" onClick={() => remove(s => A.deleteBill(s, b.id), 'O‘chirildi')}>O‘chirish</Button>}
    </Sheet>
  );
}

function PayBillForm({ id }: { id: ID }) {
  const L = useLedger();
  const b = L.s.bills.find(x => x.id === id)!;
  const [amount, setAmount] = useState(b.amount);
  const [accountId, setAccountId] = useState<ID | null>(b.accountId ?? lastAccount(L, 'expense'));
  const [date, setDate] = useState(today());
  const { error, submit } = useSubmit();

  const save = () => submit(s => A.payBill(s, id, { amount, accountId, date, month: currentMonth() }), `${b.name}: to‘landi ✓`);

  return (
    <Sheet title={`To‘landi: ${b.name}`} footer={<SaveButton onClick={save} tone="success">Tasdiqlash</SaveButton>}>
      <AmountInput value={amount} onChange={setAmount} label="To‘langan summa" />
      <div>
        <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500">Qaysi hisobdan</p>
        <AccountChips accounts={L.activeAccounts} value={accountId} onChange={setAccountId} balances={a => L.balance(a)} />
      </div>
      <FieldGroup><Field label="Sana"><DateInput value={date} onChange={setDate} /></Field></FieldGroup>
      <ErrorBox error={error} />
    </Sheet>
  );
}

// ---------- Ma'lumot oynalari ----------

/** Safe to Spend qanday hisoblangani — sizning raqamlaringiz bilan. */
function SafeToSpendInfo() {
  const L = useLedger();
  const safe = L.safeToSpend(today());
  return (
    <Sheet title="Safe to Spend">
      <div className="rounded-3xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 p-5 text-white shadow-card">
        <p className="text-sm font-semibold opacity-90">Hozir bemalol ishlatish mumkin</p>
        <p className="tabular text-4xl font-extrabold">{money(safe.value)}</p>
      </div>
      <FieldGroup title="Hisob-kitob">
        <Row icon="💰" title="Total Money" subtitle="Barcha hisoblardagi pul" right={<span className="tabular font-bold">{plain(safe.total)}</span>} />
        <Row icon="🛒" title="− Rejali xaridlar" subtitle={`${L.plannedOpen.length} ta reja`} right={<span className="tabular font-bold text-rose-600">−{plain(safe.planned)}</span>} />
        <Row icon="📌" title="− Majburiy to‘lovlar" subtitle="Shu oy hali to‘lanmagan" right={<span className="tabular font-bold text-rose-600">−{plain(safe.required)}</span>} />
        <Row icon="🟢" title={<b>= Safe to Spend</b>} right={<span className="tabular text-lg font-extrabold">{plain(safe.value)}</span>} />
      </FieldGroup>
      {safe.requiredItems.length > 0 && (
        <FieldGroup title="Majburiy to‘lovlar">
          {safe.requiredItems.map(r => (
            <Row key={`${r.kind}-${r.id}`} icon={r.kind === 'debt' ? '💳' : '📌'} title={r.name} subtitle={`${dayTitle(r.date)} · ${relativeDay(r.date)}`}
              right={<span className="tabular font-semibold">{plain(r.amount)}</span>} chevron
              onClick={() => openSheet(r.kind === 'debt' ? { type: 'debtPayment', debtId: r.id, amount: r.amount } : { type: 'payBill', id: r.id })} />
          ))}
        </FieldGroup>
      )}
      {L.plannedOpen.length > 0 && (
        <FieldGroup title="Rejali xaridlar">
          {L.plannedOpen.map(p => <Row key={p.id} icon="🛒" title={p.name} right={<span className="tabular font-semibold">{plain(p.amount)}</span>} chevron onClick={() => openSheet({ type: 'planned', id: p.id })} />)}
        </FieldGroup>
      )}
      <Hint>Kelajakda tushadigan pul (Coming Soon) bu hisobga qo‘shilmaydi — faqat hozir qo‘lingizdagi pul.</Hint>
    </Sheet>
  );
}

function CategoryTxSheet({ categoryId, month }: { categoryId: ID; month: string }) {
  const L = useLedger();
  const c = L.category(categoryId);
  const list = L.txInMonth(month).filter(t => (categoryId === 'none' ? !t.categoryId : t.categoryId === categoryId) && L.kindOf(t) === 'regular')
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Sheet title={c ? `${c.icon} ${c.name}` : 'Kategoriyasiz'}>
      <div className="rounded-3xl bg-white p-4 text-center shadow-card dark:bg-zinc-900">
        <p className="text-sm text-slate-500">{monthTitle(month)}</p>
        <p className="tabular text-3xl font-extrabold">{money(sum(list, t => t.amount))}</p>
      </div>
      <FieldGroup>
        {list.map(t => (
          <Row key={t.id} title={t.note || dayTitle(t.date)} subtitle={`${dayTitle(t.date)} · ${L.account(t.accountId)?.name ?? ''}`}
            right={<span className="tabular font-semibold text-rose-600">−{plain(t.amount)}</span>} onClick={() => openSheet({ type: 'expense', id: t.id })} />
        ))}
      </FieldGroup>
    </Sheet>
  );
}

// ---------- Host ----------

export function SheetHost() {
  const stack = useSheets();
  const spec = stack[stack.length - 1];
  if (!spec) return null;
  // Oyna ichidagi komponent spec o'zgarganda qayta yaratilishi uchun key
  const key = `${stack.length}-${spec.type}-${'id' in spec ? spec.id : ''}`;
  switch (spec.type) {
    case 'quick': return <QuickAdd key={key} />;
    case 'expense': return <ExpenseForm key={key} id={spec.id} categoryId={spec.categoryId} />;
    case 'income': return <IncomeForm key={key} id={spec.id} />;
    case 'transfer': return <TransferForm key={key} id={spec.id} />;
    case 'debtPayment': return <DebtPaymentForm key={key} debtId={spec.debtId} amount={spec.amount} />;
    case 'account': return <AccountForm key={key} id={spec.id} />;
    case 'category': return <CategoryForm key={key} id={spec.id} incomeType={spec.incomeType} />;
    case 'limit': return <LimitForm key={key} categoryId={spec.categoryId} month={spec.month} />;
    case 'debt': return <DebtForm key={key} id={spec.id} />;
    case 'planned': return <PlannedForm key={key} id={spec.id} />;
    case 'purchase': return <PurchaseForm key={key} id={spec.id} />;
    case 'schedule': return <ScheduleForm key={key} id={spec.id} />;
    case 'expected': return <ExpectedForm key={key} id={spec.id} />;
    case 'receive': return <ReceiveForm key={key} id={spec.id} />;
    case 'bill': return <BillForm key={key} id={spec.id} />;
    case 'payBill': return <PayBillForm key={key} id={spec.id} />;
    case 'safeToSpend': return <SafeToSpendInfo key={key} />;
    case 'categoryTx': return <CategoryTxSheet key={key} categoryId={spec.categoryId} month={spec.month} />;
    case 'plan': return <PlanSheet key={key} />;
    case 'distribute': return <DistributeSheet key={key} />;
  }
}

