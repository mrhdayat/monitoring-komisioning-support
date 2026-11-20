import { createRoot } from 'react-dom/client';
import App from './App';
import { processQueue } from './lib/queue';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD) navigator.serviceWorker?.register('/sw.js').catch(() => {});
// Antrean dikirim saat app dibuka dan saat sinyal kembali (Background Sync hanya ada di Android/Chrome).
const kirim = () => { processQueue({ render: true }).catch(() => {}); };
kirim();
addEventListener('online', kirim);
