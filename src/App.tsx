import { lazy, Suspense, useSyncExternalStore } from 'react';
import { navigate, useRoute } from './router';
import { useQueueCount } from './lib/useQueueCount';
import UnitList from './screens/UnitList';
import Antrean from './screens/Antrean';

// Kamera di-load terpisah: daftar unit tetap ringan saat dibuka pertama.
const Camera = lazy(() => import('./screens/Camera'));
const Landing = lazy(() => import('./screens/Landing'));
const CekKode = lazy(() => import('./screens/CekKode'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

const TABS = [
  { to: '/', label: 'Unit', icon: 'M4 6h16M4 12h16M4 18h16' },
  { to: '/antrean', label: 'Antrean', icon: 'M4 14l2.5-8h11L20 14M4 14v5h16v-5M4 14h4.5a3.5 3.5 0 0 0 7 0H20' },
] as const;

// Tab bar hanya di layar mekanik utama; kamera, cek, dan admin layar penuh.
function TabBar({ at }: { at: string }) {
  const n = useQueueCount();
  return (
    <nav className="tabbar" aria-label="Menu utama">
      {TABS.map((t) => (
        <button key={t.to} type="button" className="tab press" aria-current={at === t.to ? 'page' : undefined} onClick={() => at !== t.to && navigate(t.to)}>
          <span className="tab-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg></span>
          {t.to === '/antrean' && n > 0 ? `Antrean · ${n}` : t.label}
        </button>
      ))}
    </nav>
  );
}

const mq = matchMedia('(min-width: 1024px)');
const subWide = (cb: () => void) => { mq.addEventListener('change', cb); return () => mq.removeEventListener('change', cb); };

export default function App() {
  const { route } = useRoute();
  const wide = useSyncExternalStore(subWide, () => mq.matches);
  const landing = wide && route === '/';
  return (
    <>
      <Screen route={route} landing={landing} />
      {!landing && (route === '/' || route === '/antrean') && <TabBar at={route} />}
    </>
  );
}

function Screen({ route, landing }: { route: string | null; landing: boolean }) {
  switch (route) {
    case '/unit/:id/kamera': return <Suspense fallback={<main className="cam" />}><Camera /></Suspense>;
    case '/antrean': return <Antrean />;
    case '/cek': case '/cek/:kode': return <Suspense><CekKode /></Suspense>;
    case '/admin/login': case '/admin/:tab?': return <Suspense><AdminApp /></Suspense>;
    default: return landing ? <Suspense><Landing /></Suspense> : <UnitList />;
  }
}
