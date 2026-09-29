import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Account, Category, ID } from '../domain/types';
import { currencySymbol, parseAmount, plain } from '../lib/format';
import { cx } from './kit';

/** Katta raqamli summa maydoni: "7 400 000" ko'rinishida guruhlanadi, klaviatura — faqat raqam. */
export function AmountInput({ value, onChange, autoFocus, label = 'Summa', big = true }: {
  value: number; onChange: (v: number) => void; autoFocus?: boolean; label?: string; big?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value ? plain(value) : '');

  useEffect(() => {
    if (parseAmount(text) !== value) setText(value ? plain(value) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  return (
    <label className={cx('block rounded-3xl bg-white px-4 shadow-card dark:bg-zinc-900', big ? 'py-3' : 'py-2')}>
      <span className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{label}, {currencySymbol()}</span>
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        placeholder="0"
        value={text}
        onChange={e => {
          const v = parseAmount(e.target.value);
          setText(v ? plain(v) : '');
          onChange(v);
        }}
        className={cx('tabular block w-full bg-transparent font-extrabold tracking-tight outline-none placeholder:text-slate-300 dark:placeholder:text-zinc-700',
          big ? 'text-[40px] leading-tight' : 'text-2xl')}
      />
    </label>
  );
}

export function FieldGroup({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div>
      {title && <p className="mb-2 ml-1 text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</p>}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-card dark:divide-zinc-800 dark:bg-zinc-900">{children}</div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-h-14 items-center gap-3 px-4 py-2">
      <span className="flex-none text-[16px]">{label}</span>
      <span className="flex min-w-0 flex-1 justify-end">{children}</span>
    </label>
  );
}

const inputCls = 'w-full min-w-0 bg-transparent text-right text-[16px] outline-none placeholder:text-slate-400 text-slate-700 dark:text-slate-200';

export function TextInput({ value, onChange, placeholder, inputMode }: {
  value: string; onChange: (v: string) => void; placeholder?: string; inputMode?: 'text' | 'numeric' | 'decimal';
}) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} autoComplete="off" className={inputCls} />;
}

export function AmountField({ value, onChange, placeholder = '0' }: { value: number; onChange: (v: number) => void; placeholder?: string }) {
  return (
    <input inputMode="numeric" autoComplete="off" placeholder={placeholder} value={value ? plain(value) : ''}
      onChange={e => onChange(parseAmount(e.target.value))} className={cx(inputCls, 'tabular font-semibold')} />
  );
}

export function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={e => onChange(e.target.value)} className={cx(inputCls, 'min-h-9')} />;
}

export function Select<T extends string | number>({ value, onChange, options }: {
  value: T; onChange: (v: T) => void; options: [T, string][];
}) {
  return (
    <select value={String(value)} onChange={e => {
      const raw = e.target.value;
      const opt = options.find(([v]) => String(v) === raw);
      if (opt) onChange(opt[0]);
    }} className={cx(inputCls, 'appearance-none text-indigo-600 dark:text-indigo-400')} style={{ textAlignLast: 'right' }}>
      {options.map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
    </select>
  );
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-4 py-2">
      <span className="flex-1">
        <span className="block text-[16px]">{label}</span>
        {hint && <span className="block text-[13px] text-slate-500 dark:text-slate-400">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="relative h-8 w-[52px] flex-none rounded-full bg-slate-200 transition peer-checked:bg-emerald-500 dark:bg-zinc-700
        after:absolute after:left-0.5 after:top-0.5 after:h-7 after:w-7 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

/** Kategoriya tanlash — katta tugmalar to'ri. */
export function CategoryChips({ categories, value, onChange }: { categories: Category[]; value: ID | null; onChange: (id: ID) => void }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {categories.map(c => {
        const on = c.id === value;
        return (
          <button key={c.id} type="button" onClick={() => onChange(c.id)}
            className={cx('flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 text-center transition active:scale-95',
              on ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15' : 'border-transparent bg-white shadow-card dark:bg-zinc-900')}>
            <span className="text-2xl leading-none">{c.icon}</span>
            <span className={cx('w-full truncate text-[12px] leading-tight', on ? 'font-bold text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300')}>{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Hisob tanlash — gorizontal chiplar, balans bilan. */
export function AccountChips({ accounts, value, onChange, balances }: {
  accounts: Account[]; value: ID | null; onChange: (id: ID) => void; balances?: (a: Account) => number;
}) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {accounts.map(a => {
        const on = a.id === value;
        return (
          <button key={a.id} type="button" onClick={() => onChange(a.id)}
            className={cx('flex min-w-[112px] flex-none flex-col items-start rounded-2xl border-2 px-3 py-2 text-left transition active:scale-95',
              on ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15' : 'border-transparent bg-white shadow-card dark:bg-zinc-900')}>
            <span className="text-[15px] font-semibold">{a.icon} {a.name}</span>
            {balances && <span className="tabular text-[12px] text-slate-500 dark:text-slate-400">{plain(balances(a))}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ErrorBox({ error }: { error: string }) {
  if (!error) return null;
  return <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-[15px] font-medium text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">{error}</p>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[13px] text-slate-500 dark:text-slate-400">{children}</p>;
}
