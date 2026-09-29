// Ma'lumotlar ombori (localStorage) va barcha o'zgartirish amallari.
// Hech qanday summa kodda yo'q — hammasi foydalanuvchi kiritgan ma'lumot.

import { Ledger } from './engine.js';
import { uid, today, currentMonth, monthOf, monthDate, addMonths, monthsBetween, money } from './util.js';

const KEY = 'budget-manager.v1';

export function emptyState() {
  return {
    version: 1,
    settings: { currency: 'UZS', onboarded: false, alertThreshold: 90, reminderDays: 2, lastBackup: null },
    categories: [],
    months: {},
    incomes: [],
    incomeSources: [],
    expenses: [],
    cards: [],
    transfers: [],
    debts: [],
    debtPayments: [],
    funds: [],
    fundTx: [],
    recurring: [],
    planned: [],
  };
}

export let state = emptyState();

/** Eski yoki qisman ma'lumotni joriy tuzilmaga keltiradi. */
function normalize(obj) {
  const base = emptyState();
  const s = { ...base, ...obj, settings: { ...base.settings, ...(obj?.settings || {}) } };
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(s[k])) s[k] = [];
  }
  if (!s.months || typeof s.months !== 'object') s.months = {};
  return s;
}

export function load(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem(KEY);
    state = raw ? normalize(JSON.parse(raw)) : emptyState();
  } catch {
    state = emptyState();
  }
  if (state.categories.length === 0) seedCategories();
  return state;
}

export function save(storage = globalThis.localStorage) {
  storage?.setItem(KEY, JSON.stringify(state));
}

/** Testlar va zaxiradan tiklash uchun. */
export function setState(obj) {
  state = normalize(obj);
  if (state.categories.length === 0) seedCategories();
  return state;
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.categories) || !Array.isArray(obj.expenses)) {
    throw new Error('Bu fayl Budget Manager zaxirasi emas.');
  }
}

const ledger = () => new Ledger(state);
const fail = message => { throw new Error(message); };
const requireAmount = n => { if (!(n > 0)) fail('Summani kiriting (0 dan katta bo‘lishi kerak).'); };
const requireName = s => { if (!String(s || '').trim()) fail('Nomini kiriting.'); };

/** Mavjud bo'lsa yangilaydi, bo'lmasa yaratadi. `defaults` faqat yangi yozuvga qo'llanadi. */
function upsert(collection, obj, defaults = {}) {
  const list = state[collection];
  if (obj.id) {
    const i = list.findIndex(x => x.id === obj.id);
    if (i >= 0) { list[i] = { ...list[i], ...obj }; return list[i]; }
  }
  const item = { ...defaults, ...obj, id: obj.id || uid() };
  list.push(item);
  return item;
}

export function removeItem(collection, id) {
  state[collection] = state[collection].filter(x => x.id !== id);
}

// ---------- Boshlang'ich kategoriyalar (limit = 0) ----------

const SEED = [
  { name: 'Kundalik', icon: '📅', children: [['Ovqat', '🍚', 'expense', true], ['Metro', '🚇'], ['Benzin', '⛽']] },
  { name: 'Majburiy', icon: '📌', children: [['Ijara', '🏠'], ['Ingliz tili', '📚'], ['Telefon', '📱'], ['Uyga', '👨‍👩‍👧']] },
  { name: 'Oila / Uy', icon: '🏡', children: [['Uyga borish', '🚌'], ['Sovg‘a', '🎁'], ['Uyda xarajat', '🛒']] },
  { name: 'Ijtimoiy', icon: '🤝', children: [['To‘y', '💍'], ['O‘tirish', '☕'], ['Do‘stlar', '👥']] },
  { name: 'Shaxsiy', icon: '🙂', children: [['Kiyim', '👕'], ['Mashina', '🚗'], ['Shaxsiy xarid', '🛍️']] },
  { name: 'Entertainment', icon: '🎉', groupLevel: true,
    children: [['Qizlar', '💐'], ['O‘tirish', '🍻'], ['Mashina', '🏎️'], ['O‘zim uchun', '✨'], ['Boshqa', '🎈']] },
  { name: 'Moliya', icon: '🏦', finance: true, children: [['Qarz', '💳', 'debt'], ['Buffer', '🛟']] },
];

function newCategory(fields) {
  return {
    id: uid(), name: '', icon: '📁', parentId: null, kind: 'expense',
    limitType: 'fixed', defaultLimit: 0, defaultPercent: 0,
    trackDaily: false, groupLevel: false, finance: false, active: true, sort: 0, fundId: null,
    ...fields,
  };
}

function seedCategories() {
  SEED.forEach((g, gi) => {
    const group = newCategory({ name: g.name, icon: g.icon, sort: gi, groupLevel: !!g.groupLevel, finance: !!g.finance });
    state.categories.push(group);
    g.children.forEach(([name, icon, kind = 'expense', trackDaily = false], ci) => {
      state.categories.push(newCategory({ name, icon, kind, trackDaily, parentId: group.id, sort: ci }));
    });
  });
}

// ---------- Budget oyi ----------

/** Yangi oy: 'previous' — oldingi oydan nusxa, 'template' — kategoriyalardagi standart limitlar. */
export function createMonth(key, source = 'template') {
  if (state.months[key]) return state.months[key];
  const prevKey = source === 'previous'
    ? Object.keys(state.months).filter(k => k < key).sort().pop()
    : null;
  const prev = prevKey ? state.months[prevKey] : null;
  const allocations = {};
  for (const unit of ledger().units) {
    const old = prev?.allocations?.[unit.id];
    allocations[unit.id] = old
      ? { ...old }
      : { type: unit.limitType, amount: unit.defaultLimit, percent: unit.defaultPercent };
  }
  state.months[key] = { allocations, created: today() };
  return state.months[key];
}

/** Limitni o'zgartirish — faqat ma'lumot, kod o'zgarmaydi. */
export function setAllocation(catId, key, { type, amount, percent }, saveAsTemplate = false) {
  const month = state.months[key] || createMonth(key, 'template');
  month.allocations[catId] = { type, amount: amount || 0, percent: percent || 0 };
  if (saveAsTemplate) {
    const cat = state.categories.find(c => c.id === catId);
    if (cat) Object.assign(cat, { limitType: type, defaultLimit: amount || 0, defaultPercent: percent || 0 });
  }
}

// ---------- Kategoriyalar ----------

export function saveCategory(fields) {
  requireName(fields.name);
  const isGroup = !fields.parentId;
  const data = { ...fields, name: fields.name.trim(), groupLevel: isGroup && !!fields.groupLevel };
  if (!data.id) {
    const siblings = state.categories.filter(c => (c.parentId || null) === (data.parentId || null));
    return upsert('categories', newCategory({ ...data, sort: siblings.length }));
  }
  return upsert('categories', data);
}

export function deleteCategory(id) {
  const ids = new Set([id, ...state.categories.filter(c => c.parentId === id).map(c => c.id)]);
  state.categories = state.categories.filter(c => !ids.has(c.id));
  for (const m of Object.values(state.months)) for (const i of ids) delete m.allocations?.[i];
}

// ---------- Xarajat va daromad ----------

/** Xarajatni saqlaydi, ogohlantirishlar ro'yxatini qaytaradi. */
export function saveExpense(fields) {
  requireAmount(fields.amount);
  if (!fields.categoryId) fail('Kategoriyani tanlang.');
  const e = upsert('expenses', { ...fields, note: (fields.note || '').trim() }, { recurringId: null, fundId: null });
  const L = ledger();
  const warnings = [];
  const card = L.cardMap.get(e.cardId);
  if (card && L.cardBalance(card) < 0) warnings.push(`${card.name} kartasi balansi manfiy: ${money(L.cardBalance(card))}`);
  const fund = L.fundMap.get(e.fundId);
  if (fund && L.fundBalance(fund) < 0) warnings.push(`${fund.name} fondida mablag‘ yetmaydi: ${money(L.fundBalance(fund))}`);
  return warnings;
}

export function saveIncome(fields) {
  requireAmount(fields.amount);
  const source = state.incomeSources.find(s => s.id === fields.sourceId);
  const name = source ? source.name : String(fields.source || '').trim();
  requireName(name);
  return upsert('incomes', { ...fields, source: name, sourceId: source ? source.id : null, note: (fields.note || '').trim() });
}

export function saveIncomeSource(fields) {
  requireName(fields.name);
  requireAmount(fields.amount);
  return upsert('incomeSources', { ...fields, name: fields.name.trim() }, { active: true });
}

// ---------- Kartalar ----------

export function saveCard(fields) {
  requireName(fields.name);
  const last4 = String(fields.last4 || '').replace(/\D/g, '');
  if (last4 && last4.length !== 4) fail('Faqat kartaning oxirgi 4 raqamini kiriting.');
  const card = upsert('cards', { ...fields, name: fields.name.trim(), last4 },
    { active: true, opening: 0, lowThreshold: 0, isIncome: false, isDefault: false, sort: state.cards.length });
  if (card.isDefault) for (const c of state.cards) if (c.id !== card.id) c.isDefault = false;
  return card;
}

export function deleteCard(id) {
  removeItem('cards', id);
  for (const coll of ['expenses', 'incomes', 'debtPayments', 'incomeSources', 'recurring']) {
    for (const x of state[coll]) if (x.cardId === id) x.cardId = null;
  }
  for (const t of state.transfers) {
    if (t.fromId === id) t.fromId = null;
    if (t.toId === id) t.toId = null;
  }
}

export function transfer(fields) {
  requireAmount(fields.amount);
  if (!fields.fromId || !fields.toId) fail('Ikkala kartani tanlang.');
  if (fields.fromId === fields.toId) fail('Bir kartadan o‘sha kartaga o‘tkazib bo‘lmaydi.');
  return upsert('transfers', { ...fields, note: (fields.note || '').trim() });
}

// ---------- Qarzlar ----------

export function saveDebt(fields) {
  requireName(fields.name);
  requireAmount(fields.starting);
  return upsert('debts', { ...fields, name: fields.name.trim(), original: fields.original || fields.starting },
    { active: true, rate: 0, dueDay: 0, minPayment: 0, multiple: false, note: '', sort: state.debts.length });
}

export function deleteDebt(id) {
  removeItem('debts', id);
  state.debtPayments = state.debtPayments.filter(p => p.debtId !== id);
}

/** Budget — reja, to'lov — real tranzaksiya: faqat tasdiqlanganda yoziladi. */
export function payDebt({ debtId, amount, cardId, date, note }) {
  const debt = state.debts.find(d => d.id === debtId);
  if (!debt) fail('Qarzni tanlang.');
  requireAmount(amount);
  const remaining = ledger().debtRemaining(debt);
  if (amount > remaining) fail(`To‘lov qolgan qarzdan oshmasligi kerak (qoldiq: ${money(remaining)}).`);
  return upsert('debtPayments', { debtId, amount, cardId: cardId || null, date, note: (note || '').trim(), adjustment: false });
}

/** Qoldiqni tuzatish: foiz qo'shildi (+) yoki kamaydi (−). */
export function adjustDebt({ debtId, delta, date, note }) {
  const debt = state.debts.find(d => d.id === debtId);
  if (!debt) fail('Qarzni tanlang.');
  if (!delta) fail('Summani kiriting (0 dan katta bo‘lishi kerak).');
  if (ledger().debtRemaining(debt) + delta < 0) fail('Qarz qoldig‘i manfiy bo‘lib qoladi.');
  return upsert('debtPayments', { debtId, amount: delta, cardId: null, date, note: (note || '').trim(), adjustment: true });
}

// ---------- Fondlar ----------

function financeGroup() {
  let group = state.categories.find(c => !c.parentId && c.finance);
  if (!group) {
    group = newCategory({ name: 'Moliya', icon: '🏦', finance: true, sort: state.categories.filter(c => !c.parentId).length });
    state.categories.push(group);
  }
  return group;
}

/** Joriy oy budgeti bo'lsa, fond ajratmasini unga ham yozadi. */
function syncCurrentAllocation(cat) {
  const month = state.months[currentMonth()];
  if (month) month.allocations[cat.id] = { type: 'fixed', amount: cat.defaultLimit, percent: 0 };
}

export function saveFund(fields) {
  requireName(fields.name);
  const { monthly = 0, ...rest } = fields;
  const fund = upsert('funds', { ...rest, name: rest.name.trim() },
    { active: true, emergency: false, icon: '🏦', opening: 0, target: 0, targetDate: null, sort: state.funds.length });
  let cat = state.categories.find(c => c.fundId === fund.id);
  if (!cat) {
    cat = newCategory({ parentId: financeGroup().id, fundId: fund.id, sort: 100 + state.funds.length });
    state.categories.push(cat);
  }
  Object.assign(cat, {
    name: fund.name, icon: fund.icon, kind: fund.emergency ? 'emergency' : 'fund',
    active: fund.active, limitType: 'fixed', defaultLimit: monthly,
  });
  syncCurrentAllocation(cat);
  return fund;
}

export function deleteFund(id) {
  removeItem('funds', id);
  state.fundTx = state.fundTx.filter(t => t.fundId !== id);
  const cat = state.categories.find(c => c.fundId === id);
  if (cat) deleteCategory(cat.id);
  for (const e of state.expenses) if (e.fundId === id) e.fundId = null;
  for (const p of state.planned) if (p.fundId === id) p.fundId = null;
}

/** amount > 0 — hissa, amount < 0 — xarajatsiz olib qo'yish. */
export function addFundTx({ fundId, amount, date, note }) {
  if (!amount) fail('Summani kiriting (0 dan katta bo‘lishi kerak).');
  return upsert('fundTx', { fundId, amount, date, note: (note || '').trim() });
}

/** Budget bo'yicha shu oy fondlarga tegishli, hali o'tkazilmagan hissalarni yozadi. */
export function contributeMonthly(key) {
  const L = ledger();
  const date = key === currentMonth() ? today() : monthDate(key, 1);
  let total = 0;
  for (const cat of L.units) {
    if (cat.kind !== 'fund' && cat.kind !== 'emergency') continue;
    const fund = L.fundMap.get(cat.fundId);
    if (!fund || !fund.active) continue;
    const due = L.limit(cat, key) - L.contributions(fund, key);
    if (due <= 0) continue;
    state.fundTx.push({ id: uid(), fundId: fund.id, amount: due, date, note: 'Oylik hissa' });
    total += due;
  }
  return total;
}

// ---------- Takroriy va rejali ----------

export function saveRecurring(fields) {
  requireName(fields.name);
  requireAmount(fields.amount);
  if (!fields.categoryId) fail('Kategoriyani tanlang.');
  return upsert('recurring', { ...fields, name: fields.name.trim() },
    { interval: 1, active: true, lastGenerated: null, cardId: null, startMonth: currentMonth() });
}

/**
 * Muddati kelgan takroriy to'lovlarni xarajat sifatida yozadi.
 * Ilova bir necha oy ochilmagan bo'lsa ham o'tkazib yuborilgan oylar yoziladi; dublikat bo'lmaydi.
 */
export function generateRecurring(todayStr = today()) {
  const done = new Set(state.expenses.filter(e => e.recurringId).map(e => `${e.recurringId}|${monthOf(e.date)}`));
  const current = monthOf(todayStr);
  let created = 0;
  for (const r of state.recurring) {
    if (!r.active || !(r.amount > 0)) continue;
    let key = r.lastGenerated ? addMonths(r.lastGenerated, 1) : r.startMonth;
    if (key < r.startMonth) key = r.startMonth;
    while (key <= current) {
      if (monthsBetween(r.startMonth, key) % Math.max(1, r.interval || 1) === 0) {
        const due = monthDate(key, r.day);
        if (due > todayStr) break;
        const tag = `${r.id}|${key}`;
        if (!done.has(tag)) {
          state.expenses.push({
            id: uid(), amount: r.amount, categoryId: r.categoryId, cardId: r.cardId || null,
            fundId: null, date: due, note: r.name, recurringId: r.id,
          });
          done.add(tag);
          created++;
        }
      }
      r.lastGenerated = key;
      key = addMonths(key, 1);
    }
  }
  return created;
}

export function savePlanned(fields) {
  requireName(fields.title);
  requireAmount(fields.amount);
  return upsert('planned', { ...fields, title: fields.title.trim(), note: (fields.note || '').trim() },
    { done: false, categoryId: null, fundId: null });
}

// ---------- Onboarding ----------

export function finishOnboarding() {
  createMonth(currentMonth(), 'template');
  state.settings.onboarded = true;
  generateRecurring();
}
