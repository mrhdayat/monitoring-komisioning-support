import { SISI, type Sisi } from '../../shared/types';
import type { GpsStatus } from './geo';

const MAX_SISI = 1600;

export async function openCamera(video: HTMLVideoElement): Promise<() => void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play().catch(() => {}); // iOS: muted + playsInline sudah cukup; gagal play tidak fatal
  return () => {
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };
}

// Potongan tengah 3:4 potret — sama dengan object-fit: cover di pratinjau, jadi yang terlihat = yang tersimpan.
export function cropRect(vw: number, vh: number) {
  const sw = Math.min(vw, (vh * 3) / 4);
  const sh = (sw * 4) / 3;
  const k = Math.min(1, MAX_SISI / sh);
  return { sx: (vw - sw) / 2, sy: (vh - sh) / 2, sw, sh, w: Math.round(sw * k), h: Math.round(sh * k) };
}

export function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  if (!video.videoWidth) return Promise.reject(new Error('kamera belum siap'));
  const r = cropRect(video.videoWidth, video.videoHeight);
  const c = Object.assign(document.createElement('canvas'), { width: r.w, height: r.h });
  c.getContext('2d')!.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, r.w, r.h);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob gagal'))), 'image/jpeg', 0.92));
}

// Sisi berikutnya yang belum difoto, berputar mulai setelah `from`; null bila keempatnya sudah.
export function nextSide(done: (s: Sisi) => boolean, from?: Sisi): Sisi | null {
  const i = from ? SISI.indexOf(from) + 1 : 0;
  for (let k = 0; k < 4; k++) {
    const s = SISI[(i + k) % 4];
    if (!done(s)) return s;
  }
  return null;
}

// Alasan tombol jepret ditahan, atau null. "Lokasi tidak tersedia" hanya boleh tercetak setelah ±15 detik tanpa fix atau izin ditolak (§8).
export function shutterReason(cam: string, busy: boolean, gps: GpsStatus): string | null {
  if (cam !== 'live') return 'Kamera belum siap';
  if (busy) return 'Menyimpan foto…';
  if (gps === 'mencari') return 'Menunggu lokasi…';
  return null;
}
