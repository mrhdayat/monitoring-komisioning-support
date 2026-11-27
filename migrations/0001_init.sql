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
