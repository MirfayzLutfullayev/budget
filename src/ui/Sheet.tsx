import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { closeSheet } from '../store/ui';

/** Pastdan chiquvchi oyna. `footer` — pastda doim ko'rinib turadigan tugma. */
export function Sheet({ title, children, footer, onClose = closeSheet }: {
  title: string; children: ReactNode; footer?: ReactNode; onClose?: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="animate-fade absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="animate-sheet absolute inset-x-0 bottom-0 mx-auto flex max-h-[calc(100dvh-env(safe-area-inset-top)-12px)] max-w-xl flex-col rounded-t-[28px] bg-[#f4f6fb] shadow-pop dark:bg-zinc-950">
        <div className="flex items-center gap-2 px-4 pb-2 pt-3">
          <button onClick={onClose} className="min-w-16 py-1 text-left text-[17px] text-indigo-600 dark:text-indigo-400">Bekor</button>
          <h2 className="flex-1 truncate text-center text-[17px] font-bold">{title}</h2>
          <span className="min-w-16" />
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 pb-4 pt-1">{children}</div>
        {footer && <div className="pb-safe border-t border-slate-200/70 bg-[#f4f6fb] px-4 pt-3 dark:border-zinc-800 dark:bg-zinc-950"><div className="pb-3">{footer}</div></div>}
      </div>
    </div>,
    document.body,
  );
}
