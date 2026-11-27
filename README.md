# Komisioning

Aplikasi foto komisioning unit tambang. Mekanik membuka PWA di HP, memilih unit dari daftar SHE, lalu memotret empat sisi (Depan → Belakang → Kanan → Kiri). Setiap foto diberi watermark jam WITA, tanggal, lokasi GPS, dan Kode Foto. Foto yang dijepret tanpa sinyal disimpan di antrean HP dan terkirim sendiri begitu sinyal kembali. Admin mengunggah Excel SHE, memantau kelengkapan foto per unit, dan mengunduh foto (ZIP) atau rekap Excel. Halaman publik `/` menampilkan progres dan formulir Cek Kode Foto.

Teknologi: React + Vite (PWA) di Cloudflare Workers, database D1, penyimpanan foto R2, dan cron harian untuk retensi.

## Pengembangan lokal

```sh
npm install
npm run db:local                       # migrasi D1 lokal
npm run admin:create -- <user> <pass>  # admin pertama (D1 lokal)
npm run dev                            # http://localhost:5173
```

- Admin: `/admin/login`. Mekanik: `/` di layar HP (lebar < 1024 px). Di layar lebar, `/` menampilkan halaman publik.
- Tes: `npm test`. Cek tipe: `npx tsc -b`.

## Deploy pilot (paket gratis Cloudflare)

1. Masuk ke akun Cloudflare: `npx wrangler login`.
2. Buat database dan bucket:
   ```sh
   npx wrangler d1 create komisioning
   npx wrangler r2 bucket create komisioning-foto
   ```
3. Salin `database_id` dari keluaran langkah 2 ke `wrangler.jsonc` (ganti `"local"`).
4. Jalankan migrasi di database Cloudflare:
   ```sh
   npx wrangler d1 migrations apply komisioning --remote
   ```
5. Deploy: `npm run deploy`. Aplikasi ada di `https://komisioning.<akun>.workers.dev`.
6. Buat admin pertama di database Cloudflare:
   ```sh
   npm run admin:create -- <user> <pass> --remote
   ```
7. Pastikan cron `0 16 * * *` (pukul 00.00 WITA) tercatat di dashboard Worker, bagian Triggers.

Admin berikutnya bisa ditambah dari menu **Admin** di aplikasi.

Sebelum impor SHE pertama tiap periode, unggah dulu file Populasi lewat menu **Populasi**. Unit yang diimpor sebelum itu ditandai "Tidak ada di populasi", dan unit seperti THDS 0007 / FR 0001 hanya ikut lewat populasi. Setelah populasi diperbarui, impor ulang file SHE.

## Naik ke Workers Paid

Di paket gratis, satu permintaan hanya boleh memakai sekitar 10 ms CPU. Karena itu hash password memakai PBKDF2 10.000 iterasi. Setelah pindah ke paket Paid:

1. Naikkan `PBKDF2_ITER` di `worker/password.ts`, misalnya ke `100_000`.
2. Jalankan `npm run deploy`.

Password lama tetap berlaku. Saat admin login berikutnya, hash-nya otomatis dibuat ulang dengan jumlah iterasi baru.

## Retensi foto

- Foto suatu periode dihapus otomatis pada akhir bulan berikutnya. Contoh: foto periode Des/2026 dihapus pada akhir Januari 2027. Penghapusan dijalankan cron harian pukul 00.00 WITA.
- Yang dihapus hanya berkas foto di R2 dan baris fotonya. Data unit tetap disimpan.
- Mulai H-7, dashboard admin menampilkan peringatan "Foto periode X akan dihapus dalam n hari, unduh sekarang".
- Upload ulang Excel periode yang sama tidak menghapus foto. Unit yang tidak ada lagi di file hanya disembunyikan dari daftar mekanik.

## Dokumen

- Spesifikasi: `docs/superpowers/specs/2026-11-21-monitoring-komisioning-design.md`
- Rencana implementasi: `docs/superpowers/plans/2026-11-21-monitoring-komisioning.md`
