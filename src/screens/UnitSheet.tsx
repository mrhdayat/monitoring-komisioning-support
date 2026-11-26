import { useState } from 'react';
import { expiryEndMs } from '../../shared/rules';
import { SISI, type Sisi, type SnapUnit } from '../../shared/types';
import { fmtTanggal, sidesDone } from '../lib/board';
import { getMekanik } from '../lib/mekanik';
import { navigate } from '../router';
import { Sheet } from '../ui/Sheet';
import { MekanikSheet } from './MekanikSheet';

// HH:MM WITA apa pun zona HP.
export const jam = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Makassar', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const LABEL: Record<Sisi, string> = { depan: 'Depan', belakang: 'Belakang', kanan: 'Kanan', kiri: 'Kiri' };

// Halaman publik: hanya no lambung, data unit, dan foto. Nama/NRP mekanik tidak pernah ada di snapshot.
export function UnitSheet({ unit, now, onClose }: { unit: SnapUnit | null; now: number; onClose: () => void }) {
  const [u, setU] = useState(unit); // isi tetap tampil selama sheet turun setelah unit = null
  const [wasOpen, setWasOpen] = useState(false);
  const [big, setBig] = useState<Sisi | null>(null);
  const [rusak, setRusak] = useState<ReadonlySet<string>>(new Set());
  const [ask, setAsk] = useState(false);
  if (unit && unit !== u) setU(unit);
  if (!!unit !== wasOpen) {
    setWasOpen(!!unit);
    if (unit) { setBig(null); setRusak(new Set()); } // dibuka lagi: foto yang gagal dicoba ulang
  }

  const done = u ? sidesDone(u) : 0;
  const sisa = u ? Math.ceil((expiryEndMs(u.berlaku_akhir) - now) / 86_400_000) : 0;
  const shot = big && u?.sides[big];
  async function go() {
    if (!u) return;
    if (await getMekanik()) navigate(`/unit/${u.id}/kamera`); else setAsk(true);
  }

  return (
    <>
      <Sheet open={!!unit} onClose={onClose} title={u?.no_lambung}>
        {u && (shot ? (
          <div className="us-big">
            <img src={`/api/photo/${shot.kode}`} alt={`Foto ${LABEL[big!]} ${u.no_lambung}`} decoding="async" />
            <p className="us-meta">{LABEL[big!]} · dijepret {jam.format(shot.at)} WITA</p>
            <button type="button" className="btn-2 press" onClick={() => setBig(null)} autoFocus>Kembali</button>
          </div>
        ) : (
          <>
            <p className="us-meta">{u.jenis_unit} · {u.perusahaan} · {u.week}</p>
            <p className="us-meta">
              Berlaku sampai {fmtTanggal(u.berlaku_akhir)} · <span className={sisa <= 7 ? 'urgent' : undefined}>sisa {sisa} hari</span>
            </p>
            <ul className="us-sides">
              {SISI.map((s) => {
                const side = u.sides[s];
                return (
                  <li key={s}>
                    {!side ? <span className="us-ph">Belum difoto</span>
                      : rusak.has(side.kode) ? <span className="us-ph">Foto belum bisa dimuat</span>
                      : (
                        <button type="button" className="us-ph press" aria-label={`Perbesar foto ${LABEL[s]}`} onClick={() => setBig(s)}>
                          <img
                            src={`/api/photo/${side.kode}`} alt="" loading="lazy" decoding="async"
                            onError={() => setRusak((r) => new Set(r).add(side.kode))}
                          />
                        </button>
                      )}
                    <span className="us-side"><b>{LABEL[s]}</b>{side && <span>{jam.format(side.at)}</span>}</span>
                  </li>
                );
              })}
            </ul>
            {done < 4
              ? <button type="button" className="btn press" onClick={go}>Foto sisi yang kurang</button>
              : <button type="button" className="btn-2 press" onClick={go}>Foto ulang</button>}
          </>
        ))}
      </Sheet>
      <MekanikSheet open={ask} onClose={() => setAsk(false)} onSaved={() => { if (u) navigate(`/unit/${u.id}/kamera`); }} />
    </>
  );
}
