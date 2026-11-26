import { useState } from 'react';
import { SISI, type AdminPeriod, type AdminPhoto, type AdminUnit, type Sisi } from '../../shared/types';
import { Sheet } from '../ui/Sheet';
import { adminFetch } from './api';
import DownloadButtons from './DownloadButtons';
import { clockOffsetText, witaText } from './unitUtils';

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// Panel detail satu unit: 4 foto, siapa yang memotret, jam HP vs server, alamat, hapus per foto, unduh ZIP unit ini.
export default function UnitDetail({ unit, period, onClose, onChanged }: {
  unit: AdminUnit; period?: AdminPeriod; onClose: () => void; onChanged: () => void;
}) {
  const [del, setDel] = useState<Sisi | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const purged = !!period?.purged_at;

  async function remove(sisi: Sisi) {
    const kode = unit.photos[sisi]?.kode;
    if (!kode) return;
    setBusy(true); setMsg('');
    try {
      const res = await adminFetch(`/api/admin/photo/${encodeURIComponent(kode)}`, { method: 'DELETE' });
      if (res.ok || res.status === 404) { setDel(null); onChanged(); } // 404 = sudah terhapus; cukup muat ulang
      else setMsg('Foto gagal dihapus. Coba lagi.');
    } catch { setMsg('Tidak ada koneksi. Coba lagi.'); }
    setBusy(false);
  }

  return (
    <aside className="ud" aria-label={`Detail ${unit.no_lambung}`}>
      <header className="ud-head">
        <div>
          <h2>{unit.no_lambung}</h2>
          <p>{unit.jenis_unit} · {unit.perusahaan}</p>
          <p>{unit.period} · {unit.week} · expired {unit.berlaku_akhir.split('-').reverse().join('/')}</p>
        </div>
        <button type="button" className="btn-2 btn-sm ud-close press" onClick={onClose}>Tutup</button>
      </header>
      {purged && <p className="ud-note">Foto sudah dihapus (retensi).</p>}
      {!purged && <DownloadButtons units={[unit]} rekap={false} zipLabel="Unduh ZIP unit ini" filename={`${unit.no_lambung.replace(/\s+/g, '')}.zip`} />}
      <ul className="ud-list">
        {SISI.map((s) => {
          const p = unit.photos[s];
          return (
            <li key={s} className="ud-side">
              {p ? <Photo unit={unit} sisi={s} p={p} onDelete={() => { setMsg(''); setDel(s); }} /> : (
                <div className="ud-none"><span className="ud-ph" aria-hidden="true">{cap(s)}</span>
                  <div><h3>{cap(s)}</h3><p className="ud-dim">{purged ? 'Foto sudah dihapus (retensi).' : 'Belum ada foto.'}</p></div></div>
              )}
            </li>
          );
        })}
      </ul>
      <Sheet open={del !== null} onClose={() => !busy && setDel(null)} title="Hapus foto?">
        <p className="ud-conf">Foto sisi {del} unit {unit.no_lambung} akan dihapus permanen.</p>
        <p className="ud-conf-err" role="alert">{msg}</p>
        <button type="button" className="btn ud-danger press" disabled={busy} onClick={() => del && remove(del)}>{busy ? 'Menghapus…' : 'Hapus foto'}</button>
        <button type="button" className="btn-plain press" disabled={busy} onClick={() => setDel(null)}>Batal</button>
      </Sheet>
    </aside>
  );
}

function Photo({ unit, sisi, p, onDelete }: { unit: AdminUnit; sisi: Sisi; p: AdminPhoto; onDelete: () => void }) {
  const src = `/api/photo/${encodeURIComponent(p.kode)}`;
  const [bad, setBad] = useState(false);
  const jam = p.flags.split(',').includes('jam');
  const gps = p.flags.split(',').includes('gps');
  return (
    <>
      {bad ? <div className="ud-photo ud-photo-bad" role="img" aria-label="Foto tidak ditemukan" title="Foto tidak ditemukan">Foto tidak ditemukan</div> : (
        <a className="ud-photo" href={src} target="_blank" rel="noopener" aria-label={`Buka foto ${sisi} ukuran asli`}>
          <img src={src} alt={`Foto sisi ${sisi} unit ${unit.no_lambung}`} loading="lazy" decoding="async" width="600" height="800" onError={() => setBad(true)} />
        </a>
      )}
      <div className="ud-info">
        <h3>{cap(sisi)} <code>{p.kode}</code></h3>
        <p>{p.mekanik_nama} · NRP {p.mekanik_nrp}</p>
        <dl>
          <dt>Jam HP</dt><dd>{witaText(p.captured_at_device)}</dd>
          <dt>Jam server</dt><dd>{witaText(p.received_at_server)}</dd>
        </dl>
        <p className={jam ? 'ud-warn' : 'ud-dim'}>{jam && '⚠ '}{clockOffsetText(p.clock_offset_s)}</p>
        {gps && <p className="ud-warn">⚠ Lokasi GPS tidak tersedia saat foto diambil</p>}
        <p className="ud-addr">{p.address ?? (gps ? '' : 'Alamat tidak tersedia')}</p>
        <div className="ud-acts">
          <button type="button" className="btn-2 btn-sm btn-del press" onClick={onDelete}>Hapus foto</button>
        </div>
      </div>
    </>
  );
}
