import { SISI, type AdminPeriod, type AdminStatus, type AdminUnit } from '../../shared/types';

export type StatusFilter = 'semua' | AdminStatus | 'cek';
export interface Filters { status: StatusFilter; q: string; periodId: number; week: string; hidden: boolean }

const DAY = 86_400_000;

export const hiddenFromMechanic = (u: AdminUnit) => u.status_she !== 'Belum Diajukan' || !u.in_latest_upload;
export const norm = (s: string) => s.toUpperCase().replace(/\s+/g, '');
export const missingSides = (u: AdminUnit) => SISI.filter((s) => !u.sides[s]);

// Satu baris per unit, siap ditempel ke WhatsApp.
export function waText(units: AdminUnit[]): string {
  return [`Unit belum lengkap (${units.length}):`, ...units.map((u) => `${u.no_lambung} (${u.week}) – belum: ${missingSides(u).join(', ')}`)].join('\n');
}

// periodId 0 = semua periode.
export function filterUnits(units: AdminUnit[], f: Filters): AdminUnit[] {
  const q = norm(f.q);
  return units.filter((u) =>
    (f.hidden || !hiddenFromMechanic(u)) &&
    (!f.periodId || u.period_id === f.periodId) &&
    (!f.week || u.week === f.week) &&
    (f.status === 'semua' || (f.status === 'cek' ? u.perluCek : u.status === f.status)) &&
    (!q || norm(u.no_lambung).includes(q)));
}

const unit = (n: number, s: string) => `${n} ${s}`;
export function clockOffsetText(offsetS: number): string {
  const a = Math.abs(offsetS);
  if (a < 300) return `Jam HP sesuai (selisih ${unit(a, 'detik')})`;
  const h = Math.floor(a / 3600), m = Math.round((a % 3600) / 60);
  const span = [h && unit(h, 'jam'), m && unit(m, 'menit')].filter(Boolean).join(' ');
  return `HP lebih ${offsetS > 0 ? 'lambat' : 'cepat'} ${span}`;
}

// Mulai H-7 sebelum purge_after; periode yang sudah dihapus tidak perlu peringatan.
export function retentionBanners(periods: AdminPeriod[], now: number) {
  return periods
    .filter((p) => !p.purged_at && p.purge_after - now <= 7 * DAY)
    .map((p) => ({ label: p.label, days: Math.max(0, Math.ceil((p.purge_after - now) / DAY)) }));
}

const fmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'medium', hourCycle: 'h23' });
export const witaText = (ms: number) => `${fmt.format(ms).replace(/\./g, ':')} WITA`;
