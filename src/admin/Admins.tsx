import { useEffect, useState, type FormEvent } from 'react';
import { Sheet } from '../ui/Sheet';
import { adminFetch } from './api';
import PasswordField from './PasswordField';

export interface DriveInfo { storage: 'drive' | 'd1'; status: 'tersambung' | 'terputus' | 'belum'; email: string | null; folderUrl: string | null }
interface Row { id: number; username: string; created_at: number }
const USER_RE = /^[a-z0-9._-]{3,40}$/;
const tgl = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', day: 'numeric', month: 'long', year: 'numeric' });

const DRIVE_MSG: Record<string, string> = {
  ok: 'Google Drive tersambung. Foto baru akan disimpan di sana.',
  gagal: 'Google Drive belum tersambung. Coba lagi, dan pastikan memilih Izinkan di halaman Google.',
};

function DrivePanel({ info }: { info: DriveInfo | null }) {
  const flash = new URLSearchParams(location.search).get('drive');
  if (!info) return null;
  const lokal = info.storage === 'd1';
  const label = { tersambung: 'Tersambung', terputus: 'Terputus', belum: 'Belum tersambung' }[info.status];
  return (
    <section className="ad-drive" aria-labelledby="ad-drive-h">
      <h2 id="ad-drive-h">Penyimpanan foto</h2>
      {lokal ? (
        <p className="ad-drive-note">Mode lokal: foto disimpan di database (hanya untuk uji).</p>
      ) : (
        <>
          <div className="ad-drive-row">
            <span className={`ad-drive-st ad-drive-${info.status}`}>{label}</span>
            {info.email && <span className="ad-drive-mail">{info.email}</span>}
          </div>
          {info.status === 'terputus' && <p className="ad-drive-note">Izin Google dicabut. Foto baru tertahan di HP mekanik sampai Drive disambungkan ulang.</p>}
          {info.folderUrl && <a className="ad-drive-link" href={info.folderUrl} target="_blank" rel="noopener noreferrer">Buka folder Komisioning di Drive</a>}
          <a className={`${info.status === 'tersambung' ? 'btn-2' : 'btn'} btn-sm press ad-drive-go`} href="/api/admin/drive/mulai">
            {info.status === 'tersambung' ? 'Ganti akun' : 'Sambungkan Google Drive'}
          </a>
        </>
      )}
      {flash && DRIVE_MSG[flash] && <p className={`ad-drive-msg${flash === 'gagal' ? ' ad-drive-bad' : ''}`} role="status">{DRIVE_MSG[flash]}</p>}
    </section>
  );
}

export default function Admins({ me, drive }: { me: string; drive: DriveInfo | null }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [addErr, setAddErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState('');
  const [reset, setReset] = useState<Row | null>(null);
  const [del, setDel] = useState<Row | null>(null);
  const [newPw, setNewPw] = useState('');
  const [sheetErr, setSheetErr] = useState('');

  const load = () => adminFetch('/api/admin/admins').then((r) => (r.ok ? r.json() : Promise.reject())).then(setRows).catch(() => setError('Daftar admin gagal dimuat.'));
  useEffect(() => { load(); }, []);

  const uErr = username && !USER_RE.test(username) ? 'Username 3–40 karakter: huruf kecil, angka, titik, garis bawah, atau strip' : '';
  const pErr = password && password.length < 8 ? 'Password minimal 8 karakter' : '';

  async function add(e: FormEvent) {
    e.preventDefault();
    if (busy || uErr || pErr || !username || !password) return;
    setBusy(true); setAddErr(''); setOk('');
    try {
      const res = await adminFetch('/api/admin/admins', { method: 'POST', body: JSON.stringify({ username, password }) });
      if (res.ok) { setOk(`Admin ${username} ditambahkan.`); setUsername(''); setPassword(''); await load(); }
      else if (res.status === 409) setAddErr('Username sudah dipakai');
      else if (res.status === 400) setAddErr('Username atau password tidak memenuhi syarat');
      else if (res.status !== 401) setAddErr('Gagal menambah admin. Coba lagi.');
    } catch { setAddErr('Tidak dapat terhubung. Periksa koneksi lalu coba lagi.'); }
    setBusy(false);
  }

  function open(kind: 'reset' | 'del', r: Row) {
    setSheetErr(''); setNewPw(''); setOk('');
    if (kind === 'reset') setReset(r); else setDel(r);
  }

  async function doReset() {
    if (!reset || busy) return;
    if (newPw.length < 8) { setSheetErr('Password minimal 8 karakter'); return; }
    setBusy(true); setSheetErr('');
    try {
      const res = await adminFetch(`/api/admin/admins/${reset.id}/password`, { method: 'POST', body: JSON.stringify({ password: newPw }) });
      if (res.ok) { setOk(`Password ${reset.username} diganti. Sesi lamanya sudah dikeluarkan.`); setReset(null); }
      else if (res.status === 404) { setSheetErr('Akun sudah tidak ada.'); load(); }
      else if (res.status !== 401) setSheetErr('Gagal mengganti password. Coba lagi.');
    } catch { setSheetErr('Tidak dapat terhubung. Periksa koneksi lalu coba lagi.'); }
    setBusy(false);
  }

  async function doDelete() {
    if (!del || busy) return;
    setBusy(true); setSheetErr('');
    try {
      const res = await adminFetch(`/api/admin/admins/${del.id}`, { method: 'DELETE' });
      if (res.ok) { setOk(`Akun ${del.username} dihapus.`); setDel(null); await load(); }
      else if (res.status === 400) setSheetErr('Admin terakhir tidak bisa dihapus');
      else if (res.status !== 401) setSheetErr('Gagal menghapus akun. Coba lagi.');
    } catch { setSheetErr('Tidak dapat terhubung. Periksa koneksi lalu coba lagi.'); }
    setBusy(false);
  }

  if (error) return <p className="ut-state" role="alert">{error}</p>;
  if (!rows) return <p className="ut-state">Memuat…</p>;

  return (
    <section className="ad" aria-label="Kelola admin">
      <DrivePanel info={drive} />
      <ul className="ad-list">
        {rows.map((r) => {
          const self = r.username === me;
          return (
            <li key={r.id} className="ad-row">
              <div className="ad-who">
                <b>{r.username}{self && <span className="ad-self"> (Anda)</span>}</b>
                <small>Dibuat {tgl.format(r.created_at)}</small>
              </div>
              <div className="ad-acts">
                <button type="button" className="btn-2 btn-sm press" onClick={() => open('reset', r)}>Reset password</button>
                <button type="button" className="btn-2 btn-sm btn-del press" disabled={self} aria-describedby={self ? `ad-self-${r.id}` : undefined} onClick={() => open('del', r)}>Hapus</button>
                {self && <span id={`ad-self-${r.id}`} className="ad-hint">Tidak bisa menghapus akun sendiri</span>}
              </div>
            </li>
          );
        })}
      </ul>

      <form className="ad-add" onSubmit={add} noValidate>
        <h2>Tambah admin</h2>
        <label className="adm-fld">
          <small>Username</small>
          <input value={username} onChange={(e) => { setUsername(e.target.value.toLowerCase()); setAddErr(''); }} autoComplete="off" autoCapitalize="none" spellCheck={false} aria-invalid={!!uErr} />
        </label>
        {uErr && <p className="ad-inv">{uErr}</p>}
        <PasswordField name="new-password" label="Password" autoComplete="new-password" value={password} onChange={(v) => { setPassword(v); setAddErr(''); }} />
        {pErr && <p className="ad-inv">{pErr}</p>}
        <button type="submit" className="btn press ad-go" disabled={busy || !username || !password || !!uErr || !!pErr}>{busy ? 'Menambah…' : 'Tambah admin'}</button>
        <p className="adm-err ad-msg" role="alert">{addErr}</p>
      </form>
      <p className="ad-ok" role="status">{ok}</p>

      <Sheet open={reset !== null} onClose={() => !busy && setReset(null)} title={`Reset password ${reset?.username ?? ''}`}>
        <PasswordField name="reset-password" label="Password baru" autoComplete="new-password" value={newPw} onChange={(v) => { setNewPw(v); setSheetErr(''); }} />
        <p className="ud-conf-err" role="alert">{sheetErr}</p>
        <button type="button" className="btn press" disabled={busy} onClick={doReset}>{busy ? 'Menyimpan…' : 'Ganti password'}</button>
        <button type="button" className="btn-plain press" disabled={busy} onClick={() => setReset(null)}>Batal</button>
      </Sheet>
      <Sheet open={del !== null} onClose={() => !busy && setDel(null)} title="Hapus akun?">
        <p className="ud-conf">Akun {del?.username} akan dihapus dan langsung dikeluarkan.</p>
        <p className="ud-conf-err" role="alert">{sheetErr}</p>
        <button type="button" className="btn ud-danger press" disabled={busy} onClick={doDelete}>{busy ? 'Menghapus…' : 'Hapus akun'}</button>
        <button type="button" className="btn-plain press" disabled={busy} onClick={() => setDel(null)}>Batal</button>
      </Sheet>
    </section>
  );
}
