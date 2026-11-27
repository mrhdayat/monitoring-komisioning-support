import type { Sisi, Snapshot, SnapUnit } from '../shared/types';
import type { Env } from './http';

// ponytail: snapshot satu nilai D1 (batas ±2 MB ≈ 5 ribu unit); pecah per periode bila melewati itu.
// ponytail: rebuild bersamaan bisa menulis snapshot sedikit tertinggal; rebuild berikutnya membetulkan.
export async function rebuildSnapshot(env: Env, now = Date.now()): Promise<void> {
  const [periods, rows] = await env.DB.batch([
    env.DB.prepare('SELECT id, label, purge_after FROM periods WHERE purged_at IS NULL ORDER BY id'),
    env.DB.prepare(
      `SELECT u.id, u.period_id, u.no_lambung, u.perusahaan, u.kelompok_unit, u.jenis_unit, u.week,
              u.berlaku_akhir, u.status_she, u.in_latest_upload, u.code_unit, u.skr_bib, p.sisi, p.kode_foto, p.captured_at_device
       FROM units u JOIN periods r ON r.id = u.period_id LEFT JOIN photos p ON p.unit_id = u.id
       WHERE r.purged_at IS NULL AND u.status_she = 'Belum Diajukan' ORDER BY u.id`,
    ),
  ]);
  const units = new Map<number, SnapUnit>();
  for (const r of rows.results as Record<string, any>[]) {
    let u = units.get(r.id);
    if (!u) {
      const { sisi, kode_foto, captured_at_device, ...rest } = r;
      units.set(r.id, (u = { ...rest, in_latest_upload: !!r.in_latest_upload, sides: {} } as SnapUnit));
    }
    if (r.sisi) u.sides[r.sisi as Sisi] = { kode: r.kode_foto, at: r.captured_at_device };
  }
  const snap: Snapshot = {
    version: now,
    periods: periods.results as Snapshot['periods'],
    units: [...units.values()],
  };
  await env.DB.prepare(
    'INSERT INTO snapshot (id, json, version) VALUES (1, ?, ?) ON CONFLICT (id) DO UPDATE SET json = excluded.json, version = excluded.version',
  ).bind(JSON.stringify(snap), now).run();
}
