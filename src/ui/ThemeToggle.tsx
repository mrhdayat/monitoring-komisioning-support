import { useState } from 'react';

// Tema per perangkat: Otomatis (ikut sistem) → Terang → Gelap. Disimpan di localStorage,
// dipasang sebelum render oleh skrip kecil di index.html agar tidak berkedip.
type Tema = 'auto' | 'light' | 'dark';
const LABEL: Record<Tema, string> = { auto: 'Otomatis', light: 'Terang', dark: 'Gelap' };
const NEXT: Record<Tema, Tema> = { auto: 'light', light: 'dark', dark: 'auto' };

function read(): Tema {
  try {
    const t = localStorage.getItem('tema');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch { return 'auto'; }
}

export function ThemeToggle({ className }: { className?: string }) {
  const [tema, setTema] = useState(read);
  const ganti = () => {
    const t = NEXT[tema];
    setTema(t);
    const root = document.documentElement;
    if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
    try { if (t === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', t); } catch { /* mode privat: tetap berlaku sampai muat ulang */ }
  };
  return (
    <button type="button" className={`${className ?? ''} press`} onClick={ganti}
      aria-label={`Tema: ${LABEL[tema]}. Ketuk untuk ganti ke ${LABEL[NEXT[tema]]}`}>
      Tema · {LABEL[tema]}
    </button>
  );
}
