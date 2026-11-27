import { useState, type FormEvent } from 'react';
import { Sheet } from '../ui/Sheet';
import { setMekanik } from '../lib/mekanik';

type Field = 'nama' | 'nrp';
const LABEL: Record<Field, string> = { nama: 'Nama', nrp: 'NRP' };

// Server menolak > 60 karakter; maxLength menjaganya, sisanya hanya soal kosong setelah dipangkas.
export function MekanikSheet({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = useState<Record<Field, string>>({ nama: '', nrp: '' });
  const [touched, setTouched] = useState<Record<Field, boolean>>({ nama: false, nrp: false });
  const [saving, setSaving] = useState(false);
  const err = (f: Field) => (touched[f] && !v[f].trim() ? `${LABEL[f]} wajib diisi.` : '');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched({ nama: true, nrp: true });
    const nama = v.nama.trim(), nrp = v.nrp.trim();
    if (!nama || !nrp || saving) return;
    setSaving(true);
    try {
      await setMekanik({ nama, nrp });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Siapa yang memotret?">
      <form className="mk-form" onSubmit={submit} noValidate>
        <p className="mk-note">Dicatat sekali di HP ini dan ikut tersimpan pada setiap foto.</p>
        {(['nama', 'nrp'] as const).map((f) => (
          <div key={f} className="mk-field">
            <label htmlFor={`mk-${f}`}>{LABEL[f]}</label>
            <input
              id={`mk-${f}`}
              className="field"
              value={v[f]}
              maxLength={60}
              autoComplete={f === 'nama' ? 'name' : 'off'}
              autoCapitalize={f === 'nama' ? 'words' : 'characters'}
              autoCorrect="off"
              enterKeyHint={f === 'nama' ? 'next' : 'done'}
              aria-invalid={err(f) ? true : undefined}
              aria-describedby={err(f) ? `mk-${f}-err` : undefined}
              onChange={(e) => setV((p) => ({ ...p, [f]: e.target.value }))}
              onBlur={() => setTouched((p) => ({ ...p, [f]: true }))}
            />
            <p id={`mk-${f}-err`} className="mk-err" role={err(f) ? 'alert' : undefined}>{err(f)}</p>
          </div>
        ))}
        <button type="submit" className="btn press" disabled={saving}>Simpan dan buka kamera</button>
        <button type="button" className="btn-plain press" onClick={onClose}>Batal</button>
      </form>
    </Sheet>
  );
}
