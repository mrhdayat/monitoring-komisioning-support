-- Penyimpanan berkas lewat Store. photos.r2_key kini berisi ID berkas (ID file Drive, atau id berkas_dev); nama kolom tetap.
CREATE TABLE pengaturan (k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE berkas_dev (id TEXT PRIMARY KEY, data BLOB NOT NULL);
CREATE TABLE snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE drive_state (state_hash TEXT PRIMARY KEY, token_hash TEXT NOT NULL, exp INTEGER NOT NULL);
ALTER TABLE periods ADD COLUMN drive_folder_id TEXT;
