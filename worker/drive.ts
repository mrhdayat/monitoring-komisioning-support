import type { Env } from './http';
import type { Store } from './store';

export const driveAuthUrl = (env: Env, redirectUri: string, state: string) =>
  `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID ?? '', redirect_uri: redirectUri, response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file openid email', access_type: 'offline', prompt: 'consent', state,
  })}`;

// Tukar code → token lalu simpan sebagai akun Drive baru (folder root lama tak berlaku lagi). Lempar bila gagal.
export async function driveConnect(env: Env, code: string, redirectUri: string, now: number, fetchImpl: typeof fetch = fetch) {
  const r = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      code, client_id: env.GOOGLE_CLIENT_ID ?? '', client_secret: env.GOOGLE_CLIENT_SECRET ?? '', redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; refresh_token?: string; id_token?: string };
  if (!r.ok || !j.access_token || !j.refresh_token || !j.id_token) throw new Error('tukar_code_gagal');
  // id_token diterima langsung dari Google lewat TLS, jadi payload-nya dibaca tanpa verifikasi tanda tangan JWT.
  const b64 = j.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const email = (JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '='))) as { email?: string }).email;
  if (!email) throw new Error('email_kosong');
  const sameAccount = (await getSetting(env, 'drive_email')) === email;
  await env.DB.batch([
    ['drive_refresh_token', j.refresh_token], ['drive_email', email], ['drive_status', 'tersambung'],
    ['drive_access_token', j.access_token], ['drive_access_exp', String(now + (j.expires_in ?? 3600) * 1000)],
  ].map(([k, v]) => upsert(env, k, v))
    .concat(sameAccount ? [] : env.DB.prepare("DELETE FROM pengaturan WHERE k = 'drive_root_id'"))); // akun baru = root baru; folder periode lama yang tak terjangkau dibuat ulang lewat Gone
}

export class DriveDisconnected extends Error {}
// Folder induk hilang/di-trash di Drive: id tersimpan sudah dibersihkan, put() mengulang sekali.
class Gone extends Error {}

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,trashed';
const FOLDER = 'application/vnd.google-apps.folder';

export const getSetting = async (env: Env, k: string) =>
  (await env.DB.prepare('SELECT v FROM pengaturan WHERE k = ?').bind(k).first<{ v: string }>())?.v ?? null;
const upsert = (env: Env, k: string, v: string) =>
  env.DB.prepare('INSERT INTO pengaturan (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v').bind(k, v);
const setSetting = (env: Env, k: string, v: string) => upsert(env, k, v).run();

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
    if (r.status !== 401) return r;
    await r.body?.cancel();
    return send(true);
  };
  const ok = async (r: Response, what: string) => {
    if (!r.ok) throw Object.assign(new Error(`drive_${what}_${r.status}`), { status: r.status });
    return r;
  };
  const mkFolder = async (name: string, parent?: string) => {
    const r = await ok(await call(`${API}?fields=id,trashed`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parent && { parents: [parent] }) }),
    }), 'folder');
    const j = (await r.json()) as { id: string; trashed?: boolean };
    if (j.trashed) { await delFile(j.id); throw new Gone(); } // induknya di tempat sampah
    return j.id;
  };
  const delFile = async (id: string) => {
    const r = await call(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (r.status !== 404) await ok(r, 'del');
  };

  // Klaim atomik: yang kalah menghapus folder buatannya dan memakai milik pemenang.
  const rootId = async () => {
    const have = await getSetting(env, 'drive_root_id');
    if (have) return have;
    const mine = await mkFolder('Komisioning'); // ponytail: root yang di-trash (bukan dihapus) tidak terdeteksi sampai upload pertama ke dalamnya; ditangkap lewat `trashed` di respons upload.
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
    const root = await rootId();
    let mine: string;
    try {
      mine = await mkFolder(p.label.replace(/\//g, '-'), root);
    } catch (e) {
      if ((e as { status?: number }).status === 404 || e instanceof Gone) {
        await env.DB.prepare("DELETE FROM pengaturan WHERE k = 'drive_root_id' AND v = ?").bind(root).run();
        throw new Gone();
      }
      throw e;
    }
    const claim = await env.DB.prepare('UPDATE periods SET drive_folder_id = ? WHERE id = ? AND drive_folder_id IS NULL').bind(mine, periodId).run();
    if (claim.meta.changes) return mine;
    await delFile(mine);
    return (await env.DB.prepare('SELECT drive_folder_id FROM periods WHERE id = ?').bind(periodId).first<{ drive_folder_id: string }>())!.drive_folder_id;
  };

  // Folder unit di dalam folder periode (Komisioning/<periode>/<Code Unit>/), diklaim sama seperti folder periode.
  const unitFolder = async (unitId: number, periodId: number, folderName: string) => {
    const u = await env.DB.prepare('SELECT drive_folder_id FROM units WHERE id = ?').bind(unitId).first<{ drive_folder_id: string | null }>();
    if (u?.drive_folder_id) return u.drive_folder_id;
    const parent = await periodFolder(periodId);
    let mine: string;
    try {
      mine = await mkFolder(folderName, parent);
    } catch (e) {
      if ((e as { status?: number }).status === 404 || e instanceof Gone) {
        await env.DB.prepare('UPDATE periods SET drive_folder_id = NULL WHERE id = ? AND drive_folder_id = ?').bind(periodId, parent).run();
        throw new Gone();
      }
      throw e;
    }
    const claim = await env.DB.prepare('UPDATE units SET drive_folder_id = ? WHERE id = ? AND drive_folder_id IS NULL').bind(mine, unitId).run();
    if (claim.meta.changes) return mine;
    await delFile(mine);
    return (await env.DB.prepare('SELECT drive_folder_id FROM units WHERE id = ?').bind(unitId).first<{ drive_folder_id: string }>())!.drive_folder_id;
  };

  const putOnce = async ({ name, periodId, unitId, folderName, bytes }: { name: string; periodId: number; unitId?: number; folderName?: string; bytes: Uint8Array }) => {
    const inUnit = unitId !== undefined && !!folderName;
    const parent = inUnit ? await unitFolder(unitId!, periodId, folderName!) : await periodFolder(periodId);
    const b = `b${crypto.randomUUID()}`;
    const body = new Blob([
      `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify({ name, parents: [parent], mimeType: 'image/jpeg' }),
      `\r\n--${b}\r\nContent-Type: image/jpeg\r\n\r\n`, bytes, `\r\n--${b}--`,
    ]);
    const r = await call(UPLOAD, { method: 'POST', headers: { 'content-type': `multipart/related; boundary=${b}` }, body });
    const j = r.ok ? ((await r.json()) as { id: string; trashed?: boolean }) : null;
    // `trashed` di respons = berkas ikut tempat sampah karena foldernya di-trash: tanpa GET tambahan per upload.
    if (r.status === 404 || j?.trashed) {
      if (j) await delFile(j.id);
      await (inUnit
        ? env.DB.prepare('UPDATE units SET drive_folder_id = NULL WHERE id = ? AND drive_folder_id = ?').bind(unitId!, parent)
        : env.DB.prepare('UPDATE periods SET drive_folder_id = NULL WHERE id = ? AND drive_folder_id = ?').bind(periodId, parent)).run();
      throw new Gone();
    }
    await ok(r, 'upload');
    return j!.id;
  };

  return {
    async put(f) {
      // Gone bisa bertingkat (folder unit → folder periode → root di-trash): ulang maks. 3 kali, lalu error biasa.
      for (let i = 0; ; i++) {
        try {
          return await putOnce(f);
        } catch (e) {
          if (!(e instanceof Gone) || i >= 3) throw e;
        }
      }
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
