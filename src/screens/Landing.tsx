import { useEffect, useMemo, useRef, useState } from 'react';
import { landingSummary } from '../../shared/rules';
import { useSnapshot } from '../lib/snapshot';
import { Count } from '../ui/Count';
import { SideDots } from '../ui/SideDots';
import { CekForm } from './CekForm';
import { fmtExp } from './UnitList';
import '../styles/landing.css';

const hm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const byWeek = (a: string, b: string) => a.localeCompare(b, 'id', { numeric: true });

function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  return now;
}

export default function Landing() {
  const { data, stale, updatedAt } = useSnapshot();
  const now = useNow();
  // Kedaluwarsa hanya berubah per menit; tiap detik hanya label "n detik lalu" yang berubah.
  const minute = Math.floor(now / 60_000);
  const sum = useMemo(() => (data ? landingSummary(data, minute * 60_000) : null), [data, minute]);
  const seen = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());

  // Muatan awal tidak dianimasikan; hanya kode yang baru muncul sesudahnya (kelas bertahan sampai data berikutnya).
  useEffect(() => {
    if (!data) return;
    const kodes = new Set(data.recent.map((r) => r.kode));
    if (seen.current) setFresh(new Set([...kodes].filter((k) => !seen.current!.has(k))));
    seen.current = kodes;
  }, [data]);

  const ago = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : null;
  const weeks = sum ? [...sum.perWeek].sort((a, b) => byWeek(a.week, b.week)) : [];

  return (
    <main className="land">
      <header className="l-head">
        <h1 className="l-title">Progres Komisioning</h1>
        <p className={`l-live${stale ? ' off' : ''}`} role="status">
          <i aria-hidden="true" />
          {stale
            ? `Terputus · data terakhir ${updatedAt ? hm.format(updatedAt) : '–'}`
            : ago === null ? 'Memuat…' : `Langsung · diperbarui ${ago} detik lalu`}
        </p>
      </header>

      {!sum ? <p className="empty">Memuat data…</p> : (
        <div className="l-grid">
          <div className="l-col">
          <section className="l-hero">
            <h2 className="l-k">Unit lengkap 4 sisi</h2>
            <p className="l-n"><Count value={sum.lengkap} /><small> / {sum.total}</small></p>
            <p className="l-c">{sum.belum > 0 ? <><b>{sum.belum} unit</b> masih menunggu foto.</> : 'Semua unit sudah lengkap.'}</p>
            <div className="l-strip" aria-hidden="true"><i style={{ transform: `scaleX(${sum.total ? sum.lengkap / sum.total : 0})` }} /></div>
          </section>

          <section className="l-tile">
            <h2 className="l-h">Progres per Week</h2>
            {weeks.length === 0 ? <p className="l-empty">Belum ada unit.</p> : (
              <ul className="l-weeks">
                {weeks.map((w) => (
                  <li key={w.week} className={w.lengkap === w.total ? 'full' : undefined}>
                    <span>{w.week}</span>
                    <span className="l-bar" role="img" aria-label={`${w.lengkap} dari ${w.total} unit lengkap`}>
                      <i style={{ transform: `scaleX(${w.total ? w.lengkap / w.total : 0})` }} />
                    </span>
                    <span className="l-nm">{w.lengkap}/{w.total}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          </div>
          <div className="l-col">
          <section className="l-tile">
            <h2 className="l-h">Foto terbaru masuk</h2>
            {data!.recent.length === 0 ? <p className="l-empty">Belum ada foto masuk.</p> : (
              <ul className="l-feed">
                {data!.recent.map((r) => (
                  <li key={r.kode} className={fresh.has(r.kode) ? 'new' : undefined}>
                    <img src={`/api/photo/${r.kode}`} alt="" width={40} height={52} loading="lazy" decoding="async" />
                    <span className="l-u">{r.no_lambung}</span>
                    <span className="l-s">{r.sisi}</span>
                    <span className="l-tm">{hm.format(r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          </div>
          <div className="l-col">
          <section className="l-tile">
            <h2 className="l-h">Paling mendesak</h2>
            {sum.urgent.length === 0 ? <p className="l-empty">Tidak ada unit mendesak.</p> : (
              <ul className="l-urg">
                {sum.urgent.map((u) => (
                  <li key={u.id}>
                    <span className="l-u">{u.no_lambung}</span>
                    <span className="l-s">{u.jenis_unit}</span>
                    <span className="l-d">{fmtExp(u.berlaku_akhir)}</span>
                    <SideDots sides={u.sides} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="l-tile">
            <h2 className="l-h">Cek Kode Foto</h2>
            <CekForm />
          </section>
          </div>
        </div>
      )}
    </main>
  );
}
