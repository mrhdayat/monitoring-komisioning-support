import { normalizeKode } from '../shared/kode';
import { DriveDisconnected } from './drive';
import { err, json, type Env } from './http';
import { rebuildSnapshot } from './snapshot';
import { getStore } from './store';

const readSnap = (env: Env) => env.DB.prepare('SELECT json, version FROM snapshot WHERE id = 1').first<{ json: string; version: number }>();

export async function getSnapshot(req: Request, env: Env): Promise<Response> {
  let row = await readSnap(env);
  if (!row) {
    await rebuildSnapshot(env);
    row = await readSnap(env);
    if (!row) return err('not_found', 404);
  }
  const etag = `"${row.version}"`;
  const headers = { ETag: etag, 'Cache-Control': 'no-cache', 'content-type': 'application/json' };
  const inm = req.headers.get('If-None-Match');
  if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === etag)) {
    return new Response(null, { status: 304, headers });
  }
  return new Response(row.json, { headers });
}

export async function getPhoto(req: Request, kode: string, env: Env, ctx: ExecutionContext): Promise<Response> {
  const k = normalizeKode(kode);
  const row = k && (await env.DB.prepare('SELECT r2_key FROM photos WHERE kode_foto = ?').bind(k).first<{ r2_key: string }>());
  if (!row) return err('not_found', 404); // baris D1 = sumber kebenaran: foto terhapus/terganti tak dilayani dari cache
  // Kunci cache kanonik dari ID berkas: tanpa query string, tanpa beda huruf besar/kecil kode.
  const key = new Request(`${new URL(req.url).origin}/api/photo-cache/${encodeURIComponent(row.r2_key)}`);
  const hit = await caches.default.match(key);
  if (hit) return hit;
  let obj: Response | null | undefined;
  try {
    const store = await getStore(env);
    if (!store) return err('penyimpanan_belum_siap', 503); // Drive belum tersambung: bukan "foto hilang"
    obj = await store.get(row.r2_key);
  } catch (e) {
    if (e instanceof DriveDisconnected) return err('penyimpanan_belum_siap', 503);
    throw e;
  }
  if (!obj) return err('not_found', 404);
  const res = new Response(obj.body, {
    headers: { 'content-type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

export async function checkKode(kode: string, env: Env): Promise<Response> {
  const k = normalizeKode(kode);
  const row = k && (await env.DB.prepare(
    `SELECT p.kode_foto AS kode, COALESCE(u.code_unit, u.no_lambung) AS no_lambung, p.sisi, p.captured_at_device AS captured_at,
       p.received_at_server AS received_at, p.lat, p.lon, p.accuracy_m, p.address
     FROM photos p JOIN units u ON u.id = p.unit_id WHERE p.kode_foto = ?`,
  ).bind(k).first());
  return row ? json(row) : err('not_found', 404);
}

export async function geocode(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams;
  const lat = q.has('lat') && q.get('lat') !== '' ? Number(q.get('lat')) : NaN;
  const lon = q.has('lon') && q.get('lon') !== '' ? Number(q.get('lon')) : NaN;
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return err('invalid', 400);
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`; // ±11 m: alamat dari titik terdekat, bukan tetangga ±100 m
  const hit = await env.DB.prepare('SELECT address FROM geocache WHERE key = ?').bind(key).first<{ address: string }>();
  if (hit) return json({ address: hit.address });
  try {
    const r = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=id`,
      { headers: { 'User-Agent': 'monitoring-komisioning/1.0' }, signal: AbortSignal.timeout(4000) },
    );
    const address = r.ok ? ((await r.json()) as { display_name?: string }).display_name : undefined;
    if (!address) return json({ address: null });
    await env.DB.prepare('INSERT OR REPLACE INTO geocache (key, address, created_at) VALUES (?, ?, ?)')
      .bind(key, address, Date.now()).run();
    return json({ address });
  } catch {
    return json({ address: null });
  }
}
