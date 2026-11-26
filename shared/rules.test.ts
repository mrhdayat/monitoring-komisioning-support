import { describe, expect, test } from 'vitest';
import { adminStatus, classifyForMechanic, clockOff, expiryEndMs, isSupportUnit, purgeAfterMs } from './rules';

const WITA = (iso: string) => Date.parse(iso + '+08:00');
test('expiryEndMs = 23:59:59.999 WITA', () =>
  expect(expiryEndMs('2027-01-01')).toBe(WITA('2027-01-01T23:59:59.999')));
test('purgeAfterMs akhir bulan berikutnya', () => {
  expect(purgeAfterMs('Des/2026')).toBe(WITA('2027-01-31T23:59:59.999'));
  expect(purgeAfterMs('Jan/2027')).toBe(WITA('2027-02-28T23:59:59.999'));
  expect(() => purgeAfterMs('Xyz/2027')).toThrow();
});
test('clockOff > 5 menit', () => {
  expect(clockOff(300_000)).toBe(false); expect(clockOff(-300_001)).toBe(true);
});
describe('classifyForMechanic', () => {
  const now = WITA('2026-12-10T08:00:00');
  const u = { status_she: 'Belum Diajukan', in_latest_upload: true, berlaku_akhir: '2027-01-01' };
  test('aktif', () => expect(classifyForMechanic(u, 2, false, now)).toBe('aktif'));
  test('lengkap → selesai', () => expect(classifyForMechanic(u, 4, false, now)).toBe('selesai'));
  test('status SHE lain → tersembunyi', () =>
    expect(classifyForMechanic({ ...u, status_she: 'Off Hire' }, 0, false, now)).toBe('tersembunyi'));
  test('lewat expired → tersembunyi', () =>
    expect(classifyForMechanic({ ...u, berlaku_akhir: '2026-12-09' }, 2, false, now)).toBe('tersembunyi'));
  test('periode dihapus → tersembunyi', () => expect(classifyForMechanic(u, 4, true, now)).toBe('tersembunyi'));
  test('hilang dari upload terbaru → tersembunyi', () =>
    expect(classifyForMechanic({ ...u, in_latest_upload: false }, 3, false, now)).toBe('tersembunyi'));
  test('hilang dari upload tapi lengkap → selesai', () =>
    expect(classifyForMechanic({ ...u, in_latest_upload: false }, 4, false, now)).toBe('selesai'));
});
test('adminStatus', () => {
  const now = WITA('2026-12-10T08:00:00');
  expect(adminStatus(0, '2027-01-01', now)).toBe('belum');
  expect(adminStatus(3, '2027-01-01', now)).toBe('sebagian');
  expect(adminStatus(4, '2026-12-01', now)).toBe('lengkap');
  expect(adminStatus(3, '2026-12-01', now)).toBe('lewat_expired');
});
test('isSupportUnit', () => {
  const u = (no_lambung: string, perusahaan: string, kelompok_unit: string) => ({ no_lambung, perusahaan, kelompok_unit });
  expect(isSupportUnit(u('GS 0012', 'PPA', 'NON UNIT'))).toBe(true);
  expect(isSupportUnit(u('THDS 0009', 'PPA', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('LT 0003', 'AMM', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('THDS 0007', 'TU', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('FR 0001', '-', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u(' thds  0007 ', 'TU', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('GS 1', ' ppa ', 'Non  Unit'))).toBe(true);
  expect(isSupportUnit(u('DT 4464', 'PPA', 'WHEEL'))).toBe(false);
  expect(isSupportUnit(u('GS 9', 'BTN', 'NON UNIT'))).toBe(false);
});
