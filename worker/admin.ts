import { SISI, type AdminStatus, type Sisi, type SnapUnit } from '../shared/types';
import { adminStatus, purgeAfterMs } from '../shared/rules';
import { hashPassword, requireAdmin } from './auth';
import { err, json, readJson, type Env } from './http';
import { rebuildSnapshot } from './snapshot';

const FIELDS = ['no_lambung', 'perusahaan', 'kelompok_unit', 'jenis_unit', 'berlaku_akhir', 'week', 'status_she'] as const;
const str = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const periodOk = (p: unknown): p is string => {
  if (!str(p)) return false;
  try { purgeAfterMs(p); return true; } catch { return false; }
};
const validUnit = (u: any) =>
  u && typeof u === 'object' && FIELDS.every((f) => str(u[f])) && /^\d{4}-\d{2}-\d{2}$/.test(u.berlaku_akhir);

async function importBatch(req: Request, env: Env, now: number) {
  const b = await readJson<any>(req);
  if (!b || !periodOk(b.period) || !str(b.importId) || !Array.isArray(b.units) || b.units.length < 1
    || b.units.length > 100 || !b.units.every(validUnit)) return err('invalid', 400);
  const period = await env.DB.prepare(
    `INSERT INTO periods (label, uploaded_at, purge_after) VALUES (?, ?, ?)
     ON CONFLICT(label) DO UPDATE SET uploaded_at = excluded.uploaded_at, purge_after = excluded.purge_after
     RETURNING id`,
  ).bind(b.period, now, purgeAfterMs(b.period)).first<{ id: number }>();
  await env.DB.batch(b.units.map((u: Record<string, string>) =>
    env.DB.prepare(
      `INSERT INTO units (period_id, no_lambung, perusahaan, kelompok_unit, jenis_unit, berlaku_akhir, week, status_she, import_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(period_id, no_lambung) DO UPDATE SET perusahaan = excluded.perusahaan,
         kelompok_unit = excluded.kelompok_unit, jenis_unit = excluded.jenis_unit, berlaku_akhir = excluded.berlaku_akhir,
         week = excluded.week, status_she = excluded.status_she, import_id = excluded.import_id`,
    ).bind(period!.id, u.no_lambung, u.perusahaan, u.kelompok_unit, u.jenis_unit, u.berlaku_akhir, u.week, u.status_she, b.importId)));
  return json({ ok: true, count: b.units.length });
}

async function finish(req: Request, env: Env, now: number) {
  const b = await readJson<any>(req);
  if (!b || !periodOk(b.period) || !str(b.importId)) return err('invalid', 400);
  const p = await env.DB.prepare('SELECT id FROM periods WHERE label = ?').bind(b.period).first<{ id: number }>();
  if (!p) return err('not_found', 404);
  const [, , tot] = await env.DB.batch([
    env.DB.prepare('UPDATE periods SET import_id = ? WHERE id = ?').bind(b.importId, p.id),
    env.DB.prepare('UPDATE units SET in_latest_upload = (import_id = ?) WHERE period_id = ?').bind(b.importId, p.id),
    env.DB.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(in_latest_upload = 0), 0) AS hidden FROM units WHERE period_id = ?').bind(p.id),
  ]);
  await rebuildSnapshot(env, now);
  return json(tot.results[0]);
}

async function listUnits(env: Env, now: number) {
  const [periods, units, photos] = await env.DB.batch([
    env.DB.prepare('SELECT id, label, purge_after, purged_at FROM periods ORDER BY id'),
    env.DB.prepare(
      `SELECT u.id, u.period_id, u.no_lambung, u.perusahaan, u.kelompok_unit, u.jenis_unit, u.week, u.berlaku_akhir,
              u.status_she, u.in_latest_upload, p.label AS period FROM units u JOIN periods p ON p.id = u.period_id ORDER BY u.id`),
    env.DB.prepare(
      `SELECT unit_id, sisi, kode_foto AS kode, captured_at_device, received_at_server, clock_offset_s, mekanik_nama,
              mekanik_nrp, flags, address, lat, lon FROM photos`),
  ]);
  const byUnit = new Map<number, Record<string, any>[]>();
  for (const p of photos.results as Record<string, any>[]) byUnit.set(p.unit_id, [...(byUnit.get(p.unit_id) ?? []), p]);
  const out = (units.results as Record<string, any>[]).map((u) => {
    const sides: SnapUnit['sides'] = {};
    const ph: Partial<Record<Sisi, unknown>> = {};
    let perluCek = false;
    for (const { unit_id, sisi, ...p } of byUnit.get(u.id) ?? []) {
      sides[sisi as Sisi] = { kode: p.kode, at: p.captured_at_device };
      ph[sisi as Sisi] = p;
      if (p.flags) perluCek = true;
    }
    const status: AdminStatus = adminStatus(Object.keys(sides).filter((s) => SISI.includes(s as Sisi)).length, u.berlaku_akhir, now);
    return { ...u, in_latest_upload: !!u.in_latest_upload, sides, status, perluCek, photos: ph };
  });
  return json({ periods: periods.results, units: out });
}

async function deletePhoto(kode: string, env: Env, now: number) {
  const r = await env.DB.prepare('SELECT id, r2_key FROM photos WHERE kode_foto = ?').bind(kode).first<{ id: number; r2_key: string }>();
  if (!r) return err('not_found', 404);
  await env.PHOTOS.delete(r.r2_key);
  await env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(r.id).run();
  await rebuildSnapshot(env, now);
  return json({ ok: true });
}

async function admins(req: Request, env: Env, me: { id: number }, path: string, now: number) {
  if (path === '/api/admin/admins') {
    if (req.method === 'GET')
      return json((await env.DB.prepare('SELECT id, username, created_at FROM admins ORDER BY id').all()).results);
    if (req.method !== 'POST') return err('not_found', 404);
    const b = await readJson<any>(req);
    if (!b || typeof b.username !== 'string' || !/^[a-z0-9._-]{3,40}$/.test(b.username)
      || typeof b.password !== 'string' || b.password.length < 8) return err('invalid', 400);
    try {
      const row = await env.DB.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, ?) RETURNING id')
        .bind(b.username, await hashPassword(b.password), now).first<{ id: number }>();
      return json({ id: row!.id, username: b.username }, 201);
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) return err('username_dipakai', 409);
      throw e;
    }
  }
  const m = path.match(/^\/api\/admin\/admins\/(\d+)(\/password)?$/);
  if (!m) return err('not_found', 404);
  const id = Number(m[1]);
  if (m[2]) {
    if (req.method !== 'POST') return err('not_found', 404);
    const b = await readJson<any>(req);
    if (!b || typeof b.password !== 'string' || b.password.length < 8) return err('invalid', 400);
    const [u] = await env.DB.batch([
      env.DB.prepare('UPDATE admins SET password_hash = ?, failed_count = 0, locked_until = 0 WHERE id = ?').bind(await hashPassword(b.password), id),
      env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
    ]);
    return u.meta.changes ? json({ ok: true }) : err('not_found', 404);
  }
  if (req.method !== 'DELETE') return err('not_found', 404);
  const n = (await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first<{ n: number }>())!.n;
  if (id === me.id || n <= 1) return err('tidak_boleh', 400);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
    env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id),
  ]);
  return json({ ok: true });
}

export async function handleAdmin(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const me = await requireAdmin(req, env, now);
  if (!me) return err('unauthorized', 401);
  const path = new URL(req.url).pathname;
  const { method } = req;
  if (path === '/api/admin/import' && method === 'POST') return importBatch(req, env, now);
  if (path === '/api/admin/import/finish' && method === 'POST') return finish(req, env, now);
  if (path === '/api/admin/units' && method === 'GET') return listUnits(env, now);
  const ph = path.match(/^\/api\/admin\/photo\/([^/]+)$/);
  if (ph && method === 'DELETE') {
    let kode = ph[1];
    try { kode = decodeURIComponent(kode); } catch { /* tak ditemukan → 404 */ }
    return deletePhoto(kode, env, now);
  }
  if (path.startsWith('/api/admin/admins')) return admins(req, env, me, path, now);
  return err('not_found', 404);
}
