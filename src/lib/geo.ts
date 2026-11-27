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
  let fix: Fix | null = null, at = 0;
  const fail = () => { if (!fix) onChange?.('tidak'); };
  const timer = setTimeout(fail, 15_000);
  const id = navigator.geolocation?.watchPosition(
    (p) => {
      // Fix pertama sering kasar (jaringan/Wi-Fi, ±100 m+). Simpan yang paling akurat; fix yang lebih kasar
      // baru dipakai bila fix terbaik sudah > 5 detik (mekanik berpindah sisi unit).
      const f = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) };
      const now = Date.now();
      if (fix && f.accuracy > fix.accuracy && now - at < 5_000) return;
      fix = f; at = now;
      onChange?.(fix);
    },
    (e) => { if (e.code === e.PERMISSION_DENIED) { clearTimeout(timer); fail(); } },
    { enableHighAccuracy: true, maximumAge: 0 },
  );
  if (id === undefined) { clearTimeout(timer); queueMicrotask(fail); }
  return {
    get: () => fix,
    stop: () => { clearTimeout(timer); if (id !== undefined) navigator.geolocation.clearWatch(id); },
  };
}
