-- CoverageFit OPS-CF-1.1
-- Cloudflare D1 storage for producer consultations, private prospect reports,
-- and lightweight API rate-limit buckets.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS consultation_records (
  record_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_consultation_records_updated_at
  ON consultation_records(updated_at DESC);

CREATE TABLE IF NOT EXISTS prospect_reports (
  record_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_prospect_reports_expires_at
  ON prospect_reports(expires_at);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
  ON api_rate_limits(reset_at);
