import * as XLSX from 'xlsx';
import type { PopUnit } from '../../shared/types';

const clean = (v: unknown) => String(v ?? '').trim().replace(/\s+/g, ' ');
const COLS = { jenis: 'TYPE UNIT', section: 'SECTION', maint: 'MAINTENANCE BY', code_unit: 'CODE UNIT', skr_bib: 'SKR BIB' } as const;
type K = keyof typeof COLS;

function locate(rows: unknown[][]): { h: number; col: Record<K, number> } | null {
  const h = rows.findIndex((r) => r.some((c) => clean(c).toUpperCase() === 'SECTION'));
  if (h < 0) return null;
  const head = rows[h].map((c) => clean(c).toUpperCase());
  const col = {} as Record<K, number>;
  for (const k of Object.keys(COLS) as K[]) if ((col[k] = head.indexOf(COLS[k])) < 0) return null;
  return { h, col };
}

export function parsePopulasi(wb: XLSX.WorkBook): { units: PopUnit[]; errors: string[] } {
  // file asli punya !ref sampai kolom XDZ; batasi 40 kolom agar tidak memakan belasan detik
  const rowsOf = (n: string) => {
    const r = XLSX.utils.decode_range(wb.Sheets[n]['!ref'] ?? 'A1');
    return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: false, range: { s: { r: 0, c: 0 }, e: { r: r.e.r, c: Math.min(r.e.c, 39) } } });
  };
  const names = ['PPA & AMM - Active', ...wb.SheetNames].filter((n) => wb.Sheets[n]);
  for (const n of names) {
    const rows = rowsOf(n);
    const loc = locate(rows);
    if (!loc) continue;
    const { h, col } = loc;
    const units = rows.slice(h + 1).map((r) => ({
      section: clean(r[col.section]).toUpperCase(), code_unit: clean(r[col.code_unit]), skr_bib: clean(r[col.skr_bib]),
      jenis: clean(r[col.jenis]), maint: clean(r[col.maint]),
    })).filter((u) => u.section === 'SUPPORT' && u.code_unit)
      .map(({ section: _s, ...u }) => u);
    return { units, errors: [] };
  }
  return { units: [], errors: ['Kolom TYPE UNIT, SECTION, MAINTENANCE BY, CODE UNIT, SKR BIB tidak ditemukan'] };
}

// File asli 9 MB dengan sheet sampai kolom XDZ: membaca semua sheet ~13 dtk, jadi baca sheet utama saja dulu.
export async function readPopulasiFile(file: File): Promise<{ units: PopUnit[]; errors: string[] }> {
  const buf = await file.arrayBuffer();
  const first = parsePopulasi(XLSX.read(buf, { sheets: ['PPA & AMM - Active'], dense: true }));
  return first.units.length ? first : parsePopulasi(XLSX.read(buf, { dense: true }));
}
