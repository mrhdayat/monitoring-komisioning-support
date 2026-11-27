import type { PopStatus, PopUnit } from './types';

// Kunci pencocokan: PPA - TL 0141 / TL536AMM / THDS07 diseragamkan.
export const unitKey = (s: string): string =>
  s.toUpperCase().replace(/^\s*PPA\s*-\s*/, '').replace(/[\s-]+/g, '').replace(/AMM$/, '')
    .replace(/\d+/g, (d) => d.replace(/^0+(?=\d)/, ''));

export type PopIndex = Map<string, PopUnit[]>;

export function buildPopIndex(units: PopUnit[]): PopIndex {
  const idx: PopIndex = new Map();
  for (const u of units) {
    for (const k of new Set([unitKey(u.code_unit), unitKey(u.skr_bib)])) {
      if (!k) continue;
      const list = idx.get(k) ?? [];
      list.push(u);
      idx.set(k, list);
    }
  }
  return idx;
}

export function matchPop(noLambung: string, idx: PopIndex): { pop_status: PopStatus; code_unit: string | null; skr_bib: string | null } {
  const list = idx.get(unitKey(noLambung));
  if (!list) return { pop_status: 'tidak_ada', code_unit: null, skr_bib: null };
  if (list.length > 1) return { pop_status: 'ganda', code_unit: null, skr_bib: null };
  return { pop_status: 'cocok', code_unit: list[0].code_unit, skr_bib: list[0].skr_bib };
}

export const unitLabel = (u: { code_unit?: string | null; no_lambung: string }): string => u.code_unit ?? u.no_lambung;
