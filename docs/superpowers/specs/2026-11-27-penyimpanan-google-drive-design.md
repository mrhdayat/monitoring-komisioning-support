# Desain: Foto di Google Drive (pengganti R2)

Tanggal: 27 November 2026 · Status: disetujui pengguna ("setuju")
Mengubah: spec lama `2026-11-21-…` §5 (hosting), §10 (R2, snapshot), §11 (unduhan). Bagian lain tidak berubah.

## 1. Kenapa

Pilot di-deploy ke akun Cloudflare kantor. Akun itu tidak bisa memakai R2, karena R2 meminta kartu dan akun email kerjanya dipakai bersama. Pengguna memilih menyimpan foto di **Google Drive akun kerja (Google Workspace)**. Worker, D1, dan cron tetap di Cloudflare, karena ketiganya gratis tanpa kartu.

Pengguna sudah diberi tahu dan menerima beberapa hal:
- tampilan foto pertama kali lebih lambat (±0,5–2 detik), setelah itu cepat karena di-cache;
- aplikasi bergantung pada akun kerja yang disambungkan, dan bisa disambungkan ulang dengan akun lain;
- foto memakai kuota Drive akun itu;
- kalau IT kantor membatasi project Google Cloud, setup butuh bantuan IT.

## 2. Pendekatan

| Opsi | Keputusan |
|---|---|
| R2 dengan kartu | Ditolak: akun kantor dipakai bersama. |
| Workers KV (gratis, 1 GB, 1.000 tulis/hari) | Ditawarkan, tidak dipilih. |
| Supabase Storage (gratis 1 GB, tidur setelah 7 hari) | Ditawarkan, tidak dipilih. |
| **Google Drive Workspace lewat Drive API, OAuth akun kerja, scope `drive.file`** | **Dipilih** |
| Pindah total ke Netlify + Supabase | Ditolak: menulis ulang server. |

## 3. Perilaku

### 3.1 Penyimpanan foto (abstraksi `Store`)
- Satu modul `worker/store.ts` menyediakan:
  - `put(meta, bytes) → id`
  - `get(id) → Response | null`
  - `del(ids)`
  - `folderFor(periodId)`
  - `trashFolder(folderId)`
- Ada dua implementasi:
  - **Drive**: aktif bila secret `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` ada **dan** akun Drive sudah disambungkan (§3.4).
  - **D1-blob**: untuk dev lokal dan tes. Berkas disimpan sebagai BLOB di tabel `berkas_dev`.
- Di produksi, kalau Drive belum tersambung, upload ditolak dengan `503 {error:'penyimpanan_belum_siap'}`. Antrean di HP menyimpan foto dan mencoba lagi (perilaku "ulang" yang sudah ada), jadi foto tidak hilang. Produksi ditandai dengan var `STORAGE = "drive"` di `wrangler.jsonc`; dev lokal memakai `"d1"`.
- Kolom `photos.r2_key` berganti arti menjadi **ID berkas** (ID file Drive, atau kunci D1-blob). Namanya tetap, supaya tidak perlu migrasi ganti nama kolom. Komentar skema diperbarui.

### 3.2 Drive
- **Folder.** Root `Komisioning` dibuat sekali di My Drive akun yang tersambung; ID-nya disimpan di D1 (`pengaturan`). Folder periode `Komisioning/Des-2026` (label periode, `/` diganti `-`) dibuat saat dibutuhkan; ID-nya disimpan di `periods.drive_folder_id`.
  - Bila dua upload membuat folder bersamaan: `UPDATE … WHERE drive_folder_id IS NULL`. Folder yang kalah dihapus.
- **Nama berkas:** `{label}_{sisi}_{kode}.jpg`, misalnya `TL141_depan_AB1C-D2EF.jpg`. `label` adalah `unitLabel`; karakter `/\:*?"<>|` diganti `-`.
- **Upload:** multipart upload API (`uploadType=multipart`, `fields=id`). Berkas foto yang kalah (§8a) atau digantikan **dihapus permanen** (`DELETE files/{id}`), karena itu duplikat.
- **Baca foto:** `GET files/{id}?alt=media`. Hasilnya disimpan di Cache API Cloudflare (`caches.default`, kunci = URL `/api/photo/{kode}`) dengan `Cache-Control: public, max-age=31536000, immutable`. Kode Foto tidak berubah, jadi cache tidak pernah basi.
- **Token akses:**
  - Diperoleh dari refresh token lewat `https://oauth2.googleapis.com/token`.
  - Disimpan di D1 (`pengaturan`: `drive_access_token`, `drive_access_exp`) sampai 5 menit sebelum kedaluwarsa.
  - Kalau Google membalas 401, token di-refresh sekali lalu permintaan diulang.
  - Kalau refresh gagal karena `invalid_grant` (password diganti atau akun dicabut), status Drive menjadi "terputus" dan admin melihat peringatan.

### 3.3 Retensi
Cron tetap `0 16 * * *` (00.00 WITA). Untuk periode yang lewat `purge_after`:
1. buang **folder periode** ke Trash (`PATCH files/{folder} {trashed:true}`), cukup satu panggilan;
2. hapus baris `photos` periode itu, dicicil seperti sekarang;
3. tandai `purged_at`.

Di D1-blob, baris `berkas_dev` ikut dihapus.

### 3.4 Menyambungkan Drive (layar admin)
- Tab **Admin** mendapat bagian **"Penyimpanan foto"**:
  - status "Tersambung ke Google Drive: {email} · folder Komisioning" (dengan tautan ke folder), atau "Belum tersambung" / "Terputus, sambungkan ulang";
  - tombol **"Sambungkan Google Drive"** atau **"Ganti akun"**.
- Alurnya:
  1. `GET /api/admin/drive/mulai` (perlu sesi admin) membuat `state` acak, menyimpannya di D1 sebagai hash yang terikat ke sesi dengan umur 10 menit, lalu redirect ke Google OAuth. Parameternya: `access_type=offline`, `prompt=consent`, scope `https://www.googleapis.com/auth/drive.file openid email`, dan `redirect_uri = {origin}/api/admin/drive/kembali`.
  2. `GET /api/admin/drive/kembali` memeriksa `state` beserta sesinya, menukar `code` dengan token, menyimpan `refresh_token` dan email (dari `id_token`, tanpa verifikasi JWT karena didapat langsung dari endpoint token Google lewat TLS) di D1 `pengaturan`, lalu redirect ke `/admin/admin?drive=ok`.
  3. Ganti akun berarti mengulang alur yang sama. Folder root lama tidak dipakai lagi (ID root diatur ulang), dan foto lama tetap ada di Drive akun lama.
- `refresh_token` disimpan di D1. Siapa pun yang bisa membaca D1 juga sudah bisa men-deploy ulang Worker yang membaca secret, jadi enkripsi tambahan tidak menambah keamanan nyata. Catatan ponytail ini ditulis di kode.

### 3.5 Snapshot papan
- Dipindah dari R2 ke tabel D1 `snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, version INTEGER NOT NULL)`.
- ETag = `"{version}"`, sehingga 304 tetap berfungsi. Satu poll = 1 baris dibaca, jauh di bawah batas 5 juta per hari.

### 3.6 Lain-lain
- `wrangler.jsonc`: binding `r2_buckets` dihapus, ditambah `vars: { STORAGE: "drive" }`. Dev lokal memakai `.dev.vars` dengan `STORAGE=d1`, file tidak di-commit. README mencatat cara menyalinnya.
- `Env` = `{ DB; ASSETS; STORAGE: 'drive' | 'd1'; GOOGLE_CLIENT_ID?; GOOGLE_CLIENT_SECRET? }`.
- Subrequest per request Worker tetap jauh di bawah 50. Upload: token ≤ 1, folder ≤ 2, upload 1, hapus 1.

## 4. Data
Migrasi `0003_drive.sql`:
- tabel `pengaturan (k TEXT PRIMARY KEY, v TEXT NOT NULL)`;
- tabel `berkas_dev (id TEXT PRIMARY KEY, data BLOB NOT NULL)`;
- tabel `snapshot` (§3.5);
- tabel `drive_state (state_hash TEXT PRIMARY KEY, token_hash TEXT NOT NULL, exp INTEGER NOT NULL)`;
- kolom `periods.drive_folder_id TEXT`.

## 5. Deploy (dipandu, sekali)
1. **Google Cloud Console** (akun kerja):
   - buat project `komisioning`;
   - aktifkan **Google Drive API**;
   - OAuth consent screen tipe **Internal**;
   - buat OAuth client **Web application** dengan redirect `https://komisioning.<subdomain>.workers.dev/api/admin/drive/kembali` (ditambah `http://localhost:5173/api/admin/drive/kembali` untuk uji lokal).
2. `npx wrangler secret put GOOGLE_CLIENT_ID` dan `GOOGLE_CLIENT_SECRET`.
3. `npm run deploy`, lalu `npm run admin:create -- megasuperadmin <password acak> --remote`.
4. Login admin online → Admin → **Sambungkan Google Drive**.
5. Unggah Populasi, lalu impor Excel SHE.

## 6. Bukan tujuan
- Struktur subfolder per unit di Drive (cukup per periode, dengan nama berkas yang jelas).
- Memindahkan foto lama saat ganti akun.
- Service account atau Shared Drive (butuh admin Workspace).

## 7. Pengujian
- **Klien Drive** (`fetch` disuntikkan, tanpa jaringan):
  - refresh token → token disimpan;
  - token masih berlaku → tidak refresh;
  - 401 → refresh lalu ulang sekali;
  - `invalid_grant` → status terputus;
  - upload multipart mengirim metadata nama/parents yang benar dan mengembalikan id;
  - folder periode dibuat sekali, dan pembuatan bersamaan menghapus yang kalah;
  - `trashFolder` mengirim `trashed:true`.
- **Store D1-blob:** put/get/del.
- **Tes yang sudah ada** (upload §8a, public, purge, admin) tetap hijau dengan store D1-blob. Purge menghapus berkas dan baris; di Drive, purge memanggil `trashFolder`.
- **Snapshot dari D1:** ETag/304.
- **OAuth:**
  - `mulai` tanpa sesi → 401;
  - `kembali` dengan state salah, kedaluwarsa, atau milik sesi lain → 400;
  - state benar → refresh token tersimpan dan redirect.
- **Produksi tanpa Drive tersambung** → upload 503, dan antrean klien memperlakukannya sebagai "ulang", bukan dihapus.
