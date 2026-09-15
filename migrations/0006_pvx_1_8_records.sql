CREATE TABLE IF NOT EXISTS pvx_records (
  record_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pvx_records_updated_at ON pvx_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_pvx_records_expires_at ON pvx_records(expires_at);
