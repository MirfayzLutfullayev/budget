// Pul va sana yordamchilari.
// Pul butun son (so'm) sifatida saqlanadi. Sanalar 'YYYY-MM-DD', oylar 'YYYY-MM' satr.

export const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

export const CURRENCIES = [
  { code: 'UZS', name: 'O‘zbek so‘mi', symbol: 'UZS' },
  { code: 'USD', name: 'AQSh dollari', symbol: '$' },
  { code: 'EUR', name: 'Yevro', symbol: '€' },
  { code: 'RUB', name: 'Rossiya rubli', symbol: '₽' },
] as const;

let currencyCode = 'UZS';
export const setCurrency = (code: string) => { currencyCode = code; };
export const currencySymbol = () => CURRENCIES.find(c => c.code === currencyCode)?.symbol ?? currencyCode;

/** 7400000 → "7 400 000" */
export function plain(n: number): string {
  const v = Math.round(n || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '-' : '') + s;
}

/** 7400000 → "7 400 000 UZS" */
export const money = (n: number) => `${plain(n)} ${currencySymbol()}`;

/** +/- belgisi bilan: "+4 800 000" */
export const signedPlain = (n: number) => (n > 0 ? '+' : '') + plain(n);

/** 12200000 → "12.2M", 850000 → "850k" */
export function short(n: number): string {
  const v = Math.round(n || 0);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const trim = (s: string) => (s.endsWith('.0') ? s.slice(0, -2) : s);
  if (a >= 1_000_000) return sign + trim((a / 1_000_000).toFixed(1)) + 'M';
  if (a >= 10_000) return sign + Math.round(a / 1000) + 'k';
  if (a >= 1_000) return sign + trim((a / 1000).toFixed(1)) + 'k';
  return sign + a;
}

/** "7 400 000" → 7400000 */
export function parseAmount(text: string | null | undefined): number {
  const digits = String(text ?? '').replace(/\D/g, '').slice(0, 15);
  return digits ? parseInt(digits, 10) : 0;
}

export const percentOf = (base: number, percent: number) => Math.round((base * (percent || 0)) / 100);

export const sum =<T,>(list: readonly T[], fn: (x: T) => number) => list.reduce((s, x) => s + (fn(x) || 0), 0);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------- Sanalar ----------

const pad = (n: number) => String(n).padStart(2, '0');

export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => ymd(new Date());
export const monthOf = (date: string) => date.slice(0, 7);
export const currentMonth = () => today().slice(0, 7);

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addMonths(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Oyning berilgan kuni; 31-kun yo'q oylarda oxirgi kunga tushadi. */
export function monthDate(key: string, day: number): string {
  return `${key}-${pad(Math.min(Math.max(day, 1), daysInMonth(key)))}`;
}

export function addDays(date: string, n: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** b - a, kunlarda */
export const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);

export function monthTitle(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

/** "2026-09-29" → "29 sentabr" */
export function dayTitle(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS[m - 1].toLowerCase()}`;
}

/** "2026-09-29" → "29 sen" */
export function dayShort(date: string): string {
  const [, m, d] = date.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "2026-09-29" → "29.09.2026" */
export function fullDate(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}.${m}.${y}`;
}

export function relativeDay(date: string, from = today()): string {
  const d = daysBetween(from, date);
  if (d === 0) return 'bugun';
  if (d === 1) return 'ertaga';
  if (d === -1) return 'kecha';
  if (d > 1) return `${d} kundan keyin`;
  return `${-d} kun oldin`;
}
