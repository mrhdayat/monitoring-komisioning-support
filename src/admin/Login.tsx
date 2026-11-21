import { useEffect, useRef, useState, type FormEvent } from 'react';
import { navigate } from '../router';
import { adminFetch } from './api';
import PasswordField from './PasswordField';

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export default function Login({ onLogin }: { onLogin: (username: string) => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [fails, setFails] = useState(0);
  const card = useRef<HTMLFormElement>(null);

  // Goyang sekali, hanya transform; dengan reduced motion cukup pesan.
  useEffect(() => {
    if (!fails || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    card.current?.animate(
      { transform: ['translateX(0)', 'translateX(-9px)', 'translateX(8px)', 'translateX(-5px)', 'translateX(3px)', 'translateX(0)'] },
      { duration: 300, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' },
    );
  }, [fails]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const f = new FormData(e.currentTarget);
    setPending(true); setError('');
    let msg = '';
    try {
      const res = await adminFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ username: String(f.get('username')).trim().toLowerCase(), password: f.get('password') }) });
      if (res.ok) {
        onLogin(((await res.json()) as { username: string }).username);
        navigate('/admin/unit', { replace: true });
        return;
      }
      if (res.status === 423) {
        const { until } = (await res.json()) as { until: number };
        msg = `Terlalu banyak percobaan. Coba lagi pukul ${hm.format(until)}`;
      } else msg = res.status === 401 ? 'Username atau password salah' : 'Terjadi kesalahan di server. Coba lagi.';
    } catch {
      msg = 'Tidak dapat terhubung. Periksa koneksi lalu coba lagi.';
    }
    setPending(false); setError(msg); setFails((n) => n + 1);
  }

  return (
    <main className="adm-login">
      <form ref={card} className="adm-card" onSubmit={submit}>
        <div className="adm-mark" aria-hidden="true" />
        <h1>Masuk admin</h1>
        <p className="adm-sub">Khusus admin untuk upload data SHE dan unduh foto.</p>
        <label className="adm-fld">
          <small>Username</small>
          <input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
        </label>
        <PasswordField autoComplete="current-password" />
        <button type="submit" className="btn press adm-go" disabled={pending}>{pending ? 'Memeriksa…' : 'Masuk'}</button>
        <p className="adm-err" role="alert">{error}</p>
      </form>
    </main>
  );
}
