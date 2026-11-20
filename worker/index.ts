import { err, type Env } from './http';

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(req.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    switch (pathname) {
      default:
        return err('not_found', 404);
    }
  },
} satisfies ExportedHandler<Env>;
