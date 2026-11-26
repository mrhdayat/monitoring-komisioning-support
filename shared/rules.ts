import type { AdminStatus, ImportUnit, Section, SnapUnit } from './types';

const WITA_MS = 8 * 3600_000; // Asia/Makassar tetap UTC+8, tanpa DST

export const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, mei: 5, may: 5, jun: 6, jul: 7,
  agu: 8, agt: 8, aug: 8, sep: 9, okt: 10, oct: 10, nov: 11, des: 12, dec: 12,
};

export const expiryEndMs = (berlakuAkhir: string): number =>
  Date.parse(`${berlakuAkhir}T23:59:59.999+08:00`);

export const isExpired = (berlakuAkhir: string, now: number): boolean => now > expiryEndMs(berlakuAkhir);

export function purgeAfterMs(periodLabel: string): number {
  const m = /^([A-Za-z]{3})\/(\d{4})$/.exec(periodLabel.trim());
  const month = m && MONTHS[m[1].toLowerCase()];
  if (!m || !month) throw new Error(`Label periode tidak valid: ${periodLabel}`);
  // awal bulan ke-(month+2) WITA dikurangi 1 ms = akhir bulan berikutnya
  return Date.UTC(+m[2], month + 1, 1) - WITA_MS - 1;
}

export const SUPPORT_PENGECUALIAN: readonly string[] = ['THDS 0007', 'FR 0001'];

const up = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
export function isSupportUnit(u: Pick<ImportUnit, 'no_lambung' | 'perusahaan' | 'kelompok_unit'>): boolean {
  if (SUPPORT_PENGECUALIAN.includes(up(u.no_lambung))) return true;
  return ['NON UNIT', 'SUPPORT'].includes(up(u.kelompok_unit)) && ['PPA', 'AMM'].includes(up(u.perusahaan));
}

export const CLOCK_TOLERANCE_MS = 300_000;
export const clockOff = (offsetMs: number): boolean => Math.abs(offsetMs) > CLOCK_TOLERANCE_MS;

export function classifyForMechanic(
  u: Pick<SnapUnit, 'status_she' | 'in_latest_upload' | 'berlaku_akhir'>,
  sidesDone: number, periodPurged: boolean, now: number,
): Section {
  if (u.status_she !== 'Belum Diajukan') return 'tersembunyi';
  if (periodPurged) return 'tersembunyi';
  if (isExpired(u.berlaku_akhir, now)) return 'tersembunyi';
  if (sidesDone === 4) return 'selesai';
  if (!u.in_latest_upload) return 'tersembunyi';
  return 'aktif';
}

export function adminStatus(sidesDone: number, berlakuAkhir: string, now: number): AdminStatus {
  if (sidesDone === 4) return 'lengkap';
  if (isExpired(berlakuAkhir, now)) return 'lewat_expired';
  return sidesDone === 0 ? 'belum' : 'sebagian';
}
