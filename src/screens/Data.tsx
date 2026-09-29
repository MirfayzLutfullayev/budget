import { useEffect, useRef, useState } from 'react';
import { commit, getState, replaceState, takeSnapshot, useAppState, useLedger } from '../store/store';
import { showToast } from '../store/ui';
import { Screen, Card, CardTitle, List, Row, Button, Segmented, Pill } from '../ui/kit';
import { FieldGroup, Field, DateInput, Select, Hint } from '../ui/form';
import { addMonths, currentMonth, fullDate, monthTitle, today } from '../lib/format';
import { backupBlob, backupFileName, buildReport, monthPeriod, reportFileName, reportPDF, reportXLSX, yearPeriod, type Period } from '../lib/reports';
import { buildICS } from '../lib/ics';
import { shareOrDownload } from '../lib/share';
import { listSnapshots, persistenceStatus, requestPersistence, snapshotToState, getSnapshot, type Snapshot } from '../store/persist';
import { emptyState } from '../domain/defaults';
import { isV1 } from '../domain/migrate';

// ---------- Hisobotlar ----------

export function Reports() {
  const s = useAppState();
  const [kind, setKind] = useState<'month' | 'year' | 'range'>('month');
  const [month, setMonth] = useState(currentMonth());
  const [year, setYear] = useState(Number(today().slice(0, 4)));
  const [from, setFrom] = useState(`${currentMonth()}-01`);
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState('');

  const months = Array.from({ length: 24 }, (_, i) => addMonths(currentMonth(), -i));
  const years = [...new Set([year, ...s.transactions.map(t => Number(t.date.slice(0, 4)))])].sort((a, b) => b - a);

  const period = (): Period => kind === 'month' ? monthPeriod(month) : kind === 'year' ? yearPeriod(year)
    : { from: from <= to ? from : to, to: from <= to ? to : from, label: `${fullDate(from)} – ${fullDate(to)}` };

  const make = async (fmt: 'pdf' | 'xlsx') => {
    setBusy(fmt);
    try {
      const r = buildReport(getState(), period());
      const blob = fmt === 'pdf' ? await reportPDF(r) : await reportXLSX(r);
      const res = await shareOrDownload(blob, reportFileName(r, fmt));
      if (res !== 'cancelled') showToast(`${fmt.toUpperCase()} hisobot tayyor ✓`);
    } catch (e) {
      showToast(`⚠️ Hisobot tuzilmadi: ${(e as Error).message}`, 'danger', 6000);
    } finally {
      setBusy('');
    }
  };

  return (
    <Screen title="Hisobotlar" subtitle="PDF yoki Excel faylni yuklab oling">
      <Segmented value={kind} onChange={setKind} options={[['month', 'Oy'], ['year', 'Yil'], ['range', 'Davr']]} />
      <FieldGroup>
        {kind === 'month' && <Field label="Oy"><Select value={month} onChange={setMonth} options={months.map(m => [m, monthTitle(m)] as [string, string])} /></Field>}
        {kind === 'year' && <Field label="Yil"><Select value={year} onChange={setYear} options={years.map(y => [y, String(y)] as [number, string])} /></Field>}
        {kind === 'range' && <>
          <Field label="Dan"><DateInput value={from} onChange={setFrom} /></Field>
          <Field label="Gacha"><DateInput value={to} onChange={setTo} /></Field>
        </>}
      </FieldGroup>
      <div className="grid grid-cols-2 gap-3">
        <Button onClick={() => make('pdf')} disabled={!!busy} className="min-h-[88px] flex-col rounded-3xl text-[17px]">
          <span className="text-2xl">📄</span>{busy === 'pdf' ? 'Tayyorlanmoqda…' : 'PDF'}
        </Button>
        <Button onClick={() => make('xlsx')} disabled={!!busy} tone="success" className="min-h-[88px] flex-col rounded-3xl text-[17px]">
          <span className="text-2xl">📊</span>{busy === 'xlsx' ? 'Tayyorlanmoqda…' : 'Excel'}
        </Button>
      </div>
      <Hint>Hisobotda: xulosa (kirim, chiqim, qarz to‘lovi, tejash), budjet va haqiqat, kategoriyalar, hisoblar, qarzlar va barcha tranzaksiyalar. Fayl «Ulashish» oynasi orqali beriladi — «Fayllarga saqlash», Telegram yoki pochta.</Hint>
    </Screen>
  );
}

// ---------- Ma'lumotlar va zaxira ----------

const REASON: Record<Snapshot['reason'], string> = {
  daily: 'Kunlik avtomatik', manual: 'Qo‘lda', 'before-import': 'Tiklashdan oldin', 'before-restore': 'Tiklashdan oldin',
  'before-reset': 'O‘chirishdan oldin', 'v1-archive': '1-versiya arxivi',
};

export function DataPage() {
  const s = useAppState();
  const L = useLedger();
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [status, setStatus] = useState<{ persisted: boolean | null; usage?: number }>({ persisted: null });
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    setSnaps(await listSnapshots());
    setStatus(await persistenceStatus());
  };
  useEffect(() => { void refresh(); }, [s.updatedAt]);

  const backup = async () => {
    const res = await shareOrDownload(backupBlob(getState()), backupFileName());
    if (res === 'cancelled') return;
    commit(d => { d.settings.lastBackupAt = today(); });
    showToast('Zaxira fayl tayyor ✓ Uni iCloud Drive’ga saqlang.');
  };

  const restoreFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const valid = isV1(data) || (data && Array.isArray(data.transactions) && Array.isArray(data.accounts));
      if (!valid) throw new Error('Bu fayl Budget zaxirasi emas.');
      const next = snapshotToState(data);
      const n = next.transactions.length;
      if (!confirm(`Zaxiradan tiklansinmi?\n\n${n} ta tranzaksiya, ${next.accounts.length} ta hisob.\nHozirgi ma’lumotlar almashtiriladi (oldin avtomatik nusxa olinadi).`)) return;
      next.settings.onboarded = true;
      await replaceState(next, 'before-import');
      showToast('Zaxiradan tiklandi ✓');
    } catch (e) {
      showToast(`⚠️ ${(e as Error).message || 'Faylni o‘qib bo‘lmadi'}`, 'danger', 6000);
    }
  };

  const restoreSnapshot = async (snap: Snapshot) => {
    const full = await getSnapshot(snap.id);
    if (!full) return;
    const next = snapshotToState(full.data);
    if (!confirm(`${new Date(snap.createdAt).toLocaleString()} holatiga qaytarilsinmi?\n${next.transactions.length} ta tranzaksiya.\nHozirgi holatdan ham nusxa olinadi.`)) return;
    next.settings.onboarded = true;
    await replaceState(next, 'before-restore');
    showToast('Nusxadan tiklandi ✓');
  };

  const calendar = async () => {
    const { text, count } = buildICS(getState());
    const res = await shareOrDownload(new Blob([text], { type: 'text/calendar' }), 'budget-eslatmalar.ics');
    if (res !== 'cancelled') showToast(`${count} ta eslatma tayyor. Faylni oching → «Hammasini qo‘shish».`, 'success', 6000);
  };

  const resetAll = async () => {
    if (!confirm('BARCHA ma’lumotlar o‘chirilsinmi?\nOldin avtomatik nusxa olinadi — keyin shu sahifadan qaytarish mumkin.')) return;
    if (!confirm('Rostdan ham? Zaxira fayl olganmisiz?')) return;
    await replaceState(emptyState(), 'before-reset');
    showToast('Ma’lumotlar o‘chirildi. Nusxa saqlandi.', 'info', 5000);
  };

  const backupAge = s.settings.lastBackupAt ? Math.round((Date.parse(today()) - Date.parse(s.settings.lastBackupAt)) / 86400000) : null;

  return (
    <Screen title="Ma’lumotlar" subtitle="Yo‘qotmaslik uchun himoya">
      <Card className={backupAge === null || backupAge >= s.settings.backupEveryDays ? 'ring-2 ring-amber-400' : ''}>
        <CardTitle right={backupAge === null ? <Pill tone="amber">olinmagan</Pill> : <Pill tone={backupAge >= s.settings.backupEveryDays ? 'amber' : 'green'}>{backupAge === 0 ? 'bugun' : `${backupAge} kun oldin`}</Pill>}>💾 Zaxira fayl</CardTitle>
        <p className="text-[14px] text-slate-600 dark:text-slate-300">
          Eng ishonchli himoya. Faylni <b>iCloud Drive</b>’ga saqlang — telefon almashsa yoki ilova o‘chsa ham ma’lumot qoladi.
        </p>
        <Button className="mt-3 w-full" onClick={backup}>Zaxira nusxa olish</Button>
        <Button tone="soft" className="mt-2 w-full" onClick={() => fileRef.current?.click()}>Fayldan tiklash</Button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void restoreFile(f); e.target.value = ''; }} />
      </Card>

      <List title="Himoya holati">
        <Row icon="🗄️" title="Ikki joyda saqlash" subtitle="IndexedDB + localStorage — biri buzilsa ikkinchisidan olinadi" right={<Pill tone="green">yoqilgan</Pill>} />
        <Row icon="📌" title="Doimiy saqlash" subtitle="Tizim joy tozalaganda ma’lumotni o‘chirmaslik"
          right={status.persisted ? <Pill tone="green">yoqilgan</Pill> : <button className="text-[14px] font-semibold text-indigo-600" onClick={async () => { await requestPersistence(); void refresh(); }}>So‘rash</button>} />
        <Row icon="🕒" title="Avtomatik nusxalar" subtitle="Har kuni + har bir xavfli amaldan oldin (14 kun)" right={<Pill tone="green">{snaps.length} ta</Pill>} />
        <Row icon="↩️" title="O‘chirishni bekor qilish" subtitle="O‘chirgandan keyin 6 soniya ichida «Bekor qilish»" right={<Pill tone="green">bor</Pill>} />
      </List>

      {snaps.length > 0 && (
        <List title="Avtomatik nusxalar" footer="Nusxani bosing — shu holatga qaytadi (hozirgi holat ham saqlanib qoladi).">
          {snaps.map(x => (
            <Row key={x.id} icon={x.reason === 'daily' ? '🗓️' : x.reason === 'v1-archive' ? '📦' : '🛟'}
              title={new Date(x.createdAt).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              subtitle={`${REASON[x.reason]} · ${x.transactions} ta yozuv`} chevron onClick={() => void restoreSnapshot(x)} />
          ))}
        </List>
      )}

      <Card>
        <CardTitle>📅 Kalendar eslatmalari</CardTitle>
        <p className="text-[14px] text-slate-600 dark:text-slate-300">
          To‘lov kunlari, maosh sanalari, rejali xaridlar va zaxira eslatmasini iPhone Kalendariga qo‘shadi. Ilova yopiq bo‘lsa ham telefon eslatadi.
        </p>
        <p className="mt-1 text-[13px] text-slate-500">
          {s.bills.filter(b => b.isActive).length} ta to‘lov, {L.activeDebts.filter(d => d.dueDay).length} ta qarz sanasi, {s.incomeSchedules.filter(i => i.isActive).length} ta maosh. Ma’lumot o‘zgarsa, qayta qo‘shing.
        </p>
        <Button tone="soft" className="mt-3 w-full" onClick={calendar}>Kalendarga qo‘shish (.ics)</Button>
      </Card>

      <Card>
        <CardTitle>⚠️ Muhim</CardTitle>
        <ul className="list-disc space-y-1 pl-5 text-[14px] text-slate-600 dark:text-slate-300">
          <li>Doim <b>ekrandagi ikonka</b>dan oching — Safari va ekrandagi ilova ma’lumotlari alohida saqlanadi.</li>
          <li>Ilovani ekrandan o‘chirsangiz yoki Safari «Veb-sayt ma’lumotlari»ni tozalasangiz — ma’lumot o‘chadi. Shuning uchun zaxira fayl muhim.</li>
          <li>Yangi telefonda: ilovani oching → «Fayldan tiklash».</li>
        </ul>
      </Card>

      <List>
        <Row icon="🗑️" title={<span className="text-rose-600">Barcha ma’lumotlarni o‘chirish</span>} subtitle="Oldin avtomatik nusxa olinadi" onClick={() => void resetAll()} />
        <Row icon="🛟" title="Hozir qo‘lda nusxa olish" onClick={async () => { await takeSnapshot('manual'); void refresh(); showToast('Nusxa olindi ✓'); }} />
      </List>
      <p className="text-center text-[12px] text-slate-400">{status.usage ? `Band: ${(status.usage / 1024).toFixed(0)} KB · ` : ''}{s.transactions.length} tranzaksiya</p>
    </Screen>
  );
}

