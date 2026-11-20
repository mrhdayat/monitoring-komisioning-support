import type { Env } from './http';
import { rebuildSnapshot } from './snapshot';

const CHUNK = 1000;

// ponytail: per run maksimal 40 batch delete R2 (≤ 50 subrequest); sisanya diproses run berikutnya.
export async function purgeExpired(env: Env, now: number, maxCalls = 40): Promise<{ periods: number; photos: number }> {
  const { results: periods } = await env.DB.prepare(
    'SELECT id FROM periods WHERE purged_at IS NULL AND purge_after < ? ORDER BY id',
  ).bind(now).all<{ id: number }>();
  let calls = 0, done = 0, photos = 0;
  for (const { id } of periods) {
    if (calls >= maxCalls) break;
    const { results } = await env.DB.prepare(
      'SELECT id, r2_key FROM photos WHERE unit_id IN (SELECT id FROM units WHERE period_id = ?) ORDER BY id LIMIT ?',
    ).bind(id, (maxCalls - calls) * CHUNK + 1).all<{ id: number; r2_key: string }>();
    const rows = results.slice(0, (maxCalls - calls) * CHUNK);
    for (let i = 0; i < rows.length; i += CHUNK, calls++) {
      await env.PHOTOS.delete(rows.slice(i, i + CHUNK).map((r) => r.r2_key));
    }
    if (rows.length) {
      await env.DB.prepare('DELETE FROM photos WHERE unit_id IN (SELECT id FROM units WHERE period_id = ?) AND id <= ?')
        .bind(id, rows[rows.length - 1].id).run();
      photos += rows.length;
    }
    if (rows.length < results.length) break; // masih ada foto: purged_at tetap NULL
    await env.DB.prepare('UPDATE periods SET purged_at = ? WHERE id = ?').bind(now, id).run();
    done++;
  }
  if (done) await rebuildSnapshot(env, now);
  return { periods: done, photos };
}
