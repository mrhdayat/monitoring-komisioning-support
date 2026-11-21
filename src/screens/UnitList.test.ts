import { expect, test } from 'vitest';
import { duplicates, fmtExp, norm } from './UnitList';

test('daftar unit: cari abaikan spasi/kapital, format exp', () => {
  expect(norm('DT 4464').includes(norm('dt4464'))).toBe(true);
  expect(norm(' dt  44 ')).toBe('dt44');
  expect(fmtExp('2027-01-01')).toBe('Exp 01 Jan');
  expect(fmtExp('2026-12-31')).toBe('Exp 31 Des');
});

test('daftar unit: label periode hanya untuk no lambung di dua periode atau lebih', () => {
  const u = (no_lambung: string, period_id: number) => ({ no_lambung, period_id });
  const dup = duplicates([u('DT 1', 1), u('DT 2', 1), u('DT 1', 2), u('DT 3', 2), u('DT 3', 2)]);
  expect([...dup]).toEqual(['DT 1']);
});
