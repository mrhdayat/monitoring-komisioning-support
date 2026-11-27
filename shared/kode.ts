const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const KODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function newKode(): string {
  const b = crypto.getRandomValues(new Uint8Array(8));
  const s = Array.from(b, (x) => ALPHABET[x & 31]).join('');
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function normalizeKode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 8) return null;
  const k = `${s.slice(0, 4)}-${s.slice(4)}`;
  return KODE_RE.test(k) ? k : null;
}
