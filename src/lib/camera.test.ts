import { expect, test } from 'vitest';
import type { Sisi } from '../../shared/types';
import { cropRect, nextSide } from './camera';

test('cropRect: potong tengah 3:4 potret, sisi panjang ≤ 1600', () => {
  expect(cropRect(1920, 1080)).toEqual({ sx: 555, sy: 0, sw: 810, sh: 1080, w: 810, h: 1080 });
  expect(cropRect(1080, 1920)).toEqual({ sx: 0, sy: 240, sw: 1080, sh: 1440, w: 1080, h: 1440 });
  const big = cropRect(3024, 4032);
  expect([big.w, big.h]).toEqual([1200, 1600]);
});

test('nextSide: urutan Depan → Belakang → Kanan → Kiri, berputar, null bila lengkap', () => {
  const has = (...s: Sisi[]) => (x: Sisi) => s.includes(x);
  expect(nextSide(has())).toBe('depan');
  expect(nextSide(has('depan', 'belakang'))).toBe('kanan');
  expect(nextSide(has('depan', 'kanan'), 'kanan')).toBe('kiri');
  expect(nextSide(has('belakang', 'kanan', 'kiri'), 'kiri')).toBe('depan');
  expect(nextSide(has('depan', 'belakang', 'kanan', 'kiri'))).toBeNull();
});
