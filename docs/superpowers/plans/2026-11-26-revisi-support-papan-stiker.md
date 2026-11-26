# Revisi Unit Support + Papan Stiker + Bahasa Visual P: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplikasi hanya memuat unit section support. Halaman awal menjadi satu "Papan Stiker" untuk semua layar. Seluruh layar memakai bahasa visual P "Papan Lapangan" (terang + gelap).

**Architecture:**
- Penyaringan support dilakukan oleh fungsi murni di `shared/rules.ts` dan dipanggil saat parse Excel di browser admin.
- Papan dibangun dari snapshot yang sudah ada lewat fungsi murni `boardView` (`src/lib/board.ts`) dan satu layar `src/screens/Papan.tsx`. Layar ini menggantikan `UnitList` dan `Landing`.
- Bahasa visual diganti dari token (`tokens.css`) ke atas. Logika kamera, antrean, §8a, auth, dan unduhan tidak disentuh.

**Tech Stack:** React 19, Vite 8, TypeScript, Cloudflare Worker + D1 + R2, Vitest 5 (`@cloudflare/vitest-plugin`), `@fontsource/barlow-condensed` (baru), `@fontsource-variable/inter`, motion (sudah ada).

**Spec:**
- `docs/superpowers/specs/2026-11-25-revisi-support-papan-stiker-design.md`, disebut "spec revisi".
- Spec revisi mengubah `docs/superpowers/specs/2026-11-21-monitoring-komisioning-design.md`, disebut "spec lama".
- Bila keduanya bertentangan, spec revisi menang.

## Fase & gerbang review

Reviewer memeriksa per **fase**, bukan per task. Fase berikutnya baru dimulai setelah review fase sebelumnya lolos (permintaan pengguna).

| Fase | Task | Hasil yang bisa diuji |
|---|---|---|
| A | 1 | Impor Excel contoh → pratinjau "84 unit support dari 399 baris". |
| B | 2 | Semua layar lama memakai token P (terang + gelap), font Barlow termuat, tanpa kaca. |
| C | 3–4 | `/` menampilkan Papan Stiker + Sheet Unit. `Landing`/`UnitList`/`recent` sudah hilang. |
| D | 5–6 | Kamera, antrean, cek kode, dan semua layar admin bergaya P. |
| E | 7 | Gerbang mutu: data terburuk, 320 px → 1920 px, AA, Lighthouse mobile ≥ 93 ×4, D1 lokal diimpor ulang. |

**Penutup setiap fase** (standar pengguna, wajib sebelum lapor fase selesai):
1. `npm test` dan `npm run build` hijau.
2. `ponytail:ponytail-review` + `simplify` pada diff fase.
3. `security-review` bila fase menyentuh Worker atau impor.
4. `graphify --update`.
5. Scratchpad sesi kosong (`du -sh <scratchpad>` = 0). Screenshot, profil browser, dan skrip uji dihapus pada giliran yang sama.

## Global Constraints

- **Lingkup support:**
  - `kelompok_unit` ∈ {`NON UNIT`, `SUPPORT`} **dan** `perusahaan` ∈ {`PPA`, `AMM`}, **atau** `no_lambung` ∈ `SUPPORT_PENGECUALIAN = ['THDS 0007', 'FR 0001']`.
  - Perbandingan dilakukan setelah trim, huruf besar, dan spasi ganda dirapatkan.
- **Teks pratinjau impor:** `"{n} unit support dari {m} baris"`.
- **Teks bila tidak ada unit support:** `"File ini tidak berisi unit section support (Kelompok NON UNIT/SUPPORT, perusahaan PPA/AMM)."`
- **Skor header:** `"{x} dari {N} lengkap · {y} belum"`. Skor ini tidak terpengaruh filter apa pun.
- **Jam data:** `"Data HH:MM"` WITA dari `snapshot.version`, tanpa detik. Saat offline (`stale`): `"Data HH:MM · offline"`. Tidak boleh ada teks yang berubah tanpa data baru.
- **Token terang:**
  - `--bg #EDEBE4`, `--surface #FBFAF6`, `--ink #141414`, `--mut #55534C`, `--rule #D9D6CC`;
  - `--neon #C9F31D` (selalu dengan teks `--ink`);
  - `--or #FF5A1F`, teks oranye `#B33A00`;
  - `--yel #F5B800`, `--yel-bg #FFE9A6`.
- **Token gelap** (`prefers-color-scheme: dark`):
  - `--bg #16150F`, `--surface #1F1E18`;
  - teks `#EDEBE4`, `--mut #A8A496`, `--rule #34332B`;
  - header `#0B0B08`;
  - neon/kuning/oranye tetap.
- **Hazard:** `repeating-linear-gradient(-45deg, var(--yel) 0 10px, var(--ink) 10px 20px)`. Hanya dipakai di:
  - tepi bawah header publik,
  - tepi atas header admin dan kartu login,
  - banner "foto akan dihapus".
- **Font:**
  - Barlow Condensed 700/800 huruf besar untuk judul, skor, no lambung, tombol filter, tab bar, dan kepala tabel;
  - Inter Variable untuk isi;
  - watermark tidak berubah.
- **Bentuk:**
  - radius stiker 5 px, tombol 4 px, sheet 12 px (sudut atas);
  - pemisah `--ink` 2 px;
  - tanpa bayangan kecuali sheet;
  - **tanpa `backdrop-filter`**.
- **Focus:** outline 3 px `--neon` + tepi dalam `--ink`, terlihat di terang dan gelap.
- **Gerak:**
  - micro 120–250 ms, macro 200–400 ms, ease-out kuat;
  - hanya `transform`/`opacity`, tanpa `transition: all`;
  - mengetik dan scroll tidak dianimasikan;
  - `prefers-reduced-motion` diganti cross-fade atau langsung.
- **Dilarang:** eyebrow huruf besar di atas setiap bagian, kaca buram, gradien hiasan, ikon dalam kotak bulat, `alert()`/`confirm()`/`prompt()`, library toast.
- **Status tidak boleh hanya warna:** sebagian menampilkan "n/4", belum bertepi oranye, dan setiap stiker punya `aria-label` `"{no_lambung}, {n} dari 4 sisi"`.
- **Halaman publik** tidak pernah menampilkan nama/NRP mekanik.
- **Mutu:**
  - responsif 320 px → 1920 px, kontras WCAG AA;
  - Lighthouse mode mobile ≥ 93 di Performance, Accessibility, Best Practices, SEO;
  - LCP < 2,5 s, CLS < 0,1, INP < 200 ms;
  - JS awal halaman mekanik ≤ 150 KB gzip.
- **Tetap berlaku dari spec lama:** zona waktu WITA `Asia/Makassar`, Bahasa Indonesia formal, polling 15 detik hanya saat tab terlihat dan online, aturan §8a, dan Status SHE yang tampil hanya `Belum Diajukan`.
- **Teks UI** ditulis dengan bahasa manusia: aktif, spesifik (skill `humanize`).
- **Data pengguna tidak di-commit** (`*.xlsx`, `WhatsApp Image*`, `.superpowers/`). Tidak ada perintah Cloudflare remote (`deploy`, `--remote`).
- **Skill per area:**
  - UI: `no-ai-design-slop`, `impeccable`, `emil-design-eng`, `mobile-native`, `modern-web-guidance`;
  - gerak: `animate`;
  - uji tampilan: `break-ui`.

## Review Focus

1. **Excel dengan "Perusahaan"/"Kelompok Unit" huruf kecil atau berspasi** (`' ppa '`, `'Non  Unit'`) tetap terhitung support. Dipatok di Task 1.
2. **Baris non-support yang kolom wajibnya kosong** tidak boleh memunculkan error baris. Baris itu dilewati diam-diam. Dipatok di Task 1.
3. **Unit yang statusnya berubah lewat poll saat filter "Belum" aktif** harus hilang dari papan, tapi skor header dan angka grup tetap benar. Dipatok di Task 3 (`boardView` dipanggil ulang dengan snapshot baru).
4. **Pencarian dengan nol di depan atau tanpa spasi** (`gs12`, `0012`, `GS 0012`) menemukan `GS 0012`. Dipatok di Task 3.
5. **Snapshot lama di cache browser** yang masih berisi `recent` tidak membuat papan error, karena field itu diabaikan. Dipatok di Task 3 (fixture `boardView` membawa field tambahan `recent`).

---

## Struktur berkas

| Berkas | Tanggung jawab | Task |
|---|---|---|
| `shared/rules.ts` | + `isSupportUnit`, `SUPPORT_PENGECUALIAN`. − `landingSummary` | 1, 4 |
| `src/admin/excel.ts`, `src/admin/Import.tsx` | Saring support saat parse, teks pratinjau | 1 |
| `DESIGN.md` (baru, root) | Konsep, token terang/gelap, tipografi, komponen, gerak | 2 |
| `src/styles/tokens.css`, `base.css`, `screens.css`, `admin.css` | Token P + komponen dasar | 2, 5, 6 |
| `src/main.tsx` | Impor font Barlow 700/800 | 2 |
| `src/lib/board.ts` (baru) + `board.test.ts` | `boardView`, `searchKey`, `jenisKey` (fungsi murni) | 3 |
| `src/screens/Papan.tsx` (baru), `src/screens/UnitSheet.tsx` (baru), `src/styles/papan.css` (baru) | Halaman awal + Sheet Unit | 4 |
| `src/App.tsx` | Rute `/` → Papan, tab bar P (< 1024 px) | 4 |
| Dihapus | `Landing.tsx`, `UnitList.tsx`, `landing.css`, `ui/ProgressCard.tsx`, `ui/SideDots.tsx` bila tak terpakai, `Snapshot.recent` (types, `worker/snapshot.ts`, tesnya) | 4 |
| `src/screens/{Camera,MekanikSheet,Antrean,CekKode,CekForm,InstallGuide}.tsx` | Gaya P | 5 |
| `src/admin/*.tsx` | Gaya P | 6 |

---

### Task 1 (Fase A): Saring unit support saat impor

**Files:**
- Modify: `shared/rules.ts`, `shared/rules.test.ts`, `src/admin/excel.ts`, `src/admin/excel.test.ts`, `src/admin/Import.tsx`

**Interfaces:**
- Produces:
  - `export const SUPPORT_PENGECUALIAN: readonly string[] = ['THDS 0007', 'FR 0001']`;
  - `export function isSupportUnit(u: Pick<ImportUnit, 'no_lambung' | 'perusahaan' | 'kelompok_unit'>): boolean`;
  - `parseSheRows(rows)` sekarang mengembalikan `{ byPeriod, errors, totalRows: number, supportRows: number }`.
    - `totalRows` = baris data tidak kosong.
    - `supportRows` = baris yang lolos `isSupportUnit`, termasuk yang nanti error.

- [ ] **Step 1: Tes gagal di `shared/rules.test.ts`**

```ts
test('isSupportUnit', () => {
  const u = (no_lambung: string, perusahaan: string, kelompok_unit: string) => ({ no_lambung, perusahaan, kelompok_unit });
  expect(isSupportUnit(u('GS 0012', 'PPA', 'NON UNIT'))).toBe(true);
  expect(isSupportUnit(u('THDS 0009', 'PPA', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('LT 0003', 'AMM', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('THDS 0007', 'TU', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('FR 0001', '-', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u(' thds  0007 ', 'TU', 'SUPPORT'))).toBe(true);
  expect(isSupportUnit(u('GS 1', ' ppa ', 'Non  Unit'))).toBe(true);
  expect(isSupportUnit(u('DT 4464', 'PPA', 'WHEEL'))).toBe(false);
  expect(isSupportUnit(u('GS 9', 'BTN', 'NON UNIT'))).toBe(false);
});
```

- [ ] **Step 2: Tes gagal di `src/admin/excel.test.ts`**
  1. Ganti fixture `row()` lama menjadi `'SUPPORT'` sebagai kelompok, supaya tes lama tetap bermakna.
  2. Tambahkan tes berikut:

```ts
test('baris non-support dibuang tanpa error, dihitung', () => {
  const r = (n: string, per: string, kel: string) => [1, n, per, kel, 'GENSET', '-', '01-Jan-2027', 'Week 1', 'Des/2026', 'Belum Diajukan'];
  const blank = [2, 'DT 1', 'PPA', 'WHEEL', '', '', '', '', '', ''];   // non-support, kolom kosong → bukan error
  const { byPeriod, errors, totalRows, supportRows } = parseSheRows([H, r('GS 1', 'PPA', 'NON UNIT'), r('DT 2', 'PPA', 'WHEEL'), blank, r('FR 0001', '-', 'SUPPORT')]);
  expect(errors).toEqual([]);
  expect(byPeriod.get('Des/2026')!.map((u) => u.no_lambung)).toEqual(['GS 1', 'FR 0001']);
  expect([totalRows, supportRows]).toEqual([4, 2]);
});
const SAMPLE = 'Deadline_Pengajuan_Komisioning_20261120_234805.xlsx';
test.skipIf(!existsSync(SAMPLE))('file contoh → 84 unit support dari 399 baris', () => {
  const ws = XLSX.read(readFileSync(SAMPLE)); // sheet pertama
  const { supportRows, totalRows } = parseSheRows(rowsFromSheet(ws.Sheets[ws.SheetNames[0]]));
  expect([supportRows, totalRows]).toEqual([84, 399]);
});
```

- [ ] **Step 3:** Jalankan `npx vitest run shared/rules.test.ts src/admin/excel.test.ts`. Harus FAIL karena `isSupportUnit` belum ada dan field baru belum ada.

- [ ] **Step 4: Implementasi**
  - `isSupportUnit` di `shared/rules.ts`, memakai normalisasi `s.trim().toUpperCase().replace(/\s+/g, ' ')`.
  - Di `parseSheRows`, sesudah `v` terisi dan **sebelum** cek kolom kosong:
    - hitung `totalRows++`;
    - bila `!isSupportUnit(v)` maka `continue`;
    - selain itu `supportRows++`.

- [ ] **Step 5: `Import.tsx`**
  - Di atas ringkasan per periode tampilkan `"{supportRows} unit support dari {totalRows} baris"`, dengan angka diformat `nf`.
  - Bila `totalRows > 0 && supportRows === 0`:
    - tampilkan teks "tidak berisi unit section support" dari Global Constraints sebagai satu-satunya masalah;
    - ganti pesan lama `'Berkas tidak berisi unit.'` untuk kasus ini;
    - tombol simpan nonaktif, karena `n === 0` sudah menanganinya.

- [ ] **Step 6:** `npm test` (semua PASS), lalu `npm run build`.

- [ ] **Step 7: Commit**

```bash
git add shared/rules.ts shared/rules.test.ts src/admin/excel.ts src/admin/excel.test.ts src/admin/Import.tsx
git commit -m "feat: impor hanya unit section support"
```

---

### Task 2 (Fase B): Fondasi bahasa visual P

**Files:**
- Create: `DESIGN.md`
- Modify: `package.json`, `src/main.tsx`, `src/styles/tokens.css`, `src/styles/base.css`, `src/ui/Sheet.tsx` (bila gaya inline), `src/ui/Pill.tsx`

**Interfaces:**
- Produces:
  - token CSS dengan nama persis: `--bg --surface --text --ink --head --on-neon --mut --rule --neon --or --or-ink --yel --yel-bg --hazard --font --font-cond --r-sticker --r-btn --r-sheet --ease-out`. Arti token yang tidak jelas dari namanya:
    - `--text`: warna teks isi (terang `#141414` / gelap `#EDEBE4`);
    - `--ink`: garis/tepi kuat dan tombol utama (terang `#141414` / gelap `#EDEBE4`);
    - `--head`: latar header, tab bar, dan sidebar (terang `#141414` / gelap `#0B0B08`);
    - `--on-neon`: selalu `#141414`, untuk teks di atas neon/kuning di kedua mode.
  - kelas dasar yang dipakai Task 4–6:
    - `.btn` (utama), `.btn-2` (sekunder bertepi);
    - `.chip` + `[aria-pressed="true"]` (tombol filter);
    - `.cond` (Barlow huruf besar);
    - `.hazard` (pita 6 px);
    - `.banner` (pita pesan hitam: offline/error/sukses);
    - `.press` (sudah ada, `scale(.97)` 100–120 ms).

- [ ] **Step 1: Font**
  - `npm i @fontsource/barlow-condensed`, dengan versi persis tercatat di `package.json`.
  - Di `src/main.tsx` impor hanya `@fontsource/barlow-condensed/latin-700.css` dan `latin-800.css`.
  - Tambahkan fallback `@font-face` lokal dengan `size-adjust` untuk Arial Narrow/`sans-serif`, supaya CLS < 0,1. Nilai `size-adjust` diukur, bukan ditebak.

- [ ] **Step 2: `DESIGN.md`**
  - Isinya, ringkas (≤ 120 baris):
    - konsep "Papan Lapangan" dan alasannya (rompi hi-vis, pita hazard, stiker komisioning, shift malam → mode gelap);
    - tabel token terang/gelap beserta rasio kontras teks utama/sekunder;
    - tipografi, skala spasi 4/8/12/16/24/32, radius, aturan bayangan, komponen dasar, dan aturan gerak;
    - daftar larangan dari Global Constraints.

- [ ] **Step 3: `tokens.css`**
  - Ganti seluruh isi dengan token P untuk mode terang, ditambah blok `@media (prefers-color-scheme: dark)`.
  - Hapus token lama: `--fill`, `--fill-search`, `--separator`, `--label*`, `--on-ink-2`, `--neon-bg/ink/dot`, `--orange*`, `--r-list`, `--r-card`.
  - Setiap pemakaian token lama di CSS lain diganti ke token baru di task ini (`grep -rn "var(--" src/styles`). Dengan begitu build tidak menyisakan variabel tak terdefinisi, walaupun tampilan per layar baru dirapikan di Task 4–6.

- [ ] **Step 4: `base.css`**
  - Latar dan teks body memakai token.
  - Buat kelas dasar di Interfaces.
  - Focus memakai `:focus-visible` dengan outline 3 px neon ditambah `box-shadow` inset 2 px `--ink`.
  - Sheet memakai `--surface`, radius 12 px di sudut atas, dan pegangan hitam.
  - Hapus semua `backdrop-filter` dan `.glass`.
  - `prefers-reduced-motion` berlaku global.

- [ ] **Step 5: Cek visual singkat**
  1. Jalankan `npm run dev`.
  2. Buka `/`, `/antrean`, `/cek`, dan `/admin/login` dalam mode terang dan gelap (emulasi `prefers-color-scheme` di headless Chrome via `playwright-core`).
  3. Pastikan tidak ada teks tak terbaca dan tidak ada variabel CSS kosong. Di konsol browser, `getComputedStyle(document.body).getPropertyValue('--bg')` harus berisi nilai.
  4. Hapus screenshot dan skrip uji setelah selesai.

- [ ] **Step 6:** `npm test`, lalu `npm run build`. JS awal mekanik ≤ 150 KB gzip (lihat output Vite).

- [ ] **Step 7: Commit**

```bash
git add DESIGN.md package.json package-lock.json src/main.tsx src/styles src/ui
git commit -m "feat: fondasi bahasa visual Papan Lapangan (terang + gelap)"
```

---

### Task 3 (Fase C): `boardView` (fungsi murni papan)

**Files:**
- Create: `src/lib/board.ts`, `src/lib/board.test.ts`

**Interfaces:**
- Consumes: `classifyForMechanic`, `Snapshot`, `SnapUnit`
- Produces:

```ts
export type StatusFilter = 'semua' | 'belum' | 'sudah';
export interface BoardFilter { status: StatusFilter; week: string | null; q: string } // week = WeekOption.key
export interface WeekOption { key: string; label: string }        // key `${period_id}|${week}`
export interface BoardGroup { jenis: string; lengkap: number; total: number; units: SnapUnit[] }
export interface BoardView { total: number; lengkap: number; belum: number; periods: string[]; weeks: WeekOption[]; groups: BoardGroup[] }
export function boardView(s: Snapshot, f: BoardFilter, now: number): BoardView;
export const searchKey = (s: string): string => /* huruf besar, tanpa spasi, angka tanpa nol di depan */;
export const jenisKey = (s: string): string => /* trim, huruf besar, spasi dirapatkan */;
export const sidesDone = (u: SnapUnit): number => Object.keys(u.sides).length;
```

Aturannya (yang tidak ditentukan oleh signature):
- **Unit tampil** = `classifyForMechanic(u, sidesDone(u), periodPurged, now) !== 'tersembunyi'`, dengan `periodPurged = period.purge_after <= now`, atau periode tidak ada di `s.periods`.
- **Skor** (`total`, `lengkap`, `belum = total − lengkap`) dihitung dari semua unit tampil. Filter apa pun tidak mengubahnya.
- **`weeks`:**
  - unik per (periode, week), diurutkan menurut periode lalu week (`localeCompare` numeric);
  - `label` = `week` bila hanya ada satu periode, atau `"{periodLabel} · {week}"` bila lebih dari satu.
- **`periods`:** label periode yang punya unit tampil.
- **Grup:**
  - kunci `jenisKey(jenis_unit)`, nama tampil = kunci, diurutkan alfabetis;
  - `lengkap`/`total` dihitung **sesudah filter week + q, sebelum filter status**;
  - `units` = sesudah semua filter, diurutkan menurut `no_lambung` (`localeCompare(…, 'id', {numeric: true})`);
  - grup dengan `units.length === 0` dibuang.
- **Filter:**
  - `q` cocok bila `searchKey(no_lambung).includes(searchKey(q))`;
  - `q` kosong = semua;
  - `belum` = `sidesDone < 4`, `sudah` = `sidesDone === 4`.

- [ ] **Step 1: Tes gagal `board.test.ts`**

```ts
// fixture: 2 periode (1 'Des/2026', 2 'Jan/2027'), unit: GS 0012 (4 sisi, GENSET), GS 0031 (2 sisi, Genset),
// LT 0003 (0 sisi, LUBE TRUCK), TL 1 (status_she 'Off Hire'), GS 0040 (expired kemarin, 1 sisi),
// + objek snapshot punya field tambahan `recent: []` (cache lama)
test('skor tidak ikut filter', () => {
  const v = boardView(snap, { status: 'belum', week: null, q: 'lt' }, NOW);
  expect([v.total, v.lengkap, v.belum]).toEqual([3, 1, 2]);
});
test('grup: Genset/GENSET digabung, n/m sebelum filter status', () => {
  const v = boardView(snap, { status: 'belum', week: null, q: '' }, NOW);
  expect(v.groups.map((g) => [g.jenis, g.lengkap, g.total, g.units.map((u) => u.no_lambung)]))
    .toEqual([['GENSET', 1, 2, ['GS 0031']], ['LUBE TRUCK', 0, 1, ['LT 0003']]]);
});
test('filter sudah membuang grup kosong', () => {
  expect(boardView(snap, { status: 'sudah', week: null, q: '' }, NOW).groups.map((g) => g.jenis)).toEqual(['GENSET']);
});
test('searchKey: gs12, 0012, "GS 0012" cocok', () => {
  for (const q of ['gs12', '0012', 'GS 0012', 'g s 1 2']) expect(searchKey('GS 0012').includes(searchKey(q))).toBe(true);
  expect(searchKey('GS 0012').includes(searchKey('gs13'))).toBe(false);
});
test('week: label berawalan periode bila >1 periode, filter week', () => {
  const v = boardView(snap, { status: 'semua', week: null, q: '' }, NOW);
  expect(v.weeks.map((w) => w.label)).toEqual(['Des/2026 · Week 1', 'Jan/2027 · Week 2']);
  const w = boardView(snap, { status: 'semua', week: v.weeks[1].key, q: '' }, NOW);
  expect(w.groups.flatMap((g) => g.units.map((u) => u.no_lambung))).toEqual(['LT 0003']);
});
test('poll mengubah status saat filter belum: unit hilang, skor naik', () => {
  const after = structuredClone(snap); /* beri GS 0031 empat sisi */
  const v = boardView(after, { status: 'belum', week: null, q: '' }, NOW);
  expect(v.lengkap).toBe(2);
  expect(v.groups.flatMap((g) => g.units.map((u) => u.no_lambung))).toEqual(['LT 0003']);
});
```

Penempatan unit dalam fixture:
- GS 0012 dan GS 0031 ada di periode 1 Week 1, LT 0003 di periode 2 Week 2.
- TL 1 dan GS 0040 berada di week lain (`Week 9`). Karena keduanya tersembunyi, `Week 9` **tidak** boleh muncul di `weeks`, sebab `weeks` hanya dibentuk dari unit yang tampil.
- `NOW` = 15 Des 2026 12:00 WITA.
- Field `recent` ditambahkan lewat spread variabel (`{ ...base, recent: [] } as Snapshot`), bukan literal bertipe. Dengan begitu `tsc -b` tetap lolos setelah Task 4 menghapus field itu dari tipe.

- [ ] **Step 2:** Jalankan `npx vitest run src/lib/board.test.ts`. Harus FAIL.
- [ ] **Step 3:** Implementasikan `src/lib/board.ts`. Untuk `searchKey`: `s.toUpperCase().replace(/\s+/g, '').replace(/\d+/g, (d) => String(Number(d)))`.
- [ ] **Step 4:** Jalankan `npx vitest run src/lib/board.test.ts`. Harus PASS.
- [ ] **Step 5: Commit**

```bash
git add src/lib/board.ts src/lib/board.test.ts
git commit -m "feat: boardView untuk papan stiker"
```

---

### Task 4 (Fase C): Layar Papan Stiker + Sheet Unit, hapus Landing/UnitList/recent

**Files:**
- Create: `src/screens/Papan.tsx`, `src/screens/UnitSheet.tsx`, `src/styles/papan.css`
- Modify: `src/App.tsx`, `shared/types.ts`, `shared/rules.ts` (hapus `landingSummary`), `shared/rules.test.ts`, `worker/snapshot.ts`, `worker/public.test.ts`
- Delete: `src/screens/Landing.tsx`, `src/screens/UnitList.tsx`, `src/styles/landing.css`, serta `src/ui/ProgressCard.tsx` dan `src/ui/SideDots.tsx` bila sudah tidak diimpor di mana pun

**Interfaces:**
- Consumes: `boardView`, `BoardFilter`, `sidesDone` (Task 3); `useSnapshot()` → `{ data, stale, updatedAt }`; `Sheet`, `Count`, `useQueueCount`, `navigate`; `expiryEndMs`; kelas dasar Task 2
- Produces:
  - `export default function Papan()`;
  - `export function UnitSheet({ unit, now, onClose }: { unit: SnapUnit | null; now: number; onClose: () => void })`.

- [ ] **Step 1: Hapus `recent`**
  - Hapus `recent` dari `Snapshot` (`shared/types.ts`), dari query ke-3 di `worker/snapshot.ts`, dan dari `shared/rules.test.ts`.
  - Hapus juga ekspektasi `s.recent` di `worker/public.test.ts`, lalu ganti dengan `expect(s).not.toHaveProperty('recent')`.
  - Hapus `landingSummary` beserta tesnya.
  - Jalankan `npm test`. Harus PASS.

- [ ] **Step 2: `Papan.tsx`** (lihat sketsa di spec revisi §6)
  - **Header** (latar `--head`, teks putih):
    - judul "Komisioning Section Support";
    - skor memakai `Count` dan teks skor dari Global Constraints;
    - baris "Periode {periods.join(' + ')} · Data HH:MM", dengan " · offline" bila `stale`;
    - tautan "Cek kode" → `/cek`;
    - di ≥ 1024 px dan antrean > 0: tautan "Antrean · n";
    - pita `.hazard` di bawahnya.
  - **Bar filter:**
    - `.chip` Semua/Belum/Sudah memakai `aria-pressed`;
    - `<select>` Week ("Semua week" + `weeks`);
    - `<input type="search">` "Cari no lambung".
    - State filter hanya ada di komponen (tidak disimpan).
  - **Grup:**
    - `<section>` dengan kepala "{JENIS}" dan "{lengkap}/{total} lengkap", berisi stiker `<button class="sticker" data-s="lengkap|sebagian|belum">`;
    - isi stiker: no lambung (Barlow) dan lubang; stiker sebagian menampilkan "n/4";
    - `aria-label` sesuai Global Constraints.
  - **`now`** di-memo per menit (pola lama). `boardView` dihitung dengan `useMemo` atas `[data, filter, minute]`.
  - **Keadaan khusus** (teks persis dari spec revisi §6):
    - belum ada periode;
    - filter tanpa hasil, dengan tombol "Hapus filter";
    - memuat pertama (kerangka 3 grup statis);
    - gagal tanpa cache.
  - **Denyut:**
    - simpan `Map<unitId, done>` dari render sebelumnya di `useRef`;
    - stiker yang `done`-nya berubah sejak snapshot sebelumnya mendapat kelas `pulse`, yaitu animasi `transform: scale(1 → 1.06 → 1)` selama 200 ms satu kali;
    - tidak berlaku pada render pertama;
    - mati di `prefers-reduced-motion`.
  - Stiker diklik → `setOpen(unit)` → `UnitSheet`.

- [ ] **Step 3: `UnitSheet.tsx`**
  - Memakai `Sheet` dengan judul no lambung.
  - Baris info: jenis · perusahaan · week · "Berlaku sampai {d MMM yyyy}" · "sisa {n} hari".
    - `n = Math.ceil((expiryEndMs(berlaku_akhir) − now) / 86_400_000)`.
    - Bila `n ≤ 7`, kelas `.urgent` memakai teks oranye `--or-ink`.
  - **Grid 4 sisi** dengan urutan Depan, Belakang, Kanan, Kiri:
    - sisi berfoto: `<img loading="lazy" src="/api/photo/{kode}">` dan jam jepret WITA HH:MM;
    - `onError` → "Foto belum bisa dimuat";
    - sisi kosong → "Belum difoto";
    - ketuk foto → tampil besar di sheet yang sama, dengan tombol "Kembali".
  - **Tombol:**
    - belum lengkap → `.btn` "Foto sisi yang kurang";
    - lengkap → `.btn-2` "Foto ulang";
    - keduanya `navigate('/unit/{id}/kamera')`.
  - Tidak ada nama/NRP.

- [ ] **Step 4: `App.tsx`**
  - Rute `/` → `<Papan />` untuk semua lebar layar. Hapus `matchMedia` wide/landing dan impor `Landing`.
  - Tab bar: label "Papan" dan "Antrean · n", disembunyikan lewat CSS di ≥ 1024 px.
    - Gaya: batang `--head`, teks Barlow, tab aktif bergaris bawah neon 3 px, tanpa kaca.

- [ ] **Step 5: `papan.css`**
  - Stiker:
    - lengkap = `--neon` dengan teks `--ink`;
    - sebagian = `--yel-bg` bertepi 2 px `--yel`;
    - belum = `--surface` bertepi 2 px `--or`.
  - Ukuran stiker minimal 44×44 px target sentuh. Stiker mengalir (`flex-wrap`).
  - Di ≥ 1024 px header lebih besar (skor ≥ 56 px), tanpa layout terpisah.
  - Teks no lambung tidak terpotong di 320 px. No lambung panjang dibungkus, bukan dipotong.

- [ ] **Step 6: Cek di browser** (headless `playwright-core`, mode terang dan gelap, 320/390/1024/1920 px)
  1. Klik filter Belum.
  2. Cari "gs12".
  3. Buka Sheet Unit.
  4. Klik "Foto sisi yang kurang" → URL kamera.

  Pastikan tidak ada nama mekanik di DOM halaman `/`. Hapus screenshot dan skrip setelah selesai.

- [ ] **Step 7:** Jalankan `npm test` dan `npm run build`. `grep -rn "recent\|landingSummary\|UnitList\|Landing" src shared worker` harus kosong.

- [ ] **Step 8: Commit**

```bash
git add -A src shared worker
git commit -m "feat: halaman awal papan stiker dan sheet unit"
```

---

### Task 5 (Fase D): Layar mekanik lain bergaya P

**Files:**
- Modify: `src/screens/{Camera,MekanikSheet,Antrean,CekKode,CekForm,InstallGuide}.tsx`, `src/styles/screens.css`

**Interfaces:**
- Consumes: kelas dasar Task 2
- Produces: tidak ada API baru. **Logika tidak berubah**: hanya markup kelas dan CSS. `git diff` pada berkas `.tsx` tidak boleh mengubah handler, state, atau panggilan `lib/`.

- [ ] **Step 1: Kamera**
  - Kotak langkah sisi (grid 4): selesai = `--neon`, sedang = `--yel`, sisanya garis tipis abu.
  - No lambung memakai Barlow 800.
  - Tombol jepret kuning (`--yel`) dengan cincin putih.
  - Angka GPS memakai `font-variant-numeric: tabular-nums`.
  - Pesan error/peringatan memakai `.banner`.
  - Latar tetap gelap.
- [ ] **Step 2: Sheet & layar lain**
  - Sheet setelah jepret dan `MekanikSheet`: judul Barlow, tombol `.btn`/`.btn-2`.
  - `Antrean`: baris dipisah garis 2 px, status memakai pil gaya stiker, banner offline memakai `.banner`.
  - `CekKode`/`CekForm`: header `--head` + `.hazard`, hasil dalam kartu `--surface` bertepi 2 px `--ink`.
  - `InstallGuide`: gaya sheet P.
- [ ] **Step 3:** Cek headless terang/gelap, 320 dan 390 px, untuk kamera (izin kamera palsu: `--use-fake-device-for-media-stream`), antrean, dan cek kode. Pastikan kontras AA. Hapus artefak uji.
- [ ] **Step 4:** Jalankan `npm test` dan `npm run build`.
- [ ] **Step 5: Commit**

```bash
git add src/screens src/styles
git commit -m "feat: kamera, antrean, cek kode bergaya Papan Lapangan"
```

---

### Task 6 (Fase D): Layar admin bergaya P

**Files:**
- Modify: `src/admin/{AdminApp,Login,PasswordField,UnitTable,UnitDetail,Import,Unduhan,Downloads,DownloadButtons,Admins}.tsx`, `src/styles/admin.css`

**Interfaces:**
- Consumes: kelas dasar Task 2
- Produces: tidak ada API baru. Logika tidak berubah, dengan aturan yang sama seperti Task 5.

- [ ] **Step 1: Login**
  - Kartu `--surface` dengan pita `.hazard` 6 px di atasnya.
  - Judul Barlow "Masuk admin".
  - Tombol lihat/sembunyikan tetap ada.
  - Goyang saat gagal tetap ada (transform saja).
- [ ] **Step 2: Kerangka admin**
  - Sidebar `--head`: item Barlow huruf besar, item aktif bergaris bawah neon. Di < 1024 px menjadi bar atas yang bisa digeser horizontal.
  - Header admin dengan pita `.hazard` di atas.
  - Banner "Foto periode X akan dihapus dalam n hari" memakai `.hazard` sebagai tepi.
- [ ] **Step 3: Tabel & detail**
  - Kepala tabel Barlow huruf besar di latar `--rule`.
  - Kolom no lambung Barlow 700 18 px.
  - Status memakai pil gaya stiker (lengkap neon / sebagian kuning / belum tepi oranye / lewat expired abu bergaris), dan filter memakai `.chip`.
  - `UnitDetail` memakai gaya sheet P.
- [ ] **Step 4: Impor, Unduhan, Admins**
  - Komponen yang sama (`.btn`, `.btn-2`, `.chip`, `.banner`).
  - Pratinjau impor menonjolkan "{n} unit support dari {m} baris" dengan angka Barlow besar.
- [ ] **Step 5:** Cek headless terang/gelap, 390 dan 1440 px. Login memakai akun lokal `demo`. Periksa tabel, detail, impor (pratinjau saja, jangan simpan), dan unduhan. Hapus artefak uji.
- [ ] **Step 6:** Jalankan `npm test` dan `npm run build`.
- [ ] **Step 7: Commit**

```bash
git add src/admin src/styles
git commit -m "feat: admin bergaya Papan Lapangan"
```

---

### Task 7 (Fase E): Gerbang mutu

**Files:** perbaikan apa pun yang ditemukan. Tidak ada berkas baru, kecuali `DESIGN.md` diperbarui bila ada token yang berubah.

- [ ] **Step 1: D1 lokal bersih**
  1. Hapus state D1/R2 lokal (`.wrangler/state`), setelah memastikan isinya hanya data uji lokal.
  2. `npm run db:local`.
  3. Buat ulang admin lokal `demo` (`npm run admin:create`).
  4. Impor `Deadline_Pengajuan_Komisioning_20261120_234805.xlsx` lewat UI admin.
  5. Pastikan pratinjau menunjukkan "84 unit support dari 399 baris".
  6. Pastikan skor papan "0 dari N lengkap", dengan N = 84 dikurangi unit berstatus selain `Belum Diajukan` dan unit lewat expired.
- [ ] **Step 2: Data terburuk** (skill `break-ui`, data dummy di scratchpad lalu dihapus)
  - no lambung 24 karakter tanpa spasi;
  - 1 grup berisi 40 unit;
  - 0 unit;
  - 3 periode;
  - jenis unit 40 karakter.

  Di 320/390/1024/1920 px, terang dan gelap, tidak boleh ada yang terpotong, tumpang tindih, atau scroll horizontal.
- [ ] **Step 3: Kontras AA** semua pasangan teks/latar di `DESIGN.md`, terang dan gelap. Catat rasionya di `DESIGN.md`.
- [ ] **Step 4: Lighthouse**
  - Mode mobile pada `npm run build` + `wrangler dev`/`vite preview`, untuk `/` dan `/admin/login`.
  - Keempat kategori harus ≥ 93, dengan CLS < 0,1 dan LCP < 2,5 s. Di bawah itu, perbaiki dulu.
  - Catat skornya di laporan.
- [ ] **Step 5:** Jalankan `npm test` dan `npm run build`. Pastikan JS awal mekanik ≤ 150 KB gzip.
- [ ] **Step 6:** Jalankan `graphify --update` dan pastikan scratchpad kosong.
- [ ] **Step 7: Commit** (bila ada perbaikan)

```bash
git add -A src DESIGN.md
git commit -m "fix: temuan gerbang mutu revisi"
```

**Setelah Fase E:**
1. Review akhir seluruh branch, termasuk pemilahan temuan kecil yang ditunda di ledger lama.
2. Deploy pilot, hanya dengan izin pengguna.
3. Merge.
