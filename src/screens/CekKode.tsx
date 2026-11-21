import { useEffect, useState } from 'react';
import { normalizeKode } from '../../shared/kode';
import { navigate, useRoute } from '../router';

interface Hasil { kode: string; no_lambung: string; sisi: string; captured_at: number; received_at: number }

const full = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'long', timeStyle: 'medium', hourCycle: 'h23' });
const wita = (ms: number) => `${full.format(ms).replace(/\./g, ':')} WITA`;

export default function CekKode() {
  const { params } = useRoute();
  const raw = params.kode ?? '';
  const kode = raw ? normalizeKode(raw) : null;
  const [v, setV] = useState(raw);
  const [err, setErr] = useState(Boolean(raw) && !kode);
  const [res, setRes] = useState<{ kode: string; r: Hasil | 'none' | 'fail' } | null>(null);

  useEffect(() => { setV(raw); setErr(Boolean(raw) && !normalizeKode(raw)); }, [raw]);
  useEffect(() => {
    if (!kode) return;
    const ac = new AbortController();
    fetch(`/api/check/${kode}`, { signal: ac.signal })
      .then(async (r) => setRes({ kode, r: r.status === 404 ? 'none' : r.ok ? ((await r.json()) as Hasil) : 'fail' }))
      .catch((e) => { if (e.name !== 'AbortError') setRes({ kode, r: 'fail' }); });
    return () => ac.abort();
  }, [kode]);

  const cur = kode && res?.kode === kode ? res.r : null;

  return (
    <main className="screen cek">
      <a href="/" className="cek-back" onClick={(e) => { e.preventDefault(); navigate('/'); }}>‹ Kembali</a>
      <h1 className="large-title">Cek Kode Foto</h1>
      <form className="l-cek" onSubmit={(e) => {
        e.preventDefault();
        const k = normalizeKode(v);
        if (k) navigate(`/cek/${k}`, { replace: true }); else setErr(true);
      }}>
        <input className="l-input" value={v} onChange={(e) => { setV(e.target.value); setErr(false); }}
          placeholder="AB1C-D2EF" aria-label="Kode Foto" autoCapitalize="characters" autoComplete="off" spellCheck={false}
          aria-invalid={err} aria-describedby={err ? 'cek-err' : undefined} />
        <button type="submit" className="l-btn press">Cek</button>
        {err && <p id="cek-err" className="l-err" role="alert">Kode Foto harus 8 karakter, contoh AB1C-D2EF</p>}
      </form>

      {kode && !cur && <p className="cek-msg" role="status">Memeriksa…</p>}
      {cur === 'none' && <p className="cek-msg" role="status">Kode Foto tidak ditemukan. Foto mungkin sudah diganti atau dihapus.</p>}
      {cur === 'fail' && <p className="cek-msg" role="alert">Gagal memeriksa. Periksa sambungan, lalu coba lagi.</p>}
      {cur && typeof cur === 'object' && (
        <article className="cek-card">
          <a href={`/api/photo/${cur.kode}`} target="_blank" rel="noreferrer">
            <img src={`/api/photo/${cur.kode}`} alt={`Foto ${cur.no_lambung} sisi ${cur.sisi}`} decoding="async" />
          </a>
          <dl>
            <div><dt>Unit</dt><dd>{cur.no_lambung}</dd></div>
            <div><dt>Sisi</dt><dd className="cap">{cur.sisi}</dd></div>
            <div><dt>Dijepret</dt><dd>{wita(cur.captured_at)}</dd></div>
            <div><dt>Diterima server</dt><dd>{wita(cur.received_at)}</dd></div>
          </dl>
        </article>
      )}
    </main>
  );
}
