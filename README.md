# Komisioning

Aplikasi foto komisioning unit tambang. Mekanik membuka PWA di HP, memilih unit dari daftar SHE, lalu memotret empat sisi (Depan → Belakang → Kanan → Kiri). Setiap foto diberi watermark jam WITA, tanggal, lokasi GPS, dan Kode Foto. Foto yang dijepret tanpa sinyal disimpan di antrean HP dan terkirim sendiri begitu sinyal kembali. Admin mengunggah Excel SHE, memantau kelengkapan foto per unit, dan mengunduh foto (ZIP) atau rekap Excel. Halaman publik `/` menampilkan progres dan formulir Cek Kode Foto.

Teknologi: React + Vite (PWA) di Cloudflare Workers, database D1, foto disimpan di Google Drive kantor, dan cron harian untuk retensi.

## Pengembangan lokal

```sh
npm install
cp .dev.vars.example .dev.vars         # STORAGE=d1: foto disimpan di D1 lokal, tanpa Google
npm run db:local                       # migrasi D1 lokal
npm run admin:create -- <user> <pass>  # admin pertama (D1 lokal)
npm run dev                            # http://localhost:5173
```

- Admin: `/admin/login`. Mekanik: `/` di layar HP (lebar < 1024 px). Di layar lebar, `/` menampilkan halaman publik.
- Tes: `npm test`. Cek tipe: `npx tsc -b`.
- Untuk mencoba alur Google Drive di komputer sendiri, ubah `.dev.vars` menjadi `STORAGE=drive` dan tambahkan `GOOGLE_CLIENT_ID=...` dan `GOOGLE_CLIENT_SECRET=...` (isinya dari langkah 3 di bawah). Jangan commit `.dev.vars`.

## Deploy

Database D1 `komisioning` sudah ada di akun Cloudflare kantor (id-nya sudah di `wrangler.jsonc`). R2 tidak dipakai lagi. Ikuti langkah berurutan ini.

1. Masuk ke Cloudflare, lihat migrasi yang belum jalan, lalu jalankan (aman diulang):
   ```sh
   npx wrangler login
   npx wrangler d1 migrations list komisioning --remote
   npx wrangler d1 migrations apply komisioning --remote
   ```
2. Deploy: `npm run deploy`. Catat alamat yang muncul, `https://komisioning.<subdomain>.workers.dev`. Alamat ini juga ada di dashboard Cloudflare, Workers & Pages.
3. Siapkan Google Cloud dengan akun kerja (Google Workspace):
   1. Buat project baru di console.cloud.google.com.
   2. Aktifkan **Google Drive API** (APIs & Services, Library).
   3. Di OAuth consent screen, pilih Audience **Internal**. Kalau Internal tidak tersedia (akun bukan Workspace), pilih **External** lalu tekan **Publish app** (In production). Izin `drive.file` tidak sensitif, jadi tidak perlu verifikasi Google. Kalau dibiarkan di Testing, token kedaluwarsa tiap 7 hari dan Drive jadi "terputus" tiap minggu.
   4. Buat OAuth client, tipe **Web application**, dengan dua Authorized redirect URI:
      - `https://komisioning.<subdomain>.workers.dev/api/admin/drive/kembali` (alamat dari langkah 2)
      - `http://localhost:5173/api/admin/drive/kembali`

      Kalau memakai domain sendiri, daftarkan juga `https://<domain>/api/admin/drive/kembali`.
   5. Catat Client ID dan Client secret.
4. Simpan kunci Google di Cloudflare. Tempel nilainya saat diminta, jangan ditulis di file atau chat:
   ```sh
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   ```
5. Buat admin pertama (username huruf kecil, `a-z 0-9 . _ -`, 3 sampai 40 karakter):
   ```sh
   npm run admin:create -- <user> <pass> --remote
   ```
6. Buka aplikasi, login di `/admin/login`, lalu menu **Admin**, tekan **Sambungkan Google Drive** dan setujui akses dengan akun kantor.
7. Unggah file di menu **Populasi**, lalu impor Excel SHE.
8. Pastikan cron `0 16 * * *` (pukul 00.00 WITA) tercatat di dashboard Worker, bagian Triggers.

Di alamat `*.workers.dev`, cache Cloudflare tidak aktif, jadi setiap HP mengambil foto dari Drive saat pertama kali membukanya. Dengan domain sendiri, foto di-cache.

Admin berikutnya bisa ditambah dari menu **Admin** di aplikasi.

Sebelum impor SHE pertama tiap periode, unggah dulu file Populasi lewat menu **Populasi**. Unit yang diimpor sebelum itu ditandai "Tidak ada di populasi", dan unit seperti THDS 0007 / FR 0001 hanya ikut lewat populasi. Setelah populasi diperbarui, impor ulang file SHE.

## Naik ke Workers Paid

Di paket gratis, satu permintaan hanya boleh memakai sekitar 10 ms CPU. Karena itu hash password memakai PBKDF2 10.000 iterasi. Setelah pindah ke paket Paid:

1. Naikkan `PBKDF2_ITER` di `worker/password.ts`, misalnya ke `100_000`.
2. Jalankan `npm run deploy`.

Password lama tetap berlaku. Saat admin login berikutnya, hash-nya otomatis dibuat ulang dengan jumlah iterasi baru.

## Retensi foto

- Foto suatu periode dibuang otomatis pada akhir bulan berikutnya. Contoh: foto periode Des/2026 dihapus pada akhir Januari 2027. Prosesnya dijalankan cron harian pukul 00.00 WITA.
- Foto periode itu dipindahkan ke Sampah Google Drive (folder `Komisioning/<periode>`) dan baris fotonya dihapus. Google mengosongkan Sampah setelah 30 hari. Data unit tetap disimpan.
- Mulai H-7, dashboard admin menampilkan peringatan "Foto periode X akan dihapus dalam n hari, unduh sekarang".
- Upload ulang Excel periode yang sama tidak menghapus foto. Unit yang tidak ada lagi di file hanya disembunyikan dari daftar mekanik.

## Dokumen

- Spesifikasi: `docs/superpowers/specs/2026-11-21-monitoring-komisioning-design.md`
- Rencana implementasi: `docs/superpowers/plans/2026-11-21-monitoring-komisioning.md`
- Foto di Google Drive: `docs/superpowers/specs/2026-11-27-penyimpanan-google-drive-design.md` dan `docs/superpowers/plans/2026-11-27-penyimpanan-google-drive.md`
