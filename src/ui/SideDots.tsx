import { SISI, type SnapUnit } from '../../shared/types';

// Status konsisten §7.1: Belum (oranye) · Sebagian (2×2: Depan Belakang / Kanan Kiri) · Lengkap (neon).
export function SideDots({ sides }: { sides: SnapUnit['sides'] }) {
  const n = SISI.filter((s) => sides[s]).length;
  if (n === 0) return <span className="badge badge-no">Belum</span>;
  if (n === 4) return <span className="badge badge-ok">Lengkap</span>;
  return (
    <span className="dots" role="img" aria-label={`Sebagian, ${n} dari 4 sisi`}>
      {SISI.map((s) => <i key={s} className={sides[s] ? 'on' : undefined} />)}
    </span>
  );
}
