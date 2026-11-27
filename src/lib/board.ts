import { classifyForMechanic } from '../../shared/rules';
import { unitLabel } from '../../shared/populasi';
import type { Snapshot, SnapUnit } from '../../shared/types';

export type StatusFilter = 'semua' | 'belum' | 'sudah';
export interface BoardFilter { status: StatusFilter; week: string | null; q: string } // week = WeekOption.key
export interface WeekOption { key: string; label: string }        // key `${period_id}|${week}`
export interface BoardGroup { jenis: string; lengkap: number; total: number; units: SnapUnit[] }
// week = filter week yang benar-benar dipakai: null bila week pilihan sudah hilang dari data.
export interface BoardView { total: number; lengkap: number; belum: number; periods: string[]; weeks: WeekOption[]; week: string | null; groups: BoardGroup[] }

export const searchKey = (s: string): string =>
  s.toUpperCase().replace(/\s+/g, '').replace(/\d+/g, (d) => String(Number(d)));
export const jenisKey = (s: string): string => s.trim().toUpperCase().replace(/\s+/g, ' ');
export const sidesDone = (u: SnapUnit): number => Object.keys(u.sides).length;

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
// berlaku_akhir sudah tanggal WITA (YYYY-MM-DD): jangan lewat Date supaya zona HP tidak berpengaruh.
export const fmtTanggal = (d: string): string => `${+d.slice(8, 10)} ${BULAN[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

const num = (a: string, b: string) => a.localeCompare(b, 'id', { numeric: true });

export function boardView(s: Snapshot, f: BoardFilter, now: number): BoardView {
  const periods = new Map(s.periods.map((p, i) => [p.id, { ...p, i }]));
  const shown = s.units.filter((u) => {
    const p = periods.get(u.period_id);
    return classifyForMechanic(u, sidesDone(u), !p || p.purge_after <= now, now) !== 'tersembunyi';
  });
  const lengkap = shown.filter((u) => sidesDone(u) === 4).length;

  const multi = new Set(shown.map((u) => u.period_id)).size > 1;
  const weekMap = new Map<string, { pi: number; week: string; label: string }>();
  for (const u of shown) {
    const p = periods.get(u.period_id);
    weekMap.set(`${u.period_id}|${u.week}`, {
      pi: p?.i ?? Infinity, week: u.week, label: multi && p ? `${p.label} · ${u.week}` : u.week,
    });
  }
  const weeks = [...weekMap].sort(([, a], [, b]) => a.pi - b.pi || num(a.week, b.week))
    .map(([key, w]) => ({ key, label: w.label }));

  const week = f.week !== null && weekMap.has(f.week) ? f.week : null;
  const q = searchKey(f.q);
  const scoped = shown.filter((u) =>
    (week === null || `${u.period_id}|${u.week}` === week) && [u.code_unit, u.skr_bib, u.no_lambung].some((n) => n && searchKey(n).includes(q)));
  const byJenis = new Map<string, SnapUnit[]>();
  for (const u of scoped) {
    const k = jenisKey(u.jenis_unit);
    byJenis.set(k, [...(byJenis.get(k) ?? []), u]);
  }
  const groups = [...byJenis].sort(([a], [b]) => a.localeCompare(b))
    .map(([jenis, all]) => ({
      jenis, total: all.length, lengkap: all.filter((u) => sidesDone(u) === 4).length,
      units: all.filter((u) => f.status === 'semua' || (sidesDone(u) === 4) === (f.status === 'sudah'))
        .sort((a, b) => num(unitLabel(a), unitLabel(b))),
    }))
    .filter((g) => g.units.length > 0);

  return {
    total: shown.length, lengkap, belum: shown.length - lengkap,
    // Urut snapshot (sama dengan urutan week), bukan urutan unit pertama yang kebetulan muncul.
    periods: s.periods.filter((p) => shown.some((u) => u.period_id === p.id)).map((p) => p.label),
    weeks, week, groups,
  };
}
