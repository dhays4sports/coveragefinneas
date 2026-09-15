-- CF-CLOSE-1.0 — producer-governed closing evidence.
CREATE TABLE IF NOT EXISTS cf_close_events (
  id TEXT PRIMARY KEY,
  recommendation_id TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL CHECK(kind IN ('recommendation_delivered','close_ask','customer_decision','bind_prep')),
  request_id TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  FOREIGN KEY(recommendation_id) REFERENCES cf_recommendations(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cf_close_events_rec_time ON cf_close_events(recommendation_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_cf_close_events_kind_time ON cf_close_events(kind,created_at,id);
