import { createStore, del, keys, promisifyRequest, set, update, values } from 'idb-keyval';
import type { Sisi } from '../../shared/types';
import { newKode } from '../../shared/kode';
import { postPhoto } from './api';
import { getMekanik } from './mekanik';

// Dipakai juga oleh service worker: jangan impor React atau kode DOM/canvas secara statis di sini.

export interface QueueItem {
  kode: string; unitId: number; noLambung: string; sisi: Sisi;
  capturedAt: number; lat: number | null; lon: number | null; accuracy: number | null; address: string | null;
  raw: Blob; final: Blob | null; error?: string;
}
type Hasil = { sent: number; left: number; notices: string[] };

export const queueStore = createStore('antrean', 'items');

export function changed() {
  const bc = new BroadcastChannel('antrean');
  bc.postMessage('queue-changed');
  bc.close();
}

let persistAsked = false;
export async function enqueue(item: QueueItem): Promise<void> {
  await set(item.kode, item, queueStore); // resolve setelah transaksi selesai (oncomplete)
  changed();
  if (!persistAsked) { persistAsked = true; navigator.storage?.persist?.().catch(() => {}); }
  navigator.serviceWorker?.ready
    .then((r) => (r as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync?.register('antrean'))
    .catch(() => {});
}

export const listQueue = async (): Promise<QueueItem[]> =>
  (await values<QueueItem>(queueStore)).sort((a, b) => a.capturedAt - b.capturedAt);

export async function removeItem(kode: string): Promise<void> {
  await del(kode, queueStore);
  changed();
}

export function decide(status: number, _body: unknown): 'hapus' | 'ulang' | 'kode_baru' | 'tolak' {
  if (status === 200) return 'hapus';
  if (status === 409) return 'kode_baru';
  if (status === 422 || status === 400) return 'tolak';
  return 'ulang'; // jaringan (0), 5xx, dan kode lain: simpan, jangan pernah buang foto
}

const ALASAN: Record<string, string> = {
  lewat_expired: 'lewat tanggal expired', unit_tidak_berlaku: 'unit tidak berlaku', invalid: 'data tidak valid',
};

// undefined = jaringan putus (tunggu sinyal); null = alamat tidak didapat (pakai koordinat saja).
async function geocode(lat: number, lon: number): Promise<string | null | undefined> {
  try {
    const r = await fetch(`/api/geocode?lat=${lat}&lon=${lon}`, { signal: AbortSignal.timeout(3000) });
    return r.ok ? ((await r.json()) as { address: string | null }).address : null;
  } catch (e) {
    return (e as Error).name === 'TimeoutError' ? null : undefined;
  }
}

async function run(render: boolean): Promise<Hasil> {
  const m = await getMekanik();
  const items = await listQueue();
  const notices: string[] = [];
  let sent = 0;
  if (!m) return { sent, left: items.length, notices };

  for (let it of items) { // items bisa bertambah saat kode_baru
    if (!it.final) {
      if (!render) continue; // service worker: render ditinggal untuk halaman
      let address = it.address;
      if (address === null && it.lat !== null && it.lon !== null) {
        const a = await geocode(it.lat, it.lon);
        if (a === undefined) { await set(it.kode, { ...it, error: 'Menunggu sinyal' }, queueStore); break; }
        address = a;
      }
      try {
        const wm = await import('./watermark');
        await wm.loadWatermarkFont();
        it = { ...it, address, final: await wm.renderWatermarked(it.raw, wm.watermarkText({ ...it, address })) };
      } catch {
        await set(it.kode, { ...it, error: 'Gagal membuat watermark' }, queueStore);
        continue;
      }
      await set(it.kode, it, queueStore);
    }

    const r = await postPhoto(it.final!, {
      kode: it.kode, unitId: it.unitId, sisi: it.sisi, capturedAt: it.capturedAt, deviceNow: Date.now(),
      lat: it.lat, lon: it.lon, accuracy: it.accuracy, address: it.address, nama: m.nama, nrp: m.nrp,
    });
    const body = r.body as { result?: string; error?: string } | null;
    const d = decide(r.status, r.body);
    if (d === 'hapus' || d === 'tolak') {
      await del(it.kode, queueStore);
      if (d === 'hapus') sent++;
      if (d === 'tolak') notices.push(`Foto ${it.noLambung} sisi ${it.sisi} ditolak: ${ALASAN[body?.error ?? ''] ?? ALASAN.invalid}`);
      else if (body?.result === 'lebih_baru_ada') notices.push('Sisi ini sudah punya foto yang lebih baru');
    } else if (d === 'kode_baru') {
      // Kode baru → watermark harus dirender ulang. Tulis item baru dan hapus yang lama dalam satu transaksi.
      const next: QueueItem = { ...it, kode: newKode(), final: null, error: undefined };
      const old = it.kode;
      await queueStore('readwrite', (s) => { s.put(next, next.kode); s.delete(old); return promisifyRequest(s.transaction); });
      items.push(next);
    } else {
      await set(it.kode, { ...it, error: r.status ? `Server bermasalah (${r.status})` : 'Menunggu sinyal' }, queueStore);
      if (!r.status) break; // offline: sisa antrean pasti gagal juga
    }
    changed();
  }

  if (notices.length) await update<string[]>('notices', (old = []) => [...old, ...notices].slice(-20));
  return { sent, left: (await keys(queueStore)).length, notices };
}

let running: Promise<Hasil> | null = null;
// Satu proses per konteks; halaman dan service worker boleh balapan karena server idempoten per Kode Foto.
export function processQueue(opts: { render: boolean }): Promise<Hasil> {
  return (running ??= run(opts.render).finally(() => { running = null; }));
}
