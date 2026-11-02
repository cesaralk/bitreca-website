-- Separate disposable integration schema. Never apply to an application DB.
CREATE TABLE solo_it_runs (
  id TEXT PRIMARY KEY, phase TEXT NOT NULL CHECK(phase IN ('uploading','created','folder_uploaded','ready','marked','storage_verified','finalized','blocked')),
  finalized_at INTEGER
);
CREATE TABLE solo_it_portfolios (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES solo_it_runs(id), role TEXT NOT NULL CHECK(role IN ('a','b')),
  active_prefix TEXT NOT NULL, marked INTEGER NOT NULL DEFAULT 0
);
-- Manifest/receipts intentionally survive fixture-portfolio removal.
CREATE TABLE solo_it_objects (
  key TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES solo_it_runs(id), role TEXT NOT NULL,
  sha256 TEXT NOT NULL, size INTEGER NOT NULL, etag TEXT, writer_state TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0
);
