import { err, json, readJson, type Env } from './http';
import { hashPassword, iterOf, PBKDF2_ITER, verifyPassword } from './password';

export { PBKDF2_ITER, hashPassword, verifyPassword };

const WEEK = 7 * 24 * 3600;
const LOCK_MS = 15 * 60_000;
const MAX_FAIL = 5;
const DUMMY_HASH = `pbkdf2-sha256$${PBKDF2_ITER}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

export const sha256Hex = async (s: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
export const sidOf = (req: Request) => req.headers.get('cookie')?.match(/(?:^|;\s*)sid=([0-9a-f]+)/)?.[1];

export async function requireAdmin(req: Request, env: Env, now = Date.now()): Promise<{ id: number; username: string } | null> {
  if (!['GET', 'HEAD', 'DELETE'].includes(req.method) && !req.headers.get('content-type')?.includes('application/json')) return null;
  const sid = sidOf(req);
  if (!sid) return null;
  const th = await sha256Hex(sid);
  const row = await env.DB.prepare(
    'SELECT a.id, a.username, s.expires_at FROM sessions s JOIN admins a ON a.id = s.admin_id WHERE s.token_hash = ?',
  ).bind(th).first<{ id: number; username: string; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run();
    return null;
  }
  return { id: row.id, username: row.username };
}

export async function login(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const b = await readJson<{ username?: unknown; password?: unknown }>(req);
  if (!b || typeof b.username !== 'string' || typeof b.password !== 'string') return err('login_gagal', 401);
  const a = await env.DB.prepare('SELECT id, password_hash, failed_count, locked_until FROM admins WHERE username = ?')
    .bind(b.username).first<{ id: number; password_hash: string; failed_count: number; locked_until: number }>();
  if (!a) {
    await verifyPassword(b.password, DUMMY_HASH); // samakan waktu respons dengan password salah
    return err('login_gagal', 401);
  }
  if (a.locked_until > now) return json({ error: 'terkunci', until: a.locked_until }, 423);

  if (!(await verifyPassword(b.password, a.password_hash))) {
    const r = await env.DB.prepare('UPDATE admins SET failed_count = failed_count + 1 WHERE id = ? RETURNING failed_count')
      .bind(a.id).first<{ failed_count: number }>();
    if (r && r.failed_count >= MAX_FAIL)
      await env.DB.prepare('UPDATE admins SET failed_count = 0, locked_until = ? WHERE id = ?').bind(now + LOCK_MS, a.id).run();
    return err('login_gagal', 401);
  }

  const token = [...crypto.getRandomValues(new Uint8Array(32))].map((x) => x.toString(16).padStart(2, '0')).join('');
  const stmts = [
    env.DB.prepare('UPDATE admins SET failed_count = 0, locked_until = 0 WHERE id = ?').bind(a.id),
    env.DB.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at) VALUES (?, ?, ?)')
      .bind(await sha256Hex(token), a.id, now + WEEK * 1000),
    env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
  ];
  if (iterOf(a.password_hash) < PBKDF2_ITER)
    stmts.push(env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(await hashPassword(b.password), a.id));
  await env.DB.batch(stmts);
  return json({ username: b.username }, 200, {
    'set-cookie': `sid=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${WEEK}`,
  });
}

export async function logout(req: Request, env: Env): Promise<Response> {
  const sid = sidOf(req);
  if (sid) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(sid)).run();
  return json({ ok: true }, 200, { 'set-cookie': 'sid=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' });
}

export async function me(req: Request, env: Env, now = Date.now()): Promise<Response> {
  const a = await requireAdmin(req, env, now);
  return a ? json({ username: a.username }) : err('unauthorized', 401);
}
