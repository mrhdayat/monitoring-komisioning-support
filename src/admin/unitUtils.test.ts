import { describe, expect, it } from 'vitest';
import type { AdminUnit } from '../../shared/types';
import { clockOffsetText, filterUnits, retentionBanners, waText, type Filters } from './unitUtils';

const U = (o: Partial<AdminUnit>): AdminUnit => ({
  id: 1, period_id: 1, no_lambung: 'DT 4464', perusahaan: 'PT A', kelompok_unit: 'DT', jenis_unit: 'Dump Truck',
  week: 'Week 2', berlaku_akhir: '2027-01-01', status_she: 'Belum Diajukan', in_latest_upload: true,
  sides: {}, period: 'Des/2026', status: 'belum', perluCek: false, pop_status: 'tidak_ada', photos: {}, ...o,
});
const F = (o: Partial<Filters> = {}): Filters => ({ status: 'semua', q: '', periodId: 0, week: '', hidden: false, ...o });
const kiri = { kode: 'AAAA-BBBB', at: 1 };

describe('waText', () => {
  it('satu baris per unit dengan sisi yang belum', () => {
    const t = waText([
      U({ sides: { depan: kiri, belakang: kiri }, status: 'sebagian' }),
      U({ no_lambung: 'DA 25072', week: 'Week 1' }),
    ]);
    expect(t).toBe('Unit belum lengkap (2):\nDT 4464 (Week 2) – belum: kanan, kiri\nDA 25072 (Week 1) – belum: depan, belakang, kanan, kiri');
  });
  it('daftar kosong', () => expect(waText([])).toBe('Unit belum lengkap (0):'));
});

describe('filterUnits', () => {
  const us = [
    U({ id: 1 }),
    U({ id: 2, no_lambung: 'DA 25072', status: 'sebagian', perluCek: true, week: 'Week 1', period_id: 2 }),
    U({ id: 3, no_lambung: 'TG 2028', status: 'lengkap' }),
    U({ id: 4, no_lambung: 'HD 785', status: 'belum', status_she: 'Diajukan' }),
    U({ id: 5, no_lambung: 'HD 786', status: 'belum', in_latest_upload: false }),
  ];
  const ids = (f: Filters) => filterUnits(us, f).map((u) => u.id);
  it('unit tersembunyi disembunyikan secara bawaan', () => expect(ids(F())).toEqual([1, 2, 3]));
  it('toggle tersembunyi menampilkan semua', () => expect(ids(F({ hidden: true }))).toEqual([1, 2, 3, 4, 5]));
  it('filter status', () => expect(ids(F({ status: 'belum' }))).toEqual([1]));
  it('perlu cek populasi: bukan cocok', () => {
    const us = [U({ id: 1, pop_status: 'cocok' }), U({ id: 2, pop_status: 'ganda' }), U({ id: 3 })];
    expect(filterUnits(us, F({ status: 'pop' })).map((u) => u.id)).toEqual([2, 3]);
  });
  it('cari lewat code unit dan SKR BIB', () => {
    const us = [U({ id: 1, code_unit: 'TL 0536', skr_bib: 'BIB 77' }), U({ id: 2 })];
    expect(filterUnits(us, F({ q: 'tl0536' })).map((u) => u.id)).toEqual([1]);
    expect(filterUnits(us, F({ q: 'bib77' })).map((u) => u.id)).toEqual([1]);
  });
  it('perlu cek', () => expect(ids(F({ status: 'cek' }))).toEqual([2]));
  it('cari: huruf kecil dan spasi ganda/tanpa spasi', () => {
    expect(ids(F({ q: 'da  25072' }))).toEqual([2]);
    expect(ids(F({ q: 'dt4464' }))).toEqual([1]);
  });
  it('periode dan week', () => {
    expect(ids(F({ periodId: 2 }))).toEqual([2]);
    expect(ids(F({ week: 'Week 1' }))).toEqual([2]);
  });
});

describe('clockOffsetText', () => {
  it('tepat waktu', () => expect(clockOffsetText(30)).toBe('Jam HP sesuai (selisih 30 detik)'));
  it('lebih lambat', () => expect(clockOffsetText(420)).toBe('HP lebih lambat 7 menit'));
  it('lebih cepat', () => expect(clockOffsetText(-3 * 3600)).toBe('HP lebih cepat 3 jam'));
  it('jam + menit', () => expect(clockOffsetText(3600 + 120)).toBe('HP lebih lambat 1 jam 2 menit'));
});

describe('retentionBanners', () => {
  const day = 86_400_000, now = 1_000_000_000_000;
  const P = (id: number, d: number, purged: number | null = null) => ({ id, label: 'P' + id, purge_after: now + d, purged_at: purged });
  it('H-7, pembulatan ke atas, 0 bila lewat tapi belum disapu, abaikan yang sudah dihapus / masih jauh', () => {
    const r = retentionBanners([P(1, 6.2 * day), P(2, 0.3 * day), P(3, 8 * day), P(4, 2 * day, 5), P(5, -day)], now);
    expect(r).toEqual([{ label: 'P1', days: 7 }, { label: 'P2', days: 1 }, { label: 'P5', days: 0 }]);
  });
});
