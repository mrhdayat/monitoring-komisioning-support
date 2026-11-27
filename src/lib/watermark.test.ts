import { expect, test } from 'vitest';
import { watermarkText } from './watermark';

const t = Date.UTC(2026, 9, 8, 23, 31); // 09 Okt 2026 07:31 WITA
// tsconfig app tanpa @types/node
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;
const base = { capturedAt: t, sisi: 'kanan' as const, lat: -3.45678, lon: 115.12345, kode: 'AB1C-D2EF' };

test('format Indonesia WITA', () => {
  const w = watermarkText({ ...base, address: 'Jl. Hauling, Tapin, Kalimantan Selatan' });
  expect(w).toMatchObject({ label: 'KANAN', jam: '07:31', tanggal: '09 Oktober 2026', hari: 'Jumat',
    baris: '-3.456780, 115.123450 · Kode Foto: AB1C-D2EF' });
  expect(w.alamat).toEqual(['Jl. Hauling, Tapin, Kalimantan Selatan']);
});

test('tanpa GPS', () => {
  const w = watermarkText({ ...base, sisi: 'depan', lat: null, lon: null, address: null });
  expect(w.alamat).toEqual(['Lokasi tidak tersedia']);
  expect(w.baris).toBe('Kode Foto: AB1C-D2EF');
});

test('GPS ada, alamat gagal: hanya koordinat', () => {
  expect(watermarkText({ ...base, address: null }).alamat).toEqual([]);
});

test('alamat dipecah maks 3 baris', () => {
  const a = 'Jalan Tanpa Nama, Mangkalapi, Kec. Kusan Hulu, Kabupaten Tanah Bumbu, Kalimantan Selatan 72275, Indonesia, Bumi, Tata Surya';
  const { alamat } = watermarkText({ ...base, address: a });
  expect(alamat.length).toBe(3);
  expect(alamat[0]).toBe('Jalan Tanpa Nama, Mangkalapi,');
  expect(alamat[2].endsWith('…')).toBe(true);
  for (const l of alamat) expect(l.length).toBeLessThanOrEqual(41);
});

test('watermark: TZ proses Asia/Jakarta tetap WITA', () => {
  const old = env.TZ;
  env.TZ = 'Asia/Jakarta';
  try {
    expect(watermarkText({ ...base, address: null }).jam).toBe('07:31');
  } finally {
    if (old === undefined) delete env.TZ; else env.TZ = old;
  }
});
