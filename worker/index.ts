import { err, type Env } from './http';
import { checkKode, geocode, getPhoto, getSnapshot } from './public';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    const m = req.method === 'GET' && pathname.match(/^\/api\/(photo|check)\/([^/]+)$/);
    if (m) {
      let kode = m[2];
      try { kode = decodeURIComponent(kode); } catch { /* ditolak normalizeKode */ }
      return m[1] === 'photo' ? getPhoto(kode, env) : checkKode(kode, env);
    }
    switch (pathname) {
      case '/api/snapshot':
        return req.method === 'GET' ? getSnapshot(req, env) : err('not_found', 404);
      case '/api/geocode':
        return req.method === 'GET' ? geocode(new URL(req.url), env) : err('not_found', 404);
      default:
        return err('not_found', 404);
    }
  },
} satisfies ExportedHandler<Env>;
