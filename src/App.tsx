import { lazy, Suspense, useEffect } from 'react';
import { useAppState, dailyMaintenance } from './store/store';
import { useNav, type Route } from './store/ui';
import { TabBar, ToastView } from './ui/Chrome';
import { SheetHost } from './sheets/Sheets';
import { Home } from './screens/Home';
import { Transactions } from './screens/Transactions';
import { Budget } from './screens/Budget';
import { DataPage, Reports } from './screens/Data';
import { Onboarding } from './screens/Onboarding';
import {
  AccountDetail, Accounts, Bills, Categories, DebtDetail, Debts, IncomePlan, More, Planned, Reminders, Rules, SettingsPage,
} from './screens/More';

// Grafik kutubxonasi og'ir — Statistika faqat ochilganda yuklanadi
const Stats = lazy(() => import('./screens/Stats').then(m => ({ default: m.Stats })));

function RouteView({ route }: { route: Route }) {
  switch (route.name) {
    case 'debts': return <Debts />;
    case 'debt': return <DebtDetail id={route.id} />;
    case 'stats': return <Suspense fallback={<div className="p-8 text-center text-slate-400">Yuklanmoqda…</div>}><Stats /></Suspense>;
    case 'accounts': return <Accounts />;
    case 'account': return <AccountDetail id={route.id} />;
    case 'planned': return <Planned />;
    case 'income': return <IncomePlan />;
    case 'bills': return <Bills />;
    case 'reminders': return <Reminders />;
    case 'reports': return <Reports />;
    case 'categories': return <Categories />;
    case 'category': return <Categories />;
    case 'rules': return <Rules />;
    case 'data': return <DataPage />;
    case 'settings': return <SettingsPage />;
  }
}

export default function App() {
  const s = useAppState();
  const { tab, stack } = useNav();

  // Ilovaga qaytganda: kutilgan kirimlar va kunlik nusxa
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') dailyMaintenance(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  if (!s.settings.onboarded) {
    return (
      <>
        <Onboarding />
        <SheetHost />
        <ToastView />
      </>
    );
  }

  const top = stack[stack.length - 1];
  let screen;
  if (top) screen = <RouteView route={top} />;
  else if (tab === 'home') screen = <Home />;
  else if (tab === 'transactions') screen = <Transactions />;
  else if (tab === 'budget') screen = <Budget />;
  else screen = <More />;

  return (
    <>
      {screen}
      <TabBar />
      <SheetHost />
      <ToastView />
    </>
  );
}
