import { expect, test } from 'vitest';
import { KODE_RE, newKode, normalizeKode } from './kode';

test('newKode format', () => expect(newKode()).toMatch(KODE_RE));
test('normalizeKode', () => {
  expect(normalizeKode('ab1c-d2ef')).toBe('AB1C-D2EF');
  expect(normalizeKode('ab1cd2ef')).toBe('AB1C-D2EF');
  expect(normalizeKode('O0IL-1234')).toBe('0011-1234');
  expect(normalizeKode('ABC')).toBeNull();
  expect(normalizeKode('ABCD-EFGU')).toBeNull(); // U bukan Crockford
});
