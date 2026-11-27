import type { Env } from './http';

export interface Store {
  put(f: { name: string; periodId: number; bytes: Uint8Array }): Promise<string>;
  get(id: string): Promise<Response | null>;
  del(ids: string[]): Promise<void>;
  trashPeriod(periodId: number): Promise<void>;
}

// Dev lokal & tes: berkas disimpan sebagai BLOB di D1.
export const d1Store = (db: D1Database): Store => ({
  async put({ bytes }) {
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO berkas_dev (id, data) VALUES (?, ?)').bind(id, bytes).run();
    return id;
  },
  async get(id) {
    const r = await db.prepare('SELECT data FROM berkas_dev WHERE id = ?').bind(id).first<{ data: number[] }>();
    return r ? new Response(new Uint8Array(r.data), { headers: { 'content-type': 'image/jpeg' } }) : null;
  },
  async del(ids) {
    if (ids.length) await db.batch(ids.map((id) => db.prepare('DELETE FROM berkas_dev WHERE id = ?').bind(id)));
  },
  async trashPeriod(periodId) {
    await db.prepare(
      'DELETE FROM berkas_dev WHERE id IN (SELECT p.r2_key FROM photos p JOIN units u ON u.id = p.unit_id WHERE u.period_id = ?)',
    ).bind(periodId).run();
  },
});

// null = produksi tanpa Drive tersambung. ponytail: cabang 'drive' ditambah Task 2.
export async function getStore(env: Env, _fetchImpl: typeof fetch = fetch): Promise<Store | null> {
  return env.STORAGE === 'd1' ? d1Store(env.DB) : null;
}

export const fileName = (label: string, sisi: string, kode: string) =>
  `${label}_${sisi}_${kode}.jpg`.replace(/[/\\:*?"<>|]/g, '-');
