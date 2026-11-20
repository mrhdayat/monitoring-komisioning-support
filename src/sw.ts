import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { listQueue, processQueue } from './lib/queue';

// tsconfig app memakai lib DOM (bukan WebWorker), jadi bagian SW yang dipakai diketik di sini.
type SyncEvent = Event & { tag: string; waitUntil(p: Promise<unknown>): void };
declare const self: {
  __WB_MANIFEST: (string | PrecacheEntry)[];
  skipWaiting(): Promise<void>;
  addEventListener(type: 'sync', listener: (e: SyncEvent) => void): void;
};

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
// Semua navigasi ke index.html, kecuali /api/* (tidak pernah di-cache; tidak ada route lain untuk /api).
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }));

self.addEventListener('sync', (e) => {
  if (e.tag !== 'antrean') return;
  // Gagal → browser menjadwalkan ulang sync. Item tanpa final menunggu halaman dibuka.
  e.waitUntil(processQueue({ render: false }).then(listQueue).then((q) => {
    if (q.some((i) => i.final)) throw new Error('masih ada foto siap kirim');
  }));
});
