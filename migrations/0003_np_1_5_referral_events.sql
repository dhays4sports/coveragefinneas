-- CoverageFit NP-1.5
-- Privacy-safe, deduplicated referral funnel events.

CREATE TABLE IF NOT EXISTS referral_events (
  record_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_referral_events_expires_at
  ON referral_events(expires_at);

CREATE INDEX IF NOT EXISTS idx_referral_events_updated_at
  ON referral_events(updated_at DESC);
