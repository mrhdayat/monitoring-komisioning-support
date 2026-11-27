# Foto di Google Drive: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Mengganti R2 dengan Google Drive (foto) dan D1 (snapshot), tanpa mengubah perilaku aplikasi, supaya pilot bisa di-deploy ke akun Cloudflare kantor tanpa kartu.

**Architecture:**
- Modul `worker/store.ts` menyembunyikan tempat penyimpanan berkas. Ada dua implementasi:
  - `driveStore` untuk produksi, lewat Drive API dengan OAuth akun kerja;
  - `d1Store` untuk dev dan tes, berupa BLOB di D1.
- Snapshot pindah ke tabel D1.
- Admin menyambungkan Drive lewat alur OAuth di layar Admin.

**Tech Stack:** Cloudflare Worker + D1, Google Drive API v3 + OAuth 2.0 (`drive.file openid email`), React 19, Vitest (`@cloudflare/vitest-plugin`).

**Spec:** `docs/superpowers/specs/2026-11-27-penyimpanan-google-drive-design.md` (otoritas).

## Fase & gerbang review
| Fase | Task | Hasil yang bisa diuji |
|---|---|---|
| H | 1–2 | Tanpa R2: semua tes lama hijau dengan `d1Store`, klien Drive teruji dengan `fetch` palsu, snapshot di D1 dengan ETag/304. |
| I | 3–4 | Alur "Sambungkan Google Drive" di Admin, README deploy baru, dan `wrangler deploy --dry-run` sukses. |

Penutup setiap fase:
- `npm test` + `npm run build` hijau;
- security review (fase ini menyentuh OAuth dan secret);
- `graphify update .`;
- scratchpad kosong.

## Global Constraints
- **Store interface** (`worker/store.ts`):
  ```ts
  export interface Store {
    put(f: { name: string; periodId: number; bytes: Uint8Array }): Promise<string>;
    get(id: string): Promise<Response | null>;
    del(ids: string[]): Promise<void>;
    trashPeriod(periodId: number): Promise<void>;
  }
  export async function getStore(env: Env, fetchImpl?: typeof fetch): Promise<Store | null>; // null = produksi tanpa Drive tersambung
  ```
- **Pemilihan store:**
  - `env.STORAGE === 'd1'` → `d1Store`;
  - `'drive'` → `driveStore` bila `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` ada **dan** `pengaturan.drive_refresh_token` ada; selain itu `null`.
  - Upload dengan store `null` → `503 { error: 'penyimpanan_belum_siap' }`.
- **`photos.r2_key`** = ID berkas, dengan nama kolom tetap.
- **Nama berkas Drive:** `${label}_${sisi}_${kode}.jpg`, dengan karakter `/\\:*?"<>|` diganti `-`.
- **Folder:**
  - root `Komisioning` (ID di `pengaturan.drive_root_id`);
  - folder periode = label periode dengan `/` diganti `-` (ID di `periods.drive_folder_id`, dibuat dengan klaim `UPDATE … WHERE drive_folder_id IS NULL`).
- **Token:**
  - `pengaturan.drive_access_token` + `drive_access_exp`, di-refresh bila < 5 menit tersisa;
  - 401 → refresh lalu ulang sekali;
  - `invalid_grant` → `pengaturan.drive_status = 'terputus'`.
- **Foto publik:** `GET /api/photo/:kode` lewat `caches.default` dengan header `public, max-age=31536000, immutable`.
- **Snapshot:** tabel `snapshot` (id=1), ETag `"{version}"`.
- **OAuth:**
  - `GET /api/admin/drive/mulai` dan `GET /api/admin/drive/kembali`;
  - `state` acak 32 byte, disimpan sebagai SHA-256 di `drive_state` bersama hash token sesi, umur 10 menit, sekali pakai;
  - redirect sukses `/admin/admin?drive=ok`, gagal `/admin/admin?drive=gagal`.
- `wrangler.jsonc` tanpa `r2_buckets`, dengan `"vars": { "STORAGE": "drive" }`, `account_id`, dan `database_id` kantor (sudah ada di working tree). `.dev.vars` (gitignored) berisi `STORAGE=d1`.
- Free plan: ≤ 50 subrequest per request dan ±10 ms CPU. Tidak ada parsing atau encoding berat di Worker selain merangkai multipart.
- Teks UI dalam Bahasa Indonesia yang manusiawi, memakai token dan kelas DESIGN.md.
- Data pengguna dan secret tidak pernah di-commit. Tidak ada perintah Cloudflare remote, kecuali `wrangler deploy --dry-run` (lokal, tanpa unggah).

## Review Focus
1. **Upload saat Drive terputus** → 503, foto tetap di antrean HP (decide → "ulang"). Dipatok di Task 2.
2. **Token kedaluwarsa di tengah upload** (401) → refresh sekali lalu sukses, tanpa loop. Dipatok di Task 2.
3. **Dua upload pertama periode baru bersamaan** → tetap satu folder periode, yang kalah dihapus. Dipatok di Task 2.
4. **OAuth `kembali` dengan state milik sesi lain atau dipakai ulang** → 400, tanpa menyimpan token. Dipatok di Task 3.
5. **Foto tidak ada / ID berkas hilang di Drive (404)** → `/api/photo` 404, bukan 500. Dipatok di Task 2.

---

### Task 1 (Fase H): `Store` + `d1Store` + snapshot di D1, tanpa R2
**Files:**
- Create: `migrations/0003_drive.sql` (persis spec §4), `worker/store.ts`, `worker/store.test.ts`, `.dev.vars.example`
- Modify: `worker/http.ts` (Env), `worker/upload.ts`, `worker/public.ts`, `worker/admin.ts` (deletePhoto), `worker/purge.ts`, `worker/snapshot.ts`, tes worker terkait, `wrangler.jsonc`, `.gitignore` (`.dev.vars`), konfigurasi tes vitest (binding `STORAGE=d1`), `worker-configuration.d.ts` (`wrangler types`)

**Langkah:**
- [ ] Tes gagal: `store.test.ts` (d1Store put/get/del/trashPeriod). Ubah tes snapshot: ETag `"{version}"`, 304 dengan If-None-Match. Tes upload, public, purge, dan admin yang lama tetap ada, sekarang memakai d1Store.
- [ ] Implementasi:
  - `upload.ts`: `store.put` sebelum upsert §8a (urutan sama seperti R2); berkas yang kalah atau lama → `store.del`; `store === null` → 503.
  - `public.ts`: `getPhoto` lewat store; snapshot dari tabel D1, dibangun ulang bila belum ada.
  - `purge.ts`: `store.trashPeriod(periodId)` + hapus baris (d1Store juga menghapus `berkas_dev`).
  - `admin.ts` deletePhoto lewat store.
  - `snapshot.ts`: `INSERT … ON CONFLICT(id) DO UPDATE`.
  - Hapus binding R2. `Env` mengikuti spec §3.6.
- [ ] Jalankan `npm test` + `npm run build` + `npm run db:local`, lalu cek dev lokal: upload foto via UI lokal → tampil di papan.
- [ ] Commit `refactor: penyimpanan berkas lewat Store, snapshot di D1, tanpa R2`.

### Task 2 (Fase H): `driveStore` + cache foto
**Files:**
- Create: `worker/drive.ts`, `worker/drive.test.ts`
- Modify: `worker/store.ts` (`getStore` memilih drive), `worker/public.ts` (`caches.default` untuk foto)

**Interfaces:**
- `driveStore(env, fetchImpl): Store`
- `driveToken(env, fetchImpl): Promise<string>` (throws `DriveDisconnected`)

**Langkah:**
- [ ] Tes gagal (semua dengan `fetch` palsu yang mencatat request):
  - token di-refresh lalu disimpan, dan tidak di-refresh bila masih berlaku;
  - 401 → refresh + ulang sekali saja;
  - `invalid_grant` → status `terputus` dan error `DriveDisconnected`;
  - `put` membuat root + folder periode sekali, lalu upload multipart dengan `name`/`parents`/`mimeType` benar dan mengembalikan `id`;
  - klaim folder bersamaan: yang kalah memanggil DELETE untuk folder buatannya;
  - `get` mengembalikan `null` pada 404;
  - `del` memanggil DELETE per id dan mengabaikan 404;
  - `trashPeriod` mengirim PATCH `{trashed:true}`;
  - `getStore` mengembalikan `null` bila `STORAGE=drive` tanpa refresh token, dan upload → 503.
- [ ] Implementasi: endpoint Google (`oauth2.googleapis.com/token`, `www.googleapis.com/drive/v3/files`, `www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id`). Multipart dirangkai dengan `Blob` (`multipart/related`, boundary acak).
- [ ] Cache foto: `getPhoto` memeriksa `caches.default.match(req)`, lalu mengisinya dengan `ctx.waitUntil(cache.put(...))` untuk respons 200.
- [ ] Jalankan `npm test` + `npm run build`, lalu commit `feat: simpan foto di Google Drive`.

### Task 3 (Fase I): Sambungkan Google Drive (OAuth + layar Admin)
**Files:**
- Modify: `worker/admin.ts` (rute `drive/mulai`, `drive/kembali`, `drive/status`), `worker/drive.ts` (tukar code), `worker/admin.test.ts`, `src/admin/Admins.tsx` (bagian "Penyimpanan foto"), `src/styles/admin.css`

**Interfaces:**
- `GET /api/admin/drive/status` → `{ storage: 'drive' | 'd1', status: 'tersambung' | 'terputus' | 'belum', email: string | null, folderUrl: string | null }`

**Langkah:**
- [ ] Tes gagal:
  - `mulai` tanpa sesi → 401;
  - `mulai` dengan sesi → 302 ke `accounts.google.com/o/oauth2/v2/auth` dengan `client_id`, `redirect_uri = {origin}/api/admin/drive/kembali`, scope, `access_type=offline`, `prompt=consent`, dan `state`;
  - `kembali` dengan state benar (fetch palsu untuk token, `id_token` berisi email) → refresh token + email tersimpan, `drive_status = 'tersambung'`, `drive_root_id` direset, 302 ke `/admin/admin?drive=ok`;
  - state salah, kedaluwarsa, sesi lain, atau dipakai dua kali → 400 dan tidak ada yang tersimpan;
  - `status` mengembalikan field yang benar.
- [ ] Implementasi sesuai spec §3.4.
- [ ] UI bagian "Penyimpanan foto":
  - status, email, dan tautan folder Drive;
  - tombol "Sambungkan Google Drive" / "Ganti akun" (navigasi ke `/api/admin/drive/mulai`);
  - pesan dari `?drive=ok|gagal`;
  - di mode `d1` tampil "Mode lokal: foto disimpan di database (hanya untuk uji)".
  - Peringatan "Google Drive terputus. Foto baru tertahan di HP mekanik sampai disambungkan ulang." juga muncul di banner atas admin bila status `terputus`.
- [ ] Jalankan `npm test` + `npm run build`, cek headless bagian ini di 390/1440 px terang/gelap, lalu commit `feat: sambungkan Google Drive dari layar admin`.

### Task 4 (Fase I): Panduan deploy + dry-run
**Files:**
- Modify: `README.md` (bagian Deploy ditulis ulang sesuai spec §5, setup lokal dengan `.dev.vars`), `.dev.vars.example`

**Langkah:**
- [ ] README langkah demi langkah:
  - Google Cloud Console (project, Drive API, consent Internal, OAuth client Web dengan dua redirect URI);
  - `wrangler secret put` ×2;
  - deploy;
  - admin pertama;
  - Sambungkan Drive;
  - Populasi, lalu SHE.
  - Ditulis singkat dan jelas untuk orang awam.
- [ ] Jalankan `npx wrangler deploy --dry-run --outdir /tmp/<scratchpad>/dry` (tidak mengunggah) dan pastikan bundel jadi tanpa error binding. Hapus outdir.
- [ ] Commit `docs: panduan deploy dengan Google Drive`.
