import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SISI, type AdminPeriod, type AdminUnit } from '../../shared/types';
import { navigate } from '../router';
import { Pill } from '../ui/Pill';
import { adminFetch } from './api';
import DownloadButtons from './DownloadButtons';
import { zipFile } from './Downloads';
import UnitDetail from './UnitDetail';
import { filterUnits, hiddenFromMechanic, retentionBanners, waText, type Filters, type StatusFilter } from './unitUtils';

export { waText };

const STATUS: { id: StatusFilter; label: string }[] = [
  { id: 'semua', label: 'Semua' }, { id: 'belum', label: 'Belum' }, { id: 'sebagian', label: 'Sebagian' },
  { id: 'lengkap', label: 'Lengkap' }, { id: 'cek', label: '⚠ Perlu cek' },
];
const expFmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
const expText = (d: string) => expFmt.format(Date.parse(`${d}T00:00:00Z`));
const weekNo = (w: string) => Number(/\d+/.exec(w)?.[0] ?? 0);

function Chip({ u }: { u: AdminUnit }) {
  const n = SISI.filter((s) => u.sides[s]).length;
  return (
    <span className="ut-chips">
      {u.status === 'belum' && <span className="badge badge-no">Belum</span>}
      {u.status === 'lengkap' && <span className="badge badge-ok">Lengkap</span>}
      {u.status === 'sebagian' && (
        <span className="ut-part" role="img" aria-label={`Sebagian, ${n} dari 4 sisi`}>
          <span className="dots">{SISI.map((s) => <i key={s} className={u.sides[s] ? 'on' : undefined} />)}</span>
          <b>{n}/4</b>
        </span>
      )}
      {u.status === 'lewat_expired' && <span className="badge badge-late">Lewat expired{n > 0 && ` · ${n}/4`}</span>}
      {u.perluCek && <span className="badge badge-cek">⚠ Perlu cek</span>}
    </span>
  );
}

function Thumbs({ u, purged }: { u: AdminUnit; purged: boolean }) {
  return (
    <span className="ut-thumbs">
      {SISI.map((s) => {
        const p = u.photos[s];
        return p && !purged
          ? <img key={s} src={`/api/photo/${encodeURIComponent(p.kode)}`} alt="" title={`Sisi ${s}`} loading="lazy" decoding="async" width="26" height="34" />
          : <i key={s} className="ut-empty" title={`Sisi ${s} belum ada`}>{s[0].toUpperCase()}</i>;
      })}
    </span>
  );
}

export default function UnitTable() {
  const [data, setData] = useState<{ periods: AdminPeriod[]; units: AdminUnit[] } | null>(null);
  const [error, setError] = useState('');
  const [f, setF] = useState<Filters>({ status: 'semua', q: '', periodId: 0, week: '', hidden: false });
  const [sel, setSel] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyErr, setCopyErr] = useState('');
  const timer = useRef<number>(0);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/units');
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError('');
    } catch { setError('Data unit gagal dimuat.'); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const periods = data?.periods;
  const purged = useMemo(() => new Set(periods?.filter((p) => p.purged_at).map((p) => p.id)), [periods]);
  const pool = useMemo(() => (data?.units ?? []).filter((u) => f.periodId || !purged.has(u.period_id)), [data, f.periodId, purged]);
  const rows = useMemo(() => filterUnits(pool, f), [pool, f]);
  const weeks = useMemo(() => [...new Set(pool.map((u) => u.week))].sort((a, b) => weekNo(a) - weekNo(b)), [pool]);
  const banners = useMemo(() => retentionBanners(periods ?? [], Date.now()), [periods]);
  const hiddenCount = useMemo(() => pool.filter(hiddenFromMechanic).length, [pool]);
  const todo = useMemo(() => rows.filter((u) => u.status === 'belum' || u.status === 'sebagian'), [rows]);
  const selected = data?.units.find((u) => u.id === sel) ?? null;
  const set = (p: Partial<Filters>) => setF((x) => ({ ...x, ...p }));

  async function copy() {
    setCopyErr('');
    try {
      await navigator.clipboard.writeText(waText(todo));
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { setCopyErr('Gagal menyalin. Izinkan akses papan klip di peramban, lalu coba lagi.'); }
  }

  if (error && !data) return <p className="ut-state" role="alert">{error} <button type="button" className="ud-btn press" onClick={load}>Coba lagi</button></p>;
  if (!data) return <p className="ut-state">Memuat…</p>;

  return (
    <div className={`ut-wrap${selected ? ' has-detail' : ''}`}>
      <section className="ut" aria-label="Daftar unit">
        {banners.map((b) => (
          <p key={b.label} className="ut-ban" role="status">
            <span>Foto periode {b.label} akan dihapus {b.days === 0 ? 'hari ini' : `dalam ${b.days} hari`}, unduh sekarang.</span>
            <a href="/admin/unduhan" onClick={(e) => { e.preventDefault(); navigate('/admin/unduhan'); }}>Ke Unduhan</a>
          </p>
        ))}
        <div className="ut-bar">
          <input type="search" className="ut-search" placeholder="Cari no lambung" aria-label="Cari no lambung" value={f.q} onChange={(e) => set({ q: e.target.value })} />
          <select aria-label="Periode" value={f.periodId} onChange={(e) => set({ periodId: Number(e.target.value) })}>
            <option value={0}>Semua periode</option>
            {data.periods.map((p) => <option key={p.id} value={p.id}>{p.label}{p.purged_at ? ' (dihapus)' : ''}</option>)}
          </select>
          <select aria-label="Week" value={f.week} onChange={(e) => set({ week: e.target.value })}>
            <option value="">Semua week</option>
            {weeks.map((w) => <option key={w}>{w}</option>)}
          </select>
        </div>
        <div className="ut-bar">
          <div className="ut-seg" role="group" aria-label="Status">
            {STATUS.map((s) => (
              <button key={s.id} type="button" className="ut-seg-b press" aria-pressed={f.status === s.id} onClick={() => set({ status: s.id })}>{s.label}</button>
            ))}
          </div>
          <label className="ut-chk">
            <input type="checkbox" checked={f.hidden} onChange={(e) => set({ hidden: e.target.checked })} />
            Tampilkan unit tersembunyi{hiddenCount > 0 && ` (${hiddenCount})`}
          </label>
        </div>
        <div className="ut-bar ut-bar-end">
          <span className="ut-count">{rows.length} unit</span>
          <button type="button" className="ut-copy press" disabled={todo.length === 0} onClick={copy}>Salin daftar untuk WA ({todo.length})</button>
        </div>
        <DownloadButtons units={rows} filename={zipFile(data.periods.find((p) => p.id === f.periodId)?.label, f.week)} />
        {copyErr && <p className="ut-err" role="alert">{copyErr}</p>}
        {copied && <Pill tone="info">Disalin</Pill>}

        <div className="ut-head" aria-hidden="true">
          <span>Unit</span><span className="c-co">Perusahaan</span><span className="c-per">Periode · Week</span><span className="c-exp">Expired</span><span>Foto</span><span>Status</span>
        </div>
        {rows.length === 0 ? <p className="ut-state">Tidak ada unit yang cocok.</p> : (
          <ul className="ut-list">
            {rows.map((u) => (
              <li key={u.id}>
                <button type="button" className="ut-row" aria-current={u.id === sel ? 'true' : undefined} onClick={() => setSel(u.id === sel ? null : u.id)}>
                  <span className="c-unit">
                    <b>{u.no_lambung}</b>
                    <small>{u.jenis_unit}<span className="m-only"> · {u.perusahaan}</span></small>
                    <small className="m-only">{u.period} · {u.week} · exp {expText(u.berlaku_akhir)}</small>
                    {hiddenFromMechanic(u) && <small className="ut-hid">Disembunyikan dari mekanik</small>}
                  </span>
                  <span className="c-co">{u.perusahaan}</span>
                  <span className="c-per">{u.period}<small>{u.week}</small></span>
                  <span className="c-exp">{expText(u.berlaku_akhir)}</span>
                  <Thumbs u={u} purged={purged.has(u.period_id)} />
                  <Chip u={u} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {selected && (
        <UnitDetail key={selected.id} unit={selected} period={data.periods.find((p) => p.id === selected.period_id)}
          onClose={() => setSel(null)} onChanged={load} />
      )}
    </div>
  );
}
