import { hideToast, openSheet, setTab, useNav, useToast, type Tab } from '../store/ui';
import { cx } from './kit';

const TABS: [Tab, string, string][] = [
  ['home', 'Asosiy', 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'],
  ['transactions', 'Tarix', 'M4 6h16M4 12h16M4 18h10'],
  ['budget', 'Budjet', 'M12 3v9l7.8 4.5A9 9 0 1 1 12 3z'],
  ['more', 'Ko‘proq', 'M5 12h.01M12 12h.01M19 12h.01'],
];

function TabButton({ tab, label, path, active }: { tab: Tab; label: string; path: string; active: boolean }) {
  return (
    <button onClick={() => setTab(tab)} className={cx('flex flex-1 flex-col items-center gap-0.5 pt-1 text-[11px] font-semibold', active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400')}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={tab === 'more' ? 3.2 : 2} strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
      {label}
    </button>
  );
}

/** Home | Tarix | + | Budjet | Ko'proq — markaziy "+" eng asosiy tugma. */
export function TabBar() {
  const { tab } = useNav();
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/90 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex max-w-xl items-end px-2 pb-1">
        <TabButton tab="home" label={TABS[0][1]} path={TABS[0][2]} active={tab === 'home'} />
        <TabButton tab="transactions" label={TABS[1][1]} path={TABS[1][2]} active={tab === 'transactions'} />
        <div className="flex flex-1 justify-center">
          <button onClick={() => openSheet({ type: 'quick' })} aria-label="Qo‘shish"
            className="-mt-6 flex h-[62px] w-[62px] items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-4xl font-light text-white shadow-lg shadow-indigo-600/40 ring-4 ring-[#f4f6fb] transition active:scale-95 dark:ring-black">
            +
          </button>
        </div>
        <TabButton tab="budget" label={TABS[2][1]} path={TABS[2][2]} active={tab === 'budget'} />
        <TabButton tab="more" label={TABS[3][1]} path={TABS[3][2]} active={tab === 'more'} />
      </div>
    </nav>
  );
}

export function ToastView() {
  const t = useToast();
  if (!t) return null;
  const tone = t.tone === 'danger' ? 'bg-rose-600 text-white' : t.tone === 'info' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-emerald-600 text-white';
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }}>
      <div key={t.id} role="status" className={cx('animate-toast pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-[15px] font-medium shadow-pop', tone)}>
        <span className="whitespace-pre-line">{t.text}</span>
        {t.action && (
          <button onClick={() => { t.action!.run(); hideToast(); }} className="flex-none rounded-xl bg-white/20 px-3 py-1.5 font-bold">
            {t.action.label}
          </button>
        )}
      </div>
    </div>
  );
}
