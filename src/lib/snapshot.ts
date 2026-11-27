import { useSyncExternalStore } from 'react';
import { get, setMany } from 'idb-keyval';
import type { Snapshot } from '../../shared/types';

export interface SnapshotState { data: Snapshot | null; stale: boolean; updatedAt: number | null }

const POLL_MS = 15_000;
// Satu salinan untuk seluruh app: banyak komponen memakai hook, polling tetap satu.
let state: SnapshotState = { data: null, stale: false, updatedAt: null };
let etag: string | null = null;
let failed = false;
let inflight = false;
const subs = new Set<() => void>();

function patch(p: Partial<Omit<SnapshotState, 'stale'>>) {
  const stale = failed || !navigator.onLine;
  const next = { ...state, ...p, stale };
  if (next.data === state.data && next.stale === state.stale && next.updatedAt === state.updatedAt) return;
  state = next;
  subs.forEach((f) => f());
}

async function refresh() {
  if (inflight || !navigator.onLine) return patch({});
  inflight = true;
  try {
    // Tanpa data di memori, jangan kirim ETag: 304 tidak ada isinya.
    const r = await fetch('/api/snapshot', { headers: state.data && etag ? { 'If-None-Match': etag } : {} });
    const now = Date.now();
    if (r.status === 200) {
      const data = (await r.json()) as Snapshot;
      etag = r.headers.get('ETag');
      failed = false;
      patch({ data, updatedAt: now });
      await setMany([['snapshot', data], ['snapshot-meta', { etag, updatedAt: now }]]);
    } else if (r.status === 304) {
      failed = false;
      patch({ updatedAt: now });
      await setMany([['snapshot-meta', { etag, updatedAt: now }]]);
    } else failed = true;
  } catch {
    failed = true;
  } finally {
    inflight = false;
    patch({});
  }
}

const tick = () => { if (document.visibilityState === 'visible') refresh(); };
const onOnline = () => { refresh(); };
const onOffline = () => patch({});

let timer = 0;
function start() {
  addEventListener('online', onOnline);
  addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', tick);
  timer = window.setInterval(tick, POLL_MS);
  // Cache dulu (offline-first), lalu jaringan.
  Promise.all([get<Snapshot>('snapshot'), get<{ etag: string | null; updatedAt: number }>('snapshot-meta')])
    .then(([data, meta]) => {
      if (data && !state.data) { etag = meta?.etag ?? null; patch({ data, updatedAt: meta?.updatedAt ?? null }); }
    })
    .catch(() => {})
    .then(tick);
}
function stop() {
  removeEventListener('online', onOnline);
  removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', tick);
  clearInterval(timer);
}

function subscribe(cb: () => void) {
  subs.add(cb);
  if (subs.size === 1) start();
  return () => { subs.delete(cb); if (subs.size === 0) stop(); };
}

export const useSnapshot = (): SnapshotState => useSyncExternalStore(subscribe, () => state);
