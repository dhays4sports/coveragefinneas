CREATE TABLE cf_protection_presets (
 owner_id TEXT NOT NULL, id TEXT NOT NULL, version INTEGER NOT NULL,
 payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(owner_id,id,version)
);
CREATE TABLE cf_protection_sessions (
 token_hash TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL REFERENCES cf_recommendations(id),
 revision INTEGER NOT NULL, option_id TEXT NOT NULL, policy_id TEXT NOT NULL,
 initial_task_id TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE INDEX idx_cf_protection_sessions_expiry ON cf_protection_sessions(expires_at);
CREATE TABLE cf_protection_updates (
 request_id TEXT PRIMARY KEY, recommendation_id TEXT NOT NULL REFERENCES cf_recommendations(id),
 revision INTEGER NOT NULL, option_id TEXT NOT NULL, policy_id TEXT NOT NULL, task_id TEXT NOT NULL,
 sequence INTEGER NOT NULL, payload_json TEXT NOT NULL, created_at TEXT NOT NULL,
 UNIQUE(recommendation_id,revision,option_id,policy_id,task_id,sequence)
);
CREATE TABLE cf_protection_reviews (
 update_request_id TEXT PRIMARY KEY REFERENCES cf_protection_updates(request_id),
 actor_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status='professional-reviewed'), created_at TEXT NOT NULL
);
CREATE TABLE cf_protection_link_checks (
 check_id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, preset_id TEXT NOT NULL,
 version INTEGER NOT NULL, summary TEXT NOT NULL, results_json TEXT NOT NULL, checked_at TEXT NOT NULL
);
CREATE INDEX idx_cf_protection_link_checks_scope ON cf_protection_link_checks(owner_id,preset_id,version,check_id);
