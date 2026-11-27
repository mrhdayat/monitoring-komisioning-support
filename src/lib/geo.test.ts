import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { watchGps, type GpsStatus } from './geo';

type Ok = (p: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Err = (e: { code: number; PERMISSION_DENIED: number }) => void;
let ok: Ok, err: Err;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('navigator', {
    geolocation: {
      watchPosition: (a: Ok, b: Err) => { ok = a; err = b; return 7; },
      clearWatch: vi.fn(),
    },
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('watchGps: tanpa fix tetap mencari sampai 15 detik, lalu tidak', () => {
  const seen: GpsStatus[] = [];
  const g = watchGps((s) => seen.push(s));
  vi.advanceTimersByTime(14_999);
  expect(seen).toEqual([]); // layar mulai di 'mencari'
  expect(g.get()).toBeNull();
  vi.advanceTimersByTime(1);
  expect(seen).toEqual(['tidak']);
  g.stop();
});

test('watchGps: fix datang → ok, tidak pernah jadi tidak', () => {
  const seen: GpsStatus[] = [];
  const g = watchGps((s) => seen.push(s));
  vi.advanceTimersByTime(5_000);
  ok({ coords: { latitude: -3.4127, longitude: 115.6302, accuracy: 6.4 } });
  vi.advanceTimersByTime(20_000);
  expect(seen).toEqual([{ lat: -3.4127, lon: 115.6302, accuracy: 6 }]);
  expect(g.get()).toEqual({ lat: -3.4127, lon: 115.6302, accuracy: 6 });
  g.stop();
});

test('watchGps: izin ditolak → tidak seketika, sekali saja', () => {
  const seen: GpsStatus[] = [];
  const g = watchGps((s) => seen.push(s));
  err({ code: 1, PERMISSION_DENIED: 1 });
  expect(seen).toEqual(['tidak']);
  vi.advanceTimersByTime(20_000);
  expect(seen).toEqual(['tidak']);
  g.stop();
});

test('fix kasar tidak menimpa fix akurat yang masih baru', () => {
  const seen: unknown[] = [];
  const g = watchGps((s) => seen.push(s));
  ok({ coords: { latitude: -3.41, longitude: 115.63, accuracy: 8 } });
  ok({ coords: { latitude: -3.5, longitude: 115.7, accuracy: 900 } });
  expect(g.get()).toEqual({ lat: -3.41, lon: 115.63, accuracy: 8 });
  ok({ coords: { latitude: -3.4101, longitude: 115.6301, accuracy: 5 } });
  expect(g.get()).toEqual({ lat: -3.4101, lon: 115.6301, accuracy: 5 });
  g.stop();
});
