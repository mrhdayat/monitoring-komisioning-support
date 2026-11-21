import { navigate } from '../router';

// Pembungkus fetch untuk semua panggilan admin: cookie same-origin, body string dikirim sebagai JSON, 401 → layar login.
export async function adminFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (typeof init.body === 'string' && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const res = await fetch(path, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401) navigate('/admin/login', { replace: true });
  return res;
}
