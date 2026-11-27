/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePopulasi } from './populasi';

const HEAD = ['', 'No', 'TYPE UNIT', 'SECTION', 'MAINTENANCE \nBY', 'CODE\nUNIT', 'SKR BIB'];
const wbOf = (aoa: unknown[][], name = 'PPA & AMM - Active') => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), name);
  return wb;
};

test('hanya SECTION SUPPORT diambil', () => {
  const { units, errors } = parsePopulasi(wbOf([['judul'], HEAD,
    ['', 1, 'LIGHT TOWER', 'SUPPORT', 'PPA', ' LT 0001 ', 'LT01'],
    ['', 2, 'DUMP TRUCK', 'HAULING', 'PPA', 'DT1', 'DT01']]));
  expect(errors).toEqual([]);
  expect(units).toEqual([{ code_unit: 'LT 0001', skr_bib: 'LT01', jenis: 'LIGHT TOWER', maint: 'PPA' }]);
});
test('kolom wajib hilang → errors', () => {
  const { units, errors } = parsePopulasi(wbOf([['a', 'b'], ['SECTION', 'x']]));
  expect(units).toEqual([]);
  expect(errors.length).toBeGreaterThan(0);
});
const POP = process.env.HOME + '/Downloads/01. Populasi & Status Unit A2B & A2S Update November 2026 (DI COPY YA JANGAN DI CUT& DEL)..xlsx';
test.skipIf(!existsSync(POP))('file November → 334 unit support', { timeout: 30000 }, () => {
  const { units, errors } = parsePopulasi(XLSX.read(readFileSync(POP)));
  expect(errors).toEqual([]);
  expect(units).toHaveLength(334);
});
