import { beforeEach, expect, test, vi } from 'vitest';
import { clear, get } from 'idb-keyval';
import { decide, enqueue, listQueue, processQueue, queueStore, type QueueItem } from './queue';
import { setMekanik } from './mekanik';

vi.mock('./watermark', () => ({
  watermarkText: (p: { kode: string }) => ({ kode: p.kode }),
  loadWatermarkFont: async () => {},
  renderWatermarked: async (_raw: Blob, t: { kode: string }) => new Blob([`final ${t.kode}`], { type: 'image/jpeg' }),
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
  expect(decide(409, {})).toBe('kode_baru');
  expect(decide(422, {})).toBe('tolak');
  expect(decide(400, { error: 'invalid' })).toBe('tolak');
  expect(decide(503, {})).toBe('ulang');
  expect(decide(0, null)).toBe('ulang');
});

test('processQueue: 200 menghapus, 503 menyisakan', async () => {
  await enqueue(item({ kode: 'AAAA-0001', capturedAt: 1 }));
  await enqueue(item({ kode: 'AAAA-0002', capturedAt: 2 }));
  const sent = mockFetch([200, { result: 'dipakai' }], [503, {}]);
  const r = await processQueue({ render: false });
  expect(r).toMatchObject({ sent: 1, left: 1 });
  expect(sent.map((s) => s.meta.kode)).toEqual(['AAAA-0001', 'AAAA-0002']);
  expect(sent[0].meta).toMatchObject({ unitId: 7, sisi: 'kanan', nama: 'Budi', nrp: '12345', address: 'Tapin' });
  expect(typeof sent[0].meta.deviceNow).toBe('number');
  const left = await listQueue();
  expect(left.map((i) => i.kode)).toEqual(['AAAA-0002']);
  expect(left[0].error).toBeTruthy();
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
