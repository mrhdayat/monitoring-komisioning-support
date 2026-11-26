import { useCallback, useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { listQueue, processQueue, removeItem, unhold, type QueueItem } from '../lib/queue';
import { Sheet } from '../ui/Sheet';
import { Pill } from '../ui/Pill';
import { isIOS } from './InstallGuide';

const fmt = new Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', day: '2-digit', month: 'short', hourCycle: 'h23' });
// "08:05, 21 Nov" dalam WITA, apa pun zona HP.
function fmtJam(ms: number): string {
  const p = Object.fromEntries(fmt.formatToParts(ms).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}, ${p.day} ${p.month}`;
}

function Thumb({ item }: { item: QueueItem }) {
  const [url, setUrl] = useState<string>();
  const blob = item.final ?? item.raw;
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return <span className="q-thumb">{url && <img src={url} alt="" loading="lazy" decoding="async" />}</span>;
}

function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    addEventListener('online', up); addEventListener('offline', down);
    return () => { removeEventListener('online', up); removeEventListener('offline', down); };
  }, []);
  return on;
}

export default function Antrean() {
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [runNotices, setRunNotices] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [del, setDel] = useState<QueueItem | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const online = useOnline();

  const load = useCallback(async () => {
    const [q, n] = await Promise.all([listQueue(), get<string[]>('notices')]);
    setItems(q); setSaved(n ?? []);
  }, []);

  useEffect(() => {
    const bc = new BroadcastChannel('antrean');
    bc.onmessage = (e) => { if (e.data === 'queue-changed') load(); };
    load();
    return () => bc.close();
  }, [load]);

  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  async function send() {
    setRunning(true); setRunNotices([]);
    try {
      const r = await processQueue({ render: true });
      if (alive.current) setRunNotices(r.notices);
    } finally {
      if (alive.current) setRunning(false);
      load();
    }
  }
  async function retry(kode: string) { await unhold(kode); send(); }
  async function confirmDelete() {
    if (!del) return;
    setDelOpen(false);
    await removeItem(del.kode);
  }

  const held = items?.filter((i) => i.held) ?? [];
  const waiting = items?.filter((i) => !i.held) ?? [];
  // run() sudah menyimpan notice putaran ini; di riwayat tampilkan hanya yang sebelumnya.
  const history = saved.slice(0, Math.max(0, saved.length - runNotices.length)).reverse();

  const status = (i: QueueItem) => (i.held ? i.error : running && !i.error ? 'Mengirim…' : i.error ?? 'Menunggu sinyal');
  const rows = (list: QueueItem[]) => (
    <ul className="grp-list">
      {list.map((i) => (
        <li key={i.kode} className="q-row">
          <Thumb item={i} />
          <span className="row-main">
            <span className="row-id">{i.noLambung}</span>
            <span className="row-sub">{i.sisi[0].toUpperCase() + i.sisi.slice(1)} · {fmtJam(i.capturedAt)}</span>
            <span className={`q-status${i.held || (i.error && i.error !== 'Menunggu sinyal') ? ' q-bad' : ''}`}>{status(i)}</span>
            {i.held && (
              <span className="q-acts">
                <button type="button" className="q-act press" onClick={() => retry(i.kode)} disabled={running || !online}>Coba kirim lagi</button>
                <button type="button" className="q-act q-danger press" onClick={() => { setDel(i); setDelOpen(true); }}>Hapus foto</button>
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <main className="s-page">
      <header className="p-head">
        <div className="p-head-in"><h1 className="cond p-title">Antrean</h1></div>
        <div className="hazard" />
      </header>
      <div className="s-body">
      {isIOS() && <p className="q-note">Di iPhone, foto terkirim saat app dibuka dengan sinyal.</p>}

      {runNotices.map((n) => <p key={n} className="q-info" role="status">{n}</p>)}

      {items && waiting.length > 0 && (
        <button type="button" className="btn press q-send" onClick={send} disabled={running || !online}>
          {running ? 'Mengirim…' : 'Kirim sekarang'}
        </button>
      )}
      {!online && waiting.length > 0 && <Pill tone="offline">Tidak ada sinyal. Foto dikirim otomatis saat tersambung.</Pill>}

      {items && items.length === 0 && <p className="empty">Semua foto sudah terkirim</p>}

      {waiting.length > 0 && <section className="grp"><h2 className="grp-h">Menunggu ({waiting.length})</h2>{rows(waiting)}</section>}
      {held.length > 0 && <section className="grp"><h2 className="grp-h">Perlu tindakan ({held.length})</h2>{rows(held)}</section>}

      {history.length > 0 && (
        <section className="grp">
          <h2 className="grp-h">Pemberitahuan sebelumnya</h2>
          <ul className="grp-list">{history.map((n, k) => <li key={k} className="q-hist">{n}</li>)}</ul>
          <button type="button" className="btn-plain press" onClick={async () => { await set('notices', []); load(); }}>Bersihkan</button>
        </section>
      )}

      </div>

      <Sheet open={delOpen} onClose={() => setDelOpen(false)} title="Hapus foto ini?">
        <div className="guide">
          <p className="guide-lead">Foto {del?.noLambung} sisi {del?.sisi} belum terkirim. Bila dihapus, foto hilang dari HP ini dan tidak bisa dikembalikan.</p>
          <button type="button" className="btn q-del press" onClick={confirmDelete}>Hapus foto</button>
          <button type="button" className="btn-plain press" onClick={() => setDelOpen(false)}>Batal</button>
        </div>
      </Sheet>
    </main>
  );
}
