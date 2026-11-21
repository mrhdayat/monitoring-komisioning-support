import { SISI, type AdminUnit, type Sisi } from '../../shared/types';
import { witaText } from './unitUtils';

const strip = (s: string) => s.replace(/\s+/g, '');
export const zipName = (u: AdminUnit, sisi: Sisi) => `${strip(u.no_lambung)}/${strip(u.no_lambung)}_${sisi}.jpg`;

// Lebih dari satu periode: unit yang sama ada di tiap periode, jadi beri folder periode agar jalur tidak bentrok.
export const zipPath = (u: AdminUnit, sisi: Sisi, multiPeriod: boolean) =>
  `${multiPeriod ? `${u.period.replace(/[\s/\\]+/g, '-')}/` : ''}${zipName(u, sisi)}`;

const STATUS = { belum: 'Belum', sebagian: 'Sebagian', lengkap: 'Lengkap', lewat_expired: 'Lewat expired' } as const;
const uniq = (xs: string[]) => [...new Set(xs)].join(', ');
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

// Satu baris per unit sesuai spesifikasi §11.
export function rekapRows(units: AdminUnit[]) {
  return units.map((u) => {
    const ps = SISI.flatMap((s) => (u.photos[s] ? [u.photos[s]!] : []));
    const flags = new Set(ps.flatMap((p) => p.flags.split(',')));
    const row: Record<string, string | number> = {
      'No Lambung': u.no_lambung, 'Jenis Unit': u.jenis_unit, Perusahaan: u.perusahaan, 'Berlaku Akhir': u.berlaku_akhir,
      Week: u.week, Periode: u.period, Status: STATUS[u.status], 'Jumlah Sisi': ps.length,
    };
    for (const s of SISI) row[`Jam Jepret ${cap(s)}`] = u.photos[s] ? witaText(u.photos[s]!.captured_at_device) : '';
    row['Nama Mekanik'] = uniq(ps.map((p) => p.mekanik_nama));
    row.NRP = uniq(ps.map((p) => p.mekanik_nrp));
    row.Flag = [flags.has('jam') && '⚠ jam', flags.has('gps') && '⚠ gps'].filter(Boolean).join(', ');
    return row;
  });
}

export const todayWita = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Makassar' }).format(now); // YYYY-MM-DD
const slug = (s: string) => s.replace(/[\s/\\]+/g, '-');
export const zipFile = (period?: string, week?: string) => `komisioning-${slug(period ?? 'semua')}${week ? `-${slug(week)}` : ''}.zip`;

export async function downloadRekap(units: AdminUnit[]): Promise<void> {
  const XLSX = await import('xlsx'); // hanya diunduh saat dipakai
  const ws = XLSX.utils.json_to_sheet(rekapRows(units));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rekap');
  const periods = [...new Set(units.map((u) => u.period))];
  XLSX.writeFile(wb, `rekap-komisioning-${periods.length === 1 ? slug(periods[0]) : 'semua'}-${todayWita()}.xlsx`);
}

export interface ZipResult { cancelled: boolean; missing: number }
type Picker = (o: { suggestedName: string; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<FileSystemFileHandle>;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

export async function downloadZip(
  units: AdminUnit[], onProgress: (done: number, total: number) => void, filename: string, signal?: AbortSignal,
): Promise<ZipResult> {
  const picker = (window as unknown as { showSaveFilePicker?: Picker }).showSaveFilePicker;
  const multiPeriod = new Set(units.map((u) => u.period)).size > 1;
  const total = units.reduce((n, u) => n + SISI.filter((s) => u.photos[s]).length, 0);
  let done = 0, missing = 0;
  onProgress(0, total);

  async function* entries(list: AdminUnit[]) {
    for (const u of list) {
      for (const s of SISI) {
        const p = u.photos[s];
        if (!p) continue;
        signal?.throwIfAborted();
        const res = await fetch(`/api/photo/${encodeURIComponent(p.kode)}`, { signal });
        if (res.status === 404) missing++;
        else if (!res.ok) throw new Error(`Foto ${p.kode}: HTTP ${res.status}`);
        else yield { name: zipPath(u, s, multiPeriod), input: res, lastModified: new Date(p.captured_at_device) };
        onProgress(++done, total);
      }
    }
  }

  try {
    // Pemilih berkas dipanggil lebih dulu: await import() sebelumnya bisa menghabiskan aktivasi pengguna.
    const handle = picker && await picker({ suggestedName: filename, types: [{ description: 'Berkas ZIP', accept: { 'application/zip': ['.zip'] } }] });
    const { downloadZip: makeZip } = await import('client-zip');
    if (handle) {
      await makeZip(entries(units)).body!.pipeTo(await handle.createWritable(), { signal });
    } else {
      // Tanpa pemilih berkas: satu ZIP per periode+week agar tiap berkas tetap kecil di memori.
      const groups = new Map<string, AdminUnit[]>();
      for (const u of units) groups.set(`${u.period}|${u.week}`, [...(groups.get(`${u.period}|${u.week}`) ?? []), u]);
      const base = filename.replace(/\.zip$/i, '');
      for (const [key, list] of groups) {
        const before = done - missing;
        const blob = await makeZip(entries(list)).blob();
        if (done - missing === before) continue; // semua foto grup ini hilang: jangan unduh ZIP kosong
        const [period, week] = key.split('|');
        const url = URL.createObjectURL(blob);
        const a = Object.assign(document.createElement('a'), { href: url, download: `${groups.size > 1 ? `${base}-${multiPeriod ? `${slug(period)}-` : ''}${slug(week)}` : base}.zip` });
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    }
  } catch (e) {
    if (isAbort(e) || signal?.aborted) return { cancelled: true, missing };
    throw e;
  }
  return { cancelled: false, missing };
}
