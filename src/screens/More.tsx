import { useState, type ReactNode } from 'react';
import { commit, useAppState, useLedger } from '../store/store';
import { openSheet, push } from '../store/ui';
import { Screen, List, Row, Card, CardTitle, Progress, Empty, Button, IconButton, Pill, Segmented, cx } from '../ui/kit';
import { FieldGroup, Field, Select, Hint } from '../ui/form';
import { CURRENCIES, currencySymbol, currentMonth, dayTitle, fullDate, money, plain, relativeDay, setCurrency, short, today } from '../lib/format';
import { ACCOUNT_TYPE_NAMES } from '../domain/defaults';
import { buildItems, ItemList } from './Transactions';
import { runReminderAction } from './reminderActions';
import type { ID } from '../domain/types';

export function More() {
  const L = useLedger();
  const reminders = L.reminders(today());
  const s = useAppState();
  return (
    <Screen title="Ko‘proq">
      <List>
        <Row icon="🔔" title="Eslatmalar" right={reminders.length ? <Pill tone={reminders.some(r => r.level === 'danger') ? 'red' : 'amber'}>{reminders.length}</Pill> : undefined} chevron onClick={() => push({ name: 'reminders' })} />
        <Row icon="📈" title="Statistika" chevron onClick={() => push({ name: 'stats' })} />
        <Row icon="📄" title="Hisobotlarni yuklab olish" subtitle="PDF va Excel" chevron onClick={() => push({ name: 'reports' })} />
      </List>
      <List title="Pul">
        <Row icon="💰" title="Hisoblar" subtitle="Naqd va kartalar" right={<span className="tabular font-semibold">{short(L.totalMoney)}</span>} chevron onClick={() => push({ name: 'accounts' })} />
        <Row icon="💳" title="Qarzlar" right={<span className="tabular font-semibold text-orange-600">{short(L.totalDebt)}</span>} chevron onClick={() => push({ name: 'debts' })} />
        <Row icon="📥" title="Kutilgan kirim" subtitle="Maosh jadvali va Coming Soon" chevron onClick={() => push({ name: 'income' })} />
        <Row icon="📌" title="Majburiy to‘lovlar" subtitle="Ijara, kurs, telefon..." chevron onClick={() => push({ name: 'bills' })} />
        <Row icon="🛒" title="Rejali xaridlar" right={L.plannedOpen.length ? <span className="tabular font-semibold">{short(L.plannedReserved)}</span> : undefined} chevron onClick={() => push({ name: 'planned' })} />
      </List>
      <List title="Sozlash">
        <Row icon="🏷️" title="Kategoriyalar va limitlar" chevron onClick={() => push({ name: 'categories' })} />
        <Row icon="📐" title="Qanday hisoblanadi" subtitle="Qoidalar — sizning raqamlaringiz bilan" chevron onClick={() => push({ name: 'rules' })} />
        <Row icon="🛡️" title="Ma’lumotlar va zaxira" subtitle={s.settings.lastBackupAt ? `Oxirgi zaxira: ${fullDate(s.settings.lastBackupAt)}` : 'Zaxira hali olinmagan'} chevron onClick={() => push({ name: 'data' })} />
        <Row icon="⚙️" title="Sozlamalar" chevron onClick={() => push({ name: 'settings' })} />
      </List>
    </Screen>
  );
}

// ---------- Hisoblar ----------

export function Accounts() {
  const L = useLedger();
  const s = useAppState();
  return (
    <Screen title="Hisoblar" action={<IconButton label="Hisob qo‘shish" onClick={() => openSheet({ type: 'account' })}>＋</IconButton>}>
      <Card className="bg-gradient-to-br from-sky-500 to-blue-700 !text-white">
        <p className="text-[13px] font-bold uppercase tracking-wider text-white/80">Total Money</p>
        <p className="tabular text-[34px] font-extrabold">{money(L.totalMoney)}</p>
      </Card>
      {s.accounts.length ? (
        <List footer="Hisobni bosing — shu hisobdagi barcha harakatlar ko‘rinadi.">
          {[...s.accounts].sort((a, b) => a.sort - b.sort).map(a => (
            <Row key={a.id} icon={a.icon} title={a.name + (a.last4 ? ` •${a.last4}` : '')}
              subtitle={`${ACCOUNT_TYPE_NAMES[a.type]}${a.isActive ? '' : ' · faol emas'}`}
              right={<span className={cx('tabular font-bold', L.balance(a) < 0 && 'text-rose-600')}>{plain(L.balance(a))}</span>}
              chevron onClick={() => push({ name: 'account', id: a.id })} />
          ))}
        </List>
      ) : <Empty icon="💳" title="Hisob yo‘q" text="Naqd pul va kartalaringizni qo‘shing." action={<Button onClick={() => openSheet({ type: 'account' })}>+ Hisob qo‘shish</Button>} />}
      {L.activeAccounts.length > 1 && <Button tone="soft" className="w-full" onClick={() => openSheet({ type: 'transfer' })}>↔ Hisoblararo o‘tkazma</Button>}
    </Screen>
  );
}

export function AccountDetail({ id }: { id: ID }) {
  const L = useLedger();
  const a = L.account(id);
  if (!a) return <Screen title="Topilmadi"><Empty title="Hisob o‘chirilgan" /></Screen>;
  const items = buildItems(L, '', 'all', id);
  return (
    <Screen title={`${a.icon} ${a.name}`} action={<IconButton label="Tahrirlash" onClick={() => openSheet({ type: 'account', id })}>✎</IconButton>}>
      <Card>
        <p className="text-[13px] font-semibold text-slate-500">Balans</p>
        <p className={cx('tabular text-[34px] font-extrabold', L.balance(a) < 0 && 'text-rose-600')}>{money(L.balance(a))}</p>
        <p className="text-[13px] text-slate-500">Boshlang‘ich: {plain(a.initialBalance)}</p>
      </Card>
      {items.length ? <ItemList items={items} /> : <Empty icon="🧾" title="Hali harakat yo‘q" />}
    </Screen>
  );
}

// ---------- Qarzlar ----------

export function Debts() {
  const L = useLedger();
  const s = useAppState();
  const t = today();
  return (
    <Screen title="Qarzlar" action={<IconButton label="Qarz qo‘shish" onClick={() => openSheet({ type: 'debt' })}>＋</IconButton>}>
      <Card className="bg-gradient-to-br from-orange-500 to-rose-500 !text-white">
        <p className="text-[13px] font-bold uppercase tracking-wider text-white/85">Total Debt</p>
        <p className="tabular text-[34px] font-extrabold">{money(L.totalDebt)}</p>
        <div className="mt-2 flex justify-between text-[14px] text-white/90">
          <span>Boshida: {short(L.totalDebtStart)}</span><span>To‘landi: {short(L.totalDebtPaid)}</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white" style={{ width: `${L.totalDebtStart ? Math.min(1, L.totalDebtPaid / L.totalDebtStart) * 100 : 0}%` }} />
        </div>
      </Card>
      {s.debts.length ? s.debts.map(d => {
        const due = L.nextDue(d, t);
        return (
          <Card key={d.id} onClick={() => push({ name: 'debt', id: d.id })} className={cx(!d.isActive && 'opacity-60')}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold">{d.name}</p>
                <p className="text-[13px] text-slate-500">
                  {[d.interestRate ? `${d.interestRate}%` : '', due ? `to‘lov ${dayTitle(due)} (${relativeDay(due, t)})` : '', d.isActive ? '' : 'yopilgan'].filter(Boolean).join(' · ')}
                </p>
              </div>
              <p className="tabular text-xl font-extrabold text-orange-600">{short(L.debtRemaining(d))}</p>
            </div>
            <Progress value={L.debtProgress(d)} tone="green" className="mt-3" />
            <p className="tabular mt-1 text-[13px] text-slate-500">To‘landi {plain(L.debtPaid(d))} / {plain(d.startingBalance)}</p>
          </Card>
        );
      }) : <Empty icon="🎉" title="Qarz yo‘q" action={<Button onClick={() => openSheet({ type: 'debt' })}>+ Qarz qo‘shish</Button>} />}
      {L.activeDebts.length > 0 && <Button className="w-full" onClick={() => openSheet({ type: 'debtPayment' })}>💳 Qarz to‘lovi</Button>}
    </Screen>
  );
}

export function DebtDetail({ id }: { id: ID }) {
  const L = useLedger();
  const d = L.debt(id);
  if (!d) return <Screen title="Topilmadi"><Empty title="Qarz o‘chirilgan" /></Screen>;
  const payments = L.s.transactions.filter(t => t.debtId === id).sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Screen title={d.name} action={<IconButton label="Tahrirlash" onClick={() => openSheet({ type: 'debt', id })}>✎</IconButton>}>
      <Card>
        <p className="text-[13px] font-semibold text-slate-500">Qoldiq</p>
        <p className="tabular text-[34px] font-extrabold text-orange-600">{money(L.debtRemaining(d))}</p>
        <Progress value={L.debtProgress(d)} tone="green" className="mt-2 h-3" />
        <div className="mt-3 grid grid-cols-2 gap-y-1 text-[14px]">
          <span className="text-slate-500">Boshida</span><span className="tabular text-right font-semibold">{plain(d.startingBalance)}</span>
          <span className="text-slate-500">To‘landi</span><span className="tabular text-right font-semibold text-emerald-600">{plain(L.debtPaid(d))}</span>
          {d.interestRate > 0 && <><span className="text-slate-500">Foiz</span><span className="text-right font-semibold">{d.interestRate}%</span></>}
          {d.dueDay > 0 && <><span className="text-slate-500">To‘lov kuni</span><span className="text-right font-semibold">har oy {d.dueDay}-kuni</span></>}
          {d.minimumPayment > 0 && <><span className="text-slate-500">Minimal to‘lov</span><span className="tabular text-right font-semibold">{plain(d.minimumPayment)}</span></>}
        </div>
      </Card>
      {d.isActive && L.debtRemaining(d) > 0 && <Button className="w-full" onClick={() => openSheet({ type: 'debtPayment', debtId: id })}>💳 To‘lov qilish</Button>}
      <List title="To‘lovlar tarixi" footer={payments.length ? 'Tahrirlash yoki o‘chirish uchun bosing.' : undefined}>
        {payments.length ? payments.map(p => (
          <Row key={p.id} title={dayTitle(p.date)} subtitle={[L.account(p.accountId)?.name, p.note].filter(Boolean).join(' · ')}
            right={<span className="tabular font-bold text-emerald-600">−{plain(p.amount)}</span>} onClick={() => openSheet({ type: 'expense', id: p.id })} />
        )) : <Row title={<span className="text-slate-500">Hali to‘lov yo‘q</span>} />}
      </List>
    </Screen>
  );
}

// ---------- Rejali xaridlar ----------

export function Planned() {
  const L = useLedger();
  const [tab, setTab] = useState<'planned' | 'closed'>('planned');
  const closed = L.s.planned.filter(p => p.status !== 'planned').sort((a, b) => b.createdAt - a.createdAt);
  return (
    <Screen title="Rejali xaridlar" action={<IconButton label="Qo‘shish" onClick={() => openSheet({ type: 'planned' })}>＋</IconButton>}>
      <Card>
        <p className="text-[13px] font-semibold text-slate-500">Ajratilgan (Safe to Spend’dan ayrilgan)</p>
        <p className="tabular text-[30px] font-extrabold">{money(L.plannedReserved)}</p>
      </Card>
      <Segmented value={tab} onChange={setTab} options={[['planned', `Rejada (${L.plannedOpen.length})`], ['closed', 'Yopilgan']]} />
      {tab === 'planned' ? (L.plannedOpen.length ? (
        <List footer="Haqiqatan olishga qaror qilgan narsangizni qo‘shing. «Sotib oldim» bosilganda xarajat avtomatik yoziladi.">
          {L.plannedOpen.map(p => (
            <Row key={p.id} icon={L.category(p.categoryId)?.icon ?? '🛒'} title={p.name} subtitle={p.date ? `${dayTitle(p.date)} · ${relativeDay(p.date)}` : 'Sana belgilanmagan'}
              right={<span className="tabular font-bold">{plain(p.amount)}</span>} chevron onClick={() => openSheet({ type: 'planned', id: p.id })} />
          ))}
        </List>
      ) : <Empty icon="🛒" title="Rejali xarid yo‘q" text="Masalan: Creatine 300k, zaryadlovchi 200k, tug‘ilgan kun sovg‘asi 500k." />)
        : (closed.length ? (
          <List>
            {closed.map(p => (
              <Row key={p.id} icon={p.status === 'purchased' ? '✅' : '✖️'} title={p.name} subtitle={p.status === 'purchased' ? 'Sotib olindi' : 'Bekor qilindi'}
                right={<span className="tabular text-slate-500">{plain(p.amount)}</span>} onClick={() => openSheet({ type: 'planned', id: p.id })} />
            ))}
          </List>
        ) : <Empty icon="🗂️" title="Yopilgan reja yo‘q" />)}
    </Screen>
  );
}

// ---------- Kutilgan kirim ----------

export function IncomePlan() {
  const L = useLedger();
  const s = useAppState();
  const recent = s.expectedIncomes.filter(i => i.status !== 'expected').sort((a, b) => b.expectedDate.localeCompare(a.expectedDate)).slice(0, 12);
  return (
    <Screen title="Kutilgan kirim">
      <List title="Har oylik kirimlar" footer="Har oy shu kuni «Coming Soon»da paydo bo‘ladi.">
        {s.incomeSchedules.map(x => (
          <Row key={x.id} icon="🔁" title={x.source} subtitle={`Har oy ${x.day}-kuni → ${L.account(x.targetAccountId)?.name ?? '—'}${x.isActive ? '' : ' · faol emas'}`}
            right={<span className="tabular font-bold text-emerald-600">+{plain(x.amount)}</span>} chevron onClick={() => openSheet({ type: 'schedule', id: x.id })} />
        ))}
        <Row icon="＋" title={<span className="text-indigo-600">Oylik kirim qo‘shish</span>} onClick={() => openSheet({ type: 'schedule' })} />
      </List>
      <List title="Coming Soon" footer="Tushmaguncha Total Money’ga qo‘shilmaydi.">
        {L.expectedIncomes.map(i => (
          <Row key={i.id} icon="📥" title={i.source} subtitle={`${dayTitle(i.expectedDate)} · ${relativeDay(i.expectedDate)} → ${L.account(i.targetAccountId)?.name ?? '—'}`}
            right={<span className="tabular font-bold text-emerald-600">+{plain(i.amount)}</span>} chevron onClick={() => openSheet({ type: 'expected', id: i.id })} />
        ))}
        <Row icon="＋" title={<span className="text-indigo-600">Bir martalik kutilgan kirim</span>} onClick={() => openSheet({ type: 'expected' })} />
      </List>
      {recent.length > 0 && (
        <List title="Oxirgilari">
          {recent.map(i => (
            <Row key={i.id} icon={i.status === 'received' ? '✅' : '⏭️'} title={i.source}
              subtitle={i.status === 'received' ? `Tushdi ${i.receivedDate ? dayTitle(i.receivedDate) : ''}` : 'Tushmadi'}
              right={<span className="tabular text-slate-500">{plain(i.amount)}</span>} />
          ))}
        </List>
      )}
    </Screen>
  );
}

// ---------- Majburiy to'lovlar ----------

export function Bills() {
  const L = useLedger();
  const s = useAppState();
  const key = currentMonth();
  return (
    <Screen title="Majburiy to‘lovlar" action={<IconButton label="Qo‘shish" onClick={() => openSheet({ type: 'bill' })}>＋</IconButton>}>
      {s.bills.length ? (
        <List footer="To‘lanmagan to‘lovlar «Safe to Spend»dan oldindan ayriladi. To‘laganingizda «To‘landi» ni bosing.">
          {s.bills.map(b => {
            const paid = L.isBillPaid(b.id, key);
            return (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => openSheet({ type: 'bill', id: b.id })}>
                  <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-zinc-800">{L.category(b.categoryId)?.icon ?? '📌'}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{b.name}{b.isActive ? '' : ' (faol emas)'}</span>
                    <span className="tabular block text-[13px] text-slate-500">{plain(b.amount)} · har oy {b.day}-kuni</span>
                  </span>
                </button>
                {paid ? <Pill tone="green">To‘landi ✓</Pill>
                  : b.isActive && <Button tone="success" className="min-h-9 rounded-xl px-3 text-sm" onClick={() => openSheet({ type: 'payBill', id: b.id })}>To‘landi</Button>}
              </div>
            );
          })}
        </List>
      ) : <Empty icon="📌" title="Majburiy to‘lov yo‘q" text="Masalan: Ijara 600k — 1-kuni, Ingliz tili 700k, Telefon 77k." action={<Button onClick={() => openSheet({ type: 'bill' })}>+ Qo‘shish</Button>} />}
    </Screen>
  );
}

// ---------- Kategoriyalar ----------

export function Categories() {
  const s = useAppState();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const cats = s.categories.filter(c => c.type === type).sort((a, b) => a.sort - b.sort);
  const groups = [...new Set(cats.map(c => c.group))];
  return (
    <Screen title="Kategoriyalar" action={<IconButton label="Qo‘shish" onClick={() => openSheet({ type: 'category', incomeType: type === 'income' })}>＋</IconButton>}>
      <Segmented value={type} onChange={setType} options={[['expense', 'Chiqim'], ['income', 'Kirim manbalari']]} />
      {groups.map(g => (
        <List key={g} title={g}>
          {cats.filter(c => c.group === g).map(c => (
            <Row key={c.id} icon={c.icon} title={c.name + (c.isActive ? '' : ' (faol emas)')}
              subtitle={c.kind === 'debt' ? 'Qarz to‘lovlari' : c.kind === 'savings' ? 'Jamg‘arma — xarajatga kirmaydi' : undefined}
              right={type === 'expense' && c.kind === 'regular' ? <span className="tabular text-slate-500">{c.monthlyLimit ? short(c.monthlyLimit) : 'limitsiz'}</span> : undefined}
              chevron onClick={() => openSheet({ type: 'category', id: c.id })} />
          ))}
        </List>
      ))}
      <Hint>Bu yerdagi limit — standart. Aniq oy limitini Budjet sahifasida o‘zgartirasiz.</Hint>
    </Screen>
  );
}

// ---------- Eslatmalar ----------

export function Reminders() {
  const L = useLedger();
  const list = L.reminders(today());
  const tone = { danger: 'text-rose-600', warn: 'text-amber-600', info: '' };
  return (
    <Screen title="Eslatmalar" subtitle="Ilova ochilganda ko‘rinadi">
      {list.length ? (
        <List>
          {list.map(r => (
            <Row key={r.id} icon={r.icon} title={<span className={tone[r.level]}>{r.title}</span>} subtitle={r.detail} chevron={!!r.action} onClick={r.action ? () => runReminderAction(r) : undefined} />
          ))}
        </List>
      ) : <Empty icon="✅" title="Hammasi joyida" text="Hozircha eslatma yo‘q." />}
      <Card>
        <CardTitle>📅 Telefon bildirishnomalari</CardTitle>
        <p className="text-[14px] text-slate-600 dark:text-slate-300">
          Web-ilova yopiq bo‘lganda bildirishnoma yubora olmaydi. Buning o‘rniga to‘lov, maosh va zaxira sanalarini <b>iPhone Kalendariga</b> qo‘shing — Kalendar o‘zi eslatadi.
        </p>
        <Button tone="soft" className="mt-3 w-full" onClick={() => push({ name: 'data' })}>Kalendarga qo‘shish →</Button>
      </Card>
    </Screen>
  );
}

// ---------- Qoidalar ----------

export function Rules() {
  const L = useLedger();
  const t = today();
  const key = currentMonth();
  const safe = L.safeToSpend(t);
  const totals = L.monthTotals(key);
  const b = L.budgetSummary(key);
  const Rule = ({ title, formula, value, children }: { title: string; formula: string; value?: string; children?: ReactNode }) => (
    <Card>
      <p className="font-bold">{title}</p>
      <p className="mt-1 rounded-xl bg-slate-50 px-3 py-2 font-mono text-[13px] text-slate-600 dark:bg-zinc-800 dark:text-slate-300">{formula}</p>
      {value && <p className="tabular mt-2 text-[15px]">Sizda: <b>{value}</b></p>}
      {children && <div className="mt-1 text-[13px] text-slate-500">{children}</div>}
    </Card>
  );
  return (
    <Screen title="Qanday hisoblanadi" subtitle="Siz faqat kiritasiz — qolganini ilova hisoblaydi">
      <Rule title="Hisob balansi" formula="Boshlang‘ich + Kirim + Kelgan o‘tkazma − Chiqim − Qarz to‘lovi − Ketgan o‘tkazma"
        value={L.activeAccounts.map(a => `${a.name} ${short(L.balance(a))}`).join(', ') || '—'} />
      <Rule title="Total Money" formula="Barcha faol hisoblar balansi yig‘indisi" value={money(L.totalMoney)}>
        Kutilgan (hali tushmagan) kirim qo‘shilmaydi — u «Coming Soon»da alohida: {money(L.comingSoon(t).total)}.
      </Rule>
      <Rule title="Safe to Spend" formula="Total Money − Rejali xaridlar − Majburiy to‘lovlar"
        value={`${short(safe.total)} − ${short(safe.planned)} − ${short(safe.required)} = ${money(safe.value)}`} />
      <Rule title="Kirim va Chiqim (shu oy)" formula="Kirim = tushgan kirimlar; Chiqim = oddiy xarajatlar"
        value={`+${short(totals.income)} / −${short(totals.expenses)}`}>
        Qarz to‘lovi ({short(totals.debtPaid)}) va jamg‘arma ({short(totals.savings)}) chiqimga aralashtirilmaydi — alohida ko‘rsatiladi.
      </Rule>
      <Rule title="Tejaldi / Oshib ketdi" formula="Tejaldi = Budjet − Haqiqiy;  Oshdi = Haqiqiy − Budjet"
        value={b.overspent > 0 ? `oshdi ${money(b.overspent)}` : `${money(b.saved)} (${short(b.limit)} − ${short(b.actual)})`} />
      <Rule title="O‘tkazma" formula="Hisob A −X, Hisob B +X, Chiqim = 0">O‘tkazma budjetni kamaytirmaydi.</Rule>
      <Rule title="Qarz to‘lovi" formula="Hisob −X va Qarz −X">To‘lov qarz qoldig‘idan oshmasligi kerak — ilova buni tekshiradi.</Rule>
      <Rule title="Qarz qoldig‘i" formula="Boshlang‘ich qoldiq − To‘lovlar yig‘indisi" value={money(L.totalDebt)} />
    </Screen>
  );
}

// ---------- Sozlamalar ----------

export function SettingsPage() {
  const s = useAppState();
  const set = (patch: Partial<typeof s.settings>) => commit(d => { Object.assign(d.settings, patch); });
  return (
    <Screen title="Sozlamalar">
      <FieldGroup title="Umumiy">
        <Field label="Valyuta">
          <Select value={s.settings.currency} onChange={v => { setCurrency(v); set({ currency: v }); }}
            options={CURRENCIES.map(c => [c.code, `${c.code} — ${c.name}`] as [string, string])} />
        </Field>
        <Field label="Limit ogohlantirishi">
          <Select value={s.settings.alertThreshold} onChange={v => set({ alertThreshold: v })} options={[70, 80, 85, 90, 95, 100].map(v => [v, `${v}%`] as [number, string])} />
        </Field>
        <Field label="To‘lov eslatmasi">
          <Select value={s.settings.reminderDays} onChange={v => set({ reminderDays: v })} options={[0, 1, 2, 3, 5, 7].map(v => [v, v ? `${v} kun oldin` : 'o‘sha kuni'] as [number, string])} />
        </Field>
        <Field label="Zaxira eslatmasi">
          <Select value={s.settings.backupEveryDays} onChange={v => set({ backupEveryDays: v })} options={[3, 7, 14, 30].map(v => [v, `har ${v} kunda`] as [number, string])} />
        </Field>
      </FieldGroup>
      <Hint>Valyuta: {currencySymbol()}. Barcha ma’lumotlar faqat shu telefonda saqlanadi — server, login va bank ulanishi yo‘q. Karta raqami, CVV va parollar saqlanmaydi.</Hint>
      <List>
        <Row icon="🧭" title="Boshlang‘ich sozlashni qayta ochish" onClick={() => { if (confirm('Boshlang‘ich sozlash qayta ochilsinmi? Ma’lumotlar o‘chmaydi.')) set({ onboarded: false }); }} />
      </List>
      <p className="text-center text-[12px] text-slate-400">Budget Manager 2.0</p>
    </Screen>
  );
}

