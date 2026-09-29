import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import './index.css';
import App from './App';
import { initStore } from './store/store';

// Yangi versiya chiqsa — avtomatik yangilanadi (ma'lumotlarga tegmaydi)
registerSW({ immediate: true });

const root = createRoot(document.getElementById('root')!);

/** Yuklashda xato bo'lsa — ilovani ochmaymiz, aks holda bo'sh holat eski ma'lumot ustidan yozilishi mumkin. */
function LoadError({ message }: { message: string }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-xl font-bold">Ma’lumotlarni o‘qib bo‘lmadi</h1>
      <p className="text-slate-500">Ma’lumotlaringiz o‘chirilmadi. Ilovani yopib, qayta oching.</p>
      <p className="text-xs text-slate-400">{message}</p>
      <button className="mt-2 rounded-2xl bg-indigo-600 px-6 py-3 font-semibold text-white" onClick={() => location.reload()}>Qayta urinish</button>
    </div>
  );
}

initStore()
  .then(() => root.render(<StrictMode><App /></StrictMode>))
  .catch(err => {
    console.error('Yuklashda xato', err);
    root.render(<LoadError message={String((err as Error)?.message ?? err)} />);
  });
