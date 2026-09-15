-- RC-SMS-1.1: protected SMS conversation simulator persistence.
CREATE TABLE IF NOT EXISTS sms_conversations (
  record_key TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_updated_at ON sms_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_conversations_expires_at ON sms_conversations(expires_at);
