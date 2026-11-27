// null bila gagal (offline, timeout, server tidak tahu alamatnya): watermark lalu memakai koordinat saja (§8).
export async function fetchAddress(lat: number, lon: number, timeoutMs = 3000): Promise<string | null> {
  try {
    const r = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? ((await r.json()) as { address: string | null }).address : null;
  } catch {
    return null;
  }
}

export interface Fix { lat: number; lon: number; accuracy: number }
export type GpsStatus = Fix | 'mencari' | 'tidak';

// Fix terbaru, atau null. 'tidak' = belum ada fix dalam 15 detik atau izin ditolak (§8); fix yang datang belakangan tetap dipakai.
export function watchGps(onChange?: (s: GpsStatus) => void): { get(): Fix | null; stop(): void } {
  let fix: Fix | null = null;
  const fail = () => { if (!fix) onChange?.('tidak'); };
  const timer = setTimeout(fail, 15_000);
  const id = navigator.geolocation?.watchPosition(
    (p) => {
      fix = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
      onChange?.(fix);
    },
    (e) => { if (e.code === e.PERMISSION_DENIED) { clearTimeout(timer); fail(); } },
    { enableHighAccuracy: true, maximumAge: 10_000 },
  );
  if (id === undefined) { clearTimeout(timer); queueMicrotask(fail); }
  return {
    get: () => fix,
    stop: () => { clearTimeout(timer); if (id !== undefined) navigator.geolocation.clearWatch(id); },
  };
}
