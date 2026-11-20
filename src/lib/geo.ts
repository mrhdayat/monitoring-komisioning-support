// null bila gagal (offline, timeout, server tidak tahu alamatnya): watermark lalu memakai koordinat saja (§8).
export async function fetchAddress(lat: number, lon: number, timeoutMs = 3000): Promise<string | null> {
  try {
    const r = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(timeoutMs) });
    return r.ok ? ((await r.json()) as { address: string | null }).address : null;
  } catch {
    return null;
  }
}
