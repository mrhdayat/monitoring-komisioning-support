// Alamat = jalan dari OpenStreetMap (lewat Worker, di-cache) + kecamatan dari BigDataCloud bila OSM tidak tahu.
// BigDataCloud "client" gratis tanpa key, tapi hanya boleh dipanggil dari browser, bukan dari server.
// null bila keduanya gagal (offline, timeout): watermark lalu memakai koordinat saja (§8).
export async function fetchAddress(lat: number, lon: number, timeoutMs = 3000): Promise<string | null> {
  const get = async <T>(url: string): Promise<T | null> => {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      return r.ok ? ((await r.json()) as T) : null;
    } catch {
      return null;
    }
  };
  const [osm, bdc] = await Promise.all([
    get<{ address: string | null }>(`/api/geocode?lat=${lat}&lon=${lon}`),
    get<Bdc>(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=id`),
  ]);
  return mergeAddress(osm?.address ?? null, bdc);
}

export interface Bdc { locality?: string; localityInfo?: { administrative?: { name?: string; adminLevel?: number }[] } }

// Sisipkan "Kec. X" sebelum nama kabupaten/kota di alamat OSM, kecuali nama itu sudah ada di alamat OSM.
export function mergeAddress(osm: string | null, bdc: Bdc | null): string | null {
  const admin = (bdc?.localityInfo?.administrative ?? [])
    .filter((a) => a.name && (a.adminLevel ?? 0) >= 4 && (a.adminLevel ?? 0) <= 5)
    .map((a) => a.name!);
  const loc = bdc?.locality?.trim();
  const has = (s: string, n: string) => s.toLowerCase().includes(n.toLowerCase());
  const kec = loc && !admin.some((n) => n.toLowerCase() === loc.toLowerCase()) ? `Kec. ${loc}` : null;
  if (!osm) return kec || admin.length ? [kec, ...admin.slice().reverse(), 'Indonesia'].filter(Boolean).join(', ') : null;
  if (!kec || has(osm, loc!)) return osm;
  const parts = osm.split(', ');
  const at = parts.findIndex((p) => admin.some((n) => has(p, n)));
  parts.splice(at > 0 ? at : Math.max(parts.length - 2, 1), 0, kec);
  return parts.join(', ');
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
