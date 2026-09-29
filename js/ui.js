// Interfeys: ekranlar, formalar (pastdan chiquvchi oynalar), navigatsiya va hodisalar.

import * as store from './store.js';
import { Ledger } from './engine.js';
import { donut, bars, PALETTE } from './charts.js';
import {
  esc, money, plain, short, signed, symbol, sum, parseAmount, percentOf, setCurrency, CURRENCIES,
  today, currentMonth, addMonths, monthTitle, monthShort, dayLabel, fullDate, daysBetween, monthOf,
} from './util.js';

// ---------- Holat ----------

const ui = {
  tab: 'home',
  stack: [],
  budgetMonth: currentMonth(),
  statsMonth: currentMonth(),
  txMonth: currentMonth(),
  txFilter: 'all',
  segment: 'cards',
  step: 0,
  sheet: null,
};

const TABS = [
  ['home', 'Asosiy', '🏠'],
  ['budget', 'Budget', '📊'],
  ['accounts', 'Hisoblar', '💳'],
  ['stats', 'Statistika', '📈'],
  ['settings', 'Sozlamalar', '⚙️'],
];

const S = () => store.state;

// ---------- Kichik HTML yordamchilari ----------

function data(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ');
}

const act = (action, params = {}) => data({ action, ...params });

function tone(ratio) { return ratio > 1 ? 'bad' : ratio >= 0.9 ? 'warn' : 'good'; }

function bar(ratio, cls) {
  const pct = Math.min(Math.max(ratio || 0, 0), 1) * 100;
  return `<div class="bar"><i class="${cls || tone(ratio)}" style="width:${pct.toFixed(1)}%"></i></div>`;
}

function card(title, body, extra = '') {
  return `<section class="card">${title ? `<div class="card-head"><h2>${title}</h2>${extra}</div>` : ''}${body}</section>`;
}

function listGroup(rows, header = '', footer = '') {
  return `${header ? `<div class="list-header">${header}</div>` : ''}<div class="list">${rows.join('')}</div>${footer ? `<div class="list-footer">${footer}</div>` : ''}`;
}

/** iOS uslubidagi ro'yxat qatori. */
function row({ title, sub = '', right = '', icon = '', attrs = '', chevron = false, cls = '' }) {
  const tag = attrs ? 'button type="button"' : 'div';
  const close = attrs ? 'button' : 'div';
  return `<${tag} class="row ${cls}" ${attrs}>
    ${icon ? `<span class="row-icon">${esc(icon)}</span>` : ''}
    <span class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</span>
    ${right ? `<span class="row-right">${right}</span>` : ''}
    ${chevron ? '<span class="chev">›</span>' : ''}
  </${close}>`;
}

function empty(text) { return `<div class="empty">${text}</div>`; }

function budgetRow(r, attrs = '') {
  return `<button type="button" class="brow" ${attrs}>
    <span class="brow-top"><span>${esc(r.category.icon)} ${esc(r.category.name)}</span>
    <span class="num ${r.spent > r.limit ? 'neg' : 'muted'}">${plain(r.spent)} / ${plain(r.limit)}</span></span>
    ${bar(r.ratio)}
  </button>`;
}

function monthSwitch(target, key) {
  return `<div class="month-switch">
    <button type="button" ${act('month', { target, delta: -1 })} aria-label="Oldingi oy">‹</button>
    <strong>${esc(monthTitle(key))}</strong>
    <button type="button" ${act('month', { target, delta: 1 })} aria-label="Keyingi oy">›</button>
  </div>`;
}

function tile(title, value, caption = '', cls = '') {
  return `<div class="tile"><span class="tile-title">${title}</span>
    <span class="tile-value ${cls}">${value}</span>${caption ? `<span class="tile-cap">${caption}</span>` : ''}</div>`;
}

// ---------- Forma maydonlari ----------

function field(label, input, when = '') {
  return `<label class="field" ${when ? `data-when="${esc(when)}"` : ''}><span>${label}</span>${input}</label>`;
}

function amountInput(name, value, label, { autofocus = false, big = false, when = '' } = {}) {
  const input = `<input name="${name}" inputmode="numeric" autocomplete="off" data-amount placeholder="0"
    value="${value ? plain(value) : ''}" ${autofocus ? 'autofocus' : ''} class="${big ? 'big' : ''}">`;
  return field(label, input, when);
}

function textInput(name, value, label, placeholder = '', when = '') {
  return field(label, `<input name="${name}" value="${esc(value || '')}" placeholder="${esc(placeholder)}" autocomplete="off">`, when);
}

function numberInput(name, value, label, when = '') {
  return field(label, `<input name="${name}" inputmode="decimal" value="${value ?? ''}" placeholder="0" autocomplete="off">`, when);
}

function dateInput(name, value, label = 'Sana', when = '') {
  return field(label, `<input type="date" name="${name}" value="${esc(value || today())}">`, when);
}

function selectInput(name, label, options, when = '') {
  return field(label, `<select name="${name}">${options}</select>`, when);
}

function toggle(name, checked, label, when = '') {
  return `<label class="toggle" ${when ? `data-when="${esc(when)}"` : ''}><span>${label}</span>
    <input type="checkbox" name="${name}" ${checked ? 'checked' : ''}><i></i></label>`;
}

function segmented(name, options, value, when = '') {
  return `<div class="segmented" ${when ? `data-when="${esc(when)}"` : ''}>${options.map(([v, l]) =>
    `<label><input type="radio" name="${name}" value="${esc(v)}" ${v === value ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
}

function hint(text, when = '') {
  return `<p class="hint" ${when ? `data-when="${esc(when)}"` : ''}>${text}</p>`;
}

function fieldset(...parts) { return `<div class="fieldset">${parts.join('')}</div>`; }

function option(value, label, selected) {
  return `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`;
}

function cardOptions(L, value, emptyLabel = 'Tanlanmagan') {
  const cards = L.s.cards.filter(c => c.active || c.id === value);
  return option('', emptyLabel, !value) + cards.map(c => option(c.id, cardName(c), c.id === value)).join('');
}

function fundOptions(L, value) {
  const funds = L.s.funds.filter(f => f.active || f.id === value);
  return option('', 'Yo‘q', !value)
    + funds.map(f => option(f.id, `${f.icon} ${f.name} · ${short(L.fundBalance(f))}`, f.id === value)).join('');
}

function categoryOptions(L, value) {
  return option('', 'Tanlanmagan', !value) + L.groups.filter(g => g.active).map(g => {
    const kids = L.children(g).filter(c => c.active && c.kind === 'expense');
    const list = kids.length === 0 && g.groupLevel ? [g] : kids;
    if (!list.length) return '';
    return `<optgroup label="${esc(g.icon + ' ' + g.name)}">${list.map(c =>
      option(c.id, `${c.icon} ${c.name}`, c.id === value)).join('')}</optgroup>`;
  }).join('');
}

function dayOptions(value) {
  return Array.from({ length: 31 }, (_, i) => option(i + 1, `${i + 1}-kun`, i + 1 === Number(value))).join('');
}

const cardName = c => (c.last4 ? `${c.name} •${c.last4}` : c.name);
const bool = (fd, name) => fd.get(name) === 'on';
const find = (coll, id) => (id ? S()[coll].find(x => x.id === id) : null);

function deleteButton(kind, id, label = 'O‘chirish') {
  return `<button type="button" class="btn danger block" ${act('delete', { kind, id })}>${label}</button>`;
}

// ---------- Ekranlar ----------

function dashboard(L) {
  const key = currentMonth();
  const t = today();
  const s = L.summary(key);
  const parts = [];

  if (!navigator.standalone && !S().settings.hideInstallTip) {
    parts.push(`<section class="card tip">
      <p><b>Ilovani ekranga qo‘shing:</b> Safari’da pastdagi <b>Ulashish</b> (⬆︎) tugmasi → <b>«На экран Домой / Add to Home Screen»</b>. Shunda u oddiy ilova kabi ochiladi.</p>
      <button type="button" class="link" ${act('hide-tip')}>Yopish</button></section>`);
  }

  if (!L.month(key)) {
    parts.push(card(`${monthTitle(key)} budgeti yaratilmagan`,
      `<p class="muted">Oldingi oydan nusxa oling yoki standart shablondan boshlang.</p>
      <div class="btn-row">
        <button type="button" class="btn primary" ${act('create-month', { key, source: 'previous' })}>Oldingi oydan</button>
        <button type="button" class="btn" ${act('create-month', { key, source: 'template' })}>Shablondan</button>
      </div>`));
  }

  parts.push(`<div class="tiles">
    ${tile('Daromad', short(s.income), `Reja: ${short(s.expectedIncome)}`, 'pos')}
    ${tile('Xarajat', short(s.expenses), s.fundSpending ? `Fonddan: ${short(s.fundSpending)}` : '')}
    ${tile('Qarz to‘lovi', short(s.debtPayments), '', 'blue')}
    ${tile('Emergency', short(L.emergencyBalance), '', 'orange')}
    ${tile('Fondlarga', short(s.savings))}
    ${tile('Qoldiq', short(s.remaining), '', s.remaining < 0 ? 'neg' : '')}
  </div>`);

  const alerts = L.alerts(t);
  const lastBackup = S().settings.lastBackup;
  if (S().expenses.length >= 20 && (!lastBackup || daysBetween(lastBackup, t) > 30)) {
    alerts.push({ icon: '💾', level: 'info', text: 'Zaxira nusxa oling: Sozlamalar → Zaxira nusxa' });
  }
  if (alerts.length) {
    parts.push(card('Ogohlantirishlar', alerts.map(a =>
      `<div class="alert ${a.level}"><span>${esc(a.icon)}</span><span>${esc(a.text)}</span></div>`).join('')));
  }

  const schedule = L.incomeSchedule(key);
  if (schedule.length) {
    parts.push(card('Daromad jadvali', schedule.map(i => row({
      title: esc(i.source.name),
      sub: dayLabel(i.date),
      right: i.received > 0
        ? `<span class="num">${plain(i.received)}</span><span class="ok-mark">Tushdi ✓</span>`
        : `<span class="num muted">${plain(i.expected)}</span><span class="pill" ${act('sheet', { sheet: 'income', source: i.source.id })}>Tushdi</span>`,
    })).join('')));
  }

  const rows = L.units.filter(c => c.kind === 'expense').map(c => L.row(c, key)).filter(r => r.limit > 0 || r.spent > 0);
  if (rows.length) {
    parts.push(card('Budget', rows.map(r => budgetRow(r, act('sheet', { sheet: 'allocation', cat: r.category.id, key }))).join('')));
  }

  const daily = L.dailyTracked.map(c => L.dailyStatus(c, t)).filter(Boolean);
  if (daily.length) {
    parts.push(card('Kunlik limit', daily.map(d => {
      const ratio = d.allowance > 0 ? d.spentToday / d.allowance : (d.spentToday > 0 ? 1.01 : 0);
      return `<div class="daily"><div class="brow-top"><span>${esc(d.category.icon)} ${esc(d.category.name)}</span>
        <span class="num">Bugun: ${short(d.spentToday)} / ${short(d.allowance)}</span></div>${bar(ratio)}
        <div class="small muted">${d.saved >= 0 ? `Tejaldi: ${short(d.saved)}` : `Oshdi: ${short(-d.saved)}`}
        · oyga qoldi: ${short(d.remainingMonth)} · ${d.daysLeft} kun</div></div>`;
    }).join('')));
  }

  const upcoming = L.upcomingPlanned(t, 45).slice(0, 5);
  if (upcoming.length) {
    parts.push(card('Kelayotgan xarajatlar', upcoming.map(p => {
      const fund = L.fundMap.get(p.fundId);
      return row({
        icon: L.category(p.categoryId)?.icon || '📅',
        title: esc(p.title),
        sub: dayLabel(p.date) + (fund ? ` · ${esc(fund.name)}` : ''),
        right: `<span class="num">${short(p.amount)}</span><span class="pill" ${act('sheet', { sheet: 'expense', planned: p.id })}>Bajarildi</span>`,
      });
    }).join('')));
  }

  if (L.activeDebts.length) {
    parts.push(card('Qarzlar', L.activeDebts.map(d => {
      const days = L.daysUntilDue(d, t);
      return row({
        title: esc(d.name),
        sub: days === null ? '' : `<span class="${days <= 3 ? 'warn-text' : ''}">${days === 0 ? 'To‘lov bugun' : `To‘lovgacha ${days} kun`}</span>`,
        right: `<span class="num">${short(L.debtRemaining(d))}</span>`,
      });
    }).join('') + row({ title: '<b>Jami</b>', right: `<b class="num">${short(L.totalDebtRemaining)}</b>` })));
  }

  const recent = S().expenses.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  parts.push(card('So‘nggi xarajatlar',
    (recent.length ? recent.map(e => expenseRow(L, e)).join('') : empty('Hali xarajat yo‘q. Pastdagi «+ XARAJAT» tugmasini bosing.'))
    + `<button type="button" class="link block" ${act('push', { route: 'transactions' })}>Barcha tranzaksiyalar ›</button>`));

  return {
    title: monthTitle(key),
    actions: `<button type="button" class="icon-btn" ${act('sheet', { sheet: 'quick' })} aria-label="Qo‘shish">＋</button>`,
    html: parts.join(''),
    fab: true,
  };
}

function expenseRow(L, e) {
  const c = L.category(e.categoryId);
  const fund = L.fundMap.get(e.fundId);
  const sub = [dayLabel(e.date), fund ? `Fond: ${fund.name}` : '', e.note].filter(Boolean).map(esc).join(' · ');
  return row({
    icon: c?.icon || '💸', title: esc(c?.name || 'Kategoriyasiz'), sub,
    right: `<span class="num">-${plain(e.amount)}</span>`,
    attrs: act('sheet', { sheet: 'expense', id: e.id }),
  });
}

function budgetScreen(L) {
  const key = ui.budgetMonth;
  const income = L.planningIncome(key);
  const allocated = L.totalAllocated(key);
  const unallocated = income - allocated;
  const parts = [monthSwitch('budget', key)];

  if (!L.month(key)) {
    parts.push(card('', `<p class="muted">Bu oy uchun budget hali yaratilmagan. Quyida standart shablon qiymatlari.</p>
      <div class="btn-row">
        <button type="button" class="btn primary" ${act('create-month', { key, source: 'previous' })}>Oldingi oydan nusxa</button>
        <button type="button" class="btn" ${act('create-month', { key, source: 'template' })}>Shablondan</button>
      </div>`));
  }

  parts.push(listGroup([
    row({ title: 'Kutilgan daromad', right: `<span class="num">${money(L.expectedIncome)}</span>` }),
    row({ title: 'Tushgan daromad', right: `<span class="num">${money(L.incomeReceived(key))}</span>` }),
    row({ title: 'Taqsimlangan', right: `<span class="num">${money(allocated)}</span>` }),
    row({ title: 'Taqsimlanmagan', right: `<span class="num ${unallocated < 0 ? 'neg' : 'pos'}">${money(unallocated)}</span>` }),
  ], 'Umumiy', income > 0 && allocated > income ? '<span class="neg">⚠️ Taqsimlangan summa daromaddan oshib ketdi.</span>' : ''));

  for (const g of L.groups) {
    const units = L.unitsIn(g);
    if (!units.length) continue;
    const rows = units.map(c => L.row(c, key));
    parts.push(`<div class="list-header split"><span>${esc(g.icon)} ${esc(g.name)}</span>
      <span class="num">${short(sum(rows, r => r.spent))} / ${short(sum(rows, r => r.limit))}</span></div>
      <div class="list">${rows.map(r => budgetRow(r, act('sheet', { sheet: 'allocation', cat: r.category.id, key }))).join('')}</div>`);
  }

  if (L.units.some(c => c.kind === 'fund' || c.kind === 'emergency')) {
    parts.push(`<button type="button" class="btn block" ${act('contribute', { key })}>⬇︎ Fondlarga oylik hissani o‘tkazish</button>
      <p class="hint">Budget — reja. Hissalar faqat siz tasdiqlaganingizda fondlarga yoziladi.</p>`);
  }
  parts.push('<p class="hint">Qatorni bosib limitni o‘zgartiring (summa yoki daromaddan foiz).</p>');

  return {
    title: 'Budget',
    actions: `<button type="button" class="text-btn" ${act('push', { route: 'categories' })}>Kategoriyalar</button>`,
    html: parts.join(''),
  };
}

function accountsScreen(L) {
  const seg = ui.segment;
  const tabs = [['cards', 'Kartalar'], ['debts', 'Qarzlar'], ['funds', 'Fondlar']];
  const control = `<div class="seg-control">${tabs.map(([k, l]) =>
    `<button type="button" class="${k === seg ? 'on' : ''}" ${act('segment', { seg: k })}>${l}</button>`).join('')}</div>`;
  const content = seg === 'cards' ? cardsList(L) : seg === 'debts' ? debtsList(L) : fundsList(L);
  return { title: 'Hisoblar', actions: content.actions, html: control + content.html };
}

function cardsList(L, mode = 'detail') {
  const cards = S().cards;
  const rows = cards.map(c => {
    const bal = L.cardBalance(c);
    const tags = [c.bank, c.isIncome ? 'Daromad kartasi' : '', c.isDefault ? 'Kundalik xarajat' : '', c.active ? '' : 'faol emas']
      .filter(Boolean).map(esc).join(' · ');
    return row({
      icon: '💳', title: esc(cardName(c)), sub: tags,
      right: `<span class="num ${bal < 0 ? 'neg' : ''}">${money(bal)}</span>`,
      attrs: mode === 'detail' ? act('push', { route: 'card', id: c.id }) : act('sheet', { sheet: 'card', id: c.id }),
      chevron: mode === 'detail',
    });
  });
  const html = (cards.length ? listGroup([row({ title: 'Jami balans', right: `<b class="num">${money(sum(L.activeCards, c => L.cardBalance(c)))}</b>` })]) : '')
    + (cards.length ? listGroup(rows) : empty('Karta yo‘q. Masalan: Main (daromad), Basic (kundalik), 6418 (rejali).'));
  const actions = (L.activeCards.length > 1 ? `<button type="button" class="text-btn" ${act('sheet', { sheet: 'transfer' })}>⇄</button>` : '')
    + `<button type="button" class="icon-btn" ${act('sheet', { sheet: 'card' })} aria-label="Karta qo‘shish">＋</button>`;
  return { html, actions };
}

function debtsList(L, mode = 'detail') {
  const debts = S().debts;
  const t = today();
  const total = sum(L.activeDebts, d => L.debtTotal(d));
  const paid = sum(L.activeDebts, d => L.debtPaid(d));
  const rows = debts.map(d => {
    const days = L.daysUntilDue(d, t);
    const meta = [d.rate ? `${d.rate}%` : '', days === null ? '' : days === 0 ? 'To‘lov bugun' : `${d.dueDay}-sana · ${days} kun`,
      d.multiple ? 'Oyiga bir necha to‘lov' : '', d.active ? '' : 'yopilgan'].filter(Boolean).join(' · ');
    return `<button type="button" class="row stacked" ${mode === 'detail' ? act('push', { route: 'debt', id: d.id }) : act('sheet', { sheet: 'debt', id: d.id })}>
      <span class="brow-top"><b>${esc(d.name)}</b><span class="num">${money(L.debtRemaining(d))}</span></span>
      <span class="row-sub">${esc(meta)}</span>${bar(L.debtProgress(d), 'good')}</button>`;
  });
  const html = (debts.length ? listGroup([
    row({ title: 'Qolgan qarz', right: `<b class="num">${money(L.totalDebtRemaining)}</b>` }),
    row({ title: 'To‘langan', right: `<span class="num">${money(paid)}</span>` }),
    `<div class="row">${bar(total > 0 ? paid / total : 0, 'good')}</div>`,
  ]) + listGroup(rows) : empty('Qarz yo‘q. Kredit yoki qarz bo‘lsa, ＋ orqali qo‘shing.'));
  const actions = (L.activeDebts.length && mode === 'detail' ? `<button type="button" class="text-btn" ${act('sheet', { sheet: 'debtPay' })}>To‘lov</button>` : '')
    + `<button type="button" class="icon-btn" ${act('sheet', { sheet: 'debt' })} aria-label="Qarz qo‘shish">＋</button>`;
  return { html, actions };
}

function fundRow(L, f, mode) {
  const bal = L.fundBalance(f);
  const monthly = L.fundMonthly(f);
  return `<button type="button" class="row stacked" ${mode === 'detail' ? act('push', { route: 'fund', id: f.id }) : act('sheet', { sheet: 'fund', id: f.id })}>
    <span class="brow-top"><b>${esc(f.icon)} ${esc(f.name)}</b>
    <span class="num ${bal < 0 ? 'neg' : ''}">${f.target > 0 ? `${short(bal)} / ${short(f.target)}` : money(bal)}</span></span>
    ${f.target > 0 ? bar(L.fundProgress(f), L.fundProgress(f) >= 1 ? 'good' : 'blue') : ''}
    ${monthly ? `<span class="row-sub">Oyiga: ${short(monthly)}${f.active ? '' : ' · faol emas'}</span>` : ''}</button>`;
}

function fundsList(L, mode = 'detail') {
  const emergency = S().funds.filter(f => f.emergency);
  const sinking = S().funds.filter(f => !f.emergency);
  const html = listGroup(
    emergency.length ? emergency.map(f => fundRow(L, f, mode))
      : [row({ title: '＋ Emergency fond yaratish', attrs: act('sheet', { sheet: 'fund', emergency: 1 }) })],
    'Emergency Fund', 'Rejalashtirilmagan, lekin zarur xarajatlar uchun (masalan, mashina ta’miri).')
    + listGroup(
      sinking.length ? sinking.map(f => fundRow(L, f, mode)) : [row({ title: '<span class="muted">Masalan: Uyga borish, To‘ylar, Sovg‘alar</span>' })],
      'Sinking Funds', 'Har oy bo‘lmaydigan, lekin kutiladigan xarajatlar uchun yig‘iladi. Ishlatilmagan pul yo‘qolmaydi.');
  return { html, actions: `<button type="button" class="icon-btn" ${act('sheet', { sheet: 'fund' })} aria-label="Fond qo‘shish">＋</button>` };
}

function cardDetail(L, route) {
  const c = find('cards', route.id);
  if (!c) return missing();
  const items = txItems(L, x => x.cardId === c.id || x.fromId === c.id || x.toId === c.id);
  return {
    title: cardName(c),
    actions: `<button type="button" class="text-btn" ${act('sheet', { sheet: 'card', id: c.id })}>Tahrirlash</button>`,
    html: listGroup([
      row({ title: 'Joriy balans', right: `<b class="num ${L.cardBalance(c) < 0 ? 'neg' : ''}">${money(L.cardBalance(c))}</b>` }),
      row({ title: 'Boshlang‘ich balans', right: `<span class="num">${money(c.opening || 0)}</span>` }),
      c.bank ? row({ title: 'Bank', right: esc(c.bank) }) : '',
    ]) + listGroup(items.length ? items.slice(0, 200).map(i => txRow(L, i, true)) : [empty('Hali tranzaksiya yo‘q')], 'Tranzaksiyalar'),
  };
}

function debtDetail(L, route) {
  const d = find('debts', route.id);
  if (!d) return missing();
  const history = S().debtPayments.filter(p => p.debtId === d.id).sort((a, b) => b.date.localeCompare(a.date));
  const remaining = L.debtRemaining(d);
  return {
    title: d.name,
    actions: `<button type="button" class="text-btn" ${act('sheet', { sheet: 'debt', id: d.id })}>Tahrirlash</button>`,
    html: listGroup([
      row({ title: 'Qolgan', right: `<b class="num">${money(remaining)}</b>` }),
      row({ title: 'To‘langan', right: `<span class="num">${money(L.debtPaid(d))}</span>` }),
      d.original ? row({ title: 'Dastlabki summa', right: `<span class="num">${money(d.original)}</span>` }) : '',
      d.rate ? row({ title: 'Foiz', right: `${d.rate}%` }) : '',
      d.dueDay ? row({ title: 'To‘lov sanasi', right: `Har oy ${d.dueDay}-kuni` }) : '',
      d.minPayment ? row({ title: 'Minimal to‘lov', right: `<span class="num">${money(d.minPayment)}</span>` }) : '',
      `<div class="row">${bar(L.debtProgress(d), 'good')}</div>`,
    ]) + `<div class="btn-row">
      <button type="button" class="btn primary" ${act('sheet', { sheet: 'debtPay', debt: d.id })} ${remaining <= 0 ? 'disabled' : ''}>To‘lov qilish</button>
      <button type="button" class="btn" ${act('sheet', { sheet: 'debtPay', debt: d.id, adjust: 1 })}>Tuzatish (foiz)</button>
    </div>` + listGroup(history.length ? history.map(p => row({
      title: fullDate(p.date),
      sub: esc([p.adjustment ? 'Tuzatish' : (find('cards', p.cardId)?.name || ''), p.note].filter(Boolean).join(' · ')),
      right: `<span class="num ${p.adjustment ? 'orange' : 'pos'}">${p.adjustment ? signed(p.amount) : '-' + plain(p.amount)}</span>`,
      attrs: act('delete', { kind: 'debtPayment', id: p.id }),
    })) : [empty('Hali to‘lov yo‘q')], 'To‘lovlar tarixi', history.length ? 'Yozuvni o‘chirish uchun ustiga bosing.' : ''),
  };
}

function fundDetail(L, route) {
  const f = find('funds', route.id);
  if (!f) return missing();
  const history = [
    ...S().fundTx.filter(t => t.fundId === f.id).map(t => ({ type: 'tx', date: t.date, item: t })),
    ...S().expenses.filter(e => e.fundId === f.id).map(e => ({ type: 'expense', date: e.date, item: e })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  return {
    title: `${f.icon} ${f.name}`,
    actions: `<button type="button" class="text-btn" ${act('sheet', { sheet: 'fund', id: f.id })}>Tahrirlash</button>`,
    html: listGroup([
      row({ title: 'Joriy', right: `<b class="num">${money(L.fundBalance(f))}</b>` }),
      f.target ? row({ title: 'Maqsad', right: `<span class="num">${money(f.target)}</span>` }) : '',
      f.target ? `<div class="row">${bar(L.fundProgress(f), 'good')}</div>` : '',
      row({ title: 'Oylik ajratma', right: `<span class="num">${money(L.fundMonthly(f))}</span>` }),
      f.targetDate ? row({ title: 'Muddat', right: fullDate(f.targetDate) }) : '',
    ]) + `<div class="btn-row">
      <button type="button" class="btn primary" ${act('sheet', { sheet: 'fundTx', fund: f.id })}>Hissa ±</button>
      <button type="button" class="btn" ${act('sheet', { sheet: 'expense', fund: f.id })}>Fonddan xarajat</button>
    </div>` + listGroup(history.length ? history.map(h => h.type === 'tx'
      ? row({
        title: esc(h.item.note || (h.item.amount > 0 ? 'Hissa' : 'Olib qo‘yildi')), sub: fullDate(h.date),
        right: `<span class="num ${h.item.amount > 0 ? 'pos' : 'orange'}">${signed(h.item.amount)}</span>`,
        attrs: act('delete', { kind: 'fundTx', id: h.item.id }),
      })
      : expenseRow(L, h.item)) : [empty('Hali harakat yo‘q')], 'Tarix'),
  };
}

// ---------- Tranzaksiyalar ----------

const TX_FILTERS = [['all', 'Hammasi'], ['expense', 'Xarajat'], ['income', 'Daromad'], ['debt', 'Qarz'], ['transfer', 'O‘tkazma'], ['fund', 'Fond']];

function txItems(L, predicate = () => true) {
  const s = S();
  return [
    ...s.expenses.filter(predicate).map(x => ({ type: 'expense', x })),
    ...s.incomes.filter(predicate).map(x => ({ type: 'income', x })),
    ...s.debtPayments.filter(predicate).map(x => ({ type: 'debt', x })),
    ...s.transfers.filter(predicate).map(x => ({ type: 'transfer', x })),
    ...s.fundTx.filter(predicate).map(x => ({ type: 'fund', x })),
  ].sort((a, b) => b.x.date.localeCompare(a.x.date));
}

function txRow(L, { type, x }, showDate = false) {
  const date = showDate ? fullDate(x.date) : '';
  const cardN = id => find('cards', id)?.name || '';
  const subOf = (...p) => p.filter(Boolean).map(esc).join(' · ');
  switch (type) {
    case 'expense': {
      const c = L.category(x.categoryId);
      const fund = L.fundMap.get(x.fundId);
      return row({ icon: c?.icon || '💸', title: esc(c?.name || 'Kategoriyasiz'),
        sub: subOf(date, cardN(x.cardId), fund ? `Fond: ${fund.name}` : '', x.note),
        right: `<span class="num">-${plain(x.amount)}</span>`, attrs: act('sheet', { sheet: 'expense', id: x.id }) });
    }
    case 'income':
      return row({ icon: '💵', title: esc(x.source), sub: subOf(date, cardN(x.cardId), x.note),
        right: `<span class="num pos">+${plain(x.amount)}</span>`, attrs: act('sheet', { sheet: 'income', id: x.id }) });
    case 'debt':
      return row({ icon: '💳', title: `${esc(find('debts', x.debtId)?.name || 'Qarz')} — ${x.adjustment ? 'tuzatish' : 'to‘lov'}`,
        sub: subOf(date, cardN(x.cardId), x.note),
        right: `<span class="num">${x.adjustment ? signed(x.amount) : '-' + plain(x.amount)}</span>`,
        attrs: act('delete', { kind: 'debtPayment', id: x.id }) });
    case 'transfer':
      return row({ icon: '🔁', title: `${esc(cardN(x.fromId) || '?')} → ${esc(cardN(x.toId) || '?')}`,
        sub: subOf(date, x.note), right: `<span class="num muted">${plain(x.amount)}</span>`,
        attrs: act('delete', { kind: 'transfer', id: x.id }) });
    default: {
      const fund = L.fundMap.get(x.fundId);
      return row({ icon: fund?.icon || '🏦', title: `${esc(fund?.name || 'Fond')} — ${x.amount > 0 ? 'hissa' : 'olib qo‘yildi'}`,
        sub: subOf(date, x.note), right: `<span class="num muted">${signed(x.amount)}</span>`,
        attrs: act('delete', { kind: 'fundTx', id: x.id }) });
    }
  }
}

function transactionsScreen(L) {
  const key = ui.txMonth;
  const items = txItems(L, x => monthOf(x.date) === key).filter(i => ui.txFilter === 'all' || i.type === ui.txFilter);
  const days = new Map();
  for (const i of items) {
    if (!days.has(i.x.date)) days.set(i.x.date, []);
    days.get(i.x.date).push(i);
  }
  const chips = `<div class="filter-chips">${TX_FILTERS.map(([k, l]) =>
    `<button type="button" class="${k === ui.txFilter ? 'on' : ''}" ${act('tx-filter', { filter: k })}>${l}</button>`).join('')}</div>`;
  const groups = [...days.entries()].map(([d, list]) => listGroup(list.map(i => txRow(L, i)), fullDate(d))).join('');
  return {
    title: 'Tranzaksiyalar',
    html: monthSwitch('tx', key) + chips + (groups || empty('Bu oyda tranzaksiya yo‘q'))
      + (items.length ? '<p class="hint">Xarajat va daromadni bosib tahrirlang; boshqa yozuvlarni bosib o‘chirasiz.</p>' : ''),
  };
}

// ---------- Statistika ----------

function statsScreen(L) {
  const key = ui.statsMonth;
  const s = L.summary(key);
  const groups = L.spendingByGroup(key);
  const total = sum(groups, g => g.amount);
  const parts = [monthSwitch('stats', key)];

  parts.push(`<div class="tiles">
    ${tile('Daromad', short(s.income), '', 'pos')}${tile('Xarajat', short(s.expenses))}
    ${tile('Qarz to‘lovi', short(s.debtPayments), '', 'blue')}${tile('Jamg‘arma', short(s.savings), '', 'orange')}
  </div>`);

  parts.push(card('Kategoriyalar bo‘yicha', groups.length
    ? `<div class="donut-wrap">${donut(groups)}</div>` + groups.map((g, i) => `<div class="legend-row">
        <i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${esc(g.name)}</span>
        <span class="num muted">${short(g.amount)} · ${total ? Math.round((g.amount / total) * 100) : 0}%</span></div>`).join('')
      + '<p class="hint">Fondlardan qilingan xarajatlar ham kiritilgan.</p>'
    : empty('Bu oyda xarajat yo‘q')));

  const months = Array.from({ length: 6 }, (_, i) => addMonths(key, i - 5));
  parts.push(card('So‘nggi 6 oy', bars(
    months.map(m => { const x = L.summary(m); return { label: monthShort(m), values: [x.income, x.outflow] }; }),
    [{ name: 'Daromad', color: PALETTE[0] }, { name: 'Chiqim', color: PALETTE[2] }],
  )));

  const debts = S().debts;
  if (debts.length) {
    const start = sum(debts, d => L.debtTotal(d));
    const paid = sum(debts, d => L.debtPaid(d));
    parts.push(card('Qarz', [
      row({ title: 'Boshlang‘ich', right: `<span class="num">${short(start)}</span>` }),
      row({ title: 'Hozirgi', right: `<span class="num">${short(start - paid)}</span>` }),
      row({ title: 'To‘langan', right: `<span class="num pos">${short(paid)}</span>` }),
      row({ title: 'Shu oy to‘langan', right: `<span class="num">${short(L.debtPaidIn(key))}</span>` }),
    ].join('') + bar(start > 0 ? paid / start : 0, 'good')));
  }

  const report = [
    ['Daromad', s.income], ['Xarajat', s.expenses], ['Qarz to‘lovi', s.debtPayments],
    ['Emergency', s.emergency], ['Sinking funds', s.funds],
  ].map(([l, v]) => row({ title: l, right: `<span class="num">${money(v)}</span>` })).join('')
    + row({ title: '<b>Jami chiqim</b>', right: `<b class="num">${money(s.outflow)}</b>` })
    + row({ title: '<b>Qoldiq</b>', right: `<b class="num ${s.remaining < 0 ? 'neg' : 'pos'}">${money(s.remaining)}</b>` });

  const bva = L.units.map(c => L.row(c, key)).filter(r => r.limit > 0 || r.spent > 0).map(r => `<div class="bva">
    <div>${esc(r.category.icon)} ${esc(r.category.name)}</div>
    <div class="small"><span class="muted">Budget: ${short(r.limit)} · Haqiqiy: ${short(r.spent)}</span>
    ${r.category.kind === 'expense' ? `<span class="${r.remaining >= 0 ? 'pos' : 'neg'}">${r.remaining >= 0 ? `Tejaldi ${short(r.remaining)}` : `Oshdi ${short(-r.remaining)}`}</span>` : ''}</div></div>`).join('');

  parts.push(card(`${monthTitle(key)} hisoboti`, report + (bva ? `<h3 class="sub-title">Budget va haqiqat</h3>${bva}` : '')));

  return { title: 'Statistika', html: parts.join('') };
}

// ---------- Sozlamalar ----------

function settingsScreen() {
  const st = S().settings;
  const link = (label, route) => row({ title: label, attrs: act('push', { route }), chevron: true });
  const sel = (key, options) => `<select class="inline-select" data-setting="${key}">${options}</select>`;

  return {
    title: 'Sozlamalar',
    html: listGroup([
      row({ title: 'Valyuta', right: sel('currency', CURRENCIES.map(c => option(c.code, `${c.code} — ${c.name}`, c.code === st.currency)).join('')) }),
      row({ title: 'Limit ogohlantirishi', right: sel('alertThreshold', [70, 75, 80, 85, 90, 95, 100].map(v => option(v, `${v}%`, v === st.alertThreshold)).join('')) }),
      row({ title: 'Qarz eslatmasi', right: sel('reminderDays', [0, 1, 2, 3, 5, 7].map(v => option(v, `${v} kun oldin`, v === st.reminderDays)).join('')) }),
    ], 'Umumiy')
      + listGroup([
        link('Kategoriyalar va limitlar', 'categories'),
        link('Daromad manbalari', 'incomeSources'),
        link('Takroriy to‘lovlar', 'recurring'),
        link('Rejali xarajatlar', 'planned'),
      ], 'Budget')
      + listGroup([link('Kartalar', 'cards'), link('Qarzlar', 'debts'), link('Fondlar', 'funds'), link('Barcha tranzaksiyalar', 'transactions')], 'Hisoblar')
      + listGroup([
        row({ title: '💾 Zaxira nusxa olish (JSON)', attrs: act('export-json') }),
        `<label class="row"><span class="row-main"><span class="row-title">📥 Zaxiradan tiklash</span></span>
          <input type="file" accept="application/json,.json" data-import hidden></label>`,
        row({ title: '📄 Excel uchun eksport (CSV)', attrs: act('export-csv') }),
      ], 'Ma’lumotlar', `Oxirgi zaxira: ${st.lastBackup ? fullDate(st.lastBackup) : 'hali olinmagan'}. Ma’lumotlar faqat shu telefonda saqlanadi — ilovani o‘chirsangiz yoki Safari ma’lumotlarini tozalasangiz yo‘qoladi. Zaxirani «Fayllar» yoki iCloud Drive’ga saqlab qo‘ying.`)
      + listGroup([
        row({ title: 'Boshlang‘ich sozlashni qayta ochish', attrs: act('reopen-onboarding') }),
        row({ title: '<span class="neg">Barcha ma’lumotlarni o‘chirish</span>', attrs: act('reset-all') }),
      ], '', 'Budget Manager 1.0 · Internet talab qilinmaydi. Karta raqami, CVV va bank parollari saqlanmaydi.'),
  };
}

function categoriesScreen(L) {
  const parts = L.groups.map(g => {
    const kids = L.children(g);
    const lim = c => (c.limitType === 'percent' ? `${c.defaultPercent}%` : short(c.defaultLimit));
    const rows = [
      row({ icon: g.icon, title: `<b>${esc(g.name)}</b>${g.active ? '' : ' <span class="muted small">o‘chirilgan</span>'}`,
        sub: g.groupLevel ? 'Limit butun guruhga' : '', right: g.groupLevel ? `<span class="num muted">${lim(g)}</span>` : '',
        attrs: act('sheet', { sheet: 'category', id: g.id }), chevron: true }),
      ...kids.map(c => row({
        icon: c.icon, cls: 'indent',
        title: `${esc(c.name)}${c.active ? '' : ' <span class="muted small">o‘chirilgan</span>'}`,
        sub: c.kind !== 'expense' ? { debt: 'Qarz to‘lovi', fund: 'Sinking fond', emergency: 'Emergency fond' }[c.kind] : (c.trackDaily ? 'Kunlik limit' : ''),
        right: g.groupLevel ? '' : `<span class="num muted">${lim(c)}</span>`,
        attrs: act('sheet', { sheet: 'category', id: c.id }), chevron: true,
      })),
      row({ title: '<span class="accent">＋ Subkategoriya</span>', attrs: act('sheet', { sheet: 'category', parent: g.id }) }),
    ];
    return listGroup(rows);
  });
  return {
    title: 'Kategoriyalar',
    actions: `<button type="button" class="text-btn" ${act('sheet', { sheet: 'category', group: 1 })}>＋ Guruh</button>`,
    html: parts.join('') + '<p class="hint">Bu yerdagi limitlar — standart shablon. Aniq oy limitini Budget ekranida o‘zgartirasiz.</p>',
  };
}

function incomeSourcesList(L) {
  const list = S().incomeSources.slice().sort((a, b) => a.day - b.day);
  return (list.length ? listGroup(list.map(s => row({
    icon: '💵', title: esc(s.name) + (s.active ? '' : ' <span class="muted small">faol emas</span>'),
    sub: `Har oy ${s.day}-kuni${find('cards', s.cardId) ? ' · ' + esc(find('cards', s.cardId).name) : ''}`,
    right: `<span class="num">${money(s.amount)}</span>`, attrs: act('sheet', { sheet: 'incomeSource', id: s.id }),
  })), '', `Oylik jami kutilayotgan daromad: <b>${money(L.expectedIncome)}</b>`) : empty('Masalan: «Maosh (1-qism)» — 7 400 000, 1-kuni; «Maosh (2-qism)» — 4 800 000, 15-kuni.'))
    + `<button type="button" class="btn block" ${act('sheet', { sheet: 'incomeSource' })}>＋ Daromad manbai</button>`;
}

function recurringList(L) {
  const list = S().recurring;
  return (list.length ? listGroup(list.map(r => row({
    icon: L.category(r.categoryId)?.icon || '🔁',
    title: esc(r.name) + (r.active ? '' : ' <span class="muted small">faol emas</span>'),
    sub: (r.interval > 1 ? `Har ${r.interval} oyda, ${r.day}-kuni` : `Har oy ${r.day}-kuni`)
      + (find('cards', r.cardId) ? ' · ' + esc(find('cards', r.cardId).name) : ''),
    right: `<span class="num">${money(r.amount)}</span>`, attrs: act('sheet', { sheet: 'recurring', id: r.id }),
  })), '', 'Belgilangan kuni avtomatik ravishda xarajat sifatida yoziladi. Bir oyda ikki marta yozilmaydi.')
    : empty('Masalan: Ijara 600 000 — har oy 1-kuni.'))
    + `<button type="button" class="btn block" ${act('sheet', { sheet: 'recurring' })}>＋ Takroriy to‘lov</button>`;
}

function plannedScreen(L) {
  const open = S().planned.filter(p => !p.done).sort((a, b) => a.date.localeCompare(b.date));
  const done = S().planned.filter(p => p.done).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
  const pRow = p => row({
    icon: L.category(p.categoryId)?.icon || '📅', title: esc(p.title),
    sub: fullDate(p.date) + (L.fundMap.get(p.fundId) ? ' · ' + esc(L.fundMap.get(p.fundId).name) : ''),
    right: `<span class="num">${short(p.amount)}</span>` + (p.done ? '' : `<span class="pill" ${act('sheet', { sheet: 'expense', planned: p.id })}>Bajarildi</span>`),
    attrs: act('sheet', { sheet: 'planned', id: p.id }),
  });
  return {
    title: 'Rejali xarajatlar',
    actions: `<button type="button" class="icon-btn" ${act('sheet', { sheet: 'planned' })} aria-label="Qo‘shish">＋</button>`,
    html: listGroup(open.length ? open.map(pRow) : [empty('Rejali xarajat yo‘q')], 'Kelayotgan',
      '«Bajarildi» bosilganda haqiqiy summani kiritasiz va u xarajat sifatida yoziladi.')
      + (done.length ? listGroup(done.map(pRow), 'Bajarilgan') : ''),
  };
}

function missing() { return { title: 'Topilmadi', html: empty('Bu yozuv o‘chirilgan.') }; }

const SCREENS = {
  home: dashboard,
  budget: budgetScreen,
  accounts: accountsScreen,
  stats: statsScreen,
  settings: settingsScreen,
  transactions: transactionsScreen,
  categories: categoriesScreen,
  card: cardDetail,
  debt: debtDetail,
  fund: fundDetail,
  planned: plannedScreen,
  incomeSources: L => ({ title: 'Daromad manbalari', html: incomeSourcesList(L) }),
  recurring: L => ({ title: 'Takroriy to‘lovlar', html: recurringList(L) }),
  cards: L => ({ title: 'Kartalar', ...cardsList(L) }),
  debts: L => ({ title: 'Qarzlar', ...debtsList(L) }),
  funds: L => ({ title: 'Fondlar', ...fundsList(L) }),
};

// ---------- Onboarding ----------

const STEPS = [
  ['Xush kelibsiz', 'Avval valyutani tanlang. Keyingi qadamlarning hammasini keyin Sozlamalar orqali o‘zgartirish mumkin.'],
  ['Daromad', 'Har oy qachon va qancha daromad tushishini kiriting.'],
  ['Kartalar', 'Kartalaringiz: daromad tushadigan, kundalik xarajat va rejali to‘lovlar kartasi. Hozirgi balansini kiriting.'],
  ['Qarzlar', 'Kredit va qarzlaringiz: hozirgi qoldiq, foiz va to‘lov sanasi.'],
  ['Budget limitlari', 'Har bir kategoriya uchun oylik limit. 0 — limit yo‘q. Entertainment guruhida limit butun guruhga qo‘yiladi.'],
  ['Fondlar', 'Emergency fond (maqsad, masalan 3 000 000) va Sinking fondlar: uyga borish, to‘ylar, sovg‘alar — oylik ajratma bilan.'],
  ['Takroriy to‘lovlar', 'Ijara, kurs, telefon kabi har oy takrorlanadigan to‘lovlar. Ular avtomatik yoziladi.'],
];

function onboarding(L) {
  const step = ui.step;
  const [title, text] = STEPS[step];
  let body = '';
  switch (step) {
    case 0:
      body = listGroup([row({ title: 'Valyuta', right: `<select class="inline-select" data-setting="currency">${CURRENCIES.map(c =>
        option(c.code, `${c.code} — ${c.name}`, c.code === S().settings.currency)).join('')}</select>` })])
        + listGroup([`<label class="row"><span class="row-main"><span class="row-title">📥 Zaxiradan tiklash</span>
          <span class="row-sub">Oldin ishlatgan bo‘lsangiz, JSON zaxira faylni tanlang</span></span>
          <input type="file" accept="application/json,.json" data-import hidden></label>`]);
      break;
    case 1: body = incomeSourcesList(L); break;
    case 2: body = cardsList(L, 'edit').html + `<button type="button" class="btn block" ${act('sheet', { sheet: 'card' })}>＋ Karta</button>`; break;
    case 3: body = debtsList(L, 'edit').html + `<button type="button" class="btn block" ${act('sheet', { sheet: 'debt' })}>＋ Qarz</button>`; break;
    case 4: {
      const income = L.expectedIncome;
      const total = sum(L.units, c => (c.limitType === 'percent' ? percentOf(income, c.defaultPercent) : c.defaultLimit));
      body = listGroup([
        row({ title: 'Kutilayotgan daromad', right: `<span class="num">${money(income)}</span>` }),
        row({ title: 'Taqsimlangan', right: `<span class="num ${income > 0 && total > income ? 'neg' : ''}">${money(total)}</span>` }),
      ]) + L.groups.filter(g => g.active).map(g => {
        const units = L.unitsIn(g).filter(c => c.kind === 'expense' || c.kind === 'debt');
        if (!units.length) return '';
        return listGroup(units.map(c => `<label class="row"><span class="row-icon">${esc(c.icon)}</span>
          <span class="row-main"><span class="row-title">${esc(c.name)}</span></span>
          <input class="inline-amount" inputmode="numeric" data-amount data-limit-cat="${c.id}" placeholder="0"
            value="${c.defaultLimit ? plain(c.defaultLimit) : ''}"></label>`), `${esc(g.icon)} ${esc(g.name)}`);
      }).join('') + '<p class="hint">Kategoriya qo‘shish/o‘zgartirish: keyin Budget → Kategoriyalar.</p>';
      break;
    }
    case 5: body = fundsList(L, 'edit').html + `<button type="button" class="btn block" ${act('sheet', { sheet: 'fund' })}>＋ Sinking fond</button>`; break;
    default: body = recurringList(L);
  }
  const last = step === STEPS.length - 1;
  return `<div class="onboarding">
    <header class="topbar"><h1>${step + 1}/${STEPS.length} · ${esc(title)}</h1></header>
    <div class="progress"><i style="width:${((step + 1) / STEPS.length) * 100}%"></i></div>
    <main id="main"><p class="lead">${esc(text)}</p>${body}</main>
    <footer class="ob-footer">
      ${step > 0 ? `<button type="button" class="btn" ${act('ob-step', { delta: -1 })}>Orqaga</button>` : '<span></span>'}
      <button type="button" class="btn primary" ${act(last ? 'ob-finish' : 'ob-step', { delta: 1 })}>${last ? 'Boshlash' : 'Keyingi'}</button>
    </footer></div>`;
}

// ---------- Formalar (pastdan chiquvchi oynalar) ----------

const FORMS = {
  quick: {
    render: () => ({
      title: 'Qo‘shish', noSubmit: true,
      body: listGroup([
        row({ icon: '💸', title: 'Xarajat', attrs: act('sheet', { sheet: 'expense' }), chevron: true }),
        row({ icon: '💵', title: 'Daromad', attrs: act('sheet', { sheet: 'income' }), chevron: true }),
        row({ icon: '💳', title: 'Qarz to‘lovi', attrs: act('sheet', { sheet: 'debtPay' }), chevron: true }),
        row({ icon: '🔁', title: 'Kartalararo o‘tkazma', attrs: act('sheet', { sheet: 'transfer' }), chevron: true }),
        row({ icon: '📅', title: 'Rejali xarajat', attrs: act('sheet', { sheet: 'planned' }), chevron: true }),
      ]),
    }),
  },

  expense: {
    render(L, p) {
      const e = find('expenses', p.id);
      const planned = find('planned', p.planned);
      const v = e || {
        amount: planned?.amount || 0, categoryId: planned?.categoryId || '', cardId: L.defaultCard?.id || '',
        fundId: planned?.fundId || p.fund || '', date: today(), note: planned?.title || '',
      };
      const cats = L.expenseCategories.slice();
      const current = L.category(v.categoryId);
      if (current && !cats.includes(current)) cats.unshift(current);
      return {
        title: e ? 'Xarajatni tahrirlash' : 'Yangi xarajat',
        body: amountInput('amount', v.amount, `Summa, ${symbol()}`, { autofocus: !e, big: true })
          + `<div class="field-label">Kategoriya</div><div class="chips">${cats.map(c =>
            `<label class="chip"><input type="radio" name="categoryId" value="${c.id}" ${c.id === v.categoryId ? 'checked' : ''}>
            <span><b>${esc(c.icon)}</b>${esc(c.name)}</span></label>`).join('')}</div>`
          + fieldset(
            selectInput('cardId', 'Karta', cardOptions(L, v.cardId)),
            selectInput('fundId', 'Fonddan to‘lash', fundOptions(L, v.fundId)),
            dateInput('date', v.date),
            textInput('note', v.note, 'Izoh', 'ixtiyoriy'),
          )
          + hint('Fonddan to‘langan xarajat oylik limitga ta’sir qilmaydi — fond qoldig‘idan ayriladi.', 'fundId!=')
          + (e ? deleteButton('expense', e.id, 'Xarajatni o‘chirish') : ''),
      };
    },
    submit(fd, p) {
      const warnings = store.saveExpense({
        id: p.id || undefined,
        amount: parseAmount(fd.get('amount')),
        categoryId: fd.get('categoryId') || null,
        cardId: fd.get('cardId') || null,
        fundId: fd.get('fundId') || null,
        date: fd.get('date') || today(),
        note: fd.get('note'),
      });
      const planned = find('planned', p.planned);
      if (planned) planned.done = true;
      return warnings.length ? `⚠️ ${warnings.join('\n')}` : 'Saqlandi ✓';
    },
  },

  income: {
    render(L, p) {
      const i = find('incomes', p.id);
      const src = find('incomeSources', p.source);
      const v = i || { amount: src?.amount || 0, sourceId: src?.id || '', source: '', cardId: src?.cardId || L.incomeCard?.id || '', date: today(), note: '' };
      const sources = S().incomeSources;
      return {
        title: i ? 'Daromadni tahrirlash' : 'Daromad',
        body: amountInput('amount', v.amount, `Summa, ${symbol()}`, { autofocus: !i && !src, big: true })
          + fieldset(
            selectInput('sourceId', 'Manba', option('', 'Boshqa', !v.sourceId) + sources.map(s => option(s.id, s.name, s.id === v.sourceId)).join('')),
            textInput('source', v.sourceId ? '' : v.source, 'Manba nomi', 'Maosh, bonus...', 'sourceId='),
            selectInput('cardId', 'Qaysi kartaga', cardOptions(L, v.cardId)),
            dateInput('date', v.date),
            textInput('note', v.note, 'Izoh', 'ixtiyoriy'),
          ) + (i ? deleteButton('income', i.id) : ''),
      };
    },
    submit(fd, p) {
      store.saveIncome({
        id: p.id || undefined, amount: parseAmount(fd.get('amount')), sourceId: fd.get('sourceId') || null,
        source: fd.get('source'), cardId: fd.get('cardId') || null, date: fd.get('date') || today(), note: fd.get('note'),
      });
      return 'Daromad yozildi ✓';
    },
  },

  incomeSource: {
    render(L, p) {
      const s = find('incomeSources', p.id);
      const v = s || { name: '', amount: 0, day: 1, cardId: L.incomeCard?.id || '', active: true };
      return {
        title: s ? 'Daromad manbai' : 'Yangi daromad manbai',
        body: fieldset(
          textInput('name', v.name, 'Nomi', 'Maosh — 1-qism'),
          amountInput('amount', v.amount, 'Kutilayotgan summa'),
          selectInput('day', 'Tushadigan kun', dayOptions(v.day)),
          selectInput('cardId', 'Qaysi kartaga', cardOptions(L, v.cardId)),
          toggle('active', v.active, 'Faol'),
        ) + (s ? deleteButton('incomeSource', s.id) : ''),
      };
    },
    submit(fd, p) {
      store.saveIncomeSource({ id: p.id || undefined, name: fd.get('name'), amount: parseAmount(fd.get('amount')),
        day: Number(fd.get('day')), cardId: fd.get('cardId') || null, active: bool(fd, 'active') });
    },
  },

  card: {
    render(L, p) {
      const c = find('cards', p.id);
      const v = c || { name: '', bank: '', last4: '', opening: 0, lowThreshold: 0, isIncome: false, isDefault: !S().cards.length, active: true };
      return {
        title: c ? 'Karta' : 'Yangi karta',
        body: fieldset(
          textInput('name', v.name, 'Nomi', 'Main, Basic, 6418...'),
          textInput('bank', v.bank, 'Bank', 'ixtiyoriy'),
          field('Oxirgi 4 raqam', `<input name="last4" inputmode="numeric" maxlength="4" value="${esc(v.last4 || '')}" placeholder="ixtiyoriy">`),
        ) + hint('To‘liq karta raqami, CVV va bank paroli saqlanmaydi.')
          + fieldset(
            amountInput('opening', v.opening, c ? 'Boshlang‘ich balans' : 'Hozirgi balans'),
            amountInput('lowThreshold', v.lowThreshold, 'Kam balans ogohlantirishi'),
          ) + hint('Keyingi balans daromad, xarajat, o‘tkazma va qarz to‘lovlaridan avtomatik hisoblanadi.')
          + fieldset(
            toggle('isIncome', v.isIncome, 'Daromad tushadigan karta'),
            toggle('isDefault', v.isDefault, 'Kundalik xarajat kartasi (standart)'),
            toggle('active', v.active, 'Faol'),
          ) + (c ? deleteButton('card', c.id, 'Kartani o‘chirish') : ''),
      };
    },
    submit(fd, p) {
      store.saveCard({ id: p.id || undefined, name: fd.get('name'), bank: (fd.get('bank') || '').trim(), last4: fd.get('last4'),
        opening: parseAmount(fd.get('opening')), lowThreshold: parseAmount(fd.get('lowThreshold')),
        isIncome: bool(fd, 'isIncome'), isDefault: bool(fd, 'isDefault'), active: bool(fd, 'active') });
    },
  },

  transfer: {
    render(L) {
      const from = L.incomeCard;
      const to = L.activeCards.find(c => c.id !== from?.id);
      return {
        title: 'Kartalararo o‘tkazma',
        body: amountInput('amount', 0, `Summa, ${symbol()}`, { autofocus: true, big: true }) + fieldset(
          selectInput('fromId', 'Qayerdan', cardOptions(L, from?.id)),
          selectInput('toId', 'Qayerga', cardOptions(L, to?.id)),
          dateInput('date', today()),
          textInput('note', '', 'Izoh', 'ixtiyoriy'),
        ),
      };
    },
    submit(fd) {
      store.transfer({ amount: parseAmount(fd.get('amount')), fromId: fd.get('fromId'), toId: fd.get('toId'),
        date: fd.get('date') || today(), note: fd.get('note') });
      return 'O‘tkazma yozildi ✓';
    },
  },

  debt: {
    render(L, p) {
      const d = find('debts', p.id);
      const v = d || { name: '', starting: 0, original: 0, rate: '', dueDay: 0, minPayment: 0, multiple: false, note: '', active: true };
      return {
        title: d ? 'Qarz' : 'Yangi qarz',
        body: fieldset(
          textInput('name', v.name, 'Nomi', 'Uzum, TBC Bank, Shox...'),
          amountInput('starting', v.starting, d ? 'Qo‘shilgandagi qoldiq' : 'Hozirgi qoldiq'),
          amountInput('original', v.original, 'Dastlabki summa (ixtiyoriy)'),
          numberInput('rate', v.rate, 'Yillik foiz, %'),
        ) + (d ? hint('Joriy qoldiq to‘lovlardan avtomatik hisoblanadi.') : '')
          + fieldset(
            toggle('hasDue', v.dueDay > 0, 'Aniq to‘lov sanasi bor'),
            selectInput('dueDay', 'To‘lov kuni', dayOptions(v.dueDay || 1), 'hasDue=on'),
            amountInput('minPayment', v.minPayment, 'Minimal oylik to‘lov (ixtiyoriy)'),
            toggle('multiple', v.multiple, 'Oyiga bir necha marta to‘lanadi'),
          ) + fieldset(textInput('note', v.note, 'Izoh', 'ixtiyoriy'), toggle('active', v.active, 'Faol'))
          + (d ? deleteButton('debt', d.id, 'Qarzni o‘chirish') : ''),
      };
    },
    submit(fd, p) {
      store.saveDebt({ id: p.id || undefined, name: fd.get('name'), starting: parseAmount(fd.get('starting')),
        original: parseAmount(fd.get('original')), rate: parseFloat(String(fd.get('rate') || '0').replace(',', '.')) || 0,
        dueDay: bool(fd, 'hasDue') ? Number(fd.get('dueDay')) : 0, minPayment: parseAmount(fd.get('minPayment')),
        multiple: bool(fd, 'multiple'), note: (fd.get('note') || '').trim(), active: bool(fd, 'active') });
    },
  },

  debtPay: {
    render(L, p) {
      const adjust = !!p.adjust;
      const debtId = p.debt || L.activeDebts[0]?.id;
      return {
        title: adjust ? 'Qoldiqni tuzatish' : 'Qarz to‘lovi',
        submitLabel: 'Tasdiqlash',
        body: fieldset(selectInput('debtId', 'Qarz', L.activeDebts.map(d =>
          option(d.id, `${d.name} · qoldiq ${short(L.debtRemaining(d))}`, d.id === debtId)).join('')))
          + (adjust ? segmented('direction', [['up', 'Oshdi (foiz, jarima)'], ['down', 'Kamaydi']], 'up') : '')
          + amountInput('amount', 0, `Summa, ${symbol()}`, { autofocus: true, big: true })
          + fieldset(
            adjust ? '' : selectInput('cardId', 'Qaysi kartadan', cardOptions(L, L.incomeCard?.id)),
            dateInput('date', today()),
            textInput('note', '', 'Izoh', 'ixtiyoriy'),
          ) + hint(adjust ? 'Tuzatish kartadan pul yechmaydi, faqat qarz qoldig‘ini o‘zgartiradi.'
            : 'Budget — reja. To‘lov faqat shu yerda tasdiqlaganingizda yoziladi.'),
      };
    },
    submit(fd, p) {
      const amount = parseAmount(fd.get('amount'));
      if (p.adjust) {
        store.adjustDebt({ debtId: fd.get('debtId'), delta: fd.get('direction') === 'down' ? -amount : amount,
          date: fd.get('date') || today(), note: fd.get('note') });
        return 'Qoldiq tuzatildi ✓';
      }
      store.payDebt({ debtId: fd.get('debtId'), amount, cardId: fd.get('cardId') || null, date: fd.get('date') || today(), note: fd.get('note') });
      const d = find('debts', fd.get('debtId'));
      return `To‘lov yozildi ✓ Yangi qoldiq: ${money(new Ledger(S()).debtRemaining(d))}`;
    },
  },

  fund: {
    render(L, p) {
      const f = find('funds', p.id);
      const emergency = f ? f.emergency : !!p.emergency;
      const v = f || { name: emergency ? 'Emergency' : '', icon: emergency ? '🛟' : '🏦', target: 0, opening: 0, targetDate: null, active: true };
      return {
        title: f ? 'Fond' : 'Yangi fond',
        body: fieldset(
          textInput('name', v.name, 'Nomi', 'Uyga borish, To‘ylar, Sovg‘alar...'),
          textInput('icon', v.icon, 'Ikonka (emoji)'),
          toggle('emergency', emergency, 'Emergency fond'),
        ) + fieldset(
          amountInput('target', v.target, 'Maqsad summa (ixtiyoriy)'),
          amountInput('monthly', f ? L.fundMonthly(f) : 0, 'Oylik ajratma'),
          f ? '' : amountInput('opening', 0, 'Hozir fondda bor summa'),
          toggle('hasDate', !!v.targetDate, 'Muddat belgilash'),
          dateInput('targetDate', v.targetDate || today(), 'Muddat', 'hasDate=on'),
          f ? toggle('active', v.active, 'Faol') : '',
        ) + hint('Oylik ajratma Budget’da «Moliya» guruhida alohida qator bo‘lib ko‘rinadi.')
          + (f ? deleteButton('fund', f.id, 'Fondni o‘chirish') : ''),
      };
    },
    submit(fd, p) {
      const fields = {
        id: p.id || undefined, name: fd.get('name'), icon: (fd.get('icon') || '🏦').trim() || '🏦',
        emergency: bool(fd, 'emergency'), target: parseAmount(fd.get('target')), monthly: parseAmount(fd.get('monthly')),
        targetDate: bool(fd, 'hasDate') ? fd.get('targetDate') : null,
      };
      if (p.id) fields.active = bool(fd, 'active');
      else fields.opening = parseAmount(fd.get('opening'));
      store.saveFund(fields);
    },
  },

  fundTx: {
    render(L, p) {
      const f = find('funds', p.fund);
      return {
        title: f ? `${f.icon} ${f.name}` : 'Fond',
        body: segmented('mode', [['add', 'Hissa qo‘shish'], ['withdraw', 'Olib qo‘yish']], 'add')
          + amountInput('amount', 0, `Summa, ${symbol()}`, { autofocus: true, big: true })
          + fieldset(dateInput('date', today()), textInput('note', '', 'Izoh', 'ixtiyoriy'))
          + hint(`Joriy: ${money(f ? L.fundBalance(f) : 0)}`, 'mode=add')
          + hint('Xarajatsiz olib qo‘yish (masalan, boshqa fondga ko‘chirish). Xarajat bo‘lsa «Fonddan xarajat»ni ishlating.', 'mode=withdraw'),
      };
    },
    submit(fd, p) {
      const amount = parseAmount(fd.get('amount'));
      if (!amount) throw new Error('Summani kiriting (0 dan katta bo‘lishi kerak).');
      store.addFundTx({ fundId: p.fund, amount: fd.get('mode') === 'withdraw' ? -amount : amount, date: fd.get('date') || today(), note: fd.get('note') });
    },
  },

  allocation: {
    render(L, p) {
      const c = L.category(p.cat);
      const a = L.allocation(c, p.key) || { type: c.limitType, amount: c.defaultLimit, percent: c.defaultPercent };
      const income = L.planningIncome(p.key);
      return {
        title: `${c.icon} ${c.name}`,
        body: segmented('type', [['fixed', 'Summa'], ['percent', 'Daromaddan foiz']], a.type || 'fixed')
          + fieldset(
            amountInput('amount', a.amount, `${monthTitle(p.key)} limiti`, { when: 'type=fixed' }),
            numberInput('percent', a.percent || '', 'Foiz, %', 'type=percent'),
          ) + hint(`Daromad: ${money(income)}. Masalan, 20% = ${money(percentOf(income, 20))}`, 'type=percent')
          + fieldset(
            row({ title: 'Shu oy haqiqiy', right: `<span class="num">${money(L.actual(c, p.key))}</span>` }),
            c.kind === 'expense' ? toggle('trackDaily', c.trackDaily, 'Kunlik limitni ko‘rsatish') : '',
            toggle('template', false, 'Standart shablonga ham saqlash'),
          ) + hint('Shablon keyingi oylarni «Shablondan» yaratishda ishlatiladi.'),
      };
    },
    submit(fd, p) {
      const c = S().categories.find(x => x.id === p.cat);
      if (c.kind === 'expense') c.trackDaily = bool(fd, 'trackDaily');
      store.setAllocation(p.cat, p.key, {
        type: fd.get('type'), amount: parseAmount(fd.get('amount')),
        percent: parseFloat(String(fd.get('percent') || '0').replace(',', '.')) || 0,
      }, bool(fd, 'template'));
      return 'Limit yangilandi ✓';
    },
  },

  category: {
    render(L, p) {
      const c = L.category(p.id);
      const v = c || { name: '', icon: '📁', parentId: p.parent || '', kind: 'expense', limitType: 'fixed', defaultLimit: 0,
        defaultPercent: 0, trackDaily: false, groupLevel: false, active: true };
      const hasKids = c ? L.children(c).length > 0 : false;
      const parents = L.groups.filter(g => g.id !== c?.id);
      return {
        title: c ? 'Kategoriya' : (p.group ? 'Yangi guruh' : 'Yangi kategoriya'),
        body: fieldset(
          textInput('name', v.name, 'Nomi'),
          textInput('icon', v.icon, 'Ikonka (emoji)'),
          field('Joylashuvi', `<select name="parentId" ${hasKids ? 'disabled' : ''}>${option('', '— Asosiy guruh', !v.parentId)}${parents.map(g => option(g.id, `${g.icon} ${g.name}`, g.id === v.parentId)).join('')}</select>`),
          v.fundId ? row({ title: 'Turi', right: v.kind === 'emergency' ? 'Emergency fond' : 'Sinking fond' })
            : selectInput('kind', 'Turi', option('expense', 'Xarajat', v.kind === 'expense') + option('debt', 'Qarz to‘lovi', v.kind === 'debt'), 'parentId!='),
          toggle('groupLevel', v.groupLevel, 'Limit butun guruhga', 'parentId='),
        ) + hint('«Limit butun guruhga» yoqilsa (masalan, Entertainment), subkategoriyalar alohida limitga ega bo‘lmaydi.', 'parentId=')
          + `<div data-when="parentId!=|groupLevel=on"><div class="field-label">Standart oylik limit (shablon)</div>`
          + segmented('limitType', [['fixed', 'Summa'], ['percent', 'Foiz']], v.limitType)
          + fieldset(
            amountInput('defaultLimit', v.defaultLimit, 'Summa', { when: 'limitType=fixed' }),
            numberInput('defaultPercent', v.defaultPercent || '', 'Foiz, %', 'limitType=percent'),
            toggle('trackDaily', v.trackDaily, 'Kunlik limitni ko‘rsatish'),
          ) + '</div>'
          + fieldset(toggle('active', v.active, 'Faol'))
          + (c ? hint('O‘chirilsa xarajatlar o‘chmaydi, «Kategoriyasiz» bo‘lib qoladi. Vaqtincha yashirish uchun «Faol»ni o‘chiring.')
            + deleteButton('category', c.id, 'Kategoriyani o‘chirish') : ''),
      };
    },
    submit(fd, p) {
      const c = S().categories.find(x => x.id === p.id);
      const parentId = c && fd.get('parentId') === null ? c.parentId : (fd.get('parentId') || null);
      store.saveCategory({
        id: p.id || undefined, name: fd.get('name'), icon: (fd.get('icon') || '📁').trim() || '📁', parentId,
        kind: c?.fundId ? c.kind : (parentId ? (fd.get('kind') || 'expense') : 'expense'),
        groupLevel: bool(fd, 'groupLevel'), limitType: fd.get('limitType') || 'fixed',
        defaultLimit: parseAmount(fd.get('defaultLimit')),
        defaultPercent: parseFloat(String(fd.get('defaultPercent') || '0').replace(',', '.')) || 0,
        trackDaily: bool(fd, 'trackDaily'), active: bool(fd, 'active'),
      });
    },
  },

  recurring: {
    render(L, p) {
      const r = find('recurring', p.id);
      const v = r || { name: '', amount: 0, categoryId: '', cardId: L.defaultCard?.id || '', day: 1, interval: 1, active: true };
      return {
        title: r ? 'Takroriy to‘lov' : 'Yangi takroriy to‘lov',
        body: fieldset(
          textInput('name', v.name, 'Nomi', 'Ijara, Ingliz tili...'),
          amountInput('amount', v.amount, 'Summa'),
          selectInput('categoryId', 'Kategoriya', categoryOptions(L, v.categoryId)),
          selectInput('cardId', 'Karta', cardOptions(L, v.cardId)),
        ) + fieldset(
          selectInput('day', 'Oyning kuni', dayOptions(v.day)),
          selectInput('interval', 'Takrorlanish', Array.from({ length: 12 }, (_, i) =>
            option(i + 1, i === 0 ? 'Har oy' : `Har ${i + 1} oyda`, i + 1 === v.interval)).join('')),
          r ? '' : toggle('thisMonth', false, 'Bu oy uchun ham yozish'),
          toggle('active', v.active, 'Faol'),
        ) + (r ? '' : hint('Yoqilsa, bu oyning to‘lovi ham yoziladi (kuni o‘tgan bo‘lsa — darhol). Bu oy to‘lovini qo‘lda kiritgan bo‘lsangiz, o‘chiq qoldiring.'))
          + (r ? deleteButton('recurring', r.id) : ''),
      };
    },
    submit(fd, p) {
      const fields = { id: p.id || undefined, name: fd.get('name'), amount: parseAmount(fd.get('amount')),
        categoryId: fd.get('categoryId') || null, cardId: fd.get('cardId') || null, day: Number(fd.get('day')),
        interval: Number(fd.get('interval')), active: bool(fd, 'active') };
      if (!p.id) fields.startMonth = bool(fd, 'thisMonth') ? currentMonth() : addMonths(currentMonth(), 1);
      store.saveRecurring(fields);
      if (S().settings.onboarded) {
        const n = store.generateRecurring();
        if (n) return `Saqlandi ✓ ${n} ta to‘lov yozildi`;
      }
    },
  },

  planned: {
    render(L, p) {
      const x = find('planned', p.id);
      const v = x || { title: '', date: today(), amount: 0, categoryId: '', fundId: '', note: '', done: false };
      return {
        title: x ? 'Rejali xarajat' : 'Yangi rejali xarajat',
        body: fieldset(
          textInput('title', v.title, 'Nomi', 'Masalan, do‘stimning to‘yi'),
          dateInput('date', v.date),
          amountInput('amount', v.amount, 'Taxminiy summa'),
        ) + fieldset(
          selectInput('categoryId', 'Kategoriya', categoryOptions(L, v.categoryId)),
          selectInput('fundId', 'Qaysi fonddan', fundOptions(L, v.fundId)),
          textInput('note', v.note, 'Izoh', 'ixtiyoriy'),
          x ? toggle('done', v.done, 'Bajarilgan') : '',
        ) + (x ? deleteButton('planned', x.id) : ''),
      };
    },
    submit(fd, p) {
      const fields = { id: p.id || undefined, title: fd.get('title'), date: fd.get('date') || today(),
        amount: parseAmount(fd.get('amount')), categoryId: fd.get('categoryId') || null, fundId: fd.get('fundId') || null,
        note: fd.get('note') };
      if (p.id) fields.done = bool(fd, 'done');
      store.savePlanned(fields);
    },
  },
};

// ---------- Render ----------

let lastRouteKey = '';

export function render() {
  const L = new Ledger(S());
  const app = document.getElementById('app');
  const scrollTop = window.scrollY;

  if (!S().settings.onboarded) {
    app.innerHTML = onboarding(L);
    restoreScroll(`ob-${ui.step}`, scrollTop);
    return;
  }

  const route = ui.stack[ui.stack.length - 1] || { name: ui.tab };
  const screen = (SCREENS[route.name] || dashboard)(L, route);
  const back = ui.stack.length
    ? `<button type="button" class="back-btn" ${act('back')}>‹ Orqaga</button>` : '';

  app.innerHTML = `
    <header class="topbar">
      <div class="topbar-row">${back}<span class="spacer"></span><div class="actions">${screen.actions || ''}</div></div>
      <h1>${esc(screen.title)}</h1>
    </header>
    <main id="main">${screen.html}</main>
    ${screen.fab && !ui.stack.length ? `<button type="button" class="fab" ${act('sheet', { sheet: 'expense' })}>＋ XARAJAT</button>` : ''}
    <nav class="tabbar">${TABS.map(([k, label, icon]) =>
      `<button type="button" class="${k === ui.tab ? 'on' : ''}" ${act('tab', { tab: k })}><span>${icon}</span>${label}</button>`).join('')}</nav>`;
  restoreScroll(`${ui.tab}/${route.name}/${route.id || ''}`, scrollTop);
}

/** Bir ekranda qolsak — aylantirish joyi saqlanadi, yangi ekranga o'tsak — tepadan boshlanadi. */
function restoreScroll(key, top) {
  window.scrollTo(0, key === lastRouteKey ? top : 0);
  lastRouteKey = key;
}

function openSheet(name, params = {}) {
  ui.sheet = { name, params };
  const root = document.getElementById('sheet-root');
  const L = new Ledger(S());
  const def = FORMS[name];
  const { title, body, submitLabel = 'Saqlash', noSubmit } = def.render(L, params);
  const content = noSubmit
    ? `<div class="sheet-body">${body}</div>`
    : `<form class="sheet-body" data-form="${name}" novalidate>${body}
        <p class="form-error" hidden></p>
        <div class="sheet-submit"><button type="submit" class="btn primary block">${esc(submitLabel)}</button></div>
      </form>`;
  root.innerHTML = `<div class="sheet-backdrop" ${act('close-sheet')}></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-head"><button type="button" class="text-btn" ${act('close-sheet')}>Bekor</button>
      <h3>${esc(title)}</h3><span class="sheet-head-pad"></span></div>${content}</div>`;
  document.body.classList.add('sheet-open');
  const form = root.querySelector('form');
  if (form) updateWhen(form);
  const auto = root.querySelector('[autofocus]');
  if (auto) auto.focus();
}

function closeSheet() {
  ui.sheet = null;
  document.getElementById('sheet-root').innerHTML = '';
  document.body.classList.remove('sheet-open');
}

/** data-when="name=value" / "name!=value", bir nechta shart "|" bilan (yoki). */
function updateWhen(form) {
  for (const el of form.querySelectorAll('[data-when]')) {
    const visible = el.dataset.when.split('|').some(cond => {
      const neg = cond.includes('!=');
      const [name, value] = cond.split(neg ? '!=' : '=');
      const input = form.elements[name];
      if (!input) return false;
      const current = input.type === 'checkbox' ? (input.checked ? 'on' : 'off') : (input.value ?? '');
      return neg ? current !== value : current === value;
    });
    el.hidden = !visible;
  }
}

let toastTimer;
export function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), text.startsWith('⚠️') ? 5000 : 2200);
}

function commit(message) {
  store.save();
  render();
  if (message) toast(message);
}

// ---------- Amallar ----------

const DELETERS = {
  expense: id => store.removeItem('expenses', id),
  income: id => store.removeItem('incomes', id),
  incomeSource: id => store.removeItem('incomeSources', id),
  card: id => store.deleteCard(id),
  transfer: id => store.removeItem('transfers', id),
  debt: id => store.deleteDebt(id),
  debtPayment: id => store.removeItem('debtPayments', id),
  fund: id => store.deleteFund(id),
  fundTx: id => store.removeItem('fundTx', id),
  category: id => store.deleteCategory(id),
  recurring: id => store.removeItem('recurring', id),
  planned: id => store.removeItem('planned', id),
};

const DELETE_TEXT = {
  card: 'Karta o‘chirilsinmi? Tranzaksiyalar o‘chmaydi, faqat kartasiz qoladi.',
  debt: 'Qarz va uning to‘lovlar tarixi o‘chirilsinmi? Yopilgan qarzni saqlash uchun «Faol»ni o‘chiring.',
  fund: 'Fond va hissalar tarixi o‘chirilsinmi? Fonddan qilingan xarajatlar oddiy xarajat bo‘lib qoladi.',
  category: 'Kategoriya (va subkategoriyalari) o‘chirilsinmi?',
};

const ACTIONS = {
  tab({ tab }) {
    if (ui.tab === tab && !ui.stack.length) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.tab = tab;
    ui.stack = [];
    render();
  },
  push({ route, id }) { ui.stack.push({ name: route, id }); render(); },
  back() { ui.stack.pop(); render(); },
  segment({ seg }) { ui.segment = seg; render(); },
  month({ target, delta }) {
    const k = `${target}Month`;
    ui[k] = addMonths(ui[k], Number(delta));
    render();
  },
  'tx-filter'({ filter }) { ui.txFilter = filter; render(); },
  sheet(d) {
    const { sheet, action, ...params } = d;
    openSheet(sheet, params);
  },
  'close-sheet'() { closeSheet(); },
  'create-month'({ key, source }) {
    store.createMonth(key, source);
    commit(`${monthTitle(key)} budgeti yaratildi ✓`);
  },
  contribute({ key }) {
    if (!confirm(`${monthTitle(key)} budgetidagi fond ajratmalari (hali o‘tkazilmagan qismi) fondlarga yozilsinmi?`)) return;
    const total = store.contributeMonthly(key);
    commit(total > 0 ? `Fondlarga ${money(total)} yozildi ✓` : 'Bu oy uchun hissalar allaqachon o‘tkazilgan.');
  },
  delete({ kind, id }) {
    if (!confirm(DELETE_TEXT[kind] || 'O‘chirilsinmi? Bu amalni qaytarib bo‘lmaydi.')) return;
    DELETERS[kind](id);
    closeSheet();
    const top = ui.stack[ui.stack.length - 1];
    if (top && top.id === id) ui.stack.pop();
    commit('O‘chirildi');
  },
  'hide-tip'() { S().settings.hideInstallTip = true; commit(); },
  'ob-step'({ delta }) {
    ui.step = Math.min(Math.max(ui.step + Number(delta), 0), STEPS.length - 1);
    render();
  },
  'ob-finish'() {
    store.finishOnboarding();
    ui.tab = 'home';
    ui.stack = [];
    commit('Tayyor! Budget yaratildi ✓');
  },
  'reopen-onboarding'() {
    if (!confirm('Boshlang‘ich sozlash qayta ochilsinmi? Ma’lumotlar o‘chmaydi.')) return;
    S().settings.onboarded = false;
    ui.step = 0;
    commit();
  },
  'reset-all'() {
    if (!confirm('BARCHA ma’lumotlar o‘chirilsinmi? Avval zaxira nusxa olganingizga ishonch hosil qiling.')) return;
    if (!confirm('Rostdan ham? Bu amalni qaytarib bo‘lmaydi.')) return;
    store.setState({});
    ui.step = 0;
    ui.stack = [];
    commit('Ma’lumotlar o‘chirildi');
  },
  'export-json'() {
    const name = `budget-zaxira-${today()}.json`;
    shareFile(name, JSON.stringify(S(), null, 1), 'application/json').then(ok => {
      if (ok) { S().settings.lastBackup = today(); commit('Zaxira tayyor ✓'); }
    });
  },
  'export-csv'() {
    shareFile(`budget-${today()}.csv`, buildCSV(), 'text/csv');
  },
};

async function shareFile(name, text, type) {
  const file = new File([type === 'text/csv' ? '﻿' + text : text], name, { type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return true;
    }
  } catch (err) {
    if (err && err.name === 'AbortError') return false;
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

function buildCSV() {
  const s = S();
  const L = new Ledger(s);
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const cardN = id => find('cards', id)?.name || '';
  const rows = [['Sana', 'Turi', 'Summa', 'Kategoriya', 'Karta', 'Fond/Qarz', 'Izoh']];
  for (const e of s.expenses) rows.push([e.date, 'Xarajat', -e.amount, L.category(e.categoryId)?.name, cardN(e.cardId), L.fundMap.get(e.fundId)?.name, e.note]);
  for (const i of s.incomes) rows.push([i.date, 'Daromad', i.amount, i.source, cardN(i.cardId), '', i.note]);
  for (const p of s.debtPayments) rows.push([p.date, p.adjustment ? 'Qarz tuzatish' : 'Qarz to‘lovi', p.adjustment ? p.amount : -p.amount, '', cardN(p.cardId), find('debts', p.debtId)?.name, p.note]);
  for (const t of s.transfers) rows.push([t.date, 'O‘tkazma', t.amount, '', `${cardN(t.fromId)} → ${cardN(t.toId)}`, '', t.note]);
  for (const f of s.fundTx) rows.push([f.date, 'Fond', f.amount, '', '', L.fundMap.get(f.fundId)?.name, f.note]);
  const header = rows.shift();
  rows.sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  return [header, ...rows].map(r => r.map(q).join(',')).join('\n');
}

async function importBackup(file) {
  try {
    const obj = JSON.parse(await file.text());
    store.validateBackup(obj);
    const n = obj.expenses.length;
    if (!confirm(`Zaxiradan tiklansinmi? (${n} ta xarajat). Hozirgi ma’lumotlar almashtiriladi.`)) return;
    store.setState(obj);
    setCurrency(S().settings.currency);
    ui.stack = [];
    commit('Zaxiradan tiklandi ✓');
  } catch (err) {
    toast(`⚠️ ${err.message || 'Faylni o‘qib bo‘lmadi'}`);
  }
}

// ---------- Hodisalar ----------

export function bindEvents() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    e.stopPropagation();
    fn({ ...el.dataset }, el);
  });

  document.addEventListener('submit', e => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const def = FORMS[form.dataset.form];
    try {
      const message = def.submit(new FormData(form), ui.sheet?.params || {}, form);
      closeSheet();
      commit(message || 'Saqlandi ✓');
    } catch (err) {
      const box = form.querySelector('.form-error');
      box.textContent = err.message;
      box.hidden = false;
      box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.matches('[data-amount]')) {
      const v = parseAmount(t.value);
      t.value = v ? plain(v) : '';
    }
    const form = t.closest('form');
    if (form) updateWhen(form);
  });

  document.addEventListener('change', e => {
    const t = e.target;
    const form = t.closest('form');
    if (form) {
      updateWhen(form);
      if (form.dataset.form === 'income' && t.name === 'sourceId') {
        const src = find('incomeSources', t.value);
        if (src) {
          form.elements.amount.value = plain(src.amount);
          if (src.cardId) form.elements.cardId.value = src.cardId;
        }
      }
      return;
    }
    if (t.dataset.setting) {
      const key = t.dataset.setting;
      S().settings[key] = key === 'currency' ? t.value : Number(t.value);
      if (key === 'currency') setCurrency(t.value);
      commit();
    } else if (t.dataset.limitCat) {
      // Qayta chizmaymiz — aks holda keyingi maydonga o'tganda klaviatura yopilib qoladi.
      const c = S().categories.find(x => x.id === t.dataset.limitCat);
      if (c) { c.limitType = 'fixed'; c.defaultLimit = parseAmount(t.value); store.save(); }
    } else if (t.matches('[data-import]') && t.files?.[0]) {
      importBackup(t.files[0]);
      t.value = '';
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && ui.sheet) closeSheet();
  });
}
