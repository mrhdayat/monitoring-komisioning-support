import { createRoot } from 'react-dom/client';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-800.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/screens.css';
import App from './App';
import { processQueue } from './lib/queue';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD) navigator.serviceWorker?.register('/sw.js').catch(() => {});
// Antrean dikirim saat app dibuka dan saat sinyal kembali (Background Sync hanya ada di Android/Chrome).
const kirim = () => { processQueue({ render: true }).catch(() => {}); };
kirim();
addEventListener('online', kirim);
// iOS tidak punya Background Sync: kirim juga saat app kembali ke depan.
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kirim(); });
