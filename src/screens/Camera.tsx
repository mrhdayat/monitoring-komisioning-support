import { useEffect, useRef, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';
import { newKode } from '../../shared/kode';
import { isExpired } from '../../shared/rules';
import { SISI, type Sisi, type SnapUnit } from '../../shared/types';
import { grabFrame, nextSide, openCamera, shutterReason } from '../lib/camera';
import { fetchAddress, watchGps, type GpsStatus } from '../lib/geo';
import { getMekanik } from '../lib/mekanik';
import { fmtTanggal } from '../lib/board';
import { capAddress, enqueue, listQueue, processQueue } from '../lib/queue';
import { useSnapshot } from '../lib/snapshot';
import { loadWatermarkFont, renderWatermarked, watermarkText, type WatermarkText } from '../lib/watermark';
import { navigate, useRoute } from '../router';
import { Pill } from '../ui/Pill';
import { Sheet } from '../ui/Sheet';
import { isIOS } from './InstallGuide';

const LABEL: Record<Sisi, string> = { depan: 'Depan', belakang: 'Belakang', kanan: 'Kanan', kiri: 'Kiri' };
const leave = () => navigate('/', { replace: true });

export default function Camera() {
  const { params, query } = useRoute();
  const { data } = useSnapshot();
  const unit = data?.units.find((u) => u.id === Number(params.id));
  const q = query.get('sisi') as Sisi | null;

  // Sheet Unit di papan meminta nama + NRP sebelum ke sini; tautan langsung tanpa itu dikembalikan.
  useEffect(() => { getMekanik().then((m) => { if (!m) leave(); }); }, []);

  if (!data) return <main className="cam" />; // snapshot masih dibaca dari cache
  if (!unit) return <Refusal title="Unit tidak ditemukan" body="Unit ini tidak ada di daftar terbaru. Mungkin sudah diajukan ke SHE atau dihapus admin." />;
  if (isExpired(unit.berlaku_akhir, Date.now())) {
    return (
      <Refusal
        title={unit.no_lambung}
        lead="Unit ini sudah lewat tanggal expired"
        body={`Berlaku sampai ${fmtTanggal(unit.berlaku_akhir)}. Foto tidak bisa diambil lagi.`}
      />
    );
  }
  return <Kamera key={unit.id} unit={unit} initial={q && SISI.includes(q) ? q : null} />;
}

function Refusal({ title, lead, body }: { title: string; lead?: string; body: string }) {
  return (
    <main className="screen cam-refuse">
      <h1 className="large-title">{title}</h1>
      {lead && <h2>{lead}</h2>}
      <p>{body}</p>
      <button type="button" className="btn press" onClick={leave}>Kembali ke daftar</button>
    </main>
  );
}

type CamState = 'mulai' | 'live' | 'ditolak' | 'gagal';

function Kamera({ unit, initial }: { unit: SnapUnit; initial: Sisi | null }) {
  const root = useRef<HTMLElement>(null);
  const vf = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stepEl = useRef<Partial<Record<Sisi, HTMLButtonElement | null>>>({});
  const gps = useRef<ReturnType<typeof watchGps> | null>(null);
  const urls = useRef<string[]>([]);
  const reduce = useReducedMotion();

  const [cam, setCam] = useState<CamState>('mulai');
  const [help, setHelp] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('mencari');
  const [address, setAddress] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now);
  const [local, setLocal] = useState<Partial<Record<Sisi, string>>>({}); // thumbnail sisi yang ada di antrean HP ini
  const [last, setLast] = useState<string | null>(null);
  const [pick, setPick] = useState<Sisi | null>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<Sisi | null>(null);
  const [sheet, setSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const thumb = (s: Sisi) => local[s] ?? (unit.sides[s] ? `/api/photo/${unit.sides[s].kode}` : null);
  const done = (s: Sisi) => thumb(s) !== null;
  const sisi = pick ?? nextSide(done) ?? 'depan';
  const objUrl = (b: Blob) => { const u = URL.createObjectURL(b); urls.current.push(u); return u; };

  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  // Sisi yang dijepret offline belum ada di snapshot: ambil dari antrean supaya langkahnya tetap ✓.
  useEffect(() => {
    listQueue().then((items) => {
      const m: Partial<Record<Sisi, string>> = {};
      let l: string | null = null;
      for (const it of items) if (it.unitId === unit.id) l = m[it.sisi] = objUrl(it.final ?? it.raw); // urut capturedAt: terakhir menang
      setLocal((p) => ({ ...m, ...p }));
      setLast((p) => p ?? l);
    }).catch(() => {});
  }, [unit.id]);

  useEffect(() => {
    const m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const old = m?.content;
    if (m) m.content = '#000000';
    return () => { if (m && old) m.content = old; };
  }, []);

  useEffect(() => {
    const g = watchGps(setGpsStatus);
    gps.current = g;
    return () => g.stop();
  }, []);

  // Alamat untuk pratinjau saja (sekali per sesi); saat jepret alamat diminta ulang.
  const hasFix = typeof gpsStatus === 'object';
  useEffect(() => {
    const f = gps.current?.get();
    if (!hasFix || !f || !navigator.onLine) return;
    let live = true;
    fetchAddress(f.lat, f.lon).then((a) => { if (live && a) setAddress(capAddress(a)); });
    return () => { live = false; };
  }, [hasFix]);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  useEffect(() => {
    const t = setInterval(() => setNow((n) => (Math.floor(Date.now() / 60_000) === Math.floor(n / 60_000) ? n : Date.now())), 1000);
    return () => clearInterval(t);
  }, []);

  // Kamera hanya menyala saat layar terlihat; dimatikan saat app ke latar dan saat layar ditinggal.
  useEffect(() => {
    let stop: (() => void) | null = null;
    let opening = false;
    let alive = true;
    const start = async () => {
      if (stop || opening || document.visibilityState !== 'visible') return;
      opening = true;
      try {
        const s = await openCamera(video.current!);
        if (!alive || document.visibilityState !== 'visible') s();
        else { stop = s; setCam('live'); setHelp(false); }
      } catch (e) {
        if (!alive) return;
        const denied = (e as Error).name === 'NotAllowedError';
        setCam(denied ? 'ditolak' : 'gagal');
        setHelp(denied);
      } finally {
        opening = false;
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') { start(); return; }
      stop?.();
      stop = null;
      setCam((c) => (c === 'live' ? 'mulai' : c));
    };
    start();
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); stop?.(); };
  }, []);

  async function fly(url: string, s: Sisi) {
    const box = root.current, from = vf.current?.getBoundingClientRect(), to = stepEl.current[s]?.getBoundingClientRect();
    if (reduce || !box || !from || !to) return;
    const img = Object.assign(new Image(), { src: url, alt: '', className: 'cam-fly' });
    Object.assign(img.style, { left: `${from.left}px`, top: `${from.top}px`, width: `${from.width}px`, height: `${from.height}px` });
    await img.decode().catch(() => {});
    box.append(img);
    const k = (to.height - 12) / from.height; // mendarat setinggi pil
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    try {
      await animate(
        img,
        { transform: ['translate(0px, 0px) scale(1)', `translate(${dx}px, ${dy}px) scale(${k})`], opacity: [1, 0] },
        { type: 'spring', bounce: 0, duration: 0.45, opacity: { duration: 0.15, delay: 0.32 } },
      );
    } finally {
      img.remove();
    }
  }

  const reason = shutterReason(cam, busy, gpsStatus);

  async function shoot() {
    if (reason) return;
    setBusy(true);
    setError(null);
    const target = sisi;
    let url: string;
    try {
      const capturedAt = Date.now();
      const rawP = grabFrame(video.current!); // frame diambil seketika (drawImage sinkron)
      vf.current?.animate({ opacity: [0.3, 1] }, { duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      const raw = await rawP;
      const fix = gps.current?.get() ?? null;
      const lat = fix?.lat ?? null, lon = fix?.lon ?? null;
      const kode = newKode();
      let address: string | null = null;
      let final: Blob | null = null;
      if (navigator.onLine) {
        if (fix) { const a = await fetchAddress(fix.lat, fix.lon); address = a ? capAddress(a) : null; }
        // Ada GPS tapi alamat gagal (sinyal lemah): biarkan antrean merender nanti, setelah alamat didapat (§8).
        if (address || !fix) {
          try {
            await loadWatermarkFont();
            final = await renderWatermarked(raw, watermarkText({ capturedAt, sisi: target, lat, lon, address, kode }));
          } catch { final = null; }
        }
      }
      // Sheet "tersimpan" baru boleh muncul setelah foto benar-benar tertulis di IndexedDB.
      await enqueue({ kode, unitId: unit.id, noLambung: unit.no_lambung, sisi: target, capturedAt, lat, lon, accuracy: fix?.accuracy ?? null, address, raw, final });
      url = objUrl(final ?? raw);
    } catch {
      setError('Foto gagal disimpan. Coba jepret lagi.');
      setBusy(false);
      return;
    }
    // Foto sudah aman di IndexedDB: dari sini tidak ada yang boleh dilaporkan sebagai "gagal disimpan".
    navigator.vibrate?.(30);
    setPick(target);
    await fly(url, target).catch(() => {});
    setLocal((p) => ({ ...p, [target]: url }));
    setLast(url);
    setSaved(target);
    setSheet(true);
    setBusy(false);
    processQueue({ render: true }).catch(() => {});
  }

  const next = saved ? nextSide(done, saved) : null;
  const closeSheet = (to: Sisi | null) => { setPick(to ?? saved); setSheet(false); };
  const wm = watermarkText({ capturedAt: now, sisi, lat: hasFix ? gpsStatus.lat : null, lon: hasFix ? gpsStatus.lon : null, address, kode: '····-····' });
  if (gpsStatus === 'mencari') wm.alamat = ['Menunggu lokasi…'];

  return (
    <main ref={root} className="cam">
      {error && <Pill tone="warning">{error}</Pill>}
      <header className="cam-top">
        <button type="button" className="cam-x press" aria-label="Tutup kamera" onClick={leave}>
          <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17" /></svg></span>
        </button>
        <div className="cam-unit">
          <h1>{unit.no_lambung}</h1>
          <p>{unit.jenis_unit}</p>
        </div>
      </header>

      <nav className="cam-steps" aria-label="Sisi unit">
        {SISI.map((s) => (
          <button
            key={s} type="button" className="cam-step press"
            ref={(el) => { stepEl.current[s] = el; }}
            aria-current={s === sisi ? 'step' : undefined}
            data-done={done(s) || undefined}
            onClick={() => setPick(s)}
          >
            <span>
              {done(s) && <i className="cam-check" aria-hidden="true">✓</i>}
              {LABEL[s]}
              <span className="sr-only">{done(s) ? ', sudah difoto' : ', belum difoto'}</span>
            </span>
          </button>
        ))}
      </nav>

      <div className="cam-stage">
        <div ref={vf} className="cam-vf">
          <video ref={video} muted playsInline autoPlay aria-hidden="true" />
          {cam === 'live' && <Watermark t={wm} />}
          {cam === 'ditolak' && (
            <div className="cam-msg">
              <h2>Kamera belum diizinkan</h2>
              <p>Izinkan kamera untuk memotret unit.</p>
              <button type="button" className="btn press" onClick={() => setHelp(true)}>Cara mengizinkan</button>
            </div>
          )}
          {cam === 'gagal' && (
            <div className="cam-msg">
              <h2>Kamera tidak bisa dibuka</h2>
              <p>Tutup aplikasi lain yang sedang memakai kamera, lalu coba lagi.</p>
              <button type="button" className="btn press" onClick={() => location.reload()}>Coba lagi</button>
            </div>
          )}
        </div>
      </div>

      <div className="cam-bar">
        <span className="cam-last">{last && <img src={last} alt="Foto terakhir" />}</span>
        <button
          type="button" className="cam-shutter" onClick={shoot}
          aria-disabled={reason ? true : undefined} aria-busy={busy || undefined}
          aria-label={`Jepret foto sisi ${LABEL[sisi]}`} aria-describedby="cam-gps"
          title={reason ?? undefined}
        ><i /></button>
        <Gps s={gpsStatus} />
      </div>

      <Sheet open={sheet} onClose={() => closeSheet(next)} title={saved ? `Foto sisi ${LABEL[saved]} tersimpan` : undefined}>
        <p className="cam-sheet-sub">{SISI.filter(done).length} dari 4 sisi</p>
        <ul className="cam-thumbs">
          {SISI.map((s) => {
            const t = thumb(s);
            return (
              <li key={s} data-done={t ? true : undefined}>
                <span className="cam-tile">{t && <img src={t} alt="" onError={(e) => { e.currentTarget.hidden = true; }} />}</span>
                {t ? `✓ ${LABEL[s]}` : LABEL[s]}
              </li>
            );
          })}
        </ul>
        {next ? (
          <>
            <button type="button" className="btn press" onClick={() => closeSheet(next)}>Lanjut foto sisi {LABEL[next]}</button>
            <button type="button" className="btn-plain press" onClick={leave}>Nanti saja</button>
          </>
        ) : (
          <button type="button" className="btn press" onClick={leave}>Selesai</button>
        )}
      </Sheet>

      <Sheet open={help} onClose={() => setHelp(false)} title="Izinkan kamera">
        <div className="guide">
          <p className="guide-lead">Foto unit hanya bisa diambil langsung dari kamera.</p>
          <ol className="cam-howto">
            {isIOS() ? (
              <>
                <li>Buka <b>Pengaturan</b> di HP.</li>
                <li>Pilih <b>Safari</b> &rsaquo; <b>Kamera</b>, lalu <b>Izinkan</b>.</li>
                <li>Kembali ke sini dan ketuk <b>Coba lagi</b>.</li>
              </>
            ) : (
              <>
                <li>Ketuk ikon gembok di kiri bilah alamat Chrome.</li>
                <li>Pilih <b>Izin</b> &rsaquo; <b>Kamera</b>, lalu <b>Izinkan</b>.</li>
                <li>Ketuk <b>Coba lagi</b>.</li>
              </>
            )}
          </ol>
          <button type="button" className="btn press" onClick={() => location.reload()}>Coba lagi</button>
        </div>
      </Sheet>
    </main>
  );
}

// Tata letak meniru renderWatermarked (ukuran relatif lebar foto → cqw), jadi pratinjau = hasil.
function Watermark({ t }: { t: WatermarkText }) {
  return (
    <div className="wm" aria-hidden="true">
      <span className="wm-label">{t.label}</span>
      <div className="wm-row">
        <span className="wm-jam">{t.jam}</span>
        <i className="wm-bar" />
        <span className="wm-d">{t.tanggal}<br />{t.hari}</span>
      </div>
      {t.alamat.map((l) => <div key={l} className="wm-a">{l}</div>)}
      <div className="wm-c">{t.baris}</div>
    </div>
  );
}

function Gps({ s }: { s: GpsStatus }) {
  // id dipakai aria-describedby tombol jepret: pembaca layar ikut tahu kenapa tombol ditahan.
  if (s === 'mencari') return <span id="cam-gps" className="cam-gps">Menunggu lokasi…</span>;
  if (s === 'tidak') return <span id="cam-gps" className="cam-gps cam-gps-off">Lokasi tidak tersedia</span>;
  return <span id="cam-gps" className="cam-gps cam-gps-on">GPS<br />± {s.accuracy} m</span>;
}
