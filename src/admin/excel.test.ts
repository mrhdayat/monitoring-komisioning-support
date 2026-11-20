import { describe, expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { parseBerlakuAkhir, parseSheRows, rowsFromSheet } from './excel';

const H = ['No', 'No Lambung', 'Perusahaan', 'Kelompok Unit', 'Jenis Unit', 'Komisioner', 'Berlaku Akhir', 'Week', 'Periode', 'Status'];
const row = (n: string, d = '01-Jan-2027', per = 'Des/2026') =>
  [1, n, 'PPA', 'TRANSPORT', 'TRUCK SUPPORT', '-', d, 'Week 1', per, 'Belum Diajukan'];

describe('excel SHE', () => {
  test('memetakan kolom & tanggal', () => {
    const { byPeriod, errors } = parseSheRows([H, row('TG 2028')]);
    expect(errors).toEqual([]);
    expect(byPeriod.get('Des/2026')![0]).toEqual({
      no_lambung: 'TG 2028', perusahaan: 'PPA', kelompok_unit: 'TRANSPORT', jenis_unit: 'TRUCK SUPPORT',
      berlaku_akhir: '2027-01-01', week: 'Week 1', status_she: 'Belum Diajukan',
    });
  });
  test('parseBerlakuAkhir Inggris & Indonesia', () => {
    expect(parseBerlakuAkhir('15-Oct-2027')).toBe('2027-10-15');
    expect(parseBerlakuAkhir('15-Okt-2027')).toBe('2027-10-15');
    expect(parseBerlakuAkhir('31-Feb-2027')).toBeNull();
    expect(parseBerlakuAkhir('15/10/2027')).toBe('2027-10-15');
    expect(parseBerlakuAkhir('2027-10-15')).toBe('2027-10-15');
    expect(parseBerlakuAkhir('2027-02-30')).toBeNull();
  });
  test('toleran baris kosong & spasi', () => {
    const h = H.map((x, i) => (i === 1 ? ' no  lambung ' : x));
    const { byPeriod, errors } = parseSheRows([h, row('DT  4464 '), [], ['', ' ']]);
    expect(errors).toEqual([]);
    expect(byPeriod.get('Des/2026')![0].no_lambung).toBe('DT 4464');
  });
  test('header hilang', () => {
    const h = H.filter((x) => x !== 'Berlaku Akhir');
    expect(parseSheRows([h, row('A')]).errors).toContain('Kolom Berlaku Akhir tidak ditemukan');
  });
  test('tanggal rusak menyebut nomor baris', () => {
    const { byPeriod, errors } = parseSheRows([H, row('A'), row('B', '31-Feb-2027'), row('C')]);
    expect(errors).toEqual(['Baris 3: tanggal Berlaku Akhir tidak valid ("31-Feb-2027")']);
    expect(byPeriod.get('Des/2026')).toHaveLength(2);
  });
  test('periode tidak valid & no lambung kosong', () => {
    const { errors } = parseSheRows([H, row('A', '01-Jan-2027', 'Xyz/2027'), row('')]);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatch(/^Baris 2: periode tidak valid/);
    expect(errors[1]).toMatch(/^Baris 3: No Lambung kosong/);
  });
  test('nomor baris error = baris Excel asli (baris kosong, !ref tidak mulai di baris 1)', () => {
    const rows = [H, row('A'), [], [], row('B', '31-Feb-2027')];
    const expected = ['Baris 5: tanggal Berlaku Akhir tidak valid ("31-Feb-2027")'];
    expect(parseSheRows(rowsFromSheet(XLSX.utils.aoa_to_sheet(rows))).errors).toEqual(expected);
    const ws = XLSX.utils.sheet_add_aoa(XLSX.utils.aoa_to_sheet([]), rows, { origin: 'A2' });
    expect(parseSheRows(rowsFromSheet(ws)).errors).toEqual(['Baris 6: tanggal Berlaku Akhir tidak valid ("31-Feb-2027")']);
  });
});
