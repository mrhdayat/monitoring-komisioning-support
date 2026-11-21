import { describe, expect, it } from 'vitest';
import type { AdminUnit } from '../../shared/types';
import { rekapRows, todayWita, zipName, zipPath } from './Downloads';

const u = (o: Partial<AdminUnit>): AdminUnit => ({
  id: 1, period_id: 1, no_lambung: 'DT 4464', perusahaan: 'PT A', kelompok_unit: 'K', jenis_unit: 'Dump Truck', week: 'Week2',
  berlaku_akhir: '2026-12-10', status_she: 'Belum Diajukan', in_latest_upload: true, sides: {}, period: 'Des/2026',
  status: 'belum', perluCek: false, photos: {}, ...o,
});
const ph = (kode: string, nama: string, nrp: string, flags = '') => ({
  kode, captured_at_device: Date.UTC(2026, 11, 1, 0, 0, 0), received_at_server: 0, clock_offset_s: 0,
  mekanik_nama: nama, mekanik_nrp: nrp, flags, address: null, lat: null, lon: null,
});

describe('zipName', () => {
  it('menghapus spasi dan memberi folder per unit', () => {
    expect(zipName(u({ no_lambung: 'DT 4464' }), 'depan')).toBe('DT4464/DT4464_depan.jpg');
    expect(zipName(u({ no_lambung: ' LV  12 ' }), 'kiri')).toBe('LV12/LV12_kiri.jpg');
  });
});

describe('rekapRows', () => {
  it('memetakan kolom, menggabung mekanik unik dan flag', () => {
    const [r] = rekapRows([u({
      status: 'sebagian',
      photos: { depan: ph('A', 'Budi', '1', 'jam'), kiri: ph('B', 'Budi', '1', 'gps'), kanan: ph('C', 'Sari', '2', 'jam,gps') },
    })]);
    expect(r['No Lambung']).toBe('DT 4464');
    expect(r['Jumlah Sisi']).toBe(3);
    expect(r['Jam Jepret Depan']).toBe('1 Des 2026, 08:00:00 WITA');
    expect(r['Jam Jepret Belakang']).toBe('');
    expect(r['Nama Mekanik']).toBe('Budi, Sari');
    expect(r['NRP']).toBe('1, 2');
    expect(r['Flag']).toBe('⚠ jam, ⚠ gps');
    expect(r['Status']).toBe('Sebagian');
  });
});

describe('zipPath', () => {
  it('satu periode: sama dengan zipName', () => {
    expect(zipPath(u({}), 'depan', false)).toBe('DT4464/DT4464_depan.jpg');
  });
  it('lebih dari satu periode: folder periode di depan, "/" jadi "-"', () => {
    expect(zipPath(u({ period: 'Des/2026' }), 'depan', true)).toBe('Des-2026/DT4464/DT4464_depan.jpg');
    expect(zipPath(u({ period: 'Jan/2027' }), 'depan', true)).toBe('Jan-2027/DT4464/DT4464_depan.jpg');
  });
});

describe('todayWita', () => {
  it('memakai tanggal WITA, bukan UTC', () => {
    expect(todayWita(Date.UTC(2026, 10, 21, 17, 0))).toBe('2026-11-22'); // 01:00 WITA keesokan harinya
    expect(todayWita(Date.UTC(2026, 10, 21, 15, 59))).toBe('2026-11-21');
  });
});
