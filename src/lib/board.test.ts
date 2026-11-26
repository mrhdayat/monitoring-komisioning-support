import { expect, test } from 'vitest';
import { boardView, searchKey } from './board';
import type { Snapshot, SnapUnit } from '../../shared/types';

const NOW = Date.parse('2026-12-15T12:00:00+08:00');
const f = { kode: 'X', at: 1 };
const four = { depan: f, belakang: f, kanan: f, kiri: f };
const mk = (id: number, no: string, jenis: string, period_id: number, week: string, sides: SnapUnit['sides'],
  over: Partial<SnapUnit> = {}): SnapUnit => ({
  id, period_id, no_lambung: no, perusahaan: 'PPA', kelompok_unit: 'SUPPORT', jenis_unit: jenis, week,
  berlaku_akhir: '2027-01-31', status_she: 'Belum Diajukan', in_latest_upload: true, sides, ...over,
});
const base: Omit<Snapshot, 'recent'> = {
  version: 1,
  periods: [
    { id: 1, label: 'Des/2026', purge_after: Date.parse('2027-01-31T23:59:59.999+08:00') },
    { id: 2, label: 'Jan/2027', purge_after: Date.parse('2027-02-28T23:59:59.999+08:00') },
  ],
  units: [
    mk(1, 'GS 0012', 'GENSET', 1, 'Week 1', four),
    mk(2, 'GS 0031', 'Genset', 1, 'Week 1', { depan: f, kiri: f }),
    mk(3, 'LT 0003', 'LUBE TRUCK', 2, 'Week 2', {}),
    mk(4, 'TL 1', 'TOWER LAMP', 1, 'Week 9', {}, { status_she: 'Off Hire' }),
    mk(5, 'GS 0040', 'GENSET', 1, 'Week 9', { depan: f }, { berlaku_akhir: '2026-12-14' }),
  ],
};
// snapshot lama di cache masih membawa `recent`; harus diabaikan
const snap = { ...base, recent: [] } as Snapshot;

test('skor tidak ikut filter', () => {
  const v = boardView(snap, { status: 'belum', week: null, q: 'lt' }, NOW);
  expect([v.total, v.lengkap, v.belum]).toEqual([3, 1, 2]);
});
test('grup: Genset/GENSET digabung, n/m sebelum filter status', () => {
  const v = boardView(snap, { status: 'belum', week: null, q: '' }, NOW);
  expect(v.groups.map((g) => [g.jenis, g.lengkap, g.total, g.units.map((u) => u.no_lambung)]))
    .toEqual([['GENSET', 1, 2, ['GS 0031']], ['LUBE TRUCK', 0, 1, ['LT 0003']]]);
});
test('filter sudah membuang grup kosong', () => {
  expect(boardView(snap, { status: 'sudah', week: null, q: '' }, NOW).groups.map((g) => g.jenis)).toEqual(['GENSET']);
});
test('searchKey: gs12, 0012, "GS 0012" cocok', () => {
  for (const q of ['gs12', '0012', 'GS 0012', 'g s 1 2']) expect(searchKey('GS 0012').includes(searchKey(q))).toBe(true);
  expect(searchKey('GS 0012').includes(searchKey('gs13'))).toBe(false);
});
test('week: label berawalan periode bila >1 periode, filter week', () => {
  const v = boardView(snap, { status: 'semua', week: null, q: '' }, NOW);
  expect(v.weeks.map((w) => w.label)).toEqual(['Des/2026 · Week 1', 'Jan/2027 · Week 2']);
  const w = boardView(snap, { status: 'semua', week: v.weeks[1].key, q: '' }, NOW);
  expect(w.groups.flatMap((g) => g.units.map((u) => u.no_lambung))).toEqual(['LT 0003']);
});
test('poll mengubah status saat filter belum: unit hilang, skor naik', () => {
  const after = structuredClone(snap);
  after.units.find((u) => u.no_lambung === 'GS 0031')!.sides = four;
  const v = boardView(after, { status: 'belum', week: null, q: '' }, NOW);
  expect(v.lengkap).toBe(2);
  expect(v.groups.flatMap((g) => g.units.map((u) => u.no_lambung))).toEqual(['LT 0003']);
});
