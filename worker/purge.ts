import type { Env } from './http';
import { rebuildSnapshot } from './snapshot';
import { getStore } from './store';

// ponytail: per run maksimal `maxPeriods` periode (tiap periode ≈ 4 subrequest, batas 50); sisanya diproses run berikutnya.
export async function purgeExpired(env: Env, now: number, maxPeriods = 10): Promise<{ periods: number; photos: number }> {
  const { results: periods } = await env.DB.prepare(
    'SELECT id FROM periods WHERE purged_at IS NULL AND purge_after < ? ORDER BY id LIMIT ?',
  ).bind(now, maxPeriods).all<{ id: number }>();
  if (!periods.length) return { periods: 0, photos: 0 };
  const store = await getStore(env);
  if (!store) return { periods: 0, photos: 0 }; // Drive belum tersambung: coba lagi besok, jangan tandai purged.
  let photos = 0;
  for (const { id } of periods) {
    await store.trashPeriod(id);
    const r = await env.DB.prepare('DELETE FROM photos WHERE unit_id IN (SELECT id FROM units WHERE period_id = ?)').bind(id).run();
    photos += r.meta.changes;
    await env.DB.prepare('UPDATE periods SET purged_at = ? WHERE id = ?').bind(now, id).run();
  }
  await rebuildSnapshot(env, now);
  return { periods: periods.length, photos };
}
