// iPhone Kalendariga eslatmalar (.ics). Kalendar ilova yopiq bo'lsa ham bildirishnoma beradi.

import type { State } from '../domain/types';
import { Ledger } from '../domain/engine';
import { addDays, monthDate, monthOf, plain, today } from './format';

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const dt = (date: string, time = '100000') => `${date.replace(/-/g, '')}T${time}`;
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

interface Ev { uid: string; date: string; time?: string; title: string; description: string; rrule?: string; alarmsDays: number[] }

function event(e: Ev): string[] {
  const lines = [
    'BEGIN:VEVENT',
    `UID:${e.uid}@budget-manager`,
    `DTSTAMP:${stamp()}`,
    `DTSTART:${dt(e.date, e.time)}`,
    `DTEND:${dt(e.date, e.time ? String(Number(e.time.slice(0, 2)) + 1).padStart(2, '0') + e.time.slice(2) : '110000')}`,
    `SUMMARY:${esc(e.title)}`,
    `DESCRIPTION:${esc(e.description)}`,
  ];
  if (e.rrule) lines.push(`RRULE:${e.rrule}`);
  for (const d of e.alarmsDays) {
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:${d === 0 ? 'PT0M' : `-P${d}D`}`, 'END:VALARM');
  }
  lines.push('END:VEVENT');
  return lines;
}

const monthly = (day: number) => `FREQ=MONTHLY;BYMONTHDAY=${day > 28 ? -1 : day}`;

export function buildICS(s: State, todayStr = today()): { text: string; count: number } {
  const L = new Ledger(s);
  const key = monthOf(todayStr);
  const days = Math.max(0, s.settings.reminderDays);
  const events: Ev[] = [];

  for (const b of s.bills.filter(x => x.isActive)) {
    events.push({ uid: `bill-${b.id}`, date: monthDate(key, b.day), title: `💳 ${b.name} to‘lovi`,
      description: `Majburiy to‘lov: ${plain(b.amount)}. Budget ilovasida «To‘landi» deb belgilang.`,
      rrule: monthly(b.day), alarmsDays: days ? [days, 0] : [0] });
  }
  for (const d of L.activeDebts.filter(x => x.dueDay > 0)) {
    events.push({ uid: `debt-${d.id}`, date: monthDate(key, d.dueDay), title: `🔔 ${d.name}: qarz to‘lovi`,
      description: `Qarz to‘lovi sanasi.${d.minimumPayment ? ` Minimal to‘lov: ${plain(d.minimumPayment)}.` : ''} Budget ilovasida to‘lovni kiriting.`,
      rrule: monthly(d.dueDay), alarmsDays: days ? [days, 0] : [0] });
  }
  for (const i of s.incomeSchedules.filter(x => x.isActive)) {
    events.push({ uid: `income-${i.id}`, date: monthDate(key, i.day), title: `📥 ${i.source} kutilmoqda`,
      description: `Kutilgan kirim: ${plain(i.amount)}. Tushganda Budget ilovasida «Tushdi» ni bosing.`,
      rrule: monthly(i.day), alarmsDays: [0] });
  }
  for (const p of L.plannedOpen.filter(x => x.date && x.date >= todayStr)) {
    events.push({ uid: `planned-${p.id}`, date: p.date!, title: `🛒 ${p.name}`, description: `Rejali xarid: ${plain(p.amount)}.`, alarmsDays: [1, 0] });
  }
  const every = Math.max(1, s.settings.backupEveryDays);
  events.push({ uid: 'backup', date: addDays(todayStr, every), time: '200000', title: '💾 Budget: zaxira nusxa oling',
    description: 'Budget ilovasi → Ko‘proq → Ma’lumotlar → Zaxira nusxa olish. Faylni iCloud Drive’ga saqlang.',
    rrule: `FREQ=DAILY;INTERVAL=${every}`, alarmsDays: [0] });

  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Budget Manager//UZ', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Budget eslatmalari',
    ...events.flatMap(event), 'END:VCALENDAR'];
  return { text: lines.join('\r\n') + '\r\n', count: events.length };
}
