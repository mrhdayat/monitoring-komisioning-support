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
export interface AdminPhoto {
  kode: string; captured_at_device: number; received_at_server: number;
  clock_offset_s: number;           // detik; positif = jam HP tertinggal dari server
  mekanik_nama: string; mekanik_nrp: string;
  flags: string;                    // '' | 'jam' | 'gps' | 'jam,gps'
  address: string | null; lat: number | null; lon: number | null;
}
export interface AdminUnit extends SnapUnit {
  period: string; status: AdminStatus; perluCek: boolean;
  photos: Partial<Record<Sisi, AdminPhoto>>;
}
export interface AdminPeriod { id: number; label: string; purge_after: number; purged_at: number | null }
export interface Snapshot {
  version: number;                  // ms saat dibangun
  periods: { id: number; label: string; purge_after: number }[];
  units: SnapUnit[];                // hanya status_she 'Belum Diajukan' dari periode yang belum dihapus
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

export interface ImportUnit {
  no_lambung: string; perusahaan: string; kelompok_unit: string; jenis_unit: string;
  berlaku_akhir: string; // YYYY-MM-DD
  week: string; status_she: string;
}
