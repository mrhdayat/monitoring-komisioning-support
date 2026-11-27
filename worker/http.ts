export interface Env {
  DB: D1Database; ASSETS: Fetcher;
  STORAGE: string; // 'drive' (produksi) | 'd1' (dev, tes)
  GOOGLE_CLIENT_ID?: string; GOOGLE_CLIENT_SECRET?: string;
}

export const json = (data: unknown, status = 200, headers?: HeadersInit): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', ...Object.fromEntries(new Headers(headers)) },
  });

export const err = (code: string, status: number): Response => json({ error: code }, status);

export async function readJson<T>(req: Request): Promise<T | null> {
  if (!req.headers.get('content-type')?.includes('application/json')) return null;
  try { return (await req.json()) as T; } catch { return null; }
}
