import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from './http';
import { purgeExpired } from './purge';
import { handleUpload } from './upload';

const NOW = Date.parse('2026-12-01T12:00:00+08:00');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

const unit = (id: number, period: number) =>
  env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (?,?,?,'PT A','K','DT','2027-01-01','W1','Belum Diajukan')").bind(id, period, `DT ${id}`);
const photo = (unitId: number, sisi: string, kode: string) =>
  env.DB.prepare("INSERT INTO photos (unit_id,sisi,kode_foto,r2_key,captured_at_device,captured_at_corrected,received_at_server,clock_offset_s,mekanik_nama,mekanik_nrp) VALUES (?,?,?,?,1,1,1,0,'B','1')").bind(unitId, sisi, kode, `foto/${kode}.jpg`);
const inStore = async (kode: string) => (await env.DB.prepare('SELECT 1 x FROM berkas_dev WHERE id = ?').bind(`foto/${kode}.jpg`).first()) !== null;
const count = async (t: string) => (await env.DB.prepare(`SELECT COUNT(*) c FROM ${t}`).first<{ c: number }>())!.c;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos'), env.DB.prepare('DELETE FROM units'), env.DB.prepare('DELETE FROM periods'),
    env.DB.prepare('INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (1,\'Lama\',1,100)'),
    env.DB.prepare('INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (2,\'Baru\',1,9e15)'),
    unit(1, 1), unit(2, 2),
    photo(1, 'kanan', 'AAAA-0001'), photo(1, 'kiri', 'AAAA-0002'), photo(2, 'kanan', 'BBBB-0001'),
  ]);
  await env.DB.batch([env.DB.prepare('DELETE FROM berkas_dev'), env.DB.prepare('DELETE FROM snapshot')]);
  for (const k of ['AAAA-0001', 'AAAA-0002', 'BBBB-0001'])
    await env.DB.prepare('INSERT INTO berkas_dev (id, data) VALUES (?, ?)').bind(`foto/${k}.jpg`, JPEG).run();
});

afterEach(() => vi.unstubAllGlobals());

describe('purgeExpired', () => {
  it('periode lewat purge_after: berkas & photos dihapus, unit tetap, purged_at terisi', async () => {
    expect(await purgeExpired(env as Env, NOW)).toEqual({ periods: 1, photos: 2 });
    expect(await inStore('AAAA-0001')).toBe(false);
    expect(await inStore('AAAA-0002')).toBe(false);
    expect(await count('units')).toBe(2);
    expect((await env.DB.prepare('SELECT purged_at p FROM periods WHERE id=1').first<{ p: number }>())!.p).toBe(NOW);
    expect(await count('snapshot')).toBe(1);
  });

  it('periode belum lewat tidak disentuh', async () => {
    await purgeExpired(env as Env, NOW);
    expect(await inStore('BBBB-0001')).toBe(true);
    expect(await count('photos')).toBe(1);
    expect((await env.DB.prepare('SELECT purged_at p FROM periods WHERE id=2').first<{ p: number | null }>())!.p).toBeNull();
  });

  it('upload ke unit periode yang sudah dihapus → 422 unit_tidak_berlaku', async () => {
    await purgeExpired(env as Env, NOW);
    const meta = { kode: 'CCCC-0001', unitId: 1, sisi: 'depan', capturedAt: NOW - 1000, deviceNow: NOW, lat: -1, lon: 116, accuracy: 10, address: 'x', nama: 'B', nrp: '1' };
    const req = new Request('https://x/api/photos', {
      method: 'POST', body: JPEG,
      headers: { 'X-Foto-Meta': encodeURIComponent(JSON.stringify(meta)), 'Content-Length': String(JPEG.byteLength) },
    });
    const ctx = createExecutionContext();
    const res = await handleUpload(req, env as Env, ctx, NOW);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'unit_tidak_berlaku' });
  });

  it('batas periode per run: sisanya dilanjutkan run berikutnya', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (3,'Lama2',1,100)"), unit(3, 3), photo(3, 'depan', 'CCCC-0001'),
    ]);
    expect(await purgeExpired(env as Env, NOW, 1)).toEqual({ periods: 1, photos: 2 });
    expect((await env.DB.prepare('SELECT purged_at p FROM periods WHERE id=3').first<{ p: number | null }>())!.p).toBeNull();
    expect(await purgeExpired(env as Env, NOW, 1)).toEqual({ periods: 1, photos: 1 });
  });

  it('Store null: tidak ada yang ditandai purged', async () => {
    expect(await purgeExpired({ ...env, STORAGE: 'drive' } as Env, NOW)).toEqual({ periods: 0, photos: 0 });
    expect(await count('photos')).toBe(3);
  });

  it('trashPeriod gagal di periode berikutnya: periode yang sudah ter-purge tetap keluar dari snapshot', async () => {
    await env.DB.batch([
      env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (3,'Lama2',1,100)"), unit(3, 3),
      env.DB.prepare("UPDATE periods SET drive_folder_id = 'f' || id"),
      env.DB.prepare("INSERT OR REPLACE INTO pengaturan (k,v) VALUES ('drive_refresh_token','rt'),('drive_access_token','t'),('drive_access_exp','9e15')"),
    ]);
    vi.stubGlobal('fetch', async (url: string) => new Response('', { status: url.endsWith('/f3') ? 500 : 200 }));
    const e = { ...env, STORAGE: 'drive', GOOGLE_CLIENT_ID: 'c', GOOGLE_CLIENT_SECRET: 's' } as Env;
    await expect(purgeExpired(e, NOW)).rejects.toThrow();
    expect((await env.DB.prepare('SELECT purged_at p FROM periods WHERE id=1').first<{ p: number | null }>())!.p).toBe(NOW);
    const snap = JSON.parse((await env.DB.prepare('SELECT json FROM snapshot WHERE id=1').first<{ json: string }>())!.json);
    expect(snap.periods.map((p: { id: number }) => p.id)).not.toContain(1);
  });
});
