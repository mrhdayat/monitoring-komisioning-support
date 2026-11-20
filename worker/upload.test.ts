import { createExecutionContext, env, SELF, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PhotoMeta } from '../shared/types';
import type { Env } from './http';
import { handleUpload } from './upload';

const WITA = (s: string) => Date.parse(`${s}+08:00`);
const NOW = WITA('2026-12-01T12:00:00');
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);

const base: PhotoMeta = {
  kode: 'AAAA-0001', unitId: 1, sisi: 'kanan', capturedAt: WITA('2026-12-01T09:00:00'), deviceNow: NOW,
  lat: -1.2, lon: 116.5, accuracy: 10, address: 'Jl. Tes', nama: 'Budi', nrp: '123',
};

const metaOf = (meta: Partial<PhotoMeta>) => encodeURIComponent(JSON.stringify({ ...base, ...meta }));

async function send(meta: Partial<PhotoMeta>, now = NOW, body: Uint8Array = JPEG, metaHeader?: string) {
  const req = new Request('https://x/api/photos', {
    method: 'POST', body,
    headers: { 'X-Foto-Meta': metaHeader ?? metaOf(meta), 'Content-Length': String(body.byteLength) },
  });
  return call(req, now);
}

async function call(req: Request, now = NOW) {
  const ctx = createExecutionContext();
  const res = await handleUpload(req, env as Env, ctx, now);
  await waitOnExecutionContext(ctx);
  return { status: res.status, body: await res.json<Record<string, string>>() };
}

const rows = async () =>
  (await env.DB.prepare('SELECT * FROM photos ORDER BY id').all<Record<string, any>>()).results;
const inR2 = async (kode: string) => (await env.PHOTOS.head(`foto/${kode}.jpg`)) !== null;

beforeEach(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM photos'), env.DB.prepare('DELETE FROM units'), env.DB.prepare('DELETE FROM periods'),
    env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (1,'Des/2026',1,9e15)"),
    env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after,purged_at) VALUES (2,'Nov/2026',1,1,5)"),
    env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (1,1,'DT 4464','PT A','K','DT','2027-01-01','W1','Belum Diajukan')"),
    env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (2,2,'DT 9','PT A','K','DT','2027-01-01','W1','Belum Diajukan')"),
  ]);
  const list = await env.PHOTOS.list();
  if (list.objects.length) await env.PHOTOS.delete(list.objects.map((o) => o.key));
});

describe('upload', () => {
  it('foto pertama → dipakai, berkas ada di R2', async () => {
    expect(await send({})).toEqual({ status: 200, body: { result: 'dipakai' } });
    expect(await inR2('AAAA-0001')).toBe(true);
    const [r] = await rows();
    expect(r).toMatchObject({
      unit_id: 1, sisi: 'kanan', kode_foto: 'AAAA-0001', r2_key: 'foto/AAAA-0001.jpg', received_at_server: NOW,
      clock_offset_s: 0, mekanik_nama: 'Budi', mekanik_nrp: '123', flags: '', lat: -1.2, address: 'Jl. Tes',
    });
    expect(await env.PHOTOS.head('snapshot.json')).not.toBeNull();
  });

  it('kode sama, unit+sisi+jam sama → duplikat', async () => {
    await send({});
    expect(await send({})).toEqual({ status: 200, body: { result: 'duplikat' } });
    expect(await rows()).toHaveLength(1);
    expect(await inR2('AAAA-0001')).toBe(true);
  });

  it('kode sama, isi beda → 409 kode_bentrok', async () => {
    await send({});
    expect(await send({ sisi: 'depan' })).toEqual({ status: 409, body: { error: 'kode_bentrok' } });
    expect(await send({ capturedAt: base.capturedAt + 1 })).toEqual({ status: 409, body: { error: 'kode_bentrok' } });
  });

  it('unit tidak ada → 422 unit_tidak_berlaku', async () => {
    expect(await send({ unitId: 999 })).toEqual({ status: 422, body: { error: 'unit_tidak_berlaku' } });
    expect(await inR2('AAAA-0001')).toBe(false);
  });

  it('periode sudah dihapus → 422 unit_tidak_berlaku', async () => {
    expect(await send({ unitId: 2 })).toEqual({ status: 422, body: { error: 'unit_tidak_berlaku' } });
  });

  it('jepret lewat expired → 422 lewat_expired', async () => {
    const now = WITA('2027-01-02T00:00:01');
    expect(await send({ capturedAt: now, deviceNow: now }, now)).toEqual({ status: 422, body: { error: 'lewat_expired' } });
    expect(await inR2('AAAA-0001')).toBe(false);
  });

  it('jepret sebelum expired, terkirim sesudahnya → diterima', async () => {
    const now = WITA('2027-01-03T00:00:00');
    expect(await send({ capturedAt: WITA('2027-01-01T23:00:00'), deviceNow: now }, now))
      .toEqual({ status: 200, body: { result: 'dipakai' } });
  });

  it('jam HP salah 10 menit → flag jam, t_koreksi dipakai', async () => {
    await send({ deviceNow: NOW - 600_000 });
    const [r] = await rows();
    expect(r.flags.split(',')).toContain('jam');
    expect(r.captured_at_corrected).toBe(base.capturedAt + 600_000);
    expect(r.captured_at_device).toBe(base.capturedAt);
    expect(r.clock_offset_s).toBe(600);
  });

  it('foto lebih baru menang, berkas lama dihapus', async () => {
    await send({});
    expect(await send({ kode: 'BBBB-0002', capturedAt: WITA('2026-12-01T10:00:00') }))
      .toEqual({ status: 200, body: { result: 'dipakai' } });
    expect((await rows()).map((r) => r.kode_foto)).toEqual(['BBBB-0002']);
    expect(await inR2('AAAA-0001')).toBe(false);
    expect(await inR2('BBBB-0002')).toBe(true);
  });

  it('foto lebih lama → lebih_baru_ada, berkas baru dihapus', async () => {
    await send({ kode: 'BBBB-0002', capturedAt: WITA('2026-12-01T10:00:00') });
    expect(await send({})).toEqual({ status: 200, body: { result: 'lebih_baru_ada' } });
    expect((await rows()).map((r) => r.kode_foto)).toEqual(['BBBB-0002']);
    expect(await inR2('AAAA-0001')).toBe(false);
    expect(await inR2('BBBB-0002')).toBe(true);
  });

  it('jam sama → foto lama dipertahankan', async () => {
    await send({});
    expect(await send({ kode: 'BBBB-0002' })).toEqual({ status: 200, body: { result: 'lebih_baru_ada' } });
    expect((await rows()).map((r) => r.kode_foto)).toEqual(['AAAA-0001']);
    expect(await inR2('AAAA-0001')).toBe(true);
    expect(await inR2('BBBB-0002')).toBe(false);
  });

  it('kiriman ganda bersamaan tidak menghapus foto aktif', async () => {
    const res = await Promise.all([send({}), send({})]);
    for (const r of res) expect(r.status).toBe(200);
    expect(res.map((r) => r.body.result).sort()).toEqual(['dipakai', 'duplikat']);
    expect(await rows()).toHaveLength(1);
    expect(await inR2('AAAA-0001')).toBe(true);
  });

  it('tanpa GPS → flag gps', async () => {
    await send({ lat: null, lon: null, accuracy: null, address: null });
    expect((await rows())[0].flags).toBe('gps');
  });

  it('bukan JPEG / > 2 MB / sisi salah / nama kosong → 400 invalid', async () => {
    const big = new Uint8Array(2_097_153);
    big.set(JPEG);
    const bad = [
      await send({}, NOW, new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
      await send({}, NOW, big),
      await send({ sisi: 'atas' as never }),
      await send({ nama: ' ' }),
      await send({ nrp: 'x'.repeat(61) }),
      await send({ kode: 'aaaa-0001' }),
      await send({ capturedAt: NaN }),
      await send({}, NOW, JPEG, '%%%'),
    ];
    for (const r of bad) expect(r).toEqual({ status: 400, body: { error: 'invalid' } });
    expect(await rows()).toHaveLength(0);
  });

  it('jepret di masa depan menurut jam HP sendiri → diterima, flag jam, t_koreksi ≤ now', async () => {
    expect(await send({ capturedAt: NOW + 86_400_000 })).toEqual({ status: 200, body: { result: 'dipakai' } });
    const [r] = await rows();
    expect(r.flags.split(',')).toContain('jam');
    expect(r.captured_at_corrected).toBeLessThanOrEqual(NOW);
    // Foto yang benar-benar dijepret lebih akhir tetap menang.
    const later = NOW + 60_000;
    expect(await send({ kode: 'BBBB-0002', capturedAt: later, deviceNow: later }, later))
      .toEqual({ status: 200, body: { result: 'dipakai' } });
    expect((await rows()).map((x) => x.kode_foto)).toEqual(['BBBB-0002']);
  });

  it('tanpa Content-Length / tidak numerik → 411 invalid', async () => {
    const stream = () => new ReadableStream({ start(c) { c.enqueue(JPEG); c.close(); } });
    const noLen = new Request('https://x/api/photos', { method: 'POST', body: stream(), headers: { 'X-Foto-Meta': metaOf({}) } });
    expect(noLen.headers.get('content-length')).toBeNull();
    expect(await call(noLen)).toEqual({ status: 411, body: { error: 'invalid' } });
    const bad = new Request('https://x/api/photos', {
      method: 'POST', body: JPEG, headers: { 'X-Foto-Meta': metaOf({}), 'Content-Length': 'abc' },
    });
    expect(await call(bad)).toEqual({ status: 411, body: { error: 'invalid' } });
    expect(await rows()).toHaveLength(0);
  });

  it('POST /api/photos dirutekan', async () => {
    const res = await SELF.fetch('https://x/api/photos', { method: 'POST', body: 'x' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid' });
  });
});
