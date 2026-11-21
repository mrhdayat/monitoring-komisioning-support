import { useMemo, useState } from 'react';
import { classifyForMechanic } from '../../shared/rules';
import type { SnapUnit } from '../../shared/types';
import { getMekanik } from '../lib/mekanik';
import { useQueueCount } from '../lib/useQueueCount';
import { useSnapshot } from '../lib/snapshot';
import { navigate } from '../router';
import { Pill } from '../ui/Pill';
import { ProgressCard } from '../ui/ProgressCard';
import { SideDots } from '../ui/SideDots';
import { InstallGuide } from './InstallGuide';
import { MekanikSheet } from './MekanikSheet';

// "DT 4464", "dt4464" dan "dt 4464" harus sama.
export const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase();

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
// berlaku_akhir sudah tanggal WITA (YYYY-MM-DD): jangan lewat Date supaya zona HP tidak berpengaruh.
export const fmtExp = (d: string) => `Exp ${d.slice(8, 10)} ${BULAN[+d.slice(5, 7) - 1]}`;

// No lambung yang muncul di dua periode atau lebih: hanya baris ini yang diberi label periode.
export function duplicates(units: { no_lambung: string; period_id: number }[]): Set<string> {
  const per = new Map<string, Set<number>>();
  for (const u of units) per.set(u.no_lambung, (per.get(u.no_lambung) ?? new Set()).add(u.period_id));
  return new Set([...per].filter(([, ids]) => ids.size > 1).map(([no]) => no));
}

const jam = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

const byWeek = (a: string, b: string) => a.localeCompare(b, 'id', { numeric: true });
const byExp = (a: SnapUnit, b: SnapUnit) => a.berlaku_akhir.localeCompare(b.berlaku_akhir) || byWeek(a.no_lambung, b.no_lambung);

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return <button type="button" className="chip" aria-pressed={on} onClick={onClick}>{children}</button>;
}

function Groups({ units, dup, labels, onPick }: { units: SnapUnit[]; dup: Set<string>; labels: Map<number, string>; onPick: (u: SnapUnit) => void }) {
  const groups = new Map<string, SnapUnit[]>();
  for (const u of [...units].sort(byExp)) groups.set(u.week, [...(groups.get(u.week) ?? []), u]);
  return [...groups].sort(([a], [b]) => byWeek(a, b)).map(([week, list]) => (
    // content-visibility: grup di luar layar tidak dihitung tata letaknya (±400 baris).
    <section key={week} className="grp" style={{ containIntrinsicSize: `auto ${list.length * 64 + 40}px` }}>
      <h2 className="grp-h">{week}</h2>
      <ul className="grp-list">
        {list.map((u) => (
          <li key={u.id}>
            <button type="button" className="row" onClick={() => onPick(u)}>
              <span className="row-main">
                <span className="row-id">
                  {u.no_lambung}
                  {dup.has(u.no_lambung) && <span className="row-period">{labels.get(u.period_id)}</span>}
                </span>
                <span className="row-sub">{u.jenis_unit} · {u.perusahaan}</span>
              </span>
              <span className="row-r">
                <SideDots sides={u.sides} />
                <span className="row-exp">{fmtExp(u.berlaku_akhir)}</span>
              </span>
              <svg className="row-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" /></svg>
            </button>
          </li>
        ))}
      </ul>
    </section>
  ));
}

export default function UnitList() {
  const { data, stale, updatedAt } = useSnapshot();
  const queue = useQueueCount();
  const [q, setQ] = useState('');
  const [week, setWeek] = useState<string | null>(null);
  const [period, setPeriod] = useState<number | null>(null);
  const [pick, setPick] = useState<SnapUnit | null>(null);

  const view = useMemo(() => {
    if (!data) return null;
    const now = Date.now();
    const purged = new Set(data.periods.filter((p) => p.purge_after <= now).map((p) => p.id));
    const aktif: SnapUnit[] = [], selesai: SnapUnit[] = [];
    for (const u of data.units) {
      const s = classifyForMechanic(u, Object.keys(u.sides).length, purged.has(u.period_id), now);
      if (s === 'aktif') aktif.push(u); else if (s === 'selesai') selesai.push(u);
    }
    const all = [...aktif, ...selesai];
    const pIds = new Set(all.map((u) => u.period_id));
    return {
      aktif, selesai, dup: duplicates(all),
      weeks: [...new Set(all.map((u) => u.week))].sort(byWeek),
      periods: data.periods.filter((p) => pIds.has(p.id)),
      labels: new Map(data.periods.map((p) => [p.id, p.label])),
    };
  }, [data]);

  async function onPick(u: SnapUnit) {
    if (await getMekanik()) navigate(`/unit/${u.id}/kamera`); else setPick(u);
  }

  const nq = norm(q);
  const keep = (u: SnapUnit) =>
    (!week || u.week === week) && (period === null || u.period_id === period) && (!nq || norm(u.no_lambung).includes(nq));
  const aktif = view?.aktif.filter(keep) ?? [];
  const selesai = view?.selesai.filter(keep) ?? [];

  // Pil berubah di atas layar: beri ruang supaya judul tidak tertutup.
  const pill = stale ? 'offline' : queue > 0 ? 'warning' : null;

  return (
    <main className={`screen${pill ? ' has-pill' : ''}`}>
      {stale && <Pill tone="offline">{updatedAt ? `Offline · daftar terakhir diperbarui ${jam.format(updatedAt)}` : 'Offline'}</Pill>}
      {!stale && queue > 0 && <Pill tone="warning">{queue} foto belum terkirim</Pill>}

      <h1 className="large-title">Komisioning</h1>
      <input
        type="search" className="search" placeholder="Cari no lambung" aria-label="Cari no lambung"
        value={q} onChange={(e) => setQ(e.target.value)}
        autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="search"
      />

      {!view ? (
        <p className="empty">
          {stale ? 'Daftar belum pernah dimuat. Sambungkan internet sekali untuk memuat daftar unit.' : 'Memuat daftar…'}
        </p>
      ) : (
        <>
          {view.weeks.length > 0 && (
            <div className="chips" role="group" aria-label="Filter Week">
              <Chip on={!week} onClick={() => setWeek(null)}>Semua</Chip>
              {view.weeks.map((w) => <Chip key={w} on={week === w} onClick={() => setWeek(w)}>{w}</Chip>)}
            </div>
          )}
          {view.periods.length > 1 && (
            <div className="chips" role="group" aria-label="Filter periode">
              <Chip on={period === null} onClick={() => setPeriod(null)}>Semua periode</Chip>
              {view.periods.map((p) => <Chip key={p.id} on={period === p.id} onClick={() => setPeriod(p.id)}>{p.label}</Chip>)}
            </div>
          )}

          <ProgressCard
            done={view.selesai.length}
            total={view.aktif.length + view.selesai.length}
            sub={<>unit lengkap · <b>{view.aktif.length} belum difoto</b></>}
          />

          {view.aktif.length === 0 ? (
            <p className="empty">Semua unit sudah difoto</p>
          ) : aktif.length === 0 && selesai.length === 0 ? (
            <p className="empty">Tidak ada unit yang cocok.</p>
          ) : (
            <Groups units={aktif} dup={view.dup} labels={view.labels} onPick={onPick} />
          )}

          {view.selesai.length > 0 && (
            <details className="done">
              <summary>
                Selesai ({selesai.length})
                <svg className="row-chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" /></svg>
              </summary>
              <Groups units={selesai} dup={view.dup} labels={view.labels} onPick={onPick} />
            </details>
          )}
        </>
      )}

      <MekanikSheet
        open={!!pick}
        onClose={() => setPick(null)}
        onSaved={() => { if (pick) navigate(`/unit/${pick.id}/kamera`); }}
      />
      <InstallGuide />
    </main>
  );
}
