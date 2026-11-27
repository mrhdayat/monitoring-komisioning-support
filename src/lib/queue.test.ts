import { beforeEach, expect, test, vi } from 'vitest';
import { clear, get, set } from 'idb-keyval';
import { decide, enqueue, listQueue, processQueue, queueStore, type QueueItem } from './queue';
import { setMekanik } from './mekanik';

vi.mock('./watermark', () => ({
  watermarkText: (p: { kode: string }) => ({ kode: p.kode }),
  loadWatermarkFont: async () => {},
  renderWatermarked: async (raw: Blob, t: { kode: string }) => {
    const r = await raw.text();
    if (r === 'rusak') throw new Error('gambar rusak');
    return new Blob([`final ${t.kode}`], { type: r === 'png' ? 'image/png' : 'image/jpeg' });
  },
}));

const item = (over: Partial<QueueItem> = {}): QueueItem => ({
  kode: 'AAAA-0001', unitId: 7, noLambung: 'DT 4464', sisi: 'kanan',
  capturedAt: Date.UTC(2026, 10, 21, 1), lat: -3.4, lon: 115.1, accuracy: 8, address: 'Tapin',
  raw: new Blob(['raw'], { type: 'image/jpeg' }), final: new Blob(['final'], { type: 'image/jpeg' }), ...over,
});

// fetch tiruan: /api/photos dijawab dari daftar respons berurutan, /api/geocode selalu 'Jl. Hauling'
function mockFetch(...replies: [number, unknown][]) {
  const sent: { meta: Record<string, unknown>; body: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/geocode')) return Response.json({ address: 'Jl. Hauling' });
    const meta = JSON.parse(decodeURIComponent((init!.headers as Record<string, string>)['X-Foto-Meta']));
    sent.push({ meta, body: await (init!.body as Blob).text() });
    const [status, body] = replies.shift() ?? [200, { result: 'dipakai' }];
    if (status === 0) throw new TypeError('Failed to fetch');
    return Response.json(body, { status });
  }));
  return sent;
}

beforeEach(async () => {
  vi.unstubAllGlobals();
  await clear(queueStore);
  await clear();
  await setMekanik({ nama: 'Budi', nrp: '12345' });
});

test('enqueue: resolve hanya setelah item bisa dibaca', async () => {
  const it = item();
  await enqueue(it);
  expect((await listQueue()).map((i) => i.kode)).toEqual([it.kode]);
});

test('decide', () => {
  expect(decide(200, { result: 'lebih_baru_ada' })).toBe('hapus');
  expect(decide(200, {})).toBe('ulang');
  expect(decide(200, null)).toBe('ulang');
  expect(decide(409, {})).toBe('kode_baru');
  expect(decide(422, {})).toBe('tolak');
  expect(decide(400, { error: 'invalid' })).toBe('tahan');
  expect(decide(503, {})).toBe('ulang');
  expect(decide(0, null)).toBe('ulang');
});

test('processQueue: 200 menghapus, 503 menyisakan dan menghentikan sisa antrean', async () => {
  await enqueue(item({ kode: 'AAAA-0001', capturedAt: 1 }));
  await enqueue(item({ kode: 'AAAA-0002', capturedAt: 2 }));
  await enqueue(item({ kode: 'AAAA-0003', capturedAt: 3 }));
  const sent = mockFetch([200, { result: 'dipakai' }], [503, {}]);
  const r = await processQueue({ render: false });
  expect(r).toMatchObject({ sent: 1, left: 2 });
  expect(sent.map((s) => s.meta.kode)).toEqual(['AAAA-0001', 'AAAA-0002']); // AAAA-0003 tidak dicoba
  expect(sent[0].meta).toMatchObject({ unitId: 7, sisi: 'kanan', nama: 'Budi', nrp: '12345', address: 'Tapin' });
  expect(typeof sent[0].meta.deviceNow).toBe('number');
  const left = await listQueue();
  expect(left.map((i) => i.kode)).toEqual(['AAAA-0002', 'AAAA-0003']);
  expect(left[0].error).toBe('Penyimpanan foto belum siap. Foto aman di HP dan dikirim otomatis nanti.');
});

test('processQueue: jaringan putus menghentikan sisa antrean', async () => {
  await enqueue(item({ kode: 'AAAA-0001', capturedAt: 1 }));
  await enqueue(item({ kode: 'AAAA-0002', capturedAt: 2 }));
  const sent = mockFetch([0, null]);
  expect(await processQueue({ render: false })).toMatchObject({ sent: 0, left: 2 });
  expect(sent).toHaveLength(1);
});

test('processQueue: kode_bentrok → kode baru, final dirender ulang, item lama diganti', async () => {
  await enqueue(item({ kode: 'AAAA-0001', address: null }));
  const sent = mockFetch([409, { error: 'kode_bentrok' }], [200, { result: 'dipakai' }]);
  const r = await processQueue({ render: true });
  expect(r).toMatchObject({ sent: 1, left: 0 });
  expect(sent).toHaveLength(2);
  const baru = sent[1].meta.kode as string;
  expect(baru).not.toBe('AAAA-0001');
  expect(sent[1].body).toBe(`final ${baru}`);
  expect(sent[1].meta.address).toBe('Jl. Hauling');
});

test('processQueue: kode_bentrok tanpa render → item diganti, final kosong, tetap di antrean', async () => {
  await enqueue(item({ kode: 'AAAA-0001' }));
  mockFetch([409, { error: 'kode_bentrok' }]);
  expect(await processQueue({ render: false })).toMatchObject({ sent: 0, left: 1 });
  const [it] = await listQueue();
  expect(it.kode).not.toBe('AAAA-0001');
  expect(it.final).toBeNull();
  expect(await it.raw.text()).toBe('raw');
});

test('processQueue: render:true merender item tanpa final; render:false melewatinya', async () => {
  await enqueue(item({ kode: 'AAAA-0001', final: null, address: null }));
  const sent = mockFetch();
  expect(await processQueue({ render: false })).toMatchObject({ sent: 0, left: 1 });
  expect(sent).toHaveLength(0);
  expect(await processQueue({ render: true })).toMatchObject({ sent: 1, left: 0 });
  expect(sent[0].body).toBe('final AAAA-0001');
});

test('processQueue: notice "Sisi ini sudah punya foto yang lebih baru" untuk lebih_baru_ada', async () => {
  await enqueue(item({ kode: 'AAAA-0001', capturedAt: 1 }));
  await enqueue(item({ kode: 'AAAA-0002', capturedAt: 2 }));
  mockFetch([200, { result: 'lebih_baru_ada' }], [422, { error: 'lewat_expired' }]);
  const r = await processQueue({ render: false });
  expect(r).toEqual({
    sent: 1, left: 0,
    notices: ['Sisi ini sudah punya foto yang lebih baru', 'Foto DT 4464 sisi kanan ditolak: lewat tanggal expired'],
  });
  expect(await get('notices')).toEqual(r.notices);
});

test('processQueue: tanpa mekanik tidak mengirim apa pun', async () => {
  await clear();
  await enqueue(item());
  const sent = mockFetch();
  expect(await processQueue({ render: false })).toEqual({ sent: 0, left: 1, notices: [] });
  expect(sent).toHaveLength(0);
});

test('processQueue: 400 menyimpan item dengan pesan, lanjut ke item berikutnya', async () => {
  await enqueue(item({ kode: 'AAAA-0001', capturedAt: 1 }));
  await enqueue(item({ kode: 'AAAA-0002', capturedAt: 2 }));
  const sent = mockFetch([400, { error: 'invalid' }], [200, { result: 'dipakai' }]);
  expect(await processQueue({ render: false })).toEqual({ sent: 1, left: 1, notices: [] });
  expect(sent).toHaveLength(2);
  const [it] = await listQueue();
  expect(it.kode).toBe('AAAA-0001');
  expect(it.error).toBe('Data foto ditolak server, hubungi admin');
});

test('processQueue: render gagal atau hasil bukan JPEG → item disimpan, tidak dikirim', async () => {
  await enqueue(item({ kode: 'AAAA-0001', capturedAt: 1, final: null, raw: new Blob(['rusak']) }));
  await enqueue(item({ kode: 'AAAA-0002', capturedAt: 2, final: null, raw: new Blob(['png']) }));
  const sent = mockFetch();
  expect(await processQueue({ render: true })).toMatchObject({ sent: 0, left: 2 });
  expect(sent).toHaveLength(0);
  const q = await listQueue();
  expect(q.map((i) => [i.kode, i.final, i.held, i.error])).toEqual([
    ['AAAA-0001', null, true, 'Watermark gagal dibuat. Coba kirim lagi atau hapus foto ini.'],
    ['AAAA-0002', null, true, 'Watermark gagal dibuat. Coba kirim lagi atau hapus foto ini.'],
  ]);
});

test('processQueue: alamat dipotong 300 karakter', async () => {
  await enqueue(item({ address: 'x'.repeat(400) }));
  const sent = mockFetch();
  await processQueue({ render: false });
  expect(sent[0].meta.address).toBe('x'.repeat(300));
});

test('processQueue: dipanggil saat sedang berjalan → item baru ikut terkirim di janji yang sama', async () => {
  await enqueue(item({ kode: 'AAAA-0001', capturedAt: 1 }));
  const sent: string[] = [];
  let p2: Promise<unknown> | undefined;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(decodeURIComponent((init!.headers as Record<string, string>)['X-Foto-Meta'])).kode);
    if (!p2) {
      await enqueue(item({ kode: 'AAAA-0002', capturedAt: 2 }));
      p2 = processQueue({ render: false });
    }
    return Response.json({ result: 'dipakai' });
  }));
  const r = await processQueue({ render: false });
  expect(sent).toEqual(['AAAA-0001', 'AAAA-0002']);
  expect(r).toMatchObject({ sent: 2, left: 0 });
  expect(await p2).toEqual(r);
});

test('processQueue: item "held" (400) tidak dikirim ulang di putaran berikutnya; held dicabut → terkirim', async () => {
  await enqueue(item());
  const sent = mockFetch([400, { error: 'invalid' }]);
  await processQueue({ render: false });
  expect(sent).toHaveLength(1);
  expect((await listQueue())[0].held).toBe(true);
  expect(await processQueue({ render: false })).toEqual({ sent: 0, left: 1, notices: [] });
  expect(sent).toHaveLength(1);
  await set('AAAA-0001', { ...(await listQueue())[0], held: false, error: undefined }, queueStore);
  expect(await processQueue({ render: false })).toMatchObject({ sent: 1, left: 0 });
  expect(sent).toHaveLength(2);
});

test('processQueue: alamat 300 unit UTF-16 tidak memotong pasangan surrogat', async () => {
  await enqueue(item({ address: 'x'.repeat(299) + '😀😀' }));
  const sent = mockFetch();
  await processQueue({ render: false });
  expect(sent[0].meta.address).toBe('x'.repeat(299));
});

test('processQueue: render gagal menyiarkan perubahan', async () => {
  await enqueue(item({ final: null, raw: new Blob(['rusak']) }));
  mockFetch();
  const bc = new BroadcastChannel('antrean');
  let n = 0;
  bc.onmessage = () => n++;
  await processQueue({ render: true });
  await new Promise((r) => setTimeout(r, 20));
  bc.close();
  expect(n).toBe(1);
});
