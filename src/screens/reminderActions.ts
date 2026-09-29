import type { Reminder } from '../domain/engine';
import { go, openSheet, push } from '../store/ui';

export function runReminderAction(r: Reminder) {
  const a = r.action;
  if (!a) return;
  switch (a.type) {
    case 'receive': if (a.id) openSheet({ type: 'receive', id: a.id }); break;
    case 'pay-bill': if (a.id) openSheet({ type: 'payBill', id: a.id }); break;
    case 'pay-debt': if (a.id) openSheet({ type: 'debtPayment', debtId: a.id }); break;
    case 'purchase': if (a.id) openSheet({ type: 'planned', id: a.id }); break;
    case 'backup': go('more', { name: 'data' }); break;
    case 'budget': go('budget'); break;
    default: push({ name: 'reminders' });
  }
}
