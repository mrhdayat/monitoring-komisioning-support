import { useState } from 'react';
import { Sheet } from '../ui/Sheet';

const KEY = 'install-guide-dismissed';

function shouldShow(): boolean {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!ios || (navigator as { standalone?: boolean }).standalone === true) return false;
  try { return !localStorage.getItem(KEY); } catch { return true; }
}

// Safari menghapus data situs yang lama tidak dibuka; app di Layar Utama dikecualikan.
export function InstallGuide() {
  const [open, setOpen] = useState(shouldShow);
  const close = () => {
    try { localStorage.setItem(KEY, '1'); } catch { /* mode privat: akan muncul lagi, tidak apa-apa */ }
    setOpen(false);
  };
  return (
    <Sheet open={open} onClose={close} title="Pasang di Layar Utama">
      <div className="guide">
        <p className="guide-lead">
          Ketuk ikon Bagikan
          <svg className="guide-ic" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 3v12M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1" />
          </svg>
          , lalu Tambahkan ke Layar Utama.
        </p>
        <p className="guide-why">Supaya foto yang belum terkirim tidak terhapus oleh Safari.</p>
        <button type="button" className="btn press" onClick={close}>Nanti saja</button>
      </div>
    </Sheet>
  );
}
