import { useEffect, useRef, useState } from 'react';
import type { AdminUnit } from '../../shared/types';
import { downloadRekap, downloadZip } from './Downloads';

const nf = new Intl.NumberFormat('id-ID');

// Tombol unduh ZIP (dengan progres + Batal) dan rekap Excel untuk daftar unit yang diberikan.
export default function DownloadButtons({ units, filename, zipLabel = 'Unduh ZIP foto', rekap = true }: {
  units: AdminUnit[]; filename: string; zipLabel?: string; rekap?: boolean;
}) {
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const ctl = useRef<AbortController | null>(null);
  useEffect(() => () => ctl.current?.abort(), []);

  const photos = units.reduce((n, u) => n + Object.keys(u.photos).length, 0);

  async function zip() {
    setMsg(''); setErr('');
    const c = (ctl.current = new AbortController());
    setProg({ done: 0, total: photos });
    try {
      const r = await downloadZip(units, (done, total) => setProg({ done, total }), filename, c.signal);
      if (r.cancelled) setMsg(c.signal.aborted ? 'Unduhan dibatalkan.' : ''); // pemilih berkas ditutup pengguna: diam
      else setMsg(r.missing ? `Selesai. ${nf.format(r.missing)} foto tidak ditemukan.` : 'ZIP selesai diunduh.');
    } catch { setErr('Unduhan gagal. Periksa koneksi, lalu coba lagi.'); }
    setProg(null);
  }

  async function sheet() {
    setMsg(''); setErr('');
    try { await downloadRekap(units); } catch { setErr('Rekap gagal dibuat. Coba lagi.'); }
  }

  return (
    <div className="dl">
      <div className="dl-row">
        {rekap && <button type="button" className="dl-btn press" disabled={units.length === 0} onClick={sheet}>Excel rekap</button>}
        {prog ? (
          <button type="button" className="dl-btn press" onClick={() => ctl.current?.abort()}>Batal</button>
        ) : (
          <button type="button" className="dl-btn dl-main press" disabled={photos === 0} onClick={zip}>{zipLabel}</button>
        )}
      </div>
      {prog && (
        <p className="dl-prog" role="status">
          Mengunduh {nf.format(prog.done)}/{nf.format(prog.total)} foto…
          <progress max={prog.total || 1} value={prog.done} aria-label="Kemajuan unduhan" />
        </p>
      )}
      {msg && <p className="dl-msg" role="status">{msg}</p>}
      {err && <p className="ut-err" role="alert">{err}</p>}
    </div>
  );
}
