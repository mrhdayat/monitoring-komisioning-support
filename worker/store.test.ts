import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { Env } from './http';
import { d1Store, fileName, getStore } from './store';

describe('d1Store', () => {
  const s = d1Store(env.DB);
  it('put → get mengembalikan byte yang sama, del menghapus', async () => {
    const id = await s.put({ name: 'a.jpg', periodId: 1, bytes: new Uint8Array([0xff, 0xd8, 0xff, 7]) });
    const r = await s.get(id);
    expect(r!.headers.get('content-type')).toBe('image/jpeg');
    expect([...new Uint8Array(await r!.arrayBuffer())]).toEqual([0xff, 0xd8, 0xff, 7]);
    await s.del([id]);
    expect(await s.get(id)).toBeNull();
    await s.del([]);
  });
  it('trashPeriod hanya menghapus berkas milik periode itu', async () => {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM photos'), env.DB.prepare('DELETE FROM units'), env.DB.prepare('DELETE FROM periods'),
      env.DB.prepare("INSERT INTO periods (id,label,uploaded_at,purge_after) VALUES (1,'A',1,1),(2,'B',1,1)"),
      env.DB.prepare("INSERT INTO units (id,period_id,no_lambung,perusahaan,kelompok_unit,jenis_unit,berlaku_akhir,week,status_she) VALUES (1,1,'x','p','k','j','2027-01-01','W1','Belum Diajukan'),(2,2,'y','p','k','j','2027-01-01','W1','Belum Diajukan')"),
    ]);
    const a = await s.put({ name: 'a', periodId: 1, bytes: new Uint8Array([1]) });
    const b = await s.put({ name: 'b', periodId: 2, bytes: new Uint8Array([2]) });
    for (const [u, k] of [[1, a], [2, b]] as const)
      await env.DB.prepare("INSERT INTO photos (unit_id,sisi,kode_foto,r2_key,captured_at_device,captured_at_corrected,received_at_server,clock_offset_s,mekanik_nama,mekanik_nrp) VALUES (?,'depan',?,?,1,1,1,0,'B','1')").bind(u, `K${u}`, k).run();
    await s.trashPeriod(1);
    expect(await s.get(a)).toBeNull();
    expect(await s.get(b)).not.toBeNull();
  });
});

describe('getStore / fileName', () => {
  it('STORAGE=drive tanpa Drive tersambung → null', async () => {
    expect(await getStore({ ...env, STORAGE: 'drive' } as Env)).toBeNull();
    expect(await getStore(env as Env)).not.toBeNull();
  });
  it('nama berkas membuang karakter terlarang', () => {
    expect(fileName('TL/01:x', 'kanan', 'AB-1')).toBe('TL-01-x_kanan_AB-1.jpg');
  });
});
