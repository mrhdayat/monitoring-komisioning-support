import type { PhotoMeta } from '../../shared/types';

// status 0 = jaringan gagal (offline).
export async function postPhoto(body: Blob, meta: PhotoMeta): Promise<{ status: number; body: unknown }> {
  try {
    const r = await fetch('/api/photos', {
      method: 'POST', body,
      headers: { 'Content-Type': 'image/jpeg', 'X-Foto-Meta': encodeURIComponent(JSON.stringify(meta)) },
    });
    return { status: r.status, body: await r.json().catch(() => null) };
  } catch {
    return { status: 0, body: null };
  }
}
