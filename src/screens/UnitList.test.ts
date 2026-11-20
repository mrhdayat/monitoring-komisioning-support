import { expect, test } from 'vitest';
import { fmtExp, norm } from './UnitList';

test('daftar unit: cari abaikan spasi/kapital, format exp', () => {
  expect(norm('DT 4464').includes(norm('dt4464'))).toBe(true);
  expect(norm(' dt  44 ')).toBe('dt44');
  expect(fmtExp('2027-01-01')).toBe('Exp 01 Jan');
  expect(fmtExp('2026-12-31')).toBe('Exp 31 Des');
});
