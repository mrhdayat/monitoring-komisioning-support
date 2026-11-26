import { useEffect, useState } from 'react';
import { normalizeKode } from '../../shared/kode';
import { navigate, useRoute } from '../router';
import { CekForm } from './CekForm';

interface Hasil { kode: string; no_lambung: string; sisi: string; captured_at: number; received_at: number }

const full = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'long', timeStyle: 'medium', hourCycle: 'h23' });
const wita = (ms: number) => `${full.format(ms).replace(/\./g, ':')} WITA`;

export default function CekKode() {
  const { params } = useRoute();
  const raw = params.kode ?? '';
  const kode = raw ? normalizeKode(raw) : null;
  const [res, setRes] = useState<{ kode: string; r: Hasil | 'none' | 'fail' } | null>(null);

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
    <main className="s-page">
      <header className="p-head">
        <div className="p-head-in">
          <div className="p-top">
            <h1 className="cond p-title">Cek Kode Foto</h1>
            <div className="p-links"><a href="/" className="p-link" onClick={(e) => { e.preventDefault(); navigate('/'); }}>‹ Kembali</a></div>
          </div>
        </div>
        <div className="hazard" />
      </header>
      <div className="s-body cek">
      <CekForm key={raw} initial={raw} replace />

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
      </div>
    </main>
  );
}
