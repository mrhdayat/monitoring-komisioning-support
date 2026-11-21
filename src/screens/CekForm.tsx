import { useId, useState } from 'react';
import { normalizeKode } from '../../shared/kode';
import { navigate } from '../router';

// Dipakai landing dan layar Cek; pasang key={initial} bila nilai awal bisa berganti.
export function CekForm({ initial = '', replace = false }: { initial?: string; replace?: boolean }) {
  const [v, setV] = useState(initial);
  const [err, setErr] = useState(Boolean(initial) && !normalizeKode(initial));
  const errId = useId();
  return (
    <form className="l-cek" onSubmit={(e) => {
      e.preventDefault();
      const k = normalizeKode(v);
      if (k) navigate(`/cek/${k}`, { replace }); else setErr(true);
    }}>
      <input className="l-input" value={v} onChange={(e) => { setV(e.target.value); setErr(false); }}
        placeholder="AB1C-D2EF" aria-label="Kode Foto" autoCapitalize="characters" autoComplete="off" spellCheck={false}
        aria-invalid={err} aria-describedby={err ? errId : undefined} />
      <button type="submit" className="l-btn press">Cek</button>
      {err && <p id={errId} className="l-err" role="alert">Kode Foto harus 8 karakter, contoh AB1C-D2EF</p>}
    </form>
  );
}
