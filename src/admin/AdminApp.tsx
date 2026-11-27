import { useEffect, useState } from 'react';
import { navigate, useRoute } from '../router';
import { adminFetch } from './api';
import Login from './Login';
import Import from './Import';
import UnitTable from './UnitTable';
import Populasi from './PopulasiScreen';
import Unduhan from './Unduhan';
import Admins, { type DriveInfo } from './Admins';
import { ThemeToggle } from '../ui/ThemeToggle';
import '../styles/admin.css';

const TABS = [
  { id: 'unit', label: 'Unit' },
  { id: 'upload', label: 'Upload Excel SHE' },
  { id: 'populasi', label: 'Populasi' },
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

  const [drive, setDrive] = useState<DriveInfo | null>(null);
  useEffect(() => {
    if (!user) return;
    adminFetch('/api/admin/drive/status').then((r) => (r.ok ? r.json() : null)).then(setDrive).catch(() => {});
  }, [user]);

  const tab = TABS.find((t) => t.id === params.tab)?.id;
  useEffect(() => {
    if (user && route === '/admin/:tab?' && !tab) navigate('/admin/unit', { replace: true });
    if (user === null && route === '/admin/:tab?') navigate('/admin/login', { replace: true }); // mis. Back setelah keluar
  }, [user, route, tab]);

  // Form login tampil tanpa menunggu /api/admin/me (LCP); bila ternyata sudah masuk, efek di atas pindah ke /admin/unit.
  if (route === '/admin/login') return <Login onLogin={setUser} />;
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
          <ThemeToggle className="adm-out" />
          <button type="button" className="adm-out press" onClick={logout}>Keluar</button>
        </div>
      </aside>
      <main className="adm-main">
        <div className="hazard" aria-hidden="true" />
        {drive?.storage === 'drive' && drive.status !== 'tersambung' && (
          <p className="adm-warn" role="alert">
            {drive.status === 'terputus'
              ? 'Google Drive terputus. Foto baru tertahan di HP mekanik sampai disambungkan ulang.'
              : 'Google Drive belum disambungkan. Foto dari mekanik tertahan di HP sampai disambungkan. Buka menu Admin → Sambungkan Google Drive.'}{' '}
            {tab !== 'admin' && <a href="/admin/admin" onClick={(e) => { e.preventDefault(); navigate('/admin/admin'); }}>Buka pengaturan</a>}
          </p>
        )}
        <div className="adm-pg">
          <h1 className="large-title">{TABS.find((t) => t.id === tab)!.label}</h1>
          {tab === 'unit' && <UnitTable />}
          {tab === 'upload' && <Import />}
          {tab === 'populasi' && <Populasi />}
          {tab === 'unduhan' && <Unduhan />}
          {tab === 'admin' && <Admins me={user} drive={drive} />}
        </div>
      </main>
    </div>
  );
}
