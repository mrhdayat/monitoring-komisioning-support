import { expect, test } from 'vitest';
import { resolve } from './router';

test('router: cocokkan rute + parameter', () => {
  expect(resolve('/')).toEqual({ route: '/', params: {} });
  expect(resolve('/unit/42/kamera')).toEqual({ route: '/unit/:id/kamera', params: { id: '42' } });
  expect(resolve('/antrean/')).toEqual({ route: '/antrean', params: {} });
  expect(resolve('/cek')).toEqual({ route: '/cek', params: {} });
  expect(resolve('/cek/AB12-CD34')).toEqual({ route: '/cek/:kode', params: { kode: 'AB12-CD34' } });
  expect(resolve('/admin/login')).toEqual({ route: '/admin/login', params: {} });
  expect(resolve('/admin')).toEqual({ route: '/admin/:tab?', params: {} });
  expect(resolve('/admin/unduhan')).toEqual({ route: '/admin/:tab?', params: { tab: 'unduhan' } });
  expect(resolve('/unit/42')).toEqual({ route: null, params: {} });
  expect(resolve('/antrean/x')).toEqual({ route: null, params: {} });
});
