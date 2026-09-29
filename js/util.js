// Umumiy yordamchi funksiyalar: pul formatlash, sanalar, id, HTML escape.
// Sanalar 'YYYY-MM-DD', oylar 'YYYY-MM' satr ko'rinishida saqlanadi — vaqt zonasi muammosi bo'lmaydi.

export const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
export const MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn',
  'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

export const CURRENCIES = [
  { code: 'UZS', name: 'O‘zbek so‘mi', symbol: 'so‘m' },
  { code: 'USD', name: 'AQSh dollari', symbol: '$' },
  { code: 'EUR', name: 'Yevro', symbol: '€' },
  { code: 'RUB', name: 'Rossiya rubli', symbol: '₽' },
];

let currencyCode = 'UZS';
export function setCurrency(code) { currencyCode = code; }
export function symbol() {
  return (CURRENCIES.find(c => c.code === currencyCode) || CURRENCIES[0]).symbol;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ESC[c]);
}

// ---------- Pul ----------

/** 7400000 → "7 400 000" */
export function plain(n) {
  const v = Math.round(n || 0);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (v < 0 ? '-' : '') + s;
}

/** 7400000 → "7 400 000 so‘m" */
export function money(n) { return `${plain(n)} ${symbol()}`; }

export function signed(n) { return (n > 0 ? '+' : '') + money(n); }

/** 12200000 → "12.2m", 850000 → "850k" */
export function short(n) {
  const v = Math.round(n || 0);
  const a = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  const trim = s => (s.endsWith('.0') ? s.slice(0, -2) : s);
  if (a >= 1_000_000) return sign + trim((a / 1_000_000).toFixed(1)) + 'm';
  if (a >= 10_000) return sign + Math.round(a / 1000) + 'k';
  if (a >= 1_000) return sign + trim((a / 1000).toFixed(1)) + 'k';
  return sign + a;
}

/** "7 400 000" → 7400000 */
export function parseAmount(text) {
  const digits = String(text ?? '').replace(/\D/g, '').slice(0, 15);
  return digits ? parseInt(digits, 10) : 0;
}

export function percentOf(base, percent) {
  return Math.round((base * (percent || 0)) / 100);
}

export function sum(list, fn) {
  let total = 0;
  for (const item of list) total += fn(item) || 0;
  return total;
}

// ---------- Sanalar ----------

const pad = n => String(n).padStart(2, '0');

export function ymd(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function today() { return ymd(new Date()); }
export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function monthOf(dateStr) { return dateStr.slice(0, 7); }
export function currentMonth() { return today().slice(0, 7); }

export function addMonths(key, n) {
  const [y, m] = key.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** b - a, oylarda */
export function monthsBetween(a, b) {
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb * 12 + mb) - (ya * 12 + ma);
}

export function daysInMonth(key) {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Oyning berilgan kuni; 31-kun yo'q oylarda oxirgi kunga tushadi. */
export function monthDate(key, day) {
  const d = Math.min(Math.max(day, 1), daysInMonth(key));
  return `${key}-${pad(d)}`;
}

export function addDays(dateStr, n) {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

/** b - a, kunlarda */
export function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86_400_000);
}

export function monthTitle(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function monthShort(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS_SHORT[m - 1]} ${String(y).slice(2)}`;
}

/** "2026-09-29" → "29 sen" */
export function dayLabel(dateStr) {
  const [, m, d] = dateStr.split('-').map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}

/** "2026-09-29" → "29.09.2026" */
export function fullDate(dateStr) {
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}
