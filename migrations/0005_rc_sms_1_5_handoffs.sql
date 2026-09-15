-- RC-SMS-1.5: short-lived secure SMS-to-CoverageFit continuation tokens.
CREATE TABLE IF NOT EXISTS sms_handoffs (
  record_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_handoffs_updated_at ON sms_handoffs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_handoffs_expires_at ON sms_handoffs(expires_at);
