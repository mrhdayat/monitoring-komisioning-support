import * as XLSX from 'xlsx';
import { isSupportUnit, MONTHS, purgeAfterMs } from '../../shared/rules';
import { matchPop, type PopIndex } from '../../shared/populasi';
import type { ImportUnit } from '../../shared/types';

const clean = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');

function ymd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

export function parseBerlakuAkhir(s: string): string | null {
  const t = clean(s);
  let m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(t);
  if (m) return MONTHS[m[2].toLowerCase()] ? ymd(+m[3], MONTHS[m[2].toLowerCase()], +m[1]) : null;
  if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) return ymd(+m[3], +m[2], +m[1]);
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t))) return ymd(+m[1], +m[2], +m[3]);
  return null;
}

const COLS = {
  no_lambung: 'no lambung', perusahaan: 'perusahaan', kelompok_unit: 'kelompok unit', jenis_unit: 'jenis unit',
  berlaku_akhir: 'berlaku akhir', week: 'week', periode: 'periode', status_she: 'status',
} as const;
const LABEL: Record<string, string> = {
  no_lambung: 'No Lambung', perusahaan: 'Perusahaan', kelompok_unit: 'Kelompok Unit', jenis_unit: 'Jenis Unit',
  berlaku_akhir: 'Berlaku Akhir', week: 'Week', periode: 'Periode', status_she: 'Status',
};

interface Parsed { byPeriod: Map<string, ImportUnit[]>; errors: string[]; totalRows: number; supportRows: number;
  cocok: number; perluCek: { no_lambung: string; alasan: 'tidak_ada' | 'ganda' }[] }

export function parseSheRows(rows: unknown[][], popIdx?: PopIndex): Parsed {
  const byPeriod = new Map<string, ImportUnit[]>();
  const errors: string[] = [];
  let totalRows = 0, supportRows = 0, cocok = 0;
  const perluCek: Parsed['perluCek'] = [];
  const norm = (c: unknown) => clean(c).toLowerCase();
  const h = rows.findIndex((r) => r.some((c) => norm(c) === 'no lambung'));
  if (h < 0) return { byPeriod, errors: ['Kolom No Lambung tidak ditemukan'], totalRows, supportRows, cocok, perluCek };
  const head = rows[h].map(norm);
  const idx = {} as Record<keyof typeof COLS, number>;
  for (const k of Object.keys(COLS) as (keyof typeof COLS)[]) {
    idx[k] = head.indexOf(COLS[k]);
    if (idx[k] < 0) errors.push(`Kolom ${LABEL[k]} tidak ditemukan`);
  }
  if (errors.length) return { byPeriod, errors, totalRows, supportRows, cocok, perluCek };

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((c) => clean(c) === '')) continue;
    const n = i + 1;
    const v = {} as Record<keyof typeof COLS, string>;
    for (const k of Object.keys(COLS) as (keyof typeof COLS)[]) v[k] = clean(r[idx[k]]);
    totalRows++;
    const pop = popIdx ? matchPop(v.no_lambung, popIdx) : { pop_status: 'tidak_ada' as const, code_unit: null, skr_bib: null };
    if (!isSupportUnit(v) && pop.pop_status === 'tidak_ada') continue;
    supportRows++;
    const empty = (Object.keys(COLS) as (keyof typeof COLS)[]).find((k) => !v[k]);
    if (empty) { errors.push(`Baris ${n}: ${LABEL[empty]} kosong`); continue; }
    const berlaku = parseBerlakuAkhir(v.berlaku_akhir);
    if (!berlaku) { errors.push(`Baris ${n}: tanggal Berlaku Akhir tidak valid ("${v.berlaku_akhir}")`); continue; }
    try { purgeAfterMs(v.periode); } catch { errors.push(`Baris ${n}: periode tidak valid ("${v.periode}")`); continue; }
    if (pop.pop_status === 'cocok') cocok++; else perluCek.push({ no_lambung: v.no_lambung, alasan: pop.pop_status });
    const { periode, ...rest } = v;
    const list = byPeriod.get(periode) ?? [];
    list.push({ ...rest, berlaku_akhir: berlaku, ...pop });
    byPeriod.set(periode, list);
  }
  return { byPeriod, errors, totalRows, supportRows, cocok, perluCek };
}

// range: 0 mulai dari baris 1 Excel meski !ref mulai lebih bawah; baris kosong dipertahankan agar indeks+1 = nomor baris Excel
export const rowsFromSheet = (ws: XLSX.WorkSheet): unknown[][] =>
  XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, range: 0 });

export async function readSheFile(file: File, popIdx?: PopIndex): Promise<ReturnType<typeof parseSheRows>> {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  return parseSheRows(rowsFromSheet(ws), popIdx);
}
