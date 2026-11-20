export type Sisi = 'depan' | 'belakang' | 'kanan' | 'kiri';
export const SISI: readonly Sisi[] = ['depan', 'belakang', 'kanan', 'kiri'];
export type Section = 'aktif' | 'selesai' | 'tersembunyi';
export type AdminStatus = 'belum' | 'sebagian' | 'lengkap' | 'lewat_expired';
export type Flag = 'jam' | 'gps';

export interface SnapUnit {
  id: number; period_id: number; no_lambung: string; perusahaan: string;
  kelompok_unit: string; jenis_unit: string; week: string;
  berlaku_akhir: string;            // YYYY-MM-DD
  status_she: string; in_latest_upload: boolean;
  sides: Partial<Record<Sisi, { kode: string; at: number }>>; // at = captured_at_device
}
export interface Snapshot {
  version: number;                  // ms saat dibangun
  periods: { id: number; label: string; purge_after: number }[];
  units: SnapUnit[];                // hanya status_she 'Belum Diajukan' dari periode yang belum dihapus
  recent: { no_lambung: string; sisi: Sisi; at: number; kode: string }[]; // 8 terbaru per received_at
}
export interface PhotoMeta {        // header X-Foto-Meta = encodeURIComponent(JSON)
  kode: string; unitId: number; sisi: Sisi;
  capturedAt: number; deviceNow: number;   // deviceNow diisi tepat saat kirim
  lat: number | null; lon: number | null; accuracy: number | null; address: string | null;
  nama: string; nrp: string;
}
export type UploadOk = 'dipakai' | 'lebih_baru_ada' | 'duplikat';
export type UploadErr = 'unit_tidak_berlaku' | 'lewat_expired' | 'kode_bentrok' | 'invalid';
// HTTP: 200 {result: UploadOk} · 422 {error:'unit_tidak_berlaku'|'lewat_expired'} · 409 {error:'kode_bentrok'} · 400 {error:'invalid'}
