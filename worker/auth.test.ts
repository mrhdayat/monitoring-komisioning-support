import { env } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { hashPassword, login, logout, me, requireAdmin, verifyPassword } from './auth';
import type { Env } from './http';

const E = env as Env;
const NOW = 1_800_000_000_000;
const MIN = 60_000;

const post = (url: string, body: unknown, cookie?: string) =>
  new Request(`https://x${url}`, {
    method: 'POST', body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
const doLogin = (password: string, now = NOW, username = 'budi') => login(post('/api/admin/login', { username, password }), E, now);
const cookieOf = (r: Response) => r.headers.get('set-cookie')!.split(';')[0];
const row = () => E.DB.prepare("SELECT * FROM admins WHERE username='budi'").first<Record<string, any>>();

beforeEach(async () => {
  await E.DB.batch([E.DB.prepare('DELETE FROM sessions'), E.DB.prepare('DELETE FROM admins')]);
  await E.DB.prepare('INSERT INTO admins (username, password_hash, created_at) VALUES (?, ?, 1)')
    .bind('budi', await hashPassword('rahasia')).run();
});

describe('auth', () => {
  it('hash → verify benar/salah', async () => {
    const h = await hashPassword('abc');
    expect(h).toMatch(/^pbkdf2-sha256\$10000\$.+\$.+$/);
    expect(await verifyPassword('abc', h)).toBe(true);
    expect(await verifyPassword('abd', h)).toBe(false);
    expect(await verifyPassword('abc', 'sampah')).toBe(false);
  });

  it('login benar → Set-Cookie sid HttpOnly; Secure; SameSite=Lax; Max-Age=604800', async () => {
    const r = await doLogin('rahasia');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ username: 'budi' });
    expect(r.headers.get('set-cookie')).toMatch(/^sid=[0-9a-f]{64}; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800$/);
  });

  it('me dengan cookie → {username}; tanpa cookie → 401', async () => {
    const c = cookieOf(await doLogin('rahasia'));
    const ok = await me(new Request('https://x/api/admin/me', { headers: { cookie: c } }), E, NOW);
    expect(await ok.json()).toEqual({ username: 'budi' });
    const no = await me(new Request('https://x/api/admin/me'), E, NOW);
    expect(no.status).toBe(401);
    expect(await no.json()).toEqual({ error: 'unauthorized' });
  });

  it('sesi kedaluwarsa → null; POST non-JSON → null', async () => {
    const c = cookieOf(await doLogin('rahasia'));
    const get = (now: number) => requireAdmin(new Request('https://x/a', { headers: { cookie: c } }), E, now);
    expect(await get(NOW + 6 * 86_400_000)).not.toBeNull();
    expect(await get(NOW + 8 * 86_400_000)).toBeNull();
    const c2 = cookieOf(await doLogin('rahasia', NOW));
    const raw = new Request('https://x/a', { method: 'POST', body: 'x', headers: { cookie: c2 } });
    expect(await requireAdmin(raw, E, NOW)).toBeNull();
    const del = new Request('https://x/a', { method: 'DELETE', headers: { cookie: c2 } });
    expect(await requireAdmin(del, E, NOW)).not.toBeNull();
  });

  it('5 kali salah → 423 terkunci 15 menit, password benar pun ditolak', async () => {
    for (let i = 0; i < 5; i++) expect((await doLogin('salah')).status).toBe(401);
    const r = await doLogin('rahasia', NOW + 14 * MIN);
    expect(r.status).toBe(423);
    expect(await r.json()).toEqual({ error: 'terkunci', until: NOW + 15 * MIN });
    expect((await doLogin('rahasia', NOW + 16 * MIN)).status).toBe(200);
  });

  it('login sukses mereset failed_count', async () => {
    for (let i = 0; i < 4; i++) await doLogin('salah');
    expect((await row())!.failed_count).toBe(4);
    await doLogin('rahasia');
    expect((await row())!.failed_count).toBe(0);
  });

  it('logout menghapus sesi', async () => {
    const c = cookieOf(await doLogin('rahasia'));
    const r = await logout(post('/api/admin/logout', {}, c), E);
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await E.DB.prepare('SELECT COUNT(*) n FROM sessions').first<{ n: number }>())!.n).toBe(0);
    expect((await me(new Request('https://x/m', { headers: { cookie: c } }), E, NOW)).status).toBe(401);
  });

  it('username tidak dikenal → 401 sama dengan password salah', async () => {
    const a = await doLogin('salah');
    const b = await doLogin('x', NOW, 'hantu');
    expect(b.status).toBe(a.status);
    expect(await b.json()).toEqual(await a.json());
  });

  it('hash lama (iterasi < PBKDF2_ITER) di-hash ulang saat login', async () => {
    const old = await hashPassword('rahasia');
    const [alg, , salt] = old.split('$');
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('rahasia'), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: Uint8Array.from(atob(salt), (c) => c.charCodeAt(0)), iterations: 1000 }, key, 256));
    await E.DB.prepare("UPDATE admins SET password_hash=? WHERE username='budi'")
      .bind(`${alg}$1000$${salt}$${btoa(String.fromCharCode(...bits))}`).run();
    expect((await doLogin('rahasia')).status).toBe(200);
    expect((await row())!.password_hash).toContain('$10000$');
  });
});
