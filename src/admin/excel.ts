import * as XLSX from 'xlsx';
import { MONTHS, purgeAfterMs } from '../../shared/rules';
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

export function parseSheRows(rows: unknown[][]): { byPeriod: Map<string, ImportUnit[]>; errors: string[] } {
  const byPeriod = new Map<string, ImportUnit[]>();
  const errors: string[] = [];
  const norm = (c: unknown) => clean(c).toLowerCase();
  const h = rows.findIndex((r) => r.some((c) => norm(c) === 'no lambung'));
  if (h < 0) return { byPeriod, errors: ['Kolom No Lambung tidak ditemukan'] };
  const head = rows[h].map(norm);
  const idx = {} as Record<keyof typeof COLS, number>;
  for (const k of Object.keys(COLS) as (keyof typeof COLS)[]) {
    idx[k] = head.indexOf(COLS[k]);
    if (idx[k] < 0) errors.push(`Kolom ${LABEL[k]} tidak ditemukan`);
  }
  if (errors.length) return { byPeriod, errors };

  for (let i = h + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (r.every((c) => clean(c) === '')) continue;
    const n = i + 1;
    const v = {} as Record<keyof typeof COLS, string>;
    for (const k of Object.keys(COLS) as (keyof typeof COLS)[]) v[k] = clean(r[idx[k]]);
    const empty = (Object.keys(COLS) as (keyof typeof COLS)[]).find((k) => !v[k]);
    if (empty) { errors.push(`Baris ${n}: ${LABEL[empty]} kosong`); continue; }
    const berlaku = parseBerlakuAkhir(v.berlaku_akhir);
    if (!berlaku) { errors.push(`Baris ${n}: tanggal Berlaku Akhir tidak valid ("${v.berlaku_akhir}")`); continue; }
    try { purgeAfterMs(v.periode); } catch { errors.push(`Baris ${n}: periode tidak valid ("${v.periode}")`); continue; }
    const { periode, ...rest } = v;
    const list = byPeriod.get(periode) ?? [];
    list.push({ ...rest, berlaku_akhir: berlaku });
    byPeriod.set(periode, list);
  }
  return { byPeriod, errors };
}

export async function readSheFile(file: File): Promise<ReturnType<typeof parseSheRows>> {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames[0]];
  return parseSheRows(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, blankrows: false }));
}
