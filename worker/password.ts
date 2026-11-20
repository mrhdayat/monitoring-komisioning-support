// ponytail: 10k iterasi agar muat di 10 ms CPU paket gratis; naikkan ke >=100k di paket Paid.
export const PBKDF2_ITER = 10_000;

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(pw: string, salt: Uint8Array, iter: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${PBKDF2_ITER}$${b64(salt)}$${b64(await derive(pw, salt, PBKDF2_ITER))}`;
}

export function iterOf(stored: string): number {
  return Number(stored.split('$')[1]) || 0;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, it, salt, hash] = stored.split('$');
  const iter = Number(it);
  if (alg !== 'pbkdf2-sha256' || !(iter > 0) || !salt || !hash) return false;
  let want: Uint8Array;
  try { want = unb64(hash); } catch { return false; }
  const got = await derive(pw, unb64(salt), iter);
  let diff = got.length ^ want.length;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ (want[i] ?? 0);
  return diff === 0;
}
