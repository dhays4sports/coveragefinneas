-- CF-RECOMMEND-1.0. Additive; existing acquisition/consultation tables are unchanged.
CREATE TABLE IF NOT EXISTS cf_recommendations (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, draft_json TEXT NOT NULL,
  edit_version INTEGER NOT NULL DEFAULT 1, current_revision INTEGER NOT NULL DEFAULT 0,
  appointment_json TEXT NOT NULL DEFAULT '{}', outcome_json TEXT NOT NULL DEFAULT '{}',
  sent_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_recommendations_owner_updated ON cf_recommendations(owner_id, updated_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cf_recommendations_context ON cf_recommendations(owner_id,json_extract(draft_json,'$.context.kind'),json_extract(draft_json,'$.context.id')) WHERE json_extract(draft_json,'$.context.kind')!='direct' AND json_extract(draft_json,'$.context.id')!='';
CREATE TABLE IF NOT EXISTS cf_recommendation_revisions (
  recommendation_id TEXT NOT NULL REFERENCES cf_recommendations(id), revision INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL, expires_at TEXT NOT NULL,
  revoked_at TEXT, sent_at TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY(recommendation_id, revision)
);
CREATE TABLE IF NOT EXISTS cf_recommendation_documents (
  id TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL REFERENCES cf_recommendations(id),
  metadata_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_recommendation_documents_parent ON cf_recommendation_documents(recommendation_id);
CREATE TABLE IF NOT EXISTS cf_recommendation_events (
  id TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL REFERENCES cf_recommendations(id),
  revision INTEGER NOT NULL, kind TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cf_recommendation_events_parent ON cf_recommendation_events(recommendation_id, created_at DESC);
CREATE TABLE IF NOT EXISTS cf_recommendation_outbox (
  event_id TEXT PRIMARY KEY REFERENCES cf_recommendation_events(id), state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0, lease_until TEXT, last_error TEXT, sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_cf_recommendation_outbox_pending ON cf_recommendation_outbox(state, lease_until);
CREATE TABLE IF NOT EXISTS cf_recommendation_operations (
  recommendation_id TEXT NOT NULL, operation_key TEXT NOT NULL, payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY(recommendation_id, operation_key)
);
