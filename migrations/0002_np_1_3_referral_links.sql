-- CoverageFit NP-1.3
-- Anonymous, expiring referral-link records and origin aliases.

CREATE TABLE IF NOT EXISTS referral_links (
  record_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_referral_links_expires_at
  ON referral_links(expires_at);

CREATE INDEX IF NOT EXISTS idx_referral_links_updated_at
  ON referral_links(updated_at DESC);
