# Revisi: Unit Support Saja, Papan Stiker, Bahasa Visual "Papan Lapangan"

Tanggal: 25 November 2026 · Status: draf untuk disetujui
Mengubah: `2026-11-21-monitoring-komisioning-design.md` (selanjutnya disebut "spec lama")
Mockup acuan (tidak di-commit): `.superpowers/brainstorm/76480-1795276598/content/landing-arah-baru.html` (opsi A) dan `bahasa-visual.html` (opsi P)

---

## 1. Kenapa ada revisi

Pada 22 Nov pengguna mencoba aplikasi secara lokal (Fase 1–4 dan Task 20 sudah selesai). Ada tiga hal yang mereka anggap salah:

1. **Unitnya kebanyakan.** Halaman menampilkan 399 unit dari semua section, padahal app ini khusus section support.
2. **Halaman awal membingungkan.** Halaman awal tidak interaktif, tidak informatif, dan tidak menjawab pertanyaan utama, yaitu *"unit mana yang belum difoto dan unit mana yang sudah"*. Tulisan "diperbarui 1, 2, 3 … detik lalu" yang terus berganti dinilai berlebihan.
3. **Tampilannya terasa buatan AI** di semua layar.

Halaman ini dibaca oleh mekanik, supervisor, group leader, dan siapa pun yang punya link. Mereka hanya perlu sekali lihat untuk tahu posisi pekerjaan.

**Sukses berarti:** seseorang membuka link, dan dalam beberapa detik tahu berapa unit support yang sudah lengkap, unit mana saja yang belum, lalu bisa langsung mengetuk unit untuk melihat fotonya atau memotretnya.

## 2. Keputusan pengguna

| # | Keputusan | Sumber |
|---|---|---|
| K1 | Hanya unit section support: **Kelompok Unit `NON UNIT` atau `SUPPORT`** dan **Perusahaan `PPA` atau `AMM`**. | pesan pengguna 22 Nov |
| K2 | Pengecualian yang tetap masuk: **THDS 0007** (Perusahaan TU) dan **FR 0001** (Perusahaan "-"), karena keduanya tanggung jawab support. | "betul thds07 dan fr0001 tanggung jawab support" |
| K3 | Halaman awal = **opsi A "Papan Stiker"**. | "secara visual dan informatif sih saya suka yang A" |
| K4 | Seluruh app memakai **bahasa visual P "Papan Lapangan"**. | "gas P" |
| K5 | Tidak ada lagi hitungan "n detik lalu". | pesan pengguna 22 Nov |

Pada Excel contoh (`Deadline_Pengajuan_Komisioning_20261120_234805.xlsx`, 399 baris), aturan K1 menghasilkan 82 unit. Ditambah K2, totalnya **84 unit**. Hasil ini cocok dengan sheet "PPA & AMM - Active" di file populasi (SECTION = SUPPORT).

## 3. Pendekatan yang dipertimbangkan

**Halaman awal** (dipilih pengguna di mockup):

| Opsi | Bentuk | Keputusan |
|---|---|---|
| **A. Papan Stiker** | Semua unit tampil sebagai "stiker" berwarna per jenis unit. Status terbaca dari warna sekilas. | **Dipilih** |
| B. Dua Daftar | Kolom "Belum" dan kolom "Sudah". | Ditolak: tidak terlihat per jenis unit, dan daftar panjang harus di-scroll. |
| C. Per Jenis Unit | Kartu progres per jenis unit, isinya baru terlihat setelah dibuka. | Ditolak: perlu ketukan ekstra untuk melihat unit mana yang belum. |

**Bahasa visual:**

| Opsi | Bentuk | Keputusan |
|---|---|---|
| **P. Papan Lapangan** | Garis hazard kuning-hitam, angka besar condensed, warna hi-vis, latar abu hangat. | **Dipilih** |
| C. Checksheet | Kertas bergaris, font mono, biru formulir. | Ditolak oleh pengguna. |
| iOS Native + Hi-Vis (spec lama §7.1) | — | Ditolak: terasa template. |

**Tempat penyaringan unit support** *(pilihan saya)*:

| Opsi | Untung | Rugi | Keputusan |
|---|---|---|---|
| **Di browser admin saat parse Excel** | Satu fungsi kecil di `shared/`. Unit non-support tidak pernah masuk DB. Pratinjau impor bisa menyebut jumlahnya. | Kalau daftar pengecualian berubah, perlu deploy ulang. | **Dipilih** |
| Di Worker saat impor | Tidak bisa dilewati admin. | Admin adalah pihak tepercaya, jadi tidak ada manfaat nyata, dan pratinjau tetap perlu logika yang sama. | Ditolak |
| Daftar pengecualian bisa diedit admin | Tanpa deploy. | Butuh tabel, endpoint, dan layar baru untuk 2 unit. | Ditolak (YAGNI). Tambahkan bila pengecualian sering berubah. |

## 4. Tujuan, bukan-tujuan, anti-tujuan revisi

**Tujuan**
- Hanya unit support yang tersimpan dan tampil.
- Satu halaman awal, "Papan Stiker", untuk HP dan layar lebar, yang menjawab "sudah/belum" dalam sekali lihat.
- Semua layar (mekanik, publik, admin, kamera) memakai bahasa visual P secara konsisten, termasuk mode gelap yang dirancang (lihat §7.4).
- Lighthouse mode mobile ≥ 93 di keempat kategori. LCP < 2,5 s, INP < 200 ms, CLS < 0,1. Ini **gerbang wajib**: fase belum selesai bila ada kategori di bawah 93 (standar proyek pengguna).

**Bukan tujuan**
- Mengubah kamera, watermark, antrean offline, aturan §8a, unduhan, atau auth. Yang berubah hanya tampilannya.
- Layar untuk mengedit daftar pengecualian, atau dukungan section lain.
- Migrasi data lama. Pilot belum pernah di-deploy, dan data lokal cukup diimpor ulang.

**Anti-tujuan** (tetap dianggap gagal walaupun berfungsi)
- Masih terasa template: kartu putih seragam, kaca buram, gradien hiasan, eyebrow huruf besar di atas setiap judul, ikon dalam kotak bulat.
- Status hanya dibedakan lewat warna, sehingga buta warna tidak bisa membacanya.
- Angka atau teks yang terus berganti tanpa ada data baru.

## 5. Lingkup unit support (K1, K2)

- Fungsi baru di `shared/rules.ts`: `isSupportUnit(u: ImportUnit): boolean`.
  - `true` bila `kelompok_unit` ∈ {`NON UNIT`, `SUPPORT`} **dan** `perusahaan` ∈ {`PPA`, `AMM`};
  - atau bila `no_lambung` ada di konstanta `SUPPORT_PENGECUALIAN = ['THDS 0007', 'FR 0001']`.
  - Semua perbandingan dilakukan setelah di-*trim*, dijadikan huruf besar, dan spasi ganda dirapatkan. Dengan begitu `thds  0007` dan `THDS 0007` dianggap sama.
- Fungsi ini dipakai di `src/admin/excel.ts`, sesudah baris dipetakan dan sebelum dikirim ke Worker. Baris non-support dibuang dan tidak pernah dikirim.
- Pratinjau impor menampilkan **"84 unit support dari 399 baris"**, lalu daftar ringkasan periode/week seperti sekarang.
- File yang tidak berisi unit support sama sekali menampilkan pesan *"File ini tidak berisi unit section support (Kelompok NON UNIT/SUPPORT, perusahaan PPA/AMM)."* Tombol impor dinonaktifkan.
- Impor ulang periode yang sudah ada tetap memakai mekanisme lama: unit yang tidak ada lagi di kiriman mendapat `in_latest_upload = 0`. Dengan begitu, unit non-support dari impor lama otomatis tersembunyi.
- **Worker tidak ikut menyaring** *(pilihan saya)*.
  - Snapshot publik dan layar admin (`UnitTable`, `UnitDetail`) menampilkan semua unit yang tersimpan, dan itu hanya unit support karena penyaringan terjadi saat impor.
  - Tidak ada migrasi, karena produksi belum pernah di-deploy. D1 lokal yang masih berisi 399 unit uji cukup dikosongkan dan diimpor ulang. Langkah ini masuk rencana sebagai satu langkah cek manual, bukan kode.

## 6. Halaman awal: Papan Stiker (K3, K5)

Satu layar `/` untuk semua lebar layar. Layar ini **menggantikan** `UnitList` (HP) dan `Landing` (laptop/TV) dari spec lama §7.2 butir 1–2. Sumber datanya tetap snapshot yang di-poll setiap 15 detik.

```
┌──────────────────────────────────────────┐
│ KOMISIONING SECTION SUPPORT   [Cek kode] │  ← header hitam
│ 31 dari 84 lengkap · 53 belum            │  ← angka besar condensed
│ Periode Des/2026 · Data 14:05            │
│▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚▚│  ← garis hazard
│ [SEMUA] [BELUM] [SUDAH]   Week ▾  🔍 Cari│
│──────────────────────────────────────────│
│ GENSET                       9/14 lengkap│
│ (●GS 0012) (●GS 0031 2/4) (○GS 0044) …   │  ← stiker
│ LUBE TRUCK                  4/13 lengkap │
│ …                                        │
├──────────────────────────────────────────┤
│   PAPAN   │   ANTREAN · 2                │  ← tab bar (HP saja)
└──────────────────────────────────────────┘
```

**Header**
- Judul "Komisioning Section Support", lalu skor **"x dari N lengkap · y belum"**.
  - `N` = unit yang tampil (bagian `aktif` + `selesai` dari `classifyForMechanic`).
  - `x` = unit lengkap.
  - `y` = `N − x`, sudah termasuk unit yang baru sebagian.
  - Skor header **tidak ikut filter apa pun** (status, week, cari). Skor ini selalu menggambarkan seluruh unit support yang tampil, supaya angkanya sama di HP siapa pun.
- **"Data HH:MM"**: jam WITA dari `snapshot.version`, tanpa detik. Teks ini hanya berubah saat snapshot baru benar-benar masuk. Saat offline, tampil **"Data HH:MM · offline"**.
- Label periode: satu periode → "Periode Des/2026". Lebih dari satu → "Periode Des/2026 + Jan/2027".
- Tautan **Cek kode** ke `/cek` (fitur lama, tetap ada).

**Filter** *(status filter tidak disimpan; ponytail)*
- Tombol **Semua / Belum / Sudah**, default Semua. Belum = belum lengkap (0–3 sisi). Sudah = lengkap.
- Pilihan **Week**: "Semua week" atau satu week. Bila ada lebih dari satu periode, label week diberi awalan periode ("Des/2026 · W2").
- **Cari no lambung**: tanpa membedakan huruf besar/kecil dan mengabaikan spasi, jadi "gs12" menemukan "GS 0012" bila angkanya cocok sebagai substring setelah spasi dihapus.

**Grup & stiker**
- Grup per jenis unit, digabung tanpa membedakan huruf besar/kecil. Nama grup ditampilkan dalam huruf besar.
  - Grup diurutkan alfabetis, dan stiker di dalam grup diurutkan menurut no lambung.
  - Grup yang kosong setelah difilter disembunyikan.
  - Kepala grup: "GENSET" dan "9/14 lengkap". Angka ini dihitung dari isi grup yang lolos filter week/cari, tapi sebelum filter status. Jadi saat filter "Belum" aktif, angkanya tetap jujur.
- Stiker berisi no lambung dan sebuah "lubang" bulat seperti stiker sungguhan. Status tidak hanya ditandai warna:
  - **Lengkap**: latar neon dengan teks gelap.
  - **Sebagian**: latar kuning muda, tepi kuning, teks "2/4".
  - **Belum**: latar putih, tepi oranye 2 px, lubang kosong.
  - `aria-label` contohnya "GS 0031, 2 dari 4 sisi".
- Stiker berupa `<button>`. Mengetuknya membuka **Sheet Unit**.

**Sheet Unit** *(pilihan saya; lihat §11)*
- Isi:
  - no lambung, jenis unit, perusahaan;
  - berlaku akhir dan sisa hari (merah bila ≤ 7 hari);
  - week.
- Ada 4 kotak sisi (Depan, Belakang, Kanan, Kiri). Sisi yang sudah ada fotonya menampilkan thumbnail dari `/api/photo/:kode` dan jam jepret. Sisi kosong bertuliskan "Belum difoto".
- Mengetuk thumbnail memperbesar foto di sheet yang sama. **Nama mekanik tidak pernah tampil.**
- Foto tidak di-cache service worker. Saat offline atau gagal dimuat, kotak sisi bertuliskan "Foto belum bisa dimuat" dengan jam jepret tetap tampil (dari snapshot), sehingga status sisi tetap jelas.
- Tombol utama:
  - unit belum lengkap → **"Foto sisi yang kurang"**, membuka `/unit/:id/kamera`;
  - unit lengkap → tombol sekunder **"Foto ulang"**.
- Memakai komponen `Sheet` yang sudah ada.

**Yang dihapus**
- Bagian "Selesai" yang bisa dibuka-tutup. Unit lengkap sekarang menjadi stiker neon di papan yang sama.
- "Foto terbaru masuk", "Paling mendesak", kartu progres per week, dan indikator "diperbarui n detik lalu".
- `Snapshot.recent` dihapus dari tipe, dari pembangun snapshot di Worker, dan dari tesnya.
- `src/screens/Landing.tsx` dan `UnitList.tsx` digantikan oleh `src/screens/Papan.tsx`. Kode yang tidak terpakai lagi ikut dihapus.

**Tab bar**: hanya di bawah 1024 px. Isinya "Papan" dan "Antrean · n", berupa batang hitam dengan garis bawah neon pada tab aktif. Di layar lebar tidak ada tab bar. Bila antrean > 0, header menampilkan tautan "Antrean · n".

**Keadaan khusus**
- **Belum ada periode:** "Belum ada data unit. Admin perlu mengunggah Excel SHE."
- **Filter tanpa hasil:** "Tidak ada unit yang cocok." dengan tombol "Hapus filter".
- **Memuat pertama kali tanpa cache:** kerangka 3 grup abu-abu yang tidak bergerak.
- **Gagal memuat tanpa cache:** "Belum bisa memuat data. Periksa sinyal, nanti dicoba lagi otomatis."

**Gerak**
- Saat poll mengubah status sebuah stiker, warnanya berganti dengan satu denyut skala 1 → 1,06 → 1 selama 200 ms, hanya sekali dan hanya pada stiker itu.
- Angka skor bergulir memakai `Count` yang sudah ada.
- Dengan `prefers-reduced-motion`, kedua efek di atas diganti pergantian warna langsung.

## 7. Bahasa visual P "Papan Lapangan" (K4)

Konsepnya: papan status di workshop/pos lapangan, dengan warna rompi hi-vis, pita hazard, dan stiker komisioning. Inilah alasan memakai hitam + neon + kuning: warna itu datang dari dunia pengguna (rompi, rambu, pita hazard di site), bukan hiasan. Semua token didokumentasikan di **`DESIGN.md`** (file baru di root) dan diterapkan lewat `src/styles/tokens.css`.

### 7.1 Token (terang)

| Token | Nilai | Dipakai untuk |
|---|---|---|
| `--bg` | `#EDEBE4` | latar halaman (abu hangat seperti papan) |
| `--surface` | `#FBFAF6` | sheet, tabel, kartu login |
| `--ink` | `#141414` | teks utama, header, tab bar, garis 2 px |
| `--mut` | `#55534C` | teks sekunder (≥ 4,5:1 di `--bg`) |
| `--rule` | `#D9D6CC` | garis tipis, kepala tabel admin |
| `--neon` | `#C9F31D` | lengkap, tab aktif (selalu dengan teks `--ink`) |
| `--or` | `#FF5A1F`, teks `#B33A00` | belum |
| `--yel` | `#F5B800`, latar `#FFE9A6` | sebagian, tombol jepret, garis hazard |
| hazard | `repeating-linear-gradient(-45deg, var(--yel) 0 10px, var(--ink) 10px 20px)` | tepi bawah header publik, tepi atas header admin, banner "foto akan dihapus" |

Spec lama §7.1 dan `tokens.css` lama (`--fill`, `--separator`, kaca, radius 14/20/32) diganti seluruhnya.

### 7.2 Tipografi
- **Barlow Condensed** 700/800, huruf besar. Dipakai untuk judul, skor, no lambung (stiker, kamera, tabel), tombol filter, tab bar, dan kepala tabel.
  - Self-host lewat `@fontsource/barlow-condensed`, hanya bobot 700 dan 800, subset Latin, dengan `font-display: swap`.
- **Inter Variable** (sudah terpasang) untuk teks isi, form, dan pesan.
- Watermark tetap memakai Inter seperti spec lama §8. Watermark **tidak berubah**.
- IBM Plex Mono dari mockup tidak dipakai, karena hanya muncul di satu label GPS. Angka di kamera cukup memakai Inter dengan `font-variant-numeric: tabular-nums`.
- Huruf besar dengan tracking lebar hanya dipakai di judul dan label yang memang berupa tanda/rambu. Tidak ada eyebrow di atas setiap bagian.

### 7.3 Bentuk & komponen
- **Bentuk:** radius kecil (stiker 5 px, tombol 4 px, sheet 12 px di sudut atas). Pemisah memakai garis `--ink` 2 px. Tanpa bayangan, kecuali sheet. Tanpa `backdrop-filter`/kaca.
- **Tombol:**
  - utama: latar `--ink`, teks putih, huruf condensed besar;
  - sekunder: tepi 2 px `--ink`;
  - filter aktif: latar `--ink` dengan teks neon;
  - saat ditekan: `scale(.97)` selama 100–120 ms.
- **Focus:** outline 3 px neon dengan tepi dalam `--ink`, sehingga terlihat di latar terang maupun gelap.
- **Pesan/notifikasi** (offline, foto tersimpan, error): pita hitam di atas dengan ikon kecil dan teks putih, bukan toast template.

**Per layar**

| Layar | Perubahan |
|---|---|
| Kamera | Kotak langkah sisi: selesai = neon, sedang = kuning, sisanya garis tipis. No lambung memakai condensed. Tombol jepret kuning. Bagian lain tetap gelap seperti sekarang. |
| Sheet setelah jepret, `MekanikSheet` | Gaya sheet P dengan judul condensed dan tombol P. |
| Antrean | Baris dipisah garis 2 px. Status pakai pil gaya stiker. |
| Cek kode (`/cek`) | Header P. Hasil dalam kartu `--surface` bertepi `--ink`. |
| `InstallGuide` | Gaya sheet P. |
| Login admin | Kartu `--surface` dengan pita hazard tipis di atasnya. Tombol lihat/sembunyikan password tetap ada. |
| Admin |   |
|  · Sidebar | Hitam, item aktif bergaris bawah neon. |
|  · Tabel | Kepala condensed huruf besar di latar `--rule`. No lambung condensed 18 px. Status memakai pil gaya stiker. |
|  · Impor, Unduhan, Admins | Komponen P yang sama. |

### 7.4 Mode gelap *(pilihan saya, mengikuti standar proyek web pengguna; lihat §11)*
- Mode gelap mengikuti `prefers-color-scheme: dark`, dengan palet yang dipilih khusus, bukan hasil membalik warna:
  - `--bg #16150F`, `--surface #1F1E18`;
  - `--ink` untuk teks `#EDEBE4`, `--mut #A8A496`, `--rule #34332B`.
- Neon, kuning, dan oranye tetap. Stiker "belum" berlatar `--surface` dengan tepi oranye.
- Header tetap hitam (`#0B0B08`) supaya garis hazard tetap terbaca.
- Alasannya: site beroperasi 24 jam, dan mekanik shift malam membuka app di tempat gelap.
- Kamera sudah gelap dan tidak berubah.
- Bukan-tujuan di spec lama §4 ("Mode gelap untuk tampilan mekanik") **dibatalkan**.

### 7.5 Gerak
- **Micro** (120–250 ms, ease-out kuat): tekan tombol, ganti filter, denyut stiker.
- **Macro** (200–400 ms): sheet naik/turun dengan pegas lama yang bisa ditarik.
- Hanya `transform`/`opacity`. Tanpa `transition: all`. Sentuhan yang dipakai ratusan kali sehari (mengetik di kolom cari, scroll) tidak dianimasikan.
- `prefers-reduced-motion` diganti cross-fade atau pergantian langsung.

## 8. Dampak ke spec lama

| Spec lama | Status |
|---|---|
| §2 baris "Publik" | Landing = Papan Stiker + cek Kode Foto. Tidak ada lagi "foto terbaru" dan "unit mendesak". |
| §3 butir 2 dan 4 | Daftar mekanik = Papan Stiker. Bagian "Selesai" diganti stiker neon. Aturan unit yang disembunyikan (status SHE, lewat expired, `in_latest_upload`) **tetap berlaku**. |
| §4 bukan-tujuan "mode gelap" | Dibatalkan (§7.4). |
| §5 skill wajib | Ditambah standar proyek pengguna: humanize untuk semua teks UI, `security-review`, `ponytail-review`, `simplify`, `graphify --update`, dan bersih-bersih sisa tes di akhir setiap fase. |
| §7.1–7.3 | Diganti §6–7 dokumen ini. |
| §10 impor Excel | Ditambah penyaringan support (§5). Endpoint "foto terbaru" dan `Snapshot.recent` dihapus. |
| §12 performa | Target menjadi Lighthouse mobile ≥ 93 di keempat kategori. |
| §8, §8a, §9, §11 | Tidak berubah. |

## 9. Pengujian

Satu cek yang bisa dijalankan (Vitest) untuk setiap logika baru:
- **`isSupportUnit`:**
  - file contoh menghasilkan tepat **84** unit;
  - `THDS 0009` (PPA, SUPPORT) masuk lewat aturan biasa;
  - `THDS 0007` (TU) dan `FR 0001` ("-") masuk lewat pengecualian;
  - unit `WHEEL`/PPA tidak masuk;
  - variasi spasi dan huruf (`thds  0007`, ` ppa `) dinilai sama.
- **Fungsi murni pengelompokan papan** (mis. `boardGroups(units, {status, week, q}, now)` di `shared/` atau `src/lib/`):
  - urutan grup dan stiker;
  - penggabungan `TELEHENDLER` vs `Telehendler`;
  - angka "n/m lengkap" tidak terpengaruh filter status;
  - filter Belum/Sudah, week, dan cari ("gs12");
  - unit tersembunyi tidak ikut.
- **Snapshot Worker** tidak lagi berisi `recent`, dan tes lama disesuaikan.
- **Manual / headless:**
  - Papan di 320 px, 390 px, 1024 px, dan 1920 px, dalam mode terang dan gelap;
  - data terburuk (no lambung panjang, 1 grup berisi 40 unit, 0 unit, 3 periode);
  - kontras AA;
  - Lighthouse mobile ≥ 93 × 4.

## 10. Diserahkan ke builder

- Struktur komponen Papan dan Sheet Unit, dengan syarat `Landing` dan `UnitList` yang lama dihapus dan tidak ada dua implementasi yang hidup berdampingan.
- Cara memuat Barlow Condensed tanpa menggeser layout (CLS), misalnya `size-adjust` pada fallback atau preload hanya bobot 800.
- Nilai persis warna mode gelap di luar yang disebut §7.4, selama kontras AA terpenuhi dan dicatat di `DESIGN.md`.
- Pembagian tugas antara CSS lama (`base`, `screens`, `landing`, `admin`) dan CSS baru, selama hasil akhirnya tidak menyisakan token lama.

## 11. Pilihan yang saya buat (silakan koreksi)

1. **Ketuk stiker membuka Sheet Unit** (4 foto + tombol "Foto sisi yang kurang"), tidak langsung membuka kamera. Alasannya: supervisor dan group leader yang hanya ingin melihat tidak tiba-tiba diminta izin kamera. Bagi mekanik, selisihnya hanya satu ketukan.
2. **"Foto terbaru masuk" dan "Paling mendesak" dihapus.** Sisa hari tetap terlihat di Sheet Unit, dan merah bila ≤ 7 hari.
3. **Penyaringan support dilakukan di browser admin.** Daftar pengecualian berupa konstanta di kode, jadi mengubahnya perlu deploy.
4. **Mode gelap dipasang di semua layar**, mengikuti standar proyek web Anda (shift malam). Ini membatalkan bukan-tujuan lama.
5. **Tab bar hanya di HP**. Di layar lebar/TV, antrean muncul di header bila ada isinya.
6. **Status filter tidak diingat** saat halaman dibuka ulang. Selalu mulai dari "Semua".
7. **Skor header ("x dari 84 lengkap") tidak berubah oleh filter.** Angka per grup ikut filter week/cari.
8. **Worker dan layar admin tidak menyaring ulang.** Karena penyaringan terjadi saat impor, D1 lokal cukup dikosongkan lalu diimpor ulang. Tidak ada migrasi data.
9. **Foto di Sheet Unit butuh sinyal.** Saat offline, status sisi dan jam jepret tetap terlihat.
