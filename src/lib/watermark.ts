import type { Sisi } from '../../shared/types';

const TZ = 'Asia/Makassar';
const KUNING = '#F5B800';
const FONT = '"Inter Variable", sans-serif';
const MAX_SISI = 1600;
const MAX_KOLOM = 40;
const MAX_BARIS = 3;

export interface WatermarkParams {
  capturedAt: number; sisi: Sisi; lat: number | null; lon: number | null; address: string | null; kode: string;
}
export type WatermarkText = ReturnType<typeof watermarkText>;

// Alamat dipecah di ', ' dan dikemas rakus ≤ MAX_KOLOM; sisa di luar MAX_BARIS dipotong dengan '…'.
function wrapAddress(address: string): string[] {
  const parts = address.split(', ').map((s, i, a) => (i < a.length - 1 ? s + ',' : s));
  const lines: string[] = [];
  let cur = '';
  let i = 0;
  for (; i < parts.length; i++) {
    const next = cur ? `${cur} ${parts[i]}` : parts[i];
    if (cur && next.length > MAX_KOLOM) {
      if (lines.length === MAX_BARIS - 1) break;
      lines.push(cur);
      cur = parts[i];
    } else cur = next;
  }
  if (i < parts.length) cur = cur.replace(/,$/, '') + '…';
  lines.push(cur);
  return lines;
}

export function watermarkText(p: WatermarkParams) {
  // Formatter dibuat per panggilan agar mengikuti TZ proses saat format, bukan saat load modul.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('id-ID', {
      timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
      day: '2-digit', month: 'long', year: 'numeric', weekday: 'long',
    }).formatToParts(p.capturedAt).map((x) => [x.type, x.value]),
  );
  const hasGps = p.lat !== null && p.lon !== null;
  const kode = `Kode Foto: ${p.kode}`;
  return {
    label: p.sisi.toUpperCase(),
    jam: `${parts.hour}:${parts.minute}`,
    tanggal: `${parts.day} ${parts.month} ${parts.year}`,
    hari: parts.weekday,
    alamat: !hasGps ? ['Lokasi tidak tersedia'] : p.address ? wrapAddress(p.address) : [],
    baris: hasGps ? `${p.lat!.toFixed(6)}, ${p.lon!.toFixed(6)} · ${kode}` : kode,
  };
}

export async function loadWatermarkFont(): Promise<void> {
  await import('@fontsource-variable/inter');
  await Promise.all([300, 400, 600].map((w) => document.fonts.load(`${w} 40px "Inter Variable"`)));
}

export async function renderWatermarked(raw: Blob, text: WatermarkText): Promise<Blob> {
  const bmp = await createImageBitmap(raw);
  const k = Math.min(1, MAX_SISI / Math.max(bmp.width, bmp.height));
  const W = Math.round(bmp.width * k);
  const H = Math.round(bmp.height * k);
  const off = typeof OffscreenCanvas !== 'undefined';
  const canvas = off ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const c = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  c.drawImage(bmp, 0, 0, W, H);
  bmp.close();

  const mx = W * 0.04;
  const fT = W * 0.11; // jam
  const fD = W * 0.034; // tanggal + hari
  const fA = W * 0.037; // alamat
  const fC = W * 0.03; // koordinat · kode
  let y = H - W * 0.04; // garis dasar bawah
  c.textBaseline = 'alphabetic';
  c.textAlign = 'left';
  c.fillStyle = '#fff';
  c.shadowColor = 'rgba(0,0,0,.75)';
  c.shadowBlur = W * 0.008;
  c.shadowOffsetY = W * 0.002;

  c.font = `400 ${fC}px ${FONT}`;
  c.globalAlpha = 0.9;
  c.fillText(text.baris, mx, y);
  c.globalAlpha = 1;
  y -= fC * 1.4;

  c.font = `400 ${fA}px ${FONT}`;
  for (const l of [...text.alamat].reverse()) { c.fillText(l, mx, y); y -= fA * 1.3; }
  y -= fA * 0.3;

  // Blok jam: jam | garis kuning | tanggal + hari
  c.font = `300 ${fT}px ${FONT}`;
  const tw = c.measureText(text.jam).width;
  const base = y;
  c.fillText(text.jam, mx, base);
  const barX = mx + tw + fT * 0.14;
  const barH = fT * 0.78;
  c.fillStyle = KUNING;
  c.fillRect(barX, base - barH, W * 0.005, barH);
  c.fillStyle = '#fff';
  c.font = `400 ${fD}px ${FONT}`;
  const dx = barX + W * 0.005 + fT * 0.14;
  c.fillText(text.tanggal, dx, base - barH + fD * 1.0);
  c.fillText(text.hari, dx, base - fD * 0.15);

  // Pita label sisi (tanpa bayangan) di atas blok jam
  c.shadowColor = 'transparent';
  c.shadowBlur = 0;
  c.shadowOffsetY = 0;
  const fL = W * 0.034;
  c.font = `600 ${fL}px ${FONT}`;
  const lw = c.measureText(text.label).width + fL * 1.4;
  const lh = fL * 1.9;
  const ly = base - fT * 0.82 - lh - fL * 0.5;
  c.fillStyle = KUNING;
  c.beginPath();
  if (c.roundRect) c.roundRect(mx, ly, lw, lh, fL * 0.3); // iOS 15 / Chrome < 99: tanpa sudut membulat
  else c.rect(mx, ly, lw, lh);
  c.fill();
  c.fillStyle = '#111';
  c.fillText(text.label, mx + fL * 0.7, ly + lh * 0.5 + fL * 0.36);

  return off
    ? (canvas as OffscreenCanvas).convertToBlob({ type: 'image/jpeg', quality: 0.8 })
    : new Promise((res, rej) => (canvas as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('toBlob gagal'))), 'image/jpeg', 0.8));
}
