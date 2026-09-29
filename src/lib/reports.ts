// Hisobotlar: PDF va Excel (xlsx). Kutubxonalar faqat kerak bo'lganda yuklanadi.

import type { State } from '../domain/types';
import { Ledger } from '../domain/engine';
import {
  addMonths, currencySymbol, daysInMonth, fullDate, monthDate, monthOf, monthTitle, plain, sum, today,
} from './format';

export interface Period { from: string; to: string; label: string }

export function monthPeriod(key: string): Period {
  return { from: `${key}-01`, to: monthDate(key, daysInMonth(key)), label: monthTitle(key) };
}

export function yearPeriod(year: number): Period {
  return { from: `${year}-01-01`, to: `${year}-12-31`, label: `${year}-yil` };
}

export interface ReportData {
  period: Period;
  isSingleMonth: boolean;
  generated: string;
  currency: string;
  totals: { income: number; expenses: number; debtPaid: number; savings: number; net: number };
  totalMoney: number;
  accounts: { name: string; balance: number }[];
  debts: { name: string; start: number; paid: number; remaining: number; rate: number }[];
  budget: { rows: { name: string; limit: number; actual: number; diff: number }[]; limit: number; actual: number; saved: number; overspent: number } | null;
  categories: { name: string; amount: number; pct: number }[];
  months: { label: string; income: number; expenses: number; debtPaid: number }[];
  transactions: { date: string; type: string; category: string; account: string; amount: number; note: string }[];
  transfers: { date: string; from: string; to: string; amount: number; note: string }[];
}

export function buildReport(s: State, period: Period): ReportData {
  const L = new Ledger(s);
  const txs = L.txInRange(period.from, period.to).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const t = L.totals(txs);
  const startMonth = monthOf(period.from);
  const endMonth = monthOf(period.to);
  const isSingleMonth = startMonth === endMonth && period.from.endsWith('-01') && period.to === monthDate(endMonth, daysInMonth(endMonth));

  let budget: ReportData['budget'] = null;
  if (isSingleMonth) {
    const b = L.budgetSummary(startMonth);
    budget = {
      rows: b.rows.map(r => ({ name: r.category.name, limit: r.limit, actual: r.actual, diff: r.limit - r.actual })),
      limit: b.limit, actual: b.actual, saved: b.saved, overspent: b.overspent,
    };
  }

  const months: ReportData['months'] = [];
  for (let m = startMonth; m <= endMonth; m = addMonths(m, 1)) {
    const mt = L.totals(txs.filter(x => monthOf(x.date) === m));
    months.push({ label: monthTitle(m), income: mt.income, expenses: mt.expenses, debtPaid: mt.debtPaid });
    if (months.length > 36) break;
  }

  const typeName = { income: 'Kirim', regular: 'Chiqim', debt: 'Qarz to‘lovi', savings: 'Jamg‘arma' } as const;

  return {
    period,
    isSingleMonth,
    generated: fullDate(today()),
    currency: currencySymbol(),
    totals: { ...t, net: t.income - t.expenses - t.debtPaid - t.savings },
    totalMoney: L.totalMoney,
    accounts: L.activeAccounts.map(a => ({ name: a.name, balance: L.balance(a) })),
    debts: s.debts.map(d => ({ name: d.name, start: d.startingBalance, paid: L.debtPaid(d), remaining: L.debtRemaining(d), rate: d.interestRate })),
    budget,
    categories: L.categorySpending(txs).map(c => ({ name: c.name, amount: c.amount, pct: c.pct })),
    months,
    transactions: txs.map(x => ({
      date: x.date,
      type: typeName[L.kindOf(x)],
      category: x.debtId ? `${L.category(x.categoryId)?.name ?? 'Qarz'}: ${L.debt(x.debtId)?.name ?? ''}` : L.category(x.categoryId)?.name ?? '',
      account: L.account(x.accountId)?.name ?? '',
      amount: x.type === 'income' ? x.amount : -x.amount,
      note: x.note,
    })),
    transfers: s.transfers.filter(x => x.date >= period.from && x.date <= period.to)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(x => ({ date: x.date, from: L.account(x.fromAccountId)?.name ?? '', to: L.account(x.toAccountId)?.name ?? '', amount: x.amount, note: x.note })),
  };
}

export const reportFileName = (r: ReportData, ext: string) =>
  `budget-hisobot-${r.period.from}_${r.period.to}.${ext}`;

// ---------- PDF ----------

/** Standart PDF shriftlari faqat lotin belgilarini biladi: emoji va maxsus belgilarni almashtiramiz. */
function pdfText(s: string): string {
  return s
    .replace(/[‘’ʻʼ`]/g, '\'')
    .replace(/[“”«»]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/→/g, '->')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .trim();
}

export async function reportPDF(r: ReportData): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const at = await import('jspdf-autotable');
  const autoTable = (at.autoTable ?? at.default) as (doc: unknown, opts: Record<string, unknown>) => void;

  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 40;
  const money = (n: number) => `${plain(n)}`;
  const cur = pdfText(r.currency);
  let y = M;

  const lastY = () => ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y);
  const heading = (text: string) => {
    if (y > 740) { doc.addPage(); y = M; }
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(30, 41, 59);
    doc.text(pdfText(text), M, y); y += 8;
  };
  const table = (head: string[], body: (string | number)[][], opts: Record<string, unknown> = {}) => {
    autoTable(doc, {
      startY: y, margin: { left: M, right: M },
      head: [head.map(pdfText)],
      body: body.map(row => row.map(c => (typeof c === 'number' ? money(c) : pdfText(c)))),
      styles: { fontSize: 9, cellPadding: 4, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      alternateRowStyles: { fillColor: [245, 247, 252] },
      ...opts,
    });
    y = lastY() + 22;
  };

  // Sarlavha
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, W, 78, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(20);
  doc.text('Budget hisoboti', M, 36);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(pdfText(`${r.period.label}  (${fullDate(r.period.from)} - ${fullDate(r.period.to)})`), M, 56);
  doc.text(pdfText(`Tuzilgan: ${r.generated}   Valyuta: ${cur}`), W - M, 56, { align: 'right' });
  y = 104;

  heading('Xulosa');
  table(['Ko\'rsatkich', `Summa (${cur})`], [
    ['Kirim', r.totals.income],
    ['Chiqim (xarajatlar)', r.totals.expenses],
    ['Qarz to\'lovlari', r.totals.debtPaid],
    ['Jamg\'arma', r.totals.savings],
    ['Sof natija (kirim - hammasi)', r.totals.net],
    ['Hozirgi jami pul (Total Money)', r.totalMoney],
  ], { columnStyles: { 1: { halign: 'right' } } });

  if (r.budget) {
    const b = r.budget;
    heading(`Budget va haqiqat - ${b.overspent > 0 ? `oshib ketdi: ${plain(b.overspent)}` : `tejaldi: ${plain(b.saved)}`}`);
    table(['Kategoriya', 'Limit', 'Haqiqiy', 'Farq'], [
      ...b.rows.map(x => [x.name, x.limit, x.actual, x.diff] as (string | number)[]),
      ['JAMI', b.limit, b.actual, b.limit - b.actual],
    ], { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  }

  if (!r.isSingleMonth && r.months.length > 1) {
    heading('Oylar bo\'yicha');
    table(['Oy', 'Kirim', 'Chiqim', 'Qarz to\'lovi'], r.months.map(m => [m.label, m.income, m.expenses, m.debtPaid]),
      { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } } });
  }

  if (r.categories.length) {
    heading('Xarajatlar kategoriyalar bo\'yicha');
    table(['Kategoriya', 'Summa', 'Ulush'], r.categories.map(c => [c.name, c.amount, `${Math.round(c.pct * 100)}%`]),
      { columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } });
  }

  heading('Hisoblar');
  table(['Hisob', 'Balans'], [...r.accounts.map(a => [a.name, a.balance] as (string | number)[]), ['JAMI', r.totalMoney]],
    { columnStyles: { 1: { halign: 'right' } } });

  if (r.debts.length) {
    heading('Qarzlar');
    table(['Qarz', 'Foiz', 'Boshlang\'ich', 'To\'langan', 'Qoldiq'],
      [...r.debts.map(d => [d.name, d.rate ? `${d.rate}%` : '-', d.start, d.paid, d.remaining] as (string | number)[]),
        ['JAMI', '', sum(r.debts, d => d.start), sum(r.debts, d => d.paid), sum(r.debts, d => d.remaining)]],
      { columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } } });
  }

  heading(`Tranzaksiyalar (${r.transactions.length})`);
  table(['Sana', 'Turi', 'Kategoriya', 'Hisob', 'Summa', 'Izoh'],
    r.transactions.map(x => [fullDate(x.date), x.type, x.category, x.account, x.amount, x.note]),
    { columnStyles: { 4: { halign: 'right' } }, styles: { fontSize: 8, cellPadding: 3 } });

  if (r.transfers.length) {
    heading('Hisoblararo o\'tkazmalar (xarajat emas)');
    table(['Sana', 'Qayerdan', 'Qayerga', 'Summa', 'Izoh'], r.transfers.map(x => [fullDate(x.date), x.from, x.to, x.amount, x.note]),
      { columnStyles: { 3: { halign: 'right' } }, styles: { fontSize: 8, cellPadding: 3 } });
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(8); doc.setTextColor(148, 163, 184);
    doc.text(`${i} / ${pages}`, W - M, doc.internal.pageSize.getHeight() - 20, { align: 'right' });
    doc.text('Budget Manager', M, doc.internal.pageSize.getHeight() - 20);
  }
  return doc.output('blob');
}

// ---------- Excel ----------

export async function reportXLSX(r: ReportData): Promise<Blob> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: (string | number)[][], widths: number[]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = widths.map(w => ({ wch: w }));
    XLSX.utils.book_append_sheet(wb, ws, name);
  };

  add('Xulosa', [
    ['Budget hisoboti', r.period.label],
    ['Davr', `${fullDate(r.period.from)} - ${fullDate(r.period.to)}`],
    ['Tuzilgan', r.generated],
    ['Valyuta', r.currency],
    [],
    ['Kirim', r.totals.income],
    ['Chiqim (xarajatlar)', r.totals.expenses],
    ['Qarz to‘lovlari', r.totals.debtPaid],
    ['Jamg‘arma', r.totals.savings],
    ['Sof natija', r.totals.net],
    ['Hozirgi jami pul', r.totalMoney],
    ...(r.budget ? [[], ['Budjet limiti', r.budget.limit], ['Haqiqiy xarajat', r.budget.actual],
      [r.budget.overspent > 0 ? 'Oshib ketdi' : 'Tejaldi', r.budget.overspent > 0 ? r.budget.overspent : r.budget.saved]] : []),
  ], [28, 22]);

  add('Tranzaksiyalar', [
    ['Sana', 'Turi', 'Kategoriya', 'Hisob', 'Summa', 'Izoh'],
    ...r.transactions.map(x => [x.date, x.type, x.category, x.account, x.amount, x.note]),
  ], [12, 14, 22, 14, 14, 30]);

  if (r.budget) {
    add('Budjet', [
      ['Kategoriya', 'Limit', 'Haqiqiy', 'Farq'],
      ...r.budget.rows.map(x => [x.name, x.limit, x.actual, x.diff]),
      ['JAMI', r.budget.limit, r.budget.actual, r.budget.limit - r.budget.actual],
    ], [22, 14, 14, 14]);
  }

  add('Kategoriyalar', [['Kategoriya', 'Summa', 'Ulush %'], ...r.categories.map(c => [c.name, c.amount, Math.round(c.pct * 1000) / 10])], [22, 14, 10]);
  if (r.months.length > 1) {
    add('Oylar', [['Oy', 'Kirim', 'Chiqim', 'Qarz to‘lovi'], ...r.months.map(m => [m.label, m.income, m.expenses, m.debtPaid])], [18, 14, 14, 14]);
  }
  add('Hisoblar', [['Hisob', 'Balans'], ...r.accounts.map(a => [a.name, a.balance]), ['JAMI', r.totalMoney]], [18, 14]);
  if (r.debts.length) {
    add('Qarzlar', [['Qarz', 'Foiz %', 'Boshlang‘ich', 'To‘langan', 'Qoldiq'], ...r.debts.map(d => [d.name, d.rate, d.start, d.paid, d.remaining])], [16, 8, 14, 14, 14]);
  }
  if (r.transfers.length) {
    add('O‘tkazmalar', [['Sana', 'Qayerdan', 'Qayerga', 'Summa', 'Izoh'], ...r.transfers.map(x => [x.date, x.from, x.to, x.amount, x.note])], [12, 14, 14, 14, 24]);
  }

  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ---------- Zaxira (JSON) ----------

export function backupBlob(s: State): Blob {
  return new Blob([JSON.stringify({ app: 'budget-manager', exportedAt: new Date().toISOString(), ...s }, null, 1)],
    { type: 'application/json' });
}

export const backupFileName = () => `budget-zaxira-${today()}.json`;
