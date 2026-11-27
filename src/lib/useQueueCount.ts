import { useEffect, useState } from 'react';
import { keys } from 'idb-keyval';
import { queueStore } from './queue';

// Terpisah dari queue.ts supaya React tidak ikut ke bundle service worker.
export function useQueueCount(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const load = () => keys(queueStore).then((k) => setN(k.length));
    const bc = new BroadcastChannel('antrean');
    bc.onmessage = (e) => { if (e.data === 'queue-changed') load(); };
    load();
    return () => bc.close();
  }, []);
  return n;
}
