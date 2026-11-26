import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { boardView, sidesDone, type BoardFilter, type StatusFilter } from '../lib/board';
import { useQueueCount } from '../lib/useQueueCount';
import { useSnapshot } from '../lib/snapshot';
import { navigate } from '../router';
import { Count } from '../ui/Count';
import { InstallGuide } from './InstallGuide';
import { jam, UnitSheet } from './UnitSheet';
import '../styles/papan.css';

const SEMUA: BoardFilter = { status: 'semua', week: null, q: '' };
const STATUS: [StatusFilter, string][] = [['semua', 'Semua'], ['belum', 'Belum'], ['sudah', 'Sudah']];
const SKELETON = [6, 9, 4];

const link = (to: string) => ({
  href: to,
  onClick: (e: MouseEvent) => { if (!e.metaKey && !e.ctrlKey) { e.preventDefault(); navigate(to); } },
});

// Kedaluwarsa hanya berubah per menit: boardView tidak perlu dihitung ulang tiap detik.
function useMinute() {
  const [m, setM] = useState(() => Math.floor(Date.now() / 60_000));
  useEffect(() => {
    const t = setInterval(() => setM(Math.floor(Date.now() / 60_000)), 15_000);
    return () => clearInterval(t);
  }, []);
  return m;
}

export default function Papan() {
  const { data, stale } = useSnapshot();
  const queue = useQueueCount();
  const minute = useMinute();
  const [f, setF] = useState(SEMUA);
  const [pickId, setPickId] = useState<number | null>(null);
  const view = useMemo(() => (data ? boardView(data, f, minute * 60_000) : null), [data, f, minute]);
  const set = (p: Partial<BoardFilter>) => setF((o) => ({ ...o, ...p }));

  // Denyut hanya untuk stiker yang jumlah sisinya berubah sejak snapshot sebelumnya; render pertama tidak.
  const prev = useRef<Map<number, number> | null>(null);
  const changed = useMemo(() => {
    if (!data) return new Set<number>();
    const was = prev.current;
    prev.current = new Map(data.units.map((u) => [u.id, sidesDone(u)]));
    return new Set(was ? data.units.filter((u) => was.has(u.id) && was.get(u.id) !== sidesDone(u)).map((u) => u.id) : []);
  }, [data]);

  const pick = pickId === null ? null : data?.units.find((u) => u.id === pickId) ?? null;

  return (
    <main className="papan">
      <header className="p-head">
        <div className="p-head-in">
          <div className="p-top">
            <h1 className="p-title cond">Komisioning Section Support</h1>
            <nav className="p-links" aria-label="Pintasan papan">
              {queue > 0 && <a className="p-link p-link-q press" {...link('/antrean')}>Antrean · {queue}</a>}
              <a className="p-link press" {...link('/cek')}>Cek kode</a>
            </nav>
          </div>
          {!view ? (
            // Tinggi skor dan baris data dipesan selama memuat supaya papan tidak melompat (CLS).
            <><p className="p-score" aria-hidden="true"><span className="p-x cond">&nbsp;</span></p><p className="p-meta" aria-hidden="true">&nbsp;</p></>
          ) : (
            <>
              <p className="p-score">
                <span className="p-x cond"><Count value={view.lengkap} /></span>{' '}
                <span className="p-of">dari <Count value={view.total} /> lengkap · <em><Count value={view.belum} /> belum</em></span>
              </p>
              <p className="p-meta">
                {view.periods.length > 0 && `Periode ${view.periods.join(' + ')} · `}<span>Data {jam.format(data!.version)}</span>
                {stale && <> · <span className="p-off">offline</span></>}
              </p>
            </>
          )}
        </div>
        <div className="hazard" aria-hidden="true" />
      </header>

      {!view && stale ? (
        <p className="p-empty" role="alert">Belum bisa memuat data. Periksa sinyal, nanti dicoba lagi otomatis.</p>
      ) : view?.total === 0 ? (
        <p className="p-empty">Belum ada data unit. Admin perlu mengunggah Excel SHE.</p>
      ) : (
        <div className="p-body">
          <div className="p-bar">
            <div className="p-seg" role="group" aria-label="Status unit">
              {STATUS.map(([k, label]) => (
                <button key={k} type="button" className="chip press" aria-pressed={f.status === k} onClick={() => set({ status: k })}>{label}</button>
              ))}
            </div>
            <span className="p-sel">
              <select aria-label="Week" value={view?.week ?? ''} onChange={(e) => set({ week: e.target.value || null })}>
                <option value="">Semua week</option>
                {view?.weeks.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}
              </select>
            </span>
            <input
              type="search" className="p-search" placeholder="Cari no lambung" aria-label="Cari no lambung"
              value={f.q} onChange={(e) => set({ q: e.target.value })}
              autoCapitalize="none" autoCorrect="off" autoComplete="off" spellCheck={false} enterKeyHint="search"
            />
          </div>

          {!view ? (
            // Memuat pertama tanpa cache: kerangka statis. Bar filter sudah tampil supaya grup tidak melompat.
            <div className="p-groups">
              <p className="sr-only" role="status">Memuat papan…</p>
              {SKELETON.map((n, i) => (
                <section key={i} className="p-grp p-skel" aria-hidden="true">
                  <div className="p-gh"><i /></div>
                  <div className="p-stickers">{Array.from({ length: n }, (_, j) => <i key={j} />)}</div>
                </section>
              ))}
            </div>
          ) : view.groups.length === 0 ? (
            <div className="p-none">
              <p>Tidak ada unit yang cocok.</p>
              <button type="button" className="btn-2 press" onClick={() => setF(SEMUA)}>Hapus filter</button>
            </div>
          ) : (
            <div className="p-groups">
              {view.groups.map((g) => (
                <section key={g.jenis} className="p-grp">
                  <h2 className="p-gh"><span className="cond">{g.jenis}</span><span className="p-gn">{g.lengkap}/{g.total} lengkap</span></h2>
                  <div className="p-stickers">
                    {g.units.map((u) => {
                      const n = sidesDone(u);
                      return (
                        <button
                          key={u.id} type="button"
                          className={`sticker press${changed.has(u.id) ? ' pulse' : ''}`}
                          data-s={n === 4 ? 'lengkap' : n > 0 ? 'sebagian' : 'belum'}
                          aria-label={`${u.no_lambung}, ${n} dari 4 sisi`}
                          onClick={() => setPickId(u.id)}
                          // Sekali saja: stiker yang dipasang ulang (ganti filter/cari) tanpa data baru tidak berdenyut lagi.
                          onAnimationEnd={() => changed.delete(u.id)}
                        >
                          <i aria-hidden="true" />
                          <span className="st-no">{u.no_lambung}</span>
                          {n > 0 && n < 4 && <span className="st-n">{n}/4</span>}
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      <UnitSheet unit={pick} now={minute * 60_000} onClose={() => setPickId(null)} />
      <InstallGuide />
    </main>
  );
}
