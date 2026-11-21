import { useEffect, useState } from 'react';
import { navigate, useRoute } from '../router';
import { adminFetch } from './api';
import Login from './Login';
import '../styles/admin.css';

const TABS = [
  { id: 'unit', label: 'Unit' },
  { id: 'upload', label: 'Upload Excel SHE' },
  { id: 'unduhan', label: 'Unduhan' },
  { id: 'admin', label: 'Admin' },
] as const;

export default function AdminApp() {
  const { route, params } = useRoute();
  const [user, setUser] = useState<string | null | undefined>(undefined); // undefined = belum dicek

  // Cek sesi sekali saat dibuka; halaman login langsung dilewati bila sudah masuk.
  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'same-origin' })
      .then((r) => (r.ok ? (r.json() as Promise<{ username: string }>) : null))
      .catch(() => null)
      .then((j) => {
        setUser(j?.username ?? null);
        const onLogin = location.pathname.startsWith('/admin/login');
        if (j && onLogin) navigate('/admin/unit', { replace: true });
        else if (!j && !onLogin) navigate('/admin/login', { replace: true });
      });
  }, []);

  const tab = TABS.find((t) => t.id === params.tab)?.id;
  useEffect(() => {
    if (user && route === '/admin/:tab?' && !tab) navigate('/admin/unit', { replace: true });
  }, [user, route, tab]);

  if (route === '/admin/login') return user === undefined ? null : <Login onLogin={setUser} />;
  if (!user || !tab) return null;

  async function logout() {
    await adminFetch('/api/admin/logout', { method: 'POST', body: '{}' }).catch(() => {});
    setUser(null);
    navigate('/admin/login');
  }

  return (
    <div className="adm-shell">
      <aside className="adm-side">
        <div className="adm-brand">Komisioning<small>Admin</small></div>
        <nav aria-label="Menu admin">
          {TABS.map((t) => (
            <a key={t.id} className="adm-nav press" href={`/admin/${t.id}`} aria-current={t.id === tab ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); if (t.id !== tab) navigate(`/admin/${t.id}`); }}>{t.label}</a>
          ))}
        </nav>
        <div className="adm-user">
          <span>{user}</span>
          <button type="button" className="adm-out press" onClick={logout}>Keluar</button>
        </div>
      </aside>
      <main className="adm-main">
        <h1 className="large-title">{TABS.find((t) => t.id === tab)!.label}</h1>
        {/* Isi tab diganti oleh Task 17–19. */}
        <p className="adm-todo">
          {tab === 'unit' && 'Tabel unit dan detail foto: Task 17.'}
          {tab === 'upload' && 'Upload dan pratinjau Excel SHE: Task 18.'}
          {tab === 'unduhan' && 'Unduh foto per unit atau per periode: Task 18.'}
          {tab === 'admin' && 'Kelola akun admin: Task 19.'}
        </p>
      </main>
    </div>
  );
}
