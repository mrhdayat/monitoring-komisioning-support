import { expect, test } from 'vitest';
import { buildPopIndex, matchPop, unitKey, unitLabel } from './populasi';
import type { PopUnit } from './types';

const p = (code_unit: string, skr_bib: string): PopUnit => ({ code_unit, skr_bib, jenis: 'X', maint: 'PPA' });
const idx = buildPopIndex([p('TL141', 'TL0141'), p('FT52528AMM', 'FT5528'), p('GSQA01', 'GS6001'), p('GSQE01', 'GS6001'), p('THDS07', 'THDS0007')]);

test('unitKey', () => {
  expect(unitKey('PPA - TL 0141')).toBe('TL141');
  expect(unitKey('TL536AMM')).toBe('TL536');
  expect(unitKey('THDS 0007')).toBe(unitKey('THDS07'));
});
test('matchPop', () => {
  expect(matchPop('PPA - TL 0141', idx)).toEqual({ pop_status: 'cocok', code_unit: 'TL141', skr_bib: 'TL0141' });
  expect(matchPop('FT 5528', idx)).toEqual({ pop_status: 'cocok', code_unit: 'FT52528AMM', skr_bib: 'FT5528' });
  expect(matchPop('GS 6001', idx)).toEqual({ pop_status: 'ganda', code_unit: null, skr_bib: null });
  expect(matchPop('LT 2601', idx)).toEqual({ pop_status: 'tidak_ada', code_unit: null, skr_bib: null });
});
test('SKR BIB kosong jadi null', () => {
  expect(matchPop('TL 9', buildPopIndex([p('TL9', '')]))).toEqual({ pop_status: 'cocok', code_unit: 'TL9', skr_bib: null });
});
test('unit sama di dua kunci dihitung sekali', () => {
  expect(matchPop('TL 141', buildPopIndex([p('TL141', 'TL0141')])).pop_status).toBe('cocok');
});
test('unitLabel', () => {
  expect(unitLabel({ no_lambung: 'X 1' })).toBe('X 1');
  expect(unitLabel({ code_unit: 'TL141', no_lambung: 'PPA - TL 0141' })).toBe('TL141');
});
