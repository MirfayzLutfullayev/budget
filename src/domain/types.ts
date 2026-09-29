// Ma'lumot modeli (spetsifikatsiya, 34-bo'lim).

export type ID = string;

export type AccountType = 'cash' | 'card' | 'other';

export interface Account {
  id: ID;
  name: string;
  type: AccountType;
  /** Ilovaga qo'shilgan paytdagi balans. Joriy balans tranzaksiyalardan hisoblanadi. */
  initialBalance: number;
  icon: string;
  color: string;
  last4: string;
  isActive: boolean;
  sort: number;
}

/**
 * regular — oddiy xarajat (budjetga kiradi);
 * debt — qarz to'lovi (xarajat statistikasiga aralashmaydi);
 * savings — jamg'arma (xarajat statistikasiga aralashmaydi).
 */
export type CategoryKind = 'regular' | 'debt' | 'savings';

export interface Category {
  id: ID;
  name: string;
  type: 'expense' | 'income';
  kind: CategoryKind;
  group: string;
  /** Standart oylik limit (yangi oy budjeti shundan yaratiladi). */
  monthlyLimit: number;
  icon: string;
  color: string;
  isActive: boolean;
  sort: number;
}

export interface Transaction {
  id: ID;
  type: 'income' | 'expense';
  amount: number;
  categoryId: ID | null;
  accountId: ID | null;
  date: string;
  note: string;
  /** Qarz to'lovi bo'lsa — qaysi qarz. */
  debtId?: ID;
  /** Rejali xariddan yaratilgan bo'lsa. */
  plannedId?: ID;
  /** Kutilgan kirimdan yaratilgan bo'lsa. */
  incomeId?: ID;
  /** Majburiy to'lovdan yaratilgan bo'lsa — to'lov va oy. */
  billId?: ID;
  billMonth?: string;
  createdAt: number;
}

/** Hisoblar orasidagi o'tkazma — xarajat emas. */
export interface Transfer {
  id: ID;
  fromAccountId: ID;
  toAccountId: ID;
  amount: number;
  date: string;
  note: string;
  createdAt: number;
}

/** Har oy takrorlanadigan kutilgan kirim (masalan, 15-kuni maosh). */
export interface IncomeSchedule {
  id: ID;
  source: string;
  amount: number;
  day: number;
  targetAccountId: ID | null;
  categoryId: ID | null;
  isActive: boolean;
  /** Qo'shilgan sana — undan oldingi sanalar kutilmaydi (pul allaqachon balansda). */
  startDate?: string;
}

export type IncomeStatus = 'expected' | 'received' | 'skipped';

export interface ExpectedIncome {
  id: ID;
  amount: number;
  source: string;
  targetAccountId: ID | null;
  categoryId: ID | null;
  expectedDate: string;
  receivedDate: string | null;
  status: IncomeStatus;
  note: string;
  scheduleId?: ID;
  transactionId?: ID;
}

export interface Debt {
  id: ID;
  name: string;
  originalAmount: number;
  /** Ilovaga qo'shilgan paytdagi qoldiq. Joriy qoldiq to'lovlardan hisoblanadi. */
  startingBalance: number;
  interestRate: number;
  /** Oyning to'lov kuni; 0 — belgilanmagan. */
  dueDay: number;
  minimumPayment: number;
  startDate: string;
  isActive: boolean;
  note: string;
  sort: number;
}

/** Har oy majburiy to'lov (ijara, kurs...). "Safe to Spend"dan oldindan ayriladi. */
export interface Bill {
  id: ID;
  name: string;
  amount: number;
  categoryId: ID | null;
  accountId: ID | null;
  day: number;
  isActive: boolean;
}

export type PlannedStatus = 'planned' | 'purchased' | 'cancelled';

export interface PlannedPurchase {
  id: ID;
  name: string;
  amount: number;
  date: string | null;
  categoryId: ID | null;
  status: PlannedStatus;
  note: string;
  transactionId?: ID;
  createdAt: number;
}

export interface MonthBudget {
  limits: Record<ID, number>;
  createdAt: number;
}

export interface Settings {
  currency: string;
  onboarded: boolean;
  alertThreshold: number;
  reminderDays: number;
  backupEveryDays: number;
  lastBackupAt: string | null;
  hideInstallTip: boolean;
}

export interface State {
  version: 2;
  updatedAt: number;
  settings: Settings;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  incomeSchedules: IncomeSchedule[];
  expectedIncomes: ExpectedIncome[];
  debts: Debt[];
  bills: Bill[];
  planned: PlannedPurchase[];
  budgets: Record<string, MonthBudget>;
}
