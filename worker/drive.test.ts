import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DriveDisconnected, driveStore, driveToken } from './drive';
import type { Env } from './http';
import { getPhoto } from './public';
import { getStore } from './store';
import { handleUpload } from './upload';

const e = { ...env, STORAGE: 'drive', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' } as Env;
const set = (k: string, v: string) => env.DB.prepare('INSERT OR REPLACE INTO pengaturan (k,v) VALUES (?,?)').bind(k, v).run();
const setting = async (k: string) => (await env.DB.prepare('SELECT v FROM pengaturan WHERE k = ?').bind(k).first<{ v: string }>())?.v ?? null;
const jres = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status });

type Call = { url: string; method: string; body?: any; headers: Headers; raw?: Blob | string };
// Drive palsu: mencatat request, folder/berkas bernomor urut. `hook` bisa menimpa jawaban.
function fake(hook?: (c: Call) => Response | undefined | Promise<Response | undefined>) {
  const calls: Call[] = [];
  let n = 0;
  const f = (async (url: string, init: RequestInit = {}) => {
    const c: Call = { url, method: init.method ?? 'GET', headers: new Headers(init.headers), raw: init.body as any };
    if (typeof init.body === 'string' && c.headers.get('content-type') === 'application/json') c.body = JSON.parse(init.body);
    if (init.body instanceof URLSearchParams) c.body = Object.fromEntries(init.body);
    calls.push(c);
    const h = await hook?.(c);
    if (h) return h;
    if (url.startsWith('https://oauth2.googleapis.com/token')) return jres({ access_token: `tok${++n}`, expires_in: 3600 });
    return jres({ id: `id${++n}` });
  }) as typeof fetch;
  return { f, calls };
}

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos'), env.DB.prepare('DELETE FROM units'), env.DB.prepare('DELETE FROM periods'),
    env.DB.prepare('DELETE FROM pengaturan'),
    env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (1,'Des/2026',1,9e15)"),
    env.DB.prepare("INSERT INTO pengaturan (k,v) VALUES ('drive_refresh_token','rt')"),
  ]);
});
afterEach(() => vi.unstubAllGlobals());

describe('driveToken', () => {
  it('refresh, simpan, lalu pakai ulang selama masih berlaku', async () => {
    const { f, calls } = fake();
    expect(await driveToken(e, f)).toBe('tok1');
    expect(calls[0].body).toMatchObject({ grant_type: 'refresh_token', client_id: 'cid', client_secret: 'sec', refresh_token: 'rt' });
    expect(await setting('drive_access_token')).toBe('tok1');
    expect(await driveToken(e, f)).toBe('tok1');
    expect(calls).toHaveLength(1);
    await set('drive_access_exp', String(Date.now() + 60_000)); // < 5 menit → refresh lagi
    expect(await driveToken(e, f)).toBe('tok2');
  });
  it('invalid_grant → terputus + DriveDisconnected', async () => {
    const { f } = fake(() => jres({ error: 'invalid_grant' }, 400));
    await expect(driveToken(e, f)).rejects.toBeInstanceOf(DriveDisconnected);
    expect(await setting('drive_status')).toBe('terputus');
    expect(await getStore(e)).toBeNull();
  });
});

describe('driveStore', () => {
  it('put: root + folder periode sekali, upload multipart benar, mengembalikan id', async () => {
    const { f, calls } = fake();
    const s = driveStore(e, f);
    const id = await s.put({ name: 'a.jpg', periodId: 1, bytes: new Uint8Array([0xff, 0xd8, 0xff, 1]) });
    const folders = calls.filter((c) => c.method === 'POST' && c.url.includes('www.googleapis.com/drive/v3/files?'));
    expect(folders.map((c) => c.body)).toEqual([
      { name: 'Komisioning', mimeType: 'application/vnd.google-apps.folder' },
      { name: 'Des-2026', mimeType: 'application/vnd.google-apps.folder', parents: [await setting('drive_root_id')] },
    ]);
    const up = calls.find((c) => c.url.includes('/upload/drive/v3/files'))!;
    expect(up.url).toContain('uploadType=multipart');
    expect(up.headers.get('authorization')).toBe('Bearer tok1');
    const b = up.headers.get('content-type')!.match(/^multipart\/related; boundary=(.+)$/)![1];
    const txt = await (up.raw as Blob).text();
    expect(txt).toContain(`--${b}--`);
    expect(JSON.parse(txt.split('\r\n')[3])).toEqual({
      name: 'a.jpg', parents: [await env.DB.prepare('SELECT drive_folder_id v FROM periods').first<any>().then((r) => r.v)], mimeType: 'image/jpeg',
    });
    expect(txt).toContain('Content-Type: image/jpeg');
    expect(id).toMatch(/^id/);
    // upload kedua: tanpa folder baru, hanya cek folder (GET) + upload
    const before = calls.length;
    await s.put({ name: 'b.jpg', periodId: 1, bytes: new Uint8Array([0xff, 0xd8, 0xff]) });
    expect(calls.slice(before).map((c) => c.method)).toEqual(['GET', 'POST']);
    expect(calls.slice(before)[0].url).toMatch(/\/files\/id\d+\?fields=trashed$/);
  });

  it('401 di tengah upload → refresh + ulang sekali saja', async () => {
    await set('drive_root_id', 'root');
    await env.DB.prepare("UPDATE periods SET drive_folder_id = 'pf'").run();
    let up = 0;
    const { f, calls } = fake((c) => (c.url.includes('/upload/') && ++up === 1 ? new Response('', { status: 401 }) : undefined));
    await driveStore(e, f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    const ups = calls.filter((c) => c.url.includes('/upload/'));
    const auth = ups.map((c) => c.headers.get('authorization'));
    expect(auth[0]).toBe('Bearer tok1');
    expect(auth[1]).toMatch(/^Bearer tok\d+$/); // token baru hasil refresh
    expect(auth[1]).not.toBe(auth[0]);
    expect(ups).toHaveLength(2);
    // 401 terus-menerus: berhenti setelah satu ulangan, gagal (bukan loop)
    const bad = fake((c) => (c.url.includes('/upload/') ? new Response('', { status: 401 }) : undefined));
    await expect(driveStore(e, bad.f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) })).rejects.toThrow();
    expect(bad.calls.filter((c) => c.url.includes('/upload/'))).toHaveLength(2);
  });

  it('folder periode hilang (upload 404) → id dibersihkan, folder dibuat ulang, upload diulang sekali', async () => {
    await set('drive_root_id', 'root');
    await env.DB.prepare("UPDATE periods SET drive_folder_id = 'lama'").run();
    const { f, calls } = fake((c) => (c.url.includes('/upload/') && calls.filter((x) => x.url.includes('/upload/')).length === 1 ? new Response('', { status: 404 }) : undefined));
    await driveStore(e, f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    expect(calls.filter((c) => c.url.includes('/upload/'))).toHaveLength(2);
    expect((await env.DB.prepare('SELECT drive_folder_id v FROM periods').first<any>()).v).toMatch(/^id/);
  });

  it('root hilang (404 saat buat folder periode) → root dibuat ulang', async () => {
    await set('drive_root_id', 'rootlama');
    const { f, calls } = fake((c) => (c.body?.parents?.[0] === 'rootlama' ? new Response('', { status: 404 }) : undefined));
    await driveStore(e, f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    expect(await setting('drive_root_id')).not.toBe('rootlama');
    expect(calls.filter((c) => c.url.includes('/upload/'))).toHaveLength(1);
  });

  it('folder periode di Sampah → tidak diunggahi, folder dibuat ulang', async () => {
    await set('drive_root_id', 'root');
    await env.DB.prepare("UPDATE periods SET drive_folder_id = 'sampah'").run();
    const { f, calls } = fake((c) => (c.url.includes('/files/sampah?') ? jres({ trashed: true }) : undefined));
    await driveStore(e, f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    const ups = calls.filter((c) => c.url.includes('/upload/'));
    expect(ups).toHaveLength(1);
    const pf = (await env.DB.prepare('SELECT drive_folder_id v FROM periods').first<any>()).v;
    expect(pf).not.toBe('sampah');
    expect(await (ups[0].raw as Blob).text()).toContain(`"parents":["${pf}"]`);
  });

  it('root dihapus permanen (404) → root dibuat ulang', async () => {
    await set('drive_root_id', 'rootlama');
    const { f } = fake((c) => (c.url.includes('/files/rootlama?') ? new Response('', { status: 404 }) : undefined));
    await driveStore(e, f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    expect(await setting('drive_root_id')).not.toBe('rootlama');
  });

  it('klaim folder bersamaan: yang kalah menghapus folder buatannya', async () => {
    await set('drive_root_id', 'root');
    const { f, calls } = fake(async (c): Promise<Response | undefined> => {
      if (c.method === 'POST' && c.body?.name === 'Des-2026') // pesaing menang di tengah jalan
        await env.DB.prepare("UPDATE periods SET drive_folder_id = 'menang'").run();
      return undefined;
    });
    await driveStore(e, f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    const del = calls.find((c) => c.method === 'DELETE')!;
    expect(del.url).toMatch(/\/files\/id\d+$/);
    expect(JSON.parse(await (calls.find((c) => c.url.includes('/upload/'))!.raw as Blob).text().then((t) => t.split('\r\n')[3])).parents).toEqual(['menang']);
    expect(await env.DB.prepare('SELECT drive_folder_id v FROM periods').first<any>()).toEqual({ v: 'menang' });
  });

  it('klaim root bersamaan: yang kalah menghapus root buatannya', async () => {
    const { f, calls } = fake(async (c): Promise<Response | undefined> => {
      if (c.method === 'POST' && c.body?.name === 'Komisioning') await set('drive_root_id', 'root-menang');
      return undefined;
    });
    await driveStore(e, f).put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    expect(calls.find((c) => c.body?.name === 'Des-2026')!.body.parents).toEqual(['root-menang']);
  });

  it('get: 404 → null; ok → JPEG', async () => {
    const miss = fake((c) => (c.url.includes('oauth2') ? undefined : new Response('', { status: 404 })));
    expect(await driveStore(e, miss.f).get('x')).toBeNull();
    const hit = fake((c) => (c.url.includes('alt=media') ? new Response(new Uint8Array([9])) : undefined));
    const r = await driveStore(e, hit.f).get('abc');
    expect(hit.calls.at(-1)!.url).toBe('https://www.googleapis.com/drive/v3/files/abc?alt=media');
    expect(r!.headers.get('content-type')).toBe('image/jpeg');
  });

  it('del: DELETE per id, 404 diabaikan', async () => {
    const { f, calls } = fake((c) => (c.method === 'DELETE' && c.url.endsWith('/a') ? new Response('', { status: 404 }) : c.method === 'DELETE' ? new Response(null, { status: 204 }) : undefined));
    await driveStore(e, f).del(['a', 'b']);
    expect(calls.filter((c) => c.method === 'DELETE').map((c) => c.url.split('/').pop())).toEqual(['a', 'b']);
  });

  it('trashPeriod: PATCH {trashed:true} pada folder periode', async () => {
    await env.DB.prepare("UPDATE periods SET drive_folder_id = 'pf'").run();
    const { f, calls } = fake();
    await driveStore(e, f).trashPeriod(1);
    const p = calls.find((c) => c.method === 'PATCH')!;
    expect(p.url).toBe('https://www.googleapis.com/drive/v3/files/pf');
    expect(p.body).toEqual({ trashed: true });
  });
});

describe('getStore / upload dengan Drive', () => {
  it('tanpa refresh token → null; dengan token → store', async () => {
    await env.DB.prepare('DELETE FROM pengaturan').run();
    expect(await getStore(e)).toBeNull();
    await set('drive_refresh_token', 'rt');
    expect(await getStore(e)).not.toBeNull();
    expect(await getStore({ ...e, GOOGLE_CLIENT_SECRET: undefined } as Env)).toBeNull();
  });

  const upload = async (extra: Partial<Env> = {}) => {
    await env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (1,1,'x','p','k','j','2999-01-01','W1','Belum Diajukan')").run();
    const meta = { kode: 'AAAA-0001', unitId: 1, sisi: 'kanan', capturedAt: Date.now(), deviceNow: Date.now(), lat: null, lon: null, accuracy: null, address: null, nama: 'B', nrp: '1' };
    const body = new Uint8Array([0xff, 0xd8, 0xff, 1]);
    const ctx = createExecutionContext();
    const res = await handleUpload(new Request('https://x/api/photos', {
      method: 'POST', body, headers: { 'X-Foto-Meta': encodeURIComponent(JSON.stringify(meta)), 'Content-Length': '4' },
    }), { ...e, ...extra } as Env, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  };

  it('Drive belum tersambung → 503, tanpa baris foto', async () => {
    await env.DB.prepare('DELETE FROM pengaturan').run();
    const r = await upload();
    expect([r.status, await r.json()]).toEqual([503, { error: 'penyimpanan_belum_siap' }]);
    expect((await env.DB.prepare('SELECT COUNT(*) c FROM photos').first<any>()).c).toBe(0);
  });

  it('izin dicabut di tengah upload (invalid_grant) → 503, foto tak tersimpan, upload berikutnya juga 503', async () => {
    vi.stubGlobal('fetch', fake(() => jres({ error: 'invalid_grant' }, 400)).f);
    const r = await upload();
    expect([r.status, await r.json()]).toEqual([503, { error: 'penyimpanan_belum_siap' }]);
    expect(await setting('drive_status')).toBe('terputus');
    expect((await env.DB.prepare('SELECT COUNT(*) c FROM photos').first<any>()).c).toBe(0);
    expect(await getStore(e)).toBeNull();
  });
});

describe('getPhoto dengan Drive', () => {
  it('berkas hilang di Drive (404) → 404, bukan 500', async () => {
    await env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (1,1,'x','p','k','j','2999-01-01','W1','Belum Diajukan')").run();
    await env.DB.prepare("INSERT INTO photos (unit_id,sisi,kode_foto,r2_key,captured_at_device,captured_at_corrected,received_at_server,clock_offset_s,mekanik_nama,mekanik_nrp) VALUES (1,'depan','AB1C-D2EF','hilang',1,1,1,0,'B','1')").run();
    await set('drive_access_token', 't'); await set('drive_access_exp', String(Date.now() + 3_600_000));
    vi.stubGlobal('fetch', fake((c) => (c.url.includes('oauth2') ? undefined : new Response('', { status: 404 }))).f);
    const ctx = createExecutionContext();
    const r = await getPhoto(new Request('https://x/api/photo/AB1C-D2EF?u=404'), 'AB1C-D2EF', e, ctx);
    await waitOnExecutionContext(ctx);
    expect(r.status).toBe(404);
  });

  it('Drive terputus saat ambil foto → 503, bukan 500', async () => {
    await env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (1,1,'x','p','k','j','2999-01-01','W1','Belum Diajukan')").run();
    await env.DB.prepare("INSERT INTO photos (unit_id,sisi,kode_foto,r2_key,captured_at_device,captured_at_corrected,received_at_server,clock_offset_s,mekanik_nama,mekanik_nrp) VALUES (1,'depan','AB1C-D2EF','k503',1,1,1,0,'B','1')").run();
    vi.stubGlobal('fetch', fake(() => jres({ error: 'invalid_grant' }, 400)).f);
    const ctx = createExecutionContext();
    const r = await getPhoto(new Request('https://x/api/photo/AB1C-D2EF'), 'AB1C-D2EF', e, ctx);
    await waitOnExecutionContext(ctx);
    expect([r.status, await r.json()]).toEqual([503, { error: 'penyimpanan_belum_siap' }]);
  });

  it('Drive belum pernah tersambung saat ambil foto → 503, bukan 404', async () => {
    await env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (1,1,'x','p','k','j','2999-01-01','W1','Belum Diajukan')").run();
    await env.DB.prepare("INSERT INTO photos (unit_id,sisi,kode_foto,r2_key,captured_at_device,captured_at_corrected,received_at_server,clock_offset_s,mekanik_nama,mekanik_nrp) VALUES (1,'depan','AB1C-D2EF','kbelum',1,1,1,0,'B','1')").run();
    await env.DB.prepare('DELETE FROM pengaturan').run();
    const ctx = createExecutionContext();
    const r = await getPhoto(new Request('https://x/api/photo/AB1C-D2EF'), 'AB1C-D2EF', e, ctx);
    await waitOnExecutionContext(ctx);
    expect([r.status, await r.json()]).toEqual([503, { error: 'penyimpanan_belum_siap' }]);
  });
});

describe('folder per unit', () => {
  const unit = () => env.DB.prepare(
    "INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (5,1,'PPA - TL 0141','PPA','SUPPORT','TOWER LAMP','2026-12-31','W1','Belum Diajukan')").run();
  const folderPosts = (calls: Call[]) => calls.filter((c) => c.method === 'POST' && c.url.includes('www.googleapis.com/drive/v3/files?')).map((c) => c.body.name);
  it('Komisioning/<periode>/<unit>/ dibuat sekali, upload ke folder unit', async () => {
    await unit();
    const { f, calls } = fake();
    const s = driveStore(e, f);
    await s.put({ name: 'TL141_depan_A.jpg', periodId: 1, unitId: 5, folderName: 'TL141', bytes: new Uint8Array([1]) });
    await s.put({ name: 'TL141_kiri_B.jpg', periodId: 1, unitId: 5, folderName: 'TL141', bytes: new Uint8Array([1]) });
    expect(folderPosts(calls)).toEqual(['Komisioning', 'Des-2026', 'TL141']);
    const unitId = (await env.DB.prepare('SELECT drive_folder_id FROM units WHERE id = 5').first<{ drive_folder_id: string }>())!.drive_folder_id;
    const ups = calls.filter((c) => c.url.includes('/upload/drive/v3/files'));
    for (const u of ups) expect(await (u.raw as Blob).text()).toContain(`"parents":["${unitId}"]`);
  });
  it('folder unit dihapus di Drive (masuk Sampah) → folder unit baru, foto masuk ke sana (kasus CP61)', async () => {
    await unit();
    await set('drive_root_id', 'root');
    await env.DB.prepare("UPDATE periods SET drive_folder_id = 'pf'").run();
    await env.DB.prepare("UPDATE units SET drive_folder_id = 'sampah' WHERE id = 5").run();
    const { f, calls } = fake((c) => (c.url.includes('/files/sampah?') ? jres({ trashed: true }) : undefined));
    await driveStore(e, f).put({ name: 'x.jpg', periodId: 1, unitId: 5, folderName: 'TL141', bytes: new Uint8Array([1]) });
    expect(folderPosts(calls)).toEqual(['TL141']);
    expect(calls.find((c) => c.body?.name === 'TL141')!.body.parents).toEqual(['pf']);
    const uf = (await env.DB.prepare('SELECT drive_folder_id v FROM units WHERE id = 5').first<any>()).v;
    expect(uf).not.toBe('sampah');
    const ups = calls.filter((c) => c.url.includes('/upload/'));
    expect(ups).toHaveLength(1);
    expect(await (ups[0].raw as Blob).text()).toContain(`"parents":["${uf}"]`);
  });
});
