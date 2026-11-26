# DESIGN.md: Papan Lapangan

## Konsep

App ini dipakai mekanik di workshop dan pos lapangan tambang, jadi tampilannya meniru papan status
di sana: rompi hi-vis, pita hazard kuning-hitam, dan stiker komisioning yang ditempel di unit.
Hitam, neon, dan kuning dipilih karena warna itu memang ada di site, bukan sebagai hiasan.

- **Neon** artinya lengkap atau aktif. **Oranye** artinya belum. **Kuning** artinya sebagian, dan
  dipakai juga untuk tombol jepret dan pita hazard.
- Site jalan 24 jam dan mekanik shift malam membuka app di tempat gelap. Karena itu ada mode gelap
  (`prefers-color-scheme: dark`) dengan palet yang dipilih sendiri, bukan hasil membalik warna.
- Kamera selalu gelap di kedua mode.

## Token

Sumber: `src/styles/tokens.css`. Jangan menambah warna di luar daftar ini.

| Token | Terang | Gelap | Dipakai untuk |
|---|---|---|---|
| `--bg` | `#EDEBE4` | `#16150F` | latar halaman |
| `--surface` | `#FBFAF6` | `#1F1E18` | sheet, tabel, kartu; teks di atas tombol `--ink` |
| `--text` | `#141414` | `#EDEBE4` | teks isi |
| `--ink` | `#141414` | `#EDEBE4` | garis 2 px, tepi kuat, tombol utama |
| `--head` | `#141414` | `#0B0B08` | header, tab bar, sidebar, pita pesan (selalu gelap) |
| `--on-head` / `--on-head-mut` | `#FFF` / `#B8B5AA` | sama | teks di atas `--head` |
| `--mut` | `#55534C` | `#A8A496` | teks sekunder |
| `--rule` | `#D9D6CC` | `#34332B` | garis tipis, kepala tabel, latar placeholder |
| `--neon` | `#C9F31D` | sama | lengkap, tab aktif |
| `--on-neon` | `#141414` | sama | teks di atas neon/kuning |
| `--or` | `#FF5A1F` | sama | belum (tepi, titik) |
| `--or-ink` | `#B33A00` | `#FF7A45` | teks oranye (error, peringatan) |
| `--yel` / `--yel-bg` | `#F5B800` / `#FFE9A6` | sama | sebagian, jepret, watermark |
| `--hazard` | kuning + `--head`, -45°, 10 px | sama | lihat aturan hazard |

`--or-ink` gelap berbeda dari terang karena `#B33A00` hanya 2,8–3,1:1 di latar gelap.

### Kontras teks (WCAG AA ≥ 4,5:1)

| Pasangan | Terang | Gelap |
|---|---|---|
| `--text` di `--bg` / `--surface` | 15,4 / 17,6 | 15,3 / 14,0 |
| `--mut` di `--bg` / `--surface` / `--rule` | 6,5 / 7,4 / 5,3 | 7,3 / 6,7 / 5,1 |
| `--or-ink` di `--bg` / `--surface` | 5,0 / 5,7 | 7,1 / 6,5 |
| `--surface` di tombol `--ink` | 17,6 | 14,0 |
| `--on-neon` di `--neon` / `--yel` / `--yel-bg` | 14,3 / 10,3 / 15,3 | sama |
| `--neon` / `--or` / `--on-head-mut` di `--head` | 14,3 / 5,9 / 9,0 | 15,3 / 6,3 / 9,6 |

`--or-ink` di `--rule` terang hanya 4,1:1, jadi teks oranye tidak boleh di atas `--rule`.

## Tipografi

- **Barlow Condensed** 700/800, huruf besar (kelas `.cond`, `--font-cond`): judul, skor, no lambung,
  tombol, filter, tab bar, kepala tabel. Hanya subset Latin 700 dan 800.
- Selama Barlow dimuat, cadangan lokal (Arial Narrow/Roboto Condensed, lalu Arial/Roboto) diskalakan
  dengan `size-adjust` yang diukur, supaya lebar teks hampir sama dan tata letak tidak melompat.
- **Inter Variable** (`--font`) untuk isi, form, dan pesan. Watermark tetap Inter dan tidak berubah.
- Angka yang berubah pakai `font-variant-numeric: tabular-nums`.
- Huruf besar dengan tracking lebar hanya untuk tanda/rambu. Tidak ada eyebrow di atas setiap bagian.

## Ruang, radius, bayangan

- Skala spasi: 4 / 8 / 12 / 16 / 24 / 32 px.
- Radius: stiker dan kartu 5 px (`--r-sticker`), tombol dan kolom 4 px (`--r-btn`),
  sheet 12 px hanya di sudut atas (`--r-sheet`).
- Pemisah tegas memakai garis `--ink` 2 px. Garis antarbaris memakai `--rule` 1 px.
- Tidak ada bayangan, kecuali sheet, karena hanya sheet yang benar-benar melayang di atas halaman.
- Tidak ada `backdrop-filter` atau kaca.

## Komponen dasar (`src/styles/base.css`)

- `.btn`: tombol utama, latar `--ink`, teks `--surface`, condensed 20 px. `.btn-2`: tepi 2 px `--ink`.
- `.chip` + `[aria-pressed="true"]`: filter. Aktif berlatar `--ink` dengan teks neon. Di mode gelap,
  aktif berisi neon, karena neon di atas `--ink` terang tidak terbaca.
- `.badge-no` / `.badge-ok`: stiker status. Belum = `--surface` bertepi oranye, lengkap = neon.
  Status selalu punya teks, tidak hanya warna.
- `.banner` (komponen `Pill`): pita hitam di atas layar untuk offline, error, dan sukses, dengan kotak
  kecil berwarna kuning (offline), oranye (peringatan), atau neon (info). Bukan toast.
- `.hazard`: pita 6 px. Hanya di tepi bawah header publik, tepi atas header admin dan kartu login,
  dan banner "foto akan dihapus".
- Sheet: `--surface`, tepi 2 px `--ink`, radius 12 px di atas, pegangan `--ink`.
- Kolom isian: `--surface`, tepi 2 px `--ink`. Bila salah, tepi oranye dan pesan `--or-ink`.
- Focus: `:focus-visible` dengan outline 3 px neon yang menempel di elemen, diapit tepi 2 px `--ink`
  di luarnya. Pada tombol `--ink`, neon kontras dengan isi tombol. Pada latar terang, tepi `--ink`
  kontras dengan latar. Jadi cincin selalu mengubah piksel di sekitar elemen, juga bagi pengguna buta
  warna. Baris di wadah yang memotong (`.ut-row`, foto di `.cek-card`) memakai cincin yang
  sama tetapi digambar ke dalam. Penanda status (`.tab`, `.adm-nav`, `.ut-row` aktif) tetap terlihat
  saat difokus.

## Papan Stiker (`src/styles/papan.css`)

- `.sticker[data-s]`: `<button>` minimal 44×44 px, radius 5 px, condensed 20 px (22 px di ≥ 1024 px), lubang
  bulat berwarna `--bg`. `lengkap` = neon, `sebagian` = `--yel-bg` bertepi `--yel` + label "n/4",
  `belum` = `--surface` bertepi 2 px `--or`. No lambung panjang dibungkus, tidak dipotong.
- Kepala grup: garis `--ink` 2 px di atas, nama jenis condensed, "x/y lengkap" `--mut`.
- Di ≥ 1024 px grup berjajar (`auto-fill`, min 440 px) dan tab bar papan diganti tautan header.

## Gerak

- Micro 120–250 ms (tekan, filter, pita pesan), macro 200–400 ms (sheet). Kurva `--ease-out`.
- Hanya `transform` dan `opacity`. Tanpa `transition: all`.
- `.press`: `scale(.97)` 100 ms, bereaksi saat jari menyentuh.
- Mengetik dan scroll tidak dianimasikan.
- `prefers-reduced-motion`: semua transisi CSS jadi langsung (aturan global di `base.css`). Tekanan
  diganti opacity, sheet diganti cross-fade (`Sheet.tsx`).

## Larangan

- Eyebrow huruf besar di atas setiap bagian.
- Kaca buram (`backdrop-filter`), gradien hiasan, ikon dalam kotak bulat.
- `alert()`, `confirm()`, `prompt()`, dan library toast.
- Status yang hanya dibedakan warna.
- Nama atau NRP mekanik di halaman publik.
- Warna di luar token, bayangan selain sheet, radius besar ala iOS.
