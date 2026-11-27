CREATE TABLE populasi (code_unit TEXT PRIMARY KEY, skr_bib TEXT NOT NULL, jenis TEXT NOT NULL, maint TEXT NOT NULL,
  uploaded_at INTEGER NOT NULL);
ALTER TABLE units ADD COLUMN code_unit TEXT;
ALTER TABLE units ADD COLUMN skr_bib TEXT;
ALTER TABLE units ADD COLUMN pop_status TEXT NOT NULL DEFAULT 'tidak_ada';
