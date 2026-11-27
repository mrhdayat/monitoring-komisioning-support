# Desain: Populasi Unit Support (Code Unit & SKR BIB)

Tanggal: 27 November 2026 · Status: disetujui pengguna ("setuju gas")
Mengubah: `2026-11-25-revisi-support-papan-stiker-design.md` §5 (lingkup support) dan §6 (label stiker).
Data acuan (tidak di-commit): `~/Downloads/01. Populasi & Status Unit A2B & A2S Update November 2026 (DI COPY YA JANGAN DI CUT& DEL)..xlsx`, sheet "PPA & AMM - Active".

## 1. Kenapa

Pengguna menyerahkan file populasi resmi unit support. Di file itu setiap unit punya **Code Unit** (nama yang dikenal mekanik di lapangan, misalnya `TL141`) dan **SKR BIB** (misalnya `TL0141`). Masalahnya, Excel SHE sering menulis unit yang sama dengan nama lain (`PPA - TL 0141`).

Pengguna memutuskan:
1. Stiker di papan menampilkan **Code Unit**.
2. Usul saya disetujui:
   - populasi diunggah admin dan disimpan di server;
   - unit dianggap support bila cocok dengan populasi **atau** memenuhi aturan lama;
   - unit yang tidak cocok tetap tampil dan ditandai untuk dicek admin.

Pengguna bertanya apakah cara ini aman ke depannya. Jawabannya ada di §4.

## 2. Pendekatan

| Opsi | Untung | Rugi | Keputusan |
|---|---|---|---|
| **Populasi diunggah sekali, disimpan di D1** | Berlaku untuk semua admin (4–5 orang, perangkat berbeda). Cukup diunggah ulang saat ada update. | Butuh tabel, 2 endpoint, dan 1 layar admin. | **Dipilih** |
| File populasi dipilih setiap kali impor SHE | Tanpa tabel atau endpoint baru. | Gampang lupa, dan setiap admin harus punya filenya. | Ditolak |
| Populasi ditanam di kode | Paling sedikit kode. | Setiap update butuh deploy. | Ditolak |

## 3. Perilaku

### 3.1 Unggah populasi (layar admin baru "Populasi")
- Admin memilih file `.xlsx`. Browser membaca sheet **"PPA & AMM - Active"**. Bila sheet itu tidak ada, dipakai sheet pertama yang punya kolom yang dibutuhkan.
- Baris header dicari dari sel yang berisi `SECTION`. Kolom yang dipakai:
  - `TYPE UNIT`, `SECTION`, `MAINTENANCE BY`, `CODE UNIT`, `SKR BIB`.
  - Judul kolom dibandingkan setelah spasi dan baris baru dirapatkan, karena di file aslinya tertulis `CODE\nUNIT` dan `MAINTENANCE \nBY`.
- Yang disimpan hanya baris `SECTION = SUPPORT` yang punya Code Unit. Pada file November hasilnya **334 unit** (PPA 322, AMM 12).
- Pratinjau:
  - "334 unit support · 13 jenis";
  - daftar jumlah per jenis;
  - peringatan nama ganda, misalnya "2 SKR BIB dipakai lebih dari satu unit: GS6001, GS6002".
  - Setelah itu ada tombol "Simpan populasi".
- Menyimpan berarti **mengganti seluruh** populasi lama, dengan waktu unggah dicatat.
- Layar ini juga menampilkan populasi yang sedang aktif: jumlah unit dan waktu unggah. Ada catatan *"Perubahan berlaku pada impor Excel SHE berikutnya."*

### 3.2 Pencocokan nama
- Kunci pencocokan `unitKey(s)`:
  1. huruf besar;
  2. buang awalan `PPA -`;
  3. buang spasi dan tanda hubung;
  4. buang akhiran `AMM`;
  5. setiap deret angka ditulis tanpa nol di depan.

  Contoh:

  | Nama | Kunci |
  |---|---|
  | `PPA - TL 0141` | `TL141` |
  | `TL536AMM` | `TL536` |
  | `THDS 0007` | `THDS7` |
  | `THDS07` | `THDS7` |

- Indeks dibangun dari Code Unit **dan** SKR BIB setiap unit populasi.
- Hasil pencocokan satu No Lambung SHE:
  - **cocok**: tepat satu unit populasi. Code Unit dan SKR BIB unit itu dipakai.
  - **ganda**: kunci menunjuk ke lebih dari satu unit populasi. Tidak menebak, tetap memakai nama SHE.
  - **tidak_ada**: tidak ditemukan.

### 3.3 Impor Excel SHE
- Unit support = `isSupportUnit` (aturan Kelompok NON UNIT/SUPPORT + Perusahaan PPA/AMM) **atau** hasil pencocokan bukan `tidak_ada`.
- `SUPPORT_PENGECUALIAN` dihapus, karena THDS 0007 dan FR 0001 sekarang masuk lewat populasi.
- Setiap unit dikirim dengan `code_unit`, `skr_bib`, dan `pop_status`:
  - `cocok` membawa nilai dari populasi;
  - `ganda` dan `tidak_ada` membawa `null`.
- Pratinjau menampilkan **"84 unit support dari 399 baris · 80 cocok populasi · 4 perlu dicek"**, lalu daftar unit yang perlu dicek beserta alasannya: "tidak ada di populasi" atau "nama ganda".
  - Pada data contoh, yang tidak ada di populasi adalah FMB52505, LT 2601, WL 0505, LT 2614.
- Bila populasi belum pernah diunggah, tampil pesan *"Populasi belum diunggah. Unit dipilih dari Kelompok Unit dan Perusahaan saja."* dan semua unit berstatus `tidak_ada`.

### 3.4 Tampilan
- **Label unit** = `code_unit ?? no_lambung`, lewat helper bersama `unitLabel(u)`.
- Label dipakai di stiker papan, `aria-label` stiker, urutan stiker, judul lembar unit, judul kamera, dan baris antrean.
- Lembar unit menampilkan Code Unit (besar), lalu baris kecil "SKR BIB {skr_bib} · SHE {no_lambung}". Bila `code_unit` kosong, hanya No Lambung SHE yang tampil.
- Pencarian papan cocok bila kata kunci cocok dengan No Lambung, Code Unit, **atau** SKR BIB. Normalisasinya memakai `searchKey` yang sudah ada.
- **Admin:**
  - tabel unit menampilkan Code Unit sebagai nama utama dan "SHE {no_lambung}" kecil di bawahnya;
  - pil "Tidak ada di populasi" atau "Nama ganda" untuk status selain `cocok`, ditambah filter chip "Perlu cek populasi";
  - Excel rekap mendapat kolom `Code Unit` dan `SKR BIB`.
- **Tidak berubah:** nama file di ZIP tetap `NOLAMBUNG_sisi.jpg` (nama SHE), karena bukti diserahkan ke SHE. Watermark juga tetap tanpa nama unit.

## 4. Keamanan ke depan (jawaban untuk pengguna)
- **Tidak ada unit yang dibuang diam-diam.** Gabungan "aturan **atau** populasi" membuat unit support tetap masuk walaupun namanya beda. Yang tidak cocok ditandai dan didaftar di pratinjau.
- **Tidak menebak.** Nama ganda (GS6001/GS6002 di file November) tidak dipakai.
- **Foto tidak bisa tertukar.** Foto terikat ke baris unit SHE (`unit_id`), bukan ke nama.
- **Unit baru masuk dengan sendirinya** setelah populasi diperbarui dan Excel SHE diimpor ulang.

## 5. Data & server
- Migrasi `0002_populasi.sql`:
  - tabel `populasi (code_unit TEXT PRIMARY KEY, skr_bib TEXT NOT NULL, jenis TEXT NOT NULL, maint TEXT NOT NULL, uploaded_at INTEGER NOT NULL)`;
  - kolom baru `units.code_unit TEXT`, `units.skr_bib TEXT`, `units.pop_status TEXT NOT NULL DEFAULT 'tidak_ada'`.
- Endpoint admin (memakai auth yang sudah ada):
  - `GET /api/admin/populasi` mengembalikan `{ units, uploaded_at }`;
  - `PUT /api/admin/populasi` menerima `{ units }`, divalidasi, lalu mengganti isi tabel dalam satu `DB.batch`.
  - Batasnya ≤ 2000 unit, dan setiap teks ≤ 60 karakter, sesuai batas CPU paket gratis.
- Impor (`POST /api/admin/import`) menerima dan menyimpan tiga field baru. Nilainya divalidasi: `pop_status` ∈ {`cocok`,`ganda`,`tidak_ada`}, dan teks ≤ 60 karakter atau `null`.
- Snapshot publik ditambah `code_unit` dan `skr_bib` per unit. Keduanya kode alat, bukan data pribadi. `pop_status` hanya untuk admin.

## 6. Bukan tujuan
- Mencocokkan ulang unit yang sudah diimpor saat populasi diperbarui. Cukup impor ulang Excel SHE.
- Mengedit pencocokan secara manual, atau menyimpan alias per unit.
- Membaca sheet populasi selain sheet aktif, misalnya "Off Hire" atau "Mutasi".

## 7. Pengujian
- **`unitKey` dan pencocokan:**
  - `PPA - TL 0141` → cocok `TL141`/`TL0141`;
  - `FT 5528` → cocok `FT52528AMM`/`FT5528` lewat SKR BIB;
  - `PPA - TL 0536` → cocok `TL536AMM`;
  - `GS6001` → ganda;
  - `LT 2601` → tidak_ada.
- **`parsePopulasi`:** header dengan baris baru dikenali, hanya baris SUPPORT yang diambil. Dengan file November (lewati bila tidak ada): **334** unit.
- **Impor contoh** (SHE Desember + populasi November, lewati bila tidak ada): **84** support dari 399, **80** cocok, **4** tidak_ada, **0** ganda.
- **Worker:** PUT/GET populasi (perlu login, validasi, penggantian total); impor menyimpan `code_unit`/`skr_bib`/`pop_status`; snapshot memuat `code_unit`/`skr_bib` tanpa `pop_status`.
- **Papan:** pencarian `tl141`, `tl0141`, dan `PPA - TL 0141` menemukan unit yang sama, dan label stiker = Code Unit.
