import { lazy, Suspense } from 'react';
import { useRoute } from './router';

// Placeholder: diganti layar sungguhan di Task 12–19.
const UnitList = () => <main className="screen"><h1 className="large-title">Komisioning</h1></main>;
const Camera = () => <main className="screen"><h1 className="large-title">Kamera</h1></main>;
const Antrean = () => <main className="screen"><h1 className="large-title">Antrean</h1></main>;
const CekKode = () => <main className="screen"><h1 className="large-title">Cek Kode Foto</h1></main>;
const AdminApp = lazy(async () => ({ default: () => <main className="screen"><h1 className="large-title">Admin</h1></main> }));

export default function App() {
  const { route } = useRoute();
  switch (route) {
    case '/unit/:id/kamera': return <Camera />;
    case '/antrean': return <Antrean />;
    case '/cek': case '/cek/:kode': return <CekKode />;
    case '/admin/login': case '/admin/:tab?': return <Suspense><AdminApp /></Suspense>;
    default: return <UnitList />;
  }
}
