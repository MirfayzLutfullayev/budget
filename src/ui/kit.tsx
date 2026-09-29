import type { ReactNode } from 'react';
import { back, useNav } from '../store/ui';
import { addMonths, monthTitle } from '../lib/format';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/** Sahifa: katta sarlavha, ixtiyoriy "orqaga" va o'ng tomondagi tugma. */
export function Screen({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  const { stack } = useNav();
  return (
    <div className="mx-auto min-h-dvh max-w-xl pb-40">
      <header className="pt-safe sticky top-0 z-20 bg-[#f4f6fb]/85 px-4 pb-2 backdrop-blur-xl dark:bg-black/80">
        <div className="flex min-h-10 items-center gap-2 pt-1">
          {stack.length > 0 && (
            <button onClick={back} className="-ml-1 flex items-center gap-1 py-1 text-[17px] font-medium text-indigo-600 dark:text-indigo-400">
              <span className="text-2xl leading-none">‹</span> Orqaga
            </button>
          )}
          <div className="flex-1" />
          {action}
        </div>
        <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </header>
      <main className="space-y-4 px-4 pt-2">{children}</main>
    </div>
  );
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick}
      className={cx('block w-full rounded-3xl bg-white p-4 text-left shadow-card dark:bg-zinc-900', onClick && 'active:scale-[.99] transition', className)}>
      {children}
    </Tag>
  );
}

export function CardTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{children}</h2>
      {right}
    </div>
  );
}

export function Progress({ value, tone = 'indigo', className }: { value: number; tone?: 'indigo' | 'green' | 'amber' | 'red' | 'orange' | 'sky'; className?: string }) {
  const colors = { indigo: 'bg-indigo-500', green: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-rose-500', orange: 'bg-orange-500', sky: 'bg-sky-500' };
  return (
    <div className={cx('h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-zinc-800', className)}>
      <div className={cx('h-full rounded-full transition-all', colors[tone])} style={{ width: `${Math.min(Math.max(value, 0), 1) * 100}%` }} />
    </div>
  );
}

export const budgetTone = (ratio: number) => (ratio > 1 ? 'red' : ratio >= 0.9 ? 'amber' : 'green') as 'red' | 'amber' | 'green';

export function List({ children, title, footer }: { children: ReactNode; title?: ReactNode; footer?: ReactNode }) {
  return (
    <section>
      {title && <h3 className="mb-2 ml-4 text-[13px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>}
      <div className="divide-y divide-slate-100 overflow-hidden rounded-3xl bg-white shadow-card dark:divide-zinc-800 dark:bg-zinc-900">{children}</div>
      {footer && <p className="mx-4 mt-2 text-[13px] text-slate-500 dark:text-slate-400">{footer}</p>}
    </section>
  );
}

export function Row({ icon, title, subtitle, right, onClick, chevron, className }: {
  icon?: ReactNode; title: ReactNode; subtitle?: ReactNode; right?: ReactNode; onClick?: () => void; chevron?: boolean; className?: string;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={cx('flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left', onClick && 'active:bg-slate-50 dark:active:bg-zinc-800', className)}>
      {icon !== undefined && <span className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-slate-100 text-xl dark:bg-zinc-800">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[16px] font-medium">{title}</span>
        {subtitle && <span className="block truncate text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</span>}
      </span>
      {right !== undefined && <span className="flex flex-none flex-col items-end text-right">{right}</span>}
      {chevron && <span className="text-xl text-slate-300 dark:text-zinc-600">›</span>}
    </Tag>
  );
}

export function Empty({ icon = '🗂️', title, text, action }: { icon?: string; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-3xl bg-white px-6 py-10 text-center shadow-card dark:bg-zinc-900">
      <div className="text-4xl">{icon}</div>
      <p className="mt-3 font-semibold">{title}</p>
      {text && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{text}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Button({ children, onClick, tone = 'primary', className, disabled, type = 'button' }: {
  children: ReactNode; onClick?: () => void; tone?: 'primary' | 'soft' | 'danger' | 'ghost' | 'success'; className?: string; disabled?: boolean; type?: 'button' | 'submit';
}) {
  const tones = {
    primary: 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25 active:bg-indigo-700',
    success: 'bg-emerald-600 text-white active:bg-emerald-700',
    soft: 'bg-indigo-50 text-indigo-700 active:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300',
    danger: 'bg-rose-50 text-rose-600 active:bg-rose-100 dark:bg-rose-500/15 dark:text-rose-400',
    ghost: 'bg-transparent text-indigo-600 dark:text-indigo-400',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={cx('inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[16px] font-semibold transition disabled:opacity-40', tones[tone], className)}>
      {children}
    </button>
  );
}

export function IconButton({ children, onClick, label }: { children: ReactNode; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label}
      className="flex h-10 min-w-10 items-center justify-center rounded-full bg-white px-3 text-lg font-semibold text-indigo-600 shadow-card active:scale-95 dark:bg-zinc-900 dark:text-indigo-400">
      {children}
    </button>
  );
}

export function MonthSwitcher({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between rounded-2xl bg-white p-1 shadow-card dark:bg-zinc-900">
      <button onClick={() => onChange(addMonths(value, -1))} className="h-10 w-12 rounded-xl text-2xl text-indigo-600 active:bg-slate-100 dark:text-indigo-400 dark:active:bg-zinc-800" aria-label="Oldingi oy">‹</button>
      <span className="font-bold">{monthTitle(value)}</span>
      <button onClick={() => onChange(addMonths(value, 1))} className="h-10 w-12 rounded-xl text-2xl text-indigo-600 active:bg-slate-100 dark:text-indigo-400 dark:active:bg-zinc-800" aria-label="Keyingi oy">›</button>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-2xl bg-slate-200/70 p-1 dark:bg-zinc-800">
      {options.map(([v, label]) => (
        <button key={v} onClick={() => onChange(v)}
          className={cx('flex-1 rounded-xl py-2 text-sm font-semibold transition', v === value ? 'bg-white shadow dark:bg-zinc-700' : 'text-slate-500 dark:text-slate-400')}>
          {label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'green' | 'red' | 'amber' | 'indigo' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-slate-300',
    green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    red: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    indigo: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  };
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone])}>{children}</span>;
}
