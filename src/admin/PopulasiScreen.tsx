import { useCallback, useEffect, useRef, useState } from 'react';
import type { PopUnit } from '../../shared/types';
import { buildPopIndex } from '../../shared/populasi';
import { adminFetch } from './api';

interface Active { n: number; at: number | null }
interface Preview { name: string; units: PopUnit[]; byJenis: [string, number][]; dupCodes: string[]; ganda: string[]; errors: string[] }

const nf = new Intl.NumberFormat('id-ID');
const when = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'long', timeStyle: 'short', hourCycle: 'h23' });
const list = (xs: string[], max = 8) => xs.slice(0, max).join(', ') + (xs.length > max ? ` dan ${xs.length - max} lainnya` : '');

export default function Populasi() {
  const [active, setActive] = useState<Active | null | 'gagal'>(null);
  const [prev, setPrev] = useState<Preview | null>(null);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setActive(null);
    try {
      const res = await adminFetch('/api/admin/populasi');
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { units: PopUnit[]; uploaded_at: number | null };
      setActive({ n: j.units.length, at: j.uploaded_at });
    } catch { setActive('gagal'); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function pick(file?: File) {
    if (!file) return;
    setErr(''); setOk(''); setPrev(null); setReading(true);
    try {
      const { readPopulasiFile } = await import('./populasi');
      const { units, errors } = await readPopulasiFile(file);
      // Server menolak Code Unit ganda: simpan baris pertama saja dan beri tahu.
      const seen = new Set<string>(), dup = new Set<string>(), uniq: PopUnit[] = [];
      for (const u of units) { if (seen.has(u.code_unit)) dup.add(u.code_unit); else { seen.add(u.code_unit); uniq.push(u); } }
      const ganda = [...buildPopIndex(uniq)].filter(([, us]) => us.length > 1).map(([k]) => k);
      const jenis = new Map<string, number>();
      for (const u of uniq) jenis.set(u.jenis || '(tanpa jenis)', (jenis.get(u.jenis || '(tanpa jenis)') ?? 0) + 1);
      setPrev({ name: file.name, units: uniq, byJenis: [...jenis].sort((a, b) => b[1] - a[1]), dupCodes: [...dup], ganda, errors });
    } catch { setErr('Berkas tidak bisa dibaca. Pastikan formatnya .xlsx atau .xls.'); }
    setReading(false);
    if (input.current) input.current.value = '';
  }

  async function save() {
    if (!prev) return;
    setErr(''); setSaving(true);
    try {
      const res = await adminFetch('/api/admin/populasi', { method: 'PUT', body: JSON.stringify({ units: prev.units }) });
      if (!res.ok) throw new Error(String(res.status));
      const { count } = (await res.json()) as { count: number };
      setPrev(null); setOk(`${nf.format(count)} unit populasi tersimpan.`);
      void load();
    } catch { setErr('Populasi gagal disimpan; data lama tetap dipakai. Coba lagi.'); }
    setSaving(false);
  }

  return (
    <section className="im" aria-label="Populasi unit">
      <p className="pp-now" role="status">
        {active === null ? 'Memuat populasi…'
          : active === 'gagal' ? <>Populasi gagal dimuat. <button type="button" className="btn-2 btn-sm press" onClick={load}>Coba lagi</button></>
          : active.n === 0 ? 'Populasi belum diunggah'
          : <><b className="cond">{nf.format(active.n)}</b> unit · diunggah {active.at ? when.format(active.at) : '-'} WITA</>}
      </p>

      <label className={`im-drop${drag ? ' is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files[0]); }}>
        <input ref={input} type="file" accept=".xlsx,.xls" disabled={reading || saving} onChange={(e) => void pick(e.target.files?.[0])} />
        <b>{reading ? 'Membaca file populasi…' : 'Pilih atau seret berkas populasi'}</b>
        <span>{reading ? 'File besar bisa butuh beberapa detik.' : 'Sheet "PPA & AMM - Active". Hanya baris SECTION = SUPPORT yang dipakai.'}</span>
      </label>
      <p className="pp-note">Perubahan berlaku pada impor Excel SHE berikutnya.</p>

      {err && <p className="ut-err" role="alert">{err}</p>}
      {ok && <div className="im-ok" role="status"><p>{ok}</p></div>}

      {prev && (
        <div className="im-prev">
          <h2 className="im-h">{prev.name}</h2>
          <p className="im-sum"><b className="cond">{nf.format(prev.units.length)}</b> unit support</p>
          <dl className="im-card">
            {prev.byJenis.map(([j, c]) => <div key={j}><dt>{j}</dt><dd>{nf.format(c)}</dd></div>)}
          </dl>
          {prev.dupCodes.length > 0 && (
            <p className="im-errs">{nf.format(prev.dupCodes.length)} Code Unit ganda di file, dipakai baris pertama: {list(prev.dupCodes)}</p>
          )}
          {prev.ganda.length > 0 && (
            <p className="im-errs">{nf.format(prev.ganda.length)} nama ganda: satu nama dipakai lebih dari satu unit, jadi impor SHE menandainya &quot;Nama ganda&quot; tanpa Code Unit. {list(prev.ganda)}</p>
          )}
          {prev.errors.length > 0 && <div className="im-errs"><ul>{prev.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
          {saving && <p className="dl-prog" role="status">Menyimpan populasi…</p>}
          <button type="button" className="btn btn-sm press im-go" disabled={prev.units.length === 0 || saving} onClick={save}>
            Simpan populasi
          </button>
        </div>
      )}
    </section>
  );
}
