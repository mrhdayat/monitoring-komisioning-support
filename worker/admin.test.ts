import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { handleAdmin } from './admin';
import { hashPassword, login, sha256Hex } from './auth';
import type { Env } from './http';

const E = env as Env;
const NOW = 1_800_000_000_000;
let cookie = '';

const call = async (method: string, url: string, body?: unknown, ck: string | null = cookie) => {
  const res = await handleAdmin(new Request(`https://x${url}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(ck ? { cookie: ck } : {}) },
  }), E, NOW);
  return { status: res.status, body: await res.json<any>() };
};
const U = (n: string, extra = {}) => ({ no_lambung: n, perusahaan: 'PT A', kelompok_unit: 'K', jenis_unit: 'DT', berlaku_akhir: '2030-01-01', week: 'W1', status_she: 'Belum Diajukan', code_unit: null, skr_bib: null, pop_status: 'tidak_ada', ...extra });
const imp = (units: unknown[], importId = 'i1') => call('POST', '/api/admin/import', { period: 'Des/2026', importId, units });
const fin = (importId: string) => call('POST', '/api/admin/import/finish', { period: 'Des/2026', importId });
const photo = (unit: number, sisi: string, kode: string, flags = '') =>
  E.DB.prepare(`INSERT INTO photos (unit_id,sisi,kode_foto,r2_key,captured_at_device,captured_at_corrected,received_at_server,clock_offset_s,mekanik_nama,mekanik_nrp,flags)
    VALUES (?,?,?,?,1,1,1,0,'Budi','1',?)`).bind(unit, sisi, kode, `foto/${kode}.jpg`, flags).run();

beforeEach(async () => {
  await E.DB.batch(['sessions', 'photos', 'units', 'periods', 'admins', 'populasi'].map((t) => E.DB.prepare(`DELETE FROM ${t}`)));
  await E.DB.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, 1)').bind('budi', await hashPassword('rahasia123')).run();
  const r = await login(new Request('https://x/l', { method: 'POST', body: JSON.stringify({ username: 'budi', password: 'rahasia123' }), headers: { 'content-type': 'application/json' } }), E, NOW);
  cookie = r.headers.get('set-cookie')!.split(';')[0];
  await E.DB.batch([E.DB.prepare('DELETE FROM berkas_dev'), E.DB.prepare('DELETE FROM snapshot')]);
});

describe('admin', () => {
  it('tanpa sesi → 401 untuk semua /api/admin/*', async () => {
    for (const [m, u] of [['POST', '/api/admin/import'], ['POST', '/api/admin/import/finish'], ['GET', '/api/admin/units'],
      ['DELETE', '/api/admin/photo/X'], ['GET', '/api/admin/admins'], ['DELETE', '/api/admin/admins/1']] as const) {
      const r = await call(m, u, m === 'POST' ? {} : undefined, null);
      expect([m, u, r.status, r.body]).toEqual([m, u, 401, { error: 'unauthorized' }]);
    }
  });

  it('impor 2 batch + finish → unit tersimpan, periode dengan purge_after', async () => {
    expect((await imp([U('A 1'), U('A 2')])).body).toEqual({ ok: true, count: 2 });
    await imp([U('A 3')]);
    expect((await fin('i1')).body).toEqual({ total: 3, hidden: 0 });
    const p = await E.DB.prepare('SELECT * FROM periods').first<any>();
    expect(p).toMatchObject({ label: 'Des/2026', uploaded_at: NOW, import_id: 'i1' });
    expect(p.purge_after).toBeGreaterThan(NOW);
    expect(await E.DB.prepare('SELECT 1 x FROM snapshot').first()).not.toBeNull();
  });

  it('impor ulang tanpa unit X → X tersembunyi, foto X tetap', async () => {
    await imp([U('A 1'), U('A 2')]);
    await fin('i1');
    const x = await E.DB.prepare("SELECT id FROM units WHERE no_lambung='A 2'").first<{ id: number }>();
    await photo(x!.id, 'depan', 'AAAA-0001');
    await imp([U('A 1', { week: 'W9' })], 'i2');
    expect((await fin('i2')).body).toEqual({ total: 2, hidden: 1 });
    expect((await E.DB.prepare("SELECT in_latest_upload FROM units WHERE no_lambung='A 2'").first<any>()).in_latest_upload).toBe(0);
    expect((await E.DB.prepare('SELECT COUNT(*) n FROM photos').first<any>()).n).toBe(1);
    expect((await E.DB.prepare("SELECT week FROM units WHERE no_lambung='A 1'").first<any>()).week).toBe('W9');
  });

  it('impor menyimpan code_unit, skr_bib, pop_status; field baru divalidasi', async () => {
    await imp([U('TL 141', { code_unit: 'TL141', skr_bib: 'TL0141', pop_status: 'cocok' })]);
    const { body } = await call('GET', '/api/admin/units');
    expect(body.units[0]).toMatchObject({ code_unit: 'TL141', skr_bib: 'TL0141', pop_status: 'cocok' });
    expect((await imp([U('A', { pop_status: 'x' })])).status).toBe(400);
    expect((await imp([U('A', { code_unit: 'x'.repeat(61) })])).status).toBe(400);
    expect((await imp([U('A', { pop_status: 'cocok', code_unit: null })])).status).toBe(400);
    expect((await imp([U('A', { pop_status: 'ganda', code_unit: 'X1' })])).status).toBe(400);
    expect((await imp([U('A', { pop_status: 'tidak_ada', skr_bib: 'X1' })])).status).toBe(400);
    const { code_unit, skr_bib, pop_status, ...lama } = U('A');
    expect((await imp([lama])).status).toBe(400);
  });

  it('validasi impor → 400', async () => {
    expect((await imp(Array.from({ length: 101 }, (_, i) => U(`N ${i}`)))).status).toBe(400);
    expect((await imp([])).status).toBe(400);
    expect((await imp([U('A', { berlaku_akhir: '1/1/2027' })])).status).toBe(400);
    expect((await imp([U('A', { week: '' })])).status).toBe(400);
    expect((await call('POST', '/api/admin/import', { period: 'ngawur', importId: 'i', units: [U('A')] })).status).toBe(400);
    expect((await call('POST', '/api/admin/import/finish', { period: 'Jan/2030', importId: 'i' })).status).toBe(404);
  });

  it('units: status & perluCek dari flags', async () => {
    await imp([U('A 1'), U('A 2')]);
    const ids = (await E.DB.prepare('SELECT id FROM units ORDER BY id').all<{ id: number }>()).results.map((r) => r.id);
    await photo(ids[0], 'depan', 'AAAA-0001', 'jam');
    await photo(ids[0], 'kiri', 'AAAA-0002');
    const { body } = await call('GET', '/api/admin/units');
    const [a, b] = body.units;
    expect(a).toMatchObject({ period: 'Des/2026', status: 'sebagian', perluCek: true, in_latest_upload: true });
    expect(a.photos.depan).toMatchObject({ kode: 'AAAA-0001', flags: 'jam', mekanik_nama: 'Budi' });
    expect(Object.keys(a.sides)).toEqual(['depan', 'kiri']);
    expect(b).toMatchObject({ status: 'belum', perluCek: false });
    expect(body.periods[0]).toMatchObject({ label: 'Des/2026', purged_at: null });
  });

  it('hapus foto → baris & berkas hilang, snapshot diperbarui', async () => {
    await imp([U('A 1')]);
    const u = await E.DB.prepare('SELECT id FROM units').first<{ id: number }>();
    await photo(u!.id, 'depan', 'AAAA-0001');
    await E.DB.prepare("INSERT INTO berkas_dev (id, data) VALUES ('foto/AAAA-0001.jpg', x'01')").run();
    expect((await call('DELETE', '/api/admin/photo/AAAA-0001')).body).toEqual({ ok: true });
    expect(await E.DB.prepare('SELECT 1 x FROM berkas_dev').first()).toBeNull();
    expect((await E.DB.prepare('SELECT COUNT(*) n FROM photos').first<any>()).n).toBe(0);
    const snap = JSON.parse((await E.DB.prepare('SELECT json FROM snapshot').first<{ json: string }>())!.json);
    expect(snap.units[0].sides).toEqual({});
    expect((await call('DELETE', '/api/admin/photo/AAAA-0001')).status).toBe(404);
  });

  it('kelola admin: daftar, tambah, duplikat, validasi', async () => {
    const r = await call('POST', '/api/admin/admins', { username: 'sari', password: 'abcdefgh' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ username: 'sari' });
    expect((await call('POST', '/api/admin/admins', { username: 'sari', password: 'abcdefgh' })).body).toEqual({ error: 'username_dipakai' });
    expect((await call('POST', '/api/admin/admins', { username: 'Sari', password: 'abcdefgh' })).status).toBe(400);
    expect((await call('POST', '/api/admin/admins', { username: 'tono', password: 'pendek' })).status).toBe(400);
    const list = (await call('GET', '/api/admin/admins')).body;
    expect(list.map((a: any) => a.username)).toEqual(['budi', 'sari']);
    expect(JSON.stringify(list)).not.toContain('password');
  });

  it('tidak bisa menghapus diri sendiri / admin terakhir → 400; lain boleh', async () => {
    const me = (await E.DB.prepare("SELECT id FROM admins WHERE username='budi'").first<any>()).id;
    expect((await call('DELETE', `/api/admin/admins/${me}`)).body).toEqual({ error: 'tidak_boleh' });
    const other = (await call('POST', '/api/admin/admins', { username: 'sari', password: 'abcdefgh' })).body.id;
    expect((await call('DELETE', `/api/admin/admins/${me}`)).status).toBe(400);
    expect((await call('DELETE', `/api/admin/admins/${other}`)).status).toBe(200);
  });

  it('reset password admin lain → login password baru berhasil, sesi lama hangus', async () => {
    const other = (await call('POST', '/api/admin/admins', { username: 'sari', password: 'abcdefgh' })).body.id;
    const lg = (pw: string) => login(new Request('https://x/l', { method: 'POST', body: JSON.stringify({ username: 'sari', password: pw }), headers: { 'content-type': 'application/json' } }), E, NOW);
    const old = (await lg('abcdefgh')).headers.get('set-cookie')!.split(';')[0];
    expect((await call('POST', `/api/admin/admins/${other}/password`, { password: 'pendek' })).status).toBe(400);
    expect((await call('POST', `/api/admin/admins/${other}/password`, { password: 'barubaru1' })).status).toBe(200);
    expect((await lg('abcdefgh')).status).toBe(401);
    expect((await lg('barubaru1')).status).toBe(200);
    expect((await call('GET', '/api/admin/admins', undefined, old)).status).toBe(401);
  });

  describe('populasi', () => {
    const P = (c: string, extra = {}) => ({ code_unit: c, skr_bib: `B${c}`, jenis: 'DT', maint: 'PT A', ...extra });
    const put = (units: unknown) => call('PUT', '/api/admin/populasi', { units });

    it('tanpa sesi → 401', async () => {
      expect((await call('PUT', '/api/admin/populasi', { units: [] }, null)).status).toBe(401);
      expect((await call('GET', '/api/admin/populasi', undefined, null)).status).toBe(401);
    });

    it('kosong → units [] dan uploaded_at null; PUT mengganti total', async () => {
      expect((await call('GET', '/api/admin/populasi')).body).toEqual({ units: [], uploaded_at: null });
      expect((await put([P('A1'), P('A2')])).body).toEqual({ count: 2 });
      const g = (await call('GET', '/api/admin/populasi')).body;
      expect(g.units).toHaveLength(2);
      expect(g.units[0]).toEqual(P('A1'));
      expect(g.uploaded_at).toBe(NOW);
      await put([P('B1')]);
      expect((await call('GET', '/api/admin/populasi')).body.units).toEqual([P('B1')]);
    });

    it('skr_bib/jenis/maint kosong boleh', async () => {
      expect((await put([P('A1', { skr_bib: '', jenis: '', maint: '' })])).body).toEqual({ count: 1 });
      expect((await call('GET', '/api/admin/populasi')).body.units).toEqual([P('A1', { skr_bib: '', jenis: '', maint: '' })]);
    });

    it('2000 baris sekaligus', async () => {
      expect((await put(Array.from({ length: 2000 }, (_, i) => P(`C${i}`)))).body).toEqual({ count: 2000 });
      expect((await call('GET', '/api/admin/populasi')).body.units).toHaveLength(2000);
    });

    it('tidak sah → 400 dan data lama utuh', async () => {
      await put([P('A1')]);
      const bad = [
        [P('A2', { maint: 'x'.repeat(61) })], Array.from({ length: 2001 }, (_, i) => P(`C${i}`)),
        'bukan array', [P('A2'), P('A2')], [P('A2', { code_unit: ' ' })], [P('A2', { jenis: 5 })], [null],
      ];
      for (const b of bad) expect((await put(b)).status).toBe(400);
      expect((await call('GET', '/api/admin/populasi')).body.units).toEqual([P('A1')]);
    });
  });
});

describe('Google Drive OAuth', () => {
  const DE = { ...E, STORAGE: 'drive', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'sec' } as Env;
  const idToken = (email: string) => `x.${btoa(JSON.stringify({ email })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.y`;
  const tokenFetch = (body: object, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const good = () => tokenFetch({ access_token: 'AT', expires_in: 3600, refresh_token: 'RT', id_token: idToken('kantor@gmail.com') });
  const go = (path: string, ck: string | null = cookie, env = DE, f: typeof fetch = good(), now = NOW) =>
    handleAdmin(new Request(`https://x${path}`, { headers: ck ? { cookie: ck } : {} }), env, now, f);
  const setting = async (k: string) => (await E.DB.prepare('SELECT v FROM pengaturan WHERE k = ?').bind(k).first<{ v: string }>())?.v ?? null;
  const startState = async (ck = cookie, now = NOW) => {
    const r = await go('/api/admin/drive/mulai', ck, DE, good(), now);
    return new URL(r.headers.get('location')!).searchParams.get('state')!;
  };
  const saved = async () => (await E.DB.prepare("SELECT COUNT(*) n FROM pengaturan WHERE k LIKE 'drive_%'").first<{ n: number }>())!.n;
  beforeEach(() => E.DB.batch([E.DB.prepare('DELETE FROM pengaturan'), E.DB.prepare('DELETE FROM drive_state')]));

  it('mulai tanpa sesi → 401', async () => {
    expect((await go('/api/admin/drive/mulai', null)).status).toBe(401);
  });

  it('mulai → 302 ke Google dengan parameter lengkap', async () => {
    const r = await go('/api/admin/drive/mulai');
    expect(r.status).toBe(302);
    const u = new URL(r.headers.get('location')!);
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({
      client_id: 'cid', redirect_uri: 'https://x/api/admin/drive/kembali', response_type: 'code',
      scope: 'https://www.googleapis.com/auth/drive.file openid email', access_type: 'offline', prompt: 'consent',
    });
    expect(u.searchParams.get('state')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('mulai tanpa client id/secret → /admin/admin?drive=gagal', async () => {
    const r = await go('/api/admin/drive/mulai', cookie, E);
    expect([r.status, r.headers.get('location')]).toEqual([302, '/admin/admin?drive=gagal']);
  });

  it('kembali dengan state benar → token + email tersimpan, root direset, ?drive=ok', async () => {
    await E.DB.prepare("INSERT INTO pengaturan (k, v) VALUES ('drive_root_id', 'lama'), ('drive_status', 'terputus')").run();
    const st = await startState();
    const r = await go(`/api/admin/drive/kembali?code=C&state=${st}`);
    expect([r.status, r.headers.get('location')]).toEqual([302, '/admin/admin?drive=ok']);
    expect(await setting('drive_refresh_token')).toBe('RT');
    expect(await setting('drive_email')).toBe('kantor@gmail.com');
    expect(await setting('drive_status')).toBe('tersambung');
    expect(await setting('drive_access_token')).toBe('AT');
    expect(Number(await setting('drive_access_exp'))).toBe(NOW + 3600_000);
    expect(await setting('drive_root_id')).toBeNull();
  });

  it('akun sama → drive_root_id dipertahankan; akun beda → direset', async () => {
    await E.DB.prepare("INSERT INTO pengaturan (k, v) VALUES ('drive_root_id', 'lama'), ('drive_email', 'kantor@gmail.com')").run();
    await go(`/api/admin/drive/kembali?code=C&state=${await startState()}`);
    expect(await setting('drive_root_id')).toBe('lama');
    await E.DB.prepare("UPDATE pengaturan SET v = 'lain@gmail.com' WHERE k = 'drive_email'").run();
    await go(`/api/admin/drive/kembali?code=C&state=${await startState()}`);
    expect(await setting('drive_root_id')).toBeNull();
    expect(await setting('drive_email')).toBe('kantor@gmail.com');
  });

  it('state tidak berlaku → halaman HTML ramah, status tetap 400/401', async () => {
    const r = await go('/api/admin/drive/kembali?code=C&state=salah');
    expect([r.status, r.headers.get('content-type')]).toEqual([400, 'text/html; charset=utf-8']);
    expect(await r.text()).toContain('Tautan penyambungan sudah tidak berlaku');
    expect((await go('/api/admin/drive/kembali?code=C&state=x', null)).headers.get('content-type')).toContain('text/html');
  });

  it('kembali menukar code dengan redirect_uri yang sama', async () => {
    let sent: URLSearchParams | undefined;
    const f = (async (_u: string, init: RequestInit) => { sent = init.body as URLSearchParams; return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', id_token: idToken('a@b.c') })); }) as unknown as typeof fetch;
    const st = await startState();
    await go(`/api/admin/drive/kembali?code=C&state=${st}`, cookie, DE, f);
    expect(Object.fromEntries(sent!)).toEqual({ code: 'C', client_id: 'cid', client_secret: 'sec', redirect_uri: 'https://x/api/admin/drive/kembali', grant_type: 'authorization_code' });
  });

  it('state salah / kedaluwarsa / sesi lain / dipakai dua kali → 400, tidak ada yang tersimpan', async () => {
    expect((await go('/api/admin/drive/kembali?code=C&state=salah')).status).toBe(400);
    expect((await go('/api/admin/drive/kembali?code=C')).status).toBe(400);
    const old = await startState(cookie, NOW - 11 * 60_000);
    expect((await go(`/api/admin/drive/kembali?code=C&state=${old}`)).status).toBe(400);
    await E.DB.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, 1)').bind('siti', await hashPassword('rahasia123')).run();
    const r2 = await login(new Request('https://x/l', { method: 'POST', body: JSON.stringify({ username: 'siti', password: 'rahasia123' }), headers: { 'content-type': 'application/json' } }), E, NOW);
    const other = r2.headers.get('set-cookie')!.split(';')[0];
    const mine = await startState();
    expect((await go(`/api/admin/drive/kembali?code=C&state=${mine}`, other)).status).toBe(400);
    expect(await saved()).toBe(0);
    // state milik sesi lain tidak terbakar; pemiliknya masih bisa memakainya sekali
    expect((await go(`/api/admin/drive/kembali?code=C&state=${mine}`)).status).toBe(302);
    await E.DB.prepare("DELETE FROM pengaturan").run();
    expect((await go(`/api/admin/drive/kembali?code=C&state=${mine}`)).status).toBe(400);
    expect(await saved()).toBe(0);
    expect(await E.DB.prepare('SELECT 1 x FROM drive_state WHERE state_hash = ?').bind(await sha256Hex(mine)).first()).toBeNull();
  });

  it('Google menolak / tanpa refresh_token / tukar gagal → ?drive=gagal, tidak ada yang tersimpan', async () => {
    for (const f of [tokenFetch({ access_token: 'a', id_token: idToken('a@b.c') }), tokenFetch({ error: 'invalid_grant' }, 400)]) {
      const st = await startState();
      const r = await go(`/api/admin/drive/kembali?code=C&state=${st}`, cookie, DE, f);
      expect([r.status, r.headers.get('location')]).toEqual([302, '/admin/admin?drive=gagal']);
    }
    const st = await startState();
    expect((await go(`/api/admin/drive/kembali?error=access_denied&state=${st}`)).headers.get('location')).toBe('/admin/admin?drive=gagal');
    expect(await saved()).toBe(0);
  });

  it('status mengembalikan field yang benar', async () => {
    const st = async (env = DE) => (await go('/api/admin/drive/status', cookie, env)).json();
    expect(await st()).toEqual({ storage: 'drive', status: 'belum', email: null, folderUrl: null });
    expect(await st(E)).toMatchObject({ storage: 'd1' });
    await E.DB.prepare("INSERT INTO pengaturan (k, v) VALUES ('drive_refresh_token', 'r'), ('drive_email', 'k@g.c'), ('drive_root_id', 'ROOT')").run();
    expect(await st()).toEqual({ storage: 'drive', status: 'tersambung', email: 'k@g.c', folderUrl: 'https://drive.google.com/drive/folders/ROOT' });
    await E.DB.prepare("INSERT INTO pengaturan (k, v) VALUES ('drive_status', 'terputus')").run();
    expect((await st() as any).status).toBe('terputus');
  });
});
