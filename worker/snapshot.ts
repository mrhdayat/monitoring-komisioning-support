import type { Sisi, Snapshot, SnapUnit } from '../shared/types';
import type { Env } from './http';

export const SNAPSHOT_KEY = 'snapshot.json';

// ponytail: rebuild bersamaan bisa menulis snapshot sedikit tertinggal; rebuild berikutnya membetulkan.
export async function rebuildSnapshot(env: Env, now = Date.now()): Promise<void> {
  const [periods, rows, recent] = await env.DB.batch([
    env.DB.prepare('SELECT id, label, purge_after FROM periods WHERE purged_at IS NULL ORDER BY id'),
    env.DB.prepare(
      `SELECT u.id, u.period_id, u.no_lambung, u.perusahaan, u.kelompok_unit, u.jenis_unit, u.week,
              u.berlaku_akhir, u.status_she, u.in_latest_upload, p.sisi, p.kode_foto, p.captured_at_device
       FROM units u JOIN periods r ON r.id = u.period_id LEFT JOIN photos p ON p.unit_id = u.id
       WHERE r.purged_at IS NULL AND u.status_she = 'Belum Diajukan' ORDER BY u.id`,
    ),
    env.DB.prepare(
      `SELECT u.no_lambung, p.sisi, p.captured_at_device AS at, p.kode_foto AS kode
       FROM photos p JOIN units u ON u.id = p.unit_id JOIN periods r ON r.id = u.period_id
       WHERE r.purged_at IS NULL AND u.status_she = 'Belum Diajukan'
       ORDER BY p.received_at_server DESC, p.id DESC LIMIT 8`,
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
    recent: recent.results as Snapshot['recent'],
  };
  await env.PHOTOS.put(SNAPSHOT_KEY, JSON.stringify(snap), { httpMetadata: { contentType: 'application/json' } });
}
