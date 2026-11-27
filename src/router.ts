import { useMemo, useSyncExternalStore } from 'react';

// Urutan penting: '/admin/login' sebelum '/admin/:tab?'.
export const ROUTES = ['/', '/unit/:id/kamera', '/antrean', '/cek', '/cek/:kode', '/admin/login', '/admin/:tab?'] as const;
export type Route = (typeof ROUTES)[number];

export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split('/'), s = path.split('/'), params: Record<string, string> = {};
  if (s.length > p.length) return null;
  for (let i = 0; i < p.length; i++) {
    const opt = p[i].endsWith('?'), key = opt ? p[i].slice(1, -1) : p[i].slice(1);
    if (!p[i].startsWith(':')) { if (p[i] !== s[i]) return null; continue; }
    if (!s[i]) { if (opt) continue; return null; }
    params[key] = decodeURIComponent(s[i]);
  }
  return params;
}

export function resolve(path: string): { route: Route | null; params: Record<string, string> } {
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path;
  for (const route of ROUTES) {
    const params = match(route, clean);
    if (params) return { route, params };
  }
  return { route: null, params: {} };
}

const subscribe = (cb: () => void) => { addEventListener('popstate', cb); return () => removeEventListener('popstate', cb); };
const href = () => location.pathname + location.search;

export function useRoute() {
  const h = useSyncExternalStore(subscribe, href);
  return useMemo(() => {
    const url = new URL(h, location.origin);
    return { path: url.pathname, query: url.searchParams, ...resolve(url.pathname) };
  }, [h]);
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  history[opts?.replace ? 'replaceState' : 'pushState'](null, '', to);
  dispatchEvent(new PopStateEvent('popstate'));
}
