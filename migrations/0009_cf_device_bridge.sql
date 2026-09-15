CREATE TABLE cf_device_sessions (
  token_hash TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES cf_recommendations(id),
  revision INTEGER NOT NULL,
  option_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_cf_device_sessions_expiry ON cf_device_sessions(expires_at);
CREATE TABLE cf_device_updates (
  request_id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL REFERENCES cf_recommendations(id),
  revision INTEGER NOT NULL,
  option_id TEXT NOT NULL,
  policy_id TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(recommendation_id,revision,option_id,policy_id,sequence)
);
CREATE TABLE cf_device_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_cf_device_nonces_expiry ON cf_device_nonces(expires_at);
CREATE TABLE cf_device_reviews (
  update_request_id TEXT PRIMARY KEY REFERENCES cf_device_updates(request_id),
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status='professional-reviewed'),
  created_at TEXT NOT NULL
);
