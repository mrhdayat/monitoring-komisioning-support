import { KODE_RE } from '../shared/kode';
import { clockOff, expiryEndMs } from '../shared/rules';
import { SISI, type PhotoMeta } from '../shared/types';
import { DriveDisconnected } from './drive';
import { err, json, type Env } from './http';
import { unitLabel } from '../shared/populasi';
import { rebuildSnapshot } from './snapshot';
import { fileName, getStore, folderName } from './store';

const MAX_BYTES = 2_097_152;
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v: unknown) => v === null || num(v);
const text = (v: unknown) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= 60;

function parseMeta(header: string | null): PhotoMeta | null {
  let m: PhotoMeta;
  try { m = JSON.parse(decodeURIComponent(header ?? '')); } catch { return null; }
  const ok = m && typeof m === 'object' && typeof m.kode === 'string' && KODE_RE.test(m.kode)
    && Number.isInteger(m.unitId) && SISI.includes(m.sisi) && num(m.capturedAt) && num(m.deviceNow)
    && numOrNull(m.lat) && numOrNull(m.lon) && numOrNull(m.accuracy)
    && (m.address === null || (typeof m.address === 'string' && m.address.length <= 300))
    && text(m.nama) && text(m.nrp);
  return ok ? m : null;
}

// Urutan persis spec §8a.
export async function handleUpload(req: Request, env: Env, ctx: ExecutionContext, now = Date.now()): Promise<Response> {
  // 1. Validasi. ponytail: body dibaca ke memori, bukan di-stream; tanpa decode, ≤ 2 MB murah. Ganti ke stream bila batas dinaikkan.
  const len = req.headers.get('content-length');
  if (!len || !/^\d+$/.test(len)) return err('invalid', 411);
  if (Number(len) > MAX_BYTES) return err('invalid', 400);
  const m = parseMeta(req.headers.get('X-Foto-Meta'));
  if (!m) return err('invalid', 400);
  const buf = await req.arrayBuffer();
  const b = new Uint8Array(buf, 0, Math.min(3, buf.byteLength));
  if (buf.byteLength > MAX_BYTES || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return err('invalid', 400);

  // 2. Kode Foto sudah ada?
  const same = await env.DB.prepare('SELECT unit_id, sisi, captured_at_device FROM photos WHERE kode_foto = ?')
    .bind(m.kode).first<{ unit_id: number; sisi: string; captured_at_device: number }>();
  if (same) {
    return same.unit_id === m.unitId && same.sisi === m.sisi && same.captured_at_device === m.capturedAt
      ? json({ result: 'duplikat' }) : err('kode_bentrok', 409);
  }

  // 3. Unit ada & periodenya belum dihapus retensi?
  const unit = await env.DB.prepare(
    'SELECT u.berlaku_akhir, u.code_unit, u.no_lambung, u.period_id FROM units u JOIN periods p ON p.id = u.period_id WHERE u.id = ? AND p.purged_at IS NULL',
  ).bind(m.unitId).first<{ berlaku_akhir: string; code_unit: string | null; no_lambung: string; period_id: number }>();
  if (!unit) return err('unit_tidak_berlaku', 422);

  // 4. Koreksi jam & expired.
  const offset = now - m.deviceNow;
  // Jepret "di masa depan" (capturedAt > deviceNow + 1 menit) tetap diterima (foto tidak boleh hilang), ditandai ⚠ jam,
  // dan t_koreksi dijepit ke now supaya tidak bisa mengalahkan foto yang benar-benar dijepret lebih akhir §8a.
  const future = m.capturedAt > m.deviceNow + 60_000;
  const t = Math.min(m.capturedAt + offset, now);
  if (t > expiryEndMs(unit.berlaku_akhir)) return err('lewat_expired', 422);
  const flags = [(clockOff(offset) || future) && 'jam', (m.lat === null || m.lon === null) && 'gps'].filter(Boolean).join(',');

  // 5. Simpan berkas.
  // Store null (produksi tanpa Drive): 503, foto tetap di antrean HP.
  const store = await getStore(env);
  if (!store) return err('penyimpanan_belum_siap', 503);
  let key: string;
  try {
    key = await store.put({ name: fileName(unitLabel(unit), m.sisi, m.kode), periodId: unit.period_id, unitId: m.unitId, folderName: folderName(unitLabel(unit)), bytes: new Uint8Array(buf) });
  } catch (e) {
    if (e instanceof DriveDisconnected) return err('penyimpanan_belum_siap', 503); // izin dicabut saat upload; status sudah 'terputus'
    throw e;
  }

  // 6. Pemenang ditentukan atomik: baca foto lama + upsert dalam satu batch (satu transaksi D1).
  const [old, up] = await env.DB.batch<{ kode_foto: string; r2_key: string }>([
    env.DB.prepare('SELECT kode_foto, r2_key FROM photos WHERE unit_id = ? AND sisi = ?').bind(m.unitId, m.sisi),
    env.DB.prepare(
      `INSERT INTO photos (unit_id, sisi, kode_foto, r2_key, captured_at_device, captured_at_corrected,
         received_at_server, clock_offset_s, lat, lon, accuracy_m, address, mekanik_nama, mekanik_nrp, flags)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (unit_id, sisi) DO UPDATE SET kode_foto = excluded.kode_foto, r2_key = excluded.r2_key,
         captured_at_device = excluded.captured_at_device, captured_at_corrected = excluded.captured_at_corrected,
         received_at_server = excluded.received_at_server, clock_offset_s = excluded.clock_offset_s,
         lat = excluded.lat, lon = excluded.lon, accuracy_m = excluded.accuracy_m, address = excluded.address,
         mekanik_nama = excluded.mekanik_nama, mekanik_nrp = excluded.mekanik_nrp, flags = excluded.flags
       WHERE excluded.captured_at_corrected > photos.captured_at_corrected
       RETURNING kode_foto`,
    ).bind(m.unitId, m.sisi, m.kode, key, m.capturedAt, t, now, Math.round(offset / 1000),
      m.lat, m.lon, m.accuracy, m.address, m.nama.trim(), m.nrp.trim(), flags),
  ]);
  const oldKode = old.results[0]?.kode_foto;
  const oldKey = old.results[0]?.r2_key;
  if (up.results.length) {
    if (oldKey && oldKey !== key) await store.del([oldKey]);
    ctx.waitUntil(rebuildSnapshot(env));
    return json({ result: 'dipakai' });
  }
  await store.del([key]);
  if (oldKode === m.kode) return json({ result: 'duplikat' }); // kiriman ganda bersamaan: berkas baru dibuang, foto aktif tetap
  return json({ result: 'lebih_baru_ada' });
}
