import { useRef, useState } from 'react';
import type { AdminUnit, ImportUnit } from '../../shared/types';
import { adminFetch } from './api';

interface Group { label: string; units: ImportUnit[]; byStatus: [string, number][]; willHide: number | null }
interface Preview { name: string; groups: Group[]; errors: string[]; totalRows: number; supportRows: number }
interface Done { label: string; total: number; hidden: number }

const nf = new Intl.NumberFormat('id-ID');
const BATCH = 100;
const chunk = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

async function post(path: string, body: unknown) {
  const res = await adminFetch(path, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error(String(res.status));
  return res.json() as Promise<Record<string, number>>;
}

export default function Import() {
  const [prev, setPrev] = useState<Preview | null>(null);
  const [reading, setReading] = useState(false);
  const [drag, setDrag] = useState(false);
  const [err, setErr] = useState('');
  const [run, setRun] = useState<{ label: string; done: number; total: number } | null>(null);
  const [done, setDone] = useState<Done[] | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function pick(file?: File) {
    if (!file) return;
    setErr(''); setDone(null); setPrev(null); setReading(true);
    try {
      const { readSheFile } = await import('./excel');
      const { byPeriod, errors, totalRows, supportRows } = await readSheFile(file);
      // Bandingkan dengan data sekarang: unit yang masih tampil tetapi tidak ada di berkas akan disembunyikan.
      let existing: AdminUnit[] | null = null;
      try {
        const res = await adminFetch('/api/admin/units');
        if (res.ok) existing = ((await res.json()) as { units: AdminUnit[] }).units;
      } catch { /* pratinjau tetap jalan tanpa angka perbandingan */ }
      const groups = [...byPeriod].map(([label, units]): Group => {
        const inFile = new Set(units.map((u) => u.no_lambung));
        const counts = new Map<string, number>();
        for (const u of units) counts.set(u.status_she, (counts.get(u.status_she) ?? 0) + 1);
        return {
          label, units, byStatus: [...counts].sort((a, b) => b[1] - a[1]),
          willHide: existing && existing.filter((u) => u.period === label && u.in_latest_upload && !inFile.has(u.no_lambung)).length,
        };
      });
      if (groups.length === 0 && errors.length === 0) {
        errors.push(totalRows > 0 && supportRows === 0
          ? 'File ini tidak berisi unit section support (Kelompok NON UNIT/SUPPORT, perusahaan PPA/AMM).'
          : 'Berkas tidak berisi unit.');
      }
      setPrev({ name: file.name, groups, errors, totalRows, supportRows });
    } catch { setErr('Berkas tidak bisa dibaca. Pastikan formatnya .xlsx atau .xls.'); }
    setReading(false);
    if (input.current) input.current.value = '';
  }

  async function save() {
    if (!prev) return;
    setErr('');
    const total = prev.groups.reduce((n, g) => n + g.units.length, 0);
    const results: Done[] = [];
    let sent = 0;
    for (const g of prev.groups) {
      const importId = crypto.randomUUID();
      const batches = chunk(g.units, BATCH);
      for (let k = 0; k < batches.length; k++) {
        setRun({ label: g.label, done: sent, total });
        try { await post('/api/admin/import', { period: g.label, importId, units: batches[k] }); }
        catch { setRun(null); setErr(`Gagal di batch ${k + 1}; data lama tetap dipakai. Coba lagi.`); return; }
        sent += batches[k].length;
      }
      setRun({ label: g.label, done: sent, total });
      try {
        const r = await post('/api/admin/import/finish', { period: g.label, importId });
        results.push({ label: g.label, total: r.total, hidden: r.hidden });
      } catch { setRun(null); setErr('Gagal menutup impor; data lama tetap dipakai. Coba lagi.'); return; }
    }
    setRun(null); setPrev(null); setDone(results);
  }

  const n = prev?.groups.reduce((s, g) => s + g.units.length, 0) ?? 0;

  return (
    <section className="im" aria-label="Upload Excel SHE">
      <label className={`im-drop${drag ? ' is-drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void pick(e.dataTransfer.files[0]); }}>
        <input ref={input} type="file" accept=".xlsx,.xls" disabled={!!run} onChange={(e) => void pick(e.target.files?.[0])} />
        <b>{reading ? 'Membaca berkas…' : 'Pilih atau seret berkas Excel SHE'}</b>
        <span>.xlsx atau .xls. Unit yang tidak ada di berkas baru akan disembunyikan dari mekanik.</span>
      </label>

      {err && <p className="ut-err" role="alert">{err}</p>}

      {prev && (
        <div className="im-prev">
          <h2 className="im-h">{prev.name}</h2>
          {prev.totalRows > 0 && <p className="im-sum"><b className="cond">{nf.format(prev.supportRows)}</b> unit support dari {nf.format(prev.totalRows)} baris</p>}
          {prev.groups.map((g) => (
            <dl key={g.label} className="im-card">
              <div className="im-per"><dt>Periode</dt><dd>{g.label}</dd></div>
              <div><dt>Total unit</dt><dd>{nf.format(g.units.length)}</dd></div>
              {g.byStatus.map(([s, c]) => <div key={s}><dt>Status {s}</dt><dd>{nf.format(c)}</dd></div>)}
              <div><dt>Akan disembunyikan</dt><dd>{g.willHide === null ? 'Tidak diketahui' : nf.format(g.willHide)}</dd></div>
            </dl>
          ))}
          {prev.errors.length > 0 && (
            <div className="im-errs">
              <p><b>{nf.format(prev.errors.length)} masalah</b>{n > 0 && '. Baris bermasalah dilewati.'}</p>
              <ul tabIndex={0} aria-label="Daftar masalah">{prev.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          {run && (
            <p className="dl-prog" role="status">
              Menyimpan {run.label}: {nf.format(run.done)}/{nf.format(run.total)} unit…
              <progress max={run.total} value={run.done} aria-label="Kemajuan penyimpanan" />
            </p>
          )}
          <button type="button" className="btn btn-sm press im-go" disabled={n === 0 || !!run} onClick={save}>Simpan {nf.format(n)} unit</button>
        </div>
      )}

      {done && (
        <div className="im-ok" role="status">
          {done.map((d) => (
            <p key={d.label}><b>{d.label}</b>: {nf.format(d.total)} unit tersimpan, {nf.format(d.hidden)} tidak ada di berkas (disembunyikan dari mekanik).</p>
          ))}
        </div>
      )}
    </section>
  );
}
