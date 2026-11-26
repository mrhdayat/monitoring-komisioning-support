import { lazy, Suspense } from 'react';
import { navigate, useRoute } from './router';
import { useQueueCount } from './lib/useQueueCount';
import Papan from './screens/Papan';
import Antrean from './screens/Antrean';

// Kamera di-load terpisah: papan tetap ringan saat dibuka pertama.
const Camera = lazy(() => import('./screens/Camera'));
const CekKode = lazy(() => import('./screens/CekKode'));
const AdminApp = lazy(() => import('./admin/AdminApp'));

// Tab bar hanya di papan dan antrean; kamera, cek, dan admin layar penuh. Di ≥ 1024 px papan memakai tautan header.
function TabBar({ at }: { at: string }) {
  const n = useQueueCount();
  return (
    <nav className="tabbar" data-at={at} aria-label="Menu utama">
      {(['/', '/antrean'] as const).map((to) => (
        <button key={to} type="button" className="tab press" aria-current={at === to ? 'page' : undefined} onClick={() => at !== to && navigate(to)}>
          {to === '/' ? 'Papan' : n > 0 ? `Antrean · ${n}` : 'Antrean'}
        </button>
      ))}
    </nav>
  );
}

export default function App() {
  const { route } = useRoute();
  return (
    <>
      <Screen route={route} />
      {(route === '/' || route === '/antrean') && <TabBar at={route} />}
    </>
  );
}

function Screen({ route }: { route: string | null }) {
  switch (route) {
    case '/unit/:id/kamera': return <Suspense fallback={<main className="cam" />}><Camera /></Suspense>;
    case '/antrean': return <Antrean />;
    case '/cek': case '/cek/:kode': return <Suspense><CekKode /></Suspense>;
    case '/admin/login': case '/admin/:tab?': return <Suspense><AdminApp /></Suspense>;
    default: return <Papan />;
  }
}
