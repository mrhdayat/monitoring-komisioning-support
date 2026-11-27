import { normalizeKode } from '../shared/kode';
import { err, json, type Env } from './http';
import { rebuildSnapshot, SNAPSHOT_KEY } from './snapshot';

export async function getSnapshot(req: Request, env: Env): Promise<Response> {
  let obj = await env.PHOTOS.head(SNAPSHOT_KEY);
  if (!obj) {
    await rebuildSnapshot(env);
    obj = await env.PHOTOS.head(SNAPSHOT_KEY);
    if (!obj) return err('not_found', 404);
  }
  const headers = { ETag: obj.httpEtag, 'Cache-Control': 'no-cache', 'content-type': 'application/json' };
  const inm = req.headers.get('If-None-Match');
  if (inm && inm.split(',').some((t) => t.trim().replace(/^W\//, '') === obj!.httpEtag)) {
    return new Response(null, { status: 304, headers });
  }
  const body = await env.PHOTOS.get(SNAPSHOT_KEY);
  // ponytail: bila rebuild menimpa di antara head dan get, ETag header bisa tertinggal satu versi; klien hanya memuat ulang.
  return body ? new Response(body.body, { headers: { ...headers, ETag: body.httpEtag } }) : err('not_found', 404);
}

export async function getPhoto(kode: string, env: Env): Promise<Response> {
  const k = normalizeKode(kode);
  const obj = k && (await env.PHOTOS.get(`foto/${k}.jpg`));
  if (!obj) return err('not_found', 404);
  return new Response(obj.body, {
    headers: { 'content-type': 'image/jpeg', 'Cache-Control': 'public, max-age=31536000, immutable' },
  });
}

export async function checkKode(kode: string, env: Env): Promise<Response> {
  const k = normalizeKode(kode);
  const row = k && (await env.DB.prepare(
    `SELECT p.kode_foto AS kode, u.no_lambung, p.sisi, p.captured_at_device AS captured_at, p.received_at_server AS received_at
     FROM photos p JOIN units u ON u.id = p.unit_id WHERE p.kode_foto = ?`,
  ).bind(k).first());
  return row ? json(row) : err('not_found', 404);
}

export async function geocode(url: URL, env: Env): Promise<Response> {
  const q = url.searchParams;
  const lat = q.has('lat') && q.get('lat') !== '' ? Number(q.get('lat')) : NaN;
  const lon = q.has('lon') && q.get('lon') !== '' ? Number(q.get('lon')) : NaN;
  if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180)) return err('invalid', 400);
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
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
