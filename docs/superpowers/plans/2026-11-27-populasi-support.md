# Populasi Unit Support (Code Unit & SKR BIB): Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Admin dapat mengunggah populasi unit support. Impor SHE mencocokkan unit dengan populasi (Code Unit/SKR BIB), dan papan menampilkan Code Unit.

**Architecture:**
- Parse populasi dan pencocokan dilakukan oleh fungsi murni.
  - `shared/populasi.ts`: kunci dan pencocokan, dipakai browser dan tes.
  - `src/admin/populasi.ts`: parse sheet.
- Populasi disimpan di D1 lewat endpoint admin. Impor SHE mengambil populasi, mencocokkan di browser, lalu mengirim `code_unit`/`skr_bib`/`pop_status` per unit.
- Snapshot membawa `code_unit`/`skr_bib`. UI memakai `unitLabel(u)`.

**Tech Stack:** React 19, Vite 8, TypeScript, Cloudflare Worker + D1, Vitest, SheetJS (sudah ada).

**Spec:** `docs/superpowers/specs/2026-11-27-populasi-support-design.md` (otoritas). Spec ini mengubah §5–6 dari `2026-11-25-revisi-support-papan-stiker-design.md`.

## Fase & gerbang review
| Fase | Task | Hasil yang bisa diuji |
|---|---|---|
| F | 1–2 | Fungsi populasi + migrasi + endpoint + impor menyimpan field baru. Tes contoh: 334 / 84 / 80 / 4 / 0. |
| G | 3–4 | Layar Populasi, pratinjau impor, label Code Unit di papan/sheet/kamera/antrean/admin, kolom rekap. Lighthouse publik ≥ 93. |

Penutup setiap fase:
- `npm test` + `npm run build` hijau;
- review ponytail + security (fase F menyentuh Worker);
- `graphify update .`;
- scratchpad kosong.

## Global Constraints
- **`unitKey(s)`:** huruf besar → buang awalan `^\s*PPA\s*-\s*` → buang `[\s-]+` → buang akhiran `AMM$` → setiap `\d+` ditulis tanpa nol di depan.
- **Hasil pencocokan:** `PopStatus = 'cocok' | 'ganda' | 'tidak_ada'`. Status `ganda` dan `tidak_ada` tidak pernah membawa Code Unit/SKR BIB.
- **Support** = `isSupportUnit(u)` **atau** `pop_status !== 'tidak_ada'`. `SUPPORT_PENGECUALIAN` dihapus.
- **Populasi:**
  - sheet `"PPA & AMM - Active"`, dengan cadangan sheet pertama yang punya header lengkap;
  - header dicari lewat sel `SECTION`, dan judul kolom dibandingkan setelah whitespace dirapatkan (`CODE\nUNIT` → `CODE UNIT`);
  - kolom: `TYPE UNIT`, `SECTION`, `MAINTENANCE BY`, `CODE UNIT`, `SKR BIB`;
  - hanya `SECTION = SUPPORT` yang punya Code Unit.
- **Batas server:** populasi ≤ 2000 unit, setiap teks ≤ 60 karakter. Field impor baru berupa teks ≤ 60 atau `null`.
- **Teks UI persis:**
  - `"{n} unit support dari {m} baris · {c} cocok populasi · {k} perlu dicek"`;
  - `"Populasi belum diunggah. Unit dipilih dari Kelompok Unit dan Perusahaan saja."`;
  - `"Perubahan berlaku pada impor Excel SHE berikutnya."`;
  - pil `"Tidak ada di populasi"` / `"Nama ganda"`;
  - chip filter `"Perlu cek populasi"`;
  - baris sheet unit `"SKR BIB {skr_bib} · SHE {no_lambung}"`.
- **Label:** `unitLabel(u) = u.code_unit ?? u.no_lambung`. Nama ZIP tetap `no_lambung`, watermark tidak berubah, dan `pop_status` tidak pernah masuk snapshot publik.
- **Gaya:** semua UI baru memakai token dan kelas dasar `DESIGN.md` (`.btn .btn-2 .chip .cond .banner`), skala spasi 4/8/12/16/24/32. Bahasa Indonesia yang manusiawi.
- **File data pengguna tidak di-commit.** Path tes populasi: `process.env.HOME + '/Downloads/01. Populasi & Status Unit A2B & A2S Update November 2026 (DI COPY YA JANGAN DI CUT& DEL)..xlsx'` (`test.skipIf` bila tidak ada).
- Tidak ada perintah Cloudflare remote.

## Review Focus
1. **SHE menulis nama dengan awalan/akhiran/nol berbeda** (`PPA - TL 0536` vs `TL536AMM`) → harus cocok. Dipatok di Task 1.
2. **Kunci yang menunjuk 2 unit populasi** (`GS6001`) → `ganda`, tanpa Code Unit. Dipatok di Task 1.
3. **Populasi kosong / belum diunggah** → impor tetap jalan dengan aturan lama dan pesan khusus. Dipatok di Task 1 (fungsi) dan Task 3 (UI).
4. **PUT populasi dengan teks terlalu panjang atau terlalu banyak baris** → 400, tabel lama utuh. Dipatok di Task 2.
5. **Cache snapshot lama tanpa `code_unit`** → papan memakai `no_lambung`. Dipatok di Task 4 (`unitLabel` dengan field `undefined`).

---

### Task 1 (Fase F): Fungsi murni populasi + filter impor

**Files:**
- Create: `shared/populasi.ts`, `shared/populasi.test.ts`, `src/admin/populasi.ts`, `src/admin/populasi.test.ts`
- Modify: `shared/rules.ts` (hapus `SUPPORT_PENGECUALIAN` dari `isSupportUnit`), `shared/rules.test.ts`, `shared/types.ts`, `src/admin/excel.ts`, `src/admin/excel.test.ts`

**Interfaces (Produces):**
```ts
// shared/types.ts
export type PopStatus = 'cocok' | 'ganda' | 'tidak_ada';
export interface PopUnit { code_unit: string; skr_bib: string; jenis: string; maint: string }
// ImportUnit gains: code_unit: string | null; skr_bib: string | null; pop_status: PopStatus
// SnapUnit gains: code_unit?: string | null; skr_bib?: string | null   (optional: old cached snapshots)
// AdminUnit gains: pop_status: PopStatus
// shared/populasi.ts
export const unitKey: (s: string) => string;
export type PopIndex = Map<string, PopUnit[]>;
export function buildPopIndex(units: PopUnit[]): PopIndex;          // keys from code_unit AND skr_bib; same unit under both keys counted once
export function matchPop(noLambung: string, idx: PopIndex): { pop_status: PopStatus; code_unit: string | null; skr_bib: string | null };
export const unitLabel: (u: { code_unit?: string | null; no_lambung: string }) => string;
// src/admin/populasi.ts
export function parsePopulasi(wb: XLSX.WorkBook): { units: PopUnit[]; errors: string[] };
// src/admin/excel.ts — parseSheRows(rows, idx?: PopIndex) keeps a row when isSupportUnit(v) || matchPop(...).pop_status !== 'tidak_ada';
//   returns also { cocok: number; perluCek: { no_lambung: string; alasan: 'tidak_ada' | 'ganda' }[] }  (counted over kept rows)
```

- [ ] **Step 1: Tes gagal**

  `shared/populasi.test.ts`, dengan populasi kecil buatan:
  - `unitKey('PPA - TL 0141') === 'TL141'`, `unitKey('TL536AMM') === 'TL536'`, `unitKey('THDS 0007') === unitKey('THDS07')`.
  - `PPA - TL 0141` → cocok, membawa `TL141`/`TL0141`.
  - `FT 5528` cocok lewat SKR BIB `FT5528` ke code `FT52528AMM`.
  - Dua unit dengan SKR BIB `GS6001` → `ganda`, keduanya `null`.
  - `LT 2601` → `tidak_ada`.
  - `unitLabel({ no_lambung: 'X 1' })` → `'X 1'`; `unitLabel({ code_unit: 'TL141', no_lambung: 'PPA - TL 0141' })` → `'TL141'`.

  `src/admin/populasi.test.ts`:
  - workbook buatan dengan header `['', 'No', 'TYPE UNIT', 'SECTION', 'MAINTENANCE \nBY', 'CODE\nUNIT', 'SKR BIB']` di baris 2, berisi 1 baris SUPPORT dan 1 baris HAULING → hanya 1 unit yang diambil;
  - sheet tanpa kolom wajib → errors;
  - `test.skipIf` file November → `units.length === 334`.

  `excel.test.ts`:
  - tanpa `idx`, `FR 0001` dengan perusahaan `-` sekarang **tidak** masuk (pengecualian dihapus);
  - dengan `idx` yang memuat `FR01`/`FR0001`, unit itu masuk dengan status cocok;
  - `test.skipIf` (kedua file ada) → support 84, totalRows 399, cocok 80, perluCek 4, ganda 0.

  `rules.test.ts`: perbarui ekspektasi pengecualian.
- [ ] **Step 2:** Jalankan `npx vitest run shared src/admin`. Harus FAIL.
- [ ] **Step 3:** Implementasi.
- [ ] **Step 4:** Jalankan `npm test` + `npm run build`. Harus PASS.
- [ ] **Step 5:** Commit `feat: pencocokan populasi unit support (code unit, SKR BIB)`.

### Task 2 (Fase F): Migrasi + endpoint populasi + impor + snapshot

**Files:**
- Create: `migrations/0002_populasi.sql`
- Modify: `worker/admin.ts`, `worker/admin.test.ts`, `worker/snapshot.ts`, `worker/public.test.ts`

**Interfaces:**
- Consumes: `PopUnit`, `PopStatus`, `ImportUnit` (Task 1).
- Produces:
  - `GET /api/admin/populasi` → `200 { units: PopUnit[], uploaded_at: number | null }`;
  - `PUT /api/admin/populasi` body `{ units: PopUnit[] }` → `200 { count }`, atau `400 { error: 'invalid' }`;
  - impor menyimpan `code_unit`, `skr_bib`, `pop_status`;
  - `listUnits` mengembalikan `pop_status`, `code_unit`, `skr_bib`;
  - snapshot unit memuat `code_unit`, `skr_bib` (tanpa `pop_status`).

- [ ] **Step 1:** Tulis `0002_populasi.sql` persis seperti spec §5.
- [ ] **Step 2: Tes gagal di `worker/admin.test.ts`**
  - PUT tanpa sesi → 401.
  - PUT sah 2 unit → GET mengembalikan 2 unit dan `uploaded_at`; PUT kedua dengan 1 unit → GET mengembalikan 1 unit (penggantian total).
  - PUT dengan teks 61 karakter, dengan 2001 unit, atau dengan `units` bukan array → 400, dan GET masih berisi data lama.
  - Impor dengan `code_unit: 'TL141', skr_bib: 'TL0141', pop_status: 'cocok'` tersimpan dan muncul di `listUnits`.
  - Impor dengan `pop_status: 'x'` → 400.
  - Impor tanpa tiga field baru (klien lama) → 400. Ini kontrak baru; klien dan server di-deploy bersama.

  Di `public.test.ts`, snapshot memuat `code_unit`/`skr_bib` dan `not.toHaveProperty('pop_status')`.
- [ ] **Step 3:** Implementasi. Perubahannya:
  - validasi di `importBatch`, mengikuti pola `FIELDS` yang ada;
  - `INSERT … ON CONFLICT` memperbarui 3 kolom baru;
  - PUT: `DB.batch([DELETE FROM populasi, ...INSERTs])` dengan `uploaded_at = now` yang sama untuk semua baris;
  - kolom baru di query snapshot dan `listUnits`.
- [ ] **Step 4:** Jalankan `npm test`, `npm run build`, dan `npm run db:local` (migrasi lokal). Harus PASS/OK.
- [ ] **Step 5:** Commit `feat: simpan populasi dan code unit per unit`.

### Task 3 (Fase G): Layar admin Populasi + pratinjau impor + tabel/rekap

**Files:**
- Create: `src/admin/Populasi.tsx`
- Modify: `src/admin/AdminApp.tsx` (tab "Populasi" di antara "Upload Excel SHE" dan "Unduhan"), `src/admin/Import.tsx`, `src/admin/UnitTable.tsx`, `src/admin/UnitDetail.tsx`, `src/admin/Downloads.ts` (+ test), `src/admin/unitUtils.ts` bila filter berada di sana, `src/styles/admin.css`

**Interfaces:**
- Consumes: `parsePopulasi`, `buildPopIndex`, `matchPop`, `unitLabel`, endpoint Task 2.
- Produces: tidak ada API baru.

- [ ] **Step 1: Layar `Populasi.tsx`** (spec §3.1)
  - Menampilkan populasi aktif ("{n} unit · diunggah {tanggal WITA}") atau "Populasi belum diunggah".
  - Pilih file → pratinjau: jumlah, per jenis, dan peringatan nama ganda (kunci yang menunjuk >1 unit).
  - Tombol "Simpan populasi" → PUT → pesan sukses.
  - Catatan "Perubahan berlaku pada impor Excel SHE berikutnya."
  - Semua state dirancang: memuat, gagal, kosong.
- [ ] **Step 2: `Import.tsx`**
  - Sebelum parse, ambil populasi (GET) lalu `buildPopIndex`, dan teruskan ke `parseSheRows`.
  - Tampilkan teks pratinjau persis dari Global Constraints, ditambah daftar "perlu dicek" (no lambung + "tidak ada di populasi" / "nama ganda").
  - Bila populasi kosong, tampilkan pesan khusus.
  - Kirim 3 field baru per unit.
- [ ] **Step 3: Tabel unit**
  - Nama utama = `unitLabel(u)`, dengan "SHE {no_lambung}" kecil di bawahnya bila berbeda.
  - Pil status populasi untuk `ganda`/`tidak_ada`.
  - Chip filter "Perlu cek populasi".
  - Pencarian admin juga mencakup `code_unit`/`skr_bib`.
  - `UnitDetail` judul = `unitLabel`, dengan baris SKR BIB/SHE.
- [ ] **Step 4:** Excel rekap mendapat kolom `Code Unit`, `SKR BIB` setelah `No Lambung`. Nama ZIP tidak berubah. Perbarui `Downloads.test.ts`.
- [ ] **Step 5: Cek headless** (playwright-core di `~/ai-hazard-scan/node_modules`), terang/gelap, 390 & 1440 px:
  1. Unggah populasi November lalu simpan.
  2. Impor SHE contoh, lalu **simpan** (D1 lokal, data uji).
  3. Pastikan pratinjau berbunyi "84 unit support dari 399 baris · 80 cocok populasi · 4 perlu dicek".
  4. Pastikan tabel menampilkan Code Unit, dan filter "Perlu cek populasi" menyisakan 4 unit.

  Hapus artefak setelah selesai.
- [ ] **Step 6:** Jalankan `npm test` + `npm run build`, lalu commit `feat: layar populasi dan code unit di admin`.

### Task 4 (Fase G): Code Unit di papan, sheet, kamera, antrean

**Files:**
- Modify: `src/lib/board.ts` (+ test), `src/screens/Papan.tsx`, `src/screens/UnitSheet.tsx`, `src/screens/Camera.tsx` (hanya judul dan nilai `noLambung` yang diantrekan untuk ditampilkan), `src/styles/papan.css` bila perlu

**Interfaces:**
- Consumes: `unitLabel` (Task 1); `SnapUnit.code_unit/skr_bib` (Task 1–2).

- [ ] **Step 1: Tes gagal `board.test.ts`**
  - Stiker diurutkan menurut `unitLabel`.
  - Pencarian `tl141`, `tl0141`, dan `PPA - TL 0141` semuanya menemukan unit `{ no_lambung: 'PPA - TL 0141', code_unit: 'TL141', skr_bib: 'TL0141' }`.
  - Unit tanpa `code_unit` (snapshot lama) tetap dicari lewat `no_lambung`.
- [ ] **Step 2:** Implementasi `boardView`: urutan dan pencarian memakai ketiga nama.
- [ ] **Step 3: UI**
  - Stiker dan `aria-label` memakai `unitLabel`.
  - `UnitSheet`: judul `unitLabel`, dengan baris "SKR BIB {skr_bib} · SHE {no_lambung}" bila ada `code_unit`.
  - Judul kamera = `unitLabel(unit)`, dan `noLambung` yang diantrekan diisi `unitLabel(unit)` supaya antrean memakai nama yang sama. Field itu hanya untuk tampilan dan tidak dikirim ke server; periksa `PhotoMeta` untuk memastikannya.
- [ ] **Step 4: Cek headless** 320/390/1024 px terang/gelap: stiker menampilkan Code Unit, cari "tl0141" berhasil, sheet menampilkan baris SKR BIB/SHE, dan tidak ada scroll horizontal. Lighthouse mobile `/` (cara lama: build + `vite preview` + proxy brotli + `npx lighthouse@12`) ≥ 93 ×4. Hapus artefak.
- [ ] **Step 5:** Jalankan `npm test` + `npm run build`, lalu commit `feat: papan menampilkan code unit`.
