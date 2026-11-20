# Monitoring Komisioning — Rencana Implementasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA tanpa login untuk mekanik memotret 4 sisi unit dengan watermark ala Timemark (bisa offline), plus landing realtime publik dan dashboard admin untuk impor Excel SHE dan unduh bukti.

**Architecture:** Satu Cloudflare Worker yang melayani aset statis React (SPA) dan `/api/*`, dengan D1 untuk data dan R2 untuk foto. Watermark dirender di HP, antrean upload disimpan di IndexedDB, dan service worker menangani cache serta Background Sync. Data publik (daftar unit + foto terbaru) disajikan sebagai **satu snapshot JSON di R2** yang dibangun ulang setiap ada perubahan, lalu dipolling klien dengan ETag. Pembagian section (aktif/selesai/tersembunyi) dihitung di klien dengan fungsi yang sama dengan server.

**Tech Stack:** TypeScript, React 19 + Vite, `@cloudflare/vite-plugin`, Wrangler, D1, R2, Cron Trigger, `motion` (LazyMotion), `idb-keyval`, `vite-plugin-pwa` (injectManifest), SheetJS (`xlsx` dari cdn.sheetjs.com), `client-zip`, `@fontsource-variable/inter`, Vitest + `@cloudflare/vitest-pool-workers`, `fake-indexeddb`.

**Eksekusi (pilihan pengguna):** subagent per tugas, **review per fase**. Fase selesai → reviewer memeriksa seluruh diff fase → bila oke, lanjut ke fase berikutnya.

| Fase | Tugas | Hasil yang bisa diuji |
|---|---|---|
| 1. Server & aturan inti | 1–7 | Semua API + aturan §8a lulus tes |
| 2. Logika klien | 8–10 | Parser Excel, watermark, antrean offline lulus tes |
| 3. Tampilan mekanik & publik | 11–15 | Mekanik bisa memotret 4 sisi offline/online; landing realtime |
| 4. Admin | 16–19 | Admin login, impor, pantau, unduh |
| 5. Rilis pilot | 20 | Review akhir, deploy (minta izin pengguna dulu), uji HP |

**Spec:** `docs/superpowers/specs/2026-11-21-monitoring-komisioning-design.md` (baca dulu; nomor § di rencana ini merujuk ke spec). Mockup acuan (lokal, tidak di-commit): `.superpowers/brainstorm/5007-1795191949/content/d1-apple.html` (Pilihan 1), `kamera-watermark.html` (W1), `landing-admin.html`.

## Global Constraints

- **Cloudflare paket gratis:** ±10 ms CPU per permintaan, 100.000 request Worker per hari, 50 subrequest per permintaan, D1 5 juta baris dibaca per hari. Polling **hanya saat tab terlihat** (`document.visibilityState === 'visible'`) dan online, setiap 15 detik.
- Zona waktu tampilan dan watermark: **WITA `Asia/Makassar`**. Waktu disimpan sebagai epoch ms (INTEGER). Tanggal `berlaku_akhir` disimpan sebagai `YYYY-MM-DD`.
- Batas expired: `Berlaku Akhir` **23:59:59.999 WITA**. Toleransi jam HP: **5 menit**.
- Foto: sisi panjang maks **1600 px**, JPEG **0,8**, upload ≤ **2 MB** (2.097.152 byte), magic bytes `FF D8 FF`.
- Kode Foto: 8 karakter Crockford base32 `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, format `XXXX-XXXX`.
- Sisi: `depan | belakang | kanan | kiri`, dengan urutan jepret Depan → Belakang → Kanan → Kiri. Label watermark ditulis kapital: `DEPAN/BELAKANG/KANAN/KIRI`.
- Status SHE yang tampil ke mekanik hanya `Belum Diajukan`.
- Bahasa UI: Bahasa Indonesia formal. **Dilarang:** `alert()`, `confirm()`, `prompt()`, dan library toast.
- Visual (§7.1):
  - warna: `#F2F2F7` latar, `#111` hitam, `#C9F31D` neon (teks gelap di atasnya), `#FF5A1F`/`#FFE8DE`/`#B33A00` oranye, `#F5B800` kuning watermark;
  - list inset radius 14, large title 32–34 px bobot 800;
  - teks isi ≥ 14 px, label ≥ 12 px, kontras WCAG AA;
  - font `-apple-system, "SF Pro Text", "Inter Variable", sans-serif`.
- Animasi: hanya `transform`/`opacity`, pegas critically damped (bounce 0) kecuali gestur lempar. `prefers-reduced-motion` diganti cross-fade. Tombol bereaksi saat pointer-down (scale 0.97, 100 ms).
- Bundle halaman mekanik ≤ **150 KB gzip** JS awal. Kode admin di-load terpisah (`React.lazy`).
- Halaman publik tidak pernah menampilkan nama/NRP mekanik.
- Skill wajib saat membangun:
  - `ponytail`: selalu aktif;
  - UI: `apple-design`, `mobile-native`, `animate`, `modern-web-guidance`, `no-ai-design-slop`;
  - `animation-performance` bila ada jank;
  - review akhir: `impeccable`;
  - `graphify` di Task 20.
- Data pengguna **tidak di-commit**: `Deadline_Pengajuan_Komisioning_*.xlsx`, `WhatsApp Image *.jpeg`, `.superpowers/`.

## Review Focus

1. **Jepretan yang sama terkirim dua kali bersamaan** (dari halaman dan service worker, Kode Foto sama). Kiriman kedua tidak boleh menghapus berkas R2 milik foto yang aktif (kuncinya sama). Uji: `upload: kiriman ganda bersamaan tidak menghapus foto aktif` di Task 4.
2. **App ditutup tepat setelah jepret.** Sheet "Foto tersimpan" baru boleh muncul setelah item benar-benar tertulis di IndexedDB. Uji: `enqueue: resolve hanya setelah item bisa dibaca` di Task 10.
3. **Zona waktu HP di-set WIB atau UTC.** Watermark harus tetap mencetak jam WITA. Uji: `watermark: TZ proses Asia/Jakarta tetap WITA` di Task 9.
4. **Excel SHE "kotor":** baris kosong di akhir, header dengan spasi ekstra atau beda kapital, dan No Lambung dengan spasi ganda. Hasil parse harus tetap benar dan baris kosong dilewati. Uji: `parseSheRows: toleran baris kosong & spasi` di Task 8.
5. **Kode Foto diketik manual** di Cek Kode Foto: huruf kecil, tanpa tanda hubung, `O` untuk `0`, `I`/`L` untuk `1`. Kode tetap harus ditemukan. Uji: `normalizeKode` di Task 2.

---

## Struktur berkas

```
wrangler.jsonc  vite.config.ts  vitest.config.ts  tsconfig*.json  package.json  index.html
migrations/0001_init.sql
scripts/create-admin.mjs                 # cetak + jalankan INSERT admin via wrangler
shared/types.ts                          # tipe bersama klien & worker
shared/rules.ts      shared/rules.test.ts     # expired, purge, jam, section, ringkasan landing
shared/kode.ts       shared/kode.test.ts      # Kode Foto
worker/index.ts                          # router fetch + scheduled
worker/http.ts                           # json(), err(), readJson()
worker/upload.ts     worker/upload.test.ts    # §8a
worker/snapshot.ts   worker/public.ts   worker/public.test.ts
worker/auth.ts       worker/auth.test.ts
worker/admin.ts      worker/admin.test.ts
worker/purge.ts      worker/purge.test.ts
src/main.tsx  src/App.tsx  src/router.ts  src/sw.ts
src/styles/tokens.css  src/styles/base.css
src/lib/api.ts  src/lib/snapshot.ts  src/lib/mekanik.ts  src/lib/geo.ts  src/lib/camera.ts
src/lib/watermark.ts  src/lib/watermark.test.ts
src/lib/queue.ts      src/lib/queue.test.ts      # IndexedDB + keputusan hasil upload
src/ui/Sheet.tsx  src/ui/Pill.tsx  src/ui/ProgressCard.tsx  src/ui/SideDots.tsx  src/ui/Count.tsx
src/screens/UnitList.tsx  Camera.tsx  Antrean.tsx  Landing.tsx  CekKode.tsx  MekanikSheet.tsx  InstallGuide.tsx
src/admin/AdminApp.tsx  Login.tsx  UnitTable.tsx  UnitDetail.tsx  Import.tsx  Downloads.ts  Admins.tsx
src/admin/excel.ts  src/admin/excel.test.ts
```

## Kontrak bersama (dipakai banyak task)

`shared/types.ts`:
```ts
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
export interface Snapshot {
  version: number;                  // ms saat dibangun
  periods: { id: number; label: string; purge_after: number }[];
  units: SnapUnit[];                // hanya status_she 'Belum Diajukan' dari periode yang belum dihapus
  recent: { no_lambung: string; sisi: Sisi; at: number; kode: string }[]; // 8 terbaru per received_at
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
```

API (semua JSON kecuali foto):

| Metode & path | Akses | Isi |
|---|---|---|
| `GET /api/snapshot` | publik | `Snapshot` dari R2 `snapshot.json`, `ETag`, mendukung `If-None-Match` → 304, `Cache-Control: no-cache` |
| `POST /api/photos` | publik | body `image/jpeg`, header `X-Foto-Meta` → aturan §8a |
| `GET /api/photo/:kode` | publik | JPEG dari R2 `foto/<KODE>.jpg`, `Cache-Control: public, max-age=31536000, immutable` |
| `GET /api/check/:kode` | publik | `{kode, no_lambung, sisi, captured_at, received_at}` atau 404 |
| `GET /api/geocode?lat=&lon=` | publik | `{address: string \| null}` |
| `POST /api/admin/login` · `POST /api/admin/logout` · `GET /api/admin/me` | — / admin | cookie `sid` |
| `POST /api/admin/import` · `POST /api/admin/import/finish` | admin | batch ≤ 100 unit |
| `GET /api/admin/units` | admin | `{periods, units: AdminUnit[]}` |
| `DELETE /api/admin/photo/:kode` | admin | hapus foto |
| `GET/POST /api/admin/admins` · `DELETE /api/admin/admins/:id` · `POST /api/admin/admins/:id/password` | admin | kelola admin |

---

### Task 1: Kerangka proyek (Vite + React + Worker + D1 + R2 + Vitest)

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `wrangler.jsonc`, `tsconfig.json` (+ `tsconfig.app.json`, `tsconfig.worker.json`), `index.html`, `src/main.tsx`, `src/App.tsx`, `worker/index.ts`, `worker/http.ts`, `migrations/0001_init.sql`
- Modify: `.gitignore`
- Test: `worker/index.test.ts`

**Interfaces:**
- Produces:
  - `interface Env { DB: D1Database; PHOTOS: R2Bucket; ASSETS: Fetcher }`;
  - `json(data: unknown, status = 200, headers?: HeadersInit): Response`;
  - `err(code: string, status: number): Response` → `{error: code}`;
  - `readJson<T>(req: Request): Promise<T | null>`, which returns `null` when the content-type is not JSON or the body is invalid.

- [ ] **Step 1: Buat proyek**

  Paket:
  - Pasang:
    - `react`, `react-dom`, `motion`, `idb-keyval`, `client-zip`, `@fontsource-variable/inter`;
    - `xlsx` dari `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (versi npm registry sudah usang).
  - Dev:
    - `vite`, `@vitejs/plugin-react`, `@cloudflare/vite-plugin`, `wrangler`, `typescript`;
    - `vitest`, `@cloudflare/vitest-pool-workers`, `fake-indexeddb`, `vite-plugin-pwa`.
  - Cek versi `vitest` yang didukung oleh `@cloudflare/vitest-pool-workers` (pakai cloudflare-docs MCP).

  Scripts:
  - `dev`: `vite`
  - `build`: `tsc -b && vite build`
  - `test`: `vitest run`
  - `deploy`: `npm run build && wrangler deploy`
  - `db:local`: `wrangler d1 migrations apply komisioning --local`
  - `admin:create`: `node scripts/create-admin.mjs`

- [ ] **Step 2: `wrangler.jsonc`**

```jsonc
{
  "name": "komisioning",
  "main": "worker/index.ts",
  "compatibility_date": "2026-10-01",
  "assets": { "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "d1_databases": [{ "binding": "DB", "database_name": "komisioning", "database_id": "local", "migrations_dir": "migrations" }],
  "r2_buckets": [{ "binding": "PHOTOS", "bucket_name": "komisioning-foto" }],
  "triggers": { "crons": ["0 16 * * *"] }   // 00:00 WITA
}
```

- [ ] **Step 3: `migrations/0001_init.sql`** (skema §10, persis)

```sql
CREATE TABLE periods (id INTEGER PRIMARY KEY, label TEXT NOT NULL UNIQUE, uploaded_at INTEGER NOT NULL,
  purge_after INTEGER NOT NULL, purged_at INTEGER, import_id TEXT);
CREATE TABLE units (id INTEGER PRIMARY KEY, period_id INTEGER NOT NULL REFERENCES periods(id),
  no_lambung TEXT NOT NULL, perusahaan TEXT NOT NULL, kelompok_unit TEXT NOT NULL, jenis_unit TEXT NOT NULL,
  berlaku_akhir TEXT NOT NULL, week TEXT NOT NULL, status_she TEXT NOT NULL,
  in_latest_upload INTEGER NOT NULL DEFAULT 1, import_id TEXT, UNIQUE (period_id, no_lambung));
CREATE TABLE photos (id INTEGER PRIMARY KEY, unit_id INTEGER NOT NULL REFERENCES units(id),
  sisi TEXT NOT NULL CHECK (sisi IN ('depan','belakang','kanan','kiri')), kode_foto TEXT NOT NULL UNIQUE,
  r2_key TEXT NOT NULL, captured_at_device INTEGER NOT NULL, captured_at_corrected INTEGER NOT NULL,
  received_at_server INTEGER NOT NULL, clock_offset_s INTEGER NOT NULL, lat REAL, lon REAL, accuracy_m REAL,
  address TEXT, mekanik_nama TEXT NOT NULL, mekanik_nrp TEXT NOT NULL, flags TEXT NOT NULL DEFAULT '',
  UNIQUE (unit_id, sisi));
CREATE INDEX photos_received ON photos(received_at_server);
CREATE TABLE admins (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL, failed_count INTEGER NOT NULL DEFAULT 0, locked_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL);
CREATE TABLE geocache (key TEXT PRIMARY KEY, address TEXT NOT NULL, created_at INTEGER NOT NULL);
```

- [ ] **Step 4: `vitest.config.ts` dengan dua project**
  - `node`: `shared/**/*.test.ts` dan `src/**/*.test.ts`. Setup `fake-indexeddb/auto`.
  - `worker`: `worker/**/*.test.ts` lewat `@cloudflare/vitest-pool-workers`, dengan migrasi D1 diterapkan di file setup (`readD1Migrations` + `applyD1Migrations`, sesuai dokumentasi versi yang terpasang).

- [ ] **Step 5: Tulis tes gagal `worker/index.test.ts`**

```ts
it('api tak dikenal → 404 json', async () => {
  const res = await SELF.fetch('https://x/api/tidak-ada');
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'not_found' });
});
```

- [ ] **Step 6:** Jalankan `npm test`. Tes harus FAIL.
- [ ] **Step 7:** Implementasikan `worker/index.ts` (router berupa `switch`/regex di `url.pathname`, tanpa library router; selain `/api/*` → `env.ASSETS.fetch(req)`) dan `worker/http.ts`. Isi `.gitignore` dengan `node_modules/ dist/ .wrangler/ graphify-out/ *.xlsx WhatsApp\ Image*`. `src/App.tsx` cukup menampilkan teks "Komisioning".
- [ ] **Step 8:** Jalankan `npm test` (harus PASS), lalu `npm run dev` dan buka `/` (tampil teks) serta `/api/x` (404 JSON).
- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "chore: kerangka Vite + React + Worker + D1 + R2"
```

### Task 2: Aturan bersama dan Kode Foto (fungsi murni)

**Files:**
- Create: `shared/types.ts` (isi dari Kontrak bersama), `shared/rules.ts`, `shared/kode.ts`
- Test: `shared/rules.test.ts`, `shared/kode.test.ts`

**Interfaces:**
- Produces:
  - `expiryEndMs(berlakuAkhir: string): number`
  - `isExpired(berlakuAkhir: string, now: number): boolean`
  - `purgeAfterMs(periodLabel: string): number`, yang melempar `Error` bila label tidak valid
  - `MONTHS: Record<string, number>`:
    - Indonesia: `Jan Feb Mar Apr Mei Jun Jul Agu Agt Sep Okt Nov Des`;
    - Inggris: `May Aug Oct Dec`;
    - kunci huruf kecil → 1–12.
  - `CLOCK_TOLERANCE_MS = 300_000`, `clockOff(offsetMs: number): boolean`
  - `classifyForMechanic(u: Pick<SnapUnit,'status_she'|'in_latest_upload'|'berlaku_akhir'>, sidesDone: number, periodPurged: boolean, now: number): Section`
  - `adminStatus(sidesDone: number, berlakuAkhir: string, now: number): AdminStatus`
  - `landingSummary(s: Snapshot, now: number): { total: number; lengkap: number; belum: number; perWeek: {week: string; total: number; lengkap: number}[]; urgent: SnapUnit[] }`
  - `KODE_RE`, `newKode(): string`, `normalizeKode(input: string): string | null`

- [ ] **Step 1: Tulis tes gagal**

```ts
// rules.test.ts
const WITA = (iso: string) => Date.parse(iso + '+08:00');
test('expiryEndMs = 23:59:59.999 WITA', () =>
  expect(expiryEndMs('2027-01-01')).toBe(WITA('2027-01-01T23:59:59.999')));
test('purgeAfterMs akhir bulan berikutnya', () => {
  expect(purgeAfterMs('Des/2026')).toBe(WITA('2027-01-31T23:59:59.999'));
  expect(purgeAfterMs('Jan/2027')).toBe(WITA('2027-02-28T23:59:59.999'));
  expect(() => purgeAfterMs('Xyz/2027')).toThrow();
});
test('clockOff > 5 menit', () => {
  expect(clockOff(300_000)).toBe(false); expect(clockOff(-300_001)).toBe(true);
});
describe('classifyForMechanic', () => {
  const now = WITA('2026-12-10T08:00:00');
  const u = { status_she: 'Belum Diajukan', in_latest_upload: true, berlaku_akhir: '2027-01-01' };
  test('aktif', () => expect(classifyForMechanic(u, 2, false, now)).toBe('aktif'));
  test('lengkap → selesai', () => expect(classifyForMechanic(u, 4, false, now)).toBe('selesai'));
  test('status SHE lain → tersembunyi', () =>
    expect(classifyForMechanic({ ...u, status_she: 'Off Hire' }, 0, false, now)).toBe('tersembunyi'));
  test('lewat expired → tersembunyi', () =>
    expect(classifyForMechanic({ ...u, berlaku_akhir: '2026-12-09' }, 2, false, now)).toBe('tersembunyi'));
  test('periode dihapus → tersembunyi', () => expect(classifyForMechanic(u, 4, true, now)).toBe('tersembunyi'));
  test('hilang dari upload terbaru → tersembunyi', () =>
    expect(classifyForMechanic({ ...u, in_latest_upload: false }, 3, false, now)).toBe('tersembunyi'));
  test('hilang dari upload tapi lengkap → selesai', () =>
    expect(classifyForMechanic({ ...u, in_latest_upload: false }, 4, false, now)).toBe('selesai'));
});
test('adminStatus', () => {
  const now = WITA('2026-12-10T08:00:00');
  expect(adminStatus(0, '2027-01-01', now)).toBe('belum');
  expect(adminStatus(3, '2027-01-01', now)).toBe('sebagian');
  expect(adminStatus(4, '2026-12-01', now)).toBe('lengkap');
  expect(adminStatus(3, '2026-12-01', now)).toBe('lewat_expired');
});
// kode.test.ts
test('newKode format', () => expect(newKode()).toMatch(KODE_RE));
test('normalizeKode', () => {
  expect(normalizeKode('ab1c-d2ef')).toBe('AB1C-D2EF');
  expect(normalizeKode('ab1cd2ef')).toBe('AB1C-D2EF');
  expect(normalizeKode('O0IL-1234')).toBe('0011-1234');
  expect(normalizeKode('ABC')).toBeNull();
  expect(normalizeKode('ABCD-EFGU')).toBeNull(); // U bukan Crockford
});
```

  Tambahkan juga satu tes `landingSummary` dengan 3 unit: satu Lengkap, satu Sebagian dengan exp terdekat, dan satu yang `in_latest_upload: false` dengan 0 sisi. Harapan: `total 2`, `lengkap 1`, `belum 1`, dan `urgent[0]` adalah unit Sebagian.

- [ ] **Step 2:** Jalankan `npx vitest run shared`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**

  `classifyForMechanic` memakai urutan cek ini (urutan ini yang membuat tes di atas lulus):
  1. status ≠ `Belum Diajukan` → tersembunyi;
  2. periode dihapus → tersembunyi;
  3. expired → tersembunyi;
  4. `sidesDone === 4` → selesai;
  5. `!in_latest_upload` → tersembunyi;
  6. selain itu → aktif.

  Fungsi lain:
  - `landingSummary` menghitung unit dengan section ≠ tersembunyi, ditambah unit lewat expired yang belum lengkap (dihitung sebagai belum, bukan disembunyikan dari total).
  - `urgent`: unit yang belum lengkap dan belum expired, diurutkan dari exp terdekat, maksimal 6.
  - `newKode` memakai `crypto.getRandomValues`.

- [ ] **Step 4:** Jalankan `npx vitest run shared`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: aturan bersama (expired, purge, jam, section) dan Kode Foto"`

### Task 3: Snapshot publik + endpoint baca publik

**Files:**
- Create: `worker/snapshot.ts`, `worker/public.ts`
- Modify: `worker/index.ts`
- Test: `worker/public.test.ts`

**Interfaces:**
- Consumes: `Env`, `json`, `err` (Task 1), tipe `Snapshot`, `normalizeKode` (Task 2)
- Produces:
  - `rebuildSnapshot(env: Env, now?: number): Promise<void>`, yang menulis R2 `snapshot.json`;
  - `getSnapshot(req, env)`, `getPhoto(kode, env)`, `checkKode(kode, env)`, `geocode(url, env)`.

- [ ] **Step 1: Tulis tes gagal** (seed D1 langsung via `env.DB` di `beforeEach`: 1 periode `Des/2026` dengan `purge_after` di masa depan, 2 unit, dan 1 foto)

```ts
it('snapshot berisi unit Belum Diajukan + sides + ETag 304', async () => {
  await rebuildSnapshot(env);
  const r1 = await SELF.fetch('https://x/api/snapshot');
  const s = await r1.json<Snapshot>();
  expect(s.units.map(u => u.no_lambung)).toEqual(['DT 4464']); // unit 'Off Hire' tidak ikut
  expect(s.units[0].sides.depan?.kode).toBe('AB1C-D2EF');
  expect(s.recent[0]).toEqual({ no_lambung: 'DT 4464', sisi: 'depan', at: expect.any(Number), kode: 'AB1C-D2EF' });
  const r2 = await SELF.fetch('https://x/api/snapshot', { headers: { 'If-None-Match': r1.headers.get('ETag')! } });
  expect(r2.status).toBe(304);
});
it('check kode menormalkan input & tanpa nama mekanik', async () => {
  const body = await (await SELF.fetch('https://x/api/check/ab1cd2ef')).json();
  expect(body).toMatchObject({ kode: 'AB1C-D2EF', no_lambung: 'DT 4464', sisi: 'depan' });
  expect(JSON.stringify(body)).not.toContain('mekanik');
});
it('check kode tak ada → 404', async () =>
  expect((await SELF.fetch('https://x/api/check/ZZZZ-ZZZZ')).status).toBe(404));
```

- [ ] **Step 2:** Jalankan `npx vitest run worker/public`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**

  `rebuildSnapshot`:
  - Dua query dalam `env.DB.batch`:
    - unit + foto (via JOIN) untuk periode `purged_at IS NULL` dan `status_she = 'Belum Diajukan'`;
    - 8 foto terbaru per `received_at_server`.
  - Hasilnya disimpan dengan `PHOTOS.put('snapshot.json', body, { httpMetadata: { contentType: 'application/json' } })`. Bila belum ada objek, `getSnapshot` membangunnya dulu.
  - `getSnapshot` memakai `PHOTOS.get(key, { onlyIf: { etagDoesNotMatch } })` dan menjawab 304 bila cocok.
  - *ponytail:* dua rebuild yang bersamaan bisa menulis snapshot yang sedikit tertinggal. Rebuild berikutnya akan membetulkannya; tambahkan versi berurutan bila ini benar-benar terlihat.

  `geocode`:
  - Kunci cache: `lat.toFixed(3),lon.toFixed(3)` (±110 m) di tabel `geocache`.
  - Bila tidak ada di cache, ambil `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=&lon=&accept-language=id` dengan `User-Agent: monitoring-komisioning/1.0`, lalu simpan `display_name`.
  - Bila gagal → `{address: null}`. Jangan kirim data pribadi apa pun.

- [ ] **Step 4:** Jalankan `npx vitest run worker/public`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: snapshot publik, foto, cek kode, geocode"`

### Task 4: Upload foto dengan aturan §8a

**Files:**
- Create: `worker/upload.ts`
- Modify: `worker/index.ts`
- Test: `worker/upload.test.ts`

**Interfaces:**
- Consumes: `expiryEndMs`, `clockOff`, `KODE_RE`, `SISI`, `PhotoMeta`, `rebuildSnapshot`
- Produces: `handleUpload(req: Request, env: Env, ctx: ExecutionContext, now = Date.now()): Promise<Response>`

- [ ] **Step 1: Tulis tes gagal**

  Gunakan helper `send(meta: Partial<PhotoMeta>, now)` yang memanggil `handleUpload` dengan body `new Uint8Array([0xFF,0xD8,0xFF,0xE0,...])`. Unit DT 4464 punya `berlaku_akhir` `2027-01-01`.

```ts
it('foto pertama → dipakai, berkas ada di R2', ...)              // 200 {result:'dipakai'}; PHOTOS.head('foto/AAAA-0001.jpg') != null
it('kode sama, unit+sisi+jam sama → duplikat', ...)              // kirim 2x → 'duplikat'
it('kode sama, isi beda → 409 kode_bentrok', ...)
it('unit tidak ada → 422 unit_tidak_berlaku', ...)
it('periode sudah dihapus → 422 unit_tidak_berlaku', ...)       // purged_at diisi
it('jepret lewat expired → 422 lewat_expired', ...)              // capturedAt = 2027-01-02T00:00:01 WITA
it('jepret sebelum expired, terkirim sesudahnya → diterima', ...) // capturedAt 2027-01-01T23:00 WITA, now 2027-01-03, deviceNow=now
it('jam HP salah 10 menit → flag jam, t_koreksi dipakai', ...)   // deviceNow = now - 600_000 → flags contains 'jam', captured_at_corrected = capturedAt + 600_000
it('foto lebih baru menang, berkas lama dihapus', ...)           // A 09:00 lalu B 10:00 → aktif B; R2 A tidak ada
it('foto lebih lama → lebih_baru_ada, berkas baru dihapus', ...) // B 10:00 lalu A 09:00 (contoh §8a) → aktif tetap B; R2 A tidak ada
it('jam sama → foto lama dipertahankan', ...)
it('kiriman ganda bersamaan tidak menghapus foto aktif', ...)    // Promise.all([send(m), send(m)]) → R2 foto/<kode>.jpg tetap ada; baris photos = 1
it('tanpa GPS → flag gps', ...)
it('bukan JPEG / > 2 MB / sisi salah / nama kosong → 400 invalid', ...)
```

- [ ] **Step 2:** Jalankan `npx vitest run worker/upload`. Tes harus FAIL.
- [ ] **Step 3: Implementasikan `handleUpload` dengan urutan persis §8a**

  1. **Validasi dan baca body:**
     - `Content-Length` ≤ 2_097_152;
     - `await req.arrayBuffer()`;
     - magic bytes;
     - `KODE_RE`, sisi;
     - `nama`/`nrp` 1–60 karakter;
     - angka-angka finite.

     *(ponytail: body dibaca ke memori, bukan di-stream. Tetap tanpa decode, dan ≤ 2 MB itu murah. Ganti ke stream bila batas ukuran dinaikkan.)*
  2. **Cek Kode Foto:** baris dengan `kode_foto` ini sudah ada?
     - unit_id, sisi, dan captured_at_device sama → `duplikat`;
     - selain itu → 409.
  3. **Cek unit:** unit + periode ada dan `purged_at IS NULL`. Bila tidak → 422.
  4. **Koreksi jam dan expired:**
     - `offset = now − deviceNow`;
     - `t = capturedAt + offset`;
     - `t > expiryEndMs(berlaku_akhir)` → 422 `lewat_expired`;
     - flags: `jam` bila `clockOff(offset)`, `gps` bila `lat == null`.
  5. **Simpan berkas:** `PHOTOS.put('foto/'+kode+'.jpg', buf, { httpMetadata: { contentType: 'image/jpeg' } })`.
  6. **Tentukan foto aktif.** Jalankan `env.DB.batch([selectOld, upsert])`:
     - `selectOld` = `SELECT kode_foto FROM photos WHERE unit_id=? AND sisi=?`;
     - `upsert` = `INSERT … ON CONFLICT(unit_id, sisi) DO UPDATE SET … WHERE excluded.captured_at_corrected > photos.captured_at_corrected RETURNING kode_foto`.

     Lalu putuskan:

     | Kondisi | Tindakan | Balasan |
     |---|---|---|
     | `RETURNING` mengembalikan kode baru | hapus berkas lama bila `old && old !== kode` | `dipakai` |
     | `RETURNING` kosong dan `old !== kode` | hapus berkas baru | `lebih_baru_ada` |
     | `RETURNING` kosong dan `old === kode` | jangan hapus apa pun | `duplikat` |

     Baris terakhir inilah yang memenuhi Review Focus #1.
  7. Bila hasilnya `dipakai`: `ctx.waitUntil(rebuildSnapshot(env))`.

- [ ] **Step 4:** Jalankan `npx vitest run worker/upload`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: upload foto dengan aturan foto terakhir dijepret (§8a)"`

### Task 5: Auth admin (hash, login, sesi, kunci percobaan)

**Files:**
- Create: `worker/auth.ts`, `scripts/create-admin.mjs`
- Modify: `worker/index.ts`
- Test: `worker/auth.test.ts`

**Interfaces:**
- Produces:
  - `PBKDF2_ITER = 10_000`;
  - `hashPassword(pw: string): Promise<string>`, dengan format `pbkdf2-sha256$<iter>$<saltB64>$<hashB64>`;
  - `verifyPassword(pw: string, stored: string): Promise<boolean>`;
  - `requireAdmin(req: Request, env: Env): Promise<{ id: number; username: string } | null>`;
  - handler `login`, `logout`, `me`.

- [ ] **Step 1: Tulis tes gagal**

```ts
it('hash → verify benar/salah', ...)
it('login benar → Set-Cookie sid HttpOnly; Secure; SameSite=Lax; Max-Age=604800', ...)
it('me dengan cookie → {username}; tanpa cookie → 401', ...)
it('5 kali salah → 423 terkunci 15 menit, password benar pun ditolak', ...)  // now + 14 menit masih 423, now + 16 menit 200
it('login sukses mereset failed_count', ...)
it('logout menghapus sesi', ...)
it('username tidak dikenal → 401 sama dengan password salah', ...)
```

- [ ] **Step 2:** Jalankan `npx vitest run worker/auth`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**
  - **Hash:** WebCrypto PBKDF2-SHA256, salt 16 byte, hasil 32 byte. Saat login sukses dengan iterasi tersimpan < `PBKDF2_ITER`, hash ulang password. *(ponytail: 10k iterasi agar muat di 10 ms CPU paket gratis; naikkan ke ≥100k setelah pindah ke paket Paid.)*
  - **Sesi:**
    - token 32 byte acak (hex) di cookie `sid`;
    - DB menyimpan `sha256(token)`;
    - berlaku 7 hari.
  - **Permintaan admin yang mengubah data:** content-type wajib `application/json` (atau metode DELETE). Ini ditambah SameSite=Lax sudah cukup untuk mencegah CSRF.
  - **`scripts/create-admin.mjs <username> <password>`:** impor logika hash yang sama (Node 22 punya WebCrypto; pisahkan fungsi hash ke modul yang bisa di-import tanpa tipe Workers), lalu jalankan `wrangler d1 execute komisioning --remote|--local --command "INSERT …"`. Flag `--local` adalah default, `--remote` hanya bila disebut.
- [ ] **Step 4:** Jalankan `npx vitest run worker/auth`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: login admin dengan sesi dan batas percobaan"`

### Task 6: Endpoint admin (impor, unit, hapus foto, kelola admin)

**Files:**
- Create: `worker/admin.ts`
- Modify: `worker/index.ts`
- Test: `worker/admin.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `hashPassword`, `purgeAfterMs`, `rebuildSnapshot`, `adminStatus`
- Produces:
  - `POST /api/admin/import` body `{ period: string; importId: string; units: ImportUnit[] }` (≤ 100 unit), di mana `ImportUnit = { no_lambung, perusahaan, kelompok_unit, jenis_unit, berlaku_akhir, week, status_she }`;
  - `POST /api/admin/import/finish` body `{ period, importId }` → `{ total: number; hidden: number }`;
  - `GET /api/admin/units` → `{ periods: {id,label,purge_after,purged_at}[]; units: AdminUnit[] }`, di mana `AdminUnit = SnapUnit & { period: string; status: AdminStatus; perluCek: boolean; photos: Partial<Record<Sisi, { kode, captured_at_device, received_at_server, clock_offset_s, mekanik_nama, mekanik_nrp, flags, address, lat, lon }>> }`.

- [ ] **Step 1: Tulis tes gagal**

```ts
it('tanpa sesi → 401 untuk semua /api/admin/* kecuali login', ...)
it('impor 2 batch + finish → unit tersimpan, periode dibuat dengan purge_after', ...)
it('impor ulang periode sama tanpa unit X → X.in_latest_upload=0, foto X tetap ada', ...)
it('impor > 100 unit per batch → 400', ...)
it('units: status & perluCek dari flags', ...)
it('hapus foto → baris & berkas R2 hilang, snapshot diperbarui', ...)
it('tidak bisa menghapus diri sendiri / admin terakhir → 400', ...)
it('reset password admin lain → login dengan password baru berhasil', ...)
```

- [ ] **Step 2:** Jalankan `npx vitest run worker/admin`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**
  - **Impor:** upsert `periods` berdasarkan label. Unit di-upsert `ON CONFLICT(period_id, no_lambung) DO UPDATE` sambil menyetel `import_id`; satu `DB.batch` per permintaan.
  - **finish:** `UPDATE units SET in_latest_upload = (import_id = ?) WHERE period_id = ?`, lalu rebuild snapshot.
  - **Hapus foto:** hapus R2 + baris, lalu rebuild snapshot.
- [ ] **Step 4:** Jalankan `npx vitest run worker/admin`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: endpoint admin impor, unit, hapus foto, kelola admin"`

### Task 7: Retensi (Cron)

**Files:**
- Create: `worker/purge.ts`
- Modify: `worker/index.ts` (handler `scheduled`)
- Test: `worker/purge.test.ts`

**Interfaces:**
- Produces: `purgeExpired(env: Env, now: number): Promise<{ periods: number; photos: number }>`

- [ ] **Step 1: Tulis tes gagal**

```ts
it('periode lewat purge_after: berkas R2 & baris photos dihapus, unit tetap, purged_at terisi', ...)
it('periode belum lewat tidak disentuh', ...)
it('upload ke unit periode yang sudah dihapus → 422 unit_tidak_berlaku', ...)
```

- [ ] **Step 2:** Jalankan `npx vitest run worker/purge`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**
  - Ambil kunci foto per periode, lalu `PHOTOS.delete(keys)` per 1000 kunci.
  - Hapus baris, set `purged_at`, lalu rebuild snapshot.
  - *(ponytail: per run maksimal 40 batch delete, ≤ 50 subrequest; sisanya diproses besok.)*
- [ ] **Step 4:** Jalankan `npx vitest run worker/purge`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: hapus otomatis foto periode lama"`

### Task 8: Parser Excel SHE (browser admin)

**Files:**
- Create: `src/admin/excel.ts`
- Test: `src/admin/excel.test.ts`

**Interfaces:**
- Consumes: `MONTHS`
- Produces:
  - `parseSheRows(rows: unknown[][]): { byPeriod: Map<string, ImportUnit[]>; errors: string[] }`, di mana `rows` adalah hasil `XLSX.utils.sheet_to_json(ws, { header: 1, raw: false })`;
  - `parseBerlakuAkhir(s: string): string | null` (`'01-Jan-2027'` → `'2027-01-01'`);
  - `readSheFile(file: File): Promise<ReturnType<typeof parseSheRows>>`, yang memanggil SheetJS lalu `parseSheRows`.

- [ ] **Step 1: Tulis tes gagal**

  Gunakan fixture `rows` buatan yang meniru file asli. Header persis:

  `No, No Lambung, Perusahaan, Kelompok Unit, Jenis Unit, Komisioner, Berlaku Akhir, Week, Periode, Status`

  Contoh baris:

  `[1,'TG 2028','PPA','TRANSPORT','TRUCK SUPPORT','-','01-Jan-2027','Week 1','Des/2026','Belum Diajukan']`

```ts
test('memetakan kolom & tanggal', ...)                 // byPeriod.get('Des/2026')[0] = {no_lambung:'TG 2028', berlaku_akhir:'2027-01-01', week:'Week 1', status_she:'Belum Diajukan', ...}
test('parseBerlakuAkhir Inggris & Indonesia', () => {
  expect(parseBerlakuAkhir('15-Oct-2027')).toBe('2027-10-15');
  expect(parseBerlakuAkhir('15-Okt-2027')).toBe('2027-10-15');
  expect(parseBerlakuAkhir('31-Feb-2027')).toBeNull();
});
test('parseSheRows: toleran baris kosong & spasi', ...) // header ' no lambung ', baris [] di akhir, 'DT  4464' → 'DT 4464'
test('header hilang → errors berisi "Kolom Berlaku Akhir tidak ditemukan"', ...)
test('tanggal rusak → errors menyebut nomor baris', ...)
```

- [ ] **Step 2:** Jalankan `npx vitest run src/admin/excel`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**
  - Header dicocokkan setelah `trim` + huruf kecil + spasi dirapikan. Kolom `No` dan `Komisioner` diabaikan.
  - Semua string di-`trim` dan spasi gandanya dirapikan.
- [ ] **Step 4:** Jalankan `npx vitest run src/admin/excel`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: parser Excel SHE"`

### Task 9: Watermark W1 (teks murni + gambar kanvas)

**Files:**
- Create: `src/lib/watermark.ts`
- Test: `src/lib/watermark.test.ts`

**Interfaces:**
- Produces:
  - `watermarkText(p: { capturedAt: number; sisi: Sisi; lat: number|null; lon: number|null; address: string|null; kode: string }): { label: string; jam: string; tanggal: string; hari: string; alamat: string[]; baris: string }`;
  - `renderWatermarked(raw: Blob, text: ReturnType<typeof watermarkText>): Promise<Blob>` (JPEG 0.8, sisi panjang ≤ 1600);
  - `loadWatermarkFont(): Promise<void>`.

- [ ] **Step 1: Tulis tes gagal**

```ts
const t = Date.UTC(2026, 9, 8, 23, 31); // 09 Okt 2026 07:31 WITA
test('format Indonesia WITA', () => {
  const w = watermarkText({ capturedAt: t, sisi: 'kanan', lat: -3.45678, lon: 115.12345, address: 'Jl. Hauling, Tapin, Kalimantan Selatan', kode: 'AB1C-D2EF' });
  expect(w).toMatchObject({ label: 'KANAN', jam: '07:31', tanggal: '09 Oktober 2026', hari: 'Jumat',
    baris: '-3.4568, 115.1235 · Kode Foto: AB1C-D2EF' });
});
test('tanpa GPS', () => {
  const w = watermarkText({ capturedAt: t, sisi: 'depan', lat: null, lon: null, address: null, kode: 'AB1C-D2EF' });
  expect(w.alamat).toEqual(['Lokasi tidak tersedia']); expect(w.baris).toBe('Kode Foto: AB1C-D2EF');
});
test('alamat dipecah maks 3 baris', ...)
test('watermark: TZ proses Asia/Jakarta tetap WITA', () => { /* process.env.TZ='Asia/Jakarta' sebelum memanggil → jam '07:31' */ });
```

- [ ] **Step 2:** Jalankan `npx vitest run src/lib/watermark`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**

  `watermarkText`:
  - Pakai `Intl.DateTimeFormat('id-ID', { timeZone: 'Asia/Makassar', hourCycle: 'h23', … }).formatToParts`, lalu susun `jam` dengan `:` (karena id-ID memakai `.`).
  - Alamat dipecah per koma menjadi maksimal 3 baris, ±40 karakter per baris.

  `renderWatermarked` (gambar sesuai W1 di `kamera-watermark.html`, kiri bawah):
  - **pita label kuning:** kuning `#F5B800`, di atas blok jam;
  - **jam besar:** Inter 300;
  - **garis kuning vertikal:** pemisah jam dan blok tanggal;
  - **blok tanggal:** tanggal + hari;
  - **alamat:** sesuai pecahan baris di atas;
  - **baris kecil:** koordinat · Kode Foto;
  - **ukuran:** relatif terhadap lebar foto (jam = 0,11 × lebar);
  - **bayangan:** `shadowBlur`, agar terbaca di latar terang.

  `loadWatermarkFont` memakai `document.fonts.load` untuk bobot 300/400/600 dari `@fontsource-variable/inter`.
- [ ] **Step 4:** Jalankan `npx vitest run src/lib/watermark`. Tes harus PASS.

  Uji visual: tambahkan halaman dev sementara `?wm=1` yang merender `unit.jpg` contoh, lalu bandingkan dengan foto Timemark (`WhatsApp Image …jpeg`). Hapus halaman itu sebelum commit.
- [ ] **Step 5:** Commit: `git commit -m "feat: watermark W1"`

### Task 10: Antrean offline + upload + service worker

**Files:**
- Create: `src/lib/queue.ts`, `src/lib/mekanik.ts`, `src/lib/api.ts`, `src/sw.ts`
- Modify: `vite.config.ts` (vite-plugin-pwa `strategies: 'injectManifest'`, `srcDir: 'src'`, `filename: 'sw.ts'`, manifest: nama "Komisioning", `display: 'standalone'`, `theme_color: '#F2F2F7'`, ikon 192/512)
- Test: `src/lib/queue.test.ts`

**Interfaces:**
- Consumes: `PhotoMeta`, `watermarkText`, `renderWatermarked`, `newKode`
- Produces:
  - Tipe item antrean:

    ```ts
    interface QueueItem {
      kode: string; unitId: number; noLambung: string; sisi: Sisi;
      capturedAt: number; lat: number|null; lon: number|null; accuracy: number|null; address: string|null;
      raw: Blob; final: Blob | null; error?: string;
    }
    ```

  - Fungsi antrean:
    - `enqueue(item: QueueItem): Promise<void>`
    - `listQueue(): Promise<QueueItem[]>`
    - `removeItem(kode): Promise<void>`
  - `decide(status: number, body: unknown): 'hapus' | 'ulang' | 'kode_baru' | 'tolak'`:
    - 200 → hapus;
    - 409 → kode_baru;
    - 422 → tolak (hapus + beri tahu);
    - 400 → tolak;
    - jaringan/5xx → ulang.
  - `processQueue(opts: { render: boolean }): Promise<{ sent: number; left: number; notices: string[] }>`. Saat `render: true`, item yang belum punya `final` di-geocode dan dirender dulu. Service worker memanggil `render: false` sehingga hanya mengirim item yang sudah punya `final`.
  - Identitas mekanik:
    - `getMekanik(): Promise<{nama, nrp} | null>`
    - `setMekanik(m): Promise<void>`

    Disimpan di idb-keyval supaya service worker bisa membacanya.
  - `useQueueCount(): number`: event `queue-changed` + `BroadcastChannel('antrean')`.

- [ ] **Step 1: Tulis tes gagal** (pakai `fake-indexeddb/auto` dan `fetch` tiruan)

```ts
test('enqueue: resolve hanya setelah item bisa dibaca', async () => {
  await enqueue(item); expect((await listQueue()).map(i => i.kode)).toEqual([item.kode]);
});
test('decide', () => {
  expect(decide(200, { result: 'lebih_baru_ada' })).toBe('hapus');
  expect(decide(409, {})).toBe('kode_baru'); expect(decide(422, {})).toBe('tolak');
  expect(decide(503, {})).toBe('ulang'); expect(decide(0, null)).toBe('ulang');
});
test('processQueue: 200 menghapus, 503 menyisakan', ...)
test('processQueue: kode_bentrok → kode baru, final dirender ulang, item lama diganti', ...)
test('processQueue: notice "Sisi ini sudah punya foto yang lebih baru" untuk lebih_baru_ada', ...)
```

- [ ] **Step 2:** Jalankan `npx vitest run src/lib/queue`. Tes harus FAIL.
- [ ] **Step 3: Implementasi**
  - **Pengiriman:**
    - `fetch('/api/photos', { method: 'POST', body: final, headers: { 'Content-Type': 'image/jpeg', 'X-Foto-Meta': encodeURIComponent(JSON.stringify({ ...meta, deviceNow: Date.now() })) } })`;
    - item dikirim satu per satu (berurutan).
  - **Pemicu `processQueue`:** app dibuka, event `online`, dan setelah `enqueue`.
  - **Background Sync:** setelah `enqueue`, daftarkan sync tag `'antrean'` bila `'sync' in registration`.
  - **`src/sw.ts`:**
    - precache aset (Workbox `precacheAndRoute`);
    - navigasi diarahkan ke `index.html`;
    - handler `sync` memanggil `processQueue({ render: false })`;
    - `/api/*` tidak di-cache oleh service worker.
  - **Penyimpanan:** panggil `navigator.storage.persist()` saat enqueue pertama.
- [ ] **Step 4:** Jalankan `npx vitest run src/lib/queue`. Tes harus PASS.
- [ ] **Step 5:** Commit: `git commit -m "feat: antrean offline, upload, service worker"`

### Task 11: Fondasi UI (token, font, router, Sheet, Pill, tekanan)

> Muat skill `apple-design`, `mobile-native`, `animate`, `modern-web-guidance`, `no-ai-design-slop` sebelum mengerjakan Task 11–19.

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/base.css`, `src/router.ts`, `src/ui/Sheet.tsx`, `src/ui/Pill.tsx`, `src/ui/ProgressCard.tsx`, `src/ui/SideDots.tsx`, `src/ui/Count.tsx`
- Modify: `src/main.tsx`, `src/App.tsx`, `index.html`

**Interfaces:**
- Produces:
  - **Router:**
    - `useRoute(): { path: string; params: Record<string,string>; query: URLSearchParams }`;
    - `navigate(to: string, opts?: { replace?: boolean })`.

    Dibuat sendiri dengan `history` + `popstate`, ±30 baris, **tanpa** react-router.
  - **Rute:** `/`, `/unit/:id/kamera`, `/antrean`, `/cek`, `/cek/:kode`, `/admin/login`, `/admin/:tab?` (lazy).
  - **`<Sheet open onClose title? children>`:**
    - motion `LazyMotion` (`domMax`), pegas `{ type: 'spring', bounce: 0, duration: 0.4 }`;
    - drag-Y 1:1 dengan rubber-band ke atas;
    - tutup bila offset > 30% atau kecepatan > 500 px/s;
    - scrim gelap;
    - fokus terkunci (`inert` di latar), Esc menutup.
  - **Komponen lain:**
    - `<Pill tone="offline|warning|info">`: pil kaca melayang di atas;
    - `<ProgressCard done total sub />`: kartu hitam dengan strip reflektif neon;
    - `<SideDots sides />`: indikator 2×2;
    - `<Count value />`: angka bergulir.
  - **CSS:**
    - `.press` (`:active` scale 0.97, 100 ms);
    - `-webkit-tap-highlight-color: transparent`;
    - `touch-action: manipulation`;
    - `100dvh`;
    - `env(safe-area-inset-*)`;
    - input ≥ 16 px (mencegah zoom iOS);
    - `@media (prefers-reduced-motion)` → cross-fade;
    - `prefers-reduced-transparency` → tab bar solid.

- [ ] **Step 1:** Tulis token persis dari Global Constraints serta komponen di atas, dengan meniru `d1-apple.html` (Pilihan 1).
- [ ] **Step 2: Verifikasi**
  - Halaman dev `/?ui=1` sementara menampilkan semua komponen.
  - Cek di DevTools mode iPhone SE dan Pixel 5.
  - Sheet harus bisa ditarik, dilempar tutup, dan direbut kembali saat sedang beranimasi (tidak melompat).
  - Dengan `prefers-reduced-motion` (Rendering → Emulate), animasinya hanya fade.
  - Hapus halaman dev itu sebelum commit.
- [ ] **Step 3:** Commit: `git commit -m "feat: fondasi UI iOS + Hi-Vis"`

### Task 12: Daftar unit mekanik (+ nama/NRP, panduan iPhone)

**Files:**
- Create: `src/lib/snapshot.ts`, `src/screens/UnitList.tsx`, `src/screens/MekanikSheet.tsx`, `src/screens/InstallGuide.tsx`
- Modify: `src/App.tsx` (tab bar kaca: *Unit* · *Antrean · n*)

**Interfaces:**
- Consumes: `classifyForMechanic`, `landingSummary`, `Snapshot`, `useQueueCount`, `getMekanik/setMekanik`, `Sheet`, `ProgressCard`, `SideDots`
- Produces: `useSnapshot(): { data: Snapshot | null; stale: boolean; updatedAt: number | null }`
  - polling 15 detik dengan `If-None-Match`, hanya saat tab terlihat dan online;
  - cache terakhir di idb-keyval `snapshot`, dibaca lebih dulu (offline-first).

- [ ] **Step 1: Implementasi** (layar §7.2 no. 1, sesuai `d1-apple.html`)
  - **Bagian atas:** large title "Komisioning", cari no lambung (abaikan spasi/kapital), chip filter Week dan periode.
  - **Kartu progres:** `ProgressCard`.
  - **Daftar:** grup per Week, baris berisi no lambung, jenis, `SideDots`, dan exp. Lalu bagian "Selesai (n)" yang tertutup secara default.
  - Bila no lambung yang sama muncul di dua periode, tampilkan chip label periode di barisnya.
  - **Ketuk baris:**
    - mekanik belum terdaftar → `MekanikSheet` (nama + NRP, divalidasi tidak kosong);
    - sudah terdaftar → `navigate('/unit/:id/kamera')`.
  - Unit yang expired tidak pernah tampil, karena section sudah tersembunyi (§8, kamera tidak bisa dibuka).
  - **Pil:** "Offline · daftar terakhir diperbarui hh:mm" saat offline, dan "n foto belum terkirim" bila antrean > 0.
  - **`InstallGuide`:** muncul sekali di Safari iOS non-standalone (`navigator.standalone !== true`), berisi panduan "Tambahkan ke Layar Utama" dengan tombol "Nanti saja" (disimpan di localStorage).
  - Daftar ±400 baris: `content-visibility: auto` per grup.
- [ ] **Step 2: Verifikasi**
  - `npm run dev` dengan data seed (`wrangler d1 execute --local --file` dari INSERT contoh).
  - Unit Off Hire tidak tampil, unit Lengkap ada di "Selesai", dan pencarian `dt4464` menemukan `DT 4464`.
  - Mode offline di DevTools: daftar tetap tampil.
  - Scroll 400 baris di CPU 4× slowdown tetap mulus.
- [ ] **Step 3:** Commit: `git commit -m "feat: daftar unit mekanik"`

### Task 13: Layar kamera + sheet setelah jepret

**Files:**
- Create: `src/lib/camera.ts`, `src/lib/geo.ts`, `src/screens/Camera.tsx`

**Interfaces:**
- Consumes: `watermarkText`, `renderWatermarked`, `loadWatermarkFont`, `newKode`, `enqueue`, `processQueue`, `isExpired`, `Sheet`, `useSnapshot`
- Produces:
  - `openCamera(video: HTMLVideoElement): Promise<() => void>`: `getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } } })`, mengembalikan fungsi stop;
  - `grabFrame(video): Promise<Blob>`: crop 3:4 potret, sisi panjang ≤ 1600, JPEG 0.92 sebagai `raw`;
  - `watchGps(): { get(): {lat, lon, accuracy} | null; stop(): void }`: `watchPosition` high accuracy; `null` bila belum ada fix dalam 15 detik atau izin ditolak;
  - `fetchAddress(lat, lon, timeoutMs = 3000): Promise<string | null>`.

- [ ] **Step 1: Implementasi** (§7.2 no. 3–4, sesuai `kamera-watermark.html` W1)
  - **Tampilan:**
    - latar hitam;
    - bagian atas: ✕, no lambung, langkah sisi `✓ Depan · ✓ Belakang · Kanan · Kiri` (setiap sisi bisa diketuk);
    - pratinjau 3:4 dengan watermark berupa overlay DOM yang memakai `watermarkText` (jam berdetik);
    - tombol jepret, thumbnail terakhir, indikator akurasi GPS (± m).
  - **Saat jepret:**
    1. `grabFrame`;
    2. `kode = newKode()`;
    3. coba `fetchAddress` (3 detik);
    4. `renderWatermarked` bila online, kalau tidak `final = null`;
    5. **`await enqueue`**;
    6. getar 30 ms (bila `navigator.vibrate` ada);
    7. thumbnail "terbang" ke kotak sisinya (transform);
    8. sheet "Foto sisi Kanan tersimpan · 3 dari 4 sisi" dengan 4 thumbnail dan tombol "Lanjut foto sisi Kiri" / "Nanti saja";
    9. `processQueue({ render: true })` di latar.
  - Bila unit sudah expired menurut jam HP, tampilkan layar penolakan "Unit ini sudah lewat tanggal expired" dan jangan buka kamera.
  - Bila izin kamera ditolak, tampilkan sheet berisi langkah mengizinkan kamera (beda untuk iOS dan Android).
  - Kamera dihentikan saat layar ditinggal atau `visibilitychange` hidden.
- [ ] **Step 2: Verifikasi**
  - Uji di HP sungguhan lewat `npm run dev -- --host` + tunnel HTTPS (mis. `cloudflared tunnel --url`): `getUserMedia` butuh HTTPS.
  - Hasil yang diharapkan:
    - empat sisi bisa dijepret;
    - foto di R2 lokal punya watermark lengkap;
    - mode pesawat → jepret → antrean bertambah → sinyal menyala → terkirim dan watermark berisi alamat.
- [ ] **Step 3:** Commit: `git commit -m "feat: kamera dengan watermark dan sheet setelah jepret"`

### Task 14: Layar Antrean

**Files:**
- Create: `src/screens/Antrean.tsx`

**Interfaces:**
- Consumes: `listQueue`, `processQueue`, `useQueueCount`

- [ ] **Step 1: Implementasi** (§7.2 no. 6)
  - Daftar item: thumbnail, no lambung, sisi, jam jepret, status (Menunggu sinyal / Mengirim / Gagal: alasan).
  - Tombol "Kirim sekarang".
  - Teks iPhone: "Di iPhone, foto terkirim saat app dibuka dengan sinyal."
  - Notice dari `processQueue` (mis. "lebih baru ada", "lewat expired") tampil sebagai baris info inline, bukan alert.
  - Antrean kosong → "Semua foto sudah terkirim".
- [ ] **Step 2:** Verifikasi: offline → jepret 2 → antrean menampilkan 2 → online → tekan Kirim → kosong.
- [ ] **Step 3:** Commit: `git commit -m "feat: layar antrean"`

### Task 15: Landing laptop/TV + Cek Kode Foto

**Files:**
- Create: `src/screens/Landing.tsx`, `src/screens/CekKode.tsx`
- Modify: `src/App.tsx` (`/` memakai `Landing` bila `matchMedia('(min-width: 1024px)')`, kalau tidak `UnitList`)

**Interfaces:**
- Consumes: `useSnapshot`, `landingSummary`, `normalizeKode`, `Count`

- [ ] **Step 1: Implementasi** (§7.2 no. 2, sesuai `landing-admin.html`)
  - kartu progres besar dengan `Count`;
  - progres per Week;
  - "Foto terbaru masuk": 8 item, thumbnail `/api/photo/:kode` lazy, no lambung, sisi, jam, **tanpa nama**;
  - "Paling mendesak";
  - kolom Cek Kode Foto → `/cek/:kode`;
  - "Langsung · diperbarui n detik lalu".

  `CekKode` menampilkan foto asli, unit, sisi, jam jepret, dan jam diterima. Bila 404: "Kode Foto tidak ditemukan. Foto mungkin sudah diganti atau dihapus."
- [ ] **Step 2: Verifikasi**
  - Di 1440 px dan 1920 px: jepret dari tab HP, landing berubah dalam ≤ 15 detik dan angka bergulir.
  - Cek `ab1cd2ef` menemukan foto.
- [ ] **Step 3:** Commit: `git commit -m "feat: landing realtime dan cek kode foto"`

### Task 16: Login admin

**Files:**
- Create: `src/admin/AdminApp.tsx` (shell + guard `GET /api/admin/me`, sidebar Unit / Upload Excel SHE / Unduhan / Admin), `src/admin/Login.tsx`

- [ ] **Step 1: Implementasi** (§7.2 no. 7)
  - Kartu putih berisi username dan password.
  - Tombol teks *Lihat*/*Sembunyikan* di dalam kolom password (`aria-pressed`, label berubah).
  - Login gagal → kartu bergoyang pelan (transform, sekali) + pesan inline di bawah tombol: "Username atau password salah".
  - 423 → "Terlalu banyak percobaan. Coba lagi pukul hh:mm".
  - Sukses → `/admin/unit`.
  - Semua kode admin di-load lewat `React.lazy`.
- [ ] **Step 2: Verifikasi**
  - Buat admin lokal: `npm run admin:create -- admin rahasia123`.
  - Salah 5× → terkunci; benar → masuk.
  - `npm run build`: chunk admin terpisah dari bundle mekanik.
- [ ] **Step 3:** Commit: `git commit -m "feat: login admin"`

### Task 17: Dashboard admin (tabel, detail, salin WA, peringatan retensi)

**Files:**
- Create: `src/admin/UnitTable.tsx`, `src/admin/UnitDetail.tsx`

**Interfaces:**
- Consumes: `GET /api/admin/units`, `DELETE /api/admin/photo/:kode`, `Sheet`
- Produces: `waText(units: AdminUnit[]): string`, dengan format satu baris per unit: `"DT 4464 (Week 2) – belum: kiri, kanan"`.

- [ ] **Step 1: Implementasi** (§7.2 no. 8)
  - **Tabel:** no lambung, jenis, perusahaan, periode, Week, exp, 4 thumbnail lazy, status (Belum/Sebagian n/4/Lengkap/Lewat expired + ⚠ Perlu cek).
  - **Filter:** Semua/Belum/Sebagian/Lengkap/⚠ Perlu cek, plus cari dan pilih periode/Week.
  - **Klik baris** → panel kanan:
    - 4 foto besar;
    - nama + NRP;
    - jam HP vs jam server (selisih);
    - alamat;
    - tombol hapus foto, dengan konfirmasi berupa Sheet (bukan `confirm()`);
    - unduh per unit.
  - **Tombol "Salin daftar untuk WA"** → `navigator.clipboard.writeText(waText(filtered))` + pil "Disalin".
  - **Banner** "Foto periode X akan dihapus dalam n hari, unduh sekarang" mulai H-7 sebelum `purge_after`.
- [ ] **Step 2: Verifikasi**
  - Filter ⚠ menampilkan foto yang jam HP-nya diubah.
  - Hapus foto → status turun, dan landing ikut berubah.
  - Teks WA yang ditempel sesuai format.
- [ ] **Step 3:** Commit: `git commit -m "feat: dashboard admin"`

### Task 18: Upload Excel + unduhan (ZIP, rekap, per unit)

**Files:**
- Create: `src/admin/Import.tsx`, `src/admin/Downloads.ts`, `src/admin/Downloads.test.ts`
- Modify: `src/admin/UnitTable.tsx` (tombol aksi), `src/admin/UnitDetail.tsx` (unduh per unit)

**Interfaces:**
- Consumes: `readSheFile`, `POST /api/admin/import(/finish)`, `AdminUnit`
- Produces:
  - `zipName(u: AdminUnit, sisi: Sisi): string` → `"DT4464/DT4464_depan.jpg"` (spasi dihapus);
  - `downloadZip(units: AdminUnit[], onProgress: (done: number, total: number) => void): Promise<void>`;
  - `downloadRekap(units: AdminUnit[]): void`.

- [ ] **Step 1: Tulis tes gagal** `src/admin/Downloads.test.ts`:

  `zipName({no_lambung:'DT 4464'}, 'depan') === 'DT4464/DT4464_depan.jpg'`.
- [ ] **Step 2:** Jalankan tes; harus FAIL. Implementasikan `zipName`, lalu jalankan lagi; harus PASS.
- [ ] **Step 3: Implementasi Import** (§7.2 no. 9)
  - Pilih atau drop file → `readSheFile`.
  - Pratinjau: jumlah unit per periode, jumlah per status, unit yang akan disembunyikan (dibandingkan dengan data saat ini), dan error per baris.
  - Konfirmasi → kirim per 100 dengan `importId = crypto.randomUUID()` → `finish`. Tampilkan progres.
- [ ] **Step 4: Implementasi Unduhan**
  - **ZIP:** `client-zip` `downloadZip` dari async generator `{ name: zipName, input: await fetch('/api/photo/'+kode) }` untuk unit yang sesuai filter aktif.
    - Bila ada `showSaveFilePicker`: `res.body.pipeTo(await handle.createWritable())`.
    - Bila tidak: pecah per Week, satu ZIP per Week via `<a download>`.
  - **Rekap:** SheetJS `writeFile`, kolom sesuai §11.
- [ ] **Step 5: Verifikasi**
  - Impor `Deadline_Pengajuan_Komisioning_20261120_234805.xlsx` → 399 unit, Des/2026, 8 unit status lain.
  - Impor ulang file yang sama → tidak ada yang tersembunyi.
  - ZIP 10 unit terbuka dengan struktur folder yang benar.
  - Rekap terbuka di Excel.
- [ ] **Step 6:** Commit: `git commit -m "feat: impor Excel SHE dan unduhan ZIP/rekap"`

### Task 19: Kelola admin

**Files:**
- Create: `src/admin/Admins.tsx`

- [ ] **Step 1: Implementasi** (§7.2 no. 10)
  - Daftar admin.
  - Tambah (username + password dengan tombol lihat, minimal 8 karakter).
  - Hapus dengan konfirmasi berupa Sheet. Tombol hapus nonaktif untuk diri sendiri.
  - Reset password admin lain.
  - Pesan error 400 dari server tampil inline.
- [ ] **Step 2:** Verifikasi: tambah admin B → login sebagai B berhasil; hapus B → sesi B tidak berlaku lagi.
- [ ] **Step 3:** Commit: `git commit -m "feat: kelola admin"`

### Task 20: Performa, review desain, graphify, deploy pilot

**Files:**
- Modify: sesuai temuan
- Create: `README.md` (cara deploy, membuat admin, dan naik ke paket Paid: cukup ubah `PBKDF2_ITER`)

- [ ] **Step 1: Ukur performa**
  - `npm run build` lalu ukur gzip chunk awal mekanik. Harus ≤ 150 KB; bila lebih, pangkas dulu sebelum lanjut.
  - Lighthouse mobile untuk `/`: performa ≥ 90.
- [ ] **Step 2: Review desain**
  - Jalankan skill `impeccable` (review akhir) dan `no-ai-design-slop` pada semua layar.
  - Perbaiki temuan kontras, ukuran teks, dan animasi.
  - Bila ada jank, jalankan `animation-performance`.
- [ ] **Step 3:** Jalankan `npm test`. Semua harus PASS.
- [ ] **Step 4: Deploy pilot**
  1. Buat resource:
     - `wrangler d1 create komisioning` (isi `database_id`);
     - `wrangler r2 bucket create komisioning-foto`.
  2. `wrangler d1 migrations apply komisioning --remote`.
  3. `npm run deploy`.
  4. `npm run admin:create -- <username> <password> --remote`.
  5. Cek:
     - `https://komisioning.<akun>.workers.dev` terbuka;
     - cron terdaftar di dashboard Cloudflare.
- [ ] **Step 5: Uji manual §14**
  - Uji di HP Android murah dan iPhone di lokasi bersinyal buruk: mode pesawat → jepret → nyalakan sinyal → foto terkirim.
  - Pasang PWA di Android dan iPhone.
- [ ] **Step 6:** Jalankan skill `graphify` pada repo (hasil di `graphify-out/`, tidak di-commit) untuk peta kode.
- [ ] **Step 7:** Commit: `git commit -m "chore: siap pilot"`
