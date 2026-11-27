import { env, SELF } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Snapshot } from '../shared/types';
import { rebuildSnapshot } from './snapshot';

const FUTURE = Date.now() + 86_400_000 * 30;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos'), env.DB.prepare('DELETE FROM units'),
    env.DB.prepare('DELETE FROM periods'), env.DB.prepare('DELETE FROM geocache'),
    env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (1,'Des/2026',1,?)").bind(FUTURE),
    env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after,purged_at) VALUES (2,'Nov/2026',1,1,5)"),
    env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (1,1,'DT 4464','PT A','K','DT','2026-12-31','W1','Belum Diajukan')"),
    env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (2,1,'DT 1','PT A','K','DT','2026-12-31','W1','Off Hire')"),
    env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (3,2,'DT 9','PT A','K','DT','2026-12-31','W1','Belum Diajukan')"),
    env.DB.prepare("INSERT INTO photos (unit_id,sisi,kode_foto,r2_key,captured_at_device,captured_at_corrected,received_at_server,clock_offset_s,mekanik_nama,mekanik_nrp) VALUES (1,'depan','AB1C-D2EF','foto/AB1C-D2EF.jpg',1000,1000,2000,0,'Budi','123')"),
  ]);
  await env.PHOTOS.delete('snapshot.json');
});

describe('public', () => {
  it('snapshot berisi unit Belum Diajukan + sides + ETag 304', async () => {
    await env.DB.prepare("UPDATE units SET code_unit='DT44', skr_bib='DT0044', pop_status='cocok' WHERE id=1").run();
    await rebuildSnapshot(env);
    const r1 = await SELF.fetch('https://x/api/snapshot');
    expect(r1.headers.get('Cache-Control')).toBe('no-cache');
    const s = await r1.json<Snapshot>();
    expect(s.units.map((u) => u.no_lambung)).toEqual(['DT 4464']);
    expect(s.units[0].in_latest_upload).toBe(true);
    expect(s.units[0]).toMatchObject({ code_unit: 'DT44', skr_bib: 'DT0044' });
    expect(s.units[0]).not.toHaveProperty('pop_status');
    expect(s.periods.map((p) => p.label)).toEqual(['Des/2026']);
    expect(s.units[0].sides.depan).toEqual({ kode: 'AB1C-D2EF', at: 1000 });
    expect(s).not.toHaveProperty('recent');
    expect(JSON.stringify(s)).not.toContain('Budi');
    const r2 = await SELF.fetch('https://x/api/snapshot', { headers: { 'If-None-Match': r1.headers.get('ETag')! } });
    expect(r2.status).toBe(304);
  });

  it('snapshot dibangun bila belum ada', async () => {
    const r = await SELF.fetch('https://x/api/snapshot');
    expect(r.status).toBe(200);
    expect((await r.json<Snapshot>()).units).toHaveLength(1);
  });

  it('check kode menormalkan input & tanpa nama mekanik', async () => {
    const body = await (await SELF.fetch('https://x/api/check/ab1cd2ef')).json();
    expect(body).toEqual({ kode: 'AB1C-D2EF', no_lambung: 'DT 4464', sisi: 'depan', captured_at: 1000, received_at: 2000 });
  });
  it('check kode tak ada → 404', async () => {
    expect((await SELF.fetch('https://x/api/check/ZZZZ-ZZZZ')).status).toBe(404);
    expect((await SELF.fetch('https://x/api/check/!!')).status).toBe(404);
  });

  it('photo: JPEG immutable, 404 bila tak ada/invalid', async () => {
    await env.PHOTOS.put('foto/AB1C-D2EF.jpg', new Uint8Array([0xff, 0xd8, 0xff]));
    const r = await SELF.fetch('https://x/api/photo/ab1c-d2ef');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('image/jpeg');
    expect(r.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable');
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([0xff, 0xd8, 0xff]));
    expect((await SELF.fetch('https://x/api/photo/ZZZZ-ZZZZ')).status).toBe(404);
    expect((await SELF.fetch('https://x/api/photo/bad')).status).toBe(404);
  });

  it('geocode: cache hit & param invalid', async () => {
    await env.DB.prepare("INSERT INTO geocache (key,address,created_at) VALUES ('-1.234,116.500','Jl. Tes',1)").run();
    const r = await SELF.fetch('https://x/api/geocode?lat=-1.2341&lon=116.5003');
    expect(await r.json()).toEqual({ address: 'Jl. Tes' });
    for (const q of ['', 'lat=91&lon=0', 'lat=0&lon=181', 'lat=abc&lon=1', 'lat=1']) {
      const b = await SELF.fetch('https://x/api/geocode?' + q);
      expect(b.status).toBe(400);
      expect(await b.json()).toEqual({ error: 'invalid' });
    }
  });
});
