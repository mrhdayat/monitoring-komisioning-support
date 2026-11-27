import type { Env } from './http';
import type { Store } from './store';

export class DriveDisconnected extends Error {}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
const FOLDER = 'application/vnd.google-apps.folder';

const getSetting = async (env: Env, k: string) =>
  (await env.DB.prepare('SELECT v FROM pengaturan WHERE k = ?').bind(k).first<{ v: string }>())?.v ?? null;
const setSetting = (env: Env, k: string, v: string) =>
  env.DB.prepare('INSERT INTO pengaturan (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').bind(k, v).run();

// Access token disimpan di D1 dan dipakai ulang sampai < 5 menit tersisa. `force` = abaikan cache (setelah 401).
export async function driveToken(env: Env, fetchImpl: typeof fetch = fetch, force = false): Promise<string> {
  const [tok, exp] = [await getSetting(env, 'drive_access_token'), await getSetting(env, 'drive_access_exp')];
  if (!force && tok && Number(exp) - Date.now() > 300_000) return tok;
  const refresh = await getSetting(env, 'drive_refresh_token');
  if (!refresh) throw new DriveDisconnected('belum tersambung');
  const r = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token', client_id: env.GOOGLE_CLIENT_ID ?? '', client_secret: env.GOOGLE_CLIENT_SECRET ?? '', refresh_token: refresh,
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (j.error === 'invalid_grant') {
    await setSetting(env, 'drive_status', 'terputus');
    throw new DriveDisconnected('izin Google dicabut');
  }
  if (!r.ok || !j.access_token) throw new Error(`token_gagal_${r.status}`);
  await setSetting(env, 'drive_access_token', j.access_token);
  await setSetting(env, 'drive_access_exp', String(Date.now() + (j.expires_in ?? 3600) * 1000));
  return j.access_token;
}

export function driveStore(env: Env, fetchImpl: typeof fetch = fetch): Store {
  // 401 → refresh token sekali, ulangi sekali (body Blob/string aman dikirim dua kali).
  const call = async (url: string, init: RequestInit = {}) => {
    const send = async (force: boolean) =>
      fetchImpl(url, { ...init, headers: { ...(init.headers as object), Authorization: `Bearer ${await driveToken(env, fetchImpl, force)}` } });
    const r = await send(false);
    return r.status === 401 ? send(true) : r;
  };
  const ok = async (r: Response, what: string) => {
    if (!r.ok) throw new Error(`drive_${what}_${r.status}`);
    return r;
  };
  const mkFolder = async (name: string, parent?: string) => {
    const r = await ok(await call(`${API}?fields=id`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parent && { parents: [parent] }) }),
    }), 'folder');
    return ((await r.json()) as { id: string }).id;
  };
  const delFile = async (id: string) => {
    const r = await call(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (r.status !== 404) await ok(r, 'del');
  };

  // Klaim atomik: yang kalah menghapus folder buatannya dan memakai milik pemenang.
  const rootId = async () => {
    const have = await getSetting(env, 'drive_root_id');
    if (have) return have;
    const mine = await mkFolder('Komisioning');
    await env.DB.prepare("INSERT INTO pengaturan (k, v) VALUES ('drive_root_id', ?) ON CONFLICT (k) DO NOTHING").bind(mine).run();
    const won = (await getSetting(env, 'drive_root_id'))!;
    if (won !== mine) await delFile(mine);
    return won;
  };
  const periodFolder = async (periodId: number) => {
    const p = await env.DB.prepare('SELECT label, drive_folder_id FROM periods WHERE id = ?').bind(periodId)
      .first<{ label: string; drive_folder_id: string | null }>();
    if (!p) throw new Error('periode_tidak_ada');
    if (p.drive_folder_id) return p.drive_folder_id;
    const mine = await mkFolder(p.label.replace(/\//g, '-'), await rootId());
    const claim = await env.DB.prepare('UPDATE periods SET drive_folder_id = ? WHERE id = ? AND drive_folder_id IS NULL').bind(mine, periodId).run();
    if (claim.meta.changes) return mine;
    await delFile(mine);
    return (await env.DB.prepare('SELECT drive_folder_id FROM periods WHERE id = ?').bind(periodId).first<{ drive_folder_id: string }>())!.drive_folder_id;
  };

  return {
    async put({ name, periodId, bytes }) {
      const parent = await periodFolder(periodId);
      const b = `b${crypto.randomUUID()}`;
      const body = new Blob([
        `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
        JSON.stringify({ name, parents: [parent], mimeType: 'image/jpeg' }),
        `\r\n--${b}\r\nContent-Type: image/jpeg\r\n\r\n`, bytes, `\r\n--${b}--`,
      ]);
      const r = await ok(await call(UPLOAD, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${b}` }, body }), 'upload');
      return ((await r.json()) as { id: string }).id;
    },
    async get(id) {
      const r = await call(`${API}/${encodeURIComponent(id)}?alt=media`);
      if (r.status === 404) return null;
      await ok(r, 'get');
      return new Response(r.body, { headers: { 'content-type': 'image/jpeg' } });
    },
    async del(ids) {
      for (const id of ids) await delFile(id);
    },
    async trashPeriod(periodId) {
      const f = (await env.DB.prepare('SELECT drive_folder_id FROM periods WHERE id = ?').bind(periodId).first<{ drive_folder_id: string | null }>())?.drive_folder_id;
      if (!f) return;
      const r = await call(`${API}/${encodeURIComponent(f)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ trashed: true }),
      });
      if (r.status !== 404) await ok(r, 'trash');
    },
  };
}
