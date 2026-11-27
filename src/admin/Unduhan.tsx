import { useEffect, useMemo, useState } from 'react';
import type { AdminPeriod, AdminUnit } from '../../shared/types';
import { adminFetch } from './api';
import DownloadButtons from './DownloadButtons';
import { zipFile } from './Downloads';
import { filterUnits, retentionBanners } from './unitUtils';

const weekNo = (w: string) => Number(/\d+/.exec(w)?.[0] ?? 0);

export default function Unduhan() {
  const [data, setData] = useState<{ periods: AdminPeriod[]; units: AdminUnit[] } | null>(null);
  const [error, setError] = useState('');
  const [periodId, setPeriodId] = useState(0);
  const [week, setWeek] = useState('');

  useEffect(() => {
    adminFetch('/api/admin/units').then((r) => (r.ok ? r.json() : Promise.reject())).then(setData).catch(() => setError('Data unit gagal dimuat.'));
  }, []);

  const live = useMemo(() => data?.periods.filter((p) => !p.purged_at) ?? [], [data]);
  const pool = useMemo(() => (data?.units ?? []).filter((u) => live.some((p) => p.id === u.period_id)), [data, live]);
  const weeks = useMemo(() => [...new Set(pool.filter((u) => !periodId || u.period_id === periodId).map((u) => u.week))].sort((a, b) => weekNo(a) - weekNo(b)), [pool, periodId]);
  const rows = useMemo(() => filterUnits(pool, { status: 'semua', q: '', periodId, week, hidden: true }), [pool, periodId, week]);
  const banners = useMemo(() => retentionBanners(data?.periods ?? [], Date.now()), [data]);
  const photos = rows.reduce((n, u) => n + Object.keys(u.photos).length, 0);

  if (error) return <p className="ut-state" role="alert">{error}</p>;
  if (!data) return <p className="ut-state">Memuat…</p>;

  return (
    <section className="un" aria-label="Unduhan">
      {banners.map((b) => (
        <p key={b.label} className="ut-ban" role="status">
          Foto periode {b.label} akan dihapus {b.days === 0 ? 'hari ini' : `dalam ${b.days} hari`}, unduh sekarang.
        </p>
      ))}
      <div className="ut-bar">
        <select aria-label="Periode" value={periodId} onChange={(e) => { setPeriodId(Number(e.target.value)); setWeek(''); }}>
          <option value={0}>Semua periode</option>
          {live.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <select aria-label="Week" value={week} onChange={(e) => setWeek(e.target.value)}>
          <option value="">Semua week</option>
          {weeks.map((w) => <option key={w}>{w}</option>)}
        </select>
        <span className="ut-count">{rows.length} unit · {photos} foto</span>
      </div>
      <DownloadButtons units={rows} filename={zipFile(live.find((p) => p.id === periodId)?.label, week)} />
    </section>
  );
}
